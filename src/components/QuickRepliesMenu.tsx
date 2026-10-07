import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MessageSquareText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Quick Responses — a hover-to-expand menu on the bottom call bar. Shows
 * agent-facing email reply templates (HTML files under quick_reply/),
 * grouped by intent, with click-to-copy. Browsing fans the templates out
 * as title cards packed onto a frosted radial disc above the button;
 * hovering a card for 2.5s pops a centered, styled HTML preview that
 * auto-dismisses after 2s.
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
const PREVIEW_HOVER_DELAY = 2500;
const PREVIEW_DURATION = 2000;

/* Radial dial geometry — cards are packed onto three concentric arcs
 * (outer → inner) by a greedy, overlap-checked walk, so the fan fills from
 * the rim toward the center with no empty middle and no overlapping cards.
 * The whole fan is shifted / scaled at runtime so it always fits. */
const DIAL_ARC_RADII = [430, 290, 150];
const DIAL_ARC_FROM = 170; // degrees, CCW from +x axis; walked left → right
const DIAL_ARC_TO = 10;
const DIAL_ARC_STEP = 4;
const DIAL_MIN_RISE = 70; // cards stay at least this many px above the button (bar clearance)
const CARD_W_MIN = 84;
const CARD_W_MAX = 300;

/* Frosted disc under the cards — a full circle with a big backdrop blur
 * for readability, doubling as the hover bridge across the dial. Pointer
 * events are limited to the upper half disc (the bottom bar covers the
 * rest, and the sliver below it must not open the menu by accident). */
const FAN_R_OUT = 520;

/* Fan timing — fan-out is quick and springy; fan-in mirrors it in reverse
 * card order. Total = FAN_DURATION + n × FAN_STAGGER. */
const FAN_DURATION = 260;
const FAN_STAGGER = 18;

/* Below this viewport width the radial fan would have to scale down too far
 * (cards and text get tiny) — fall back to the classic flat list column. */
const DIAL_MIN_VIEWPORT = 780;

/** Measure a title at the card font (11px bold) — canvas text metrics. */
let measureCtx: CanvasRenderingContext2D | null = null;
function measureTitle(title: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return title.length * 6;
  measureCtx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
  return Math.ceil(measureCtx.measureText(title).width);
}

/** Accent color per intent group (used by the radial title cards). */
const GROUP_COLORS: Record<string, string> = {
  'Closing Ticket': '#22c55e',
  'Must Return': '#ef4444',
  'Collect Info': '#0ea5e9',
  'First Response': '#a855f7',
  'No Return Needed': '#14b8a6',
  Other: '#94a3b8',
};

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

  // Narrow viewports: the radial fan would scale down too much — show the
  // flat list column instead of the dial.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < DIAL_MIN_VIEWPORT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DIAL_MIN_VIEWPORT - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Auto-hide the preview 3s after it (last) appeared — driven by state,
  // so it always fires regardless of mouse jitter across items.
  useEffect(() => {
    if (!previewId) return undefined;
    const t = window.setTimeout(() => setPreviewId(null), PREVIEW_DURATION);
    return () => clearTimeout(t);
  }, [previewId]);

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
  };

  const handleItemEnter = (id: string) => {
    // Hovering a card also cancels a pending close scheduled by the fan
    // wedge's mouseleave (card and wedge are DOM siblings).
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    clearPreviewTimers();
    previewTimer.current = window.setTimeout(() => {
      setPreviewId(id);
    }, PREVIEW_HOVER_DELAY);
  };

  const handleItemLeave = () => {
    // Cancel the pending show, but let an already-visible preview run its 2s.
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
      try {
        await navigator.clipboard.writeText(htmlToText(qr.html));
      } catch {
        // Clipboard blocked (permissions) — still show the copied feedback.
      }
    }
    setCopiedId(qr.id);
    // Bottom-right toast, matching the app's other notifications.
    toast.success('Quick Response Copied!', { description: qr.title });
    // Keep the dial open briefly so the "Copied ✓" badge on the card is
    // visible, then close (which plays the fan-in).
    setTimeout(() => setOpen(false), 450);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const results = index ? searchQuickReplies(index, query, 12) : [];
  const showing = query ? results.map((h) => h.item) : (index ?? []);

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

      {/* Browse mode — radial dial: title cards fan out from the button
          onto two arcs above it. Stays mounted (via `mounted`) while the
          menu closes so the fan-in animation can play. DOM children of the
          trigger container so the hover-intent logic keeps working across
          the gaps between cards. */}
      {index && !narrow && (
        <RadialDial
          mounted={open && !query}
          items={index}
          copiedId={copiedId}
          onCopy={copy}
          onEnter={handleItemEnter}
          onLeave={handleItemLeave}
          onFanEnter={handleEnter}
          onFanLeave={handleLeave}
          onQueryChange={setQuery}
        />
      )}

      {/* Search mode (or narrow screens, where the fan would shrink too
          much) — flat list in a classic dropdown column */}
      {open && (query || narrow) && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[95vw] rounded-xl border border-border bg-popover p-2 shadow-2xl">
          <div className="mb-1 flex items-center gap-2 border-b border-border/50 pb-1.5">
            <MessageSquareText className="size-3.5 text-[#0ea5e9]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Quick Reply Templates
            </span>
            <span className="ml-auto text-[9px] text-muted-foreground/70">
              {query
                ? `${results.length} match${results.length === 1 ? '' : 'es'}`
                : `${index?.length ?? 0} templates`}
            </span>
          </div>
          <input
            autoFocus={Boolean(query)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="mb-1 w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-[#0ea5e9]/50"
          />
          <div className="max-h-[min(420px,60vh)] space-y-1.5 overflow-y-auto custom-scrollbar">
            {showing.length === 0 && (
              <p className="py-6 text-center text-[10px] text-muted-foreground">
                No templates match “{query}”.
              </p>
            )}
            {showing.map((qr) => (
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

      {/* Centered hover-preview of the rendered HTML template (portal → body so it's truly viewport-centered) */}
      {previewQr && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-[min(720px,92vw)] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/55 shadow-2xl backdrop-blur-md backdrop-saturate-125">
            <div className="flex items-center gap-2 border-b border-border/40 bg-[#0ea5e9]/10 px-3 py-2 backdrop-blur-sm">
              <MessageSquareText className="size-4 text-[#0ea5e9]" />
              <span className="truncate text-[12px] font-bold">{previewQr.title}</span>
              <span className="ml-auto shrink-0 rounded bg-background/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                preview · auto-hides in 2s
              </span>
            </div>
            <div
              className="qr-preview overflow-y-auto bg-card/30 px-4 py-3 text-[13px] leading-relaxed text-foreground backdrop-blur-sm"
              dangerouslySetInnerHTML={{ __html: previewQr.html }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Radial dial — the browse-mode palette. Every template renders as a title
 * card sized to its title, greedily packed onto three concentric arcs
 * (widest cards on the roomy outer arc, narrowest near the center) so the
 * frosted disc fills rim → center with no overlaps and no empty middle.
 * The disc (a full circle with a big backdrop blur) doubles as a hover
 * bridge; hovering a card grows it and adds an animated yellow glow. The
 * whole fan shifts/scales at runtime so it always fits the viewport, and
 * it sits at z-30 — under the bottom bar and left rail, sliding out from
 * behind them. Closing plays a fan-in: cards collapse back into the button
 * in reverse order, then the dial unmounts. A slim search stem sits above
 * the button; typing switches to flat search mode.
 */
function RadialDial({
  mounted,
  items,
  copiedId,
  onCopy,
  onEnter,
  onLeave,
  onFanEnter,
  onFanLeave,
  onQueryChange,
}: {
  mounted: boolean;
  items: QuickReply[];
  copiedId: string | null;
  onCopy: (qr: QuickReply) => void;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onFanEnter: () => void;
  onFanLeave: () => void;
  onQueryChange: (q: string) => void;
}) {
  // Cards mount collapsed at the button center, then fan out (one frame
  // later) so the transform transition actually plays. When `mounted` goes
  // false the cards fan back in and the dial unmounts after the animation.
  const [render, setRender] = useState(mounted);
  const [fanned, setFanned] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    if (mounted) {
      setRender(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setFanned(true)));
      return () => cancelAnimationFrame(raf);
    }
    setFanned(false);
    setHovered(null);
    const t = setTimeout(() => setRender(false), FAN_DURATION + items.length * FAN_STAGGER + 80);
    return () => clearTimeout(t);
  }, [mounted, items.length]);

  // Group the templates by intent and give each group its own angular
  // sector of the disc (proportional to member count, walked left → right)
  // so the fan reads as labeled clusters instead of one undifferentiated
  // ring.
  const groupSectors = useMemo(() => {
    const map = new Map<string, QuickReply[]>();
    for (const qr of items) {
      const list = map.get(qr.group);
      if (list) list.push(qr);
      else map.set(qr.group, [qr]);
    }
    const groups = [...map.values()];
    let cursor = DIAL_ARC_FROM;
    return groups.map((members) => {
      const share = ((DIAL_ARC_FROM - DIAL_ARC_TO) * members.length) / items.length;
      const from = cursor;
      const to = Math.max(DIAL_ARC_TO, cursor - share);
      cursor = to;
      return { group: members[0].group, members, from, to };
    });
  }, [items]);

  // Card layout — within each group's sector, cards are greedily packed onto
  // the three concentric arcs (outer → inner), walking the sector left →
  // right; widest cards claim spots first. Every candidate is checked for
  // axis-aligned overlap against ALL placed cards, so neighboring clusters
  // never collide. If a group's sector is full, a card spills to any free
  // arc spot (best-effort clustering); the column stack above the disc
  // remains the last resort. `order` (placement sequence) drives the
  // fan-out stagger, so cards animate out group by group.
  const cards = useMemo(() => {
    const H_GAP = 18;
    const V_GAP = 12;
    const HALF_H = 26; // approximate half card height
    const boxes: Array<{ l: number; t: number; r: number; b: number }> = [];
    const tryPlace = (w: number, degFrom: number, degTo: number) => {
      const hw = w / 2;
      for (const r of DIAL_ARC_RADII) {
        for (let deg = degFrom; deg >= degTo; deg -= DIAL_ARC_STEP) {
          const a = (deg * Math.PI) / 180;
          const x = Math.cos(a) * r;
          const y = -Math.sin(a) * r;
          if (-y < DIAL_MIN_RISE) continue; // keep clear of the bottom bar
          const box = { l: x - hw, t: y - HALF_H, r: x + hw, b: y + HALF_H };
          const clash = boxes.some(
            (o) =>
              box.l < o.r + H_GAP &&
              box.r + H_GAP > o.l &&
              box.t < o.b + V_GAP &&
              box.b + V_GAP > o.t
          );
          if (!clash) {
            boxes.push(box);
            return { dx: x, dy: y };
          }
        }
      }
      return null;
    };
    const out: Array<{ qr: QuickReply; order: number; w: number; dx: number; dy: number }> = [];
    for (const sector of groupSectors) {
      const sorted = sector.members
        .map((qr) => ({ qr, textW: measureTitle(qr.title) }))
        .sort((a, b) => b.textW - a.textW);
      for (const c of sorted) {
        const w = Math.max(CARD_W_MIN, Math.min(CARD_W_MAX, c.textW + 30));
        // 1) the group's own sector, 2) spill anywhere free, 3) column stack.
        let spot = tryPlace(w, sector.from, sector.to);
        if (!spot) spot = tryPlace(w, DIAL_ARC_FROM, DIAL_ARC_TO);
        if (!spot) {
          const k = out.length;
          spot = {
            dx: (k % 2 === 0 ? -1 : 1) * (110 + Math.floor(k / 2) * 40),
            dy: -FAN_R_OUT - 80 - Math.floor(k / 2) * 80,
          };
        }
        out.push({ qr: c.qr, order: out.length, w, dx: spot.dx, dy: spot.dy });
      }
    }
    return out;
  }, [groupSectors]);

  // Fit the fan inside the viewport. A zero-size marker div at the button
  // center is measured (the fan itself is portaled to <body> at z-30, UNDER
  // the bottom bar and left rail, so it slides out from behind them). The
  // whole fan shifts left just enough to clear the viewport's right edge
  // (never past the left edge); when even a full left shift can't fit
  // (narrow windows), it scales down until it does. Re-measured on resize.
  const [shiftX, setShiftX] = useState(0);
  const [fanScale, setFanScale] = useState(1);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!render) return undefined;
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ x: rect.left, y: rect.top });
      const cx = rect.left;
      const topAvail = rect.top - 16;
      const vw = window.innerWidth;
      let maxRight = FAN_R_OUT + 2;
      let maxLeft = FAN_R_OUT + 2;
      let maxTop = FAN_R_OUT + 2;
      for (const c of cards) {
        const half = c.w / 2 + 14;
        maxRight = Math.max(maxRight, c.dx + half);
        maxLeft = Math.max(maxLeft, half - c.dx);
        maxTop = Math.max(maxTop, -c.dy + 34);
      }
      const scale = Math.max(
        0.35,
        Math.min(1, (vw - 32) / (maxRight + maxLeft), topAvail / maxTop)
      );
      setFanScale(scale);
      // Shift bounds in screen px after scaling: keep the fan inside
      // [16, vw-16] horizontally; prefer no shift at all.
      const lo = 16 - cx + maxLeft * scale;
      const hi = vw - 16 - cx - maxRight * scale;
      setShiftX(Math.max(lo, Math.min(0, hi)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [render, cards]);

  if (!render) return null;

  return (
    <>
      {/* Search stem — slim input on the dial axis, above the button */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-52 -translate-x-1/2 transition-[opacity,transform] duration-200',
          mounted ? 'pointer-events-auto translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
        )}
      >
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-popover/90 px-2.5 py-1 shadow-lg backdrop-blur-md">
          <Search className="size-3 shrink-0 text-[#0ea5e9]/80" />
          <input
            value=""
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search templates…"
            className="w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Zero-size marker at the button center — measures the anchor point
          for the portaled dial. */}
      <div ref={anchorRef} className="pointer-events-none absolute left-1/2 top-1/2" />
      {/* The dial lives in a body-level portal at z-30 — UNDER the bottom
          bar and the left rail (so the fan slides out from behind them)
          while staying above the canvas. The wedge renders first (under the
          cards) and bridges hover across the dial; one wrapper transform
          carries the viewport-fit shift + scale so wedge and cards move as
          a unit. */}
      {pos && createPortal(
        <div
          className="pointer-events-none fixed z-30"
          style={{ left: pos.x, top: pos.y }}
        >
        <div
          className="absolute transition-transform duration-200"
          style={{ transform: `translateX(${shiftX}px) scale(${fanScale})` }}
        >
        {/* Frosted disc — a full circle with a big backdrop blur for
            readability (an SVG fill alone can't blur what's behind it).
            Its bottom half hides under the bottom bar (z-30 vs z-40), so
            the transparent hit layer above it limits pointer events to the
            upper half disc: it bridges hover across the dial while the
            sliver of disc below the bar can't open the menu by accident. */}
        <div
          className="pointer-events-none absolute transition-opacity duration-300"
          style={{
            left: -FAN_R_OUT,
            top: -FAN_R_OUT,
            width: FAN_R_OUT * 2,
            height: FAN_R_OUT * 2,
            opacity: fanned ? 1 : 0,
            borderRadius: '50%',
            backdropFilter: 'blur(18px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
            background: 'color-mix(in oklab, var(--foreground) 10%, transparent)',
            border: '1.5px solid color-mix(in oklab, var(--border) 50%, transparent)',
          }}
        />
        <div
          className="absolute transition-opacity duration-300"
          style={{
            left: -FAN_R_OUT,
            top: -FAN_R_OUT,
            width: FAN_R_OUT * 2,
            height: FAN_R_OUT * 2,
            borderRadius: '50%',
            clipPath: 'inset(0 0 50% 0)',
            opacity: fanned ? 1 : 0,
            pointerEvents: fanned ? 'auto' : 'none',
          }}
          onMouseEnter={onFanEnter}
          onMouseLeave={onFanLeave}
        />
        {cards.map((c) => {
          const color = GROUP_COLORS[c.qr.group] ?? GROUP_COLORS.Other;
          const copied = copiedId === c.qr.id;
          const isHovered = hovered === c.qr.id;
          return (
            <button
              key={c.qr.id}
              type="button"
              onClick={() => onCopy(c.qr)}
              onMouseEnter={() => {
                setHovered(c.qr.id);
                onEnter(c.qr.id);
              }}
              onMouseLeave={() => {
                setHovered(null);
                onLeave();
              }}
              className={cn(
                'pointer-events-auto absolute left-0 top-0 flex flex-col items-center gap-1 overflow-visible rounded-xl border bg-card/90 px-2.5 py-2.5 text-center shadow-xl backdrop-blur-md transition-[transform,opacity] duration-[260ms]',
                fanned ? 'opacity-100' : 'opacity-0',
                copied && 'border-success/70',
                isHovered && 'z-10 animate-qr-card-glow'
              )}
              style={{
                width: c.w,
                transform: `translate(-50%, -50%) translate(${fanned ? c.dx : 0}px, ${
                  fanned ? c.dy : -10
                }px) scale(${fanned ? (isHovered ? 1.15 : 1) : 0.4})`,
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                // No stagger delay while hovered so the grow/shrink is instant.
                transitionDelay: isHovered
                  ? '0ms'
                  : `${(fanned ? c.order : cards.length - 1 - c.order) * FAN_STAGGER}ms`,
                borderColor: copied
                  ? undefined
                  : isHovered
                    ? 'rgba(250, 204, 21, 0.8)'
                    : `${color}55`,
              }}
              title="Click to copy · hover 2.5s to preview"
            >
              <span
                className="max-w-full truncate rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider"
                style={{ color, backgroundColor: `${color}22` }}
              >
                {c.qr.group}
              </span>
              <span className="line-clamp-2 break-words text-[13px] font-bold leading-tight text-foreground">
                {c.qr.title}
              </span>
              {copied && (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-success text-success-foreground shadow">
                  <Check className="size-2.5" />
                </span>
              )}
            </button>
          );
        })}
        </div>
        </div>
      , document.body)}
    </>
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
      title="Click to copy · hover 2.5s to preview"
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
