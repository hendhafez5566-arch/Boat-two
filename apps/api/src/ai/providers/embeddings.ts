/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new AiProviderError(data?.error?.message ?? `Embeddings API error ${res.status}`, res.status, res.status === 429 || res.status >= 500);
    const rows: { index: number; embedding: number[] }[] = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== texts.length) throw new AiProviderError('Embeddings API returned an unexpected number of vectors');
    for (const r of rows) {
      if (r.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new AiProviderError(`Embedding model returned ${r.embedding.length} dimensions but the database expects ${EMBEDDING_DIMENSIONS}`);
      }
    }
    return rows.map((r) => r.embedding);
  }
}
