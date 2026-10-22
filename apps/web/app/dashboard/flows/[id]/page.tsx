'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge, Background, Connection, Controls, MiniMap, Node, NodeChange, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import FlowNodeView from '../../../../components/flow/FlowNodeView';
import Inspector from '../../../../components/flow/Inspector';
import TestPanel from '../../../../components/flow/TestPanel';
import { api, getSession } from '../../../../lib/api';
import { fromFlow, handlesFor, NODE_META, NodeType, RFData, toFlow, Trigger, uid } from '../../../../lib/flow-types';

const nodeTypes = { flowNode: FlowNodeView };

type Issue = { nodeId?: string; message: string };
const inp = 'w-full rounded border p-1.5 text-sm';

function Editor({ id }: { id: string }) {
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<RFData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [startId, setStartId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'node' | 'settings' | 'test'>('node');
  const [meta, setMeta] = useState<{ name: string; priority: number; triggers: Trigger[]; channelIds: string[]; status: string; version: number | null }>({
    name: '', priority: 0, triggers: [], channelIds: [], status: 'draft', version: null,
  });
  const [channels, setChannels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!getSession()) { window.location.href = '/login'; return; }
    (async () => {
      const f = await api<any>(`/flows/${id}`);
      const g = toFlow(f.draft_graph);
      setNodes(g.nodes);
      setEdges(g.edges);
      setStartId(f.draft_graph.startNodeId);
      setMeta({ name: f.name, priority: f.priority, triggers: f.triggers, channelIds: f.channel_ids ?? [], status: f.status, version: f.published_version });
      api<any[]>('/channels').then(setChannels).catch(() => {});
    })().catch((e) => setMsg(e.message));
  }, [id, setNodes, setEdges]);

  const issueMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of [...issues]) if (i.nodeId && !m[i.nodeId]) m[i.nodeId] = i.message;
    return m;
  }, [issues]);

  const display = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === startId, issue: issueMap[n.id] } })),
    [nodes, startId, issueMap],
  );

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChange(changes);
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions' && !(c.type === 'position' && c.dragging))) setDirty(true);
  };

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((es) => addEdge({ ...c, type: 'smoothstep' }, es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle))));
      setDirty(true);
    },
    [setEdges],
  );

  const addNode = (type: NodeType) => {
    const nid = `${type}_${uid(4)}`;
    const pos = rf.screenToFlowPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 100 });
    setNodes((ns) => [...ns, { id: nid, type: 'flowNode', position: pos, data: { type, data: NODE_META[type].defaults(), isStart: false } }]);
    if (!startId || !nodes.length) setStartId(nid);
    setSelected(nid);
    setTab('node');
    setDirty(true);
  };

  const updateData = (nid: string, data: any) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, data } } : n)));
    const node = nodes.find((n) => n.id === nid);
    if (node) {
      const valid = new Set(handlesFor(node.data.type, data).map((h) => h.id));
      setEdges((es) => es.filter((e) => e.source !== nid || (e.sourceHandle && valid.has(e.sourceHandle))));
    }
    setDirty(true);
  };

  const deleteNode = (nid: string) => {
    const rest = nodes.filter((n) => n.id !== nid);
    setNodes(rest);
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid));
    if (startId === nid) setStartId(rest[0]?.id ?? '');
    setSelected(null);
    setDirty(true);
  };

  const graph = () => fromFlow(nodes, edges, startId);

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api(`/flows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: meta.name, priority: meta.priority, triggers: meta.triggers, channelIds: meta.channelIds, graph: graph() }),
      });
      setDirty(false);
      setMsg('تم الحفظ');
    } catch (e: any) {
      setMsg(`تعذّر الحفظ: ${e.message}`);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    try {
      const r = await api<{ errors: Issue[]; warnings: Issue[] }>('/flows/validate', { method: 'POST', body: JSON.stringify(graph()) });
      setIssues(r.errors);
      setWarnings(r.warnings);
      setMsg(r.errors.length ? `${r.errors.length} خطأ` : 'لا توجد أخطاء');
    } catch (e: any) { setMsg(e.message); }
  };

  const publish = async () => {
    try {
      await save();
      const r = await api<any>(`/flows/${id}/publish`, { method: 'POST' });
      setMeta((m) => ({ ...m, status: 'published', version: r.version }));
      setIssues([]);
      setWarnings(r.warnings ?? []);
      setMsg(`تم النشر (النسخة ${r.version})`);
    } catch (e: any) {
      if (e.details?.errors) { setIssues(e.details.errors); setWarnings(e.details.warnings ?? []); setMsg('لا يمكن النشر: صحّح الأخطاء'); }
    }
  };

  const unpublish = async () => {
    await api(`/flows/${id}/unpublish`, { method: 'POST' }).catch((e) => setMsg(e.message));
    setMeta((m) => ({ ...m, status: 'draft', version: null }));
  };

  const sel = nodes.find((n) => n.id === selected);
  const setTriggers = (triggers: Trigger[]) => { setMeta((m) => ({ ...m, triggers })); setDirty(true); };

  return (
    <div dir="rtl" className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b bg-white p-2 text-sm">
        <a href="/dashboard/flows" className="underline">← السيناريوهات</a>
        <input className="w-56 rounded border p-1" value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} />
        <span className={`rounded px-2 py-0.5 text-xs ${meta.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{meta.status === 'published' ? `منشور v${meta.version}` : 'مسودة'}</span>
        {dirty && <span className="text-xs text-orange-600">تغييرات غير محفوظة</span>}
        <span className="flex-1 text-xs text-gray-500">{msg}</span>
        <button disabled={busy} onClick={() => save().catch(() => {})} className="rounded border px-3 py-1">حفظ</button>
        <button onClick={check} className="rounded border px-3 py-1">فحص</button>
        <button onClick={publish} className="rounded bg-green-600 px-3 py-1 text-white">نشر</button>
        {meta.status === 'published' && <button onClick={unpublish} className="rounded border px-3 py-1">إيقاف النشر</button>}
      </header>

      {(issues.length > 0 || warnings.length > 0) && (
        <div className="max-h-24 overflow-y-auto border-b bg-red-50 px-3 py-1 text-xs">
          {issues.map((i, k) => <div key={`e${k}`} className="text-red-700">⛔ {i.nodeId ? `[${i.nodeId}] ` : ''}{i.message}</div>)}
          {warnings.map((i, k) => <div key={`w${k}`} className="text-amber-700">⚠️ {i.nodeId ? `[${i.nodeId}] ` : ''}{i.message}</div>)}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-36 flex-col gap-1 overflow-y-auto border-l bg-gray-50 p-2">
          <div className="mb-1 text-xs text-gray-500">إضافة عقدة</div>
          {(Object.keys(NODE_META) as NodeType[]).map((t) => (
            <button key={t} onClick={() => addNode(t)} className="rounded border bg-white px-2 py-1.5 text-start text-xs hover:bg-gray-100">
              {NODE_META[t].icon} {NODE_META[t].label}
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={display}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === 'remove')) setDirty(true); }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: s }) => { setSelected(s[0]?.id ?? null); if (s[0]) setTab('node'); }}
            onNodesDelete={(del: Node[]) => { if (del.some((d) => d.id === startId)) setStartId(nodes.find((n) => !del.some((d) => d.id === n.id))?.id ?? ''); }}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <aside className="flex w-96 flex-col border-r bg-white">
          <div className="flex border-b text-sm">
            {([['node', 'العقدة'], ['settings', 'الإعدادات'], ['test', 'تجربة']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 px-3 py-2 ${tab === k ? 'border-b-2 border-black font-semibold' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'node' &&
              (sel ? (
                <Inspector
                  key={sel.id}
                  type={sel.data.type}
                  data={sel.data.data}
                  isStart={sel.id === startId}
                  onChange={(d) => updateData(sel.id, d)}
                  onSetStart={() => { setStartId(sel.id); setDirty(true); }}
                  onDelete={() => deleteNode(sel.id)}
                />
              ) : (
                <p className="p-4 text-sm text-gray-500">اختر عقدة من اللوحة لتعديلها، أو أضف عقدة من القائمة الجانبية. اسحب من دائرة الخروج (يسار العقدة) إلى عقدة أخرى لربطهما.</p>
              ))}

            {tab === 'settings' && (
              <div className="space-y-4 p-3 text-sm">
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">متى يبدأ السيناريو؟</div>
                  {meta.triggers.map((t, i) => (
                    <div key={i} className="mb-2 space-y-1 rounded border p-2">
                      <div className="flex gap-1">
                        <select className={inp} value={t.type} onChange={(e) => {
                          const type = e.target.value as Trigger['type'];
                          const nt: Trigger = type === 'keyword' ? { type, keywords: [], match: 'contains' } : type === 'reply_id' ? { type, ids: [] } : ({ type } as Trigger);
                          setTriggers(meta.triggers.map((x, j) => (j === i ? nt : x)));
                        }}>
                          <option value="keyword">كلمة مفتاحية</option>
                          <option value="first_message">أول رسالة في المحادثة</option>
                          <option value="any_message">أي رسالة (احتياطي)</option>
                          <option value="reply_id">ضغط زر/قائمة محدد</option>
                        </select>
                        <button onClick={() => setTriggers(meta.triggers.filter((_, j) => j !== i))} className="rounded border px-2 text-red-600">×</button>
                      </div>
                      {t.type === 'keyword' && (
                        <>
                          <textarea className={inp} rows={2} placeholder="كلمات مفصولة بفاصلة: سعر، price، كام" defaultValue={t.keywords.join('، ')}
                            onBlur={(e) => setTriggers(meta.triggers.map((x, j) => (j === i ? { ...t, keywords: e.target.value.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean) } : x)))} />
                          <select className={inp} value={t.match} onChange={(e) => setTriggers(meta.triggers.map((x, j) => (j === i ? { ...t, match: e.target.value as any } : x)))}>
                            <option value="contains">تحتوي الرسالة على الكلمة</option>
                            <option value="exact">الرسالة تطابق الكلمة تماماً</option>
                            <option value="starts_with">الرسالة تبدأ بالكلمة</option>
                          </select>
                        </>
                      )}
                      {t.type === 'reply_id' && (
                        <input className={inp} dir="ltr" placeholder="معرّفات الأزرار مفصولة بفاصلة" defaultValue={t.ids.join(', ')}
                          onBlur={(e) => setTriggers(meta.triggers.map((x, j) => (j === i ? { ...t, ids: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : x)))} />
                      )}
                    </div>
                  ))}
                  <button onClick={() => setTriggers([...meta.triggers, { type: 'keyword', keywords: [], match: 'contains' }])} className="rounded border px-2 py-1 text-xs">+ مشغّل</button>
                  <p className="mt-2 text-xs text-gray-400">الأكثر تحديداً يُنفَّذ أولاً: كلمة مفتاحية/زر، ثم أول رسالة، ثم أي رسالة. "أول رسالة" و"أي رسالة" يعملان مرة واحدة لكل محادثة.</p>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">القنوات (بدون اختيار = كل القنوات)</div>
                  {channels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 py-0.5">
                      <input type="checkbox" checked={meta.channelIds.includes(c.id)} onChange={(e) => { setMeta({ ...meta, channelIds: e.target.checked ? [...meta.channelIds, c.id] : meta.channelIds.filter((x) => x !== c.id) }); setDirty(true); }} />
                      {c.name} <span className="text-xs text-gray-400">({c.type})</span>
                    </label>
                  ))}
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">الأولوية (الأعلى أولاً عند التعارض)</div>
                  <input className={inp} type="number" value={meta.priority} onChange={(e) => { setMeta({ ...meta, priority: Number(e.target.value) || 0 }); setDirty(true); }} />
                </div>
              </div>
            )}

            {tab === 'test' && <TestPanel flowId={id} beforeRun={async () => { if (dirty) await save(); }} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Page({ params }: { params: { id: string } }) {
  return (
    <ReactFlowProvider>
      <Editor id={params.id} />
    </ReactFlowProvider>
  );
}
