import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddedSignupSession } from './meta-signup';
const result = {
  type: 'WA_EMBEDDED_SIGNUP',
  event: 'FINISH',
  data: { waba_id: '123', phone_number_id: '456' },
};
test('Embedded Signup accepts FINISH before the SDK authorization callback', async () => {
  const session = embeddedSignupSession();
  session.receive('https://www.facebook.com', JSON.stringify(result));
  assert.deepEqual(await session.wait(), { wabaId: '123', phoneNumberId: '456' });
  session.dispose();
});
test('Embedded Signup waits for FINISH after the authorization callback', async () => {
  const session = embeddedSignupSession();
  const waiting = session.wait();
  session.receive('https://web.facebook.com', result);
  assert.deepEqual(await waiting, { wabaId: '123', phoneNumberId: '456' });
  session.dispose();
});
test('untrusted origins, malformed payloads and incomplete selections cannot attach accounts', async () => {
  const session = embeddedSignupSession(20);
  session.receive('https://facebook.com.attacker.example', result);
  session.receive('https://www.facebook.com', '{bad');
  session.receive('https://www.facebook.com', {
    ...result,
    data: { waba_id: '123', phone_number_id: '../456' },
  });
  session.receive('https://www.facebook.com', { ...result, event: 'CANCEL' });
  await assert.rejects(session.wait(), /did not complete/);
  session.dispose();
});
