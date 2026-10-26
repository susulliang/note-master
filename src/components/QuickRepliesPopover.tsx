import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MessageSquareText, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { loadQuickReplies, searchQuickReplies, type QuickReply } from '@/components/QuickRepliesMenu';

const GROUP_COLORS: Record<string, string> = {
  'Closing Ticket': '#22c55e',
  'Must Return': '#ef4444',
  'Collect Info': '#0ea5e9',
  'First Response': '#a855f7',
  'No Return Needed': '#14b8a6',
  Other: '#94a3b8',
};

function plainText(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element.textContent || element.innerText || '';
}

export default function QuickRepliesPopover({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<QuickReply[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches
  );
  const [anchor, setAnchor] = useState({ top: 120, left: 12, width: 620 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 680px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadQuickReplies().then((items) => {
      if (!cancelled) {
        setIndex(items);
        setSelectedId((current) => current ?? items[0]?.id ?? null);
      }
    }).catch(() => toast.error('Could not load quick response templates.'));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || mobile || !triggerRef.current) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(620, window.innerWidth - 24);
      const estimatedHeight = Math.min(560, window.innerHeight * 0.72);
      setAnchor({
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - estimatedHeight - 12)),
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        width,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, mobile]);

  const groups = useMemo(
    () => ['All', ...new Set(index.map((item) => item.group))],
    [index]
  );
  const matches = useMemo(
    () => searchQuickReplies(index, query, 200)
      .map((hit) => hit.item)
      .filter((item) => group === 'All' || item.group === group),
    [group, index, query]
  );
  const selected = matches.find((item) => item.id === selectedId) ?? matches[0] ?? null;

  const copyReply = async (item: QuickReply) => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([item.html], { type: 'text/html' }),
          'text/plain': new Blob([plainText(item.html)], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([clipboardItem]);
      } else {
        await navigator.clipboard.writeText(plainText(item.html));
      }
      setCopiedId(item.id);
      toast.success('Quick response copied', { description: item.title });
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      toast.error('Clipboard access is unavailable.');
    }
  };

  const openPanel = () => {
    setOpen((current) => !current);
    setQuery('');
    setGroup('All');
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPanel}
        className={cn(
          'quiet-call-action-button quiet-call-quick-replies',
          open && 'text-foreground',
          className
        )}
        aria-label="Quick responses"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <MessageSquareText className="size-4" />
        <span>Quick Responses</span>
        <ChevronDown className={cn('ml-auto size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && createPortal(
        <>
          {mobile && (
            <button
              type="button"
              className="fixed inset-0 z-[110] bg-slate-950/35 backdrop-blur-[2px]"
              aria-label="Close quick responses"
              onClick={() => setOpen(false)}
            />
          )}
          <section
            ref={panelRef}
            role="dialog"
            aria-label="Quick response templates"
            className={cn(
              'fixed z-[120] flex flex-col overflow-hidden border border-border/80 bg-card text-foreground shadow-2xl',
              mobile
                ? 'inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] max-h-[72dvh] rounded-[22px]'
                : 'rounded-2xl'
            )}
            style={mobile ? undefined : {
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              maxHeight: 'min(72dvh, 560px)',
            }}
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
                <MessageSquareText className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Quick responses</h2>
                <p className="text-[11px] text-muted-foreground">Choose a reply, review it, then copy.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                aria-label="Close quick responses"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="shrink-0 space-y-3 border-b border-border/60 px-4 py-3">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background/70 px-3 focus-within:border-sky-500/60 focus-within:ring-2 focus-within:ring-sky-500/15">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search replies or situations"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="text-xs text-muted-foreground">
                    Clear
                  </button>
                )}
              </label>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label="Filter by category">
                {groups.map((itemGroup) => (
                  <button
                    key={itemGroup}
                    type="button"
                    onClick={() => setGroup(itemGroup)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500',
                      group === itemGroup
                        ? 'border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {itemGroup}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(190px,0.82fr)_minmax(0,1.18fr)]">
              <div className="min-h-0 overflow-y-auto border-border/60 md:border-r">
                <div className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                  <span>Templates</span>
                  <span>{matches.length}</span>
                </div>
                {matches.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matching replies.</p>
                ) : (
                  <div className="space-y-1 px-2 pb-2">
                    {matches.map((item) => {
                      const color = GROUP_COLORS[item.group] ?? GROUP_COLORS.Other;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={cn(
                            'w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500',
                            selected?.id === item.id
                              ? 'border-sky-500/35 bg-sky-500/8'
                              : 'border-transparent hover:border-border hover:bg-muted/70'
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{item.title}</span>
                            {copiedId === item.id && <Check className="size-3.5 shrink-0 text-emerald-500" />}
                          </span>
                          <span className="mt-1 block line-clamp-2 pl-3.5 text-[11px] leading-relaxed text-muted-foreground">
                            {item.excerpt}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col border-t border-border/60 md:border-t-0">
                {selected ? (
                  <>
                    <div className="flex shrink-0 items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {selected.group}
                        </p>
                        <h3 className="mt-1 text-sm font-semibold">{selected.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyReply(selected)}
                        className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl bg-sky-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                      >
                        {copiedId === selected.id ? <Check className="size-3.5" /> : <MessageSquareText className="size-3.5" />}
                        {copiedId === selected.id ? 'Copied' : 'Copy response'}
                      </button>
                    </div>
                    <div
                      className="qr-preview min-h-0 flex-1 overflow-y-auto border-t border-border/60 bg-background/35 px-4 py-4 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selected.html }}
                    />
                  </>
                ) : (
                  <div className="flex min-h-28 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    Select a template to preview the full response.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>,
        document.body
      )}
    </>
  );
}
