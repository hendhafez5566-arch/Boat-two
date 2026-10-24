'use strict';
const { spawnSync } = require('node:child_process');
const r = spawnSync('pnpm', ['--filter', 'web', 'build'], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: process.env
});
console.log('===== PHASE 5 NEXT BUILD FULL LOG BEGIN =====');
if (r.stdout) console.log(r.stdout);
if (r.stderr) console.log(r.stderr);
if (r.error) console.error(r.error.message);
console.log('===== PHASE 5 NEXT BUILD FULL LOG END: ' + (r.status ?? r.signal ?? 'unknown') + ' =====');
process.exit(r.status ?? 1);
