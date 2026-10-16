/**
 * build-tcg-packs.mjs — multi-collection TCG pack builder.
 *
 * For each collection below it scrapes the card list, downloads images,
 * compresses them to webp under the 10 MB per-collection budget, and writes:
 *   public/assets/tcg/<collection>/manifest.json
 *   public/assets/tcg/<collection>/cards/<id>.webp
 * plus one shared worker module:
 *   worker/tcg-manifest.gen.ts   (TCG_SETS: collection → cards + weights)
 *
 * SDS source: Strictly Broken TCG (Shopify products.json), site price = rarity.
 * Pokémon source: pokemontcg.io v2 (curated rare pool; tcgplayer market price
 * = rarity). Existing card images are reused when already downloaded.
 *
 * Run: node scripts/build-tcg-packs.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile, stat, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OUT_ROOT = path.resolve('public/assets/tcg');
const BUDGET = 10 * 1024 * 1024; // 10 MB per collection
const IMG_HEIGHT = 240;
const SDS_SOURCE = 'https://www.strictlybrokentcg.ca/collections/the-seven-deadly-sins-complete-inventory/';
const POKEMON_RARITIES = [
  'Rare Holo', 'Rare Holo EX', 'Rare Holo GX', 'Rare Ultra', 'Rare Holo V',
  'Rare Holo VMAX', 'Rare Holo VSTAR', 'Rare Holo EX',
  'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare',
];
const POKEMON_POOL_SIZE = 150;

// ── Rarity tier ladders (price → rarity) + draw weights per collection ──────

const SDS_TIERS = [
  { max: 1, rarity: 'Common', weight: 68 },
  { max: 3, rarity: 'Uncommon', weight: 19 },
  { max: 6, rarity: 'Rare', weight: 8 },
  { max: 10, rarity: 'Super Rare', weight: 3.2 },
  { max: 15, rarity: 'Ultra Rare', weight: 1.3 },
  { max: Infinity, rarity: 'Secret Rare', weight: 0.5 },
];

// Attack on Titan foils — the whole pool is foil-grade with a long price tail
// (SSP chase cards reach $300). Ladder mirrors that spread.
const AOT_TIERS = [
  { max: 5, rarity: 'Common', weight: 30 },
  { max: 15, rarity: 'Uncommon', weight: 28 },
  { max: 40, rarity: 'Rare', weight: 22 },
  { max: 100, rarity: 'Super Rare', weight: 12 },
  { max: 250, rarity: 'Ultra Rare', weight: 5.5 },
  { max: Infinity, rarity: 'Secret Rare', weight: 1.5 },
];

// Pokémon Rare Bundles is a premium (99 🌶️) product — steeper ladder, and
// every card in the pool is already rare/holo-grade. The pool pyramid is
// built in fetchPokemon() to match these bands.
const POKEMON_TIERS = [
  { max: 4, rarity: 'Common', weight: 34 },
  { max: 12, rarity: 'Uncommon', weight: 26 },
  { max: 40, rarity: 'Rare', weight: 22 },
  { max: 120, rarity: 'Super Rare', weight: 11 },
  { max: 300, rarity: 'Ultra Rare', weight: 5 },
  { max: Infinity, rarity: 'Secret Rare', weight: 2 },
];

function tiersToWeights(tiers) {
  return Object.fromEntries(tiers.map((t) => [t.rarity, t.weight]));
}

function rarityFromPrice(price, tiers) {
  return (tiers.find((t) => price < t.max) ?? tiers[tiers.length - 1]).rarity;
}

// ── Shopify scraping (Strictly Broken TCG) ───────────────────────────────────

const SDS_CODE_RE = /^(SDS\/[A-Z0-9]+-\d+[A-Za-z]?)/;
const SDS_SUFFIX_RE = /\s*-\s*The Seven Deadly Sins.*$/i;
const AOT_CODE_RE = /^(AOT\/[A-Z0-9]+-\d+[A-Za-z]?)/;
const AOT_SUFFIX_RE = /\s*\(Foil\)\s*$/i;

async function fetchShopify(source, codeRe, suffixRe) {
  const products = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetch(`${source}products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; note-master-tcg-pack)' },
    });
    if (!res.ok) break;
    const json = await res.json();
    if (!json.products?.length) break;
    products.push(...json.products);
  }
  const cards = [];
  for (const p of products) {
    const price = Number(p.variants?.[0]?.price) || 0;
    const title = p.title || '';
    const code = title.match(codeRe)?.[1] ?? '';
    let name = title.replace(suffixRe, '').trim();
    if (code && name.startsWith(code)) name = name.slice(code.length).replace(/^[\s:–-]+/, '');
    const img = p.images?.[0]?.src;
    if (!img || !name) continue;
    const sized = img.replace(/(\.(png|jpe?g|webp))(\?|$)/i, '_480x$1$3');
    cards.push({
      id: String(p.id),
      code,
      name,
      price,
      image: sized.startsWith('//') ? `https:${sized}` : sized,
    });
  }
  return cards;
}

async function fetchSds() {
  return fetchShopify(SDS_SOURCE, SDS_CODE_RE, SDS_SUFFIX_RE);
}

// Attack on Titan — three foil sets merged into one collection.
const AOT_SOURCES = [
  'https://www.strictlybrokentcg.ca/collections/attack-on-titan-final-season-foils/',
  'https://www.strictlybrokentcg.ca/collections/attack-on-titan-vol-1-foils/',
  'https://www.strictlybrokentcg.ca/collections/attack-on-titan-vol-2-foils/',
];

async function fetchAot() {
  const all = [];
  for (const source of AOT_SOURCES) {
    const cards = await fetchShopify(source, AOT_CODE_RE, AOT_SUFFIX_RE);
    console.log(`[aot] ${cards.length} cards from ${new URL(source).pathname.split('/').pop()}`);
    all.push(...cards);
  }
  // Dedupe by product id (a card can appear in more than one foil set page).
  const seen = new Map();
  for (const c of all) if (!seen.has(c.id)) seen.set(c.id, c);
  return [...seen.values()];
}

// ── Pokémon (pokemontcg.io v2) — curated rare pool ───────────────────────────

function pokemonPrice(card) {
  const variants = card.tcgplayer?.prices ?? {};
  let best = 0;
  for (const v of Object.values(variants)) {
    const market = Number(v?.market) || 0;
    if (market > best) best = market;
  }
  return best;
}

async function fetchPokemon() {
  const seen = new Map();
  for (const rarity of POKEMON_RARITIES) {
    for (let page = 1; page <= 12; page += 1) {
      const url =
        'https://api.pokemontcg.io/v2/cards?q=' +
        encodeURIComponent(`rarity:"${rarity}" -set.name:"Promo"`) +
        `&pageSize=250&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      for (const c of json.data ?? []) {
        if (seen.has(c.id)) continue;
        const price = pokemonPrice(c);
        if (price <= 0 || !c.images?.large || !c.name) continue;
        seen.set(c.id, {
          id: c.id,
          code: `${c.set?.ptcgoCode ?? c.set?.id ?? ''}-${c.number ?? ''}`,
          name: `${c.name} (${c.set?.series ?? ''} · ${c.set?.name ?? ''})`,
          shortName: `${c.name} · ${c.set?.name ?? ''}`,
          price,
          image: c.images.large,
        });
      }
      const total = json.totalCount ?? 0;
      if (page * 250 >= total) break;
      await new Promise((r) => setTimeout(r, 400)); // API rate limit courtesy
    }
  }
  const all = [...seen.values()].sort((a, b) => b.price - a.price);
  // Curate a price pyramid so draws land across the whole ladder (a pure
  // "top 150 chases" pool would make every pull a $150+ card). Bands mirror
  // POKEMON_TIERS; short bands borrow from the nearest neighbour.
  const bands = [
    { lo: 0, hi: 4, want: 22 },
    { lo: 4, hi: 12, want: 30 },
    { lo: 12, hi: 40, want: 40 },
    { lo: 40, hi: 120, want: 30 },
    { lo: 120, hi: 300, want: 20 },
    { lo: 300, hi: Infinity, want: 8 },
  ];
  const picked = new Map();
  const remaining = new Map(all.map((c) => [c.id, c]));
  const take = (count, filter) => {
    let taken = 0;
    for (const [id, c] of remaining) {
      if (taken >= count) break;
      if (!filter(c)) continue;
      picked.set(id, c);
      remaining.delete(id);
      taken += 1;
    }
    return taken;
  };
  for (const band of bands) {
    const got = take(band.want, (c) => c.price >= band.lo && c.price < band.hi);
    if (got < band.want) {
      // borrow the shortfall from the closest cheaper band, then any band
      const shortfall = band.want - got;
      take(shortfall, (c) => c.price < band.lo);
      take(shortfall, () => true);
    }
  }
  // Trim or top up to exactly the pool cap.
  while (picked.size > POKEMON_POOL_SIZE) {
    const keys = [...picked.keys()];
    picked.delete(keys[Math.floor(Math.random() * keys.length)]);
  }
  for (const c of remaining.values()) {
    if (picked.size >= POKEMON_POOL_SIZE) break;
    picked.set(c.id, c);
  }
  return [...picked.values()].slice(0, POKEMON_POOL_SIZE).sort((a, b) => a.price - b.price);
}

// ── Image pipeline ───────────────────────────────────────────────────────────

async function downloadImage(url, tries = 3) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

async function writeCardImage(id, imageUrl, cardsDir) {
  const file = path.join(cardsDir, `${id}.webp`);
  if (existsSync(file)) return true; // reuse already-compressed image
  const buf = await downloadImage(imageUrl);
  if (!buf) return false;
  await sharp(buf)
    .resize({ height: IMG_HEIGHT, withoutEnlargement: true, fit: 'inside' })
    .flatten({ background: '#f5f0e6' })
    .webp({ quality: 62, effort: 4 })
    .toFile(file);
  return true;
}

async function dirSize(dir) {
  let total = 0;
  if (!existsSync(dir)) return 0;
  const entries = await import('node:fs').then((fs) => fs.promises.readdir(dir));
  for (const e of entries) total += (await stat(path.join(dir, e))).size;
  return total;
}

// ── Collections config ───────────────────────────────────────────────────────

const COLLECTIONS = [
  {
    id: 'sds',
    label: 'The Seven Deadly Sins',
    source: SDS_SOURCE,
    tiers: SDS_TIERS,
    fetch: fetchSds,
  },
  {
    id: 'aot',
    label: 'Attack on Titan',
    source: AOT_SOURCES[0],
    tiers: AOT_TIERS,
    fetch: fetchAot,
  },
  {
    id: 'pokemon',
    label: 'Pokémon Rare Bundles',
    source: 'https://pokemontcg.io/',
    tiers: POKEMON_TIERS,
    fetch: fetchPokemon,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const genSets = [];
  for (const collection of COLLECTIONS) {
    const outDir = path.join(OUT_ROOT, collection.id);
    const cardsDir = path.join(outDir, 'cards');
    await mkdir(cardsDir, { recursive: true });

    console.log(`[${collection.id}] fetching inventory…`);
    const raw = await collection.fetch();
    console.log(`[${collection.id}] ${raw.length} cards`);
    if (!raw.length) throw new Error(`no cards for ${collection.id}`);

    const cards = [];
    const missing = [];
    for (const c of raw) {
      const ok = await writeCardImage(c.id, c.image, cardsDir);
      if (!ok) {
        missing.push(`${c.name} (image)`);
        continue;
      }
      cards.push({
        id: c.id,
        code: c.code ?? '',
        name: c.shortName ?? c.name,
        price: c.price,
        rarity: rarityFromPrice(c.price, collection.tiers),
        image: `/assets/tcg/${collection.id}/cards/${c.id}.webp`,
      });
    }

    const total = await dirSize(cardsDir);
    if (total > BUDGET) console.warn(`[${collection.id}] WARNING: pack is ${(total / BUDGET * 100).toFixed(0)}% of budget — consider lower quality`);

    cards.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    const manifest = {
      set: collection.label,
      collection: collection.id,
      source: collection.source,
      builtAt: new Date().toISOString(),
      tierWeights: tiersToWeights(collection.tiers),
      cards,
    };
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));

    const byRarity = {};
    for (const c of cards) byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1;
    console.log(
      `[${collection.id}] kept ${cards.length}, pack ${(total / 1024).toFixed(0)} KB, tiers: ${JSON.stringify(byRarity)}`
    );
    if (missing.length) console.log(`[${collection.id}] skipped ${missing.length}: ${missing.slice(0, 3).join(' | ')}`);

    genSets.push({ id: collection.id, label: collection.label, tiers: collection.tiers, cards });
  }

  // Shared worker module — the worker has no ASSETS binding, so the pools it
  // draws from are baked in (single source: the manifests above).
  const genLines = [
    '// GENERATED by scripts/build-tcg-packs.mjs — do not edit by hand.',
    'export interface TcgCard { id: string; code: string; name: string; price: number; rarity: string; image: string }',
    'export interface TcgTier { max: number; rarity: string; weight: number }',
    'export interface TcgSet { id: string; label: string; tiers: readonly TcgTier[]; cards: readonly TcgCard[] }',
    'export const TCG_SETS: Readonly<Record<string, TcgSet>> = {',
    ...genSets.map((s) => {
      const tiers = JSON.stringify(s.tiers);
      const cards = s.cards
        .map((c) => `    { id: '${c.id}', code: ${JSON.stringify(c.code)}, name: ${JSON.stringify(c.name)}, price: ${c.price}, rarity: '${c.rarity}', image: '${c.image}' },`)
        .join('\n');
      return `  '${s.id}': {\n    id: '${s.id}',\n    label: ${JSON.stringify(s.label)},\n    tiers: ${tiers},\n    cards: [\n${cards}\n    ],\n  },`;
    }),
    '};',
  ];
  await writeFile(path.resolve('worker/tcg-manifest.gen.ts'), genLines.join('\n') + '\n');
  console.log('worker/tcg-manifest.gen.ts written');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
