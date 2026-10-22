import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
// Local test-only bindings; no network connections or paid provider calls.
process.env.DATABASE_URL ||= 'postgres://test:test@localhost/test';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('hex');
process.env.META_APP_SECRET ||= randomBytes(32).toString('hex');
const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: 'test-phone' },
            messages: [
              { id: 'test-message', from: 'test-contact', type: 'text', text: { body: 'hello' } },
            ],
          },
        },
      ],
    },
  ],
};
async function fixture(write: () => Promise<unknown>) {
  const { WebhooksController } = await import('./webhooks.controller');
  const { env } = await import('../config/env');
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature =
    'sha256=' + createHmac('sha256', env.META_APP_SECRET!).update(rawBody).digest('hex');
  const db = {
    withTenant: (_tenant: string, fn: (c: unknown) => Promise<unknown>) => fn({ query: write }),
  };
  const channels = {
    lookup: async () => ({ id: 'test-channel', tenant_id: 'test-tenant', status: 'active' }),
  };
  // Deliberately pass only dependencies used by this controller boundary.
  const controller = new WebhooksController(db as never, channels as never, {} as never);
  return { controller, rawBody, signature };
}
test('webhook acknowledges only after durable enqueue completes', async () => {
  let persisted = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await fixture(async () => {
    await gate;
    persisted = true;
  });
  let acknowledged = false;
  const result = f.controller
    .whatsapp({ rawBody: f.rawBody } as never, f.signature, payload)
    .then((value) => {
      acknowledged = true;
      return value;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(acknowledged, false);
  release();
  assert.deepEqual(await result, { received: true });
  assert.equal(persisted, true);
});
test('enqueue database failure propagates so provider can retry', async () => {
  const f = await fixture(async () => {
    throw new Error('database unavailable');
  });
  await assert.rejects(
    f.controller.whatsapp({ rawBody: f.rawBody } as never, f.signature, payload),
    /database unavailable/,
  );
});
test('invalid signature cannot enqueue a job', async () => {
  let writes = 0;
  const f = await fixture(async () => {
    writes++;
  });
  await assert.rejects(
    f.controller.whatsapp({ rawBody: f.rawBody } as never, 'sha256=invalid', payload),
  );
  assert.equal(writes, 0);
});
test('signature covers exact raw body rather than parsed representation', async () => {
  let writes = 0;
  const f = await fixture(async () => {
    writes++;
  });
  await assert.rejects(
    f.controller.whatsapp({ rawBody: Buffer.from('{}') } as never, f.signature, payload),
  );
  assert.equal(writes, 0);
});
