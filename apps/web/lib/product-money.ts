/** Existing commerce storage uses hundredths for every currency. Keep decimal input exact. */
export function productMinorUnits(value: string): string {
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a positive price with at most two decimal places');
  return (BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))).toString();
}
export function productDecimal(value: string): string {
  const cents = BigInt(value);
  const fraction = String(cents % 100n).padStart(2, '0').replace(/0+$/, '');
  return `${cents / 100n}${fraction ? `.${fraction}` : ''}`;
}
export function productPrice(value: string, currency: string): string {
  return `${productDecimal(value)} ${currency}`;
}
