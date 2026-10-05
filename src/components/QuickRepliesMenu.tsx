import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Quick Responses — a hover-to-expand menu on the bottom call bar. Shows
 * agent-facing email reply templates (HTML files under quick_reply/),
 * grouped by intent, with click-to-copy. Hovering a template for 1s pops a
 * centered, styled HTML preview that auto-dismisses after 3s.
 */

export interface QuickReply {
  id: string;
  /** Derived from the filename (e.g. "04_must_return_deebot.html" → "Must Return Deebot"). */
  title: string;
  /** Plain-text excerpt (first 2 lines, HTML stripped) for the card subtitle. */
  excerpt: string;
  /** Raw HTML body — pasted verbatim into Salesforce's rich-text email editor. */
  html: string;
  /** Intent group derived from the filename, used to smart-group the list. */
  group: string;
}

export interface QuickReplyHit {
  item: QuickReply;
  score: number;
}

const qrLoaders = import.meta.glob('/quick_reply/*.html', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

function htmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function titleFromKey(key: string): string {
  const base = key.split('/').pop()?.replace(/^\d+_/, '').replace(/\.html$/, '') ?? 'Template';
  return base.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Smart grouping from the filename: first matching keyword wins. */
const GROUP_RULES: Array<{ match: RegExp; label: string }> = [
  { match: /closing[_ ]ticket/, label: 'Closing Ticket' },
  { match: /must[_ ]return/, label: 'Must Return' },
  { match: /collect[_ ]info/, label: 'Collect Info' },
  { match: /1st[_ ]response/, label: 'First Response' },
  { match: /no[_ ]need[_ ]to[_ ]return/, label: 'No Return Needed' },
];

function groupOf(id: string): string {
  const lower = id.toLowerCase();
  for (const rule of GROUP_RULES) if (rule.match.test(lower)) return rule.label;
  return 'Other';
}

let qrPromise: Promise<QuickReply[]> | null = null;
export function loadQuickReplies(): Promise<QuickReply[]> {
  if (!qrPromise) {
    qrPromise = (async () => {
      const entries = await Promise.all(
        Object.entries(qrLoaders).map(async ([key, load]) => [key, await load()] as const)
      );
      return entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, html]) => {
          const text = htmlToText(html).trim();
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          const excerpt = lines.slice(0, 2).join('  ').slice(0, 110);
          return {
            id: key.split('/').pop()?.replace(/\.html$/, '') ?? key,
            title: titleFromKey(key),
            excerpt,
            html,
            group: groupOf(key),
          };
        });
    })();
  }
  return qrPromise;
}

export function searchQuickReplies(index: QuickReply[], query: string, limit = 8): QuickReplyHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.slice(0, limit).map((item) => ({ item, score: 0 }));
  const hits = index
    .map((item) => {
      const hay = `${item.title} ${item.excerpt} ${item.group} ${htmlToText(item.html)}`.toLowerCase();
      return { item, score: hay.includes(q) ? 1 : 0 };
    })
    .filter((h) => h.score > 0);
  return hits.slice(0, limit);
}

/* ----------------------------- UI component -------------------------------- */

const HOVER_OPEN_DELAY = 120;
const HOVER_CLOSE_DELAY = 180;
const PREVIEW_HOVER_DELAY = 1000;
const PREVIEW_DURATION = 3000;

export default function QuickRepliesMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<QuickReply[] | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const previewTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    if (!index) loadQuickReplies().then(setIndex);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, index]);

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const handleEnter = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (!open) {
      openTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY);
    }
  };

  const handleLeave = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  };

  const clearPreviewTimers = () => {
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };

  const handleItemEnter = (id: string) => {
    clearPreviewTimers();
    previewTimer.current = window.setTimeout(() => {
      setPreviewId(id);
      hideTimer.current = window.setTimeout(() => setPreviewId(null), PREVIEW_DURATION);
    }, PREVIEW_HOVER_DELAY);
  };

  const handleItemLeave = () => {
    // Cancel the pending show, but let an already-visible preview run its 3s.
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
  };

  useEffect(() => () => {
    clearTimers();
    clearPreviewTimers();
  }, []);

  const copy = async (qr: QuickReply) => {
    try {
      const htmlBlob = new ClipboardItem({
        'text/html': new Blob([qr.html], { type: 'text/html' }),
        'text/plain': new Blob([htmlToText(qr.html)], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([htmlBlob]);
    } catch {
      await navigator.clipboard.writeText(htmlToText(qr.html));
    }
    setCopiedId(qr.id);
    setTimeout(() => setCopiedId(null), 1500);
    setOpen(false);
  };

  const results = index ? searchQuickReplies(index, query, 12) : [];
  const showing = query ? results.map((h) => h.item) : (index ?? []);

  // Group templates when not searching.
  const grouped = useMemo(() => {
    if (query || !index) return [];
    const map = new Map<string, QuickReply[]>();
    for (const qr of showing) {
      const list = map.get(qr.group);
      if (list) list.push(qr);
      else map.set(qr.group, [qr]);
    }
    return Array.from(map.entries());
  }, [query, index, showing]);

  const previewQr = previewId ? index?.find((q) => q.id === previewId) ?? null : null;

  return (
    <div
      ref={ref}
      className={cn('relative inline-block', className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-bold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_color-mix(in_oklab,#0ea5e9_45%,transparent)] active:scale-95',
          'bg-[#0ea5e9] text-white',
          'px-3.5 py-1.5 text-xs'
        )}
        title="Quick reply templates for Salesforce emails"
      >
        <MessageSquareText className="size-3.5" />
        Quick Responses
        <ChevronDown
          className={cn(
            'size-3 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[95vw] rounded-xl border border-border bg-popover p-2 shadow-2xl">
          <div className="mb-1 flex items-center gap-2 border-b border-border/50 pb-1.5">
            <MessageSquareText className="size-3.5 text-[#0ea5e9]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Quick Reply Templates
            </span>
            <span className="ml-auto text-[9px] text-muted-foreground/70">
              {index ? `${index.length} templates` : 'loading…'}
            </span>
          </div>
          {index && index.length > 5 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="mb-1 w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-[#0ea5e9]/50"
            />
          )}
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto custom-scrollbar">
            {showing.length === 0 && (
              <p className="py-6 text-center text-[10px] text-muted-foreground">
                No templates yet — drop HTML files into <code>quick_reply/</code>.
              </p>
            )}

            {/* Grouped view (browse mode) */}
            {!query && grouped.map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 flex items-center gap-1.5 px-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#0ea5e9]/80">
                    {group}
                  </span>
                  <span className="text-[8px] text-muted-foreground/60">· {items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map((qr) => (
                    <TemplateItem
                      key={qr.id}
                      qr={qr}
                      copied={copiedId === qr.id}
                      onCopy={() => copy(qr)}
                      onEnter={() => handleItemEnter(qr.id)}
                      onLeave={handleItemLeave}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Flat search results */}
            {query && showing.map((qr) => (
              <TemplateItem
                key={qr.id}
                qr={qr}
                copied={copiedId === qr.id}
                onCopy={() => copy(qr)}
                onEnter={() => handleItemEnter(qr.id)}
                onLeave={handleItemLeave}
              />
            ))}
          </div>
        </div>
      )}

      {/* Centered hover-preview of the rendered HTML template */}
      {previewQr && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-[min(720px,92vw)] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border/50 bg-[#0ea5e9]/10 px-3 py-2">
              <MessageSquareText className="size-4 text-[#0ea5e9]" />
              <span className="truncate text-[12px] font-bold">{previewQr.title}</span>
              <span className="ml-auto shrink-0 rounded bg-background/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                preview · auto-hides in 3s
              </span>
            </div>
            <div
              className="qr-preview overflow-y-auto px-4 py-3 text-[13px] leading-relaxed text-foreground"
              dangerouslySetInnerHTML={{ __html: previewQr.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateItem({
  qr,
  copied,
  onCopy,
  onEnter,
  onLeave,
}: {
  qr: QuickReply;
  copied: boolean;
  onCopy: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="group flex w-full items-start gap-2 rounded-lg border border-border/60 bg-card/40 p-2 text-left transition-all hover:border-[#0ea5e9]/40 hover:bg-[#0ea5e9]/5 active:scale-[0.99]"
      title="Click to copy · hover 1s to preview"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold">{qr.title}</div>
        <div className="line-clamp-2 text-[9px] leading-snug text-muted-foreground">
          {qr.excerpt || htmlToText(qr.html).slice(0, 90)}
        </div>
      </div>
      <div
        className={cn(
          'shrink-0 rounded p-0.5 text-[9px] font-bold transition-all',
          copied
            ? 'bg-success/20 text-success'
            : 'bg-[#0ea5e9]/10 text-[#0ea5e9] opacity-0 group-hover:opacity-100'
        )}
      >
        {copied ? (
          <span className="flex items-center gap-1">
            <Check className="size-2.5" /> Copied
          </span>
        ) : (
          'Copy'
        )}
      </div>
    </button>
  );
}
