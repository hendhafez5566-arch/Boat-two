import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { parse, sparsePatch } from './zod';
test('sparse patches preserve omitted create defaults and retain explicit false/empty values', () => {
  const schema=sparsePatch(z.object({name:z.string(),enabled:z.boolean().default(true),origins:z.array(z.string().url()).default([])}).partial());
  assert.deepEqual(parse(schema,{name:'Renamed'}),{name:'Renamed'});
  assert.deepEqual(parse(schema,{enabled:false,origins:[]}),{enabled:false,origins:[]});
  assert.deepEqual(parse(schema,{}),{});
  assert.throws(()=>parse(schema,{origins:['not a URL']}));
  assert.throws(()=>parse(schema,null));
});
