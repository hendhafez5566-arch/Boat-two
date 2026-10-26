import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WhatsAppFlowsGateway } from './whatsapp-flows.gateway';
import { nativeFlowDraftSchema, safeFlowPreview } from './whatsapp-flow-contract';
const flow = {
  id: '12345',
  name: 'Contact',
  categories: ['CONTACT_US'],
  status: 'DRAFT',
  validation_errors: [],
  whatsapp_business_account: { id: '900' },
};
test('Meta Flow requests preserve API contracts and never follow provider pagination URLs', async () => {
  const previous = globalThis.fetch;
  const seen: { url: string; init: RequestInit }[] = [];
  let response: unknown = { id: '12345' };
  globalThis.fetch = async (input, init = {}) => {
    seen.push({ url: String(input), init });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const gateway = new WhatsAppFlowsGateway();
    await gateway.create('900', 'token', 'Contact', ['CONTACT_US']);
    assert.equal(seen[0].url, 'https://graph.facebook.com/v21.0/900/flows');
    assert.deepEqual(JSON.parse(String(seen[0].init.body)), {
      name: 'Contact',
      categories: ['CONTACT_US'],
    });
    assert.equal(seen[0].init.redirect, 'error');
    response = { success: true, validation_errors: [] };
    await gateway.upload('12345', 'token', { version: '7.3', screens: [] });
    const upload = seen[1].init.body as FormData;
    assert.ok(upload instanceof FormData);
    assert.equal(upload.get('name'), 'flow.json');
    assert.equal(upload.get('asset_type'), 'FLOW_JSON');
    assert.equal((upload.get('file') as File).name, 'flow.json');
    assert.deepEqual(JSON.parse(await (upload.get('file') as Blob).text()), {
      version: '7.3',
      screens: [],
    });
    response = { success: true };
    await gateway.transition('12345', 'token', 'publish');
    assert.ok(seen[2].url.endsWith('/12345/publish'));
    let pages = 0;
    globalThis.fetch = async (input, init = {}) => {
      seen.push({ url: String(input), init });
      pages++;
      return new Response(
        JSON.stringify(
          pages === 1
            ? {
                data: [flow],
                paging: {
                  next: 'https://attacker.invalid/exfiltrate',
                  cursors: { after: 'cursor / one' },
                },
              }
            : { data: [{ ...flow, id: '67890' }] },
        ),
        { status: 200 },
      );
    };
    const listed = await gateway.list('900', 'token');
    assert.equal(listed.items.length, 2);
    assert.equal(listed.complete, true);
    assert.equal(pages, 2);
    assert.ok(seen.at(-1)!.url.startsWith('https://graph.facebook.com/v21.0/900/flows?'));
    assert.ok(seen.at(-1)!.url.includes('cursor%20%2F%20one'));
    assert.ok(seen.every((item) => !item.url.includes('attacker.invalid')));
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ...flow, id: '999' }), { status: 200 });
    await assert.rejects(() => gateway.get('12345', 'token'), /does not match/);
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
    await assert.rejects(
      () => gateway.upload('12345', 'token', {}),
      /validation_errors/,
      'missing validation evidence is not success',
    );
  } finally {
    globalThis.fetch = previous;
  }
});
test('native draft structure and preview URLs reject ambiguous or unsafe input', () => {
  assert.equal(safeFlowPreview('javascript:alert(1)'), null);
  assert.equal(
    safeFlowPreview('https://business.facebook.com.evil.test/wa/manage/flows/123/preview/'),
    null,
  );
  assert.equal(
    safeFlowPreview('https://u:p@business.facebook.com/wa/manage/flows/123/preview/'),
    null,
  );
  assert.equal(safeFlowPreview('https://business.facebook.com/other'), null);
  assert.ok(
    safeFlowPreview('https://business.facebook.com/wa/manage/flows/123/preview/?token=test'),
  );
  const draft = {
    name: 'Form',
    categories: ['SURVEY'],
    definition: {
      version: '7.3',
      screens: [{ id: 'FORM', layout: { type: 'SingleColumnLayout' } }],
    },
  };
  assert.equal(nativeFlowDraftSchema.safeParse(draft).success, true);
  assert.equal(
    nativeFlowDraftSchema.safeParse({
      ...draft,
      definition: {
        ...draft.definition,
        screens: [...draft.definition.screens, ...draft.definition.screens],
      },
    }).success,
    false,
  );
  assert.equal(
    nativeFlowDraftSchema.safeParse({ ...draft, categories: ['invented'] }).success,
    false,
  );
});
