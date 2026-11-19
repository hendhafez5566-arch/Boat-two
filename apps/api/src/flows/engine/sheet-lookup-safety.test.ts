import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lookupRow} from './sheet';
const rows=[['order','price'],['','EMPTY_CUSTOMER'],['AB123456','100'],['CD123456','200']];
test('missing or whitespace lookup never selects a row with an empty key',()=>{
 for(const value of ['','  '])assert.equal(lookupRow(rows,'order',value).row,null);
});
test('different alphanumeric identifiers cannot match solely by their digit suffix',()=>{
 assert.equal(lookupRow(rows,'order','CD123456').row?.price,'200');
 assert.equal(lookupRow(rows,'order','XY123456').row,null);
});
test('phone formatting and Arabic digits still identify the same intended phone',()=>{
 const phones=[['phone','name'],['+20 (100) 123-4567','Correct customer']];
 for(const value of ['201001234567','٢٠١٠٠١٢٣٤٥٦٧'])assert.equal(lookupRow(phones,'phone',value).row?.name,'Correct customer');
});
test('explicit first-row mode remains available when no lookup column is configured',()=>{
 assert.equal(lookupRow(rows,'','').row?.price,'EMPTY_CUSTOMER');
});
