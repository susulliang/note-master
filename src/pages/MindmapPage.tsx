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
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { toast } from 'sonner';
import {
  createCollabMindmap,
  fetchCollabDocuments,
  mindmapSocketUrl,
  renameCollabMindmap,
  requestMindmapSocketTicket,
  type CollabDocument,
  type CollabPermission,
} from '@/lib/chat-client';
import './MindmapPage.css';

interface MindmapPageProps {
  username: string;
  initialDocumentId?: string;
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
}

type MapConnection = 'connecting' | 'connected' | 'offline';

const NODE_W = 224;
const NODE_H = 94;

function mapPath(from: MindmapNode, to: MindmapNode): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const bend = Math.max(58, Math.abs(x2 - x1) * 0.42);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export default function MindmapPage({ username, initialDocumentId }: MindmapPageProps) {
  const [maps, setMaps] = useState<CollabDocument[]>([]);
  const [activeMap, setActiveMap] = useState<CollabDocument | null>(null);
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
  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const refreshMaps = useCallback(async () => {
    try {
      setMaps((await fetchCollabDocuments()).filter((document) => document.type === 'mindmap'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load mind maps.');
    }
  }, []);

  useEffect(() => { void refreshMaps(); }, [refreshMaps]);

  useEffect(() => {
    if (!initialDocumentId || activeMap) return;
    const match = maps.find((map) => map.id === initialDocumentId);
    if (match) setActiveMap(match);
  }, [activeMap, initialDocumentId, maps]);

  useEffect(() => {
    if (!activeMap) return;
    let stopped = false;
    let currentSocket: WebSocket | null = null;
    setConnection('connecting');
    setPermission('view');
    setSnapshotReady(false);
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    const connect = async () => {
      try {
        const ticket = await requestMindmapSocketTicket(activeMap.id);
        if (stopped) return;
        const socket = new WebSocket(mindmapSocketUrl(ticket));
        currentSocket = socket;
        socketRef.current = socket;
        socket.onopen = () => { if (!stopped) setConnection('connected'); };
        socket.onmessage = (message) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(message.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (payload.type === 'mindmap:ready') {
            setPermission(payload.permission === 'edit' ? 'edit' : 'view');
            return;
          }
          if (payload.type === 'mindmap:snapshot') {
            setNodes(Array.isArray(payload.nodes) ? payload.nodes as MindmapNode[] : []);
            setEdges(Array.isArray(payload.edges) ? payload.edges as MindmapEdge[] : []);
            setSnapshotReady(true);
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
        socket.onerror = () => { if (!stopped) setConnection('offline'); };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (!stopped) {
            setConnection('offline');
            setPermission('view');
          }
        };
      } catch (error) {
        if (stopped) return;
        setConnection('offline');
        toast.error(error instanceof Error ? error.message : 'Could not connect to this mind map.');
      }
    };
    void connect();
    return () => {
      stopped = true;
      currentSocket?.close(1000, 'Mind map changed');
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
  }, [activeMap?.id, connectionAttempt]);

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
    send({ type: 'node:upsert', node: { ...node, text: node.text.trim() } });
  }, [send]);

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
    return (
      <section className="mindmap-page">
        <header className="mindmap-list-header">
          <div>
            <p className="mindmap-eyebrow">Shared thinking</p>
            <h1>Mind maps</h1>
          </div>
          <button type="button" className="mindmap-primary" onClick={() => void createMap()} disabled={creating}>
            <Plus className="size-4" /> {creating ? 'Creating…' : 'New mind map'}
          </button>
        </header>
        {maps.length ? (
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
    <section className="mindmap-page mindmap-page--canvas">
      <header className="mindmap-work-header">
        <div className="mindmap-heading">
          <button type="button" className="mindmap-icon-button" aria-label="Back to mind maps" onClick={() => {
            setActiveMap(null);
            void refreshMaps();
          }}><ArrowLeft className="size-4" /></button>
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
      <div className="mindmap-canvas-scroll" ref={canvasRef}>
        {!snapshotReady && <div className="mindmap-loading">Loading shared map…</div>}
        <div className="mindmap-canvas" style={{ width: 1800, height: 1200 }}>
          <svg className="mindmap-links" width="1800" height="1200" aria-hidden="true">
            {edges.map((edge) => {
              const from = nodeLookup.get(edge.from);
              const to = nodeLookup.get(edge.to);
              return from && to ? <path key={edge.id} d={mapPath(from, to)} /> : null;
            })}
          </svg>
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`mindmap-node mindmap-node--${node.color} ${selectedNodeId === node.id ? 'is-selected' : ''}`}
              style={{ left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H }}
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
                        const updated = { ...node, text: nodeDraft };
                        saveNode(updated);
                        setNodes((current) => current.map((item) => item.id === node.id ? updated : item));
                        setEditingNodeId(null);
                      }
                      if (event.key === 'Escape') setEditingNodeId(null);
                    }}
                    aria-label="Mind map node text"
                  />
                  <div>
                    <button type="button" onClick={() => {
                      const updated = { ...node, text: nodeDraft };
                      saveNode(updated);
                      setNodes((current) => current.map((item) => item.id === node.id ? updated : item));
                      setEditingNodeId(null);
                    }}>Save</button>
                    <button type="button" aria-label="Cancel editing" onClick={() => setEditingNodeId(null)}><X className="size-3.5" /></button>
                  </div>
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
    </section>
  );
}
