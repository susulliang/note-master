import type { SheetCell } from '@/lib/sheets-types';

export interface CachedSheetSnapshot {
  id: string;
  rows: number;
  cols: number;
  cells: SheetCell[];
  savedAt: number;
}

export interface CachedMindmapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

export interface CachedMindmapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface CachedMindmapSnapshot {
  id: string;
  nodes: CachedMindmapNode[];
  edges: CachedMindmapEdge[];
  savedAt: number;
}

const DB_NAME = 'econote-collab-cache';
const DB_VERSION = 1;
const SHEET_STORE = 'sheets';
const MINDMAP_STORE = 'mindmaps';
let databasePromise: Promise<IDBDatabase> | null = null;

function directoryKey(username: string, type: 'sheet' | 'mindmap'): string {
  return `econote:collab-directory:${type}:${encodeURIComponent(username.toLowerCase())}`;
}

export function loadCollabDirectoryCache<T>(username: string, type: 'sheet' | 'mindmap'): T[] {
  try {
    const raw = window.localStorage.getItem(directoryKey(username, type));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export function saveCollabDirectoryCache<T>(username: string, type: 'sheet' | 'mindmap', documents: T[]): void {
  try {
    window.localStorage.setItem(directoryKey(username, type), JSON.stringify(documents.slice(0, 200)));
  } catch {
    /* Keep the document workspace usable when local storage is unavailable. */
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SHEET_STORE)) {
        database.createObjectStore(SHEET_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(MINDMAP_STORE)) {
        database.createObjectStore(MINDMAP_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = null;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open collaborative document cache.'));
    };
  });
  return databasePromise;
}

async function readSnapshot<T>(storeName: string, id: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not load cached document.'));
  });
}

async function writeSnapshot<T extends { id: string }>(storeName: string, snapshot: T): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save cached document.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Document cache write was aborted.'));
  });
}

export async function loadSheetSnapshot(id: string): Promise<CachedSheetSnapshot | null> {
  const snapshot = await readSnapshot<CachedSheetSnapshot>(SHEET_STORE, id);
  if (
    !snapshot ||
    snapshot.id !== id ||
    !Number.isInteger(snapshot.rows) ||
    !Number.isInteger(snapshot.cols) ||
    !Array.isArray(snapshot.cells)
  ) return null;
  return snapshot;
}

export function saveSheetSnapshot(snapshot: Omit<CachedSheetSnapshot, 'savedAt'>): Promise<void> {
  return writeSnapshot(SHEET_STORE, { ...snapshot, savedAt: Date.now() });
}

export async function loadMindmapSnapshot(id: string): Promise<CachedMindmapSnapshot | null> {
  const snapshot = await readSnapshot<CachedMindmapSnapshot>(MINDMAP_STORE, id);
  if (
    !snapshot ||
    snapshot.id !== id ||
    !Array.isArray(snapshot.nodes) ||
    !Array.isArray(snapshot.edges)
  ) return null;
  return snapshot;
}

export function saveMindmapSnapshot(snapshot: Omit<CachedMindmapSnapshot, 'savedAt'>): Promise<void> {
  return writeSnapshot(MINDMAP_STORE, { ...snapshot, savedAt: Date.now() });
}
