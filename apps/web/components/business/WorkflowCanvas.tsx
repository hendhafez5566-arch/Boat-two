'use client';
import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useLocale } from '../product/locale';
export type WorkflowAction = {
  type: string;
  title?: string;
  tag?: string;
  text?: string;
  delayMinutes?: number;
  then?: WorkflowAction[];
  otherwise?: WorkflowAction[];
  actions?: WorkflowAction[];
};
export function WorkflowCanvas({
  actions,
  positions,
  onLayout,
}: {
  actions: WorkflowAction[];
  positions: Record<string, { x: number; y: number }>;
  onLayout: (positions: Record<string, { x: number; y: number }>) => void;
}) {
  const { t } = useLocale();
  const graph = useMemo(() => {
    const nodes: Node[] = [],
      edges: Edge[] = [];
    let row = 0;
    const visit = (
      list: WorkflowAction[],
      path: string,
      x: number,
      parent?: string,
      branch?: string,
    ) => {
      let previous = parent;
      for (const [index, action] of list.entries()) {
        const id = path + '.' + index;
        nodes.push({
          id,
          position: positions[id] ?? { x, y: row++ * 135 },
          data: {
            label: (
              <div className="automation-node-label">
                <small>
                  {action.type === 'branch'
                    ? t('قرار', 'Decision')
                    : action.type === 'delay'
                      ? t('انتظار', 'Wait')
                      : t('إجراء', 'Action')}
                </small>
                <strong>
                  {(
                    {
                      note: t('ملاحظة', 'Note'),
                      tag: t('وسم العميل', 'Tag contact'),
                      task: t('مهمة متابعة', 'Follow-up task'),
                      lifecycle: t('مرحلة العميل', 'Lifecycle'),
                      branch: t('شروط ومسارات', 'Conditions and branches'),
                      delay: t('تأخير', 'Delay'),
                      http: t('طلب HTTP', 'HTTP request'),
                    } as Record<string, string>
                  )[action.type] ?? action.type}
                </strong>
                <span>
                  {action.title ??
                    action.tag ??
                    action.text?.slice(0, 55) ??
                    (action.delayMinutes ? `${action.delayMinutes} ${t('دقيقة', 'min')}` : '')}
                </span>
              </div>
            ),
          },
          style: {
            borderRadius: 12,
            borderColor:
              action.type === 'branch'
                ? '#cf9f61'
                : action.type === 'delay'
                  ? '#9d8bc0'
                  : '#82b7a6',
            width: 220,
            padding: 13,
          },
        });
        if (previous)
          edges.push({
            id: previous + '>' + id,
            source: previous,
            target: id,
            type: 'smoothstep',
            label: previous === parent ? branch : undefined,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#8aaca6' },
          });
        if (action.then) visit(action.then, id + '.then', x + 300, id, t('نعم', 'Yes'));
        if (action.otherwise?.length)
          visit(action.otherwise, id + '.otherwise', x - 300, id, t('غير ذلك', 'Otherwise'));
        if (action.actions)
          visit(action.actions, id + '.actions', x + 300, id, t('بعد الانتظار', 'After delay'));
        previous = id;
      }
    };
    visit(actions, 'root', 0);
    return { nodes, edges };
  }, [actions, positions, t]);
  return (
    <section className="automation-canvas-wrap">
      <p className="muted">
        {t(
          'اسحب البطاقات لتنظيم المشهد. اضغط بطاقة لتعديل خطوتها أدناه. المسارات تُنفّذ بالترتيب وبالشروط المحفوظة؛ لا تقبل اللوحة دورات غير مدعومة.',
          'Drag cards to organize the view. Select a card to edit its step below. Execution follows the saved structured sequence and conditions; unsupported cycles cannot be connected.',
        )}
      </p>
      <div className="automation-canvas">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodesConnectable={false}
          onNodesChange={(changes: NodeChange[]) => {
            const next = { ...positions };
            let changed = false;
            for (const change of changes)
              if (change.type === 'position' && change.position) {
                next[change.id] = change.position;
                changed = true;
              }
            if (changed) onLayout(next);
          }}
          onNodeClick={(_, node) => {
            const target = document.querySelector<HTMLElement>(`[data-step-path="${node.id}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target?.focus();
          }}
          fitView
          minZoom={0.15}
          maxZoom={1.5}
        >
          <Background gap={24} color="#d3e0e1" />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </section>
  );
}
