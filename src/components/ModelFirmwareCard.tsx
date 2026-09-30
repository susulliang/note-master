import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, CircuitBoard, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getLatestFirmwareForModel,
  loadSoftwareUpdatesIndex,
  type SoftwareUpdateEntry,
} from '@/utils/softwareUpdatesData';
import { renderBodyMarkdown } from './SopPanel.md';

/**
 * Newest-firmware card rendered under the Robot Model combobox (v0.2.1).
 * Whenever the agent picks a model, the gridbox expands to show the model's
 * NEWEST OTA firmware version + its full bilingual update notes. The match
 * is fuzzy: "T30S Pro" matches the T30-series entries ("T30 Series"), while
 * "X11" deliberately does NOT match "X1" (digit boundary = different series).
 *
 * The firmware markdown chunks load lazily after first paint — a slim loading
 * row shows until the index resolves. Models without any firmware record
 * (e.g. T20 OMNI) render nothing so the gridbox keeps its compact size.
 */
export default function ModelFirmwareCard({ model }: { model: string }) {
  const [index, setIndex] = useState<SoftwareUpdateEntry[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSoftwareUpdatesIndex().then((idx) => {
      if (alive) setIndex(idx);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Re-expand each time a different model gets picked so the newest
  // firmware is immediately visible.
  useEffect(() => {
    setCollapsed(false);
  }, [model]);

  const latest = useMemo(
    () => (index ? getLatestFirmwareForModel(index, model) : null),
    [index, model]
  );

  if (index === null) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/30 px-2 py-1 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin text-primary" />
        Loading firmware…
      </div>
    );
  }

  if (!latest) return null;

  return (
    <div className="overflow-hidden rounded-md border border-primary/25 bg-primary/[0.04]">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 border-b border-primary/15 bg-primary/10 px-2 py-1 text-left"
      >
        <CircuitBoard className="size-3 shrink-0 text-primary" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Newest Firmware
        </span>
        <span className="shrink-0 rounded bg-accent/20 px-1 text-[10px] font-bold text-accent">
          {latest.version}
        </span>
        <span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground/80">
          {latest.dateLabel}
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground/60 transition-transform',
            collapsed && '-rotate-90'
          )}
        />
      </button>
      {!collapsed && (
        <div className="markdown-body custom-scrollbar max-h-[260px] overflow-y-auto px-2 py-1.5 text-[10px] leading-relaxed">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {latest.models.join(' / ')} · {latest.group}
          </p>
          {renderBodyMarkdown(latest.bodyLines)}
        </div>
      )}
    </div>
  );
}
