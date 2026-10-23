import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { ExternalEffects } from '../events/external-effect';
import { PlansService } from '../plans/plans.service';
import { LlmRequest, LlmResponse } from './providers/types';
export type ModelPolicy = {
  id?: string;
  provider_id?: string;
  model: string;
  kind?: string;
  context_token_limit: number;
  max_output_tokens: number;
  supports_tools: boolean;
  input_rate_microusd: string | number | null;
  output_rate_microusd: string | number | null;
};
export function generationCost(input: number, output: number, model: ModelPolicy) {
  if (model.input_rate_microusd == null || model.output_rate_microusd == null) return null;
  return Number(
    (BigInt(input) * BigInt(model.input_rate_microusd) +
      BigInt(output) * BigInt(model.output_rate_microusd) +
      999999n) /
      1000000n,
  );
}
@Injectable()
export class GenerationBudget {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private effects: ExternalEffects,
  ) {}
  async reserve(tenant: string, key: string, request: LlmRequest, model: ModelPolicy) {
    // Conservative bytes + protocol framing reserve. Actual usage is separately settled, never presented as this estimate.
    const input = Buffer.byteLength(JSON.stringify(request), 'utf8') + 4096,
      output = request.maxTokens;
    if (
      !Number.isInteger(output) ||
      output < 1 ||
      output > model.max_output_tokens ||
      input + output > model.context_token_limit
    )
      throw new ForbiddenException(
        'Model context or output reservation exceeds configured capabilities',
      );
    if (request.tools?.length && !model.supports_tools)
      throw new ForbiddenException('Model does not support tools');
    const cost = generationCost(input, output, model),
      hash = createHash('sha256').update(JSON.stringify({ model, request })).digest('hex');
    return this.db.detached(tenant, async (c) => {
      const plan = await this.plans.getTenantPlan(c);
      await c.query(
        "INSERT INTO generation_usage(tenant_id,period,baseline_calls,baseline_unpriced_calls,charged_tokens,charged_cost_microusd) SELECT $1,date_trunc('month',now())::date,COALESCE((SELECT replies FROM ai_usage WHERE period=date_trunc('month',now())::date),0),(SELECT count(*) FROM ai_runs WHERE generation_reservation_id IS NULL AND created_at>=date_trunc('month',now()) AND status IN ('completed','failed') AND cost_microusd IS NULL),COALESCE((SELECT input_tokens+output_tokens FROM ai_usage WHERE period=date_trunc('month',now())::date),0),COALESCE((SELECT sum(cost_microusd) FROM ai_runs WHERE generation_reservation_id IS NULL AND created_at>=date_trunc('month',now())),0) ON CONFLICT DO NOTHING",
        [tenant],
      );
      const usage = (
        await c.query(
          "SELECT * FROM generation_usage WHERE period=date_trunc('month',now())::date FOR UPDATE",
        )
      ).rows[0];
      const old = (
        await c.query('SELECT * FROM generation_reservations WHERE effect_key=$1', [key])
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash || old.status === 'released')
          throw new BadRequestException(
            'Generation input changed or reservation released; review required',
          );
        return old;
      }
      const policy = (await c.query('SELECT * FROM generation_policy')).rows[0];
      const calls = Number(usage.baseline_calls) + Number(usage.attempts) + 1,
        tokens = Number(usage.reserved_tokens) + Number(usage.charged_tokens) + input + output;
      const limit = plan.limits.ai_credits ?? 0;
      if (
        (limit !== -1 && calls > limit) ||
        (policy?.monthly_calls != null && calls > policy.monthly_calls)
      )
        throw new ForbiddenException('Monthly generation call budget exhausted');
      if (policy?.monthly_tokens != null && tokens > Number(policy.monthly_tokens))
        throw new ForbiddenException('Monthly generation token budget exhausted');
      const planTokens = plan.limits.generation_token_budget ?? -1;
      if (planTokens !== -1 && tokens > planTokens)
        throw new ForbiddenException('Plan generation token budget exhausted');
      if (policy?.monthly_cost_microusd != null) {
        if (Number(usage.baseline_unpriced_calls) > 0)
          throw new ForbiddenException(
            'Historical unpriced generation requires review before enabling a cost cap',
          );
        if (cost == null)
          throw new ForbiddenException('Verified configured prices are required for a cost budget');
        if (
          (
            await c.query(
              "SELECT 1 FROM generation_reservations WHERE period=$1 AND reserved_cost_microusd IS NULL AND status<>'released' LIMIT 1",
              [usage.period],
            )
          ).rowCount
        )
          throw new ForbiddenException(
            'Unpriced generation requires review before a cost cap can be enforced',
          );
        if (
          Number(usage.reserved_cost_microusd) + Number(usage.charged_cost_microusd) + cost >
          Number(policy.monthly_cost_microusd)
        )
          throw new ForbiddenException('Monthly generation cost budget exhausted');
      }
      const row = (
        await c.query(
          'INSERT INTO generation_reservations(tenant_id,effect_key,request_hash,period,model_version_id,model,provider_id,input_rate_microusd,output_rate_microusd,reserved_tokens,reserved_cost_microusd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
          [
            tenant,
            key,
            hash,
            usage.period,
            model.id ?? null,
            model.model,
            model.provider_id ?? null,
            model.input_rate_microusd,
            model.output_rate_microusd,
            input + output,
            cost,
          ],
        )
      ).rows[0];
      await c.query(
        'UPDATE generation_usage SET attempts=attempts+1,reserved_tokens=reserved_tokens+$2,reserved_cost_microusd=reserved_cost_microusd+$3 WHERE period=$1',
        [usage.period, input + output, cost ?? 0],
      );
      return row;
    });
  }
  async settle(tenant: string, id: string, input: number, output: number) {
    if (![input, output].every((v) => Number.isSafeInteger(v) && v >= 0) || input + output === 0)
      throw new BadRequestException('Provider usage unavailable; outcome requires review');
    return this.db.detached(tenant, async (c) => {
      const row = (
        await c.query('SELECT * FROM generation_reservations WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!row) throw new BadRequestException('Reservation not found');
      if (row.status === 'settled') return;
      if (row.status === 'released')
        throw new BadRequestException('Released reservation requires operator review');
      const cost = generationCost(input, output, {
        ...row,
        context_token_limit: 0,
        max_output_tokens: 0,
        supports_tools: false,
      });
      await c.query(
        "UPDATE generation_reservations SET status='settled',actual_input_tokens=$2,actual_output_tokens=$3,actual_cost_microusd=$4,updated_at=now() WHERE id=$1",
        [id, input, output, cost],
      );
      await c.query(
        'UPDATE generation_usage SET reserved_tokens=reserved_tokens-$2,charged_tokens=charged_tokens+$3,reserved_cost_microusd=reserved_cost_microusd-$4,charged_cost_microusd=charged_cost_microusd+$5 WHERE period=$1',
        [
          row.period,
          row.reserved_tokens,
          input + output,
          row.reserved_cost_microusd ?? 0,
          cost ?? 0,
        ],
      );
    });
  }
  async execute(
    tenant: string,
    request: LlmRequest,
    model: ModelPolicy,
    call: () => Promise<LlmResponse>,
  ) {
    const eventKey = this.db.effectKey();
    if (
      eventKey &&
      (
        await this.db.detached(tenant, (c) =>
          c.query('SELECT 1 FROM external_effects WHERE effect_key=$1', [eventKey]),
        )
      ).rowCount
    )
      throw new BadRequestException(
        'Legacy AI effect requires review; automatic paid replay refused',
      );
    const row = await this.reserve(
      tenant,
      'generation:' + (eventKey ?? randomUUID()),
      request,
      model,
    );
    const effect = 'generation:' + row.id;
    if (row.status === 'started' || row.status === 'uncertain') {
      const cached = await this.db.detached(tenant, (c) =>
        c.query("SELECT 1 FROM external_effects WHERE effect_key=$1 AND status='completed'", [
          effect + ':0',
        ]),
      );
      if (!cached.rowCount)
        throw new BadRequestException('Generation outcome uncertain; no automatic paid retry');
    }
    if (row.status === 'reserved') {
      const claimed = await this.db.detached(tenant, (c) =>
        c.query(
          "UPDATE generation_reservations SET status='started',updated_at=now() WHERE id=$1 AND status='reserved' RETURNING id",
          [row.id],
        ),
      );
      if (!claimed.rowCount)
        throw new BadRequestException('Generation already claimed; no duplicate call');
    }
    try {
      const response = await this.db.eventScope(effect, () =>
        this.effects.execute(tenant, { model, request }, call),
      );
      await this.settle(tenant, row.id, response.inputTokens, response.outputTokens);
      return { response, reservationId: row.id };
    } catch (error) {
      await this.db.detached(tenant, (c) =>
        c.query(
          "UPDATE generation_reservations SET status='uncertain',updated_at=now() WHERE id=$1 AND status='started'",
          [row.id],
        ),
      );
      throw error;
    }
  }
}
