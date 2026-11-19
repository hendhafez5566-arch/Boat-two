import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedRegexTest } from './bounded-regex';
import { parseAnswer } from './engine';
import { evaluateCondition } from './conditions';

test('bounded configurable regex preserves Arabic, English, lookaround and backreferences', () => {
  for (const [pattern, value] of [['^الق', 'القاهرة'], ['^hello$', 'HELLO'], ['^(a)\\1$', 'aa'], ['a(?=b)', 'ab']])
    assert.equal(boundedRegexTest(pattern, value), true);
  for (const pattern of ['(', '', 'x'.repeat(201)]) assert.equal(boundedRegexTest(pattern, 'a'), false);
});
test('catastrophic patterns cannot pin the flow process; next evaluations still succeed', { timeout: 2000 }, () => {
  const text = 'a'.repeat(100) + '!';
  for (const pattern of ['(a+)+$', '(a|aa)+$']) {
    const start = performance.now();
    assert.equal(boundedRegexTest(pattern, text), false);
    assert.ok(performance.now()-start < 1000);
  }
  assert.equal(boundedRegexTest('^ok$', 'ok'), true);
});
test('question validation and condition routing share the time budget, including legacy patterns', { timeout: 2000 }, () => {
  const text = 'a'.repeat(100)+'!';
  assert.deepEqual(parseAnswer(text, 'regex', '(a+)+$'), {ok:false});
  assert.equal(evaluateCondition({source:'last_message',operator:'matches_regex',value:'(a+)+$'}, {
    vars:{},contact:{attributes:{}},channelType:'web',lastText:text,resolve:()=>undefined,
  }), false);
  assert.deepEqual(parseAnswer('ABC', 'regex', '^abc$'), {ok:true,value:'ABC'});
});

test('shared budget stops amplification across branches', {timeout:2000}, () => {
 const budget={remainingMs:60}, started=performance.now();
 for(let i=0;i<100;i++)assert.equal(boundedRegexTest('(a+)+$', 'a'.repeat(100)+'!', budget),false);
 assert.ok(performance.now()-started<500);
 assert.equal(boundedRegexTest('^ok$', 'ok', {remainingMs:0}),false);
});
