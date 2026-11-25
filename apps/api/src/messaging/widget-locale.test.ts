import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('assets/widget.js', 'utf8');

async function boot(locale: string | null, configAvailable = true) {
  const nodes: Array<{ attributes: Map<string, string> }> = [];
  const events: string[] = [];
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
          remove() {},
        };
        nodes.push(element);
        return element;
      },
    },
    Event,
    window: { innerWidth: 390, innerHeight: 844 },
    localStorage: { getItem: () => null },
    setTimeout: (callback: () => void) => callback(),
    fetch: async () => ({
      ok: configAvailable,
      json: async () => ({ direction: 'rtl', title: 'Configured title' }),
    }),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { labels: nodes.map((node) => node.attributes.get('aria-label')), events };
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
