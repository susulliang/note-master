import type { ChatMessage } from '@/lib/chat-client';

export interface ChatMessageCursor {
  createdAt: number;
  id: string;
}

export interface ChatRoomCache {
  roomId: string;
  messages: ChatMessage[];
  hasOlder: boolean;
  cursor: ChatMessageCursor | null;
  initialized: boolean;
  updatedAt: number;
}

interface StoredChatRoomCache extends Omit<ChatRoomCache, 'roomId'> {
  roomId: string;
  logicalRoomId: string;
}

const DB_NAME = 'econote-chat-cache';
const STORE_NAME = 'rooms';
let databasePromise: Promise<IDBDatabase> | null = null;
const memoryRoomCache = new Map<string, ChatRoomCache>();

function scopedRoomKey(username: string, roomId: string): string {
  return `${username.toLowerCase()}|${roomId}`;
}

export function peekChatRoomCache(username: string, roomId: string): ChatRoomCache | null {
  return memoryRoomCache.get(scopedRoomKey(username, roomId)) ?? null;
}
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'roomId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open chat cache.'));
    };
  });
  return databasePromise;
}

export async function loadChatRoomCache(username: string, roomId: string): Promise<ChatRoomCache | null> {
  const key = scopedRoomKey(username, roomId);
  const memory = memoryRoomCache.get(key);
  if (memory) return memory;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const stored = (request.result as StoredChatRoomCache | undefined) ?? null;
      const cache = stored ? { ...stored, roomId: stored.logicalRoomId } : null;
      if (cache) memoryRoomCache.set(key, cache);
      resolve(cache);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not load chat cache.'));
  });
}

export async function saveChatRoomCache(username: string, cache: ChatRoomCache): Promise<void> {
  const key = scopedRoomKey(username, cache.roomId);
  memoryRoomCache.set(key, cache);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      ...cache,
      roomId: key,
      logicalRoomId: cache.roomId,
    } satisfies StoredChatRoomCache);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save chat cache.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Chat cache write was aborted.'));
  });
}

export async function upsertCachedChatMessage(
  username: string,
  roomId: string,
  message: ChatMessage,
): Promise<void> {
  const key = scopedRoomKey(username, roomId);
  const memoryPrevious = memoryRoomCache.get(key);
  const memoryMessages = memoryPrevious?.messages ?? [];
  const memoryHasMessage = memoryMessages.some((item) => item.id === message.id);
  const immediateMessages = memoryHasMessage
    ? memoryMessages.map((item) => item.id === message.id ? message : item)
    : [...memoryMessages, message];
  immediateMessages.sort((a, b) => a.createdAt - b.createdAt);
  memoryRoomCache.set(key, {
    roomId,
    messages: immediateMessages,
    hasOlder: memoryPrevious?.hasOlder ?? false,
    cursor: memoryPrevious?.cursor ?? null,
    initialized: memoryPrevious?.initialized ?? false,
    updatedAt: Date.now(),
  });

  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let updatedCache: ChatRoomCache | null = null;
    const request = store.get(key);
    request.onsuccess = () => {
      const stored = request.result as StoredChatRoomCache | undefined;
      const previous = memoryRoomCache.get(key) ?? (stored ? {
        ...stored,
        roomId: stored.logicalRoomId,
      } : undefined);
      const messages = previous?.messages ?? [];
      const exists = messages.some((item) => item.id === message.id);
      const nextMessages = exists
        ? messages.map((item) => item.id === message.id ? message : item)
        : [...messages, message];
      nextMessages.sort((a, b) => a.createdAt - b.createdAt);
      updatedCache = {
        roomId,
        messages: nextMessages,
        hasOlder: previous?.hasOlder ?? false,
        cursor: previous?.cursor ?? null,
        initialized: previous?.initialized ?? false,
        updatedAt: Date.now(),
      };
      memoryRoomCache.set(key, updatedCache);
      store.put({
        ...updatedCache,
        roomId: key,
        logicalRoomId: roomId,
      } satisfies StoredChatRoomCache);
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update chat cache.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Chat cache write was aborted.'));
  });
}
