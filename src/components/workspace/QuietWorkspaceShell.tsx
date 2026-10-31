import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefCallback } from 'react';
import {
  AudioLines,
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FilePenLine,
  GraduationCap,
  History,
  Image,
  LayoutGrid,
  Layers3,
  PackageSearch,
  LogIn,
  MessageCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  GripHorizontal,
} from 'lucide-react';
import type { WorkView } from '@/components/FlowchartCanvas';
import { cn } from '@/lib/utils';
import { requestTeamBoardSocketTicket, teamBoardSocketUrl } from '@/lib/chat-client';
import { getWebSocketReconnectDelay, startWebSocketHeartbeat } from '@/lib/websocket-health';

interface QuietWorkspaceShellProps {
  activeView: WorkView;
  availableViews: WorkView[];
  onNavigate: (view: WorkView) => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  settingsActive: boolean;
  onOpenWidget: (widget: WidgetId) => void;
  historyOpen: boolean;
  historyCount: number;
  onToggleHistory: () => void;
  onUtilitySlot: RefCallback<HTMLDivElement>;
  username?: string;
  hideDock?: boolean;
  children: ReactNode;
}

export type WidgetId = 'tracker' | 'guides' | 'product' | 'photos' | 'transcript' | 'qa' | 'manuals';

const VIEW_META: Record<WorkView, { label: string; icon: typeof Users }> = {
  commune: { label: 'Commune', icon: Users },
  chat: { label: 'Chat', icon: MessageCircle },
  collab: { label: 'Collab Space', icon: Layers3 },
  teamBoard: { label: 'Team Board', icon: ClipboardList },
  callNotes: { label: 'Call Notes', icon: FilePenLine },
  caseTrak: { label: 'Cases', icon: LayoutGrid },
  dash: { label: 'DASH', icon: BarChart3 },
  shifts: { label: 'Schedule', icon: CalendarDays },
  selfTest: { label: 'Learn', icon: GraduationCap },
  settings: { label: 'Settings', icon: Settings },
  admin: { label: 'Admin', icon: ShieldCheck },
  login: { label: 'Login', icon: LogIn },
};

const VIEW_ORDER: WorkView[] = ['commune', 'chat', 'collab', 'teamBoard', 'callNotes', 'caseTrak', 'dash', 'shifts', 'selfTest'];
const DOCK_POSITION_KEY = 'econote_workspace_dock_position';
const SUPPORT_WIDGETS: Array<{ id: WidgetId; label: string; icon: typeof Users }> = [
  { id: 'tracker', label: '24-hour case tracker', icon: Clock3 },
  { id: 'guides', label: 'SOP lookup', icon: BookOpen },
  { id: 'product', label: 'Product lookup', icon: PackageSearch },
  { id: 'photos', label: 'App Use Photos', icon: Image },
  { id: 'transcript', label: 'Live transcript', icon: AudioLines },
  { id: 'qa', label: 'QA review', icon: ClipboardCheck },
  { id: 'manuals', label: 'Product manuals', icon: BookMarked },
];

export function QuietWorkspaceShell({
  activeView,
  availableViews,
  onNavigate,
  onOpenHelp,
  onOpenSettings,
  settingsActive,
  onOpenWidget,
  historyOpen,
  historyCount,
  onToggleHistory,
  onUtilitySlot,
  username,
  hideDock = false,
  children,
}: QuietWorkspaceShellProps) {
  const views = VIEW_ORDER.filter((view) => availableViews.includes(view));
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadAnnouncement, setUnreadAnnouncement] = useState(false);
  const [dockPosition, setDockPosition] = useState<{ left: number; top: number } | null>(() => {
    try {
      const saved = window.localStorage.getItem(DOCK_POSITION_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as { left?: unknown; top?: unknown };
      return typeof parsed.left === 'number' && typeof parsed.top === 'number'
        ? { left: parsed.left, top: parsed.top }
        : null;
    } catch {
      return null;
    }
  });
  const dockDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const dockPositionRef = useRef(dockPosition);

  useEffect(() => {
    try {
      setUnreadAnnouncement(Boolean(window.localStorage.getItem('econote_unread_board_announcement')));
    } catch {
      setUnreadAnnouncement(false);
    }
    const onAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; cardId?: string }>).detail;
      const id = detail?.id ?? detail?.cardId;
      if (!id) return;
      setUnreadAnnouncement(true);
      try {
        window.localStorage.setItem('econote_unread_board_announcement', id);
      } catch {
        /* Keep the in-session badge even when browser storage is unavailable. */
      }
    };
    window.addEventListener('econote:public-board-announcement', onAnnouncement);
    return () => window.removeEventListener('econote:public-board-announcement', onAnnouncement);
  }, []);

  useEffect(() => {
    if (!username) return undefined;
    let stopped = false;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof startWebSocketHeartbeat> | null = null;
    let reconnectTimer = 0;
    let attempts = 0;

    const connect = async () => {
      try {
        const { ticket } = await requestTeamBoardSocketTicket();
        if (stopped) return;
        socket = new WebSocket(teamBoardSocketUrl(ticket));
        socket.onopen = () => {
          if (stopped || !socket) return;
          attempts = 0;
          heartbeat = startWebSocketHeartbeat(socket, () => socket?.close());
        };
        socket.onmessage = (message) => {
          if (stopped || typeof message.data !== 'string') return;
          try {
            const payload = JSON.parse(message.data) as Record<string, unknown>;
            if (payload.type === 'heartbeat_ack') {
              heartbeat?.acknowledge();
              return;
            }
            if (payload.type !== 'board:announcement' || typeof payload.cardId !== 'string') return;
            try {
              const deliveryKey = 'econote_last_board_announcement_delivery';
              if (window.localStorage.getItem(deliveryKey) === payload.cardId) return;
              window.localStorage.setItem(deliveryKey, payload.cardId);
            } catch {
              /* Deliver once per connected tab when local storage is unavailable. */
            }
            window.dispatchEvent(new CustomEvent('econote:public-board-announcement', {
              detail: {
                id: payload.cardId,
                cardId: payload.cardId,
                title: typeof payload.title === 'string' ? payload.title : 'Team announcement',
                message: typeof payload.message === 'string' ? payload.message : '',
                author: typeof payload.author === 'string' ? payload.author : '',
              },
            }));
          } catch {
            /* Ignore malformed board events and keep the app socket alive. */
          }
        };
        socket.onclose = () => {
          heartbeat?.stop();
          heartbeat = null;
          if (stopped) return;
          const delay = getWebSocketReconnectDelay(attempts++);
          reconnectTimer = window.setTimeout(() => void connect(), delay);
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!stopped) {
          const delay = getWebSocketReconnectDelay(attempts++);
          reconnectTimer = window.setTimeout(() => void connect(), delay);
        }
      }
    };
    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      heartbeat?.stop();
      socket?.close(1000, 'Workspace closed');
    };
  }, [username]);

  useEffect(() => {
    if (activeView !== 'teamBoard' || !unreadAnnouncement) return;
    setUnreadAnnouncement(false);
    try {
      window.localStorage.removeItem('econote_unread_board_announcement');
    } catch {
      /* The badge still clears for this session. */
    }
  }, [activeView, unreadAnnouncement]);

  const startDockDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const dock = dockRef.current;
    if (!dock) return;
    const rect = dock.getBoundingClientRect();
    dockDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDock = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dock = dockRef.current;
    if (!dock) return;
    const bounds = dock.getBoundingClientRect();
    const left = Math.max(4, Math.min(window.innerWidth - bounds.width - 4, drag.left + event.clientX - drag.startX));
    const top = Math.max(4, Math.min(window.innerHeight - bounds.height - 4, drag.top + event.clientY - drag.startY));
    const next = { left, top };
    dockPositionRef.current = next;
    setDockPosition(next);
    window.dispatchEvent(new CustomEvent('econote:workspace-dock-bounds', {
      detail: { left, top, width: bounds.width, height: bounds.height },
    }));
  };

  const endDockDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dockDragRef.current || dockDragRef.current.pointerId !== event.pointerId) return;
    dockDragRef.current = null;
    try {
      if (dockPositionRef.current) window.localStorage.setItem(DOCK_POSITION_KEY, JSON.stringify(dockPositionRef.current));
    } catch {
      /* The floating dock remains draggable without persistent storage. */
    }
  };

  const navigate = (view: WorkView) => {
    if (view === 'teamBoard') {
      setUnreadAnnouncement(false);
      try {
        window.localStorage.removeItem('econote_unread_board_announcement');
      } catch {
        /* The badge still clears for this session. */
      }
    }
    onNavigate(view);
  };

  useEffect(() => {
    const onUnreadCount = (event: Event) => {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      setUnreadChatCount(
        typeof count === 'number' && Number.isFinite(count)
          ? Math.max(0, Math.floor(count))
          : 0,
      );
    };
    window.addEventListener('econote:chat-unread-count', onUnreadCount);
    return () => window.removeEventListener('econote:chat-unread-count', onUnreadCount);
  }, []);

  return (
    <div className="quiet-shell">
      <main className="quiet-stage" aria-label={`${VIEW_META[activeView].label} workspace`}>
          <div className="quiet-stage-surface">
            {children}
          </div>
      </main>

      <div className="quiet-global-controls" ref={onUtilitySlot} aria-label={`Global controls for ${username || 'agent'}`} />

      {!hideDock && (
        <nav
          ref={dockRef}
          className={cn('quiet-orbit-dock', dockPosition && 'quiet-orbit-dock--placed')}
          style={dockPosition ? { left: dockPosition.left, top: dockPosition.top, bottom: 'auto', transform: 'none' } : undefined}
          aria-label="Workspace and support tools"
        >
          <button
            type="button"
            className="quiet-dock-drag-handle"
            aria-label="Drag navigation bar"
            title="Drag to move navigation"
            onPointerDown={startDockDrag}
            onPointerMove={moveDock}
            onPointerUp={endDockDrag}
            onPointerCancel={endDockDrag}
          >
            <GripHorizontal className="size-3.5" />
          </button>
          <div className="quiet-dock-cluster quiet-dock-cluster--navigation" aria-label="Workspaces">
            {views.map((view) => {
              const Icon = VIEW_META[view].icon;
              const unread = view === 'chat' ? unreadChatCount : 0;
              const pulseDuration = Math.max(0.24, 1.5 / (1 + Math.log2(unread + 1)));
              return (
                <button
                  key={view}
                  type="button"
                  aria-label={unread
                    ? `Chat, ${unread} unread message${unread === 1 ? '' : 's'}`
                    : VIEW_META[view].label}
                  aria-current={activeView === view ? 'page' : undefined}
                  onClick={() => navigate(view)}
                  className={cn('quiet-orbit-action', activeView === view && 'quiet-orbit-action--active')}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                  {unread > 0 && (
                    <span
                      className="quiet-chat-unread-dot"
                      aria-hidden="true"
                      style={{ animationDuration: `${pulseDuration}s` }}
                    />
                  )}
                  {view === 'teamBoard' && unreadAnnouncement && (
                    <span className="quiet-chat-unread-dot quiet-announcement-unread-dot" aria-label="New announcement" />
                  )}
                  <span className="quiet-dock-tooltip" aria-hidden="true">{VIEW_META[view].label}</span>
                </button>
              );
            })}
          </div>

          <div className="quiet-magic-ball-anchor">
            <button type="button" className="quiet-magic-ball" aria-label="Open Kitty Help" onClick={onOpenHelp}>
              <Sparkles className="size-[18px]" strokeWidth={1.8} />
            </button>
            <span className="quiet-dock-tooltip" aria-hidden="true">Ask Kitty</span>
          </div>

          <div className="quiet-dock-cluster quiet-dock-cluster--widgets" aria-label="Support widgets">
            {SUPPORT_WIDGETS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                onClick={() => onOpenWidget(id)}
                className="quiet-orbit-action"
              >
                <Icon className="size-[18px]" strokeWidth={1.8} />
                  <span className="quiet-dock-tooltip" aria-hidden="true">{label}</span>
              </button>
            ))}
          </div>

          <div className="quiet-dock-cluster quiet-dock-cluster--widgets" aria-label="History">
            <button
              type="button"
              aria-label="Toggle history"
              aria-pressed={historyOpen}
              onClick={onToggleHistory}
              className={cn('quiet-orbit-action', historyOpen && 'quiet-orbit-action--active')}
            >
              <History className="size-[18px]" strokeWidth={1.8} />
              {historyCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[8px] font-bold leading-none text-primary-foreground">
                  {historyCount > 99 ? '99+' : historyCount}
                </span>
              )}
              <span className="quiet-dock-tooltip" aria-hidden="true">History</span>
            </button>
          </div>

          <span className="quiet-dock-divider" aria-hidden="true" />

          <div className="quiet-dock-cluster quiet-dock-cluster--settings" aria-label="Settings">
            <button
              type="button"
              aria-label="Settings"
              aria-current={settingsActive ? 'page' : undefined}
              onClick={onOpenSettings}
              className={cn('quiet-orbit-action', settingsActive && 'quiet-orbit-action--active')}
            >
              <Settings className="size-[18px]" strokeWidth={1.8} />
              <span className="quiet-dock-tooltip" aria-hidden="true">Settings</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default QuietWorkspaceShell;
