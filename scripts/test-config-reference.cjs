// Render the real configuration components without a server or external provider.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const webRequire = createRequire(path.resolve('apps/web/package.json'));
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const original = {};
for (const ext of ['.ts', '.tsx', '.css']) original[ext] = require.extensions[ext];
require.extensions['.css'] = (module) => {
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
};
for (const ext of ['.ts', '.tsx'])
  require.extensions[ext] = (module, filename) =>
    module._compile(
      ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
try {
  const Inspector = require('../apps/web/components/flow/Inspector.tsx').default;
  const { NODE_META, toFlow, fromFlow } = require('../apps/web/lib/flow-types.ts');
  const sample = {
    text: 'مرحبًا',
    header: { type: 'text', text: 'خدمات السفر' },
    footer: 'خدمة العملاء',
    list: {
      buttonText: 'الخدمات',
      sections: [
        {
          title: 'خدماتنا',
          rows: [
            { id: 'umrah', title: 'عمرة', actions: [{ type: 'tag', add: ['عمرة'], remove: [] }] },
            { id: 'flight', title: 'طيران' },
          ],
        },
      ],
    },
  };
  const before = JSON.stringify(sample);
  const render = (type, data, extra = {}) =>
    renderToStaticMarkup(
      React.createElement(Inspector, {
        type,
        data,
        onChange: () => {
          throw Error('Rendering must never mutate a draft');
        },
        ...extra,
      }),
    );
  const message = render('interactive', sample);
  assert.match(message, /عنوان الرسالة/);
  assert.match(message, /نص الرسالة/);
  assert.match(message, /تذييل الرسالة/);
  assert.match(message, /خيارات الإرسال/);
  for (const unwanted of [
    'صفوف القائمة',
    'نوع الرد التفاعلي',
    'الخطوة التالية',
    'ربط خطوة موجودة',
    'متغيّرات وتعليق داخلي',
    'إعدادات متقدمة',
    'role="tablist"',
    'عمرة',
    'طيران',
  ])
    assert.ok(
      !message.includes(unwanted),
      unwanted + ' must not be rendered in the message dialog',
    );
  const text = render('message', { text: 'رد نصي' });
  assert.match(text, /رسالة الرد/);
  assert.ok(!text.includes('عنوان الرسالة'));
  assert.ok(!text.includes('تحويل إلى رسالة تفاعلية'));
  const collection = render('interactive', sample, { choiceView: true });
  assert.match(collection, /عنوان زر فتح القائمة/);
  assert.match(collection, /عمرة/);
  assert.ok(!collection.includes('نص الرسالة'));
  const row = render('interactive', sample, { initialChoiceId: 'umrah' });
  assert.match(row, /إعداد صف القائمة/);
  assert.match(row, /وصف الصف/);
  assert.match(row, /الأتمتة/);
  assert.ok(!row.includes('ربط خطوة موجودة'));
  for (const type of Object.keys(NODE_META)) {
    const html = render(type, NODE_META[type].defaults());
    assert.ok(!html.includes('smart-next-steps'), type + ' must use canvas connections');
    assert.ok(
      !html.includes('Make start') && !html.includes('اجعلها البداية'),
      type + ' must use canvas actions',
    );
  }
  assert.equal(JSON.stringify(sample), before);
  const graph = {
    startNodeId: 'welcome',
    nodes: [
      {
        id: 'welcome',
        type: 'interactive',
        position: { x: 10, y: 20 },
        data: sample,
        edges: { 'option:umrah': 'finish', 'option:flight': 'finish' },
      },
      { id: 'finish', type: 'end', position: { x: 400, y: 400 }, data: {}, edges: {} },
    ],
  };
  const canvas = toFlow(graph);
  assert.deepEqual(fromFlow(canvas.nodes, canvas.edges, 'welcome'), graph);
  console.log(
    'PASS: real message/text/list-row/collection components render the expected separate forms; all supported inspectors omit generic next-step controls; graph data and routes survive unchanged.',
  );
} finally {
  for (const ext of ['.ts', '.tsx', '.css']) {
    if (original[ext]) require.extensions[ext] = original[ext];
    else delete require.extensions[ext];
  }
}

// Exercise the actual dialog handlers: staging a field must not write the graph;
// Close discards it; Save applies it once and leaves unrelated draft saving alone.
(async () => {
  const source = fs.readFileSync('apps/web/app/dashboard/flows/[id]/page.tsx', 'utf8');
  const ast = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const elements = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const tag = (node) => (node.openingElement ?? node).tagName.getText(ast);
  const attribute = (node, name) =>
    (node.openingElement ?? node).attributes.properties.find(
      (a) => ts.isJsxAttribute(a) && a.name.getText(ast) === name,
    )?.initializer;
  const footer = elements.find(
    (n) => tag(n) === 'footer' && attribute(n, 'className')?.text === 'smart-editor-footer',
  );
  const buttons = footer.children.filter((n) => ts.isJsxElement(n) && tag(n) === 'button');
  const inspector = elements.find((n) => tag(n) === 'Inspector');
  const compile = (node, name, context) => {
    const expression = attribute(node, name).expression.getText(ast);
    const compiled = ts.transpileModule('exports.handler=' + expression, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const output = {};
    new Function('exports', ...Object.keys(context), compiled)(output, ...Object.values(context));
    return output.handler;
  };
  const writes = [],
    staged = [],
    opened = [];
  const draft = {
    id: 'welcome',
    data: { text: 'edited', buttons: [{ id: 'stable-id', title: 'اختيار' }] },
  };
  const context = {
    tab: 'node',
    sel: { id: 'welcome' },
    inspectorDraft: draft,
    dirty: false,
    updateData: (...args) => writes.push(args),
    setInspectorDraft: (value) => staged.push(value),
    setInspectorOpen: (value) => opened.push(value),
    save: () => {
      throw Error('Node dialog must not save unrelated graph state');
    },
  };
  compile(inspector, 'onChange', context)({ text: 'typed' });
  assert.deepEqual(writes, []);
  assert.deepEqual(staged, [{ id: 'welcome', data: { text: 'typed' } }]);
  compile(buttons[0], 'onClick', context)();
  assert.deepEqual(writes, []);
  assert.equal(staged.at(-1), null);
  assert.equal(opened.at(-1), false);
  await compile(buttons[1], 'onClick', context)();
  assert.deepEqual(writes, [['welcome', draft.data]]);
  assert.equal(staged.at(-1), null);
  assert.equal(opened.at(-1), false);
  console.log(
    'PASS: actual dialog onChange stages edits, Close discards edits, Save applies the selected node once; unrelated graph data is not submitted.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
