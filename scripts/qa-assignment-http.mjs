import { assertLocalAcceptance } from './acceptance-local.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, writeFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
const log = openSync('/tmp/boat-assignment-http-server.log', 'w');
const existingApi = process.env.BOAT_QA_EXISTING_API === 'true';
if (existingApi) assertLocalAcceptance();
const server = existingApi
  ? null
  : spawn(process.execPath, ['scripts/qa-full-api.mjs'], {
      stdio: ['ignore', log, log],
      env: { ...process.env, BOAT_CLOUD_REVIEW: 'true' },
    });
const checks = [];
async function req(path, token, body, method = body ? 'POST' : 'GET', status = 200) {
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
    r.status === status || (status === 200 && r.status === 201),
    path + ' ' + r.status + ' ' + JSON.stringify(data),
  );
  return data;
}
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4000/health')).ok) break;
    } catch { /* Wait for the isolated server to become ready. */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  const owner = await req('/auth/register', null, {
      email: uuid() + '@example.test',
      password: 'QA-' + uuid(),
      fullName: 'Assignment Owner',
      workspaceName: 'Assignment HTTP QA',
    }),
    token = owner.accessToken;
  const members = [];
  for (const name of ['Visa A', 'Visa B', 'Flights', 'Umrah']) {
    const inv = await req('/team/invitations', token, {
      email: uuid() + '@example.test',
      role: 'agent',
      sendEmail: false,
    });
    const session = await req('/auth/accept-invitation', null, {
      token: new URL(inv.inviteUrl).searchParams.get('token'),
      password: 'QA-' + uuid(),
      fullName: name,
    });
    const me = await req('/crm/workspace/members', session.accessToken);
    members.push({ ...session, id: me.currentUserId });
    await req('/team/me/availability', session.accessToken, { available: true }, 'PATCH');
  }
  const channel = await req('/channels', token, { type: 'web', name: 'HTTP QA only' });
  const dept = [];
  for (const [index, name] of ['Visa', 'Flights', 'Umrah'].entries())
    dept.push(
      await req('/departments', token, {
        name,
        slaMinutes: 30,
        members: index === 0 ? members.slice(0, 2).map((x) => x.id) : [members[index + 1].id],
      }),
    );
  const state = await req('/crm/sales/settings', token);
  assert.equal((await req('/crm/sales/assignment-test', token, {})).reason, 'policy_disabled');
  checks.push('disabled saved policy cannot pretend to select staff');
  const assignment = {
    enabled: true,
    method: 'rules',
    maxOpenPerAgent: 1,
    memberIds: [],
    rules: [
      {
        channelId: channel.id,
        departmentId: dept[0].id,
        tag: 'visa',
        fieldKey: 'service',
        fieldValue: 'visa',
        memberIds: members.slice(0, 2).map((x) => x.id),
      },
    ],
  };
  await req('/crm/sales/settings', token, { ...state, assignment, expected: state });
  const scenario = {
    channelId: channel.id,
    departmentId: dept[0].id,
    tags: ['visa'],
    attributes: { service: 'visa' },
  };
  const before = JSON.stringify(await req('/crm/sales/settings', token));
  const result = await req('/crm/sales/assignment-test', token, scenario);
  assert.ok(members.slice(0, 2).some((m) => m.id === result.employee));
  assert.equal(result.ruleIndex, 0);
  assert.equal(result.reason, 'matching_rule_least_loaded');
  assert.equal(JSON.stringify(await req('/crm/sales/settings', token)), before);
  checks.push(
    'real HTTP dry-run passes channel department tags and bot answer without writing settings',
  );
  assert.equal(
    (
      await req('/crm/sales/assignment-test', token, {
        ...scenario,
        attributes: { service: 'flight' },
      })
    ).reason,
    'no_matching_rule',
  );
  checks.push('changed service cannot match visa rule');
  await req('/crm/sales/assignment-test', members[0].accessToken, scenario, 'POST', 403);
  await req('/crm/sales/assignment-queue', members[0].accessToken, null, 'GET', 403);
  await req('/conversations/' + uuid() + '/auto-assign', members[0].accessToken, {}, 'POST', 403);
  checks.push('agent cannot test manager policy read manager queue or force assignment');
  const other = await req('/auth/register', null, {
    email: uuid() + '@example.test',
    password: 'QA-' + uuid(),
    fullName: 'Other Owner',
    workspaceName: 'Other Company',
  });
  let os = await req('/crm/sales/settings', other.accessToken);
  await req('/crm/sales/settings', other.accessToken, {
    ...os,
    assignment: { enabled: true, method: 'round_robin', memberIds: [], rules: [] },
    expected: os,
  });
  await req('/crm/sales/assignment-test', other.accessToken, scenario, 'POST', 404);
  checks.push('foreign channel department and employee context denied');
  assert.equal((await req('/crm/sales/assignment-queue', token)).total, 0);
  checks.push('empty manager queue is truthful');
  if (process.env.QA_RESUME_HTTP) {
    let current = await req('/crm/sales/settings', token);
    await req('/crm/sales/settings', token, {
      ...current,
      assignment: {
        enabled: true,
        method: 'round_robin',
        memberIds: [members[0].id],
        rules: [],
        maxOpenPerAgent: 1,
      },
      expected: current,
    });
    await req('/team/me/availability', members[0].accessToken, { available: false }, 'PATCH');
    const visitors = await Promise.all(
      Array.from({ length: 3 }, () => req('/widget/' + channel.external_id + '/session', null, {})),
    );
    for (const v of visitors) {
      const response = await fetch(
        'http://127.0.0.1:4000/widget/' +
          channel.external_id +
          '/messages?visitorId=' +
          v.visitorId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-visitor-token': v.token },
          body: JSON.stringify({ clientMsgId: uuid(), text: 'Synthetic waiting QA' }),
        },
      );
      assert.equal(response.status, 201);
    }
    const rows = (await req('/conversations?limit=100', token)).items;
    for (const cv of rows)
      await req('/conversations/' + cv.id + '/auto-assign', token, {}, 'POST', 400);
    const waiting = await req('/crm/sales/assignment-queue', token);
    assert.equal(waiting.total, 3);
    const oldest = waiting.items[0];
    await req('/conversations/' + oldest.id, token, { handledBy: 'human' }, 'PATCH');
    const resumed = await req(
      '/team/me/availability',
      members[0].accessToken,
      { available: true },
      'PATCH',
    );
    assert.equal(resumed.available, true);
    assert.equal(resumed.reassigned, 1);
    assert.equal((await req('/crm/sales/assignment-queue', token)).total, 2);
    checks.push(
      'HTTP availability return automatically assigns oldest queued conversation up to capacity',
    );
    const detail = await req('/conversations/' + oldest.id, token);
    assert.equal(detail.handled_by, 'human');
    assert.equal(detail.assigned_to, members[0].id);
    checks.push('HTTP automatic resume preserves human handoff');
    assert.equal(
      (await req('/team/me/availability', members[0].accessToken, { available: true }, 'PATCH'))
        .reassigned,
      0,
    );
    assert.equal((await req('/crm/sales/assignment-queue', token)).total, 2);
    checks.push(
      'repeated availability return cannot exceed capacity or replace existing assignment',
    );
  }
  writeFileSync(
    process.env.QA_RESUME_HTTP
      ? 'docs/acceptance/2026-11-02-assignment-followup/http.json'
      : 'docs/acceptance/2026-11-02-assignment/http.json',
    JSON.stringify(
      {
        checks,
        passed: checks.length,
        database: existingApi
          ? 'isolated independent PostgreSQL, unprivileged RLS role and production Nest entrypoint'
          : 'isolated PostgreSQL/PGlite full schema RLS and real Nest HTTP guards',
      },
      null,
      2,
    ),
  );
  console.log('ASSIGNMENT_HTTP_PASS', checks.length);
} finally {
  server?.kill('SIGTERM');
}
