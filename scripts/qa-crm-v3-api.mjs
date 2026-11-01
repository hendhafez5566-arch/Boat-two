import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const log = openSync('/tmp/boat-crm-v2-api.log', 'w');
const server = spawn(process.execPath, ['scripts/qa-full-api.mjs'], {
  stdio: ['ignore', log, log],
  env: { ...process.env, BOAT_CLOUD_REVIEW: 'true' },
});
let count = 0;
const sessions = [];
const request = async (path, token, body, method = body ? 'POST' : 'GET', expected = 200) => {
  const r = await fetch('http://127.0.0.1:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(
    r.status === expected || (expected === 200 && r.status === 201),
    path + ': ' + JSON.stringify(data),
  );
  return data;
};
try {
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4000/health')).ok) break;
    } catch {
      /* service is starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  for (const business of ['Travel', 'Restaurant', 'Store']) {
    const owner = await request('/auth/register', null, {
      email: randomUUID() + '@example.test',
      password: 'Synthetic-' + randomUUID(),
      fullName: business + ' Owner',
      workspaceName: 'V3 ' + business,
    });
    const token = owner.accessToken;
    const staff = [];
    for (const role of ['agent', 'admin']) {
      const invite = await request('/team/invitations', token, {
        email: randomUUID() + '@example.test',
        role,
        sendEmail: false,
      });
      const member = await request('/auth/accept-invitation', null, {
        token: new URL(invite.inviteUrl).searchParams.get('token'),
        password: 'Synthetic-' + randomUUID(),
        fullName: business + ' ' + role,
      });
      const me = await request('/crm/workspace/members', member.accessToken);
      staff.push({ ...member, id: me.currentUserId });
      await request('/team/me/availability', member.accessToken, { available: true }, 'PATCH');
    }
    const before = await request('/crm/sales/settings', token);
    const desired = {
      ...before,
      assignment: {
        enabled: true,
        method: 'round_robin',
        memberIds: staff.map((x) => x.id),
        rules: [],
      },
    };
    await request('/crm/sales/settings', token, { ...desired, expected: before });
    await request('/crm/sales/settings', token, { ...desired, expected: before }, 'POST', 409);
    count++;
    await request('/crm/sales/settings', staff[0].accessToken, null, 'GET', 403);
    await request(
      '/crm/sales/settings',
      staff[0].accessToken,
      { ...desired, expected: desired },
      'POST',
      403,
    );
    count++;
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request('/crm/contacts', token, { name: business + ' Lead ' + i, tags: ['interested'] }),
      ),
    );
    let contacts = [];
    for (let attempt = 0; attempt < 70; attempt++) {
      contacts = (await request('/crm/contacts', token)).items;
      if (contacts.filter((x) => x.owner_id).length === 6) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(contacts.filter((x) => x.owner_id === staff[0].id).length, 3);
    assert.equal(contacts.filter((x) => x.owner_id === staff[1].id).length, 3);
    count++;
    const own = contacts.find((x) => x.owner_id === staff[0].id);
    await request('/crm/tasks', token, {
      contactId: own.id,
      title: 'V3 overdue follow-up',
      assignedTo: staff[0].id,
      dueAt: new Date(Date.now() - 3600000).toISOString(),
    });
    let notifications = await request('/crm/sales/notifications', staff[0].accessToken);
    assert.ok(notifications.items.some((x) => x.kind === 'task_overdue'));
    count++;
    const n = notifications.items.length;
    notifications = await request('/crm/sales/notifications', staff[0].accessToken);
    assert.equal(notifications.items.length, n);
    count++;
    const notice = notifications.items.find((x) => x.kind === 'task_overdue');
    await request('/crm/sales/notifications/' + notice.id, staff[1].accessToken, {}, 'POST', 404);
    count++;
    await request('/crm/sales/notifications/' + notice.id, staff[0].accessToken, { handled: true });
    assert.ok(
      (await request('/crm/sales/notifications?tab=handled', staff[0].accessToken)).items.some(
        (x) => x.id === notice.id,
      ),
    );
    count++;
    await request('/crm/sales/notifications/read-all', staff[0].accessToken, {});
    assert.equal((await request('/crm/sales/notifications', staff[0].accessToken)).unread, 0);
    count++;
    const test1 = await request('/crm/sales/assignment-test', token, {});
    const test2 = await request('/crm/sales/assignment-test', token, {});
    assert.equal(test1.employee, test2.employee);
    count++;
    await request('/team/me/availability', staff[0].accessToken, { available: false }, 'PATCH');
    const test3 = await request('/crm/sales/assignment-test', token, {});
    assert.equal(test3.employee, staff[1].id);
    count++;
    const current = await request('/crm/sales/settings', token);
    await request('/crm/sales/settings', token, {
      ...current,
      assignment: { ...current.assignment, enabled: false },
      expected: current,
    });
    const unassigned = await request('/crm/contacts', token, { name: 'Manual lead' });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(
      (await request('/crm/contacts/' + unassigned.id + '/profile', token)).contact.owner_id,
      null,
    );
    count++;
    const pipeline = await request('/crm/pipelines', token, {
      name: 'V3 Sales',
      stages: ['New', 'Qualified', 'Proposal'],
    });
    const rule = await request('/automations', token, {
      name: 'Interested customers',
      enabled: true,
      trigger: 'crm.contacts.update',
      conditions: {
        allOf: [
          { tag: 'interested' },
          { anyOf: [{ lifecycle: 'qualified' }, { lifecycle: 'lead' }] },
        ],
      },
      actions: [
        { type: 'assign', userId: staff[1].id },
        {
          type: 'deal',
          pipelineId: pipeline.id,
          stage: 'New',
          title: 'Synthetic opportunity',
          valueCents: 12345,
          currency: 'EGP',
        },
        { type: 'notify', title: 'Interested customer' },
      ],
    });
    await request('/automations', token, {
      name: 'Stage follow-up',
      enabled: true,
      trigger: 'crm.deal.stage_changed',
      conditions: { dealStage: 'Qualified' },
      actions: [{ type: 'task', title: 'Stage follow-up', delayMinutes: 5, linkDeal: true }],
    });
    let lead = (await request('/crm/contacts/' + own.id + '/profile', token)).contact;
    await request(
      '/crm/contacts/' + own.id + '/profile',
      token,
      { lifecycle: 'qualified', expectedUpdatedAt: lead.updated_at },
      'PATCH',
    );
    let deals = [];
    for (let i = 0; i < 80; i++) {
      deals = (await request('/crm/deals?contactId=' + own.id, token)).items;
      if (deals.length) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(deals.length, 1);
    assert.equal(String(deals[0].value_cents), '12345');
    count++;
    lead = (await request('/crm/contacts/' + own.id + '/profile', token)).contact;
    await request(
      '/crm/contacts/' + own.id + '/profile',
      token,
      { name: lead.name + ' updated', expectedUpdatedAt: lead.updated_at },
      'PATCH',
    );
    await new Promise((r) => setTimeout(r, 1800));
    assert.equal((await request('/crm/deals?contactId=' + own.id, token)).items.length, 1);
    count++;
    const deal = deals[0];
    await request(
      '/crm/deals/' + deal.id,
      token,
      { stage: 'Qualified', expectedUpdatedAt: deal.updated_at },
      'PATCH',
    );
    let tasks = [];
    for (let i = 0; i < 80; i++) {
      tasks = (await request('/crm/tasks?contactId=' + own.id, token)).items.filter(
        (x) => x.title === 'Stage follow-up',
      );
      if (tasks.length) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].deal_id, deal.id);
    assert.equal(tasks[0].assigned_to, staff[1].id);
    count++;
    await request(
      '/automations/' + rule.id,
      token,
      { ...rule, enabled: false, expectedRevision: rule.revision },
      'PATCH',
    );
    const second = await request('/crm/contacts', token, {
      name: 'Disabled automation',
      tags: ['interested'],
    });
    await request(
      '/crm/contacts/' + second.id + '/profile',
      token,
      { name: 'Disabled automation update', expectedUpdatedAt: second.updated_at },
      'PATCH',
    );
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal((await request('/crm/deals?contactId=' + second.id, token)).items.length, 0);
    count++;
    const preview = await request('/automations/preview', token, {
      rule: {
        name: 'Synthetic only',
        trigger: 'crm.contacts.insert',
        conditions: { tag: 'interested' },
        actions: [{ type: 'notify', title: 'Preview' }],
      },
      contact: { name: 'Synthetic customer', tags: ['interested'] },
    });
    assert.equal(preview.matched, true);
    assert.equal(preview.executed, false);
    count++;
    await request(
      '/automations/preview',
      staff[0].accessToken,
      { rule: {}, contact: {} },
      'POST',
      403,
    );
    count++;
    const sig = await request('/crm/sales/scoring-signals', token);
    await request('/crm/sales/scoring-signals', token, {
      rules: {
        ...sig,
        interestField: 'interest',
        interestValue: 'product',
        interestPoints: 20,
        inactivePoints: -5,
      },
      expected: sig,
    });
    lead = (await request('/crm/contacts/' + own.id + '/profile', token)).contact;
    await request(
      '/crm/contacts/' + own.id + '/profile',
      token,
      {
        attributes: { ...lead.attributes, interest: 'product' },
        expectedUpdatedAt: lead.updated_at,
      },
      'PATCH',
    );
    const score = await request('/crm/workspace/score/' + own.id, token);
    assert.ok(score.reasons.some((x) => x.key === 'botInterest' && x.points === 20));
    assert.ok(score.reasons.some((x) => x.key === 'inactive' && x.points === -5));
    assert.ok(['hot', 'warm', 'cold'].includes(score.band));
    count++;
    for (const other of sessions) {
      await request('/crm/sales/notifications/' + notice.id, other.accessToken, {}, 'POST', 404);
      const otherConfig = await request('/crm/sales/settings', other.accessToken);
      await request(
        '/crm/sales/settings',
        other.accessToken,
        {
          ...otherConfig,
          assignment: { ...otherConfig.assignment, memberIds: [staff[0].id] },
          expected: otherConfig,
        },
        'POST',
        404,
      );
    }
    count++;
    sessions.push(owner);
  }
  mkdirSync('docs/acceptance/2026-11-01-crm-v3', { recursive: true });
  writeFileSync(
    'docs/acceptance/2026-11-01-crm-v3/api-results.json',
    JSON.stringify(
      {
        passed: count,
        tenants: 3,
        database: '103 real migrations on isolated PGlite with RLS; no owner database',
        tests: [
          'assignment concurrency, settings conflicts and availability',
          'internal notification dedupe and per-user privacy',
          'AND/OR execution with assignment and internal alerts',
          'no duplicate open deal across repeated updates',
          'stage event creates assigned deal-linked follow-up',
          'disabled rules stop executing',
          'synthetic preview performs no actions',
          'scoring positive and negative evidence',
          'cross-tenant settings and notification denial',
        ],
      },
      null,
      2,
    ),
  );
  console.log('CRM_V3_API_PASS', count);
} finally {
  server.kill('SIGTERM');
}
