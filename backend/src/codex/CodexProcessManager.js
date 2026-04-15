'use strict';

const fs = require('node:fs/promises');
const { createCodexSession } = require('./createCodexSession');

class CodexProcessManager {
  constructor(options) {
    this.codexBin = options.codexBin;
    this.codexCwd = options.codexCwd;
    this.logger = options.logger;
    this.sessions = new Map();
  }

  async createSession(clientId, handlers, sessionOptions = {}) {
    if (this.sessions.has(clientId)) {
      throw new Error(`Session already exists for client ${clientId}`);
    }

    const resolvedCwd = sessionOptions.cwd || this.codexCwd;
    let cwdStats;

    try {
      cwdStats = await fs.stat(resolvedCwd);
    } catch {
      throw new Error(`Working directory does not exist: ${resolvedCwd}`);
    }

    if (!cwdStats.isDirectory()) {
      throw new Error(`Working directory is not a directory: ${resolvedCwd}`);
    }

    const sessionLogger = this.logger.child({ clientId });
    const session = createCodexSession({
      codexBin: this.codexBin,
      codexCwd: resolvedCwd,
      accessMode: sessionOptions.accessMode || 'default',
      multiAgentEnabled: Boolean(sessionOptions.multiAgentEnabled),
      logger: sessionLogger,
      onReady: handlers.onReady,
      onAssistantDelta: handlers.onAssistantDelta,
      onTurnCompleted: handlers.onTurnCompleted,
      onThreadStatus: handlers.onThreadStatus,
      onApprovalRequest: handlers.onApprovalRequest,
      onWarning: handlers.onWarning,
      onExit: (payload) => {
        this.sessions.delete(clientId);
        handlers.onExit(payload);
      },
      onError: (error) => {
        this.sessions.delete(clientId);
        handlers.onError(error);
      },
    });

    this.sessions.set(clientId, session);
    sessionLogger.info(
      { clientId, sessionId: session.sessionId },
      'codex session registered'
    );

    return session;
  }

  getSession(clientId) {
    return this.sessions.get(clientId);
  }

  async sendPrompt(clientId, input) {
    const session = this.getSession(clientId);

    if (!session) {
      throw new Error(`No session found for client ${clientId}`);
    }

    return session.sendPrompt(input);
  }

  resolveApproval(clientId, requestId, action) {
    const session = this.getSession(clientId);

    if (!session) {
      throw new Error(`No session found for client ${clientId}`);
    }

    return session.resolveApproval(requestId, action);
  }

  terminateSession(clientId, signal) {
    const session = this.getSession(clientId);

    if (!session) {
      return false;
    }

    return session.terminate(signal);
  }

  terminateAll(signal = 'SIGTERM') {
    for (const [clientId, session] of this.sessions.entries()) {
      this.logger.info({ clientId, sessionId: session.sessionId, signal }, 'terminating session');
      session.terminate(signal);
    }
  }
}

module.exports = {
  CodexProcessManager,
};
