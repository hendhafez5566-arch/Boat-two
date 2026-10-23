import { BadRequestException, Controller, Get, Injectable, Post, Req } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { BillingService } from './billing.service';
@Injectable()
export class BillingReconciliation {
  constructor(
    private db: DatabaseService,
    private billing: BillingService,
  ) {}
  @OnEvent('billing.reconcile', { suppressErrors: false }) async process(event: {
    tenantId: string;
    id: string;
  }) {
    return this.db.withTenant(event.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM billing_reconciliations WHERE id=$1 AND status='pending' FOR UPDATE",
          [event.id],
        )
      ).rows[0];
      if (!row) return;
      if (!this.billing.reconciliationEnabled) {
        await c.query(
          "UPDATE billing_reconciliations SET status='blocked',error='External Stripe reconciliation disabled or unconfigured',updated_at=now() WHERE id=$1",
          [row.id],
        );
        return;
      }
      await c.query('SAVEPOINT billing_reconcile');
      try {
        await this.billing.reconcile(event.tenantId, row.id);
        await c.query(
          "UPDATE billing_reconciliations SET status='completed',error=NULL,updated_at=now() WHERE id=$1",
          [row.id],
        );
      } catch (error) {
        await c.query('ROLLBACK TO SAVEPOINT billing_reconcile');
        await c.query(
          "UPDATE billing_reconciliations SET status='failed',error=$2,updated_at=now() WHERE id=$1",
          [row.id, (error as Error).message.slice(0, 300)],
        );
      }
    });
  }
}
@Controller('billing/reconciliations')
@Roles('owner')
export class ReconciliationController {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (await c.query('SELECT * FROM billing_reconciliations ORDER BY created_at DESC LIMIT 100'))
          .rows,
    );
  }
  @Post() create(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if ((await c.query("SELECT 1 FROM billing_reconciliations WHERE status='pending'")).rowCount)
        throw new BadRequestException('Reconciliation already pending');
      const row = (
        await c.query(
          'INSERT INTO billing_reconciliations(tenant_id) VALUES($1) RETURNING id,status',
          [r.user.tenantId],
        )
      ).rows[0];
      await this.events.publish(
        r.user.tenantId,
        'billing.reconcile',
        row.id,
        { id: row.id },
        randomUUID(),
      );
      return row;
    });
  }
}
