'use strict';

const Fastify = require('fastify');
const { config } = require('./config');
const { CodexProcessManager } = require('./codex/CodexProcessManager');
const { createWebSocketServer } = require('./ws/createWebSocketServer');

function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  const manager = new CodexProcessManager({
    codexBin: config.codexBin,
    codexCwd: config.codexCwd,
    logger: fastify.log.child({ module: 'codex-manager' }),
  });

  createWebSocketServer({
    fastify,
    manager,
    wsPath: config.wsPath,
  });

  fastify.get('/', async () => {
    return {
      service: 'codex-ws-backend',
      status: 'ok',
      wsPath: config.wsPath,
    };
  });

  fastify.get('/health', async () => {
    return {
      status: 'ok',
    };
  });

  fastify.addHook('onClose', async () => {
    manager.terminateAll('SIGTERM');
  });

  return fastify;
}

module.exports = {
  buildServer,
};
