import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeRealtimeEvent } from './safe-event';
test('SSE cannot promote CR/LF data into event or cursor protocol fields', () => {
  for (const type of ['message\nevent: forged', 'message\r\ndata: forged', '\r', 'x'.repeat(81), null]) {
    const payload = { type, text: 'untrusted\r\nevent: data stays JSON' };
    const result = safeRealtimeEvent('123', payload);
    assert.equal(result.type, 'message'); assert.equal(result.data, payload);
  }
  for (const id of ['1\nevent: forged', '-1', '1\r', ''])
    assert.throws(() => safeRealtimeEvent(id, {type:'message'}));
  assert.equal(safeRealtimeEvent('123', {type:'conversation_updated'}).type, 'conversation_updated');
});
