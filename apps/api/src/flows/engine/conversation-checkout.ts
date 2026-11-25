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
  step: 'package' | 'options' | 'quantity' | 'questions' | 'customer_name' | 'travelers' | 'confirm';
  questionIndex: number;
  terms?: CheckoutTerms;
};
type CheckoutDeps = {
  quote(selection: Selection): Promise<CheckoutTerms>;
  save(selection: Selection, requestId: string, terms: CheckoutTerms, followup: boolean): Promise<{ id: string }>;
};
type Language = 'ar' | 'en';
type Unit = 'item' | 'person' | 'room' | 'package';

function tr(language: Language, ar: string, en: string) { return language === 'en' ? en : ar; }
function units(unit: Unit, lang: Language, plural = false) {
  const names: Record<Unit, [string, string, string]> = {
    item: ['وحدة', 'وحدات', 'item'],
    person: ['فرد', 'أفراد', 'person'],
    room: ['غرفة', 'غرف', 'room'],
    package: ['باقة', 'باقات', 'package'],
  };
  return lang === 'en' ? names[unit][2] + (plural ? 's' : '') : names[unit][plural ? 1 : 0];
}

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
  const lang = config.language;
  switch (state.step) {
    case 'package':
      return tr(lang, 'اختَر رقم الباقة:', 'Choose the package number:') + '\n' +
        numbered(config.packages.map((p) => p.name));
    case 'options':
      return tr(lang, 'اكتب أرقام الإضافات مفصولة بفواصل، أو 0 بدون إضافات:', 'Enter add-on numbers separated by commas, or 0 for none:') +
        '\n' + numbered(state.product.options.map((o) => o.name), 28);
    case 'quantity':
      return tr(
        lang,
        `كم ${units(config.quantityUnit, 'ar', true)} تريد حجزها؟ (${config.min}–${config.max})\nالسعر محسوب لكل ${units(config.quantityUnit, 'ar')}. عدد المسافرين لا يغير السعر تلقائيًا.`,
        `How many ${units(config.quantityUnit, 'en', true)} would you like? (${config.min}–${config.max})\nPrice is calculated per ${units(config.quantityUnit, 'en')}; traveler count is separate.`,
      );
    case 'questions': {
      const q = questionFor(state)!;
      return [q.label, q.type === 'date' ? 'YYYY-MM-DD' : '',
        q.type === 'list' ? numbered(q.choices) : '',
        q.required ? '' : tr(lang, 'اكتب /skip للتخطي', 'Type /skip to skip')].filter(Boolean).join('\n');
    }
    case 'customer_name':
      return tr(lang, 'من فضلك اكتب اسم صاحب الطلب قبل التأكيد:', 'Please enter the booker’s name before confirmation:');
    case 'travelers':
      return tr(lang, 'كم عدد المسافرين؟ (معلومة للحجز، لا تغيّر سعر الغرف أو الباقات)', 'How many travelers? (For booking details; this does not change the room/package price.)');
    case 'confirm': {
      const pack = config.packages.find((item) => item.id === state.selection.packageId);
      return [
        tr(lang, 'ملخص طلبك قبل التسجيل:', 'Review your order before submitting:'),
        state.product.name,
        tr(lang, `العدد: ${state.selection.quantity} ${units(config.quantityUnit, 'ar', state.selection.quantity !== 1)}`,
          `Quantity: ${state.selection.quantity} ${units(config.quantityUnit, 'en', state.selection.quantity !== 1)}`),
        state.selection.travelers ? tr(lang, `المسافرون: ${state.selection.travelers}`, `Travelers: ${state.selection.travelers}`) : '',
        state.selection.customerName ? tr(lang, 'اسم الحاجز: ', 'Booker: ') + state.selection.customerName : '',
        pack ? tr(lang, 'الباقة: ', 'Package: ') + pack.name : '',
        state.selection.options.length ? tr(lang, 'الإضافات: ', 'Add-ons: ') + state.selection.options.join(', ').slice(0, 1000) : '',
        state.terms?.totalCents === null ? tr(lang, 'طلب عرض سعر', 'Price quotation request') :
          priceText(state.terms!.totalCents!, state.terms!.currency),
        tr(lang, 'الطلب يحتاج مراجعة بعد إرساله ولا يعتبر حجزًا مؤكدًا.', 'The request will be reviewed; it is not a confirmed booking.'),
        tr(lang, '1 = تأكيد إرسال الطلب', '1 = Submit order'),
        tr(lang, '0 = إلغاء', '0 = Cancel'),
      ].filter(Boolean).join('\n');
    }
  }
}

function checkoutChoices(state: PendingCheckout): { value: string; title: string }[] {
  const config = checkoutSchema.parse(state.product.checkout ?? {});
  const lang = config.language;
  const numberedChoices = (labels: string[]) => labels.map((title, index) => ({ title, value: String(index + 1) }));
  switch (state.step) {
    case 'package': return numberedChoices(config.packages.map((pack) => pack.name));
    case 'options':
      return state.product.options.length === 1
        ? [{ value: '1', title: state.product.options[0].name },
           { value: '0', title: tr(lang, 'بدون إضافة', 'No add-on') }]
        : [];
    case 'questions': {
      const question = questionFor(state);
      if (question?.type !== 'list') return [];
      const choices = numberedChoices(question.choices);
      if (!question.required) choices.push({ value: '/skip', title: tr(lang, 'تخطي', 'Skip') });
      return choices;
    }
    case 'confirm':
      return [{ value: '1', title: tr(lang, 'تأكيد الطلب', 'Submit order') },
        { value: '0', title: tr(lang, 'إلغاء', 'Cancel') }];
    default: return [];
  }
}

function replyId(state: PendingCheckout, value: string) {
  return `checkout:${state.requestId}:${state.step}:${state.questionIndex}:${value}`;
}

export function checkoutPromptContent(state: PendingCheckout, channel: string): OutContent {
  const text = checkoutPrompt(state);
  const choices = checkoutChoices(state);
  const lang = checkoutSchema.parse(state.product.checkout ?? {}).language;
  if (!['web', 'whatsapp'].includes(channel) || !choices.length || choices.length > 10 || text.length > 1024)
    return { text };
  const rows = choices.map(({ value, title }) => ({ id: replyId(state, value), title }));
  if (rows.length <= 3 && rows.every(({ title }) => [...title].length <= 20))
    return { text, buttons: rows };
  if (rows.every(({ title }) => [...title].length <= 24))
    return { text, list: { buttonText: tr(lang, 'اختر', 'Choose'), sections: [{ rows }] } };
  return { text };
}

export function checkoutReply(state: PendingCheckout, channel: string, id: string | undefined, text: string) {
  if (!id) return text;
  const content = checkoutPromptContent(state, channel);
  const rows = content.buttons ?? content.list?.sections.flatMap((section) => section.rows) ?? [];
  if (!rows.some((row) => row.id === id)) return null;
  return checkoutChoices(state).find((choice) => replyId(state, choice.value) === id)?.value ?? null;
}

export async function advanceConversationCheckout(
  state: PendingCheckout, raw: string, deps: CheckoutDeps, followup: boolean,
) {
  const text = raw.trim();
  const digits = text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) % 16)).replace(/،/g, ',');
  const config = checkoutSchema.parse(state.product.checkout ?? {});
  const lang = config.language;
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
    case 'quantity': {
      const n = Number(digits);
      if (!/^\d+$/.test(digits) || n < config.min || n > config.max) return again();
      state.selection.quantity = n;
      break;
    }
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
    case 'customer_name': {
      const name = text.replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 120 || /^\d+$/.test(name)) return again();
      state.selection.customerName = name;
      break;
    }
    case 'travelers': {
      if (!/^\d+$/.test(digits) || Number(digits) < 1 || Number(digits) > 1000) return again();
      state.selection.travelers = Number(digits);
      break;
    }
    case 'confirm':
      if (digits === '0') return { done: true, text: tr(lang, 'تم إلغاء الطلب، ولم يُسجَّل أي حجز.', 'The request was cancelled. No booking was saved.') };
      if (digits !== '1') return again();
      try {
        const saved = await deps.save(state.selection, state.requestId, state.terms!, followup);
        // The internal UUID remains authoritative; the displayed prefix is a friendly reference, not a new identifier.
        const ref = String(saved.id).slice(0, 8).toUpperCase();
        return { done: true, text: tr(lang,
          `تم تسجيل طلبك رقم #${ref}.\nالطلب قيد المراجعة، وسيتم التواصل معك للتأكيد.`,
          `Your request #${ref} has been received.\nIt is under review and is not yet a confirmed booking.`) };
      } catch (e) {
        if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
        return { done: true, text: tr(lang, 'تغيّر السعر أو التوافر. ابدأ طلبًا جديدًا.', 'Price or availability changed. Please start a new order.') };
      }
  }
  if (questionFor(state)) {
    state.step = 'questions';
    return again();
  }
  if (config.collectCustomerName && !state.selection.customerName) {
    state.step = 'customer_name';
    return again();
  }
  if (config.askTravelers && !state.selection.travelers) {
    state.step = 'travelers';
    return again();
  }
  try {
    state.terms = await deps.quote(state.selection);
    state.step = 'confirm';
    return again();
  } catch (e) {
    if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
    return { done: true, text: tr(lang, 'الاختيار غير متاح. ابدأ طلبًا جديدًا.', 'Selection unavailable. Please start a new order.') };
  }
}
