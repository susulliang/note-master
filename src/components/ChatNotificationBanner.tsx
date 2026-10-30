import { ListTodo, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';
import { cn } from '@/lib/utils';

interface ChatNotificationBannerProps {
  username: string;
  isChatOpen: boolean;
  onOpenChat: (roomId: string) => void;
}

interface Notice {
  message?: ChatMessage;
  task?: CollabNotification;
  roomTitle: string;
  roomId: string;
}

function preview(markdown: string): string {
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
}: ChatNotificationBannerProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [globalTitle, setGlobalTitle] = useState('Ecovacs crew');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [visible, setVisible] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);
  const seenIdsRef = useRef(new Set<string>());
  const unreadByRoomRef = useRef(new Map<string, number>());
  const conversationsRef = useRef<ChatConversation[]>([]);
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  const isChatOpenRef = useRef(isChatOpen);
  const onOpenChatRef = useRef(onOpenChat);
  conversationsRef.current = conversations;
  activeRoomIdRef.current = activeRoomId;
  isChatOpenRef.current = isChatOpen;
  onOpenChatRef.current = onOpenChat;
  const roomKey = useMemo(
    () => JSON.stringify(['global', ...conversations.map((conversation) => conversation.roomId)]),
    [conversations],
  );

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current);
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
          setNotice({ task: item, roomTitle: 'Tasks', roomId: `collab-task:${item.id}` });
          setVisible(true);
          notifyCat(`📋 ${item.title} — ${item.body || 'Open Collab Space to review.'}`);
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
              tag: `collab-task-${item.id}`,
            });
            notification.onclick = () => {
              window.focus();
              void markCollabNotificationRead(item.id).catch(() => undefined);
              onOpenChatRef.current(`collab-task:${item.id}`);
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
    };
  }, [globalTitle, roomKey, username]);

  if (!notice) return null;
  const message = notice.message;
  const task = notice.task;
  return (
    <div
      className={cn(
        'fixed left-1/2 top-4 z-[120] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (task) void markCollabNotificationRead(task.id).catch(() => undefined);
          onOpenChat(notice.roomId);
        }}
        className="flex w-full items-center gap-3 rounded-2xl border border-border/80 bg-card/90 p-3 text-left shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur-2xl transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={task ? task.title : `New message from ${message?.username ?? 'teammate'}`}
      >
        {task
          ? <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><ListTodo className="size-5" /></span>
          : <PixelHumanoidAvatar
            seed={message?.avatar?.seed ?? 0}
            rotation={message?.avatar?.rotation ?? 0}
            size={40}
            className="shrink-0 rounded-xl bg-muted/60"
          />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            {task ? <ListTodo className="size-3.5 text-accent" /> : <MessageCircle className="size-3.5 text-accent" />}
            {task ? task.title : message?.username}
            {!task && <span className="font-normal text-muted-foreground">in {notice.roomTitle}</span>}
            {message?.mentions?.some((name) => name.toLowerCase() === username.toLowerCase()) && (
              <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-accent">Mention</span>
            )}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {task ? task.body : preview(message?.markdown ?? '')}
          </span>
        </span>
        <span className="shrink-0 text-[10px] font-medium text-accent">Open</span>
      </button>
    </div>
  );
}
