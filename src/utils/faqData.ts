import {
  normalizeTokens,
  parseFaqMd,
  searchFaqs as searchProductFaqs,
  type FaqEntry,
  type FaqSearchHit,
  type ProductIndex,
} from './productData';
import { fetchKbFaqDoc, fetchKbFaqIndex } from '@/lib/kb-sync';

interface FaqIndexResponse {
  version: number;
  entries: Array<Pick<
    FaqEntry,
    'id' | 'category' | 'model' | 'modelSlug' | 'lang' | 'source' | 'sourceSheet' | 'question' | 'version'
  > & {
    searchText: string;
    shard: string;
  }>;
}

interface FaqBodyShard {
  [id: string]: { answer: string };
}

let faqIndexPromise: Promise<FaqEntry[]> | null = null;
const faqShardPromises = new Map<string, Promise<FaqBodyShard>>();

function faqUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}faq-content/${path}`;
}

/** Map a D1-served FAQ index entry to the runtime FaqEntry shape.
 *  `shard: ''` marks a D1-backed entry — answers load per-doc from the KB API
 *  instead of the bundled static shards. */
function d1EntryToFaqEntry(entry: {
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
}): FaqEntry {
  const fullText = [entry.question, entry.searchText, entry.model, entry.modelSlug, entry.sourceSheet].join('\n');
  return {
    ...entry,
    title: entry.question,
    answer: '',
    tokens: normalizeTokens(`${entry.question} ${entry.model}`),
    fullText,
    shard: '',
  };
}

async function loadBundledFaqIndex(): Promise<FaqEntry[]> {
  const response = await fetch(faqUrl('index.json'));
  if (!response.ok) throw new Error(`FAQ index HTTP ${response.status}`);
  const payload = await response.json() as FaqIndexResponse;
  return payload.entries.map((entry) => {
    const fullText = [
      entry.question,
      entry.searchText,
      entry.model,
      entry.modelSlug,
      entry.sourceSheet,
    ].join('\n');
    return {
      ...entry,
      title: entry.question,
      answer: '',
      tokens: normalizeTokens(`${entry.question} ${entry.model}`),
      fullText,
    };
  });
}

export function loadFaqIndex(): Promise<FaqEntry[]> {
  if (!faqIndexPromise) {
    // D1 first line (admin-editable KB), prepackaged index.json as fallback.
    faqIndexPromise = (async () => {
      const d1Entries = await fetchKbFaqIndex();
      if (d1Entries && d1Entries.length > 0) return d1Entries.map(d1EntryToFaqEntry);
      return loadBundledFaqIndex();
    })().catch((error) => {
      faqIndexPromise = null;
      throw error;
    });
  }
  return faqIndexPromise;
}

/** Drop all cached FAQ index/doc state so the next load re-fetches from the
 *  D1 KB (called by the admin Knowledge Base editor after a save/delete). */
export function resetFaqCaches(): void {
  faqIndexPromise = null;
  faqD1DocPromises.clear();
}

function asProductIndex(faqs: FaqEntry[]): ProductIndex {
  return {
    comparisons: [],
    goatErrorCodes: [],
    scientistCodes: [],
    sellingPoints: [],
    freeText: [],
    faqs,
    allModels: [],
  };
}

export async function searchLoadedFaqs(
  params: { model?: string; query?: string; category?: string; limit?: number },
): Promise<FaqSearchHit[]> {
  const faqs = await loadFaqIndex();
  return searchProductFaqs(asProductIndex(faqs), params);
}

function loadFaqShard(shard: string): Promise<FaqBodyShard> {
  let pending = faqShardPromises.get(shard);
  if (!pending) {
    pending = fetch(faqUrl(encodeURIComponent(shard)))
      .then(async (response) => {
        if (!response.ok) throw new Error(`FAQ content HTTP ${response.status}`);
        return response.json() as Promise<FaqBodyShard>;
      })
      .catch((error) => {
        faqShardPromises.delete(shard);
        throw error;
      });
    faqShardPromises.set(shard, pending);
  }
  return pending;
}

/** Cache of D1 FAQ document bodies fetched per-id (shard === '' entries). */
const faqD1DocPromises = new Map<string, Promise<string | null>>();

function loadFaqD1Doc(id: string): Promise<string | null> {
  let pending = faqD1DocPromises.get(id);
  if (!pending) {
    pending = fetchKbFaqDoc(id);
    faqD1DocPromises.set(id, pending);
  }
  return pending;
}

export async function loadFaqAnswer(entry: FaqEntry): Promise<string> {
  const shard = entry.shard;
  // D1-backed entry (no bundled shard): stream the full markdown doc from
  // the KB API and reuse the bundled parser for question/answer extraction.
  if (!shard) {
    const doc = await loadFaqD1Doc(entry.id);
    if (doc === null) return '';
    return parseFaqMd(entry.id, doc)?.answer ?? '';
  }
  const content = await loadFaqShard(shard);
  return content[entry.id]?.answer ?? '';
}

export async function loadFaqTemplateBody(
  shard: string,
  id: string,
): Promise<string> {
  // D1-backed entries: serve the stored markdown document itself.
  if (!shard) {
    const doc = await loadFaqD1Doc(id);
    if (doc) return doc;
    const entry = (await loadFaqIndex()).find((item) => item.id === id);
    return entry ? `# ${entry.title}\n\n## Question\n\n${entry.question}\n\n## Answer\n\n` : '';
  }
  const content = await loadFaqShard(shard);
  const answer = content[id]?.answer ?? '';
  const entry = (await loadFaqIndex()).find((item) => item.id === id);
  if (!entry) return '';
  return `# ${entry.title}\n\n## Question\n\n${entry.question}\n\n## Answer\n\n${answer}`;
}
