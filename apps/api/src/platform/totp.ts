import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return result;
}
export function totp(secret: string, step: number, digits = 6) {
  if (
    !/^[A-Z2-7]{32}$/.test(secret) ||
    !Number.isSafeInteger(step) ||
    step < 0 ||
    ![6, 8].includes(digits)
  )
    throw new Error('Invalid TOTP input');
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(),
    offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}
export function matchingTotpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const delta of [0, -1, 1])
    if (
      step + delta >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, step + delta)), Buffer.from(code))
    )
      return step + delta;
  return null;
}
