import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { DeliveryBudget } = require('./dist/messaging/delivery-budget.js');
const db = new DatabaseService(),
  budget = new DeliveryBudget(db),
  base = process.env.SMOKE_API_URL || 'http://localhost:4118';
async function req(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${result.message || ''}`);
  return result;
}
const post = (path, token, body, status = 201) => req(path, token, 'POST', body, status);
async function register() {
  return post('/auth/register', null, {
    email: `account-${randomUUID()}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Account fixture',
    workspaceName: 'Account fixture',
  });
}
try {
  const a = await register(),
    b = await register(),
    token = a.accessToken;
  const first = await post('/channels', token, { type: 'web', name: 'Pacing A' }),
    second = await post('/channels', token, { type: 'web', name: 'Pacing B' });
  const input = {
    name: 'Shared local provider account',
    provider: 'web',
    intervalMs: 1000,
    dailyLimit: 1,
    enabled: true,
  };
  const account = await post('/delivery/policies/accounts', token, input);
  for (const channel of [first, second])
    await req('/delivery/policies/' + channel.id, token, 'PUT', {
      intervalMs: 100,
      marketingEnabled: true,
      accountId: account.id,
    });
  const attempts = await Promise.all([
    budget.take(a.tenantId, first.id, true),
    budget.take(a.tenantId, second.id, true),
  ]);
  assert.equal(attempts.filter((value) => value.allowed).length, 1);
  assert.ok(attempts.some((value) => value.reason === 'Shared daily attempt cap'));
  assert.equal((await req('/delivery/policies/accounts', token))[0].daily_used, 1);
  await req('/delivery/policies/accounts/' + account.id, b.accessToken, 'PUT', input, 404);
  await req(
    '/delivery/policies/' + first.id,
    b.accessToken,
    'PUT',
    { intervalMs: 100, marketingEnabled: true, accountId: account.id },
    404,
  );
  const meta = await post('/delivery/policies/accounts', token, {
    ...input,
    name: 'Unlinked Meta fixture',
    provider: 'meta',
    intervalMs: 1000,
  });
  await req(
    '/delivery/policies/' + first.id,
    token,
    'PUT',
    { intervalMs: 100, marketingEnabled: true, accountId: meta.id },
    400,
  );
  await req('/delivery/policies/accounts/' + account.id, token, 'PUT', {
    ...input,
    dailyLimit: 10,
  });
  await db.withTenant(a.tenantId, async (c) => {
    await c.query(
      "UPDATE delivery_accounts SET next_send_at=now()-interval '1 second' WHERE id=$1",
      [account.id],
    );
    await c.query(
      "UPDATE channel_delivery_policy SET next_send_at=now()-interval '1 second' WHERE account_id=$1",
      [account.id],
    );
  });
  const paced = await Promise.all([
    budget.take(a.tenantId, first.id, true),
    budget.take(a.tenantId, second.id, true),
  ]);
  assert.equal(paced.filter((value) => value.allowed).length, 1);
  assert.ok(paced.some((value) => value.reason === 'Shared send pacing'));
  const used = (await req('/delivery/policies/accounts', token)).find(
    (row) => row.id === account.id,
  ).daily_used;
  await db.withTenant(a.tenantId, async (c) => {
    await c.query(
      "UPDATE delivery_accounts SET next_send_at=now()-interval '1 second' WHERE id=$1",
      [account.id],
    );
    await c.query(
      "UPDATE channel_delivery_policy SET next_send_at=now()-interval '1 second' WHERE account_id=$1",
      [account.id],
    );
  });
  await assert.rejects(
    () =>
      db.withTenant(a.tenantId, async () => {
        assert.equal((await budget.take(a.tenantId, first.id, true)).allowed, true);
        throw Error('Fixture rollback');
      }),
    /Fixture rollback/,
  );
  assert.equal(
    (await req('/delivery/policies/accounts', token)).find((row) => row.id === account.id)
      .daily_used,
    used,
  );
  await req('/delivery/policies/accounts/' + account.id, token, 'PUT', {
    ...input,
    enabled: false,
  });
  assert.equal((await budget.take(a.tenantId, first.id, true)).blocked, true);
  console.log(
    'PASS shared delivery accounts: cross-channel concurrent pacing/daily caps, reservation rollback, provider validation, account disable and tenant isolation. No external delivery.',
  );
} finally {
  await db.onModuleDestroy();
}
