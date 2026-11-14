import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlowRecovery, writeFlowRecovery, type FlowRecovery } from './flow-recovery';
test('recovery is scoped by tenant and user, survives token rotation, and handles blocked storage', () => {
  const values = new Map<string, string>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
    previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  const login = (sub: string, tid: string, rotated = false) =>
    storage.setItem(
      'session',
      JSON.stringify({
        accessToken:
          'header.' +
          btoa(JSON.stringify({ sub, tid, sid: rotated ? 'two' : 'one' })) +
          '.signature',
      }),
    );
  const record: FlowRecovery = {
    version: 1,
    content: JSON.stringify({
      name: 'Draft',
      priority: 0,
      triggers: [],
      channelIds: [],
      graph: {
        startNodeId: 'a',
        nodes: [{ id: 'a', type: 'message', data: { text: 'Recovered' } }],
      },
    }),
    baseUpdatedAt: '2026-11-14T00:00:00Z',
    savedAt: new Date().toISOString(),
    inspectorDraft: { id: 'a', data: { text: 'Pending' } },
  };
  try {
    login('u1', 't1');
    assert.equal(writeFlowRecovery('f1', record), true);
    assert.deepEqual(readFlowRecovery('f1'), record);
    login('u1', 't1', true);
    assert.deepEqual(readFlowRecovery('f1'), record);
    login('u2', 't1');
    assert.equal(readFlowRecovery('f1'), null);
    login('u1', 't2');
    assert.equal(readFlowRecovery('f1'), null);
    login('u1', 't1');
    assert.equal(readFlowRecovery('f2'), null);
    storage.setItem('boat:flow-recovery:v1:t1:u1:f2', 'broken');
    assert.equal(readFlowRecovery('f2'), null);
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    assert.equal(writeFlowRecovery('f1', record), false);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
