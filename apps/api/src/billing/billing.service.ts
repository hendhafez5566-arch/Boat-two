import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';

const STATUS_MAP: Record<string, 'trialing' | 'active' | 'past_due' | 'canceled'> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
};

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);
  private readonly stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

  constructor(private readonly db: DatabaseService) {}

  private requireStripe(): Stripe {
    if (!this.stripe) throw new ServiceUnavailableException('Billing is not configured');
    return this.stripe;
  }

  async status(tenantId: string) {
    const row = await this.db.withTenant(
      tenantId,
      async (c) => (await c.query('SELECT stripe_customer_id FROM subscriptions')).rows[0],
    );
    return {
      configured: !!this.stripe,
      portalAvailable: !!this.stripe && !!row?.stripe_customer_id,
    };
  }

  async createCheckout(tenantId: string, email: string, planCode: string) {
    const stripe = this.requireStripe();
    const plan = (
      await this.db.query<{ code: string; stripe_price_id: string | null }>(
        'SELECT code, stripe_price_id FROM plans WHERE code = $1 AND is_active AND price_cents > 0',
        [planCode],
      )
    ).rows[0];
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.stripe_price_id) throw new BadRequestException('Plan has no Stripe price configured');

    const existing = await this.db.withTenant(
      tenantId,
      async (c) => (await c.query('SELECT stripe_customer_id FROM subscriptions')).rows[0],
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : email,
      client_reference_id: tenantId,
      metadata: { tenantId, planCode: plan.code },
      subscription_data: { metadata: { tenantId, planCode: plan.code } },
      success_url: `${env.APP_URL}/dashboard?billing=success`,
      cancel_url: `${env.APP_URL}/dashboard?billing=cancelled`,
    });
    return { url: session.url };
  }

  async createPortal(tenantId: string) {
    const stripe = this.requireStripe();
    const row = await this.db.withTenant(
      tenantId,
      async (c) => (await c.query('SELECT stripe_customer_id FROM subscriptions')).rows[0],
    );
    if (!row?.stripe_customer_id) throw new BadRequestException('No billing account yet');
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${env.APP_URL}/dashboard`,
    });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.requireStripe();
    if (!env.STRIPE_WEBHOOK_SECRET) throw new ServiceUnavailableException('Webhook secret missing');
    if (!rawBody || !signature) throw new BadRequestException('Missing body or signature');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new BadRequestException('Invalid signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const tenantId = s.metadata?.tenantId;
        const planCode = s.metadata?.planCode;
        if (!tenantId || !planCode) break;
        await this.applySubscription(tenantId, {
          planCode,
          status: 'active',
          customerId: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null),
          subscriptionId:
            typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null),
        });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId;
        if (!tenantId) break;
        const deleted = event.type === 'customer.subscription.deleted';
        const periodEnd =
          (sub as unknown as { current_period_end?: number }).current_period_end ??
          (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)
            ?.current_period_end;
        await this.applySubscription(tenantId, {
          planCode: deleted ? 'free' : (sub.metadata?.planCode ?? null),
          status: deleted ? 'canceled' : (STATUS_MAP[sub.status] ?? 'past_due'),
          customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          subscriptionId: sub.id,
          periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
        // حالة past_due تُضبط تلقائياً من حدث customer.subscription.updated
        if (customerId) this.log.warn(`Payment failed for Stripe customer ${customerId}`);
        break;
      }
      default:
        break;
    }
    return { received: true };
  }

  private async applySubscription(
    tenantId: string,
    p: {
      planCode: string | null;
      status: string;
      customerId: string | null;
      subscriptionId: string | null;
      periodEnd?: Date | null;
    },
  ) {
    await this.db.withTenant(tenantId, async (c) => {
      await c.query(
        `UPDATE subscriptions SET
           plan_id = COALESCE((SELECT id FROM plans WHERE code = $1), plan_id),
           status = $2,
           stripe_customer_id = COALESCE($3, stripe_customer_id),
           stripe_subscription_id = COALESCE($4, stripe_subscription_id),
           current_period_end = COALESCE($5, current_period_end),
           updated_at = now()`,
        [p.planCode, p.status, p.customerId, p.subscriptionId, p.periodEnd ?? null],
      );
    });
  }
}
