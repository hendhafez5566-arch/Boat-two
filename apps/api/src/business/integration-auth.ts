import { createHmac } from 'node:crypto';
export function integrationHeaders(
  secret: { auth_type: string; header_name?: string | null; value: string },
  body: string,
  now = Date.now(),
): Record<string, string> {
  if (/[\r\n]/.test(secret.value))
    throw new Error('Integration secret contains forbidden control characters');
  switch (secret.auth_type) {
    case 'bearer':
      return { Authorization: 'Bearer ' + secret.value };
    case 'basic':
      if (!secret.value.includes(':'))
        throw new Error('Basic credentials require username:password');
      return { Authorization: 'Basic ' + Buffer.from(secret.value).toString('base64') };
    case 'header':
      if (!['X-API-Key', 'X-Auth-Token', 'Api-Key'].includes(secret.header_name ?? ''))
        throw new Error('Forbidden secret header');
      return { [secret.header_name!]: secret.value };
    case 'hmac_sha256': {
      const timestamp = Math.floor(now / 1000).toString();
      return {
        'X-Boat-Timestamp': timestamp,
        'X-Boat-Signature': createHmac('sha256', secret.value)
          .update(timestamp + '.' + body)
          .digest('hex'),
      };
    }
    default:
      throw new Error('Unsupported authentication policy');
  }
}
