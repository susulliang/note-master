/**
 * Admin panel — admin-only management console, toggled with Shift+A (only
 * available while an admin account is logged in; the hotkey is a no-op for
 * everyone else). Two tabs:
 *
 *   • Privileges — per-user Dash / Roster / Trak rail visibility toggles and
 *     force-deleting accounts (the username can then register again).
 *   • Store — launch / edit / retire spice-store products (virtual items,
 *     e.g. "Cat food" to feed the cat assistant).
 *
 * All data lives in D1 via the Worker auth API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, RefreshCw, ShieldCheck, ShoppingBag, Trash2, UserCog, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  adminDeleteStoreProduct,
  adminDeleteUser,
  adminListStore,
  adminListUsers,
  adminSaveStoreProduct,
  adminSetPrivileges,
  type AdminUserRow,
  type StoreProduct,
} from '@/lib/auth-client';

interface AdminPanelProps {
  onClose: () => void;
}

type PrivilegeKey = 'dash' | 'roster' | 'trak';

const PRIVILEGE_LABELS: { key: PrivilegeKey; label: string }[] = [
  { key: 'dash', label: 'DASH' },
  { key: 'roster', label: 'Roster' },
  { key: 'trak', label: 'TRAK' },
];

type AdminTab = 'privileges' | 'store';

const TABS: { key: AdminTab; label: string; icon: typeof ShieldCheck }[] = [
  { key: 'privileges', label: 'Privileges', icon: UserCog },
  { key: 'store', label: 'Store', icon: ShoppingBag },
];

/* ── Product editor draft (shared by the create form and inline edits) ────── */
interface ProductDraft {
  id?: string;
  name: string;
  emoji: string;
  description: string;
  price: string;
  active: boolean;
  /** 'food' products feed the cat companion. */
  category: 'food' | 'other';
  image: string | null;
}

const EMPTY_DRAFT: ProductDraft = { name: '', emoji: '🎁', description: '', price: '5', active: true, category: 'other', image: null };

/**
 * Client-side product-image processing: center-crops to a square and
 * downscales to at most 256×256. The source format is preserved — PNG
 * exports as PNG (transparent pixels survive), JPEG exports as JPEG.
 * Returns a data URL small enough to embed in the D1 row.
 */
async function fileToProductImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|jpg)$/.test(file.type))
    throw new Error('Only PNG or JPG images are supported');
  const bitmap = await createImageBitmap(file);
  try {
    // Center square crop.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const size = Math.min(256, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    const keepPng = file.type === 'image/png';
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const { user, refresh: refreshSelf } = useAuth();
  const [tab, setTab] = useState<AdminTab>('privileges');

  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgDrag, setImgDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await adminListUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setError(null);
    try {
      setProducts(await adminListStore());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab === 'store' && products === null) void loadProducts();
  }, [tab, products, loadProducts]);

  const togglePrivilege = async (row: AdminUserRow, key: PrivilegeKey) => {
    if (busyName) return;
    setBusyName(row.username);
    setError(null);
    try {
      const updated = await adminSetPrivileges(row.username, { [key]: !row.privileges[key] });
      setUsers((prev) => (prev ? prev.map((u) => (u.username === updated.username ? { ...u, ...updated } : u)) : prev));
      // If the admin edits their own privileges, sync the live session too.
      if (user?.username === updated.username) void refreshSelf();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update privileges');
    } finally {
      setBusyName(null);
    }
  };

  const forceDelete = async (row: AdminUserRow) => {
    if (busyName) return;
    setBusyName(row.username);
    setError(null);
    try {
      await adminDeleteUser(row.username);
      setUsers((prev) => (prev ? prev.filter((u) => u.username !== row.username) : prev));
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setBusyName(null);
    }
  };

  /** Process a picked/dropped image into the draft (256×256 max, format kept). */
  const acceptImage = async (file: File | undefined | null) => {
    if (!file || imgBusy) return;
    setImgBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToProductImage(file);
      setDraft((d) => (d ? { ...d, image: dataUrl } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the image');
    } finally {
      setImgBusy(false);
    }
  };

  const startEdit = (product: StoreProduct) =>    setDraft({
      id: product.id,
      name: product.name,
      emoji: product.emoji,
      description: product.description,
      price: String(product.price),
      active: product.active,
      category: product.category,
      image: product.image,
    });

  const saveDraft = async () => {
    if (!draft || busyProduct) return;
    const price = Math.round(Number(draft.price));
    if (!draft.name.trim()) return setError('Product name is required');
    if (!Number.isFinite(price) || price < 1) return setError('Price must be ≥ 1 spice');
    setBusyProduct(draft.id ?? '__new__');
    setError(null);
    try {
      await adminSaveStoreProduct({
        id: draft.id,
        name: draft.name.trim(),
        emoji: draft.emoji.trim() || '🎁',
        description: draft.description.trim(),
        price,
        active: draft.active,
        category: draft.category,
        image: draft.image,
      });
      setDraft(null);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setBusyProduct(null);
    }
  };

  const deleteProduct = async (product: StoreProduct) => {
    if (busyProduct) return;
    setBusyProduct(product.id);
    setError(null);
    try {
      await adminDeleteStoreProduct(product.id);
      setProducts((prev) => (prev ? prev.filter((p) => p.id !== product.id) : prev));
      setConfirmDeleteProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setBusyProduct(null);
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
        aria-label="Admin panel"
        className="glass-panel relative flex max-h-[80vh] w-[min(560px,calc(100vw-32px))] flex-col rounded-2xl border-sky-400/30 p-6 shadow-2xl"
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
        <div className="mb-3 flex items-center gap-3">
          <div className="glass-panel flex size-11 items-center justify-center rounded-xl border-sky-400/40 bg-sky-400/10">
            <ShieldCheck className="size-6 text-sky-300" />
          </div>
          <div className="flex-1">
            <h2 className="font-mono text-xl font-extrabold tracking-tight text-foreground">Admin Panel</h2>
            <p className="text-xs text-muted-foreground">
              {tab === 'privileges'
                ? users
                  ? `${users.length} account${users.length === 1 ? '' : 's'} · toggles apply instantly`
                  : 'Loading accounts…'
                : products
                  ? `${products.length} product${products.length === 1 ? '' : 's'} · live in the spice store`
                  : 'Loading products…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (tab === 'privileges' ? void load() : void loadProducts())}
            className="glass-btn rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Reload"
          >
            <RefreshCw
              className={cn('size-4', (tab === 'privileges' ? users === null : products === null) && 'animate-spin')}
            />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex shrink-0 items-center rounded-lg border border-border/60 bg-card/40 p-0.5" role="tablist">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
                tab === key
                  ? 'bg-sky-400/20 text-sky-300'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        )}

        {/* ── Tab: Privileges ── */}
        {tab === 'privileges' && (
          <div className="custom-scrollbar -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            {users === null && !error && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl border border-border/50 bg-muted/40" />
                ))}
              </div>
            )}
            {users?.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No accounts registered yet.</p>
            )}
            {users?.map((row) => {
              const isAdminRow = row.isAdmin;
              const busy = busyName === row.username;
              return (
                <div
                  key={row.username}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    isAdminRow ? 'border-sky-400/40 bg-sky-500/10' : 'border-border/60 bg-background/35'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <UserCog className={cn('size-4 shrink-0', isAdminRow ? 'text-sky-300' : 'text-muted-foreground')} />
                    <p className="flex-1 truncate text-sm font-extrabold text-foreground">
                      {row.username}
                      {isAdminRow && (
                        <span className="ml-2 rounded bg-sky-400/20 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-sky-300">
                          Admin
                        </span>
                      )}
                      {user?.username === row.username && (
                        <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">(you)</span>
                      )}
                      <span className="ml-1.5 text-[10px] font-bold tabular-nums text-amber-400">🌶️ {row.spice}</span>
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {PRIVILEGE_LABELS.map(({ key, label }) => {
                      const on = row.privileges[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={busy}
                          aria-pressed={on}
                          onClick={() => void togglePrivilege(row, key)}
                          className={cn(
                            'rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors',
                            on
                              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                              : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70',
                            busy && 'opacity-50'
                          )}
                          title={`${on ? 'Hide' : 'Show'} ${label} for ${row.username}`}
                        >
                          {label} {on ? '✓' : '✕'}
                        </button>
                      );
                    })}

                    {/* Force delete — disabled for the admin account */}
                    {isAdminRow ? (
                      <span className="ml-auto text-[10px] text-muted-foreground/70">protected</span>
                    ) : confirmDelete === row.username ? (
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void forceDelete(row)}
                          className="rounded-lg border border-red-400/60 bg-red-500/80 px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110"
                        >
                          {busy ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDelete(row.username)}
                        className="ml-auto flex items-center gap-1 rounded-lg border border-red-400/40 px-2.5 py-1 text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                        title={`Force-delete ${row.username} (they can register again)`}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="pt-2 text-center text-[10px] text-muted-foreground/70">
              Force-deleted users can register the same username again
            </p>
          </div>
        )}

        {/* ── Tab: Store ── */}
        {tab === 'store' && (
          <div className="custom-scrollbar -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            {/* Editor — create new or edit existing */}
            {draft ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.06] p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  {draft.id ? `Edit: ${draft.name}` : 'New product'}
                </p>
                {/* Product image — drag & drop or upload, cropped to ≤256×256 */}
                {draft.image ? (
                  <div className="mb-2 flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-2">
                    <img
                      src={draft.image}
                      alt="Product preview"
                      className="size-14 shrink-0 rounded-md object-contain"
                    />
                    <p className="flex-1 text-[10px] leading-snug text-muted-foreground">
                      Image attached — downscaled to ≤256×256.
                      <br />
                      PNG transparency is preserved.
                    </p>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, image: null })}
                      className="shrink-0 rounded-lg border border-red-400/40 p-1.5 text-red-300 transition-colors hover:bg-red-500/15"
                      title="Remove image"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setImgDrag(true);
                    }}
                    onDragLeave={() => setImgDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setImgDrag(false);
                      void acceptImage(e.dataTransfer.files?.[0]);
                    }}
                    className={cn(
                      'mb-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-[10.5px] font-semibold transition-colors',
                      imgDrag
                        ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                        : 'border-border/60 text-muted-foreground hover:border-amber-400/50 hover:text-foreground'
                    )}
                  >
                    {imgBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="size-3.5" />
                    )}
                    Drop a PNG / JPG here or click to upload — auto-cropped to 256×256
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    void acceptImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <div className="grid grid-cols-[64px_1fr] gap-2">
                  <div className="space-y-2">
                    <input
                      value={draft.emoji}
                      onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                      className="w-full rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-center text-lg"
                      aria-label="Emoji"
                      maxLength={4}
                    />
                    <input
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d]/g, '') })}
                      className="w-full rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-center text-xs font-bold tabular-nums text-amber-400"
                      aria-label="Price in spice"
                      placeholder="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="w-full rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-xs font-bold"
                      aria-label="Product name"
                      placeholder="Cat food"
                      maxLength={60}
                    />
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="custom-scrollbar w-full resize-none rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-[11px]"
                      aria-label="Description"
                      placeholder="Feed the cat assistant — she works hard for you 🐱"
                      rows={2}
                      maxLength={200}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={draft.category === 'food'}
                          onChange={(e) => setDraft({ ...draft, category: e.target.checked ? 'food' : 'other' })}
                          className="accent-amber-500"
                        />
                        🐱 Food (feeds the cat)
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                          className="accent-emerald-500"
                        />
                        Live in store
                      </label>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!!busyProduct}
                          onClick={() => void saveDraft()}
                          className="flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-500/80 px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110"
                        >
                          {busyProduct ? <Loader2 className="size-3.5 animate-spin" /> : null} Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft(null)}
                          className="rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDraft({ ...EMPTY_DRAFT })}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-400/50 px-3 py-2.5 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-500/10"
              >
                <Plus className="size-4" /> Launch a store product
              </button>
            )}

            {/* Product list */}
            {products === null && !error && (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl border border-border/50 bg-muted/40" />
                ))}
              </div>
            )}
            {products?.length === 0 && draft === null && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No products yet — launch the first one for your team.
              </p>
            )}
            {products?.map((product) => {
              const busy = busyProduct === product.id;
              return (
                <div
                  key={product.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3',
                    product.active ? 'border-border/60 bg-background/35' : 'border-border/40 bg-muted/20 opacity-70'
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-400/25 bg-amber-500/10 text-xl">
                    {product.image ? (
                      <img src={product.image} alt="" className="size-full object-contain" />
                    ) : (
                      product.emoji
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-foreground">
                      {product.name}
                      {!product.active && (
                        <span className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          hidden
                        </span>
                      )}
                    </p>
                    {product.description && (
                      <p className="truncate text-[11px] text-muted-foreground" title={product.description}>
                        {product.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] font-bold tabular-nums text-amber-400">🌶️ {product.price}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(product)}
                      className="rounded-lg border border-border/60 p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      title={`Edit ${product.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {confirmDeleteProduct === product.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deleteProduct(product)}
                          className="rounded-lg border border-red-400/60 bg-red-500/80 px-2 py-1 text-[10px] font-bold text-white hover:brightness-110"
                        >
                          {busy ? '…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProduct(null)}
                          className="rounded-lg border border-border/60 px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDeleteProduct(product.id)}
                        className="rounded-lg border border-red-400/40 p-1.5 text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                        title={`Delete ${product.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            <p className="pt-2 text-center text-[10px] text-muted-foreground/70">
              Products are virtual — spice is earned via logins (+1) and call QA scores (+3/+5/+10)
            </p>
          </div>
        )}

        <p className="mt-3 shrink-0 text-center text-[10px] text-muted-foreground/70">
          Shift+A toggles this panel
        </p>
      </div>
    </div>
  );
}
