import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const { hashPassword } = require('./dist/auth/password.js');
const { totp } = require('./dist/platform/totp.js');
const { JwtService } = require('@nestjs/jwt');
const admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
const app = new Client({ connectionString: process.env.DATABASE_URL });
const url = new URL(process.env.DATABASE_ADMIN_URL);
url.searchParams.set('options', '-c role=boat_platform');
const platform = new Client({ connectionString: url.toString() });
const uid = randomUUID(),
  email = `mfa-${uid}@example.test`,
  password = randomBytes(20).toString('hex'),
  key = randomBytes(32).toString('hex');
const port = process.env.SMOKE_MFA_PORT || '4121',
  base = 'http://127.0.0.1:' + port;
let server;
async function request(path, body, token, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + '/platform' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
try {
  await Promise.all([admin.connect(), app.connect(), platform.connect()]);
  await admin.query('INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,$4)', [
    uid,
    email,
    await hashPassword(password),
    'Isolated MFA fixture',
  ]);
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: new URL('../apps/api/', import.meta.url),
    env: {
      ...process.env,
      API_PORT: port,
      PLATFORM_DATABASE_URL: url.toString(),
      PLATFORM_ADMIN_USER_IDS: uid,
      PLATFORM_JWT_SECRET: key,
      PLATFORM_OPERATOR_ROLES: JSON.stringify({ [uid]: ['billing'] }),
      AI_PROVIDER_CALLS_ENABLED: 'false',
      EXTERNAL_DELIVERY_ENABLED: 'false',
    },
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Isolated MFA API must start');
  const enrollment = await request('/login', { email, password });
  assert.equal(enrollment.status, 201);
  assert.equal(enrollment.data.requiresEnrollment, true);
  assert.equal(enrollment.data.accessToken, undefined);
  assert.equal((await request('/session', undefined, enrollment.data.setupToken)).status, 403);
  const stored = (await platform.query('SELECT platform_mfa_state($1) AS data', [uid])).rows[0]
    .data;
  assert.ok(!stored.secret_enc.includes(enrollment.data.secret));
  assert.equal(stored.enabled, false);
  await assert.rejects(
    () => app.query('SELECT platform_mfa_state($1)', [uid]),
    /permission denied/,
  );
  const invalid = await request('/mfa/enroll', {
    setupToken: enrollment.data.setupToken,
    otp: 'invalid',
  });
  assert.equal(invalid.status, 400);
  const code = totp(enrollment.data.secret, Math.floor(Date.now() / 30000));
  const confirmed = await request('/mfa/enroll', {
    setupToken: enrollment.data.setupToken,
    otp: code,
  });
  assert.equal(confirmed.status, 201);
  assert.ok(confirmed.data.accessToken);
  const token = confirmed.data.accessToken;
  assert.equal(
    (await request('/mfa/enroll', { setupToken: enrollment.data.setupToken, otp: code })).status,
    403,
  );
  assert.equal((await request('/login', { email, password })).data.requiresMfa, true);
  assert.equal(
    (await request('/login', { email, password, otp: code })).status,
    403,
    'Consumed enrollment code cannot sign in again',
  );
  const session = await request('/session', undefined, token);
  assert.equal(session.status, 200);
  assert.deepEqual(session.data.permissions, ['subscriptions.write']);
  const oldToken = await new JwtService().signAsync(
    { sub: uid, purpose: 'platform', sv: 0 },
    { secret: key, expiresIn: 60 },
  );
  assert.equal(
    (await request('/session', undefined, oldToken)).status,
    403,
    'Password-only legacy platform tokens must fail',
  );
  assert.equal(
    (
      await request(
        '/companies/' + randomUUID(),
        { name: 'Fixture', suspended: false, reason: 'Local scope check' },
        token,
        'PATCH',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        '/subscriptions/' + randomUUID(),
        { planCode: 'starter', status: 'active', reason: 'Local scope check' },
        token,
        'PATCH',
      )
    ).status,
    400,
    'Billing scope reaches validated SQL operation',
  );
  const state = (await platform.query('SELECT platform_mfa_state($1) AS data', [uid])).rows[0].data;
  const next = Number(state.last_step) + 1;
  const results = await Promise.all([
    platform.query('SELECT platform_mfa_consume($1,$2,$3,false) AS ok', [
      uid,
      state.secret_enc,
      next,
    ]),
    platform.query('SELECT platform_mfa_consume($1,$2,$3,false) AS ok', [
      uid,
      state.secret_enc,
      next,
    ]),
  ]);
  assert.equal(
    results.filter((result) => result.rows[0].ok).length,
    1,
    'Only one concurrent consumer wins',
  );
  await admin.query('UPDATE users SET session_version=session_version+1 WHERE id=$1', [uid]);
  assert.equal((await request('/session', undefined, token)).status, 403);
  console.log(
    'PASS isolated platform MFA: encrypted enrollment, limited challenge, mandatory factor, replay/concurrent consumption protection, role API denial/allow, legacy token denial and global session revocation. No live operator configured.',
  );
} finally {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      server.once('exit', resolve);
      setTimeout(resolve, 3000).unref();
    });
  }
  await Promise.all([admin.end(), app.end(), platform.end()]);
}
