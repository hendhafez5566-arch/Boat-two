import test from 'node:test';
import assert from 'node:assert/strict';

test('token-only Telegram onboarding verifies before save and reports webhook failures honestly', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'true',
    PUBLIC_API_URL: 'https://api.example.test',
  });
  const { ChannelsService } = await import('./channels.service');
  const { env } = await import('../config/env');
  const service = new ChannelsService({} as never, {} as never, {} as never);
  const token = '123456:synthetic_test_token_123456789';
  const original = globalThis.fetch;
  let creates = 0,
    webhooks = 0,
    mismatch = false,
    failWebhook = false,
    duplicate = false;
  service.create = async (tenant, input) => {
    creates++;
    assert.equal(tenant, 'tenant-a');
    assert.equal(input.name, 'Synthetic bot');
    assert.equal(input.type, 'telegram');
    if (duplicate) throw new Error('This account is already connected');
    return { id: 'channel-a' } as Awaited<ReturnType<typeof service.create>>;
  };
  service.setupTelegram = async (tenant, id) => {
    assert.equal(tenant, 'tenant-a');
    assert.equal(id, 'channel-a');
    webhooks++;
    if (failWebhook) throw new Error('synthetic provider failure');
    return { configured: true, verifiedBot: true, liveInboundTested: false };
  };
  service.verify = async () => ({
    state: 'connected',
    checkedAt: new Date().toISOString(),
    reason: 'provider_verified',
  });
  globalThis.fetch = async (input) => {
    assert.equal(String(input), `https://api.telegram.org/bot${token}/getMe`);
    return Response.json({
      ok: true,
      result: { id: mismatch ? 999999 : 123456, is_bot: true, first_name: 'Synthetic bot' },
    });
  };
  try {
    assert.deepEqual(await service.connectTelegram('tenant-a', token), {
      id: 'channel-a',
      webhookReady: true,
    });
    assert.equal(creates, 1);
    assert.equal(webhooks, 1);
    mismatch = true;
    await assert.rejects(service.connectTelegram('tenant-a', token), /identity mismatch/);
    assert.equal(creates, 1);
    mismatch = false;
    duplicate = true;
    await assert.rejects(service.connectTelegram('tenant-a', token), /already connected/);
    assert.equal(webhooks, 1);
    duplicate = false;
    failWebhook = true;
    assert.deepEqual(await service.connectTelegram('tenant-a', token), {
      id: 'channel-a',
      webhookReady: false,
    });
    env.EXTERNAL_DELIVERY_ENABLED = 'false';
    const before = creates;
    await assert.rejects(service.connectTelegram('tenant-a', token), /External access is disabled/);
    assert.equal(creates, before);
  } finally {
    globalThis.fetch = original;
  }
});
