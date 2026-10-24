import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
// One statement freezes the retained timeline, including original identities after merges.
// Work records are observed current values, not invented historical task/deal revisions.
export async function freezeContactActivity(
  c: PoolClient,
  tenant: string,
  actor: string,
  contact: string,
  from?: string,
  to?: string,
) {
  if (from && to && new Date(from) > new Date(to))
    throw new BadRequestException('Activity date range is reversed');
  const profile = (
    await c.query('SELECT id FROM contacts WHERE id=$1 AND merged_into_id IS NULL', [contact])
  ).rows[0];
  if (!profile) throw new NotFoundException('Canonical contact not found');
  const job = (
    await c.query(
      "INSERT INTO crm_jobs(tenant_id,kind,input,total,created_by) VALUES($1,'activity_export',$2,0,$3) RETURNING id,kind,status,total",
      [
        tenant,
        JSON.stringify({
          storage: 'ordinal_rows_v1',
          contactId: contact,
          from: from ?? null,
          to: to ?? null,
          historySemantics:
            'retained_observed_profile_history_and_activity_with_current_work_records',
        }),
        actor,
      ],
    )
  ).rows[0];
  const frozen = await c.query(
    `WITH identities AS (SELECT id FROM contacts WHERE id=$1 OR merged_into_id=$1),
    stamp AS (UPDATE crm_jobs SET input=input||jsonb_build_object('snapshotAt',statement_timestamp(),'historyCoverage',(SELECT available_from FROM crm_history_bounds)) WHERE id=$4 RETURNING id,tenant_id),
    activity AS (
      SELECT 'profile_history' kind, recorded_at occurred_at, change_id::text resource_id, jsonb_build_object('contactId',contact_id,'deleted',deleted,'snapshot',snapshot) data FROM crm_contact_history WHERE contact_id IN(SELECT id FROM identities)
      UNION ALL SELECT 'consent_history',created_at,id::text,to_jsonb(h)-'tenant_id' FROM consent_history h WHERE contact_id IN(SELECT id FROM identities)
      UNION ALL SELECT 'note',created_at,id::text,to_jsonb(n)-'tenant_id' FROM crm_notes n WHERE contact_id IN(SELECT id FROM identities)
      UNION ALL SELECT 'task_current',updated_at,id::text,to_jsonb(t)-'tenant_id' FROM crm_tasks t WHERE contact_id IN(SELECT id FROM identities)
      UNION ALL SELECT 'deal_current',updated_at,id::text,to_jsonb(d)-'tenant_id' FROM crm_deals d WHERE contact_id IN(SELECT id FROM identities)
      UNION ALL SELECT 'conversation',created_at,id::text,jsonb_build_object('id',id,'contactId',contact_id,'channelId',channel_id,'status',status,'handledBy',handled_by,'assignedTo',assigned_to,'departmentId',department_id,'lastMessageAt',last_message_at) FROM conversations WHERE contact_id IN(SELECT id FROM identities)
      UNION ALL SELECT 'event',created_at,id::text,jsonb_build_object('id',id,'type',type,'status',status,'contactId',payload->>'contactId') FROM domain_events WHERE payload->>'contactId' IN(SELECT id::text FROM identities)
    ), bounded AS (SELECT * FROM activity WHERE ($2::timestamptz IS NULL OR occurred_at>=$2) AND ($3::timestamptz IS NULL OR occurred_at<=$3) ORDER BY occurred_at,kind,resource_id LIMIT 50001)
    INSERT INTO crm_export_rows(tenant_id,job_id,ordinal,payload)
    SELECT stamp.tenant_id,stamp.id,row_number() OVER(ORDER BY occurred_at,kind,resource_id),to_jsonb(bounded) FROM bounded CROSS JOIN stamp`,
    [contact, from ?? null, to ?? null, job.id],
  );
  const total = frozen.rowCount ?? 0;
  if (total > 50000)
    throw new BadRequestException('Narrow the activity date range to at most 50,000 records');
  await c.query('UPDATE crm_jobs SET total=$2 WHERE id=$1', [job.id, total]);
  return { ...job, total };
}
