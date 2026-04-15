'use strict';

const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3001),
  wsPath: process.env.WS_PATH || '/ws',
  codexBin: process.env.CODEX_BIN || 'codex',
  codexCwd: process.env.CODEX_CWD || process.cwd(),
};

module.exports = {
  config,
};
