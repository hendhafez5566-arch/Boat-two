import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedTemplate, validateTemplateParameters, variableCount } from './template-contract';
import { contentSchema } from './message-content';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
const definition = {
  body: 'Hello {{1}}',
  category: 'MARKETING',
  components: [
    { type: 'HEADER', format: 'DOCUMENT' },
    { type: 'BODY', text: 'Hello {{1}}' },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+1234567890' },
        { type: 'URL', text: 'View', url: 'https://example.test/order/{{1}}' },
        { type: 'QUICK_REPLY', text: 'Confirm' },
      ],
    },
  ],
};
const value = {
  name: 'receipt',
  language: 'en',
  bodyParams: ['Ada'],
  header: {
    type: 'document' as const,
    url: 'https://example.test/report.pdf',
    filename: 'report.pdf',
  },
  buttonParams: [
    { index: 1, type: 'url' as const, value: 'order-12' },
    { index: 2, type: 'quick_reply' as const, value: 'confirm-12' },
  ],
};
test('supported structures reject authentication, unknown variants, gaps and duplicate component types', () => {
  assert.equal(supportedTemplate('MARKETING', definition.components), true);
  assert.equal(supportedTemplate('AUTHENTICATION', definition.components), false);
  for (const extra of [
    { type: 'CAROUSEL' },
    { type: 'HEADER', format: 'LOCATION' },
    { type: 'BUTTONS', buttons: [{ type: 'OTP', text: 'Copy' }] },
  ])
    assert.equal(supportedTemplate('UTILITY', [{ type: 'BODY', text: 'Hi' }, extra]), false);
  assert.equal(variableCount('Hi {{2}}'), -1);
  assert.equal(variableCount('Hi {{1}} {{1}}'), 1);
  assert.equal(
    supportedTemplate('UTILITY', [
      { type: 'BODY', text: 'Hi' },
      { type: 'BODY', text: 'Hi' },
    ]),
    false,
  );
});
test('approved header/button definition requires exact types, indices and nonempty values', () => {
  validateTemplateParameters(definition, value);
  for (const changes of [
    { header: undefined },
    { header: { type: 'image', url: 'https://example.test/x.png' } },
    { buttonParams: [] },
    {
      buttonParams: [
        { index: 0, type: 'url', value: 'x' },
        { index: 2, type: 'quick_reply', value: 'x' },
      ],
    },
    { bodyParams: [' '] },
    { bodyParams: ['a', 'b'] },
  ])
    assert.throws(() =>
      validateTemplateParameters(definition, { ...value, ...changes } as typeof value),
    );
  assert.throws(() =>
    validateTemplateParameters(definition, {
      ...value,
      buttonParams: [value.buttonParams[0], value.buttonParams[0]],
    }),
  );
});
test('text and static headers preserve BODY-only compatibility without accepting extra inputs', () => {
  validateTemplateParameters({ body: 'Hello' }, { name: 'hello', language: 'en', bodyParams: [] });
  assert.throws(() => validateTemplateParameters({ body: 'Hello' }, { ...value, bodyParams: [] }));
  const d = {
    body: 'Hi',
    components: [
      { type: 'BODY', text: 'Hi' },
      { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' },
    ],
  };
  validateTemplateParameters(d, {
    name: 'hi',
    language: 'en',
    bodyParams: [],
    header: { type: 'text', text: '12' },
  });
  assert.throws(() =>
    validateTemplateParameters(d, { name: 'hi', language: 'en', bodyParams: [] }),
  );
});
test('media headers reject private URLs, credentials and filename misuse; schemas reject unknown fields', () => {
  for (const url of [
    'http://example.test/a',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://localhost/a',
    'https://user:pass@example.test/a',
  ])
    assert.throws(() =>
      validateTemplateParameters(definition, { ...value, header: { ...value.header, url } }),
    );
  assert.equal(
    contentSchema.safeParse({ template: { ...value, unexpected: 'discard?' } }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      template: { ...value, header: { type: 'text', url: 'https://example.test' } },
    }).success,
    false,
  );
});
test('WhatsApp adapter emits exact header/body/indexed button contract without static button parameters', async () => {
  const before = globalThis.fetch;
  let captured: unknown;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ messages: [{ id: 'local-template' }] }), { status: 200 });
  };
  try {
    await new WhatsAppAdapter().send({ accessToken: 'local', phoneNumberId: 'local' }, '123', {
      template: value,
    });
    assert.deepEqual((captured as { template: unknown }).template, {
      name: 'receipt',
      language: { code: 'en' },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: { link: 'https://example.test/report.pdf', filename: 'report.pdf' },
            },
          ],
        },
        { type: 'body', parameters: [{ type: 'text', text: 'Ada' }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '1',
          parameters: [{ type: 'text', text: 'order-12' }],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '2',
          parameters: [{ type: 'payload', payload: 'confirm-12' }],
        },
      ],
    });
  } finally {
    globalThis.fetch = before;
  }
});
