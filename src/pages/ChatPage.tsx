import {
  ArrowLeft,
  Bold,
  Check,
  Group,
  Globe2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Sticker,
  Table2,
  Underline,
  Users,
  X,
  FileSpreadsheet,
  GitBranch,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import { toast } from 'sonner';
import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';
import {
  loadChatRoomCache,
  saveChatRoomCache,
  upsertCachedChatMessage,
  type ChatMessageCursor,
  type ChatRoomCache,
} from '@/lib/chat-message-cache';
import {
  authorizedChatMediaUrl,
  chatAuthHeaders,
  chatSocketUrl,
  fetchChatConversations,
  fetchChatProfile,
  fetchChatStickers,
  findChatUsers,
  createChatGroup,
  requestChatTicket,
  uploadChatPhoto,
  uploadChatSticker,
  fetchChatGlobalTitle,
  fetchCollabDocuments,
  fetchPinnedChatDocument,
  pinChatDocument,
  setChatDocumentPermission,
  updateChatRoomTitle,
  unpinChatDocument,
  type ChatConversation,
  type ChatAvatarProfile,
  type ChatMessage,
  type ChatSocketTicket,
  type ChatSticker,
  type ChatUser,
  type CollabDocument,
  type PinnedCollabDocument,
} from '@/lib/chat-client';
import { cn } from '@/lib/utils';

interface ChatPageProps {
  username: string;
  canManageChatTitles: boolean;
}

interface ActiveRoom {
  roomId: string;
  title: string;
  kind: 'global' | 'direct' | 'group';
  peerUsername?: string;
  memberCount?: number;
  peerAvatar?: ChatAvatarProfile;
}

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string };
}

function remarkUnderline() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;
      const next: MarkdownNode[] = [];
      for (const child of node.children) {
        if (child.type !== 'text' || !child.value?.includes('++')) {
          visit(child);
          next.push(child);
          continue;
        }
        const parts = child.value.split(/(\+\+.+?\+\+)/g);
        for (const part of parts) {
          if (!part) continue;
          const match = /^\+\+([\s\S]+)\+\+$/.exec(part);
          next.push(match
            ? { type: 'emphasis', data: { hName: 'u' }, children: [{ type: 'text', value: match[1] }] }
            : { type: 'text', value: part });
        }
      }
      node.children = next;
    };
    visit(tree);
  };
}

const MARKDOWN_PLUGINS = [remarkGfm, remarkUnderline];

function SecureChatImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const isPrivateChatMedia = typeof src === 'string' && /^\/api\/chat\/(media|stickers\/(public|private))\//.test(src);
  const isSticker = typeof src === 'string' && src.startsWith('/api/chat/stickers/');
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(isPrivateChatMedia ? undefined : src);

  useEffect(() => {
    if (!isPrivateChatMedia || !src) {
      setLoadedSrc(src);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    fetch(authorizedChatMediaUrl(src), { headers: chatAuthHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error('Photo is unavailable');
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoadedSrc(objectUrl);
      })
      .catch(() => setLoadedSrc(undefined));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isPrivateChatMedia, src]);

  if (!loadedSrc) {
    return (
      <span className={cn(
        'my-2 inline-flex items-center justify-center rounded-xl bg-muted/70 text-[10px] text-muted-foreground',
        isSticker ? 'size-9' : 'h-24 w-36 text-xs',
      )}>
        Loading…
      </span>
    );
  }
  return (
    <img
      {...props}
      src={loadedSrc}
      alt={alt ?? 'Chat attachment'}
      loading="lazy"
      className={cn(
        'my-2 max-w-full rounded-xl border border-border/70 object-contain',
        isSticker ? 'max-h-36 max-w-36' : 'max-h-72',
      )}
    />
  );
}

function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="chat-markdown prose prose-sm max-w-none break-words text-sm leading-relaxed text-foreground/90 prose-headings:mb-2 prose-headings:mt-3 prose-headings:text-foreground prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-accent prose-table:block prose-table:max-w-full prose-table:overflow-x-auto prose-th:border prose-th:border-border prose-th:bg-muted/70 prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1">
      <ReactMarkdown
        remarkPlugins={MARKDOWN_PLUGINS}
        components={{
          img: SecureChatImage,
          a: ({ href, children, ...props }) => (
            <a {...props} href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function markdownToEditorHtml(markdown: string): string {
  if (!markdown.trim()) return '';
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS}>{markdown}</ReactMarkdown>,
  );
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  const children = Array.from(element.childNodes).map(inlineMarkdown).join('');
  switch (element.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return `**${children}**`;
    case 'em':
    case 'i':
      return `*${children}*`;
    case 'u':
      return `++${children}++`;
    case 'span':
      if (element.style.textDecorationLine.includes('underline') || element.style.textDecoration.includes('underline')) {
        return `++${children}++`;
      }
      if (element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600) {
        return `**${children}**`;
      }
      if (element.style.fontStyle === 'italic') return `*${children}*`;
      return children;
    case 'a': {
      const href = element.getAttribute('href') ?? '';
      return `[${children}](${href.replace(/\)/g, '%29')})`;
    }
    case 'code':
      return `\`${element.textContent ?? ''}\``;
    case 'img': {
      const source = element.dataset.chatMarkdownSrc ?? element.getAttribute('src') ?? '';
      const alt = (element.getAttribute('alt') ?? 'Photo').replace(/\]/g, '\\]');
      return `![${alt}](${source})`;
    }
    case 'br':
      return '\n';
    default:
      return children;
  }
}

function editorHtmlToMarkdown(editor: HTMLElement): string {
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes);
    const inline = () => children.map(inlineMarkdown).join('');

    if (['strong', 'b', 'em', 'i', 'u', 'a', 'code', 'img', 'br'].includes(tag)) {
      return inlineMarkdown(element);
    }
    if (tag === 'p' || tag === 'div') return `${children.map(serialize).join('').trimEnd()}\n\n`;
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      return `${'#'.repeat(level)} ${inline().trim()}\n\n`;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = children
        .filter((child) => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
        .map((child, index) => {
          const item = child as HTMLElement;
          const text = Array.from(item.childNodes).map((part) => (
            part instanceof HTMLElement && ['ul', 'ol'].includes(part.tagName.toLowerCase())
              ? serialize(part).trim()
              : inlineMarkdown(part)
          )).filter(Boolean).join(' ').trim();
          return `${tag === 'ol' ? `${index + 1}.` : '-'} ${text}`;
        });
      return `${items.join('\n')}\n\n`;
    }
    if (tag === 'blockquote') {
      return `${children.map(serialize).join('').trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    }
    if (tag === 'pre') return `\`\`\`\n${element.textContent ?? ''}\n\`\`\`\n\n`;
    if (tag === 'table') {
      const rows = Array.from(element.querySelectorAll('tr')).map((row) => (
        Array.from(row.querySelectorAll('th,td')).map((cell) => (
          Array.from(cell.childNodes).map(inlineMarkdown).join('').replace(/\|/g, '\\|').trim()
        ))
      ));
      if (!rows.length) return '';
      const header = rows[0];
      const separator = header.map(() => '---');
      return `| ${header.join(' | ')} |\n| ${separator.join(' | ')} |\n${
        rows.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')
      }\n\n`;
    }
    return children.map(serialize).join('');
  };
  return Array.from(editor.childNodes)
    .map(serialize)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hydrateEditorImages(
  editor: HTMLElement,
  trackObjectUrl: (url: string) => void,
): void {
  const images = editor.querySelectorAll<HTMLImageElement>(
    'img[src^="/api/chat/media/"], img[src^="/api/chat/stickers/"]',
  );
  images.forEach((image) => {
    const markdownSource = image.getAttribute('src');
    if (!markdownSource) return;
    image.dataset.chatMarkdownSrc = markdownSource;
    image.contentEditable = 'false';
    image.className = 'my-1 max-h-32 max-w-full rounded-lg object-contain';
    fetch(authorizedChatMediaUrl(markdownSource), { headers: chatAuthHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error('Attachment unavailable');
        return response.blob();
      })
      .then((blob) => {
        if (!image.isConnected) return;
        const objectUrl = URL.createObjectURL(blob);
        trackObjectUrl(objectUrl);
        image.src = objectUrl;
      })
      .catch(() => {
        image.alt = `${image.alt || 'Attachment'} (unavailable)`;
      });
  });
}

function avatarSeed(name: string): number {
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function fixNewsImagePaths(markdown: string): string {
  return markdown.replace(
    /(!\[[^\]]*\]\()(?:(?:\.\.\/)|(?:\.\/))*assets\//g,
    '$1/news/assets/',
  );
}

function mergeMessage(current: ChatMessage[], next: ChatMessage): ChatMessage[] {
  const exists = current.some((message) => message.id === next.id);
  const merged = exists
    ? current.map((message) => message.id === next.id ? next : message)
    : [...current, next];
  return merged.sort((a, b) => a.createdAt - b.createdAt);
}

async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 24 * 1024 * 1024) throw new Error('Choose a photo smaller than 24 MB to compress.');
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.88;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo compression is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) throw new Error('Could not encode this photo as WebP.');
      if (blob.size <= 512 * 1024) return blob;
      if (attempt % 3 === 2) scale *= 0.82;
      quality = Math.max(0.46, quality - 0.07);
    }
    throw new Error('This photo could not be compressed below 512 KB.');
  } finally {
    bitmap.close();
  }
}

async function compressSticker(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Sticker compression is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Could not encode this sticker as PNG.');
    if (png.size > 512 * 1024) throw new Error('This sticker exceeds 512 KB after compression.');
    return png;
  } finally {
    bitmap.close();
  }
}

export default function ChatPage({ username, canManageChatTitles }: ChatPageProps) {
  const navigate = useNavigate();
  const [activeRoom, setActiveRoom] = useState<ActiveRoom>({
    roomId: 'global',
    title: 'Ecovacs crew',
    kind: 'global',
  });
  const [globalTitle, setGlobalTitle] = useState('Ecovacs crew');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [hasDraft, setHasDraft] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<ChatUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [mobileRoomOpen, setMobileRoomOpen] = useState(true);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'direct' | 'group'>('direct');
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [stickerScope, setStickerScope] = useState<'public' | 'private'>('private');
  const [stickers, setStickers] = useState<ChatSticker[]>([]);
  const [stickerName, setStickerName] = useState('');
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [avatarProfile, setAvatarProfile] = useState<ChatAvatarProfile | null>(null);
  const [pinnedDocument, setPinnedDocument] = useState<PinnedCollabDocument | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [collabDocuments, setCollabDocuments] = useState<CollabDocument[]>([]);
  const [pinDocumentId, setPinDocumentId] = useState('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [permissionUsers, setPermissionUsers] = useState<ChatUser[]>([]);
  const [loadingPin, setLoadingPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingTicketRef = useRef<ChatSocketTicket | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef('');
  const linkRangeRef = useRef<Range | null>(null);
  const editorObjectUrlsRef = useRef<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<ChatMessageCursor | null>(null);
  const hasOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const isOwnMessage = useCallback((message: ChatMessage) => (
    message.source === 'chat' && message.username.toLowerCase() === username.toLowerCase()
  ), [username]);

  const setComposerMarkdown = useCallback((markdown: string) => {
    draftRef.current = markdown;
    setHasDraft(Boolean(markdown.trim()));
    editorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    editorObjectUrlsRef.current = [];
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = markdownToEditorHtml(markdown);
    hydrateEditorImages(editor, (url) => editorObjectUrlsRef.current.push(url));
  }, []);

  const syncComposerMarkdown = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const markdown = editorHtmlToMarkdown(editor);
    if (markdown.length > 20_000) {
      toast.error('Messages are limited to 20,000 characters.');
      setComposerMarkdown(markdown.slice(0, 20_000));
      return;
    }
    draftRef.current = markdown;
    setHasDraft(Boolean(markdown.trim()));
  }, [setComposerMarkdown]);

  useEffect(() => () => {
    editorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    editorObjectUrlsRef.current = [];
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await fetchChatConversations());
    } catch {
      /* The active chat remains usable if the inbox index is unavailable. */
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    let alive = true;
    fetchChatGlobalTitle()
      .then((title) => {
        if (!alive) return;
        setGlobalTitle(title);
        setActiveRoom((room) => room.kind === 'global' ? { ...room, title } : room);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const refreshPinnedDocument = useCallback(async () => {
    try {
      setPinnedDocument(await fetchPinnedChatDocument(activeRoom.roomId));
    } catch (error) {
      setPinnedDocument(null);
      toast.error(error instanceof Error ? error.message : 'Could not load the pinned document.');
    }
  }, [activeRoom.roomId]);

  useEffect(() => {
    setPinnedDocument(null);
    void refreshPinnedDocument();
  }, [refreshPinnedDocument]);

  useEffect(() => {
    if (!pinDialogOpen || !permissionQuery.trim() || !pinnedDocument || pinnedDocument.owner !== username) {
      setPermissionUsers([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void findChatUsers(permissionQuery.trim())
        .then((users) => {
          if (active) setPermissionUsers(users.filter((person) => (
            !pinnedDocument.members.some((member) => member.username.toLowerCase() === person.username.toLowerCase())
          )));
        })
        .catch((error: unknown) => {
          if (active) toast.error(error instanceof Error ? error.message : 'Could not search users.');
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeRoom.kind, permissionQuery, pinDialogOpen, pinnedDocument, username]);

  useEffect(() => {
    const onRoomTitle = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string; title?: string }>).detail;
      if (!detail?.roomId || !detail.title) return;
      setActiveRoom((room) => room.roomId === detail.roomId ? { ...room, title: detail.title! } : room);
      setConversations((current) => current.map((conversation) => (
        conversation.roomId === detail.roomId ? { ...conversation, title: detail.title! } : conversation
      )));
      if (detail.roomId === 'global') setGlobalTitle(detail.title);
    };
    window.addEventListener('econote:chat-room-title', onRoomTitle);
    return () => window.removeEventListener('econote:chat-room-title', onRoomTitle);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchChatProfile()
      .then((profile) => { if (alive) setAvatarProfile(profile); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const refreshStickers = useCallback(async () => {
    try {
      setStickers(await fetchChatStickers());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load sticker packs.');
    }
  }, []);

  useEffect(() => {
    if (!newChatOpen) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearchingUsers(true);
      findChatUsers(userQuery)
        .then((users) => { if (alive) setUserResults(users); })
        .catch((error: unknown) => {
          if (alive) toast.error(error instanceof Error ? error.message : 'Could not search users.');
        })
        .finally(() => { if (alive) setSearchingUsers(false); });
    }, userQuery ? 180 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [newChatOpen, userQuery]);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer = 0;
    let currentSocket: WebSocket | null = null;
    let cacheInitialized = false;
    setConnection('connecting');
    setMessages([]);
    setHasOlderMessages(false);
    hasOlderRef.current = false;
    cursorRef.current = null;
    setLoadingOlder(false);
    loadingOlderRef.current = false;

    const persistRoomCache = (roomMessages: ChatMessage[], initialized = cacheInitialized) => {
      void saveChatRoomCache({
        roomId: activeRoom.roomId,
        messages: roomMessages,
        hasOlder: hasOlderRef.current,
        cursor: cursorRef.current,
        initialized,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    };

    const connect = async () => {
      try {
        let ticket = pendingTicketRef.current;
        if (ticket?.roomId === activeRoom.roomId) pendingTicketRef.current = null;
        else ticket = await requestChatTicket({ roomId: activeRoom.roomId });
        if (stopped) return;
        for (const message of ticket.freshMessages ?? []) {
          void upsertCachedChatMessage(activeRoom.roomId, message).catch(() => undefined);
          setMessages((current) => mergeMessage(current, message));
        }
        const socket = new WebSocket(chatSocketUrl(ticket));
        currentSocket = socket;
        socketRef.current = socket;
        socket.onopen = () => {
          if (!stopped) setConnection('connected');
        };
        socket.onmessage = (event) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (payload.type === 'welcome') {
            if (!cacheInitialized) socket.send(JSON.stringify({ type: 'history:latest' }));
            return;
          }
          if (payload.type === 'history:latest' && Array.isArray(payload.messages)) {
            const latest = payload.messages as ChatMessage[];
            cursorRef.current = (payload.cursor as ChatMessageCursor | null) ?? null;
            hasOlderRef.current = payload.hasOlder === true;
            setHasOlderMessages(hasOlderRef.current);
            setLoadingOlder(false);
            loadingOlderRef.current = false;
            cacheInitialized = true;
            setMessages((current) => {
              const merged = latest.reduce(mergeMessage, current);
              persistRoomCache(merged, true);
              return merged;
            });
            requestAnimationFrame(() => {
              const list = messageListRef.current;
              if (list) list.scrollTop = list.scrollHeight;
            });
            return;
          }
          if (
            payload.type === 'room:title' &&
            typeof payload.roomId === 'string' &&
            typeof payload.title === 'string'
          ) {
            const title = payload.title;
            setActiveRoom((room) => room.roomId === payload.roomId ? { ...room, title } : room);
            if (payload.roomId === 'global') setGlobalTitle(title);
            setConversations((current) => current.map((conversation) => (
              conversation.roomId === payload.roomId ? { ...conversation, title } : conversation
            )));
            return;
          }
          if (
            payload.type === 'pinned-document:changed' &&
            payload.roomId === activeRoom.roomId
          ) {
            void refreshPinnedDocument();
            return;
          }
          if (payload.type === 'history:older' && Array.isArray(payload.messages)) {
            const beforeHeight = messageListRef.current?.scrollHeight ?? 0;
            const older = payload.messages as ChatMessage[];
            cursorRef.current = (payload.cursor as ChatMessageCursor | null) ?? cursorRef.current;
            hasOlderRef.current = payload.hasOlder === true;
            setHasOlderMessages(hasOlderRef.current);
            setLoadingOlder(false);
            loadingOlderRef.current = false;
            setMessages((current) => {
              const merged = older.reduce(mergeMessage, current);
              persistRoomCache(merged);
              return merged;
            });
            requestAnimationFrame(() => {
              const list = messageListRef.current;
              if (list) list.scrollTop += list.scrollHeight - beforeHeight;
            });
            return;
          }
          if (
            (payload.type === 'message:created' || payload.type === 'message:updated') &&
            payload.message && typeof payload.message === 'object'
          ) {
            const list = messageListRef.current;
            const shouldStick = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 180;
            setMessages((current) => mergeMessage(current, payload.message as ChatMessage));
            void upsertCachedChatMessage(activeRoom.roomId, payload.message as ChatMessage).catch(() => undefined);
            if (shouldStick) {
              requestAnimationFrame(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
            }
            if (activeRoom.roomId !== 'global') void refreshConversations();
            return;
          }
          if (payload.type === 'error' && typeof payload.message === 'string') toast.error(payload.message);
        };
        socket.onerror = () => {
          if (!stopped) setConnection('offline');
        };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (stopped) return;
          setConnection('offline');
          reconnectTimer = window.setTimeout(() => { void connect(); }, 1400);
        };
      } catch {
        if (stopped) return;
        setConnection('offline');
        reconnectTimer = window.setTimeout(() => { void connect(); }, 5000);
      }
    };

    void loadChatRoomCache(activeRoom.roomId)
      .catch(() => null)
      .then((cached) => {
        if (stopped) return;
        if (cached) {
          setMessages(cached.messages);
          cacheInitialized = cached.initialized;
          hasOlderRef.current = cached.hasOlder;
          cursorRef.current = cached.cursor;
          setHasOlderMessages(cached.hasOlder);
          requestAnimationFrame(() => {
            const list = messageListRef.current;
            if (list) list.scrollTop = list.scrollHeight;
          });
        }
        void connect();
      });
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      if (currentSocket && currentSocket.readyState < WebSocket.CLOSING) currentSocket.close(1000, 'Room changed');
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
  }, [activeRoom.roomId, refreshConversations, refreshPinnedDocument]);

  useEffect(() => {
    const onScroll = () => {
      const list = messageListRef.current;
      if (!list) return;
      if (
        list.scrollTop < 60 &&
        hasOlderRef.current &&
        !loadingOlderRef.current &&
        cursorRef.current &&
        socketRef.current?.readyState === WebSocket.OPEN
      ) {
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        socketRef.current.send(JSON.stringify({ type: 'history:older', cursor: cursorRef.current }));
      }
    };
    const list = messageListRef.current;
    list?.addEventListener('scroll', onScroll, { passive: true });
    return () => list?.removeEventListener('scroll', onScroll);
  }, []);

  const sendMessage = useCallback(() => {
    const markdown = draftRef.current.trim();
    const socket = socketRef.current;
    if (!markdown || !socket || socket.readyState !== WebSocket.OPEN || sending) return;
    setSending(true);
    socket.send(JSON.stringify(editingId
      ? { type: 'message:edit', id: editingId, markdown }
      : { type: 'message:create', markdown }));
    setComposerMarkdown('');
    setEditingId(null);
    setSending(false);
  }, [editingId, sending, setComposerMarkdown]);

  const openDirectChat = useCallback(async (peerUsername: string, peerAvatar?: ChatAvatarProfile) => {
    try {
      const ticket = await requestChatTicket({ peerUsername });
      pendingTicketRef.current = ticket;
      setActiveRoom({ roomId: ticket.roomId, title: peerUsername, kind: 'direct', peerUsername, memberCount: 2, peerAvatar });
      setNewChatOpen(false);
      setUserQuery('');
      setMobileRoomOpen(true);
      await refreshConversations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start this chat.');
    }
  }, [refreshConversations]);

  const createGroup = useCallback(async () => {
    if (!groupName.trim() || !selectedMembers.length || creatingGroup) return;
    try {
      setCreatingGroup(true);
      const group = await createChatGroup(groupName.trim(), selectedMembers);
      setActiveRoom({
        roomId: group.roomId,
        title: group.title,
        kind: 'group',
        memberCount: group.memberCount,
      });
      setNewChatOpen(false);
      setNewChatMode('direct');
      setGroupName('');
      setSelectedMembers([]);
      setUserQuery('');
      setMobileRoomOpen(true);
      await refreshConversations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the group.');
    } finally {
      setCreatingGroup(false);
    }
  }, [creatingGroup, groupName, refreshConversations, selectedMembers]);

  const saveRoomTitle = useCallback(async () => {
    const title = titleDraft.trim();
    if (!title || !canManageChatTitles) return;
    try {
      const savedTitle = await updateChatRoomTitle(activeRoom.roomId, title);
      setActiveRoom((room) => room.roomId === activeRoom.roomId ? { ...room, title: savedTitle } : room);
      setConversations((current) => current.map((conversation) => (
        conversation.roomId === activeRoom.roomId ? { ...conversation, title: savedTitle } : conversation
      )));
      if (activeRoom.kind === 'global') setGlobalTitle(savedTitle);
      setEditingTitle(false);
      toast.success('Chat title updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the chat title.');
    }
  }, [activeRoom.kind, activeRoom.roomId, canManageChatTitles, titleDraft]);

  const openPinDialog = useCallback(async () => {
    setPinDialogOpen(true);
    setLoadingPin(true);
    setPermissionQuery('');
    try {
      const [documents, pin] = await Promise.all([
        fetchCollabDocuments(),
        fetchPinnedChatDocument(activeRoom.roomId),
      ]);
      setCollabDocuments(documents);
      setPinnedDocument(pin);
      setPinDocumentId(pin?.id ?? '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Collab Space documents.');
    } finally {
      setLoadingPin(false);
    }
  }, [activeRoom.roomId]);

  const savePinnedDocument = useCallback(async () => {
    const document = collabDocuments.find((item) => item.id === pinDocumentId);
    if (!document || savingPin) return;
    try {
      setSavingPin(true);
      const pin = await pinChatDocument(activeRoom.roomId, document.type, document.id);
      setPinnedDocument(pin);
      setPinDocumentId(pin.id);
      toast.success('Document pinned · chat members can now view it.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not pin this document.');
    } finally {
      setSavingPin(false);
    }
  }, [activeRoom.roomId, collabDocuments, pinDocumentId, savingPin]);

  const unpinDocument = useCallback(async () => {
    try {
      await unpinChatDocument(activeRoom.roomId);
      setPinnedDocument(null);
      setPinDocumentId('');
      toast.success('Document unpinned.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unpin this document.');
    }
  }, [activeRoom.roomId]);

  const changeDocumentPermission = useCallback(async (
    targetUsername: string,
    permission: 'view' | 'edit',
  ) => {
    try {
      const pin = await setChatDocumentPermission(activeRoom.roomId, targetUsername, permission);
      setPinnedDocument(pin);
      toast.success(`${targetUsername} can ${permission} this document.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update document access.');
    }
  }, [activeRoom.roomId]);

  const grantDocumentEdit = useCallback(async (person: ChatUser) => {
    await changeDocumentPermission(person.username, 'edit');
    setPermissionQuery('');
    setPermissionUsers([]);
  }, [changeDocumentPermission]);

  const applyFormatting = useCallback((command: 'bold' | 'italic' | 'underline') => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    syncComposerMarkdown();
  }, [syncComposerMarkdown]);

  const applyList = useCallback((command: 'insertUnorderedList' | 'insertOrderedList') => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    syncComposerMarkdown();
  }, [syncComposerMarkdown]);

  const insertTable = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(
      'insertHTML',
      false,
      '<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value</td><td></td></tr></tbody></table><p><br></p>',
    );
    syncComposerMarkdown();
  }, [syncComposerMarkdown]);

  const applyLink = useCallback(() => {
    const rawUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(rawUrl)) {
      toast.error('Use a full http:// or https:// link.');
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection && linkRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(linkRangeRef.current);
    }
    const selectedText = selection?.toString() ?? '';
    if (selectedText) {
      document.execCommand('createLink', false, rawUrl);
    } else {
      const label = linkLabel.trim() || rawUrl;
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${escapeHtml(rawUrl)}">${escapeHtml(label)}</a>`,
      );
    }
    syncComposerMarkdown();
    linkRangeRef.current = null;
    setLinkEditorOpen(false);
    setLinkLabel('');
    setLinkUrl('');
  }, [linkLabel, linkUrl, syncComposerMarkdown]);

  const beginLink = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const hasEditorSelection = !!(
      editor &&
      selection?.rangeCount &&
      editor.contains(selection.anchorNode)
    );
    linkRangeRef.current = hasEditorSelection ? selection!.getRangeAt(0).cloneRange() : null;
    setLinkLabel(hasEditorSelection ? selection?.toString() ?? '' : '');
    setLinkEditorOpen((open) => !open);
  };

  const handlePhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const roomId = activeRoom.roomId;
    try {
      setSending(true);
      const compressed = await compressPhoto(file);
      const mediaUrl = await uploadChatPhoto(roomId, compressed);
      const insertion = `![Photo](${mediaUrl})`;
      const current = draftRef.current;
      setComposerMarkdown(`${current}${current.trim() ? '\n\n' : ''}${insertion}`);
      toast.success(`Photo ready · ${(compressed.size / 1024).toFixed(0)} KB WebP`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add this photo.');
    } finally {
      setSending(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }, [activeRoom.roomId, setComposerMarkdown]);

  const handleStickerFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const fallbackName = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    try {
      setUploadingSticker(true);
      const png = await compressSticker(file);
      const sticker = await uploadChatSticker(stickerName.trim() || fallbackName, stickerScope, png);
      setStickers((current) => [sticker, ...current.filter((item) => item.id !== sticker.id)]);
      toast.success(`Added to your ${stickerScope === 'public' ? 'public' : 'private'} pack.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this sticker.');
    } finally {
      setUploadingSticker(false);
      if (stickerInputRef.current) stickerInputRef.current.value = '';
    }
  }, [stickerName, stickerScope]);

  const insertSticker = useCallback((sticker: ChatSticker) => {
    const url = `/api/chat/stickers/${sticker.scope}/${sticker.id}`;
    const current = draftRef.current;
    setComposerMarkdown(`${current}${current.trim() ? '\n\n' : ''}![sticker: ${sticker.name}](${url})`);
    setStickerPanelOpen(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [setComposerMarkdown]);

  const conversationsByPeer = useMemo(
    () => new Map(conversations
      .filter((conversation) => conversation.peerUsername)
      .map((conversation) => [conversation.peerUsername!.toLowerCase(), conversation])),
    [conversations],
  );

  const toolbarButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      key={label}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:scale-105 hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-45"
    >
      {icon}
    </button>
  );

  const visibleMessages = useMemo(() => messages, [messages]);
  const selectedPinDocument = collabDocuments.find((document) => document.id === pinDocumentId);
  const canUnpinCurrent = !!pinnedDocument && (
    pinnedDocument.pinnedBy.toLowerCase() === username.toLowerCase() ||
    pinnedDocument.owner.toLowerCase() === username.toLowerCase() ||
    canManageChatTitles
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/80 text-foreground">
      <div className="flex min-h-0 flex-1">
        <aside className={cn(
          'w-full shrink-0 flex-col border-r border-border/70 bg-card/25 md:flex md:w-[286px] lg:w-[310px]',
          mobileRoomOpen && 'hidden',
        )}>
          <div className="flex items-center justify-between px-4 pb-3 pt-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Conversations</p>
              <p className="mt-1 text-sm font-medium text-foreground/90">Your workspace</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewChatMode('direct');
                setNewChatOpen(true);
              }}
              aria-label="Start a chat"
              title="Start a chat"
              className="grid size-9 place-items-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground transition hover:scale-105 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <div className="space-y-1 overflow-y-auto px-2 pb-4">
            <button
              type="button"
              onClick={() => {
                setActiveRoom({ roomId: 'global', title: globalTitle, kind: 'global' });
                setMobileRoomOpen(true);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeRoom.kind === 'global' && 'bg-accent/10 ring-1 ring-accent/20',
              )}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                <Globe2 className="size-[18px]" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{globalTitle}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">Global group chat</span>
              </span>
              <Users className="size-4 shrink-0 text-muted-foreground/70" />
            </button>

            {conversations.map((conversation) => {
              const selected = activeRoom.roomId === conversation.roomId;
              const directPeer = conversation.peerUsername;
              return (
                <button
                  key={conversation.roomId}
                  type="button"
                  onClick={() => {
                    setActiveRoom({
                      roomId: conversation.roomId,
                      title: conversation.title,
                      kind: conversation.kind,
                      peerUsername: directPeer,
                      memberCount: conversation.memberCount,
                      peerAvatar: conversation.peerAvatar,
                    });
                    setMobileRoomOpen(true);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'bg-accent/10 ring-1 ring-accent/20',
                  )}
                >
                  {conversation.kind === 'group'
                    ? <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-background/70 text-accent"><Group className="size-4" /></div>
                    : <PixelHumanoidAvatar
                      seed={conversation.peerAvatar?.seed ?? avatarSeed(directPeer ?? conversation.title)}
                      rotation={conversation.peerAvatar?.rotation ?? 0}
                      size={40}
                      className="shrink-0 rounded-full border border-border/70 bg-background/70"
                    />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{conversation.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {conversation.lastMessage || (conversation.kind === 'group'
                        ? `${conversation.memberCount} members`
                        : 'Start a conversation')}
                    </span>
                  </span>
                  {conversation.kind === 'group' && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{conversation.memberCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex items-center gap-3 border-t border-border/60 px-4 py-3">
            <PixelHumanoidAvatar
              seed={avatarProfile?.seed ?? avatarSeed(username)}
              rotation={avatarProfile?.rotation ?? 0}
              size={32}
              className="shrink-0 rounded-full border border-border/60"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{username}</p>
              <p className="text-[10px] text-muted-foreground">Signed in</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewChatMode('group');
                setNewChatOpen(true);
              }}
              className="text-xs text-accent hover:underline"
            >
              New group
            </button>
          </div>
        </aside>

        <main className={cn('flex min-w-0 flex-1 flex-col', !mobileRoomOpen && 'hidden md:flex')}>
          <div className="flex min-h-[66px] shrink-0 items-center gap-3 border-b border-border/60 px-4 sm:px-6">
            <button
              type="button"
              aria-label="Back to conversations"
              onClick={() => setMobileRoomOpen(false)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className={cn(
              'grid size-10 shrink-0 place-items-center rounded-xl',
              activeRoom.kind === 'global' ? 'bg-accent/10 text-accent' : 'border border-border/70 bg-card text-accent',
            )}>
              {activeRoom.kind === 'global'
                ? <Globe2 className="size-[18px]" />
                : activeRoom.kind === 'group'
                  ? <Group className="size-[18px]" />
                  : <PixelHumanoidAvatar
                    seed={activeRoom.peerAvatar?.seed ?? avatarSeed(activeRoom.title)}
                    rotation={activeRoom.peerAvatar?.rotation ?? 0}
                    size={34}
                    className="rounded-lg"
                  />}
            </div>
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <form
                  className="flex min-w-0 items-center gap-1.5"
                  onSubmit={(event) => { event.preventDefault(); void saveRoomTitle(); }}
                >
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    maxLength={60}
                    aria-label="New chat title"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background/80 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingTitle(false);
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Save chat title"
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel title edit"
                    onClick={() => setEditingTitle(false)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="truncate text-sm font-semibold">{activeRoom.title}</h2>
                  {canManageChatTitles && activeRoom.kind !== 'direct' && (
                    <button
                      type="button"
                      aria-label="Edit chat title"
                      title="Edit chat title"
                      onClick={() => {
                        setTitleDraft(activeRoom.title);
                        setEditingTitle(true);
                      }}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="truncate text-xs text-muted-foreground">
                {activeRoom.kind === 'global'
                  ? 'Everyone in the workspace'
                  : activeRoom.kind === 'group'
                    ? `Group · ${activeRoom.memberCount ?? 0} members`
                    : 'Private conversation'}
              </p>
            </div>
            {activeRoom.kind === 'global' && !editingTitle && (
              <div className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-[11px] text-muted-foreground sm:flex">
                <Users className="size-3.5" />
                Global
              </div>
            )}
            <button
              type="button"
              onClick={() => void openPinDialog()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-card/55 px-2.5 text-[10px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:px-3 sm:text-xs"
              aria-label={pinnedDocument ? 'Manage pinned document' : 'Pin a document'}
              title={pinnedDocument ? 'Manage pinned document' : 'Pin a document'}
            >
              <Pin className="size-3.5" />
              <span className="hidden sm:inline">{pinnedDocument ? 'Pinned' : 'Pin doc'}</span>
            </button>
          </div>

          {pinnedDocument && (
            <div className="flex shrink-0 items-center gap-3 border-b border-accent/15 bg-accent/[0.045] px-4 py-2.5 sm:px-6">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                {pinnedDocument.type === 'sheet'
                  ? <FileSpreadsheet className="size-4" />
                  : <GitBranch className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{pinnedDocument.title}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Pinned document · {pinnedDocument.permission === 'edit' ? 'you can edit' : 'view access'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/collab?type=${pinnedDocument.type}&document=${encodeURIComponent(pinnedDocument.id)}`)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent/12 px-2.5 text-[10px] font-semibold text-accent transition hover:bg-accent/20"
              >Open document</button>
              <button
                type="button"
                aria-label="Manage pinned document"
                title="Manage pinned document"
                onClick={() => void openPinDialog()}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              ><Pencil className="size-3.5" /></button>
            </div>
          )}

          <div
            ref={messageListRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-7"
          >
            {loadingOlder && (
              <div className="mb-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="size-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                Loading earlier messages
              </div>
            )}
            {!loadingOlder && hasOlderMessages && (
              <p className="mb-4 text-center text-[10px] text-muted-foreground">Scroll up for earlier messages</p>
            )}
            {visibleMessages.length === 0 && (
              <div className="m-auto max-w-sm text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border/70 bg-card/70 text-accent shadow-sm">
                  {activeRoom.kind === 'global'
                    ? <Globe2 className="size-6" />
                    : activeRoom.kind === 'group'
                      ? <Group className="size-6" />
                      : <MessageCircle className="size-6" />}
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  {activeRoom.kind === 'global'
                    ? 'A shared space for the team'
                    : activeRoom.kind === 'group'
                      ? `Start the ${activeRoom.title} conversation`
                      : `Say hello to ${activeRoom.title}`}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {activeRoom.kind === 'global'
                    ? 'News & Updates are here, alongside new messages from everyone.'
                    : activeRoom.kind === 'group'
                      ? 'Everyone you invited can join this room.'
                      : 'Your conversation is private to you and this teammate.'}
                </p>
              </div>
            )}
            <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
              {visibleMessages.map((message, index) => {
                const mine = isOwnMessage(message);
                const previous = visibleMessages[index - 1];
                const grouped = previous?.username === message.username && message.createdAt - previous.createdAt < 5 * 60_000;
                const news = message.source === 'news';
                return (
                  <article
                    key={message.id}
                    className={cn('group flex gap-3', mine && !news && 'flex-row-reverse')}
                  >
                    {!grouped ? (
                      <div className={cn(
                        'mt-1 grid size-8 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
                        news ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border/70 bg-card/80 text-accent',
                      )}>
                        {news
                          ? <Globe2 className="size-3.5" />
                          : <PixelHumanoidAvatar
                            seed={message.avatar?.seed ?? avatarSeed(message.username)}
                            rotation={message.avatar?.rotation ?? 0}
                            size={32}
                            className="rounded-full"
                          />}
                      </div>
                    ) : <div className="w-8 shrink-0" />}
                    <div className={cn('flex min-w-0 max-w-[min(88%,720px)] flex-col', mine && !news && 'items-end')}>
                      {!grouped && (
                        <div className={cn('mb-1.5 flex items-center gap-2 px-1', mine && !news && 'flex-row-reverse')}>
                          <span className="text-xs font-semibold text-foreground/85">{news ? 'News & Updates' : message.username}</span>
                          {news && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">Pinned source</span>}
                          <time className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</time>
                        </div>
                      )}
                      <div className={cn(
                        'relative rounded-2xl border px-4 py-3 shadow-sm',
                        news
                          ? 'border-primary/15 bg-primary/[0.045]'
                          : mine
                            ? 'rounded-tr-md border-accent/15 bg-accent/[0.09]'
                            : 'rounded-tl-md border-border/70 bg-card/65',
                      )}>
                        <MarkdownBody markdown={news ? fixNewsImagePaths(message.markdown) : message.markdown} />
                        {message.updatedAt > message.createdAt + 1_000 && !news && (
                          <span className="mt-2 block text-right text-[9px] text-muted-foreground">edited</span>
                        )}
                        {mine && !news && (
                          <button
                            type="button"
                            title="Edit message"
                            aria-label="Edit message"
                            onClick={() => {
                              setComposerMarkdown(message.markdown);
                              setEditingId(message.id);
                              editorRef.current?.focus();
                            }}
                            className="absolute -top-2 right-2 grid size-7 place-items-center rounded-lg border border-border/70 bg-background text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                          >
                            <Pencil className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background/75 p-3 sm:px-6 sm:pb-5 sm:pt-4">
            <div className="relative mx-auto w-full">
              <div className="flex min-h-8 flex-wrap items-center gap-0.5 border-b border-border/45 px-2 py-0.5">
                {toolbarButton('Bold', <Bold className="size-3.5" />, () => applyFormatting('bold'))}
                {toolbarButton('Italic', <Italic className="size-3.5" />, () => applyFormatting('italic'))}
                {toolbarButton('Underline', <Underline className="size-3.5" />, () => applyFormatting('underline'))}
                <span className="mx-1 h-5 w-px bg-border/70" />
                {toolbarButton('Bulleted list', <List className="size-3.5" />, () => applyList('insertUnorderedList'))}
                {toolbarButton('Numbered list', <ListOrdered className="size-3.5" />, () => applyList('insertOrderedList'))}
                {toolbarButton('Insert table', <Table2 className="size-3.5" />, insertTable)}
                {toolbarButton('Add link', <Link2 className="size-3.5" />, beginLink)}
                <span className="mx-1 h-5 w-px bg-border/70" />
                {toolbarButton('Add photo', <ImagePlus className="size-3.5" />, () => photoInputRef.current?.click(), sending)}
                {toolbarButton('Sticker packs', <Sticker className="size-3.5" />, () => {
                  const opening = !stickerPanelOpen;
                  setStickerPanelOpen(opening);
                  if (opening) void refreshStickers();
                }, uploadingSticker)}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void handlePhoto(event.target.files?.[0])}
                />
              </div>

              {stickerPanelOpen && (
                <section className="border-b border-border/55 bg-background/45 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border/70 bg-background/75 p-0.5">
                      {(['private', 'public'] as const).map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => setStickerScope(scope)}
                          aria-pressed={stickerScope === scope}
                          className={cn(
                            'rounded-md px-2.5 py-1.5 text-[10px] font-medium capitalize transition',
                            stickerScope === scope ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {scope === 'private' ? 'My pack' : 'Public pack'}
                        </button>
                      ))}
                    </div>
                    <span className="min-w-0 flex-1 text-[10px] text-muted-foreground">
                      {stickerScope === 'public' ? 'Visible to everyone' : 'Only visible in your pack unless shared in a message'}
                    </span>
                    <input
                      value={stickerName}
                      onChange={(event) => setStickerName(event.target.value)}
                      placeholder="Sticker name"
                      aria-label="Sticker name"
                      maxLength={40}
                      className="h-8 w-32 rounded-lg border border-border bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      disabled={uploadingSticker}
                      onClick={() => stickerInputRef.current?.click()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 text-[10px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
                    >
                      <Plus className="size-3.5" />
                      {uploadingSticker ? 'Saving…' : 'Add PNG'}
                    </button>
                    <input
                      ref={stickerInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void handleStickerFile(event.target.files?.[0])}
                    />
                  </div>
                  <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                    {stickers.filter((sticker) => sticker.scope === stickerScope).map((sticker) => (
                      <button
                        key={`${sticker.scope}:${sticker.id}`}
                        type="button"
                        onClick={() => insertSticker(sticker)}
                        title={`${sticker.name} · ${sticker.owner}`}
                        aria-label={`Insert sticker ${sticker.name}`}
                        className="grid size-[58px] place-items-center overflow-hidden rounded-xl border border-border/70 bg-card/70 p-1 transition hover:scale-105 hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <SecureChatImage
                          src={`/api/chat/stickers/${sticker.scope}/${sticker.id}`}
                          alt={sticker.name}
                        />
                      </button>
                    ))}
                    {stickers.filter((sticker) => sticker.scope === stickerScope).length === 0 && (
                      <p className="py-2 text-[10px] text-muted-foreground">
                        No stickers here yet. Add one as a 256 × 256 PNG.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {linkEditorOpen && (
                <div className="flex flex-col gap-2 border-b border-border/55 bg-background/60 p-3 sm:flex-row">
                  <input
                    value={linkLabel}
                    onChange={(event) => setLinkLabel(event.target.value)}
                    placeholder="Link text"
                    aria-label="Link text"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://…"
                    aria-label="Link URL"
                    className="h-9 min-w-0 flex-[1.5] rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyLink();
                      if (event.key === 'Escape') setLinkEditorOpen(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={applyLink}
                    className="grid h-9 place-items-center rounded-lg bg-accent/15 px-3 text-accent hover:bg-accent/20"
                    aria-label="Insert link"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkEditorOpen(false)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Cancel link"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}

              <div className="relative w-full">
                {!hasDraft && (
                  <span className="pointer-events-none absolute left-4 top-4 text-sm text-muted-foreground/75">
                    {editingId ? 'Edit your message…' : `Message ${activeRoom.title}…`}
                  </span>
                )}
                <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Write a formatted chat message"
                aria-multiline="true"
                spellCheck
                onInput={syncComposerMarkdown}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                  if (event.key === 'Escape' && editingId) {
                    setComposerMarkdown('');
                    setEditingId(null);
                  }
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  const plainText = event.clipboardData.getData('text/plain');
                  document.execCommand('insertText', false, plainText);
                  syncComposerMarkdown();
                }}
                className="chat-composer-editor min-h-[164px] max-h-[320px] w-full overflow-y-auto bg-transparent px-4 pb-16 pt-4 text-sm leading-relaxed outline-none [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
              />
              </div>
              <div className="absolute bottom-5 right-5 z-10 flex items-center gap-2">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => { setComposerMarkdown(''); setEditingId(null); }}
                    className="h-8 rounded-lg border border-border/70 bg-card/90 px-3 text-xs text-muted-foreground shadow-sm backdrop-blur-xl transition hover:bg-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!hasDraft || connection !== 'connected'}
                  onClick={sendMessage}
                  className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send className="size-3" />
                  {editingId ? 'Save edit' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {pinDialogOpen && (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-background/55 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPinDialogOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pinned-document-title"
            className="flex max-h-[min(720px,88dvh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/92 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent"><Pin className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="pinned-document-title" className="text-sm font-semibold">Chat document</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">One shared document is pinned in this conversation.</p>
              </div>
              <button
                type="button"
                onClick={() => setPinDialogOpen(false)}
                aria-label="Close document settings"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
              ><X className="size-4" /></button>
            </div>

            {loadingPin ? (
              <div className="grid min-h-40 place-items-center text-xs text-muted-foreground">Loading Collab Space…</div>
            ) : (
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                {pinnedDocument && (
                  <section className="rounded-xl border border-accent/20 bg-accent/[0.055] p-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                        {pinnedDocument.type === 'sheet'
                          ? <FileSpreadsheet className="size-4" />
                          : <GitBranch className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{pinnedDocument.title}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          You have {pinnedDocument.permission} access · {pinnedDocument.owner} owns this document
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/collab?type=${pinnedDocument.type}&document=${encodeURIComponent(pinnedDocument.id)}`)}
                        className="rounded-lg bg-accent/12 px-2.5 py-2 text-[10px] font-semibold text-accent hover:bg-accent/20"
                      >Open</button>
                    </div>

                    <div className="mt-4 border-t border-border/50 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Chat access</p>
                        {pinnedDocument.owner === username && (
                          <span className="text-[9px] text-muted-foreground">View by default · choose edit when needed</span>
                        )}
                      </div>
                      {pinnedDocument.owner === username ? (
                        <>
                          {activeRoom.kind === 'global' && (
                            <div className="mb-2">
                              <label className="relative block">
                                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  value={permissionQuery}
                                  onChange={(event) => setPermissionQuery(event.target.value)}
                                  placeholder="Find someone to grant edit access"
                                  aria-label="Search users to grant edit access"
                                  className="h-9 w-full rounded-lg border border-border bg-background/70 pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                              </label>
                              {permissionUsers.length > 0 && (
                                <div className="mt-1 max-h-24 overflow-y-auto rounded-lg border border-border/65 bg-background/75 p-1">
                                  {permissionUsers.map((person) => (
                                    <button
                                      key={person.username}
                                      type="button"
                                      onClick={() => void grantDocumentEdit(person)}
                                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[10px] hover:bg-muted"
                                    ><span>{person.username}</span><span className="text-accent">Grant edit</span></button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="max-h-40 space-y-1 overflow-y-auto">
                            {pinnedDocument.members.map((member) => (
                              <div key={member.username} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                                <span className="min-w-0 flex-1 truncate text-xs">{member.username}{member.owner ? ' · owner' : ''}</span>
                                {member.owner ? (
                                  <span className="text-[10px] text-accent">Edit</span>
                                ) : (
                                  <select
                                    value={member.permission}
                                    aria-label={`${member.username} document permission`}
                                    onChange={(event) => void changeDocumentPermission(
                                      member.username,
                                      event.target.value === 'edit' ? 'edit' : 'view',
                                    )}
                                    className="h-7 rounded-md border border-border bg-background/80 px-2 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <option value="view">View</option>
                                    <option value="edit">Edit</option>
                                  </select>
                                )}
                              </div>
                            ))}
                            {pinnedDocument.members.length === 0 && (
                              <p className="py-2 text-[10px] text-muted-foreground">
                                Everyone in the global chat can view the pinned document.
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          Everyone in this chat has view access. The document owner can promote specific people to edit.
                        </p>
                      )}
                    </div>
                  </section>
                )}

                <section>
                  <label htmlFor="pin-collab-document" className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {pinnedDocument ? 'Replace pinned document' : 'Choose a document to pin'}
                  </label>
                  <select
                    id="pin-collab-document"
                    value={pinDocumentId}
                    onChange={(event) => setPinDocumentId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background/75 px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a Collab Space document…</option>
                    {collabDocuments.filter((document) => document.permission === 'edit').map((document) => (
                      <option key={`${document.type}:${document.id}`} value={document.id}>
                        {document.type === 'sheet' ? 'Sheet' : 'Mind map'} · {document.title}
                      </option>
                    ))}
                  </select>
                  {collabDocuments.filter((document) => document.permission === 'edit').length === 0 && (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      You need edit access to pin a document. Create one or ask its owner to grant edit access.
                      <button
                        type="button"
                        onClick={() => {
                          setPinDialogOpen(false);
                          navigate('/collab');
                        }}
                        className="ml-1 text-accent hover:underline"
                      >Open Collab Space</button>
                    </p>
                  )}
                  <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                    Pinning automatically gives chat members view access. Editing stays limited to document collaborators you promote.
                  </p>
                </section>
              </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 p-4">
              <div>
                {canUnpinCurrent && (
                  <button
                    type="button"
                    onClick={() => void unpinDocument()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[10px] font-medium text-destructive hover:bg-destructive/10"
                  ><PinOff className="size-3.5" /> Unpin</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPinDialogOpen(false)}
                  className="h-9 rounded-lg border border-border/70 px-3 text-[10px] text-muted-foreground hover:bg-muted"
                >Close</button>
                <button
                  type="button"
                  disabled={
                    !selectedPinDocument ||
                    selectedPinDocument.permission !== 'edit' ||
                    (!!pinnedDocument && !canUnpinCurrent && selectedPinDocument.id !== pinnedDocument.id) ||
                    savingPin ||
                    loadingPin
                  }
                  onClick={() => void savePinnedDocument()}
                  className="h-9 rounded-lg bg-accent px-3 text-[10px] font-semibold text-accent-foreground disabled:opacity-45"
                >{savingPin ? 'Pinning…' : pinnedDocument ? 'Pin selected' : 'Pin document'}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {newChatOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-background/55 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewChatOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-chat-title"
            className="flex max-h-[min(620px,85dvh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
              <div className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent">
                <Users className="size-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="new-chat-title" className="text-sm font-semibold">
                  {newChatMode === 'group' ? 'Create a group chat' : 'Start a direct chat'}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {newChatMode === 'group' ? 'Invite registered people to a shared room' : 'Find anyone with a registered account'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewChatOpen(false)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mx-4 mt-4 inline-flex rounded-xl border border-border/70 bg-background/65 p-1">
              {(['direct', 'group'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setNewChatMode(mode)}
                  aria-pressed={newChatMode === mode}
                  className={cn(
                    'rounded-lg px-4 py-2 text-xs font-medium capitalize transition',
                    newChatMode === mode ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {mode === 'direct' ? 'Direct' : 'Group'}
                </button>
              ))}
            </div>
            {newChatMode === 'group' && (
              <div className="mx-4 mt-3">
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Group name"
                  maxLength={60}
                  aria-label="Group name"
                  className="h-10 w-full rounded-xl border border-border bg-background/70 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {selectedMembers.length} invited · you’ll be included automatically
                </p>
              </div>
            )}
            <label className="relative mx-4 mt-4 block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Search people…"
                className="h-11 w-full rounded-xl border border-border bg-background/70 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="min-h-32 flex-1 overflow-y-auto p-2">
              {searchingUsers && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Looking through the directory…</p>
              )}
              {!searchingUsers && userResults.length === 0 && (
                <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                  {userQuery ? 'No matching users.' : 'No other registered users yet.'}
                </p>
              )}
              {userResults.map((person) => {
                const existing = conversationsByPeer.get(person.username.toLowerCase());
                const selected = selectedMembers.some((member) => member.toLowerCase() === person.username.toLowerCase());
                return (
                  <button
                    key={person.username}
                    type="button"
                    onClick={() => {
                      if (newChatMode === 'direct') {
                        void openDirectChat(person.username, person.avatar);
                      } else {
                        setSelectedMembers((current) => selected
                          ? current.filter((member) => member.toLowerCase() !== person.username.toLowerCase())
                          : [...current, person.username]);
                      }
                    }}
                    aria-pressed={newChatMode === 'group' ? selected : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && newChatMode === 'group' && 'bg-accent/10',
                    )}
                  >
                    <PixelHumanoidAvatar
                      seed={person.avatar?.seed ?? avatarSeed(person.username)}
                      rotation={person.avatar?.rotation ?? 0}
                      size={40}
                      className="rounded-full border border-border/70"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{person.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {newChatMode === 'group' ? (selected ? 'Added to group' : 'Add to group') : (existing ? 'Open conversation' : 'Start a conversation')}
                      </span>
                    </span>
                    {newChatMode === 'group'
                      ? <span className={cn('grid size-5 place-items-center rounded-md border', selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border')}><Check className="size-3.5" /></span>
                      : <MessageCircle className="size-4 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
            {newChatMode === 'group' && (
              <div className="border-t border-border/60 p-3">
                <button
                  type="button"
                  onClick={() => void createGroup()}
                  disabled={!groupName.trim() || selectedMembers.length === 0 || creatingGroup}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-xs font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-45"
                >
                  <Group className="size-4" />
                  {creatingGroup ? 'Creating group…' : 'Create group'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
