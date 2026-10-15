/**
 * TCG manifest loader + rarity styling — the Seven Deadly Sins card pack
 * (scraped by scripts/build-tcg-pack.mjs) ships as a static manifest plus
 * 249 compressed webp images under /assets/tcg. The manifest is fetched
 * once per session and cached in-module.
 */

export interface TcgManifestCard {
  id: string;
  code: string;
  name: string;
  price: number;
  rarity: string;
  image: string;
}

export interface TcgManifest {
  set: string;
  source: string;
  builtAt: string;
  tierWeights: Record<string, number>;
  cards: TcgManifestCard[];
}

let manifestCache: Promise<TcgManifest> | null = null;

/** Fetch (and memoize) the card manifest. Rejects on network failure. */
export function loadTcgManifest(): Promise<TcgManifest> {
  if (!manifestCache) {
    manifestCache = fetch('/assets/tcg/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Card manifest unavailable (${res.status})`);
        return res.json() as Promise<TcgManifest>;
      })
      .catch((err) => {
        manifestCache = null; // allow retry after a failure
        throw err;
      });
  }
  return manifestCache;
}

/** Rarity → display styling, CS:GO-style tier ladder (site price = rarity). */
export const TCG_RARITY_STYLES: Record<string, { label: string; text: string; border: string; glow: string; chip: string }> = {
  Common: { label: 'Common', text: 'text-slate-300', border: 'border-slate-400/50', glow: 'shadow-[0_0_24px_-4px_rgba(148,163,184,0.65)]', chip: 'bg-slate-500/25 text-slate-200 border-slate-400/40' },
  Uncommon: { label: 'Uncommon', text: 'text-sky-300', border: 'border-sky-400/60', glow: 'shadow-[0_0_28px_-4px_rgba(56,189,248,0.75)]', chip: 'bg-sky-500/25 text-sky-200 border-sky-400/40' },
  Rare: { label: 'Rare', text: 'text-violet-300', border: 'border-violet-400/60', glow: 'shadow-[0_0_32px_-2px_rgba(167,139,250,0.85)]', chip: 'bg-violet-500/25 text-violet-200 border-violet-400/40' },
  'Super Rare': { label: 'Super Rare', text: 'text-pink-300', border: 'border-pink-400/60', glow: 'shadow-[0_0_36px_-2px_rgba(244,114,182,0.9)]', chip: 'bg-pink-500/25 text-pink-200 border-pink-400/40' },
  'Ultra Rare': { label: 'Ultra Rare', text: 'text-red-300', border: 'border-red-400/70', glow: 'shadow-[0_0_40px_-2px_rgba(248,113,113,0.95)]', chip: 'bg-red-500/25 text-red-200 border-red-400/40' },
  'Secret Rare': { label: 'Secret Rare', text: 'text-amber-300', border: 'border-amber-300/80', glow: 'shadow-[0_0_48px_0_rgba(252,211,77,1)]', chip: 'bg-amber-400/30 text-amber-200 border-amber-300/50' },
};

export function rarityStyle(rarity: string) {
  return TCG_RARITY_STYLES[rarity] ?? TCG_RARITY_STYLES.Common;
}
