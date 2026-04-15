'use strict';

const { buildServer } = require('./src/server');
const { config } = require('./src/config');

async function main() {
  const server = buildServer();

  try {
    await server.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    server.log.error({ err: error }, 'failed to start server');
    process.exitCode = 1;
  }
}

main();
