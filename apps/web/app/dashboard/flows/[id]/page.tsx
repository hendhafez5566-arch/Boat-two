'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  Controls,
  MiniMap,
  MarkerType,
  Node,
  NodeChange,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useLocale } from '../../../../components/product/locale';
import { Dialog } from '../../../../components/product/ProductUI';
import { NavIcon } from '../../../../components/product/NavIcon';
import { NodeIcon, nodeLabel } from '../../../../components/flow/presentation';
import FlowNodeView from '../../../../components/flow/FlowNodeView';
import Inspector from '../../../../components/flow/Inspector';
import TestPanel from '../../../../components/flow/TestPanel';
import { api, getSession } from '../../../../lib/api';
import {
  fromFlow,
  handlesFor,
  NODE_META,
  NodeType,
  RFData,
  toFlow,
  Trigger,
  uid,
} from '../../../../lib/flow-types';

const nodeTypes = { flowNode: FlowNodeView };

type Issue = { nodeId?: string; message: string };
const inp = 'w-full rounded border p-1.5 text-sm';

function Editor({ id }: { id: string }) {
  const rf = useReactFlow();
  const { t, language } = useLocale();
  const [nodeSearch, setNodeSearch] = useState('');
  const [mobilePanel, setMobilePanel] = useState('canvas');
  const [nodes, setNodes, onNodesChange] = useNodesState<RFData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [startId, setStartId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'node' | 'settings' | 'test'>('node');
  const [meta, setMeta] = useState<{
    name: string;
    priority: number;
    triggers: Trigger[];
    channelIds: string[];
    status: string;
    version: number | null;
  }>({
    name: '',
    priority: 0,
    triggers: [],
    channelIds: [],
    status: 'draft',
    version: null,
  });
  const [channels, setChannels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [versions, setVersions] = useState<{ id: string; version: number; created_at: string }[]>(
    [],
  );
  const [showVersions, setShowVersions] = useState(false);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const skipHistory = useRef(false);
  const [, redrawHistory] = useState(0);
  const saving = useRef(false);
  const latest = useRef('');

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    (async () => {
      const f = await api<any>(`/flows/${id}`);
      const g = toFlow(f.draft_graph);
      setUpdatedAt(f.updated_at);
      setLoaded(true);
      setNodes(g.nodes);
      setEdges(g.edges);
      setStartId(f.draft_graph.startNodeId);
      setMeta({
        name: f.name,
        priority: f.priority,
        triggers: f.triggers,
        channelIds: f.channel_ids ?? [],
        status: f.status,
        version: f.published_version,
      });
      api<any[]>('/channels')
        .then(setChannels)
        .catch(() => {});
    })().catch((e) => setMsg(e.message));
  }, [id, setNodes, setEdges]);

  const issueMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of [...issues]) if (i.nodeId && !m[i.nodeId]) m[i.nodeId] = i.message;
    return m;
  }, [issues]);

  const display = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, isStart: n.id === startId, issue: issueMap[n.id] },
      })),
    [nodes, startId, issueMap],
  );

  const handleNodesChange = (changes: NodeChange[]) => {
    onNodesChange(changes);
    if (
      changes.some(
        (c) =>
          c.type !== 'select' && c.type !== 'dimensions' && !(c.type === 'position' && c.dragging),
      )
    )
      setDirty(true);
  };

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((es) =>
        addEdge(
          { ...c, type: 'smoothstep' },
          es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)),
        ),
      );
      setDirty(true);
    },
    [setEdges],
  );

  const addNode = (type: NodeType, point?: { x: number; y: number }) => {
    const nid = `${type}_${uid(4)}`;
    const pos = rf.screenToFlowPosition(
      point ?? {
        x: window.innerWidth / 2 - 200,
        y: window.innerHeight / 2 - 100,
      },
    );
    setNodes((ns) => [
      ...ns,
      {
        id: nid,
        type: 'flowNode',
        position: pos,
        data: { type, data: NODE_META[type].defaults(), isStart: false },
      },
    ]);
    if (!startId || !nodes.length) setStartId(nid);
    setSelected(nid);
    setMobilePanel('inspector');
    setTab('node');
    setDirty(true);
  };

  const updateData = (nid: string, data: any) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, data } } : n)));
    const node = nodes.find((n) => n.id === nid);
    if (node) {
      const valid = new Set(handlesFor(node.data.type, data).map((h) => h.id));
      setEdges((es) =>
        es.filter((e) => e.source !== nid || (e.sourceHandle && valid.has(e.sourceHandle))),
      );
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
    if (saving.current)
      throw new Error(t('انتظر اكتمال الحفظ الحالي', 'Wait for the current save'));
    saving.current = true;
    const submitted = latest.current;
    setBusy(true);
    setMsg('');
    try {
      const result = await api<{ updated_at: string }>(`/flows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedUpdatedAt: updatedAt,
          name: meta.name,
          priority: meta.priority,
          triggers: meta.triggers,
          channelIds: meta.channelIds,
          graph: graph(),
        }),
      });
      setUpdatedAt(result.updated_at);
      if (latest.current === submitted) setDirty(false);
      setMsg(t('تم الحفظ', 'All changes saved'));
      return result.updated_at;
    } catch (e: any) {
      setMsg(`${t('تعذّر الحفظ', 'Save failed')}: ${e.message}`);
      throw e;
    } finally {
      setBusy(false);
      saving.current = false;
    }
  };

  const content = JSON.stringify({
    graph: graph(),
    name: meta.name,
    priority: meta.priority,
    triggers: meta.triggers,
    channelIds: meta.channelIds,
  });
  latest.current = content;
  useEffect(() => {
    if (!loaded) return;
    if (skipHistory.current) {
      skipHistory.current = false;
      return;
    }
    if (history.current[cursor.current] === content) return;
    history.current = [...history.current.slice(0, cursor.current + 1), content].slice(-60);
    cursor.current = history.current.length - 1;
    redrawHistory((x) => x + 1);
  }, [content, loaded]);
  function travel(offset: number) {
    const target = cursor.current + offset;
    if (target < 0 || target >= history.current.length || busy) return;
    cursor.current = target;
    skipHistory.current = true;
    const snapshot = JSON.parse(history.current[target]);
    const flow = toFlow(snapshot.graph);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setStartId(snapshot.graph.startNodeId);
    setMeta((m) => ({
      ...m,
      name: snapshot.name,
      priority: snapshot.priority,
      triggers: snapshot.triggers,
      channelIds: snapshot.channelIds,
    }));
    setDirty(true);
    redrawHistory((x) => x + 1);
  }
  useEffect(() => {
    if (!dirty || !loaded || !autoSave || busy) return;
    const timeout = setTimeout(() => {
      save().catch(() => setAutoSave(false));
    }, 1800);
    return () => clearTimeout(timeout);
    // Saving is scheduled against serialized editor content; failures pause autosave.
  }, [content, dirty, loaded, autoSave, busy]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving.current) void save().catch(() => {});
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [content, updatedAt]);
  async function loadVersions() {
    try {
      setVersions(await api<typeof versions>(`/flows/${id}/versions`));
      setShowVersions(true);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function restoreVersion(versionId: string) {
    if (dirty && !confirm('استبدال التعديلات غير المحفوظة بهذه النسخة؟')) return;
    try {
      await api(`/flows/${id}/versions/${versionId}/restore`, {
        method: 'POST',
        body: JSON.stringify({ expectedUpdatedAt: updatedAt }),
      });
      window.location.reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const check = async () => {
    try {
      const r = await api<{ errors: Issue[]; warnings: Issue[] }>('/flows/validate', {
        method: 'POST',
        body: JSON.stringify(graph()),
      });
      setIssues(r.errors);
      setWarnings(r.warnings);
      setMsg(
        r.errors.length
          ? `${r.errors.length} ${t('خطأ', 'errors')}`
          : t('لا توجد أخطاء', 'Validation passed'),
      );
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const publish = async () => {
    try {
      const savedAt = await save();
      const r = await api<any>(`/flows/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ expectedUpdatedAt: savedAt }),
      });
      setMeta((m) => ({ ...m, status: 'published', version: r.version }));
      setIssues([]);
      setWarnings(r.warnings ?? []);
      setMsg(`${t('تم النشر', 'Published')} v${r.version}`);
    } catch (e: any) {
      if (e.details?.errors) {
        setIssues(e.details.errors);
        setWarnings(e.details.warnings ?? []);
        setMsg(t('لا يمكن النشر: صحّح الأخطاء', 'Fix validation errors before publishing'));
      }
    }
  };

  const unpublish = async () => {
    try {
      await api(`/flows/${id}/unpublish`, { method: 'POST' });
      setMeta((m) => ({ ...m, status: 'draft', version: null }));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const sel = nodes.find((n) => n.id === selected);
  const setTriggers = (triggers: Trigger[]) => {
    setMeta((m) => ({ ...m, triggers }));
    setDirty(true);
  };

  return (
    <div className="premium-builder flex h-screen flex-col">
      <header className="builder-toolbar">
        <a href="/dashboard/flows" className="underline">
          {t('السيناريوهات', 'Bots')} /
        </a>
        <input
          aria-label={t('اسم البوت', 'Bot name')}
          className="builder-title"
          value={meta.name}
          onChange={(e) => {
            setMeta({ ...meta, name: e.target.value });
            setDirty(true);
          }}
        />
        <span
          className={`rounded px-2 py-0.5 text-xs ${meta.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}
        >
          {meta.status === 'published'
            ? `${t('منشور', 'Published')} v${meta.version}`
            : t('مسودة', 'Draft')}
        </span>
        {dirty && (
          <span className="text-xs text-orange-600">
            {t('تغييرات غير محفوظة', 'Unsaved changes')}
          </span>
        )}
        <span className="builder-save-status" role="status">
          {msg}
        </span>
        <button
          title="تراجع عن آخر تعديل"
          disabled={busy || cursor.current <= 0}
          onClick={() => travel(-1)}
          className="rounded border px-2 py-1"
        >
          <NavIcon name="undo" /> {t('تراجع', 'Undo')}
        </button>
        <button
          title="إعادة التعديل"
          disabled={busy || cursor.current >= history.current.length - 1}
          onClick={() => travel(1)}
          className="rounded border px-2 py-1"
        >
          <NavIcon name="redo" /> {t('إعادة', 'Redo')}
        </button>
        <label className="text-xs flex gap-1">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
          />
          {t('حفظ تلقائي', 'Autosave')}
        </label>
        <button disabled={busy} onClick={loadVersions} className="rounded border px-2 py-1">
          {t('الإصدارات', 'Versions')}
        </button>
        <button
          disabled={busy}
          onClick={() => save().catch(() => {})}
          className="rounded border px-3 py-1"
        >
          {t('حفظ', 'Save')}
        </button>
        <button onClick={check} className="rounded border px-3 py-1">
          {t('فحص', 'Validate')}
        </button>
        <button disabled={busy} onClick={publish} className="btn btn-primary">
          {t('نشر', 'Publish')}
        </button>
        {meta.status === 'published' && (
          <button onClick={unpublish} className="rounded border px-3 py-1">
            {t('إيقاف النشر', 'Unpublish')}
          </button>
        )}
      </header>

      <Dialog
        open={showVersions}
        onClose={() => setShowVersions(false)}
        title={t('الإصدارات المنشورة', 'Published versions')}
      >
        <div className="border-b bg-white p-3 text-sm flex flex-wrap items-center gap-3">
          <strong>الإصدارات المنشورة</strong>
          {!versions.length && <span>لا توجد إصدارات منشورة بعد.</span>}
          {versions.map((v) => (
            <button
              className="rounded border px-2 py-1"
              key={v.id}
              disabled={busy}
              onClick={() => restoreVersion(v.id)}
            >
              استعادة v{v.version} إلى المسودة · {new Date(v.created_at).toLocaleDateString()}
            </button>
          ))}
          <button onClick={() => setShowVersions(false)}>إغلاق ×</button>
          <small>الاستعادة لا تغيّر الإصدار المنشور حتى تضغط نشر.</small>
        </div>
      </Dialog>
      {(issues.length > 0 || warnings.length > 0) && (
        <div className="max-h-24 overflow-y-auto border-b bg-red-50 px-3 py-1 text-xs">
          {issues.map((i, k) => (
            <div key={`e${k}`} className="text-red-700">
              ⛔ {i.nodeId ? `[${i.nodeId}] ` : ''}
              {i.message}
            </div>
          ))}
          {warnings.map((i, k) => (
            <div key={`w${k}`} className="text-amber-700">
              ⚠️ {i.nodeId ? `[${i.nodeId}] ` : ''}
              {i.message}
            </div>
          ))}
        </div>
      )}

      <div className="builder-mobile-tools">
        <button onClick={() => setMobilePanel('canvas')}>{t('اللوحة', 'Canvas')}</button>
        <button onClick={() => setMobilePanel('palette')}>{t('إضافة عقدة', 'Add a step')}</button>
        <button onClick={() => setMobilePanel('inspector')}>{t('التفاصيل', 'Inspector')}</button>
        <button
          onClick={() => {
            setTab('test');
            setMobilePanel('inspector');
          }}
        >
          {t('تجربة البوت', 'Preview bot')}
        </button>
      </div>
      <div className="builder-main flex min-h-0 flex-1" data-mobile-panel={mobilePanel}>
        <aside className="builder-palette flex w-36 flex-col gap-1 overflow-y-auto border-l bg-gray-50 p-2">
          <div className="palette-heading">
            <p className="eyebrow">{t('خطوة بخطوة', 'STEP BY STEP')}</p>
            <h2>{t('أضف خطوة', 'Add a step')}</h2>
            <p>
              {t('اسحبها إلى اللوحة أو اضغط لإضافتها.', 'Drag onto the canvas or select to add.')}
            </p>
            <input
              aria-label={t('البحث عن خطوة', 'Search steps')}
              placeholder={t('ابحث عن إجراء…', 'Find an action…')}
              value={nodeSearch}
              onChange={(e) => setNodeSearch(e.target.value)}
            />
          </div>
          {(Object.keys(NODE_META) as NodeType[])
            .filter((type) =>
              nodeLabel(type, language).toLowerCase().includes(nodeSearch.toLowerCase()),
            )
            .map((type) => (
              <button
                key={type}
                className="palette-step"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/boat-node', type);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addNode(type)}
              >
                <span style={{ color: NODE_META[type].color }}>
                  <NodeIcon type={type} />
                </span>
                <span>{nodeLabel(type, language)}</span>
                <small>+</small>
              </button>
            ))}
          <div className="palette-tip">
            {t(
              'ابدأ برسالة ترحيب، ثم سؤال أو شرط. جرّب البوت قبل النشر.',
              'Start with a welcome message, then a question or condition. Preview before publishing.',
            )}
          </div>
        </aside>

        <div
          className="builder-canvas min-w-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData('application/boat-node');
            if (Object.hasOwn(NODE_META, type))
              addNode(type as NodeType, { x: e.clientX, y: e.clientY });
          }}
        >
          <ReactFlow
            nodes={display}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={(c) => {
              onEdgesChange(c);
              if (c.some((x) => x.type === 'remove')) setDirty(true);
            }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: s }) => {
              setSelected(s[0]?.id ?? null);
              if (s[0]) setTab('node');
            }}
            onNodesDelete={(del: Node[]) => {
              if (del.some((d) => d.id === startId))
                setStartId(nodes.find((n) => !del.some((d) => d.id === n.id))?.id ?? '');
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#86a9a5', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
            minZoom={0.2}
            maxZoom={2}
            fitView
          >
            <Background color="#c9d7db" gap={24} size={1.2} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => NODE_META[n.data?.type as NodeType]?.color ?? '#8aa6ad'}
              maskColor="#eef4f7bb"
            />
          </ReactFlow>
        </div>

        <aside className="builder-inspector flex w-96 flex-col border-r bg-white">
          <div className="flex border-b text-sm">
            {(
              [
                ['node', t('العقدة', 'Inspector')],
                ['settings', t('الإعدادات', 'Settings')],
                ['test', t('تجربة', 'Preview')],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 px-3 py-2 ${tab === k ? 'border-b-2 border-black font-semibold' : 'text-gray-500'}`}
              >
                {l}
              </button>
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
                  onSetStart={() => {
                    setStartId(sel.id);
                    setDirty(true);
                  }}
                  onDelete={() => deleteNode(sel.id)}
                />
              ) : (
                <p className="p-4 text-sm text-gray-500">
                  {t(
                    'اختر خطوة لتعديلها. اسحب بين نقاط الاتصال لربط الخطوات.',
                    'Select a step to edit it. Drag between connection points to link steps.',
                  )}
                </p>
              ))}

            {tab === 'settings' && (
              <div className="space-y-4 p-3 text-sm">
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">
                    متى يبدأ السيناريو؟
                  </div>
                  {meta.triggers.map((t, i) => (
                    <div key={i} className="mb-2 space-y-1 rounded border p-2">
                      <div className="flex gap-1">
                        <select
                          className={inp}
                          value={t.type}
                          onChange={(e) => {
                            const type = e.target.value as Trigger['type'];
                            const nt: Trigger =
                              type === 'event'
                                ? { type, event: 'crm.contacts.insert' }
                                : type === 'keyword'
                                  ? { type, keywords: [], match: 'contains' }
                                  : type === 'reply_id'
                                    ? { type, ids: [] }
                                    : ({ type } as Trigger);
                            setTriggers(meta.triggers.map((x, j) => (j === i ? nt : x)));
                          }}
                        >
                          <option value="event">حدث CRM</option>
                          <option value="keyword">كلمة مفتاحية</option>
                          <option value="first_message">أول رسالة في المحادثة</option>
                          <option value="any_message">أي رسالة (احتياطي)</option>
                          <option value="reply_id">ضغط زر/قائمة محدد</option>
                        </select>
                        <button
                          onClick={() => setTriggers(meta.triggers.filter((_, j) => j !== i))}
                          className="rounded border px-2 text-red-600"
                        >
                          ×
                        </button>
                      </div>
                      {t.type === 'event' && (
                        <select
                          className={inp}
                          value={t.event}
                          onChange={(e) =>
                            setTriggers(
                              meta.triggers.map((x, j) =>
                                j === i ? { type: 'event', event: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {[
                            'crm.contacts.insert',
                            'crm.contacts.update',
                            'crm.crm_deals.insert',
                            'crm.crm_deals.update',
                            'crm.crm_tasks.update',
                          ].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      )}
                      {t.type === 'keyword' && (
                        <>
                          <textarea
                            className={inp}
                            rows={2}
                            placeholder="كلمات مفصولة بفاصلة: سعر، price، كام"
                            defaultValue={t.keywords.join('، ')}
                            onBlur={(e) =>
                              setTriggers(
                                meta.triggers.map((x, j) =>
                                  j === i
                                    ? {
                                        ...t,
                                        keywords: e.target.value
                                          .split(/[,،\n]/)
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                          <select
                            className={inp}
                            value={t.match}
                            onChange={(e) =>
                              setTriggers(
                                meta.triggers.map((x, j) =>
                                  j === i ? { ...t, match: e.target.value as any } : x,
                                ),
                              )
                            }
                          >
                            <option value="contains">تحتوي الرسالة على الكلمة</option>
                            <option value="exact">الرسالة تطابق الكلمة تماماً</option>
                            <option value="starts_with">الرسالة تبدأ بالكلمة</option>
                          </select>
                        </>
                      )}
                      {t.type === 'reply_id' && (
                        <input
                          className={inp}
                          dir="ltr"
                          placeholder="معرّفات الأزرار مفصولة بفاصلة"
                          defaultValue={t.ids.join(', ')}
                          onBlur={(e) =>
                            setTriggers(
                              meta.triggers.map((x, j) =>
                                j === i
                                  ? {
                                      ...t,
                                      ids: e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setTriggers([
                        ...meta.triggers,
                        { type: 'keyword', keywords: [], match: 'contains' },
                      ])
                    }
                    className="rounded border px-2 py-1 text-xs"
                  >
                    + مشغّل
                  </button>
                  <p className="mt-2 text-xs text-gray-400">
                    الأكثر تحديداً يُنفَّذ أولاً: كلمة مفتاحية/زر، ثم أول رسالة، ثم أي رسالة. "أول
                    رسالة" و"أي رسالة" يعملان مرة واحدة لكل محادثة.
                  </p>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">
                    القنوات (بدون اختيار = كل القنوات)
                  </div>
                  {channels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        checked={meta.channelIds.includes(c.id)}
                        onChange={(e) => {
                          setMeta({
                            ...meta,
                            channelIds: e.target.checked
                              ? [...meta.channelIds, c.id]
                              : meta.channelIds.filter((x) => x !== c.id),
                          });
                          setDirty(true);
                        }}
                      />
                      {c.name} <span className="text-xs text-gray-400">({c.type})</span>
                    </label>
                  ))}
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">
                    الأولوية (الأعلى أولاً عند التعارض)
                  </div>
                  <input
                    className={inp}
                    type="number"
                    value={meta.priority}
                    onChange={(e) => {
                      setMeta({ ...meta, priority: Number(e.target.value) || 0 });
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
            )}

            {tab === 'test' && (
              <TestPanel
                flowId={id}
                beforeRun={async () => {
                  if (dirty) await save();
                }}
              />
            )}
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
