import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('assets/widget.js', 'utf8');

async function boot(locale: string | null, configAvailable = true, startup = 'closed') {
  const nodes: Array<{ attributes: Map<string, string> }> = [];
  const events: string[] = [];
  const requests: Array<{ path: string; headers?: Record<string, string> }> = [];
  runInNewContext(source, {
    document: {
      currentScript: {
        src: 'https://preview.example.test/widget.js',
        getAttribute: (name: string) => name === 'data-key' ? 'widget' : locale,
        dispatchEvent: (event: Event) => events.push(event.type),
      },
      body: { appendChild() {} },
      createElement: () => {
        const attributes = new Map<string, string>();
        const element = {
          attributes,
          setAttribute: (name: string, value: string) => attributes.set(name, value),
          attachShadow: () => ({ appendChild() {} }),
          appendChild() {},
          classList: { toggle() {} },
          style: {},
          focus() {},
          remove() {},
        };
        nodes.push(element);
        return element;
      },
    },
    Event,
    window: { innerWidth: 390, innerHeight: 844 },
    localStorage: { getItem: () => null },
    clearTimeout() {},
    setTimeout: (callback: () => void, delay: number) => { if (delay === 0) callback(); },
    fetch: async (url: string, options?: { headers?: Record<string, string> }) => {
      const path = new URL(url).pathname;
      requests.push({ path, headers: options?.headers });
      const payload = path.endsWith('/session')
        ? { visitorId: 'test-visitor', token: 'test-token' }
        : path.endsWith('/messages')
          ? { messages: [], hasMore: false }
          : { direction: 'rtl', title: 'Configured title', startup };
      return { ok: configAvailable, json: async () => payload };
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { labels: nodes.map((node) => node.attributes.get('aria-label')), events, requests };
}

test('widget preview uses the visitor locale while standard embeds keep the channel direction', async () => {
  const english = await boot('en');
  assert.ok(english.labels.includes('Message'));
  assert.ok(english.labels.includes('Configured title'));
  assert.deepEqual(english.events, ['boat-widget-ready']);
  for (const locale of ['ar', null, 'unsupported']) {
    assert.ok((await boot(locale)).labels.includes('اكتب رسالة'));
  }
});

test('a failed config load reports the widget as unavailable', async () => {
  assert.deepEqual((await boot('en', false)).events, ['boat-widget-unavailable']);
});


test('opening Webchat loads initial history once and sends only the visitor header on reads', async () => {
  const { requests } = await boot('en', true, 'open');
  assert.deepEqual(requests.map(({ path }) => path), [
    '/widget/widget/config', '/widget/widget/session', '/widget/widget/messages',
  ]);
  assert.equal(requests[1].headers?.['Content-Type'], 'application/json');
  assert.equal(requests[2].headers?.['Content-Type'], undefined);
  assert.equal(requests[2].headers?.['x-visitor-token'], 'test-token');
});
