import { Buffer } from 'node:buffer';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { contactSchema } from './schemas';
import { parse } from '../common/zod';
export const uploadSchema = z
  .object({
    total: z.number().int().min(1).max(10000),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const uploadRowsSchema = z
  .object({
    after: z.number().int().min(0).max(10000),
    rows: z.array(contactSchema).min(1).max(100),
  })
  .strict();
export async function startImportUpload(
  c: PoolClient,
  tenant: string,
  actor: string,
  body: unknown,
) {
  const input = parse(uploadSchema, body);
  await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
  const existing = (
    await c.query(
      "SELECT id,kind,status,total,uploaded FROM crm_jobs WHERE kind='import' AND status='uploading' AND input->>'fingerprint'=$1 ORDER BY created_at DESC LIMIT 1",
      [input.fingerprint],
    )
  ).rows[0];
  if (existing) {
    if (existing.total !== input.total) throw new ConflictException('Upload identity changed');
    return existing;
  }
  if (
    Number(
      (
        await c.query(
          "SELECT count(*) n FROM crm_jobs WHERE status IN ('uploading','pending','running')",
        )
      ).rows[0].n,
    ) >= 3
  )
    throw new BadRequestException('At most three active CRM jobs per workspace');
  return (
    await c.query(
      "INSERT INTO crm_jobs(tenant_id,kind,status,input,total,created_by) VALUES($1,'import','uploading',$2,$3,$4) RETURNING id,kind,status,total,uploaded",
      [
        tenant,
        JSON.stringify({
          storage: 'ordinal_import_v1',
          fingerprint: input.fingerprint,
          uploadedBytes: 0,
        }),
        input.total,
        actor,
      ],
    )
  ).rows[0];
}
export async function addImportUploadRows(c: PoolClient, id: string, body: unknown) {
  const input = parse(uploadRowsSchema, body),
    job = (
      await c.query(
        "SELECT * FROM crm_jobs WHERE id=$1 AND kind='import' AND input->>'storage'='ordinal_import_v1' FOR UPDATE",
        [id],
      )
    ).rows[0];
  if (!job) throw new NotFoundException('Upload not found');
  if (job.status !== 'uploading')
    throw new ConflictException('Upload is closed; refresh job state');
  if (input.after + input.rows.length > job.total || input.after > job.uploaded)
    throw new BadRequestException('Upload offset or total is invalid');
  if (input.after < job.uploaded) {
    const equal = Number(
      (
        await c.query(
          'SELECT count(*) n FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY incoming(payload,ordinal) JOIN crm_import_rows saved ON saved.job_id=$1 AND saved.ordinal=$3+incoming.ordinal AND saved.payload=incoming.payload',
          [id, JSON.stringify(input.rows), input.after],
        )
      ).rows[0].n,
    );
    if (equal !== input.rows.length)
      throw new ConflictException('Previously uploaded rows differ; resume with the same file');
    return { id, status: job.status, uploaded: job.uploaded, total: job.total };
  }
  const uploadedBytes =
    Number(job.input.uploadedBytes ?? 0) + Buffer.byteLength(JSON.stringify(input.rows));
  if (uploadedBytes > 12000000)
    throw new BadRequestException('Normalized upload exceeds the 12MB storage budget');
  await c.query(
    'INSERT INTO crm_import_rows(tenant_id,job_id,ordinal,payload) SELECT $1,$2,$3+ordinal,payload FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY input(payload,ordinal)',
    [job.tenant_id, id, input.after, JSON.stringify(input.rows)],
  );
  return (
    await c.query(
      "UPDATE crm_jobs SET uploaded=uploaded+$2,input=jsonb_set(input,'{uploadedBytes}',to_jsonb($3::integer)),updated_at=now() WHERE id=$1 RETURNING id,status,uploaded,total",
      [id, input.rows.length, uploadedBytes],
    )
  ).rows[0];
}
export async function finishImportUpload(c: PoolClient, id: string) {
  const job = (
    await c.query(
      "SELECT id,status,uploaded,total FROM crm_jobs WHERE id=$1 AND kind='import' AND input->>'storage'='ordinal_import_v1' FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!job) throw new NotFoundException('Upload not found');
  if (job.status === 'canceled') throw new ConflictException('Upload was canceled');
  if (job.status !== 'uploading') return { ...job, queued: false };
  if (job.uploaded !== job.total) throw new BadRequestException('Upload is incomplete');
  await c.query("UPDATE crm_jobs SET status='pending',updated_at=now() WHERE id=$1", [id]);
  return { ...job, status: 'pending', queued: true };
}
