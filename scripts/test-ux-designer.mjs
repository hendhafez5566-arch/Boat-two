// Short, offline contracts for the actual inspector conversion handler. Node 22.13+.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync('apps/web/components/flow/MessageEditor.tsx', 'utf8');
const start = source.indexOf('const changeMode = ');
const end = source.indexOf('\n  const updateRows', start);
assert.ok(start >= 0 && end > start);
const handler = stripTypeScriptTypes(source.slice(start + 'const changeMode = '.length, end));
const pure = readFileSync('apps/web/lib/smart-editor.ts','utf8').replace("import { NodeType } from './flow-types';", '');
const {convertChoices} = await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(pure)).toString('base64'));
function convert(data, mode, next, approve = true) {
  let patch;
  const alerts = [], confirmations = [];
  const before = structuredClone(data);
  const groups = data.list?.sections ?? [{rows:data.buttons ?? []}];
  const fn = new Function('data','mode','groups','choices','t','confirm','onChange','convertChoices','setError','uid', `return (${handler.replace(/;\s*$/, '')});`)(data,mode,groups,groups.flatMap(s=>s.rows),(ar)=>ar,(s)=>{confirmations.push(s);return approve;},(p)=>{patch=p;},convertChoices,(s)=>alerts.push(s),()=> 'new-id');
  fn(next);
  assert.deepEqual(data,before);
  return {patch,alerts,confirmations};
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

assert.equal(convert({}, 'none', 'buttons').patch.buttons[0].id,'new-id');
