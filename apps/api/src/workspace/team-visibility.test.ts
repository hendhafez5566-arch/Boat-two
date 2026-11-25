import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthedRequest } from '../common/types';
import { WorkspaceController } from './workspace.controller';

test('the team roster remains usable for assignment while pending invites stay with managers', async () => {
  const roster = [{ user_id: 'staff', full_name: 'Demo Staff' }];
  const invitations = [{ email: 'invite@example.test', role: 'agent' }];
  for (const role of ['owner', 'admin', 'agent'] as const) {
    const queries: string[] = [];
    const db = {
      withTenant: async (tenantId: string, execute: (client: unknown) => Promise<unknown>) => {
        assert.equal(tenantId, 'demo-tenant');
        return execute({
          query: async (sql: string) => {
            queries.push(sql);
            return { rows: sql.includes('FROM memberships') ? roster : invitations };
          },
        });
      },
    };
    const controller = new WorkspaceController(db as never, {} as never, {} as never);
    const result = await controller.team({
      user: { tenantId: 'demo-tenant', role },
    } as AuthedRequest);
    assert.deepEqual(result.members, roster);
    assert.deepEqual(result.pendingInvitations, role === 'agent' ? [] : invitations);
    assert.equal(queries.length, role === 'agent' ? 1 : 2);
  }
});
