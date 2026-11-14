import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeBotSettings, duringBusinessHours } from './bot-runtime-settings';
import { BotManagerSettings, ChannelsService } from './channels.service';

test('drafts never activate runtime behavior; absent active settings preserve legacy behavior', () => {
  assert.deepEqual(activeBotSettings({ botManager: { general: { noMatchReply: false } } }), {});
  assert.equal(duringBusinessHours(undefined, new Date()), false);
});
test('business intervals honor timezone, start inclusive/end exclusive, off-days and overnight rollover', () => {
  const c: NonNullable<Parameters<typeof duringBusinessHours>[0]> = {
    timezone: 'Africa/Cairo',
    offDays: [],
    disableBotDuringHours: true,
    schedule: [{ day: 'Monday', start: '09:00', end: '17:00' }],
  };
  assert.equal(duringBusinessHours(c, new Date('2026-11-09T06:59:00Z')), false);
  assert.equal(duringBusinessHours(c, new Date('2026-11-09T07:00:00Z')), true);
  assert.equal(duringBusinessHours(c, new Date('2026-11-09T15:00:00Z')), false);
  c.schedule = [{ day: 'Monday', start: '22:00', end: '02:00' }];
  assert.equal(duringBusinessHours(c, new Date('2026-11-09T23:00:00Z')), true);
  assert.equal(duringBusinessHours(c, new Date('2026-11-10T00:00:00Z')), false);
  c.offDays = ['Tuesday'];
  assert.equal(duringBusinessHours(c, new Date('2026-11-09T23:00:00Z')), false);
});
test('activation rejects stale drafts, unknown zero expiry, missing flows and invalid timezone without writing', async () => {
  let settings: { botManager: BotManagerSettings } = {
    botManager: { general: { noMatchReply: false, getStartedEnabled: false } },
  };
  let writes = 0;
  const db = {
    withTenant: async (
      tenant: string,
      fn: (client: {
        query: (
          sql: string,
        ) => Promise<{ rows: { settings: { botManager: BotManagerSettings } }[] }>;
      }) => Promise<unknown>,
    ) => {
      assert.equal(tenant, 'test-company');
      return fn({
        query: async (sql: string) => {
          if (sql.startsWith('UPDATE')) {
            writes++;
            return { rows: [] };
          }
          return { rows: [{ settings }] };
        },
      });
    },
  };
  const service = new ChannelsService(db as never, {} as never, {} as never);
  await assert.rejects(
    () => service.activateBotSettings('test-company', 'channel', {}),
    /Settings changed/,
  );
  settings = { botManager: { sharedInbox: { inputFlowSessionExpiryMinutes: 0 } } };
  await assert.rejects(
    () => service.activateBotSettings('test-company', 'channel', settings.botManager),
    /positive/,
  );
  settings = { botManager: { sharedInbox: { humanSessionExpiryMinutes: 0 } } };
  await assert.rejects(
    () => service.activateBotSettings('test-company', 'channel', settings.botManager),
    /positive/,
  );
  settings = { botManager: { general: { getStartedEnabled: true } } };
  await assert.rejects(
    () => service.activateBotSettings('test-company', 'channel', settings.botManager),
    /Configure/,
  );
  settings = {
    botManager: { businessHour: { disableBotDuringHours: true, timezone: 'Mars/Unknown' } },
  };
  await assert.rejects(
    () => service.activateBotSettings('test-company', 'channel', settings.botManager),
    /timezone/,
  );
  assert.equal(writes, 0);
  settings = {
    botManager: {
      general: { noMatchReply: false, getStartedEnabled: false },
      sharedInbox: { inputFlowSessionExpiryMinutes: 15, signatureEnabled: true, humanSessionExpiryMinutes: 30 },
    },
  };
  const result = await service.activateBotSettings('test-company', 'channel', settings.botManager);
  assert.equal(result.active.sharedInbox?.inputFlowSessionExpiryMinutes, 15);
  assert.equal(result.active.sharedInbox?.signatureEnabled, true);
  assert.equal(result.active.sharedInbox?.humanSessionExpiryMinutes, 30);
  assert.equal(result.activated, true);
  assert.equal(writes, 1);
});

test('runtime input waits use activated minutes, retain legacy 24-hour default, and never expire delays', async () => {
  const { FlowRuntimeService } = await import('../flows/flow-runtime.service');
  const writes: { sql: string; values: unknown[] }[] = [];
  const db = {
    withTenant: async (
      _tenant: string,
      fn: (c: { query: (sql: string, values: unknown[]) => Promise<void> }) => Promise<void>,
    ) =>
      fn({
        query: async (sql, values) => {
          writes.push({ sql, values });
        },
      }),
  };
  const runtime = new FlowRuntimeService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const base = {
    tenantId: 'tenant',
    channelId: 'channel',
    conversationId: 'conversation',
    contactId: 'contact',
    ctx: {
      contact: { id: 'contact', attributes: {}, tags: [] },
      channel: { id: 'channel', type: 'web' },
    },
  };
  const result = { status: 'waiting', waitKind: 'input', state: {} };
  const save = runtime as unknown as { saveSession: (b: unknown, p: unknown) => Promise<void> };
  await save.saveSession(
    { ...base, inputExpiryMinutes: 15 },
    { flowId: 'flow', versionId: 'version', result },
  );
  assert.equal(writes[0].values[9], 15);
  assert.match(writes[0].sql, /minutes/);
  await save.saveSession(base, { flowId: 'flow', versionId: 'version', result });
  assert.equal(writes[1].values[9], 1440);
  await save.saveSession(
    { ...base, inputExpiryMinutes: 15 },
    { flowId: 'flow', versionId: 'version', result: { ...result, waitKind: 'delay' } },
  );
  assert.equal(writes[2].values[9], null);
});
