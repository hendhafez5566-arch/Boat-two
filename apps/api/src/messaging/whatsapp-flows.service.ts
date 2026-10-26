import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { env } from '../config/env';
import { ChannelsService } from './channels.service';
import { ProviderError } from './adapters/adapter';
import { WhatsAppFlowsGateway } from './whatsapp-flows.gateway';
import {
  definitionHash,
  nativeFlowDraftSchema,
  ProviderFlow,
  safeFlowPreview,
} from './whatsapp-flow-contract';
type Draft = z.infer<typeof nativeFlowDraftSchema>;
type Action = 'create' | 'upload' | 'publish' | 'deprecate';
export type NativeFlow = {
  id: string;
  name: string;
  categories: string[];
  definition: Draft['definition'] | null;
  provider_id: string | null;
  waba_id: string | null;
  provider_status: string;
  validation_errors: Record<string, unknown>[];
  uploaded_hash: string | null;
  operation: Action | null;
  operation_state: 'running' | 'unknown' | null;
  operation_id: string | null;
  operation_started_at: string | null;
  revision: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};
@Injectable()
export class WhatsAppFlowsService {
  constructor(
    private db: DatabaseService,
    private channels: ChannelsService,
    private gateway: WhatsAppFlowsGateway,
  ) {}
  private async account(tenant: string, channel: string, external = false) {
    const row = await this.db.withTenant(
      tenant,
      async (c) =>
        (await c.query("SELECT * FROM channels WHERE id=$1 AND type='whatsapp'", [channel]))
          .rows[0],
    );
    if (!row) throw new NotFoundException('WhatsApp account not found');
    if (!external) return null;
    if (env.EXTERNAL_DELIVERY_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'External provider access is disabled by the environment operator',
      );
    const credentials = this.channels.credentials(row);
    if (!/^\d+$/.test(credentials.wabaId ?? '') || !credentials.accessToken)
      throw new BadRequestException(
        'Reconnect this account with a WABA ID and management permissions',
      );
    return { waba: credentials.wabaId, token: credentials.accessToken };
  }
  async list(tenant: string, channel: string) {
    await this.account(tenant, channel);
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query<NativeFlow>(
            'SELECT * FROM whatsapp_flows WHERE channel_id=$1 AND archived_at IS NULL ORDER BY updated_at DESC,id',
            [channel],
          )
        ).rows,
    );
  }
  async create(tenant: string, channel: string, draft: Draft) {
    await this.account(tenant, channel);
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query<NativeFlow>(
            'INSERT INTO whatsapp_flows(tenant_id,channel_id,name,categories,definition) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [
              tenant,
              channel,
              draft.name,
              [...new Set(draft.categories)],
              JSON.stringify(draft.definition),
            ],
          )
        ).rows[0],
    );
  }
  async edit(tenant: string, channel: string, id: string, revision: number, draft: Draft) {
    await this.account(tenant, channel);
    return this.db.withTenant(tenant, async (c) => {
      const row = (
        await c.query<NativeFlow>(
          'SELECT * FROM whatsapp_flows WHERE id=$1 AND channel_id=$2 AND archived_at IS NULL FOR UPDATE',
          [id, channel],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Flow not found');
      if (
        row.revision !== revision ||
        row.operation ||
        !['LOCAL_DRAFT', 'DRAFT'].includes(row.provider_status)
      )
        throw new ConflictException('Flow changed or cannot be edited; refresh before continuing');
      if (
        row.provider_id &&
        (row.name !== draft.name ||
          JSON.stringify([...row.categories].sort()) !==
            JSON.stringify([...draft.categories].sort()))
      )
        throw new BadRequestException(
          'Provider metadata is fixed here after registration. Duplicate the local definition for a new name or category.',
        );
      return (
        await c.query<NativeFlow>(
          'UPDATE whatsapp_flows SET name=$2,categories=$3,definition=$4,uploaded_hash=NULL,revision=revision+1,error=NULL,updated_at=now() WHERE id=$1 RETURNING *',
          [id, draft.name, [...new Set(draft.categories)], JSON.stringify(draft.definition)],
        )
      ).rows[0];
    });
  }
  private verifyOwnership(flow: ProviderFlow, waba: string) {
    if (flow.whatsapp_business_account?.id !== waba)
      throw new BadRequestException(
        'Provider Flow does not belong to this WhatsApp Business Account',
      );
  }
  async sync(tenant: string, channel: string) {
    const credentials = (await this.account(tenant, channel, true))!;
    const result = await this.gateway.list(credentials.waba, credentials.token);
    // Never trust paging.next URLs or write a partially parsed provider response.
    if (new Set(result.items.map((item) => item.id)).size !== result.items.length)
      throw new BadRequestException('Provider returned duplicate Flow IDs');
    for (const item of result.items)
      if (item.whatsapp_business_account) this.verifyOwnership(item, credentials.waba);
    await this.db.withTenant(tenant, async (c) => {
      for (const flow of result.items)
        await c.query(
          `INSERT INTO whatsapp_flows(tenant_id,channel_id,name,categories,provider_id,waba_id,provider_status,validation_errors) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(channel_id,provider_id) DO UPDATE SET name=EXCLUDED.name,categories=EXCLUDED.categories,provider_status=EXCLUDED.provider_status,validation_errors=EXCLUDED.validation_errors,revision=whatsapp_flows.revision+1,updated_at=now() WHERE whatsapp_flows.waba_id=EXCLUDED.waba_id AND whatsapp_flows.operation IS NULL`,
          [
            tenant,
            channel,
            flow.name,
            flow.categories,
            flow.id,
            credentials.waba,
            flow.status,
            JSON.stringify(flow.validation_errors),
          ],
        );
    });
    if (result.complete)
      await this.db.withTenant(tenant, (c) =>
        c.query(
          "UPDATE whatsapp_flows SET provider_status='UNAVAILABLE',revision=revision+1,updated_at=now() WHERE channel_id=$1 AND waba_id=$2 AND provider_id IS NOT NULL AND NOT(provider_id=ANY($3::text[])) AND operation IS NULL AND archived_at IS NULL",
          [channel, credentials.waba, result.items.map((item) => item.id)],
        ),
      );
    return { synced: result.items.length, complete: result.complete };
  }
  private async row(tenant: string, channel: string, id: string) {
    const row = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query<NativeFlow>(
            'SELECT * FROM whatsapp_flows WHERE id=$1 AND channel_id=$2 AND archived_at IS NULL',
            [id, channel],
          )
        ).rows[0],
    );
    if (!row) throw new NotFoundException('Flow not found');
    return row;
  }
  async refresh(tenant: string, channel: string, id: string) {
    const credentials = (await this.account(tenant, channel, true))!;
    let row = await this.row(tenant, channel, id);
    if (!row.provider_id)
      throw new BadRequestException(
        'No provider receipt. Synchronize and inspect any matching Flow before creating another draft.',
      );
    if (row.waba_id !== credentials.waba)
      throw new ConflictException('Account WABA changed; use the original account');
    if (row.operation_state === 'running') {
      if (
        !row.operation_started_at ||
        Date.now() - new Date(row.operation_started_at).getTime() < 120000
      )
        throw new ConflictException(
          'Provider operation is still running; retry refresh after it completes',
        );
      row = await this.db.withTenant(
        tenant,
        async (c) =>
          (
            await c.query<NativeFlow>(
              "UPDATE whatsapp_flows SET operation_state='unknown',revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING *",
              [id, row.revision],
            )
          ).rows[0],
      );
      if (!row) throw new ConflictException('Flow changed during recovery');
    }
    const flow = await this.gateway.get(row.provider_id!, credentials.token);
    this.verifyOwnership(flow, credentials.waba);
    // A status refresh resolves publication/deprecation only from explicit provider evidence.
    const resolved =
      row.operation === 'upload' ||
      (row.operation === 'publish' && flow.status === 'PUBLISHED') ||
      (row.operation === 'deprecate' && flow.status === 'DEPRECATED');
    const updated = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query<NativeFlow>(
            `UPDATE whatsapp_flows SET provider_status=$3,validation_errors=$4,uploaded_hash=CASE WHEN $7 THEN NULL ELSE uploaded_hash END,operation=CASE WHEN $5 THEN NULL ELSE operation END,operation_state=CASE WHEN $5 THEN NULL ELSE operation_state END,operation_id=CASE WHEN $5 THEN NULL ELSE operation_id END,error=CASE WHEN $5 THEN NULL ELSE error END,revision=revision+1,updated_at=now() WHERE id=$1 AND channel_id=$2 AND revision=$6 RETURNING *`,
            [
              id,
              channel,
              flow.status,
              JSON.stringify(flow.validation_errors),
              resolved,
              row.revision,
              row.operation === 'upload',
            ],
          )
        ).rows[0],
    );
    if (!updated) throw new ConflictException('Flow changed during refresh');
    return {
      flow: updated,
      preview: flow.preview
        ? { url: safeFlowPreview(flow.preview.preview_url), expiresAt: flow.preview.expires_at }
        : null,
    };
  }
  async operate(tenant: string, channel: string, id: string, revision: number, action: Action) {
    const credentials = (await this.account(tenant, channel, true))!;
    const operationId = randomUUID();
    const row = await this.db.withTenant(tenant, async (c) => {
      const row = (
        await c.query<NativeFlow>(
          'SELECT * FROM whatsapp_flows WHERE id=$1 AND channel_id=$2 AND archived_at IS NULL FOR UPDATE',
          [id, channel],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Flow not found');
      if (row.revision !== revision || row.operation)
        throw new ConflictException(
          'Flow changed or an earlier operation needs reconciliation. Refresh before continuing.',
        );
      if (row.provider_id && row.waba_id !== credentials.waba)
        throw new ConflictException('Account WABA changed');
      if (
        action === 'create' &&
        (row.provider_id || row.provider_status !== 'LOCAL_DRAFT' || !row.definition)
      )
        throw new BadRequestException('Only a local draft can be registered');
      if (action !== 'create' && !row.provider_id)
        throw new BadRequestException('Register the draft with Meta first');
      if ((action === 'upload' || action === 'publish') && row.provider_status !== 'DRAFT')
        throw new BadRequestException('Only provider drafts can be uploaded or published');
      if (action === 'upload' && !row.definition)
        throw new BadRequestException('No local definition available');
      if (
        action === 'publish' &&
        (!row.definition ||
          row.uploaded_hash !== definitionHash(row.definition) ||
          row.validation_errors.length)
      )
        throw new BadRequestException(
          'Upload the current definition and resolve Meta validation errors before publishing',
        );
      if (action === 'deprecate' && row.provider_status !== 'PUBLISHED')
        throw new BadRequestException('Only published Flows can be deprecated');
      await c.query(
        "UPDATE whatsapp_flows SET operation=$2,operation_state='running',operation_id=$3,operation_started_at=now(),error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
        [id, action, operationId],
      );
      return row;
    });
    try {
      let providerId = row.provider_id;
      let status = row.provider_status;
      let errors = row.validation_errors;
      let hash = row.uploaded_hash;
      if (action === 'create') {
        const receipt = await this.gateway.create(
          credentials.waba,
          credentials.token,
          row.name,
          row.categories,
        );
        providerId = receipt.id;
        status = 'DRAFT';
      } else {
        const current = await this.gateway.get(providerId!, credentials.token);
        this.verifyOwnership(current, credentials.waba);
        if (current.status !== (action === 'deprecate' ? 'PUBLISHED' : 'DRAFT'))
          throw new BadRequestException('Provider status changed; synchronize before continuing');
        if (action === 'upload') {
          const result = await this.gateway.upload(providerId!, credentials.token, row.definition);
          errors = result.validation_errors;
          hash = definitionHash(row.definition);
        } else {
          if (action === 'publish' && current.validation_errors.length)
            throw new BadRequestException(
              'Meta reports validation errors; refresh before publishing',
            );
          await this.gateway.transition(providerId!, credentials.token, action);
          status = action === 'publish' ? 'PUBLISHED' : 'DEPRECATED';
        }
      }
      return await this.db.withTenant(
        tenant,
        async (c) =>
          (
            await c.query<NativeFlow>(
              'UPDATE whatsapp_flows SET provider_id=$3,waba_id=$4,provider_status=$5,validation_errors=$6,uploaded_hash=$7,operation=NULL,operation_state=NULL,operation_id=NULL,error=NULL,updated_at=now() WHERE id=$1 AND channel_id=$2 AND operation_id=$8 RETURNING *',
              [
                id,
                channel,
                providerId,
                credentials.waba,
                status,
                JSON.stringify(errors),
                hash,
                operationId,
              ],
            )
          ).rows[0],
      );
    } catch (error) {
      const definite =
        (error instanceof ProviderError && error.status >= 400 && error.status < 500) ||
        error instanceof BadRequestException;
      await this.db.withTenant(tenant, (c) =>
        c.query(
          `UPDATE whatsapp_flows SET operation=CASE WHEN $3 THEN NULL ELSE operation END,operation_state=CASE WHEN $3 THEN NULL ELSE 'unknown' END,operation_id=CASE WHEN $3 THEN NULL ELSE operation_id END,error=$4,updated_at=now() WHERE id=$1 AND operation_id=$2`,
          [
            id,
            operationId,
            definite,
            definite
              ? 'Provider rejected this operation; check configuration and refresh.'
              : 'Provider outcome is unknown; automatic retries are disabled. Inspect Meta before continuing.',
          ],
        ),
      );
      if (definite)
        throw new BadRequestException(
          'Provider rejected the operation; refresh and check its status',
        );
      throw new ServiceUnavailableException(
        'Provider outcome is unknown; inspect Meta and synchronize. Do not blindly retry.',
      );
    }
  }
  async reconcileCreate(
    tenant: string,
    channel: string,
    id: string,
    revision: number,
    providerId: string,
  ) {
    const credentials = (await this.account(tenant, channel, true))!;
    const snapshot = await this.row(tenant, channel, id);
    if (
      snapshot.revision !== revision ||
      snapshot.provider_id ||
      snapshot.operation !== 'create' ||
      (snapshot.operation_state === 'running' &&
        (!snapshot.operation_started_at ||
          Date.now() - new Date(snapshot.operation_started_at).getTime() < 120000))
    )
      throw new ConflictException('Only an uncertain registration can be reconciled');
    const evidence = await this.gateway.get(providerId, credentials.token);
    this.verifyOwnership(evidence, credentials.waba);
    if (
      evidence.name !== snapshot.name ||
      JSON.stringify([...evidence.categories].sort()) !==
        JSON.stringify([...snapshot.categories].sort())
    )
      throw new BadRequestException('Provider name and categories do not match the local draft');
    return this.db.withTenant(tenant, async (c) => {
      const row = (
        await c.query<NativeFlow>(
          'SELECT * FROM whatsapp_flows WHERE id=$1 AND channel_id=$2 FOR UPDATE',
          [id, channel],
        )
      ).rows[0];
      if (!row || row.revision !== revision)
        throw new ConflictException('Flow changed during reconciliation');
      const imported = (
        await c.query<NativeFlow>(
          'SELECT * FROM whatsapp_flows WHERE channel_id=$1 AND provider_id=$2 FOR UPDATE',
          [channel, providerId],
        )
      ).rows[0];
      if (imported) {
        if (imported.operation || imported.definition)
          throw new ConflictException('Provider Flow is already managed by another local draft');
        const merged = (
          await c.query<NativeFlow>(
            'UPDATE whatsapp_flows SET definition=$2,provider_status=$3,validation_errors=$4,uploaded_hash=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',
            [
              imported.id,
              JSON.stringify(row.definition),
              evidence.status,
              JSON.stringify(evidence.validation_errors),
            ],
          )
        ).rows[0];
        await c.query(
          'UPDATE whatsapp_flows SET archived_at=now(),operation=NULL,operation_state=NULL,operation_id=NULL,error=$2,revision=revision+1,updated_at=now() WHERE id=$1',
          [id, `Reconciled into local Flow ${imported.id}`],
        );
        return merged;
      }
      return (
        await c.query<NativeFlow>(
          'UPDATE whatsapp_flows SET provider_id=$2,waba_id=$3,provider_status=$4,validation_errors=$5,operation=NULL,operation_state=NULL,operation_id=NULL,error=NULL,uploaded_hash=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',
          [
            id,
            providerId,
            credentials.waba,
            evidence.status,
            JSON.stringify(evidence.validation_errors),
          ],
        )
      ).rows[0];
    });
  }
  async archive(tenant: string, channel: string, id: string, revision: number) {
    await this.account(tenant, channel);
    return this.db.withTenant(tenant, async (c) => {
      const result = await c.query(
        'UPDATE whatsapp_flows SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND channel_id=$2 AND revision=$3 AND provider_id IS NULL AND operation IS NULL AND archived_at IS NULL RETURNING id',
        [id, channel, revision],
      );
      if (!result.rows.length)
        throw new ConflictException('Only unchanged local drafts can be archived');
      return { archived: true };
    });
  }
}
