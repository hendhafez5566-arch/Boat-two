import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateGraph} from './engine/validate';
import type {FlowNode} from './engine/types';
function errors(type:string,data:unknown){return validateGraph({startNodeId:'a',nodes:[{id:'a',type,data,edges:{}} as FlowNode]}).errors;}
test('publish rejects static unsafe URLs in every outbound node URL position',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','https://user:password@example.test/a']){
  for(const type of ['image','audio','video','file'])assert.ok(errors(type,{url}).length,type+' '+url);
  assert.ok(errors('message',{text:'Hello',media:{kind:'image',url}}).length);
  assert.ok(errors('cta_url',{text:'Hello',buttonText:'Open',url}).length);
  assert.ok(errors('template',{name:'sample',header:{type:'image',url}}).length);
 }
 for(const url of ['https://example.test/a','http://example.test/a','{{asset_url}}','https://example.test/{{path}}'])assert.equal(errors('image',{url}).length,0);
});
test('publish rejects invalid literal coordinates but preserves zero, Arabic digits and variables',()=>{
 for(const data of [{lat:'91',lng:'0'},{lat:'0',lng:'181'},{lat:'NaN',lng:'31'}])assert.ok(errors('location',data).length);
 for(const data of [{lat:'0',lng:'0'},{lat:'٣٠',lng:'٣١'},{lat:'{{latitude}}',lng:'31'}])assert.equal(errors('location',data).length,0);
});
