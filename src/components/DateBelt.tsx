import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Belt-like draggable date selector — a horizontal strip of day cells that
 * can be dragged like a conveyor; the cell under the fixed center slot
 * marker is the selected day. Click a cell to snap it to the middle.
 * Shared by SHIFTS and TRAK.
 */
export function DateBelt({
  year,
  month,
  dayList,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  dayList: number[];
  selected: number;
  onSelect: (day: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ down: false, moved: false, startX: 0, startScroll: 0 });
  const rafRef = useRef(0);

  /** Center the cell whose center is closest to the container center. */
  const nearest = () => {
    const el = scrollRef.current;
    if (!el) return null;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    el.querySelectorAll<HTMLElement>('[data-day]').forEach((c) => {
      const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    });
    return best;
  };
  const centerOn = (el: HTMLElement, smooth = false) => {
    const c = scrollRef.current;
    if (c) c.scrollTo({ left: el.offsetLeft - (c.clientWidth - el.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Keep the selected day centered (mount + month switches).
  useEffect(() => {
    if (dragRef.current.down) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (el) centerOn(el);
  }, [selected, year, month]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { down: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    el.scrollLeft = d.startScroll - dx;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    if (!d.down) return;
    d.down = false;
    if (d.moved) {
      const best = nearest();
      if (best) {
        centerOn(best, true);
        const day = Number((best as HTMLElement).dataset.day);
        if (day !== selected) onSelect(day);
      }
    }
  };

  const onScroll = () => {
    if (rafRef.current || dragRef.current.down) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const best = nearest() as HTMLElement | null;
      if (!best) return;
      const day = Number(best.dataset.day);
      if (Number.isFinite(day) && day !== selected) onSelect(day);
    });
  };

  return (
    <div className="relative shrink-0 rounded-xl border border-border/70 bg-card/40 py-0.5">
      {/* Fixed center slot marker — the day under it is the selected one. */}
      <div className="pointer-events-none absolute inset-y-0.5 left-1/2 z-10 w-14 -translate-x-1/2">
        <div className="h-full rounded-lg border-2 border-primary/70 bg-primary/[0.06]" />
      </div>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onScroll={onScroll}
        className="flex cursor-grab touch-none gap-1 overflow-x-auto px-[calc(50%-28px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {dayList.map((d) => {
          const wd = WEEKDAY_SHORT[new Date(year, month - 1, d).getDay()];
          const weekend = wd === 'Sat' || wd === 'Sun';
          return (
            <button
              key={d}
              data-day={d}
              type="button"
              onClick={(e) => {
                centerOn(e.currentTarget);
                if (!dragRef.current.moved) onSelect(d);
              }}
              className={cn(
                'flex w-14 shrink-0 select-none flex-col items-center justify-center gap-0 rounded-lg border py-0.5 transition-colors',
                d === selected
                  ? 'border-primary/60 bg-primary/15'
                  : weekend
                    ? 'border-transparent bg-white/[0.03] hover:bg-accent/10'
                    : 'border-transparent hover:bg-accent/10'
              )}
            >
              <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">{wd}</span>
              <span className="font-mono text-[11px] font-bold">{d}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
