/* eslint-disable @typescript-eslint/no-explicit-any */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { HttpRequestSpec, HttpResult } from './engine/types';

const MAX_BODY = 1024 * 1024;

/** عناوين داخلية/محجوزة يُمنع الاتصال بها (حماية من SSRF) */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('::ffff:')) {
      const rest = v.slice(7);
      if (net.isIPv4(rest)) return isBlockedIp(rest);
      const parts = rest.split(':');
      if (parts.length === 2) {
        const n = (parseInt(parts[0], 16) << 16) | parseInt(parts[1], 16);
        return isBlockedIp([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
      }
      return true;
    }
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b');
  }
  if (!net.isIPv4(ip)) return true;
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * طلب HTTP آمن لعقدة http_request:
 * - يتحقق من عنوان الـ IP لحظة الاتصال نفسها (يمنع DNS rebinding)
 * - لا يتبع الـ redirects، مهلة محددة، وحد أقصى 1MB للرد
 */
export function safeHttpRequest(spec: HttpRequestSpec): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(spec.url);
    } catch {
      return reject(new Error('Invalid URL'));
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('Only http/https allowed'));
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isBlockedIp(host)) return reject(new Error('Blocked address'));

    const lib = u.protocol === 'https:' ? https : http;
    const lookup = (hostname: string, options: any, cb: any) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs: any) => {
        if (err) return cb(err);
        const list: { address: string; family: number }[] = Array.isArray(addrs)
          ? addrs
          : [{ address: addrs, family: 4 }];
        if (!list.length || list.some((a) => isBlockedIp(a.address))) return cb(new Error('Blocked address'));
        if (options?.all) return cb(null, list);
        cb(null, list[0].address, list[0].family);
      });
    };

    const req = lib.request(
      u,
      { method: spec.method, headers: spec.headers, timeout: spec.timeoutMs, lookup } as any,
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY) return req.destroy(new Error('Response too large'));
          chunks.push(c);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            /* ليس JSON: نترك النص كما هو */
          }
          const status = res.statusCode ?? 0;
          resolve({ status, ok: status >= 200 && status < 300, body, headers: res.headers });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    if (spec.body) req.write(spec.body);
    req.end();
  });
}
