import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { contactWhere, filtersSchema } from './schemas';

test('campaign inclusion is any selected value; exclusions override inclusion without changing consent', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE contacts(id uuid PRIMARY KEY,name text,email text,phone text,lifecycle text,tags text[],owner_id uuid,merged_into_id uuid,archived_at timestamptz);
      CREATE TABLE contact_list_members(contact_id uuid,list_id uuid);
      INSERT INTO contacts(id,name,tags) VALUES
      ('00000000-0000-4000-8000-000000000001','A',ARRAY['vip']),
      ('00000000-0000-4000-8000-000000000002','B',ARRAY['lead','blocked']),
      ('00000000-0000-4000-8000-000000000003','C',ARRAY['lead']),
      ('00000000-0000-4000-8000-000000000004','D',NULL);
      INSERT INTO contact_list_members VALUES
      ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
      ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002');`);
    const names = async (filters: unknown) => {
      const w = contactWhere(filtersSchema.parse(filters));
      const result = await pg.query<{ name: string }>(
        `SELECT name FROM contacts WHERE ${w.sql} ORDER BY name`,
        w.params,
      );
      return result.rows.map((row) => row.name);
    };
    assert.deepEqual(await names({ includeTags: ['vip', 'lead'], excludeTags: ['blocked'] }), [
      'A',
      'C',
    ]);
    assert.deepEqual(await names({ excludeTags: ['blocked'] }), ['A', 'C', 'D']);
    const a = '10000000-0000-4000-8000-000000000001',
      b = '10000000-0000-4000-8000-000000000002';
    assert.deepEqual(await names({ includeListIds: [a, b], excludeListIds: [b] }), ['A']);
    assert.deepEqual(
      await names({ includeTags: ['lead'], includeListIds: [a, b], excludeTags: ['blocked'] }),
      ['C'],
    );
    assert.deepEqual(await names({ includeListIds: [a], excludeListIds: [a] }), []);
    assert.deepEqual(await names({ includeTags: [], excludeListIds: [] }), ['A', 'B', 'C', 'D']);
    assert.deepEqual(await names({ includeTags: ["vip'); DROP TABLE contacts;--"] }), []);
    assert.equal(filtersSchema.safeParse({ includeListIds: ['invalid'] }).success, false);
    assert.equal(filtersSchema.safeParse({ excludeTags: Array(31).fill('vip') }).success, false);
  } finally {
    await pg.close();
  }
});
