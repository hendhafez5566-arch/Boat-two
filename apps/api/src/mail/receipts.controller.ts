import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Public, Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
@Controller('mail/receipts')
export class MailReceiptController {
  constructor(private db: DatabaseService) {}
  @Public() @Post() receipt(
    @Req() req: { rawBody?: Buffer; headers: Record<string, string | undefined> },
    @Body() body: unknown,
  ) {
    const timestamp = req.headers['x-boat-timestamp'] ?? '',
      signature = req.headers['x-boat-signature'] ?? '';
    if (
      env.EMAIL_RECEIPTS_ENABLED !== 'true' ||
      !env.EMAIL_RECEIPT_SECRET ||
      !req.rawBody ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^([a-f0-9]{64})$/i.test(signature)
    )
      throw new UnauthorizedException('Receipt verification unavailable or invalid');
    const expected = createHmac('sha256', env.EMAIL_RECEIPT_SECRET)
      .update(timestamp + '.')
      .update(req.rawBody)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new UnauthorizedException('Invalid receipt signature');
    const b = parse(
      z
        .object({
          eventId: z.string().min(1).max(200),
          tenantId: z.string().uuid(),
          jobId: z.string().uuid(),
          providerId: z.string().min(1).max(255),
          status: z.enum(['delivered', 'bounced', 'failed']),
          occurredAt: z.string().datetime(),
        })
        .strict(),
      body,
    );
    if (new Date(b.occurredAt).getTime() > Date.now() + 300000)
      throw new BadRequestException('Receipt time is in the future');
    const hash = createHash('sha256').update(req.rawBody).digest('hex');
    return this.db.withTenant(b.tenantId, async (c) => {
      const job = (
        await c.query('SELECT * FROM invitation_mail_jobs WHERE id=$1 FOR UPDATE', [b.jobId])
      ).rows[0];
      if (
        !job ||
        !['accepted', 'ambiguous'].includes(job.status) ||
        (job.provider_id && job.provider_id !== b.providerId)
      )
        throw new BadRequestException('Receipt does not match accepted or uncertain mail');
      const old = (
        await c.query('SELECT body_hash FROM mail_receipts WHERE event_id=$1', [b.eventId])
      ).rows[0];
      if (old) {
        if (old.body_hash !== hash) throw new BadRequestException('Receipt event changed its body');
        return { accepted: true, duplicate: true };
      }
      await c.query(
        'INSERT INTO mail_receipts(tenant_id,event_id,job_id,provider_id,status,occurred_at,body_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [b.tenantId, b.eventId, b.jobId, b.providerId, b.status, b.occurredAt, hash],
      );
      // Persist every verified event; never let an older receipt regress the displayed state.
      await c.query(
        `UPDATE invitation_mail_jobs SET status='accepted',provider_id=$2,payload_enc=NULL,delivery_status=$3,delivery_event_at=$4,error=NULL,updated_at=now()
    WHERE id=$1 AND (delivery_event_at IS NULL OR delivery_event_at<$4::timestamptz OR (delivery_event_at=$4::timestamptz AND CASE $3 WHEN 'bounced' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END>CASE delivery_status WHEN 'bounced' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END))`,
        [b.jobId, b.providerId, b.status, b.occurredAt],
      );
      return { accepted: true, duplicate: false };
    });
  }
}
@Controller('workspace/mail')
@Roles('owner')
export class MailReviewController {
  constructor(private db: DatabaseService) {}
  @Post(':id/reconcile') reconcile(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          outcome: z.enum(['accepted', 'not_sent']),
          providerId: z.string().min(1).max(255).optional(),
          evidence: z.string().trim().min(20).max(2000),
        })
        .strict(),
      body,
    );
    if (b.outcome === 'accepted' && !b.providerId)
      throw new BadRequestException('Provider acceptance ID is required');
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE invitation_mail_jobs SET status=$2,provider_id=$3,payload_enc=NULL,error=$4,updated_at=now() WHERE id=$1 AND status='ambiguous' RETURNING id",
          [
            id,
            b.outcome === 'accepted' ? 'accepted' : 'canceled',
            b.providerId ?? null,
            b.outcome === 'not_sent'
              ? 'Owner evidence confirmed not sent; no automatic resend'
              : null,
          ],
        )
      ).rows[0];
      if (!row) throw new BadRequestException('Only uncertain mail can be reconciled');
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details) VALUES($1,$2,'mail_evidence_review','invitation_mail_jobs',$3,$4)",
        [r.user.tenantId, r.user.userId, id, JSON.stringify(b)],
      );
      return { reconciled: true };
    });
  }
}
