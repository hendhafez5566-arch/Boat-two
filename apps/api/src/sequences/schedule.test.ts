import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeNextRun } from './schedule';

const base = new Date('2026-10-24T10:00:00Z');

test('free delays add minutes/hours/days', () => {
  assert.equal(computeNextRun(base, { delay: { amount: 30, unit: 'minutes' } }, 'UTC').toISOString(), '2026-10-24T10:30:00.000Z');
  assert.equal(computeNextRun(base, { delay: { amount: 8, unit: 'hours' } }, 'UTC').toISOString(), '2026-10-24T18:00:00.000Z');
});

test('fixed send time moves to the next occurrence in the sequence time zone', () => {
  // Cairo is UTC+3 on 2026-10-24 (EEST ends Oct 30): 09:00 local = 06:00Z
  // base+1d = Oct 25 13:00 local, so 09:00 already passed that day → Oct 26 09:00 local
  const d = computeNextRun(base, { delay: { amount: 1, unit: 'days' }, sendAt: '09:00' }, 'Africa/Cairo');
  assert.equal(d.toISOString(), '2026-10-26T06:00:00.000Z');
  // already past 09:00 local on the target day → wait for next day
  const e = computeNextRun(new Date('2026-10-24T08:00:00Z'), { delay: { amount: 0, unit: 'hours' }, sendAt: '09:00' }, 'Africa/Cairo');
  assert.equal(e.toISOString(), '2026-10-25T06:00:00.000Z');
});

test('default delivery time applies to day-based steps only', () => {
  const days = computeNextRun(base, { delay: { amount: 2, unit: 'days' } }, 'UTC', '00:00');
  assert.equal(days.toISOString(), '2026-10-27T00:00:00.000Z');
  const hours = computeNextRun(base, { delay: { amount: 2, unit: 'hours' } }, 'UTC', '00:00');
  assert.equal(hours.toISOString(), '2026-10-24T12:00:00.000Z');
});
