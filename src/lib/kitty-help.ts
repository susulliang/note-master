/**
 * Kitty Help — knowledge-source selection library.
 *
 * Double-clicking the cat mascot runs a persistent multi-turn conversation
 * with the default cloud LLM (DeepSeek v4 Flash):
 *
 *   Task 1 — Fill Notes: the same extraction prompt the Fill Notes button
 *            uses, applied to the live transcript (fields land in the form).
 *   Task 2 — the agent's pre-selected knowledge candidates (≤50 titles
 *            spanning matched spec sheets, FAQs, News & Updates, error
 *            codes and the SOP handbook) are listed; the model picks ≤12.
 *   Task 3 — the full content of the picked sources is appended; the model
 *            writes the final bilingual resolution with cited sources.
 *
 * LLM-cache design (DeepSeek automatic prefix caching): the run is ONE
 * append-only `messages` array — a single stable system prompt, then
 * user/assistant turns appended in order. Every HTTP call re-sends the
 * full array with identical params (model / temperature / thinking /
 * stream flags), so each turn's prefix is byte-identical to the previous
 * call and lands in the provider KV cache. Nothing is ever reordered,
 * mutated or summarized between turns.
 */

import {
  entryFromAmrTemplate,
  rankEntries,
  searchTemplates,
  type TemplateEntry,
} from '@/lib/amr-templates';
import { fetchAmrTemplates } from '@/lib/amr-db';
import { loadSopRaw } from '@/lib/sop-db';
import { extractJsonLoose } from '@/lib/llm-parser';
import { readRemoteLlmModel, requestRemoteChatCompletion } from '@/lib/llm-serving-client';
import type { FaqEntry } from '@/utils/productData';
import { loadFaqAnswer, searchLoadedFaqs } from '@/utils/faqData';
import { loadNewsIndex, type NewsItem } from '@/utils/newsData';
import { SHEET_RECORDS, findModels, getProductIndex } from '@/utils/productData';
import {
  indexSopMarkdown,
  scoreKeywordCandidates,
  tokenize,
  type SopSection,
} from '@/utils/sopIndexer';
import {
  expandRobotModelSearchQuery,
  robotModelGuidance,
} from '../../shared/model-intelligence';

/* ------------------------------------------------------------------ */
/*  Remote chat through the shared authenticated Worker serving API   */
/* ------------------------------------------------------------------ */

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Field ids the Task-1 fill-notes contract allows (mirror of llm-parser's LLM_FIELD_IDS). */
export const KITTY_FIELD_IDS = [
  'customerName',
  'contactNumber',
  'emailAddress',
  'deebotModel',
  'skuNumber',
  'serialNumber',
  'purchaseInfo',
  'issueDescription',
  'issueType',
  'resolutionSummary',
  'customerNameAddressCount',
] as const;

/**
 * Salvage a double-encoded LLM reply. The model sometimes wraps its JSON
 * object inside ONE level of stringification, which surfaces as a single
 * field whose value is the whole JSON as escaped text (the panel then shows
 * raw JSON). If any value in the parsed object is itself a JSON string
 * carrying expected keys, parse it and merge it upward.
 */
export function unwrapNestedLlmJson(
  parsed: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!parsed) return null;
  const EXPECTED = [
    'say_to_customer',
    'resolution_en',
    'resolution_zh_tldr',
    'emotional_support',
    'sources',
    'fields',
    'tldr',
  ];
  let merged: Record<string, unknown> | null = null;
  for (const value of Object.values(parsed)) {
    if (typeof value !== 'string') continue;
    const t = value.trim();
    if (!(t.startsWith('{') && t.endsWith('}'))) continue;
    try {
      const inner = JSON.parse(t) as Record<string, unknown>;
      if (inner && typeof inner === 'object' && EXPECTED.some((k) => k in inner)) {
        merged = { ...(merged ?? {}), ...inner };
      }
    } catch {
      /* not JSON after all */
    }
  }
  return merged ? { ...parsed, ...merged } : parsed;
}

/**
 * One completion over the WHOLE persistent conversation. Params are fixed
 * on purpose — varying temperature/max_tokens across turns does not break
 * prefix caching, but keeping them identical keeps behavior predictable.
 * Throws on failure so the orchestrating hook can surface the stage.
 */
export async function kittyChat(messages: ChatMsg[], maxTokens: number): Promise<string> {
  const response = await requestRemoteChatCompletion({
    model: readRemoteLlmModel(),
    messages,
    temperature: 0.2,
    maxTokens: Math.max(1, Math.min(8192, maxTokens | 0)),
  });
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? '';
}

/* ------------------------------------------------------------------ */
/*  Knowledge candidates (stage 2 preselection — ≤50 titles)           */
/* ------------------------------------------------------------------ */

export type KittyKind = 'spec' | 'faq' | 'news' | 'err' | 'sop' | 'macro' | 'tbs' | 'amr';

export interface KittyCandidate {
  /** Stable id shown to the LLM — "K01"…"K50" */
  id: string;
  kind: KittyKind;
  title: string;
  origin: string;
  /** Payload refs used by fetchKittySourceContent in stage 3. */
  template?: TemplateEntry;
  section?: SopSection;
  news?: NewsItem;
  faq?: FaqEntry;
  sheetKey?: string;
}

/* SOP loader — shared D1-first loader (see sop-db). Falls back to the
 * baked /SOP/*.md concat when the D1 pool is unavailable. */

let sopSectionsPromise: Promise<SopSection[]> | null = null;
function loadSopSections(): Promise<SopSection[]> {
  if (!sopSectionsPromise) {
    sopSectionsPromise = loadSopRaw().then((raw) => indexSopMarkdown(raw));
  }
  return sopSectionsPromise;
}

/** Score news items against the query tokens (title ×3, body ×1). */
function scoreNews(items: NewsItem[], query: string): Array<{ item: NewsItem; score: number }> {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const hits: Array<{ item: NewsItem; score: number }> = [];
  for (const item of items) {
    let score = 0;
    for (const t of new Set(qTokens)) {
      if (item.titleTokens.has(t)) score += 3;
      else if (item.bodyTokens.has(t)) score += 1;
    }
    if (score > 0) hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

/**
 * Preselect up to `max` knowledge candidate titles for stage 2. Every
 * matcher is best-effort: a failing source is skipped, never fatal.
 * Results are interleaved by kind so no single source type crowds out
 * the others before the cap.
 */
export async function collectKittyCandidates(query: string, max = 50): Promise<KittyCandidate[]> {
  const modelSearch = expandRobotModelSearchQuery(query);
  query = modelSearch.query;
  const pooled: Array<{ kind: KittyKind; title: string; origin: string; candidate: Omit<KittyCandidate, 'id' | 'kind' | 'title' | 'origin'> }> = [];

  const safe = async <T,>(p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch {
      return null;
    }
  };

  // Templates — AMR emails, TBS steps, GOAT error codes, MACRO docs.
  const templates = await safe(searchTemplates(query, 26));
  for (const t of templates ?? []) {
    if (t.kind === 'faq') continue; // real FAQs come from the FAQ index below
    pooled.push({
      kind: t.kind,
      title: t.name,
      origin: t.category,
      candidate: { template: t },
    });
  }

  // AMR email templates — the live D1 pool (Salesforce export,
  // admin-editable), ranked with the exact same fuzzy pipeline as the
  // baked pool. Same 'amr' kind: fetchKittySourceContent already strips
  // the HTML body for stage 3.
  const amrDb = await safe(fetchAmrTemplates());
  if (amrDb && amrDb.length > 0) {
    const byId = new Map(amrDb.map((t) => [t.id, t]));
    const ranked = rankEntries(
      query,
      amrDb.map(entryFromAmrTemplate),
      12,
    );
    for (const e of ranked) {
      const t = byId.get(e.id);
      if (!t) continue;
      pooled.push({
        kind: 'amr',
        title: t.name,
        origin: 'AMR Email · D1',
        candidate: { template: e },
      });
    }
  }

  // SOP handbook sections.
  const sections = await safe(loadSopSections());
  if (sections) {
    for (const hit of scoreKeywordCandidates(sections, query).slice(0, 6)) {
      pooled.push({
        kind: 'sop',
        title: hit.section.title,
        origin: 'SOP handbook',
        candidate: { section: hit.section },
      });
    }
  }

  // News & Updates (news/*.md).
  const news = await safe(loadNewsIndex());
  if (news) {
    for (const hit of scoreNews(news, query).slice(0, 10)) {
      pooled.push({
        kind: 'news',
        title: hit.item.title,
        origin: `News · ${hit.item.date}`,
        candidate: { news: hit.item },
      });
    }
  }

  // Real product FAQs.
  const faqHits = await safe(searchLoadedFaqs({ query, limit: 8 }));
  for (const hit of faqHits ?? []) {
    pooled.push({
      kind: 'faq',
      title: hit.question,
      origin: `FAQ · ${hit.model || hit.category || hit.sourceSheet || 'general'}`,
      candidate: { faq: hit },
    });
  }

  // Spec sheets — matched product models.
  const models = await safe((async () => findModels(getProductIndex(), query, 6))());
  const familySheetPrefix = {
    DEEBOT: 1,
    GOAT: 2,
    WINBOT: 4,
  } as const;
  for (const family of new Set(modelSearch.intents.map((intent) => intent.family))) {
    const sheet = SHEET_RECORDS.find((record) => record.numericPrefix === familySheetPrefix[family]);
    if (!sheet) continue;
    pooled.push({
      kind: 'spec',
      title: `${family} series reference — ${sheet.sheetKey}`,
      origin: `${family} series`,
      candidate: { sheetKey: sheet.sheetKey },
    });
  }
  for (const m of models ?? []) {
    const sheet =
      SHEET_RECORDS.find((r) => r.sheetKey === m.origin) ??
      SHEET_RECORDS.find((r) => r.raw.includes(m.name));
    pooled.push({
      kind: 'spec',
      title: sheet ? `${m.name} — ${sheet.sheetKey}` : m.name,
      origin: m.origin,
      candidate: sheet ? { sheetKey: sheet.sheetKey } : {},
    });
  }

  // Interleave by kind (round-robin) so each source type stays visible
  // under the cap, then assign stable ids.
  const byKind = new Map<KittyKind, typeof pooled>();
  for (const p of pooled) {
    const list = byKind.get(p.kind) ?? [];
    list.push(p);
    byKind.set(p.kind, list);
  }
  const interleaved: typeof pooled = [];
  let added = true;
  while (interleaved.length < max && added) {
    added = false;
    for (const list of byKind.values()) {
      const next = list.shift();
      if (next) {
        interleaved.push(next);
        added = true;
        if (interleaved.length >= max) break;
      }
    }
  }

  return interleaved.map((p, i) => ({
    ...p,
    id: `K${String(i + 1).padStart(2, '0')}`,
  }));
}

export function kittyModelGuidance(query: string): string {
  return robotModelGuidance(expandRobotModelSearchQuery(query).intents);
}

/**
 * Hardened parser for the Task-3 final-resolution reply. Order:
 *   1. direct JSON.parse of the whole reply (pure-JSON replies)
 *   2. markdown-fenced JSON (```json … ```)
 *   3. first-{ … last-} slice
 *   4. extractJsonLoose line salvage
 * then unwrapNestedLlmJson for the double-encoding case. Returns the raw
 * record — callers read keys with snake_case/camelCase aliases.
 */
export function parseResolutionReply(reply: string): Record<string, unknown> | null {
  const text = reply.trim();
  const candidates: string[] = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  let parsed: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    try {
      const j: unknown = JSON.parse(candidate);
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        parsed = j as Record<string, unknown>;
        break;
      }
    } catch {
      /* try the next candidate */
    }
  }
  if (!parsed) parsed = extractJsonLoose(text);
  return unwrapNestedLlmJson(parsed);
}

/* ------------------------------------------------------------------ */
/*  Stage 3 — full source content for the picked candidates            */
/* ------------------------------------------------------------------ */

/** Per-source char cap keeps the stage-3 prompt well under budget. */
const SOURCE_CONTENT_CAP = 6000;

function cap(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= SOURCE_CONTENT_CAP
    ? trimmed
    : `${trimmed.slice(0, SOURCE_CONTENT_CAP)}\n…[truncated]`;
}

/** Strip tags from AMR-template HTML bodies. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function fetchKittySourceContent(candidate: KittyCandidate): Promise<string> {
  const header = `${candidate.title}  [${candidate.kind.toUpperCase()} · ${candidate.origin}]`;
  try {
    if (candidate.template) {
      if (candidate.template.kind === 'amr') {
        return `${header}\n---\n${cap(htmlToText(candidate.template.raw))}`;
      }
      return `${header}\n---\n${cap(candidate.template.raw)}`;
    }
    if (candidate.section) {
      return `${header}\n---\n${cap(candidate.section.bodyLines.join('\n'))}`;
    }
    if (candidate.news) {
      return `${header}\n---\n${cap(candidate.news.bodyLines.join('\n'))}`;
    }
    if (candidate.faq) {
      const answer = await loadFaqAnswer(candidate.faq);
      return `${header}\n---\n${cap(answer || '(no answer body available)')}`;
    }
    if (candidate.sheetKey) {
      const raw = SHEET_RECORDS.find((r) => r.sheetKey === candidate.sheetKey)?.raw ?? '';
      return `${header}\n---\n${cap(raw)}`;
    }
  } catch {
    /* fall through to title-only */
  }
  return `${header}\n---\n(title only — full content unavailable)`;
}
