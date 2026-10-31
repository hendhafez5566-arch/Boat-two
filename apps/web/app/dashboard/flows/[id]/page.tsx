'use client';
import { ConfigDisclosure, ConfigSummary } from '../../../../components/flow/ConfigDisclosure';
import { FlowStatsAvailabilityContext } from '../../../../components/flow/stats-context';
import BotPolicyEditor from '../../../../components/flow/BotPolicyEditor';
import type { BotPolicy } from '../../../../lib/flow-types';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  ConnectionLineType,
  MiniMap,
  Panel,
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
import BlockPalette from '../../../../components/flow/BlockPalette';
import ReferenceNode from '../../../../components/flow/ReferenceNode';
import { deriveFlowReference } from '../../../../lib/flow-reference';
import { channelHref, selectedChannel } from '../../../../lib/channel-context';
import styles from '../../../../components/flow/editor-shell.module.css';
import { NavIcon } from '../../../../components/product/NavIcon';
import { NodeIcon, nodeLabel, editorLabel } from '../../../../components/flow/presentation';
import FlowNodeView from '../../../../components/flow/FlowNodeView';
import {
  FlowAnalyticsContext,
  ButtonStats,
  FlowButtonStatsContext,
  FlowSequencesContext,
  FlowStatsContext,
  NodeStats,
  SeqInfo,
} from '../../../../components/flow/stats-context';
import FlowEdge, { ButtonLinkEdge } from '../../../../components/flow/FlowEdge';
import FlowButtonNode from '../../../../components/flow/FlowButtonNode';
import { validationMessage } from '../../../../lib/validation-message';
import UnsavedChangesGuard from '../../../../components/flow/UnsavedChangesGuard';
import { convertChoices } from '../../../../lib/smart-editor';
import { STEP_GUIDANCE } from '../../../../lib/step-guidance';
import ConfigurationPanel from '../../../../components/flow/ConfigurationPanel';
import Inspector from '../../../../components/flow/Inspector';
import type { ConditionVariable } from '../../../../components/business/ConditionModal';
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
  optionsOf,
  NodeType,
  RFData,
  toFlow,
  Trigger,
  uid,
} from '../../../../lib/flow-types';

import { computeLayout, hasLayoutOverlap, nodeFootprint } from '../../../../lib/flow-layout';

const inp = 'w-full rounded border p-1.5 text-sm';
const nodeTypes = {
  reference: ReferenceNode,
  flowNode: FlowNodeView,
  [BUTTON_NODE_TYPE]: FlowButtonNode,
};
const edgeTypes = { smoothstep: FlowEdge, buttonLink: ButtonLinkEdge };

type Issue = { nodeId?: string; message: string };

function Editor({ id }: { id: string }) {
  const rf = useReactFlow();
  const { t, language } = useLocale();
  const [nodeSearch, setNodeSearch] = useState('');
  const [findNode, setFindNode] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [accountContext, setAccountContext] = useState('');
  useEffect(() => setAccountContext(selectedChannel(window.location.search)), []);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [moreOpen]);
  // A preview only counts as tested after the simulator successfully processes a request.
  const [, setTestedSnapshot] = useState<string | null>(null);
  const pendingTestSnapshot = useRef('');
  const selRef = useRef<string | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const sync = () => setFocused(document.fullscreenElement === builderRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [showMap, setShowMap] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const reviewViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewActive, setPreviewActive] = useState<string | null>(null);
  const previewActiveRef = useRef<string | null>(null);
  const [previewVisited, setPreviewVisited] = useState<string[]>([]);
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
  const [choiceSelection, setChoiceSelection] = useState<{
    parentId: string;
    id: string;
    nonce: number;
  } | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState<{
    id: string;
    data: Record<string, any>;
  } | null>(null);
  const [choicePanel, setChoicePanel] = useState<string | null>(null);
  const [tab, setTab] = useState<'node' | 'settings'>('node');
  const [meta, setMeta] = useState<{
    policy?: BotPolicy;
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
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [validationState, setValidationState] = useState<
    'unchecked' | 'checking' | 'current' | 'stale'
  >('unchecked');
  const validationSnapshot = useRef('');
  const validationRequest = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const savedContent = useRef('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishOutcome, setPublishOutcome] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [nodeStats, setNodeStats] = useState<Record<string, NodeStats>>({});
  const [buttonStats, setButtonStats] = useState<Record<string, ButtonStats>>({});
  const [statsAvailable, setStatsAvailable] = useState({ nodes: false, buttons: false });
  const [btnDims, setBtnDims] = useState<Record<string, { width: number; height: number }>>({});
  const [seqInfo, setSeqInfo] = useState<Record<string, SeqInfo>>({});
  useEffect(() => {
    let alive = true;
    api<
      {
        id: string;
        name: string;
        status: string;
        delivery_time?: string | null;
        timezone?: string;
      }[]
    >('/sequences')
      .then((rows) => {
        if (!alive) return;
        setSeqInfo(
          Object.fromEntries(
            rows.map((s) => [
              s.id,
              {
                name: s.name,
                status: s.status,
                deliveryTime: s.delivery_time ?? null,
                timezone: s.timezone ?? '',
              },
            ]),
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
          .then((r) => {
            if (alive) {
              setNodeStats(r);
              setStatsAvailable((s) => ({ ...s, nodes: true }));
            }
          })
          .catch(() => {
            if (alive) setStatsAvailable((s) => ({ ...s, nodes: false }));
          }),
        api<Record<string, ButtonStats>>(`/flows/${id}/button-stats`)
          .then((r) => {
            if (alive) {
              setButtonStats(r);
              setStatsAvailable((s) => ({ ...s, buttons: true }));
            }
          })
          .catch(() => {
            if (alive) setStatsAvailable((s) => ({ ...s, buttons: false }));
          }),
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
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    (async () => {
      const f = await api<any>(`/flows/${id}`);
      const g = toFlow(f.draft_graph);
      setUpdatedAt(f.updated_at);
      setLoaded(true);
      const spots = new Set(
        g.nodes.map((n) => `${Math.round(n.position.x / 40)},${Math.round(n.position.y / 40)}`),
      );
      if (
        g.nodes.length > 1 &&
        (spots.size < g.nodes.length || hasLayoutOverlap(g.nodes, language === 'ar'))
      ) {
        const pos = computeLayout(g.nodes, g.edges, f.draft_graph.startNodeId, language === 'ar');
        g.nodes = g.nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position }));
        setDirty(true);
      }
      setNodes(g.nodes);
      setEdges(g.edges);
      setStartId(f.draft_graph.startNodeId);
      setMeta({
        policy: f.draft_graph.policy,
        name: f.name,
        priority: f.priority,
        triggers: f.triggers,
        channelIds: f.channel_ids ?? [],
        status: f.status,
        version: f.published_version,
      });
      api<{ id: string; name: string; type: string }[]>('/channels')
        .then((rows) => {
          setChannels(rows);
          setChannelsLoaded(true);
        })
        .catch(() => {
          setChannelsLoaded(false);
          setMsg(
            t(
              'تعذّر تحميل القنوات. أعد فتح الصفحة قبل النشر.',
              'Cannot load connected channels. Reload before publishing.',
            ),
          );
        });
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
  }, []);

  // The "+" on a link asks the editor to insert a step in the middle of it.
  useEffect(() => {
    const onInsert = (ev: Event) => {
      const d = (
        ev as CustomEvent<{
          id: string;
          source: string;
          handle: string | null;
          x: number;
          y: number;
        }>
      ).detail;
      const box = (
        document.querySelector('.builder-canvas') as HTMLElement | null
      )?.getBoundingClientRect();
      if (!box) return;
      setNodeSearch('');
      setDropMenu({
        x: Math.max(8, Math.min(d.x - box.left, box.width - 290)),
        y: Math.max(8, Math.min(d.y - box.top, box.height - 320)),
        ...(() => {
          const hit = btnIndexRef.current[d.source];
          return hit
            ? { source: hit.parentId, handle: `option:${hit.buttonId}` }
            : { source: d.source, handle: d.handle };
        })(),
        edgeId: d.id,
      });
    };
    window.addEventListener('flow:insert-step', onInsert);
    return () => window.removeEventListener('flow:insert-step', onInsert);
  }, []);

  const issueMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of [...issues])
      if (i.nodeId && !m[i.nodeId]) m[i.nodeId] = validationMessage(i.message, language);
    return m;
  }, [issues, language]);

  const actionsRef = useRef<{
    duplicate: (id: string) => void;
    remove: (id: string) => void;
    setStart: (id: string) => void;
    open: (id: string) => void;
    choices: (id: string, kind: 'buttons' | 'list') => void;
  }>({
    duplicate: () => {},
    remove: () => {},
    setStart: () => {},
    open: () => {},
    choices: () => {},
  });
  const nodeActions = useMemo(
    () => ({
      open: (id: string) => actionsRef.current.open(id),
      choices: (id: string, kind: 'buttons' | 'list') => actionsRef.current.choices(id, kind),
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
  const reference = useMemo(
    () => deriveFlowReference(nodes, startId, language === 'ar'),
    [nodes, startId, language],
  );
  const openSettings = () => {
    setTab('settings');
    setPreviewOpen(false);
    setInspectorOpen(true);
  };
  const canvasNodes = [
    ...display,
    ...cards.cardNodes,
    ...(reference
      ? [
          {
            id: reference.id,
            type: 'reference',
            position: reference.position,
            draggable: false,
            deletable: false,
            selectable: false,
            connectable: false,
            data: {
              summary:
                meta.triggers
                  .map((trigger) =>
                    trigger.type === 'keyword'
                      ? trigger.keywords.join(' · ')
                      : trigger.type === 'first_message'
                        ? t('عند أول رسالة', 'On the first message')
                        : trigger.type === 'any_message'
                          ? t('عند أي رسالة', 'On any message')
                          : trigger.type === 'reply_id'
                            ? t('عند رد محدد', 'On a specific reply')
                            : t('عند حدث', 'On an event'),
                  )
                  .join(' · ') || t('لم تُضبط البداية', 'No trigger configured'),
              onOpen: openSettings,
            },
          },
        ]
      : []),
  ];

  /** A button card's output is really the message's `option:<buttonId>` output. */
  const toReal = useCallback(
    (source: string | null | undefined, handle: string | null | undefined) => {
      const hit = source ? btnIndexRef.current[source] : undefined;
      return hit
        ? { source: hit.parentId, handle: `option:${hit.buttonId}` as string | null }
        : { source: source ?? '', handle: handle ?? null };
    },
    [],
  );

  const handleNodesChange = (incoming: NodeChange[]) => {
    const idx = btnIndexRef.current;
    const changes = incoming.filter((c) => !('id' in c && (idx[c.id] || c.id === reference?.id)));
    const moved = incoming.filter(
      (c): c is Extract<NodeChange, { type: 'position' }> =>
        c.type === 'position' && !!c.position && !!idx[c.id],
    );
    if (moved.length)
      setNodes((ns) =>
        ns.map((n) => {
          const mine = moved.filter((c) => idx[c.id].parentId === n.id);
          if (!mine.length) return n;
          const layout = { ...(n.data.layout ?? {}) };
          for (const c of mine)
            layout[idx[c.id].buttonId] = {
              x: c.position!.x - n.position.x,
              y: c.position!.y - n.position.y,
            };
          return { ...n, data: { ...n.data, layout } };
        }),
      );
    const sized = incoming.filter(
      (c): c is Extract<NodeChange, { type: 'dimensions' }> =>
        c.type === 'dimensions' && !!c.dimensions && !!idx[c.id],
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
    if (incoming.some((c) => 'id' in c && idx[c.id] && c.type === 'position' && !c.dragging))
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
      const previous = edges.find(
        (e) => e.source === c.source && e.sourceHandle === c.sourceHandle,
      );
      if (previous && previous.target === c.target) return;
      setEdges((es) =>
        addEdge(
          { ...c, type: 'smoothstep' },
          es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)),
        ),
      );
      if (previous)
        notify(
          t(
            'استُبدل التوصيل السابق لهذا المخرج.',
            'The previous link from this output was replaced.',
          ),
          true,
        );
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
      setEdges((es) =>
        updateEdge({ ...old, source: from.source, sourceHandle: from.handle }, c, es),
      );
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
    if (!loaded) return;
    const nid = `${type}_${uid(4)}`;
    const pos = rf.screenToFlowPosition(
      point ?? {
        x: window.innerWidth / 2 - 200,
        y: window.innerHeight / 2 - 100,
      },
    );
    const candidate: Node<RFData> = {
      id: nid,
      position: pos,
      data: { type, data: NODE_META[type].defaults(), isStart: false },
    };
    let attempts = 0;
    while (
      hasLayoutOverlap([...nodes, candidate], language === 'ar') &&
      attempts++ < nodes.length + 1
    ) {
      // Compare the new card against existing cards without changing user positions.
      const touching = nodes.some((n) => hasLayoutOverlap([n, candidate], language === 'ar'));
      if (!touching) break;
      pos.y += 280;
    }
    if (nodes.some((n) => hasLayoutOverlap([n, candidate], language === 'ar'))) {
      pos.y =
        Math.max(
          ...nodes.map((n) => n.position.y + nodeFootprint(n, language === 'ar', btnDims).bottom),
        ) + 120;
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
          {
            source: from.source,
            sourceHandle: from.handle,
            target: nid,
            targetHandle: null,
            type: 'smoothstep',
          },
          es.filter((e) => !(e.source === from.source && e.sourceHandle === from.handle)),
        ),
      );
    }
    if (after) {
      // Inserted on an existing link: new step → the old target keeps the flow intact.
      const out = handlesFor(type, NODE_META[type].defaults())[0]?.id ?? null;
      setEdges((es) =>
        addEdge(
          {
            source: nid,
            sourceHandle: out,
            target: after.target,
            targetHandle: null,
            type: 'smoothstep',
          },
          es,
        ),
      );
    }
    if (!startId || !nodes.length) setStartId(nid);
    setSelected(nid);
    selRef.current = nid;
    setInspectorDraft(null);
    setPreviewOpen(false);
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
      edges: JSON.parse(
        JSON.stringify(edges.filter((e) => keep.has(e.source) && keep.has(e.target))),
      ),
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
    clip.nodes = clip.nodes.map((n) => ({
      ...n,
      position: { x: n.position.x + 48, y: n.position.y + 48 },
    }));
    if (fresh.length === 1) setSelected(fresh[0].id);
    setDirty(true);
  };
  const duplicateNode = (nid: string) => {
    if (copySelection([nid])) pasteClipboard();
  };

  const fitAllSteps = () => {
    // Decorative reference/button nodes can still be unmeasured. React Flow's
    // fitView otherwise rejects the entire request instead of fitting real steps.
    const measured = rf.getNodes().filter((node) => !!node.width && !!node.height && !node.hidden);
    if (measured.length) rf.fitView({ nodes: measured, padding: 0.25, maxZoom: 1, duration: 300 });
  };
  const autoLayout = () => {
    if (!nodes.length) return;
    const arranged = nodes.map((n) => ({ ...n, data: { ...n.data, layout: undefined } }));
    const pos = computeLayout(arranged, edges, startId, language === 'ar', btnDims);
    setNodes(arranged.map((n) => ({ ...n, position: pos[n.id] ?? n.position })));
    setDirty(true);
    setTimeout(fitAllSteps, 50);
  };

  const focusNode = (nid: string) => {
    setInspectorDraft(null);
    setChoiceSelection(null);
    setChoicePanel(null);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nid })));
    setSelected(nid);
    selRef.current = nid;
    setPreviewOpen(false);
    setInspectorOpen(true);
    setTab('node');
    rf.fitView({ nodes: [{ id: nid }], padding: 1.2, maxZoom: 1.1, duration: 300 });
  };

  const openReview = () => {
    reviewViewport.current = rf.getViewport();
    setInspectorOpen(false);
    setPreviewOpen(true);
  };
  const closeReview = () => {
    setPreviewOpen(false);
    setInspectorOpen(false);
    if (reviewViewport.current) void rf.setViewport(reviewViewport.current);
  };

  const graph = () => ({
    ...fromFlow(nodes, edges, startId),
    ...(meta.policy ? { policy: meta.policy } : {}),
  });

  actionsRef.current = {
    choices: (nid, kind) => {
      const node = nodes.find((n) => n.id === nid);
      if (!node) return;
      const current = node.data.data.list
        ? 'list'
        : node.data.data.buttons?.length
          ? 'buttons'
          : 'none';
      if (current !== kind) {
        if (
          current !== 'none' &&
          !confirm(
            t(
              'تغيير نوع الاختيارات؟ تظل المعرّفات والوصلات محفوظة.',
              'Change reply type? IDs and links stay.',
            ),
          )
        )
          return;
        try {
          const next = convertChoices(node.data.data, kind);
          if (!optionsOf(next).length) {
            const first = { id: uid(), title: t('اختيار جديد', 'New Choice') };
            if (kind === 'buttons') next.buttons = [first];
            else next.list = { buttonText: t('القائمة', 'Menu'), sections: [{ rows: [first] }] };
          }
          updateData(nid, next);
        } catch {
          setMsg(
            t(
              'راجع عدد الاختيارات وطول العناوين قبل التحويل.',
              'Review choice count and title lengths before converting.',
            ),
          );
          return;
        }
      }
      focusNode(nid);
      setChoicePanel(nid);
    },
    open: focusNode,
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
      if (
        el &&
        (el.closest('dialog[open]') ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
          el.isContentEditable)
      )
        return;
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

  const staleChannelIds = channelsLoaded
    ? meta.channelIds.filter((channelId) => !channels.some((c) => c.id === channelId))
    : [];
  const configurationIssue = () => {
    if (meta.channelIds.length && !channelsLoaded)
      return t(
        'لا يمكن التحقق من القنوات. أعد تحميل الصفحة قبل الحفظ.',
        'Cannot verify channels. Reload before saving.',
      );
    if (staleChannelIds.length)
      return t(
        'البوت مرتبط بقناة محذوفة أو غير موجودة. اختر قناة متصلة من إعدادات البوت لتصحيح الربط قبل الحفظ.',
        'This bot refers to a missing channel. Select a connected channel in settings before saving.',
      );
    if (!meta.name.trim()) return t('أدخل اسم التدفق.', 'Enter a flow name.');
    if (!Number.isInteger(meta.priority) || meta.priority < -100 || meta.priority > 100)
      return t(
        'الأولوية يجب أن تكون عددًا صحيحًا بين -100 و100.',
        'Priority must be an integer between -100 and 100.',
      );
    for (const trigger of meta.triggers) {
      if (
        trigger.type === 'keyword' &&
        (!trigger.keywords.length ||
          trigger.keywords.some((word) => !word.trim() || word.length > 100))
      )
        return t(
          'أدخل كلمة مفتاحية واحدة على الأقل، لا تزيد عن 100 حرف، في إعداد البداية.',
          'Enter at least one keyword, up to 100 characters, in the start settings.',
        );
      if (
        trigger.type === 'reply_id' &&
        (!trigger.ids.length || trigger.ids.some((value) => !value.trim() || value.length > 200))
      )
        return t(
          'أدخل معرّف زر صحيحًا في إعداد البداية.',
          'Enter a valid reply identifier in the start settings.',
        );
    }
    return '';
  };
  const save = async () => {
    const problem = configurationIssue();
    if (problem) {
      setMsg(problem);
      setSaveState('error');
      throw new Error(problem);
    }
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
      setMsg(
        latest.current === submitted
          ? t('تم الحفظ', 'All changes saved')
          : t(
              'تم حفظ النسخة السابقة؛ توجد تعديلات أحدث غير محفوظة',
              'Previous version saved; newer changes remain unsaved',
            ),
      );
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
    if (validationSnapshot.current && validationSnapshot.current !== content) {
      validationRequest.current++;
      setIssues([]);
      setWarnings([]);
      setValidationState('stale');
      setMsg('');
    }
  }, [content]);
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
      policy: snapshot.graph.policy,
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
    const problem = configurationIssue();
    if (problem) {
      setMsg(problem);
      setValidationState('unchecked');
      return;
    }
    const submitted = latest.current,
      request = ++validationRequest.current;
    validationSnapshot.current = submitted;
    setValidationState('checking');
    try {
      const r = await api<{ errors: Issue[]; warnings: Issue[] }>('/flows/validate', {
        method: 'POST',
        body: JSON.stringify(graph()),
      });
      if (request !== validationRequest.current || latest.current !== submitted) return;
      setValidationState('current');
      setIssues(r.errors);
      setWarnings(r.warnings);
      setMsg(
        `${r.errors.length} ${t('أخطاء', 'errors')}، ${r.warnings.length} ${t('تحذيرات', 'warnings')}` +
          (!r.errors.length && r.warnings.length
            ? t(
                ' — اجتاز الفحص مع تحذيرات؛ راجع الخطوات التي تحتاج انتباهًا.',
                ' — Passed with warnings; review the affected steps.',
              )
            : ''),
      );
    } catch {
      if (request !== validationRequest.current || latest.current !== submitted) return;
      setValidationState('unchecked');
      setMsg(t('تعذر إكمال الفحص. أعد المحاولة.', 'Validation could not finish. Try again.'));
    }
  };

  const publish = async () => {
    const submitted = latest.current;
    let draftSaved = false;
    try {
      const savedAt = await save();
      draftSaved = true;
      if (submitted !== latest.current) {
        const notice = t(
          'توجد تعديلات أحدث. احفظها وأعد الفحص قبل النشر.',
          'Newer edits exist. Save and check again before publishing.',
        );
        setMsg(notice);
        setPublishOutcome({ kind: 'error', text: notice });
        return;
      }
      validationSnapshot.current = submitted;
      const r = await api<any>(`/flows/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ expectedUpdatedAt: savedAt }),
      });
      setUpdatedAt(r.updated_at);
      setMeta((m) => ({ ...m, status: 'published', version: r.version }));
      setIssues([]);
      setWarnings(latest.current === submitted ? (r.warnings ?? []) : []);
      setValidationState(latest.current === submitted ? 'current' : 'stale');
      setMsg(`${t('تم النشر', 'Published')} v${r.version}`);
      setPublishOutcome({
        kind: 'success',
        text: `${t('تم نشر نسخة البوت', 'Bot version published')} v${r.version}. ${
          r.activatedChannelCount > 0
            ? t(
                `البوت ده أصبح النشط على ${r.activatedChannelCount} قناة مرتبطة. الرسائل الجديدة هتروح له مباشرة.`,
                `This bot is now active for ${r.activatedChannelCount} linked channel(s). New messages will use it.`,
              )
            : t(
                'لم تتوفر قناة مرتبطة للتفعيل. راجع ربط القنوات.',
                'No linked channels were found; review channel bindings.',
              )
        }`,
      });
    } catch (e: any) {
      if (latest.current === submitted && e.details?.errors) {
        setValidationState('current');
        setIssues(e.details.errors);
        setWarnings(e.details.warnings ?? []);
        setMsg(t('لا يمكن النشر: صحّح الأخطاء', 'Fix validation errors before publishing'));
        setPublishOutcome({
          kind: 'error',
          text: t(
            'لم يتم النشر: في البوت أخطاء يجب إصلاحها أولًا. اضغط على اسم الخطوة للوصول إليها.',
            'Not published: fix the errors listed below first. Tap a step name to jump to it.',
          ),
        });
      } else if (!draftSaved) {
        setPublishOutcome({
          kind: 'error',
          text: `${t('تعذّر حفظ المسودة؛ لم نرسل طلب النشر. تعديلاتك ما زالت داخل المحرر. حاول الحفظ مجددًا.', 'The draft could not be saved; publishing was not requested. Your edits remain in the editor. Retry saving.')}${e?.message ? ` (${e.message})` : ''}`,
        });
      } else {
        setPublishOutcome({
          kind: 'error',
          text: `${t('لم نستطع تأكيد نتيجة طلب النشر. تم حفظ المسودة؛ راجع حالة البوت قبل إعادة المحاولة.', 'The publish result could not be confirmed. The draft was saved; check the bot status before retrying.')}${e?.message ? ` (${e.message})` : ''}`,
        });
      }
    }
  };

  const unpublish = async () => {
    try {
      const result = await api<{ updated_at: string }>(`/flows/${id}/unpublish`, {
        method: 'POST',
      });
      setUpdatedAt(result.updated_at);
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
  const sel = nodes.find((n) => n.id === selected);
  const upstream = new Set<string>();
  if (sel) {
    const pending = [sel.id];
    while (pending.length) {
      const target = pending.pop()!;
      for (const edge of edges)
        if (edge.target === target && edge.source !== sel.id && !upstream.has(edge.source)) {
          upstream.add(edge.source);
          pending.push(edge.source);
        }
    }
  }
  const conditionVariables = nodes
    .filter((n) => upstream.has(n.id))
    .flatMap<ConditionVariable>((n) => {
      const d = n.data.data;
      const label = `${nodeLabel(n.data.type, language)} — ${String(d.text || n.data.note || '').slice(0, 40)}`;
      if (d.saveReplyAs && optionsOf(d).length)
        return [
          {
            key: d.saveReplyAs,
            label: `${label}: ${t('عنوان الاختيار (يتغير عند التسمية)', 'Choice title (changes when renamed)')}`,
            values: optionsOf(d).map((o) => ({ value: o.title, label: o.title })),
          },
          {
            key: `${d.saveReplyAs}_id`,
            label: `${label}: ${t('معرّف الاختيار الثابت — موصى به', 'Stable choice ID — recommended')}`,
            values: optionsOf(d).map((o) => ({ value: o.id, label: o.title })),
          },
        ];
      const keys = [
        typeof d.saveAs === 'string' ? d.saveAs : '',
        d.saveAnswerAs,
        ...(d.assignments ?? []).map((a: any) => a.name),
        ...(d.questions ?? []).map((q: any) => q.saveAs),
      ].filter(Boolean);
      return keys.map((key: string) => ({ key, label: `${label}: ${key}` }));
    })
    .filter((v, i, all) => all.findIndex((x) => x.key === v.key) === i);
  const stepCaption = (nid: string) => {
    const index = nodes.findIndex((n) => n.id === nid),
      node = nodes[index];
    if (!node) return t('خطوة غير موجودة', 'Missing step');
    const excerpt = String(node.data.data?.text || node.data.note || '').slice(0, 55);
    return `${nodeLabel(node.data.type, language)} ${index + 1}${excerpt ? ` — ${excerpt}` : ''}`;
  };
  const stepItems = (onPick: (type: NodeType) => void) =>
    NODE_GROUPS.map((group) => {
      const types = group.types.filter((type) =>
        nodeLabel(type, language).toLowerCase().includes(nodeSearch.toLowerCase()),
      );
      return types.length ? (
        <section key={group.id} role="group" aria-label={t(group.ar, group.en)}>
          <h3 className="px-3 py-2 text-xs font-semibold">{t(group.ar, group.en)}</h3>
          {types.map((type) => (
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
              onClick={() => onPick(type)}
            >
              <span className="add-step-icon" style={{ background: NODE_META[type].color }}>
                <NodeIcon type={type} />
              </span>
              <span>
                {nodeLabel(type, language)}
                <small className="smart-step-hint">{t(...STEP_GUIDANCE[type])}</small>
              </span>
            </button>
          ))}
        </section>
      ) : null;
    });
  const setTriggers = (triggers: Trigger[]) => {
    setMeta((m) => ({ ...m, triggers }));
    setDirty(true);
  };

  return (
    <div
      ref={builderRef}
      data-focus={focused}
      className={`premium-builder ${styles.editor}`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <header className={styles.toolbar} aria-label={t('أدوات مصمم البوت', 'Flow editor toolbar')}>
        <a
          className={styles.toolButton}
          href={channelHref('/dashboard/flows', accountContext)}
          title={t('رجوع لمدير البوت', 'Back to Bot Manager')}
          aria-label={t('رجوع لمدير البوت', 'Back to Bot Manager')}
        >
          <NavIcon name="undo" />
        </a>
        <input
          className={styles.title}
          disabled={!loaded}
          aria-label={t('اسم التدفق', 'Flow name')}
          value={meta.name}
          onChange={(event) => {
            setMeta({ ...meta, name: event.target.value });
            setDirty(true);
          }}
        />
        {staleChannelIds.length > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={openSettings}
            title={t(
              'إصلاح القناة قبل الحفظ أو النشر',
              'Fix missing channel before saving or publishing',
            )}
          >
            {t('القناة القديمة غير موجودة — تصحيح الربط', 'Missing channel — fix link')}
          </button>
        )}
        {meta.channelIds.length === 1 && (
          <span className={styles.channelBadge}>
            {channels.find((channel) => channel.id === meta.channelIds[0])?.name ??
              t('حساب مرتبط', 'Linked account')}
          </span>
        )}
        <span
          className={styles.saveState}
          data-state={saveState === 'error' ? 'error' : dirty ? 'dirty' : 'saved'}
          role="status"
          aria-live="polite"
        >
          {!loaded
            ? t('جارٍ التحميل…', 'Loading…')
            : saveState === 'saving'
              ? t('جارٍ الحفظ…', 'Saving…')
              : saveState === 'error'
                ? t('فشل الحفظ', 'Save failed')
                : dirty
                  ? t('غير محفوظ', 'Unsaved')
                  : t('محفوظ', 'Saved')}
        </span>
        <button
          type="button"
          className={styles.toolButton}
          onClick={autoLayout}
          title={t('ترتيب العقد', 'Rearrange')}
          aria-label={t('ترتيب العقد', 'Rearrange')}
        >
          <NavIcon name="flows" />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-pressed={previewOpen}
          onClick={() => {
            if (previewOpen) closeReview();
            else openReview();
          }}
          title={t('تجربة البوت', 'Preview')}
          aria-label={t('تجربة البوت', 'Preview')}
        >
          <NavIcon name="play" />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={openSettings}
          title={t('إعداد البداية والقنوات', 'Reference and channels')}
          aria-label={t('إعداد البداية والقنوات', 'Reference and channels')}
        >
          <NavIcon name="settings" />
        </button>
        <button
          type="button"
          className={styles.saveButton}
          disabled={!loaded || busy}
          onClick={() => save().catch(() => {})}
        >
          {t('حفظ', 'Save')}
        </button>
        <button
          type="button"
          className={styles.publishButton}
          disabled={!loaded || busy}
          onClick={() => {
            setPublishOutcome(null);
            setConfirmPublish(true);
          }}
        >
          {meta.status === 'published'
            ? t('نشر التحديث', 'Publish update')
            : t('نشر البوت', 'Publish bot')}
        </button>
        <div className={styles.more}>
          <button
            type="button"
            className={styles.toolButton}
            aria-label={t('المزيد من الأدوات', 'More tools')}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <NavIcon name="more" />
          </button>
          {moreOpen && (
            <>
              <button
                type="button"
                className={styles.menuScrim}
                aria-label={t('إغلاق قائمة الأدوات', 'Close tools menu')}
                onClick={() => setMoreOpen(false)}
              />
              <div className={styles.toolsMenu} onClick={() => setMoreOpen(false)}>
                <button
                  type="button"
                  disabled={busy || cursor.current <= 0}
                  onClick={() => travel(-1)}
                >
                  {t('تراجع', 'Undo')} <kbd>Ctrl Z</kbd>
                </button>
                <button
                  type="button"
                  disabled={busy || cursor.current >= history.current.length - 1}
                  onClick={() => travel(1)}
                >
                  {t('إعادة', 'Redo')} <kbd>Ctrl Y</kbd>
                </button>
                <button type="button" onClick={() => setFindOpen(!findOpen)}>
                  {t('البحث في العقد', 'Find a step')}
                </button>
                <button type="button" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>
                  {t('الخريطة المصغرة', 'Minimap')}
                </button>
                <button
                  type="button"
                  aria-pressed={analytics}
                  onClick={() => setAnalytics(!analytics)}
                >
                  {analytics
                    ? t('العودة للبناء', 'Back to building')
                    : t('عرض الأداء', 'Show analytics')}
                </button>
                <button type="button" onClick={check}>
                  {t('فحص التدفق', 'Validate flow')}
                </button>
                <button type="button" disabled={busy} onClick={loadVersions}>
                  {t('الإصدارات المنشورة', 'Published versions')}
                </button>
                <label onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(event) => setAutoSave(event.target.checked)}
                  />
                  {t('حفظ تلقائي للمسودة', 'Autosave draft')}
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (document.fullscreenElement) await document.exitFullscreen();
                      else await builderRef.current?.requestFullscreen();
                    } catch {
                      setMsg(t('تعذّر فتح وضع التركيز.', 'Focus mode is unavailable.'));
                    }
                  }}
                >
                  {focused ? t('إنهاء التركيز', 'Exit focus') : t('ملء الشاشة', 'Full screen')}
                </button>
                {meta.status === 'published' && (
                  <button type="button" disabled={busy} onClick={unpublish}>
                    {t('إيقاف النشر', 'Unpublish')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>
      <UnsavedChangesGuard
        dirty={dirty}
        save={async () => {
          await save();
          return savedContent.current === latest.current;
        }}
      />
      {msg && (
        <p className={styles.feedback} role="status">
          {msg}
          <button type="button" aria-label={t('إغلاق', 'Close')} onClick={() => setMsg('')}>
            ×
          </button>
        </p>
      )}

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
      <Dialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={t('نشر البوت', 'Publish bot')}
      >
        <div className="publish-confirm" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <ol className="publish-steps">
            <li>
              <b>{t('١. حفظ المسودة', '1. Save draft')}</b>
              <span>
                {t(
                  'يحفظ تعديلاتك فقط، ولا يراه العملاء.',
                  'Stores your edits only; customers do not see it.',
                )}
              </span>
            </li>
            <li>
              <b>{t('٢. تجربة البوت', '2. Try the bot')}</b>
              <span>
                {t(
                  'جرّبه في المعاينة قبل النشر — لا يرسل رسائل حقيقية.',
                  'Test it in Preview first — no real messages are sent.',
                )}
              </span>
            </li>
            <li>
              <b>{t('٣. النشر', '3. Publish')}</b>
              <span>
                {t(
                  'يجعل هذه النسخة هي النسخة الحية للعملاء.',
                  'Makes this version the live one for customers.',
                )}
              </span>
            </li>
          </ol>
          <p className="publish-note" data-tone={issues.length ? 'bad' : dirty ? 'warn' : 'ok'}>
            {issues.length
              ? `${t('يوجد', 'There are')} ${issues.length} ${t('خطأ في الفحص السابق. سيتم فحص البوت مجددًا ولن يُنشر إلا إذا زالت الأخطاء.', 'error(s) from the last check. The bot is re-checked and only publishes if they are fixed.')}`
              : dirty
                ? t(
                    'توجد تغييرات غير محفوظة — سيتم حفظها تلقائيًا ثم فحص البوت قبل النشر.',
                    'You have unsaved changes — they will be saved and the bot checked before publishing.',
                  )
                : t('سيتم فحص البوت قبل النشر.', 'The bot will be checked before publishing.')}
            {meta.status === 'published' &&
              ` ${t('النسخة المنشورة الحالية', 'Current live version')}: v${meta.version}.`}
          </p>
          <div className="publish-actions">
            <button
              type="button"
              className="rounded border px-3 py-1"
              onClick={() => setConfirmPublish(false)}
            >
              {t('رجوع', 'Cancel')}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1"
              onClick={() => {
                setConfirmPublish(false);
                openReview();
              }}
            >
              {t('جرّب أولًا', 'Try first')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setConfirmPublish(false);
                await publish();
              }}
            >
              {t('تأكيد النشر', 'Confirm publish')}
            </button>
          </div>
        </div>
      </Dialog>
      {publishOutcome && (
        <div
          className="publish-outcome"
          data-kind={publishOutcome.kind}
          role={publishOutcome.kind === 'error' ? 'alert' : 'status'}
        >
          <span>
            {publishOutcome.kind === 'success' ? '✓' : '!'} {publishOutcome.text}
          </span>
          <button
            type="button"
            aria-label={t('إغلاق', 'Close')}
            onClick={() => setPublishOutcome(null)}
          >
            ×
          </button>
        </div>
      )}
      {(issues.length > 0 || warnings.length > 0) && (
        <section className="check-panel" aria-label={t('نتيجة فحص البوت', 'Bot check result')}>
          <header>
            <strong>
              {issues.length
                ? `${t('يلزم إصلاح', 'Fix')} ${issues.length} ${t('مشكلة قبل النشر', 'issue(s) before publishing')}`
                : validationState === 'current'
                  ? t(
                      'اجتاز الفحص؛ راجع التنبيهات قبل النشر',
                      'Validation passed; review warnings before publishing',
                    )
                  : t(
                      'نتائج الفحص السابقة — أعد الفحص للتأكد',
                      'Previous validation results — recheck to confirm',
                    )}
            </strong>
            {warnings.length > 0 && (
              <span>
                {warnings.length}{' '}
                {t('تنبيه (لا يمنع النشر)', 'warning(s) (do not block publishing)')}
              </span>
            )}
            {validationState === 'stale' && (
              <span>{t('تغيّرت المسودة بعد الفحص', 'Draft changed since the check')}</span>
            )}
          </header>
          <ul>
            {issues.map((i, k) => (
              <li key={`e${k}`} data-kind="error">
                <span>{validationMessage(i.message, language)}</span>
                {i.nodeId && (
                  <button type="button" onClick={() => focusNode(i.nodeId as string)}>
                    {t('اذهب إلى', 'Go to')}: {stepCaption(i.nodeId)}
                  </button>
                )}
              </li>
            ))}
            {warnings.map((i, k) => (
              <li key={`w${k}`} data-kind="warning">
                <span>{validationMessage(i.message, language)}</span>
                {i.nodeId && (
                  <button type="button" onClick={() => focusNode(i.nodeId as string)}>
                    {t('اذهب إلى', 'Go to')}: {stepCaption(i.nodeId)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.surface}>
        <BlockPalette disabled={!loaded} onAdd={(type) => addNode(type)} />

        <div
          className={`builder-canvas ${styles.canvas} ${connecting ? 'is-connecting' : ''}`}
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
                  const r = (
                    document.querySelector('.builder-canvas') as HTMLElement
                  ).getBoundingClientRect();
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
          {findOpen && (
            <div className={styles.finder}>
              <button
                type="button"
                onClick={() => {
                  setFindOpen(false);
                  setFindNode('');
                }}
                aria-label={t('إغلاق البحث', 'Close search')}
              >
                ×
              </button>
              <input
                type="search"
                className="rounded border p-2"
                aria-label={t('البحث في عقد البوت', 'Find a bot node')}
                placeholder={t('ابحث بالنص أو اسم الخطوة…', 'Find by text or step name…')}
                value={findNode}
                onChange={(e) => setFindNode(e.target.value)}
              />
              {findNode.trim() && (
                <div className="card stack" style={{ maxHeight: 280, overflow: 'auto' }}>
                  {nodes
                    .filter((n) =>
                      [nodeLabel(n.data.type, language), n.data.data?.text, n.data.note, n.id]
                        .join(' ')
                        .toLocaleLowerCase()
                        .includes(findNode.trim().toLocaleLowerCase()),
                    )
                    .map((n) => (
                      <button
                        className="btn"
                        key={n.id}
                        onClick={() => {
                          focusNode(n.id);
                          setFindNode('');
                        }}
                      >
                        {nodeLabel(n.data.type, language)} ·{' '}
                        {String(
                          n.data.data?.text ||
                            n.data.note ||
                            t('خطوة', 'Step') + ' ' + (nodes.indexOf(n) + 1),
                        ).slice(0, 70)}
                      </button>
                    ))}
                  {!nodes.some((n) =>
                    [nodeLabel(n.data.type, language), n.data.data?.text, n.data.note, n.id]
                      .join(' ')
                      .toLocaleLowerCase()
                      .includes(findNode.trim().toLocaleLowerCase()),
                  ) && <p role="status">{t('لا توجد خطوة مطابقة', 'No matching step')}</p>}
                </div>
              )}
            </div>
          )}
          <FlowAnalyticsContext.Provider value={analytics}>
            <FlowStatsAvailabilityContext.Provider value={statsAvailable}>
              <FlowStatsContext.Provider value={nodeStats}>
                <FlowSequencesContext.Provider value={seqInfo}>
                  <FlowButtonStatsContext.Provider value={buttonStats}>
                    <ReactFlow
                      nodes={canvasNodes}
                      edges={[...cards.edges, ...(reference ? [reference.edge] : [])]}
                      nodeTypes={nodeTypes}
                      onNodesChange={handleNodesChange}
                      onEdgesChange={(c) => {
                        onEdgesChange(
                          c.filter(
                            (change) => !('id' in change && change.id === reference?.edge.id),
                          ),
                        );
                        if (c.some((x) => x.type === 'remove')) setDirty(true);
                      }}
                      onMove={(_, viewport) => setZoomPercent(Math.round(viewport.zoom * 100))}
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
                        const pt =
                          'changedTouches' in ev ? ev.changedTouches[0] : (ev as MouseEvent);
                        const box = (
                          document.querySelector('.builder-canvas') as HTMLElement
                        ).getBoundingClientRect();
                        setNodeSearch('');
                        setDropMenu({
                          x: Math.max(8, Math.min(pt.clientX - box.left, box.width - 280)),
                          y: Math.max(8, Math.min(pt.clientY - box.top, box.height - 300)),
                          ...from,
                        });
                      }}
                      onSelectionChange={onSelectionChange}
                      onNodeClick={(_, node) => {
                        if (node.id === reference?.id) return;
                        const hit = btnIndexRef.current[node.id];
                        const nodeId = hit?.parentId ?? node.id;
                        setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })));
                        selRef.current = nodeId;
                        setSelected(nodeId);
                        if (!hit) {
                          setChoiceSelection(null);
                          setChoicePanel(null);
                        }
                        if (hit) {
                          setInspectorDraft(null);
                          setChoiceSelection({
                            parentId: hit.parentId,
                            id: hit.buttonId,
                            nonce: Date.now(),
                          });
                          setTab('node');
                          setPreviewOpen(false);
                          setInspectorOpen(true);
                        }
                      }}
                      onNodeDoubleClick={(_, node) => {
                        if (node.id === reference?.id) {
                          openSettings();
                          return;
                        }
                        focusNode(btnIndexRef.current[node.id]?.parentId ?? node.id);
                      }}
                      edgeTypes={edgeTypes}
                      isValidConnection={isValidConnection}
                      onEdgeUpdate={onEdgeUpdate}
                      connectionRadius={24}
                      zoomOnDoubleClick={false}
                      connectionLineType={ConnectionLineType.SmoothStep}
                      connectionLineStyle={{
                        stroke: 'var(--primary)',
                        strokeWidth: 3,
                        strokeDasharray: '6 4',
                      }}
                      elevateEdgesOnSelect
                      onEdgesDelete={() => notify(t('قُطع التوصيل.', 'Link removed.'), true)}
                      onNodesDelete={(del: Node[]) => {
                        notify(t('حُذفت الخطوة وتوصيلاتها.', 'Step and its links deleted.'), true);
                        if (del.some((d) => d.id === startId))
                          setStartId(nodes.find((n) => !del.some((d) => d.id === n.id))?.id ?? '');
                      }}
                      deleteKeyCode={
                        inspectorOpen || previewOpen || confirmPublish || showVersions
                          ? null
                          : ['Backspace', 'Delete']
                      }
                      defaultEdgeOptions={{
                        type: 'smoothstep',
                        style: { stroke: '#64748b', strokeWidth: 2.5 },
                        markerEnd: {
                          type: MarkerType.ArrowClosed,
                          color: '#64748b',
                          width: 18,
                          height: 18,
                        },
                      }}
                      snapToGrid
                      snapGrid={[16, 16]}
                      selectionOnDrag={false}
                      multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
                      minZoom={0.05}
                      maxZoom={2}
                      fitView
                      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
                    >
                      <Panel position="bottom-center">
                        <div
                          className="canvas-zoombar"
                          role="group"
                          aria-label={t('التحكم في العرض', 'View controls')}
                        >
                          <button
                            type="button"
                            onClick={() => rf.zoomOut({ duration: 200 })}
                            aria-label={t('تصغير', 'Zoom out')}
                          >
                            −
                          </button>
                          <span dir="ltr" aria-live="off">
                            {zoomPercent}%
                          </span>
                          <button
                            type="button"
                            onClick={() => rf.zoomIn({ duration: 200 })}
                            aria-label={t('تكبير', 'Zoom in')}
                          >
                            +
                          </button>
                          <button type="button" className="canvas-fit" onClick={fitAllSteps}>
                            {t('إظهار كل الخطوات', 'Fit all steps')}
                          </button>
                          <small className="canvas-hint">
                            {t(
                              'اسحب الخلفية للتحريك • العجلة للتكبير',
                              'Drag to pan • scroll to zoom',
                            )}
                          </small>
                        </div>
                      </Panel>
                      <Background color="#cdd5e2" gap={22} size={1.4} />
                      {showMap && !previewOpen && (
                        <MiniMap
                          pannable
                          zoomable
                          nodeColor={(n) => NODE_META[n.data?.type as NodeType]?.color ?? '#8aa6ad'}
                          maskColor="#f3f5f9bb"
                          nodeStrokeWidth={3}
                          ariaLabel={t('خريطة مصغرة للبوت', 'Bot minimap')}
                          style={{ width: 160, height: 110, borderRadius: 12 }}
                        />
                      )}
                    </ReactFlow>
                  </FlowButtonStatsContext.Provider>
                </FlowSequencesContext.Provider>
              </FlowStatsContext.Provider>
            </FlowStatsAvailabilityContext.Provider>
          </FlowAnalyticsContext.Provider>
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

        <Dialog
          open={previewOpen}
          onClose={closeReview}
          className={styles.previewDialog}
          title={t('تجربة البوت', 'Preview bot')}
        >
          <p className="smart-review-label">
            {t('محاكاة المنطق — بدون إرسال واتساب', 'Logic simulator — no WhatsApp delivery')}
          </p>
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              <TestPanel
                flowId={id}
                onProgress={onPreviewProgress}
                beforeRun={async () => {
                  if (dirty) await save();
                  pendingTestSnapshot.current = latest.current;
                }}
                onTestSuccess={() => setTestedSnapshot(pendingTestSnapshot.current)}
              />
            </div>
          </div>
        </Dialog>

        <ConfigurationPanel
          open={inspectorOpen && !previewOpen && (tab === 'settings' || !!sel)}
          onClose={() => {
            setInspectorDraft(null);
            setInspectorOpen(false);
          }}
          description={
            choiceSelection?.parentId === sel?.id
              ? t(
                  'إعداد عنوان الاختيار وإجراء الضغط والأتمتة الاختيارية.',
                  'Set the reply label, action type and optional automation when pressed.',
                )
              : choicePanel === sel?.id
                ? t(
                    'إعداد الاختيارات التي تظهر للمشترك.',
                    'Configure the replies shown to subscribers.',
                  )
                : sel &&
                    (sel.data.type === 'interactive' ||
                      (sel.data.type === 'message' && optionsOf(sel.data.data).length))
                  ? t(
                      'إعداد عنوان الرسالة التفاعلية ومحتواها وتذييلها.',
                      'Configure your interactive message header, body and footer.',
                    )
                  : sel?.data.type === 'message'
                    ? t('اكتب رسالة الرد وأدرج المتغيرات.', 'Compose your reply with variables.')
                    : t(
                        'إعداد هذه الخطوة في تدفق المحادثة.',
                        'Configure this step in the conversation flow.',
                      )
          }
          title={
            sel && tab === 'node'
              ? choiceSelection?.parentId === sel.id
                ? t('إعداد الاختيار', 'Configure Reply')
                : choicePanel === sel.id
                  ? sel.data.data.list
                    ? t('إعداد القائمة', 'Configure List Message')
                    : t('إعداد الأزرار', 'Configure Buttons')
                  : `${t('إعداد', 'Configure')} ${nodeLabel(sel.data.type === 'message' && optionsOf(sel.data.data).length ? 'interactive' : sel.data.type, language)}`
              : t('إعداد بداية التدفق', 'Configure Reference')
          }
        >
          <div key={tab === 'node' ? selected : 'settings'} className={styles.configurationBody}>
            {tab === 'node' &&
              (sel ? (
                <div>
                  <Inspector
                    onChoiceSelect={(id) =>
                      setChoiceSelection(id ? { parentId: sel.id, id, nonce: Date.now() } : null)
                    }
                    choiceView={choicePanel === sel.id}
                    channelIds={meta.channelIds}
                    key={
                      sel.id +
                      (choicePanel === sel.id ? ':choices' : '') +
                      (choiceSelection?.parentId === sel.id ? ':' + choiceSelection.nonce : '')
                    }
                    initialChoiceId={
                      choiceSelection?.parentId === sel.id ? choiceSelection.id : undefined
                    }
                    actionSummary={(handle) => {
                      const edge = edges.find(
                        (e) => e.source === sel.id && e.sourceHandle === handle,
                      );
                      return edge
                        ? `${t('بعد الضغط:', 'Then:')} ${stepCaption(edge.target)}`
                        : t('لا يوجد إجراء بعد', 'No action yet');
                    }}
                    variables={conditionVariables}
                    type={sel.data.type}
                    data={inspectorDraft?.id === sel.id ? inspectorDraft.data : sel.data.data}
                    onChange={(data) => setInspectorDraft({ id: sel.id, data })}
                  />
                  <ConfigDisclosure className="smart-section">
                    <ConfigSummary>{t('الخطوات التالية', 'Next steps')}</ConfigSummary>
                    <p className="muted">
                      {t(
                        'اختر وجهة كل مسار بدل سحب التوصيلات. تغيير الوجهة يحدّث المسودة.',
                        'Choose each path destination without dragging. Changing a destination updates the draft.',
                      )}
                    </p>
                    {handlesFor(sel.data.type, sel.data.data).map((handle) => (
                      <label className="field" key={handle.id}>
                        {editorLabel(handle.label, language)}
                        <select
                          aria-label={`${t('الخطوة التالية', 'Next step')} — ${editorLabel(handle.label, language)}`}
                          value={
                            edges.find(
                              (edge) => edge.source === sel.id && edge.sourceHandle === handle.id,
                            )?.target ?? ''
                          }
                          onChange={(event) => {
                            if (event.target.value)
                              onConnect({
                                source: sel.id,
                                sourceHandle: handle.id,
                                target: event.target.value,
                                targetHandle: null,
                              });
                            else {
                              setEdges((links) =>
                                links.filter(
                                  (edge) =>
                                    edge.source !== sel.id || edge.sourceHandle !== handle.id,
                                ),
                              );
                              setDirty(true);
                            }
                          }}
                        >
                          <option value="">{t('بدون توصيل', 'Not connected')}</option>
                          {nodes
                            .filter((node) => node.id !== sel.id)
                            .map((node) => (
                              <option key={node.id} value={node.id}>
                                {stepCaption(node.id)}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </ConfigDisclosure>
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
                <ConfigDisclosure className="smart-section">
                  <ConfigSummary>
                    {t('السياسات العامة وساعات العمل', 'General policies and business hours')}
                  </ConfigSummary>
                  <BotPolicyEditor
                    value={meta.policy}
                    onChange={(policy) => {
                      setMeta((m) => ({ ...m, policy }));
                      setDirty(true);
                    }}
                  />
                </ConfigDisclosure>
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
                            onChange={(e) =>
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
                          onChange={(e) =>
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
                  {staleChannelIds.length > 0 && (
                    <div role="alert" className="notice error mb-3">
                      <p>
                        {t(
                          'هذه النسخة مرتبطة بقناة لم تعد موجودة. تصميم البوت محفوظ؛ اختر القناة الصحيحة أدناه لتصحيح الربط قبل النشر.',
                          'This flow references a removed channel. Its design is intact; choose the correct connected channel below before publishing.',
                        )}
                      </p>
                      {channels.length > 0 ? (
                        channels.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="btn mt-2 mr-2"
                            onClick={() => {
                              setMeta((m) => ({
                                ...m,
                                channelIds: Array.from(
                                  new Set([
                                    ...m.channelIds.filter((value) =>
                                      channels.some((available) => available.id === value),
                                    ),
                                    c.id,
                                  ]),
                                ),
                              }));
                              setDirty(true);
                              setMsg(
                                t(
                                  'تم تحديث القناة؛ احفظ البوت وانشره.',
                                  'Channel fixed. Save and publish the flow.',
                                ),
                              );
                            }}
                          >
                            {t('ربط البوت بقناة', 'Link bot to')} {c.name} ({c.type})
                          </button>
                        ))
                      ) : (
                        <p>
                          {t(
                            'لا توجد أي قناة متصلة. اربط قناة أولًا ثم أعد فتح المحرر.',
                            'No connected channels found. Add a channel first and reopen the editor.',
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {channels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        checked={meta.channelIds.includes(c.id)}
                        onChange={(e) => {
                          setMeta({
                            ...meta,
                            // Choosing a visible channel also clears orphan references.
                            // Never silently clear all references: [] means all channels.
                            channelIds: e.target.checked
                              ? Array.from(
                                  new Set([
                                    ...meta.channelIds.filter((value) =>
                                      channels.some((row) => row.id === value),
                                    ),
                                    c.id,
                                  ]),
                                )
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
                    min={-100}
                    max={100}
                    step={1}
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
          <footer className="smart-editor-footer">
            <button
              type="button"
              onClick={() => {
                setInspectorDraft(null);
                setInspectorOpen(false);
              }}
            >
              <span aria-hidden="true">×</span> {t('إغلاق', 'Close')}
            </button>
            <button
              type="button"
              className="smart-primary"
              onClick={async () => {
                try {
                  if (tab === 'node' && sel) {
                    if (inspectorDraft?.id === sel.id) updateData(sel.id, inspectorDraft.data);
                    setInspectorDraft(null);
                  } else if (dirty) await save();
                  setInspectorOpen(false);
                } catch {
                  /* save reports error and keeps editor open */
                }
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2 1h10l2 2v12H2zM4 1v5h7V1M5 10h6v5H5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              {t('حفظ التغييرات', 'Save Changes')}
            </button>
          </footer>
        </ConfigurationPanel>
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
