/**
 * Store panel — spice redemption shop opened from the Account block in
 * Settings. Lists the active products launched by admins (virtual items —
 * e.g. "Cat food" for the cat assistant), each with a spice price and a Buy
 * button. Purchases deduct spice on the server (D1); the new balance flows
 * back through onSpiceChange so the Account block updates instantly.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShoppingBag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listStore, purchaseItem, type StoreProduct } from '@/lib/auth-client';
import { CAT_EAT_EVENT } from '@/lib/cat-sprites';

interface StorePanelProps {
  /** Current spice balance (displayed in the header). */
  spice: number;
  /** Called with the new balance after a successful purchase. */
  onSpiceChange: (spice: number) => void;
  onClose: () => void;
}

export default function StorePanel({ spice, onSpiceChange, onClose }: StorePanelProps) {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [boughtId, setBoughtId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await listStore());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the store');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (product: StoreProduct) => {
    if (busyId) return;
    setBusyId(product.id);
    setError(null);
    try {
      const out = await purchaseItem(product.id);
      onSpiceChange(out.spice);
      setBoughtId(product.id);
      window.setTimeout(() => setBoughtId((id) => (id === product.id ? null : id)), 1800);
      // Cat-food purchases feed the assistant — play the eating animation.
      // Category is explicit (product.category); the name regex only covers
      // legacy rows saved before the category field existed.
      const isFood = product.category === 'food' || /food|feast|treat|snack/i.test(product.name);
      if (isFood) {
        window.dispatchEvent(
          new CustomEvent(CAT_EAT_EVENT, {
            detail: { productId: product.id, productName: product.name, isFood: true },
          })
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
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
        aria-label="Spice store"
        className="glass-panel relative flex max-h-[80vh] w-[min(520px,calc(100vw-32px))] flex-col rounded-2xl border-amber-400/30 p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="glass-panel flex size-11 items-center justify-center rounded-xl border-amber-400/40 bg-amber-400/10">
            <ShoppingBag className="size-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-mono text-xl font-extrabold tracking-tight text-foreground">Spice Store</h2>
            <p className="text-xs text-muted-foreground">Spend your hard-earned spice on virtual goodies</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-sm font-extrabold tabular-nums text-amber-400">
            🌶️ {spice}
          </span>
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        )}

        {/* Products */}
        <div className="custom-scrollbar -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
          {products === null && !error && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-border/50 bg-muted/40" />
              ))}
            </div>
          )}
          {products?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The store is empty — admins can launch products from the admin panel (Shift+A → Store).
            </p>
          )}
          {products?.map((product) => {
            const affordable = spice >= product.price;
            const busy = busyId === product.id;
            const bought = boughtId === product.id;
            return (
              <div
                key={product.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/35 p-3"
              >
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-400/25 bg-amber-500/10 text-2xl">
                  {product.image ? (
                    <img src={product.image} alt="" className="size-full object-contain" />
                  ) : (
                    product.emoji
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-foreground">{product.name}</p>
                  {product.description && (
                    <p className="truncate text-[11px] text-muted-foreground" title={product.description}>
                      {product.description}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] font-bold tabular-nums text-amber-400">🌶️ {product.price}</p>
                </div>
                <button
                  type="button"
                  disabled={busy || (!affordable && !bought)}
                  onClick={() => void buy(product)}
                  className={cn(
                    'shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors',
                    bought
                      ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-300'
                      : affordable
                        ? 'border-amber-400/50 bg-amber-500/80 text-white hover:brightness-110'
                        : 'border-border/60 bg-muted/40 text-muted-foreground',
                    busy && 'opacity-60'
                  )}
                  title={affordable ? `Buy for ${product.price} spice` : `Need ${product.price} spice`}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : bought ? 'Purchased!' : affordable ? 'Buy' : 'Locked'}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-3 shrink-0 text-center text-[10px] text-muted-foreground/70">
          Earn spice: +1 per login · +3/+5/+10 for call QA scores of 70/80/90+
        </p>
      </div>
    </div>
  );
}
