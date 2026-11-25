import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutSchema, calculateCheckout } from '../../commerce/checkout';
import { beginConversationCheckout, checkoutPrompt, checkoutPromptContent, advanceConversationCheckout } from './conversation-checkout';
import type { CheckoutProduct, Selection } from '../../commerce/checkout';

const id = '11111111-1111-4111-8111-111111111111';
const product = (checkout: Record<string, unknown>): CheckoutProduct => ({
  id, name: 'غرفة رباعي', currency: 'EGP', price_cents: '6000000',
  checkout, options: [],
});
test('booking separates rooms from travelers and records the booker before confirmation', async () => {
  const current = beginConversationCheckout(product({
    quantityUnit: 'room', collectCustomerName: true, askTravelers: true, language: 'ar',
  }));
  assert.match(checkoutPrompt(current), /غرف/);
  let quotes = 0, saves = 0, savedSelection: Selection | undefined;
  const deps = {
    quote: async (selection: Selection) => {
      quotes++;
      assert.equal(selection.quantity, 3);
      assert.equal(selection.travelers, 2);
      assert.equal(selection.customerName, 'محمد علي');
      return { totalCents: '18000000', currency: 'EGP' };
    },
    save: async (selection: Selection) => {
      saves++;
      savedSelection = selection;
      return { id: 'c3c71308-68e1-4580-9449-56d8da9dde73' };
    },
  };
  await advanceConversationCheckout(current, '٣', deps, false);
  assert.equal(current.step, 'customer_name');
  await advanceConversationCheckout(current, '1', deps, false);
  assert.equal(current.step, 'customer_name', 'a numeric-only value is not a name');
  await advanceConversationCheckout(current, 'محمد علي', deps, false);
  assert.equal(current.step, 'travelers');
  await advanceConversationCheckout(current, '٢', deps, false);
  assert.equal(current.step, 'confirm');
  assert.match(checkoutPrompt(current), /3 غرف/);
  assert.match(checkoutPrompt(current), /المسافرون: 2/);
  assert.match(checkoutPrompt(current), /محمد علي/);
  assert.match(checkoutPrompt(current), /180000.00 EGP/);
  assert.equal(quotes, 1);
  assert.equal(saves, 0);
  const buttons = checkoutPromptContent(current, 'whatsapp').buttons;
  assert.deepEqual(buttons?.map((button) => button.title), ['تأكيد الطلب', 'إلغاء']);
  const done = await advanceConversationCheckout(current, '1', deps, false);
  assert.equal(done.done, true);
  assert.equal(saves, 1);
  assert.match(done.text, /#C3C71308/);
  assert.doesNotMatch(done.text, /68e1-4580/);
  assert.equal(savedSelection?.travelers, 2);
  const snapshot = calculateCheckout(product({ quantityUnit: 'room' }), current.selection);
  assert.equal(snapshot.quantity, 3);
  assert.equal(snapshot.travelers, 2);
  assert.equal(snapshot.customerName, 'محمد علي');
  assert.equal(snapshot.totalCents, '18000000');
});

test('existing products keep a generic unit and do not require newly configured questions', async () => {
  const state = beginConversationCheckout(product({}));
  assert.equal(checkoutSchema.parse({}).collectCustomerName, false);
  const mock = {
    quote: async () => ({ totalCents: '6000000', currency: 'EGP' }),
    save: async () => ({ id }),
  };
  const next = await advanceConversationCheckout(state, '1', mock, false);
  assert.equal(state.step, 'confirm');
  assert.match(next.text, /وحدات/);
  assert.doesNotMatch(next.text, /Quantity|Confirm/);
});

test('English checkout messages stay English and do not register a cancelled order', async () => {
  const state = beginConversationCheckout(product({ language: 'en', quantityUnit: 'person', collectCustomerName: true }));
  let saves = 0;
  const deps = {
    quote: async () => ({ totalCents: '6000000', currency: 'EGP' }),
    save: async () => { saves++; return { id }; },
  };
  assert.match(checkoutPrompt(state), /persons/);
  await advanceConversationCheckout(state, '1', deps, false);
  assert.equal(state.step, 'customer_name');
  await advanceConversationCheckout(state, 'Jane Doe', deps, false);
  assert.equal(state.step, 'confirm');
  const buttons = checkoutPromptContent(state, 'whatsapp').buttons;
  assert.deepEqual(buttons?.map((item) => item.title), ['Submit order', 'Cancel']);
  const cancelled = await advanceConversationCheckout(state, '0', deps, false);
  assert.equal(cancelled.done, true);
  assert.equal(saves, 0);
});
