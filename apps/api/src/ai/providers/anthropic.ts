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
    toolCalls: blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> })),
    inputTokens: Number(body?.usage?.input_tokens ?? 0),
    outputTokens: Number(body?.usage?.output_tokens ?? 0),
    stopReason: body?.stop_reason ?? null,
  };
}

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

    // A timeout or 5xx may follow a billable generation. Never retry without evidence.
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok)
      throw new AiProviderError(`Anthropic request failed (${res.status})`, res.status, false);
    return parseAnthropicResponse(await res.json());
  }
}
