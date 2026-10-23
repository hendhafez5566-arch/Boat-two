import { MailReceiptController, MailReviewController } from './receipts.controller';
import {
  Body,
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { ExternalEffects } from '../events/external-effect';
import { CryptoService } from '../messaging/crypto.service';
import { PlansService } from '../plans/plans.service';
import { safeHttpRequest } from '../flows/http-safe';
export function escapeMail(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function renderInvitation(
  brand: { name: string; color: string; logo: string | null },
  url: string,
  language: 'ar' | 'en',
) {
  const ar = language === 'ar',
    title = ar ? 'دعوة للانضمام إلى فريقك' : 'You’re invited to join your team',
    text = ar
      ? `تمت دعوتك إلى ${brand.name}. الدعوة صالحة لمدة 7 أيام. إذا كان لديك حساب، استخدم كلمة مروره الحالية.`
      : `You’re invited to ${brand.name}. This invitation expires in 7 days. If you have an account, use your current password.`;
  const color = /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : '#137b70';
  return {
    subject: `${title} · ${brand.name}`,
    text: text + '\n' + url,
    html: `<!doctype html><html lang="${language}" dir="${ar ? 'rtl' : 'ltr'}"><body style="margin:0;background:#f3f7f8;font-family:Arial,sans-serif;padding:32px"><main style="max-width:520px;margin:auto;background:white;border-radius:16px;padding:32px;border-top:5px solid ${color}">${brand.logo ? `<img src="${escapeMail(brand.logo)}" alt="" width="64" height="64">` : ''}<p style="color:${color};font-weight:bold">${escapeMail(brand.name)}</p><h1 style="font-size:24px;color:#17323e">${title}</h1><p style="line-height:1.9;color:#617783">${escapeMail(text)}</p><p style="margin-top:28px"><a href="${escapeMail(url)}" style="display:inline-block;padding:13px 24px;border-radius:9px;background:${color};color:white;text-decoration:none">${ar ? 'قبول الدعوة' : 'Accept invitation'}</a></p><p style="color:#83959d;font-size:12px">${ar ? 'لا تشارك هذا الرابط. تجاهل الرسالة إذا لم تتوقعها.' : 'Keep this link private. Ignore this message if unexpected.'}</p></main></body></html>`,
  };
}
@Injectable()
export class InvitationMail {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
    private effects: ExternalEffects,
    private crypto: CryptoService,
    private plans: PlansService,
  ) {}
  async appearance(tenant: string) {
    return this.db.withTenant(tenant, async (c) => {
      const plan = await this.plans.getTenantPlan(c),
        custom = plan.features.white_label
          ? (await c.query('SELECT * FROM workspace_branding')).rows[0]
          : null;
      const domain = custom
        ? (
            await c.query(
              'SELECT hostname FROM workspace_domains WHERE public_domain_brand(hostname,$1) IS NOT NULL ORDER BY created_at LIMIT 1',
              [env.BILLING_PAST_DUE_GRACE_DAYS],
            )
          ).rows[0]
        : null;
      return {
        name: custom?.name ?? 'ELHAFEZ BOAT',
        color: custom?.primary_color ?? '#137b70',
        logo: custom?.logo_url ?? null,
        origin:
          env.CUSTOM_DOMAINS_ENABLED === 'true' && domain
            ? 'https://' + domain.hostname
            : env.APP_URL,
      };
    });
  }
  async enqueue(
    tenant: string,
    invitationId: string,
    email: string,
    token: string,
    language: 'ar' | 'en',
  ) {
    return this.db.withTenant(tenant, async (c) => {
      const job = (
        await c.query(
          'INSERT INTO invitation_mail_jobs(tenant_id,invitation_id,payload_enc) VALUES($1,$2,$3) RETURNING id,status',
          [tenant, invitationId, this.crypto.encrypt({ email, token, language })],
        )
      ).rows[0];
      await this.events.publish(
        tenant,
        'mail.invitation',
        job.id,
        { id: job.id },
        'mail:' + job.id,
      );
      return job;
    });
  }
  @OnEvent('mail.invitation', { suppressErrors: false }) async process(event: {
    tenantId: string;
    id: string;
  }) {
    return this.db.withTenant(event.tenantId, async (c) => {
      const job = (
        await c.query(
          "SELECT * FROM invitation_mail_jobs WHERE id=$1 AND status='pending' FOR UPDATE",
          [event.id],
        )
      ).rows[0];
      if (!job) return;
      const invitation = (
        await c.query(
          'SELECT id FROM invitations WHERE id=$1 AND accepted_at IS NULL AND expires_at>now()',
          [job.invitation_id],
        )
      ).rows[0];
      if (!invitation) {
        await c.query(
          "UPDATE invitation_mail_jobs SET status='canceled',payload_enc=NULL,error='Invitation expired, revoked or accepted',updated_at=now() WHERE id=$1",
          [job.id],
        );
        return;
      }
      if (
        env.EXTERNAL_DELIVERY_ENABLED !== 'true' ||
        env.EMAIL_DELIVERY_ENABLED !== 'true' ||
        !env.EMAIL_GATEWAY_URL ||
        !env.EMAIL_GATEWAY_TOKEN
      ) {
        await c.query(
          "UPDATE invitation_mail_jobs SET status='blocked',error='Email delivery is disabled or unconfigured',updated_at=now() WHERE id=$1",
          [job.id],
        );
        return;
      }
      const payload = this.crypto.decrypt<{ email: string; token: string; language: 'ar' | 'en' }>(
          job.payload_enc,
        ),
        brand = await this.appearance(event.tenantId),
        url = brand.origin + '/accept-invitation?' + new URLSearchParams({ token: payload.token });
      const message = renderInvitation(brand, url, payload.language);
      try {
        const result = await this.db.eventScope('mail:' + job.id, () =>
          this.effects.execute(event.tenantId, { to: payload.email, ...message }, async () => {
            const response = await safeHttpRequest({
              method: 'POST',
              url: env.EMAIL_GATEWAY_URL!,
              headers: {
                Authorization: 'Bearer ' + env.EMAIL_GATEWAY_TOKEN,
                'Content-Type': 'application/json',
                'Idempotency-Key': 'boat-mail-' + job.id,
              },
              body: JSON.stringify({
                to: payload.email,
                ...message,
                reference: { tenantId: event.tenantId, jobId: job.id },
                receiptUrl: env.PUBLIC_API_URL + '/mail/receipts',
              }),
              timeoutMs: 10000,
            });
            const data = z
              .object({ accepted: z.literal(true), id: z.string().min(1).max(255) })
              .safeParse(response.body);
            if (!response.ok || !data.success)
              throw new Error('Email gateway outcome could not be confirmed');
            return data.data;
          }),
        );
        await c.query(
          "UPDATE invitation_mail_jobs SET status='accepted',provider_id=$2,payload_enc=NULL,error=NULL,updated_at=now() WHERE id=$1",
          [job.id, result.id],
        );
      } catch {
        await c.query(
          "UPDATE invitation_mail_jobs SET status='ambiguous',error='Provider outcome uncertain; automatic replay refused',updated_at=now() WHERE id=$1",
          [job.id],
        );
      }
    });
  }
}
@Controller('workspace/mail')
@Roles('owner', 'admin')
class InvitationMailController {
  constructor(
    private db: DatabaseService,
    private mail: InvitationMail,
    private events: EventsService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,invitation_id,status,provider_id,error,created_at,updated_at,delivery_status,delivery_event_at FROM invitation_mail_jobs ORDER BY created_at DESC LIMIT 50',
          )
        ).rows,
    );
  }
  @Post('preview') async preview(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(z.object({ language: z.enum(['ar', 'en']).default('ar') }), body),
      brand = await this.mail.appearance(r.user.tenantId);
    return renderInvitation(brand, brand.origin + '/register', b.language);
  }
  @Post(':id/resume') resume(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE invitation_mail_jobs SET status='pending',error=NULL,updated_at=now() WHERE id=$1 AND status='blocked' RETURNING id",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Only blocked mail can resume');
      await this.events.publish(r.user.tenantId, 'mail.invitation', id, { id });
      return row;
    });
  }
}
@Global()
@Module({
  providers: [InvitationMail, CryptoService],
  controllers: [InvitationMailController, MailReceiptController, MailReviewController],
  exports: [InvitationMail],
})
export class InvitationMailModule {}
