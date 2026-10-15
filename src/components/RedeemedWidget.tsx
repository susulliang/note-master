import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { getApiBase, getStoredToken } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

/** Minimal DASH overview widget — the latest spice-store redemptions
 *  across the whole team, straight from D1. */
export default function RedeemedWidget() {
  const [purchases, setPurchases] = useState<
    Array<{ username: string; productName: string; price: number; createdAt: number }>
  >([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setState('error');
      return;
    }
    let alive = true;
    void fetch(`${getApiBase()}/api/store/purchases`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json() as {
          purchases?: Array<{ username: string; productName: string; price: number; createdAt: number }>;
        };
        setPurchases(data.purchases ?? []);
        setState('ready');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShoppingBag className="size-3.5 text-amber-400" /> Redeemed
        </h3>
        <span className="text-[11px] text-muted-foreground">🌶️ Spice store · latest 100</span>
      </div>
      {state === 'loading' ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading purchases…</p>
      ) : state === 'error' ? (
        <p className="mt-3 text-xs text-muted-foreground">Sign in to see store redemptions.</p>
      ) : purchases.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No redemptions yet — the store is waiting for its first customer.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/30">
          {purchases.map((row, index) => (
            <li key={`${row.username}-${row.createdAt}-${index}`} className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0 truncate font-medium text-foreground">{row.username}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.productName}</span>
              <span className={cn('shrink-0 font-bold tabular-nums text-amber-400')}>−{row.price} 🌶️</span>
              <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                {new Date(row.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
