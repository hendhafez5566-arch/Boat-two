import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';
import { subscriptionHistory, subscriptionUsage } from './subscription-usage';

test('subscription meters match quota counters and keep attempts, tokens and cost separate', async () => {
  const db = new PGlite();
  const c = db as unknown as PoolClient;
  try {
    await db.exec(`
      CREATE TABLE contacts(id integer);
      CREATE TABLE memberships(id integer);
      CREATE TABLE channels(id integer);
      CREATE TABLE flows(id integer,is_component boolean);
      INSERT INTO memberships VALUES(1),(2);
      INSERT INTO channels VALUES(1);
      INSERT INTO flows VALUES(1,false),(2,true),(3,false);
      CREATE TABLE messages(direction text, is_internal boolean, created_at timestamptz);
      CREATE TABLE ai_usage(period date, replies integer, input_tokens integer, output_tokens integer);
      CREATE TABLE generation_usage(period date, baseline_calls integer, attempts integer,
        charged_tokens bigint,reserved_tokens bigint,charged_cost_microusd bigint,reserved_cost_microusd bigint);
      CREATE TABLE generation_policy(monthly_calls integer,monthly_tokens bigint,monthly_cost_microusd bigint);
      INSERT INTO contacts VALUES (1),(2);
      INSERT INTO messages VALUES ('out',false,now()),('in',false,now()),('out',true,now()),
        ('out',false,date_trunc('month',now()) - interval '2 days');
      INSERT INTO ai_usage VALUES (date_trunc('month',now())::date,2,8,9);
      INSERT INTO generation_usage VALUES (date_trunc('month',now())::date,2,4,19,7,50,10);
      INSERT INTO generation_policy VALUES (5,25,100);
    `);
    const usage = await subscriptionUsage(c, {
      status: 'active', trial_ends_at: null, current_period_end: null, plan_code: 'test',
      plan_name: 'Test', limits: { contacts: -1, messages_per_month: 2, ai_credits: 10, generation_token_budget: 30, agents:3, channels:1, flows:5 },
      features: {}, trial_expired: false,
    });
    assert.deepEqual(usage.messages, { used: 1, limit: 2, remaining: 1, percent: 50 });
    assert.deepEqual(usage.contacts, { used: 2, limit: -1, remaining: null, percent: null });
    assert.deepEqual(usage.resources.agents,{used:2,limit:3,remaining:1,percent:2/3*100});
    assert.deepEqual(usage.resources.channels,{used:1,limit:1,remaining:0,percent:100});
    assert.deepEqual(usage.resources.flows,{used:3,limit:5,remaining:2,percent:60});
    assert.equal(usage.resources.bots,2);
    assert.equal(usage.ai.used, 6);
    assert.equal(usage.ai.limit, 5);
    assert.equal(usage.ai.remaining, 0);
    assert.equal(usage.tokens.used, 26);
    assert.equal(usage.tokens.limit, 25);
    assert.equal(usage.knownCostMicrousd, '50');
    assert.equal(usage.reservedCostMicrousd, '10');
    const history = await subscriptionHistory(c);
    assert.equal(history.today, 1);
    assert.equal(history.previous, 1);
    assert.equal(history.days.at(-1).count, 1);
  } finally {
    await db.close();
  }
});
