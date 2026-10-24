import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js'),
  { DatabaseService } = require('./dist/database/database.service.js'),
  { AuthService } = require('./dist/auth/auth.service.js'),
  { PlansService } = require('./dist/plans/plans.service.js'),
  { JwtService } = require('@nestjs/jwt'),
  { EventsService } = require('./dist/events/events.service.js'),
  { EventEmitter2 } = require('@nestjs/event-emitter'),
  { ExternalEffects } = require('./dist/events/external-effect.js'),
  { CryptoService } = require('./dist/messaging/crypto.service.js'),
  http = require('./dist/flows/http-safe.js'),
  { InvitationMail, renderInvitation } = require('./dist/mail/invitation-mail.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  auth = new AuthService(db, new JwtService({ secret: env.JWT_SECRET }), plans),
  mail = new InvitationMail(
    db,
    new EventsService(db, new EventEmitter2()),
    new ExternalEffects(db),
    new CryptoService(),
    plans,
  );
const original = http.safeHttpRequest;
let calls = 0;
try {
  const a = await auth.register({
    email: 'mail-' + randomUUID() + '@example.test',
    password: randomBytes(20).toString('hex'),
    fullName: 'Mail fixture',
    workspaceName: 'Mail fixture',
  });
  const token = randomBytes(32).toString('hex');
  async function enqueue() {
    const id = await db.withTenant(
      a.tenantId,
      async (c) =>
        (
          await c.query(
            "INSERT INTO invitations(tenant_id,email,role,token_hash,expires_at) VALUES($1,$2,'agent',$3,now()+interval '1 day') RETURNING id",
            [
              a.tenantId,
              randomUUID() + '@example.test',
              createHash('sha256')
                .update(token + randomUUID())
                .digest('hex'),
            ],
          )
        ).rows[0].id,
    );
    return mail.enqueue(a.tenantId, id, 'recipient@example.test', token, 'en');
  }
  async function get(id) {
    return (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT * FROM invitation_mail_jobs WHERE id=$1', [id]),
      )
    ).rows[0];
  }
  http.safeHttpRequest = async (request) => {
    calls++;
    assert.equal(request.headers['Idempotency-Key'].startsWith('boat-mail-'), true);
    assert.equal(JSON.parse(request.body).html.includes(token), true);
    return { ok: true, body: { accepted: true, id: 'mock-mail-' + calls } };
  };
  const blocked = await enqueue();
  assert.equal((await get(blocked.id)).payload_enc.includes(token), false);
  await mail.process({ tenantId: a.tenantId, id: blocked.id });
  assert.equal((await get(blocked.id)).status, 'blocked');
  assert.equal(calls, 0);
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  env.EMAIL_DELIVERY_ENABLED = 'true';
  env.EMAIL_GATEWAY_URL = 'https://mail.example.test/send';
  env.EMAIL_GATEWAY_TOKEN = 'mock-secret-not-live';
  const accepted = await enqueue();
  await mail.process({ tenantId: a.tenantId, id: accepted.id });
  assert.equal((await get(accepted.id)).status, 'accepted');
  assert.equal((await get(accepted.id)).payload_enc, null);
  await mail.process({ tenantId: a.tenantId, id: accepted.id });
  assert.equal(calls, 1);
  http.safeHttpRequest = async () => {
    calls++;
    throw new Error('mock timeout after possible delivery');
  };
  const uncertain = await enqueue();
  await mail.process({ tenantId: a.tenantId, id: uncertain.id });
  assert.equal((await get(uncertain.id)).status, 'ambiguous');
  await mail.process({ tenantId: a.tenantId, id: uncertain.id });
  assert.equal(calls, 2);
  const revoked = await enqueue(),
    revokedInvitation = (await get(revoked.id)).invitation_id;
  await db.withTenant(a.tenantId, (c) =>
    c.query('DELETE FROM invitations WHERE id=$1', [revokedInvitation]),
  );
  await mail.process({ tenantId: a.tenantId, id: revoked.id });
  assert.equal((await get(revoked.id)).status, 'canceled');
  assert.equal((await get(revoked.id)).payload_enc, null);
  assert.equal(
    (
      await db.withTenant(randomUUID(), (c) =>
        c.query('SELECT id FROM invitation_mail_jobs WHERE id=$1', [accepted.id]),
      )
    ).rowCount,
    0,
  );
  const rendered = renderInvitation(
    { name: '<script>alert(1)</script>', color: 'red;bad', logo: null },
    'https://example.test/?x="bad',
    'ar',
  );
  assert.equal(rendered.html.includes('<script>'), false);
  assert.equal(rendered.html.includes('dir="rtl"'), true);
  assert.equal(rendered.html.includes('red;bad'), false);
  console.log(
    'PASS invitation mail: encrypted payload, disabled gate, mocked acceptance, no duplicate replay, ambiguous quarantine, revocation, RLS and escaped bilingual rendering. No network calls.',
  );
} finally {
  http.safeHttpRequest = original;
  env.EXTERNAL_DELIVERY_ENABLED = 'false';
  env.EMAIL_DELIVERY_ENABLED = 'false';
  await db.onModuleDestroy();
}
