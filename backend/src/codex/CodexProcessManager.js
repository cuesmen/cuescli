'use strict';

const fs = require('node:fs/promises');
const { createCodexSession } = require('./createCodexSession');

class CodexProcessManager {
  constructor(options) {
    this.codexBin = options.codexBin;
    this.codexCwd = options.codexCwd;
    this.logger = options.logger;
    this.clientSessions = new Map();
    this.conversationSessions = new Map();
  }

  async validateCwd(resolvedCwd) {
    let cwdStats;

    try {
      cwdStats = await fs.stat(resolvedCwd);
    } catch {
      throw new Error(`Working directory does not exist: ${resolvedCwd}`);
    }

    if (!cwdStats.isDirectory()) {
      throw new Error(`Working directory is not a directory: ${resolvedCwd}`);
    }
  }

  fanOut(record, callbackName, ...args) {
    for (const handlers of record.subscribers.values()) {
      const callback = handlers[callbackName];
      if (typeof callback === 'function') {
        callback(...args);
      }
    }
  }

  cleanupRecord(record) {
    for (const clientId of record.subscribers.keys()) {
      this.clientSessions.delete(clientId);
    }

    if (record.conversationId) {
      const mapped = this.conversationSessions.get(record.conversationId);
      if (mapped === record) {
        this.conversationSessions.delete(record.conversationId);
      }
    }
  }

  async createSession(clientId, handlers, sessionOptions = {}) {
    if (this.clientSessions.has(clientId)) {
      throw new Error(`Session already exists for client ${clientId}`);
    }

    const resolvedCwd = sessionOptions.cwd || this.codexCwd;
    await this.validateCwd(resolvedCwd);

    const conversationId = sessionOptions.conversationId || null;
    if (conversationId && this.conversationSessions.has(conversationId)) {
      const existingRecord = this.conversationSessions.get(conversationId);
      existingRecord.subscribers.set(clientId, handlers);
      this.clientSessions.set(clientId, existingRecord);
      existingRecord.logger.info(
        { clientId, sessionId: existingRecord.session.sessionId, conversationId },
        'reattached client to existing codex session'
      );

      existingRecord.session.ready
        .then((info) => {
          handlers.onReady(info);
        })
        .catch((error) => {
          handlers.onError(error);
        });

      return existingRecord.session;
    }

    const sessionLogger = this.logger.child({ clientId, conversationId });
    const record = {
      conversationId,
      subscribers: new Map([[clientId, handlers]]),
      session: null,
      logger: sessionLogger,
    };

    const session = createCodexSession({
      codexBin: this.codexBin,
      codexCwd: resolvedCwd,
      accessMode: sessionOptions.accessMode || 'default',
      multiAgentEnabled: Boolean(sessionOptions.multiAgentEnabled),
      logger: sessionLogger,
      onReady: (payload) => {
        this.fanOut(record, 'onReady', payload);
      },
      onAssistantDelta: (payload) => {
        this.fanOut(record, 'onAssistantDelta', payload);
      },
      onTurnCompleted: (payload) => {
        this.fanOut(record, 'onTurnCompleted', payload);
      },
      onTurnDiff: (payload) => {
        this.fanOut(record, 'onTurnDiff', payload);
      },
      onThreadStatus: (payload) => {
        this.fanOut(record, 'onThreadStatus', payload);
      },
      onApprovalRequest: (payload) => {
        this.fanOut(record, 'onApprovalRequest', payload);
      },
      onWarning: (payload) => {
        this.fanOut(record, 'onWarning', payload);
      },
      onExit: (payload) => {
        this.cleanupRecord(record);
        this.fanOut(record, 'onExit', payload);
      },
      onError: (error) => {
        this.cleanupRecord(record);
        this.fanOut(record, 'onError', error);
      },
    });

    record.session = session;
    this.clientSessions.set(clientId, record);

    if (conversationId) {
      this.conversationSessions.set(conversationId, record);
    }

    sessionLogger.info(
      { clientId, sessionId: session.sessionId, conversationId },
      'codex session registered'
    );

    return session;
  }

  getSessionRecord(clientId) {
    return this.clientSessions.get(clientId);
  }

  getSession(clientId) {
    return this.getSessionRecord(clientId)?.session;
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

  detachClient(clientId) {
    const record = this.getSessionRecord(clientId);

    if (!record) {
      return false;
    }

    record.subscribers.delete(clientId);
    this.clientSessions.delete(clientId);

    if (!record.conversationId && record.subscribers.size === 0) {
      record.session.terminate('SIGTERM');
    }

    return true;
  }

  terminateSession(clientId, signal) {
    const record = this.getSessionRecord(clientId);

    if (!record) {
      return false;
    }

    this.cleanupRecord(record);
    return record.session.terminate(signal);
  }

  terminateAll(signal = 'SIGTERM') {
    const uniqueRecords = new Set(this.clientSessions.values());
    for (const record of uniqueRecords) {
      this.logger.info(
        { sessionId: record.session.sessionId, conversationId: record.conversationId, signal },
        'terminating session'
      );
      record.session.terminate(signal);
    }
  }
}

module.exports = {
  CodexProcessManager,
};
