import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { ExternalEffects } from '../../events/external-effect';
import { PlansService } from '../../plans/plans.service';
import { EmbeddingProvider } from '../providers/embeddings';
@Injectable()
export class EmbeddingBudget {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private effects: ExternalEffects,
  ) {}
  get configured() {
    return !!(env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY);
  }
  async embed(tenant: string, texts: string[], key: string = randomUUID()) {
    if (env.AI_PROVIDER_CALLS_ENABLED !== 'true')
      throw new ForbiddenException('Paid embedding calls are disabled');
    if (!this.configured) throw new ForbiddenException('Embedding provider is not configured');
    // One token per UTF-8 byte is a conservative reservation, not an invoice/token report.
    const amount = Math.max(
      1,
      texts.reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0),
    );
    await this.db.detached(tenant, async (c) => {
      const existing = (
        await c.query('SELECT * FROM embedding_reservations WHERE effect_key=$1', [key])
      ).rows[0];
      if (existing) {
        if (existing.status === 'released')
          throw new Error('Released reservation cannot be reused; create a new indexing job');
        if (existing.amount !== amount) throw new Error('Embedding reservation input changed');
        if (
          existing.status === 'uncertain' &&
          !(
            await c.query(
              "SELECT 1 FROM external_effects WHERE effect_key=$1 AND status='completed'",
              ['embedding:' + key + ':0'],
            )
          ).rowCount
        )
          throw new Error('Embedding outcome uncertain; operator reconciliation required');
        return;
      }
      const plan = await this.plans.getTenantPlan(c),
        limit = plan.limits.embedding_token_budget ?? 0;
      await c.query(
        "INSERT INTO embedding_usage(tenant_id,period) VALUES($1,date_trunc('month',now())::date) ON CONFLICT DO NOTHING",
        [tenant],
      );
      const usage = (
        await c.query(
          "SELECT * FROM embedding_usage WHERE period=date_trunc('month',now())::date FOR UPDATE",
        )
      ).rows[0];
      if (
        (await c.query('SELECT 1 FROM embedding_reservations WHERE effect_key=$1', [key])).rowCount
      )
        return;
      if (limit !== -1 && Number(usage.charged) + Number(usage.reserved) + amount > limit)
        throw new ForbiddenException('Monthly embedding reservation budget exhausted');
      const inserted = await c.query(
        'INSERT INTO embedding_reservations(tenant_id,effect_key,period,amount) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING effect_key',
        [tenant, key, usage.period, amount],
      );
      if (inserted.rowCount)
        await c.query('UPDATE embedding_usage SET reserved=reserved+$2 WHERE period=$1', [
          usage.period,
          amount,
        ]);
    });
    try {
      const vectors = await this.db.eventScope('embedding:' + key, () =>
        this.effects.execute(tenant, { model: env.EMBEDDING_MODEL, texts }, () =>
          new EmbeddingProvider(
            env.EMBEDDING_BASE_URL,
            (env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY)!,
            env.EMBEDDING_MODEL,
          ).embed(texts),
        ),
      );
      await this.db.detached(tenant, async (c) => {
        const reservation = (
          await c.query(
            "UPDATE embedding_reservations SET status='charged' WHERE effect_key=$1 AND status IN ('reserved','uncertain') RETURNING *",
            [key],
          )
        ).rows[0];
        if (reservation)
          await c.query(
            'UPDATE embedding_usage SET reserved=reserved-$2,charged=charged+$2 WHERE period=$1',
            [reservation.period, reservation.amount],
          );
      });
      return vectors;
    } catch (error) {
      await this.db.detached(tenant, (c) =>
        c.query(
          "UPDATE embedding_reservations SET status='uncertain' WHERE effect_key=$1 AND status='reserved'",
          [key],
        ),
      );
      throw error;
    }
  }
}
