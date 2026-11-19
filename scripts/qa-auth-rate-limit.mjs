import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Nonexistent synthetic account: no owner/customer identity is ever locked.
const email = `rate-${randomUUID()}@example.test`;
const outcomes = await Promise.all(Array.from({length:24}, async () => {
  const response = await fetch('http://localhost:4000/auth/login', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({email,password:'Synthetic-wrong-password'}),
  });
  return response.status;
}));
assert.equal(outcomes.filter(s=>s===401).length,15);
assert.equal(outcomes.filter(s=>s===429).length,9);
const other = await fetch('http://localhost:4000/auth/login', {
  method:'POST', headers:{'content-type':'application/json'},
  body:JSON.stringify({email:`rate-${randomUUID()}@example.test`,password:'Synthetic-wrong-password'}),
});
assert.equal(other.status,401);
console.log('AUTH RATE ACCEPTANCE PASS: 24 concurrent requests, exactly 15 accepted checks, isolated identity');
