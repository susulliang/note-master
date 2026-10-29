import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';

export interface CollaboratorPresence {
  username: string;
  typing?: boolean;
  seed?: number;
  rotation?: number;
}

interface CollabPresenceStackProps {
  members: CollaboratorPresence[];
  viewer: string;
}

function fallbackSeed(username: string): number {
  let hash = 2166136261;
  for (const character of username.toLowerCase()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

export default function CollabPresenceStack({ members, viewer }: CollabPresenceStackProps) {
  if (!members.length) return null;
  const typingMembers = members.filter((member) => (
    member.typing && member.username.toLowerCase() !== viewer.toLowerCase()
  ));
  const firstTyper = typingMembers[0]?.username;
  const typingText = firstTyper
    ? typingMembers.length > 1
      ? `${firstTyper} + ${typingMembers.length - 1} typing…`
      : `${firstTyper} is typing…`
    : '';

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 text-[9px] text-muted-foreground"
      title={members.map((member) => member.username).join(', ')}
      aria-label={`${members.length} viewing${typingText ? `, ${typingText}` : ''}`}
    >
      <div className="flex shrink-0 -space-x-2" aria-hidden="true">
        {members.slice(0, 4).map((member, index) => (
          <span
            className="grid size-6 place-items-center overflow-hidden rounded-full border-2 border-background bg-card"
            key={member.username}
            style={{ zIndex: 4 - index }}
          >
            <PixelHumanoidAvatar
              seed={member.seed ?? fallbackSeed(member.username)}
              rotation={member.rotation ?? 0}
              size={24}
              className="rounded-full"
            />
          </span>
        ))}
        {members.length > 4 && (
          <span className="grid size-6 place-items-center rounded-full border-2 border-background bg-muted font-semibold text-foreground">
            +{members.length - 4}
          </span>
        )}
      </div>
      <span className="whitespace-nowrap">{members.length} viewing</span>
      {typingText && <span className="max-w-24 truncate text-accent sm:max-w-36">{typingText}</span>}
    </div>
  );
}
