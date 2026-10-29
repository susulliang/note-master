import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bold,
  BarChart3,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  File as FileIcon,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo2,
  Forward,
  Group,
  Globe2,
  FolderOpen,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Reply,
  Sparkles,
  Sticker,
  Table2,
  Underline,
  Users,
  X,
  Zap,
  FileSpreadsheet,
  GitBranch,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import { toast } from 'sonner';
import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';
import CollabPresenceStack, { type CollaboratorPresence } from '@/components/CollabPresenceStack';
import {
  loadChatRoomCache,
  peekChatRoomCache,
  saveChatRoomCache,
  upsertCachedChatMessage,
  type ChatMessageCursor,
  type ChatRoomCache,
} from '@/lib/chat-message-cache';
import {
  loadChatConversationCache,
  saveChatConversationCache,
} from '@/lib/chat-conversation-cache';
import {
  authorizedChatMediaUrl,
  chatAuthHeaders,
  chatSocketUrl,
  fetchChatConversations,
  fetchChatProfile,
  fetchChatStickers,
  listCollabDrive,
  shareCollabDriveFileWithChat,
  downloadCollabDriveFile,
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
  type ChatPoll,
  type ChatMessage,
  type ChatSocketTicket,
  type ChatSticker,
  type ChatUser,
  type CollabDriveFile,
  type CollabDocument,
  type PinnedCollabDocument,
} from '@/lib/chat-client';
import { cn } from '@/lib/utils';
import { getWebSocketReconnectDelay, startWebSocketHeartbeat } from '@/lib/websocket-health';
import './ChatPage.css';

const EmbeddedSheetsPage = lazy(() => import('@/pages/SheetsPage'));
const EmbeddedMindmapPage = lazy(() => import('@/pages/MindmapPage'));

const CHAT_HISTORY_WIDTH_KEY = 'econote_chat_history_width';
const MIN_CHAT_HISTORY_WIDTH = 190;
const MAX_CHAT_HISTORY_WIDTH = 380;
const CHAT_PINNED_PANE_WIDTH_KEY = 'econote_chat_pinned_pane_width';
const MIN_CHAT_PINNED_PANE_WIDTH = 35;
const MAX_CHAT_PINNED_PANE_WIDTH = 65;
const CHAT_LIST_PREFS_KEY = 'econote_chat_list_preferences';
const CHAT_MESSAGE_DENSITY_KEY = 'econote_chat_message_density';
const COMPOSER_HEIGHT_KEY = 'econote_chat_composer_height';
const MIN_COMPOSER_HEIGHT = 120;
const MAX_COMPOSER_HEIGHT = 360;
const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '🙂', '🙃',
  '😉', '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🥳', '😏',
  '😔', '😇', '😢', '😭', '😤', '😡', '🤔', '🤗', '🫡', '🙏',
  '👏', '👍', '👎', '👌', '✌️', '🤝', '💪', '❤️', '🧡', '💛',
  '💚', '💙', '💜', '💔', '💯', '🔥', '🎉', '✨', '🚀', '😴',
];

function readChatHistoryWidth(): number {
  try {
    const stored = window.localStorage.getItem(CHAT_HISTORY_WIDTH_KEY);
    if (!stored) return 232;
    const value = Number(stored);
    return Number.isFinite(value)
      ? Math.max(MIN_CHAT_HISTORY_WIDTH, Math.min(MAX_CHAT_HISTORY_WIDTH, value))
      : 232;
  } catch {
    return 232;
  }
}

function readPinnedPaneWidth(): number {
  try {
    const stored = window.localStorage.getItem(CHAT_PINNED_PANE_WIDTH_KEY);
    const value = stored === null ? 50 : Number(stored);
    return Number.isFinite(value)
      ? Math.max(MIN_CHAT_PINNED_PANE_WIDTH, Math.min(MAX_CHAT_PINNED_PANE_WIDTH, value))
      : 50;
  } catch {
    return 50;
  }
}

function PinnedDocumentPane({
  document,
  username,
  widthPercent,
}: {
  document: PinnedCollabDocument;
  username: string;
  widthPercent: number;
}) {
  return (
    <aside className="chat-pinned-document-pane" style={{ flex: `0 0 ${widthPercent}%` }}>
      <div className="chat-pinned-document-editor">
        <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Loading document…</div>}>
          {document.type === 'sheet'
            ? (
              <EmbeddedSheetsPage
                key={`sheet:${document.id}`}
                username={username}
                initialDocumentId={document.id}
                initialDocument={{
                  id: document.id,
                  title: document.title,
                  owner: document.owner,
                  createdAt: document.createdAt,
                  updatedAt: document.updatedAt,
                  memberCount: document.members.length,
                  permission: document.permission,
                }}
                embedded
              />
            )
            : (
              <EmbeddedMindmapPage
                key={`mindmap:${document.id}`}
                username={username}
                initialDocumentId={document.id}
                initialDocument={document}
                embedded
              />
            )}
        </Suspense>
      </div>
    </aside>
  );
}

interface ChatPageProps {
  username: string;
  canManageChatTitles: boolean;
  notificationRoomId?: string | null;
  onNotificationRoomHandled?: (roomId: string) => void;
}

interface ActiveRoom {
  roomId: string;
  title: string;
  kind: 'global' | 'direct' | 'group';
  peerUsername?: string;
  memberCount?: number;
  peerAvatar?: ChatAvatarProfile;
}

interface MessageContextMenuState {
  x: number;
  y: number;
  message: ChatMessage;
  forwarding: boolean;
}

interface ChatListPreferences {
  archivedRoomIds: string[];
  pinnedRoomIds: string[];
  density: 'compact' | 'comfortable';
}

interface ConversationContextMenuState {
  x: number;
  y: number;
  roomId: string;
}

function readChatListPreferences(username: string): ChatListPreferences {
  const defaults: ChatListPreferences = {
    archivedRoomIds: [],
    pinnedRoomIds: [],
    density: 'comfortable',
  };
  try {
    const raw = window.localStorage.getItem(`${CHAT_LIST_PREFS_KEY}:${username.toLowerCase()}`);
    if (!raw) return defaults;
    const value = JSON.parse(raw) as Partial<ChatListPreferences>;
    return {
      archivedRoomIds: Array.isArray(value.archivedRoomIds)
        ? value.archivedRoomIds.filter((id): id is string => typeof id === 'string')
        : [],
      pinnedRoomIds: Array.isArray(value.pinnedRoomIds)
        ? value.pinnedRoomIds.filter((id): id is string => typeof id === 'string')
        : [],
      density: value.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return defaults;
  }
}

function readChatMessageDensity(username: string): 'compact' | 'comfortable' {
  try {
    return window.localStorage.getItem(`${CHAT_MESSAGE_DENSITY_KEY}:${username.toLowerCase()}`) === 'compact'
      ? 'compact'
      : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function readComposerHeight(): number {
  try {
    const stored = Number(window.localStorage.getItem(COMPOSER_HEIGHT_KEY));
    return Number.isFinite(stored)
      ? Math.max(MIN_COMPOSER_HEIGHT, Math.min(MAX_COMPOSER_HEIGHT, stored))
      : 164;
  } catch {
    return 164;
  }
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

function formatDriveFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function chatDriveFileGlyph(file: CollabDriveFile) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.mime_type.startsWith('image/')) return FileImage;
  if (file.mime_type.startsWith('audio/')) return FileAudio2;
  if (file.mime_type.startsWith('video/')) return FileVideo2;
  if (['xls', 'xlsx', 'csv', 'tsv'].includes(extension ?? '')) return FileSpreadsheet;
  if (['doc', 'docx', 'ppt', 'pptx', 'pdf', 'txt', 'md', 'markdown'].includes(extension ?? '')) return FileText;
  return FileIcon;
}

function DriveChatAttachment({ href, children }: { href: string; children: React.ReactNode }) {
  const parsed = new URL(href, window.location.origin);
  const match = /\/api\/collab\/drive\/files\/([0-9a-f-]+)\/download$/i.exec(parsed.pathname);
  const fileId = match?.[1] ?? '';
  const roomId = parsed.searchParams.get('roomId') ?? '';
  const fileName = parsed.searchParams.get('name') ?? 'Shared file';
  const mimeType = parsed.searchParams.get('mime') ?? '';
  const isMedia = /^(image|audio|video)\//i.test(mimeType);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    if (!isMedia) return undefined;
    let active = true;
    let objectUrl: string | null = null;
    setMediaError(false);
    fetch(authorizedChatMediaUrl(href), { headers: chatAuthHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error('File unavailable');
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setMediaUrl(objectUrl);
      })
      .catch(() => {
        if (active) setMediaError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setMediaUrl(null);
    };
  }, [href, isMedia]);

  if (isMedia) {
    if (mediaError) return <span className="text-xs text-muted-foreground">Shared media is unavailable.</span>;
    if (!mediaUrl) return <span className="my-2 inline-flex h-16 w-40 items-center justify-center rounded-xl bg-muted/60 text-xs text-muted-foreground">Loading media…</span>;
    if (mimeType.startsWith('image/')) {
      return <img src={mediaUrl} alt={fileName} loading="lazy" className="my-2 max-h-72 max-w-full rounded-xl border border-border/70 object-contain" />;
    }
    if (mimeType.startsWith('video/')) {
      return <video src={mediaUrl} controls preload="metadata" className="my-2 max-h-72 max-w-full rounded-xl border border-border/70 bg-black/80" />;
    }
    return <audio src={mediaUrl} controls preload="metadata" className="my-2 max-w-full" />;
  }

  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        void downloadCollabDriveFile(fileId, fileName, roomId)
          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Download failed.'));
      }}
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-2.5 py-2 text-xs text-accent no-underline hover:bg-muted/70"
    >
      <FileIcon className="size-4 shrink-0" />
      <span className="truncate">{children || fileName}</span>
      <Download className="size-3.5 shrink-0 opacity-65" />
    </a>
  );
}

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
        isSticker ? 'max-h-36 max-w-36 border-0' : 'max-h-72',
        props.className,
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
          a: ({ href, children, ...props }) => {
            if (typeof href === 'string' && /^\/api\/collab\/drive\/files\/[0-9a-f-]+\/download(?:\?|$)/i.test(href)) {
              return <DriveChatAttachment href={href}>{children}</DriveChatAttachment>;
            }
            return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function extractLinkPreviews(markdown: string): Array<{ href: string; label: string }> {
  const links: Array<{ href: string; label: string }> = [];
  const pattern = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>)\]]+)/gi;
  for (const match of markdown.matchAll(pattern)) {
    const href = (match[2] ?? match[3] ?? '').replace(/[.,!?;:]+$/, '');
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      if (!links.some((link) => link.href === parsed.href)) {
        links.push({ href: parsed.href, label: match[1]?.trim() || parsed.hostname });
      }
    } catch {
      continue;
    }
    if (links.length === 2) break;
  }
  return links;
}

function LinkPreviewCards({ markdown }: { markdown: string }) {
  const links = extractLinkPreviews(markdown);
  if (!links.length) return null;
  return (
    <div className="chat-link-previews">
      {links.map(({ href, label }) => {
        const parsed = new URL(href);
        return (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="chat-link-preview"
          >
            <span className="chat-link-preview-domain">{parsed.hostname}</span>
            <span className="chat-link-preview-title">{label}</span>
            <span className="chat-link-preview-url">{parsed.pathname === '/' ? href : `${parsed.pathname}${parsed.search}`}</span>
          </a>
        );
      })}
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
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
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
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
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

function PollMessageCard({
  poll,
  isSummary,
  onVote,
}: {
  poll: ChatPoll;
  isSummary: boolean;
  onVote: (optionIndex: number) => void;
}) {
  const totalVotes = poll.voteCounts.reduce((total, count) => total + count, 0);
  const highestCount = Math.max(0, ...poll.voteCounts);
  const winnerCount = poll.closed && highestCount > 0
    ? poll.voteCounts.filter((count) => count === highestCount).length
    : 0;
  const remainingHours = Math.max(0, Math.ceil((poll.closesAt - Date.now()) / 3_600_000));

  return (
    <section className="chat-poll-card" aria-label={isSummary ? 'Poll results' : 'Quick poll'}>
      <header className="chat-poll-card-header">
        <span className="chat-poll-card-mark"><BarChart3 className="size-3.5" /></span>
        <span className="chat-poll-card-kicker">{poll.closed ? 'Final tally' : 'Quick poll'}</span>
        <span className="chat-poll-card-votes">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
      </header>
      <h3>{poll.question}</h3>
      <div className="chat-poll-options">
        {poll.options.map((option, index) => {
          const votes = poll.voteCounts[index] ?? 0;
          const percentage = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
          const isWinner = poll.closed && winnerCount === 1 && votes === highestCount;
          return (
            <button
              key={`${poll.id}:${index}`}
              type="button"
              className={cn(
                'chat-poll-option',
                `chat-poll-option--${index % 5}`,
                poll.myVote === index && 'is-selected',
                isWinner && 'is-winner',
              )}
              aria-pressed={poll.myVote === index}
              disabled={poll.closed}
              onClick={() => onVote(index)}
            >
              <span className="chat-poll-option-label">
                <span className="truncate">{option}</span>
                <span>{totalVotes ? `${percentage}% · ` : ''}{votes}</span>
              </span>
              <span className="chat-poll-meter">
                <i style={{ width: `${percentage}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <footer className="chat-poll-card-footer">
        {poll.closed
          ? isSummary
            ? 'The tiny democracy has spoken.'
            : 'Voting is closed. Final results are in.'
          : `Open for ${remainingHours}h · then the tiny democracy closes automatically.`}
      </footer>
    </section>
  );
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

function quoteMessage(message: ChatMessage): string {
  const maxQuotedLength = 16_000;
  const original = message.markdown.trim();
  const shortened = original.length > maxQuotedLength;
  const quoted = original.slice(0, maxQuotedLength).split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  return `> ${message.username} wrote:\n${quoted}${shortened ? '\n> [Quoted message shortened]' : ''}`;
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
  if (file.size > 24 * 1024 * 1024) throw new Error('Choose an image smaller than 24 MB.');
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

export default function ChatPage({
  username,
  canManageChatTitles,
  notificationRoomId = null,
  onNotificationRoomHandled,
}: ChatPageProps) {
  const navigate = useNavigate();
  const [activeRoom, setActiveRoom] = useState<ActiveRoom>({
    roomId: 'global',
    title: 'Ecovacs crew',
    kind: 'global',
  });
  const [globalTitle, setGlobalTitle] = useState('Ecovacs crew');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => peekChatRoomCache(username, 'global')?.messages ?? [],
  );
  const [conversations, setConversations] = useState<ChatConversation[]>(
    () => loadChatConversationCache(username),
  );
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
  const [hasOlderMessages, setHasOlderMessages] = useState(
    () => peekChatRoomCache(username, 'global')?.hasOlder ?? false,
  );
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
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [drivePickerScope, setDrivePickerScope] = useState<'team' | 'personal'>('team');
  const [drivePickerFiles, setDrivePickerFiles] = useState<CollabDriveFile[]>([]);
  const [drivePickerQuery, setDrivePickerQuery] = useState('');
  const [drivePickerLoading, setDrivePickerLoading] = useState(false);
  const [sharingDriveFileId, setSharingDriveFileId] = useState<string | null>(null);
  const [photoDropActive, setPhotoDropActive] = useState(false);
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<ConversationContextMenuState | null>(null);
  const [chatListPreferences, setChatListPreferences] = useState<ChatListPreferences>(
    () => readChatListPreferences(username),
  );
  const [messageDensity, setMessageDensity] = useState<'compact' | 'comfortable'>(
    () => readChatMessageDensity(username),
  );
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [composerHeight, setComposerHeight] = useState(readComposerHeight);
  const [shakeMessage, setShakeMessage] = useState<{ id: string; shakeId: string } | null>(null);
  const [avatarProfile, setAvatarProfile] = useState<ChatAvatarProfile | null>(null);
  const [pinnedDocument, setPinnedDocument] = useState<PinnedCollabDocument | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [collabDocuments, setCollabDocuments] = useState<CollabDocument[]>([]);
  const [pinDocumentId, setPinDocumentId] = useState('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [permissionUsers, setPermissionUsers] = useState<ChatUser[]>([]);
  const [loadingPin, setLoadingPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [roomPresence, setRoomPresence] = useState<CollaboratorPresence[]>([]);
  const threadParentIdRef = useRef<string | null>(null);
  const messageDensityOwnerRef = useRef(username.toLowerCase());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);
  const [mentionSearching, setMentionSearching] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const typingActiveRef = useRef(false);
  const typingRefreshAtRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const pendingTicketRef = useRef<ChatSocketTicket | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef('');
  const linkRangeRef = useRef<Range | null>(null);
  const editorObjectUrlsRef = useRef<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const chatLayoutRef = useRef<HTMLDivElement | null>(null);
  const chatMainRef = useRef<HTMLElement | null>(null);
  const chatRoomBodyRef = useRef<HTMLDivElement | null>(null);
  const resizingHistoryRef = useRef(false);
  const resizingPinnedPaneRef = useRef(false);
  const resizingComposerRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const chatListOwnerRef = useRef(username.toLowerCase());
  const [historyWidth, setHistoryWidth] = useState(readChatHistoryWidth);
  const [canSplitPinnedDocument, setCanSplitPinnedDocument] = useState(false);
  const [pinnedPaneWidth, setPinnedPaneWidth] = useState(readPinnedPaneWidth);
  const pinnedPaneWidthRef = useRef(pinnedPaneWidth);
  pinnedPaneWidthRef.current = pinnedPaneWidth;
  const conversationCacheOwnerRef = useRef(username);
  const cursorRef = useRef<ChatMessageCursor | null>(peekChatRoomCache(username, 'global')?.cursor ?? null);
  const hasOlderRef = useRef(peekChatRoomCache(username, 'global')?.hasOlder ?? false);
  const loadingOlderRef = useRef(false);
  const stopTypingPresence = useCallback(() => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    const socket = socketRef.current;
    if (typingActiveRef.current && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'presence:typing', active: false }));
    }
    typingActiveRef.current = false;
    typingRefreshAtRef.current = 0;
  }, []);
  const refreshTypingPresence = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (!typingActiveRef.current || now - typingRefreshAtRef.current >= 1_800) {
      socket.send(JSON.stringify({ type: 'presence:typing', active: true }));
      typingActiveRef.current = true;
      typingRefreshAtRef.current = now;
    }
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(stopTypingPresence, 2_400);
  }, [stopTypingPresence]);
  const isOwnMessage = useCallback((message: ChatMessage) => (
    message.source === 'chat' && message.username.toLowerCase() === username.toLowerCase()
  ), [username]);

  const selectChatRoom = useCallback((room: ActiveRoom) => {
    const cached = peekChatRoomCache(username, room.roomId);
    setMessages(cached?.messages ?? []);
    setHasOlderMessages(cached?.hasOlder ?? false);
    hasOlderRef.current = cached?.hasOlder ?? false;
    cursorRef.current = cached?.cursor ?? null;
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    setMessageContextMenu(null);
    setConversationContextMenu(null);
    setShakeMessage(null);
    setThreadParent(null);
    setThreadMessages([]);
    setThreadLoading(false);
    setRoomPresence([]);
    threadParentIdRef.current = null;
    setChatListPreferences((current) => current.archivedRoomIds.includes(room.roomId)
      ? { ...current, archivedRoomIds: current.archivedRoomIds.filter((id) => id !== room.roomId) }
      : current);
    setActiveRoom(room);
    setMobileRoomOpen(true);
  }, [username]);

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    void Notification.requestPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('econote:chat-active-room', {
      detail: { roomId: activeRoom.roomId },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('econote:chat-active-room', {
        detail: { roomId: null },
      }));
    };
  }, [activeRoom.roomId]);

  useEffect(() => {
    if (!notificationRoomId) return undefined;
    let alive = true;
    const openRoom = (items: ChatConversation[]) => {
      if (!alive) return;
      const conversation = items.find((item) => item.roomId === notificationRoomId);
      if (conversation) {
        selectChatRoom({
          roomId: conversation.roomId,
          title: conversation.title,
          kind: conversation.kind,
          peerUsername: conversation.peerUsername,
          memberCount: conversation.memberCount,
          peerAvatar: conversation.peerAvatar,
        });
      } else if (notificationRoomId === 'global') {
        selectChatRoom({ roomId: 'global', title: globalTitle, kind: 'global' });
      } else {
        selectChatRoom({ roomId: 'global', title: globalTitle, kind: 'global' });
      }
      onNotificationRoomHandled?.(notificationRoomId);
    };
    const cached = conversations.find((item) => item.roomId === notificationRoomId);
    if (cached || notificationRoomId === 'global') {
      openRoom(conversations);
    } else {
      void fetchChatConversations()
        .then((items) => {
          if (!alive) return;
          setConversations(items);
          openRoom(items);
        })
        .catch(() => {
          if (alive) openRoom(conversations);
        });
    }
    return () => { alive = false; };
  }, [
    conversations,
    globalTitle,
    notificationRoomId,
    onNotificationRoomHandled,
    selectChatRoom,
  ]);

  useEffect(() => {
    const owner = username.toLowerCase();
    if (chatListOwnerRef.current !== owner) {
      chatListOwnerRef.current = owner;
      setChatListPreferences(readChatListPreferences(username));
      return;
    }
    try {
      window.localStorage.setItem(
        `${CHAT_LIST_PREFS_KEY}:${owner}`,
        JSON.stringify(chatListPreferences),
      );
    } catch {
      /* Keep chat-list controls usable when storage is unavailable. */
    }
  }, [chatListPreferences, username]);

  useEffect(() => {
    const owner = username.toLowerCase();
    if (messageDensityOwnerRef.current !== owner) {
      messageDensityOwnerRef.current = owner;
      setMessageDensity(readChatMessageDensity(username));
      return;
    }
    try {
      window.localStorage.setItem(`${CHAT_MESSAGE_DENSITY_KEY}:${owner}`, messageDensity);
    } catch {
      /* Keep the message density control usable if storage is unavailable. */
    }
  }, [messageDensity, username]);

  useEffect(() => {
    if (!conversationContextMenu) return undefined;
    const closeMenu = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-chat-list-menu]')) return;
      setConversationContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConversationContextMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [conversationContextMenu]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizingComposerRef.current) return;
      setComposerHeight(Math.max(
        MIN_COMPOSER_HEIGHT,
        Math.min(MAX_COMPOSER_HEIGHT, resizingComposerRef.current.startHeight + resizingComposerRef.current.startY - event.clientY),
      ));
    };
    const stop = () => {
      if (!resizingComposerRef.current) return;
      resizingComposerRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(COMPOSER_HEIGHT_KEY, String(composerHeight));
      } catch {
        /* Keep the composer resizer usable when storage is unavailable. */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [composerHeight]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizingHistoryRef.current || !chatLayoutRef.current) return;
      const bounds = chatLayoutRef.current.getBoundingClientRect();
      setHistoryWidth(Math.max(
        MIN_CHAT_HISTORY_WIDTH,
        Math.min(MAX_CHAT_HISTORY_WIDTH, event.clientX - bounds.left),
      ));
    };
    const stop = () => {
      if (!resizingHistoryRef.current) return;
      resizingHistoryRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(CHAT_HISTORY_WIDTH_KEY, String(historyWidth));
      } catch {
        /* Keep resizing usable when storage is unavailable. */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [historyWidth]);

  useEffect(() => {
    const main = chatMainRef.current;
    if (!main) return undefined;
    const measure = () => setCanSplitPinnedDocument(main.clientWidth >= 1080);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!messageContextMenu) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-chat-message-menu]')) return;
      setMessageContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMessageContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [messageContextMenu]);

  useEffect(() => {
    if (!shakeMessage) return undefined;
    const timer = window.setTimeout(() => {
      setShakeMessage((current) => current?.shakeId === shakeMessage.shakeId ? null : current);
    }, 6_200);
    return () => window.clearTimeout(timer);
  }, [shakeMessage]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizingPinnedPaneRef.current || !chatRoomBodyRef.current) return;
      const bounds = chatRoomBodyRef.current.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const percent = ((event.clientX - bounds.left) / bounds.width) * 100;
      setPinnedPaneWidth(Math.max(
        MIN_CHAT_PINNED_PANE_WIDTH,
        Math.min(MAX_CHAT_PINNED_PANE_WIDTH, percent),
      ));
    };
    const stop = () => {
      if (!resizingPinnedPaneRef.current) return;
      resizingPinnedPaneRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(CHAT_PINNED_PANE_WIDTH_KEY, String(pinnedPaneWidthRef.current));
      } catch {
        /* Keep the document splitter usable when storage is unavailable. */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

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

  const createQuickPoll = useCallback((questionValue: string, optionValues: string[]) => {
    if (threadParentIdRef.current) {
      toast.error('Close the thread before creating a room poll.');
      return false;
    }
    if (editingId) {
      toast.error('Finish editing your message before creating a poll.');
      return false;
    }
    const question = questionValue.trim().replace(/\s+/g, ' ').slice(0, 240);
    const options = [...new Map(optionValues
      .map((option) => option.trim().replace(/\s+/g, ' ').slice(0, 80))
      .filter(Boolean)
      .map((option) => [option.toLowerCase(), option])).values()];
    if (!question || options.length < 2 || options.length > 6) {
      toast.error('Add a question and 2–6 different options.');
      return false;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error('Reconnect to the room before creating a poll.');
      return false;
    }
    try {
      socket.send(JSON.stringify({ type: 'poll:create', question, options }));
    } catch {
      toast.error('The poll could not be sent. Please reconnect and try again.');
      return false;
    }
    stopTypingPresence();
    setComposerMarkdown('');
    setEditingId(null);
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollComposerOpen(false);
    setStickerPanelOpen(false);
    setDrivePickerOpen(false);
    return true;
  }, [editingId, setComposerMarkdown, stopTypingPresence]);

  const loadDrivePickerFiles = useCallback(async (scope: 'team' | 'personal') => {
    setDrivePickerLoading(true);
    try {
      const directory = await listCollabDrive(scope, null, {
        allFiles: true,
        chatRoomId: activeRoom.roomId,
      });
      setDrivePickerFiles(directory.files);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Drive files.');
    } finally {
      setDrivePickerLoading(false);
    }
  }, [activeRoom.roomId]);

  const addDriveFileToDraft = useCallback(async (file: CollabDriveFile) => {
    if (sharingDriveFileId) return;
    setSharingDriveFileId(file.id);
    try {
      const { downloadUrl } = await shareCollabDriveFileWithChat(file.id, activeRoom.roomId);
      const current = draftRef.current;
      const attachment = `[${escapeMarkdownText(file.name)}](${downloadUrl})`;
      const next = `${current}${current.trim() ? '\n\n' : ''}${attachment}`;
      if (next.length > 20_000) throw new Error('Messages are limited to 20,000 characters.');
      setComposerMarkdown(next);
      setDrivePickerOpen(false);
      setDrivePickerQuery('');
      requestAnimationFrame(() => editorRef.current?.focus());
      toast.success('Drive link added to the message.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share this Drive file.');
    } finally {
      setSharingDriveFileId(null);
    }
  }, [activeRoom.roomId, setComposerMarkdown, sharingDriveFileId]);

  const visibleDrivePickerFiles = useMemo(() => {
    const query = drivePickerQuery.trim().toLocaleLowerCase();
    return query
      ? drivePickerFiles.filter((file) => file.name.toLocaleLowerCase().includes(query))
      : drivePickerFiles;
  }, [drivePickerFiles, drivePickerQuery]);

  useEffect(() => {
    setDrivePickerOpen(false);
    setDrivePickerFiles([]);
    setDrivePickerQuery('');
  }, [activeRoom.roomId]);

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
    const mentionMatch = /(?:^|\s)@([A-Za-z0-9_.-]*)$/.exec(markdown);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);
  }, [setComposerMarkdown]);

  const focusComposerAtEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }, []);

  const insertComposerText = useCallback((text: string) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const selectionInEditor = !!editor && !!selection?.anchorNode &&
      editor.contains(selection.anchorNode) && !!selection?.focusNode &&
      editor.contains(selection.focusNode);
    if (selectionInEditor && editor) {
      editor.focus();
      document.execCommand('insertText', false, text);
      syncComposerMarkdown();
      return;
    }
    const current = draftRef.current;
    const next = `${current}${current.trim() ? '\n\n' : ''}${text}`;
    if (next.length > 20_000) toast.error('Messages are limited to 20,000 characters; added text was shortened.');
    setComposerMarkdown(next.slice(0, 20_000));
    focusComposerAtEnd();
  }, [focusComposerAtEnd, setComposerMarkdown, syncComposerMarkdown]);

  const insertMention = useCallback((person: ChatUser) => {
    const current = draftRef.current;
    const next = current.replace(/(^|\s)@[\w.-]*$/, (_match, prefix: string) => `${prefix}@${person.username} `);
    setComposerMarkdown(next);
    setMentionQuery(null);
    setMentionUsers([]);
    focusComposerAtEnd();
  }, [focusComposerAtEnd, setComposerMarkdown]);

  useEffect(() => () => {
    editorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    editorObjectUrlsRef.current = [];
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const next = await fetchChatConversations();
      if (conversationCacheOwnerRef.current === username) setConversations(next);
    } catch {
      /* The active chat remains usable if the inbox index is unavailable. */
    }
  }, [username]);

  useEffect(() => {
    if (conversationCacheOwnerRef.current !== username) {
      conversationCacheOwnerRef.current = username;
      setConversations(loadChatConversationCache(username));
      return;
    }
    saveChatConversationCache(username, conversations);
  }, [conversations, username]);

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
    if (mentionQuery === null) {
      setMentionUsers([]);
      setMentionSearching(false);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setMentionSearching(true);
      void findChatUsers(mentionQuery)
        .then((users) => { if (alive) setMentionUsers(users); })
        .catch(() => { if (alive) setMentionUsers([]); })
        .finally(() => { if (alive) setMentionSearching(false); });
    }, mentionQuery ? 160 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mentionQuery]);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer = 0;
    let socketConnectTimer = 0;
    let stableConnectionTimer = 0;
    let reconnectAttempt = 0;
    let currentSocket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof startWebSocketHeartbeat> | null = null;
    let ticketController: AbortController | null = null;
    let cacheInitialized = peekChatRoomCache(username, activeRoom.roomId)?.initialized ?? false;
    setConnection('connecting');
    setRoomPresence([]);
    setLoadingOlder(false);
    loadingOlderRef.current = false;

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      setConnection('offline');
      setRoomPresence([]);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, getWebSocketReconnectDelay(reconnectAttempt));
      reconnectAttempt += 1;
    };

    const persistRoomCache = (roomMessages: ChatMessage[], initialized = cacheInitialized) => {
      void saveChatRoomCache(username, {
        roomId: activeRoom.roomId,
        messages: roomMessages,
        hasOlder: hasOlderRef.current,
        cursor: cursorRef.current,
        initialized,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    };

    const connect = async () => {
      if (stopped) return;
      setConnection('connecting');
      try {
        let ticket = pendingTicketRef.current;
        if (ticket?.roomId === activeRoom.roomId) pendingTicketRef.current = null;
        else {
          const controller = new AbortController();
          ticketController = controller;
          const timeout = window.setTimeout(() => controller.abort(), 15_000);
          try {
            ticket = await requestChatTicket({ roomId: activeRoom.roomId }, controller.signal);
          } finally {
            window.clearTimeout(timeout);
            if (ticketController === controller) ticketController = null;
          }
        }
        if (stopped) return;
        for (const message of ticket.freshMessages ?? []) {
          void upsertCachedChatMessage(username, activeRoom.roomId, message).catch(() => undefined);
          setMessages((current) => mergeMessage(current, message));
        }
        const socket = new WebSocket(chatSocketUrl(ticket));
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
            setConnection('offline');
            try {
              socket.close(4000, 'Heartbeat timeout');
            } catch {
              /* The socket may already be closing. */
            }
            scheduleReconnect();
          });
        };
        socket.onmessage = (event) => {
          if (stopped) return;
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
          if (payload.type === 'presence:update' && Array.isArray(payload.participants)) {
            setRoomPresence(payload.participants as CollaboratorPresence[]);
            return;
          }
          if (
            payload.type === 'poll:update' &&
            payload.poll &&
            typeof payload.poll === 'object' &&
            typeof (payload.poll as ChatPoll).id === 'string'
          ) {
            const poll = payload.poll as ChatPoll;
            const updatePoll = (message: ChatMessage) => (
              message.pollId === poll.id ? { ...message, poll } : message
            );
            setMessages((current) => {
              const next = current.map(updatePoll);
              persistRoomCache(next);
              return next;
            });
            setThreadMessages((current) => current.map(updatePoll));
            setThreadParent((current) => current?.pollId === poll.id ? { ...current, poll } : current);
            return;
          }
          if (payload.type === 'welcome') {
            socket.send(JSON.stringify({ type: 'history:latest' }));
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
          if (
            payload.type === 'thread:messages' &&
            payload.parent &&
            typeof payload.parent === 'object' &&
            Array.isArray(payload.messages) &&
            (payload.parent as ChatMessage).id === threadParentIdRef.current
          ) {
            const parent = payload.parent as ChatMessage;
            setThreadParent(parent);
            setThreadMessages(payload.messages as ChatMessage[]);
            setThreadLoading(false);
            setMessages((current) => current.map((message) => message.id === parent.id
              ? { ...message, threadCount: parent.threadCount }
              : message));
            return;
          }
          if (payload.type === 'thread:count' && typeof payload.parentId === 'string') {
            const count = Number(payload.count) || 0;
            setMessages((current) => current.map((message) => message.id === payload.parentId
              ? { ...message, threadCount: count }
              : message));
            setThreadParent((current) => current?.id === payload.parentId
              ? { ...current, threadCount: count }
              : current);
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
            payload.type === 'message:shake' &&
            typeof payload.id === 'string' &&
            typeof payload.shakeId === 'string'
          ) {
            setShakeMessage({ id: payload.id, shakeId: payload.shakeId });
            requestAnimationFrame(() => {
              messageListRef.current
                ?.querySelector<HTMLElement>(`[data-chat-message-id="${payload.id as string}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            return;
          }
          if (
            (payload.type === 'message:created' || payload.type === 'message:updated') &&
            payload.message && typeof payload.message === 'object'
          ) {
            const incoming = payload.message as ChatMessage;
            if (incoming.parentId) {
              if (incoming.parentId === threadParentIdRef.current) {
                setThreadMessages((current) => mergeMessage(current, incoming));
                setThreadLoading(false);
              }
              return;
            }
            const list = messageListRef.current;
            const shouldStick = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 180;
            setMessages((current) => mergeMessage(current, incoming));
            void upsertCachedChatMessage(username, activeRoom.roomId, incoming).catch(() => undefined);
            if (shouldStick) {
              requestAnimationFrame(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
            }
            if (activeRoom.roomId !== 'global') void refreshConversations();
            return;
          }
          if (payload.type === 'error' && typeof payload.message === 'string') toast.error(payload.message);
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
          setRoomPresence([]);
          window.clearTimeout(stableConnectionTimer);
          if (socketRef.current === socket) socketRef.current = null;
          scheduleReconnect();
        };
      } catch {
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
    void loadChatRoomCache(username, activeRoom.roomId)
      .catch(() => null)
      .then((cached) => {
        if (stopped) return;
        if (cached) {
          setMessages((current) => cached.messages.reduce(mergeMessage, current));
          cacheInitialized = cached.initialized;
          hasOlderRef.current = cached.hasOlder;
          cursorRef.current = cached.cursor;
          setHasOlderMessages(cached.hasOlder);
          requestAnimationFrame(() => {
            const list = messageListRef.current;
            if (list) list.scrollTop = list.scrollHeight;
          });
        }
      });
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(socketConnectTimer);
      window.clearTimeout(stableConnectionTimer);
      window.removeEventListener('online', handleOnline);
      ticketController?.abort();
      heartbeat?.stop();
      stopTypingPresence();
      if (currentSocket && currentSocket.readyState < WebSocket.CLOSING) currentSocket.close(1000, 'Room changed');
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
    }, [activeRoom.roomId, refreshConversations, refreshPinnedDocument, stopTypingPresence, username]);

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
    const pollCommand = /^\/poll(?:\s+([\s\S]*))?$/i.exec(markdown);
    if (pollCommand) {
      if (threadParentIdRef.current) {
        toast.error('Close the thread before creating a room poll.');
        return;
      }
      if (editingId) {
        toast.error('Finish editing your message before creating a poll.');
        return;
      }
      const parts = (pollCommand[1] ?? '').split('|').map((part) => part.trim());
      if (parts.length >= 3) {
        createQuickPoll(parts[0], parts.slice(1));
      } else {
        setPollQuestion(parts[0] ?? '');
        const prefilled = parts.slice(1, 7);
        while (prefilled.length < 2) prefilled.push('');
        setPollOptions(prefilled);
        setPollComposerOpen(true);
        setComposerMarkdown('');
      }
      return;
    }
    const socket = socketRef.current;
    if (!markdown || !socket || socket.readyState !== WebSocket.OPEN || sending) return;
    stopTypingPresence();
    setSending(true);
    socket.send(JSON.stringify(editingId
      ? { type: 'message:edit', id: editingId, markdown }
      : { type: 'message:create', markdown, parentId: threadParentIdRef.current ?? undefined }));
    setComposerMarkdown('');
    setEditingId(null);
    setSending(false);
  }, [createQuickPoll, editingId, sending, setComposerMarkdown, stopTypingPresence]);

  const openThread = useCallback((message: ChatMessage) => {
    threadParentIdRef.current = message.id;
    setThreadParent(message);
    setThreadMessages([]);
    setThreadLoading(true);
    requestAnimationFrame(() => {
      const list = messageListRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }, []);

  const closeThread = useCallback(() => {
    threadParentIdRef.current = null;
    setThreadParent(null);
    setThreadMessages([]);
    setThreadLoading(false);
  }, []);

  useEffect(() => {
    if (!threadParent || connection !== 'connected') return;
    socketRef.current?.send(JSON.stringify({ type: 'thread:load', parentId: threadParent.id }));
    setThreadLoading(true);
  }, [connection, threadParent?.id]);

  const openDirectChat = useCallback(async (peerUsername: string, peerAvatar?: ChatAvatarProfile) => {
    try {
      const ticket = await requestChatTicket({ peerUsername });
      pendingTicketRef.current = ticket;
      selectChatRoom({
        roomId: ticket.roomId,
        title: peerUsername,
        kind: 'direct',
        peerUsername,
        memberCount: 2,
        peerAvatar,
      });
      setNewChatOpen(false);
      setUserQuery('');
      await refreshConversations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start this chat.');
    }
  }, [refreshConversations, selectChatRoom]);

  const createGroup = useCallback(async () => {
    if (!groupName.trim() || !selectedMembers.length || creatingGroup) return;
    try {
      setCreatingGroup(true);
      const group = await createChatGroup(groupName.trim(), selectedMembers);
      selectChatRoom({
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
      await refreshConversations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the group.');
    } finally {
      setCreatingGroup(false);
    }
  }, [creatingGroup, groupName, refreshConversations, selectChatRoom, selectedMembers]);

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

  const handlePhotoFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      if (files.length) toast.error('Drop image files to attach them to chat.');
      return;
    }
    const roomId = activeRoom.roomId;
    try {
      setSending(true);
      let totalBytes = 0;
      for (const file of imageFiles) {
        const compressed = await compressPhoto(file);
        const mediaUrl = await uploadChatPhoto(roomId, compressed);
        const current = draftRef.current;
        const insertion = `![${escapeMarkdownText(file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Photo')}](${mediaUrl})`;
        setComposerMarkdown(`${current}${current.trim() ? '\n\n' : ''}${insertion}`);
        totalBytes += compressed.size;
      }
      toast.success(`${imageFiles.length} photo${imageFiles.length === 1 ? '' : 's'} ready · ${(totalBytes / 1024).toFixed(0)} KB WebP`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add this photo.');
    } finally {
      setSending(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }, [activeRoom.roomId, setComposerMarkdown]);

  const handlePhoto = useCallback((file?: File) => {
    if (file) void handlePhotoFiles([file]);
  }, [handlePhotoFiles]);

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
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:scale-105 hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-45"
    >
      {icon}
    </button>
  );

  const insertEmoji = useCallback((emoji: string) => {
    insertComposerText(emoji);
  }, [insertComposerText]);

  const replyToMessage = useCallback((message: ChatMessage) => {
    setEditingId(null);
    const current = draftRef.current;
    const reply = `${current}${current.trim() ? '\n\n' : ''}${quoteMessage(message)}\n\n`;
    if (reply.length > 20_000) toast.error('Messages are limited to 20,000 characters; the quote was shortened.');
    setComposerMarkdown(reply.slice(0, 20_000));
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const responseLine = document.createElement('p');
      responseLine.appendChild(document.createElement('br'));
      editor.appendChild(responseLine);
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(responseLine);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    setMessageContextMenu(null);
  }, [setComposerMarkdown]);

  const copyMessage = useCallback(async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.markdown);
      toast.success('Message copied.');
    } catch {
      toast.error('Clipboard access is unavailable.');
    }
    setMessageContextMenu(null);
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) toast.info('Clipboard is empty.');
      else insertComposerText(text);
    } catch {
      toast.error('Clipboard access is unavailable.');
    }
    setMessageContextMenu(null);
  }, [insertComposerText]);

  const toggleMessageGlow = useCallback((message: ChatMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error('Reconnect to chat before changing message effects.');
      setMessageContextMenu(null);
      return;
    }
    socket.send(JSON.stringify({
      type: 'message:glow',
      id: message.id,
      glowing: message.glowing !== true,
    }));
    setMessageContextMenu(null);
  }, []);

  const shakeThisMessage = useCallback((message: ChatMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error('Reconnect to chat before shaking a message.');
      setMessageContextMenu(null);
      return;
    }
    socket.send(JSON.stringify({ type: 'message:shake', id: message.id }));
    setMessageContextMenu(null);
  }, []);

  const forwardTargets = useMemo<ActiveRoom[]>(() => [
    { roomId: 'global', title: globalTitle, kind: 'global' },
    ...conversations.map((conversation) => ({
      roomId: conversation.roomId,
      title: conversation.title,
      kind: conversation.kind,
      peerUsername: conversation.peerUsername,
      memberCount: conversation.memberCount,
      peerAvatar: conversation.peerAvatar,
    })),
  ], [conversations, globalTitle]);

  const forwardMessageToRoom = useCallback((message: ChatMessage, room: ActiveRoom) => {
    selectChatRoom(room);
    setEditingId(null);
    insertComposerText(`Forwarded message:\n\n${quoteMessage(message)}`);
    setMessageContextMenu(null);
  }, [insertComposerText, selectChatRoom]);

  const visibleMessages = useMemo(() => messages, [messages]);
  const selectedPinDocument = collabDocuments.find((document) => document.id === pinDocumentId);
  const canUnpinCurrent = !!pinnedDocument && (
    pinnedDocument.pinnedBy.toLowerCase() === username.toLowerCase() ||
    pinnedDocument.owner.toLowerCase() === username.toLowerCase() ||
    canManageChatTitles
  );
  const archivedRoomIds = useMemo(
    () => new Set(chatListPreferences.archivedRoomIds),
    [chatListPreferences.archivedRoomIds],
  );
  const pinnedRoomOrder = useMemo(
    () => new Map(chatListPreferences.pinnedRoomIds.map((id, index) => [id, index])),
    [chatListPreferences.pinnedRoomIds],
  );
  const activeConversations = useMemo(
    () => conversations
      .filter((conversation) => !archivedRoomIds.has(conversation.roomId))
      .sort((a, b) => (
        (pinnedRoomOrder.get(a.roomId) ?? Number.MAX_SAFE_INTEGER) -
          (pinnedRoomOrder.get(b.roomId) ?? Number.MAX_SAFE_INTEGER) ||
        b.updatedAt - a.updatedAt
      )),
    [archivedRoomIds, conversations, pinnedRoomOrder],
  );
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => archivedRoomIds.has(conversation.roomId))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [archivedRoomIds, conversations],
  );

  const toggleConversationPin = useCallback((roomId: string) => {
    setChatListPreferences((current) => ({
      ...current,
      pinnedRoomIds: current.pinnedRoomIds.includes(roomId)
        ? current.pinnedRoomIds.filter((id) => id !== roomId)
        : [roomId, ...current.pinnedRoomIds],
    }));
    setConversationContextMenu(null);
  }, []);

  const toggleConversationArchive = useCallback((roomId: string) => {
    setChatListPreferences((current) => ({
      ...current,
      archivedRoomIds: current.archivedRoomIds.includes(roomId)
        ? current.archivedRoomIds.filter((id) => id !== roomId)
        : [...current.archivedRoomIds, roomId],
      pinnedRoomIds: current.archivedRoomIds.includes(roomId)
        ? current.pinnedRoomIds
        : current.pinnedRoomIds.filter((id) => id !== roomId),
    }));
    setConversationContextMenu(null);
  }, []);

  const openConversation = useCallback((conversation: ChatConversation) => {
    selectChatRoom({
      roomId: conversation.roomId,
      title: conversation.title,
      kind: conversation.kind,
      peerUsername: conversation.peerUsername,
      memberCount: conversation.memberCount,
      peerAvatar: conversation.peerAvatar,
    });
  }, [selectChatRoom]);

  const renderConversationRow = (conversation: ChatConversation, archived = false) => {
    const selected = activeRoom.roomId === conversation.roomId;
    const directPeer = conversation.peerUsername;
    const pinned = pinnedRoomOrder.has(conversation.roomId);
    return (
      <button
        key={conversation.roomId}
        type="button"
        onClick={() => openConversation(conversation)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const menuWidth = 220;
          const menuHeight = 250;
          setConversationContextMenu({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
            roomId: conversation.roomId,
          });
        }}
        className={cn(
          'chat-conversation-row flex w-full items-center gap-3 rounded-xl text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          chatListPreferences.density === 'compact' ? 'chat-conversation-row--compact px-2.5 py-2' : 'px-3 py-3',
          selected && 'bg-accent/10 ring-1 ring-accent/20',
          archived && 'opacity-75',
        )}
        title="Right-click for chat options"
      >
        {conversation.kind === 'group'
          ? (
            <div className={cn(
              'grid shrink-0 place-items-center rounded-xl border border-border/70 bg-background/70 text-accent',
              chatListPreferences.density === 'compact' ? 'size-8' : 'size-10',
            )}>
              <Group className="size-4" />
            </div>
          )
          : (
            <PixelHumanoidAvatar
              seed={conversation.peerAvatar?.seed ?? avatarSeed(directPeer ?? conversation.title)}
              rotation={conversation.peerAvatar?.rotation ?? 0}
              size={chatListPreferences.density === 'compact' ? 32 : 40}
              className="shrink-0 rounded-full border border-border/70 bg-background/70"
            />
          )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{conversation.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {conversation.lastMessage || (conversation.kind === 'group'
              ? `${conversation.memberCount} members`
              : 'Start a conversation')}
          </span>
        </span>
        {pinned && <Pin className="size-3.5 shrink-0 text-accent" />}
        {conversation.kind === 'group' && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{conversation.memberCount}</span>
        )}
      </button>
    );
  };
  const contextConversation = conversations.find(
    (conversation) => conversation.roomId === conversationContextMenu?.roomId,
  );
  const contextConversationArchived = !!conversationContextMenu &&
    archivedRoomIds.has(conversationContextMenu.roomId);
  const contextConversationPinned = !!conversationContextMenu &&
    pinnedRoomOrder.has(conversationContextMenu.roomId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/80 text-foreground">
      <div ref={chatLayoutRef} className="chat-layout flex min-h-0 flex-1">
        <aside className={cn(
          'chat-conversation-sidebar w-full shrink-0 flex-col border-r border-border/70 bg-card/25 md:flex',
          mobileRoomOpen && 'hidden',
        )} style={{ width: historyWidth }}>
          <div className="flex items-center justify-between px-4 pb-3 pt-5">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span
                  aria-label={`Chat connection ${connection}`}
                  title={`Chat connection ${connection}`}
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    connection === 'connected'
                      ? 'bg-green-500 shadow-[0_0_7px_rgb(34_197_94_/_0.65)]'
                      : connection === 'connecting'
                        ? 'bg-amber-400 shadow-[0_0_7px_rgb(251_191_36_/_0.55)]'
                        : 'bg-red-500 shadow-[0_0_7px_rgb(239_68_68_/_0.55)]',
                  )}
                />
                Conversations
              </p>
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
              onClick={() => selectChatRoom({ roomId: 'global', title: globalTitle, kind: 'global' })}
              onContextMenu={(event) => {
                event.preventDefault();
                const menuWidth = 220;
                const menuHeight = 250;
                setConversationContextMenu({
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
                  roomId: 'global',
                });
              }}
              className={cn(
                'chat-conversation-row flex w-full items-center gap-3 rounded-xl text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                chatListPreferences.density === 'compact' ? 'chat-conversation-row--compact px-2.5 py-2' : 'px-3 py-3',
                activeRoom.kind === 'global' && 'bg-accent/10 ring-1 ring-accent/20',
              )}
              title="Right-click for chat options"
            >
              <div className={cn(
                'grid shrink-0 place-items-center rounded-xl bg-accent/10 text-accent',
                chatListPreferences.density === 'compact' ? 'size-8' : 'size-10',
              )}>
                <Globe2 className="size-[18px]" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{globalTitle}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">Global group chat</span>
              </span>
              <Users className="size-4 shrink-0 text-muted-foreground/70" />
            </button>

            {activeConversations.map((conversation) => renderConversationRow(conversation))}
            {archivedConversations.length > 0 && (
              <section className="pt-2">
                <button
                  type="button"
                  aria-expanded={archivedExpanded}
                  onClick={() => setArchivedExpanded((expanded) => !expanded)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Archive className="size-3.5" />
                    Archived
                  </span>
                  <span>{archivedConversations.length}</span>
                </button>
                {archivedExpanded && archivedConversations.map((conversation) => renderConversationRow(conversation, true))}
              </section>
            )}
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

        <div
          className="chat-history-resizer hidden md:flex"
          role="separator"
          aria-label="Resize conversation history"
          aria-orientation="vertical"
          aria-valuemin={MIN_CHAT_HISTORY_WIDTH}
          aria-valuemax={MAX_CHAT_HISTORY_WIDTH}
          aria-valuenow={historyWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            resizingHistoryRef.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const change = event.key === 'ArrowLeft' ? -16 : 16;
            setHistoryWidth((width) => {
              const next = Math.max(MIN_CHAT_HISTORY_WIDTH, Math.min(MAX_CHAT_HISTORY_WIDTH, width + change));
              try {
                window.localStorage.setItem(CHAT_HISTORY_WIDTH_KEY, String(next));
              } catch {
                /* Keep keyboard resizing usable when storage is unavailable. */
              }
              return next;
            });
          }}
        />

        <main ref={chatMainRef} className={cn('flex min-w-0 flex-1 flex-col', !mobileRoomOpen && 'hidden md:flex')}>
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
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                <span className="shrink-0">
                  {activeRoom.kind === 'global'
                    ? 'Everyone in the workspace'
                    : activeRoom.kind === 'group'
                      ? `Group · ${activeRoom.memberCount ?? 0} members`
                      : 'Private conversation'}
                </span>
                {pinnedDocument && (
                  <>
                    <span className="shrink-0 opacity-50">·</span>
                    <button
                      type="button"
                      onClick={() => navigate(`/collab?type=${pinnedDocument.type}&document=${encodeURIComponent(pinnedDocument.id)}`)}
                      title={`${pinnedDocument.permission === 'edit' ? 'Can edit' : 'View only'} · Open ${pinnedDocument.title}`}
                      className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 text-accent transition hover:bg-accent/10"
                    >
                      {pinnedDocument.type === 'sheet'
                        ? <FileSpreadsheet className="size-3 shrink-0" />
                        : <GitBranch className="size-3 shrink-0" />}
                      <span className="truncate">{pinnedDocument.title}</span>
                      <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
                        {pinnedDocument.permission === 'edit' ? 'Edit' : 'View'}
                      </span>
                    </button>
                  </>
                )}
              </div>
              <CollabPresenceStack members={roomPresence} viewer={username} />
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

          <div
            ref={chatRoomBodyRef}
            className={cn('chat-room-body', canSplitPinnedDocument && pinnedDocument && 'chat-room-body--split')}
          >
            {canSplitPinnedDocument && pinnedDocument && (
              <PinnedDocumentPane
                document={pinnedDocument}
                username={username}
                widthPercent={pinnedPaneWidth}
              />
            )}
            {canSplitPinnedDocument && pinnedDocument && (
              <div
                className="chat-document-resizer"
                role="separator"
                aria-label="Resize pinned document and chat"
                aria-orientation="vertical"
                aria-valuemin={MIN_CHAT_PINNED_PANE_WIDTH}
                aria-valuemax={MAX_CHAT_PINNED_PANE_WIDTH}
                aria-valuenow={Math.round(pinnedPaneWidth)}
                tabIndex={0}
                onPointerDown={(event) => {
                  event.preventDefault();
                  resizingPinnedPaneRef.current = true;
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const delta = event.key === 'ArrowLeft' ? -2 : 2;
                  const next = Math.max(
                    MIN_CHAT_PINNED_PANE_WIDTH,
                    Math.min(MAX_CHAT_PINNED_PANE_WIDTH, pinnedPaneWidth + delta),
                  );
                  setPinnedPaneWidth(next);
                  try {
                    window.localStorage.setItem(CHAT_PINNED_PANE_WIDTH_KEY, String(next));
                  } catch {
                    /* Keep keyboard resizing usable when storage is unavailable. */
                  }
                }}
              />
            )}
            <section className={cn('chat-message-pane', messageDensity === 'compact' && 'chat-message-pane--compact')}>
          <div
            ref={messageListRef}
            className="chat-message-list flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-7"
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
            <div className="chat-message-stack mx-auto flex w-full max-w-[900px] flex-col gap-5">
              {visibleMessages.map((message, index) => {
                const mine = isOwnMessage(message);
                const previous = visibleMessages[index - 1];
                const grouped = previous?.username === message.username && message.createdAt - previous.createdAt < 5 * 60_000;
                const news = message.source === 'news';
                const renderedMarkdown = news ? fixNewsImagePaths(message.markdown) : message.markdown;
                const stickerOnly = /^!\[sticker:[\s\S]*\]\(\/api\/chat\/stickers\/(?:public|private)\/[^)\s]+\)$/i
                  .test(message.markdown.trim());
                const shaking = shakeMessage?.id === message.id;
                return (
                  <article
                    key={message.id}
                    data-chat-message-id={message.id}
                    className={cn('chat-message-row group flex gap-3', mine && !news && 'flex-row-reverse')}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      const menuWidth = 248;
                      const menuHeight = 420;
                      setMessageContextMenu({
                        x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                        y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
                        message,
                        forwarding: false,
                      });
                    }}
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
                        <div className={cn('chat-message-meta mb-1.5 flex items-center gap-2 px-1', mine && !news && 'flex-row-reverse')}>
                          <span className="text-xs font-semibold text-foreground/85">{news ? 'News & Updates' : message.username}</span>
                          {news && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">Pinned source</span>}
                          <time className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</time>
                        </div>
                      )}
                      <div
                        key={shaking ? `${message.id}:${shakeMessage?.shakeId}` : message.id}
                        className={cn(
                        'chat-message-bubble',
                        stickerOnly
                          ? 'chat-message-bubble--sticker relative'
                          : 'relative rounded-2xl border px-4 py-3 shadow-sm',
                        message.glowing && 'chat-message-glow',
                        shaking && 'chat-message-shake',
                        !stickerOnly && (news
                          ? 'border-primary/15 bg-primary/[0.045]'
                          : mine
                            ? 'rounded-tr-md border-accent/15 bg-accent/[0.09]'
                            : 'rounded-tl-md border-border/70 bg-card/65'),
                      )}>
                        {message.poll && (message.contentType === 'poll' || message.contentType === 'poll_result')
                          ? (
                            <PollMessageCard
                              poll={message.poll}
                              isSummary={message.contentType === 'poll_result'}
                              onVote={(optionIndex) => {
                                const socket = socketRef.current;
                                if (!socket || socket.readyState !== WebSocket.OPEN) {
                                  toast.error('Reconnect to vote in this poll.');
                                  return;
                                }
                                socket.send(JSON.stringify({
                                  type: 'poll:vote',
                                  pollId: message.pollId ?? message.poll?.id,
                                  optionIndex,
                                }));
                              }}
                            />
                          )
                          : <MarkdownBody markdown={renderedMarkdown} />}
                        {!stickerOnly && message.contentType === 'markdown' && (
                          <LinkPreviewCards markdown={renderedMarkdown} />
                        )}
                        {message.contentType === 'markdown' && message.updatedAt > message.createdAt + 1_000 && !news && (
                          <span className="mt-2 block text-right text-[9px] text-muted-foreground">edited</span>
                        )}
                        {mine && !news && message.contentType === 'markdown' && (
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
              {threadParent && (
                <section className="chat-thread-panel">
                  <header>
                    <div className="min-w-0">
                      <p>Thread</p>
                      <span className="truncate">{threadParent.threadCount ?? threadMessages.length} replies</span>
                    </div>
                    <button type="button" aria-label="Close thread" title="Close thread" onClick={closeThread}>
                      <X className="size-4" />
                    </button>
                  </header>
                  <article className="chat-thread-parent">
                    <strong>{threadParent.username}</strong>
                    <MarkdownBody markdown={threadParent.markdown} />
                  </article>
                  {threadLoading && <p className="chat-thread-state">Loading replies…</p>}
                  {!threadLoading && threadMessages.length === 0 && <p className="chat-thread-state">No replies yet. Start the thread below.</p>}
                  {threadMessages.map((reply) => (
                    <article className="chat-thread-reply" key={reply.id}>
                      <strong>{reply.username}</strong>
                      <MarkdownBody markdown={reply.markdown} />
                      {reply.mentions?.some((name) => name.toLowerCase() === username.toLowerCase()) && (
                        <span className="chat-mention-label">Mentioned you</span>
                      )}
                    </article>
                  ))}
                </section>
              )}
              <div ref={messageEndRef} />
            </div>
          </div>

          <div className="chat-composer-panel relative shrink-0 border-t border-border/60 bg-background/75 p-3 sm:px-6 sm:pb-5 sm:pt-4">
            <div
              className="chat-composer-resizer"
              role="separator"
              aria-label="Resize message editor"
              aria-orientation="horizontal"
              aria-valuemin={MIN_COMPOSER_HEIGHT}
              aria-valuemax={MAX_COMPOSER_HEIGHT}
              aria-valuenow={composerHeight}
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                resizingComposerRef.current = {
                  startY: event.clientY,
                  startHeight: composerHeight,
                };
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                const delta = event.key === 'ArrowUp' ? 16 : -16;
                setComposerHeight((height) => {
                  const next = Math.max(
                    MIN_COMPOSER_HEIGHT,
                    Math.min(MAX_COMPOSER_HEIGHT, height + delta),
                  );
                  try {
                    window.localStorage.setItem(COMPOSER_HEIGHT_KEY, String(next));
                  } catch {
                    /* Keep keyboard resizing usable when storage is unavailable. */
                  }
                  return next;
                });
              }}
            />
            <div className="relative mx-auto w-full">
              <div
                role="toolbar"
                aria-label="Message formatting and emoji"
                className="flex min-h-8 flex-nowrap items-center gap-0.5 overflow-hidden border-b border-border/45 px-2 py-0.5"
              >
                <div
                  className="chat-emoji-strip"
                  role="group"
                  aria-label="Common emojis"
                  onWheel={(event) => {
                    if (event.deltaY === 0) return;
                    event.preventDefault();
                    event.currentTarget.scrollLeft += event.deltaY;
                  }}
                >
                  {COMMON_EMOJIS.map((emoji, index) => (
                    <button
                      key={`${emoji}-${index}`}
                      type="button"
                      title={`Insert ${emoji}`}
                      aria-label={`Insert ${emoji}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertEmoji(emoji)}
                      className="chat-emoji-button"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
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
                {toolbarButton('Attach a Drive file', <FolderOpen className="size-3.5" />, () => {
                  const opening = !drivePickerOpen;
                  setDrivePickerOpen(opening);
                  if (opening) void loadDrivePickerFiles(drivePickerScope);
                }, sharingDriveFileId !== null)}
                {toolbarButton('Create a quick poll (/poll)', <BarChart3 className="size-3.5" />, () => {
                  const opening = !pollComposerOpen;
                  setPollComposerOpen(opening);
                  if (opening) {
                    setStickerPanelOpen(false);
                    setDrivePickerOpen(false);
                    setLinkEditorOpen(false);
                  }
                }, sending || threadParent !== null)}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => void handlePhotoFiles(Array.from(event.target.files ?? []))}
                />
              </div>

              {pollComposerOpen && (
                <section className="chat-poll-composer" aria-label="Create a quick poll">
                  <header>
                    <div className="chat-poll-composer-icon"><BarChart3 className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <strong>Quick poll</strong>
                      <span>Room-wide vote · closes automatically in 24 hours</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Close poll composer"
                      onClick={() => setPollComposerOpen(false)}
                    ><X className="size-4" /></button>
                  </header>
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    createQuickPoll(pollQuestion, pollOptions);
                  }}>
                    <label>
                      <span>Question</span>
                      <input
                        autoFocus
                        value={pollQuestion}
                        onChange={(event) => {
                          setPollQuestion(event.target.value);
                          refreshTypingPresence();
                        }}
                        maxLength={240}
                        placeholder="Settle a tiny but important debate…"
                      />
                    </label>
                    <div className="chat-poll-composer-options">
                      {pollOptions.map((option, index) => (
                        <label key={index}>
                          <span>{String.fromCharCode(65 + index)}</span>
                          <input
                            value={option}
                            onChange={(event) => {
                              setPollOptions((current) => current.map(
                                (item, itemIndex) => itemIndex === index ? event.target.value : item,
                              ));
                              refreshTypingPresence();
                            }}
                            maxLength={80}
                            placeholder={`Option ${index + 1}`}
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              aria-label={`Remove option ${index + 1}`}
                              onClick={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            ><X className="size-3.5" /></button>
                          )}
                        </label>
                      ))}
                    </div>
                    <footer>
                      <button
                        type="button"
                        disabled={pollOptions.length >= 6}
                        onClick={() => setPollOptions((current) => [...current, ''])}
                      ><Plus className="size-3.5" /> Add option</button>
                      <button type="submit" disabled={sending}>
                        <Sparkles className="size-3.5" /> Launch poll
                      </button>
                    </footer>
                  </form>
                </section>
              )}

              {drivePickerOpen && (
                <section className="chat-drive-picker">
                  <header className="chat-drive-picker-header">
                    <div>
                      <strong>Share a Drive file</strong>
                      <span>Personal files are shared with this chat only.</span>
                    </div>
                    <button type="button" aria-label="Close Drive file picker" onClick={() => setDrivePickerOpen(false)}>
                      <X className="size-4" />
                    </button>
                  </header>
                  <div className="chat-drive-picker-controls">
                    <div className="inline-flex rounded-lg border border-border/70 bg-background/70 p-0.5">
                      {(['team', 'personal'] as const).map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          aria-pressed={drivePickerScope === scope}
                          onClick={() => {
                            setDrivePickerScope(scope);
                            setDrivePickerQuery('');
                            void loadDrivePickerFiles(scope);
                          }}
                        >{scope === 'team' ? 'Team Drive' : 'My Drive'}</button>
                      ))}
                    </div>
                    <label className="chat-drive-picker-search">
                      <Search className="size-3.5" />
                      <input
                        value={drivePickerQuery}
                        onChange={(event) => setDrivePickerQuery(event.target.value)}
                        placeholder="Find a file"
                      />
                    </label>
                  </div>
                  <div className="chat-drive-picker-files">
                    {drivePickerLoading ? (
                      <p>Loading Drive files…</p>
                    ) : visibleDrivePickerFiles.length ? visibleDrivePickerFiles.map((file) => {
                      const Icon = chatDriveFileGlyph(file);
                      return (
                        <button
                          key={file.id}
                          type="button"
                          disabled={sharingDriveFileId !== null}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => void addDriveFileToDraft(file)}
                          title={`${file.name} · ${formatDriveFileSize(file.size_bytes)}`}
                        >
                          <span><Icon className="size-4" /></span>
                          <strong>{file.name}</strong>
                          <small>{formatDriveFileSize(file.size_bytes)}</small>
                        </button>
                      );
                    }) : (
                      <p>{drivePickerQuery ? 'No files match this search.' : 'No files in this Drive yet.'}</p>
                    )}
                  </div>
                </section>
              )}

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
                      {uploadingSticker ? 'Saving…' : 'Add image'}
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
                          className="chat-sticker-grid-image"
                        />
                      </button>
                    ))}
                    {stickers.filter((sticker) => sticker.scope === stickerScope).length === 0 && (
                      <p className="py-2 text-[10px] text-muted-foreground">
                        No stickers here yet. Add any image; it will be converted to PNG and scaled to fit 256 × 256.
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
                {threadParent && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 text-[10px]">
                    <Reply className="size-3.5 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      Replying to <strong className="text-foreground">{threadParent.username}</strong>
                    </span>
                    <button type="button" onClick={closeThread} className="text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                )}
                {mentionQuery !== null && (
                  <div className="chat-mention-suggestions" role="listbox" aria-label="Mention a teammate">
                    {mentionSearching ? (
                      <p>Finding teammates…</p>
                    ) : mentionUsers.length ? mentionUsers.slice(0, 7).map((person) => (
                      <button
                        key={person.username}
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertMention(person)}
                      >
                        <span className="chat-mention-avatar">{person.username.slice(0, 1).toUpperCase()}</span>
                        <span>{person.username}</span>
                      </button>
                    )) : (
                      <p>{mentionQuery ? 'No matching teammates.' : 'Type a name to mention a teammate.'}</p>
                    )}
                  </div>
                )}
                {!hasDraft && !threadParent && (
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
                onInput={(event) => {
                  syncComposerMarkdown();
                  if (event.currentTarget.innerText.trim()) refreshTypingPresence();
                  else stopTypingPresence();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.shiftKey) {
                    event.preventDefault();
                    document.execCommand('insertLineBreak');
                    syncComposerMarkdown();
                  } else if (
                    event.key === 'Enter' &&
                    !event.nativeEvent.isComposing
                  ) {
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
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes('Files')) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                  setPhotoDropActive(true);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setPhotoDropActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setPhotoDropActive(false);
                  void handlePhotoFiles(Array.from(event.dataTransfer.files));
                }}
                className={cn(
                  'chat-composer-editor min-h-0 max-h-none w-full overflow-y-auto bg-transparent px-4 pb-16 pt-4 text-sm leading-relaxed outline-none [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
                  photoDropActive && 'chat-composer-editor--drop-active',
                )}
                style={{ height: composerHeight }}
              />
                {photoDropActive && (
                  <div className="pointer-events-none absolute inset-1 z-10 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
                    Drop photos to attach
                  </div>
                )}
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
                  {editingId ? 'Save edit' : threadParent ? 'Reply' : 'Send'}
                </button>
              </div>
            </div>
          </div>
            </section>
          </div>
        </main>
      </div>

      {messageContextMenu && (
        <section
          data-chat-message-menu
          role="menu"
          aria-label={`Actions for message from ${messageContextMenu.message.username}`}
          onContextMenu={(event) => event.preventDefault()}
          className="fixed z-[130] flex w-[248px] max-h-[min(75dvh,440px)] flex-col overflow-y-auto rounded-xl border border-border/80 bg-card/95 p-1.5 text-foreground shadow-2xl backdrop-blur-2xl"
          style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
        >
          {messageContextMenu.forwarding ? (
            <>
              <div className="flex items-center gap-2 border-b border-border/60 px-2 pb-2 pt-1">
                <button
                  type="button"
                  aria-label="Back to message actions"
                  title="Back"
                  onClick={() => setMessageContextMenu((current) => current
                    ? { ...current, forwarding: false }
                    : null)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
                <span className="text-xs font-semibold">Forward to</span>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {forwardTargets.map((room) => (
                  <button
                    key={room.roomId}
                    type="button"
                    role="menuitem"
                    onClick={() => forwardMessageToRoom(messageContextMenu.message, room)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/70 text-accent">
                      {room.kind === 'global'
                        ? <Globe2 className="size-3.5" />
                        : room.kind === 'group'
                          ? <Group className="size-3.5" />
                          : <MessageCircle className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{room.title}</span>
                    {room.roomId === activeRoom.roomId && (
                      <span className="text-[9px] text-muted-foreground">Current</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {messageContextMenu.message.source !== 'news' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openThread(messageContextMenu.message);
                    setMessageContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
                >
                  <Reply className="size-3.5 text-muted-foreground" />
                  {messageContextMenu.message.threadCount
                    ? `Open thread · ${messageContextMenu.message.threadCount} ${messageContextMenu.message.threadCount === 1 ? 'reply' : 'replies'}`
                    : 'Reply in thread'}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => replyToMessage(messageContextMenu.message)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                <Reply className="size-3.5 text-muted-foreground" />
                Reply with quote
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyMessage(messageContextMenu.message)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                <Copy className="size-3.5 text-muted-foreground" />
                Copy message
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void pasteFromClipboard()}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                <ClipboardPaste className="size-3.5 text-muted-foreground" />
                Paste from clipboard
              </button>
              <div role="separator" className="my-1 border-t border-border/60" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMessageDensity((current) => current === 'compact' ? 'comfortable' : 'compact');
                  setMessageContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                {messageDensity === 'compact'
                  ? <Maximize2 className="size-3.5 text-muted-foreground" />
                  : <Minimize2 className="size-3.5 text-muted-foreground" />}
                {messageDensity === 'compact' ? 'Comfortable messages' : 'Compact messages'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMessageContextMenu((current) => current
                  ? { ...current, forwarding: true }
                  : null)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                <Forward className="size-3.5 text-muted-foreground" />
                Forward to…
              </button>
              {messageContextMenu.message.source !== 'news' && (
                <>
                  <div role="separator" className="my-1 border-t border-border/60" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => toggleMessageGlow(messageContextMenu.message)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
                  >
                    <Sparkles className="size-3.5 text-amber-400" />
                    {messageContextMenu.message.glowing ? 'Unglow this message' : 'Glow this message'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => shakeThisMessage(messageContextMenu.message)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
                  >
                    <Zap className="size-3.5 text-amber-400" />
                    Shake this message
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}

      {conversationContextMenu && (
        <section
          data-chat-list-menu
          role="menu"
          aria-label={`Options for ${contextConversation?.title ?? globalTitle}`}
          onContextMenu={(event) => event.preventDefault()}
          className="fixed z-[130] flex w-[220px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 p-1.5 text-foreground shadow-2xl backdrop-blur-2xl"
          style={{ left: conversationContextMenu.x, top: conversationContextMenu.y }}
        >
          {conversationContextMenu.roomId !== 'global' && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => toggleConversationPin(conversationContextMenu.roomId)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                {contextConversationPinned
                  ? <PinOff className="size-3.5 text-muted-foreground" />
                  : <Pin className="size-3.5 text-muted-foreground" />}
                {contextConversationPinned ? 'Unpin from top' : 'Pin chat to top'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => toggleConversationArchive(conversationContextMenu.roomId)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
              >
                {contextConversationArchived
                  ? <ArchiveRestore className="size-3.5 text-muted-foreground" />
                  : <Archive className="size-3.5 text-muted-foreground" />}
                {contextConversationArchived ? 'Restore chat' : 'Archive chat'}
              </button>
            </>
          )}
          <div role="separator" className="my-1 border-t border-border/60" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setChatListPreferences((current) => ({
                ...current,
                density: current.density === 'compact' ? 'comfortable' : 'compact',
              }));
              setConversationContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent/10"
          >
            {chatListPreferences.density === 'compact'
              ? <Maximize2 className="size-3.5 text-muted-foreground" />
              : <Minimize2 className="size-3.5 text-muted-foreground" />}
            {chatListPreferences.density === 'compact' ? 'Comfortable view' : 'Compact view'}
          </button>
        </section>
      )}

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
