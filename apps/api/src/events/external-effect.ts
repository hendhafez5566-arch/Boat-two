import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class ExternalEffects {
  constructor(private db: DatabaseService) {}
  async execute<T>(tenant: string, request: unknown, fn: () => Promise<T>): Promise<T> {
    const key = this.db.effectKey();
    if (!key) return fn();
    const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const claim = await this.db.detached(tenant, async (c) => {
      const inserted = (
        await c.query(
          "INSERT INTO external_effects(tenant_id,effect_key,request_hash,status) VALUES($1,$2,$3,'started') ON CONFLICT DO NOTHING RETURNING effect_key",
          [tenant, key, hash],
        )
      ).rowCount;
      const row = (await c.query('SELECT * FROM external_effects WHERE effect_key=$1', [key]))
        .rows[0];
      return { inserted, row };
    });
    if (claim.row.request_hash !== hash)
      throw new Error('External effect replay changed its input; operator reconciliation required');
    if (claim.row.status === 'completed') return claim.row.result as T;
    if (!claim.inserted)
      throw new Error('External effect outcome is ambiguous; automatic replay refused');
    try {
      const result = await fn();
      await this.db.detached(tenant, (c) =>
        c.query("UPDATE external_effects SET status='completed',result=$2 WHERE effect_key=$1", [
          key,
          JSON.stringify(result),
        ]),
      );
      return result;
    } catch (e) {
      await this.db.detached(tenant, (c) =>
        c.query("UPDATE external_effects SET status='ambiguous',error=$2 WHERE effect_key=$1", [
          key,
          (e as Error).message.slice(0, 300),
        ]),
      );
      throw e;
    }
  }
}
