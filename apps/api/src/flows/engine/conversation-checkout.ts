import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { checkoutSchema } from '../../commerce/checkout';
import { priceText } from '../../commerce/contracts';
import type { CheckoutProduct, Selection } from '../../commerce/checkout';
import type { OutContent } from './types';

export type CheckoutTerms = { totalCents: string | null; currency: string };
export type PendingCheckout = {
  product: CheckoutProduct;
  requestId: string;
  selection: Selection;
  step: 'package' | 'options' | 'quantity' | 'questions' | 'confirm';
  questionIndex: number;
  terms?: CheckoutTerms;
};
type CheckoutDeps = {
  quote(selection: Selection): Promise<CheckoutTerms>;
  save(selection: Selection, requestId: string, terms: CheckoutTerms, followup: boolean): Promise<{ id: string }>;
};

export function beginConversationCheckout(product: CheckoutProduct): PendingCheckout {
  const config = checkoutSchema.parse(product.checkout ?? {});
  return {
    product,
    requestId: randomUUID(),
    selection: { productId: product.id, options: [], answers: [], quantity: config.min },
    step: config.packages.length ? 'package' : product.options.length ? 'options' : 'quantity',
    questionIndex: 0,
  };
}

function numbered(labels: string[], length = 75) {
  return labels.map((name, index) => `${index + 1}. ${name.slice(0, length)}`).join('\n');
}

function questionFor(state: PendingCheckout) {
  return checkoutSchema.parse(state.product.checkout ?? {}).questions
    .filter((q) => !q.packageId || q.packageId === state.selection.packageId)[state.questionIndex];
}

export function checkoutPrompt(state: PendingCheckout): string {
  const config = checkoutSchema.parse(state.product.checkout ?? {});
  switch (state.step) {
    case 'package':
      return 'اختَر رقم الباقة / Choose a package number\n' + numbered(config.packages.map((p) => p.name));
    case 'options':
      return 'أرقام الإضافات مفصولة بفواصل أو 0 / Add-on numbers separated by commas or 0\n' +
        numbered(state.product.options.map((o) => o.name), 28);
    case 'quantity':
      return `الكمية / Quantity (${config.min}–${config.max})`;
    case 'questions': {
      const q = questionFor(state)!;
      return [q.label, q.type === 'date' ? 'YYYY-MM-DD' : '',
        q.type === 'list' ? numbered(q.choices) : '', q.required ? '' : '/skip = تخطّي / Skip'].filter(Boolean).join('\n');
    }
    case 'confirm': {
      const pack = config.packages.find((item) => item.id === state.selection.packageId);
      return [
        `${state.product.name} × ${state.selection.quantity}`,
        pack ? 'الباقة / Package: ' + pack.name : '',
        state.selection.options.length ? 'الإضافات / Add-ons: ' + state.selection.options.join(', ').slice(0, 1800) : '',
        state.terms!.totalCents === null ? 'طلب عرض سعر / Request a quote' :
          priceText(state.terms!.totalCents, state.terms!.currency),
        '1 = تأكيد / Confirm', '0 = إلغاء / Cancel',
      ].filter(Boolean).join('\n');
    }
  }
}

function checkoutChoices(state: PendingCheckout): { value: string; title: string }[] {
  const config = checkoutSchema.parse(state.product.checkout ?? {});
  const numberedChoices = (labels: string[]) => labels.map((title, index) => ({ title, value: String(index + 1) }));
  switch (state.step) {
    case 'package':
      return numberedChoices(config.packages.map((pack) => pack.name));
    case 'options':
      return state.product.options.length === 1
        ? [{ value: '1', title: state.product.options[0].name }, { value: '0', title: 'بدون إضافة / Skip' }]
        : [];
    case 'questions': {
      const question = questionFor(state);
      if (question?.type !== 'list') return [];
      const choices = numberedChoices(question.choices);
      if (!question.required) choices.push({ value: '/skip', title: 'تخطّي / Skip' });
      return choices;
    }
    case 'confirm':
      return [{ value: '1', title: 'تأكيد / Confirm' }, { value: '0', title: 'إلغاء / Cancel' }];
    default:
      return [];
  }
}

function replyId(state: PendingCheckout, value: string) {
  return `checkout:${state.requestId}:${state.step}:${state.questionIndex}:${value}`;
}

export function checkoutPromptContent(state: PendingCheckout, channel: string): OutContent {
  const text = checkoutPrompt(state);
  const choices = checkoutChoices(state);
  if (!['web', 'whatsapp'].includes(channel) || !choices.length || choices.length > 10 || text.length > 1024)
    return { text };
  const rows = choices.map(({ value, title }) => ({ id: replyId(state, value), title }));
  if (rows.length <= 3 && rows.every(({ title }) => [...title].length <= 20))
    return { text, buttons: rows };
  if (rows.every(({ title }) => [...title].length <= 24))
    return { text, list: { buttonText: 'اختَر / Choose', sections: [{ rows }] } };
  return { text };
}

export function checkoutReply(state: PendingCheckout, channel: string, id: string | undefined, text: string) {
  if (!id) return text;
  const content = checkoutPromptContent(state, channel);
  const rows = content.buttons ?? content.list?.sections.flatMap((section) => section.rows) ?? [];
  if (!rows.some((row) => row.id === id)) return null;
  return checkoutChoices(state).find((choice) => replyId(state, choice.value) === id)?.value ?? null;
}

export async function advanceConversationCheckout(state: PendingCheckout, raw: string, deps: CheckoutDeps, followup: boolean) {
  const text = raw.trim();
  const digits = text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) % 16)).replace(/،/g, ',');
  const config = checkoutSchema.parse(state.product.checkout ?? {});
  const again = () => ({ done: false, text: checkoutPrompt(state) });
  const index = /^\d+$/.test(digits) ? Number(digits) - 1 : -1;
  switch (state.step) {
    case 'package': {
      const pack = config.packages[index];
      if (!pack) return again();
      state.selection.packageId = pack.id;
      state.step = state.product.options.length ? 'options' : 'quantity';
      return again();
    }
    case 'options': {
      if (!/^\d+(?:\s*,\s*\d+)*$/.test(digits)) return again();
      const indexes = digits === '0' ? [] : digits.split(',').map((value) => Number(value) - 1);
      if (new Set(indexes).size !== indexes.length || indexes.some((i) => !state.product.options[i])) return again();
      state.selection.options = indexes.map((i) => state.product.options[i].name);
      state.step = 'quantity';
      return again();
    }
    case 'quantity':
      if (index + 1 < config.min || index + 1 > config.max) return again();
      state.selection.quantity = index + 1;
      break;
    case 'questions': {
      const q = questionFor(state)!;
      const value = text.toLowerCase() === '/skip' && !q.required ? '' : q.type === 'list' ? q.choices[index] :
        ['number', 'date'].includes(q.type) ? digits : text;
      if (value === undefined || (!value && q.required) || value.length > 1500 ||
        (value && q.type === 'number' && (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) ||
        (value && q.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value))) return again();
      if (value) state.selection.answers.push({ id: q.id, value });
      state.questionIndex++;
      break;
    }
    case 'confirm':
      if (digits === '0') return { done: true, text: 'تم إلغاء الطلب / Checkout cancelled.' };
      if (digits !== '1') return again();
      try {
        const saved = await deps.save(state.selection, state.requestId, state.terms!, followup);
        return { done: true, text: 'تم تسجيل الطلب / Order saved: ' + saved.id };
      } catch (e) {
        if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
        return { done: true, text: 'تغيّر السعر أو التوافر. ابدأ طلبًا جديدًا / Price or availability changed. Start a new order.' };
      }
  }
  if (questionFor(state)) {
    state.step = 'questions';
    return again();
  }
  try {
    state.terms = await deps.quote(state.selection);
    state.step = 'confirm';
    return again();
  } catch (e) {
    if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
    return { done: true, text: 'الاختيار غير متاح. ابدأ طلبًا جديدًا / Selection unavailable. Start a new order.' };
  }
}
