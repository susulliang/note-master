import type { TeamBoardCard, TeamBoardCardDetail, TeamBoardStatus } from '@/lib/chat-client';

interface CachedCardList {
  cacheKey: string;
  username: string;
  cards: TeamBoardCard[];
  savedAt: number;
}

interface CachedCardDetail {
  cacheKey: string;
  username: string;
  cardId: string;
  detail: TeamBoardCardDetail;
  savedAt: number;
}

const DB_NAME = 'econote-team-board-cache';
const DB_VERSION = 1;
const CARD_LISTS = 'card-lists';
const CARD_DETAILS = 'card-details';
let databasePromise: Promise<IDBDatabase | null> | null = null;

export function teamBoardCardListKey(options: {
  type?: TeamBoardCard['type'] | 'all';
  status?: TeamBoardStatus | 'all';
  query?: string;
} = {}): string {
  return JSON.stringify([
    options.type ?? 'all',
    options.status ?? 'all',
    options.query?.trim().toLowerCase() ?? '',
  ]);
}

function scopedKey(username: string, key: string): string {
  return `${username.trim().toLowerCase()}|${key}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CARD_LISTS)) {
        database.createObjectStore(CARD_LISTS, { keyPath: 'cacheKey' });
      }
      if (!database.objectStoreNames.contains(CARD_DETAILS)) {
        database.createObjectStore(CARD_DETAILS, { keyPath: 'cacheKey' });
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
      reject(request.error ?? new Error('Could not open Team Board cache.'));
    };
  });
  return databasePromise;
}

async function readEntry<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const database = await openDatabase();
    if (!database) return null;
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read Team Board cache.'));
    });
  } catch {
    return null;
  }
}

async function writeEntry(storeName: string, entry: CachedCardList | CachedCardDetail): Promise<void> {
  try {
    const database = await openDatabase();
    if (!database) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save Team Board cache.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Team Board cache write was aborted.'));
    });
  } catch {
    /* Keep board and chat usable if IndexedDB is unavailable. */
  }
}

export async function loadTeamBoardCardList(
  username: string,
  listKey: string,
): Promise<TeamBoardCard[] | null> {
  const cacheKey = scopedKey(username, listKey);
  const entry = await readEntry<CachedCardList>(CARD_LISTS, cacheKey);
  return entry?.username.toLowerCase() === username.trim().toLowerCase() && Array.isArray(entry.cards)
    ? entry.cards
    : null;
}

export function saveTeamBoardCardList(
  username: string,
  listKey: string,
  cards: TeamBoardCard[],
): Promise<void> {
  return writeEntry(CARD_LISTS, {
    cacheKey: scopedKey(username, listKey),
    username,
    cards,
    savedAt: Date.now(),
  });
}

export async function loadTeamBoardCardDetail(
  username: string,
  cardId: string,
): Promise<TeamBoardCardDetail | null> {
  const cacheKey = scopedKey(username, `card:${cardId}`);
  const entry = await readEntry<CachedCardDetail>(CARD_DETAILS, cacheKey);
  return entry?.username.toLowerCase() === username.trim().toLowerCase() &&
    entry.cardId === cardId &&
    entry.detail?.card?.id === cardId
    ? entry.detail
    : null;
}

export function saveTeamBoardCardDetail(
  username: string,
  cardId: string,
  detail: TeamBoardCardDetail,
): Promise<void> {
  return writeEntry(CARD_DETAILS, {
    cacheKey: scopedKey(username, `card:${cardId}`),
    username,
    cardId,
    detail,
    savedAt: Date.now(),
  });
}

export async function removeTeamBoardCardDetail(username: string, cardId: string): Promise<void> {
  try {
    const database = await openDatabase();
    if (!database) return;
    const transaction = database.transaction(CARD_DETAILS, 'readwrite');
    transaction.objectStore(CARD_DETAILS).delete(scopedKey(username, `card:${cardId}`));
  } catch {
    /* The next successful fetch will replace this entry. */
  }
}
