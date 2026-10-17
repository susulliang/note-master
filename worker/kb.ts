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

const KB_KINDS = ['faq', 'product', 'gbu', 'app_update', 'firmware_update'] as const;
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
  const words = `${question}\n${answer}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = words.flatMap((word) => {
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) {
      return word.length >= 2 ? [word] : [];
    }
    const chars = Array.from(word);
    if (chars.length < 2) return chars;
    return chars.slice(0, -1).map((char, index) => char + (chars[index + 1] ?? ''));
  });
  return [...new Set(tokens)].slice(0, 40).join(' ');
}

interface FaqIndexEntry {
  id: string;
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

function parseFaqIndexEntry(id: string, markdown: string): FaqIndexEntry | null {
  const { values, body } = readFrontmatter(markdown);
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const question = mdSection(body, 'Question') || mdSection(body, '问题') || title;
  const answer = mdSection(body, 'Answer') || mdSection(body, '答案');
  if (!question) return null;
  return {
    id,
    category: String(values.category ?? 'OTHER'),
    model: String(values.model ?? ''),
    modelSlug: String(values.model_slug ?? 'general'),
    lang: String(values.lang ?? 'en').toLowerCase(),
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
    `SELECT id, body FROM kb_documents WHERE kind = 'faq' ORDER BY id`
  ).all<{ id: string; body: string }>();
  const entries: FaqIndexEntry[] = [];
  for (const row of results ?? []) {
    const entry = parseFaqIndexEntry(row.id, row.body ?? '');
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
 * ({kind}/{id}.md) — it feeds the Cloudflare AI Search (AutoRAG) "Ask"
 * instance. Single-doc writes mirror best-effort; the paginated export below
 * backfills / heals drift in bulk. */

const MD_HTTP_METADATA = { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } };

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

/** POST /api/kb/export-r2 — admin copies D1 kb_documents into the R2 bucket
 *  as {kind}/{id}.md files (one page per call, cursor-paginated so the
 *  request stays far below the subrequest limit). Body: {cursor?, limit?}.
 *  On the final page a manifest.json with per-kind counts lands in the
 *  bucket, ready for an AI Search (AutoRAG) connection to index. */
export async function handleKbExportR2(request: Request, env: Env): Promise<Response> {
  await ensureKbTables(env);
  if (!env.KB_BUCKET) return json({ error: 'R2 binding KB_BUCKET is not configured' }, 500);

  let payload: { cursor?: string; limit?: number } = {};
  try {
    payload = (await request.json()) as { cursor?: string; limit?: number };
  } catch {
    // Empty body → first page.
  }
  const limit = Math.min(Math.max(Number(payload.limit) || 40, 1), 100);

  // Cursor = "kind\u001Fid" of the last exported row (lexicographic scan).
  const SEP = '\u001F';
  const cursor = typeof payload.cursor === 'string' && payload.cursor ? payload.cursor : '';
  const [cursorKind = '', cursorId = ''] = cursor.split(SEP);
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
    await env.KB_BUCKET.put(`${row.kind}/${row.id}.md`, row.body, MD_HTTP_METADATA);
  }

  if (done) {
    const counts = await env.DB.prepare(`SELECT kind, COUNT(*) AS n FROM kb_documents GROUP BY kind`).all<{
      kind: string;
      n: number;
    }>();
    const byKind: Record<string, number> = {};
    let total = 0;
    for (const r of counts.results ?? []) {
      byKind[r.kind] = r.n;
      total += r.n;
    }
    await env.KB_BUCKET.put(
      'manifest.json',
      JSON.stringify({ exportedAt: new Date().toISOString(), total, counts: byKind }, null, 2),
      { httpMetadata: { contentType: 'application/json' } }
    );
  }

  return json({
    exported: page.length,
    done,
    nextCursor: done ? null : `${page[page.length - 1].kind}${SEP}${page[page.length - 1].id}`,
  });
}
