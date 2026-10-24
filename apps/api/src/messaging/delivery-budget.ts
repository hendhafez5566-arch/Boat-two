import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class DeliveryBudget {
  constructor(private db: DatabaseService) {}
  async take(tenant: string, channel: string, marketing = false) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7))', [channel]);
      await c.query(
        'INSERT INTO channel_delivery_policy(tenant_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [tenant, channel],
      );
      const policy = (
        await c.query('SELECT * FROM channel_delivery_policy WHERE channel_id=$1 FOR UPDATE', [
          channel,
        ])
      ).rows[0];
      if (marketing && !policy.marketing_enabled)
        return { allowed: false, blocked: true, reason: 'Channel marketing policy disabled' };
      const account = policy.account_id
        ? (
            await c.query('SELECT * FROM delivery_accounts WHERE id=$1 FOR UPDATE', [
              policy.account_id,
            ])
          ).rows[0]
        : null;
      if (policy.account_id && (!account || !account.enabled))
        return { allowed: false, blocked: true, reason: 'Shared provider account disabled' };
      const clock = (
        await c.query(
          "SELECT clock_timestamp() AS current_time,(clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day",
        )
      ).rows[0];
      const now = new Date(clock.current_time).getTime(),
        day = clock.day;
      if (account) {
        const oldDate = new Date(account.usage_date).toISOString().slice(0, 10);
        if (oldDate !== day) {
          account.daily_used = 0;
          await c.query('UPDATE delivery_accounts SET usage_date=$2,daily_used=0 WHERE id=$1', [
            account.id,
            day,
          ]);
        }
        if (account.daily_limit !== -1 && account.daily_used >= account.daily_limit)
          return {
            allowed: false,
            blocked: false,
            at: new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString(),
            reason: 'Shared daily attempt cap',
          };
      }
      const due = Math.max(
        new Date(policy.next_send_at).getTime(),
        account ? new Date(account.next_send_at).getTime() : 0,
      );
      if (due > now)
        return {
          allowed: false,
          blocked: false,
          at: new Date(due).toISOString(),
          reason: 'Shared send pacing',
        };
      await c.query(
        "UPDATE channel_delivery_policy SET next_send_at=clock_timestamp()+interval_ms*interval '1 millisecond' WHERE channel_id=$1",
        [channel],
      );
      if (account)
        await c.query(
          "UPDATE delivery_accounts SET daily_used=daily_used+1,next_send_at=clock_timestamp()+interval_ms*interval '1 millisecond' WHERE id=$1",
          [account.id],
        );
      return { allowed: true, blocked: false };
    });
  }
}
