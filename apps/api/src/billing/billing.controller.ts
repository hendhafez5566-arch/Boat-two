import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
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
