import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { accountProfileSchema, saveAccountProfile } from './account-profile';

test('profile writes only the authenticated user and leaves credentials and memberships untouched', async () => {
  const pg = new PGlite();
  const actor = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text,full_name text,password_hash text,disabled_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE memberships(user_id uuid,role text);`);
    await pg.query(
      "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'actor@example.test','Before','hash-a'),($2,'other@example.test','Other','hash-b')",
      [actor, other],
    );
    await pg.query("INSERT INTO memberships VALUES($1,'agent'),($2,'owner')", [actor, other]);
    const migration = readFileSync('src/database/migrations/094_account_profile.sql', 'utf8');
    await pg.exec(migration);
    const input = accountProfileSchema.parse({
      fullName: ' Updated ',
      phone: '+20 123456789',
      address: ' Test ',
      timezone: 'Africa/Cairo',
      language: 'en',
    });
    const result = (await saveAccountProfile(pg, actor, input)) as {
      full_name: string;
      account_profile: { address: string };
    };
    assert.equal(result.full_name, 'Updated');
    assert.equal(result.account_profile.address, 'Test');
    await pg.exec(migration);
    const rows = (
      await pg.query<{
        id: string;
        full_name: string;
        password_hash: string;
        account_profile: unknown;
      }>('SELECT * FROM users ORDER BY id')
    ).rows;
    assert.equal(rows[0].password_hash, 'hash-a');
    assert.equal(rows[1].full_name, 'Other');
    assert.deepEqual(rows[1].account_profile, {});
    assert.deepEqual((await pg.query('SELECT role FROM memberships ORDER BY user_id')).rows, [
      { role: 'agent' },
      { role: 'owner' },
    ]);
    for (const extra of [
      { userId: other },
      { email: 'replace@example.test' },
      { role: 'owner' },
      { password: 'replacement' },
    ])
      assert.equal(accountProfileSchema.safeParse({ ...input, ...extra }).success, false);
    for (const invalid of [
      { fullName: ' ' },
      { timezone: 'Not/AZone' },
      { language: 'xx' },
      { phone: 'javascript:alert(1)' },
      { address: 'x'.repeat(1001) },
    ])
      assert.equal(accountProfileSchema.safeParse({ ...input, ...invalid }).success, false);
    await pg.query('UPDATE users SET disabled_at=now() WHERE id=$1', [actor]);
    assert.equal(await saveAccountProfile(pg, actor, input), undefined);
  } finally {
    await pg.close();
  }
});
