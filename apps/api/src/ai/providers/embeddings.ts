import { AiProviderError } from './types';

export const EMBEDDING_DIMENSIONS = 1536;

/** مزوّد embeddings متوافق مع واجهة OpenAI (/v1/embeddings) */
export class EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        ...(this.model.startsWith('text-embedding-3') ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
      }),
      signal: AbortSignal.timeout(45000),
    });
    // Provider diagnostics can contain credentials or customer input. Never persist them.
    // A failed/invalid response may still follow a billable call; do not mark it replayable.
    if (!res.ok) throw new AiProviderError(`Embeddings request failed (${res.status})`, res.status, false);
    const data: unknown = await res.json().catch(() => null);
    const entries = data && typeof data === 'object' && 'data' in data ? data.data : null;
    if (!Array.isArray(entries)) throw new AiProviderError('Embeddings API returned invalid vectors');
    const rows: { index: number; embedding: number[] }[] = [];
    const seen = new Set<number>();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.index) ||
          entry.index < 0 || entry.index >= texts.length || seen.has(entry.index) ||
          !Array.isArray(entry.embedding) ||
          entry.embedding.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new AiProviderError('Embeddings API returned invalid vectors');
      }
      seen.add(entry.index);
      rows.push({ index: entry.index, embedding: entry.embedding });
    }
    rows.sort((a, b) => a.index - b.index);
    if (rows.length !== texts.length) throw new AiProviderError('Embeddings API returned an unexpected number of vectors');
    for (const r of rows) {
      if (r.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new AiProviderError(`Embedding model returned ${r.embedding.length} dimensions but the database expects ${EMBEDDING_DIMENSIONS}`);
      }
    }
    return rows.map((r) => r.embedding);
  }
}
