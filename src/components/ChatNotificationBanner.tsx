import { ListTodo, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  chatSocketUrl,
  fetchChatConversations,
  fetchChatGlobalTitle,
  fetchCollabNotifications,
  markCollabNotificationRead,
  requestChatTicket,
  type ChatConversation,
  type ChatMessage,
  type ChatSocketTicket,
  type CollabNotification,
} from '@/lib/chat-client';
import { upsertCachedChatMessage } from '@/lib/chat-message-cache';
import ChatAvatar from '@/components/ChatAvatar';
import { cn } from '@/lib/utils';

interface ChatNotificationBannerProps {
  username: string;
  isChatOpen: boolean;
  onOpenChat: (roomId: string) => void;
  onOpenBoard: (cardId: string) => void;
}

interface PublicBoardAnnouncement {
  id: string;
  cardId: string;
  title: string;
  message: string;
  author: string;
}

interface Notice {
  message?: ChatMessage;
  task?: CollabNotification;
  announcement?: PublicBoardAnnouncement;
  roomTitle: string;
  roomId: string;
}

function preview(markdown: string): string {
  if (/^:::team-board-card\s+[0-9a-f-]{36}\s*$/i.test(markdown.trim())) return 'Shared a Team Board card';
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function publishUnreadCount(counts: Map<string, number>): void {
  const count = [...counts.values()].reduce((total, roomCount) => total + roomCount, 0);
  window.dispatchEvent(new CustomEvent('econote:chat-unread-count', { detail: { count } }));
}

/** Mirror a banner notice onto the cat's thought bubble (workspace cat and
 *  desktop cat both listen — see TicketNotesPage + CatDesktopOverlay). */
function notifyCat(text: string): void {
  window.dispatchEvent(new CustomEvent('econote:cat-notify', { detail: { text } }));
}

export default function ChatNotificationBanner({
  username,
  isChatOpen,
  onOpenChat,
  onOpenBoard,
}: ChatNotificationBannerProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [globalTitle, setGlobalTitle] = useState('Ecovacs crew');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [visible, setVisible] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [quickReplyDraft, setQuickReplyDraft] = useState('');
  const [quickReplyError, setQuickReplyError] = useState('');
  const noticeTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);
  const seenIdsRef = useRef(new Set<string>());
  const unreadByRoomRef = useRef(new Map<string, number>());
  const conversationsRef = useRef<ChatConversation[]>([]);
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  const isChatOpenRef = useRef(isChatOpen);
  const onOpenChatRef = useRef(onOpenChat);
  const onOpenBoardRef = useRef(onOpenBoard);
  const socketByRoomRef = useRef(new Map<string, WebSocket>());
  conversationsRef.current = conversations;
  activeRoomIdRef.current = activeRoomId;
  isChatOpenRef.current = isChatOpen;
  onOpenChatRef.current = onOpenChat;
  onOpenBoardRef.current = onOpenBoard;
  const roomKey = useMemo(
    () => JSON.stringify(['global', ...conversations.map((conversation) => conversation.roomId)]),
    [conversations],
  );

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current);
  }, []);

  useEffect(() => {
    const onAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<Partial<PublicBoardAnnouncement>>).detail;
      if (!detail?.id || !detail.cardId) return;
      setNotice({
        announcement: {
          id: detail.id,
          cardId: detail.cardId,
          title: detail.title || 'Team announcement',
          message: detail.message || '',
          author: detail.author || '',
        },
        roomTitle: 'Team Board',
        roomId: `team-board:${detail.cardId}`,
      });
      setQuickReplyOpen(false);
      setVisible(true);
      notifyCat(`Team announcement: ${detail.title || 'New update'}${detail.message ? ` — ${preview(detail.message)}` : ''}`);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => {
        setVisible(false);
        removeTimerRef.current = window.setTimeout(() => setNotice(null), 250);
      }, 6_000);
    };
    window.addEventListener('econote:public-board-announcement', onAnnouncement);
    return () => window.removeEventListener('econote:public-board-announcement', onAnnouncement);
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetchChatConversations()
        .then((items) => { if (alive) setConversations(items); })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refreshTaskMentions = async () => {
      try {
        const notifications = await fetchCollabNotifications();
        if (!alive) return;
        const unread = notifications.filter((notification) => !notification.read_at);
        for (const item of unread) {
          if (seenIdsRef.current.has(item.id)) continue;
          seenIdsRef.current.add(item.id);
          const boardCardId = item.type === 'team_board'
            ? new URL(item.target_url, window.location.origin).searchParams.get('card')
            : null;
          const notificationRoomId = boardCardId
            ? `team-board:${boardCardId}`
            : `collab-task:${item.id}`;
          const notificationLabel = boardCardId ? 'Team Board' : 'Tasks';
          setNotice({ task: item, roomTitle: notificationLabel, roomId: notificationRoomId });
          setVisible(true);
          notifyCat(`📋 ${item.title} — ${item.body || `Open ${notificationLabel} to review.`}`);
          if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
          if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current);
          noticeTimerRef.current = window.setTimeout(() => {
            setVisible(false);
            removeTimerRef.current = window.setTimeout(() => setNotice(null), 250);
          }, 6_000);
          if (
            'Notification' in window &&
            Notification.permission === 'granted' &&
            (document.hidden || !document.hasFocus())
          ) {
            const notification = new Notification(item.title, {
              body: item.body || 'Open Collab Space to review the task.',
              icon: '/favicon.ico',
              tag: `${boardCardId ? 'team-board' : 'collab-task'}-${item.id}`,
            });
            notification.onclick = () => {
              window.focus();
              void markCollabNotificationRead(item.id).catch(() => undefined);
              onOpenChatRef.current(notificationRoomId);
              notification.close();
            };
          }
        }
      } catch {
        /* Keep chat notifications available if task notifications are offline. */
      }
    };
    void refreshTaskMentions();
    const timer = window.setInterval(() => void refreshTaskMentions(), 30_000);
    window.addEventListener('focus', refreshTaskMentions);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshTaskMentions);
    };
  }, []);

  useEffect(() => {
    const onActiveRoom = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string | null }>).detail;
      const roomId = typeof detail?.roomId === 'string' ? detail.roomId : null;
      setActiveRoomId(roomId);
      if (
        roomId &&
        isChatOpenRef.current &&
        document.hasFocus() &&
        !document.hidden &&
        unreadByRoomRef.current.delete(roomId)
      ) {
        publishUnreadCount(unreadByRoomRef.current);
      }
    };
    window.addEventListener('econote:chat-active-room', onActiveRoom);
    return () => window.removeEventListener('econote:chat-active-room', onActiveRoom);
  }, []);

  useEffect(() => {
    const markActiveRoomRead = () => {
      const roomId = activeRoomIdRef.current;
      if (
        !roomId ||
        !isChatOpenRef.current ||
        document.hidden ||
        !document.hasFocus() ||
        !unreadByRoomRef.current.delete(roomId)
      ) return;
      publishUnreadCount(unreadByRoomRef.current);
    };
    markActiveRoomRead();
    window.addEventListener('focus', markActiveRoomRead);
    document.addEventListener('visibilitychange', markActiveRoomRead);
    return () => {
      window.removeEventListener('focus', markActiveRoomRead);
      document.removeEventListener('visibilitychange', markActiveRoomRead);
    };
  }, [activeRoomId, isChatOpen]);

  useEffect(() => {
    let alive = true;
    fetchChatGlobalTitle()
      .then((title) => { if (alive) setGlobalTitle(title); })
      .catch(() => undefined);
    const onRoomTitle = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string; title?: string }>).detail;
      if (detail?.roomId === 'global' && detail.title) setGlobalTitle(detail.title);
    };
    window.addEventListener('econote:chat-room-title', onRoomTitle);
    return () => {
      alive = false;
      window.removeEventListener('econote:chat-room-title', onRoomTitle);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const sockets = new Map<string, WebSocket>();
    const retryTimers = new Set<number>();
    const roomIds = JSON.parse(roomKey) as string[];

    const showNotice = (message: ChatMessage, roomId: string) => {
      if (
        message.source !== 'chat' ||
        message.username.toLowerCase() === username.toLowerCase() ||
        seenIdsRef.current.has(message.id)
      ) return;
      seenIdsRef.current.add(message.id);
      if (seenIdsRef.current.size > 600) {
        const oldest = seenIdsRef.current.values().next().value;
        if (oldest) seenIdsRef.current.delete(oldest);
      }
      const roomTitle = roomId === 'global'
        ? globalTitle
        : conversationsRef.current.find((conversation) => conversation.roomId === roomId)?.title ?? 'Direct message';
      const mentioned = message.mentions?.some((name) => name.toLowerCase() === username.toLowerCase()) ?? false;
      const isFocusedRoom = isChatOpenRef.current &&
        activeRoomIdRef.current === roomId &&
        document.hasFocus() &&
        !document.hidden;
      if (isFocusedRoom) {
        if (unreadByRoomRef.current.delete(roomId)) {
          publishUnreadCount(unreadByRoomRef.current);
        }
        if (!mentioned) return;
      } else {
        unreadByRoomRef.current.set(roomId, (unreadByRoomRef.current.get(roomId) ?? 0) + 1);
        publishUnreadCount(unreadByRoomRef.current);
      }

      setNotice({ message, roomTitle, roomId });
      setVisible(true);
      notifyCat(
        `${mentioned ? '📣 Mentioned you — ' : ''}${message.username} in ${roomTitle}: ${preview(message.markdown) || 'sent a message'}`
      );
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => {
        setVisible(false);
        removeTimerRef.current = window.setTimeout(() => setNotice(null), 250);
      }, 4_500);

      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (
          mentioned ||
          document.hidden ||
          !document.hasFocus() ||
          !isChatOpenRef.current ||
          activeRoomIdRef.current !== roomId
        )
      ) {
        const notification = new Notification(roomTitle, {
          body: `${mentioned ? 'Mentioned you · ' : ''}${message.username}: ${preview(message.markdown) || 'Sent a message'}`,
          icon: '/favicon.ico',
          tag: `chat-${roomId}-${message.id}`,
        });
        notification.onclick = () => {
          window.focus();
          onOpenChatRef.current(roomId);
          notification.close();
        };
      }
    };

    const connect = async (roomId: string) => {
      try {
        const ticket: ChatSocketTicket = await requestChatTicket({ roomId });
        if (stopped) return;
        for (const message of ticket.freshMessages ?? []) {
          void upsertCachedChatMessage(username, roomId, message).catch(() => undefined);
        }
        const socket = new WebSocket(chatSocketUrl(ticket));
        sockets.set(roomId, socket);
        socketByRoomRef.current.set(roomId, socket);
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
            if (
              payload.type === 'room:title' &&
              typeof payload.roomId === 'string' &&
              typeof payload.title === 'string'
            ) {
              window.dispatchEvent(new CustomEvent('econote:chat-room-title', {
                detail: { roomId: payload.roomId, title: payload.title },
              }));
              return;
            }
            if (
              (payload.type === 'message:created' || payload.type === 'message:updated') &&
              payload.message &&
              typeof payload.message === 'object'
            ) {
              const message = payload.message as ChatMessage;
              if (!message.parentId) {
                void upsertCachedChatMessage(username, roomId, message).catch(() => undefined);
              }
              if (payload.type === 'message:created') showNotice(message, roomId);
            }
          } catch {
            /* Ignore malformed events; the primary chat handles its own UI. */
          }
        };
        socket.onclose = () => {
          if (sockets.get(roomId) === socket) sockets.delete(roomId);
          if (socketByRoomRef.current.get(roomId) === socket) socketByRoomRef.current.delete(roomId);
          if (!stopped) {
            const timer = window.setTimeout(() => {
              retryTimers.delete(timer);
              void connect(roomId);
            }, 2_000);
            retryTimers.add(timer);
          }
        };
      } catch {
        if (!stopped) {
          const timer = window.setTimeout(() => {
            retryTimers.delete(timer);
            void connect(roomId);
          }, 8_000);
          retryTimers.add(timer);
        }
      }
    };

    roomIds.forEach((roomId) => { void connect(roomId); });
    return () => {
      stopped = true;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      sockets.forEach((socket) => socket.close(1000, 'Notification rooms changed'));
      sockets.clear();
      socketByRoomRef.current.clear();
    };
  }, [globalTitle, roomKey, username]);

  if (!notice) return null;
  const message = notice.message;
  const task = notice.task;
  const announcement = notice.announcement;
  const sendQuickReply = (event: FormEvent) => {
    event.preventDefault();
    const markdown = quickReplyDraft.trim();
    if (!markdown || !message || message.source !== 'chat') return;
    const socket = socketByRoomRef.current.get(notice.roomId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setQuickReplyError('Reconnecting to this conversation…');
      return;
    }
    socket.send(JSON.stringify({ type: 'message:create', markdown, parentId: message.id }));
    setQuickReplyDraft('');
    setQuickReplyError('');
    setQuickReplyOpen(false);
    setVisible(false);
  };
  return (
    <div
      className={cn(
        'fixed left-1/2 top-4 z-[120] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="flex items-center gap-3 p-3">
          {task || announcement
            ? <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><ListTodo className="size-5" /></span>
            : <ChatAvatar
              username={message?.username ?? ''}
              profile={message?.avatar}
              size={40}
              className="shrink-0 rounded-xl bg-muted/60"
            />}
          <button
            type="button"
            onClick={() => {
              if (task) {
                void markCollabNotificationRead(task.id).catch(() => undefined);
                onOpenChat(notice.roomId);
              } else if (announcement) {
                onOpenBoard(announcement.cardId);
              } else {
                onOpenChat(notice.roomId);
              }
            }}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={task ? task.title : announcement ? announcement.title : `New message from ${message?.username ?? 'teammate'}`}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              {task || announcement ? <ListTodo className="size-3.5 text-accent" /> : <MessageCircle className="size-3.5 text-accent" />}
              {task ? task.title : announcement ? announcement.title : message?.username}
              {announcement && <span className="font-normal text-muted-foreground">from {announcement.author}</span>}
              {!task && !announcement && <span className="font-normal text-muted-foreground">in {notice.roomTitle}</span>}
              {message?.mentions?.some((name) => name.toLowerCase() === username.toLowerCase()) && (
                <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-accent">Mention</span>
              )}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {task ? task.body : announcement ? preview(announcement.message) : preview(message?.markdown ?? '')}
            </span>
          </button>
          {!task && !announcement && (
            <button
              type="button"
              aria-expanded={quickReplyOpen}
              onClick={() => {
                const opening = !quickReplyOpen;
                setQuickReplyOpen(opening);
                setQuickReplyError('');
                if (opening && noticeTimerRef.current !== null) {
                  window.clearTimeout(noticeTimerRef.current);
                  noticeTimerRef.current = null;
                }
              }}
              className="shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-accent transition hover:bg-accent/10"
            >Quick reply</button>
          )}
        </div>
        {quickReplyOpen && message && (
          <form className="flex items-center gap-2 border-t border-border/60 px-3 py-2" onSubmit={sendQuickReply}>
            <input
              autoFocus
              value={quickReplyDraft}
              onChange={(event) => {
                setQuickReplyDraft(event.target.value);
                setQuickReplyError('');
              }}
              maxLength={2_000}
              placeholder={`Reply to ${message.username}…`}
              aria-label="Quick reply to message"
              className="h-8 min-w-0 flex-1 rounded-lg border border-border/70 bg-background/65 px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
            />
            <button type="submit" disabled={!quickReplyDraft.trim()} className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent hover:bg-accent/20 disabled:opacity-40" aria-label="Send quick reply">
              <MessageCircle className="size-3.5" />
            </button>
            {quickReplyError && <span className="text-[9px] text-amber-300">{quickReplyError}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
