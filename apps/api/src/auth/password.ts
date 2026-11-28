import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A setup credential is deliberately not a normal password hash. Only the
 * login activation path can consume it; all other password checks reject it. */
export async function createSetupCredential(){
  const temporaryPassword=randomBytes(24).toString('base64url');
  const expiresAt=new Date(Date.now()+7*86400000);
  const stored='setup$'+expiresAt.getTime()+'$'+await hashPassword(temporaryPassword);
  return {temporaryPassword,expiresAt:expiresAt.toISOString(),stored};
}
export function isSetupCredential(stored:string|null):boolean{return !!stored?.startsWith('setup$');}
export async function verifySetupCredential(password:string,stored:string|null):Promise<boolean>{
  if(!stored||!isSetupCredential(stored))return false;
  const end=stored.indexOf('$',6);
  const expires=Number(stored.slice(6,end));
  return end>6&&Number.isFinite(expires)&&expires>Date.now()&&await verifyPassword(password,stored.slice(end+1));
}
