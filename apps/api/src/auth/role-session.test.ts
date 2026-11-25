import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { WorkspaceController } from '../workspace/workspace.controller';
import type { Role } from '../common/types';

test('team administration follows the current membership and requires an active session', async () => {
  const jwt = new JwtService({ secret: 'local-test-key-for-session-checks' });
  const membership = { role: 'owner' as Role };
  let active = true;
  const db = {
    query: async (sql: string) => ({
      rows: sql.includes('FROM users') ? [{ session_version: 0 }] : active ? [{}] : [],
      rowCount: active ? 1 : 0,
    }),
    withTenant: async (id: string, execute: (client: unknown) => Promise<unknown>) => {
      assert.equal(id, 'workspace');
      return execute({
        query: async (sql: string) => ({
          rows: sql.includes('FROM memberships') ? [{ role: membership.role }] : [{}],
        }),
      });
    },
  };
  const guard = new AuthGuard(jwt, new Reflector(), db as never);
  const token = jwt.sign({ sub: 'member', tid: 'workspace', role: 'owner', sid: 'session' });
  function authorize(handler: keyof WorkspaceController, accessToken = token) {
    return guard.canActivate({
      getHandler: () => WorkspaceController.prototype[handler],
      getClass: () => WorkspaceController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${accessToken}` } }),
      }),
    } as unknown as ExecutionContext);
  }

  assert.equal(await authorize('changeRole'), true);
  membership.role = 'admin';
  assert.equal(await authorize('invite'), true);
  await assert.rejects(authorize('changeRole'), /Insufficient role/);
  membership.role = 'agent';
  await assert.rejects(authorize('invite'), /Insufficient role/);
  assert.equal(await authorize('team'), true);
  const expired = jwt.sign({ sub: 'member', tid: 'workspace', role: 'agent' }, { expiresIn: -1 });
  await assert.rejects(authorize('team', expired), /Invalid or expired token/);
  active = false;
  await assert.rejects(authorize('team'), /Session revoked/);
});
