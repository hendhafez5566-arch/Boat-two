import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contactWhere,filtersSchema,conditionWhere,conditionsSchema} from './schemas';
test('combined filters bind relationships without interpreting list membership as consent',()=>{
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
 const w=contactWhere(filtersSchema.parse({channelId:ids[0],listId:ids[1],sequenceId:ids[2],sequenceStatus:'active',consentStatus:'opted_in'}));
 assert.match(w.sql,/contact_list_members/);assert.match(w.sql,/sequence_enrollments/);assert.match(w.sql,/contact_consents/);for(const id of ids)assert.equal(w.sql.includes(id),false);assert.equal(w.params.length,10);
 const base=contactWhere(filtersSchema.parse({q:'%_'}));assert.equal(base.params.length,4);assert.equal(base.params[0],'%\\%\\_%');
 const tree=conditionWhere(conditionsSchema.parse({allOf:[{listId:ids[1]}],anyOf:[{consentStatus:'unknown'}]}));assert.ok(Math.max(...Array.from(tree.sql.matchAll(/\$(\d+)/g),m=>Number(m[1])))<=tree.params.length);
});
