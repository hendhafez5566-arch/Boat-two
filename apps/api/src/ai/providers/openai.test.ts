import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OpenAiProvider } from './openai';
const request = {
  system: 'Grounded support',
  messages: [{ role: 'user' as const, content: 'Help' }],
  maxTokens: 100,
  temperature: 0.2,
  tools: [
    {
      name: 'handoff_to_human',
      description: 'Escalate',
      input_schema: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  ],
};
test('OpenAI adapter translates the shared request, tool calls and usage without network', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const sent = JSON.parse(String(options?.body));
    assert.equal(sent.messages[0].role, 'system');
    assert.equal(sent.tools[0].function.name, 'handoff_to_human');
    assert.equal(sent.max_completion_tokens, 100);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Connecting you',
              tool_calls: [
                { function: { name: 'handoff_to_human', arguments: '{"reason":"Requested"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }),
    );
  }) as typeof fetch;
  try {
    const result = await new OpenAiProvider('fixture-key', 'fixture-model').chat(request);
    assert.equal(result.inputTokens, 12);
    assert.equal(result.outputTokens, 5);
    assert.equal(result.toolCalls[0].input.reason, 'Requested');
  } finally {
    globalThis.fetch = original;
  }
});
test('OpenAI adapter does not replay an ambiguous provider failure or disclose error body', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response('private provider diagnostics', { status: 503 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => new OpenAiProvider('fixture-key', 'fixture-model').chat(request),
      /OpenAI request failed \(503\)/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
