import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { AuthedRequest } from '../common/types';

test('template drafts isolate tenants and remain recoverable without resubmitting', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'true',
    META_APP_ID: '500',
  });
  const { TemplatesController } = await import('./templates.controller');
  const pg = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const channel = '33333333-3333-4333-8333-333333333333';
  const foreign = '44444444-4444-4444-8444-444444444444';
  const owner = { user: { tenantId: a, role: 'owner' } } as AuthedRequest;
  const other = { user: { tenantId: b, role: 'admin' } } as AuthedRequest;
  await pg.exec(`CREATE ROLE app_user; CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE channels(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, type text);
    INSERT INTO tenants VALUES ('${a}'), ('${b}');
    INSERT INTO channels VALUES ('${channel}','${a}','whatsapp'), ('${foreign}','${b}','whatsapp');
    ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
    CREATE POLICY channels_isolated ON channels USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
    GRANT SELECT ON channels TO app_user;`);
  for (const name of [
    '011_templates_and_causality.sql',
    '020_template_support.sql',
    '071_template_components.sql',
    '072_template_draft_revision.sql',
  ]) {
    const schema = readFileSync(resolve(__dirname, '../database/migrations', name), 'utf8');
    await pg.exec(name.startsWith('011') ? schema.split('ALTER TABLE domain_events')[0] : schema);
  }
  const controller = new TemplatesController(
    {
      withTenant(
        tenant: string,
        work: (c: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => unknown,
      ) {
        return pg.transaction(async (tx) => {
          await tx.exec('SET LOCAL ROLE app_user');
          await tx.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
          return work({
            query: async (sql, params) => {
              const result = await tx.query(sql, params);
              return { ...result, rowCount: result.affectedRows || result.rows.length };
            },
          });
        });
      },
    } as never,
    { credentials: () => ({ wabaId: '900', accessToken: 'synthetic-token' }) } as never,
  );
  const draft = {
    name: 'qa_draft',
    language: 'ar',
    category: 'UTILITY',
    body: 'حجز {{1}} مؤكد.',
    examples: ['QA-47'],
  };
  const calls: Array<{ url: string; headers?: HeadersInit }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers });
    assert.equal(new URL(input).hostname, 'graph.facebook.com');
    if (input.includes('/500/uploads')) return Response.json({ id: 'upload:abc?sig=xyz' });
    if (input.includes('/upload:abc')) return Response.json({ h: '2:synthetic-media-reference' });
    if (init?.method === 'POST') return Response.json({ id: '991' });
    return Response.json({
      data: [
        {
          id: '992',
          name: 'qa_draft_copy',
          language: 'ar',
          category: 'UTILITY',
          status: 'APPROVED',
          components: [{ type: 'BODY', text: 'Provider text' }],
        },
        {
          id: '993',
          name: 'qa_rejected',
          language: 'ar',
          category: 'UTILITY',
          status: 'REJECTED',
          rejected_reason: 'Synthetic reason',
          components: [{ type: 'BODY', text: 'Provider text' }],
        },
      ],
    });
  });
  try {
    assert.deepEqual(Reflect.getMetadata('roles', TemplatesController), ['owner', 'admin']);
    const first = await controller.create(owner, channel, draft);
    await assert.rejects(controller.list(other, channel), /channel not found/i);
    assert.deepEqual(await controller.list(other, foreign), []);
    await assert.rejects(controller.archive(other, foreign, first.id, { revision: 1 }), /changed/);
    const edited = await controller.edit(owner, channel, first.id, {
      revision: 1,
      draft: { ...draft, body: 'تم تأكيد الحجز {{1}}.' },
    });
    assert.equal(edited.revision, 2);
    const copy = await controller.create(owner, channel, { ...draft, name: 'qa_draft_copy' });
    await controller.archive(owner, channel, copy.id, { revision: 1 });
    await assert.rejects(controller.restore(owner, channel, copy.id, { revision: 1 }), /changed/);
    await controller.restore(owner, channel, copy.id, { revision: 2 });
    assert.equal(
      (await controller.list(owner, channel)).find((row: { id: string }) => row.id === copy.id)
        .status,
      'DRAFT',
    );
    const sync = await controller.sync(owner, channel);
    assert.equal(sync.skippedDrafts, 1);
    assert.equal(
      (await controller.list(owner, channel)).find(
        (row: { name: string }) => row.name === 'qa_rejected',
      ).error,
      'Synthetic reason',
    );
    await controller.submit(owner, channel, first.id);
    await assert.rejects(controller.submit(owner, channel, first.id), /already submitted/);
    await assert.rejects(controller.archive(owner, channel, first.id, { revision: 3 }), /changed/);
    assert.equal(calls.filter((call) => call.url.includes('/message_templates')).length, 2);
    await assert.rejects(
      controller.uploadMedia(owner, channel, 'IMAGE', {
        originalname: 'fake.png',
        mimetype: 'image/png',
        buffer: Buffer.from('fake'),
      }),
      /Invalid template media/,
    );
    assert.deepEqual(
      await controller.uploadMedia(owner, channel, 'DOCUMENT', {
        originalname: 'synthetic.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7\n'),
      }),
      { h: '2:synthetic-media-reference' },
    );
    assert.equal(new Headers(calls.at(-1)?.headers).get('file_offset'), '0');
  } finally {
    await pg.close();
  }
});
