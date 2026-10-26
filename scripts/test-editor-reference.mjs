import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

async function load(path) {
  return import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(path, 'utf8'))).toString('base64'));
}
const { deriveFlowReference } = await load('apps/web/lib/flow-reference.ts');
const { toFlow, fromFlow, NODE_META, NODE_GROUPS } = await load('apps/web/lib/flow-types.ts');
assert.equal(deriveFlowReference([], '', true), null);
assert.equal(deriveFlowReference([{ id: 'x', position: { x: 0, y: 0 } }], 'missing', false), null);
for (const rtl of [true, false]) {
  const graph = { startNodeId: 'welcome', nodes: [
    { id: 'welcome', type: 'interactive', position: { x: 400, y: 50 }, data: { text: 'مرحبًا', buttons: [{ id: 'a', title: 'أول' }, { id: 'b', title: 'ثان' }] }, edges: { 'option:a': 'end', 'option:b': 'end' } },
    { id: 'end', type: 'end', position: { x: 400, y: 600 }, data: {}, edges: {} },
  ] };
  const input = JSON.stringify(graph);
  const real = toFlow(graph);
  const reference = deriveFlowReference(real.nodes, graph.startNodeId, rtl);
  assert.ok(reference);
  assert.equal(reference.position.x, 400 + (rtl ? 380 : -380));
  assert.equal(reference.edge.target, 'welcome');
  assert.equal(reference.edge.deletable, false);
  assert.equal(reference.edge.updatable, false);
  assert.notEqual(reference.edge.type, 'smoothstep', 'decorative link must not use the editable custom edge');
  const before = fromFlow(real.nodes, real.edges, graph.startNodeId);
  for (const node of real.nodes) node.data.actions = { open() {}, duplicate() {}, remove() {}, setStart() {} };
  assert.deepEqual(fromFlow(real.nodes, real.edges, graph.startNodeId), before, 'edit callbacks must not enter saved graph');
  assert.equal(JSON.stringify(graph), input, 'decoration must not mutate the source graph');
  assert.equal(before.nodes.length, 2);
  assert.deepEqual(before.nodes[0].edges, graph.nodes[0].edges);
}
const collision = [
  { id: '__boat_flow_reference', position: { x: 0, y: 0 } },
  { id: '__boat_flow_reference_', position: { x: 380, y: 0 }, width: 300, height: 500 },
];
const reference = deriveFlowReference(collision, collision[0].id, true);
assert.equal(reference.id, '__boat_flow_reference__');
assert.ok(reference.position.y > 500, 'reference must clear existing tall cards');
assert.equal(new Set([...collision.map(node => node.id), reference.id]).size, 3);
console.log('PASS: RTL/LTR reference, missing start, ID collision, occupied canvas, graph preservation and callback exclusion');

const paletteTypes = NODE_GROUPS.flatMap(group => group.types);
assert.equal(new Set(paletteTypes).size, paletteTypes.length, 'no duplicate block categories');
assert.deepEqual([...paletteTypes].sort(), Object.keys(NODE_META).sort(), 'every supported block remains reachable');
console.log('PASS: canonical palette retains every supported block exactly once');
