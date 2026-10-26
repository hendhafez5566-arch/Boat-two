import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inboundSystemAction, readSystemActions, systemActionsSchema } from './system-actions';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('system actions remain disabled by default and use exact normalized keywords', () => {
  assert.equal(
    inboundSystemAction(readSystemActions({}), { text: 'stop', location: false, human: false }),
    null,
  );
  const config = systemActionsSchema.parse({
    actions: {
      unsubscribe: { enabled: true, flowId: id, keywords: ['STOP'] },
      bot: { enabled: true, flowId: id, keywords: ['bot'] },
      location_reply: { enabled: true, flowId: id },
    },
  });
  assert.equal(
    inboundSystemAction(config, { text: ' stop ', location: false, human: false }),
    'unsubscribe',
  );
  assert.equal(
    inboundSystemAction(config, { text: 'please stop', location: false, human: false }),
    null,
  );
  assert.equal(inboundSystemAction(config, { text: 'stop', location: false, human: true }), null);
  assert.equal(inboundSystemAction(config, { text: 'BOT', location: false, human: true }), 'bot');
  assert.equal(
    inboundSystemAction(config, { text: '', location: true, human: false }),
    'location_reply',
  );
  assert.equal(inboundSystemAction(config, { text: '', location: true, human: true }), null);
});
test('enabled actions require valid published-flow references and unambiguous keywords', () => {
  assert.equal(
    systemActionsSchema.safeParse({ actions: { human: { enabled: true } } }).success,
    false,
  );
  assert.equal(
    systemActionsSchema.safeParse({ actions: { human: { enabled: true, flowId: id } } }).success,
    false,
  );
  assert.equal(
    systemActionsSchema.safeParse({
      actions: {
        human: { enabled: true, flowId: id, keywords: ['agent'] },
        bot: { enabled: true, flowId: id, keywords: ['AGENT'] },
      },
    }).success,
    false,
  );
});
