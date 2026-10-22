import {
  BadRequestException,
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
import { EmbeddingProvider } from '../providers/embeddings';
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
  'id, type, title, source_ref, status, error, char_count, chunk_count, created_at, updated_at';
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
  private readonly embedder =
    (env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY)
      ? new EmbeddingProvider(
          env.EMBEDDING_BASE_URL,
          (env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY) as string,
          env.EMBEDDING_MODEL,
        )
      : null;

  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
  ) {}

  get configured() {
    return !!this.embedder;
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
    s: { type: string; title: string; ref?: string; content?: string },
  ) {
    if (!this.embedder)
      throw new ServiceUnavailableException('Embeddings are not configured on this server');
    const row = await this.db.withTenant(tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const n = (await c.query('SELECT count(*)::int AS n FROM knowledge_sources')).rows[0].n;
      await this.plans.assertWithinLimit(c, 'knowledge_sources', n);
      return (
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
    });
    void this.process(tenantId, row.id); // معالجة في الخلفية: الحالة تظهر في القائمة
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
    let text: string;
    try {
      text = await extractFileText(f.name, f.mime, f.buf);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (text.trim().length < 20)
      throw new BadRequestException('No readable text found in the file');
    return this.insert(tenantId, userId, {
      type: 'file',
      title: f.title?.trim() || f.name,
      ref: f.name,
      content: text.slice(0, MAX_CONTENT),
    });
  }

  remove(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query('DELETE FROM knowledge_sources WHERE id = $1', [id]);
      if (!r.rowCount) throw new NotFoundException('Source not found');
      return { removed: true };
    });
  }

  async reindex(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.withTenant(tenantId, (c) =>
      c.query(
        "UPDATE knowledge_sources SET status = 'pending', error = NULL, updated_at = now() WHERE id = $1",
        [id],
      ),
    );
    void this.process(tenantId, id);
    return { queued: true };
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

  private async process(tenantId: string, id: string) {
    try {
      const src = await this.db.withTenant(tenantId, async (c) => {
        await c.query(
          "UPDATE knowledge_sources SET status = 'processing', error = NULL, updated_at = now() WHERE id = $1",
          [id],
        );
        return (
          await c.query(
            'SELECT type, title, source_ref, content FROM knowledge_sources WHERE id = $1',
            [id],
          )
        ).rows[0];
      });
      if (!src) return;

      let content: string = src.content ?? '';
      let title: string = src.title;
      if (src.type === 'url') {
        const page = await this.fetchPage(src.source_ref);
        content = page.text.slice(0, MAX_CONTENT);
        if (page.title && title === src.source_ref) title = page.title.slice(0, 200);
      }
      const chunks = src.type === 'faq' ? faqFromText(content) : chunkText(content);
      if (!chunks.length) throw new Error('No readable text found');
      if (!this.embedder) throw new Error('Embeddings are not configured');

      const vectors: number[][] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        vectors.push(
          ...(await this.embedder.embed(chunks.slice(i, i + EMBED_BATCH).map((c) => c.content))),
        );
      }

      await this.db.withTenant(tenantId, async (c) => {
        await c.query('DELETE FROM knowledge_chunks WHERE source_id = $1', [id]);
        await c.query(
          `INSERT INTO knowledge_chunks (tenant_id, source_id, chunk_index, content, search_text, embedding)
           SELECT $1, $2, t.i, t.c, t.s, t.e::vector FROM unnest($3::int[], $4::text[], $5::text[], $6::text[]) AS t(i, c, s, e)`,
          [
            tenantId,
            id,
            chunks.map((c) => c.index),
            chunks.map((c) => c.content),
            chunks.map((c) => normalizeText(c.content)),
            vectors.map(toVectorLiteral),
          ],
        );
        await c.query(
          `UPDATE knowledge_sources SET status = 'ready', error = NULL, title = $2, content = $3, char_count = $4, chunk_count = $5, updated_at = now()
           WHERE id = $1`,
          [id, title, content, content.length, chunks.length],
        );
      });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      this.log.warn(`Knowledge source ${id} failed: ${msg}`);
      await this.db
        .withTenant(tenantId, (c) =>
          c.query(
            "UPDATE knowledge_sources SET status = 'failed', error = $2, updated_at = now() WHERE id = $1",
            [id, msg],
          ),
        )
        .catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------ retrieval

  /** بحث هجين: تشابه دلالي (embeddings) + كلمات مفتاحية، ثم دمج النتيجتين بـ RRF */
  async search(
    tenantId: string,
    query: string,
    k = 6,
    sourceIds?: string[],
  ): Promise<RetrievedChunk[]> {
    if (!this.embedder)
      throw new ServiceUnavailableException('Embeddings are not configured on this server');
    const any = await this.db.withTenant(
      tenantId,
      async (c) => (await c.query('SELECT 1 FROM knowledge_chunks LIMIT 1')).rowCount,
    );
    if (!any) return [];

    const [vec] = await this.embedder.embed([query.slice(0, 2000)]);
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
           WHERE ($2::uuid[] IS NULL OR c.source_id=ANY($2)) ORDER BY c.embedding <=> $1::vector LIMIT 20`,
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
               WHERE c.tsv @@ to_tsquery('simple', $1) AND ($2::uuid[] IS NULL OR c.source_id=ANY($2))
               ORDER BY ts_rank(c.tsv, to_tsquery('simple', $1)) DESC LIMIT 20`,
              [tsq, sourceIds ?? null],
            )
          ).rows.map(map)
        : [];
      return rrfFuse([vector, keyword], k);
    });
  }
}
