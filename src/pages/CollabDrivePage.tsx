import {
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileAudio2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo2,
  Folder,
  FolderPlus,
  Grid2X2,
  List,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { toast } from 'sonner';
import CollabPresenceStack, { type CollaboratorPresence } from '@/components/CollabPresenceStack';
import DriveMediaPreviewDialog from '@/components/DriveMediaPreviewDialog';
import {
  chatSocketUrl,
  createCollabDriveFolder,
  deleteCollabDriveFolder,
  deleteCollabDriveFile,
  downloadCollabDriveFile,
  getCollabDriveFileBlob,
  listCollabDrive,
  requestChatTicket,
  updateCollabDriveFile,
  updateCollabDriveFolder,
  uploadCollabDriveFile,
  type CollabDriveFile,
  type CollabDriveFolder,
} from '@/lib/chat-client';
import { getWebSocketReconnectDelay, startWebSocketHeartbeat } from '@/lib/websocket-health';
import {
  readDriveIndex,
  readDrivePreview,
  writeDriveIndex,
  writeDrivePreview,
  type DriveIndexSnapshot,
} from '@/lib/drive-cache';
import './CollabToolsPage.css';

interface CollabDrivePageProps {
  username: string;
  initialFileId?: string | null;
  initialScope?: DriveScope;
  onFileChange?: (fileId: string | null, scope: DriveScope) => void;
}

type DriveScope = 'team' | 'personal';

type DriveContextTarget =
  | { kind: 'background' }
  | { kind: 'folder'; folder: CollabDriveFolder }
  | { kind: 'file'; file: CollabDriveFile };

type DriveRenameTarget = {
  kind: 'folder' | 'file';
  id: string;
  originalName: string;
};

interface DriveContextMenuState {
  x: number;
  y: number;
  target: DriveContextTarget;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function fileGlyph(file: CollabDriveFile) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.mime_type.startsWith('image/')) return FileImage;
  if (file.mime_type.startsWith('audio/')) return FileAudio2;
  if (file.mime_type.startsWith('video/')) return FileVideo2;
  if (['xls', 'xlsx', 'csv', 'tsv'].includes(extension ?? '')) return FileSpreadsheet;
  if (['doc', 'docx', 'ppt', 'pptx', 'pdf', 'txt', 'md', 'markdown'].includes(extension ?? '')) return FileText;
  if (['zip', '7z', 'rar', 'gz'].includes(extension ?? '')) return FileArchive;
  return File;
}

function isPreviewableDriveFile(file: CollabDriveFile): boolean {
  return /^(image|audio|video)\//i.test(file.mime_type)
    || file.mime_type.toLowerCase() === 'application/pdf'
    || /\.pdf$/i.test(file.name);
}

function DriveFilePreview({
  file,
  cacheKey,
  onOpenPreview,
}: {
  file: CollabDriveFile;
  cacheKey: string;
  onOpenPreview: () => void;
}) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const Icon = fileGlyph(file);

  useEffect(() => {
    const element = previewRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !file.mime_type.startsWith('image/')) return undefined;
    let active = true;
    let objectUrl: string | null = null;
    const show = (blob: Blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    };
    const createPreview = async () => {
      const cached = await readDrivePreview(cacheKey).catch(() => null);
      if (cached) {
        show(cached);
        return;
      }
      const original = await getCollabDriveFileBlob(file.id);
      const bitmap = await createImageBitmap(original);
      try {
        const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const thumbnail = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.72));
        if (!thumbnail) return;
        await writeDrivePreview(cacheKey, thumbnail).catch(() => undefined);
        show(thumbnail);
      } finally {
        bitmap.close();
      }
    };
    void createPreview().catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cacheKey, file.id, file.mime_type, visible]);

  const content = previewUrl
    ? <img src={previewUrl} alt="" loading="lazy" />
    : <Icon className="collab-drive-preview-icon" />;
  return (
    <div ref={previewRef} className="collab-drive-preview">
      {isPreviewableDriveFile(file)
        ? (
          <button
            type="button"
            className="collab-drive-preview-trigger"
            aria-label={`Preview ${file.name}`}
            title={`Preview ${file.name}`}
            onClick={onOpenPreview}
          >
            {content}
          </button>
        )
        : content}
    </div>
  );
}

export default function CollabDrivePage({
  username,
  initialFileId = null,
  initialScope = 'team',
  onFileChange,
}: CollabDrivePageProps) {
  const [scope, setScope] = useState<DriveScope>(initialScope);
  const [presence, setPresence] = useState<CollaboratorPresence[]>([]);
  const [folderStack, setFolderStack] = useState<CollabDriveFolder[]>([]);
  const [folders, setFolders] = useState<CollabDriveFolder[]>([]);
  const [files, setFiles] = useState<CollabDriveFile[]>([]);
  const [usage, setUsage] = useState<{ usedBytes: number; limitBytes: number } | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [layout, setLayout] = useState<'list' | 'grid'>('grid');
  const [previewFile, setPreviewFile] = useState<CollabDriveFile | null>(null);
  const [contextMenu, setContextMenu] = useState<DriveContextMenuState | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DriveRenameTarget | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const presenceSocketRef = useRef<WebSocket | null>(null);
  const typingActiveRef = useRef(false);
  const typingRefreshAtRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const refreshSequenceRef = useRef(0);
  const presenceRoomId = scope === 'team'
    ? 'drive-presence-team'
    : `drive-presence-personal-${encodeURIComponent(username.toLowerCase())}`;
  const stopTypingPresence = useCallback(() => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    const socket = presenceSocketRef.current;
    if (typingActiveRef.current && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'presence:typing', active: false }));
    }
    typingActiveRef.current = false;
    typingRefreshAtRef.current = 0;
  }, []);
  const refreshTypingPresence = useCallback(() => {
    const socket = presenceSocketRef.current;
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

  useEffect(() => {
    let stopped = false;
    let reconnectTimer = 0;
    let reconnectAttempt = 0;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof startWebSocketHeartbeat> | null = null;
    setPresence([]);

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
      try {
        const ticket = await requestChatTicket({ roomId: presenceRoomId });
        if (stopped) return;
        const current = new WebSocket(chatSocketUrl(ticket));
        socket = current;
        presenceSocketRef.current = current;
        current.onopen = () => {
          reconnectAttempt = 0;
          heartbeat = startWebSocketHeartbeat(current, () => current.close(4000, 'Heartbeat timeout'));
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
          if (payload.type === 'presence:update' && Array.isArray(payload.participants)) {
            setPresence(payload.participants as CollaboratorPresence[]);
          }
        };
        current.onclose = () => {
          heartbeat?.stop();
          heartbeat = null;
          stopTypingPresence();
          if (presenceSocketRef.current === current) presenceSocketRef.current = null;
          setPresence([]);
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
      stopTypingPresence();
      if (presenceSocketRef.current === socket) presenceSocketRef.current = null;
      socket?.close(1000, 'Drive changed');
    };
  }, [presenceRoomId, stopTypingPresence]);
  const renameInProgressRef = useRef(false);
  const cancelRenameOnBlurRef = useRef(false);
  const currentFolder = folderStack.at(-1) ?? null;
  const menuFolder = contextMenu?.target.kind === 'folder' ? contextMenu.target.folder : null;
  const menuFile = contextMenu?.target.kind === 'file' ? contextMenu.target.file : null;
  const driveIndexKey = `${username.toLowerCase()}|${scope}|${currentFolder?.id ?? 'root'}`;

  useEffect(() => {
    setScope(initialScope);
    setFolderStack([]);
  }, [initialScope]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequenceRef.current;
    setLoading(true);
    const cached = await readDriveIndex(driveIndexKey).catch(() => null);
    if (sequence !== refreshSequenceRef.current) return;
    if (cached) {
      setFolders(cached.folders);
      setFiles(cached.files);
      setUsage(cached.usage);
      setLoading(false);
    }
    try {
      const directory = await listCollabDrive(scope, currentFolder?.id ?? null);
      if (sequence !== refreshSequenceRef.current) return;
      setFolders(directory.folders);
      setFiles(directory.files);
      setUsage(directory.usage);
      const snapshot: DriveIndexSnapshot = {
        folders: directory.folders,
        files: directory.files,
        usage: directory.usage,
      };
      void writeDriveIndex(driveIndexKey, snapshot).catch(() => undefined);
    } catch (error) {
      if (!cached) toast.error(error instanceof Error ? error.message : 'Could not open this drive folder.');
    } finally {
      if (sequence === refreshSequenceRef.current) setLoading(false);
    }
  }, [currentFolder?.id, driveIndexKey, scope]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (loading) return;
    if (!initialFileId) {
      setPreviewFile(null);
      return;
    }
    let alive = true;
    const file = files.find((item) => item.id === initialFileId);
    if (file) {
      requestAnimationFrame(() => document.getElementById(`drive-file-${initialFileId}`)?.scrollIntoView({ block: 'center' }));
      if (isPreviewableDriveFile(file)) setPreviewFile(file);
    } else {
      void listCollabDrive(scope, null, { allFiles: true })
        .then((directory) => {
          if (!alive) return;
          const match = directory.files.find((item) => item.id === initialFileId);
          if (match && isPreviewableDriveFile(match)) setPreviewFile(match);
          else onFileChange?.(null, scope);
        })
        .catch(() => undefined);
    }
    return () => { alive = false; };
  }, [files, initialFileId, loading, onFileChange, scope]);

  const openPreview = (file: CollabDriveFile) => {
    setPreviewFile(file);
    onFileChange?.(file.id, scope);
  };

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? files.filter((file) => file.name.toLocaleLowerCase().includes(needle)) : files;
  }, [files, query]);

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name || savingFolder) return;
    try {
      setSavingFolder(true);
      await createCollabDriveFolder(name, scope, currentFolder?.id ?? null);
      setFolderName('');
      setCreatingFolder(false);
      await refresh();
      toast.success('Folder created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the folder.');
    } finally {
      setSavingFolder(false);
    }
  };

  const uploadFiles = async (selected: FileList | File[], folderId = currentFolder?.id ?? null) => {
    const incoming = Array.from(selected);
    if (!incoming.length || uploading) return;
    const tooLarge = incoming.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      toast.error(`${tooLarge.name} exceeds the 50 MB limit.`);
      return;
    }
    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of incoming) {
        await uploadCollabDriveFile(file, scope, folderId);
        uploaded += 1;
      }
      await refresh();
      toast.success(`${uploaded} file${uploaded === 1 ? '' : 's'} added to ${scope === 'team' ? 'Team Drive' : 'your drive'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Some files could not be uploaded.');
      await refresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openFolder = (folder: CollabDriveFolder) => {
    setFolderStack((current) => [...current, folder]);
    setQuery('');
  };

  const openAt = (index: number) => {
    setFolderStack((current) => current.slice(0, index + 1));
    setQuery('');
  };

  const deleteFile = async (file: CollabDriveFile) => {
    if (!window.confirm(`Delete “${file.name}” from ${scope === 'team' ? 'Team Drive' : 'your drive'}?`)) return;
    try {
      await deleteCollabDriveFile(file.id);
      await refresh();
      toast.success('File deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this file.');
    }
  };

  const showContextMenu = (event: MouseEvent, target: DriveContextTarget) => {
    event.preventDefault();
    event.stopPropagation();
    const width = 220;
    const height = target.kind === 'background' ? 160 : 210;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
      target,
    });
  };

  const beginRename = (target: DriveRenameTarget) => {
    cancelRenameOnBlurRef.current = false;
    setRenameTarget(target);
    setRenameDraft(target.originalName);
    setContextMenu(null);
  };

  const saveInlineRename = async () => {
    const target = renameTarget;
    const name = renameDraft.trim();
    if (!target || renameInProgressRef.current) return;
    if (!name || name === target.originalName) {
      setRenameTarget(null);
      return;
    }
    renameInProgressRef.current = true;
    setSavingRename(true);
    try {
      if (target.kind === 'file') {
        await updateCollabDriveFile(target.id, { name });
      } else {
        await updateCollabDriveFolder(target.id, name);
        setFolderStack((current) => current.map((entry) => entry.id === target.id ? { ...entry, name } : entry));
      }
      setRenameTarget(null);
      await refresh();
      toast.success('Renamed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename this item.');
    } finally {
      renameInProgressRef.current = false;
      setSavingRename(false);
    }
  };

  const removeFolder = async (folder: CollabDriveFolder) => {
    if (!window.confirm(`Delete the empty folder “${folder.name}”?`)) return;
    try {
      await deleteCollabDriveFolder(folder.id);
      await refresh();
      toast.success('Folder deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the folder.');
    }
  };

  const moveFileToFolder = async (fileId: string, folderId: string | null) => {
    try {
      await updateCollabDriveFile(fileId, { folderId });
      await refresh();
      toast.success(folderId ? 'File moved into folder.' : 'File moved to the drive root.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the file.');
    }
  };

  const handleFolderDrop = (event: DragEvent, folder: CollabDriveFolder) => {
    event.preventDefault();
    event.stopPropagation();
    setDropFolderId(null);
    const fileId = event.dataTransfer.getData('application/x-econote-drive-file');
    if (fileId) {
      void moveFileToFolder(fileId, folder.id);
    } else if (event.dataTransfer.files.length) {
      void uploadFiles(event.dataTransfer.files, folder.id);
    }
  };

  return (
    <section
      className="collab-tool-page collab-drive-page"
      onDragOver={(event) => {
        if (
          event.dataTransfer.types.includes('Files') ||
          event.dataTransfer.types.includes('application/x-econote-drive-file')
        ) event.preventDefault();
      }}
      onDrop={(event) => {
        const fileId = event.dataTransfer.getData('application/x-econote-drive-file');
        if (fileId) {
          event.preventDefault();
          void moveFileToFolder(fileId, currentFolder?.id ?? null);
          return;
        }
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        void uploadFiles(event.dataTransfer.files);
      }}
      onContextMenu={(event) => showContextMenu(event, { kind: 'background' })}
      onClick={() => {
        if (contextMenu) setContextMenu(null);
      }}
    >
      <header className="collab-tool-header collab-drive-header">
        <div>
          <h2>Team Drive</h2>
        </div>
        <div className="collab-tool-header-actions collab-drive-header-actions">
          <CollabPresenceStack members={presence} viewer={username} />
          <div className="collab-segmented" aria-label="Drive scope">
            {(['team', 'personal'] as const).map((item) => (
              <button key={item} type="button" aria-pressed={scope === item} onClick={() => {
                setScope(item);
                setFolderStack([]);
                setQuery('');
              }}>{item === 'team' ? 'Team' : 'Personal'}</button>
            ))}
          </div>
          {scope === 'personal' && usage && (
            <span className="collab-drive-quota" aria-label={`${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} used`}>
              {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}
            </span>
          )}
          <button type="button" className="collab-tool-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="size-4" /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            type="button"
            className="collab-tool-secondary collab-drive-folder-toggle"
            aria-pressed={creatingFolder}
            onClick={() => {
              setCreatingFolder((current) => !current);
              setFolderName('');
            }}
          >
            <FolderPlus className="size-4" /> {creatingFolder ? 'Cancel' : 'New folder'}
          </button>
          <label className="collab-drive-search">
            <Search className="size-4" />
            <input value={query} onChange={(event) => {
              setQuery(event.target.value);
              refreshTypingPresence();
            }} placeholder="Search this folder" />
          </label>
          <button
            type="button"
            className="collab-tool-icon"
            aria-label={layout === 'list' ? 'Use grid view' : 'Use list view'}
            title={layout === 'list' ? 'Grid view' : 'List view'}
            onClick={() => setLayout((current) => current === 'list' ? 'grid' : 'list')}
          >{layout === 'list' ? <Grid2X2 className="size-4" /> : <List className="size-4" />}</button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            multiple
            onChange={(event) => void uploadFiles(event.currentTarget.files ?? [])}
          />
        </div>
      </header>

      {creatingFolder && (
        <form className="collab-drive-new-folder" onSubmit={(event) => { event.preventDefault(); void createFolder(); }}>
          <FolderPlus className="size-4 text-accent" />
          <input autoFocus maxLength={100} value={folderName} onChange={(event) => {
            setFolderName(event.target.value);
            refreshTypingPresence();
          }} placeholder="Folder name" />
          <button type="submit" className="collab-tool-primary" disabled={!folderName.trim() || savingFolder}>Create</button>
        </form>
      )}

      <div className="collab-drive-toolbar">
        <nav className="collab-drive-breadcrumbs" aria-label="Drive folders">
          <button type="button" onClick={() => setFolderStack([])}>{scope === 'team' ? 'Team Drive' : 'My Drive'}</button>
          {folderStack.map((folder, index) => (
            <span key={folder.id} className="collab-drive-crumb">
              <ChevronRight className="size-3" />
              <button type="button" onClick={() => openAt(index)}>{folder.name}</button>
            </span>
          ))}
        </nav>
      </div>

      <div className={`collab-drive-list ${layout === 'grid' ? 'is-grid' : ''}`}>
        {loading && <p className="collab-tool-empty">Loading files…</p>}
        {!loading && folders.map((folder) => (
          <div
            key={folder.id}
            className={`collab-drive-item collab-drive-folder ${layout === 'grid' ? 'is-column-item' : ''} ${dropFolderId === folder.id ? 'is-drop-target' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => openFolder(folder)}
            onKeyDown={(event) => {
              if (event.target instanceof HTMLInputElement) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openFolder(folder);
              }
            }}
            onContextMenu={(event) => showContextMenu(event, { kind: 'folder', folder })}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('Files') && !event.dataTransfer.types.includes('application/x-econote-drive-file')) return;
              event.preventDefault();
              event.stopPropagation();
              setDropFolderId(folder.id);
              event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move';
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropFolderId(null);
            }}
            onDrop={(event) => handleFolderDrop(event, folder)}
          >
            <span className="collab-drive-file-icon is-folder"><Folder className="size-9" /></span>
            <span className="collab-drive-file-name">
              {renameTarget?.kind === 'folder' && renameTarget.id === folder.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  aria-label={`Rename folder ${folder.name}`}
                  onChange={(event) => {
                    setRenameDraft(event.target.value);
                    refreshTypingPresence();
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => {
                    if (cancelRenameOnBlurRef.current) {
                      cancelRenameOnBlurRef.current = false;
                      return;
                    }
                    void saveInlineRename();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      cancelRenameOnBlurRef.current = true;
                      setRenameTarget(null);
                    }
                  }}
                />
              ) : <strong title={folder.name}>{folder.name}</strong>}
              <small>Folder · {folder.owner}</small>
            </span>
            <ChevronRight className="collab-drive-folder-chevron size-4 text-muted-foreground" />
          </div>
        ))}
        {!loading && visibleFiles.map((file) => {
          const canManage = file.owner.toLowerCase() === username.toLowerCase();
          const previewCacheKey = `${username.toLowerCase()}|${file.id}|${file.updated_at}|${file.size_bytes}`;
          return (
            <article
              key={file.id}
              id={`drive-file-${file.id}`}
              className={`collab-drive-item collab-drive-file-item ${layout === 'grid' ? 'is-column-item' : ''}`}
              draggable={canManage}
              onDragStart={(event) => {
                if (!canManage) return;
                event.dataTransfer.setData('application/x-econote-drive-file', file.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onContextMenu={(event) => showContextMenu(event, { kind: 'file', file })}
            >
              <DriveFilePreview
                file={file}
                cacheKey={previewCacheKey}
                onOpenPreview={() => openPreview(file)}
              />
              <span className="collab-drive-file-name">
                {renameTarget?.kind === 'file' && renameTarget.id === file.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    aria-label={`Rename file ${file.name}`}
                    disabled={savingRename}
                    onChange={(event) => {
                      setRenameDraft(event.target.value);
                      refreshTypingPresence();
                    }}
                    onBlur={() => {
                      if (cancelRenameOnBlurRef.current) {
                        cancelRenameOnBlurRef.current = false;
                        return;
                      }
                      void saveInlineRename();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === 'Escape') {
                        cancelRenameOnBlurRef.current = true;
                        setRenameTarget(null);
                      }
                    }}
                  />
                ) : isPreviewableDriveFile(file) ? (
                  <button
                    type="button"
                    className="collab-drive-preview-name"
                    title={file.name}
                    onClick={() => openPreview(file)}
                  >
                    {file.name}
                  </button>
                ) : <strong title={file.name}>{file.name}</strong>}
                <small>{formatBytes(file.size_bytes)} · {new Date(file.updated_at).toLocaleDateString()}</small>
              </span>
            </article>
          );
        })}
        {!loading && folders.length === 0 && visibleFiles.length === 0 && (
          <div className="collab-tool-empty">
            {query ? 'No files match this search.' : 'This folder is empty. Upload a file or create a folder.'}
          </div>
        )}
      </div>
      <DriveMediaPreviewDialog
        open={previewFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewFile(null);
            onFileChange?.(null, scope);
          }
        }}
        fileId={previewFile?.id}
        fileName={previewFile?.name ?? ''}
        mimeType={previewFile?.mime_type ?? ''}
      />
      {contextMenu && (
        <div
          data-drive-context-menu
          role="menu"
          aria-label="File management actions"
          className="collab-drive-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="collab-drive-context-heading">
            <span>{contextMenu.target.kind === 'file' ? contextMenu.target.file.name : contextMenu.target.kind === 'folder' ? contextMenu.target.folder.name : 'Drive actions'}</span>
            <button type="button" aria-label="Close menu" onClick={() => setContextMenu(null)}><X className="size-3.5" /></button>
          </div>
          {contextMenu.target.kind === 'background' && (
            <>
              <button type="button" role="menuitem" onClick={() => { setCreatingFolder(true); setFolderName(''); setContextMenu(null); }}><FolderPlus className="size-4" />New folder</button>
              <button type="button" role="menuitem" onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }}><Upload className="size-4" />Upload files</button>
              <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void refresh(); }}><Search className="size-4" />Refresh folder</button>
            </>
          )}
          {menuFolder && (
            <>
              <button type="button" role="menuitem" onClick={() => { openFolder(menuFolder); setContextMenu(null); }}><Folder className="size-4" />Open folder</button>
              {menuFolder.owner.toLowerCase() === username.toLowerCase() && (
                <>
                  <button type="button" role="menuitem" onClick={() => beginRename({ kind: 'folder', id: menuFolder.id, originalName: menuFolder.name })}><Pencil className="size-4" />Rename</button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { void removeFolder(menuFolder); setContextMenu(null); }}><Trash2 className="size-4" />Delete empty folder</button>
                </>
              )}
            </>
          )}
          {menuFile && (
            <>
              <button type="button" role="menuitem" onClick={() => { void downloadCollabDriveFile(menuFile.id, menuFile.name).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Download failed.')); setContextMenu(null); }}><Download className="size-4" />Download</button>
              {menuFile.owner.toLowerCase() === username.toLowerCase() && (
                <>
                  <button type="button" role="menuitem" onClick={() => beginRename({ kind: 'file', id: menuFile.id, originalName: menuFile.name })}><Pencil className="size-4" />Rename</button>
                  {menuFile.folder_id && <button type="button" role="menuitem" onClick={() => { void moveFileToFolder(menuFile.id, null); setContextMenu(null); }}><Folder className="size-4" />Move to drive root</button>}
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { void deleteFile(menuFile); setContextMenu(null); }}><Trash2 className="size-4" />Delete</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
