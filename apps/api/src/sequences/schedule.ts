export type DelayUnit = 'minutes' | 'hours' | 'days';
export interface StepTiming {
  delay: { amount: number; unit: DelayUnit };
  /** وقت إرسال ثابت HH:MM بتوقيت الـ Sequence؛ يطبّق على الخطوة بدل الانتظار الحر */
  sendAt?: string;
}

const UNIT_MS: Record<DelayUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

function offsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** اللحظة (UTC) التي تكون فيها الساعة المحلية HH:MM في يوم محلي معيّن */
function localToUtc(y: number, mo: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz); // تصحيح ثانٍ عند حدود التوقيت الصيفي
  return new Date(t);
}

export function isClock(v: string | undefined | null): v is string {
  return !!v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/**
 * موعد تنفيذ الخطوة: base + التأخير، ثم (لو فيه وقت ثابت) أول مرة يتكرر فيها هذا الوقت المحلي بعد ذلك.
 * وقت التسليم الافتراضي للـ Sequence يطبّق فقط على الخطوات المقاسة بالأيام.
 */
export function computeNextRun(
  base: Date,
  step: StepTiming,
  tz: string,
  defaultSendAt?: string | null,
): Date {
  const t = new Date(base.getTime() + step.delay.amount * UNIT_MS[step.delay.unit]);
  const fixed = isClock(step.sendAt) ? step.sendAt : step.delay.unit === 'days' && isClock(defaultSendAt) ? defaultSendAt : null;
  if (!fixed) return t;
  const [hh, mm] = fixed.split(':').map(Number);
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(t)
    .split('-')
    .map(Number);
  let cand = localToUtc(local[0], local[1], local[2], hh, mm, tz);
  if (cand.getTime() < t.getTime()) {
    const next = new Date(Date.UTC(local[0], local[1] - 1, local[2] + 1));
    cand = localToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hh, mm, tz);
  }
  return cand;
}
