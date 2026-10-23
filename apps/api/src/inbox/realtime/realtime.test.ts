import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service';
import { RealtimeController } from './realtime.controller';
test('an active realtime stream stops replay immediately after its session is revoked', async () => {
  let allowed = true,
    received = 0;
  const db = {
    withTenant: async (
      _tenant: string,
      fn: (c: {
        query: (sql: string) => Promise<{ rows: unknown[]; rowCount: number }>;
      }) => Promise<unknown>,
    ) =>
      fn({
        query: async (sql) => {
          if (sql.includes('FROM memberships')) return { rows: [{}], rowCount: 1 };
          if (sql.includes('refresh_tokens'))
            return { rows: allowed ? [{}] : [], rowCount: allowed ? 1 : 0 };
          return {
            rows: [{ id: '1', payload: { type: 'message', text: 'Local fixture' } }],
            rowCount: 1,
          };
        },
      }),
  } as unknown as DatabaseService;
  const jwt = {
    verify: () => ({
      sub: 'fixture-user',
      tid: 'fixture-tenant',
      purpose: 'sse',
      sid: 'fixture-session',
      sv: 0,
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  } as unknown as JwtService;
  const controller = new RealtimeController(jwt, db);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Revoked realtime session did not close')),
      2500,
    );
    controller.stream('fixture-ticket', '0').subscribe({
      next: () => {
        received++;
        allowed = false;
      },
      error: (error) => {
        clearTimeout(timer);
        try {
          assert.match(error.message, /session revoked/);
          assert.equal(received, 1);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    });
  });
});
