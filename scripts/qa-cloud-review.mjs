// Explicitly isolated review gateway. Never used by the production Web/API start commands.
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
if (process.env.BOAT_CLOUD_REVIEW !== 'true') throw Error('Review mode must be explicitly enabled');
const safeEnv = Object.fromEntries(
  ['PATH', 'HOME', 'LD_LIBRARY_PATH', 'LANG', 'TMPDIR']
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
const children = [];
const start = (cmd, args, env) => {
  const p = spawn(cmd, args, { stdio: 'inherit', env: { ...safeEnv, ...env } });
  children.push(p);
  p.on('exit', (code) => {
    if (code && !stopping) {
      console.error('Review child failed', cmd, code);
      process.exit(1);
    }
  });
};
let stopping = false;
start(process.execPath, ['scripts/qa-full-api.mjs'], { BOAT_CLOUD_REVIEW: 'true' });
start('pnpm', ['--filter', 'web', 'start'], {
  NODE_ENV: 'production',
  PORT: '3000',
  NEXT_PUBLIC_API_URL: '/api',
});
for (const url of ['http://127.0.0.1:4000/health', 'http://127.0.0.1:3000/login']) {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw Error('Review child failed health check');
}
const html = readFileSync(new URL('./qa-cloud-review.html', import.meta.url));
const server = createServer((req, res) => {
  if (req.url === '/__review') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }
  if (req.url === '/__review/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        review: true,
        database: 'ephemeral PostgreSQL',
        ownerDatabase: false,
        externalDelivery: false,
      }),
    );
    return;
  }
  const isApi = req.url.startsWith('/api/');
  const path = isApi ? req.url.slice(4) : req.url;
  if (path.startsWith('/__qa')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const upstream = request(
    {
      hostname: '127.0.0.1',
      port: isApi ? 4000 : 3000,
      path,
      method: req.method,
      headers: { ...req.headers, host: req.headers.host },
    },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Review service unavailable');
  });
  req.pipe(upstream);
  req.on('aborted', () => upstream.destroy());
});
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () =>
  console.log('ISOLATED_REVIEW_READY'),
);
for (const event of ['SIGTERM', 'SIGINT'])
  process.on(event, () => {
    stopping = true;
    server.close();
    for (const child of children) child.kill('SIGTERM');
    process.exit(0);
  });
