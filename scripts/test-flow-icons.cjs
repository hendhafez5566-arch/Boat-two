// Rendering contract for reference icons: no font glyphs, no interactive/focusable SVG.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const api = createRequire(resolve('apps/api/package.json'));
api('tsx/cjs');
const web = createRequire(resolve('apps/web/package.json'));
const React = web('react');
global.React = React;
const { renderToStaticMarkup } = web('react-dom/server');
const { NodeIcon, NodeStatIcon } = require('../apps/web/components/flow/presentation.tsx');
const { NODE_META } = require('../apps/web/lib/flow-types.ts');
for (const type of Object.keys(NODE_META)) {
  const html = renderToStaticMarkup(React.createElement(NodeIcon, { type }));
  assert.match(html, /<svg/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /<path/);
  assert.doesNotMatch(html, /tabindex|<text|undefined|NaN/);
}
for (const kind of ['sent', 'delivered', 'subscribers', 'errors']) {
  const html = renderToStaticMarkup(React.createElement(NodeStatIcon, { kind }));
  assert.match(html, /<svg/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /width="12"/);
  assert.doesNotMatch(html, /tabindex|<text|undefined|NaN/);
}
console.log(
  `PASS: ${Object.keys(NODE_META).length} node icons and 4 analytics icons render independently of text fonts without focus targets`,
);

const { ReactFlowProvider, useStoreApi, Position } = web('reactflow');
const FlowEdge = require('../apps/web/components/flow/FlowEdge.tsx').default;
for (const selectedId of ['source', 'unrelated']) {
  function SelectedEdge() {
    const store = useStoreApi();
    store.setState({ nodeInternals: new Map([[selectedId, { id: selectedId, selected: true }]]) });
    return React.createElement(FlowEdge, {
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 40,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: { stroke: '#778292', strokeWidth: 2 },
    });
  }
  const html = renderToStaticMarkup(
    React.createElement(ReactFlowProvider, null, React.createElement(SelectedEdge)),
  );
  assert.match(html, /stroke:#778292/);
  assert.doesNotMatch(html, /var\(--primary\)|opacity:0\.3/);
}
console.log(
  'PASS: selected adjacent and unrelated nodes preserve measured connection color and opacity',
);
