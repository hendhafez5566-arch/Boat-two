import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const api = createRequire(resolve('apps/api/package.json'));
api('tsx/cjs');
const source = createRequire(import.meta.url);
const { channelConnectionState, filterConnectionAccounts, connectionAccountCounts } = source(
  '../apps/web/lib/channel-overview.ts',
);
const base = {
  name: 'Synthetic account',
  type: 'whatsapp',
  external_id: 'synthetic-id',
  status: 'active',
};
const rows = [
  {
    ...base,
    name: 'Verified',
    connectionHealth: { state: 'connected', reason: 'provider_verified' },
  },
  { ...base, name: 'Pending' },
  {
    ...base,
    name: 'Soon',
    connectionHealth: { state: 'needs_action', reason: 'authorization_expiring' },
  },
  {
    ...base,
    name: 'Expired',
    connectionHealth: { state: 'expired', reason: 'authorization_expired' },
  },
  {
    ...base,
    name: 'Paused',
    status: 'disabled',
    connectionHealth: { state: 'connected', reason: 'provider_verified' },
  },
  { ...base, name: 'Website', type: 'web', external_id: 'widget-qa' },
];
const snapshot = JSON.stringify(rows);
assert.equal(channelConnectionState(base), 'needs_action');
assert.equal(channelConnectionState(rows[4]), 'disconnected');
assert.deepEqual(connectionAccountCounts(rows), {
  total: 6,
  connected: 1,
  expiring: 1,
  needsAction: 4,
  disconnected: 1,
});
assert.equal(filterConnectionAccounts(rows, 'all', 'expiring', '')[0].name, 'Soon');
assert.equal(filterConnectionAccounts(rows, 'web', 'all', '  WIDGET-QA ').length, 1);
assert.equal(filterConnectionAccounts(rows, 'whatsapp', 'connected', 'Verified').length, 1);
assert.equal(filterConnectionAccounts(rows, 'web', 'connected', '').length, 0);
assert.equal(filterConnectionAccounts(rows, 'all', 'all', 'Missing').length, 0);
assert.equal(JSON.stringify(rows), snapshot);
const web = createRequire(resolve('apps/web/package.json'));
const React = web('react');
globalThis.React = React;
source.extensions['.css'] = (module) => {
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
};
const { renderToStaticMarkup } = web('react-dom/server');
const Catalog = source('../apps/web/components/product/ChannelCatalog.tsx').default;
for (const mode of ['default', 'connections']) {
  const html = renderToStaticMarkup(
    React.createElement(Catalog, { mode, selected: 'web', onSelect: () => {} }),
  );
  for (const channel of ['WhatsApp', 'Facebook', 'Instagram', 'Telegram', 'Webchat', 'Google'])
    assert.ok(html.includes(channel));
  assert.equal((html.match(/<article/g) || []).length, 6);
  assert.match(html, /href="\/dashboard\/integrations"/);
  if (mode === 'connections') assert.doesNotMatch(html, /aria-pressed|border-top/);
}
console.log(
  'PASS: verified/expiring/disabled/unknown channel states, combined platform/status/name/identifier filters, non-mutating counts, and both six-provider catalog variants. Browser acceptance remains separate.',
);
