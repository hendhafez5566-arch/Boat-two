import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveButtonCards, fromFlow, toFlow, handlesFor, hasButtonCards, buttonNodeId } from './flow-types';

const g: any = {
  startNodeId: 'i',
  nodes: [
    { id: 'i', type: 'interactive', position: { x: 100, y: 50 }, data: { text: 'Pick', buttons: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }, edges: { 'option:a': 'x', fallback: 'y' }, layout: { a: { x: 500, y: 10 }, gone: { x: 1, y: 1 } } },
    { id: 'x', type: 'message', position: { x: 0, y: 400 }, data: { text: 'A!' }, edges: {} },
    { id: 'y', type: 'message', position: { x: 300, y: 400 }, data: { text: 'other' }, edges: {} },
  ],
};
test('cards derive, re-source edges and keep the saved graph identical', () => {
  const { nodes, edges } = toFlow(g);
  const d = deriveButtonCards(nodes, edges, false);
  assert.equal(d.cardNodes.length, 2);
  assert.deepEqual(d.cardNodes[0].position, { x: 600, y: 60 });          // stored offset 500,10 + parent 100,50
  assert.deepEqual(d.cardNodes[1].position, { x: 100 + 360, y: 50 + 10 + 140 + 28 }); // follows the stored first card without overlap
  const a = d.edges.find((e) => e.id === 'i:option:a')!;
  assert.equal(a.source, buttonNodeId('i', 'a')); assert.equal(a.sourceHandle, 'out'); assert.equal(a.target, 'x');
  assert.equal(d.edges.find((e) => e.id === 'i:fallback')!.source, 'i');    // fallback stays on the message
  assert.equal(d.edges.filter((e) => e.type === 'buttonLink').length, 2);
  assert.equal(d.cardNodes[0].data.linked, true); assert.equal(d.cardNodes[1].data.linked, false);
  // round trip: edges in state are untouched, so saving gives back the same edges; stale layout key pruned
  const back = fromFlow(nodes, edges, 'i');
  assert.deepEqual(back.nodes[0].edges, g.nodes[0].edges);
  assert.deepEqual(back.nodes[0].layout, { a: { x: 500, y: 10 } });
  assert.equal(back.nodes.some((n) => n.id.startsWith('btn:')), false);
});
test('rtl default offset goes left; list-only and plain messages get no cards', () => {
  const { nodes, edges } = toFlow(g);
  assert.ok(deriveButtonCards(nodes, edges, true).cardNodes[1].position.x < 100);
  assert.equal(hasButtonCards('interactive', { list: { sections: [] } }), false);
  assert.equal(hasButtonCards('interactive', { list: { buttonText: 'x', sections: [{ rows: [{ id: 'r', title: 'R' }] }] } }), true);
  assert.equal(hasButtonCards('message', { text: 'x' }), false);
  assert.ok(handlesFor('interactive', g.nodes[0].data).some((h) => h.id === 'option:a'));
  assert.deepEqual(handlesFor('sheet_fetch', {}).map((h) => h.id), ['found', 'not_found', 'error']);
});

test('list rows become cards too and keep their option edges and layout', () => {
  const lg: any = { startNodeId: 'l', nodes: [
    { id: 'l', type: 'interactive', position: { x: 0, y: 0 }, data: { text: 'Pick', list: { buttonText: 'Menu', sections: [{ rows: [{ id: 'r1', title: 'One' }, { id: 'r2', title: 'Two' }] }] } }, edges: { 'option:r2': 't' }, layout: { r1: { x: 400, y: 5 }, old: { x: 0, y: 0 } } },
    { id: 't', type: 'message', position: { x: 0, y: 300 }, data: { text: 'T' }, edges: {} } ] };
  const { nodes, edges } = toFlow(lg);
  const d = deriveButtonCards(nodes, edges, false);
  assert.equal(d.cardNodes.length, 2);
  assert.deepEqual(d.cardNodes[0].position, { x: 400, y: 5 });
  assert.equal(d.edges.find((e) => e.id === 'l:option:r2')!.source, buttonNodeId('l', 'r2'));
  assert.deepEqual(fromFlow(nodes, edges, 'l').nodes[0].layout, { r1: { x: 400, y: 5 } });
});
