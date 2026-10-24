import { fetchAmrTemplates } from '@/lib/amr-db';
import { fetchKbDoc, fetchKbFaqDoc, type KbKind } from '@/lib/kb-sync';
import { fetchNewsEntries } from '@/lib/news-db';
import { fetchSopEntries } from '@/lib/sop-db';

export interface SupportEvidence {
  id: string;
  title: string;
  excerpt: string;
}

const evidenceBodyCache = new Map<string, Promise<string>>();
const KB_KIND_SET = new Set<KbKind>([
  'product',
  'gbu',
  'app_update',
  'firmware_update',
  'app_photo',
]);

export function evidenceFromSourceNames(sources: string[]): SupportEvidence[] {
  return sources.map((source, index) => {
    const match = source.match(/^\[(\d+)\]\s*(.*)$/);
    return {
      id: match ? `[${match[1]}]` : `[${index + 1}]`,
      title: match?.[2]?.trim() || source.trim(),
      excerpt: '',
    };
  }).filter((source) => source.title.length > 0);
}

async function loadSourceBody(title: string): Promise<string> {
  const [kind, ...idParts] = title.replace(/\.md$/i, '').split('/');
  const id = idParts.join('/');
  if (!id) return '';

  if (kind === 'faq') return (await fetchKbFaqDoc(id)) ?? '';
  if (KB_KIND_SET.has(kind as KbKind)) return (await fetchKbDoc(kind as KbKind, id))?.body ?? '';
  if (kind === 'news') {
    const entry = (await fetchNewsEntries()).find((item) => item.id === id);
    return entry ? `# ${entry.title}\n\n${entry.body}` : '';
  }
  if (kind === 'sop') {
    const entry = (await fetchSopEntries()).find((item) => item.id === id);
    return entry ? `${'#'.repeat(Math.max(1, entry.level))} ${entry.title}\n\n${entry.body}` : '';
  }
  if (kind === 'amr') {
    const entry = (await fetchAmrTemplates()).find((item) => item.id === id);
    if (!entry) return '';
    const body = new DOMParser().parseFromString(entry.html, 'text/html').body.textContent ?? '';
    return [`# ${entry.name}`, entry.subject && `Subject: ${entry.subject}`, entry.description, body]
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

export async function hydrateSupportEvidence(
  sources: SupportEvidence[],
): Promise<SupportEvidence[]> {
  return Promise.all(sources.map(async (source) => {
    if (source.excerpt.trim()) return source;

    let pending = evidenceBodyCache.get(source.title);
    if (!pending) {
      pending = loadSourceBody(source.title).catch(() => '');
      evidenceBodyCache.set(source.title, pending);
    }
    const body = await pending;
    return {
      ...source,
      excerpt: body.trim().slice(0, 1_200),
    };
  }));
}
