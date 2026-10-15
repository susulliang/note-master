/**
 * CardCollectionPanel — "My Collection" viewer for TCG card pulls. Shows the
 * full Seven Deadly Sins set as a grid: owned cards render their art with a
 * duplicate-count badge, unowned cards render a dark silhouette placeholder
 * (art blurred + hidden) so the set is browsable without spoiling details.
 */

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchCardCollection } from '@/lib/auth-client';
import { loadTcgManifest, rarityStyle, type TcgManifestCard } from '@/lib/tcg-manifest';

interface CardCollectionPanelProps {
  onClose: () => void;
}

interface ColRow {
  cardId: string;
  qty: number;
  firstAcquired: number;
  lastAcquired: number;
}

export default function CardCollectionPanel({ onClose }: CardCollectionPanelProps) {
  const [manifest, setManifest] = useState<Awaited<ReturnType<typeof loadTcgManifest>> | null>(null);
  const [owned, setOwned] = useState<Map<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TcgManifestCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [m, col] = await Promise.all([loadTcgManifest(), fetchCardCollection()]);
        if (cancelled) return;
        setManifest(m);
        setOwned(new Map(col.map((row) => [row.cardId, row.qty])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your collection');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = manifest?.cards ?? [];
  const ownedCount = owned ? cards.filter((c) => (owned.get(c.id) ?? 0) > 0).length : 0;

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
          <p className="text-xs text-muted-foreground">The Seven Deadly Sins</p>
          <span className="ml-auto rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums text-amber-400">
            {owned ? `${ownedCount} / ${cards.length}` : '…'}
          </span>
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        )}

        <div className="custom-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {(!manifest || !owned) && !error && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {manifest &&
              owned &&
              cards.map((card) => {
                const qty = owned.get(card.id) ?? 0;
                const has = qty > 0;
                const st = rarityStyle(card.rarity);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => has && setSelected(card)}
                    className={cn(
                      'relative aspect-[5/7] overflow-hidden rounded-lg border bg-white/5 transition-transform',
                      has ? cn(st.border, 'hover:scale-[1.04] cursor-zoom-in') : 'border-border/40 opacity-45',
                      selected?.id === card.id && 'ring-2 ring-amber-300/70'
                    )}
                    title={has ? `${card.name} — ${card.rarity}` : 'Not collected yet'}
                  >
                    {has ? (
                      <>
                        <img src={card.image} alt={card.name} className="size-full object-cover" loading="lazy" />
                        {qty > 1 && (
                          <span className="absolute bottom-1 right-1 rounded-md border border-white/20 bg-black/70 px-1.5 text-[10px] font-black tabular-nums text-white">
                            ×{qty}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <span className="font-mono text-[9px] font-bold text-muted-foreground/60">???</span>
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
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
                  <span className="text-muted-foreground/70">×{owned?.get(selected.id) ?? 0} owned</span>
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
