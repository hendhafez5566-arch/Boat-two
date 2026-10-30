import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  FlowEngine,
  newState,
  type EngineDeps,
  type FlowContext,
  type FlowGraph,
} from '../src/flows/engine';

// Isolated CPU/state benchmark. No HTTP, database, Redis, providers or production access.
async function main() {
  const sessions = 1000,
    concurrency = 25;
  const graph: FlowGraph = {
    startNodeId: 'email',
    nodes: [
      {
        id: 'email',
        type: 'question',
        data: { text: 'QA email?', answerType: 'email', saveAs: 'email' },
        edges: { next: 'end' },
      },
      { id: 'end', type: 'end', data: {}, edges: {} },
    ],
  };
  const latencies: number[] = [];
  let completed = 0;
  const forbidden = async (): Promise<never> => {
    throw new Error('External operation forbidden in isolated benchmark');
  };
  const began = performance.now();
  for (let offset = 0; offset < sessions; offset += concurrency) {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, sessions - offset) }, async (_, i) => {
        const id = offset + i;
        const deps: EngineDeps = {
          ai: forbidden,
          http: forbidden,
          send: async () => {},
          setContactAttribute: forbidden,
          updateTags: forbidden,
          addNote: forbidden,
          handoff: forbidden,
          closeConversation: async () => {},
          now: () => new Date('2026-10-30T10:00:00Z'),
          random: () => 0.5,
        };
        const engine = new FlowEngine(graph, deps),
          state = newState();
        const ctx: FlowContext = {
          contact: { name: `QA-${id}`, attributes: {} },
          channel: { type: 'web' },
          lastMessage: { text: '' },
        };
        const started = performance.now();
        await engine.start(ctx, state);
        ctx.lastMessage = { text: 'invalid-email' };
        await engine.resume(ctx, state);
        assert.equal(state.vars.email, undefined);
        const email = `qa-${id}@example.invalid`;
        ctx.lastMessage = { text: email };
        const result = await engine.resume(ctx, state);
        assert.equal(result.status, 'completed');
        assert.equal(state.vars.email, email, 'session answers must stay isolated');
        completed++;
        latencies.push(performance.now() - started);
      }),
    );
  }
  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        scope: 'local engine only; not HTTP or production capacity',
        sessions,
        concurrency,
        completed,
        failed: sessions - completed,
        durationMs: performance.now() - began,
        sessionP50Ms: latencies[Math.floor(sessions * 0.5)],
        sessionP95Ms: latencies[Math.floor(sessions * 0.95)],
        externalCalls: 0,
      },
      null,
      2,
    ),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
