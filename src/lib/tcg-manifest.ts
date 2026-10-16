/**
 * TCG manifest loader + rarity styling — card collections ship as static
 * manifests (plus compressed webp images) under /assets/tcg/<collection>/.
 * Adding a new collection = run scripts/build-tcg-packs.mjs with a new entry
 * and append it to TCG_COLLECTIONS here; the UI (store draw + My Collection
 * tabs) picks it up automatically.
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
  collection: string;
  source: string;
  builtAt: string;
  tierWeights: Record<string, number>;
  cards: TcgManifestCard[];
}

/** Collections available in the app (order = tab order in My Collection). */
export const TCG_COLLECTIONS = [
  { id: 'sds', label: 'The Seven Deadly Sins' },
  { id: 'pokemon', label: 'Pokémon Rare Bundles' },
] as const;

export type TcgCollectionId = (typeof TCG_COLLECTIONS)[number]['id'];

const manifestCache = new Map<string, Promise<TcgManifest>>();

/** Fetch (and memoize) a collection's card manifest. Rejects on failure. */
export function loadTcgManifest(collection: TcgCollectionId): Promise<TcgManifest> {
  let cached = manifestCache.get(collection);
  if (!cached) {
    cached = fetch(`/assets/tcg/${collection}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Card manifest unavailable (${res.status})`);
        return res.json() as Promise<TcgManifest>;
      })
      .catch((err) => {
        manifestCache.delete(collection); // allow retry after a failure
        throw err;
      });
    manifestCache.set(collection, cached);
  }
  return cached;
}

/** Collection id from a store product id (convention: tcg-<collection>-…). */
export function collectionOfProduct(productId: string): TcgCollectionId {
  const known = TCG_COLLECTIONS.find((c) => productId === `tcg-${c.id}-card` || productId.startsWith(`tcg-${c.id}`));
  return known?.id ?? 'sds';
}

/** Store product id per collection (for Draw-again flows). */
export const PRODUCT_OF_COLLECTION: Record<TcgCollectionId, string> = {
  sds: 'tcg-sds-card',
  pokemon: 'tcg-pokemon-rare',
};

/** Spice price per collection draw (mirrors the seeded store products). */
export const DRAW_PRICE: Record<TcgCollectionId, number> = {
  sds: 9,
  pokemon: 99,
};

/** Rarity → display styling, CS:GO-style tier ladder (price = rarity). */
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
