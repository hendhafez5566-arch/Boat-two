import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sniffMatches} from './storage';
test('declared audio/video/office types require matching container signatures',()=>{
 for(const mime of ['audio/mpeg','audio/ogg','audio/aac','audio/mp4','video/mp4','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])assert.equal(sniffMatches(mime,Buffer.from('<html>unsafe</html>')),false,mime);
 for(const [mime,bytes] of [['audio/mpeg',[0x49,0x44,0x33]],['audio/aac',[0xff,0xf1]],['audio/ogg',[79,103,103,83]],['video/mp4',[0,0,0,20,102,116,121,112,105,115,111,109]],['audio/mp4',[0,0,0,20,102,116,121,112,77,52,65,32]]] as const)assert.equal(sniffMatches(mime,Buffer.from(bytes)),true,mime);
});
test('text uploads accept UTF-8 Arabic/CSV but reject executable binary and invalid encoding',()=>{
 assert.ok(sniffMatches('text/plain',Buffer.from('مرحبا\nHello')));assert.ok(sniffMatches('text/csv',Buffer.from('name,price\nمنتج,20')));
 assert.equal(sniffMatches('text/plain',Buffer.from([0,1,2,3])),false);assert.equal(sniffMatches('text/csv',Buffer.from([0xff,0xfe,0x80])),false);
});
