import { useEffect, useState } from 'react';
import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';
import { fetchChatAvatarImage, type ChatAvatarProfile } from '@/lib/chat-client';

const AVATAR_CACHE_MS = 60_000;
const avatarCache = new Map<string, { expiresAt: number; value: Promise<Blob | null> }>();

function cachedAvatar(username: string): Promise<Blob | null> {
  const key = username.trim().toLocaleLowerCase();
  const current = avatarCache.get(key);
  if (current && current.expiresAt > Date.now()) return current.value;
  const value = fetchChatAvatarImage(username).catch(() => null);
  avatarCache.set(key, { expiresAt: Date.now() + AVATAR_CACHE_MS, value });
  return value;
}

export function invalidateChatAvatarCache(username: string): void {
  const key = username.trim().toLocaleLowerCase();
  avatarCache.delete(key);
  window.dispatchEvent(new CustomEvent('econote:chat-avatar-updated', { detail: { username: key } }));
}

interface ChatAvatarProps {
  username: string;
  profile?: ChatAvatarProfile | null;
  size?: number;
  className?: string;
}

export default function ChatAvatar({
  username,
  profile,
  size = 32,
  className,
}: ChatAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const normalizedUsername = username.trim().toLocaleLowerCase();

  useEffect(() => {
    const onAvatarUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string }>).detail;
      if (detail?.username?.toLocaleLowerCase() === normalizedUsername) setRefreshKey((key) => key + 1);
    };
    window.addEventListener('econote:chat-avatar-updated', onAvatarUpdate);
    return () => window.removeEventListener('econote:chat-avatar-updated', onAvatarUpdate);
  }, [normalizedUsername]);

  useEffect(() => {
    if (!username.trim()) {
      setImageUrl(null);
      return undefined;
    }
    let alive = true;
    let objectUrl: string | null = null;
    setImageUrl(null);
    void cachedAvatar(username).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [normalizedUsername, refreshKey, username]);

  if (!imageUrl) {
    return (
      <PixelHumanoidAvatar
        seed={profile?.seed ?? 0}
        rotation={profile?.rotation ?? 0}
        size={size}
        className={className}
      />
    );
  }

  return (
    <img
      src={imageUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
