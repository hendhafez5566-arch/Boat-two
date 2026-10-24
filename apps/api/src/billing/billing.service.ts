import { licensedQuantity } from './subscription-policy';
import { invoiceSnapshot } from './invoice-snapshot';
import { ExternalEffects } from '../events/external-effect';
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

  constructor(
    private readonly db: DatabaseService,
    private readonly effects: ExternalEffects,
  ) {}

  private requireStripe(external = true): Stripe {
    if (external && env.EXTERNAL_DELIVERY_ENABLED !== 'true')
      throw new ServiceUnavailableException('External billing operations are disabled');
    if (!this.stripe) throw new ServiceUnavailableException('Billing is not configured');
    return this.stripe;
  }

  async status(tenantId: string) {
    const row = await this.db.withTenant(
      tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT stripe_customer_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end,past_due_since FROM subscriptions',
          )
        ).rows[0],
    );
    return {
      configured: !!this.stripe && env.EXTERNAL_DELIVERY_ENABLED === 'true',
      subscription: row
        ? {
            status: row.status,
            currentPeriodEnd: row.current_period_end,
            cancelAtPeriodEnd: row.cancel_at_period_end,
            linked: !!row.stripe_subscription_id,
            pastDueSince: row.past_due_since,
            graceDays: env.BILLING_PAST_DUE_GRACE_DAYS,
          }
        : null,
      portalAvailable:
        !!this.stripe && env.EXTERNAL_DELIVERY_ENABLED === 'true' && !!row?.stripe_customer_id,
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
      async (c) =>
        (
          await c.query(
            'SELECT stripe_customer_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end,past_due_since FROM subscriptions',
          )
        ).rows[0],
    );

    if (
      existing?.stripe_subscription_id &&
      ['active', 'trialing', 'past_due'].includes(existing.status)
    )
      throw new BadRequestException(
        'An existing subscription must be changed through the billing portal',
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
      async (c) =>
        (
          await c.query(
            'SELECT stripe_customer_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end,past_due_since FROM subscriptions',
          )
        ).rows[0],
    );
    if (!row?.stripe_customer_id) throw new BadRequestException('No billing account yet');
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${env.APP_URL}/dashboard`,
    });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.requireStripe(false);
    if (!env.STRIPE_WEBHOOK_SECRET) throw new ServiceUnavailableException('Webhook secret missing');
    if (!rawBody || !signature) throw new BadRequestException('Missing body or signature');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new BadRequestException('Invalid signature');
    }

    return this.applyVerifiedEvent(event);
  }

  get reconciliationEnabled() {
    return !!this.stripe && env.EXTERNAL_DELIVERY_ENABLED === 'true';
  }
  async reconcile(tenant: string, key: string) {
    if (!this.reconciliationEnabled)
      throw new ServiceUnavailableException(
        'Stripe reconciliation requires configured credentials and explicit external-service activation',
      );
    const current = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT s.*,p.code AS plan_code FROM subscriptions s JOIN plans p ON p.id=s.plan_id',
          )
        ).rows[0],
    );
    if (!current?.stripe_subscription_id || !current.stripe_customer_id)
      throw new BadRequestException('Workspace has no linked Stripe subscription');
    const readStartedAt = Math.floor(Date.now() / 1000);
    const snapshot = await this.effects.execute(
      tenant,
      { subscriptionId: current.stripe_subscription_id, customerId: current.stripe_customer_id },
      async () => ({
        subscription: await this.requireStripe().subscriptions.retrieve(
          current.stripe_subscription_id,
        ),
        readAt: readStartedAt,
      }),
    );
    const customer =
      typeof snapshot.subscription.customer === 'string'
        ? snapshot.subscription.customer
        : snapshot.subscription.customer.id;
    if (
      customer !== current.stripe_customer_id ||
      snapshot.subscription.id !== current.stripe_subscription_id
    )
      throw new BadRequestException('Provider subscription ownership mismatch');
    const subscription = {
      ...snapshot.subscription,
      metadata: {
        ...snapshot.subscription.metadata,
        tenantId: tenant,
        planCode: snapshot.subscription.metadata.planCode ?? current.plan_code,
      },
    };
    return this.applyVerifiedEvent({
      id: 'reconcile_' + key,
      type:
        subscription.status === 'canceled'
          ? 'customer.subscription.deleted'
          : 'customer.subscription.updated',
      created: snapshot.readAt,
      data: { object: subscription },
    } as unknown as Stripe.Event);
  }

  async inspectSubscriptionRequest(
    tenant: string,
    request: {
      subscription_id: string;
      customer_id: string;
      kind: string;
      price_id: string | null;
    },
  ) {
    const snapshot = await this.effects.execute(
      tenant,
      { inspect: request.subscription_id, customer: request.customer_id },
      async () => {
        const sub = await this.requireStripe().subscriptions.retrieve(request.subscription_id);
        return {
          id: sub.id,
          customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          prices: sub.items.data.map((i) => i.price.id),
          providerRequestId: sub.lastResponse?.requestId ?? null,
          observedAt: new Date().toISOString(),
        };
      },
    );
    if (
      snapshot.id !== request.subscription_id ||
      snapshot.customer !== request.customer_id ||
      !snapshot.providerRequestId?.startsWith('req_')
    )
      throw new BadRequestException('Verified provider identity and request evidence required');
    const satisfied =
      request.kind === 'cancel'
        ? snapshot.cancelAtPeriodEnd || snapshot.status === 'canceled'
        : request.kind === 'resume'
          ? !snapshot.cancelAtPeriodEnd && ['active', 'trialing'].includes(snapshot.status)
          : snapshot.prices.length === 1 &&
            snapshot.prices[0] === request.price_id &&
            ['active', 'trialing'].includes(snapshot.status);
    return { ...snapshot, verdict: satisfied ? 'satisfied' : 'not_matched' };
  }
  async executeSubscriptionRequest(
    tenant: string,
    request: {
      id: string;
      kind: string;
      subscription_id: string;
      customer_id: string;
      expected_price_id: string | null;
      price_id: string | null;
      plan_code: string | null;
    },
  ) {
    const stripe = this.requireStripe();
    const current = await this.effects.execute(tenant, { read: request.subscription_id }, () =>
      stripe.subscriptions.retrieve(request.subscription_id),
    );
    const customer = typeof current.customer === 'string' ? current.customer : current.customer.id;
    if (customer !== request.customer_id || current.id !== request.subscription_id)
      throw new BadRequestException('Provider ownership mismatch');
    if (!['active', 'trialing', 'past_due'].includes(current.status))
      throw new BadRequestException('Provider subscription is not changeable');
    const item = current.items.data[0];
    if (
      request.kind === 'change_plan' &&
      (current.items.data.length !== 1 ||
        item?.price.id !== request.expected_price_id ||
        current.status === 'past_due' ||
        current.cancel_at_period_end)
    )
      throw new BadRequestException(
        'Provider price or subscription state changed; review required',
      );
    const quantity = request.kind === 'change_plan' ? licensedQuantity(item) : 1;
    const parameters: Stripe.SubscriptionUpdateParams =
      request.kind === 'change_plan'
        ? {
            items: [{ id: item.id, price: request.price_id!, quantity }],
            metadata: { ...current.metadata, planCode: request.plan_code!, tenantId: tenant },
            proration_behavior: 'none',
            payment_behavior: 'error_if_incomplete',
          }
        : { cancel_at_period_end: request.kind === 'cancel' };
    const startedAt = Math.floor(Date.now() / 1000);
    const result = await this.effects.execute(
      tenant,
      { subscription: request.subscription_id, parameters, idempotencyKey: request.id },
      async () => ({
        subscription: await stripe.subscriptions.update(request.subscription_id, parameters, {
          idempotencyKey: `boat-subscription-${request.id}`,
        }),
        readAt: startedAt,
      }),
    );
    const returnedCustomer =
      typeof result.subscription.customer === 'string'
        ? result.subscription.customer
        : result.subscription.customer.id;
    if (
      result.subscription.id !== request.subscription_id ||
      returnedCustomer !== request.customer_id
    )
      throw new BadRequestException('Mutation response ownership mismatch');
    if (
      request.kind === 'change_plan' &&
      (result.subscription.items.data.length !== 1 ||
        result.subscription.items.data[0].price.id !== request.price_id ||
        licensedQuantity(result.subscription.items.data[0]) !== quantity)
    )
      throw new BadRequestException(
        'Provider returned a different price or quantity; evidence review required',
      );
    return this.applyVerifiedEvent({
      id: `request_${request.id}`,
      type: 'customer.subscription.updated',
      created: result.readAt,
      data: {
        object: {
          ...result.subscription,
          metadata: { ...result.subscription.metadata, tenantId: tenant },
        },
      },
    } as unknown as Stripe.Event);
  }

  async backfillInvoices(tenant: string, key: string, cursor?: string) {
    const current = await this.db.withTenant(
      tenant,
      async (c) =>
        (await c.query('SELECT stripe_customer_id,stripe_subscription_id FROM subscriptions'))
          .rows[0],
    );
    if (!current?.stripe_customer_id || !current.stripe_subscription_id)
      throw new BadRequestException('Workspace has no linked Stripe subscription');
    const readStartedAt = Math.floor(Date.now() / 1000);
    const page = await this.effects.execute(
      tenant,
      {
        customer: current.stripe_customer_id,
        subscription: current.stripe_subscription_id,
        cursor: cursor ?? null,
      },
      async () => ({
        readAt: readStartedAt,
        page: await this.requireStripe().invoices.list({
          customer: current.stripe_customer_id,
          subscription: current.stripe_subscription_id,
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        }),
      }),
    );
    for (const invoice of page.page.data) {
      if (!invoiceSnapshot('invoice.updated', invoice))
        throw new BadRequestException('Unsupported invoice backfill snapshot');
      const customer =
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const subscription =
        typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (
        customer !== current.stripe_customer_id ||
        subscription !== current.stripe_subscription_id
      )
        throw new BadRequestException('Backfill invoice ownership mismatch');
      await this.applyVerifiedEvent({
        id: `backfill_${key}_${invoice.id}`,
        type: 'invoice.updated',
        created: page.readAt,
        data: { object: { ...invoice, metadata: { ...invoice.metadata, tenantId: tenant } } },
      } as unknown as Stripe.Event);
    }
    const next = page.page.has_more ? page.page.data.at(-1)?.id : undefined;
    if (page.page.has_more && (!next || next === cursor))
      throw new Error('Invalid invoice pagination');
    return next;
  }

  private async applyVerifiedEvent(event: Stripe.Event) {
    const object = event.data.object as unknown as {
      metadata?: Record<string, string>;
      customer?: string | { id: string };
      subscription?: string | { id: string };
      id?: string;
    };
    let tenantId = object.metadata?.tenantId;
    const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
    if (!tenantId && customerId)
      tenantId = (
        await this.db.query('SELECT billing_customer_tenant($1) AS tenant_id', [customerId])
      ).rows[0]?.tenant_id;
    if (!tenantId) return { received: true, ignored: true };
    if (!/^[0-9a-f-]{36}$/i.test(tenantId))
      throw new BadRequestException('Invalid tenant metadata');
    return this.db.withTenant(tenantId, async (c) => {
      const subscription = (await c.query('SELECT * FROM subscriptions FOR UPDATE')).rows[0];
      if (!subscription) throw new BadRequestException('Subscription workspace not found');
      const inserted = await c.query(
        "INSERT INTO billing_events(id,tenant_id,type,provider_created,status) VALUES($1,$2,$3,$4,'processed') ON CONFLICT(id) DO NOTHING RETURNING id",
        [event.id, tenantId, event.type, event.created],
      );
      if (!inserted.rowCount) return { received: true, duplicate: true };
      if (event.type.startsWith('invoice.')) {
        const invoice = invoiceSnapshot(event.type, event.data.object);
        const invoiceSubscription =
          typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
        let reason: string | null = null;
        if (!invoice) reason = 'Unsupported or incomplete invoice snapshot';
        else if (
          !subscription.stripe_customer_id ||
          customerId !== subscription.stripe_customer_id ||
          (invoiceSubscription && invoiceSubscription !== subscription.stripe_subscription_id)
        )
          reason = 'Invoice ownership does not match linked subscription';
        if (reason) {
          await c.query("UPDATE billing_events SET status='ignored',reason=$2 WHERE id=$1", [
            event.id,
            reason,
          ]);
          return { received: true, ignored: true };
        }
        const inv = invoice!;
        const result = await c.query(
          `INSERT INTO billing_invoices(provider_id,tenant_id,number,status,currency,amount_due,amount_paid,amount_remaining,attempted_count,payment_failed,hosted_url,pdf_url,due_at,provider_created,event_created,event_rank,paid_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$18)
         ON CONFLICT(provider_id) DO UPDATE SET number=EXCLUDED.number,status=EXCLUDED.status,currency=EXCLUDED.currency,amount_due=EXCLUDED.amount_due,amount_paid=EXCLUDED.amount_paid,amount_remaining=EXCLUDED.amount_remaining,attempted_count=GREATEST(billing_invoices.attempted_count,EXCLUDED.attempted_count),payment_failed=CASE WHEN EXCLUDED.status='paid' THEN false WHEN $17='invoice.payment_failed' THEN true ELSE billing_invoices.payment_failed END,hosted_url=EXCLUDED.hosted_url,pdf_url=EXCLUDED.pdf_url,due_at=EXCLUDED.due_at,event_created=EXCLUDED.event_created,event_rank=EXCLUDED.event_rank,paid_at=COALESCE(EXCLUDED.paid_at,billing_invoices.paid_at),updated_at=now()
         WHERE billing_invoices.tenant_id=EXCLUDED.tenant_id AND (EXCLUDED.event_created>billing_invoices.event_created OR (EXCLUDED.event_created=billing_invoices.event_created AND EXCLUDED.event_rank>billing_invoices.event_rank)) RETURNING provider_id`,
          [
            inv.id,
            tenantId,
            inv.number ?? null,
            inv.status,
            inv.currency,
            inv.amount_due,
            inv.amount_paid,
            inv.amount_remaining,
            inv.attempt_count,
            event.type === 'invoice.payment_failed',
            inv.hosted_invoice_url,
            inv.invoice_pdf,
            inv.due_date ? new Date(inv.due_date * 1000) : null,
            inv.created,
            event.created,
            inv.rank,
            event.type,
            inv.status_transitions?.paid_at
              ? new Date(inv.status_transitions.paid_at * 1000)
              : null,
          ],
        );
        if (!result.rowCount)
          await c.query(
            "UPDATE billing_events SET status='ignored',reason='Older or equal-priority invoice snapshot' WHERE id=$1",
            [event.id],
          );
        return { received: true, ...(!result.rowCount ? { ignored: true } : {}) };
      }
      let reason: string | null = null;
      const isSubscription = [
        'customer.subscription.updated',
        'customer.subscription.deleted',
      ].includes(event.type);
      const checkout = event.type === 'checkout.session.completed';
      if (
        customerId &&
        subscription.stripe_customer_id &&
        customerId !== subscription.stripe_customer_id
      )
        reason = 'Billing customer ownership mismatch';
      const incomingId = isSubscription
        ? object.id
        : typeof object.subscription === 'string'
          ? object.subscription
          : object.subscription?.id;
      if (event.created < Number(subscription.stripe_event_created))
        reason = 'Older than applied subscription event';
      if (
        isSubscription &&
        subscription.stripe_subscription_id &&
        incomingId !== subscription.stripe_subscription_id
      )
        reason = 'Obsolete subscription identity';
      if (
        event.created === Number(subscription.stripe_event_created) &&
        subscription.status === 'canceled' &&
        event.type !== 'customer.subscription.deleted' &&
        !(checkout && incomingId !== subscription.stripe_subscription_id)
      )
        reason = 'Canceled state wins equal-time ambiguity';
      if (!isSubscription && !checkout)
        reason = 'Recorded for review; subscription state comes from subscription events';
      if (checkout) {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!['paid', 'no_payment_required'].includes(session.payment_status))
          reason = 'Checkout not yet paid';
      }
      if (isSubscription && event.type !== 'customer.subscription.deleted') {
        const items = (event.data.object as Stripe.Subscription).items?.data ?? [];
        if (items.length) {
          const price = items[0]?.price?.id;
          const mapped =
            price && items.length === 1
              ? (
                  await c.query(
                    'SELECT p.code FROM billing_prices b JOIN plans p ON p.id=b.plan_id WHERE b.provider_id=$1',
                    [price],
                  )
                ).rows[0]
              : null;
          if (!mapped)
            reason = 'Unknown or multi-item subscription price; operator review required';
          else object.metadata = { ...object.metadata, planCode: mapped.code };
        }
      }
      if (
        isSubscription &&
        event.type !== 'customer.subscription.deleted' &&
        event.created === Number(subscription.stripe_event_created) &&
        subscription.stripe_event_id &&
        !event.id.startsWith('request_') &&
        !event.id.startsWith('reconcile_')
      ) {
        reason = 'Equal-time subscription ambiguity; reconciliation required';
        await c.query(
          'UPDATE subscriptions SET next_reconciliation_at=LEAST(next_reconciliation_at,now())',
        );
      }
      if (
        isSubscription &&
        event.id.startsWith('reconcile_') &&
        event.created === Number(subscription.stripe_event_created) &&
        subscription.stripe_event_id &&
        event.type !== 'customer.subscription.deleted'
      ) {
        reason = 'Reconciliation read overlaps applied event second; retry a later snapshot';
        await c.query(
          "UPDATE subscriptions SET next_reconciliation_at=LEAST(next_reconciliation_at,now()+interval '1 minute')",
        );
      }
      if (checkout && (!object.metadata?.planCode || !incomingId || !customerId))
        reason = 'Checkout is missing subscription identity or plan metadata';
      if (
        !reason &&
        object.metadata?.planCode &&
        !(await c.query('SELECT 1 FROM plans WHERE code=$1', [object.metadata.planCode])).rowCount
      )
        throw new BadRequestException('Unknown billing plan metadata');
      if (reason) {
        await c.query("UPDATE billing_events SET status='ignored',reason=$2 WHERE id=$1", [
          event.id,
          reason,
        ]);
        return { received: true, ignored: true };
      }
      const routedEvent = {
        id: event.id,
        type: event.type,
        created: event.created,
        data: {
          object: {
            ...(event.data.object as unknown as Record<string, unknown>),
            metadata: { ...object.metadata, tenantId },
          },
        },
      } as unknown as Stripe.Event;
      await this.processVerifiedEvent(routedEvent);
      await c.query('UPDATE subscriptions SET stripe_event_created=$1,stripe_event_id=$2', [
        event.created,
        event.id,
      ]);
      return { received: true };
    });
  }

  private async processVerifiedEvent(event: Stripe.Event) {
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
          priceId: sub.items.data[0]?.price?.id ?? null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
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
      cancelAtPeriodEnd?: boolean;
      priceId?: string | null;
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
           cancel_at_period_end = COALESCE($6,cancel_at_period_end),
           stripe_current_price_id=COALESCE($7,stripe_current_price_id),
           updated_at = now()`,
        [
          p.planCode,
          p.status,
          p.customerId,
          p.subscriptionId,
          p.periodEnd ?? null,
          p.cancelAtPeriodEnd ?? null,
          p.priceId ?? null,
        ],
      );
    });
  }
}
