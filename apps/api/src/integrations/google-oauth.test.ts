/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
test('Google OAuth mock: read-only catalog scopes, one-use state, encrypted credentials and scoped reads', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    GOOGLE_CLIENT_ID: 'fixture-client',
    GOOGLE_CLIENT_SECRET: 'fixture-secret',
    EXTERNAL_DELIVERY_ENABLED: 'true',
  });
  const { GoogleService } = await import('./google.service');
  const { CryptoService } = await import('../messaging/crypto.service');
  const crypto = new CryptoService();
  let state: any, connection: any;
  let requests = 0,
    authorized = true;
  const c: any = {
    query: async (sql: string, args: any[] = []) => {
      if (sql.startsWith('INSERT INTO integration_oauth_states')) {
        state = {
          id: 'state',
          user_id: args[1],
          state_hash: args[2],
          scopes: args[3],
          expires_at: new Date(Date.now() + 60000),
          consumed: false,
        };
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('SELECT * FROM integration_oauth_states')) return { rows: [state] };
      if (sql.includes('FROM memberships')) return { rows: [], rowCount: authorized ? 1 : 0 };
      if (sql.startsWith('UPDATE integration_oauth_states')) {
        state.consumed = true;
        return { rows: [] };
      }
      if (sql.startsWith('INSERT INTO integration_connections')) {
        connection = { credentials_enc: args[1], config: JSON.parse(args[2]) };
        return { rows: [] };
      }
      if (sql.includes('FROM integration_connections'))
        return { rows: connection ? [connection] : [] };
      if (sql.startsWith('UPDATE integration_connections')) return { rows: [] };
      throw Error('Unexpected mock SQL');
    },
  };
  const db: any = {
    withTenant: async (_tenant: string, fn: any) => fn(c),
    query: async (_sql: string, args: any[]) => ({
      rows:
        state && !state.consumed && state.state_hash === args[0]
          ? [{ id: 'state', tenant_id: 'tenant' }]
          : [],
    }),
  };
  const google = new GoogleService(db, crypto, {} as any);
  const original = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any) => {
    requests++;
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(init.method, 'POST');
      return new Response(
        JSON.stringify({
          access_token: 'fixture-access',
          refresh_token: 'fixture-refresh',
          expires_in: 3600,
          scope: state.scopes.join(' '),
        }),
        { status: 200 },
      );
    }
    assert.match(url, /^https:\/\/(sheets|www)\.googleapis\.com\//);
    assert.equal(init.headers.Authorization, 'Bearer fixture-access');
    return new Response(
      JSON.stringify({
        values: [
          ['key', 'name'],
          ['1', 'Item'],
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const start = await google.start('tenant', 'owner', ['sheets_read']);
    const url = new URL(start.authorizeUrl),
      nonce = url.searchParams.get('state')!;
    assert.equal(createHash('sha256').update(nonce).digest('hex'), state.state_hash);
    const scopes = url.searchParams.get('scope')!.split(' ');
    assert.ok(scopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly'));
    assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.metadata.readonly'));
    assert.ok(!scopes.includes('https://www.googleapis.com/auth/spreadsheets'));
    await google.complete(nonce, 'fixture-code');
    assert.match(connection.credentials_enc, /^v1:/);
    assert.ok(!connection.credentials_enc.includes('fixture-access'));
    assert.equal(crypto.decrypt<any>(connection.credentials_enc).refresh_token, 'fixture-refresh');
    await assert.rejects(() => google.complete(nonce, 'again'), /expired or consumed/);
    assert.equal(requests, 1);
    const read: any = await google.execute('tenant', 'connection', {
      operation: 'sheet_read',
      spreadsheetId: 'abcdefghij1234',
      range: 'Products',
    });
    assert.equal(read.data.values[1][1], 'Item');
    await assert.rejects(
      () =>
        google.execute('tenant', 'connection', {
          operation: 'sheet_append',
          spreadsheetId: 'abcdefghij1234',
          range: 'Products',
          values: [['do not write']],
        }),
      /required purpose/,
    );
    assert.equal(requests, 2);
    await google.start('tenant', 'owner', ['sheets_read']);
    authorized = false;
    await assert.rejects(
      async () =>
        google.complete(
          new URL(
            (await google.start('tenant', 'owner', ['sheets_read'])).authorizeUrl,
          ).searchParams.get('state')!,
          'code',
        ),
      /no longer authorized/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
