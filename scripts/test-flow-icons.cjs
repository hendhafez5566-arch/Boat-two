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
 const html=renderToStaticMarkup(React.createElement(NodeIcon,{type}));
 assert.match(html,/<svg/);assert.match(html,/aria-hidden="true"/);
 assert.match(html,/<path/);assert.doesNotMatch(html,/tabindex|<text|undefined|NaN/);
}
for (const kind of ['sent','delivered','subscribers','errors']) {
 const html=renderToStaticMarkup(React.createElement(NodeStatIcon,{kind}));
 assert.match(html,/<svg/);assert.match(html,/aria-hidden="true"/);
 assert.match(html,/width="12"/);assert.doesNotMatch(html,/tabindex|<text|undefined|NaN/);
}
console.log(`PASS: ${Object.keys(NODE_META).length} node icons and 4 analytics icons render independently of text fonts without focus targets`);
