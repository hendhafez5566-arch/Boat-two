import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowsService } from './flows.service';
import { createFlowSchema } from './flow-schemas';

const channel = '11111111-1111-4111-8111-111111111111';
function setup(visibleChannels: number) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const client = {
    query: async (sql: string, args: unknown[] = []) => {
      calls.push({ sql, args });
      if (sql.includes('count(*)') && sql.includes('channels'))
        return { rows: [{ n: visibleChannels }] };
      if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
      if (sql.includes('INSERT INTO flows'))
        return { rows: [{ id: 'new-flow', channel_ids: args[7] }] };
      return { rows: [] };
    },
  };
  const tenants: string[] = [];
  const db = {
    withTenant: async (tenant: string, fn: (c: typeof client) => Promise<unknown>) => {
      tenants.push(tenant);
      return fn(client);
    },
  };
  const service = new FlowsService(
    db as unknown as ConstructorParameters<typeof FlowsService>[0],
    { assertWithinLimit: async () => {} } as unknown as ConstructorParameters<
      typeof FlowsService
    >[1],
    {} as ConstructorParameters<typeof FlowsService>[2],
  );
  return { service, calls, tenants };
}
test('creating from an account validates the tenant-visible channel and inserts its binding atomically', async () => {
  const { service, calls, tenants } = setup(1);
  const flow = await service.create(
    'tenant-a',
    'owner',
    createFlowSchema.parse({ name: 'Main menu', channelIds: [channel, channel] }),
  );
  assert.deepEqual(tenants, ['tenant-a']);
  assert.deepEqual(flow.channel_ids, [channel]);
  assert.deepEqual(calls.find((c) => c.sql.includes('FROM channels'))?.args, [[channel]]);
  assert.equal(calls.filter((c) => c.sql.includes('INSERT INTO flows')).length, 1);
  assert.equal(
    calls.some((c) => c.sql.includes('UPDATE flows')),
    false,
  );
});
test('foreign or missing channels reject creation before inserting a flow', async () => {
  const { service, calls } = setup(0);
  await assert.rejects(
    service.create(
      'tenant-a',
      'owner',
      createFlowSchema.parse({ name: 'Main menu', channelIds: [channel] }),
    ),
    /Unknown channel/,
  );
  assert.equal(
    calls.some((c) => c.sql.includes('INSERT INTO flows')),
    false,
  );
});
test('legacy create requests keep the existing unrestricted channel behavior', async () => {
  const { service, calls } = setup(0);
  const flow = await service.create(
    'tenant-a',
    'owner',
    createFlowSchema.parse({ name: 'Existing caller' }),
  );
  assert.deepEqual(flow.channel_ids, []);
  assert.equal(
    calls.some((c) => c.sql.includes('FROM channels')),
    false,
  );
  assert.equal(
    createFlowSchema.safeParse({ name: 'Invalid', channelIds: ['not-a-channel-id'] }).success,
    false,
  );
});
