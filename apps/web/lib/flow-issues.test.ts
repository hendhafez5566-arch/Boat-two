import assert from 'node:assert/strict';
import test from 'node:test';
import { flowIssues } from './flow-issues';
test('normalizes real Zod field errors and maps issue paths without crashing list rendering', () => {
  assert.deepEqual(flowIssues({ graph: ['Invalid graph'], name: ['Required'] }), [
    { message: 'Invalid graph' },
    { message: 'Required' },
  ]);
  assert.deepEqual(
    flowIssues([{ path: ['graph', 'nodes', 1, 'data', 'text'], message: 'Required' }], ['a', 'b']),
    [{ nodeId: 'b', message: 'Required' }],
  );
  assert.deepEqual(flowIssues([{ nodeId: 'a', message: 'Connect next' }]), [
    { nodeId: 'a', message: 'Connect next' },
  ]);
  assert.deepEqual(flowIssues([null, {}, { message: { unexpected: true } }]), []);
});
