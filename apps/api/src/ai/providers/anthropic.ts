/* eslint-disable @typescript-eslint/no-explicit-any */
import { AiProviderError, LlmProvider, LlmRequest, LlmResponse } from './types';

export function parseAnthropicResponse(body: any): LlmResponse {
  const blocks: any[] = Array.isArray(body?.content) ? body.content : [];
  return {
    text: blocks
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('')
      .trim(),
    toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> })),
    inputTokens: Number(body?.usage?.input_tokens ?? 0),
    outputTokens: Number(body?.usage?.output_tokens ?? 0),
    stopReason: body?.stop_reason ?? null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AnthropicProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}

  async chat(req: LlmRequest): Promise<LlmResponse> {
    const body = JSON.stringify({
      model: this.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      system: req.system,
      messages: req.messages,
      ...(req.tools?.length ? { tools: req.tools } : {}),
    });

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return parseAnthropicResponse(data);
        const retryable = res.status === 429 || res.status >= 500;
        throw new AiProviderError(data?.error?.message ?? `Anthropic API error ${res.status}`, res.status, retryable);
      } catch (e) {
        lastErr = e as Error;
        const retryable = e instanceof AiProviderError ? e.retryable : (e as Error).name === 'TimeoutError';
        if (!retryable || attempt === 1) break;
        await sleep(800);
      }
    }
    throw lastErr ?? new AiProviderError('Unknown AI error');
  }
}
