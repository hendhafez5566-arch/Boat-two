import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { BillingService } from './billing.service';

const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cancel') }),
  z.object({ kind: z.literal('resume') }),
  z.object({ kind: z.literal('change_plan'), planCode: z.string().min(1).max(80) }),
]);
@Injectable()
export class SubscriptionRequests {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
    private billing: BillingService,
  ) {}
  async create(tenant: string, actor: string, input: unknown) {
    const data = parse(schema, input);
    return this.db.withTenant(tenant, async (c) => {
      const sub = (
        await c.query(
          'SELECT s.*,p.stripe_price_id FROM subscriptions s JOIN plans p ON p.id=s.plan_id FOR UPDATE OF s',
        )
      ).rows[0];
      if (
        !sub?.stripe_subscription_id ||
        !sub.stripe_customer_id ||
        !['active', 'trialing', 'past_due'].includes(sub.status)
      )
        throw new BadRequestException('An active linked subscription is required');
      if (
        (
          await c.query(
            "SELECT 1 FROM billing_subscription_requests WHERE status IN ('pending','ambiguous')",
          )
        ).rowCount
      )
        throw new BadRequestException('An unresolved subscription request requires review');
      let plan;
      if (data.kind === 'change_plan') {
        plan = (
          await c.query(
            'SELECT * FROM plans WHERE code=$1 AND is_active AND price_cents>0 AND stripe_price_id IS NOT NULL',
            [data.planCode],
          )
        ).rows[0];
        if (
          !plan ||
          !(sub.stripe_current_price_id ?? sub.stripe_price_id) ||
          plan.id === sub.plan_id
        )
          throw new BadRequestException('Unsupported target or current price');
        if (sub.status === 'past_due' || sub.cancel_at_period_end)
          throw new BadRequestException(
            'Resolve payment or scheduled cancellation before changing plans',
          );
      }
      const row = (
        await c.query(
          `INSERT INTO billing_subscription_requests(tenant_id,requested_by,kind,plan_code,price_id,expected_price_id,customer_id,subscription_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,
          [
            tenant,
            actor,
            data.kind,
            plan?.code ?? null,
            plan?.stripe_price_id ?? null,
            sub.stripe_current_price_id ?? sub.stripe_price_id,
            sub.stripe_customer_id,
            sub.stripe_subscription_id,
          ],
        )
      ).rows[0];
      await this.events.publish(
        tenant,
        'billing.subscription.request',
        row.id,
        { id: row.id },
        `billing.request:${row.id}`,
      );
      return row;
    });
  }
  async cancel(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const row = (
        await c.query(
          "UPDATE billing_subscription_requests SET status='canceled',error=NULL,updated_at=now() WHERE id=$1 AND status IN ('pending','blocked') RETURNING id,status",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Request is missing or cannot be withdrawn');
      return row;
    });
  }
  @OnEvent('billing.subscription.request', { suppressErrors: false })
  async process(event: { tenantId: string; id: string }) {
    return this.db.withTenant(event.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM billing_subscription_requests WHERE id=$1 AND status='pending' FOR UPDATE",
          [event.id],
        )
      ).rows[0];
      if (!row) return;
      if (
        env.BILLING_SUBSCRIPTION_CHANGES_ENABLED !== 'true' ||
        !this.billing.reconciliationEnabled
      ) {
        await c.query(
          "UPDATE billing_subscription_requests SET status='blocked',error='Subscription changes are disabled or unconfigured',updated_at=now() WHERE id=$1",
          [row.id],
        );
        return;
      }
      const authorized = (
        await c.query(
          "SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.role='owner' AND u.disabled_at IS NULL AND t.suspended_at IS NULL",
          [row.requested_by],
        )
      ).rowCount;
      if (!authorized) {
        await c.query(
          "UPDATE billing_subscription_requests SET status='failed',error='Requesting owner is no longer authorized',updated_at=now() WHERE id=$1",
          [row.id],
        );
        return;
      }
      const sub = (await c.query('SELECT * FROM subscriptions FOR UPDATE')).rows[0];
      if (
        sub.stripe_customer_id !== row.customer_id ||
        sub.stripe_subscription_id !== row.subscription_id
      ) {
        await c.query(
          "UPDATE billing_subscription_requests SET status='failed',error='Linked subscription changed; request refused',updated_at=now() WHERE id=$1",
          [row.id],
        );
        return;
      }
      if (
        row.kind === 'change_plan' &&
        !(
          await c.query('SELECT 1 FROM plans WHERE code=$1 AND stripe_price_id=$2 AND is_active', [
            row.plan_code,
            row.price_id,
          ])
        ).rowCount
      ) {
        await c.query(
          "UPDATE billing_subscription_requests SET status='failed',error='Target price is no longer available',updated_at=now() WHERE id=$1",
          [row.id],
        );
        return;
      }
      await c.query('SAVEPOINT subscription_mutation');
      try {
        // Stable request-scoped effect keys survive outbox retries and transaction rollback.
        await this.db.eventScope(row.id, () =>
          this.billing.executeSubscriptionRequest(event.tenantId, row),
        );
        await c.query(
          "UPDATE billing_subscription_requests SET status='completed',error=NULL,updated_at=now() WHERE id=$1",
          [row.id],
        );
      } catch (error) {
        await c.query('ROLLBACK TO SAVEPOINT subscription_mutation');
        // Even transport timeouts can mean accepted provider writes; never retry automatically.
        await c.query(
          "UPDATE billing_subscription_requests SET status='ambiguous',error=$2,updated_at=now() WHERE id=$1",
          [row.id, (error as Error).message.slice(0, 300)],
        );
      }
    });
  }
}
@Controller('billing/subscription-requests')
@Roles('owner')
export class SubscriptionRequestsController {
  constructor(
    private db: DatabaseService,
    private requests: SubscriptionRequests,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,kind,plan_code,status,error,created_at,updated_at FROM billing_subscription_requests ORDER BY created_at DESC,id DESC LIMIT 100',
          )
        ).rows,
    );
  }
  @Post() create(@Req() r: AuthedRequest, @Body() input: unknown) {
    return this.requests.create(r.user.tenantId, r.user.userId, input);
  }
  @Post(':id/withdraw') cancel(@Req() r: AuthedRequest, @Param('id') id: string) {
    parse(z.string().uuid(), id);
    return this.requests.cancel(r.user.tenantId, id);
  }
}
