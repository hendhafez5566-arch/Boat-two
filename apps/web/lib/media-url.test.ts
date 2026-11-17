import assert from 'node:assert/strict';
import {test} from 'node:test';
import {safeMediaUrl} from './media-url';
test('historical message URL rendering fails closed for executable schemes, credentials and malformed values',()=>{
 for(const value of [null,undefined,'javascript:alert(1)','java\nscript:alert(1)','data:text/html,unsafe','file:///etc/passwd','https://u:p@example.test/f','not a URL'])assert.equal(safeMediaUrl(value),null);
 assert.equal(safeMediaUrl('https://example.test/file.pdf'),'https://example.test/file.pdf');assert.ok(safeMediaUrl('http://localhost:4000/files/test.png'));
});
