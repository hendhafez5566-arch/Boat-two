import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { FlowsService } from './flows.service';
import { initialFlowGraph } from './initial-graph';

test('publish/unpublish revisions allow subsequent saves and reject stale editors', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE flows (
      id text primary key, name text, description text, status text, priority int,
      triggers jsonb, channel_ids uuid[], published_version_id text, created_at timestamptz,
      updated_at timestamptz, folder_name text, draft_graph jsonb
    ); CREATE TABLE flow_versions (
      id text default 'version-id', tenant_id text, flow_id text, version int,
      graph jsonb, triggers jsonb, channel_ids uuid[], created_by text
    );`);
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
    await pg.close();
  }
});
