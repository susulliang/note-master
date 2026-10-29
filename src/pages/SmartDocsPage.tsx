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
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  Bold,
  ClipboardCopy,
  ClipboardPaste,
  Code2,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  FileText,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
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
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
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
  type SmartDocMember,
  type SmartDocPermission,
} from '@/lib/smartdocs-client';
import './SmartDocsPage.css';

interface SmartDocsPageProps {
  username: string;
  initialDocumentId?: string;
}

interface OutlineHeading {
  level: number;
  text: string;
}

const MAX_DOCUMENT_CHARACTERS = 500_000;
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

function localDraftKey(documentId: string): string {
  return `econote:smartdoc-draft:${documentId}`;
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

export default function SmartDocsPage({ username, initialDocumentId }: SmartDocsPageProps) {
  const [documents, setDocuments] = useState<SmartDoc[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [memberPermission, setMemberPermission] = useState<SmartDocPermission>('view');
  const [memberQuery, setMemberQuery] = useState('');
  const [userResults, setUserResults] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveScope, setDriveScope] = useState<'team' | 'personal'>('team');
  const [driveFiles, setDriveFiles] = useState<CollabDriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [mediaStage, setMediaStage] = useState('');
  const [mediaDropActive, setMediaDropActive] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<ChatUser[]>([]);
  const [hydrateVersion, setHydrateVersion] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const mentionRangeRef = useRef<Range | null>(null);
  const editorObjectUrlsRef = useRef(new Map<string, string>());
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const outline = useMemo(() => headingList(markdown), [markdown]);
  const isOwner = !!activeDocument && activeDocument.owner.toLowerCase() === username.toLowerCase();
  const canManageAccess = isOwner;
  const canEditNow = canEdit && connection === 'connected' && snapshotReady;

  const refreshDocuments = useCallback(async () => {
    try {
      setDocuments(await listSmartDocs());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Smart Docs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    if (initialDocumentId && documents.some((document) => document.id === initialDocumentId)) {
      setActiveDocumentId(initialDocumentId);
    }
  }, [documents, initialDocumentId]);

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
    setPreviewMode(false);
    setContextMenu(null);
    setMediaDropActive(false);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    editorObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    editorObjectUrlsRef.current.clear();
    return () => {
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
  }, [activeDocumentId]);

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
    const leaveRevokedDocument = () => {
      dirtyRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      try {
        window.localStorage.removeItem(localDraftKey(activeDocumentId));
      } catch {
        /* Keep access handling independent of local storage. */
      }
      setMarkdown('');
      markdownRef.current = '';
      setSnapshotReady(false);
      setCanEdit(false);
      setActiveDocumentId(null);
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
            const nextRevision = Number(payload.revision) || 0;
            revisionRef.current = nextRevision;
            setRevision(nextRevision);
            if (payload.type === 'smartdoc:snapshot') {
              let localDraft = '';
              try {
                localDraft = window.localStorage.getItem(localDraftKey(activeDocumentId)) ?? '';
              } catch {
                /* Continue with the Durable Object snapshot if local storage is blocked. */
              }
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
                    window.localStorage.removeItem(localDraftKey(activeDocumentId));
                  } catch {
                    /* The saved snapshot remains authoritative. */
                  }
                }
              }
            } else if (payload.by === username) {
              dirtyRef.current = false;
              try {
                window.localStorage.removeItem(localDraftKey(activeDocumentId));
              } catch {
                /* The Durable Object save succeeded. */
              }
              setSaveState('saved');
            } else if (dirtyRef.current || document.activeElement === editorRef.current) {
              toast.info('A collaborator edited this document. Your open draft will sync when you save.');
            } else {
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

  const handleEditorInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !canEdit) return;
    const nextMarkdown = editorMarkdown(editor);
    markdownRef.current = nextMarkdown;
    setMarkdown(nextMarkdown);
    dirtyRef.current = true;
    if (activeDocumentId) {
      try {
        window.localStorage.setItem(localDraftKey(activeDocumentId), nextMarkdown);
      } catch {
        /* Keep editing even when local storage is unavailable. */
      }
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
    }, 550);

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
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    document.execCommand('insertHTML', false, html);
    selectionRangeRef.current = null;
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
    const width = 250;
    const canFormat = canEditNow && !previewMode;
    const height = canFormat ? 500 : 100;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  };

  const handleContextAction = (action: () => void) => {
    setContextMenu(null);
    action();
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
    };
    const dropRange = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (editor && dropRange && editor.contains(dropRange.startContainer)) {
      selectionRangeRef.current = dropRange;
    }
    void onMediaFiles(files);
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

  const onMediaFile = async (file: File | undefined, asBanner = false) => {
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
        uploadFile = await compressSmartDocImage(file);
        setMediaProgress(100);
      } else if (file.type.startsWith('video/')) {
        setMediaStage('Compressing video…');
        try {
          uploadFile = await compressSmartDocVideo(file, (progress) => {
            setMediaProgress(Math.round(progress * 100));
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

  const onMediaFiles = async (files: File[], asBanner = false) => {
    for (const file of files) await onMediaFile(file, asBanner);
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
      setDrivePickerOpen(false);
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

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      const document = await createSmartDoc(newTitle);
      setDocuments((current) => [document, ...current]);
      setNewTitle('');
      setCreateOpen(false);
      setActiveDocumentId(document.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create this Smart Doc.');
    } finally {
      setCreating(false);
    }
  };

  const deleteDocument = async () => {
    if (!activeDocument || !isOwner) return;
    if (!window.confirm(`Delete “${activeDocument.title}” and its uploaded media?`)) return;
    try {
      await deleteSmartDoc(activeDocument.id);
      setDocuments((current) => current.filter((item) => item.id !== activeDocument.id));
      setActiveDocumentId(null);
      toast.success('Smart Doc deleted.');
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
    return <section className="smart-docs-page"><div className="smart-docs-loading"><Loader2 className="size-5 animate-spin" />Loading Smart Docs…</div></section>;
  }

  if (!activeDocument) {
    return (
      <section className="collab-tool-page smart-docs-page">
        <header className="collab-tool-header">
          <div>
            <p className="collab-tool-eyebrow">Documents</p>
            <h2>Smart Docs</h2>
            <p className="collab-tool-subtitle">Shared, live-updating documents for your team.</p>
          </div>
          <button type="button" className="collab-tool-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New document
          </button>
        </header>
        {documents.length ? (
          <div className="smart-docs-library">
            {documents.map((item) => (
              <button type="button" className="smart-doc-card" key={item.id} onClick={() => setActiveDocumentId(item.id)}>
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
            <span><FileText className="size-7" /></span>
            <h3>Start a shared document</h3>
            <p>Write together in a live Markdown document, add media, and choose who can view or edit.</p>
            <button type="button" className="collab-tool-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create Smart Doc
            </button>
          </div>
        )}
        {createOpen && (
          <div className="smart-doc-modal-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}>
            <form className="smart-doc-modal" onSubmit={(event) => void submitCreate(event)}>
              <header><div><p className="collab-tool-eyebrow">New document</p><h3>Create a Smart Doc</h3></div><button type="button" className="collab-tool-icon" aria-label="Close" onClick={() => setCreateOpen(false)}><X className="size-4" /></button></header>
              <label className="smart-doc-field">Document title
                <input autoFocus maxLength={100} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Team playbook" required />
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
    : saveState === 'saving' ? 'Saving to Smart Docs…' : 'All changes saved';
  const bannerSource = activeDocument.bannerAssetId
    ? smartDocMediaUrl(activeDocument.id, activeDocument.bannerAssetId)
    : '';

  return (
    <section className="smart-docs-page smart-doc-editor-page">
      <header className="smart-doc-editor-header">
        <button type="button" className="collab-tool-icon" aria-label="Back to Smart Docs" onClick={() => {
          setActiveDocumentId(null);
          void refreshDocuments();
        }}><ArrowLeft className="size-4" /></button>
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

      {bannerSource && (
        <div className="smart-doc-banner">
          <SmartDocInlineMedia source={bannerSource} title={`${activeDocument.title} banner`} kind="image" />
        </div>
      )}
      {isOwner && (
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
            <button type="button" disabled={!canEditNow || mediaUploading} aria-label="Upload image or video" title="Upload image or video" onMouseDown={onToolbarMouseDown} onClick={() => mediaInputRef.current?.click()}>
              {mediaUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            </button>
            <button type="button" disabled={!canEditNow} aria-label="Insert media from Drive" title="Insert media from Drive" onMouseDown={onToolbarMouseDown} onClick={() => setDrivePickerOpen(true)}><ImagePlus className="size-4" /></button>
            <button
              type="button"
              disabled={!canEditNow}
              aria-label={previewMode ? 'Return to editor' : 'Preview Markdown'}
              title={previewMode ? 'Return to editor' : 'Preview Markdown'}
              aria-pressed={previewMode}
              onMouseDown={onToolbarMouseDown}
              onClick={() => setPreviewMode((current) => !current)}
            >{previewMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
            <input ref={mediaInputRef} hidden type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(event) => void onMediaFiles(Array.from(event.target.files ?? []))} />
            <span className="smart-doc-toolbar-hint">Markdown supported</span>
          </div>
          {mediaUploading && (
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
          ) : canEditNow && !previewMode ? (
            <div
              className={`smart-doc-editor-scroll ${mediaDropActive ? 'is-media-dragging' : ''}`}
              onDragOver={handleEditorDragOver}
              onDragLeave={handleEditorDragLeave}
              onDrop={handleEditorDrop}
              onContextMenu={showEditorContextMenu}
            >
              {mediaDropActive && <div className="smart-doc-drop-overlay"><Upload className="size-5" />Drop images or videos to insert</div>}
              <div
                key={activeDocument.id}
                ref={editorRef}
                className="smart-doc-editor"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Smart Doc editor"
                aria-multiline="true"
                spellCheck
                onInput={handleEditorInput}
                onKeyUp={captureSelection}
                onMouseUp={captureSelection}
                onFocus={() => setMentionQuery(null)}
                onBlur={() => {
                  setMentionQuery(null);
                  setHydrateVersion((value) => value + 1);
                }}
              />
              {!markdown.trim() && <span className="smart-doc-editor-placeholder">Write in Markdown or use the formatting toolbar…</span>}
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
                  <span className="smart-doc-context-menu-title">Markdown editor</span>
                  {canEditNow && !previewMode && (
                    <>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void copySelection(); })}><ClipboardCopy className="size-4" />Copy selection</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void cutSelection(); })}><Scissors className="size-4" />Cut selection</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => { void pasteFromClipboard(); })}><ClipboardPaste className="size-4" />Paste</button>
                      <span className="smart-doc-context-menu-divider" />
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'H1'))}><Heading1 className="size-4" />Heading 1</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => runCommand('formatBlock', 'H2'))}><Heading2 className="size-4" />Heading 2</button>
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
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => mediaInputRef.current?.click())}><Upload className="size-4" />Upload image or video</button>
                      <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(() => setDrivePickerOpen(true))}><ImagePlus className="size-4" />Insert media from Drive</button>
                    </>
                  )}
                  <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => handleContextAction(exportMarkdown)}><Download className="size-4" />Export as Markdown</button>
                </div>
              )}
              <div className="smart-doc-editor-footer">
                <span>Markdown document · {markdown.length.toLocaleString()} characters</span>
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
              {!selectedUser && userResults.length > 0 && (
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
          if (event.target === event.currentTarget) setDrivePickerOpen(false);
        }}>
          <section className="smart-doc-modal smart-doc-drive-modal">
            <header><div><p className="collab-tool-eyebrow">Insert media</p><h3>Choose from Drive</h3></div><button type="button" className="collab-tool-icon" aria-label="Close" onClick={() => setDrivePickerOpen(false)}><X className="size-4" /></button></header>
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
