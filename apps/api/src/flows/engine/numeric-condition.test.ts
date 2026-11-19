import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateCondition, Operands} from './conditions';
const operands=(amount:unknown):Operands=>({vars:{amount},contact:{attributes:{}},channelType:'web',lastText:'',resolve:()=>undefined});
test('numeric ordering cannot treat an empty or unresolved threshold as zero',()=>{
 for(const value of ['', '   ', '{{missing}}', 'Infinity', '-Infinity', 'NaN', ',']){
  assert.equal(evaluateCondition({source:'variable',key:'amount',operator:'greater_than',value},operands(100)),false,value);
  assert.equal(evaluateCondition({source:'variable',key:'amount',operator:'less_than',value},operands(-100)),false,value);
 }
});
test('numeric ordering requires a finite actual value but accepts real zero and Arabic digits',()=>{
 for(const amount of [undefined,null,'','  ','Infinity',Infinity,NaN,',']){
  assert.equal(evaluateCondition({source:'variable',key:'amount',operator:'less_than',value:'10'},operands(amount)),false,String(amount));
  assert.equal(evaluateCondition({source:'variable',key:'amount',operator:'greater_than',value:'-10'},operands(amount)),false,String(amount));
 }
 assert.equal(evaluateCondition({source:'variable',key:'amount',operator:'greater_than',value:'٠'},operands('١,٢٣٤')),true);
 assert.equal(evaluateCondition({source:'variable',key:'amount',operator:'less_than',value:'١٠'},operands(0)),true);
});
