import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { env } from '../config/env';
import { ChannelsService } from './channels.service';
import { MetaAdapter } from './adapters/meta.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { ProviderError } from './adapters/adapter';
@Injectable()
export class OutboundService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private log = new Logger(OutboundService.name);
  constructor(
    private db: DatabaseService,
    private channels: ChannelsService,
    private whatsapp: WhatsAppAdapter,
    private meta: MetaAdapter,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.tick(), 1000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.db.query<{ id: string; tenant_id: string }>(
        'SELECT * FROM outbound_due(20)',
      );
      for (const job of due.rows) {
        const row = await this.db.withTenant(job.tenant_id, async (c) => {
          const j = (
            await c.query(
              "SELECT * FROM outbound_jobs WHERE id=$1 AND status IN ('pending','sending') FOR UPDATE SKIP LOCKED",
              [job.id],
            )
          ).rows[0];
          if (!j) return null;
          if (j.status === 'sending') {
            await c.query(
              "UPDATE outbound_jobs SET status='ambiguous',error='Worker lease expired after send began; reconcile with provider before retry',updated_at=now() WHERE id=$1",
              [j.id],
            );
            return null;
          }
          const message = (
            await c.query(
              `SELECT m.*,ch.type AS channel_type,ch.status AS channel_status,ch.credentials_enc,cv.last_inbound_at,cc.external_id AS recipient FROM messages m JOIN channels ch ON ch.id=m.channel_id JOIN conversations cv ON cv.id=m.conversation_id JOIN contact_channels cc ON cc.channel_id=m.channel_id AND cc.contact_id=cv.contact_id WHERE m.id=$1`,
              [j.message_id],
            )
          ).rows[0];
          const marketing = (
            await c.query(
              `SELECT r.canonical_contact_id,ct.archived_at,ct.merged_into_id,
            EXISTS(SELECT 1 FROM contact_consents s WHERE s.contact_id=r.canonical_contact_id AND s.channel_id=p.channel_id AND s.status='opted_in') AS consent
            FROM campaign_recipients r JOIN campaigns p ON p.id=r.campaign_id JOIN contacts ct ON ct.id=r.canonical_contact_id WHERE r.message_id=$1`,
              [j.message_id],
            )
          ).rows[0];
          if (
            marketing &&
            (!marketing.consent || marketing.archived_at || marketing.merged_into_id)
          ) {
            await c.query(
              "UPDATE outbound_jobs SET status='failed',error='Marketing consent withdrawn or contact archived',updated_at=now() WHERE id=$1",
              [j.id],
            );
            await c.query(
              "UPDATE messages SET status='failed',error='MARKETING_PERMISSION_REVOKED' WHERE id=$1",
              [j.message_id],
            );
            return null;
          }
          if (
            !message ||
            message.channel_status !== 'active' ||
            env.EXTERNAL_DELIVERY_ENABLED !== 'true'
          ) {
            await c.query(
              "UPDATE outbound_jobs SET status='blocked',error='External delivery disabled or channel inactive',updated_at=now() WHERE id=$1",
              [j.id],
            );
            return null;
          }
          if (
            message.channel_type === 'whatsapp' &&
            !message.content.template &&
            (!message.last_inbound_at ||
              Date.now() - new Date(message.last_inbound_at).getTime() > 86400000)
          ) {
            await c.query(
              "UPDATE outbound_jobs SET status='failed',error='WhatsApp window expired; approved template required',updated_at=now() WHERE id=$1",
              [j.id],
            );
            await c.query(
              "UPDATE messages SET status='failed',error='WINDOW_EXPIRED' WHERE id=$1",
              [j.message_id],
            );
            return null;
          }
          await c.query(
            "UPDATE outbound_jobs SET status='sending',attempts=attempts+1,lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=$1",
            [j.id],
          );
          return { ...message, jobId: j.id, attempts: j.attempts + 1 };
        });
        if (!row) continue;
        try {
          const creds = this.channels.credentials(row);
          const sent = await (row.channel_type === 'whatsapp' ? this.whatsapp : this.meta).send(
            creds,
            row.recipient,
            row.content,
          );
          if (!sent.externalId) throw new Error('Provider did not return a message identifier');
          await this.db.withTenant(job.tenant_id, async (c) => {
            await c.query(
              "UPDATE messages SET status='sent',external_id=$2,error=NULL WHERE id=$1",
              [row.id, sent.externalId],
            );
            await c.query(
              "UPDATE outbound_jobs SET status='sent',lease_until=NULL,error=NULL,updated_at=now() WHERE id=$1",
              [row.jobId],
            );
          });
        } catch (e) {
          const known = e instanceof ProviderError;
          const status =
            known && e.status === 429 && row.attempts < 5
              ? 'pending'
              : known && e.status < 500
                ? 'failed'
                : 'ambiguous';
          await this.db.withTenant(job.tenant_id, async (c) => {
            await c.query(
              "UPDATE outbound_jobs SET status=$2,error=$3,lease_until=NULL,available_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1",
              [row.jobId, status, (e as Error).message.slice(0, 300)],
            );
            if (status === 'failed')
              await c.query("UPDATE messages SET status='failed',error=$2 WHERE id=$1", [
                row.id,
                (e as Error).message.slice(0, 300),
              ]);
          });
        }
      }
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.running = false;
    }
  }
  async retry(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        "UPDATE outbound_jobs SET status='pending',attempts=0,error=NULL,available_at=now(),updated_at=now() WHERE id=$1 AND status IN ('failed','blocked') RETURNING id",
        [id],
      );
      if (!r.rowCount)
        throw new BadRequestException(
          'Only confirmed failed or blocked deliveries can be retried. Ambiguous deliveries require reconciliation.',
        );
      return { queued: true };
    });
  }
}
