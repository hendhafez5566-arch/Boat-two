import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmbeddingProvider, EMBEDDING_DIMENSIONS } from './embeddings';
import { AiProviderError } from './types';
const vector = (value: unknown = 0.1) => Array(EMBEDDING_DIMENSIONS).fill(value);
const provider = () => new EmbeddingProvider('https://fixture.invalid/v1', 'synthetic', 'text-embedding-3-small');

test('embeddings preserve input order and skip empty paid requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: [{ index: 1, embedding: vector(0.2) }, { index: 0, embedding: vector() }] });
  };
  try {
    assert.deepEqual(await provider().embed([]), []);
    assert.equal(calls, 0);
    const result = await provider().embed(['Arabic', 'English']);
    assert.equal(result[0][0], 0.1);
    assert.equal(result[1][0], 0.2);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('embeddings reject corrupt or misassociated vectors without replay', async () => {
  const original = globalThis.fetch;
  const valid = { index: 0, embedding: vector() };
  try {
    for (const data of [null, {}, { data: {} }, { data: [null] },
      { data: [valid, valid] }, { data: [{ ...valid, index: -1 }] },
      { data: [{ ...valid, index: 1 }] }, { data: [{ ...valid, index: 0.5 }] },
      { data: [{ ...valid, embedding: [0] }] },
      { data: [{ ...valid, embedding: vector('private') }] },
      { data: [{ ...valid, embedding: vector(null) }] }]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json(data); };
      await assert.rejects(provider().embed(['fixture']), AiProviderError);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

test('embedding failures redact provider diagnostics and are not replayable', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [400, 401, 429, 500, 503]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json({ error: { message: 'secret customer input and token' } }, { status });
      };
      await assert.rejects(provider().embed(['fixture']), (error: unknown) => {
        assert.ok(error instanceof AiProviderError);
        assert.equal(error.message, `Embeddings request failed (${status})`);
        assert.equal(error.retryable, false);
        return true;
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});
