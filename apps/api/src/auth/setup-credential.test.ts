import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSetupCredential,isSetupCredential,verifyPassword,verifySetupCredential} from './password';
test('temporary credentials are random, hashed, time limited and cannot be ordinary passwords',async()=>{
 const first=await createSetupCredential(),second=await createSetupCredential();
 assert.notEqual(first.temporaryPassword,second.temporaryPassword);
 assert.ok(isSetupCredential(first.stored));
 assert.ok(!first.stored.includes(first.temporaryPassword));
 assert.equal(await verifyPassword(first.temporaryPassword,first.stored),false);
 assert.equal(await verifySetupCredential(first.temporaryPassword,first.stored),true);
 assert.equal(await verifySetupCredential(second.temporaryPassword,first.stored),false);
 const expired=first.stored.replace(/^setup\$\d+\$/,()=> 'setup$1$');
 assert.equal(await verifySetupCredential(first.temporaryPassword,expired),false);
 assert.ok(Date.parse(first.expiresAt)>Date.now());
});
