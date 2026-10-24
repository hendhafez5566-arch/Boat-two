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
  updateEdge,
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
import { ButtonStats, FlowButtonStatsContext, FlowSequencesContext, FlowStatsContext, NodeStats, SeqInfo } from '../../../../components/flow/stats-context';
import FlowEdge, { ButtonLinkEdge } from '../../../../components/flow/FlowEdge';
import FlowButtonNode from '../../../../components/flow/FlowButtonNode';
import UnsavedChangesGuard from '../../../../components/flow/UnsavedChangesGuard';
import Inspector from '../../../../components/flow/Inspector';
import TestPanel from '../../../../components/flow/TestPanel';
import { api, getSession } from '../../../../lib/api';
import {
  BUTTON_NODE_TYPE,
  deriveButtonCards,
  fromFlow,
  handlesFor,
  hasButtonCards,
  NODE_META,
  NODE_GROUPS,
  NodeType,
  RFData,
  toFlow,
  Trigger,
  uid,
} from '../../../../lib/flow-types';

import { computeLayout, hasLayoutOverlap, nodeFootprint } from '../../../../lib/flow-layout';

const nodeTypes = { flowNode: FlowNodeView, [BUTTON_NODE_TYPE]: FlowButtonNode };
const edgeTypes = { smoothstep: FlowEdge, buttonLink: ButtonLinkEdge };

type Issue = { nodeId?: string; message: string };

function Editor({ id }: { id: string }) {
  const rf = useReactFlow();
  const { t, language } = useLocale();
  const [nodeSearch, setNodeSearch] = useState('');
  const [findNode, setFindNode] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('canvas');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const selRef = useRef<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewActive, setPreviewActive] = useState<string | null>(null);
  const previewActiveRef = useRef<string | null>(null);
  const [previewVisited, setPreviewVisited] = useState<string[]>([]);
  const lastFocused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [dropMenu, setDropMenu] = useState<{
    x: number;
    y: number;
    source: string;
    handle: string | null;
    edgeId?: string;
  } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connecting, setConnecting] = useState(false);
  const connectFrom = useRef<{ source: string; handle: string | null } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [startId, setStartId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'node' | 'settings'>('node');
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
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const savedContent = useRef('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [nodeStats, setNodeStats] = useState<Record<string, NodeStats>>({});
  const [buttonStats, setButtonStats] = useState<Record<string, ButtonStats>>({});
  const [btnDims, setBtnDims] = useState<Record<string, { width: number; height: number }>>({});
  const [seqInfo, setSeqInfo] = useState<Record<string, SeqInfo>>({});
  useEffect(() => {
    let alive = true;
    api<{ id: string; name: string; status: string; delivery_time?: string | null; timezone?: string }[]>('/sequences')
      .then((rows) => {
        if (!alive) return;
        setSeqInfo(
          Object.fromEntries(
            rows.map((s) => [s.id, { name: s.name, status: s.status, deliveryTime: s.delivery_time ?? null, timezone: s.timezone ?? '' }]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([
        api<Record<string, NodeStats>>(`/flows/${id}/stats`)
          .then((r) => alive && setNodeStats(r))
          .catch(() => {}),
        api<Record<string, ButtonStats>>(`/flows/${id}/button-stats`)
          .then((r) => alive && setButtonStats(r))
          .catch(() => {}),
      ]);
    load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id]);
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
    setPreviewOpen(window.innerWidth >= 1400);
  }, []);

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
      const spots = new Set(g.nodes.map((n) => `${Math.round(n.position.x / 40)},${Math.round(n.position.y / 40)}`));
      if (g.nodes.length > 1 && (spots.size < g.nodes.length || hasLayoutOverlap(g.nodes, language === 'ar'))) {
        const pos = computeLayout(g.nodes, g.edges, f.draft_graph.startNodeId, language === 'ar');
        g.nodes = g.nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position }));
        setDirty(true);
      }
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

  // Stable handler: an inline onSelectionChange makes React Flow re-fire it on every
  // render, which used to force the tab back to 'node' and broke the Settings tab.
  const btnIndexRef = useRef<Record<string, { parentId: string; buttonId: string }>>({});
  const onSelectionChange = useCallback(({ nodes: s }: { nodes: Node[] }) => {
    const nid = s[0] ? (btnIndexRef.current[s[0].id]?.parentId ?? s[0].id) : null;
    if (nid === selRef.current) return;
    selRef.current = nid;
    setSelected(nid);
    if (nid) {
      setTab('node');
      setInspectorOpen(true);
    }
  }, []);

  // The "+" on a link asks the editor to insert a step in the middle of it.
  useEffect(() => {
    const onInsert = (ev: Event) => {
      const d = (ev as CustomEvent<{ id: string; source: string; handle: string | null; x: number; y: number }>).detail;
      const box = (document.querySelector('.builder-canvas') as HTMLElement | null)?.getBoundingClientRect();
      if (!box) return;
      setNodeSearch('');
      setDropMenu({
        x: Math.max(8, Math.min(d.x - box.left, box.width - 290)),
        y: Math.max(8, Math.min(d.y - box.top, box.height - 320)),
        ...(() => {
          const hit = btnIndexRef.current[d.source];
          return hit ? { source: hit.parentId, handle: `option:${hit.buttonId}` } : { source: d.source, handle: d.handle };
        })(),
        edgeId: d.id,
      });
    };
    window.addEventListener('flow:insert-step', onInsert);
    return () => window.removeEventListener('flow:insert-step', onInsert);
  }, []);

  const issueMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of [...issues]) if (i.nodeId && !m[i.nodeId]) m[i.nodeId] = i.message;
    return m;
  }, [issues]);

  const actionsRef = useRef<{
    duplicate: (id: string) => void;
    remove: (id: string) => void;
    setStart: (id: string) => void;
  }>({ duplicate: () => {}, remove: () => {}, setStart: () => {} });
  const nodeActions = useMemo(
    () => ({
      duplicate: (id: string) => actionsRef.current.duplicate(id),
      remove: (id: string) => actionsRef.current.remove(id),
      setStart: (id: string) => actionsRef.current.setStart(id),
    }),
    [],
  );
  const display = useMemo(() => {
    const linkedBy: Record<string, string[]> = {};
    for (const e of edges) if (e.sourceHandle) (linkedBy[e.source] ??= []).push(e.sourceHandle);
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isStart: n.id === startId,
        issue: issueMap[n.id],
        preview:
          n.id === previewActive
            ? ('active' as const)
            : previewVisited.includes(n.id)
              ? ('visited' as const)
              : undefined,
        linked: linkedBy[n.id] ?? [],
        splitButtons: hasButtonCards(n.data.type, n.data.data),
        actions: nodeActions,
      },
    }));
  }, [nodes, edges, startId, issueMap, nodeActions, previewActive, previewVisited]);

  // Buttons drawn as their own cards: derived for display only; the saved graph is unchanged.
  const cards = useMemo(
    () => deriveButtonCards(nodes, edges, language === 'ar', btnDims),
    [nodes, edges, language, btnDims],
  );
  btnIndexRef.current = cards.index;
  const canvasNodes = useMemo(() => [...display, ...cards.cardNodes], [display, cards.cardNodes]);

  /** A button card's output is really the message's `option:<buttonId>` output. */
  const toReal = useCallback((source: string | null | undefined, handle: string | null | undefined) => {
    const hit = source ? btnIndexRef.current[source] : undefined;
    return hit
      ? { source: hit.parentId, handle: `option:${hit.buttonId}` as string | null }
      : { source: source ?? '', handle: handle ?? null };
  }, []);

  const handleNodesChange = (incoming: NodeChange[]) => {
    const idx = btnIndexRef.current;
    const changes = incoming.filter((c) => !('id' in c && idx[c.id]));
    const moved = incoming.filter(
      (c): c is Extract<NodeChange, { type: 'position' }> => c.type === 'position' && !!c.position && !!idx[c.id],
    );
    if (moved.length)
      setNodes((ns) =>
        ns.map((n) => {
          const mine = moved.filter((c) => idx[c.id].parentId === n.id);
          if (!mine.length) return n;
          const layout = { ...(n.data.layout ?? {}) };
          for (const c of mine)
            layout[idx[c.id].buttonId] = { x: c.position!.x - n.position.x, y: c.position!.y - n.position.y };
          return { ...n, data: { ...n.data, layout } };
        }),
      );
    const sized = incoming.filter(
      (c): c is Extract<NodeChange, { type: 'dimensions' }> => c.type === 'dimensions' && !!c.dimensions && !!idx[c.id],
    );
    if (sized.length)
      setBtnDims((prev) => {
        let next = prev;
        for (const c of sized) {
          const d = c.dimensions!;
          if (prev[c.id]?.width !== d.width || prev[c.id]?.height !== d.height)
            next = { ...next, [c.id]: { width: d.width, height: d.height } };
        }
        return next;
      });
    onNodesChange(changes);
    if (
      incoming.some(
        (c) => 'id' in c && idx[c.id] && c.type === 'position' && !c.dragging,
      )
    )
      setDirty(true);
    if (
      changes.some(
        (c) =>
          c.type !== 'select' && c.type !== 'dimensions' && !(c.type === 'position' && c.dragging),
      )
    )
      setDirty(true);
  };

  const notify = (text: string, undo = false) => {
    setToast({ text, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  // A connection is valid only between two different, existing steps and from a real output.
  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return false;
      const real = toReal(c.source, c.sourceHandle);
      if (real.source === c.target) return false;
      const from = nodes.find((n) => n.id === real.source);
      if (!from || !nodes.some((n) => n.id === c.target)) return false;
      return handlesFor(from.data.type, from.data.data).some((h) => h.id === real.handle);
    },
    [nodes, toReal],
  );

  const onConnect = useCallback(
    (raw: Connection) => {
      if (!isValidConnection(raw)) return;
      const r = toReal(raw.source, raw.sourceHandle);
      const c: Connection = { ...raw, source: r.source, sourceHandle: r.handle };
      const previous = edges.find((e) => e.source === c.source && e.sourceHandle === c.sourceHandle);
      if (previous && previous.target === c.target) return;
      setEdges((es) =>
        addEdge(
          { ...c, type: 'smoothstep' },
          es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)),
        ),
      );
      if (previous)
        notify(t('استُبدل التوصيل السابق لهذا المخرج.', 'The previous link from this output was replaced.'), true);
      setDirty(true);
    },
    [setEdges, edges, isValidConnection, toReal],
  );

  const onEdgeUpdate = useCallback(
    (old: any, raw: Connection) => {
      // Only the target end may move; the output it leaves from never changes.
      const from = toReal(old.source, old.sourceHandle);
      const to = toReal(raw.source, raw.sourceHandle);
      if (to.source !== from.source || to.handle !== from.handle || !isValidConnection(raw)) return;
      const c: Connection = { ...raw, source: to.source, sourceHandle: to.handle };
      setEdges((es) => updateEdge({ ...old, source: from.source, sourceHandle: from.handle }, c, es));
      setDirty(true);
    },
    [setEdges, isValidConnection, toReal],
  );

  const addNode = (
    type: NodeType,
    point?: { x: number; y: number },
    from?: { source: string; handle: string | null },
    after?: { target: string },
  ) => {
    const nid = `${type}_${uid(4)}`;
    const pos = rf.screenToFlowPosition(
      point ?? {
        x: window.innerWidth / 2 - 200,
        y: window.innerHeight / 2 - 100,
      },
    );
    const candidate: Node<RFData> = {id: nid, position: pos, data: {type, data: NODE_META[type].defaults(), isStart: false}};
    let attempts = 0;
    while (hasLayoutOverlap([...nodes, candidate], language === 'ar') && attempts++ < nodes.length + 1) {
      // Compare the new card against existing cards without changing user positions.
      const touching = nodes.some(n => hasLayoutOverlap([n, candidate], language === 'ar'));
      if (!touching) break;
      pos.y += 280;
    }
    if (nodes.some(n => hasLayoutOverlap([n, candidate], language === 'ar'))) {
      pos.y = Math.max(...nodes.map(n => n.position.y + nodeFootprint(n, language === 'ar', btnDims).bottom)) + 120;
    }
    setNodes((ns) => [
      ...ns.map((node) => ({ ...node, selected: false })),
      {
        id: nid,
        selected: true,
        type: 'flowNode',
        position: pos,
        data: { type, data: NODE_META[type].defaults(), isStart: false },
      },
    ]);
    if (from) {
      // Same replacement rule as onConnect: one outgoing edge per source handle.
      setEdges((es) =>
        addEdge(
          { source: from.source, sourceHandle: from.handle, target: nid, targetHandle: null, type: 'smoothstep' },
          es.filter((e) => !(e.source === from.source && e.sourceHandle === from.handle)),
        ),
      );
    }
    if (after) {
      // Inserted on an existing link: new step → the old target keeps the flow intact.
      const out = handlesFor(type, NODE_META[type].defaults())[0]?.id ?? null;
      setEdges((es) =>
        addEdge({ source: nid, sourceHandle: out, target: after.target, targetHandle: null, type: 'smoothstep' }, es),
      );
    }
    if (!startId || !nodes.length) setStartId(nid);
    setSelected(nid);
    selRef.current = nid;
    setInspectorOpen(true);
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
    notify(t('حُذفت الخطوة وتوصيلاتها.', 'Step and its links deleted.'), true);
  };

  const clipboard = useRef<{ nodes: Node<RFData>[]; edges: typeof edges } | null>(null);

  const copySelection = (ids?: string[]) => {
    const chosen = nodes.filter((n) => (ids ? ids.includes(n.id) : n.selected));
    if (!chosen.length) return false;
    const keep = new Set(chosen.map((n) => n.id));
    clipboard.current = {
      nodes: JSON.parse(JSON.stringify(chosen)),
      edges: JSON.parse(JSON.stringify(edges.filter((e) => keep.has(e.source) && keep.has(e.target)))),
    };
    return true;
  };
  const pasteClipboard = () => {
    const clip = clipboard.current;
    if (!clip) return;
    const idMap: Record<string, string> = {};
    for (const n of clip.nodes) idMap[n.id] = `${n.data.type}_${uid(4)}`;
    const fresh = clip.nodes.map((n) => ({
      ...JSON.parse(JSON.stringify(n)),
      id: idMap[n.id],
      selected: true,
      position: { x: n.position.x + 48, y: n.position.y + 48 },
      data: { ...JSON.parse(JSON.stringify(n.data)), isStart: false },
    })) as Node<RFData>[];
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...fresh]);
    setEdges((es) => [
      ...es,
      ...clip.edges.map((e) => ({
        ...e,
        id: `${idMap[e.source]}:${e.sourceHandle}`,
        source: idMap[e.source],
        target: idMap[e.target],
      })),
    ]);
    // Shift the clipboard so repeated pastes cascade instead of stacking.
    clip.nodes = clip.nodes.map((n) => ({ ...n, position: { x: n.position.x + 48, y: n.position.y + 48 } }));
    if (fresh.length === 1) setSelected(fresh[0].id);
    setDirty(true);
  };
  const duplicateNode = (nid: string) => {
    if (copySelection([nid])) pasteClipboard();
  };

  const autoLayout = () => {
    if (!nodes.length) return;
    const arranged = nodes.map(n => ({...n, data: {...n.data, layout: undefined}}));
    const pos = computeLayout(arranged, edges, startId, language === 'ar', btnDims);
    setNodes(arranged.map(n => ({ ...n, position: pos[n.id] ?? n.position })));
    setDirty(true);
    setTimeout(() => rf.fitView({ padding: 0.25, maxZoom: 1, duration: 300 }), 50);
  };

  const focusNode = (nid: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nid })));
    setSelected(nid);
    selRef.current = nid;
    setInspectorOpen(true);
    setTab('node');
    rf.fitView({ nodes: [{ id: nid }], padding: 1.2, maxZoom: 1.1, duration: 300 });
  };

  const graph = () => fromFlow(nodes, edges, startId);

  actionsRef.current = {
    duplicate: duplicateNode,
    remove: deleteNode,
    setStart: (nid: string) => {
      setStartId(nid);
      setDirty(true);
    },
  };

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'c') {
        if (copySelection()) e.preventDefault();
      } else if (k === 'v') {
        if (clipboard.current) {
          e.preventDefault();
          pasteClipboard();
        }
      } else if (k === 'd') {
        e.preventDefault();
        if (copySelection()) pasteClipboard();
      } else if (k === 'z') {
        e.preventDefault();
        travel(e.shiftKey ? 1 : -1);
      } else if (k === 'y') {
        e.preventDefault();
        travel(1);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  const save = async () => {
    if (saving.current)
      throw new Error(t('انتظر اكتمال الحفظ الحالي', 'Wait for the current save'));
    saving.current = true;
    const submitted = latest.current;
    setBusy(true);
    setSaveState('saving');
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
      savedContent.current = submitted;
      if (latest.current === submitted) setDirty(false);
      setSaveState('saved');
      setMsg(latest.current === submitted ? t('تم الحفظ', 'All changes saved') : t('تم حفظ النسخة السابقة؛ توجد تعديلات أحدث غير محفوظة', 'Previous version saved; newer changes remain unsaved'));
      return result.updated_at;
    } catch (e: any) {
      setSaveState('error');
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
    if (
      dirty &&
      !confirm(
        t(
          'استبدال التعديلات غير المحفوظة بهذه النسخة؟',
          'Replace unsaved changes with this version?',
        ),
      )
    )
      return;
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

  const onPreviewProgress = (nid: string | null, reset?: boolean) => {
    if (reset) {
      setPreviewVisited([]);
      previewActiveRef.current = null;
      setPreviewActive(null);
      return;
    }
    const prev = previewActiveRef.current;
    if (prev && prev !== nid) setPreviewVisited((v) => (v.includes(prev) ? v : [...v, prev]));
    previewActiveRef.current = nid;
    setPreviewActive(nid);
    if (nid) rf.fitView({ nodes: [{ id: nid }], padding: 1.4, maxZoom: 1, duration: 400 });
  };
  const updateNote = (nid: string, note: string) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, note } } : n)));
    setDirty(true);
  };
  const knownVars = useMemo(() => {
    const out = new Set<string>(['name', 'contact.name', 'contact.phone', 'contact.email']);
    for (const n of nodes) {
      const d: any = n.data.data;
      if (n.data.type === 'question' && d.saveAs) out.add(d.saveAs);
      if (n.data.type === 'ai_reply' && d.saveAnswerAs) out.add(d.saveAnswerAs);
      if (n.data.type === 'set_variable')
        for (const a of d.assignments ?? []) if (a.name) out.add(a.name);
      if (n.data.type === 'http_request')
        for (const m of d.saveAs ?? []) if (m.variable) out.add(m.variable);
      if (n.data.type === 'sheet_fetch')
        for (const m of d.saveAs ?? []) if (m.variable) out.add(m.variable);
    }
    return [...out];
  }, [nodes]);
  const insertVariable = (name: string) => {
    const el = lastFocused.current;
    const token = `{{${name}}}`;
    if (!el || !el.isConnected) {
      void navigator.clipboard?.writeText(token).catch(() => {});
      setMsg(t('نُسخ المتغيّر. الصقه في أي حقل.', 'Variable copied. Paste it into any field.'));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    // Use the native setter so React's onChange fires with the inserted token.
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(
      el,
      el.value.slice(0, start) + token + el.value.slice(end),
    );
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.setSelectionRange(start + token.length, start + token.length);
  };

  const sel = nodes.find((n) => n.id === selected);
  const triggerLabel = (x: Trigger) =>
    x.type === 'keyword'
      ? `${t('كلمة', 'Keyword')}: ${x.keywords.slice(0, 3).join('، ') || '—'}`
      : x.type === 'event'
        ? x.event
        : x.type === 'first_message'
          ? t('أول رسالة في المحادثة', 'First message')
          : x.type === 'any_message'
            ? t('أي رسالة', 'Any message')
            : t('ضغط زر/قائمة', 'Button or list reply');
  const stepItems = (onPick: (type: NodeType) => void) =>
    (Object.keys(NODE_META) as NodeType[])
      .filter((type) => nodeLabel(type, language).toLowerCase().includes(nodeSearch.toLowerCase()))
      .map((type) => (
        <button
          type="button"
          role="menuitem"
          key={type}
          className="add-step-item"
          onClick={() => onPick(type)}
        >
          <span className="add-step-icon" style={{ background: NODE_META[type].color }}>
            <NodeIcon type={type} />
          </span>
          {nodeLabel(type, language)}
        </button>
      ));
  const setTriggers = (triggers: Trigger[]) => {
    setMeta((m) => ({ ...m, triggers }));
    setDirty(true);
  };

  return (
    <div className="premium-builder flex flex-col">
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
        <span className="text-xs" role="status" aria-live="polite">
          {!loaded ? t('جارٍ تحميل المسودة…', 'Loading draft…') : saveState === 'saving' ? t('جارٍ الحفظ…', 'Saving…') : saveState === 'error' ? t('فشل الحفظ — أعد المحاولة', 'Save failed — retry') : dirty ? t('تغييرات غير محفوظة', 'Unsaved changes') : t('تم الحفظ', 'Saved')}
        </span>
        <UnsavedChangesGuard dirty={dirty} save={async () => {
          await save();
          return savedContent.current === latest.current;
        }} />
        <span className="builder-save-status" role="status">
          {msg}
        </span>
        <button
          title={t('تراجع عن آخر تعديل', 'Undo last change')}
          disabled={busy || cursor.current <= 0}
          onClick={() => travel(-1)}
          className="rounded border px-2 py-1"
        >
          <NavIcon name="undo" /> <span className="tb-label">{t('تراجع', 'Undo')}</span>
        </button>
        <button
          title={t('إعادة التعديل', 'Redo change')}
          disabled={busy || cursor.current >= history.current.length - 1}
          onClick={() => travel(1)}
          className="rounded border px-2 py-1"
        >
          <NavIcon name="redo" /> <span className="tb-label">{t('إعادة', 'Redo')}</span>
        </button>
        <button
          type="button"
          aria-pressed={previewOpen}
          onClick={() => {
            setPreviewOpen(!previewOpen);
            setMobilePanel(mobilePanel === 'preview' ? 'canvas' : 'preview');
          }}
          className="rounded border px-2 py-1 builder-preview-toggle"
        >
          {t('معاينة', 'Preview')}
        </button>
        <button disabled={busy} onClick={() => save().catch(() => {})} className="rounded border px-3 py-1 tb-save">
          {t('حفظ', 'Save')}
        </button>
        <button disabled={busy} onClick={publish} className="btn btn-primary">
          {t('نشر', 'Publish')}
        </button>
        <div className="tb-more">
          <button
            type="button"
            className="tb-more-btn"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label={t('المزيد', 'More')}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            ⋯
          </button>
          {moreOpen && (
            <>
              <div className="tb-more-scrim" onClick={() => setMoreOpen(false)} />
              <div className="tb-more-menu" role="menu" onClick={() => setMoreOpen(false)}>
        <label className="text-xs flex gap-1">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
          />
          {t('حفظ تلقائي', 'Autosave')}
        </label>
        <button
          type="button"
          title={t('ترتيب الخطوات تلقائيًا', 'Auto-arrange steps')}
          onClick={autoLayout}
          className="rounded border px-2 py-1"
        >
          {t('ترتيب', 'Arrange')}
        </button>
        <button disabled={busy} onClick={loadVersions} className="rounded border px-2 py-1">
          {t('الإصدارات', 'Versions')}
        </button>
        <button onClick={check} className="rounded border px-3 py-1">
          {t('فحص', 'Validate')}
        </button>
        {meta.status === 'published' && (
          <button onClick={unpublish} className="rounded border px-3 py-1">
            {t('إيقاف النشر', 'Unpublish')}
          </button>
        )}
              </div>
            </>
          )}
        </div>
      </header>

      <nav className="bot-tabs" aria-label={t('أقسام البوت', 'Bot sections')}>
        <a className="bot-tab is-active" aria-current="page" href={`/dashboard/flows/${id}`}>
          {t('الأتمتة', 'Automation')}
        </a>
        <a className="bot-tab" href="/dashboard/crm">
          {t('العملاء', 'Contacts')}
        </a>
        <a className="bot-tab" href="/dashboard/inbox">
          {t('المحادثات', 'Live chat')}
        </a>
        <a className="bot-tab" href="/dashboard/campaigns">
          {t('البث', 'Broadcasting')}
        </a>
        <button
          type="button"
          className="bot-tab"
          onClick={() => {
            setTab('settings');
            setInspectorOpen(true);
          }}
        >
          {t('الإعدادات', 'Settings')}
        </button>
      </nav>

      <Dialog
        open={showVersions}
        onClose={() => setShowVersions(false)}
        title={t('الإصدارات المنشورة', 'Published versions')}
      >
        <div className="border-b bg-white p-3 text-sm flex flex-wrap items-center gap-3">
          <strong>{t('الإصدارات المنشورة', 'Published versions')}</strong>
          {!versions.length && (
            <span>{t('لا توجد إصدارات منشورة بعد.', 'No published versions yet.')}</span>
          )}
          {versions.map((v) => (
            <button
              className="rounded border px-2 py-1"
              key={v.id}
              disabled={busy}
              onClick={() => restoreVersion(v.id)}
            >
              {t('استعادة', 'Restore')} v{v.version} {t('إلى المسودة', 'to draft')} ·{' '}
              {new Date(v.created_at).toLocaleDateString(language === 'ar' ? 'ar' : 'en')}
            </button>
          ))}
          <button onClick={() => setShowVersions(false)}>{t('إغلاق', 'Close')} ×</button>
          <small>
            {t(
              'الاستعادة لا تغيّر الإصدار المنشور حتى تضغط نشر.',
              'Restoring changes the draft; publish to replace the live version.',
            )}
          </small>
        </div>
      </Dialog>
      {(issues.length > 0 || warnings.length > 0) && (
        <div className="max-h-24 overflow-y-auto border-b bg-red-50 px-3 py-1 text-xs">
          {issues.map((i, k) => (
            <div key={`e${k}`} className="text-red-700">
              ⛔{' '}
              {i.nodeId && (
                <button type="button" className="underline" onClick={() => focusNode(i.nodeId as string)}>
                  [{i.nodeId}]
                </button>
              )}{' '}
              {i.message}
            </div>
          ))}
          {warnings.map((i, k) => (
            <div key={`w${k}`} className="text-amber-700">
              ⚠️{' '}
              {i.nodeId && (
                <button type="button" className="underline" onClick={() => focusNode(i.nodeId as string)}>
                  [{i.nodeId}]
                </button>
              )}{' '}
              {i.message}
            </div>
          ))}
        </div>
      )}

      <div className="builder-mobile-tools">
        <button aria-pressed={mobilePanel === 'canvas'} onClick={() => setMobilePanel('canvas')}>
          {t('اللوحة', 'Canvas')}
        </button>
        <button aria-pressed={mobilePanel === 'preview'} onClick={() => setMobilePanel('preview')}>
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
          {NODE_GROUPS.map((g) => {
            const types = g.types.filter((type) =>
              nodeLabel(type, language).toLowerCase().includes(nodeSearch.toLowerCase()),
            );
            if (!types.length) return null;
            return (
              <section key={g.id} className="palette-group" aria-label={language === 'ar' ? g.ar : g.en}>
                <h3 className="palette-group-title">{language === 'ar' ? g.ar : g.en}</h3>
                {types.map((type) => (
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
              </section>
            );
          })}
          <div className="palette-tip">
            {t(
              'ابدأ برسالة ترحيب، ثم سؤال أو شرط. جرّب البوت قبل النشر.',
              'Start with a welcome message, then a question or condition. Preview before publishing.',
            )}
          </div>
        </aside>

        <div
          className={`builder-canvas min-w-0 flex-1 ${connecting ? 'is-connecting' : ''}`}
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
          <div
            className="add-step"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false);
            }}
          >
            <button
              type="button"
              className="btn btn-primary btn-lg add-step-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              + {t('إضافة خطوة', 'Add step')}
            </button>
            {menuOpen && <div className="menu-scrim" onClick={() => setMenuOpen(false)} />}
            {menuOpen && (
              <div className="add-step-menu" role="menu">
                <input
                  autoFocus
                  aria-label={t('البحث عن خطوة', 'Search steps')}
                  placeholder={t('ابحث عن خطوة…', 'Find a step…')}
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                />
                {(Object.keys(NODE_META) as NodeType[])
                  .filter((type) =>
                    nodeLabel(type, language).toLowerCase().includes(nodeSearch.toLowerCase()),
                  )
                  .map((type) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={type}
                      className="add-step-item"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/boat-node', type);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => {
                        addNode(type);
                        setMenuOpen(false);
                      }}
                    >
                      <span
                        className="add-step-icon"
                        style={{ background: NODE_META[type].color }}
                      >
                        <NodeIcon type={type} />
                      </span>
                      {nodeLabel(type, language)}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="start-card"
            onClick={() => {
              setTab('settings');
              setInspectorOpen(true);
            }}
          >
            <span className="start-card-badge">{t('البداية', 'Start')}</span>
            <strong>{t('متى يبدأ البوت؟', 'When does the bot start?')}</strong>
            <span className="start-card-list">
              {meta.triggers.length
                ? meta.triggers.slice(0, 3).map((x, i) => <span key={i}>{triggerLabel(x)}</span>)
                : t('لم يُضبط مشغّل بعد', 'No trigger yet')}
            </span>
          </button>
          {dropMenu && (
            <>
              <div className="drop-menu-scrim" onClick={() => setDropMenu(null)} />
              <div
                className="add-step-menu drop-menu"
                role="menu"
                style={{ left: dropMenu.x, top: dropMenu.y }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setDropMenu(null);
                }}
              >
                <input
                  autoFocus
                  aria-label={t('البحث عن خطوة', 'Search steps')}
                  placeholder={t('ابحث عن خطوة…', 'Find a step…')}
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                />
                {stepItems((type) => {
                  const m = dropMenu;
                  setDropMenu(null);
                  const r = (document.querySelector('.builder-canvas') as HTMLElement).getBoundingClientRect();
                  const oldEdge = m.edgeId ? edges.find((e) => e.id === m.edgeId) : undefined;
                  addNode(
                    type,
                    { x: m.x + r.left, y: m.y + r.top },
                    { source: m.source, handle: m.handle },
                    oldEdge ? { target: oldEdge.target } : undefined,
                  );
                })}
              </div>
            </>
          )}
          <div className="node-finder nodrag nopan" style={{position:'absolute',top:12,left:12,zIndex:10,maxWidth:300}}>
            <input type="search" className="rounded border p-2" aria-label={t('البحث في عقد البوت', 'Find a bot node')} placeholder={t('ابحث بالنص أو اسم الخطوة…', 'Find by text or step name…')} value={findNode} onChange={e => setFindNode(e.target.value)} />
            {findNode.trim() && <div className="card stack" style={{maxHeight:280,overflow:'auto'}}>
              {nodes.filter(n => [nodeLabel(n.data.type, language), n.data.data?.text, n.data.note, n.id].join(' ').toLocaleLowerCase().includes(findNode.trim().toLocaleLowerCase())).map((n) => <button className="btn" key={n.id} onClick={() => {focusNode(n.id);setFindNode('');}}>
                {nodeLabel(n.data.type, language)} · {String(n.data.data?.text || n.data.note || t('خطوة', 'Step') + ' ' + (nodes.indexOf(n)+1)).slice(0,70)}
              </button>)}
              {!nodes.some(n => [nodeLabel(n.data.type, language),n.data.data?.text,n.data.note,n.id].join(' ').toLocaleLowerCase().includes(findNode.trim().toLocaleLowerCase())) && <p role="status">{t('لا توجد خطوة مطابقة', 'No matching step')}</p>}
            </div>}
          </div>
          <FlowStatsContext.Provider value={nodeStats}>
          <FlowSequencesContext.Provider value={seqInfo}>
          <FlowButtonStatsContext.Provider value={buttonStats}>
          <ReactFlow
            nodes={canvasNodes}
            edges={cards.edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={(c) => {
              onEdgesChange(c);
              if (c.some((x) => x.type === 'remove')) setDirty(true);
            }}
            onConnect={onConnect}
            onConnectStart={(_, p) => {
              setConnecting(true);
              connectFrom.current =
                p.handleType === 'source' && p.nodeId
                  ? (() => {
                      const r = toReal(p.nodeId, p.handleId);
                      return { source: r.source, handle: r.handle };
                    })()
                  : null;
            }}
            onConnectEnd={(ev) => {
              setConnecting(false);
              const from = connectFrom.current;
              connectFrom.current = null;
              const target = ev.target as HTMLElement | null;
              if (!from || !target?.classList.contains('react-flow__pane')) return;
              const pt = 'changedTouches' in ev ? ev.changedTouches[0] : (ev as MouseEvent);
              const box = (document.querySelector('.builder-canvas') as HTMLElement).getBoundingClientRect();
              setNodeSearch('');
              setDropMenu({
                x: Math.max(8, Math.min(pt.clientX - box.left, box.width - 280)),
                y: Math.max(8, Math.min(pt.clientY - box.top, box.height - 300)),
                ...from,
              });
            }}
            onSelectionChange={onSelectionChange}
            onNodeClick={(_, node) => {
              // A click on a button card opens its message in the inspector.
              const hit = btnIndexRef.current[node.id];
              if (!hit) return;
              setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === hit.parentId })));
              selRef.current = hit.parentId;
              setSelected(hit.parentId);
              setTab('node');
              setInspectorOpen(true);
            }}
            edgeTypes={edgeTypes}
            isValidConnection={isValidConnection}
            onEdgeUpdate={onEdgeUpdate}
            connectionRadius={18}
            onEdgesDelete={() => notify(t('قُطع التوصيل.', 'Link removed.'), true)}
            onNodesDelete={(del: Node[]) => {
              notify(t('حُذفت الخطوة وتوصيلاتها.', 'Step and its links deleted.'), true);
              if (del.some((d) => d.id === startId))
                setStartId(nodes.find((n) => !del.some((d) => d.id === n.id))?.id ?? '');
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#64748b', strokeWidth: 2.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 },
            }}
            snapToGrid
            snapGrid={[16, 16]}
            selectionOnDrag={false}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            minZoom={0.2}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          >
            <Background color="#cdd5e2" gap={22} size={1.4} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => NODE_META[n.data?.type as NodeType]?.color ?? '#8aa6ad'}
              maskColor="#f3f5f9bb"
            />
          </ReactFlow>
          </FlowButtonStatsContext.Provider>
          </FlowSequencesContext.Provider>
          </FlowStatsContext.Provider>
          <div className="canvas-tagline" aria-hidden="true">
            <span>Drag. Connect. Automate.</span>
            <svg viewBox="0 0 160 12" preserveAspectRatio="none"><path d="M3 8 C 40 2, 90 12, 157 4" /></svg>
          </div>
          {toast && (
            <div className="designer-toast" role="status">
              <span>{toast.text}</span>
              {toast.undo && (
                <button
                  type="button"
                  onClick={() => {
                    travel(-1);
                    setToast(null);
                  }}
                >
                  {t('تراجع', 'Undo')}
                </button>
              )}
              <button type="button" aria-label={t('إغلاق', 'Close')} onClick={() => setToast(null)}>
                ✕
              </button>
            </div>
          )}
        </div>

        <aside className="builder-preview" data-open={previewOpen} aria-label={t('معاينة البوت', 'Bot preview')}>
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              <TestPanel
                flowId={id}
                onProgress={onPreviewProgress}
                beforeRun={async () => {
                  if (dirty) await save();
                }}
              />
            </div>
          </div>
        </aside>

        <div
          className="inspector-scrim"
          data-open={inspectorOpen}
          onClick={() => setInspectorOpen(false)}
        />
        <aside
          className="builder-inspector flex flex-col bg-white"
          data-open={inspectorOpen}
          aria-label={t('تفاصيل الخطوة', 'Step details')}
        >
          <header className="sheet-head">
            <span className="sheet-grip" aria-hidden="true" />
            <button
              type="button"
              className="sheet-close"
              aria-label={t('إغلاق', 'Close')}
              onClick={() => setInspectorOpen(false)}
            >
              ✕
            </button>
          </header>
          <div className="flex border-b text-sm" role="tablist">
            {(
              [
                ['node', t('العقدة', 'Inspector')],
                ['settings', t('الإعدادات', 'Settings')],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
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
                <div
                  onFocusCapture={(e) => {
                    const el = e.target as HTMLElement;
                    if (
                      (el instanceof HTMLInputElement &&
                        ['text', 'url', 'search', ''].includes(el.type)) ||
                      el instanceof HTMLTextAreaElement
                    )
                      lastFocused.current = el;
                  }}
                >
                <div className="var-picker" aria-label={t('المتغيّرات المتاحة', 'Available variables')}>
                  <span>{t('أدرج متغيّرًا', 'Insert variable')}</span>
                  {knownVars.map((v) => (
                    <button
                      type="button"
                      key={v}
                      className="var-chip"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertVariable(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
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
                <label className="note-field">
                  {t('تعليق على الخطوة (لا يظهر للعميل)', 'Step comment (never shown to customers)')}
                  <textarea
                    maxLength={500}
                    rows={2}
                    value={sel.data.note ?? ''}
                    onChange={(e) => updateNote(sel.id, e.target.value)}
                  />
                </label>
                </div>
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
                    {t('متى يبدأ السيناريو؟', 'When does the bot start?')}
                  </div>
                  {meta.triggers.map((trigger, i) => (
                    <div key={i} className="mb-2 space-y-1 rounded border p-2">
                      <div className="flex gap-1">
                        <select
                          className={inp}
                          aria-label={t('نوع المشغّل', 'Trigger type')}
                          value={trigger.type}
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
                          <option value="event">{t('حدث CRM', 'CRM event')}</option>
                          <option value="keyword">{t('كلمة مفتاحية', 'Keyword')}</option>
                          <option value="first_message">
                            {t('أول رسالة في المحادثة', 'First message in conversation')}
                          </option>
                          <option value="any_message">
                            {t('أي رسالة (احتياطي)', 'Any message (fallback)')}
                          </option>
                          <option value="reply_id">
                            {t('ضغط زر/قائمة محدد', 'Specific button or list selection')}
                          </option>
                        </select>
                        <button
                          aria-label={t('حذف المشغّل', 'Remove trigger')}
                          onClick={() => setTriggers(meta.triggers.filter((_, j) => j !== i))}
                          className="rounded border px-2 text-red-600"
                        >
                          ×
                        </button>
                      </div>
                      {trigger.type === 'event' && (
                        <select
                          className={inp}
                          aria-label={t('حدث CRM', 'CRM event')}
                          value={trigger.event}
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
                      {trigger.type === 'keyword' && (
                        <>
                          <textarea
                            className={inp}
                            rows={2}
                            aria-label={t('الكلمات المفتاحية', 'Keywords')}
                            placeholder={t(
                              'كلمات مفصولة بفاصلة: سعر، price، كام',
                              'Comma-separated keywords: price, cost',
                            )}
                            defaultValue={trigger.keywords.join('، ')}
                            onBlur={(e) =>
                              setTriggers(
                                meta.triggers.map((x, j) =>
                                  j === i
                                    ? {
                                        ...trigger,
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
                            aria-label={t('مطابقة الكلمة', 'Keyword matching')}
                            value={trigger.match}
                            onChange={(e) =>
                              setTriggers(
                                meta.triggers.map((x, j) =>
                                  j === i ? { ...trigger, match: e.target.value as any } : x,
                                ),
                              )
                            }
                          >
                            <option value="contains">
                              {t('تحتوي الرسالة على الكلمة', 'Message contains keyword')}
                            </option>
                            <option value="exact">
                              {t('الرسالة تطابق الكلمة تماماً', 'Message exactly matches keyword')}
                            </option>
                            <option value="starts_with">
                              {t('الرسالة تبدأ بالكلمة', 'Message starts with keyword')}
                            </option>
                          </select>
                        </>
                      )}
                      {trigger.type === 'reply_id' && (
                        <input
                          className={inp}
                          dir="ltr"
                          aria-label={t('معرّفات الرد', 'Reply identifiers')}
                          placeholder={t(
                            'معرّفات الأزرار مفصولة بفاصلة',
                            'Comma-separated button identifiers',
                          )}
                          defaultValue={trigger.ids.join(', ')}
                          onBlur={(e) =>
                            setTriggers(
                              meta.triggers.map((x, j) =>
                                j === i
                                  ? {
                                      ...trigger,
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
                    {t('+ مشغّل', '+ Trigger')}
                  </button>
                  <p className="mt-2 text-xs text-gray-400">
                    {t(
                      'الأكثر تحديداً يُنفَّذ أولاً: كلمة مفتاحية/زر، ثم أول رسالة، ثم أي رسالة. أول رسالة وأي رسالة يعملان مرة واحدة لكل محادثة.',
                      'Specific triggers run first: keyword or button, then first message, then any message. First and any-message triggers run once per conversation.',
                    )}
                  </p>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-600">
                    {t(
                      'القنوات (بدون اختيار = كل القنوات)',
                      'Channels (none selected = all channels)',
                    )}
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
                    {t(
                      'الأولوية (الأعلى أولاً عند التعارض)',
                      'Priority (highest first when triggers overlap)',
                    )}
                  </div>
                  <input
                    className={inp}
                    type="number"
                    aria-label={t('الأولوية', 'Priority')}
                    value={meta.priority}
                    onChange={(e) => {
                      setMeta({ ...meta, priority: Number(e.target.value) || 0 });
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
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
