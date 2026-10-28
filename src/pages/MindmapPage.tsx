import {
  ArrowLeft,
  CirclePlus,
  GitBranch,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { toast } from 'sonner';
import {
  loadCollabDirectoryCache,
  loadMindmapSnapshot,
  saveCollabDirectoryCache,
  saveMindmapSnapshot,
} from '@/lib/collab-document-cache';
import {
  createCollabMindmap,
  fetchCollabDocuments,
  mindmapSocketUrl,
  renameCollabMindmap,
  requestMindmapSocketTicket,
  type CollabDocument,
  type CollabPermission,
} from '@/lib/chat-client';
import { getWebSocketReconnectDelay, startWebSocketHeartbeat } from '@/lib/websocket-health';
import './MindmapPage.css';

interface MindmapPageProps {
  username: string;
  initialDocumentId?: string;
  initialDocument?: CollabDocument;
  embedded?: boolean;
}

interface MindmapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

interface MindmapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

type MapConnection = 'connecting' | 'connected' | 'offline';
interface MindmapContextMenu {
  x: number;
  y: number;
  nodeId?: string;
  edgeId?: string;
}

const NODE_W = 224;
const NODE_H = 94;
const NODE_COLORS = [
  { id: 'slate', label: 'Slate', swatch: '#8b949e' },
  { id: 'blue', label: 'Blue', swatch: '#58a6ff' },
  { id: 'mint', label: 'Mint', swatch: '#3fb950' },
  { id: 'amber', label: 'Amber', swatch: '#d29922' },
  { id: 'rose', label: 'Rose', swatch: '#f778ba' },
  { id: 'violet', label: 'Violet', swatch: '#bc8cff' },
];

function mapPath(from: MindmapNode, to: MindmapNode): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const bend = Math.max(58, Math.abs(x2 - x1) * 0.42);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export default function MindmapPage({
  username,
  initialDocumentId,
  initialDocument,
  embedded = false,
}: MindmapPageProps) {
  const [maps, setMaps] = useState<CollabDocument[]>(() => {
    const cached = loadCollabDirectoryCache<CollabDocument>(username, 'mindmap');
    return initialDocument
      ? [initialDocument, ...cached.filter((map) => map.id !== initialDocument.id)]
      : cached;
  });
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [activeMap, setActiveMap] = useState<CollabDocument | null>(initialDocument ?? null);
  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const [edges, setEdges] = useState<MindmapEdge[]>([]);
  const [permission, setPermission] = useState<CollabPermission>('view');
  const [connection, setConnection] = useState<MapConnection>('connecting');
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeDraft, setNodeDraft] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [contextMenu, setContextMenu] = useState<MindmapContextMenu | null>(null);
  const [cacheReadyMapId, setCacheReadyMapId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const initialDocumentRef = useRef(initialDocumentId);
  const directoryOwnerRef = useRef(username);

  const refreshMaps = useCallback(async () => {
    try {
      setMaps((await fetchCollabDocuments()).filter((document) => document.type === 'mindmap'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load mind maps.');
    } finally {
      setLoadingMaps(false);
    }
  }, []);

  useEffect(() => { void refreshMaps(); }, [refreshMaps]);

  useEffect(() => {
    if (directoryOwnerRef.current !== username) {
      directoryOwnerRef.current = username;
      const cached = loadCollabDirectoryCache<CollabDocument>(username, 'mindmap');
      setMaps(initialDocument
        ? [initialDocument, ...cached.filter((map) => map.id !== initialDocument.id)]
        : cached);
      if (!initialDocument) {
        setActiveMap(null);
        setNodes([]);
        setEdges([]);
        setSnapshotReady(false);
        setCacheReadyMapId(null);
      }
      return;
    }
    saveCollabDirectoryCache(username, 'mindmap', maps);
  }, [initialDocument, maps, username]);

  useEffect(() => {
    if (!initialDocumentRef.current || activeMap) return;
    const match = maps.find((map) => map.id === initialDocumentRef.current);
    if (match) setActiveMap(match);
  }, [activeMap, maps]);

  useEffect(() => {
    if (!activeMap) return;
    let stopped = false;
    let currentSocket: WebSocket | null = null;
    let permissionConfirmed = false;
    let serverSnapshotReceived = false;
    let pendingCache: Awaited<ReturnType<typeof loadMindmapSnapshot>> = null;
    let reconnectTimer = 0;
    let socketConnectTimer = 0;
    let stableConnectionTimer = 0;
    let reconnectAttempt = 0;
    let heartbeat: ReturnType<typeof startWebSocketHeartbeat> | null = null;
    let ticketController: AbortController | null = null;
    setConnection('connecting');
    setPermission('view');
    setSnapshotReady(false);
    setCacheReadyMapId(null);
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    const applyCachedSnapshot = (cached: NonNullable<typeof pendingCache>) => {
      if (stopped || serverSnapshotReceived || !cached) return;
      setNodes(cached.nodes);
      setEdges(cached.edges.map((edge) => ({ ...edge, label: edge.label ?? '' })));
      setSnapshotReady(true);
      setCacheReadyMapId(activeMap.id);
    };
    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      setConnection('offline');
      setPermission('view');
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, getWebSocketReconnectDelay(reconnectAttempt));
      reconnectAttempt += 1;
    };
    void loadMindmapSnapshot(activeMap.id).then((cached) => {
      if (stopped || serverSnapshotReceived || !cached) return;
      if (!permissionConfirmed) {
        pendingCache = cached;
        return;
      }
      applyCachedSnapshot(cached);
    }).catch(() => undefined);

    const connect = async () => {
      if (stopped) return;
      setConnection('connecting');
      try {
        serverSnapshotReceived = false;
        const controller = new AbortController();
        ticketController = controller;
        const ticketTimeout = window.setTimeout(() => controller.abort(), 15_000);
        let ticket: Awaited<ReturnType<typeof requestMindmapSocketTicket>>;
        try {
          ticket = await requestMindmapSocketTicket(activeMap.id, controller.signal);
        } finally {
          window.clearTimeout(ticketTimeout);
          if (ticketController === controller) ticketController = null;
        }
        if (stopped) return;
        permissionConfirmed = true;
        if (pendingCache) {
          applyCachedSnapshot(pendingCache);
          pendingCache = null;
        }
        const socket = new WebSocket(mindmapSocketUrl(ticket));
        currentSocket = socket;
        socketRef.current = socket;
        socketConnectTimer = window.setTimeout(() => {
          if (socket.readyState !== WebSocket.CONNECTING) return;
          try {
            socket.close();
          } catch {
            /* The socket may already be closing. */
          }
          scheduleReconnect();
        }, 15_000);
        socket.onopen = () => {
          if (stopped) return;
          window.clearTimeout(socketConnectTimer);
          setConnection('connected');
          stableConnectionTimer = window.setTimeout(() => {
            reconnectAttempt = 0;
          }, 30_000);
          heartbeat = startWebSocketHeartbeat(socket, () => {
            if (socketRef.current !== socket) return;
            try {
              socket.close(4000, 'Heartbeat timeout');
            } catch {
              /* The socket may already be closing. */
            }
            scheduleReconnect();
          });
        };
        socket.onmessage = (message) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(message.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (payload.type === 'heartbeat_ack') {
            heartbeat?.acknowledge();
            return;
          }
          if (payload.type === 'mindmap:ready') {
            setPermission(payload.permission === 'edit' ? 'edit' : 'view');
            return;
          }
          if (payload.type === 'mindmap:snapshot') {
            serverSnapshotReceived = true;
            setNodes(Array.isArray(payload.nodes) ? payload.nodes as MindmapNode[] : []);
            setEdges(Array.isArray(payload.edges)
              ? (payload.edges as MindmapEdge[]).map((edge) => ({ ...edge, label: edge.label ?? '' }))
              : []);
            setSnapshotReady(true);
            setCacheReadyMapId(activeMap.id);
            return;
          }
          if (payload.type === 'node:updated' && payload.node && typeof payload.node === 'object') {
            const node = payload.node as MindmapNode;
            setNodes((current) => current.some((item) => item.id === node.id)
              ? current.map((item) => item.id === node.id ? node : item)
              : [...current, node]);
            return;
          }
          if (payload.type === 'node:deleted' && typeof payload.id === 'string') {
            setNodes((current) => current.filter((node) => node.id !== payload.id));
            setEdges(Array.isArray(payload.edges) ? payload.edges as MindmapEdge[] : []);
            setSelectedNodeId((current) => current === payload.id ? null : current);
            return;
          }
          if (payload.type === 'edge:created' && payload.edge && typeof payload.edge === 'object') {
            const edge = payload.edge as MindmapEdge;
            setEdges((current) => current.some((item) => item.id === edge.id) ? current : [...current, edge]);
            return;
          }
          if (payload.type === 'edge:updated' && payload.edge && typeof payload.edge === 'object') {
            const edge = payload.edge as MindmapEdge;
            setEdges((current) => current.map((item) => item.id === edge.id ? edge : item));
            return;
          }
          if (payload.type === 'edge:deleted' && typeof payload.id === 'string') {
            setEdges((current) => current.filter((edge) => edge.id !== payload.id));
            return;
          }
          if (payload.type === 'mindmap:title' && typeof payload.title === 'string') {
            setActiveMap((current) => current ? { ...current, title: payload.title as string } : current);
            setMaps((current) => current.map((map) => (
              map.id === activeMap.id ? { ...map, title: payload.title as string } : map
            )));
            return;
          }
          if (payload.type === 'access:changed') {
            setConnectionAttempt((attempt) => attempt + 1);
            return;
          }
          if (payload.type === 'error' && typeof payload.message === 'string') {
            toast.error(payload.message);
          }
        };
        socket.onerror = () => {
          if (stopped) return;
          setConnection('offline');
          try {
            socket.close();
          } catch {
            /* The socket may already be closing. */
          }
          scheduleReconnect();
        };
        socket.onclose = () => {
          window.clearTimeout(socketConnectTimer);
          heartbeat?.stop();
          heartbeat = null;
          window.clearTimeout(stableConnectionTimer);
          if (socketRef.current === socket) socketRef.current = null;
          scheduleReconnect();
        };
      } catch {
        if (stopped) return;
        scheduleReconnect();
      }
    };
    const handleOnline = () => {
      if (ticketController) return;
      if (
        currentSocket &&
        (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
      ) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
      reconnectAttempt = 0;
      void connect();
    };
    window.addEventListener('online', handleOnline);
    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(socketConnectTimer);
      window.clearTimeout(stableConnectionTimer);
      window.removeEventListener('online', handleOnline);
      ticketController?.abort();
      heartbeat?.stop();
      currentSocket?.close(1000, 'Mind map changed');
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
  }, [activeMap?.id, connectionAttempt]);

  useEffect(() => {
    if (!activeMap || cacheReadyMapId !== activeMap.id || !snapshotReady) return undefined;
    const timer = window.setTimeout(() => {
      void saveMindmapSnapshot({
        id: activeMap.id,
        nodes,
        edges,
      }).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeMap, cacheReadyMapId, edges, nodes, snapshotReady]);

  const send = useCallback((event: Record<string, unknown>) => {
    if (permission !== 'edit') {
      toast.error('You have view access to this mind map.');
      return false;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error('This mind map is not connected.');
      return false;
    }
    socket.send(JSON.stringify(event));
    return true;
  }, [permission]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const saveNode = useCallback((node: MindmapNode) => {
    if (!node.text.trim()) {
      toast.error('A node needs a label.');
      return;
    }
    return send({ type: 'node:upsert', node: { ...node, text: node.text.trim() } });
  }, [send]);

  const commitNodeDraft = useCallback((node: MindmapNode, text: string) => {
    const nextText = text.trim();
    if (!nextText) {
      setNodeDraft(node.text);
      setEditingNodeId(null);
      return;
    }
    const updated = { ...node, text: nextText };
    saveNode(updated);
    setNodes((current) => current.map((item) => item.id === node.id ? updated : item));
    setEditingNodeId((current) => current === node.id ? null : current);
  }, [saveNode]);

  const addNode = useCallback((asChild: boolean) => {
    if (!activeMap || permission !== 'edit') return;
    const parent = asChild ? selectedNode : null;
    const node: MindmapNode = {
      id: crypto.randomUUID(),
      text: 'New idea',
      x: parent ? parent.x + 300 : 460 + (nodes.length % 3) * 280,
      y: parent ? parent.y + 20 : 230 + Math.floor(nodes.length / 3) * 150,
      color: ['blue', 'mint', 'amber', 'violet', 'rose'][nodes.length % 5],
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
    setNodeDraft(node.text);
    send({ type: 'node:upsert', node });
    if (parent) send({ type: 'edge:create', from: parent.id, to: node.id });
  }, [activeMap, nodes.length, permission, selectedNode, send]);

  const addParent = useCallback(() => {
    if (!activeMap || permission !== 'edit' || !selectedNode) return;
    const node: MindmapNode = {
      id: crypto.randomUUID(),
      text: 'New idea',
      x: Math.max(24, selectedNode.x - 300),
      y: selectedNode.y + 20,
      color: 'violet',
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
    setNodeDraft(node.text);
    send({ type: 'node:upsert', node });
    send({ type: 'edge:create', from: node.id, to: selectedNode.id });
  }, [activeMap, permission, selectedNode, send]);

  const changeNodeColor = useCallback((nodeId: string, color: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || permission !== 'edit') return;
    const updated = { ...node, color };
    setNodes((current) => current.map((item) => item.id === nodeId ? updated : item));
    saveNode(updated);
    setContextMenu(null);
  }, [nodes, permission, saveNode]);

  const editEdgeLabel = useCallback((edgeId: string) => {
    const edge = edges.find((item) => item.id === edgeId);
    if (!edge || permission !== 'edit') return;
    const label = window.prompt('Text for this connection', edge.label ?? '');
    if (label === null) return;
    send({ type: 'edge:update', id: edgeId, label: label.slice(0, 120) });
    setContextMenu(null);
  }, [edges, permission, send]);

  const openNodeContext = (event: ReactMouseEvent<HTMLDivElement>, node: MindmapNode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  };

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, node: MindmapNode) => {
    if (permission !== 'edit' || editingNodeId === node.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    dragRef.current = {
      id: node.id,
      dx: event.clientX - bounds.left + canvas.scrollLeft - node.x,
      dy: event.clientY - bounds.top + canvas.scrollTop - node.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(node.id);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas || permission !== 'edit') return;
      const bounds = canvas.getBoundingClientRect();
      const x = Math.max(24, Math.round(event.clientX - bounds.left + canvas.scrollLeft - drag.dx));
      const y = Math.max(24, Math.round(event.clientY - bounds.top + canvas.scrollTop - drag.dy));
      setNodes((current) => current.map((node) => node.id === drag.id ? { ...node, x, y } : node));
    };
    const end = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const node = nodes.find((item) => item.id === drag.id);
      if (node) saveNode(node);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
  }, [nodes, permission, saveNode]);

  const createMap = async () => {
    if (creating) return;
    const title = window.prompt('Name your mind map');
    if (!title?.trim()) return;
    try {
      setCreating(true);
      const document = await createCollabMindmap(title.trim());
      setMaps((current) => [document, ...current]);
      setActiveMap(document);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create this mind map.');
    } finally {
      setCreating(false);
    }
  };

  const saveTitle = async () => {
    if (!activeMap || permission !== 'edit' || !titleDraft.trim()) return;
    try {
      const title = await renameCollabMindmap(activeMap.id, titleDraft);
      setActiveMap((current) => current ? { ...current, title } : current);
      setMaps((current) => current.map((map) => map.id === activeMap.id ? { ...map, title } : map));
      setTitleEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename the mind map.');
    }
  };

  if (!activeMap) {
    if (embedded && initialDocumentId) {
      return (
        <section className="mindmap-page mindmap-page--embedded mindmap-page--embedded-loading">
          {loadingMaps ? 'Loading pinned mind map…' : 'This pinned mind map is unavailable.'}
        </section>
      );
    }
    return (
      <section className={`mindmap-page ${embedded ? 'mindmap-page--embedded' : ''}`}>
        <header className="mindmap-list-header">
          <div>
            <p className="mindmap-eyebrow">Shared thinking</p>
            <h1>Mind maps</h1>
          </div>
          <button type="button" className="mindmap-primary" onClick={() => void createMap()} disabled={creating}>
            <Plus className="size-4" /> {creating ? 'Creating…' : 'New mind map'}
          </button>
        </header>
        {loadingMaps && maps.length === 0 ? (
          <div className="mindmap-empty">Loading your maps…</div>
        ) : maps.length ? (
          <div className="mindmap-list">
            {maps.map((map) => (
              <button key={map.id} type="button" className="mindmap-list-card" onClick={() => setActiveMap(map)}>
                <span className="mindmap-list-icon"><GitBranch className="size-5" /></span>
                <span><strong>{map.title}</strong><small>{map.owner === username ? 'You own this map' : `Shared by ${map.owner}`}</small></span>
                <small className="mindmap-date">{new Date(map.updatedAt).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="mindmap-empty">
            <span className="mindmap-empty-icon"><GitBranch className="size-7" /></span>
            <h2>Think together, visually</h2>
            <p>Create a map, add connected ideas, and shape it together in real time.</p>
            <button type="button" className="mindmap-primary" onClick={() => void createMap()}>
              <CirclePlus className="size-4" /> Create your first mind map
            </button>
          </div>
        )}
      </section>
    );
  }

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  return (
    <section className={`mindmap-page mindmap-page--canvas ${embedded ? 'mindmap-page--embedded' : ''}`}>
      <header className="mindmap-work-header">
        <div className="mindmap-heading">
          {!embedded && (
            <button type="button" className="mindmap-icon-button" aria-label="Back to mind maps" onClick={() => {
              setActiveMap(null);
              void refreshMaps();
            }}><ArrowLeft className="size-4" /></button>
          )}
          <GitBranch className="size-5 text-accent" />
          {titleEditing ? (
            <form className="mindmap-title-form" onSubmit={(event) => { event.preventDefault(); void saveTitle(); }}>
              <input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
              <button type="submit" aria-label="Save title"><Pencil className="size-3.5" /></button>
              <button type="button" aria-label="Cancel title edit" onClick={() => setTitleEditing(false)}><X className="size-3.5" /></button>
            </form>
          ) : (
            <button
              type="button"
              className="mindmap-title"
              onClick={() => {
                if (activeMap.owner !== username) return;
                setTitleDraft(activeMap.title);
                setTitleEditing(true);
              }}
              title={activeMap.owner === username ? 'Rename mind map' : activeMap.title}
            >{activeMap.title}{activeMap.owner === username && <Pencil className="size-3.5" />}</button>
          )}
          <span className={`mindmap-status mindmap-status--${connection}`}>
            <i />{connection === 'connected' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Offline'}
          </span>
        </div>
        <div className="mindmap-actions">
          <span className={permission === 'edit' ? 'mindmap-permission' : 'mindmap-permission is-view'}>
            {permission === 'edit' ? 'Can edit' : 'View only'}
          </span>
          <button type="button" className="mindmap-secondary" disabled={permission !== 'edit'} onClick={() => addNode(false)}>
            <Plus className="size-4" /> Add node
          </button>
          <button type="button" className="mindmap-primary" disabled={permission !== 'edit' || !selectedNode} onClick={() => addNode(true)}>
            <GitBranch className="size-4" /> Add child
          </button>
          <button
            type="button"
            className="mindmap-icon-button mindmap-delete"
            aria-label="Delete selected node"
            title="Delete selected node"
            disabled={permission !== 'edit' || !selectedNode}
            onClick={() => {
              if (selectedNodeId && window.confirm('Delete this node and its connections?')) {
                send({ type: 'node:delete', id: selectedNodeId });
              }
            }}
          ><Trash2 className="size-4" /></button>
        </div>
      </header>
      <div className="mindmap-hint">
        {permission === 'edit'
          ? 'Drag nodes to arrange · select a node, then Add child to connect an idea'
          : 'You have view access · ask the document owner to enable editing'}
      </div>
      <div
        className="mindmap-canvas-scroll"
        ref={canvasRef}
        onContextMenu={(event) => {
          if (permission !== 'edit') return;
          if (event.target instanceof Element && event.target.closest('.mindmap-node, .mindmap-links path')) return;
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {!snapshotReady && <div className="mindmap-loading">Loading shared map…</div>}
        <div className="mindmap-canvas" style={{ width: 1800, height: 1200 }}>
          <svg className="mindmap-links" width="1800" height="1200" aria-hidden="true">
            {edges.map((edge) => {
              const from = nodeLookup.get(edge.from);
              const to = nodeLookup.get(edge.to);
              if (!from || !to) return null;
              return (
                <g key={edge.id}>
                  <path
                    id={`mindmap-edge-${edge.id}`}
                    d={mapPath(from, to)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (permission === 'edit') {
                        setContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
                      }
                    }}
                  />
                  {edge.label && (
                    <text className="mindmap-edge-label">
                      <textPath href={`#mindmap-edge-${edge.id}`} startOffset="50%" textAnchor="middle">
                        {edge.label}
                      </textPath>
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`mindmap-node mindmap-node--${node.color} ${selectedNodeId === node.id ? 'is-selected' : ''}`}
              style={{ left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H }}
              onContextMenu={(event) => openNodeContext(event, node)}
            >
              <button
                type="button"
                className="mindmap-node-grab"
                aria-label={`Select or drag ${node.text}`}
                onPointerDown={(event) => beginDrag(event, node)}
                onClick={() => setSelectedNodeId(node.id)}
                onDoubleClick={() => {
                  if (permission !== 'edit') return;
                  setSelectedNodeId(node.id);
                  setEditingNodeId(node.id);
                  setNodeDraft(node.text);
                }}
              >
                <span className="mindmap-node-dot" />
                <span className="mindmap-node-label">{node.text}</span>
              </button>
              {editingNodeId === node.id && permission === 'edit' && (
                <div className="mindmap-node-editor">
                  <textarea
                    autoFocus
                    maxLength={2_000}
                    value={nodeDraft}
                    onChange={(event) => setNodeDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={() => commitNodeDraft(node, nodeDraft)}
                    aria-label="Mind map node text"
                  />
                </div>
              )}
            </div>
          ))}
          {snapshotReady && nodes.length === 0 && (
            <div className="mindmap-canvas-empty">
              <p>This map is empty.</p>
              <button type="button" className="mindmap-primary" disabled={permission !== 'edit'} onClick={() => addNode(false)}>
                <Plus className="size-4" /> Add the first idea
              </button>
            </div>
          )}
        </div>
      </div>
      <footer className="mindmap-footer">
        <span>{nodes.length} nodes · {edges.length} connections</span>
        <span>{activeMap.owner === username ? 'You own this map' : `Owned by ${activeMap.owner}`}</span>
      </footer>
      {contextMenu && (
        <div
          className="mindmap-context-menu"
          role="menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 220),
            top: Math.min(contextMenu.y, window.innerHeight - 250),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.edgeId ? (
            <>
              <button type="button" role="menuitem" disabled={permission !== 'edit'} onClick={() => editEdgeLabel(contextMenu.edgeId!)}>
                {edges.find((edge) => edge.id === contextMenu.edgeId)?.label ? 'Edit connection text' : 'Add connection text'}
              </button>
              <button type="button" role="menuitem" disabled={permission !== 'edit' || !edges.find((edge) => edge.id === contextMenu.edgeId)?.label} onClick={() => {
                send({ type: 'edge:update', id: contextMenu.edgeId, label: '' });
                setContextMenu(null);
              }}>Clear connection text</button>
            </>
          ) : contextMenu.nodeId ? (
            <>
              <button type="button" role="menuitem" disabled={permission !== 'edit'} onClick={() => { addParent(); setContextMenu(null); }}>Add parent node</button>
              <button type="button" role="menuitem" disabled={permission !== 'edit'} onClick={() => { addNode(true); setContextMenu(null); }}>Add child node</button>
              <div className="mindmap-context-caption">Node background</div>
              <div className="mindmap-context-palette" role="group" aria-label="Node background colors">
                {NODE_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    disabled={permission !== 'edit'}
                    aria-label={`${color.label} background`}
                    title={`${color.label} background`}
                    className={`mindmap-context-swatch mindmap-context-swatch--${color.id}`}
                    onClick={() => changeNodeColor(contextMenu.nodeId!, color.id)}
                  />
                ))}
              </div>
              <button type="button" role="menuitem" disabled={permission !== 'edit'} onClick={() => {
                if (window.confirm('Delete this node and its connections?')) send({ type: 'node:delete', id: contextMenu.nodeId });
                setContextMenu(null);
              }}>Delete node</button>
            </>
          ) : (
            <button type="button" role="menuitem" disabled={permission !== 'edit'} onClick={() => { addNode(false); setContextMenu(null); }}>Add node</button>
          )}
        </div>
      )}
    </section>
  );
}
