// Local acceptance fixture only. The real API runs with provider chat replaced before bootstrap.
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
if (process.env.NODE_ENV !== 'test' || process.env.EXTERNAL_DELIVERY_ENABLED !== 'false')
  throw new Error('Mock API requires isolated test mode and disabled external delivery');
const { OpenAiProvider } = local('./dist/ai/providers/openai.js');
OpenAiProvider.prototype.chat = async (request) => {
  const text = request.messages.map((m) => m.content).join(' ');
  if (text.includes('fixture-fail')) throw new Error('private_mock_failure_never_display');
  return {
    text: 'Mock provider recovered successfully',
    inputTokens: 12,
    outputTokens: 6,
    toolCalls: [],
    stopReason: 'stop',
  };
};
await import('../apps/api/dist/main.js');
