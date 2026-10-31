import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleDot,
  Clipboard,
  ExternalLink,
  FileText,
  Flag,
  GitBranch,
  Globe2,
  Grip,
  LockKeyhole,
  MessageCircle,
  PanelRightClose,
  Plus,
  Radio,
  Search,
  Send,
  Share2,
  Shield,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import CollabPresenceStack, { type CollaboratorPresence } from '@/components/CollabPresenceStack';
import { findChatUsers, fetchChatConversations, type ChatConversation, type ChatUser } from '@/lib/chat-client';
import {
  addTeamBoardComment,
  createTeamBoardCard,
  getTeamBoardCardWithRetry,
  listTeamBoardCards,
  requestTeamBoardSocketTicket,
  shareTeamBoardCardWithChat,
  teamBoardSessionAction,
  teamBoardSocketUrl,
  updateTeamBoardCard,
  type TeamBoardCard,
  type TeamBoardCardDetail,
  type TeamBoardCardType,
  type TeamBoardSeverity,
  type TeamBoardStatus,
} from '@/lib/chat-client';
import {
  loadTeamBoardCardDetail,
  loadTeamBoardCardList,
  saveTeamBoardCardDetail,
  saveTeamBoardCardList,
  teamBoardCardListKey,
} from '@/lib/team-board-cache';
import { extractTeamBoardHighlights } from '@/lib/team-board-insights';
import { getWebSocketReconnectDelay, startWebSocketHeartbeat } from '@/lib/websocket-health';
import { cn } from '@/lib/utils';
import './TeamBoardPage.css';

interface TeamBoardPageProps {
  username: string;
  initialCardId?: string | null;
}

const LANES: Array<{ id: TeamBoardStatus; title: string; hint: string }> = [
  { id: 'signal', title: 'Signal', hint: 'New cards and help beacons' },
  { id: 'investigating', title: 'Investigating', hint: 'Someone is on it' },
  { id: 'waiting', title: 'Waiting / Escalated', hint: 'Needs a response or handoff' },
  { id: 'captured', title: 'Captured', hint: 'Decision recorded or resolved' },
];

const CARD_TYPES: Array<{ id: TeamBoardCardType; title: string; hint: string }> = [
  { id: 'ticket', title: 'Ticket', hint: 'A customer case and its next action' },
  { id: 'incident', title: 'Incident', hint: 'A product or service issue affecting multiple cases' },
  { id: 'announcement', title: 'Announcement', hint: 'An important update or escalation request' },
  { id: 'custom', title: 'Custom', hint: 'A flexible shared work card' },
];

const SEVERITIES: Array<{ value: TeamBoardSeverity; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];
const BOARD_POSITIONS_KEY = 'econote_team_board_card_positions';

function readBoardPositions(): Record<string, { x: number; y: number }> {
  try {
    const stored = window.localStorage.getItem(BOARD_POSITIONS_KEY);
    if (!stored) return {};
    const value = JSON.parse(stored) as Record<string, { x?: unknown; y?: unknown }>;
    return Object.fromEntries(Object.entries(value).flatMap(([id, point]) =>
      typeof point.x === 'number' && typeof point.y === 'number'
        ? [[id, { x: point.x, y: point.y }]]
        : [],
    ));
  } catch {
    return {};
  }
}

function cardTypeLabel(type: TeamBoardCardType): string {
  return CARD_TYPES.find((item) => item.id === type)?.title ?? 'Custom';
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parseTicketNumber(source: string): string {
  const match = /(?:ticket|case)\s*(?:number|#|no\.?)\s*[:#-]?\s*([A-Z0-9-]{4,32})/i.exec(source);
  return match?.[1] ?? '';
}

function cardGeometry(card: TeamBoardCard): { width: number; titleLines: number; descriptionLines: number; height: number } {
  const width = Math.min(340, Math.max(258, 258 + Math.round(Math.min(card.description.length, 520) / 7)));
  const titleLines = Math.min(2, Math.max(1, Math.ceil(card.title.length / Math.max(28, width / 7))));
  const descriptionLines = Math.min(7, Math.max(2, Math.ceil(card.description.length / Math.max(42, width / 5))));
  const height = 130 + titleLines * 17 + descriptionLines * 13 +
    (card.ticketNumber ? 20 : 0) +
    (card.robotModel ? 25 : 0) +
    (card.issueExcerpt ? 32 : 0);
  return { width, titleLines, descriptionLines, height };
}

export default function TeamBoardPage({ username, initialCardId = null }: TeamBoardPageProps) {
  const [cards, setCards] = useState<TeamBoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TeamBoardCardType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialCardId);
  const [detail, setDetail] = useState<TeamBoardCardDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<TeamBoardCardType>('ticket');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [sourceUrlDraft, setSourceUrlDraft] = useState('');
  const [severity, setSeverity] = useState<TeamBoardSeverity>('normal');
  const [isBeacon, setIsBeacon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);
  const [presenceByCard, setPresenceByCard] = useState<Record<string, CollaboratorPresence[]>>({});
  const [chatRooms, setChatRooms] = useState<ChatConversation[]>([]);
  const [shareRoomId, setShareRoomId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sessionScratchpad, setSessionScratchpad] = useState('');
  const [decisionDraft, setDecisionDraft] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [cardPositions, setCardPositions] = useState(readBoardPositions);
  const cardPositionsRef = useRef(cardPositions);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const canvasPanRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const cardsRequestSequenceRef = useRef(0);
  const detailRequestSequenceRef = useRef(0);
  const localCardChangeAtRef = useRef(new Map<string, number>());
  const socketRef = useRef<WebSocket | null>(null);
  const activeRoomIdRef = useRef<string | null>(selectedId);
  const sessionScratchpadDirtyRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refreshCards = useCallback(async () => {
    const sequence = ++cardsRequestSequenceRef.current;
    const options = { type: typeFilter, query: debouncedQuery };
    const cacheKey = teamBoardCardListKey(options);
    const cached = await loadTeamBoardCardList(username, cacheKey);
    if (sequence !== cardsRequestSequenceRef.current) return;
    if (cached) {
      setCards(cached);
      setLoading(false);
    }
    try {
      const fresh = await listTeamBoardCards(options);
      if (sequence !== cardsRequestSequenceRef.current) return;
      setCards(fresh);
      void saveTeamBoardCardList(username, cacheKey, fresh);
    } catch (error) {
      if (sequence === cardsRequestSequenceRef.current && !cached) {
        toast.error(error instanceof Error ? error.message : 'Could not load Team Board.');
      }
    } finally {
      if (sequence === cardsRequestSequenceRef.current) setLoading(false);
    }
  }, [debouncedQuery, typeFilter, username]);

  const refreshDetail = useCallback(async (cardId: string) => {
    const sequence = ++detailRequestSequenceRef.current;
    const cached = await loadTeamBoardCardDetail(username, cardId);
    if (sequence !== detailRequestSequenceRef.current || activeRoomIdRef.current !== cardId) return;
    if (cached) {
      setDetail(cached);
      if (!sessionScratchpadDirtyRef.current) setSessionScratchpad(cached.session?.scratchpad ?? '');
    }
    try {
      const next = await getTeamBoardCardWithRetry(cardId);
      if (sequence !== detailRequestSequenceRef.current || activeRoomIdRef.current !== cardId) return;
      setDetail(next);
      void saveTeamBoardCardDetail(username, cardId, next);
      if (!sessionScratchpadDirtyRef.current) setSessionScratchpad(next.session?.scratchpad ?? '');
    } catch (error) {
      if (sequence === detailRequestSequenceRef.current && !cached) {
        setDetail(null);
        toast.error(error instanceof Error ? error.message : 'This card is no longer available.');
        setSelectedId(null);
      }
    }
  }, [username]);

  useEffect(() => { void refreshCards(); }, [refreshCards]);
  useEffect(() => { activeRoomIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    if (!initialCardId) return;
    setSelectedId(initialCardId);
  }, [initialCardId]);

  useEffect(() => {
    sessionScratchpadDirtyRef.current = false;
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) void refreshDetail(selectedId);
    else setDetail(null);
  }, [refreshDetail, selectedId]);

  useEffect(() => {
    let active = true;
    void fetchChatConversations().then((items) => {
      if (active) setChatRooms(items);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 1) {
      setMentionUsers([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void findChatUsers(mentionQuery).then((people) => {
        if (active) setMentionUsers(people.slice(0, 7));
      }).catch(() => {
        if (active) setMentionUsers([]);
      });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mentionQuery]);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof startWebSocketHeartbeat> | null = null;
    let reconnectTimer = 0;
    let reconnectAttempt = 0;
    let connectSequence = 0;
    setPresenceByCard({});

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, getWebSocketReconnectDelay(reconnectAttempt));
      reconnectAttempt += 1;
    };
    const connect = async () => {
      if (stopped) return;
      const sequence = ++connectSequence;
      try {
        const ticket = await requestTeamBoardSocketTicket();
        if (stopped || sequence !== connectSequence) return;
        const current = new WebSocket(teamBoardSocketUrl(ticket.ticket));
        socket = current;
        socketRef.current = current;
        current.onopen = () => {
          reconnectAttempt = 0;
          heartbeat = startWebSocketHeartbeat(current, () => current.close(4000, 'Heartbeat timeout'));
          if (activeRoomIdRef.current) {
            current.send(JSON.stringify({ type: 'board:focus', cardId: activeRoomIdRef.current }));
          }
        };
        current.onmessage = (event) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (payload.type === 'heartbeat_ack') {
            heartbeat?.acknowledge();
            return;
          }
          if (payload.type === 'board:changed') {
            void refreshCards();
            if (typeof payload.cardId === 'string' && payload.cardId === activeRoomIdRef.current) {
              const changedLocallyAt = localCardChangeAtRef.current.get(payload.cardId) ?? 0;
              if (Date.now() - changedLocallyAt > 1_500) void refreshDetail(payload.cardId);
            }
            return;
          }
          if (payload.type === 'board:presence' && typeof payload.cardId === 'string' && Array.isArray(payload.participants)) {
            const participants = (payload.participants as string[]).map((name) => ({ username: name }));
            setPresenceByCard((current) => ({ ...current, [payload.cardId as string]: participants }));
          }
        };
        current.onclose = () => {
          heartbeat?.stop();
          heartbeat = null;
          if (socketRef.current === current) socketRef.current = null;
          scheduleReconnect();
        };
        current.onerror = () => current.close();
      } catch {
        scheduleReconnect();
      }
    };
    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      heartbeat?.stop();
      socket?.close(1000, 'Leaving Team Board');
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [refreshCards, refreshDetail]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'board:focus', cardId: selectedId ?? '' }));
  }, [selectedId]);

  const boardCardOrder = useMemo(
    () => [...cards].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
    [cards],
  );
  const boardCardIndex = useMemo(
    () => new Map(boardCardOrder.map((card, index) => [card.id, index])),
    [boardCardOrder],
  );

  const getCardPosition = (card: TeamBoardCard) => {
    const saved = cardPositions[card.id];
    if (saved) return saved;
    const index = boardCardIndex.get(card.id) ?? 0;
    return { x: 34 + (index % 5) * 360, y: 34 + Math.floor(index / 5) * 360 };
  };

  const boardCanvasSize = useMemo(() => {
    let width = 1_900;
    let height = 1_200;
    for (const card of boardCardOrder) {
      const index = boardCardIndex.get(card.id) ?? 0;
      const position = cardPositions[card.id] ?? {
        x: 34 + (index % 5) * 360,
        y: 34 + Math.floor(index / 5) * 360,
      };
      const geometry = cardGeometry(card);
      width = Math.max(width, position.x + geometry.width + 60);
      height = Math.max(height, position.y + geometry.height + 70);
    }
    return { width, height };
  }, [boardCardIndex, boardCardOrder, cardPositions]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || event.button !== 0 || (event.target as HTMLElement).closest('button, input, textarea, select, a')) return;
    canvasPanRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (cardDragRef.current) {
      const bounds = canvas.getBoundingClientRect();
      const drag = cardDragRef.current;
      const next = {
        x: Math.max(12, event.clientX - bounds.left + canvas.scrollLeft - drag.offsetX),
        y: Math.max(12, event.clientY - bounds.top + canvas.scrollTop - drag.offsetY),
      };
      setCardPositions((current) => {
        const updated = { ...current, [drag.id]: next };
        cardPositionsRef.current = updated;
        return updated;
      });
      return;
    }
    const pan = canvasPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    canvas.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (cardDragRef.current) {
      cardDragRef.current = null;
      setDraggingCardId(null);
      try {
        window.localStorage.setItem(BOARD_POSITIONS_KEY, JSON.stringify(cardPositionsRef.current));
      } catch {
        /* Card movement remains available when storage is disabled. */
      }
    }
    if (canvasPanRef.current?.pointerId === event.pointerId) canvasPanRef.current = null;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const openCreate = (type: TeamBoardCardType = 'ticket', beacon = false) => {
    setCreateType(type);
    setIsBeacon(beacon);
    setTitle('');
    setDescription('');
    setTicketNumber('');
    setSourceUrlDraft('');
    setSeverity(beacon ? 'high' : 'normal');
    setCreateOpen(true);
  };

  const submitCard = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    let sourceUrl: string | undefined;
    const rawSourceUrl = sourceUrlDraft.trim();
    if (rawSourceUrl.startsWith('/')) sourceUrl = rawSourceUrl;
    else if (rawSourceUrl) {
      try {
        const parsed = new URL(rawSourceUrl, window.location.origin);
        if (parsed.origin !== window.location.origin) {
          toast.error('Team Board links must point to this workspace.');
          return;
        }
        sourceUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        toast.error('Enter a valid workspace link.');
        return;
      }
    }
    setSaving(true);
    try {
      const card = await createTeamBoardCard({
        type: createType,
        title: title.trim(),
        description: description.trim(),
        severity,
        ticketNumber: ticketNumber.trim(),
        isBeacon,
        sourceType: sourceUrl ? 'workspace_link' : undefined,
        sourceUrl,
      });
      setCreateOpen(false);
      await refreshCards();
      setSelectedId(card.id);
      toast.success(isBeacon
        ? 'Help beacon shared with its mentions.'
        : createType === 'announcement'
          ? 'Announcement sent to everyone online.'
          : `${cardTypeLabel(createType)} card created privately.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create this card.');
    } finally {
      setSaving(false);
    }
  };

  const saveCardPatch = async (patch: Parameters<typeof updateTeamBoardCard>[1]) => {
    if (!detail) return;
    if (Object.entries(patch).every(([key, value]) => detail.card[key as keyof TeamBoardCard] === value)) return;
    const cardId = detail.card.id;
    const nextCard = {
      ...detail.card,
      ...patch,
      updatedAt: Date.now(),
    };
    if (typeof patch.description === 'string') {
      Object.assign(nextCard, extractTeamBoardHighlights(`${detail.card.sourceSnapshot}\n${patch.description}`));
    }
    const nextDetail = { ...detail, card: nextCard };
    localCardChangeAtRef.current.set(cardId, Date.now());
    setDetail(nextDetail);
    void saveTeamBoardCardDetail(username, cardId, nextDetail);
    setCards((current) => {
      const next = current.map((card) => card.id === cardId ? nextCard : card);
      void saveTeamBoardCardList(
        username,
        teamBoardCardListKey({ type: typeFilter, query: debouncedQuery }),
        next,
      );
      return next;
    });
    try {
      await updateTeamBoardCard(cardId, patch);
      toast.success('Card updated.');
    } catch (error) {
      void refreshDetail(cardId);
      void refreshCards();
      toast.error(error instanceof Error ? error.message : 'Could not update this card.');
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !commentDraft.trim()) return;
    try {
      await addTeamBoardComment(detail.card.id, commentDraft.trim());
      setCommentDraft('');
      await Promise.all([refreshDetail(detail.card.id), refreshCards()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post your comment.');
    }
  };

  const shareToChat = async () => {
    if (!detail || !shareRoomId || sharing) return;
    setSharing(true);
    try {
      const path = await shareTeamBoardCardWithChat(detail.card.id, shareRoomId);
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setShareRoomId('');
      await Promise.all([refreshDetail(detail.card.id), refreshCards()]);
      toast.success('Shared access with chat members. Board link copied.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share this card.');
    } finally {
      setSharing(false);
    }
  };

  const runSessionAction = async (
    action: 'start' | 'join' | 'leave' | 'scratchpad' | 'focus' | 'decision',
    payload?: Record<string, unknown>,
  ) => {
    if (!detail || sessionBusy) return;
    setSessionBusy(true);
    try {
      const next = await teamBoardSessionAction(detail.card.id, action, payload);
      setDetail(next);
      void saveTeamBoardCardDetail(username, detail.card.id, next);
      if (action === 'start' || action === 'join' || action === 'scratchpad' || action === 'leave') {
        sessionScratchpadDirtyRef.current = false;
        setSessionScratchpad(next.session?.scratchpad ?? '');
      }
      if (action === 'decision') {
        setDecisionDraft('');
        toast.success('Decision captured on the card timeline.');
      }
      if (action === 'join' && next.assistStreak) {
        toast.success(`You helped a teammate · ${next.assistStreak} assist streak!`);
      }
      if (action === 'start') toast.success('Pair session started. Invite a teammate by mentioning them on the card.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pair session update failed.');
    } finally {
      setSessionBusy(false);
    }
  };

  const acceptBeacon = async () => {
    if (!detail) return;
    setSessionBusy(true);
    try {
      await updateTeamBoardCard(detail.card.id, { status: 'investigating' });
      const next = await teamBoardSessionAction(detail.card.id, 'start');
      setDetail(next);
      void saveTeamBoardCardDetail(username, detail.card.id, next);
      sessionScratchpadDirtyRef.current = false;
      setSessionScratchpad(next.session?.scratchpad ?? '');
      await refreshCards();
      toast.success('Beacon accepted. Your pair session is live.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept this beacon.');
    } finally {
      setSessionBusy(false);
    }
  };

  const insertMention = (person: ChatUser) => {
    setDescription((current) => current.replace(/(^|\s)@[\w.-]*$/, (_match, prefix: string) => `${prefix}@${person.username} `));
    setMentionQuery(null);
  };
  const insertCardMention = (person: ChatUser) => {
    setDetail((current) => current ? {
      ...current,
      card: {
        ...current.card,
        description: current.card.description.replace(
          /(^|\s)@[\w.-]*$/,
          (_match, prefix: string) => `${prefix}@${person.username} `,
        ),
      },
    } : current);
    setMentionQuery(null);
  };

  return (
    <section className="team-board-page">
      <header className="team-board-header">
        <div className="team-board-heading">
          <span className="team-board-mark"><Radio className="size-4" /></span>
          <div>
            <p className="team-board-eyebrow">PRIVATE BY DEFAULT · REALTIME WHEN SHARED</p>
            <h1>Team Board</h1>
          </div>
          <div className="team-board-live"><i /> Live</div>
        </div>
        <div className="team-board-actions">
          <label className="team-board-search">
            <Search className="size-3.5" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards, ticket numbers…" />
          </label>
          <button type="button" className="team-board-beacon-button" onClick={() => openCreate('custom', true)}>
            <Radio className="size-4" /> Need help
          </button>
          <button type="button" className="team-board-new-button" onClick={() => openCreate()}>
            <Plus className="size-4" /> New card
          </button>
        </div>
      </header>

      <div className="team-board-toolbar">
        <div className="team-board-type-filters" aria-label="Filter cards by type">
          {(['all', 'ticket', 'incident', 'announcement', 'custom'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={typeFilter === type}
              onClick={() => setTypeFilter(type)}
            >{type === 'all' ? 'All signals' : cardTypeLabel(type)}</button>
          ))}
        </div>
        <div className="team-board-presence-summary">
          <Users className="size-3.5" />
          <span>{Object.values(presenceByCard).flat().filter((member) => member.username !== username).length || 'Your'} live collaborators</span>
        </div>
      </div>

      <div className={cn('team-board-workspace', selectedId && 'has-selection')}>
        <main
          ref={canvasRef}
          className="team-board-canvas"
          aria-label="Team Board canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
        >
          {loading ? (
            <div className="team-board-empty">Tuning in to the team signal…</div>
          ) : cards.length === 0 ? (
            <div className="team-board-empty">A clear canvas. Add a card to start the team signal.</div>
          ) : (
            <div
              className="team-board-canvas-inner"
              style={{
                width: boardCanvasSize.width,
                height: boardCanvasSize.height,
              }}
            >
              {cards.map((card) => {
                const position = getCardPosition(card);
                const geometry = cardGeometry(card);
                const statusLabel = LANES.find((lane) => lane.id === card.status)?.title ?? card.status;
                return (
                  <article
                    className={cn(
                      'team-board-card',
                      'team-board-canvas-card',
                      `is-${card.type}`,
                      card.isBeacon && 'is-beacon',
                      selectedId === card.id && 'is-selected',
                      draggingCardId === card.id && 'is-dragging',
                    )}
                    key={card.id}
                    style={{ left: position.x, top: position.y, width: geometry.width }}
                  >
                    <header className="team-board-card-topline">
                      <button
                        type="button"
                        className="team-board-card-grab"
                        aria-label={`Drag ${card.title}`}
                        title="Drag card"
                        onPointerDown={(event) => {
                          const canvas = canvasRef.current;
                          if (!canvas) return;
                          const bounds = canvas.getBoundingClientRect();
                          cardDragRef.current = {
                            id: card.id,
                            offsetX: event.clientX - bounds.left + canvas.scrollLeft - position.x,
                            offsetY: event.clientY - bounds.top + canvas.scrollTop - position.y,
                          };
                          setCardPositions((current) => {
                            const updated = { ...current, [card.id]: position };
                            cardPositionsRef.current = updated;
                            return updated;
                          });
                          setDraggingCardId(card.id);
                          event.currentTarget.setPointerCapture(event.pointerId);
                          event.stopPropagation();
                          event.preventDefault();
                        }}
                      >
                        <Grip className="size-3.5" />
                      </button>
                      <span className={`team-board-type-chip is-${card.type}`}>{card.isBeacon && <Radio className="size-3" />}{card.isBeacon ? 'Help beacon' : cardTypeLabel(card.type)}</span>
                      <span className={`team-board-status-dot is-${card.status}`} title={statusLabel} aria-label={`Status: ${statusLabel}`} />
                      {card.severity !== 'normal' && <span className={`team-board-severity is-${card.severity}`}>{card.severity}</span>}
                    </header>
                    <button type="button" className="team-board-card-open" onClick={() => setSelectedId(card.id)}>
                      <h3>{card.title}</h3>
                      {card.ticketNumber && (
                        <span className="team-board-ticket-number"><Clipboard className="size-3" /> {card.ticketNumber}</span>
                      )}
                      {(card.issueExcerpt || card.robotModel) && (
                        <div className="team-board-card-highlights">
                          {card.robotModel && <span><b>Robot Model</b>{card.robotModel}</span>}
                          {card.issueExcerpt && <span><b>Issue/s</b>{card.issueExcerpt}</span>}
                        </div>
                      )}
                      {card.description && <p className="team-board-card-excerpt" style={{ WebkitLineClamp: geometry.descriptionLines }}>{card.description}</p>}
                      <div className="team-board-card-meta">
                        <span><CircleDot className="size-3" /> {card.owner}</span>
                        <span><MessageCircle className="size-3" /> {card.commentCount}</span>
                        <span>{relativeTime(card.updatedAt)}</span>
                      </div>
                    </button>
                    <footer className="team-board-card-footer">
                      <span className="team-board-private-label" title={card.visibility === 'registered' ? 'Visible to every registered user' : 'Private or shared with selected people'}>
                        {card.visibility === 'registered' ? <Globe2 className="size-3" /> : <Shield className="size-3" />}
                        {card.visibility === 'registered' ? 'Everyone' : 'Shared'}
                      </span>
                      {card.sourceUrl && (
                        <a href={card.sourceUrl} onClick={(event) => event.stopPropagation()} title="Open source">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {selectedId && (
          <aside className="team-board-inspector" aria-label="Card details">
            <header className="team-board-inspector-header">
              <div>
                <p>CONTEXT INSPECTOR</p>
                <span>{detail?.permission === 'owner' ? 'You own this private thread' : 'Shared with you'}</span>
              </div>
              <button type="button" aria-label="Close card details" onClick={() => setSelectedId(null)}><PanelRightClose className="size-4" /></button>
            </header>
            {!detail ? (
              <div className="team-board-inspector-loading">Loading card context…</div>
            ) : (
              <>
                <div className="team-board-inspector-body">
                  <div className="team-board-inspector-cardhead">
                    <span className={`team-board-type-chip is-${detail.card.type}`}>{detail.card.isBeacon && <Radio className="size-3" />}{detail.card.isBeacon ? 'Help beacon' : cardTypeLabel(detail.card.type)}</span>
                    <span className={`team-board-severity is-${detail.card.severity}`}>{detail.card.severity}</span>
                  </div>
                  <input
                    className="team-board-title-input"
                    aria-label="Card title"
                    value={detail.card.title}
                    maxLength={180}
                    disabled={detail.permission === 'view'}
                    onChange={(event) => setDetail((current) => current ? {
                      ...current,
                      card: { ...current.card, title: event.target.value },
                    } : current)}
                    onBlur={(event) => {
                      const nextTitle = event.currentTarget.value.trim();
                      if (nextTitle) void saveCardPatch({ title: nextTitle });
                    }}
                  />
                  {(detail.card.issueExcerpt || detail.card.robotModel) && (
                    <div className="team-board-inspector-highlights" aria-label="Key ticket details">
                      {detail.card.robotModel && (
                        <div><span>Robot Model</span><strong>{detail.card.robotModel}</strong></div>
                      )}
                      {detail.card.issueExcerpt && (
                        <div><span>Issue/s</span><strong>{detail.card.issueExcerpt}</strong></div>
                      )}
                    </div>
                  )}
                  <div className="team-board-inspector-fields">
                    {(detail.card.type === 'ticket' || detail.card.type === 'incident') && (
                      <label>
                        <span>Ticket Number</span>
                        <div className="team-board-ticket-edit">
                          <input
                            value={detail.card.ticketNumber}
                            placeholder="Add case / ticket number"
                            disabled={detail.permission === 'view'}
                            onChange={(event) => setDetail((current) => current ? {
                              ...current,
                              card: { ...current.card, ticketNumber: event.target.value },
                            } : current)}
                            onBlur={(event) => {
                              void saveCardPatch({ ticketNumber: event.currentTarget.value });
                            }}
                          />
                          <button type="button" disabled={!detail.card.ticketNumber} onClick={() => {
                            void navigator.clipboard.writeText(detail.card.ticketNumber)
                              .then(() => toast.success('Ticket number copied.'))
                              .catch(() => toast.error('Could not copy ticket number.'));
                          }} aria-label="Copy ticket number"><Clipboard className="size-3.5" /></button>
                        </div>
                      </label>
                    )}
                    <label>
                      <span>Severity</span>
                      <select
                        value={detail.card.severity}
                        disabled={detail.permission === 'view'}
                        onChange={(event) => void saveCardPatch({ severity: event.target.value as TeamBoardSeverity })}
                      >
                        {SEVERITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Card owner</span>
                      <input
                        value={detail.card.owner}
                        disabled={detail.permission !== 'owner'}
                        onChange={(event) => setDetail((current) => current ? {
                          ...current,
                          card: { ...current.card, owner: event.target.value },
                        } : current)}
                        onBlur={(event) => {
                          const nextOwner = event.currentTarget.value.trim();
                          if (nextOwner) void saveCardPatch({ owner: nextOwner });
                        }}
                      />
                    </label>
                  </div>
                  <label className="team-board-description-field">
                    <span>Card notes · @mention to share and grant edit access</span>
                    <textarea
                      value={detail.card.description}
                      disabled={detail.permission === 'view'}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDetail((current) => current ? { ...current, card: { ...current.card, description: value } } : current);
                        const match = /(?:^|\s)@([\w.-]*)$/.exec(value);
                        setMentionQuery(match ? match[1] : null);
                      }}
                      onBlur={(event) => {
                        void saveCardPatch({ description: event.currentTarget.value });
                      }}
                      placeholder="What happened? What do we know? Use @name to bring someone in."
                    />
                    {mentionQuery !== null && mentionUsers.length > 0 && (
                      <div className="team-board-mention-menu">
                        {mentionUsers.map((person) => (
                          <button key={person.username} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertCardMention(person)}>
                            <span>{person.username.slice(0, 1).toUpperCase()}</span> @{person.username}
                          </button>
                        ))}
                      </div>
                    )}
                  </label>

                  {detail.card.sourceSnapshot && (
                    <section className="team-board-source-snapshot">
                      <header><FileText className="size-3.5" /> Original ticket note</header>
                      <pre>{detail.card.sourceSnapshot}</pre>
                    </section>
                  )}

                  <section className="team-board-share-section">
                    <header><Share2 className="size-3.5" /> Visible to</header>
                    <label className="team-board-visibility-toggle">
                      <span className="team-board-visibility-copy">
                        {detail.card.visibility === 'registered' ? <Globe2 className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
                        <span>
                          <strong>Everyone registered</strong>
                          <small>{detail.card.visibility === 'registered' ? 'All signed-in teammates can view this card.' : 'Only you, mentions, and shared chats can view it.'}</small>
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label="Visible to everyone registered"
                        checked={detail.card.visibility === 'registered'}
                        disabled={detail.permission !== 'owner'}
                        onChange={(event) => void saveCardPatch({ visibility: event.target.checked ? 'registered' : 'private' })}
                      />
                    </label>
                    <div className="team-board-member-list">
                      <span className="team-board-member-chip"><span>{detail.card.createdBy.slice(0, 1).toUpperCase()}</span>{detail.card.createdBy} · creator</span>
                      {detail.members.map((member) => (
                        <span className="team-board-member-chip" key={member.username}>
                          <span>{member.username.slice(0, 1).toUpperCase()}</span>{member.username} · {member.permission}
                        </span>
                      ))}
                      {detail.sharedRooms.map((room) => (
                        <span className="team-board-member-chip" key={room.roomId}>
                          <span><Users className="size-3" /></span>{room.roomId === 'global' ? 'Global chat' : chatRooms.find((item) => item.roomId === room.roomId)?.title ?? 'Shared chat'}
                        </span>
                      ))}
                      {detail.members.length === 0 && detail.sharedRooms.length === 0 && detail.card.visibility === 'private' && <small>Only the creator can see this card until shared or mentioned.</small>}
                    </div>
                    <div className="team-board-share-controls">
                      <select value={shareRoomId} onChange={(event) => setShareRoomId(event.target.value)} aria-label="Share card with a chat">
                        <option value="">Share with a chat…</option>
                        <option value="global">Global chat</option>
                        {chatRooms.map((room) => <option key={room.roomId} value={room.roomId}>{room.title}</option>)}
                      </select>
                      <button type="button" disabled={!shareRoomId || sharing} onClick={() => void shareToChat()}>
                        <Share2 className="size-3.5" /> {sharing ? 'Sharing…' : 'Share'}
                      </button>
                    </div>
                  </section>

                  <section className="team-board-pair-section">
                    <header><Users className="size-3.5" /> Pair debug</header>
                    {!detail.session || detail.session.state === 'ended' ? (
                      <div className="team-board-session-idle">
                        <p>Open a short-lived pairing room around this exact card.</p>
                        <button type="button" disabled={sessionBusy || detail.permission === 'view'} onClick={() => void (detail.card.isBeacon ? acceptBeacon() : runSessionAction('start'))}>
                          <Sparkles className="size-3.5" /> {detail.card.isBeacon ? 'Accept beacon & join' : 'Start pair session'}
                        </button>
                      </div>
                    ) : (
                      <div className="team-board-session-active">
                        <div className="team-board-session-members">
                          <span className="team-board-session-live"><i /> Pair session live</span>
                          <CollabPresenceStack
                            members={presenceByCard[detail.card.id] ?? detail.session.members.map((member) => ({ username: member.username }))}
                            viewer={username}
                          />
                        </div>
                        {detail.session.focusTarget && (
                          <a className="team-board-session-focus" href={detail.session.focusTarget}>
                            <ExternalLink className="size-3.5" /> Shared focus · open source
                          </a>
                        )}
                        {!detail.session.isParticipant ? (
                          <button type="button" disabled={sessionBusy || detail.permission === 'view'} onClick={() => void runSessionAction('join')}>
                            <Users className="size-3.5" /> Join session
                          </button>
                        ) : (
                          <>
                            {detail.card.sourceUrl && (
                              <button type="button" disabled={sessionBusy} onClick={() => void runSessionAction('focus', { focusTarget: detail.card.sourceUrl })}>
                                <ExternalLink className="size-3.5" /> Sync focus to source
                              </button>
                            )}
                            <label><span>Pair-only scratchpad</span>
                              <textarea value={sessionScratchpad} maxLength={8_000} onChange={(event) => {
                                sessionScratchpadDirtyRef.current = true;
                                setSessionScratchpad(event.target.value);
                              }} />
                            </label>
                            <button type="button" className="team-board-session-save" disabled={sessionBusy} onClick={() => void runSessionAction('scratchpad', { scratchpad: sessionScratchpad })}>
                              <Check className="size-3.5" /> Save scratchpad
                            </button>
                            <label><span>Decision to capture on card</span>
                              <textarea value={decisionDraft} maxLength={2_000} onChange={(event) => setDecisionDraft(event.target.value)} placeholder="What did you decide?" />
                            </label>
                            <button type="button" disabled={sessionBusy || !decisionDraft.trim()} onClick={() => void runSessionAction('decision', { decision: decisionDraft })}>
                              <Check className="size-3.5" /> Capture decision
                            </button>
                            <button type="button" className="team-board-leave" disabled={sessionBusy} onClick={() => void runSessionAction('leave')}>Leave pair session</button>
                          </>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="team-board-comments-section">
                    <header><MessageCircle className="size-3.5" /> Comments <span>{detail.comments.length}</span></header>
                    {detail.comments.map((comment) => (
                      <article className="team-board-comment" key={comment.id}>
                        <div><strong>{comment.author}</strong><time>{relativeTime(comment.createdAt)}</time></div>
                        <p>{comment.markdown}</p>
                        {comment.mentions.length > 0 && <small>{comment.mentions.map((name) => `@${name}`).join(' · ')}</small>}
                      </article>
                    ))}
                    <form onSubmit={(event) => void submitComment(event)}>
                      <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a comment · @mention to invite an editor" maxLength={8_000} />
                      <button type="submit" disabled={!commentDraft.trim()}><Send className="size-3.5" /> Comment</button>
                    </form>
                  </section>

                </div>
                <footer className="team-board-inspector-footer">
                    <label>Status
                      <select value={detail.card.status} disabled={detail.permission === 'view'} onChange={(event) => void saveCardPatch({ status: event.target.value as TeamBoardStatus })}>
                      {LANES.map((lane) => <option key={lane.id} value={lane.id}>{lane.title}</option>)}
                    </select>
                  </label>
                  {detail.card.sourceUrl && <a href={detail.card.sourceUrl}><ExternalLink className="size-3.5" /> Open original</a>}
                </footer>
              </>
            )}
          </aside>
        )}
      </div>

      {createOpen && (
        <div className="team-board-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCreateOpen(false);
        }}>
          <form className="team-board-create-modal" onSubmit={(event) => void submitCard(event)}>
            <header>
              <div className="team-board-create-icon">{isBeacon ? <Radio className="size-5" /> : <Flag className="size-5" />}</div>
              <div><p>{isBeacon ? 'HELP BEACON' : 'NEW CARD'}</p><h2>{isBeacon ? 'Ask for another set of eyes' : 'Add to Team Board'}</h2></div>
              <button type="button" aria-label="Close" onClick={() => setCreateOpen(false)}><X className="size-4" /></button>
            </header>
            <div className="team-board-create-types">
              {CARD_TYPES.map((item) => (
                <button key={item.id} type="button" className={createType === item.id ? 'is-active' : ''} onClick={() => setCreateType(item.id)}>
                  <strong>{item.title}</strong><span>{item.hint}</span>
                </button>
              ))}
            </div>
            <label className="team-board-modal-field">
              <span>Title <b>Required</b></span>
              <input autoFocus required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give this signal a clear name" />
            </label>
            {(createType === 'ticket' || createType === 'incident') && (
              <div className="team-board-create-row">
                <label className="team-board-modal-field"><span>Ticket Number</span><input maxLength={80} value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="Case / ticket number" /></label>
                <label className="team-board-modal-field"><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as TeamBoardSeverity)}>{SEVERITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              </div>
            )}
            <label className="team-board-modal-field">
              <span>Context <small>@mention teammates to notify them and grant edit access</small></span>
              <textarea
                value={description}
                maxLength={12_000}
                onChange={(event) => {
                  const value = event.target.value;
                  setDescription(value);
                  const match = /(?:^|\s)@([\w.-]*)$/.exec(value);
                  setMentionQuery(match ? match[1] : null);
                }}
                placeholder={isBeacon ? 'What are you stuck on? Add relevant context and @someone if you have a person in mind.' : 'Symptoms, impact, what has been tried, known workaround…'}
              />
              {mentionQuery !== null && mentionUsers.length > 0 && (
                <div className="team-board-mention-menu">
                  {mentionUsers.map((person) => (
                    <button key={person.username} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(person)}>
                      <span>{person.username.slice(0, 1).toUpperCase()}</span> @{person.username}
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label className="team-board-modal-field">
              <span>Source link <small>Optional · link a chat, ticket note, Sheet, Mind Map, or Drive file</small></span>
              <input
                type="text"
                value={sourceUrlDraft}
                onChange={(event) => setSourceUrlDraft(event.target.value)}
                placeholder="/collab?type=sheet&document=… or a workspace URL"
              />
            </label>
            <footer><span>{createType === 'announcement' ? <Globe2 className="size-3.5" /> : <Shield className="size-3.5" />}{createType === 'announcement' ? 'Visible to everyone registered' : 'Private until you share or mention someone'}</span><button type="submit" disabled={!title.trim() || saving}>{saving ? 'Creating…' : isBeacon ? 'Send help beacon' : createType === 'announcement' ? 'Publish announcement' : 'Create private card'} <ArrowRight className="size-4" /></button></footer>
          </form>
        </div>
      )}
    </section>
  );
}
