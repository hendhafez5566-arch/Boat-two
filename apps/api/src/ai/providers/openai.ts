import { AiProviderError, LlmProvider, LlmRequest, LlmResponse } from './types';
export class OpenAiProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}
  async chat(req: LlmRequest): Promise<LlmResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        max_completion_tokens: req.maxTokens,
        ...(req.tools?.length
          ? {
              tools: req.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.input_schema,
                },
              })),
            }
          : {}),
      }),
    });
    if (!response.ok)
      throw new AiProviderError(
        `OpenAI request failed (${response.status})`,
        response.status,
        false,
      );
    const body = (await response.json()) as {
      choices?: {
        message?: {
          content?: string;
          tool_calls?: { function: { name: string; arguments: string } }[];
        };
        finish_reason?: string;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = body.choices?.[0];
    if (!choice?.message) throw new AiProviderError('OpenAI returned no message');
    return {
      text: choice.message.content || '',
      toolCalls: (choice.message.tool_calls || []).map((call) => ({
        name: call.function.name,
        input: JSON.parse(call.function.arguments),
      })),
      inputTokens: body.usage?.prompt_tokens || 0,
      outputTokens: body.usage?.completion_tokens || 0,
      stopReason: choice.finish_reason || null,
    };
  }
}
