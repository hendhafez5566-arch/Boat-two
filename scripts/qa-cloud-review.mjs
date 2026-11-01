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
  p.on('exit', (code, signal) => {
    if (!stopping) {
      console.error('Review child failed', cmd, code, signal);
      process.exit(1);
    }
  });
};
let stopping = false;
async function waitFor(url, attempts) {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error('Review child failed health check: ' + url);
}
const publicOrigin = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${process.env.PORT || 8080}`;
start(process.execPath, ['scripts/qa-full-api.mjs'], {
  BOAT_CLOUD_REVIEW: 'true',
  BOAT_QA_APP_URL: publicOrigin,
  BOAT_QA_PUBLIC_URL: publicOrigin + '/api',
});
await waitFor('http://127.0.0.1:4000/health', 500);
start('pnpm', ['--filter', 'web', 'start'], {
  NODE_ENV: 'production',
  PORT: '3000',
  NEXT_PUBLIC_API_URL: '/api',
});
await waitFor('http://127.0.0.1:3000/login', 150);
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
  const isApi = req.url.startsWith('/api/') && req.url.split('?')[0] !== '/api/widget-config';
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
