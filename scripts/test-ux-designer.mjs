// Short, offline contracts for the actual inspector conversion handler. Node 22.13+.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync('apps/web/components/flow/Inspector.tsx', 'utf8');
const start = source.indexOf('on={(m) => {');
assert.ok(start >= 0);
const end = source.indexOf('\n              }}\n              opts', start);
assert.ok(end > start);
const handler = stripTypeScriptTypes(source.slice(start + 4, end) + '\n}');
function convert(data, mode, next, approve = true) {
  let patch;
  const alerts = [], confirmations = [];
  const before = structuredClone(data);
  const fn = new Function('data', 'mode', 't', 'alert', 'confirm', 'uid', 'set', `return (${handler});`)(
    data, mode, (ar) => ar, (s) => alerts.push(s), (s) => { confirmations.push(s); return approve; },
    () => 'new-id', (p) => { patch = p; },
  );
  fn(next);
  assert.deepEqual(data, before, 'conversion must not mutate input');
  return { patch, alerts, confirmations };
}
const buttons = [{ id: 'booking', title: 'حجز عمرة' }, { id: 'flight', title: 'تذاكر الطيران' }];
const edges = { 'option:booking': 'confirm-booking', 'option:flight': 'confirm-flight' };
const list = convert({ buttons }, 'buttons', 'list').patch.list;
assert.deepEqual(list.sections[0].rows, buttons);
const back = convert({ list }, 'list', 'buttons').patch.buttons;
assert.deepEqual(back, buttons);
for (const option of back) assert.ok(edges[`option:${option.id}`], 'canonical connections remain valid');
assert.equal(convert({ list: { sections: [{ rows: [...buttons, { id: '3', title: 'ثالث' }, { id: '4', title: 'رابع' }] }] } }, 'list', 'buttons').patch, undefined);
assert.equal(convert({ list: { sections: [{ rows: [{ id: 'long', title: 'x'.repeat(21) }] }] } }, 'list', 'buttons').patch, undefined);
const rich = { list: { buttonText: 'اختر رحلتك', sections: [{ title: 'الرحلات', rows: [{ ...buttons[0], description: 'وصف الرحلة' }] }] } };
const cancelled = convert(rich, 'list', 'buttons', false);
assert.equal(cancelled.patch, undefined);
assert.equal(cancelled.confirmations.length, 1);
assert.equal(convert({ buttons }, 'buttons', 'none', false).patch, undefined);
assert.equal(convert({ buttons }, 'buttons', 'none').patch.buttons, undefined);
assert.equal(convert({ buttons }, 'buttons', 'buttons').patch, undefined);
console.log('PASS: actual reply conversion preserves choices/edge IDs; guards count, title limits, list-only metadata and removal; cancelled changes never mutate data');
