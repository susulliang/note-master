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

const DB_NAME = 'econote-chat-cache';
const STORE_NAME = 'rooms';
let databasePromise: Promise<IDBDatabase> | null = null;

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

export async function loadChatRoomCache(roomId: string): Promise<ChatRoomCache | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(roomId);
    request.onsuccess = () => resolve((request.result as ChatRoomCache | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not load chat cache.'));
  });
}

export async function saveChatRoomCache(cache: ChatRoomCache): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(cache);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save chat cache.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Chat cache write was aborted.'));
  });
}

export async function upsertCachedChatMessage(roomId: string, message: ChatMessage): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(roomId);
    request.onsuccess = () => {
      const previous = request.result as ChatRoomCache | undefined;
      const messages = previous?.messages ?? [];
      const exists = messages.some((item) => item.id === message.id);
      const nextMessages = exists
        ? messages.map((item) => item.id === message.id ? message : item)
        : [...messages, message];
      nextMessages.sort((a, b) => a.createdAt - b.createdAt);
      store.put({
        roomId,
        messages: nextMessages,
        hasOlder: previous?.hasOlder ?? false,
        cursor: previous?.cursor ?? null,
        initialized: previous?.initialized ?? false,
        updatedAt: Date.now(),
      } satisfies ChatRoomCache);
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update chat cache.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Chat cache write was aborted.'));
  });
}
