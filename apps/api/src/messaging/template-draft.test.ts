import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplateDraft } from './template-draft';
const base = {
  name: 'order',
  language: 'en',
  category: 'UTILITY',
  body: 'Hello {{1}}',
  examples: ['Ada'],
};
test('draft authoring builds exact provider examples for text, media and dynamic URLs', () => {
  const d = parseTemplateDraft({
    ...base,
    header: {
      type: 'HEADER',
      format: 'TEXT',
      text: 'Order {{1}}',
      example: { header_text: ['123'] },
    },
    footer: 'Thank you',
    buttons: [
      {
        type: 'URL',
        text: 'View',
        url: 'https://example.test/{{1}}',
        example: ['https://example.test/123'],
      },
    ],
  });
  assert.deepEqual(d.components, [
    { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}', example: { header_text: ['123'] } },
    { type: 'BODY', text: 'Hello {{1}}', example: { body_text: [['Ada']] } },
    { type: 'FOOTER', text: 'Thank you' },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'View',
          url: 'https://example.test/{{1}}',
          example: ['https://example.test/123'],
        },
      ],
    },
  ]);
  for (const format of ['IMAGE', 'VIDEO', 'DOCUMENT']) {
    assert.equal(
      parseTemplateDraft({
        ...base,
        header: { type: 'HEADER', format, example: { header_handle: ['provider-upload-handle'] } },
      }).components[0].type,
      'HEADER',
    );
  }
});
test('draft authoring rejects missing/wrong samples, unsupported components and unsafe combinations', () => {
  for (const change of [
    { examples: [] },
    { body: 'Gap {{2}}' },
    { category: 'AUTHENTICATION' },
    { header: { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' } },
    { header: { type: 'HEADER', format: 'IMAGE' } },
    { footer: '{{1}}' },
    { buttons: [{ type: 'URL', text: 'View', url: 'https://example.test/{{1}}' }] },
    {
      buttons: [
        {
          type: 'URL',
          text: 'View',
          url: 'https://example.test/{{1}}',
          example: ['https://other.test/123'],
        },
      ],
    },
    {
      buttons: [
        { type: 'QUICK_REPLY', text: 'Yes' },
        { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+1234567890' },
      ],
    },
    { buttons: [{ type: 'OTP', text: 'Copy' }] },
    { extra: 'silently stripped?' },
  ])
    assert.throws(() => parseTemplateDraft({ ...base, ...change }));
});
