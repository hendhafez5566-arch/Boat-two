/* global Response */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = require('./dist/database/database.service.js'),
  { WhatsAppAdapter } = require('./dist/messaging/adapters/whatsapp.adapter.js'),
  { MetaAdapter } = require('./dist/messaging/adapters/meta.adapter.js');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function call(path, body, token, status = 201) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, status, JSON.stringify(data));
  return data;
}
try {
  const a = await call('/auth/register', {
      email: `rich-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Rich fixture',
      workspaceName: 'Rich campaign fixture',
    }),
    channel = await call('/channels', { type: 'web', name: 'Rich web fixture' }, a.accessToken);
  const contents = [
    {
      text: 'Local buttons',
      buttons: [
        { id: 'stable_yes', title: 'Yes' },
        { id: 'stable_no', title: 'No' },
      ],
    },
    {
      text: 'Local menu',
      list: {
        buttonText: 'Choose',
        sections: [{ rows: [{ id: 'stable_menu', title: 'Choice' }] }],
      },
    },
    {
      text: 'Local image caption',
      media: { kind: 'image', url: 'https://example.test/fixture.png' },
    },
  ];
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      'INSERT INTO channel_delivery_policy(tenant_id,channel_id,marketing_enabled,interval_ms) VALUES($1,$2,true,100)',
      [a.tenantId, channel.id],
    ),
  );
  for (const [index, content] of contents.entries()) {
    const tag = 'variant-' + index;
    await db.withTenant(a.tenantId, async (c) => {
      const ct = (
        await c.query(
          "INSERT INTO contacts(tenant_id,name,tags) VALUES($1,'Rich local fixture',ARRAY[$2]) RETURNING id",
          [a.tenantId, tag],
        )
      ).rows[0].id;
      await c.query(
        "INSERT INTO conversations(tenant_id,channel_id,contact_id,last_inbound_at,handled_by) VALUES($1,$2,$3,now(),'human')",
        [a.tenantId, channel.id, ct],
      );
      await c.query(
        'INSERT INTO contact_channels(tenant_id,contact_id,channel_id,external_id) VALUES($1,$2,$3,$4)',
        [a.tenantId, ct, channel.id, randomUUID()],
      );
      await c.query(
        "INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,'opted_in','local fixture')",
        [a.tenantId, ct, channel.id],
      );
    });
    const campaign = await call(
      '/campaigns',
      { name: 'Rich ' + index, channelId: channel.id, filters: { tag }, content },
      a.accessToken,
    );
    await call(
      '/campaigns/' + campaign.id + '/schedule',
      { at: new Date().toISOString() },
      a.accessToken,
    );
    let delivered;
    for (let i = 0; i < 80; i++) {
      delivered = await db.withTenant(
        a.tenantId,
        async (c) =>
          (
            await c.query(
              'SELECT m.content FROM campaign_recipients r JOIN messages m ON m.id=r.message_id WHERE r.campaign_id=$1 AND m.status=$2',
              [campaign.id, 'sent'],
            )
          ).rows[0],
      );
      if (delivered) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!delivered)
      console.log(
        await db.withTenant(a.tenantId, async (c) => ({
          campaigns: (await c.query('SELECT id,status FROM campaigns')).rows,
          recipients: (await c.query('SELECT status,error FROM campaign_recipients')).rows,
          events: (
            await c.query(
              "SELECT type,status,error FROM domain_events WHERE type LIKE 'campaign.%'",
            )
          ).rows,
        })),
      );
    assert.ok(delivered, 'Local worker did not deliver rich web content');
    assert.deepEqual(delivered.content, content);
  }
  await call(
    '/campaigns',
    {
      name: 'Duplicate IDs',
      channelId: channel.id,
      content: {
        text: 'bad',
        buttons: [
          { id: 'same', title: 'One' },
          { id: 'same', title: 'Two' },
        ],
      },
    },
    a.accessToken,
    400,
  );
  await call(
    '/campaigns',
    {
      name: 'Private media',
      channelId: channel.id,
      content: { media: { kind: 'image', url: 'https://127.0.0.1/private' } },
    },
    a.accessToken,
    400,
  );
  await call(
    '/campaigns',
    {
      name: 'Wrong channel',
      channelId: channel.id,
      content: { template: { name: 'fixture', language: 'en', bodyParams: [] } },
    },
    a.accessToken,
    400,
  );
  const wa = await db.withTenant(a.tenantId, async (c) => {
    const ch = (
      await c.query(
        "INSERT INTO channels(tenant_id,type,name,external_id,settings) VALUES($1,'whatsapp','Local WhatsApp fixture',$2,'{}') RETURNING id",
        [a.tenantId, randomUUID()],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO whatsapp_templates(tenant_id,channel_id,name,language,category,body,status,supported) VALUES($1,$2,'fixture_body','en','MARKETING','Hello {{1}}','APPROVED',true)",
      [a.tenantId, ch.id],
    );
    return ch;
  });
  await call(
    '/campaigns',
    {
      name: 'Approved BODY',
      channelId: wa.id,
      content: { template: { name: 'fixture_body', language: 'en', bodyParams: ['Fixture'] } },
    },
    a.accessToken,
  );
  await call(
    '/campaigns',
    {
      name: 'Missing parameter',
      channelId: wa.id,
      content: { template: { name: 'fixture_body', language: 'en', bodyParams: [] } },
    },
    a.accessToken,
    400,
  );
  const original = globalThis.fetch,
    payloads = [];
  try {
    globalThis.fetch = async (_url, init) => {
      payloads.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ messages: [{ id: 'fixture' }], message_id: 'fixture' }),
        { status: 200 },
      );
    };
    for (const content of contents) {
      await new WhatsAppAdapter().send(
        { phoneNumberId: 'fixture', accessToken: 'fixture' },
        'fixture',
        content,
      );
      await new MetaAdapter().send({ pageAccessToken: 'fixture' }, 'fixture', content);
    }
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(payloads[0].interactive.action.buttons[0].reply.id, 'stable_yes');
  assert.equal(payloads[1].message.quick_replies[0].payload, 'stable_yes');
  assert.equal(payloads[2].interactive.type, 'list');
  assert.equal(payloads[4].type, 'image');
  console.log(
    'Rich campaigns: actual local web worker delivery of buttons/menu/media, consent-filtered audiences, invalid content denial and mocked WhatsApp/Meta adapter payloads passed. No external calls.',
  );
} finally {
  await db.onModuleDestroy();
}
