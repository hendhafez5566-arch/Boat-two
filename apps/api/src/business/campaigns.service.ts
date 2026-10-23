import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { MessagingService } from '../messaging/messaging.service';
import { MessageContent } from '../messaging/message-content';
import { PlansService } from '../plans/plans.service';
import { contactWhere, Filters } from './schemas';
@Injectable()
export class CampaignsService {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
    private messaging: MessagingService,
    private plans: PlansService,
  ) {}
  async audience(tenant: string, channelId: string, filters: Filters) {
    const w = contactWhere(filters);
    return this.db.withTenant(tenant, async (c) => {
      if (!(await c.query('SELECT 1 FROM channels WHERE id=$1', [channelId])).rowCount)
        throw new NotFoundException('Channel not found');
      return (
        await c.query(
          `SELECT count(*)::int AS matched,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM contact_consents s JOIN contact_channels cc ON cc.contact_id=s.contact_id AND cc.channel_id=s.channel_id WHERE s.contact_id=contacts.id AND s.channel_id=$5 AND s.status='opted_in'))::int AS eligible FROM contacts WHERE ${w.sql}`,
          [...w.params, channelId],
        )
      ).rows[0];
    });
  }
  async schedule(tenant: string, id: string, at: string) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const existing = (await c.query('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!existing || !['draft', 'scheduled'].includes(existing.status))
        throw new BadRequestException('Only drafts or scheduled campaigns can be scheduled');
      if (
        !(
          await c.query(
            'SELECT 1 FROM channel_delivery_policy WHERE channel_id=$1 AND marketing_enabled',
            [existing.channel_id],
          )
        ).rowCount
      )
        throw new BadRequestException('Enable the channel campaign policy before scheduling');
      const when = new Date(at).getTime();
      if (when < Date.now() - 60000 || when > Date.now() + 366 * 86400000)
        throw new BadRequestException('Choose a schedule within the next year');
      if (existing.status === 'draft')
        await this.plans.assertWithinLimit(
          c,
          'campaigns_per_month',
          (
            await c.query(
              "SELECT count(*)::int AS n FROM campaigns WHERE status<>'draft' AND scheduled_at>=date_trunc('month',now())",
            )
          ).rows[0].n,
        );
      const p = await this.plans.getTenantPlan(c);
      if (!p.features.broadcasts)
        throw new BadRequestException('This plan does not include campaigns');
      const row = (
        await c.query(
          "UPDATE campaigns SET status='scheduled',scheduled_at=$2,revision=revision+1,updated_at=now() WHERE id=$1 AND status IN ('draft','scheduled') RETURNING *",
          [id, at],
        )
      ).rows[0];
      if (!row) throw new BadRequestException('Only draft campaigns can be scheduled');
      const audience = await this.audience(tenant, row.channel_id, row.filters);
      if (!audience.eligible)
        throw new BadRequestException('No opted-in contacts linked to this channel');
      await this.events.publish(
        tenant,
        'campaign.run',
        id,
        { campaignId: id, revision: row.revision },
        `campaign:${id}:${row.revision}`,
        at,
      );
      return { scheduled: true, audience };
    });
  }
  @OnEvent('campaign.run', { suppressErrors: false }) async start(e: {
    tenantId: string;
    campaignId: string;
    revision?: number;
  }) {
    await this.db.withTenant(e.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE campaigns SET status='running' WHERE id=$1 AND status='scheduled' AND ($2::int IS NULL AND revision<=1 OR revision=$2) AND scheduled_at<=now() RETURNING *",
          [e.campaignId, e.revision ?? null],
        )
      ).rows[0];
      if (!row) return;
      const w = contactWhere(row.filters);
      await c.query(
        `INSERT INTO campaign_recipients(tenant_id,campaign_id,contact_id) SELECT $5,$6,id FROM contacts WHERE ${w.sql} AND EXISTS(SELECT 1 FROM contact_consents s JOIN contact_channels cc ON cc.contact_id=s.contact_id AND cc.channel_id=s.channel_id WHERE s.contact_id=contacts.id AND s.channel_id=$7 AND s.status='opted_in') ON CONFLICT(campaign_id,contact_id) DO NOTHING`,
        [...w.params, e.tenantId, row.id, row.channel_id],
      );
      await c.query(
        `INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload) SELECT tenant_id,'campaign.recipient',contact_id::text,'recipient:'||id::text,jsonb_build_object('recipientId',id) FROM campaign_recipients WHERE campaign_id=$1 ON CONFLICT(tenant_id,dedupe_key) DO NOTHING`,
        [row.id],
      );
      if (
        !(await c.query('SELECT 1 FROM campaign_recipients WHERE campaign_id=$1', [row.id]))
          .rowCount
      )
        await c.query("UPDATE campaigns SET status='completed' WHERE id=$1", [row.id]);
    });
  }
  @OnEvent('campaign.recipient', { suppressErrors: false }) async recipient(e: {
    tenantId: string;
    recipientId: string;
  }) {
    await this.db.withTenant(e.tenantId, async (c) => {
      const r = (
        await c.query(
          'SELECT r.*,p.channel_id,p.content,p.frequency_hours,p.status AS campaign_status FROM campaign_recipients r JOIN campaigns p ON p.id=r.campaign_id WHERE r.id=$1 FOR UPDATE OF r',
          [e.recipientId],
        )
      ).rows[0];
      if (!r || r.status !== 'pending') return;
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))', [
        r.canonical_contact_id,
      ]);
      const contact = (
        await c.query('SELECT archived_at,merged_into_id FROM contacts WHERE id=$1', [
          r.canonical_contact_id,
        ])
      ).rows[0];
      const channelPolicy = (
        await c.query(
          'SELECT p.*,ch.type FROM channel_delivery_policy p JOIN channels ch ON ch.id=p.channel_id WHERE p.channel_id=$1 FOR UPDATE OF p',
          [r.channel_id],
        )
      ).rows[0];
      let reason =
        !contact || contact.archived_at || contact.merged_into_id
          ? 'Contact archived or merged'
          : '';
      if (
        (
          await c.query(
            "SELECT 1 FROM campaign_recipients WHERE campaign_id=$1 AND canonical_contact_id=$2 AND id<>$3 AND status='queued' LIMIT 1",
            [r.campaign_id, r.canonical_contact_id, r.id],
          )
        ).rowCount
      )
        reason = 'Duplicate canonical recipient';
      if (!channelPolicy?.marketing_enabled) reason = 'Channel marketing policy disabled';
      const plan = await this.plans.getTenantPlan(c);
      if (!plan.features.broadcasts) reason = 'Campaign entitlement no longer available';
      if (r.campaign_status !== 'running') reason = 'Campaign is not running';
      if (
        !(
          await c.query(
            "SELECT 1 FROM contact_consents WHERE contact_id=$1 AND channel_id=$2 AND status='opted_in'",
            [r.canonical_contact_id, r.channel_id],
          )
        ).rowCount
      )
        reason = 'Consent withdrawn';
      if (
        (
          await c.query(
            "SELECT 1 FROM campaign_recipients other JOIN campaigns p ON p.id=other.campaign_id WHERE other.canonical_contact_id=$1 AND p.channel_id=$2 AND other.id<>$3 AND other.status='queued' AND other.updated_at>now()-make_interval(hours=>$4)",
            [r.canonical_contact_id, r.channel_id, r.id, r.frequency_hours],
          )
        ).rowCount
      )
        reason = 'Frequency cap';
      let messageId: string | null = null;
      let status = 'skipped';
      if (!reason) {
        if (channelPolicy.type === 'web') {
          const due = new Date(channelPolicy.next_send_at);
          if (due.getTime() > Date.now()) {
            await this.events.publish(
              e.tenantId,
              'campaign.recipient',
              r.canonical_contact_id,
              { recipientId: r.id },
              randomUUID(),
              due.toISOString(),
            );
            return;
          }
          await c.query(
            "UPDATE channel_delivery_policy SET next_send_at=now()+interval_ms*interval '1 millisecond' WHERE channel_id=$1",
            [r.channel_id],
          );
        }
        const conv = (
          await c.query(
            "SELECT id FROM conversations WHERE contact_id=$1 AND channel_id=$2 AND status<>'closed' ORDER BY created_at DESC LIMIT 1",
            [r.canonical_contact_id, r.channel_id],
          )
        ).rows[0];
        if (!conv) reason = 'No active channel conversation';
        else
          try {
            const sent = await this.messaging.sendOutbound({
              tenantId: e.tenantId,
              conversationId: conv.id,
              content: r.content as MessageContent,
              senderType: 'system',
            });
            messageId = sent.id;
            status = 'queued';
          } catch (error) {
            status = 'failed';
            reason = (error as Error).message;
          }
      }
      await c.query(
        'UPDATE campaign_recipients SET status=$2,message_id=$3,error=$4,updated_at=now() WHERE id=$1',
        [r.id, status, messageId, reason || null],
      );
      await c.query(
        "UPDATE campaigns SET status='completed' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM campaign_recipients WHERE campaign_id=$1 AND status='pending') AND status='running'",
        [r.campaign_id],
      );
    });
  }
  async retry(tenant: string, campaign: string, recipient: string) {
    return this.db.withTenant(tenant, async (c) => {
      const row = (
        await c.query(
          "UPDATE campaign_recipients SET status='pending',error=NULL WHERE id=$1 AND campaign_id=$2 AND status='failed' RETURNING contact_id",
          [recipient, campaign],
        )
      ).rows[0];
      if (!row) throw new BadRequestException('Recipient is not retryable');
      await c.query("UPDATE campaigns SET status='running' WHERE id=$1 AND status='completed'", [
        campaign,
      ]);
      await this.events.publish(
        tenant,
        'campaign.recipient',
        row.contact_id,
        { recipientId: recipient },
        randomUUID(),
      );
      return { queued: true };
    });
  }
}
