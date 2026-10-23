import { clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js');
const { ExternalEffects } = local('./dist/events/external-effect.js');
const db = new DatabaseService(),
  effects = new ExternalEffects(db);
if (process.argv[2] === 'child') {
  const [, , , tenant, event] = process.argv;
  try {
    await db.eventScope(event, () =>
      effects.execute(tenant, { mock: 'crash-attempt', event }, async () => {
        await db.detached(tenant, (c) =>
          c.query(
            "INSERT INTO audit_logs(tenant_id,action,resource_type,resource_id) VALUES($1,'fixture.mock_provider_attempt','test',$2)",
            [tenant, event],
          ),
        );
        process.send('attempt-recorded');
        await new Promise((resolve) => setTimeout(resolve, 30000));
        return { accepted: true };
      }),
    );
  } finally {
    await db.onModuleDestroy();
  }
} else {
  let child;
  try {
    const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
    const r = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `crash-${randomUUID()}@example.test`,
        password: randomUUID() + randomUUID(),
        fullName: 'Crash fixture',
        workspaceName: 'Crash fixture',
      }),
    });
    assert.equal(r.status, 201);
    const a = await r.json(),
      event = randomUUID();
    child = fork(fileURLToPath(import.meta.url), ['child', a.tenantId, event], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    try {
      const [message] = await once(child, 'message');
      assert.equal(message, 'attempt-recorded');
    } finally {
      clearTimeout(timer);
    }
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    const [code, signal] = await exited;
    assert.equal(code, null);
    assert.equal(signal, 'SIGKILL');
    let replayCalls = 0;
    await assert.rejects(
      () =>
        db.eventScope(event, () =>
          effects.execute(a.tenantId, { mock: 'crash-attempt', event }, async () => {
            replayCalls++;
            return { accepted: true };
          }),
        ),
      /ambiguous/,
    );
    assert.equal(replayCalls, 0);
    const evidence = await db.withTenant(a.tenantId, async (c) => ({
      attempts: Number(
        (
          await c.query(
            "SELECT count(*) n FROM audit_logs WHERE action='fixture.mock_provider_attempt' AND resource_id=$1",
            [event],
          )
        ).rows[0].n,
      ),
      states: (
        await c.query('SELECT status FROM external_effects WHERE effect_key LIKE $1', [event + '%'])
      ).rows.map((x) => x.status),
    }));
    assert.equal(evidence.attempts, 1);
    assert.deepEqual(evidence.states, ['started']);
    console.log(
      'Process crash: real child SIGKILL after durable mock attempt; detached started claim survives; replay refuses second provider call; one local attempt. No external calls.',
    );
  } finally {
    child?.kill('SIGKILL');
    await db.onModuleDestroy();
  }
}
