import { URLSearchParams } from 'node:url';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const log = openSync('/tmp/boat-crm-v2-api.log', 'w');
const server = spawn(process.execPath, ['scripts/qa-full-api.mjs'], {
  stdio: ['ignore', log, log],
  env: { ...process.env, BOAT_CLOUD_REVIEW: 'true', BOAT_CRM_QA: 'true' },
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
    const s = await request('/auth/register', null, {
      email: randomUUID() + '@example.test',
      password: 'Synthetic-' + randomUUID(),
      fullName: 'V2 ' + business,
      workspaceName: 'V2 ' + business,
    });
    const token = s.accessToken;
    assert.ok(token);
    sessions.push(s);
    const c = await request('/crm/contacts', token, {
      name: business + ' Customer',
      email: randomUUID() + '@example.test',
      phone: '+201' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
      lifecycle: 'qualified',
      tags: ['interested'],
      attributes: { source: 'Website' },
    });
    const p = await request('/crm/pipelines', token, {
      name: 'Sales',
      stages: ['New', 'Qualified', 'Proposal'],
    });
    const offer = await request('/crm/deals', token, {
      contactId: c.id,
      pipelineId: p.id,
      title: 'Offer EGP',
      stage: 'New',
      valueCents: 125000,
      currency: 'EGP',
    });
    await request('/crm/deals', token, {
      contactId: c.id,
      pipelineId: p.id,
      title: 'Offer USD',
      stage: 'New',
      valueCents: 50000,
      currency: 'USD',
    });
    const task = await request('/crm/tasks', token, {
      contactId: c.id,
      title: 'Follow up',
      dueAt: new Date(Date.now() - 3600000).toISOString(),
      priority: 'high',
    });
    assert.equal(task.priority, 'high');
    await request(
      '/crm/tasks/' + task.id,
      token,
      { priority: 'low', expectedUpdatedAt: task.updated_at },
      'PATCH',
    );
    await request(
      '/crm/tasks/' + task.id,
      token,
      { title: 'stale write', expectedUpdatedAt: task.updated_at },
      'PATCH',
      400,
    );
    count++;
    const linked = await request('/crm/tasks/' + task.id, token, { dealId: offer.id }, 'PATCH');
    assert.equal(linked.deal_id, offer.id);
    await request('/crm/tasks/' + task.id, token, { dealId: randomUUID() }, 'PATCH', 400);
    assert.equal(
      (await request('/crm/tasks/' + task.id, token, { dealId: null }, 'PATCH')).deal_id,
      null,
    );
    count += 3;

    await request(
      '/crm/tasks',
      token,
      {
        contactId: c.id,
        title: 'Invalid priority',
        dueAt: new Date().toISOString(),
        priority: 'urgent',
      },
      'POST',
      400,
    );
    count++;
    const a = await request('/crm/workspace/analytics', token);
    assert.equal(a.contacts.total, 1);
    assert.equal(a.contacts.qualified, 1);
    assert.equal(a.sales.length, 2);
    assert.equal(a.sales.find((x) => x.currency === 'EGP').value_cents, '125000');
    assert.equal(a.followups.overdue, 1);
    assert.equal(a.contacts.unattended, 0);
    assert.equal(
      a.growth.reduce((sum, x) => sum + x.count, 0),
      1,
    );
    count++;
    const score = await request('/crm/workspace/score/' + c.id, token);
    assert.equal(score.score, 100);
    assert.equal(score.reasons.length, 5);
    count++;
    const expectedRules = (await request('/crm/workspace/scoring', token)).rules;
    const newRules = {
      qualified: 5,
      email: 0,
      phone: 0,
      openDeal: 0,
      interestTag: 'interested',
      tag: 0,
    };
    await request('/crm/workspace/scoring', token, { rules: newRules, expected: expectedRules });
    await request(
      '/crm/workspace/scoring',
      token,
      { rules: newRules, expected: expectedRules },
      'POST',
      409,
    );
    count++;

    assert.equal((await request('/crm/workspace/score/' + c.id, token)).score, 5);
    count++;
    const q = new URLSearchParams({ createdFrom: a.startAt, createdTo: a.endAt });
    assert.equal((await request('/crm/contacts?' + q, token)).total, 1);
    assert.equal((await request('/crm/contacts?withoutFollowup=true', token)).total, 0);
    assert.equal((await request('/crm/contacts?hasOpenDeal=true', token)).total, 1);
    count++;
    await request(
      '/crm/workspace/analytics?from=2026-02-30&to=2026-03-01',
      token,
      null,
      'GET',
      400,
    );
    await request(
      '/crm/workspace/analytics?from=2020-01-01&to=2026-01-01',
      token,
      null,
      'GET',
      400,
    );
    count++;
    const firstDeal = (await request('/crm/deals', token)).items[0];
    const moved = await request(
      '/crm/deals/' + firstDeal.id,
      token,
      { stage: 'Qualified', expectedUpdatedAt: firstDeal.updated_at },
      'PATCH',
    );
    await request(
      '/crm/deals/' + firstDeal.id,
      token,
      { stage: 'Qualified', expectedUpdatedAt: moved.updated_at },
      'PATCH',
    );
    const stageHistory = (await request('/crm/contacts/' + c.id + '/profile', token)).timeline
      .stageChanges;
    assert.equal(stageHistory.length, 1);
    assert.equal(stageHistory[0].details.to, 'Qualified');
    count++;
    const historical = await request(
      '/crm/workspace/analytics?from=2000-01-01&to=2000-01-02',
      token,
    );
    assert.equal(historical.sales.length, 0);
    assert.equal(historical.contacts.new, 0);
    count++;
    const invite = await request('/team/invitations', token, {
      email: randomUUID() + '@example.test',
      role: 'agent',
      sendEmail: false,
    });
    const agent = await request('/auth/accept-invitation', null, {
      token: new URL(invite.inviteUrl).searchParams.get('token'),
      password: 'Synthetic-' + randomUUID(),
      fullName: business + ' Agent',
    });
    const own = await request('/crm/workspace/analytics?ownerId=' + c.id, agent.accessToken);
    assert.equal(own.scope, 'mine');
    assert.equal(own.contacts.total, 0);
    assert.equal(own.sales.length, 0);
    assert.equal(own.employees.length, 1);
    await request(
      '/crm/workspace/scoring',
      agent.accessToken,
      { qualified: 99, email: 0, phone: 0, openDeal: 0, interestTag: '', tag: 0 },
      'POST',
      403,
    );
    count++;
    await request('/crm/tasks/' + task.id, agent.accessToken, { title: 'forbidden' }, 'PATCH', 403);
    count++;
    await request(
      '/workspace',
      token,
      {
        name: 'V2 ' + business,
        industry: business,
        timezone: 'America/New_York',
        language: 'en',
        preferredPlan: 'pro',
      },
      'PATCH',
    );
    const dst = await request('/crm/workspace/analytics?from=2026-11-01&to=2026-11-01', token);
    assert.equal((Date.parse(dst.endAt) - Date.parse(dst.startAt)) / 3600000, 25);
    count++;
    const channel = await request('/channels', token, { type: 'web', name: 'Isolated reply QA' });
    const visitor = await request('/widget/' + channel.external_id + '/session', null, {});
    const inbound = async () => {
      const sent = await fetch(
        'http://127.0.0.1:4000/widget/' +
          channel.external_id +
          '/messages?visitorId=' +
          visitor.visitorId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
          body: JSON.stringify({ text: 'Synthetic reply filter QA', clientMsgId: randomUUID() }),
        },
      );
      assert.ok(sent.ok, await sent.text());
    };
    await inbound();
    const cv = (await request('/conversations', token)).items[0];
    await request('/conversations/' + cv.id + '/takeover', token, {});
    assert.equal((await request('/conversations?needsReply=true', token)).items.length, 1);
    assert.equal((await request('/crm/workspace/analytics', token)).conversations.needs_reply, 1);
    await request('/conversations/' + cv.id + '/messages', token, {
      text: 'Synthetic staff reply',
    });
    assert.equal((await request('/conversations?needsReply=true', token)).items.length, 0);
    assert.equal((await request('/crm/workspace/analytics', token)).conversations.needs_reply, 0);
    count++;
    const unrelated = await request('/crm/contacts', token, { name: 'Other customer' });
    const unrelatedOffer = await request('/crm/deals', token, {
      contactId: unrelated.id,
      pipelineId: p.id,
      title: 'Unrelated offer',
      stage: 'New',
      valueCents: 0,
      currency: 'EGP',
    });
    await request('/crm/tasks/' + task.id, token, { dealId: unrelatedOffer.id }, 'PATCH', 400);
    await request('/crm/tasks/' + task.id, agent.accessToken, { dealId: offer.id }, 'PATCH', 403);
    count += 2;
    const staffUserId = (await request('/crm/workspace/members', agent.accessToken)).currentUserId;
    const current = await request(
      '/crm/deals/' + offer.id,
      token,
      {
        status: 'lost',
        lossReason: 'Synthetic price objection',
        valueCents: 32100,
        currency: 'USD',
        ownerId: staffUserId,
        expectedClose: '2030-04-12',
      },
      'PATCH',
    );
    assert.equal(current.loss_reason, 'Synthetic price objection');
    assert.equal(current.currency, 'USD');
    assert.equal(Number(current.value_cents), 32100);
    assert.equal(current.owner_id, staffUserId);
    assert.equal(current.expected_close.slice(0, 10), '2030-04-12');
    assert.equal(
      (await request('/crm/deals/' + offer.id, token, { status: 'open' }, 'PATCH')).status,
      'open',
    );
    assert.equal(
      (await request('/crm/deals/' + offer.id, token, { status: 'won' }, 'PATCH')).status,
      'won',
    );
    const report = await request('/crm/workspace/analytics', token);
    for (const group of report.sales) {
      const filtered = await request(
        '/crm/deals?' +
          new URLSearchParams({
            currency: group.currency,
            status: group.status,
            updatedFrom: report.startAt,
            updatedTo: report.endAt,
          }),
        token,
      );
      assert.equal(filtered.total, group.count);
      assert.equal(
        filtered.items.reduce((sum, deal) => sum + Number(deal.value_cents), 0),
        Number(group.value_cents),
      );
    }
    count++;
    const originalDeals = (await request('/crm/deals?pipelineId=' + p.id, token)).items;
    await request(
      '/crm/pipelines/' + p.id,
      token,
      { name: 'Sales', stages: ['Qualified', 'Proposal'] },
      'PATCH',
      400,
    );
    assert.deepEqual((await request('/crm/deals?pipelineId=' + p.id, token)).items, originalDeals);
    await request(
      '/crm/pipelines/' + p.id,
      token,
      {
        name: 'Sales',
        stages: ['Qualified', 'Proposal'],
        replacements: { New: 'Proposal' },
      },
      'PATCH',
    );
    const migrated = (await request('/crm/deals?pipelineId=' + p.id, token)).items;
    assert.equal(migrated.length, originalDeals.length);
    for (const deal of originalDeals) {
      const moved = migrated.find((item) => item.id === deal.id);
      const { updated_at: previousUpdate, ...previous } = deal;
      const { updated_at: nextUpdate, ...after } = moved;
      assert.ok(Date.parse(nextUpdate) >= Date.parse(previousUpdate));
      assert.deepEqual(after, {
        ...previous,
        stage: deal.stage === 'New' ? 'Proposal' : deal.stage,
        pipeline_stages: ['Qualified', 'Proposal'],
      });
    }
    count += 5;
    await request('/crm/contacts/' + unrelated.id + '/notes', token, {
      text: 'Synthetic merge note',
    });
    const merge = await request(
      '/crm/contacts/' + c.id + '/merge-preview?sourceId=' + unrelated.id,
      token,
    );
    assert.equal(merge.canMerge, true);
    await request(
      '/crm/contacts/' + c.id + '/merge',
      agent.accessToken,
      {
        sourceId: unrelated.id,
        evidence: 'Synthetic matches reviewed',
      },
      'POST',
      403,
    );
    await request('/crm/contacts/' + c.id + '/merge', token, {
      sourceId: unrelated.id,
      evidence: 'Synthetic matches reviewed',
    });
    const mergedProfile = await request('/crm/contacts/' + c.id + '/profile', token);
    assert.ok(mergedProfile.timeline.notes.some((note) => note.body === 'Synthetic merge note'));
    assert.ok(
      (await request('/crm/deals?pipelineId=' + p.id, token)).items.some(
        (deal) => deal.id === unrelatedOffer.id && deal.contact_id === c.id,
      ),
    );
    count += 4;
    if (business === 'Travel') {
      const adminInvite = await request('/team/invitations', token, {
        email: randomUUID() + '@example.test',
        role: 'admin',
        sendEmail: false,
      });
      const admin = await request('/auth/accept-invitation', null, {
        token: new URL(adminInvite.inviteUrl).searchParams.get('token'),
        password: 'Synthetic-' + randomUUID(),
        fullName: 'CRM concurrent-edit administrator',
      });
      const profilePath = '/crm/contacts/' + c.id + '/profile';
      const snapshot = (await request(profilePath, admin.accessToken)).contact.updated_at;
      await request(profilePath, token, { name: 'First saved edit', expectedUpdatedAt: snapshot }, 'PATCH');
      await request(profilePath, admin.accessToken, {
        name: 'Stale administrator edit',
        expectedUpdatedAt: snapshot,
      }, 'PATCH', 409);
      assert.equal((await request(profilePath, token)).contact.name, 'First saved edit');
      const archivePath = '/crm/contacts/' + c.id + '/archive';
      await request(archivePath, agent.accessToken, { archived: true }, 'PATCH', 403);
      await request(archivePath, admin.accessToken, { archived: true }, 'PATCH');
      assert.ok((await request(profilePath, token)).contact.archived_at);
      await request(archivePath, agent.accessToken, { archived: false }, 'PATCH', 403);
      await request(archivePath, token, { archived: false }, 'PATCH');
      assert.equal((await request(profilePath, token)).contact.archived_at, null);
      count += 2;
      const me = await request('/auth/me', token);
      const tenantId = me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
      await request('/__qa/crm', null, { tenantId, op: 'seed' });
      await request('/__qa/crm', null, {
        tenantId,
        op: 'work-volume',
        pipelineId: p.id,
        contactId: c.id,
        staffId: staffUserId,
      });
      const customers = await request('/crm/contacts?q=Load%20customer&sort=name&limit=50&page=2', token);
      assert.equal(customers.total, 3000);
      assert.equal(customers.items.length, 50);
      const tasks = await request('/crm/tasks?q=Follow-up%20volume&limit=50&page=5', agent.accessToken);
      assert.equal(tasks.total, 212);
      assert.equal(tasks.items.length, 12);
      assert.ok(tasks.items.every((task, i, rows) => i === 0 || task.due_at >= rows[i - 1].due_at));
      const scope = '/crm/deals?pipelineId=' + p.id + '&q=Kanban%20volume&limit=50&stageSummary=true';
      const firstPage = await request(scope, token);
      const lastPage = await request(scope + '&page=5', token);
      const grouped = [
        { stage: 'Proposal', currency: 'EGP', count: 106, value_cents: '10600' },
        { stage: 'Proposal', currency: 'USD', count: 106, value_cents: '21200' },
      ];
      assert.equal(firstPage.total, 212);
      assert.equal(firstPage.items.length, 50);
      assert.equal(lastPage.items.length, 12);
      assert.equal(new Set([...firstPage.items, ...lastPage.items].map((deal) => deal.id)).size, 62);
      assert.deepEqual(firstPage.stageSummary, grouped);
      assert.deepEqual(lastPage.stageSummary, grouped);
      assert.deepEqual((await request(scope + '&currency=USD', token)).stageSummary, [grouped[1]]);
      assert.deepEqual((await request(scope, agent.accessToken)).stageSummary, [grouped[0]]);
      count += 4;
    }
    for (const other of sessions.slice(0, -1))
      await request('/crm/workspace/score/' + c.id, other.accessToken, null, 'GET', 404);
    count++;
  }
  mkdirSync('docs/acceptance/2026-11-01-crm-v2', { recursive: true });
  writeFileSync(
    'docs/acceptance/2026-11-01-crm-v2/api-results.json',
    JSON.stringify(
      {
        passed: count,
        tenants: 3,
        database: '101 real migrations on isolated PGlite with RLS; no owner database',
        tests: [
          'currency separation/no join inflation',
          'Kanban totals across pages, currencies and agent scope',
          'score rules and configurable recalculation',
          'date and range rejection',
          'period cohort and date drilldown',
          'agent scope cannot widen',
          'admin write authorization',
          'cross tenant identity denial',
        ],
      },
      null,
      2,
    ),
  );
  console.log('CRM_V2_API_PASS', count);
} finally {
  server.kill('SIGTERM');
}
