export function billingDate(value: string, language: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

export function billingMoney(minor: string | number, currency: string) {
  const code = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(Number(minor))) return '—';
  const exponent = [
    'BIF',
    'CLP',
    'DJF',
    'GNF',
    'JPY',
    'KMF',
    'KRW',
    'MGA',
    'PYG',
    'RWF',
    'UGX',
    'VND',
    'VUV',
    'XAF',
    'XOF',
    'XPF',
  ].includes(code)
    ? 0
    : ['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(code)
      ? 3
      : 2;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(
      Number(minor) / 10 ** exponent,
    );
  } catch {
    return '—';
  }
}
export function billingDocument(value: string | null) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com'))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export type BillingPlan = {
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  limits: Record<string, number>;
};
export type BillingWorkspace = {
  role: string;
  plan: { plan_code: string; plan_name: string; status: string; trial_ends_at: string | null };
};
export type BillingStatus = {
  configured: boolean;
  portalAvailable: boolean;
  subscription?: {
    currentPeriodEnd: string | null;
    linked: boolean;
    status: string;
    cancelAtPeriodEnd: boolean;
  } | null;
};
