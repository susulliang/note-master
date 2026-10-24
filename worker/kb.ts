/**
 * Knowledge-base documents on D1 (first line) with bundled prepackaged blobs
 * as the client-side fallback.
 *
 * Datasets (kind):
 *   faq              — one row per FAQ markdown doc (products/FAQ/*.md).
 *                      The list endpoint parses each doc into a light index
 *                      entry (question / search terms), mirroring
 *                      scripts/build-faq-content.mjs; full bodies stream on
 *                      demand via /api/kb/faq/:id.
 *   product          — the numbered product reference sheets (products/*.md):
 *                      01/02/04/09 SPECS, 03 Error Codes, 05 Scientist,
 *                      08 Pitch, 06/07 free-text reference, 10..58 GBU.
 *   gbu              — the GBU barcode map (internal code → marketing name),
 *                      stored as one GFM markdown table row.
 *   app_update       — ECOVACS HOME app release-notes markdown (per file).
 *   firmware_update  — firmware OTA history markdown (per file).
 *
 * Admins can create/edit/delete documents; deletes are tombstoned in
 * kb_deletions so clients can hide the matching prepackaged blob.
 */

const KB_KINDS = ['faq', 'product', 'gbu', 'app_update', 'firmware_update', 'app_photo'] as const;
export type KbKind = (typeof KB_KINDS)[number];

export function isKbKind(value: string): value is KbKind {
  return (KB_KINDS as readonly string[]).includes(value);
}

const CORS_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

export async function ensureKbTables(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS kb_documents (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (kind, id)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS kb_deletions (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (kind, id)
    )`
  ).run();
}

/* --------------------------- FAQ index parsing ---------------------------- */
/* Ported from scripts/build-faq-content.mjs so the served index matches the
 * prepackaged public/faq-content/index.json shape exactly. */

function readFrontmatter(markdown: string): { values: Record<string, string>; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const values: Record<string, string> = {};
  if (!match) return { values, body: markdown };
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    try {
      values[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
    } catch {
      values[key] = raw.replace(/^['"]|['"]$/g, '');
    }
  }
  return { values, body: markdown.slice(match[0].length) };
}

function mdSection(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s*${heading}\\s*$`, 'i').test(line.trim()));
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function compactSearchTerms(question: string, answer: string): string {
  const words: string[] = `${question}\n${answer}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = words.flatMap((word) => {
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) {
      return word.length >= 2 ? [word] : [];
    }
    const chars: string[] = Array.from(word);
    if (chars.length < 2) return chars;
    return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1] ?? ''}`);
  });
  return [...new Set(tokens)].slice(0, 40).join(' ');
}

interface FaqIndexEntry {
  id: string;
  title: string;
  category: string;
  model: string;
  modelSlug: string;
  lang: string;
  source: string;
  sourceSheet: string;
  question: string;
  searchText: string;
  version: number;
  shard: string;
}

function parseFaqIndexEntry(id: string, storedTitle: string, markdown: string): FaqIndexEntry | null {
  const { values, body } = readFrontmatter(markdown);
  if (values.kind !== 'faq') return null;
  const rawLanguage = String(values.lang ?? 'en').toLowerCase();
  const lang = rawLanguage === 'zh' || rawLanguage.startsWith('zh-')
    ? 'zh'
    : rawLanguage === 'en' || rawLanguage.startsWith('en-')
      ? 'en'
      : '';
  if (!lang) return null;
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const question = mdSection(body, 'Question') || mdSection(body, '问题') || title;
  const answer = mdSection(body, 'Answer') || mdSection(body, '答案');
  if (!question || !answer) return null;
  const category = String(values.category ?? 'OTHER');
  const model = String(values.model ?? '');
  return {
    id,
    title: storedTitle.trim()
      || `${category} / ${model || 'General'} / ${lang.toUpperCase()} - ${question.replace(/\s+/g, ' ')}`,
    category,
    model,
    modelSlug: String(values.model_slug ?? 'general'),
    lang,
    source: String(values.source ?? ''),
    sourceSheet: String(values.source_sheet ?? ''),
    question,
    searchText: compactSearchTerms(question, answer),
    version: Number.parseFloat(values.version) || 1,
    shard: '',
  };
}

/* ------------------------- FAQ index edge cache --------------------------- */

let faqIndexCache: { stamp: string; payload: string } | null = null;

async function faqIndexStamp(env: Env): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS latest FROM kb_documents WHERE kind = 'faq'`
  ).first<{ n: number; latest: string }>();
  return `${row?.n ?? 0}:${row?.latest ?? ''}`;
}

async function buildFaqIndexPayload(env: Env): Promise<string> {
  const { results } = await env.DB.prepare(
    `SELECT id, title, body FROM kb_documents WHERE kind = 'faq' ORDER BY id`
  ).all<{ id: string; title: string; body: string }>();
  const entries: FaqIndexEntry[] = [];
  for (const row of results ?? []) {
    const entry = parseFaqIndexEntry(row.id, row.title ?? '', row.body ?? '');
    if (entry) entries.push(entry);
  }
  entries.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.modelSlug.localeCompare(b.modelSlug) ||
      a.lang.localeCompare(b.lang) ||
      a.question.localeCompare(b.question)
  );
  return JSON.stringify({ kind: 'faq', version: 2, entries });
}

/* ------------------------------ slug helper ------------------------------- */

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

const DOC_ID_RE = /^[\p{Letter}\p{Number}][\p{Letter}\p{Number}._\- ()·]{0,180}$/u;

async function nextProductSheetId(env: Env, base: string): Promise<string> {
  const stem = slugify(base, 'new-sheet');
  // Scan all product ids and take the max numeric prefix so new sheets land
  // in the GBU-style comparison branch (prefix >= 10).
  const { results } = await env.DB.prepare(`SELECT id FROM kb_documents WHERE kind = 'product'`).all<{ id: string }>();
  let maxPrefix = 58;
  for (const r of results ?? []) {
    const m = r.id.match(/^(\d{1,2})[_\-]/);
    if (m) maxPrefix = Math.max(maxPrefix, parseInt(m[1], 10));
  }
  const prefix = String(Math.min(maxPrefix + 1, 99)).padStart(2, '0');
  return `${prefix}_${stem}`;
}

/* -------------------------------- handlers -------------------------------- */

/** GET /api/kb/:kind — any logged-in user. */
export async function handleKbList(request: Request, env: Env, kind: KbKind): Promise<Response> {
  await ensureKbTables(env);
  if (kind === 'faq') {
    const stamp = await faqIndexStamp(env);
    if (!faqIndexCache || faqIndexCache.stamp !== stamp) {
      faqIndexCache = { stamp, payload: await buildFaqIndexPayload(env) };
    }
    return new Response(faqIndexCache.payload, { headers: CORS_HEADERS });
  }
  const [docs, deletions] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, body, updated_by AS updatedBy, updated_at AS updatedAt
       FROM kb_documents WHERE kind = ?1 ORDER BY id`
    )
      .bind(kind)
      .all<{ id: string; title: string; body: string; updatedBy: string; updatedAt: string }>(),
    env.DB.prepare(`SELECT id FROM kb_deletions WHERE kind = ?1`).bind(kind).all<{ id: string }>(),
  ]);
  return json({
    kind,
    docs: docs.results ?? [],
    deleted: (deletions.results ?? []).map((r) => r.id),
  });
}

/** GET /api/kb/:kind/:id — full body of one non-FAQ document (e.g. the
 *  app-photos index.json stored under kind 'app_photo', id 'index'). */
export async function handleKbGet(request: Request, env: Env, kind: KbKind, id: string): Promise<Response> {
  await ensureKbTables(env);
  const row = await env.DB.prepare(
    `SELECT kind, id, title, body, updated_by AS updatedBy, updated_at AS updatedAt
     FROM kb_documents WHERE kind = ?1 AND id = ?2`
  )
    .bind(kind, id)
    .first<{
      kind: string;
      id: string;
      title: string;
      body: string;
      updatedBy: string;
      updatedAt: string;
    }>();
  if (!row) return json({ error: 'Document not found' }, 404);
  return json(row);
}

/** GET /api/kb/faq/:id — full markdown body of one FAQ doc (lazy answers). */
export async function handleKbFaqDoc(request: Request, env: Env, id: string): Promise<Response> {
  await ensureKbTables(env);
  const row = await env.DB.prepare(
    `SELECT id, body, updated_by AS updatedBy, updated_at AS updatedAt FROM kb_documents WHERE kind = 'faq' AND id = ?1`
  )
    .bind(id)
    .first<{ id: string; body: string; updatedBy: string; updatedAt: string }>();
  if (!row) return json({ error: 'FAQ document not found' }, 404);
  return json({ id: row.id, body: row.body, updatedBy: row.updatedBy, updatedAt: row.updatedAt });
}

export interface KbWritePayload {
  id?: string;
  title?: string;
  body?: string;
}

function validateKbWrite(payload: KbWritePayload): Response | null {
  const body = String(payload.body ?? '');
  if (!body.trim()) return json({ error: 'Body is required' }, 400);
  if (body.length > 1_500_000) return json({ error: 'Body too large (1.5 MB max)' }, 400);
  const title = String(payload.title ?? '');
  if (title.length > 300) return json({ error: 'Title too long' }, 400);
  return null;
}

/** POST /api/kb/:kind — admin creates a new document. */
export async function handleKbCreate(request: Request, env: Env, kind: KbKind, username: string): Promise<Response> {
  await ensureKbTables(env);
  let payload: KbWritePayload;
  try {
    payload = (await request.json()) as KbWritePayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const invalid = validateKbWrite(payload);
  if (invalid) return invalid;

  let id = String(payload.id ?? '').trim();
  if (kind === 'product') {
    // Product sheets keep the numeric-prefix stem so the client parsers slot
    // them in (prefix >= 10 = GBU-style comparison sheet).
    if (id && !/^\d{1,2}[_\-]/.test(id)) return json({ error: 'Product sheet id must start with "NN_" or "NN-"' }, 400);
    if (!id) id = await nextProductSheetId(env, String(payload.title ?? 'new-sheet'));
  } else if (!id) {
    id = slugify(String(payload.title ?? ''), 'new-doc');
  }
  if (!DOC_ID_RE.test(id)) return json({ error: 'Invalid document id' }, 400);

  const existing = await env.DB.prepare(`SELECT 1 AS x FROM kb_documents WHERE kind = ?1 AND id = ?2`)
    .bind(kind, id)
    .first();
  if (existing) return json({ error: 'Document id already exists' }, 409);

  await env.DB.prepare(`DELETE FROM kb_deletions WHERE kind = ?1 AND id = ?2`).bind(kind, id).run();
  await env.DB.prepare(
    `INSERT INTO kb_documents (kind, id, title, body, updated_by, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
  )
    .bind(kind, id, String(payload.title ?? '').trim(), String(payload.body ?? ''), username)
    .run();
  void mirrorDocToR2(env, kind, id, String(payload.body ?? ''));
  return json({ ok: true, kind, id });
}

/** PUT /api/kb/:kind/:id — admin upserts title/body. */
export async function handleKbPut(request: Request, env: Env, kind: KbKind, id: string, username: string): Promise<Response> {
  await ensureKbTables(env);
  let payload: KbWritePayload;
  try {
    payload = (await request.json()) as KbWritePayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const invalid = validateKbWrite(payload);
  if (invalid) return invalid;
  if (!DOC_ID_RE.test(id)) return json({ error: 'Invalid document id' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO kb_documents (kind, id, title, body, updated_by, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
     ON CONFLICT(kind, id) DO UPDATE SET title = ?3, body = ?4, updated_by = ?5, updated_at = datetime('now')`
  )
    .bind(kind, id, String(payload.title ?? '').trim(), String(payload.body ?? ''), username)
    .run();
  if (!result.success) return json({ error: 'Failed to save document' }, 500);
  await env.DB.prepare(`DELETE FROM kb_deletions WHERE kind = ?1 AND id = ?2`).bind(kind, id).run();
  void mirrorDocToR2(env, kind, id, String(payload.body ?? ''));
  return json({ ok: true, kind, id });
}

/** DELETE /api/kb/:kind/:id — admin deletes (tombstoned so bundled fallback
 *  copies of the same document are hidden on clients). */
export async function handleKbDelete(request: Request, env: Env, kind: KbKind, id: string): Promise<Response> {
  await ensureKbTables(env);
  if (!DOC_ID_RE.test(id)) return json({ error: 'Invalid document id' }, 400);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM kb_documents WHERE kind = ?1 AND id = ?2`).bind(kind, id),
    env.DB.prepare(
      `INSERT INTO kb_deletions (kind, id) VALUES (?1, ?2) ON CONFLICT(kind, id) DO NOTHING`
    ).bind(kind, id),
  ]);
  void removeDocFromR2(env, kind, id);
  return json({ ok: true, kind, id });
}

/* ------------------------------ R2 mirror --------------------------------- */
/* The eco-kb R2 bucket holds one markdown object per kb_documents row
 * ({kind}/{id}.md) — it feeds the Cloudflare AI Search "Ask" instance.
 * Single-document writes mirror best-effort; the paginated export below
 * backfills and heals drift in bulk. */

const MD_HTTP_METADATA = { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } };

interface NewsR2Entry {
  id: string;
  date: string;
  title: string;
  author: string;
  body: string;
  updatedAt?: number;
}

type NewsExportRow = NewsR2Entry;

function newsMarkdown(entry: NewsR2Entry): string {
  return [
    `# ${entry.title || entry.id}`,
    '',
    `- Date: ${entry.date}`,
    `- Author: ${entry.author || 'Unknown'}`,
    `- Entry ID: ${entry.id}`,
    `- Updated: ${entry.updatedAt ? new Date(entry.updatedAt).toISOString() : 'unknown'}`,
    '',
    entry.body.replace(/\r\n/g, '\n').trimStart(),
    '',
  ].join('\n');
}

/** Mirror an edited News & Updates entry into the AI Search source bucket. */
export async function mirrorNewsEntryToR2(env: Env, entry: NewsR2Entry): Promise<boolean> {
  try {
    if (!env.KB_BUCKET) return false;
    await env.KB_BUCKET.put(`news/${entry.id}.md`, newsMarkdown(entry), MD_HTTP_METADATA);
    return true;
  } catch {
    return false;
  }
}

/** Remove the indexed article when an admin deletes it from D1. */
export async function removeNewsEntryFromR2(env: Env, id: string): Promise<boolean> {
  try {
    if (!env.KB_BUCKET) return false;
    await env.KB_BUCKET.delete(`news/${id}.md`);
    return true;
  } catch {
    return false;
  }
}

async function mirrorDocToR2(env: Env, kind: string, id: string, body: string): Promise<void> {
  try {
    await env.KB_BUCKET?.put(`${kind}/${id}.md`, body, MD_HTTP_METADATA);
  } catch {
    // R2 hiccup must never fail the D1 write path — bulk re-sync heals drift.
  }
}

async function removeDocFromR2(env: Env, kind: string, id: string): Promise<void> {
  try {
    await env.KB_BUCKET?.delete(`${kind}/${id}.md`);
  } catch {
    // Same: healed by the next bulk export.
  }
}

interface ExportRow {
  kind: string;
  id: string;
  title: string;
  body: string;
}

/** POST /api/kb/export-r2 — admin copies knowledge sources into the R2 bucket
 *  as {kind}/{id}.md files (one page per call, cursor-paginated so the
 *  request stays far below the subrequest limit). Body: {source?, cursor?,
 *  limit?} — sources run in order: 'documents' (kb_documents), 'photos'
 *  (app-photo binaries from the ASSETS binding), 'sop' (sop_entries) and
 *  'amr' (amr_templates), 'news' (news_entries) and 'news_assets' (images
 *  referenced by News articles). */
export async function handleKbExportR2(request: Request, env: Env): Promise<Response> {
  await ensureKbTables(env);
  if (!env.KB_BUCKET) return json({ error: 'R2 binding KB_BUCKET is not configured' }, 500);

  let payload: { source?: string; cursor?: string; limit?: number; pruneFaq?: boolean } = {};
  try {
    payload = (await request.json()) as { source?: string; cursor?: string; limit?: number };
  } catch {
    // Empty body → first documents page.
  }
  const limit = Math.min(Math.max(Number(payload.limit) || 40, 1), 100);
  // Segmented export: the client syncs one chunk at a time (per KB kind for
  // kb_documents rows, plus the photo binaries, SOP and AMR tables).
  const SOURCES = [
    'documents',
    ...KB_KINDS,
    'photos',
    'sop',
    'amr',
    'news',
    'news_assets',
  ] as const;
  const source = (SOURCES as readonly string[]).includes(payload.source ?? '')
    ? (payload.source as (typeof SOURCES)[number])
    : 'documents';
  const cursor = typeof payload.cursor === 'string' && payload.cursor ? payload.cursor : '';

  let result: { exported: number; total: number | null; done: boolean; nextCursor: string | null };
  if (source === 'photos') {
    result = await exportPhotosPage(env, limit, cursor);
  } else if (source === 'news_assets') {
    result = await exportNewsAssetsPage(env, limit, cursor);
  } else if (source === 'news') {
    result = await exportNewsPage(env, limit, cursor);
  } else if (source === 'sop') {
    result = await exportSopPage(env, limit, cursor);
  } else if (source === 'amr') {
    result = await exportAmrPage(env, limit, cursor);
  } else if (source === 'documents') {
    result = await exportDocumentsPage(env, limit, cursor);
  } else {
    result = await exportKindPage(env, source, limit, cursor);
  }

  let pruned = 0;
  if (result.done && source === 'faq' && payload.pruneFaq === true) {
    pruned = await pruneFaqR2Objects(env);
  }
  if (result.done) await writeManifest(env);
  return json({ ...result, ...(source === 'faq' && payload.pruneFaq === true ? { pruned } : {}) });
}

async function pruneFaqR2Objects(env: Env): Promise<number> {
  const [faqRows, firstPage] = await Promise.all([
    env.DB.prepare(`SELECT id FROM kb_documents WHERE kind = 'faq'`).all<{ id: string }>(),
    env.KB_BUCKET!.list({ prefix: 'faq/', limit: 1000 }),
  ]);
  const currentKeys = new Set((faqRows.results ?? []).map((row) => `faq/${row.id}.md`));
  let page = firstPage;
  let deleted = 0;
  while (true) {
    const staleKeys = page.objects
      .map((object) => object.key)
      .filter((key) => !currentKeys.has(key));
    if (staleKeys.length) {
      await env.KB_BUCKET!.delete(staleKeys);
      deleted += staleKeys.length;
    }
    if (!page.truncated || !page.cursor) break;
    page = await env.KB_BUCKET!.list({ prefix: 'faq/', limit: 1000, cursor: page.cursor });
  }
  return deleted;
}

/** Per-kind 'documents' phase — kb_documents rows of ONE kind
 *  (cursor = last id within the kind). */
async function exportKindPage(env: Env, kind: KbKind, limit: number, cursor: string) {
  const countPromise = env.DB.prepare(`SELECT COUNT(*) AS n FROM kb_documents WHERE kind = ?1`)
    .bind(kind)
    .first<{ n: number }>();
  const rows = cursor
    ? (
        await env.DB.prepare(
          `SELECT kind, id, title, body FROM kb_documents
           WHERE kind = ?1 AND id > ?2
           ORDER BY id LIMIT ?3`
        )
          .bind(kind, cursor, limit + 1)
          .all<ExportRow>()
      ).results ?? []
    : (
        await env.DB.prepare(`SELECT kind, id, title, body FROM kb_documents WHERE kind = ?1 ORDER BY id LIMIT ?2`)
          .bind(kind, limit + 1)
          .all<ExportRow>()
      ).results ?? [];

  const done = rows.length <= limit;
  const page = rows.slice(0, limit);
  for (const row of page) {
    await env.KB_BUCKET!.put(`${row.kind}/${row.id}.md`, row.body, MD_HTTP_METADATA);
  }
  return {
    exported: page.length,
    total: (await countPromise)?.n ?? null,
    done,
    nextCursor: done ? null : page[page.length - 1].id,
  };
}

/** 'documents' phase — every kb_documents row (cursor = "kind\u001Fid"). */
async function exportDocumentsPage(env: Env, limit: number, cursor: string) {
  const SEP = '\u001F';
  const [cursorKind = '', cursorId = ''] = cursor.split(SEP);
  const countPromise = env.DB.prepare(`SELECT COUNT(*) AS n FROM kb_documents`).first<{ n: number }>();
  const rows = cursorKind
    ? (
        await env.DB.prepare(
          `SELECT kind, id, title, body FROM kb_documents
           WHERE kind > ?1 OR (kind = ?1 AND id > ?2)
           ORDER BY kind, id LIMIT ?3`
        )
          .bind(cursorKind, cursorId, limit + 1)
          .all<ExportRow>()
      ).results ?? []
    : (await env.DB.prepare(`SELECT kind, id, title, body FROM kb_documents ORDER BY kind, id LIMIT ?1`).bind(limit + 1).all<ExportRow>())
        .results ?? [];

  const done = rows.length <= limit;
  const page = rows.slice(0, limit);
  for (const row of page) {
    await env.KB_BUCKET!.put(`${row.kind}/${row.id}.md`, row.body, MD_HTTP_METADATA);
  }
  return {
    exported: page.length,
    total: (await countPromise)?.n ?? null,
    done,
    nextCursor: done ? null : `${page[page.length - 1].kind}${SEP}${page[page.length - 1].id}`,
  };
}

async function ensureNewsR2Table(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS news_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
}

/** 'news' phase — every full News & Updates article from D1. */
async function exportNewsPage(env: Env, limit: number, cursor: string) {
  await ensureNewsR2Table(env);
  const countPromise = env.DB.prepare(`SELECT COUNT(*) AS n FROM news_entries`).first<{ n: number }>();
  const rows = cursor
    ? (
        await env.DB.prepare(
          `SELECT id, date, title, author, body, updated_at AS updatedAt FROM news_entries
           WHERE id > ?1 ORDER BY id LIMIT ?2`
        )
          .bind(cursor, limit + 1)
          .all<NewsExportRow>()
      ).results ?? []
    : (
        await env.DB.prepare(
          `SELECT id, date, title, author, body, updated_at AS updatedAt FROM news_entries
           ORDER BY id LIMIT ?1`
        )
          .bind(limit + 1)
          .all<NewsExportRow>()
      ).results ?? [];

  const done = rows.length <= limit;
  const page = rows.slice(0, limit);
  for (const row of page) {
    await env.KB_BUCKET!.put(`news/${row.id}.md`, newsMarkdown(row), MD_HTTP_METADATA);
  }
  return {
    exported: page.length,
    total: (await countPromise)?.n ?? null,
    done,
    nextCursor: done ? null : page[page.length - 1].id,
  };
}

/** All image files linked from News markdown, sorted for cursor pagination. */
async function loadNewsAssetPaths(env: Env): Promise<string[]> {
  await ensureNewsR2Table(env);
  const rows = await env.DB.prepare(`SELECT body FROM news_entries ORDER BY id`).all<{ body: string }>();
  const paths = new Set<string>();
  const imagePattern = /!\[[^\]]*\]\((?:\.\/)?assets\/([^)\s]+)\)/g;
  for (const row of rows.results ?? []) {
    for (const match of row.body.matchAll(imagePattern)) {
      const filename = match[1]?.split(/[?#]/, 1)[0] ?? '';
      if (/^[\p{L}\p{N}._-]+$/u.test(filename)) paths.add(filename);
    }
  }
  return [...paths].sort();
}

/** 'news_assets' phase — copy every referenced News image from static assets. */
async function exportNewsAssetsPage(env: Env, limit: number, cursor: string) {
  const paths = await loadNewsAssetPaths(env);
  const start = Math.max(0, Number(cursor) || 0);
  const end = Math.min(start + limit, paths.length);
  let exported = 0;
  for (const filename of paths.slice(start, end)) {
    const assetPath = `/news/assets/${encodeURIComponent(filename)}`;
    const response = await env.ASSETS!.fetch(new Request(`https://assets.local${assetPath}`));
    if (!response.ok) continue;
    const bytes = await response.arrayBuffer();
    const type = response.headers.get('content-type') ?? 'application/octet-stream';
    await env.KB_BUCKET!.put(`news/assets/${filename}`, bytes, {
      httpMetadata: { contentType: type },
    });
    exported += 1;
  }
  return {
    exported,
    total: paths.length,
    done: end >= paths.length,
    nextCursor: end >= paths.length ? null : String(end),
  };
}

/** Photo paths from the app-photos index (D1 doc, bundled asset fallback). */
async function loadPhotoPaths(env: Env): Promise<string[]> {
  const row = await env.DB.prepare(`SELECT body FROM kb_documents WHERE kind = 'app_photo' AND id = 'index'`).first<{
    body: string;
  }>();
  let raw = row?.body ?? null;
  if (!raw) {
    try {
      const res = await env.ASSETS?.fetch(new Request('https://assets.local/app-photos/index.json'));
      raw = res && res.ok ? await res.text() : null;
    } catch {
      raw = null;
    }
  }
  if (!raw) return [];
  try {
    const index = JSON.parse(raw) as { models: Record<string, Array<{ photos?: Array<{ path: string }> }>> };
    const paths = new Set<string>();
    for (const models of Object.values(index.models ?? {})) {
      for (const model of models ?? []) {
        for (const photo of model.photos ?? []) if (photo.path) paths.add(photo.path);
      }
    }
    return [...paths];
  } catch {
    return [];
  }
}

/** 'photos' phase — copy each app-photo binary from the ASSETS binding into
 *  the bucket under app_photo/app-photos/... (cursor = numeric offset). */
async function exportPhotosPage(env: Env, limit: number, cursor: string) {
  const paths = await loadPhotoPaths(env);
  const start = Number(cursor) || 0;
  const end = Math.min(start + limit, paths.length);
  let exported = 0;
  for (const path of paths.slice(start, end)) {
    try {
      const res = await env.ASSETS!.fetch(new Request(`https://assets.local${path}`));
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const type =
        ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';
      await env.KB_BUCKET!.put(`app_photo${path}`, bytes, { httpMetadata: { contentType: type } });
      exported++;
    } catch {
      // Missing asset — skip; the photo index still ships via 'documents'.
    }
  }
  const done = end >= paths.length;
  return { exported, total: paths.length, done, nextCursor: done ? null : String(end) };
}

interface TableExportRow {
  id: string;
}

/** Shared OFFSET-paged scan for the sop/amr live tables (cursor = offset). */
async function exportTablePage<T extends TableExportRow>(
  env: Env,
  limit: number,
  cursor: string,
  baseSql: string,
  countSql: string,
  toBody: (row: T) => string,
  prefix: string
) {
  const offset = Number(cursor) || 0;
  const countPromise = env.DB.prepare(countSql).first<{ n: number }>();
  const rows = (
    await env.DB.prepare(`${baseSql} LIMIT ?1 OFFSET ?2`).bind(limit + 1, offset).all<T>()
  ).results ?? [];
  const done = rows.length <= limit;
  const page = rows.slice(0, limit);
  for (const row of page) {
    await env.KB_BUCKET!.put(`${prefix}/${row.id}.md`, toBody(row), MD_HTTP_METADATA);
  }
  return {
    exported: page.length,
    total: (await countPromise)?.n ?? null,
    done,
    nextCursor: done ? null : String(offset + page.length),
  };
}

/** 'sop' phase — sop_entries as markdown sections ({sop}/{id}.md). */
function exportSopPage(env: Env, limit: number, cursor: string) {
  return exportTablePage<{ id: string; level: number; title: string; body: string }>(
    env,
    limit,
    cursor,
    `SELECT id, level, title, body FROM sop_entries ORDER BY sort_order`,
    `SELECT COUNT(*) AS n FROM sop_entries`,
    (row) => `${'#'.repeat(Math.max(1, row.level))} ${row.title}\n\n${row.body}`,
    'sop'
  );
}

/** 'amr' phase — amr_templates as metadata + HTML ({amr}/{id}.md). */
function exportAmrPage(env: Env, limit: number, cursor: string) {
  return exportTablePage<{
    id: string;
    name: string;
    folder: string;
    subject: string;
    description: string;
    html: string;
  }>(
    env,
    limit,
    cursor,
    `SELECT id, name, folder, subject, description, html FROM amr_templates ORDER BY id`,
    `SELECT COUNT(*) AS n FROM amr_templates`,
    (row) =>
      `# ${row.name}\n\n- Folder: ${row.folder}\n- Subject: ${row.subject}\n- Description: ${row.description}\n\n${row.html}`,
    'amr'
  );
}

/** Completed export phase → manifest.json with counts for every source. */
async function writeManifest(env: Env) {
  await ensureNewsR2Table(env);
  const [byKind, sop, amr, news, photoIndex, newsAssets] = await Promise.all([
    env.DB.prepare(`SELECT kind, COUNT(*) AS n FROM kb_documents GROUP BY kind`).all<{ kind: string; n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM sop_entries`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM amr_templates`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM news_entries`).first<{ n: number }>(),
    loadPhotoPaths(env),
    loadNewsAssetPaths(env),
  ]);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of byKind.results ?? []) {
    counts[r.kind] = r.n;
    total += r.n;
  }
  counts.sop_sections = sop?.n ?? 0;
  counts.amr_templates = amr?.n ?? 0;
  counts.news_updates = news?.n ?? 0;
  counts.app_photos = photoIndex.length;
  counts.news_assets = newsAssets.length;
  await env.KB_BUCKET!.put(
    'manifest.json',
    JSON.stringify({ exportedAt: new Date().toISOString(), documents: total, counts }, null, 2),
    { httpMetadata: { contentType: 'application/json' } }
  );
}
