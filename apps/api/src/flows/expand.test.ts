import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSubflows } from './expand';
import { FlowEngine, newState, validateGraph, FlowGraph, EngineDeps } from './engine';
const child: FlowGraph = {
  startNodeId: 'hello',
  nodes: [
    { id: 'hello', type: 'message', data: { text: 'Inside component' }, edges: { next: 'return' } },
    { id: 'return', type: 'end', data: {}, edges: {} },
  ],
};
const parent: FlowGraph = {
  startNodeId: 'component',
  nodes: [
    { id: 'component', type: 'subflow', data: { flowId: 'child' }, edges: { next: 'after' } },
    { id: 'after', type: 'end', data: { message: 'Parent continues' }, edges: {} },
  ],
};
test('published component expands into an executable immutable parent graph', async () => {
  const expanded = await expandSubflows(parent, async () => child);
  assert.equal(validateGraph(expanded).errors.length, 0);
  assert.ok(!expanded.nodes.some((n) => n.type === 'subflow'));
  const sent: string[] = [];
  const deps: EngineDeps = {
    send: async (c) => {
      if (c.text) sent.push(c.text);
    },
    ai: async () => ({ text: '', handoff: false }),
    http: async () => ({ ok: true, status: 200, body: {} }),
    setContactAttribute: async () => {},
    updateTags: async () => {},
    addNote: async () => {},
    handoff: async () => {},
    closeConversation: async () => {},
    now: () => new Date(),
    random: () => 0,
  };
  const result = await new FlowEngine(expanded, deps).start(
    { contact: { attributes: {} }, channel: { type: 'web' }, lastMessage: { text: '' } },
    newState(),
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(sent, ['Inside component', 'Parent continues']);
  child.nodes[0].data.text = 'changed';
  assert.equal(
    expanded.nodes.find((n) => n.id === 'component__hello')?.data.text,
    'Inside component',
  );
});
test('recursive components cannot publish', async () => {
  await assert.rejects(
    expandSubflows(parent, async () => parent),
    /Recursive/,
  );
});
test('components cannot silently close the parent conversation', async () => {
  await assert.rejects(
    expandSubflows(parent, async () => ({
      startNodeId: 'close',
      nodes: [{ id: 'close', type: 'end', data: { closeConversation: true }, edges: {} }],
    })),
    /cannot close/,
  );
});

test('expanded node limit applies even when ordinary nodes follow the component', async () => {
  const single: FlowGraph = {startNodeId:'end',nodes:[{id:'end',type:'end',data:{},edges:{}}]};
  const sized = (trailing:number):FlowGraph => ({startNodeId:'component',nodes:[
    {id:'component',type:'subflow',data:{flowId:'child'},edges:{next:'node0'}},
    ...Array.from({length:trailing},(_,i)=>({id:'node'+i,type:'message' as const,data:{text:'Message'},edges:{}})),
  ]});
  assert.equal((await expandSubflows(sized(298),async()=>single)).nodes.length,300);
  await assert.rejects(expandSubflows(sized(299),async()=>single),/exceeds 300 nodes/);
});

test('expanded component IDs remain valid for export, restore and editor save', async () => {
  const {graphSchema}=await import('./flow-schemas');
  const long='n'.repeat(60),childEnd='e'.repeat(60);
  const expanded=await expandSubflows({startNodeId:long,nodes:[
    {id:long,type:'subflow',data:{flowId:'child'},edges:{}},
  ]},async()=>({startNodeId:childEnd,nodes:[{id:childEnd,type:'end',data:{},edges:{}}]}));
  assert.ok(graphSchema.safeParse(expanded).success,'published graph must remain editable after restore');
  assert.equal(new Set(expanded.nodes.map(n=>n.id)).size,expanded.nodes.length);
  assert.equal(validateGraph(expanded).errors.length,0);
  assert.deepEqual(expanded,await expandSubflows({startNodeId:long,nodes:[{id:long,type:'subflow',data:{flowId:'child'},edges:{}}]},async()=>({startNodeId:childEnd,nodes:[{id:childEnd,type:'end',data:{},edges:{}}]})),'scoped IDs must be deterministic');
});
