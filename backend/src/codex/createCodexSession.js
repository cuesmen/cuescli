'use strict';

const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { WebSocket } = require('ws');

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDeferred() {
  let resolve;
  let reject;
  let settled = false;

  const promise = new Promise((res, rej) => {
    resolve = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      res(value);
    };

    reject = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      rej(error);
    };
  });

  return { promise, resolve, reject, isSettled: () => settled };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });

    server.once('error', reject);
  });
}

async function connectWebSocket(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const socket = await new Promise((resolve, reject) => {
        const ws = new WebSocket(url);

        ws.once('open', () => resolve(ws));
        ws.once('error', (error) => {
          ws.removeAllListeners();
          reject(error);
        });
      });

      return socket;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }

  throw lastError || new Error(`Timed out connecting to ${url}`);
}

function createCodexSession(options) {
  const {
    codexBin,
    codexCwd,
    accessMode,
    multiAgentEnabled,
    logger,
    onReady,
    onAssistantDelta,
    onTurnCompleted,
    onThreadStatus,
    onApprovalRequest,
    onWarning,
    onError,
    onExit,
  } = options;

  const sessionId = randomUUID();
  let closed = false;
  let terminating = false;
  let killTimer = null;
  let threadId = null;
  let socket = null;
  let child = null;
  let model = null;
  let nextRequestId = 1;
  const pendingRequests = new Map();
  const pendingApprovalRequests = new Map();
  const readyDeferred = createDeferred();
  readyDeferred.promise.catch(() => {});

  function getThreadConfig() {
    if (accessMode === 'full-access') {
      return {
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
      };
    }

    return {
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    };
  }

  function getTurnConfig() {
    if (accessMode === 'full-access') {
      return {
        approvalPolicy: 'never',
        sandboxPolicy: {
          type: 'dangerFullAccess',
        },
      };
    }

    return {
      approvalPolicy: 'on-request',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [codexCwd],
        readOnlyAccess: {
          type: 'restricted',
          includePlatformDefaults: true,
          readableRoots: [],
        },
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    };
  }

  function cleanupPending(error) {
    for (const deferred of pendingRequests.values()) {
      deferred.reject(error);
    }

    pendingRequests.clear();
  }

  function handleProtocolMessage(message) {
    if (message.id !== undefined && pendingRequests.has(message.id)) {
      const deferred = pendingRequests.get(message.id);
      pendingRequests.delete(message.id);

      if (message.error) {
        deferred.reject(new Error(message.error.message || 'Codex app-server request failed'));
        return;
      }

      deferred.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.method) {
      pendingApprovalRequests.set(message.id, message);
      onApprovalRequest(message);
      return;
    }

    switch (message.method) {
      case 'item/agentMessage/delta':
        onAssistantDelta(message.params);
        break;
      case 'turn/completed':
        onTurnCompleted(message.params);
        break;
      case 'thread/status/changed':
        onThreadStatus(message.params);
        break;
      case 'error':
        onError(new Error(message.params?.message || 'Codex app-server error'));
        break;
      default:
        logger.debug({ sessionId, method: message.method }, 'ignoring app-server notification');
    }
  }

  function sendRequest(method, params) {
    if (closed || !socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Codex app-server socket is not connected'));
    }

    const id = nextRequestId++;
    const deferred = createDeferred();
    pendingRequests.set(id, deferred);

    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })
    );

    return deferred.promise;
  }

  function sendResponse(id, result) {
    if (closed || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Codex app-server socket is not connected');
    }

    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        result,
      })
    );
  }

  async function initializeSession() {
    const port = await getFreePort();
    const listenUrl = `ws://127.0.0.1:${port}`;

    child = spawn(codexBin, ['app-server', '--listen', listenUrl], {
      cwd: codexCwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      logger.debug({ sessionId, stdout: chunk }, 'codex app-server stdout');
    });

    child.stderr.on('data', (chunk) => {
      logger.warn({ sessionId, stderr: chunk }, 'codex app-server stderr');
    });

    child.once('spawn', () => {
      logger.info(
        {
          sessionId,
          pid: child.pid,
          command: codexBin,
          args: ['app-server', '--listen', listenUrl],
        },
        'codex app-server spawned'
      );
    });

    child.once('error', (error) => {
      if (closed) {
        return;
      }

      cleanupPending(error);
      readyDeferred.reject(error);
      onError(error);
    });

    child.once('exit', (code, signal) => {
      closed = true;
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }

      logger.info({ sessionId, code, signal }, 'codex app-server exited');

      if (code !== 0 || !readyDeferred.isSettled()) {
        const error = new Error(`Codex app-server exited with code ${code ?? 'unknown'}`);
        cleanupPending(error);
        readyDeferred.reject(error);
      } else {
        cleanupPending(new Error('Codex app-server session closed'));
      }

      onExit({ code, signal });
    });

    socket = await connectWebSocket(listenUrl, 10000);

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString('utf8'));
        handleProtocolMessage(message);
      } catch (error) {
        logger.error({ err: error, sessionId }, 'failed to process app-server message');
      }
    });

    socket.on('close', () => {
      if (closed) {
        return;
      }

      if (terminating) {
        return;
      }

      const error = new Error('Codex app-server websocket closed unexpectedly');
      cleanupPending(error);
      onError(error);
      if (child && !child.killed) {
        child.kill('SIGTERM');
      }
    });

    socket.on('error', (error) => {
      if (closed) {
        return;
      }

      if (terminating) {
        return;
      }

      cleanupPending(error);
      onError(error);
      if (child && !child.killed) {
        child.kill('SIGTERM');
      }
    });

    await sendRequest('initialize', {
      clientInfo: {
        name: 'cuescli-frontend',
        version: '1.0.0',
      },
      capabilities: null,
    });

    const threadConfig = getThreadConfig();
    const threadResponse = await sendRequest('thread/start', {
      cwd: codexCwd,
      approvalPolicy: threadConfig.approvalPolicy,
      sandbox: threadConfig.sandbox,
      personality: 'pragmatic',
      serviceName: 'cuescli',
      ephemeral: true,
    });

    threadId = threadResponse.thread.id;
    model = threadResponse.model;
    onReady({
      sessionId,
      threadId,
      pid: child.pid,
      model,
    });
    readyDeferred.resolve();
  }

  initializeSession().catch((error) => {
    if (closed) {
      return;
    }

    logger.error({ err: error, sessionId }, 'failed to initialize codex session');
    onError(error);
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  });

  async function sendPrompt(text) {
    await readyDeferred.promise;

    if (!threadId) {
      throw new Error('Codex thread is not initialized');
    }

    const turnConfig = getTurnConfig();
    const baseParams = {
      threadId,
      input: [
        {
          type: 'text',
          text,
          text_elements: [],
        },
      ],
      approvalPolicy: turnConfig.approvalPolicy,
      sandboxPolicy: turnConfig.sandboxPolicy,
    };

    const multiAgentParams =
      multiAgentEnabled && model
        ? {
            ...baseParams,
            collaborationMode: {
              mode: 'default',
              settings: {
                model,
                reasoning_effort: null,
                developer_instructions: null,
              },
            },
          }
        : baseParams;

    try {
      return await sendRequest('turn/start', multiAgentParams);
    } catch (error) {
      if (
        multiAgentEnabled &&
        error instanceof Error &&
        error.message.includes('turn/start.collaborationMode requires experimentalApi capability')
      ) {
        onWarning(
          'Multi-agent mode is not supported by the current Codex app-server build. Falling back to standard mode.'
        );
        return sendRequest('turn/start', baseParams);
      }

      throw error;
    }
  }

  function resolveApproval(requestId, action) {
    const request = pendingApprovalRequests.get(requestId);

    if (!request) {
      throw new Error(`Unknown approval request: ${requestId}`);
    }

    pendingApprovalRequests.delete(requestId);

    switch (request.method) {
      case 'item/commandExecution/requestApproval': {
        const decision = action === 'approve-session' ? 'acceptForSession' : action === 'approve' ? 'accept' : action === 'cancel' ? 'cancel' : 'decline';
        sendResponse(requestId, { decision });
        return;
      }
      case 'item/fileChange/requestApproval': {
        const decision = action === 'approve-session' ? 'acceptForSession' : action === 'approve' ? 'accept' : action === 'cancel' ? 'cancel' : 'decline';
        sendResponse(requestId, { decision });
        return;
      }
      case 'item/permissions/requestApproval': {
        const permissions = action === 'approve' || action === 'approve-session' ? request.params.permissions : {};
        const scope = action === 'approve-session' ? 'session' : 'turn';
        sendResponse(requestId, { permissions, scope });
        return;
      }
      default:
        throw new Error(`Unsupported approval request type: ${request.method}`);
    }
  }

  function terminate(signal = 'SIGTERM') {
    if (closed || !child || child.killed) {
      return false;
    }

    terminating = true;
    logger.info({ sessionId, pid: child.pid, signal }, 'terminating codex session');

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }

    const didSendSignal = child.kill(signal);

    if (didSendSignal && signal !== 'SIGKILL') {
      killTimer = setTimeout(() => {
        if (!closed && child.exitCode === null) {
          logger.warn({ sessionId, pid: child.pid }, 'forcing codex app-server shutdown with SIGKILL');
          child.kill('SIGKILL');
        }
      }, 5000);
    }

    return didSendSignal;
  }

  return {
    sessionId,
    get pid() {
      return child ? child.pid : null;
    },
    sendPrompt,
    resolveApproval,
    terminate,
  };
}

module.exports = {
  createCodexSession,
};
