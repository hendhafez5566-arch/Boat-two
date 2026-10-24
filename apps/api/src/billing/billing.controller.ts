import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public, Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { BillingService } from './billing.service';

const checkoutSchema = z.object({ planCode: z.string().min(1) });

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly db: DatabaseService,
  ) {}

  @Get('status')
  status(@Req() req: AuthedRequest) {
    return this.billing.status(req.user.tenantId);
  }

  @Get('invoices') @Roles('owner', 'admin') invoices(
    @Req() r: AuthedRequest,
    @Query() query: unknown,
  ) {
    const q = parse(
      z.object({
        status: z
          .enum(['all', 'draft', 'open', 'paid', 'void', 'uncollectible', 'deleted', 'failed'])
          .default('all'),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      }),
      query,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const predicate =
        "($1='all' OR status=$1 OR ($1='failed' AND payment_failed AND status='open'))";
      const total = (
        await c.query('SELECT count(*)::int AS n FROM billing_invoices WHERE ' + predicate, [
          q.status,
        ])
      ).rows[0].n;
      const items = (
        await c.query(
          'SELECT provider_id,number,status,currency,amount_due,amount_paid,amount_remaining,attempted_count,payment_failed,hosted_url,pdf_url,due_at,provider_created,updated_at FROM billing_invoices WHERE ' +
            predicate +
            ' ORDER BY provider_created DESC,provider_id LIMIT 50 OFFSET $2',
          [q.status, (q.page - 1) * 50],
        )
      ).rows;
      return { items, total, page: q.page, limit: 50 };
    });
  }
  @Get('events') @Roles('owner', 'admin') events(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,type,status,reason,provider_created,created_at FROM billing_events ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  @Roles('owner')
  @Post('checkout')
  async checkout(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { planCode } = parse(checkoutSchema, body);
    const u = await this.db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
      req.user.userId,
    ]);
    return this.billing.createCheckout(req.user.tenantId, u.rows[0].email, planCode);
  }

  @Roles('owner')
  @Post('portal')
  @HttpCode(200)
  portal(@Req() req: AuthedRequest) {
    return this.billing.createPortal(req.user.tenantId);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig?: string) {
    return this.billing.handleWebhook(req.rawBody, sig);
  }
}
