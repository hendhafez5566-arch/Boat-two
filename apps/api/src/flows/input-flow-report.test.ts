import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowGraph } from './engine';
import { graphSchema } from './flow-schemas';
import { buildInputFlowReport } from './flows.service';

function graph(questions: Record<string, unknown>[]): FlowGraph {
  return {
    startNodeId: 'collect',
    nodes: [
      {
        id: 'collect',
        type: 'user_input',
        position: { x: 0, y: 0 },
        data: { name: 'Lead Form', questions },
        edges: {},
      },
    ],
  };
}

test('input-flow reports expose only configured answers and merge field labels across saved versions', () => {
  const draft = graph([
    { id: 'name', text: 'Customer name', kind: 'text', saveAs: 'name' },
    { id: 'choice', text: 'Service', kind: 'choice', saveAs: 'service' },
  ]);
  const oldVersion = graph([
    { id: 'name', text: 'Your name', kind: 'text', saveAs: 'name' },
    { id: 'email', text: 'Email address', kind: 'email', saveAs: 'email' },
  ]);
  const report = buildInputFlowReport(
    { id: 'flow-1', name: 'Lead intake', status: 'published', draft_graph: draft },
    [
      {
        id: 'session-1',
        status: 'waiting',
        state: { vars: { name: 'Test Person', internal_marker: 'must not leak' } },
        created_at: '2026-11-07T10:00:00.000Z',
        updated_at: '2026-11-07T10:01:00.000Z',
        contact_id: 'contact-1',
        contact_name: 'Test Person',
        graph: oldVersion,
      },
    ],
  );

  assert.deepEqual(
    report.fields.map((field) => field.key),
    ['name', 'service', 'email'],
  );
  assert.equal(report.fields[0].label, 'Customer name');
  assert.equal(report.fields[2].label, 'Email address');
  assert.deepEqual(report.records[0].answers, { name: 'Test Person' });
  assert.equal('internal_marker' in report.records[0].answers, false);
  assert.equal('phone' in report.records[0], false);
  assert.equal(report.records[0].contactId, 'contact-1');
});

test('input-flow reports support a flow that has not collected responses yet', () => {
  const report = buildInputFlowReport(
    {
      id: 'flow-2',
      name: 'Empty results',
      status: 'draft',
      draft_graph: graph([{ id: 'q1', text: 'Name?', kind: 'text', saveAs: 'name' }]),
    },
    [],
  );
  assert.equal(report.fields.length, 1);
  assert.deepEqual(report.records, []);
});

test('input-flow reports stay valid when questions have no CRM destination configured', () => {
  const report = buildInputFlowReport(
    {
      id: 'flow-3',
      name: 'Unmapped results',
      status: 'draft',
      draft_graph: graph([{ id: 'q1', text: 'Feedback?', kind: 'text' }]),
    },
    [],
  );
  assert.equal(report.fields.length, 0);
  assert.deepEqual(report.records, []);
});

test('multiple-choice list button text is optional and limited to 20 characters', () => {
  const candidate = graph([
    {
      id: 'q1',
      text: 'Which service?',
      kind: 'choice',
      saveAs: 'service',
      buttonText: 'Select a service',
      options: [
        { id: 'a', title: 'First' },
        { id: 'b', title: 'Second' },
        { id: 'c', title: 'Third' },
        { id: 'd', title: 'Fourth' },
      ],
    },
  ]);
  assert.equal(graphSchema.safeParse(candidate).success, true);
  candidate.nodes[0].data.questions[0].buttonText = 'A button label that is too long';
  assert.equal(graphSchema.safeParse(candidate).success, false);
});
