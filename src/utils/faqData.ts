import {
  normalizeTokens,
  searchFaqs as searchProductFaqs,
  type FaqEntry,
  type FaqSearchHit,
  type ProductIndex,
} from './productData';

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

export function loadFaqIndex(): Promise<FaqEntry[]> {
  if (!faqIndexPromise) {
    faqIndexPromise = fetch(faqUrl('index.json'))
      .then(async (response) => {
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
      })
      .catch((error) => {
        faqIndexPromise = null;
        throw error;
      });
  }
  return faqIndexPromise;
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

export async function loadFaqAnswer(entry: FaqEntry): Promise<string> {
  const shard = entry.shard;
  if (!shard) return '';
  const content = await loadFaqShard(shard);
  return content[entry.id]?.answer ?? '';
}

export async function loadFaqTemplateBody(
  shard: string,
  id: string,
): Promise<string> {
  const content = await loadFaqShard(shard);
  const answer = content[id]?.answer ?? '';
  const entry = (await loadFaqIndex()).find((item) => item.id === id);
  if (!entry) return '';
  return `# ${entry.title}\n\n## Question\n\n${entry.question}\n\n## Answer\n\n${answer}`;
}
