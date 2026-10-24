import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const url=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64');
const types=await import(url(readFileSync('apps/web/lib/flow-types.ts','utf8')));
const {convertChoices,patchChoice,moveChoice,insertToken,ACTION_TYPES}=await import(url(readFileSync('apps/web/lib/smart-editor.ts','utf8').replace("import { NodeType } from './flow-types';",'')));
const data={text:'أهلًا',custom:{retain:true},list:{buttonText:'اختار',sections:[{title:'أول',rows:[{id:'a',title:'حجز',description:'رحلة'}]},{title:'ثان',rows:[{id:'b',title:'موظف'}]}]}};
const before=structuredClone(data),changed=patchChoice(data,'b',{id:'bad',title:'دعم'});
assert.equal(changed.list.sections[1].rows[0].id,'b');assert.equal(changed.list.sections[0].title,'أول');assert.deepEqual(data,before);
const buttons=convertChoices(data,'buttons');assert.deepEqual(buttons.buttons.map(c=>c.id),['a','b']);assert.deepEqual(convertChoices(buttons,'list').list.sections[0].rows,buttons.buttons);
assert.deepEqual(moveChoice(buttons.buttons,'a',1).map(c=>c.id),['b','a']);assert.deepEqual(data,before);
assert.throws(()=>convertChoices({buttons:Array.from({length:11},(_,i)=>({id:String(i),title:'زر'}))},'list'));
assert.deepEqual(insertToken('أهلًا {{',8,8,'contact.name'),{text:'أهلًا {{contact.name}}',caret:22});
for(const type of ACTION_TYPES){
 const g={startNodeId:'welcome',nodes:[{id:'welcome',type:'message',position:{x:0,y:0},data:{text:'أهلًا',buttons:buttons.buttons},edges:{'option:a':`step-${type}`,'option:b':'staff'}},{id:`step-${type}`,type,position:{x:700,y:0},data:types.NODE_META[type].defaults(),edges:{}},{id:'staff',type:'handoff',position:{x:700,y:800},data:{message:'موظف'},edges:{}}]};
 const canvas=types.toFlow(g);assert.deepEqual(types.fromFlow(canvas.nodes,canvas.edges,g.startNodeId),g);
 const converted={...g,nodes:g.nodes.map(n=>n.id==='welcome'?{...n,data:convertChoices(n.data,'list')}:n)};
 const c=types.toFlow(converted);assert.deepEqual(types.fromFlow(c.nodes,c.edges,g.startNodeId),converted);
}
for(const type of Object.keys(types.NODE_META)){
 const g={startNodeId:type,nodes:[{id:type,type,position:{x:0,y:0},data:types.NODE_META[type].defaults(),edges:{}}]};
 const c=types.toFlow(g);assert.deepEqual(types.fromFlow(c.nodes,c.edges,type),g,type);
}
console.log('PASS: all NodeTypes roundtrip; all action node types; stable branch links; multi-section edits; reversible conversion; non-mutation; reorder and caret insertion');
const rules=[{id:'stable-rule',match:'any',conditions:[{source:'variable',key:'service_id',operator:'equals',value:'booking'},{source:'contact_field',key:'phone',operator:'is_set'},{source:'label',operator:'contains',value:'VIP'},{source:'contact_attribute',key:'departure',operator:'greater_than',value:'2'},{source:'channel',operator:'equals',value:'web'},{source:'last_message',operator:'contains',value:'عمرة'}]}];
const condition={startNodeId:'check',nodes:[{id:'check',type:'condition',position:{x:50,y:80},data:{rules,extra:'preserved'},edges:{'rule:stable-rule':'yes',else:'no'}},...['yes','no'].map(id=>({id,type:'end',position:{x:900,y:id==='yes'?0:500},data:{},edges:{}}))]};
const canvas=types.toFlow(condition);assert.deepEqual(types.fromFlow(canvas.nodes,canvas.edges,'check'),condition);
console.log('PASS: rich ALL/ANY condition rules and all existing sources retain IDs, unknown data and exact branch outcomes');
