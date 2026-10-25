import assert from 'node:assert/strict';
import {test} from 'node:test';
import {googleOperationSchema,googleRequest,valuesCsv} from './contracts';
import {providerRequest} from './provider-request';
test('Google read/write/calendar requests preserve scope boundaries and never invite attendees',()=>{
 const read=googleRequest(googleOperationSchema.parse({operation:'sheet_read',spreadsheetId:'abcdefghijk',range:'A1:B2'}));assert.equal(read.method,'GET');assert.match(read.scope,/readonly$/);
 const write=googleRequest(googleOperationSchema.parse({operation:'sheet_append',spreadsheetId:'abcdefghijk',range:'Sheet1!A:B',values:[['Ada',1]]}));assert.equal(write.method,'POST');assert.match(write.url,/valueInputOption=RAW/);assert.deepEqual(write.body,{values:[['Ada',1]]});
 const event=googleRequest(googleOperationSchema.parse({operation:'calendar_event',calendarId:'primary',summary:'Appointment',start:'2026-10-26T10:00:00Z',end:'2026-10-26T11:00:00Z'}));assert.match(event.url,/sendUpdates=none/);assert.equal('attendees' in event.body!,false);
 assert.throws(()=>googleRequest({operation:'calendar_event',calendarId:'primary',summary:'x',start:'2026-10-26T11:00:00Z',end:'2026-10-26T10:00:00Z',timezone:'UTC'}));assert.equal(valuesCsv([['name','note'],['Ada','a,"b"']]),'"name","note"\n"Ada","a,""b"""');
});
test('mailing adapters build provider-specific requests rather than generic success stubs',()=>{
 const mail=providerRequest('mailchimp',{listId:'list'},'key-us21',{email:'ADA@EXAMPLE.TEST',name:'Ada'});assert.match(mail.url,/us21.api.mailchimp.com/);assert.equal(mail.method,'PUT');assert.match(mail.headers.Authorization,/^Basic /);
 const brevo=providerRequest('brevo',{listId:'2'},'secret',{email:'ada@example.test'});assert.equal(brevo.headers['api-key'],'secret');assert.deepEqual(JSON.parse(brevo.body!).listIds,[2]);
 assert.throws(()=>providerRequest('mailchimp',{listId:'x'},'invalid',{}));assert.throws(()=>providerRequest('brevo',{listId:'abc'},'secret',{}));
});
