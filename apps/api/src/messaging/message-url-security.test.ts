import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contentSchema,validateOutbound} from './message-content';
test('new message schemas and constructed engine output reject active URL schemes and embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,unsafe','file:///etc/passwd','https://u:p@example.test/f']){
  for(const content of [{media:{kind:'file',url}},{header:{type:'image',url},text:'x'},{cta:{text:'open',url},text:'x'},{template:{name:'test',language:'en',bodyParams:[],header:{type:'image',url}}}]){
   assert.equal(contentSchema.safeParse(content).success,false);
   assert.throws(()=>validateOutbound(content as never),/Unsafe message URL/);
  }
 }
 for(const url of ['https://example.test/file.pdf','http://localhost:4000/files/test.png']){
  assert.equal(contentSchema.safeParse({media:{kind:'file',url}}).success,true);
 }
});
