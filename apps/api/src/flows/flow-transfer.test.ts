import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flowTransferSchema, updateFlowSchema } from './flow-schemas';
import { validateGraph } from './engine/validate';

test('portable flow roundtrip retains branches, actions and layout but excludes production channel bindings',()=>{
  const file={format:'boat-two-flow',version:1,name:'السفر',triggers:[{type:'any_message'}],channel_ids:['private-channel'],graph:{startNodeId:'start',nodes:[{id:'start',type:'interactive',position:{x:40,y:20},layout:{button:{x:500,y:20}},data:{text:'مرحبًا',buttons:[{id:'button',title:'رحلات',actions:[{type:'tag',add:['travel'],remove:[]}]}]},edges:{'option:button':'end'}},{id:'end',type:'end',data:{},edges:{}}]}};
  const parsed=flowTransferSchema.parse(JSON.parse(JSON.stringify(file)));
  assert.equal('channel_ids' in parsed,false);assert.deepEqual(parsed.graph,file.graph);
  assert.deepEqual(validateGraph(parsed.graph as any).errors,[]);
  assert.equal(flowTransferSchema.safeParse({...file,version:2}).success,false);
  assert.equal(updateFlowSchema.safeParse({folderName:'x'.repeat(81)}).success,false);
  assert.deepEqual(updateFlowSchema.parse({folderName:null}),{folderName:null});
});
