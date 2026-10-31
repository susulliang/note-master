import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  Bold,
  CheckSquare2,
  ClipboardCopy,
  ClipboardPaste,
  Code2,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Quote,
  Search,
  Share2,
  Scissors,
  Trash2,
  Upload,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteSmartDocSnapshot,
  loadCollabDirectoryCache,
  loadSmartDocSnapshot,
  saveCollabDirectoryCache,
  saveSmartDocSnapshot,
} from '@/lib/collab-document-cache';
import {
  findChatUsers,
  listCollabDrive,
  type ChatUser,
  type CollabDriveFile,
} from '@/lib/chat-client';
import {
  attachSmartDocDriveMedia,
  createSmartDoc,
  deleteSmartDoc,
  fetchSmartDocMedia,
  listSmartDocAccess,
  listSmartDocs,
  requestSmartDocSocketTicket,
  setSmartDocAccess,
  smartDocDriveMediaUrl,
  smartDocMediaUrl,
  smartDocSocketUrl,
  updateSmartDoc,
  uploadSmartDocMedia,
  type SmartDoc,
  type SmartDocKind,
  type SmartDocMember,
  type SmartDocPermission,
} from '@/lib/smartdocs-client';
import './SmartDocsPage.css';

interface SmartDocsPageProps {
  username: string;
  initialDocumentId?: string;
  documentKind?: SmartDocKind;
  onDocumentChange?: (documentId: string | null) => void;
  embedded?: boolean;
}

interface OutlineHeading {
  level: number;
  text: string;
}

interface FloatingMediaProgress {
  left: number;
  top: number;
  label: string;
  progress: number | null;
}

const MAX_DOCUMENT_CHARACTERS = 500_000;
const DOCUMENT_SAVE_DEBOUNCE_MS = 2_500;

/** Temporary kill-switch for the document banner feature (docs + todos).
 *  Flip to true to bring back the banner panel and banner display. */
const BANNERS_ENABLED = false;
let mermaidInitialized = false;

function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const reactId = useId();
  useEffect(() => {
    let alive = true;
    const diagramId = `smart-doc-mermaid-${reactId.replace(/[^A-Za-z0-9_-]/g, '')}`;
    void import('mermaid')
      .then(async ({ default: mermaid }) => {
        if (!mermaidInitialized) {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
          mermaidInitialized = true;
        }
        return mermaid.render(diagramId, source);
      })
      .then((result) => {
        if (alive) {
          setSvg(result.svg);
          setError('');
        }
      })
      .catch((renderError: unknown) => {
        if (alive) {
          setSvg('');
          setError(renderError instanceof Error ? renderError.message : 'Diagram syntax is invalid.');
        }
      });
    return () => { alive = false; };
  }, [reactId, source]);

  return (
    <figure className="smart-doc-mermaid">
      {svg
        ? <div className="smart-doc-mermaid-svg" role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: svg }} />
        : error
          ? <figcaption>Mermaid could not render: {error}<pre><code>{source}</code></pre></figcaption>
          : <div className="smart-doc-media-loading">Rendering diagram…</div>}
    </figure>
  );
}

function localDraftKey(username: string, documentId: string): string {
  return `econote:smartdoc-draft:${encodeURIComponent(username.toLowerCase())}:${documentId}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function headingList(markdown: string): OutlineHeading[] {
  return markdown.split(/\r?\n/)
    .map((line) => /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => !!match)
    .map((match) => ({ level: match[1].length, text: match[2] }));
}

function isVideoLink(href: string): boolean {
  try {
    return new URL(href, window.location.origin).searchParams.get('kind') === 'video';
  } catch {
    return false;
  }
}

function markdownComponents(): Components {
  return {
    h1: ({ children }) => <h1 data-smartdoc-heading>{children}</h1>,
    h2: ({ children }) => <h2 data-smartdoc-heading>{children}</h2>,
    h3: ({ children }) => <h3 data-smartdoc-heading>{children}</h3>,
    h4: ({ children }) => <h4 data-smartdoc-heading>{children}</h4>,
    h5: ({ children }) => <h5 data-smartdoc-heading>{children}</h5>,
    h6: ({ children }) => <h6 data-smartdoc-heading>{children}</h6>,
    pre: ({ children }) => {
      const code = Children.toArray(children).find(isValidElement);
      if (code) {
        const props = code.props as { className?: string; children?: ReactNode };
        if (props.className?.split(/\s+/).includes('language-mermaid')) {
          return <MermaidDiagram source={String(props.children ?? '').replace(/\n$/, '')} />;
        }
      }
      return <pre>{children}</pre>;
    },
    img: ({ src, alt }) => (
      <SmartDocInlineMedia source={src ?? ''} title={alt ?? 'Document image'} kind="image" />
    ),
    a: ({ href, children }) => {
      const source = href ?? '';
      if (source.startsWith('/api/collab/smartdocs/') && isVideoLink(source)) {
        return <SmartDocInlineMedia source={source} title={String(children)} kind="video" />;
      }
      return <a href={source} target="_blank" rel="noreferrer">{children}</a>;
    },
  };
}

function staticMarkdownComponents(): Components {
  return {
    h1: ({ children }) => <h1 data-smartdoc-heading>{children}</h1>,
    h2: ({ children }) => <h2 data-smartdoc-heading>{children}</h2>,
    h3: ({ children }) => <h3 data-smartdoc-heading>{children}</h3>,
    h4: ({ children }) => <h4 data-smartdoc-heading>{children}</h4>,
    h5: ({ children }) => <h5 data-smartdoc-heading>{children}</h5>,
    h6: ({ children }) => <h6 data-smartdoc-heading>{children}</h6>,
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt ?? ''}
        data-smartdoc-source={src ?? ''}
        contentEditable={false}
      />
    ),
    a: ({ href, children }) => {
      const source = href ?? '';
      if (source.startsWith('/api/collab/smartdocs/') && isVideoLink(source)) {
        return (
          <video
            src={source}
            controls
            data-smartdoc-source={source}
            data-smartdoc-kind="video"
            data-smartdoc-name={String(children)}
            contentEditable={false}
          />
        );
      }
      return <a href={source}>{children}</a>;
    },
  };
}

function markdownToEditorHtml(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={staticMarkdownComponents()}>
      {markdown}
    </ReactMarkdown>,
  );
}

function nodeMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  const children = () => Array.from(node.childNodes).map(nodeMarkdown).join('');
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'input' && (node as HTMLInputElement).type === 'checkbox') {
    return (node as HTMLInputElement).checked ? '[x] ' : '[ ] ';
  }
  if (tag === 'img') {
    const source = node.dataset.smartdocSource || node.getAttribute('src') || '';
    return source ? `![${node.getAttribute('alt') ?? ''}](${source})` : '';
  }
  if (tag === 'video') {
    const source = node.dataset.smartdocSource || node.getAttribute('src') || '';
    const name = node.dataset.smartdocName || 'Video';
    return source ? `[video: ${name}](${source})` : '';
  }
  if (tag === 'a') {
    const source = node.dataset.smartdocSource || node.getAttribute('href') || '';
    const label = children() || source;
    return isVideoLink(source) ? `[video: ${label}](${source})` : `[${label}](${source})`;
  }
  if (tag === 'strong' || tag === 'b') return `**${children()}**`;
  if (tag === 'em' || tag === 'i') return `*${children()}*`;
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${children()}~~`;
  if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
    return `\`${children()}\``;
  }
  if (/^h[1-6]$/.test(tag)) {
    return `${'#'.repeat(Number(tag[1]))} ${children().trim()}\n\n`;
  }
  if (tag === 'pre') {
    const language = node.querySelector('code')?.className.match(/(?:^|\s)language-([A-Za-z0-9_+-]+)/)?.[1] ?? '';
    return `\`\`\`${language}\n${node.textContent ?? ''}\n\`\`\`\n\n`;
  }
  if (tag === 'blockquote') {
    return `${children().trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'li');
    return `${items.map((item, index) => (
      `${tag === 'ol' ? `${index + 1}.` : '-'} ${Array.from(item.childNodes).map(nodeMarkdown).join('').trim()}`
    )).join('\n')}\n\n`;
  }
  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr')).map((row) => (
      Array.from(row.querySelectorAll('th, td')).map((cell) => (
        (cell.textContent ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
      ))
    ));
    if (!rows.length) return '';
    const divider = rows[0].map(() => '---');
    const markdownRows = [rows[0], divider, ...rows.slice(1)]
      .map((row) => `| ${row.join(' | ')} |`);
    return `${markdownRows.join('\n')}\n\n`;
  }
  if (tag === 'li') return children();
  if (tag === 'hr') return '\n---\n\n';
  if (tag === 'p' || tag === 'div') return `${children().trim()}\n\n`;
  return children();
}

function editorMarkdown(editor: HTMLElement): string {
  return Array.from(editor.childNodes)
    .map(nodeMarkdown)
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DOCUMENT_CHARACTERS);
}

function fileIsMedia(file: CollabDriveFile): boolean {
  return file.mime_type.startsWith('image/') || file.mime_type.startsWith('video/');
}

function formatModified(timestamp: number): string {
  if (!timestamp) return 'Not yet edited';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function compressSmartDocImage(file: File): Promise<File> {
  if (!file.type.toLowerCase().startsWith('image/') || file.type.toLowerCase() === 'image/gif' || /\.gif$/i.test(file.name)) {
    return file;
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot convert images to WebP.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 2048;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the image for WebP conversion.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('WebP image conversion failed.')),
        'image/webp',
        0.84,
      );
    });
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([webp], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

async function compressSmartDocVideo(
  file: File,
  onProgress: (progress: number) => void,
): Promise<File> {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function'
  ) {
    throw new Error('Video compression is not supported in this browser.');
  }
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.style.cssText = 'position:fixed;width:2px;height:2px;left:-10px;top:-10px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);
  let audioContext: AudioContext | null = null;
  let animationFrame = 0;
  let recorder: MediaRecorder | null = null;
  let outputStream: MediaStream | null = null;
  let sourceStream: MediaStream | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read this video file.'));
      video.src = sourceUrl;
      video.load();
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height || !Number.isFinite(video.duration)) {
      throw new Error('This video has invalid dimensions or duration.');
    }
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.floor(width * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(height * scale / 2) * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare video frames for compression.');
    const canvasStream = canvas.captureStream(24);
    const tracks = [...canvasStream.getVideoTracks()];
    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(video);
      const capturedAudio = audioContext.createMediaStreamDestination();
      const silentOutput = audioContext.createGain();
      silentOutput.gain.value = 0;
      source.connect(capturedAudio);
      source.connect(silentOutput);
      silentOutput.connect(audioContext.destination);
      await audioContext.resume();
      tracks.push(...capturedAudio.stream.getAudioTracks());
    } catch {
      await audioContext?.close().catch(() => undefined);
      audioContext = null;
      const capturableVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      try {
        sourceStream = capturableVideo.captureStream?.() ?? null;
        tracks.push(...(sourceStream?.getAudioTracks() ?? []));
      } catch {
        /* Continue as a silent video if this browser cannot capture audio. */
      }
      video.muted = true;
    }

    const stream = new MediaStream(tracks);
    outputStream = stream;
    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm',
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error('This browser has no supported video encoder.');
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1_800_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks: Blob[] = [];
    const compressed = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder!.onerror = () => reject(new Error('Video compression failed.'));
      recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || 'video/webm' }));
      video.onended = () => {
        onProgress(1);
        if (recorder?.state === 'recording') recorder.stop();
      };
      video.onerror = () => reject(new Error('Video decoding failed during compression.'));
    });
    recorder.start(500);
    const drawFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onProgress(Math.min(.99, video.currentTime / video.duration));
      }
      if (!video.ended && recorder?.state === 'recording') {
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };
    await video.play();
    drawFrame();
    const blob = await compressed;
    if (!blob.size) throw new Error('Video compression produced an empty file.');
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}.webm`, { type: 'video/webm', lastModified: file.lastModified });
  } finally {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    if (recorder?.state === 'recording') recorder.stop();
    outputStream?.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());
    await audioContext?.close().catch(() => undefined);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(sourceUrl);
  }
}

function SmartDocInlineMedia({
  source,
  title,
  kind,
}: {
  source: string;
  title: string;
  kind: 'image' | 'video';
}) {
  const [mediaUrl, setMediaUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    if (!source.startsWith('/api/collab/smartdocs/')) {
      setMediaUrl(source);
      setFailed(false);
      return () => undefined;
    }
    setMediaUrl('');
    setFailed(false);
    void fetchSmartDocMedia(source)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setMediaUrl(objectUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  if (failed) return <span className="smart-doc-media-error">Media is unavailable</span>;
  if (!mediaUrl) return <span className="smart-doc-media-loading">Loading {kind}…</span>;
  if (kind === 'video') {
    return <video className="smart-doc-embedded-video" src={mediaUrl} controls preload="metadata" aria-label={title} />;
  }
  return <img className="smart-doc-embedded-image" src={mediaUrl} alt={title} loading="lazy" />;
}

export default function SmartDocsPage({
  username,
  initialDocumentId,
  documentKind = 'smartdoc',
  onDocumentChange,
  embedded = false,
}: SmartDocsPageProps) {
  const isTodoMode = documentKind === 'smarttodo';
  const directoryType = isTodoMode ? 'smarttodo' : 'smartdoc';
  const [documents, setDocuments] = useState<SmartDoc[]>(
    () => loadCollabDirectoryCache<SmartDoc>(username, directoryType),
  );
  const [loading, setLoading] = useState(
    () => loadCollabDirectoryCache<SmartDoc>(username, directoryType).length === 0,
  );
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(initialDocumentId ?? null);
  const [markdown, setMarkdown] = useState('');
  const markdownRef = useRef('');
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('offline');
  const [canEdit, setCanEdit] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [accessOpen, setAccessOpen] = useState(false);
  const [members, setMembers] = useState<SmartDocMember[]>([]);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [memberPermission, setMemberPermission] = useState<SmartDocPermission>('view');
  const [memberQuery, setMemberQuery] = useState('');
  const [userResults, setUserResults] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [searchingMembers, setSearchingMembers] = useState(false);

  // Debounced registered-user search for the share modal. Without this the
  // results list never renders (userResults stays empty), so nobody can be
  // selected and the Add button stays disabled forever.
  useEffect(() => {
    if (!accessOpen) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearchingMembers(true);
      findChatUsers(memberQuery.trim())
        .then((users) => { if (alive) setUserResults(users); })
        .catch(() => { if (alive) setUserResults([]); })
        .finally(() => { if (alive) setSearchingMembers(false); });
    }, memberQuery.trim() ? 180 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [accessOpen, memberQuery]);

  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveScope, setDriveScope] = useState<'team' | 'personal'>('team');
  const [driveFiles, setDriveFiles] = useState<CollabDriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [mediaStage, setMediaStage] = useState('');
  const [floatingMediaProgress, setFloatingMediaProgress] = useState<FloatingMediaProgress | null>(null);
  const [mediaDropActive, setMediaDropActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [todoContextText, setTodoContextText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);
  const [hydrateVersion, setHydrateVersion] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const cacheTimerRef = useRef<number | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const mediaInsertionPendingRef = useRef(false);
  const mentionRangeRef = useRef<Range | null>(null);
  const editorObjectUrlsRef = useRef(new Map<string, string>());
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const directoryOwnerRef = useRef(username);
  const releaseMediaInsertion = useCallback(() => {
    mediaInsertionPendingRef.current = false;
    setHydrateVersion((value) => value + 1);
  }, []);

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const outline = useMemo(() => headingList(markdown), [markdown]);
  const isOwner = !!activeDocument && activeDocument.owner.toLowerCase() === username.toLowerCase();
  const canManageAccess = isOwner;
  const canEditNow = canEdit && connection === 'connected' && snapshotReady;

  const refreshDocuments = useCallback(async () => {
    try {
      const owner = username.toLowerCase();
      const nextDocuments = await listSmartDocs(documentKind);
      if (directoryOwnerRef.current.toLowerCase() === owner) setDocuments(nextDocuments);
    } catch (error) {
      if (directoryOwnerRef.current.toLowerCase() === username.toLowerCase()) {
        toast.error(error instanceof Error ? error.message : `Could not load ${isTodoMode ? 'Smart Todos' : 'Smart Docs'}.`);
      }
    } finally {
      if (directoryOwnerRef.current.toLowerCase() === username.toLowerCase()) {
        setLoading(false);
        setDirectoryLoaded(true);
      }
    }
  }, [documentKind, isTodoMode, username]);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    if (directoryOwnerRef.current.toLowerCase() !== username.toLowerCase()) {
      directoryOwnerRef.current = username;
      const cached = loadCollabDirectoryCache<SmartDoc>(username, directoryType);
      setDocuments(cached);
      setLoading(cached.length === 0);
      setDirectoryLoaded(false);
      setActiveDocumentId(initialDocumentId ?? null);
      setMarkdown('');
      markdownRef.current = '';
      setSnapshotReady(false);
      setCanEdit(false);
      return;
    }
    saveCollabDirectoryCache(username, directoryType, documents);
  }, [directoryType, documents, initialDocumentId, username]);

  useEffect(() => {
    if (embedded) {
      if (initialDocumentId) setActiveDocumentId(initialDocumentId);
      return;
    }
    if (!initialDocumentId) {
      setActiveDocumentId(null);
      return;
    }
    if (documents.some((document) => document.id === initialDocumentId)) {
      setActiveDocumentId(initialDocumentId);
    } else if (directoryLoaded) {
      setActiveDocumentId(null);
      onDocumentChange?.(null);
    }
  }, [directoryLoaded, documents, embedded, initialDocumentId, onDocumentChange]);

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  useEffect(() => {
    setMarkdown('');
    markdownRef.current = '';
    setSnapshotReady(false);
    setRevision(0);
    revisionRef.current = 0;
    dirtyRef.current = false;
    setCanEdit(false);
    setSaveState('saved');
    setMentionQuery(null);
    setContextMenu(null);
    setMediaDropActive(false);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (cacheTimerRef.current !== null) {
      window.clearTimeout(cacheTimerRef.current);
      cacheTimerRef.current = null;
    }
    editorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    editorObjectUrlsRef.current.clear();
    return () => {
      if (cacheTimerRef.current !== null) {
        window.clearTimeout(cacheTimerRef.current);
        cacheTimerRef.current = null;
      }
      if (activeDocumentId && dirtyRef.current) {
        void saveSmartDocSnapshot({
          username,
          id: activeDocumentId,
          markdown: markdownRef.current,
          revision: revisionRef.current,
        }).catch(() => undefined);
      }
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const socket = socketRef.current;
        if (dirtyRef.current && socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'document:update',
            markdown: markdownRef.current,
            baseRevision: revisionRef.current,
          }));
        }
      }
      editorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      editorObjectUrlsRef.current.clear();
    };
  }, [activeDocumentId, username]);

  useEffect(() => {
    setTitleDraft(activeDocument?.title ?? '');
  }, [activeDocument?.title]);

  useEffect(() => {
    if (!activeDocumentId) return undefined;
    let stopped = false;
    let reconnectTimer = 0;
    let heartbeatTimer = 0;
    let attempt = 0;
    let currentSocket: WebSocket | null = null;
    let serverSnapshotReceived = false;
    const leaveRevokedDocument = () => {
      dirtyRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (cacheTimerRef.current !== null) window.clearTimeout(cacheTimerRef.current);
      cacheTimerRef.current = null;
      void deleteSmartDocSnapshot(username, activeDocumentId).catch(() => undefined);
      try {
        window.localStorage.removeItem(localDraftKey(username, activeDocumentId));
      } catch {
        /* Keep access handling independent of local storage. */
      }
      setMarkdown('');
      markdownRef.current = '';
      setSnapshotReady(false);
      setCanEdit(false);
      setActiveDocumentId(null);
      onDocumentChange?.(null);
      void refreshDocuments();
      toast.error('Your access to this Smart Doc was removed.');
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      setConnection('offline');
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, Math.min(30_000, 1_000 * 2 ** attempt++));
    };

    const connect = async () => {
      if (stopped) return;
      setConnection('connecting');
      try {
        const ticket = await requestSmartDocSocketTicket(activeDocumentId);
        if (stopped) return;
        setCanEdit(ticket.permission === 'edit');
        setDocuments((current) => current.map((item) => (
          item.id === activeDocumentId ? { ...item, permission: ticket.permission } : item
        )));
        void loadSmartDocSnapshot(username, activeDocumentId).then((cached) => {
          if (stopped || serverSnapshotReceived || !cached) return;
          let localDraft = '';
          if (ticket.permission === 'edit') {
            try {
              localDraft = window.localStorage.getItem(localDraftKey(username, activeDocumentId)) ?? '';
            } catch {
              /* IndexedDB remains available when local storage is blocked. */
            }
          }
          const cachedMarkdown = localDraft || cached.markdown;
          markdownRef.current = cachedMarkdown;
          setMarkdown(cachedMarkdown);
          revisionRef.current = cached.revision;
          setRevision(cached.revision);
          setSnapshotReady(true);
          setHydrateVersion((value) => value + 1);
        }).catch(() => undefined);
        const socket = new WebSocket(smartDocSocketUrl(ticket));
        currentSocket = socket;
        socketRef.current = socket;
        socket.onopen = () => {
          if (stopped) return;
          attempt = 0;
          setConnection('connected');
          heartbeatTimer = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' }));
          }, 15_000);
        };
        socket.onmessage = (event) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (payload.type === 'heartbeat_ack') return;
          if (payload.type === 'smartdoc:ready') {
            const permission = payload.permission === 'edit' ? 'edit' : 'view';
            setCanEdit(permission === 'edit');
            return;
          }
          if (payload.type === 'smartdoc:snapshot' || payload.type === 'document:updated') {
            if (typeof payload.markdown !== 'string') return;
            serverSnapshotReceived = true;
            const nextRevision = Number(payload.revision) || 0;
            revisionRef.current = nextRevision;
            setRevision(nextRevision);
            if (payload.type === 'smartdoc:snapshot') {
              let localDraft = '';
              try {
                localDraft = window.localStorage.getItem(localDraftKey(username, activeDocumentId)) ?? '';
              } catch {
                /* Continue with the Durable Object snapshot if local storage is blocked. */
              }
              const snapshotMarkdown = ticket.permission === 'edit' && localDraft && localDraft !== payload.markdown
                ? localDraft
                : payload.markdown;
              void saveSmartDocSnapshot({
                username,
                id: activeDocumentId,
                markdown: snapshotMarkdown,
                revision: nextRevision,
              }).catch(() => undefined);
              if (ticket.permission === 'edit' && localDraft && localDraft !== payload.markdown) {
                markdownRef.current = localDraft;
                setMarkdown(localDraft);
                dirtyRef.current = true;
                setSnapshotReady(true);
                setHydrateVersion((value) => value + 1);
                setSaveState('saving');
                socket.send(JSON.stringify({
                  type: 'document:update',
                  markdown: localDraft,
                  baseRevision: nextRevision,
                }));
              } else {
                dirtyRef.current = false;
                markdownRef.current = payload.markdown;
                setMarkdown(payload.markdown);
                setSnapshotReady(true);
                setHydrateVersion((value) => value + 1);
                setSaveState('saved');
                if (!localDraft || ticket.permission === 'edit') {
                  try {
                    window.localStorage.removeItem(localDraftKey(username, activeDocumentId));
                  } catch {
                    /* The saved snapshot remains authoritative. */
                  }
                }
              }
            } else if (payload.by === username) {
              void saveSmartDocSnapshot({
                username,
                id: activeDocumentId,
                markdown: payload.markdown,
                revision: nextRevision,
              }).catch(() => undefined);
              dirtyRef.current = false;
              try {
                window.localStorage.removeItem(localDraftKey(username, activeDocumentId));
              } catch {
                /* The Durable Object save succeeded. */
              }
              setSaveState('saved');
            } else if (dirtyRef.current || document.activeElement === editorRef.current) {
              toast.info('A collaborator edited this document. Your open draft will sync when you save.');
            } else {
              void saveSmartDocSnapshot({
                username,
                id: activeDocumentId,
                markdown: payload.markdown,
                revision: nextRevision,
              }).catch(() => undefined);
              markdownRef.current = payload.markdown;
              setMarkdown(payload.markdown);
              setHydrateVersion((value) => value + 1);
              setSaveState('saved');
            }
            const updatedAt = Number(payload.updatedAt) || Date.now();
            setDocuments((current) => current.map((item) => (
              item.id === activeDocumentId ? { ...item, updatedAt } : item
            )));
            return;
          }
          if (payload.type === 'smartdoc:title' && typeof payload.title === 'string') {
            setDocuments((current) => current.map((item) => (
              item.id === activeDocumentId ? { ...item, title: payload.title as string } : item
            )));
            setTitleDraft(payload.title);
            return;
          }
          if (payload.type === 'access:changed') {
            setCanEdit(payload.permission === 'edit');
            setDocuments((current) => current.map((item) => (
              item.id === activeDocumentId
                ? { ...item, permission: payload.permission === 'edit' ? 'edit' : 'view' }
                : item
            )));
            return;
          }
          if (payload.type === 'error' && typeof payload.message === 'string') {
            toast.error(payload.message);
          }
        };
        socket.onclose = (event) => {
          window.clearInterval(heartbeatTimer);
          heartbeatTimer = 0;
          if (socketRef.current === socket) socketRef.current = null;
          if (stopped) return;
          setCanEdit(false);
          if (event.code === 1008) {
            setConnection('offline');
            leaveRevokedDocument();
            return;
          }
          scheduleReconnect();
        };
        socket.onerror = () => socket.close();
      } catch (error) {
        if (stopped) return;
        if (error instanceof Error && /access|permission|not found/i.test(error.message)) {
          setCanEdit(false);
          setConnection('offline');
          leaveRevokedDocument();
          return;
        }
        scheduleReconnect();
      }
    };
    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      currentSocket?.close(1000, 'Smart Doc changed');
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
  }, [activeDocumentId, refreshDocuments, username]);

  useEffect(() => {
    if (!activeDocumentId || !snapshotReady || !canEdit) return;
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = markdownToEditorHtml(markdown);
    Array.from(editor.querySelectorAll<HTMLElement>('[data-smartdoc-heading]'))
      .forEach((heading, index) => { heading.dataset.outlineIndex = String(index); });
    const elements = Array.from(editor.querySelectorAll<HTMLElement>('[data-smartdoc-source]'));
    for (const element of elements) {
      const source = element.dataset.smartdocSource;
      if (!source?.startsWith('/api/collab/smartdocs/') || editorObjectUrlsRef.current.has(source)) {
        if (source && editorObjectUrlsRef.current.has(source)) {
          element.setAttribute('src', editorObjectUrlsRef.current.get(source)!);
        }
        continue;
      }
      void fetchSmartDocMedia(source)
        .then((blob) => {
          if (editorRef.current !== editor || !element.isConnected) return;
          const objectUrl = URL.createObjectURL(blob);
          editorObjectUrlsRef.current.set(source, objectUrl);
          element.setAttribute('src', objectUrl);
        })
        .catch(() => undefined);
    }
  }, [activeDocumentId, canEdit, hydrateVersion, markdown, snapshotReady]);

  useEffect(() => {
    if (mentionQuery === null) {
      setMentionUsers([]);
      return undefined;
    }
    if (!mentionQuery) {
      setMentionUsers([]);
      return undefined;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void findChatUsers(mentionQuery)
        .then((users) => { if (alive) setMentionUsers(users.slice(0, 6)); })
        .catch(() => { if (alive) setMentionUsers([]); });
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [mentionQuery]);

  useEffect(() => {
    if (!drivePickerOpen) return undefined;
    let alive = true;
    setDriveLoading(true);
    void listCollabDrive(driveScope, null, { allFiles: true })
      .then((result) => {
        if (alive) setDriveFiles(result.files.filter(fileIsMedia));
      })
      .catch((error) => {
        if (alive) toast.error(error instanceof Error ? error.message : 'Could not load Drive media.');
      })
      .finally(() => { if (alive) setDriveLoading(false); });
    return () => { alive = false; };
  }, [drivePickerOpen, driveScope]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-smartdoc-context-menu]')) return;
      setContextMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    const input = mediaInputRef.current;
    if (!input) return undefined;
    input.addEventListener('cancel', releaseMediaInsertion);
    return () => input.removeEventListener('cancel', releaseMediaInsertion);
  }, [activeDocumentId, releaseMediaInsertion]);

  const handleEditorInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !canEdit) return;
    const nextMarkdown = editorMarkdown(editor);
    markdownRef.current = nextMarkdown;
    setMarkdown(nextMarkdown);
    dirtyRef.current = true;
    if (activeDocumentId) {
      try {
        window.localStorage.setItem(localDraftKey(username, activeDocumentId), nextMarkdown);
      } catch {
        /* Keep editing even when local storage is unavailable. */
      }
      if (cacheTimerRef.current !== null) window.clearTimeout(cacheTimerRef.current);
      const cacheSnapshot = {
        username,
        id: activeDocumentId,
        markdown: nextMarkdown,
        revision: revisionRef.current,
      };
      cacheTimerRef.current = window.setTimeout(() => {
        cacheTimerRef.current = null;
        void saveSmartDocSnapshot(cacheSnapshot).catch(() => undefined);
      }, 120);
    }
    setSaveState('saving');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setSaveState('offline');
        return;
      }
      socket.send(JSON.stringify({
        type: 'document:update',
        markdown: markdownRef.current,
        baseRevision: revisionRef.current,
      }));
    }, DOCUMENT_SAVE_DEBOUNCE_MS);

    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    if (!selection || !anchor || !editor.contains(anchor)) {
      setMentionQuery(null);
      return;
    }
    const beforeCaret = anchor.textContent?.slice(0, selection.anchorOffset) ?? '';
    const mentionMatch = /(?:^|\s)@([A-Za-z0-9_.-]{0,32})$/.exec(beforeCaret);
    if (!mentionMatch) {
      setMentionQuery(null);
      mentionRangeRef.current = null;
      return;
    }
    setMentionQuery(mentionMatch[1]);
    mentionRangeRef.current = selection.getRangeAt(0).cloneRange();
  }, [canEdit]);

  const captureSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const insertHtml = (html: string) => {
    const editor = editorRef.current;
    if (!editor || !canEditNow) return;
    editor.focus();
    const selection = window.getSelection();
    const savedRange = selectionRangeRef.current;
    if (selection) {
      selection.removeAllRanges();
      if (
        savedRange &&
        editor.contains(savedRange.startContainer) &&
        editor.contains(savedRange.endContainer)
      ) {
        selection.addRange(savedRange);
      } else {
        const endRange = document.createRange();
        endRange.selectNodeContents(editor);
        endRange.collapse(false);
        selection.addRange(endRange);
      }
    }
    document.execCommand('insertHTML', false, html);
    selectionRangeRef.current = selection?.rangeCount && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : null;
    handleEditorInput();
  };

  const runCommand = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor || !canEditNow) return;
    editor.focus();
    const selection = window.getSelection();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    document.execCommand(command, false, value);
    selectionRangeRef.current = null;
    handleEditorInput();
  };

  const copySelection = async () => {
    const selectedText = selectionRangeRef.current?.toString() ?? '';
    if (!selectedText) {
      toast.info('Select text in the document first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedText);
      toast.success('Selection copied.');
    } catch {
      toast.error('Clipboard access was blocked by the browser.');
    }
  };

  const cutSelection = async () => {
    const editor = editorRef.current;
    const range = selectionRangeRef.current;
    const selectedText = range?.toString() ?? '';
    if (!editor || !range || !selectedText || !canEditNow) {
      toast.info('Select text in the document first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedText);
      range.deleteContents();
      range.collapse(true);
      selectionRangeRef.current = range.cloneRange();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      editor.focus();
      handleEditorInput();
    } catch {
      toast.error('Could not cut the selection. Check clipboard permissions.');
    }
  };

  const pasteFromClipboard = async () => {
    if (!canEditNow) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) insertHtml(escapeHtml(text).replace(/\r?\n/g, '<br>'));
    } catch {
      toast.error('Clipboard access was blocked. Paste permission may be required.');
    }
  };

  const onToolbarMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    captureSelection();
    event.preventDefault();
  };

  const openMediaPicker = () => {
    if (!canEditNow || mediaUploading) return;
    captureSelection();
    mediaInsertionPendingRef.current = true;
    mediaInputRef.current?.click();
  };

  const openDrivePicker = () => {
    if (!canEditNow) return;
    captureSelection();
    mediaInsertionPendingRef.current = true;
    setDrivePickerOpen(true);
  };

  const closeDrivePicker = () => {
    setDrivePickerOpen(false);
    releaseMediaInsertion();
  };

  const insertCodeBlock = () => {
    if (!canEditNow) return;
    const selection = selectionRangeRef.current?.toString() ?? '';
    const language = window.prompt('Code language (enter mermaid to render a diagram):', '');
    if (language === null) return;
    const safeLanguage = language.trim().replace(/[^A-Za-z0-9_+-]/g, '');
    const className = safeLanguage ? ` class="language-${safeLanguage}"` : '';
    insertHtml(`<pre><code${className}>${escapeHtml(selection || 'Write code here')}</code></pre><p><br></p>`);
  };

  const exportMarkdown = () => {
    if (!activeDocument) return;
    const blob = new Blob([markdownRef.current], { type: 'text/markdown;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = activeDocument.title.trim().replace(/[\\/:*?"<>|]/g, '_') || 'smart-doc';
    link.href = objectUrl;
    link.download = `${safeTitle}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const showEditorContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    captureSelection();
    if (isTodoMode) {
      setTodoContextText((event.target as HTMLElement).closest('li')?.textContent?.trim() ?? '');
    }
    const width = 250;
    const height = canEditNow ? 600 : 100;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  };

  const handleContextAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  const replaceTodoMarkdown = (nextMarkdown: string) => {
    if (!canEditNow) return;
    const editor = editorRef.current;
    if (editor) editor.innerHTML = markdownToEditorHtml(nextMarkdown);
    handleEditorInput();
  };

  const findTodoLineIndex = (lines: string[]) => {
    const selected = (todoContextText || selectionRangeRef.current?.toString() || '')
      .replace(/^\s*(?:☐|☑|□|■)?\s*/, '')
      .replace(/\*\*/g, '')
      .trim()
      .toLocaleLowerCase();
    if (!selected) return -1;
    return lines.findIndex((line) => (
      /^\s*-\s+\[[ xX]\]\s+/.test(line) &&
      line.replace(/^\s*-\s+\[[ xX]\]\s+/, '').replace(/\*\*/g, '').toLocaleLowerCase().includes(selected)
    ));
  };

  const addTodoItem = () => {
    const title = window.prompt('Todo item');
    if (!title?.trim()) return;
    const lines = markdownRef.current.split('\n');
    const headingIndex = lines.findIndex((line) => /^##\s+To-do list\s*$/i.test(line));
    if (headingIndex < 0) {
      lines.push('', '## To-do list', '', `- [ ] ${title.trim()}`);
    } else {
      let insertAt = headingIndex + 1;
      while (insertAt < lines.length && !/^#{1,2}\s+/.test(lines[insertAt])) insertAt += 1;
      lines.splice(insertAt, 0, `- [ ] ${title.trim()}`);
    }
    replaceTodoMarkdown(lines.join('\n'));
  };

  const updateSelectedTodo = (update: (line: string) => string | null) => {
    const lines = markdownRef.current.split('\n');
    const index = findTodoLineIndex(lines);
    if (index < 0) {
      toast.info('Right-click a todo item first.');
      return;
    }
    const nextLine = update(lines[index]);
    if (nextLine === null) lines.splice(index, 1);
    else lines[index] = nextLine;
    replaceTodoMarkdown(lines.join('\n'));
  };

  const addTodoNote = () => {
    const note = window.prompt('Post-call note or reference');
    if (!note?.trim()) return;
    const lines = markdownRef.current.split('\n');
    const headingIndex = lines.findIndex((line) => /^##\s+Post notes\s*$/i.test(line));
    if (headingIndex < 0) lines.push('', '## Post notes', '', note.trim());
    else lines.splice(headingIndex + 1, 0, '', note.trim());
    replaceTodoMarkdown(lines.join('\n'));
  };

  const handleEditorDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!canEditNow || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setMediaDropActive(true);
  };

  const handleEditorDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setMediaDropActive(false);
    }
  };

  const handleEditorDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files);
    setMediaDropActive(false);
    if (!files.length || !canEditNow) return;
    event.preventDefault();
    const editor = editorRef.current;
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => {
        offsetNode: Node;
        offset: number;
      } | null;
    };
    let dropRange = doc.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
    if (!dropRange) {
      const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
      if (caret) {
        dropRange = document.createRange();
        dropRange.setStart(caret.offsetNode, caret.offset);
        dropRange.collapse(true);
      }
    }
    if (editor && dropRange && editor.contains(dropRange.startContainer)) {
      selectionRangeRef.current = dropRange;
    }
    mediaInsertionPendingRef.current = true;
    void onMediaFiles(files);
  };

  const getFloatingMediaPosition = (range: Range | null) => {
    const container = editorScrollRef.current;
    if (!container) return { left: 12, top: 12 };
    const containerRect = container.getBoundingClientRect();
    const rangeRect = range?.getBoundingClientRect();
    const hasCaretRect = !!rangeRect && (rangeRect.width > 0 || rangeRect.height > 0);
    const left = hasCaretRect
      ? rangeRect.left - containerRect.left + container.scrollLeft
      : container.scrollLeft + 12;
    const top = hasCaretRect
      ? rangeRect.bottom - containerRect.top + container.scrollTop + 10
      : container.scrollTop + 12;
    return {
      left: Math.max(
        container.scrollLeft + 8,
        Math.min(left, container.scrollLeft + Math.max(8, container.clientWidth - 218)),
      ),
      top: Math.max(container.scrollTop + 8, top),
    };
  };

  const handleEditorPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (!canEditNow) return;
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.toLowerCase().startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    const files = itemFiles.length
      ? itemFiles
      : Array.from(event.clipboardData.files).filter((file) => file.type.toLowerCase().startsWith('image/'));
    if (!files.length) return;

    event.preventDefault();
    captureSelection();
    mediaInsertionPendingRef.current = true;
    setFloatingMediaProgress({
      ...getFloatingMediaPosition(selectionRangeRef.current),
      label: 'Preparing pasted image…',
      progress: null,
    });
    void onMediaFiles(files, false, true);
  };

  const insertMention = (user: ChatUser) => {
    const editor = editorRef.current;
    const range = mentionRangeRef.current;
    if (!editor || !range || !editor.contains(range.startContainer)) return;
    try {
      const tokenLength = (mentionQuery?.length ?? 0) + 1;
      range.setStart(range.startContainer, Math.max(0, range.startOffset - tokenLength));
      range.deleteContents();
      const token = document.createTextNode(`@${user.username} `);
      range.insertNode(token);
      range.setStartAfter(token);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setMentionQuery(null);
      mentionRangeRef.current = null;
      handleEditorInput();
    } catch {
      toast.error('Could not insert that mention. Try typing it directly.');
    }
  };

  const onMediaFile = async (file: File | undefined, asBanner = false, showFloatingProgress = false) => {
    if (!file || !activeDocumentId || !canEditNow) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Choose an image or video file.');
      return;
    }
    if (asBanner && !file.type.startsWith('image/')) {
      toast.error('Choose an image for the document banner.');
      return;
    }
    try {
      setMediaUploading(true);
      let uploadFile = file;
      if (file.type.startsWith('image/') && file.type.toLowerCase() !== 'image/gif' && !/\.gif$/i.test(file.name)) {
        setMediaStage('Converting image to WebP…');
        setMediaProgress(0);
        if (showFloatingProgress) {
          setFloatingMediaProgress((current) => current
            ? { ...current, label: 'Converting image to WebP…', progress: 0 }
            : current);
        }
        uploadFile = await compressSmartDocImage(file);
        setMediaProgress(100);
        if (showFloatingProgress) {
          setFloatingMediaProgress((current) => current
            ? { ...current, label: 'Converting image to WebP…', progress: 100 }
            : current);
        }
      } else if (file.type.startsWith('video/')) {
        setMediaStage('Compressing video…');
        try {
          uploadFile = await compressSmartDocVideo(file, (progress) => {
            setMediaProgress(Math.round(progress * 100));
            if (showFloatingProgress) {
              setFloatingMediaProgress((current) => current
                ? { ...current, label: 'Compressing video…', progress: Math.round(progress * 100) }
                : current);
            }
          });
        } catch {
          uploadFile = file;
          toast.info('Could not compress this video in the current browser; uploading the original.');
        }
        if (uploadFile !== file && uploadFile.size >= file.size) {
          uploadFile = file;
          toast.info('This video is already compact; uploading the original.');
        }
      }
      if (uploadFile.size > 50 * 1024 * 1024) {
        throw new Error('The media is still larger than the 50 MB document limit after compression.');
      }
      setMediaStage('Uploading media…');
      setMediaProgress(null);
      if (showFloatingProgress) {
        setFloatingMediaProgress((current) => current
          ? {
              ...current,
              label: uploadFile.type.startsWith('video/') ? 'Uploading video…' : 'Uploading image…',
              progress: null,
            }
          : current);
      }
      const asset = await uploadSmartDocMedia(activeDocumentId, uploadFile);
      const kind = asset.mimeType.startsWith('video/') ? 'video' : undefined;
      const source = smartDocMediaUrl(activeDocumentId, asset.id, kind);
      if (asBanner) {
        const updated = await updateSmartDoc(activeDocumentId, { bannerAssetId: asset.id });
        setDocuments((current) => current.map((item) => (
          item.id === activeDocumentId
            ? { ...item, bannerAssetId: updated.bannerAssetId, updatedAt: updated.updatedAt }
            : item
        )));
        toast.success('Banner updated.');
      } else {
        const previewUrl = URL.createObjectURL(uploadFile);
        editorObjectUrlsRef.current.set(source, previewUrl);
        if (kind === 'video') {
          insertHtml(`<video controls data-smartdoc-kind="video" data-smartdoc-name="${escapeHtml(uploadFile.name)}" data-smartdoc-source="${source}" src="${previewUrl}" contenteditable="false"></video>`);
        } else {
          insertHtml(`<img alt="${escapeHtml(uploadFile.name)}" data-smartdoc-source="${source}" src="${previewUrl}" contenteditable="false" />`);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload media.');
    } finally {
      setMediaUploading(false);
      setMediaProgress(null);
      setMediaStage('');
      if (mediaInputRef.current) mediaInputRef.current.value = '';
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const onMediaFiles = async (files: File[], asBanner = false, showFloatingProgress = false) => {
    try {
      for (const file of files) await onMediaFile(file, asBanner, showFloatingProgress);
    } finally {
      releaseMediaInsertion();
      if (showFloatingProgress) setFloatingMediaProgress(null);
    }
  };

  const insertDriveFile = async (file: CollabDriveFile) => {
    if (!activeDocumentId) return;
    const kind = file.mime_type.startsWith('video/') ? 'video' : 'image';
    const source = smartDocDriveMediaUrl(activeDocumentId, file.id, kind);
    const label = escapeHtml(file.name);
    try {
      await attachSmartDocDriveMedia(activeDocumentId, file.id);
      const previewUrl = URL.createObjectURL(await fetchSmartDocMedia(source));
      editorObjectUrlsRef.current.set(source, previewUrl);
      if (kind === 'video') {
        insertHtml(`<video controls data-smartdoc-kind="video" data-smartdoc-name="${label}" data-smartdoc-source="${source}" src="${previewUrl}" contenteditable="false"></video>`);
      } else {
        insertHtml(`<img alt="${label}" data-smartdoc-source="${source}" src="${previewUrl}" contenteditable="false" />`);
      }
      closeDrivePicker();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not insert this Drive media.');
    }
  };

  const loadAccess = async () => {
    if (!activeDocumentId) return;
    try {
      setMembers(await listSmartDocAccess(activeDocumentId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load document access.');
    }
  };

  const saveAccess = async (user: ChatUser, permission: SmartDocPermission | 'remove') => {
    if (!activeDocumentId) return;
    try {
      setMembers(await setSmartDocAccess(activeDocumentId, user.username, permission));
      setSelectedUser(null);
      setMemberQuery('');
      toast.success(permission === 'remove' ? 'Access removed.' : 'Document access updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update access.');
    }
  };

  const saveTitle = async () => {
    if (!activeDocument || !isOwner || titleDraft.trim() === activeDocument.title) return;
    try {
      const updated = await updateSmartDoc(activeDocument.id, { title: titleDraft });
      setDocuments((current) => current.map((item) => (
        item.id === activeDocument.id ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item
      )));
      toast.success('Document title saved.');
    } catch (error) {
      setTitleDraft(activeDocument.title);
      toast.error(error instanceof Error ? error.message : 'Could not rename this document.');
    }
  };

  const saveVisibility = async (visibility: SmartDoc['visibility']) => {
    if (!activeDocument || !isOwner || savingVisibility) return;
    try {
      setSavingVisibility(true);
      const updated = await updateSmartDoc(activeDocument.id, { visibility });
      setDocuments((current) => current.map((item) => (
        item.id === activeDocument.id
          ? { ...item, visibility: updated.visibility, updatedAt: updated.updatedAt }
          : item
      )));
      toast.success(visibility === 'registered'
        ? 'Anyone with a registered account can view this Smart Doc.'
        : 'This Smart Doc is private to invited collaborators.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update document visibility.');
    } finally {
      setSavingVisibility(false);
    }
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      const document = await createSmartDoc(newTitle, documentKind);
      setDocuments((current) => [document, ...current]);
      setNewTitle('');
      setCreateOpen(false);
      setActiveDocumentId(document.id);
      onDocumentChange?.(document.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not create this ${isTodoMode ? 'Smart Todo' : 'Smart Doc'}.`);
    } finally {
      setCreating(false);
    }
  };

  const deleteDocument = async () => {
    if (!activeDocument || !isOwner) return;
    if (!window.confirm(`Delete “${activeDocument.title}” and its uploaded media?`)) return;
    try {
      await deleteSmartDoc(activeDocument.id);
      void deleteSmartDocSnapshot(username, activeDocument.id).catch(() => undefined);
      try {
        window.localStorage.removeItem(localDraftKey(username, activeDocument.id));
      } catch {
        /* Keep delete behavior independent of local storage. */
      }
      setDocuments((current) => current.filter((item) => item.id !== activeDocument.id));
      setActiveDocumentId(null);
      onDocumentChange?.(null);
      toast.success(`${isTodoMode ? 'Smart Todo' : 'Smart Doc'} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this Smart Doc.');
    }
  };

  const jumpToHeading = (index: number) => {
    const target = document.querySelector<HTMLElement>(`[data-smartdoc-heading][data-outline-index="${index}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const currentComponents = useMemo(() => markdownComponents(), [activeDocumentId]);
  useEffect(() => {
    const preview = document.querySelector('.smart-doc-preview');
    if (!preview) return;
    Array.from(preview.querySelectorAll<HTMLElement>('[data-smartdoc-heading]'))
      .forEach((heading, index) => { heading.dataset.outlineIndex = String(index); });
  }, [activeDocumentId, canEdit, markdown, snapshotReady]);

  if (loading) {
    return <section className="smart-docs-page"><div className="smart-docs-loading"><Loader2 className="size-5 animate-spin" />Loading {isTodoMode ? 'Smart Todos' : 'Smart Docs'}…</div></section>;
  }

  if (!activeDocument) {
    return (
      <section className="collab-tool-page smart-docs-page">
        <header className="collab-tool-header">
          <div>
            <p className="collab-tool-eyebrow">Documents</p>
            <h2>{isTodoMode ? 'Smart Todos' : 'Smart Docs'}</h2>
            <p className="collab-tool-subtitle">{isTodoMode
              ? 'Personal action lists and post-call notes. Pin one in chat to give everyone there edit access.'
              : 'Shared, live-updating documents for your team.'}</p>
          </div>
          <button type="button" className="collab-tool-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> {isTodoMode ? 'New todo' : 'New document'}
          </button>
        </header>
        {documents.length ? (
          <div className="smart-docs-library">
            {documents.map((item) => (
              <button type="button" className="smart-doc-card" key={item.id} onClick={() => {
                setActiveDocumentId(item.id);
                onDocumentChange?.(item.id);
              }}>
                <span className="smart-doc-card-icon"><FileText className="size-5" /></span>
                <span className="smart-doc-card-copy">
                  <strong>{item.title}</strong>
                  <small>{item.owner.toLowerCase() === username.toLowerCase() ? 'You own this document' : `Shared by ${item.owner}`}</small>
                </span>
                <span className="smart-doc-card-meta">
                  <span>{item.permission === 'edit' ? 'Can edit' : 'View only'}</span>
                  <span>{formatModified(item.updatedAt)}</span>
                </span>
                <ChevronRight className="smart-doc-card-chevron size-4" />
              </button>
            ))}
          </div>
        ) : (
          <div className="smart-docs-empty">
            <span>{isTodoMode ? <CheckSquare2 className="size-7" /> : <FileText className="size-7" />}</span>
            <h3>{isTodoMode ? 'Start a Smart Todo' : 'Start a shared document'}</h3>
            <p>{isTodoMode
              ? 'Capture tasks, owners, priorities, due dates, post-call notes, and follow-ups. Keep it personal or share it in a chat.'
              : 'Write together in a live Markdown document, add media, and choose who can view or edit.'}</p>
            <button type="button" className="collab-tool-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> {isTodoMode ? 'Create Smart Todo' : 'Create Smart Doc'}
            </button>
          </div>
        )}
        {createOpen && (
          <div className="smart-doc-modal-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}>
            <form className="smart-doc-modal" onSubmit={(event) => void submitCreate(event)}>
              <header><div><p className="collab-tool-eyebrow">New {isTodoMode ? 'todo' : 'document'}</p><h3>Create a {isTodoMode ? 'Smart Todo' : 'Smart Doc'}</h3></div><button type="button" className="collab-tool-icon" aria-label="Close" onClick={() => setCreateOpen(false)}><X className="size-4" /></button></header>
              <label className="smart-doc-field">{isTodoMode ? 'Todo title' : 'Document title'}
                <input autoFocus maxLength={100} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder={isTodoMode ? 'e.g. Replacement follow-up' : 'e.g. Team playbook'} required />
              </label>
              <footer><button type="button" className="collab-tool-secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" className="collab-tool-primary" disabled={creating}>{creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create</button></footer>
            </form>
          </div>
        )}
      </section>
    );
  }

  const saveStatusText = connection !== 'connected'
    ? 'Reconnecting…'
    : saveState === 'saving' ? `Saving to ${isTodoMode ? 'Smart Todos' : 'Smart Docs'}…` : 'All changes saved';
  const bannerSource = activeDocument.bannerAssetId
    ? smartDocMediaUrl(activeDocument.id, activeDocument.bannerAssetId)
    : '';

  return (
    <section className="smart-docs-page smart-doc-editor-page">
      <header className="smart-doc-editor-header">
        {!embedded && (
          <button type="button" className="collab-tool-icon" aria-label={`Back to ${isTodoMode ? 'Smart Todos' : 'Smart Docs'}`} onClick={() => {
            setActiveDocumentId(null);
            onDocumentChange?.(null);
            void refreshDocuments();
          }}><ArrowLeft className="size-4" /></button>
        )}
        <div className="smart-doc-title-wrap">
          <input
            value={titleDraft}
            readOnly={!isOwner}
            aria-label="Document title"
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          />
          <span className={`smart-doc-connection smart-doc-connection--${connection}`}>
            <i />{saveStatusText}
          </span>
        </div>
        <div className="smart-doc-header-actions">
          {isOwner && (
            <>
              <button type="button" className="collab-tool-secondary smart-doc-header-button" onClick={() => {
                setAccessOpen(true);
                void loadAccess();
              }}><Share2 className="size-3.5" /> Share</button>
              <button type="button" className="collab-tool-icon" title="Delete document" aria-label="Delete document" onClick={() => void deleteDocument()}><Trash2 className="size-4" /></button>
            </>
          )}
        </div>
      </header>

      {BANNERS_ENABLED && bannerSource && (
        <div className="smart-doc-banner">
          <SmartDocInlineMedia source={bannerSource} title={`${activeDocument.title} banner`} kind="image" />
        </div>
      )}
      {BANNERS_ENABLED && isOwner && (
        <div className="smart-doc-banner-actions">
          <button type="button" className="smart-doc-text-button" onClick={() => bannerInputRef.current?.click()}>
            <ImagePlus className="size-3.5" /> {bannerSource ? 'Change banner' : 'Add banner image'}
          </button>
          {bannerSource && <button type="button" className="smart-doc-text-button" onClick={() => {
            void updateSmartDoc(activeDocument.id, { bannerAssetId: null })
              .then(() => setDocuments((current) => current.map((item) => (
                item.id === activeDocument.id ? { ...item, bannerAssetId: null } : item
              ))))
              .catch((error) => toast.error(error instanceof Error ? error.message : 'Could not remove banner.'));
          }}>Remove banner</button>}
          <input ref={bannerInputRef} hidden type="file" accept="image/*" onChange={(event) => void onMediaFile(event.target.files?.[0], true)} />
        </div>
      )}

      <div className={`smart-doc-workspace ${outlineOpen ? '' : 'is-outline-collapsed'}`}>
        <aside className="smart-doc-outline">
          <div className="smart-doc-outline-header">
            <strong>On this page</strong>
            <button type="button" className="smart-doc-small-icon" aria-label="Collapse outline" onClick={() => setOutlineOpen(false)}><PanelLeftClose className="size-4" /></button>
          </div>
          {outline.length ? (
            <nav aria-label="Document headings">
              {outline.map((heading, index) => (
                <button
                  type="button"
                  key={`${heading.text}-${index}`}
                  className={`smart-doc-outline-item smart-doc-outline-item--${heading.level}`}
                  onClick={() => jumpToHeading(index)}
                >{heading.text}</button>
              ))}
            </nav>
          ) : (
            <p className="smart-doc-outline-empty">Use heading styles to build an outline.</p>
          )}
        </aside>

        <main className="smart-doc-main">
          <div className="smart-doc-toolbar" aria-label="Formatting tools">
            <button type="button" disabled={!canEditNow} aria-label="Heading 1" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('formatBlock', 'H1')}><Heading1 className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Heading 2" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('formatBlock', 'H2')}><Heading2 className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Heading 3" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('formatBlock', 'H3')}><Heading3 className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Heading 4" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('formatBlock', 'H4')}><Heading4 className="size-4" /></button>
            <span className="smart-doc-toolbar-divider" />
            <button type="button" disabled={!canEditNow} aria-label="Bold" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('bold')}><Bold className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Italic" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('italic')}><Italic className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Bulleted list" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('insertUnorderedList')}><List className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Numbered list" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('insertOrderedList')}><ListOrdered className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Quote" onMouseDown={onToolbarMouseDown} onClick={() => runCommand('formatBlock', 'BLOCKQUOTE')}><Quote className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Insert code block" title="Insert code block" onMouseDown={onToolbarMouseDown} onClick={insertCodeBlock}><Code2 className="size-4" /></button>
            <button type="button" disabled={!canEditNow} aria-label="Insert link" onMouseDown={onToolbarMouseDown} onClick={() => {
              const url = window.prompt('Enter a link URL');
              if (url) runCommand('createLink', url);
            }}><Link2 className="size-4" /></button>
            <span className="smart-doc-toolbar-divider" />
            <button type="button" disabled={!canEditNow || mediaUploading} aria-label="Upload image or video" title="Upload image or video" onMouseDown={onToolbarMouseDown} onClick={openMediaPicker}>
              {mediaUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            </button>
            <button type="button" disabled={!canEditNow} aria-label="Insert media from Drive" title="Insert media from Drive" onMouseDown={onToolbarMouseDown} onClick={openDrivePicker}><ImagePlus className="size-4" /></button>
            {isTodoMode && (
              <button type="button" disabled={!canEditNow} className="smart-doc-todo-add" onMouseDown={(event) => event.preventDefault()} onClick={addTodoItem}>
                <Plus className="size-3.5" /> Add todo
              </button>
            )}
            <input
              ref={mediaInputRef}
              hidden
              type="file"
              multiple
              accept="image/*,video/mp4,video/webm,video/quicktime"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) void onMediaFiles(files);
                else releaseMediaInsertion();
              }}
            />
            <span className="smart-doc-toolbar-hint">Markdown supported</span>
          </div>
          {mediaUploading && !floatingMediaProgress && (
            <div className="smart-doc-media-progress" role="status" aria-live="polite">
              <span>{mediaStage || 'Processing media…'}</span>
              {mediaProgress === null
                ? <i className="is-indeterminate" />
                : <div role="progressbar" aria-label={mediaStage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mediaProgress}><i style={{ width: `${mediaProgress}%` }} /></div>}
              {mediaProgress !== null && <small>{mediaProgress}%</small>}
            </div>
          )}

          {!snapshotReady ? (
            <div className="smart-doc-editor-loading"><Loader2 className="size-4 animate-spin" />Connecting to the shared document…</div>
          ) : canEditNow ? (
            <div
              className={`smart-doc-editor-scroll ${mediaDropActive ? 'is-media-dragging' : ''}`}
              ref={editorScrollRef}
              onDragOver={handleEditorDragOver}
              onDragLeave={handleEditorDragLeave}
              onDrop={handleEditorDrop}
              onContextMenu={showEditorContextMenu}
            >
              {mediaDropActive && <div className="smart-doc-drop-overlay"><Upload className="size-5" />Drop images or videos to insert</div>}
              {floatingMediaProgress && (
                <div
                  className="smart-doc-media-floating-progress"
                  role="status"
                  aria-live="polite"
                  style={{
                    left: floatingMediaProgress.left,
                    top: floatingMediaProgress.top,
                  }}
                >
                  <span>{floatingMediaProgress.label}</span>
                  <div
                    className="smart-doc-media-floating-track"
                    role="progressbar"
                    aria-label={floatingMediaProgress.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={floatingMediaProgress.progress ?? undefined}
                  >
                    <i
                      className={floatingMediaProgress.progress === null ? 'is-indeterminate' : ''}
                      style={floatingMediaProgress.progress === null
                        ? undefined
                        : { width: `${floatingMediaProgress.progress}%` }}
                    />
                  </div>
                  {floatingMediaProgress.progress !== null && (
                    <small>{floatingMediaProgress.progress}%</small>
                  )}
                </div>
              )}
              <div
                key={activeDocument.id}
                ref={editorRef}
                className="smart-doc-editor"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label={isTodoMode ? 'Smart Todo editor' : 'Smart Doc editor'}
                aria-multiline="true"
                spellCheck
                onInput={handleEditorInput}
                onPaste={handleEditorPaste}
                onKeyUp={captureSelection}
                onMouseUp={captureSelection}
                onFocus={() => setMentionQuery(null)}
                onBlur={() => {
                  setMentionQuery(null);
                  if (!mediaInsertionPendingRef.current) {
                    setHydrateVersion((value) => value + 1);
                  }
                }}
              />
              {!markdown.trim() && <span className="smart-doc-editor-placeholder">{isTodoMode ? 'Add a todo, owner, priority, due date, or post-call note…' : 'Write in Markdown or use the formatting toolbar…'}</span>}
              {mentionQuery !== null && mentionUsers.length > 0 && (
                <div className="smart-doc-mention-menu">
                  <span>Mention a teammate</span>
                  {mentionUsers.map((user) => (
                    <button type="button" key={user.username} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(user)}>
                      <span>{user.username.slice(0, 1).toUpperCase()}</span>{user.username}
                    </button>
                  ))}
                </div>
              )}
              {contextMenu && (
                <div
                  className="smart-doc-context-menu"
                  data-smartdoc-context-menu
                  role="menu"
                  aria-label="Markdown editor actions"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <span className="smart-doc-context-menu-title">{isTodoMode ? 'Todo list controls' : 'Markdown editor'}</span>
                  {canEditNow && isTodoMode && (
                    <>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(addTodoItem)}><ListTodo className="size-4" />Add todo item</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => updateSelectedTodo((line) => line.replace(/^(\s*-\s+)\[ \]/, '$1[x]')))}><CheckSquare2 className="size-4" />Mark complete</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => updateSelectedTodo((line) => line.replace(/^(\s*-\s+)\[[xX]\]/, '$1[ ]')))}><CheckSquare2 className="size-4" />Mark incomplete</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => updateSelectedTodo((line) => {
                        const priority = window.prompt('Priority (High, Normal, or Low)', 'Normal');
                        if (!priority?.trim()) return line;
                        return /Priority:\s*[^·|]+/i.test(line)
                          ? line.replace(/Priority:\s*[^·|]+/i, `Priority: ${priority.trim()}`)
                          : `${line} · Priority: ${priority.trim()}`;
                      }))}><ListTodo className="size-4" />Set priority</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => updateSelectedTodo((line) => {
                        const owner = window.prompt('Task owner', '');
                        if (!owner?.trim()) return line;
                        return /Owner:\s*[^·|]+/i.test(line)
                          ? line.replace(/Owner:\s*[^·|]+/i, `Owner: ${owner.trim()}`)
                          : `${line} · Owner: ${owner.trim()}`;
                      }))}><UsersRound className="size-4" />Assign owner</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => updateSelectedTodo((line) => {
                        const dueDate = window.prompt('Due date (YYYY-MM-DD)', '');
                        if (!dueDate?.trim()) return line;
                        return /Due:\s*[^·|]+/i.test(line)
                          ? line.replace(/Due:\s*[^·|]+/i, `Due: ${dueDate.trim()}`)
                          : `${line} · Due: ${dueDate.trim()}`;
                      }))}><ListTodo className="size-4" />Set due date</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => updateSelectedTodo(() => null))}><Trash2 className="size-4" />Delete todo item</button>
                      <span className="smart-doc-context-menu-divider" />
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(addTodoNote)}><FileText className="size-4" />Add post-call note</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void copySelection(); })}><ClipboardCopy className="size-4" />Copy selection</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void pasteFromClipboard(); })}><ClipboardPaste className="size-4" />Paste</button>
                    </>
                  )}
                  {canEditNow && !isTodoMode && (
                    <>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void copySelection(); })}><ClipboardCopy className="size-4" />Copy selection</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void cutSelection(); })}><Scissors className="size-4" />Cut selection</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void pasteFromClipboard(); })}><ClipboardPaste className="size-4" />Paste</button>
                      <span className="smart-doc-context-menu-divider" />
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'H1'))}><Heading1 className="size-4" />Heading 1</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'H2'))}><Heading2 className="size-4" />Heading 2</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'H3'))}><Heading3 className="size-4" />Heading 3</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'H4'))}><Heading4 className="size-4" />Heading 4</button>
                      <span className="smart-doc-context-menu-divider" />
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('bold'))}><Bold className="size-4" />Bold</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('italic'))}><Italic className="size-4" />Italic</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('insertUnorderedList'))}><List className="size-4" />Bulleted list</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('insertOrderedList'))}><ListOrdered className="size-4" />Numbered list</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'BLOCKQUOTE'))}><Quote className="size-4" />Quote</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(insertCodeBlock)}><Code2 className="size-4" />Code block</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => {
                        const url = window.prompt('Enter a link URL');
                        if (url) runCommand('createLink', url);
                      })}><Link2 className="size-4" />Insert link</button>
                      <span className="smart-doc-context-menu-divider" />
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(openMediaPicker)}><Upload className="size-4" />Upload image or video</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(openDrivePicker)}><ImagePlus className="size-4" />Insert media from Drive</button>
                    </>
                  )}
                  <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(exportMarkdown)}><Download className="size-4" />Export as Markdown</button>
                </div>
              )}
              <div className="smart-doc-editor-footer">
                <span>{isTodoMode ? 'Todo list and notes' : 'Markdown document'} · {markdown.length.toLocaleString()} characters</span>
                <span>Rev {revision}</span>
              </div>
            </div>
          ) : (
            <div className="smart-doc-preview-scroll" onContextMenu={showEditorContextMenu}>
              {contextMenu && (
                <div
                  className="smart-doc-context-menu"
                  data-smartdoc-context-menu
                  role="menu"
                  aria-label="Document actions"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <span className="smart-doc-context-menu-title">Document actions</span>
                  <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(exportMarkdown)}><Download className="size-4" />Export as Markdown</button>
                </div>
              )}
              {connection === 'offline' && activeDocument.permission === 'edit' && (
                <div className="smart-doc-offline-note"><CircleHelp className="size-4" /> Reconnect to edit this document.</div>
              )}
              <article className="smart-doc-preview" aria-label="Document content">
                {markdown.trim()
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={currentComponents}>{markdown}</ReactMarkdown>
                  : <p className="smart-doc-preview-empty">This document is empty.</p>}
              </article>
              <p className="smart-doc-readonly-note">{activeDocument.permission === 'view' ? 'View-only access' : 'Markdown document'} · Revision {revision}</p>
            </div>
          )}
        </main>
      </div>

      {!outlineOpen && (
        <button type="button" className="smart-doc-outline-expand" aria-label="Expand outline" title="Show document outline" onClick={() => setOutlineOpen(true)}>
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      {accessOpen && activeDocument && (
        <div className="smart-doc-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAccessOpen(false);
        }}>
          <section className="smart-doc-modal smart-doc-access-modal">
            <header><div><p className="collab-tool-eyebrow">Document permissions</p><h3>Share “{activeDocument.title}”</h3></div><button type="button" className="collab-tool-icon" aria-label="Close" onClick={() => setAccessOpen(false)}><X className="size-4" /></button></header>
            {isTodoMode ? (
              <div className="smart-doc-visibility-control">
                <span><strong>Personal unless shared</strong><small>Pin this todo into a chat to give every chat member edit access.</small></span>
              </div>
            ) : (
              <div className="smart-doc-visibility-control">
                <span><strong>Who can view?</strong><small>Registered users always get view-only access.</small></span>
                <select
                  value={activeDocument.visibility ?? 'private'}
                  aria-label="Document visibility"
                  disabled={!isOwner || savingVisibility}
                  onChange={(event) => void saveVisibility(event.target.value as SmartDoc['visibility'])}
                >
                  <option value="private">Only invited people</option>
                  <option value="registered">Anyone registered</option>
                </select>
              </div>
            )}
            <div className="smart-doc-access-list">
              {members.map((member) => (
                <div className="smart-doc-access-row" key={member.username}>
                  <span className="smart-doc-member-avatar">{member.username.slice(0, 1).toUpperCase()}</span>
                  <span className="smart-doc-member-name">{member.username}{member.owner && <small>Owner</small>}</span>
                  {member.owner ? <span className="smart-doc-owner-label">Owner</span> : (
                    <>
                      <select value={member.permission} aria-label={`${member.username} permission`} onChange={(event) => void saveAccess(member, event.target.value as SmartDocPermission)}>
                        <option value="view">Can view</option><option value="edit">Can edit</option>
                      </select>
                      <button type="button" className="smart-doc-small-icon" title="Remove access" aria-label={`Remove ${member.username}`} onClick={() => void saveAccess(member, 'remove')}><X className="size-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="smart-doc-invite">
              <label className="smart-doc-field">Add a teammate
                <span className="smart-doc-search"><Search className="size-4" /><input value={memberQuery} onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setSelectedUser(null);
                }} placeholder="Search registered users" /></span>
              </label>
              {!selectedUser && userResults.filter((user) => (
                user.username.toLowerCase() !== username.toLowerCase() &&
                !members.some((member) => member.username.toLowerCase() === user.username.toLowerCase())
              )).length > 0 && (
                <div className="smart-doc-user-results">
                  {userResults.filter((user) => (
                    user.username.toLowerCase() !== username.toLowerCase() &&
                    !members.some((member) => member.username.toLowerCase() === user.username.toLowerCase())
                  )).map((user) => (
                    <button type="button" key={user.username} onClick={() => {
                      setSelectedUser(user);
                      setMemberQuery(user.username);
                    }}><span>{user.username.slice(0, 1).toUpperCase()}</span>{user.username}</button>
                  ))}
                </div>
              )}
              {!selectedUser && searchingMembers && userResults.length === 0 && (
                <p className="smart-doc-user-empty">Searching users…</p>
              )}
              {!selectedUser && !searchingMembers && userResults.filter((user) => (
                user.username.toLowerCase() !== username.toLowerCase() &&
                !members.some((member) => member.username.toLowerCase() === user.username.toLowerCase())
              )).length === 0 && (
                <p className="smart-doc-user-empty">No registered users found — everyone is already on this document.</p>
              )}
              <div className="smart-doc-invite-actions">
                <select value={memberPermission} onChange={(event) => setMemberPermission(event.target.value as SmartDocPermission)} aria-label="New member permission">
                  <option value="view">Can view</option><option value="edit">Can edit</option>
                </select>
                <button type="button" className="collab-tool-primary" disabled={!selectedUser} onClick={() => selectedUser && void saveAccess(selectedUser, memberPermission)}>
                  <Plus className="size-3.5" /> Add
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {drivePickerOpen && (
        <div className="smart-doc-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDrivePicker();
        }}>
          <section className="smart-doc-modal smart-doc-drive-modal">
            <header><div><p className="collab-tool-eyebrow">Insert media</p><h3>Choose from Drive</h3></div><button type="button" className="collab-tool-icon" aria-label="Close" onClick={closeDrivePicker}><X className="size-4" /></button></header>
            <div className="smart-doc-drive-scopes">
              {(['team', 'personal'] as const).map((scope) => (
                <button type="button" key={scope} aria-pressed={driveScope === scope} onClick={() => setDriveScope(scope)}>
                  {scope === 'team' ? 'Team Drive' : 'Personal Drive'}
                </button>
              ))}
            </div>
            {driveLoading ? <div className="smart-doc-loading-inline"><Loader2 className="size-4 animate-spin" />Loading media…</div> : driveFiles.length ? (
              <div className="smart-doc-drive-files">
                {driveFiles.map((file) => (
                  <button type="button" key={file.id} onClick={() => insertDriveFile(file)}>
                    <span className="smart-doc-drive-file-icon">{file.mime_type.startsWith('video/') ? <Video className="size-4" /> : <ImagePlus className="size-4" />}</span>
                    <span><strong>{file.name}</strong><small>{file.mime_type.startsWith('video/') ? 'Video' : 'Image'} · {file.scope === 'team' ? 'Team Drive' : 'Personal Drive'}</small></span>
                    <Plus className="size-4" />
                  </button>
                ))}
              </div>
            ) : <div className="smart-doc-loading-inline">No image or video files in this Drive scope.</div>}
          </section>
        </div>
      )}
    </section>
  );
}

export function SmartDocPinnedPreview({
  username,
  documentId,
}: {
  username: string;
  documentId: string;
}) {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const components = useMemo(() => markdownComponents(), []);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let heartbeatTimer = 0;
    let attempt = 0;
    let serverSnapshotReceived = false;
    let accessRevoked = false;

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, Math.min(30_000, 1_000 * 2 ** attempt++));
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const ticket = await requestSmartDocSocketTicket(documentId);
        if (stopped) return;
        const currentSocket = new WebSocket(smartDocSocketUrl(ticket));
        socket = currentSocket;
        void loadSmartDocSnapshot(username, documentId).then((cached) => {
          if (stopped || accessRevoked || serverSnapshotReceived || !cached) return;
          setMarkdown(cached.markdown);
          setLoading(false);
        }).catch(() => undefined);
        currentSocket.onopen = () => {
          if (stopped) return;
          attempt = 0;
          heartbeatTimer = window.setInterval(() => {
            if (currentSocket.readyState === WebSocket.OPEN) {
              currentSocket.send(JSON.stringify({ type: 'heartbeat' }));
            }
          }, 15_000);
        };
        currentSocket.onmessage = (event) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (
            (payload.type !== 'smartdoc:snapshot' && payload.type !== 'document:updated') ||
            typeof payload.markdown !== 'string'
          ) return;
          serverSnapshotReceived = true;
          setMarkdown(payload.markdown);
          setLoading(false);
          setError('');
          void saveSmartDocSnapshot({
            username,
            id: documentId,
            markdown: payload.markdown,
            revision: Number(payload.revision) || 0,
          }).catch(() => undefined);
        };
        currentSocket.onclose = (event) => {
          window.clearInterval(heartbeatTimer);
          heartbeatTimer = 0;
          if (stopped) return;
          if (event.code === 1008) {
            accessRevoked = true;
            setMarkdown('');
            void deleteSmartDocSnapshot(username, documentId).catch(() => undefined);
            setError('You no longer have access to this Smart Doc.');
            setLoading(false);
            return;
          }
          scheduleReconnect();
        };
        currentSocket.onerror = () => currentSocket.close();
      } catch (cause) {
        if (stopped) return;
        if (cause instanceof Error && /access|permission|not found/i.test(cause.message)) {
          accessRevoked = true;
          setMarkdown('');
          void deleteSmartDocSnapshot(username, documentId).catch(() => undefined);
          setError('You do not have access to this Smart Doc.');
          setLoading(false);
          return;
        }
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      socket?.close(1000, 'Pinned Smart Doc closed');
    };
  }, [documentId, username]);

  return (
    <div className="smart-doc-pinned-preview">
      {loading && !markdown && <div className="smart-doc-editor-loading">Loading pinned document…</div>}
      {error && <div className="smart-doc-offline-note">{error}</div>}
      {!loading && !error && !markdown.trim() && (
        <p className="smart-doc-preview-empty">This document is empty.</p>
      )}
      {markdown && (
        <article className="smart-doc-preview" aria-label="Pinned Smart Doc">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
