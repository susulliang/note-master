interface PixelHumanoidAvatarProps {
  seed: number;
  rotation?: number;
  size?: number;
  className?: string;
}

const HAIR = ['#28242b', '#4a3027', '#75472d', '#b07a3e', '#d3b4a0', '#302a48'];
const SKIN = ['#f2c7a5', '#dca47c', '#ad7155', '#8b5948', '#f0d1b8', '#c88768'];
const SHIRT = ['#4c85d9', '#5a9b6a', '#d56854', '#9a75c9', '#d7a343', '#49a9a3'];
const PANTS = ['#34445d', '#514469', '#495344', '#78523f', '#393d48'];

function pick<T>(items: T[], seed: number, offset: number): T {
  return items[Math.abs(Math.floor(seed) + offset * 37) % items.length];
}

export function PixelHumanoidAvatar({
  seed,
  rotation = 0,
  size = 32,
  className,
}: PixelHumanoidAvatarProps) {
  const hair = pick(HAIR, seed, 1);
  const skin = pick(SKIN, seed, 2);
  const shirt = pick(SHIRT, seed, 3);
  const pants = pick(PANTS, seed, 4);
  const alternateShirt = pick(SHIRT, seed, 5);
  const hairLength = Math.abs(Math.floor(seed / 7)) % 2 === 0;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 220ms ease-out' }}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="56" height="56" rx="12" fill="#101820" opacity="0.13" />
      <rect x="20" y="8" width="24" height="8" fill={hair} />
      <rect x="16" y="12" width="4" height="12" fill={hair} />
      <rect x="44" y="12" width="4" height="12" fill={hair} />
      {hairLength && <rect x="44" y="24" width="4" height="12" fill={hair} />}
      <rect x="20" y="16" width="24" height="20" fill={skin} />
      <rect x="24" y="24" width="4" height="4" fill="#26333c" />
      <rect x="36" y="24" width="4" height="4" fill="#26333c" />
      <rect x="28" y="32" width="8" height="4" fill="#9c5354" />
      <rect x="28" y="36" width="8" height="4" fill={skin} />
      <rect x="20" y="40" width="24" height="12" fill={shirt} />
      <rect x="16" y="40" width="4" height="12" fill={skin} />
      <rect x="44" y="40" width="4" height="12" fill={skin} />
      <rect x="28" y="40" width="8" height="8" fill={alternateShirt} opacity="0.82" />
      <rect x="24" y="52" width="8" height="8" fill={pants} />
      <rect x="32" y="52" width="8" height="8" fill={pants} />
      <rect x="20" y="60" width="12" height="4" fill="#29313a" />
      <rect x="32" y="60" width="12" height="4" fill="#29313a" />
    </svg>
  );
}

export default PixelHumanoidAvatar;
