/**
 * CardCollectionPanel — "My Collection" viewer for TCG card pulls, with a
 * tab per collection. Each tab shows the user's OWNED cards (with duplicate
 * counts) followed by exactly ONE dark "???" slot summarising what's still
 * uncollected — the full set is browsable via click-to-zoom on owned cards,
 * but we don't render 200+ empty placeholders.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchCardCollection } from '@/lib/auth-client';
import { TCG_COLLECTIONS, loadTcgManifest, rarityStyle, type TcgCollectionId, type TcgManifestCard } from '@/lib/tcg-manifest';

interface CardCollectionPanelProps {
  onClose: () => void;
}

interface ColRow {
  cardId: string;
  qty: number;
  firstAcquired: number;
  lastAcquired: number;
}

/** Per-collection cached view data (null while loading, absent = not loaded). */
interface ColData {
  cards: TcgManifestCard[];
  owned: Map<string, number>;
}

export default function CardCollectionPanel({ onClose }: CardCollectionPanelProps) {
  const [active, setActive] = useState<TcgCollectionId>(TCG_COLLECTIONS[0].id);
  /** cards + owned map per collection, loaded per tab (cached by manifest). */
  const [data, setData] = useState<{ [collection: string]: ColData | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TcgManifestCard | null>(null);
  /** Collections whose load has been kicked off (ref: survives data updates). */
  const startedRef = useRef<Set<TcgCollectionId>>(new Set());

  // Load the active collection's manifest + the user's pull rows.
  useEffect(() => {
    if (startedRef.current.has(active)) return;
    startedRef.current.add(active);
    setData((d) => (d[active] === undefined ? { ...d, [active]: null } : d));
    void (async () => {
      try {
        const [manifest, col] = await Promise.all([loadTcgManifest(active), fetchCardCollection()]);
        const ids = new Set(manifest.cards.map((c) => c.id));
        const owned = new Map(col.filter((row) => ids.has(row.cardId)).map((row) => [row.cardId, row.qty]));
        setData((d) => ({ ...d, [active]: { cards: manifest.cards, owned } }));
      } catch (err) {
        setData((d) => ({ ...d, [active]: { cards: [], owned: new Map() } }));
        setError(err instanceof Error ? err.message : 'Failed to load your collection');
      }
    })();
  }, [active]);

  const current = data[active] ?? null;
  const ownedCards = current ? current.cards.filter((c) => (current.owned.get(c.id) ?? 0) > 0) : [];
  const uncollected = current ? current.cards.length - ownedCards.length : 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="My card collection"
        className="glass-panel relative flex max-h-[85vh] w-[min(860px,calc(100vw-32px))] flex-col rounded-2xl border-amber-400/30 p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="font-mono text-lg font-extrabold tracking-tight text-foreground">My Collection</h2>
        </div>

        {/* Collection tabs */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TCG_COLLECTIONS.map((c) => {
            const d = data[c.id];
            const count = d ? d.cards.filter((card) => (d.owned.get(card.id) ?? 0) > 0).length : 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors',
                  active === c.id
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                    : 'border-border/50 bg-background/30 text-muted-foreground hover:text-foreground'
                )}
              >
                {c.label}
                {d && <span className="ml-1.5 tabular-nums opacity-70">{count}/{d.cards.length}</span>}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        )}

        <div className="custom-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {!current && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {current && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {ownedCards.map((card) => {
                const qty = current.owned.get(card.id) ?? 0;
                const st = rarityStyle(card.rarity);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelected(card)}
                    className={cn(
                      'relative aspect-[5/7] overflow-hidden rounded-lg border bg-white/5 transition-transform',
                      st.border,
                      'cursor-zoom-in hover:scale-[1.04]'
                    )}
                    title={`${card.name} — ${card.rarity}`}
                  >
                    <img src={card.image} alt={card.name} className="size-full object-cover" loading="lazy" />
                    {qty > 1 && (
                      <span className="absolute bottom-1 right-1 rounded-md border border-white/20 bg-black/70 px-1.5 text-[10px] font-black tabular-nums text-white">
                        ×{qty}
                      </span>
                    )}
                  </button>
                );
              })}
              {/* Single "not collected yet" slot — never a wall of empties. */}
              {uncollected > 0 && (
                <div
                  className="flex aspect-[5/7] items-center justify-center rounded-lg border border-dashed border-border/50 bg-background/20"
                  title={`${uncollected} more to collect`}
                >
                  <div className="text-center">
                    <p className="font-mono text-sm font-black text-muted-foreground/60">???</p>
                    <p className="mt-0.5 text-[9px] font-bold text-muted-foreground/50">+{uncollected} more</p>
                  </div>
                </div>
              )}
              {ownedCards.length === 0 && uncollected === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  Nothing here yet — draw cards from the Spice Store.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-2 shrink-0 text-center text-[10px] text-muted-foreground/70">
          Draw cards from the Spice Store — rarity is set by each card's market price.
        </p>

        {/* Card detail overlay */}
        {selected && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <div className="flex max-h-full flex-col items-center gap-3 p-4">
              <img
                src={selected.image}
                alt={selected.name}
                className={cn('max-h-[60vh] rounded-xl border-2 bg-[#f5f0e6] object-contain', rarityStyle(selected.rarity).border, rarityStyle(selected.rarity).glow)}
              />
              <div className="text-center">
                <p className="text-sm font-extrabold text-white">{selected.name}</p>
                <div className="mt-1 flex items-center justify-center gap-2 text-[11px] font-bold">
                  <span className={cn('rounded-full border px-2.5 py-0.5', rarityStyle(selected.rarity).chip)}>
                    {selected.rarity}
                  </span>
                  <span className="text-muted-foreground">Market ${selected.price.toFixed(2)}</span>
                  <span className="text-muted-foreground/70">×{current?.owned.get(selected.id) ?? 0} owned</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-bold text-white/80 transition-colors hover:bg-white/10"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
