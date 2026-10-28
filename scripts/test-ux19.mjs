// Focused UX contracts; Node 22.13+; run from repository root. No network, database or sends.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
{
const flowTypesURL='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync('apps/web/lib/flow-types.ts','utf8'))).toString('base64');
let s=readFileSync('apps/web/lib/flow-layout.ts','utf8').replaceAll("'./flow-types'",JSON.stringify(flowTypesURL));
const {computeLayout,hasLayoutOverlap}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64'));
const nodes=Array.from({length:40},(_,i)=>({id:'n'+i,position:{x:0,y:0},width:290,height:i%3?270:600,data:{type:'message',data:{buttons:Array.from({length:i%4},(_,j)=>({id:'b'+j,title:'زر'}))}}}));
const edges=nodes.slice(1,35).map((n,i)=>({source:nodes[Math.floor(i/3)].id,target:n.id}));edges.push({source:'n8',target:'n0'});
for(const rtl of [true,false]){const layout=computeLayout(nodes,edges,'n0',rtl);assert.equal(Object.keys(layout).length,40);assert.equal(hasLayoutOverlap(nodes.map(n=>({...n,position:layout[n.id]})),rtl),false);assert.deepEqual(computeLayout(nodes,edges,'n0',rtl),layout);}
assert.deepEqual(computeLayout([],[],'',true),{});console.log('PASS: 40-node layout, variable heights/buttons, cycle, disconnected nodes, RTL/LTR, empty graph');
}
{
const source=readFileSync('apps/web/lib/validation-message.ts','utf8');
const {validationMessage}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const engine=readFileSync('apps/api/src/flows/engine/validate.ts','utf8');
const messages=[...engine.matchAll(/message: '([^']+)'/g)].map(x=>x[1]);for(const m of messages){assert.match(validationMessage(m,'ar'),/[\u0600-\u06ff]/);assert.equal(validationMessage(m,'en'),m);}
assert.ok(!validationMessage('Output "option:raw-id" points to a missing node','ar').includes('raw-id'));
console.log('PASS: all '+messages.length+' engine messages localized; technical output IDs hidden');
}
{
const {scaledAmount}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(readFileSync('apps/web/lib/report-format.ts','utf8'))).toString('base64'));
assert.equal(scaledAmount('123456',2,'en-US','EGP'),'1,234.56 EGP');assert.equal(scaledAmount('1',6,'en-US','USD'),'0.000001 USD');assert.equal(scaledAmount('-1',2,'en-US','USD'),'−0.01 USD');assert.equal(scaledAmount('900719925474099301',2,'en-US','USD'),'9,007,199,254,740,993.01 USD');assert.equal(scaledAmount('0',2,'en-US','USD'),'0.00 USD');assert.equal(scaledAmount('123.4',2,'en-US','USD'),'—');assert.match(scaledAmount('123456',2,'ar-EG','EGP'),/١٬٢٣٤٫٥٦/);console.log('PASS: cents/micro-USD, negative/zero values, large exact integers, invalid units, Arabic digits');
}
