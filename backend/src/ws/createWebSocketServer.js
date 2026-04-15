'use strict';

const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const { WebSocket, WebSocketServer } = require('ws');

function createWebSocketServer(options) {
  const { fastify, manager, wsPath } = options;
  const wss = new WebSocketServer({ noServer: true });

  function sendMessage(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }

  function sendError(socket, message, details) {
    sendMessage(socket, {
      type: 'error',
      message,
      details,
    });
  }

  fastify.server.on('upgrade', (request, socket, head) => {
    const { url } = request;

    if (!url || !url.startsWith(wsPath)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (socket, request) => {
    const clientId = randomUUID();
    const requestUrl = new URL(request.url, 'http://localhost');
    const requestedCwd = requestUrl.searchParams.get('cwd');
    const requestedAccessMode = requestUrl.searchParams.get('accessMode');
    const multiAgentEnabled = requestUrl.searchParams.get('multiAgent') === '1';
    const logger = fastify.log.child({
      clientId,
      remoteAddress: request.socket.remoteAddress,
      requestedCwd,
      requestedAccessMode,
      multiAgentEnabled,
    });

    logger.info('websocket client connected');

    let session;

    manager
      .createSession(clientId, {
        onReady: ({ sessionId, threadId, pid }) => {
          sendMessage(socket, {
            type: 'session.started',
            clientId,
            sessionId,
            threadId,
            pid,
          });
        },
        onAssistantDelta: ({ turnId, delta }) => {
          sendMessage(socket, {
            type: 'assistant.delta',
            turnId,
            delta,
          });
        },
        onTurnCompleted: ({ turn }) => {
          sendMessage(socket, {
            type: 'turn.completed',
            turnId: turn.id,
            status: turn.status,
            error: turn.error,
          });
        },
        onThreadStatus: ({ threadId, status }) => {
          sendMessage(socket, {
            type: 'thread.status',
            threadId,
            status,
          });
        },
        onApprovalRequest: (requestMessage) => {
          sendMessage(socket, {
            type: 'approval.request',
            requestId: requestMessage.id,
            method: requestMessage.method,
            params: requestMessage.params,
          });
        },
        onWarning: (message) => {
          sendMessage(socket, {
            type: 'warning',
            message,
          });
        },
        onExit: ({ code, signal }) => {
          sendMessage(socket, {
            type: 'session.ended',
            code,
            signal,
          });
        },
        onError: (error) => {
          logger.error({ err: error }, 'codex session error');
          sendError(socket, 'Codex session error', error.message);
        },
      }, {
        cwd: requestedCwd || undefined,
        accessMode: requestedAccessMode || undefined,
        multiAgentEnabled,
      })
      .then((createdSession) => {
        session = createdSession;
      })
      .catch((error) => {
        logger.error({ err: error }, 'failed to create codex session');
        sendError(socket, 'Failed to start Codex session', error.message);
        socket.close(1011, 'codex session error');
      });

    socket.on('message', (rawMessage, isBinary) => {
      if (isBinary) {
        sendError(socket, 'Binary messages are not supported');
        return;
      }

      let message;

      try {
        message = JSON.parse(rawMessage.toString('utf8'));
      } catch (error) {
        sendError(socket, 'Invalid JSON payload', error.message);
        return;
      }

      (async () => {
        switch (message.type) {
          case 'prompt': {
            if (typeof message.text !== 'string' || message.text.trim().length === 0) {
              throw new Error('prompt.text must be a non-empty string');
            }

            const result = await manager.sendPrompt(clientId, message.text);
            sendMessage(socket, {
              type: 'turn.started',
              turnId: result.turn.id,
            });
            break;
          }
          case 'terminate': {
            const signal = typeof message.signal === 'string' ? message.signal : 'SIGTERM';
            manager.terminateSession(clientId, signal);
            break;
          }
          case 'approval.respond': {
            if (typeof message.requestId !== 'number' && typeof message.requestId !== 'string') {
              throw new Error('approval.respond.requestId is required');
            }

            if (
              message.action !== 'approve' &&
              message.action !== 'approve-session' &&
              message.action !== 'decline' &&
              message.action !== 'cancel'
            ) {
              throw new Error('approval.respond.action is invalid');
            }

            manager.resolveApproval(clientId, message.requestId, message.action);
            sendMessage(socket, {
              type: 'approval.resolved',
              requestId: message.requestId,
              action: message.action,
            });
            break;
          }
          case 'ping': {
            sendMessage(socket, {
              type: 'pong',
              timestamp: Date.now(),
            });
            break;
          }
          default:
            throw new Error(`Unsupported message type: ${message.type}`);
        }
      })().catch((error) => {
        logger.warn({ err: error }, 'failed to handle client message');
        sendError(socket, 'Failed to handle message', error.message);
      });
    });

    socket.on('close', (code, reason) => {
      logger.info(
        {
          code,
          reason: reason.toString('utf8'),
        },
        'websocket client disconnected'
      );
      if (session) {
        manager.terminateSession(clientId, 'SIGTERM');
      }
    });

    socket.on('error', (error) => {
      logger.error({ err: error }, 'websocket error');
      if (session) {
        manager.terminateSession(clientId, 'SIGTERM');
      }
    });
  });

  return wss;
}

module.exports = {
  createWebSocketServer,
};
