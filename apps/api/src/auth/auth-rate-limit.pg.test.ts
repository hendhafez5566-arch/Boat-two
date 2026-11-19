import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('auth abuse counters are atomic, bounded, expiring and private to the definer', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE ROLE app_user NOLOGIN; GRANT USAGE ON SCHEMA public TO app_user');
    await pg.exec(readFileSync('src/database/migrations/108_auth_rate_limits.sql','utf8'));
    const key = 'a'.repeat(64), other = 'b'.repeat(64);
    await pg.exec('SET ROLE app_user');
    const calls = await Promise.all(Array.from({length:30}, () =>
      pg.query<{allowed:boolean}>('SELECT auth_consume_rate_limit($1,15,300) AS allowed',[key])));
    assert.equal(calls.filter(r=>r.rows[0].allowed).length,15);
    assert.equal((await pg.query<{allowed:boolean}>('SELECT auth_consume_rate_limit($1,15,300) AS allowed',[other])).rows[0].allowed,true);
    await assert.rejects(pg.query('SELECT * FROM auth_rate_limits'), /permission denied/);
    await assert.rejects(pg.query("SELECT auth_consume_rate_limit('bad',15,300)"), /Invalid abuse/);
    await pg.exec('RESET ROLE');
    assert.equal((await pg.query<{hits:number}>('SELECT hits FROM auth_rate_limits WHERE key_hash=$1',[key])).rows[0].hits,16);
    await pg.query("UPDATE auth_rate_limits SET expires_at=now()-interval '1 second' WHERE key_hash=$1",[key]);
    await pg.exec('SET ROLE app_user');
    assert.equal((await pg.query<{allowed:boolean}>('SELECT auth_consume_rate_limit($1,15,300) AS allowed',[key])).rows[0].allowed,true);
  } finally { await pg.close(); }
});
