/**
 * CardOpeningModal — CS:GO crate-opening ceremony for TCG card draws.
 * The server already decided the card (purchase response); this is a pure
 * reveal: a horizontal ticker of weighted-random cards decelerates under a
 * center marker, lands exactly on the won card, then the card reveals with
 * a rarity-colored glow. "Draw again" re-enters the ceremony for another
 * 9-spice pull; "Done" closes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { purchaseItem, type TcgCard } from '@/lib/auth-client';
import { collectionOfProduct, loadTcgManifest, rarityStyle, PRODUCT_OF_COLLECTION, DRAW_PRICE, type TcgManifestCard, type TcgCollectionId } from '@/lib/tcg-manifest';
import { sfxStart, sfxTick, sfxLand, sfxReveal } from '@/lib/card-sfx';

interface CardOpeningModalProps {
  /** The server-decided card from the first purchase. */
  card: TcgCard;
  spice: number;
  onSpiceChange: (spice: number) => void;
  /** Called after each pull so owners can refresh counts. */
  onCardWon?: (card: TcgCard) => void;
  onClose: () => void;
}

type Phase = 'idle' | 'spinning' | 'revealed' | 'drawing';

const SPIN_MS = 6_400;
const TICKER_LEN = 64; // strip length (cards)
const WIN_INDEX = 56; // winner slot inside the strip
const ITEM_W = 176; // px per strip item (card + gaps)

/** Weighted random card for ticker filler — mirrors the server tier odds so
 *  the fly-by looks plausible (commons flood, secrets are rare). */
function weightedPick(cards: TcgManifestCard[], tierWeights: Record<string, number>): TcgManifestCard {
  const total = Object.values(tierWeights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [tier, weight] of Object.entries(tierWeights)) {
    roll -= weight;
    if (roll > 0) continue;
    const pool = cards.filter((c) => c.rarity === tier);
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return cards[Math.floor(Math.random() * cards.length)];
}

export default function CardOpeningModal({ card, spice, onSpiceChange, onCardWon, onClose }: CardOpeningModalProps) {
  const [manifest, setManifest] = useState<Awaited<ReturnType<typeof loadTcgManifest>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('spinning');
  const [won, setWon] = useState<TcgCard>(card);
  const [strip, setStrip] = useState<TcgManifestCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newCard, setNewCard] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Load manifest (cards for the ticker + ownership check for the reveal).
  useEffect(() => {
    let cancelled = false;
    loadTcgManifest(collectionOfProduct(card.collection ? `tcg-${card.collection}` : 'tcg-sds-card'))
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        setStrip(
          Array.from({ length: TICKER_LEN }, (_, i) =>
            i === WIN_INDEX ? (card as TcgManifestCard) : weightedPick(m.cards, m.tierWeights)
          )
        );
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Failed to load cards'));
    return () => {
      cancelled = true;
    };
  }, [card]);

  // Kick the spin once the strip exists: transition target computed from the
  // winner slot so the card stops under the marker. The ticker tick rate
  // follows the strip's deceleration for the roll sound. On re-draws the
  // track is parked at the previous winner, so it is first snapped back to 0
  // with transitions disabled — otherwise the transform never changes and
  // the strip would just sit still.
  useEffect(() => {
    if (phase !== 'spinning' || !manifest || !strip.length) return;
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = 'translateX(0px)';
    void el.offsetWidth; // flush layout so the transition starts from 0
    const start = el.getBoundingClientRect().left;
    const target = WIN_INDEX * ITEM_W + ITEM_W / 2 - start;
    el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.16, 1)`;
    el.style.transform = `translateX(-${target}px)`;
    // Ticker ticks: fast at first, spacing stretches as the strip slows.
    sfxStart();
    const TICK_TOTAL = 46;
    let tick = 0;
    let tickTimer = 0;
    const scheduleNext = () => {
      tick += 1;
      if (tick > TICK_TOTAL) return;
      const progress = tick / TICK_TOTAL;
      const ease = 0.12 + 0.88 * progress ** 3; // mirrors the deceleration
      sfxTick(1 - progress);
      tickTimer = window.setTimeout(scheduleNext, 55 + ease * 320);
    };
    tickTimer = window.setTimeout(scheduleNext, 60);
    const landTimer = window.setTimeout(() => sfxLand(), SPIN_MS);
    const timer = window.setTimeout(() => {
      sfxReveal(won.rarity);
      setPhase('revealed');
    }, SPIN_MS + 150);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(landTimer);
      window.clearTimeout(tickTimer);
    };
  }, [phase, manifest, strip, won.rarity]);

  // New-card flag: ownership before this pull (for the "NEW!" badge).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { fetchCardCollection } = await import('@/lib/auth-client');
        const col = await fetchCardCollection();
        if (cancelled) return;
        setNewCard(!col.some((row) => row.cardId === won.id));
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [won.id]);

  const drawAgain = useCallback(async () => {
    if (phase === 'drawing' || phase === 'spinning') return;
    setError(null);
    setPhase('drawing');
    try {
      const productId = PRODUCT_OF_COLLECTION[collectionOfProduct(`tcg-${won.collection ?? 'sds'}`)] ?? 'tcg-sds-card';
      const out = await purchaseItem(productId);
      onSpiceChange(out.spice);
      if (!out.card) throw new Error('Draw failed — no card returned');
      // Rebuild the strip for the new winner in the same commit as the phase
      // change — leaving the old strip would keep the previous card parked
      // under the marker.
      if (manifest) {
        setStrip(
          Array.from({ length: TICKER_LEN }, (_, i) =>
            i === WIN_INDEX ? (out.card as TcgManifestCard) : weightedPick(manifest.cards, manifest.tierWeights)
          )
        );
      }
      setWon(out.card);
      onCardWon?.(out.card);
      setPhase('spinning');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draw failed');
      setPhase('revealed');
    }
  }, [phase, manifest, onSpiceChange, onCardWon, won.collection]);

  const style = rarityStyle(won.rarity);
  const spinning = phase === 'spinning';
  const drawing = phase === 'drawing';
  const revealed = phase === 'revealed';
  const drawPrice = DRAW_PRICE[(won.collection ?? 'sds') as TcgCollectionId] ?? 9;

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Card opening"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !spinning) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        disabled={spinning}
        className="absolute right-4 top-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>

      <h2 className={cn('font-mono text-2xl font-black tracking-tight', spinning ? 'text-white' : style.text)}>
        {spinning ? 'Opening pack…' : phase === 'drawing' ? 'Drawing…' : `${style.label}!`}
      </h2>

      {/* Ticker — spans the full canvas width (CS:GO style). */}
      <div className="relative mt-6 w-full overflow-hidden">
        {/* center marker */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full w-0.5 -translate-x-1/2 bg-amber-300 shadow-[0_0_12px_2px_rgba(252,211,77,0.9)]" />
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-black to-transparent" />
        <div ref={trackRef} className="flex gap-2 will-change-transform">
          {(strip.length ? strip : Array.from({ length: TICKER_LEN })).map((c, i) => {
            const mc = c as TcgManifestCard | undefined;
            return (
              <div
                key={i}
                style={{ width: ITEM_W - 8, minWidth: ITEM_W - 8 }}
                className={cn(
                  'flex h-[240px] items-center justify-center overflow-hidden rounded-lg border bg-white/5',
                  mc ? rarityStyle(mc.rarity).border : 'border-white/10'
                )}
              >
                {mc && manifest ? (
                  <img src={mc.image} alt="" className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <div className="size-full animate-pulse bg-white/5" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Reveal panel */}
      {phase === 'revealed' && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {newCard && (
            <span className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-3 py-0.5 text-[11px] font-black tracking-widest text-emerald-300">
              NEW!
            </span>
          )}
          <p className="max-w-md text-center text-sm font-extrabold text-white">{won.name}</p>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className={cn('rounded-full border px-2.5 py-0.5', style.chip)}>{won.rarity}</span>
            <span className="text-muted-foreground">Market ${won.price.toFixed(2)}</span>
            {won.code && <span className="text-muted-foreground/70">{won.code}</span>}
          </div>
          {error && (
            <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void drawAgain()}
              disabled={spice < drawPrice || drawing}
              className={cn(
                'rounded-xl border px-5 py-2.5 text-sm font-black transition-all',
                spice >= drawPrice && !drawing
                  ? 'border-amber-300/60 bg-amber-400/90 text-black hover:brightness-110 active:scale-95'
                  : 'border-border/60 bg-muted/40 text-muted-foreground'
              )}
              title={spice >= drawPrice ? `Draw another card (${drawPrice} 🌶️)` : `Need ${drawPrice} spice`}
            >
              {drawing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `Draw again — ${drawPrice} 🌶️`
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/80 transition-colors hover:bg-white/10"
            >
              Done
            </button>
          </div>
          <p className="mt-1 text-[10px] text-white/40">Balance: 🌶️ {spice}</p>
        </div>
      )}

      {loadError && (
        <p className="mt-6 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
          {loadError}
        </p>
      )}
    </div>
  );
}
