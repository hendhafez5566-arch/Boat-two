export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export interface LlmRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature: number;
  tools?: LlmTool[];
}
export interface LlmResponse {
  text: string;
  toolCalls: { name: string; input: Record<string, unknown> }[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}
export interface LlmProvider {
  chat(req: LlmRequest): Promise<LlmResponse>;
}
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}
