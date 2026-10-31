import assert from 'node:assert/strict';
import test from 'node:test';
import { FLOW_TEMPLATES } from './templates';
import { FlowEngine, newState, validateGraph, type EngineDeps, type FlowContext, type OutContent } from './engine';

const graph = FLOW_TEMPLATES.find((t) => t.id === 'tourism_pro')?.graph;
test('professional tourism template validates and has a WhatsApp interactive menu', () => {
  assert.ok(graph, 'tourism_pro starter must exist');
  const result = validateGraph(graph);
  assert.deepEqual(result.errors, []);
  const start = graph.nodes.find((n) => n.id === graph.startNodeId)!;
  assert.equal(start.type, 'interactive');
  assert.equal(start.data.list.sections[0].rows.length, 7);
  for (const label of ['umrah','hajj','egypt','abroad','visa','offers','agent'])
    assert.ok(start.edges['option:' + label]);
});

test('tourism preview: Umrah selection collects travel requirements and hands off safely', async () => {
  assert.ok(graph);
  const messages: OutContent[] = [];
  const notes: string[] = [];
  const attributes: Record<string, unknown> = {};
  let handoffs = 0;
  const deps: EngineDeps = {
    ai: async () => ({text:'',handoff:false}),
    send: async (message) => { messages.push(message); },
    http: async () => ({status:200,ok:true,body:{}}),
    setContactAttribute: async (key,value) => { attributes[key]=value; },
    updateTags: async () => {},
    addNote: async (message) => { notes.push(message); },
    handoff: async () => { handoffs++; },
    closeConversation: async () => {},
    now: () => new Date('2026-10-31T13:00:00Z'),
    random: () => 0.5,
  };
  const engine = new FlowEngine(graph,deps);
  const ctx: FlowContext = {
    contact: { name:null, phone:'201288890904', attributes },
    channel: {type:'whatsapp'},
    lastMessage: {text:'السلام عليكم'},
  };
  const state = newState();
  let result = await engine.start(ctx,state);
  assert.equal(result.status,'waiting');
  assert.equal(result.waitKind,'choice');
  assert.equal(messages[0]?.list?.sections?.[0]?.rows?.length,7);
  ctx.lastMessage = { text:'برامج العمرة',replyId:'umrah' };
  result = await engine.resume(ctx,state);
  assert.equal(result.status,'waiting');
  assert.equal(attributes.tourism_interest,'عمرة');
  assert.equal(messages.at(-1)?.buttons?.length,3);
  ctx.lastMessage = {text:'طلب عرض سعر',replyId:'request'};
  result = await engine.resume(ctx,state);
  assert.equal(result.waitKind,'answer');
  for(const answer of ['محمد','المدينة المنورة','نوفمبر','4']){
    ctx.lastMessage={text:answer};
    result=await engine.resume(ctx,state);
  }
  assert.equal(result.status,'handed_off');
  assert.equal(handoffs,1);
  assert.equal(notes.length,1);
  assert.ok(notes[0].includes('محمد'));
  assert.ok(messages.at(-1)?.text?.includes('تم استلام الاستفسار'));
});
