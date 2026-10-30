import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  Clipboard,
  Columns3,
  Download,
  FilePlus2,
  Grid2X2,
  Plus,
  Rows3,
  Search,
  Share2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
} from 'react';
import { toast } from 'sonner';
import CollabPresenceStack, { type CollaboratorPresence } from '@/components/CollabPresenceStack';
import {
  loadCollabDirectoryCache,
  loadSheetSnapshot,
  saveCollabDirectoryCache,
  saveSheetSnapshot,
} from '@/lib/collab-document-cache';
import {
  addSheetMembers,
  createCollaborativeSheet,
  listCollaborativeSheets,
  listSheetMembers,
  renameCollaborativeSheet,
  requestSheetsSocketTicket,
  sheetsSocketUrl,
  type CollaborativeSheet,
  type SheetMember,
} from '@/lib/sheets-client';
import { findChatUsers, type ChatUser } from '@/lib/chat-client';
import {
  cellAddress,
  cellKey,
  columnLabel,
  type SheetAlignment,
  type SheetCell,
  type SheetCellMap,
  type SheetCellStyle,
  type SheetFill,
  type SheetTextColor,
} from '@/lib/sheets-types';
import { displayFormulaValue, evaluateSheetCell } from '@/lib/sheet-formulas';
import { getWebSocketReconnectDelay, startWebSocketHeartbeat } from '@/lib/websocket-health';
import './SheetsPage.css';

interface SheetsPageProps {
  username: string;
  initialDocumentId?: string;
  initialDocument?: CollaborativeSheet;
  embedded?: boolean;
  onDocumentChange?: (documentId: string | null) => void;
}

interface SheetRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface SheetContextMenu {
  x: number;
  y: number;
  row: number;
  col: number;
}

type DialogMode = 'create' | 'share' | 'rename' | null;
type ConnectionState = 'connecting' | 'connected' | 'offline';

const FILL_OPTIONS: Array<{ value: SheetFill; label: string }> = [
  { value: 'none', label: 'Clear fill' },
  { value: 'slate', label: 'Slate' },
  { value: 'blue', label: 'Ocean blue' },
  { value: 'mint', label: 'Mint' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' },
  { value: 'violet', label: 'Violet' },
];

const TEXT_OPTIONS: Array<{ value: SheetTextColor; label: string }> = [
  { value: 'auto', label: 'Theme text' },
  { value: 'blue', label: 'Blue text' },
  { value: 'green', label: 'Green text' },
  { value: 'red', label: 'Red text' },
  { value: 'violet', label: 'Violet text' },
];

function normalizeRange(range: SheetRange): SheetRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    endRow: Math.max(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

function rangeCells(range: SheetRange): Array<{ row: number; col: number }> {
  const normalized = normalizeRange(range);
  const result: Array<{ row: number; col: number }> = [];
  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) result.push({ row, col });
  }
  return result;
}

function columnCountLabel(value: number): string {
  return `${value} ${value === 1 ? 'person' : 'people'}`;
}

function getCell(cells: SheetCellMap, row: number, col: number): SheetCell {
  return cells[cellKey(row, col)] ?? { row, col, raw: '', style: {} };
}

function getStyle(style: SheetCellStyle | undefined): Required<SheetCellStyle> {
  return {
    fill: style?.fill ?? 'none',
    color: style?.color ?? 'auto',
    bold: style?.bold === true,
    align: style?.align ?? 'left',
  };
}

function getTsv(cells: SheetCellMap, range: SheetRange): string {
  const normalized = normalizeRange(range);
  const rows: string[] = [];
  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    const values: string[] = [];
    for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
      values.push(getCell(cells, row, col).raw.replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
    }
    rows.push(values.join('\t'));
  }
  return rows.join('\n');
}

function formatCellForExport(cell: SheetCell): XLSX.CellObject {
  if (cell.raw.startsWith('=')) return { t: 'n', f: cell.raw.slice(1) };
  if (cell.raw.trim() && Number.isFinite(Number(cell.raw))) {
    return { t: 'n', v: Number(cell.raw) };
  }
  return { t: 's', v: cell.raw };
}

export default function SheetsPage({
  username,
  initialDocumentId,
  initialDocument,
  embedded = false,
  onDocumentChange,
}: SheetsPageProps) {
  const [sheets, setSheets] = useState<CollaborativeSheet[]>(
    () => loadCollabDirectoryCache<CollaborativeSheet>(username, 'sheet'),
  );
  const [activeSheet, setActiveSheet] = useState<CollaborativeSheet | null>(initialDocument ?? null);
  const [loadingSheets, setLoadingSheets] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [presence, setPresence] = useState<CollaboratorPresence[]>([]);
  const [canEdit, setCanEdit] = useState(true);
  const [cells, setCells] = useState<SheetCellMap>({});
  const [rowCount, setRowCount] = useState(10);
  const [colCount, setColCount] = useState(10);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [snapshotSheetId, setSnapshotSheetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SheetRange>({
    startRow: 1, startCol: 1, endRow: 1, endCol: 1,
  });
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [formulaDraft, setFormulaDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<SheetContextMenu | null>(null);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [userResults, setUserResults] = useState<ChatUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sheetMembers, setSheetMembers] = useState<SheetMember[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [savingDialog, setSavingDialog] = useState(false);
  const [clipboardTsv, setClipboardTsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const typingActiveRef = useRef(false);
  const typingRefreshAtRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const directoryOwnerRef = useRef(username);
  const dragAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const lastCommittedEditRef = useRef<string | null>(null);
  const cancelEditOnBlurRef = useRef(false);
  const selectionRef = useRef(selected);
  selectionRef.current = selected;

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

  const reloadSheets = useCallback(async () => {
    try {
      setSheets(await listCollaborativeSheets());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load sheets.');
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  useEffect(() => {
    void reloadSheets();
  }, [reloadSheets]);

  useEffect(() => {
    if (directoryOwnerRef.current !== username) {
      directoryOwnerRef.current = username;
      setSheets(loadCollabDirectoryCache<CollaborativeSheet>(username, 'sheet'));
      setActiveSheet(initialDocument ?? null);
      setCells({});
      setSnapshotReady(false);
      setSnapshotSheetId(null);
      return;
    }
    saveCollabDirectoryCache(username, 'sheet', sheets);
  }, [initialDocument, sheets, username]);

  useEffect(() => {
    if (loadingSheets) return;
    if (!initialDocumentId) {
      if (!embedded && !initialDocument) setActiveSheet(null);
      return;
    }
    if (activeSheet?.id === initialDocumentId) return;
    const requested = sheets.find((sheet) => sheet.id === initialDocumentId);
    if (requested) setActiveSheet(requested);
    else {
      setActiveSheet(null);
      onDocumentChange?.(null);
    }
  }, [activeSheet, embedded, initialDocument, initialDocumentId, loadingSheets, onDocumentChange, sheets]);

  useEffect(() => {
    if (!activeSheet) return;
    let stopped = false;
    let currentSocket: WebSocket | null = null;
    let permissionConfirmed = false;
    let serverSnapshotReceived = false;
    let serverDimensions: { rows: number; cols: number } | null = null;
    let serverSnapshotCells: SheetCellMap = {};
    let pendingCache: Awaited<ReturnType<typeof loadSheetSnapshot>> = null;
    let reconnectTimer = 0;
    let socketConnectTimer = 0;
    let stableConnectionTimer = 0;
    let reconnectAttempt = 0;
    let heartbeat: ReturnType<typeof startWebSocketHeartbeat> | null = null;
    let ticketController: AbortController | null = null;
    setConnection('connecting');
    setPresence([]);
    setCanEdit(false);
    setSnapshotReady(false);
    setSnapshotSheetId(null);
    setCells({});
    setSelected({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 });
    setEditingCell(null);

    const applyCachedSnapshot = (cached: NonNullable<typeof pendingCache>) => {
      if (stopped || serverSnapshotReceived) return;
      setRowCount(serverDimensions?.rows ?? cached.rows);
      setColCount(serverDimensions?.cols ?? cached.cols);
      setCells(Object.fromEntries(cached.cells.map((cell) => [cellKey(cell.row, cell.col), cell])));
      setSnapshotSheetId(activeSheet.id);
      setSnapshotReady(true);
    };
    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      setConnection('offline');
      setCanEdit(false);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, getWebSocketReconnectDelay(reconnectAttempt));
      reconnectAttempt += 1;
    };
    void loadSheetSnapshot(activeSheet.id).then((cached) => {
      if (stopped || serverSnapshotReceived || !cached) return;
      if (!permissionConfirmed) {
        pendingCache = cached;
        return;
      }
      applyCachedSnapshot(cached);
    }).catch(() => undefined);

    const connect = async () => {
      if (stopped) return;
      setConnection('connecting');
      try {
        serverSnapshotReceived = false;
        serverDimensions = null;
        serverSnapshotCells = {};
        const controller = new AbortController();
        ticketController = controller;
        const ticketTimeout = window.setTimeout(() => controller.abort(), 15_000);
        let ticket: Awaited<ReturnType<typeof requestSheetsSocketTicket>>;
        try {
          ticket = await requestSheetsSocketTicket(activeSheet.id, controller.signal);
        } finally {
          window.clearTimeout(ticketTimeout);
          if (ticketController === controller) ticketController = null;
        }
        if (stopped) return;
        permissionConfirmed = true;
        setCanEdit(ticket.permission !== 'view');
        if (pendingCache) {
          applyCachedSnapshot(pendingCache);
          pendingCache = null;
        }
        const socket = new WebSocket(sheetsSocketUrl(ticket));
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
            try {
              socket.close(4000, 'Heartbeat timeout');
            } catch {
              /* The socket may already be closing. */
            }
            scheduleReconnect();
          });
        };
        socket.onmessage = (event) => {
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (payload.type === 'presence:update' && Array.isArray(payload.participants)) {
            setPresence(payload.participants as CollaboratorPresence[]);
            return;
          }
          if (payload.type === 'heartbeat_ack') {
            heartbeat?.acknowledge();
            return;
          }
          if (payload.type === 'sheet:ready') {
            serverDimensions = {
              rows: typeof payload.rows === 'number' ? payload.rows : 10,
              cols: typeof payload.cols === 'number' ? payload.cols : 10,
            };
            setRowCount(serverDimensions.rows);
            setColCount(serverDimensions.cols);
            return;
          }
          if (payload.type === 'sheet:snapshot' && Array.isArray(payload.cells)) {
            serverSnapshotReceived = true;
            for (const value of payload.cells as SheetCell[]) {
              serverSnapshotCells[cellKey(value.row, value.col)] = value;
            }
            if (payload.done === true) {
              setCells({ ...serverSnapshotCells });
              setSnapshotSheetId(activeSheet.id);
              setSnapshotReady(true);
            } else {
              setCells((current) => {
                const next = { ...current };
                for (const value of payload.cells as SheetCell[]) next[cellKey(value.row, value.col)] = value;
                return next;
              });
            }
            return;
          }
          if (payload.type === 'cells:updated' && Array.isArray(payload.cells)) {
            setCells((current) => {
              const next = { ...current };
              for (const value of payload.cells as SheetCell[]) next[cellKey(value.row, value.col)] = value;
              return next;
            });
            return;
          }
          if (payload.type === 'cells:cleared') {
            const startRow = Number(payload.startRow);
            const endRow = Number(payload.endRow);
            const startCol = Number(payload.startCol);
            const endCol = Number(payload.endCol);
            setCells((current) => {
              const next = { ...current };
              for (let row = startRow; row <= endRow; row += 1) {
                for (let col = startCol; col <= endCol; col += 1) {
                  const key = cellKey(row, col);
                  const existing = next[key];
                  if (payload.clearStyle === true || !existing) delete next[key];
                  else next[key] = { ...existing, raw: '' };
                }
              }
              return next;
            });
            return;
          }
          if (payload.type === 'structure:changed') {
            const dimension = payload.dimension === 'column' ? 'column' : 'row';
            const action = payload.action === 'insert' ? 'insert' : 'delete';
            const index = Number(payload.index);
            setCells((current) => {
              const next: SheetCellMap = {};
              Object.values(current).forEach((cell) => {
                const coordinate = dimension === 'row' ? cell.row : cell.col;
                if (action === 'delete' && coordinate === index) return;
                const adjusted = action === 'insert'
                  ? coordinate >= index ? coordinate + 1 : coordinate
                  : coordinate > index ? coordinate - 1 : coordinate;
                const moved = dimension === 'row'
                  ? { ...cell, row: adjusted }
                  : { ...cell, col: adjusted };
                next[cellKey(moved.row, moved.col)] = moved;
              });
              return next;
            });
            if (typeof payload.rows === 'number') setRowCount(payload.rows);
            if (typeof payload.cols === 'number') setColCount(payload.cols);
            setSelected((range) => {
              const normalized = normalizeRange(range);
              const coordinate = dimension === 'row' ? normalized.startRow : normalized.startCol;
              if (action === 'delete' && coordinate === index) {
                return { startRow: 1, startCol: 1, endRow: 1, endCol: 1 };
              }
              if (action === 'insert' && coordinate >= index) {
                return dimension === 'row'
                  ? { ...normalized, startRow: normalized.startRow + 1, endRow: normalized.endRow + 1 }
                  : { ...normalized, startCol: normalized.startCol + 1, endCol: normalized.endCol + 1 };
              }
              return normalized;
            });
            return;
          }
          if (payload.type === 'sheet:title' && typeof payload.title === 'string') {
            setActiveSheet((current) => current ? { ...current, title: payload.title as string } : current);
            setSheets((current) => current.map((sheet) => (
              sheet.id === activeSheet.id ? { ...sheet, title: payload.title as string } : sheet
            )));
            return;
          }
          if (payload.type === 'access:changed') {
            setConnectionAttempt((attempt) => attempt + 1);
            return;
          }
          if (payload.type === 'error' && typeof payload.message === 'string') toast.error(payload.message);
        };
        socket.onclose = () => {
          window.clearTimeout(socketConnectTimer);
          heartbeat?.stop();
          heartbeat = null;
          setPresence([]);
          window.clearTimeout(stableConnectionTimer);
          if (socketRef.current === socket) socketRef.current = null;
          scheduleReconnect();
        };
        socket.onerror = () => {
          if (stopped) return;
          setConnection('offline');
          setCanEdit(false);
          try {
            socket.close();
          } catch {
            /* The socket may already be closing. */
          }
          scheduleReconnect();
        };
      } catch {
        if (stopped) return;
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
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(socketConnectTimer);
      window.clearTimeout(stableConnectionTimer);
      window.removeEventListener('online', handleOnline);
      ticketController?.abort();
      heartbeat?.stop();
      stopTypingPresence();
      currentSocket?.close();
      if (socketRef.current === currentSocket) socketRef.current = null;
    };
  }, [activeSheet?.id, connectionAttempt, stopTypingPresence]);

  useEffect(() => {
    if (!activeSheet || !snapshotReady || snapshotSheetId !== activeSheet.id) return undefined;
    const timer = window.setTimeout(() => {
      void saveSheetSnapshot({
        id: activeSheet.id,
        rows: rowCount,
        cols: colCount,
        cells: Object.values(cells),
      }).catch(() => undefined);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeSheet, cells, colCount, rowCount, snapshotReady, snapshotSheetId]);

  useEffect(() => {
    if (!dialogMode || dialogMode === 'rename') return;
    let stopped = false;
    setSearchingUsers(true);
    const timer = window.setTimeout(() => {
      void findChatUsers(searchQuery.trim()).then((users) => {
        if (!stopped) setUserResults(users);
      }).catch((error: unknown) => {
        if (!stopped) toast.error(error instanceof Error ? error.message : 'Could not search users.');
      }).finally(() => {
        if (!stopped) setSearchingUsers(false);
      });
    }, searchQuery ? 180 : 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [dialogMode, searchQuery]);

  useEffect(() => {
    if (dialogMode !== 'share' || !activeSheet) return;
    void listSheetMembers(activeSheet.id).then(setSheetMembers).catch(() => setSheetMembers([]));
  }, [activeSheet?.id, dialogMode]);

  useEffect(() => {
    const onPointerUp = () => setDragSelecting(false);
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest('.sheets-context-menu')) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('click', onClick);
    };
  }, []);

  const normalizedSelection = useMemo(() => normalizeRange(selected), [selected]);
  const activeCell = useMemo(
    () => getCell(cells, selected.startRow, selected.startCol),
    [cells, selected.startCol, selected.startRow],
  );
  const activeAddress = cellAddress(selected.startRow, selected.startCol);
  const selectedCellCount =
    (normalizedSelection.endRow - normalizedSelection.startRow + 1) *
    (normalizedSelection.endCol - normalizedSelection.startCol + 1);
  const cellValue = useCallback((row: number, col: number) => {
    const cell = getCell(cells, row, col);
    return displayFormulaValue(evaluateSheetCell(cell.raw, row, col, cells));
  }, [cells]);

  useEffect(() => {
    setFormulaDraft(activeCell.raw);
  }, [activeCell.raw, activeAddress]);

  useEffect(() => {
    if (editingCell) {
      editorRef.current?.focus();
      editorRef.current?.select();
    }
  }, [editingCell]);

  const sendEvent = useCallback((payload: Record<string, unknown>) => {
    if (payload.type !== 'heartbeat' && payload.type !== 'presence:typing' && !canEdit) {
      toast.error('You have view access to this sheet.');
      return false;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error('This sheet is not connected. Reconnect before editing.');
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  }, [canEdit]);

  const sendCells = useCallback((updates: SheetCell[]) => {
    if (!updates.length) return;
    for (let offset = 0; offset < updates.length; offset += 100) {
      if (!sendEvent({ type: 'cells:update', cells: updates.slice(offset, offset + 100) })) return;
    }
    setCells((current) => {
      const next = { ...current };
      for (const cell of updates) next[cellKey(cell.row, cell.col)] = cell;
      return next;
    });
  }, [sendEvent]);

  const selectCell = useCallback((row: number, col: number) => {
    const next = { startRow: row, startCol: col, endRow: row, endCol: col };
    setSelected(next);
    selectionRef.current = next;
  }, []);

  const beginEdit = useCallback((row: number, col: number, initial?: string) => {
    if (!canEdit) return;
    refreshTypingPresence();
    const cell = getCell(cells, row, col);
    const key = cellKey(row, col);
    lastCommittedEditRef.current = null;
    cancelEditOnBlurRef.current = false;
    setEditDraft(initial ?? cell.raw);
    setEditingCell(key);
    setFormulaDraft(initial ?? cell.raw);
  }, [canEdit, cells, refreshTypingPresence]);

  const commitEdit = useCallback((nextRaw = editDraft) => {
    if (!editingCell || lastCommittedEditRef.current === editingCell) return;
    stopTypingPresence();
    lastCommittedEditRef.current = editingCell;
    const [row, col] = editingCell.split(':').map(Number);
    const previous = getCell(cells, row, col);
    sendCells([{ ...previous, raw: nextRaw.slice(0, 5_000) }]);
    setFormulaDraft(nextRaw.slice(0, 5_000));
    setEditingCell(null);
  }, [cells, editDraft, editingCell, sendCells, stopTypingPresence]);

  const applyStyle = useCallback((patch: Partial<Required<SheetCellStyle>>) => {
    const updates = rangeCells(selectionRef.current).map(({ row, col }) => {
      const cell = getCell(cells, row, col);
      return { ...cell, style: { ...getStyle(cell.style), ...patch } };
    });
    sendCells(updates);
  }, [cells, sendCells]);

  const clearSelection = useCallback((clearStyle = false) => {
    sendEvent({ type: 'cells:clear', ...normalizeRange(selectionRef.current), clearStyle });
  }, [sendEvent]);

  const changeStructure = useCallback((dimension: 'row' | 'column', action: 'insert' | 'delete', index?: number) => {
    const position = index ?? (dimension === 'row' ? selected.startRow : selected.startCol);
    sendEvent({ type: 'structure:change', dimension, action, index: position });
  }, [selected.startCol, selected.startRow, sendEvent]);

  const copySelection = useCallback(async () => {
    const text = getTsv(cells, selectionRef.current);
    setClipboardTsv(text);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied cells');
    } catch {
      toast.message('Cells copied. Browser clipboard permission is unavailable.');
    }
  }, [cells]);

  const pasteSelection = useCallback(async () => {
    let text = clipboardTsv;
    try {
      const systemClipboard = await navigator.clipboard.readText();
      if (systemClipboard) text = systemClipboard;
    } catch {
      /* Use the in-app clipboard when browser clipboard access is unavailable. */
    }
    if (!text) return;
    const sourceRows = text.replace(/\r/g, '').split('\n');
    if (sourceRows.at(-1) === '') sourceRows.pop();
    const start = selectionRef.current;
    const updates: SheetCell[] = [];
    sourceRows.forEach((line, rowOffset) => {
      line.split('\t').forEach((raw, colOffset) => {
        const row = start.startRow + rowOffset;
        const col = start.startCol + colOffset;
        if (row > rowCount || col > colCount) return;
        updates.push({ ...getCell(cells, row, col), raw: raw.slice(0, 5_000) });
      });
    });
    sendCells(updates);
    if (updates.length) {
      const endRow = Math.min(rowCount, start.startRow + sourceRows.length - 1);
      const endCol = Math.min(colCount, start.startCol + Math.max(0, ...sourceRows.map((row) => row.split('\t').length)) - 1);
      const range = { startRow: start.startRow, startCol: start.startCol, endRow, endCol };
      setSelected(range);
      selectionRef.current = range;
    }
  }, [cells, clipboardTsv, colCount, rowCount, sendCells]);

  const exportXlsx = useCallback(() => {
    const worksheet = XLSX.utils.aoa_to_sheet(
      Array.from({ length: rowCount }, (_, rowIndex) =>
        Array.from({ length: colCount }, (_, colIndex) => {
          const cell = getCell(cells, rowIndex + 1, colIndex + 1);
          if (cell.raw.startsWith('=')) return null;
          if (cell.raw.trim() && Number.isFinite(Number(cell.raw))) return Number(cell.raw);
          return cell.raw;
        })),
    );
    Object.values(cells).forEach((cell) => {
      if (!cell.raw.startsWith('=')) return;
      const address = cellAddress(cell.row, cell.col);
      worksheet[address] = formatCellForExport(cell);
    });
    worksheet['!ref'] = `A1:${cellAddress(rowCount, colCount)}`;
    worksheet['!cols'] = Array.from({ length: colCount }, (_, index) => ({
      wch: index === 0 ? 22 : 16,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeSheet?.title.slice(0, 31) || 'Sheet 1');
    const filename = `${(activeSheet?.title || 'collaborative-sheet').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)}.xlsx`;
    XLSX.writeFile(workbook, filename);
    toast.success('Spreadsheet exported');
  }, [activeSheet?.title, cells, colCount, rowCount]);

  const importWorkbook = useCallback(async (file?: File) => {
    if (!file || !activeSheet) return;
    if (!canEdit || connection !== 'connected' || !snapshotReady) {
      toast.error('Connect with edit access before importing a file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Choose a spreadsheet smaller than 10 MB.');
      return;
    }

    setImporting(true);
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
      const reference = worksheet?.['!ref'];
      if (!worksheet || !reference) throw new Error('This file does not contain a worksheet with data.');

      const sourceRange = XLSX.utils.decode_range(reference);
      const importRows = sourceRange.e.r - sourceRange.s.r + 1;
      const importCols = sourceRange.e.c - sourceRange.s.c + 1;
      if (importRows < 1 || importCols < 1 || importRows > 100 || importCols > 100) {
        throw new Error('Imports are limited to 100 rows × 100 columns.');
      }

      const start = normalizeRange(selectionRef.current);
      const endRow = start.startRow + importRows - 1;
      const endCol = start.startCol + importCols - 1;
      if (endRow > 100 || endCol > 100) {
        throw new Error('The imported range would exceed the sheet’s 100 × 100 limit. Select an earlier cell.');
      }

      const updates: SheetCell[] = [];
      for (let rowOffset = 0; rowOffset < importRows; rowOffset += 1) {
        for (let colOffset = 0; colOffset < importCols; colOffset += 1) {
          const address = XLSX.utils.encode_cell({
            r: sourceRange.s.r + rowOffset,
            c: sourceRange.s.c + colOffset,
          });
          const sourceCell = worksheet[address] as XLSX.CellObject | undefined;
          const raw = sourceCell?.f
            ? `=${sourceCell.f}`
            : sourceCell?.v == null
              ? ''
              : XLSX.utils.format_cell(sourceCell);
          if (raw.length > 5_000) {
            throw new Error(`Cell ${address} exceeds the 5,000-character limit.`);
          }
          const row = start.startRow + rowOffset;
          const col = start.startCol + colOffset;
          updates.push({ ...getCell(cells, row, col), raw });
        }
      }

      for (let index = rowCount + 1; index <= endRow; index += 1) {
        if (!sendEvent({ type: 'structure:change', dimension: 'row', action: 'insert', index })) {
          throw new Error('Could not expand the sheet rows for this import.');
        }
      }
      for (let index = colCount + 1; index <= endCol; index += 1) {
        if (!sendEvent({ type: 'structure:change', dimension: 'column', action: 'insert', index })) {
          throw new Error('Could not expand the sheet columns for this import.');
        }
      }

      sendCells(updates);
      const importedRange = {
        startRow: start.startRow,
        startCol: start.startCol,
        endRow,
        endCol,
      };
      setSelected(importedRange);
      selectionRef.current = importedRange;
      toast.success(`Imported ${importRows} × ${importCols} cells from ${file.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import this spreadsheet.');
    } finally {
      setImporting(false);
    }
  }, [
    activeSheet,
    canEdit,
    cells,
    connection,
    rowCount,
    colCount,
    sendCells,
    sendEvent,
    snapshotReady,
  ]);

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.isContentEditable)) {
      if (target !== gridRef.current) return;
    }
    const range = normalizeRange(selectionRef.current);
    const anchor = { row: selected.startRow, col: selected.startCol };
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      const bold = !getStyle(getCell(cells, anchor.row, anchor.col).style).bold;
      applyStyle({ bold });
      return;
    }
    if (modifier && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void copySelection();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      void pasteSelection();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection(false);
      return;
    }
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      beginEdit(anchor.row, anchor.col);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const row = Math.max(1, Math.min(rowCount, anchor.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
      const col = Math.max(1, Math.min(colCount, anchor.col + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
      if (event.shiftKey) {
        const next = { startRow: selected.startRow, startCol: selected.startCol, endRow: row, endCol: col };
        setSelected(next);
        selectionRef.current = next;
      } else selectCell(row, col);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const col = anchor.col >= colCount ? 1 : anchor.col + 1;
      const row = anchor.col >= colCount ? Math.min(rowCount, anchor.row + 1) : anchor.row;
      selectCell(row, col);
      return;
    }
    if (event.key === 'Escape') {
      setContextMenu(null);
      setEditingCell(null);
      return;
    }
    if (!modifier && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      beginEdit(anchor.row, anchor.col, event.key);
    }
  };

  const openDialog = (mode: Exclude<DialogMode, null>) => {
    setDialogMode(mode);
    setSearchQuery('');
    setSelectedUsers([]);
    setUserResults([]);
    if (mode === 'share') setSheetMembers([]);
    if (mode === 'create') setDialogTitle('');
    if (mode === 'share') setDialogTitle(activeSheet?.title ?? '');
    if (mode === 'rename') setDialogTitle(activeSheet?.title ?? '');
  };

  const toggleUser = (person: string) => {
    setSelectedUsers((current) => current.includes(person)
      ? current.filter((usernameValue) => usernameValue !== person)
      : [...current, person]);
  };

  const submitDialog = async (event: FormEvent) => {
    event.preventDefault();
    setSavingDialog(true);
    try {
      if (dialogMode === 'create') {
        const sheet = await createCollaborativeSheet(dialogTitle, selectedUsers);
        setSheets((current) => [sheet, ...current]);
        setActiveSheet(sheet);
        onDocumentChange?.(sheet.id);
        toast.success('Collaborative sheet created');
      } else if (dialogMode === 'share' && activeSheet) {
        const members = await addSheetMembers(activeSheet.id, selectedUsers);
        setSheetMembers(members);
        setActiveSheet((current) => current ? { ...current, memberCount: members.length } : current);
        setSheets((current) => current.map((sheet) => (
          sheet.id === activeSheet.id ? { ...sheet, memberCount: members.length } : sheet
        )));
        toast.success('Collaborators added');
      } else if (dialogMode === 'rename' && activeSheet) {
        const title = await renameCollaborativeSheet(activeSheet.id, dialogTitle);
        setActiveSheet((current) => current ? { ...current, title } : current);
        setSheets((current) => current.map((sheet) => sheet.id === activeSheet.id ? { ...sheet, title } : sheet));
        toast.success('Sheet renamed');
      }
      setDialogMode(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this sheet.');
    } finally {
      setSavingDialog(false);
    }
  };

  const renderCell = (row: number, col: number) => {
    const cell = getCell(cells, row, col);
    const style = getStyle(cell.style);
    const isSelected = row >= normalizedSelection.startRow &&
      row <= normalizedSelection.endRow &&
      col >= normalizedSelection.startCol &&
      col <= normalizedSelection.endCol;
    const key = cellKey(row, col);
    const isEditing = editingCell === key;
    return (
      <td
        key={key}
        className={`sheets-cell ${isSelected ? 'sheets-cell--selected' : ''}`}
        data-fill={style.fill}
        data-text-color={style.color}
        data-align={style.align}
        data-bold={style.bold ? 'true' : undefined}
        onMouseDown={() => {
          selectCell(row, col);
          dragAnchorRef.current = { row, col };
          setDragSelecting(true);
          gridRef.current?.focus();
        }}
        onMouseEnter={() => {
          if (!dragSelecting || !dragAnchorRef.current) return;
          const next = {
            startRow: dragAnchorRef.current.row,
            startCol: dragAnchorRef.current.col,
            endRow: row,
            endCol: col,
          };
          setSelected(next);
          selectionRef.current = next;
        }}
        onDoubleClick={() => beginEdit(row, col)}
        onContextMenu={(event: ReactMouseEvent) => {
          event.preventDefault();
          const range = normalizeRange(selectionRef.current);
          const alreadySelected =
            row >= range.startRow && row <= range.endRow &&
            col >= range.startCol && col <= range.endCol;
          if (!alreadySelected) selectCell(row, col);
          setContextMenu({ x: event.clientX, y: event.clientY, row, col });
        }}
      >
          {isEditing ? (
          <input
            ref={editorRef}
            className="sheets-cell-editor"
            value={editDraft}
            onChange={(event) => {
              refreshTypingPresence();
              setEditDraft(event.target.value);
              setFormulaDraft(event.target.value);
            }}
            onBlur={() => {
              if (!cancelEditOnBlurRef.current) commitEdit();
              cancelEditOnBlurRef.current = false;
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                const nextRow = Math.min(rowCount, row + (event.shiftKey ? -1 : 1));
                commitEdit();
                selectCell(nextRow, col);
                gridRef.current?.focus();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditOnBlurRef.current = true;
                stopTypingPresence();
                setEditingCell(null);
                setEditDraft(cell.raw);
                gridRef.current?.focus();
              } else if (event.key === 'Tab') {
                event.preventDefault();
                const nextCol = Math.min(colCount, col + 1);
                commitEdit();
                selectCell(row, nextCol);
                gridRef.current?.focus();
              }
            }}
            aria-label={`Edit ${cellAddress(row, col)}`}
          />
        ) : (
          <span className="sheets-cell-value">
            {cellValue(row, col)}
          </span>
        )}
      </td>
    );
  };

  if (!activeSheet) {
    if (embedded && initialDocumentId) {
      return (
        <section className="sheets-page sheets-page--embedded sheets-page--embedded-loading">
          {loadingSheets ? 'Loading pinned sheet…' : 'This pinned sheet is unavailable.'}
        </section>
      );
    }
    return (
      <section className={`sheets-page ${embedded ? 'sheets-page--embedded' : ''}`}>
        <header className="sheets-list-header">
          <div className="sheets-brand">
            <span className="sheets-brand-icon"><Grid2X2 className="size-5" /></span>
            <div>
              <p className="sheets-eyebrow">Collaborative workspace</p>
              <h1>Sheets</h1>
            </div>
          </div>
          <button type="button" className="sheets-primary-button" onClick={() => openDialog('create')}>
            <FilePlus2 className="size-4" /> New sheet
          </button>
        </header>

        {loadingSheets && sheets.length === 0 ? (
          <div className="sheets-empty-state"><span className="sheets-spinner" />Loading your sheets…</div>
        ) : sheets.length ? (
          <div className="sheets-list">
            {sheets.map((sheet) => (
              <button
                type="button"
                key={sheet.id}
                className="sheets-list-card"
                onClick={() => {
                  setActiveSheet(sheet);
                  onDocumentChange?.(sheet.id);
                }}
              >
                <span className="sheets-list-card-icon"><Grid2X2 className="size-5" /></span>
                <span className="sheets-list-card-copy">
                  <strong>{sheet.title}</strong>
                  <small>{sheet.owner === username ? 'You own this sheet' : `Shared by ${sheet.owner}`}</small>
                </span>
                <span className="sheets-list-card-meta">
                  <span><Users className="size-3.5" /> {columnCountLabel(sheet.memberCount)}</span>
                  <span>{new Date(sheet.updatedAt).toLocaleDateString()}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="sheets-empty-state sheets-empty-state--welcome">
            <span className="sheets-empty-icon"><Grid2X2 className="size-7" /></span>
            <h2>A shared space for the team’s numbers</h2>
            <p>Create a sheet, invite registered teammates, and work in the same grid in real time.</p>
            <button type="button" className="sheets-primary-button" onClick={() => openDialog('create')}>
              <Plus className="size-4" /> Create your first sheet
            </button>
          </div>
        )}
        {renderDialog()}
      </section>
    );
  }

  function renderDialog() {
    if (!dialogMode) return null;
    const existingMembers = new Set(sheetMembers.map((member) => member.username.toLowerCase()));
    const candidates = userResults.filter((person) => (
      person.username.toLowerCase() !== username.toLowerCase() &&
      !existingMembers.has(person.username.toLowerCase())
    ));
    return (
      <div className="sheets-dialog-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDialogMode(null);
      }}>
        <form className="sheets-dialog" onSubmit={(event) => void submitDialog(event)}>
          <div className="sheets-dialog-heading">
            <div>
              <p className="sheets-eyebrow">
                {dialogMode === 'create' ? 'Start together' : dialogMode === 'share' ? 'Access' : 'Sheet settings'}
              </p>
              <h2>{dialogMode === 'create' ? 'Create a sheet' : dialogMode === 'share' ? 'Share sheet' : 'Rename sheet'}</h2>
            </div>
            <button type="button" className="sheets-icon-button" aria-label="Close dialog" onClick={() => setDialogMode(null)}>
              <X className="size-4" />
            </button>
          </div>
          {dialogMode !== 'share' && (
            <label className="sheets-field-label" htmlFor="sheet-title">
              Sheet name
              <input
                id="sheet-title"
                autoFocus
                maxLength={60}
                required
                value={dialogTitle}
                onChange={(event) => setDialogTitle(event.target.value)}
                placeholder="e.g. Weekly quality review"
              />
            </label>
          )}
          {dialogMode !== 'rename' && (
            <>
              {dialogMode === 'share' && sheetMembers.length > 0 && (
                <div className="sheets-member-list">
                  <span>People with access</span>
                  {sheetMembers.map((member) => (
                    <small key={member.username}>
                      {member.username}{member.owner ? ' · owner' : ''}
                    </small>
                  ))}
                </div>
              )}
              <label className="sheets-field-label" htmlFor="sheet-user-search">
                Invite collaborators
                <span className="sheets-search-field">
                  <Search className="size-4" />
                  <input
                    id="sheet-user-search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Find a registered user"
                  />
                </span>
              </label>
              <div className="sheets-user-picker">
                {searchingUsers ? (
                  <div className="sheets-user-empty">Searching…</div>
                ) : candidates.length ? candidates.map((person) => (
                  <button
                    type="button"
                    className={`sheets-user-option ${selectedUsers.includes(person.username) ? 'is-selected' : ''}`}
                    key={person.username}
                    onClick={() => toggleUser(person.username)}
                  >
                    <span className="sheets-user-avatar">{person.username.slice(0, 1).toUpperCase()}</span>
                    <span>{person.username}</span>
                    {selectedUsers.includes(person.username) && <Check className="ml-auto size-4" />}
                  </button>
                )) : (
                  <div className="sheets-user-empty">
                    {dialogMode === 'share' && sheetMembers.length
                      ? `Already shared with ${sheetMembers.length} ${sheetMembers.length === 1 ? 'person' : 'people'}.`
                      : 'No matching registered users.'}
                  </div>
                )}
              </div>
              {selectedUsers.length > 0 && (
                <p className="sheets-selected-count">{selectedUsers.length} collaborator{selectedUsers.length === 1 ? '' : 's'} selected</p>
              )}
            </>
          )}
          <div className="sheets-dialog-actions">
            <button type="button" className="sheets-secondary-button" onClick={() => setDialogMode(null)}>Cancel</button>
            <button
              type="submit"
              className="sheets-primary-button"
              disabled={savingDialog || (dialogMode === 'share' && selectedUsers.length === 0)}
            >
              {savingDialog ? 'Saving…' : dialogMode === 'create' ? 'Create sheet' : dialogMode === 'share' ? 'Invite selected' : 'Save name'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const activeStyle = getStyle(activeCell.style);
  const viewReady = snapshotReady && snapshotSheetId === activeSheet.id;
  const getRowLabel = (row: number) => row;
  const openContextAt = (event: ReactMouseEvent<HTMLDivElement>, row: number, col: number) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, row, col });
  };

  return (
    <section className={`sheets-page sheets-page--grid ${embedded ? 'sheets-page--embedded' : ''}`}>
      <header className="sheets-workbook-header">
        <div className="sheets-workbook-title">
          {!embedded && (
            <button type="button" className="sheets-icon-button" aria-label="Back to all sheets" onClick={() => {
              setActiveSheet(null);
              onDocumentChange?.(null);
              void reloadSheets();
            }}>
              <ArrowLeft className="size-4" />
            </button>
          )}
          <span className="sheets-brand-icon sheets-brand-icon--small"><Grid2X2 className="size-4" /></span>
          <div className="sheets-title-text">
            <button
              type="button"
              className="sheets-title-button"
              onClick={() => activeSheet.owner === username && openDialog('rename')}
              title={activeSheet.owner === username ? 'Rename sheet' : activeSheet.title}
            >
              {activeSheet.title}
              {activeSheet.owner === username && <ChevronDown className="size-3.5" />}
            </button>
            <span className={`sheets-connection sheets-connection--${connection}`}>
              <i /> {connection === 'connected' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Offline'}
            </span>
          </div>
        </div>
        <div className="sheets-header-actions">
          <CollabPresenceStack members={presence} viewer={username} />
          {!canEdit && <span className="sheets-readonly-badge">View only</span>}
          <span className="sheets-shared-label"><Users className="size-3.5" /> {columnCountLabel(activeSheet.memberCount)}</span>
          {activeSheet.owner === username && (
            <button type="button" className="sheets-secondary-button sheets-share-button" onClick={() => openDialog('share')}>
              <Share2 className="size-4" /> Share
            </button>
          )}
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="Choose an XLSX or CSV file to import"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void importWorkbook(file);
            }}
          />
          <button
            type="button"
            className="sheets-secondary-button sheets-import-button"
            disabled={!canEdit || !viewReady || importing}
            title="Import the first worksheet at the selected cell"
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="size-4" />
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button type="button" className="sheets-primary-button sheets-export-button" onClick={exportXlsx}>
            <Download className="size-4" /> Export .xlsx
          </button>
        </div>
      </header>

      <div className="sheets-toolbar" role="toolbar" aria-label="Spreadsheet formatting">
        <button
          type="button"
          className={`sheets-tool-button ${activeStyle.bold ? 'is-active' : ''}`}
          aria-label="Bold"
          aria-pressed={activeStyle.bold}
          disabled={!canEdit}
          onClick={() => applyStyle({ bold: !activeStyle.bold })}
        ><Bold className="size-4" /></button>
        <span className="sheets-toolbar-divider" />
        <div className="sheets-color-picker">
          <span className="sheets-tool-caption">Fill</span>
          {FILL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`sheets-swatch sheets-swatch--${option.value} ${activeStyle.fill === option.value ? 'is-current' : ''}`}
              aria-label={option.label}
              title={option.label}
              disabled={!canEdit}
              onClick={() => applyStyle({ fill: option.value })}
            />
          ))}
        </div>
        <span className="sheets-toolbar-divider" />
        <div className="sheets-color-picker">
          <span className="sheets-tool-caption">Text</span>
          {TEXT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`sheets-text-swatch sheets-text-swatch--${option.value} ${activeStyle.color === option.value ? 'is-current' : ''}`}
              aria-label={option.label}
              title={option.label}
              disabled={!canEdit}
              onClick={() => applyStyle({ color: option.value })}
            ><span>A</span></button>
          ))}
        </div>
        <span className="sheets-toolbar-divider" />
        <div className="sheets-alignment-tools" aria-label="Cell alignment">
          {([
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ] as Array<[SheetAlignment, typeof AlignLeft]>).map(([alignment, Icon]) => (
            <button
              key={alignment}
              type="button"
              className={`sheets-tool-button ${activeStyle.align === alignment ? 'is-active' : ''}`}
              aria-label={`Align ${alignment}`}
              aria-pressed={activeStyle.align === alignment}
              disabled={!canEdit}
              onClick={() => applyStyle({ align: alignment })}
            ><Icon className="size-4" /></button>
          ))}
        </div>
        <span className="sheets-toolbar-divider sheets-toolbar-divider--grow" />
        <span className="sheets-grid-limit">{rowCount} × {colCount} <span>max 100 × 100</span></span>
      </div>

      <div className="sheets-formula-bar">
        <div className="sheets-name-box" title="Selected cell or range">
          {selectedCellCount > 1
            ? `${cellAddress(normalizedSelection.startRow, normalizedSelection.startCol)}:${cellAddress(normalizedSelection.endRow, normalizedSelection.endCol)}`
            : activeAddress}
        </div>
        <span className="sheets-formula-mark">fx</span>
        <input
          ref={formulaInputRef}
          aria-label={`Formula or value for ${activeAddress}`}
          value={selectedCellCount > 1 ? '' : formulaDraft}
          placeholder={selectedCellCount > 1 ? `${selectedCellCount} cells selected` : 'Enter a value or formula, e.g. =SUM(A1:A5)'}
          disabled={!viewReady || !canEdit || selectedCellCount > 1}
          onChange={(event) => setFormulaDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const cell = getCell(cells, selected.startRow, selected.startCol);
              sendCells([{ ...cell, raw: formulaDraft.slice(0, 5_000) }]);
              const nextRow = Math.min(rowCount, selected.startRow + 1);
              selectCell(nextRow, selected.startCol);
              gridRef.current?.focus();
            }
            if (event.key === 'Escape') {
              setFormulaDraft(activeCell.raw);
              gridRef.current?.focus();
            }
          }}
          onBlur={() => {
            if (selectedCellCount === 1 && formulaDraft !== activeCell.raw && viewReady) {
              sendCells([{ ...activeCell, raw: formulaDraft.slice(0, 5_000) }]);
            }
          }}
        />
      </div>

      <div className="sheets-grid-shell">
        {!viewReady && (
          <div className="sheets-grid-loading">
            {connection === 'offline' ? (
              <>
                <span>Connection lost</span>
              <button
                type="button"
                className="sheets-secondary-button"
                onClick={() => setConnectionAttempt((attempt) => attempt + 1)}
              >Reconnect</button>
              </>
            ) : (
              <><span className="sheets-spinner" /> Loading shared cells…</>
            )}
          </div>
        )}
        <div
          ref={gridRef}
          className={`sheets-grid-scroll ${viewReady ? '' : 'is-loading'}`}
          tabIndex={0}
          role="grid"
          aria-label={`${activeSheet.title} spreadsheet`}
          aria-rowcount={rowCount}
          aria-colcount={colCount}
          onKeyDown={onGridKeyDown}
          onContextMenu={(event) => {
            if (event.target === event.currentTarget) openContextAt(event, selected.startRow, selected.startCol);
          }}
          onMouseUp={() => setDragSelecting(false)}
        >
          <table className="sheets-grid-table">
            <thead>
              <tr>
                <th className="sheets-corner-cell" />
                {Array.from({ length: colCount }, (_, index) => (
                  <th
                    key={index + 1}
                    className={`sheets-column-heading ${selected.startCol === index + 1 ? 'is-current' : ''}`}
                    onClick={() => selectCell(selected.startRow, index + 1)}
                    onContextMenu={(event) => openContextAt(event, selected.startRow, index + 1)}
                  >
                    {columnLabel(index + 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, rowIndex) => (
                <tr key={rowIndex + 1} aria-rowindex={rowIndex + 1}>
                  <th
                    className={`sheets-row-heading ${selected.startRow === rowIndex + 1 ? 'is-current' : ''}`}
                    onClick={() => selectCell(rowIndex + 1, selected.startCol)}
                    onContextMenu={(event) => openContextAt(event, rowIndex + 1, selected.startCol)}
                  >{getRowLabel(rowIndex + 1)}</th>
                  {Array.from({ length: colCount }, (_, colIndex) => renderCell(rowIndex + 1, colIndex + 1))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="sheets-status-bar">
        <div className="sheets-sheet-tab"><Grid2X2 className="size-3.5" /> {activeSheet.title}</div>
        <div className="sheets-status-actions">
          <button type="button" onClick={() => changeStructure('row', 'insert', rowCount + 1)} disabled={!canEdit || rowCount >= 100}>
            <Plus className="size-3.5" /><Rows3 className="size-3.5" /> Row
          </button>
          <button type="button" onClick={() => changeStructure('column', 'insert', colCount + 1)} disabled={!canEdit || colCount >= 100}>
            <Plus className="size-3.5" /><Columns3 className="size-3.5" /> Column
          </button>
          <span>{activeAddress}{selectedCellCount > 1 ? ` · ${selectedCellCount} cells` : ''}</span>
        </div>
      </footer>

      {contextMenu && (
        <div
          className="sheets-context-menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 230),
            top: Math.min(contextMenu.y, window.innerHeight - 360),
          }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => { void copySelection(); setContextMenu(null); }}>
            <Clipboard className="size-4" /> Copy cells <kbd>⌘/Ctrl C</kbd>
          </button>
          <button type="button" role="menuitem" disabled={!canEdit} onClick={() => { void pasteSelection(); setContextMenu(null); }}>
            <span className="sheets-menu-icon">↳</span> Paste cells <kbd>⌘/Ctrl V</kbd>
          </button>
          <div className="sheets-context-divider" />
          <button type="button" role="menuitem" disabled={!canEdit || rowCount >= 100} onClick={() => { changeStructure('row', 'insert', contextMenu.row); setContextMenu(null); }}>
            <Rows3 className="size-4" /> Insert row above
          </button>
          <button type="button" role="menuitem" disabled={!canEdit || rowCount <= 1} onClick={() => { changeStructure('row', 'delete', contextMenu.row); setContextMenu(null); }}>
            <Rows3 className="size-4" /> Delete row
          </button>
          <button type="button" role="menuitem" disabled={!canEdit || colCount >= 100} onClick={() => { changeStructure('column', 'insert', contextMenu.col); setContextMenu(null); }}>
            <Columns3 className="size-4" /> Insert column left
          </button>
          <button type="button" role="menuitem" disabled={!canEdit || colCount <= 1} onClick={() => { changeStructure('column', 'delete', contextMenu.col); setContextMenu(null); }}>
            <Columns3 className="size-4" /> Delete column
          </button>
          <div className="sheets-context-divider" />
          <button type="button" role="menuitem" disabled={!canEdit} onClick={() => { clearSelection(false); setContextMenu(null); }}>
            <X className="size-4" /> Clear contents
          </button>
          <button type="button" role="menuitem" disabled={!canEdit} onClick={() => { clearSelection(true); setContextMenu(null); }}>
            <X className="size-4" /> Clear contents and format
          </button>
        </div>
      )}

      {renderDialog()}
    </section>
  );
}
