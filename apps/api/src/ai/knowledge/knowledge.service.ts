import { createHash } from 'node:crypto';
import { OnEvent } from '@nestjs/event-emitter';
import { EventsService } from '../../events/events.service';
import { EmbeddingBudget } from './embedding-budget';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { env } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { normalizeText } from '../../flows/engine/text';
import { safeHttpRequest } from '../../flows/http-safe';
import { PlansService } from '../../plans/plans.service';
import { buildOrTsQuery, rrfFuse, toVectorLiteral } from '../retrieval';
import { chunkText, FaqItem, faqFromText, faqToText } from './chunker';
import { extractFileText, htmlToText } from './extract';

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  rrf: number;
}

const COLS =
  'id, type, title, source_ref, status, error, char_count, chunk_count, created_at, updated_at, revision, archived_at';
const MAX_CONTENT = 500_000;
const EMBED_BATCH = 64;
const MIN_VECTOR_SCORE = 0.2;

export type CreateSourceInput =
  | { type: 'text'; title: string; content: string }
  | { type: 'faq'; title: string; items: FaqItem[] }
  | { type: 'url'; url: string; title?: string };

@Injectable()
export class KnowledgeService {
  private readonly log = new Logger(KnowledgeService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
    private readonly events: EventsService,
    private readonly budget: EmbeddingBudget,
  ) {}

  get configured() {
    return this.budget.configured;
  }

  list(tenantId: string) {
    return this.db.withTenant(
      tenantId,
      async (c) =>
        (await c.query(`SELECT ${COLS} FROM knowledge_sources ORDER BY created_at DESC`)).rows,
    );
  }

  get(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT ${COLS}, left(content, 2000) AS preview FROM knowledge_sources WHERE id = $1`,
        [id],
      );
      if (!r.rows[0]) throw new NotFoundException('Source not found');
      return r.rows[0];
    });
  }

  private async insert(
    tenantId: string,
    userId: string,
    s: {
      type: string;
      title: string;
      ref?: string;
      content?: string;
      file?: { buf: Buffer; mime: string };
    },
  ) {
    const row = await this.db.withTenant(tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const n = (await c.query('SELECT count(*)::int AS n FROM knowledge_sources')).rows[0].n;
      await this.plans.assertWithinLimit(c, 'knowledge_sources', n);
      const source = (
        await c.query(
          `INSERT INTO knowledge_sources (tenant_id, type, title, source_ref, content, char_count, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
          [
            tenantId,
            s.type,
            s.title,
            s.ref ?? null,
            s.content ?? null,
            s.content?.length ?? 0,
            userId,
          ],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO knowledge_revisions(tenant_id,source_id,revision,title,type,source_ref,content,actor_id,file_sha256,file_bytes,file_mime) SELECT tenant_id,id,revision,title,type,source_ref,content,$2,$3,$4,$5 FROM knowledge_sources WHERE id=$1',
        [
          source.id,
          userId,
          s.file ? createHash('sha256').update(s.file.buf).digest('hex') : null,
          s.file?.buf.length ?? null,
          s.file?.mime ?? null,
        ],
      );
      await this.queue(tenantId, source.id, s.file);
      return source;
    });
    return row;
  }

  create(tenantId: string, userId: string, input: CreateSourceInput) {
    if (input.type === 'text') {
      if (input.content.trim().length < 20) throw new BadRequestException('Content is too short');
      return this.insert(tenantId, userId, {
        type: 'text',
        title: input.title,
        content: input.content.slice(0, MAX_CONTENT),
      });
    }
    if (input.type === 'faq') {
      const content = faqToText(input.items);
      if (!content) throw new BadRequestException('Add at least one question with an answer');
      return this.insert(tenantId, userId, { type: 'faq', title: input.title, content });
    }
    return this.insert(tenantId, userId, {
      type: 'url',
      title: input.title?.trim() || input.url,
      ref: input.url,
    });
  }

  async createFromFile(
    tenantId: string,
    userId: string,
    f: { name: string; mime: string; buf: Buffer; title?: string },
  ) {
    this.validateFile(f);
    if (!f.buf.length || f.buf.length > 5 * 1024 * 1024)
      throw new BadRequestException('Upload a file of at most 5MB');
    return this.insert(tenantId, userId, {
      type: 'file',
      title: f.title?.trim() || f.name,
      ref: f.name,
      file: { buf: f.buf, mime: f.mime },
    });
  }

  private validateFile(f: { name: string; mime: string; buf: Buffer; title?: string }) {
    if (
      !f.buf.length ||
      f.buf.length > 5 * 1024 * 1024 ||
      f.name.length > 255 ||
      f.mime.length > 200 ||
      (f.title?.length ?? 0) > 200
    )
      throw new BadRequestException('File must be at most 5MB with a bounded name/title');
    if (!/\.(txt|md|csv|pdf|docx)$/i.test(f.name))
      throw new BadRequestException('Unsupported file extension');
  }
  replaceFile(
    tenant: string,
    user: string,
    id: string,
    expectedRevision: number,
    f: { name: string; mime: string; buf: Buffer; title?: string },
  ) {
    this.validateFile(f);
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [id]);
      const src = (await c.query('SELECT * FROM knowledge_sources WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!src) throw new NotFoundException('Source not found');
      if (src.type !== 'file' || src.archived_at)
        throw new BadRequestException('Restore an existing file source before replacement');
      if (src.revision !== expectedRevision)
        throw new ConflictException('Source changed; reload before replacing');
      if (
        (
          await c.query(
            "SELECT 1 FROM knowledge_jobs WHERE source_id=$1 AND status IN ('pending','running','blocked')",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Cancel active indexing before replacement');
      if (
        (
          await c.query('SELECT count(*)::int AS n FROM knowledge_revisions WHERE source_id=$1', [
            id,
          ])
        ).rows[0].n >= 50
      )
        throw new BadRequestException('Source history limit reached');
      const row = (
        await c.query(
          'UPDATE knowledge_sources SET title=$2,source_ref=$3,content=NULL,char_count=0,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING ' +
            COLS,
          [id, f.title?.trim() || src.title, f.name],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO knowledge_revisions(tenant_id,source_id,revision,title,type,source_ref,content,actor_id,file_sha256,file_bytes,file_mime) SELECT tenant_id,id,revision,title,type,source_ref,content,$2,$3,$4,$5 FROM knowledge_sources WHERE id=$1',
        [id, user, createHash('sha256').update(f.buf).digest('hex'), f.buf.length, f.mime],
      );
      const job = await this.queue(tenant, id, { buf: f.buf, mime: f.mime });
      return { ...row, ...job };
    });
  }
  extractions(tenant: string, id: string, extractionId?: string) {
    return this.db.withTenant(tenant, async (c) => {
      if (!(await c.query('SELECT 1 FROM knowledge_sources WHERE id=$1', [id])).rowCount)
        throw new NotFoundException();
      if (extractionId) {
        const row = (
          await c.query('SELECT * FROM knowledge_extractions WHERE source_id=$1 AND id=$2', [
            id,
            extractionId,
          ])
        ).rows[0];
        if (!row) throw new NotFoundException();
        return row;
      }
      return (
        await c.query(
          'SELECT id,job_id,source_revision,title,source_ref,content_sha256,length(content) AS char_count,created_at FROM knowledge_extractions WHERE source_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',
          [id],
        )
      ).rows;
    });
  }
  editDetails(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const source = (await c.query('SELECT * FROM knowledge_sources WHERE id=$1', [id])).rows[0];
      if (!source) throw new NotFoundException('Source not found');
      const history = (
        await c.query(
          'SELECT revision,title,actor_id,created_at FROM knowledge_revisions WHERE source_id=$1 ORDER BY revision DESC LIMIT 50',
          [id],
        )
      ).rows;
      return { source, history };
    });
  }
  revisionDetails(tenant: string, id: string, revision: number) {
    return this.db.withTenant(tenant, async (c) => {
      const row = (
        await c.query(
          'SELECT revision,title,type,source_ref,content,created_at,file_sha256,file_bytes,file_mime FROM knowledge_revisions WHERE source_id=$1 AND revision=$2',
          [id, revision],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  update(
    tenant: string,
    user: string,
    id: string,
    input: CreateSourceInput,
    expectedRevision: number,
  ) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [id]);
      const src = (await c.query('SELECT * FROM knowledge_sources WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!src) throw new NotFoundException('Source not found');
      if (src.revision !== expectedRevision)
        throw new ConflictException('Source changed; reload before saving');
      if (src.archived_at) throw new BadRequestException('Restore source before editing');
      if (src.type !== input.type) throw new BadRequestException('Source type cannot change');
      if (
        (
          await c.query(
            "SELECT 1 FROM knowledge_jobs WHERE source_id=$1 AND status IN ('pending','running','blocked')",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Cancel the active indexing job before editing');
      if (
        (
          await c.query('SELECT count(*)::int AS n FROM knowledge_revisions WHERE source_id=$1', [
            id,
          ])
        ).rows[0].n >= 50
      )
        throw new BadRequestException('Source history limit reached; create a new source');
      const content =
        input.type === 'text'
          ? input.content
          : input.type === 'faq'
            ? faqToText(input.items)
            : null;
      if (input.type === 'text' && input.content.trim().length < 20)
        throw new BadRequestException('Content is too short');
      const title = input.title?.trim() || (input.type === 'url' ? input.url : src.title);
      const row = (
        await c.query(
          'UPDATE knowledge_sources SET title=$2,content=$3,source_ref=$4,char_count=$5,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING ' +
            COLS,
          [
            id,
            title,
            content,
            input.type === 'url' ? input.url : src.source_ref,
            content?.length ?? 0,
          ],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO knowledge_revisions(tenant_id,source_id,revision,title,type,source_ref,content,actor_id) SELECT tenant_id,id,revision,title,type,source_ref,content,$2 FROM knowledge_sources WHERE id=$1',
        [id, user],
      );
      const job = await this.queue(tenant, id);
      return { ...row, ...job };
    });
  }
  archive(tenant: string, id: string, archived: boolean) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [id]);
      const row = (
        await c.query(
          'UPDATE knowledge_sources SET archived_at=CASE WHEN $2 THEN COALESCE(archived_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING ' +
            COLS,
          [id, archived],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      if (archived)
        await c.query(
          "UPDATE knowledge_jobs SET status='canceled',error='Source archived',updated_at=now() WHERE source_id=$1 AND status IN ('pending','running','blocked','failed')",
          [id],
        );
      return row;
    });
  }

  remove(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [id]);
      const r = await c.query('DELETE FROM knowledge_sources WHERE id = $1', [id]);
      if (!r.rowCount) throw new NotFoundException('Source not found');
      return { removed: true };
    });
  }

  async reindex(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [id]);
      const current = await this.get(tenantId, id);
      if (current.archived_at) throw new BadRequestException('Restore source before indexing');
      await c.query('SELECT id FROM knowledge_sources WHERE id=$1 FOR UPDATE', [id]);
      const active = (
        await c.query(
          "SELECT id FROM knowledge_jobs WHERE source_id=$1 AND status IN ('pending','running','blocked')",
          [id],
        )
      ).rows[0];
      if (active) return { queued: true, jobId: active.id };
      return this.queue(tenantId, id);
    });
  }
  private async queue(tenant: string, source: string, file?: { buf: Buffer; mime: string }) {
    return this.db.withTenant(tenant, async (c) => {
      const job = (
        await c.query(
          'INSERT INTO knowledge_jobs(tenant_id,source_id,raw_file,file_mime,source_revision) SELECT $1,$2,$3,$4,revision FROM knowledge_sources WHERE id=$2 RETURNING id',
          [tenant, source, file?.buf ?? null, file?.mime ?? null],
        )
      ).rows[0];
      await c.query(
        "UPDATE knowledge_sources SET status='pending',error=NULL,updated_at=now() WHERE id=$1",
        [source],
      );
      await this.events.publish(
        tenant,
        'knowledge.job',
        job.id,
        { jobId: job.id },
        `knowledge:${job.id}:0`,
      );
      return { queued: true, jobId: job.id };
    });
  }
  // ------------------------------------------------------------------ ingestion

  private async fetchPage(url: string): Promise<{ title: string; text: string }> {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      const res = await safeHttpRequest({
        method: 'GET',
        url: current,
        headers: { 'User-Agent': 'ChatbotSaaS-Crawler/1.0', Accept: 'text/html,text/plain;q=0.9' },
        timeoutMs: 10000,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers?.location;
        if (!loc || Array.isArray(loc)) throw new Error('Redirect without location');
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
      const raw = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
      return /<html|<body|<p[ >]|<div/i.test(raw.slice(0, 5000))
        ? htmlToText(raw)
        : { title: '', text: raw };
    }
    throw new Error('Too many redirects');
  }

  @OnEvent('knowledge.job', { suppressErrors: false })
  async process(event: { tenantId: string; jobId: string }) {
    const tenantId = event.tenantId;
    await this.db.withTenant(tenantId, async (c) => {
      const identity = (
        await c.query('SELECT source_id FROM knowledge_jobs WHERE id=$1', [event.jobId])
      ).rows[0];
      if (!identity) return;
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [identity.source_id]);
      const job = (
        await c.query(
          "SELECT * FROM knowledge_jobs WHERE id=$1 AND status IN ('pending','running') FOR UPDATE",
          [event.jobId],
        )
      ).rows[0];
      if (!job) return;
      const src = (
        await c.query('SELECT * FROM knowledge_sources WHERE id=$1 FOR UPDATE', [job.source_id])
      ).rows[0];
      if (!src) return;
      if (src.archived_at || job.source_revision !== src.revision) {
        await c.query(
          "UPDATE knowledge_jobs SET status='canceled',error='Source archived or revision superseded',updated_at=now() WHERE id=$1",
          [job.id],
        );
        return;
      }
      await c.query('SAVEPOINT knowledge_step');
      try {
        let chunks = job.chunks as { index: number; content: string }[];
        if (!chunks.length) {
          let content = src.content ?? '',
            title = src.title;
          if (src.type === 'file' && !content && job.raw_file) {
            content = (await extractFileText(src.source_ref, job.file_mime, job.raw_file)).slice(
              0,
              MAX_CONTENT,
            );
            await c.query('UPDATE knowledge_jobs SET raw_file=NULL WHERE id=$1', [job.id]);
          }
          if (src.type === 'url') {
            if (env.EXTERNAL_DELIVERY_ENABLED !== 'true') {
              await c.query(
                "UPDATE knowledge_jobs SET status='blocked',error='External URL fetching is disabled',updated_at=now() WHERE id=$1",
                [job.id],
              );
              await c.query(
                "UPDATE knowledge_sources SET status='blocked',error='External URL fetching is disabled' WHERE id=$1",
                [src.id],
              );
              return;
            }
            const page = await this.fetchPage(src.source_ref);
            content = page.text.slice(0, MAX_CONTENT);
            if (page.title && title === src.source_ref) title = page.title.slice(0, 200);
          }
          chunks = src.type === 'faq' ? faqFromText(content) : chunkText(content);
          if (!chunks.length) throw new Error('No readable text found');
          await c.query(
            'UPDATE knowledge_sources SET title=$2,content=$3,char_count=$4 WHERE id=$1',
            [src.id, title, content, content.length],
          );
          if (src.type === 'file' || src.type === 'url')
            await c.query(
              'INSERT INTO knowledge_extractions(tenant_id,source_id,job_id,source_revision,title,source_ref,content,content_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(job_id) DO NOTHING',
              [
                tenantId,
                src.id,
                job.id,
                src.revision,
                title,
                src.source_ref,
                content,
                createHash('sha256').update(content).digest('hex'),
              ],
            );
          await c.query('UPDATE knowledge_jobs SET chunks=$2,total=$3 WHERE id=$1', [
            job.id,
            JSON.stringify(chunks),
            chunks.length,
          ]);
        }
        if (env.AI_PROVIDER_CALLS_ENABLED !== 'true' || !this.budget.configured) {
          await c.query(
            "UPDATE knowledge_jobs SET status='blocked',error='Embedding provider calls disabled or unconfigured',updated_at=now() WHERE id=$1",
            [job.id],
          );
          await c.query(
            "UPDATE knowledge_sources SET status='blocked',error='Embedding provider calls disabled or unconfigured' WHERE id=$1",
            [src.id],
          );
          return;
        }
        await c.query("UPDATE knowledge_sources SET status='processing',error=NULL WHERE id=$1", [
          src.id,
        ]);
        const batch = chunks.slice(job.processed, job.processed + EMBED_BATCH);
        const vectors = await this.budget.embed(
          tenantId,
          batch.map((chunk) => chunk.content),
          `${job.id}:${job.processed}`,
        );
        // Keep the prior published index until all replacement vectors are ready.
        const prepared = [
          ...(job.prepared ?? []),
          ...batch.map((chunk, index) => ({ ...chunk, vector: vectors[index] })),
        ];
        const processed = job.processed + batch.length,
          done = processed === chunks.length;
        await c.query(
          'UPDATE knowledge_jobs SET status=$2,processed=$3,total=$4,prepared=$5,error=NULL,updated_at=now() WHERE id=$1',
          [
            job.id,
            done ? 'completed' : 'running',
            processed,
            chunks.length,
            JSON.stringify(prepared),
          ],
        );
        if (done) {
          await c.query('DELETE FROM knowledge_chunks WHERE source_id=$1', [src.id]);
          for (const chunk of prepared)
            await c.query(
              'INSERT INTO knowledge_chunks(tenant_id,source_id,chunk_index,content,search_text,embedding) VALUES($1,$2,$3,$4,$5,$6::vector)',
              [
                tenantId,
                src.id,
                chunk.index,
                chunk.content,
                normalizeText(chunk.content),
                toVectorLiteral(chunk.vector),
              ],
            );
          await c.query(
            "UPDATE knowledge_sources SET status='ready',error=NULL,chunk_count=$2,updated_at=now() WHERE id=$1",
            [src.id, chunks.length],
          );
        } else
          await this.events.publish(
            tenantId,
            'knowledge.job',
            job.id,
            { jobId: job.id },
            `knowledge:${job.id}:${processed}`,
          );
      } catch (error) {
        await c.query('ROLLBACK TO SAVEPOINT knowledge_step');
        const reason = (error as Error).message.slice(0, 300);
        // External ambiguity is never automatically replayed. Other failures are explicit and retryable from UI.
        await c.query(
          "UPDATE knowledge_jobs SET status='failed',error=$2,attempts=attempts+1,updated_at=now() WHERE id=$1",
          [job.id, reason],
        );
        await c.query(
          "UPDATE knowledge_sources SET status='failed',error=$2,updated_at=now() WHERE id=$1",
          [src.id, reason],
        );
      }
    });
  }

  // ------------------------------------------------------------------ retrieval

  /** بحث هجين: تشابه دلالي (embeddings) + كلمات مفتاحية، ثم دمج النتيجتين بـ RRF */
  async search(
    tenantId: string,
    query: string,
    k = 6,
    sourceIds?: string[],
  ): Promise<RetrievedChunk[]> {
    if (!this.budget.configured || env.AI_PROVIDER_CALLS_ENABLED !== 'true')
      throw new ServiceUnavailableException('Embedding provider calls disabled or unconfigured');
    const any = await this.db.withTenant(
      tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT 1 FROM knowledge_chunks c JOIN knowledge_sources s ON s.id=c.source_id WHERE s.archived_at IS NULL AND ($1::uuid[] IS NULL OR c.source_id=ANY($1)) LIMIT 1',
            [sourceIds ?? null],
          )
        ).rowCount,
    );
    if (!any) return [];

    const [vec] = await this.budget.embed(tenantId, [query.slice(0, 2000)]);
    const literal = toVectorLiteral(vec);
    const tsq = buildOrTsQuery(query);

    return this.db.withTenant(tenantId, async (c) => {
      await c.query('SAVEPOINT iter');
      try {
        await c.query("SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)");
        await c.query('RELEASE SAVEPOINT iter');
      } catch {
        await c.query('ROLLBACK TO SAVEPOINT iter'); // نسخ pgvector الأقدم لا تدعم هذا الإعداد
      }

      const map = (r: { id: string; source_id: string; title: string; content: string }) => ({
        id: r.id,
        sourceId: r.source_id,
        title: r.title,
        content: r.content,
      });
      const vector = (
        await c.query(
          `SELECT c.id, c.source_id, s.title, c.content, 1 - (c.embedding <=> $1::vector) AS score
           FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
           WHERE s.archived_at IS NULL AND ($2::uuid[] IS NULL OR c.source_id=ANY($2)) ORDER BY c.embedding <=> $1::vector LIMIT 20`,
          [literal, sourceIds ?? null],
        )
      ).rows
        .filter((r) => Number(r.score) >= MIN_VECTOR_SCORE)
        .map(map);
      const keyword = tsq
        ? (
            await c.query(
              `SELECT c.id, c.source_id, s.title, c.content
               FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
               WHERE s.archived_at IS NULL AND c.tsv @@ to_tsquery('simple', $1) AND ($2::uuid[] IS NULL OR c.source_id=ANY($2))
               ORDER BY ts_rank(c.tsv, to_tsquery('simple', $1)) DESC LIMIT 20`,
              [tsq, sourceIds ?? null],
            )
          ).rows.map(map)
        : [];
      return rrfFuse([vector, keyword], k);
    });
  }
}
