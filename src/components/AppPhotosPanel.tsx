import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, Loader2, X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppPhoto {
  name: string;
  path: string;
  w: number;
  h: number;
}

interface AppModel {
  id: string;
  name: string;
  photoCount: number;
  photos: AppPhoto[];
}

interface AppPhotosIndex {
  productTypes: string[];
  models: Record<string, AppModel[]>;
  totalPhotos: number;
}

interface AppPhotosPanelProps {
  onClose: () => void;
}

export default function AppPhotosPanel({ onClose }: AppPhotosPanelProps) {
  const [index, setIndex] = useState<AppPhotosIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string>('DEEBOT');
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [lightbox, setLightbox] = useState<AppPhoto | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/app-photos/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: AppPhotosIndex) => {
        if (cancelled) return;
        setIndex(data);
        // Default to the first model of the first product type.
        const firstType = data.productTypes[0];
        const firstModel = data.models[firstType]?.[0];
        if (firstModel) setActiveModelId(firstModel.id);
      })
      .catch((e) => !cancelled && setError(String(e?.message || e)));
    return () => { cancelled = true; };
  }, []);

  const models = useMemo(() => index?.models[activeType] ?? [], [index, activeType]);
  const activeModel = useMemo(
    () => models.find((m) => m.id === activeModelId) ?? null,
    [models, activeModelId]
  );

  // Load photos for the active model lazily — images use loading="lazy" plus
  // an IntersectionObserver-driven reveal so off-screen photos don't fetch.
  const visibleRefs = useRef<Set<string>>(new Set());
  const [visiblePhotos, setVisiblePhotos] = useState<Set<string>>(new Set());

  // Reset visible set when model changes.
  useEffect(() => {
    visibleRefs.current = new Set();
    setVisiblePhotos(new Set());
  }, [activeModelId]);

  return (
    <div className="flex h-full w-[540px] max-w-[calc(100vw-7rem)] flex-col rounded-2xl border-[1.5px] border-foreground/10 bg-card/30 shadow-[inset_0_1.5px_0_rgba(255,255,255,0.12),0_8px_24px_-6px_rgba(0,0,0,0.24)] backdrop-blur-md backdrop-saturate-125">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-primary" />
          <div>
            <div className="text-[13px] font-semibold text-foreground">App Use Photos</div>
            <div className="text-[10px] text-muted-foreground">
              {index ? `${index.totalPhotos} screenshots across ${index.productTypes.length} product lines` : 'Loading…'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Product type tabs */}
      {index && (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-foreground/10 px-3 py-2">
          {index.productTypes.map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => {
                setActiveType(pt);
                const first = index.models[pt]?.[0];
                if (first) setActiveModelId(first.id);
                setModelListOpen(false);
              }}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition',
                activeType === pt
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              )}
            >
              {pt}
              <span className="ml-1 text-[9px] opacity-60">
                {index.models[pt]?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Model selector dropdown */}
      {index && (
        <div className="relative shrink-0 px-3 py-2">
          <button
            type="button"
            onClick={() => setModelListOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-left transition hover:border-foreground/20"
          >
            <span className="truncate text-[12px] text-foreground">
              {activeModel ? activeModel.name : 'Select model…'}
            </span>
            <span className="ml-2 flex items-center gap-1.5 shrink-0">
              {activeModel && (
                <span className="text-[10px] text-muted-foreground">
                  {activeModel.photoCount} photos
                </span>
              )}
              {modelListOpen ? (
                <ChevronUp className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              )}
            </span>
          </button>

          {modelListOpen && (
            <div className="absolute left-3 right-3 top-[calc(100%-2px)] z-10 max-h-64 overflow-y-auto rounded-lg border border-foreground/10 bg-card/85 shadow-xl backdrop-blur-md backdrop-saturate-125">
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setActiveModelId(m.id);
                    setModelListOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition hover:bg-foreground/5',
                    m.id === activeModelId ? 'bg-primary/10 text-primary' : 'text-foreground'
                  )}
                >
                  <span className="truncate">{m.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                    {m.photoCount}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Photo grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {error && (
          <div className="py-8 text-center text-[12px] text-destructive">
            Failed to load photo index: {error}
          </div>
        )}
        {!index && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading photo database…
          </div>
        )}
        {index && !activeModel && (
          <div className="py-8 text-center text-[12px] text-muted-foreground">
            Select a model to browse its app screenshots.
          </div>
        )}
        {activeModel && (
          <div className="grid grid-cols-3 gap-1.5">
            {activeModel.photos.map((photo) => (
              <PhotoTile
                key={photo.path}
                photo={photo}
                visible={visiblePhotos.has(photo.path)}
                onVisible={() => {
                  if (!visibleRefs.current.has(photo.path)) {
                    visibleRefs.current.add(photo.path);
                    setVisiblePhotos((prev) => {
                      const next = new Set(prev);
                      next.add(photo.path);
                      return next;
                    });
                  }
                }}
                onClick={() => setLightbox(photo)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          <div className="relative max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.path}
              alt={lightbox.name}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <div className="mt-2 px-1 text-center">
              <span className="truncate text-[12px] text-white/80">{lightbox.name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A single photo tile that only loads its <img> once it scrolls into view. */
function PhotoTile({
  photo,
  visible,
  onVisible,
  onClick,
}: {
  photo: AppPhoto;
  visible: boolean;
  onVisible: () => void;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (visible || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            onVisible();
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, onVisible]);

  // Approximate aspect ratio placeholder so the grid doesn't jump.
  const aspect = photo.w && photo.h ? photo.w / photo.h : 9 / 16;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-md border border-foreground/10 bg-foreground/[0.03] transition hover:border-primary/40"
      style={{ aspectRatio: `${aspect}` }}
      title={photo.name}
    >
      {visible ? (
        <img
          src={photo.path}
          alt={photo.name}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground/40">
          <ImageIcon className="size-5" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 opacity-0 transition group-hover:opacity-100">
        <ZoomIn className="size-3 text-white/80" />
        <span className="truncate text-[9px] text-white/80">{photo.name}</span>
      </div>
    </button>
  );
}
