import type { CollabDriveFile, CollabDriveFolder } from '@/lib/chat-client';

export interface DriveIndexSnapshot {
  folders: CollabDriveFolder[];
  files: CollabDriveFile[];
  usage: { usedBytes: number; limitBytes: number } | null;
}

interface StoredDriveIndex extends DriveIndexSnapshot {
  key: string;
  savedAt: number;
}

interface StoredDrivePreview {
  key: string;
  blob: Blob;
  savedAt: number;
}

const DB_NAME = 'econote-drive-cache';
const DB_VERSION = 1;
const INDEX_STORE = 'drive-index';
const PREVIEW_STORE = 'drive-previews';
let databasePromise: Promise<IDBDatabase> | null = null;

function openDriveCache(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(INDEX_STORE)) {
        request.result.createObjectStore(INDEX_STORE, { keyPath: 'key' });
      }
      if (!request.result.objectStoreNames.contains(PREVIEW_STORE)) {
        request.result.createObjectStore(PREVIEW_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open the Drive cache.'));
    };
  });
  return databasePromise;
}

export async function readDriveIndex(key: string): Promise<DriveIndexSnapshot | null> {
  const database = await openDriveCache();
  return new Promise((resolve, reject) => {
    const request = database.transaction(INDEX_STORE, 'readonly').objectStore(INDEX_STORE).get(key);
    request.onsuccess = () => {
      const stored = request.result as StoredDriveIndex | undefined;
      resolve(stored ? {
        folders: stored.folders,
        files: stored.files,
        usage: stored.usage,
      } : null);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not read the Drive index.'));
  });
}

export async function writeDriveIndex(key: string, snapshot: DriveIndexSnapshot): Promise<void> {
  const database = await openDriveCache();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INDEX_STORE, 'readwrite');
    transaction.objectStore(INDEX_STORE).put({ ...snapshot, key, savedAt: Date.now() } satisfies StoredDriveIndex);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the Drive index.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Drive index write was aborted.'));
  });
}

export async function readDrivePreview(key: string): Promise<Blob | null> {
  const database = await openDriveCache();
  return new Promise((resolve, reject) => {
    const request = database.transaction(PREVIEW_STORE, 'readonly').objectStore(PREVIEW_STORE).get(key);
    request.onsuccess = () => resolve((request.result as StoredDrivePreview | undefined)?.blob ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read the Drive preview.'));
  });
}

export async function writeDrivePreview(key: string, blob: Blob): Promise<void> {
  const database = await openDriveCache();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PREVIEW_STORE, 'readwrite');
    transaction.objectStore(PREVIEW_STORE).put({ key, blob, savedAt: Date.now() } satisfies StoredDrivePreview);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the Drive preview.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Drive preview write was aborted.'));
  });
}
