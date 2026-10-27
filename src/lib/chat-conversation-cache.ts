import type { ChatConversation } from '@/lib/chat-client';

function storageKey(username: string): string {
  return `econote:chat-conversations:${encodeURIComponent(username.toLowerCase())}`;
}

export function loadChatConversationCache(username: string): ChatConversation[] {
  try {
    const raw = window.localStorage.getItem(storageKey(username));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((conversation): conversation is ChatConversation => (
      conversation !== null &&
      typeof conversation === 'object' &&
      typeof conversation.roomId === 'string' &&
      typeof conversation.title === 'string' &&
      (conversation.kind === 'direct' || conversation.kind === 'group')
    ));
  } catch {
    return [];
  }
}

export function saveChatConversationCache(username: string, conversations: ChatConversation[]): void {
  try {
    const compact = conversations.slice(0, 100).map((conversation) => ({
      ...conversation,
      lastMessage: conversation.lastMessage.slice(0, 500),
    }));
    window.localStorage.setItem(storageKey(username), JSON.stringify(compact));
  } catch {
    /* Keep chat usable when local storage is full or unavailable. */
  }
}
