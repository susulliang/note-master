/**
 * build-tcg-pack.mjs — scrape the Strictly Broken TCG "The Seven Deadly Sins"
 * complete inventory (Shopify products.json), download every card image, and
 * compress the whole set into a webp pack under 10 MB total, plus a manifest
 * keyed by card id with name / price / rarity tier (price-derived).
 *
 * Output:
 *   public/assets/tcg/cards/<id>.webp
 *   public/assets/tcg/manifest.json
 *
 * Run: node scripts/build-tcg-pack.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const COLLECTION_URL =
  'https://www.strictlybrokentcg.ca/collections/the-seven-deadly-sins-complete-inventory/';
const OUT_DIR = path.resolve('public/assets/tcg');
const CARDS_DIR = path.join(OUT_DIR, 'cards');
const TOTAL_BUDGET = 10 * 1024 * 1024; // 10 MB hard cap for the whole pack
const IMG_HEIGHT = 240; // card display height in the UI

/** Price → rarity tier. The site price IS the rarity marker. */
function rarityOf(price) {
  if (price >= 15) return 'Secret Rare';
  if (price >= 10) return 'Ultra Rare';
  if (price >= 6) return 'Super Rare';
  if (price >= 3) return 'Rare';
  if (price >= 1) return 'Uncommon';
  return 'Common';
}

/** Draw weight per rarity — like opening a real booster box. */
export const TIER_WEIGHTS = {
  Common: 68,
  Uncommon: 19,
  Rare: 8,
  'Super Rare': 3.2,
  'Ultra Rare': 1.3,
  'Secret Rare': 0.5,
};

const codeRe = /^(SDS\/[A-Z0-9]+-\d+[A-Za-z]?)/;
const suffixRe = /\s*-\s*The Seven Deadly Sins.*$/i;

function parseTitle(title) {
  const codeMatch = title.match(codeRe);
  const code = codeMatch ? codeMatch[1] : '';
  let name = title.replace(suffixRe, '').trim();
  if (code && name.startsWith(code)) name = name.slice(code.length).replace(/^[\s:–-]+/, '');
  return { code, name: name || title };
}

async function fetchInventory() {
  const products = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetch(`${COLLECTION_URL}products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; note-master-tcg-pack)' },
    });
    if (!res.ok) break;
    const json = await res.json();
    if (!json.products?.length) break;
    products.push(...json.products);
  }
  return products;
}

async function downloadCardImage(url, tries = 3) {
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

async function main() {
  await mkdir(CARDS_DIR, { recursive: true });
  const products = await fetchInventory();
  console.log(`inventory: ${products.length} products`);
  if (!products.length) throw new Error('no products fetched');

  const cards = [];
  const missing = [];
  for (const p of products) {
    const price = Number(p.variants?.[0]?.price) || 0;
    const { code, name } = parseTitle(p.title || '');
    const img = p.images?.[0]?.src;
    if (!img || !name) {
      missing.push(p.title);
      continue;
    }
    // Shopify CDN supports size transforms; request a modest width to cut download size.
    const sized = img.replace(/(\.(png|jpe?g|webp))(\?|$)/i, '_480x$1$3');
    const buf = await downloadCardImage(sized.startsWith('//') ? `https:${sized}` : sized);
    if (!buf) {
      missing.push(`${p.title} (image)`);
      continue;
    }
    const id = String(p.id);
    // Normalise: max height IMG_HEIGHT, white-matte background for png alpha,
    // webp quality tuned per-card so the whole pack stays under budget.
    await sharp(buf)
      .resize({ height: IMG_HEIGHT, withoutEnlargement: true, fit: 'inside' })
      .flatten({ background: '#f5f0e6' })
      .webp({ quality: 62, effort: 4 })
      .toFile(path.join(CARDS_DIR, `${id}.webp`));
    cards.push({
      id,
      code,
      name,
      price,
      rarity: rarityOf(price),
      image: `/assets/tcg/cards/${id}.webp`,
    });
  }

  // Budget check — if over, re-encode the heaviest cards at lower quality.
  let total = 0;
  const sizes = [];
  for (const c of cards) {
    const file = path.join(CARDS_DIR, `${c.id}.webp`);
    const { size } = await import('node:fs').then((fs) => fs.promises.stat(file));
    sizes.push([c.id, size]);
    total += size;
  }
  if (total > TOTAL_BUDGET) {
    sizes.sort((a, b) => b[1] - a[1]);
    let q = 46;
    for (const [id] of sizes) {
      if (total <= TOTAL_BUDGET * 0.97 || q < 24) break;
      const file = path.join(CARDS_DIR, `${id}.webp`);
      const card = cards.find((c) => c.id === id);
      const sized = card ? null : null;
      void sized;
      const raw = await import('node:fs').then((fs) => fs.promises.readFile(file));
      await sharp(raw)
        .webp({ quality: q, effort: 4 })
        .toFile(`${file}.tmp`);
      const { size: ns } = await import('node:fs').then((fs) => fs.promises.stat(`${file}.tmp`));
      total += ns - sizes.find((s) => s[0] === id)[1];
      await import('node:fs').then((fs) => fs.promises.rename(`${file}.tmp`, file));
      sizes.find((s) => s[0] === id)[1] = ns;
      q -= 2;
    }
  }

  const manifest = {
    set: 'The Seven Deadly Sins',
    source: COLLECTION_URL,
    builtAt: new Date().toISOString(),
    tierWeights: TIER_WEIGHTS,
    cards: cards.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)),
  };
  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));

  // Generated worker module — the worker has no ASSETS binding, so the card
  // pool it draws from is baked in here (single source: the scraped manifest).
  const genLines = [
    '// GENERATED by scripts/build-tcg-pack.mjs — do not edit by hand.',
    '/** Price → rarity tier, mirroring the scraper. */',
    'function rarityOf(price: number): string {',
    "  if (price >= 15) return 'Secret Rare';",
    "  if (price >= 10) return 'Ultra Rare';",
    "  if (price >= 6) return 'Super Rare';",
    "  if (price >= 3) return 'Rare';",
    "  if (price >= 1) return 'Uncommon';",
    "  return 'Common';",
    '}',
    'export interface TcgCard { id: string; code: string; name: string; price: number; rarity: string; image: string }',
    'export const TCG_CARDS: readonly TcgCard[] = [',
    ...manifest.cards.map((c) => `  { id: '${c.id}', code: ${JSON.stringify(c.code)}, name: ${JSON.stringify(c.name)}, price: ${c.price}, rarity: '${c.rarity}', image: '${c.image}' },`),
    '];',
    'export const TCG_TIER_WEIGHTS: Readonly<Record<string, number>> = ' + JSON.stringify(TIER_WEIGHTS) + ';',
    'void rarityOf;',
  ];
  await writeFile(path.resolve('worker/tcg-manifest.gen.ts'), genLines.join('\n') + '\n');

  const kb = (total / 1024).toFixed(0);
  console.log(`cards: ${cards.length}, pack size: ${kb} KB (${(total / TOTAL_BUDGET * 100).toFixed(1)}% of budget)`);
  const byRarity = {};
  for (const c of cards) byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1;
  console.log('rarity split:', JSON.stringify(byRarity));
  if (missing.length) console.log(`skipped ${missing.length}:`, missing.slice(0, 5));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
