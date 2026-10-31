import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { FlowsService } from './flows.service';
import { initialFlowGraph } from './initial-graph';

test('publish/unpublish revisions allow subsequent saves and reject stale editors', async () => {
  const pg = new PGlite();
  const previous = { ...process.env };
  const channel = '11111111-1111-4111-8111-111111111111';
  const conversation = '22222222-2222-4222-8222-222222222222';
  Object.assign(process.env, {
    BOAT_PREVIEW_ONLY: 'true',
    WHATSAPP_PREVIEW_BOT_ENABLED: 'true',
    WHATSAPP_PREVIEW_BOT_CHANNEL_ID: channel,
    WHATSAPP_PREVIEW_BOT_CONVERSATION_ID: conversation,
  });
  try {
    await pg.exec(`CREATE TABLE channels(id uuid PRIMARY KEY, settings jsonb DEFAULT '{}'); CREATE TABLE flows (
      id text primary key, name text, description text, status text, priority int,
      triggers jsonb, channel_ids uuid[], published_version_id text, created_at timestamptz,
      updated_at timestamptz, folder_name text, draft_graph jsonb
    ); CREATE TABLE flow_versions (
      id text default 'version-id', tenant_id text, flow_id text, version int,
      graph jsonb, triggers jsonb, channel_ids uuid[], created_by text
    );`);
    await pg.exec(`CREATE TABLE conversations(id uuid PRIMARY KEY, channel_id uuid, handled_by text, assigned_to uuid, status text);
      CREATE TABLE flow_sessions(conversation_id uuid, status text, updated_at timestamptz);`);
    await pg.query('INSERT INTO channels(id) VALUES($1)', [channel]);
    await pg.query("INSERT INTO conversations VALUES($1,$2,'human',$2,'open')", [
      conversation,
      channel,
    ]);
    await pg.query("INSERT INTO flow_sessions VALUES($1,'waiting',now())", [conversation]);
    const before = '2026-01-01T00:00:00.000Z';
    await pg.query(
      `INSERT INTO flows (id,name,status,priority,triggers,channel_ids,updated_at,draft_graph)
      VALUES ('flow','QA','draft',0,'[{"type":"first_message"}]','{}',$1,$2)`,
      [before, JSON.stringify(initialFlowGraph('ar'))],
    );
    const db = {
      withTenant: async (_tenant: string, fn: (c: unknown) => Promise<unknown>) =>
        pg.transaction(async (tx) =>
          fn({
            query: async (sql: string, args: unknown[] = []) => {
              const result = await tx.query(sql, args);
              return { ...result, rowCount: result.affectedRows || result.rows.length };
            },
          }),
        ),
    };
    const service = new FlowsService(db as never, {} as never, {} as never);
    const published = await service.publish('tenant', 'owner', 'flow', before);
    assert.ok(published.updated_at);
    assert.equal(
      (await pg.query<{ handled_by: string }>('SELECT handled_by FROM conversations')).rows[0]
        .handled_by,
      'human',
    );
    assert.equal(
      (await pg.query<{ status: string }>('SELECT status FROM flow_sessions')).rows[0].status,
      'waiting',
    );
    assert.equal(
      (await pg.query<{ settings: { activeBotFlowId: string } }>('SELECT settings FROM channels'))
        .rows[0].settings.activeBotFlowId,
      'flow',
    );
    const revision = new Date(published.updated_at).toISOString();
    assert.notEqual(revision, before);
    await assert.rejects(
      service.update('tenant', 'flow', { name: 'stale', expectedUpdatedAt: before }),
      /another editor/,
    );
    const saved = await service.update('tenant', 'flow', {
      name: 'fresh draft',
      expectedUpdatedAt: revision,
    });
    assert.equal(saved.name, 'fresh draft');
    const unpublished = await service.unpublish('tenant', 'flow');
    assert.ok(unpublished.updated_at);
    const next = await service.update('tenant', 'flow', {
      name: 'after unpublish',
      expectedUpdatedAt: new Date(unpublished.updated_at).toISOString(),
    });
    assert.equal(next.name, 'after unpublish');
    await assert.rejects(
      service.update('tenant', 'flow', { name: 'stale', expectedUpdatedAt: before }),
      /another editor/,
    );
  } finally {
    for (const key of [
      'BOAT_PREVIEW_ONLY',
      'WHATSAPP_PREVIEW_BOT_ENABLED',
      'WHATSAPP_PREVIEW_BOT_CHANNEL_ID',
      'WHATSAPP_PREVIEW_BOT_CONVERSATION_ID',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await pg.close();
  }
});
