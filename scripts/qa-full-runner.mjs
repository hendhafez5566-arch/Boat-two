import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
(async () => {
  const children = [];
  const start = (cmd, args, name) => {
    const log = fs.openSync('/tmp/boat-full-' + name + '.log', 'w');
    const child = spawn(cmd, args, { stdio: ['ignore', log, log], env: process.env });
    children.push(child);
    return child;
  };
  try {
    start(process.execPath, ['scripts/qa-full-api.mjs'], 'api');
    start('pnpm', ['--filter', 'web', 'start'], 'web');
    for (const url of ['http://127.0.0.1:4000/health', 'http://127.0.0.1:3000/login']) {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          const r = await fetch(url);
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {
          /* Not ready yet. */
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!ready) throw Error('Fixture did not become ready: ' + url);
    }
    const child = spawn(process.execPath, ['scripts/qa-full-browser.mjs'], {
      stdio: 'inherit',
      env: process.env,
    });
    await new Promise((resolve, reject) =>
      child.on('exit', (code) => (code === 0 ? resolve() : reject(Error('Browser exit ' + code)))),
    );
  } finally {
    for (const c of children) c.kill('SIGTERM');
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
