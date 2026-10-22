import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';

@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

  encrypt(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
  }

  decrypt<T>(payload: string): T {
    const [v, iv, tag, ct] = payload.split(':');
    if (v !== 'v1') throw new Error('Unsupported ciphertext version');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    const out = Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]);
    return JSON.parse(out.toString('utf8')) as T;
  }
}
