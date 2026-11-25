import { ForbiddenException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { previewFlowAllowance, previewOnly } from './preview-flow-allowance';

export interface TenantPlan {
  status: string;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  plan_code: string;
  plan_name: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  trial_expired: boolean;
  delinquent_restricted?: boolean;
}

@Injectable()
export class PlansService {
  constructor(private readonly db: DatabaseService) {}

  async listPublic() {
    const r = await this.db.query(
      `SELECT code, name, price_cents, currency, interval, limits, features
       FROM plans WHERE is_active ORDER BY sort_order`,
    );
    return r.rows;
  }

  /** Preview-only opt-in applies to the current tenant, never the global plan catalog. */
  private async withPreviewFlowAllowance(c: PoolClient, plan: TenantPlan): Promise<TenantPlan> {
    if (!previewOnly() || plan.limits.flows === -1 || plan.limits.flows >= 20) return plan;
    const settings = (await c.query('SELECT settings FROM tenants LIMIT 1')).rows[0]?.settings;
    const granted = previewFlowAllowance(settings);
    if (!granted || granted.limit <= (plan.limits.flows ?? 0)) return plan;
    return { ...plan, limits: { ...plan.limits, flows: granted.limit } };
  }

  /** الخطة الفعلية للشركة الحالية (يجب استدعاؤها داخل withTenant). التجربة المنتهية تُعامل كخطة free. */
  async getTenantPlan(c: PoolClient): Promise<TenantPlan> {
    const r = await c.query(
      `SELECT s.status, s.trial_ends_at, s.current_period_end,s.past_due_since,
              p.code AS plan_code, p.name AS plan_name, p.limits, p.features
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) throw new ForbiddenException('No subscription');

    const trialExpired =
      row.status === 'trialing' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date();
    const delinquentRestricted =
      row.status === 'past_due' &&
      row.past_due_since &&
      Date.now() >=
        new Date(row.past_due_since).getTime() + env.BILLING_PAST_DUE_GRACE_DAYS * 86400000;
    if (trialExpired || row.status === 'canceled' || delinquentRestricted) {
      const free = await c.query(
        "SELECT code AS plan_code, name AS plan_name, limits, features FROM plans WHERE code = 'free'",
      );
      return this.withPreviewFlowAllowance(c, {
        ...row,
        ...free.rows[0],
        trial_expired: !!trialExpired,
        delinquent_restricted: !!delinquentRestricted,
      });
    }
    return this.withPreviewFlowAllowance(c, { ...row, trial_expired: false });
  }

  async assertFeature(c: PoolClient, key: string) {
    const plan = await this.getTenantPlan(c);
    if (!plan.features[key])
      throw new ForbiddenException({
        code: 'FEATURE_UNAVAILABLE',
        feature: key,
        plan: plan.plan_code,
      });
  }

  /** يرفض العملية لو الاستخدام الحالي وصل للحد. -1 = غير محدود */
  async assertWithinLimit(c: PoolClient, key: string, current: number) {
    const plan = await this.getTenantPlan(c);
    const limit = plan.limits[key];
    if (limit !== undefined && limit !== -1 && current >= limit) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT',
        limit: key,
        max: limit,
        plan: plan.plan_code,
      });
    }
  }
}
