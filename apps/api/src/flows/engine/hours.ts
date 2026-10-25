export type Schedule = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string][]>>;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** هل الوقت الحالي داخل ساعات العمل؟ يدعم الفترات التي تعبر منتصف الليل (مثل 22:00 → 02:00) */
export function isOpenNow(now: Date, timezone: string, schedule: Schedule): boolean {
  return openAt(now, makeFormatter(timezone), schedule);
}

function makeFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function openAt(now: Date, formatter: Intl.DateTimeFormat, schedule: Schedule): boolean {
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const day = WEEKDAY_IDX[get('weekday')];
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));

  for (const [start, end] of schedule[DAYS[day]] ?? []) {
    const s = toMin(start);
    const e = toMin(end);
    if (s <= e ? minutes >= s && minutes < e : minutes >= s) return true;
  }
  // الجزء المتبقي بعد منتصف الليل من فترة بدأت أمس
  for (const [start, end] of schedule[DAYS[(day + 6) % 7]] ?? []) {
    const s = toMin(start);
    const e = toMin(end);
    if (s > e && minutes < e) return true;
  }
  return false;
}

/** Minute precision, including DST and overnight intervals; bounded to eight days. */
export function nextOpening(now: Date, timezone: string, schedule: Schedule): Date | null {
  const formatter = makeFormatter(timezone);
  const first = Math.ceil((now.getTime() + 1) / 60000) * 60000;
  for (let i = 0; i <= 8 * 24 * 60; i++) {
    const date = new Date(first + i * 60000);
    if (openAt(date, formatter, schedule)) return date;
  }
  return null;
}
