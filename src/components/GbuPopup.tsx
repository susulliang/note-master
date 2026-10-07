import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GBU_MODELS, GBU_MODEL_COUNT, type GbuModelEntry } from '@/data/gbuModels';

interface GbuPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Fullscreen modal showing the GBU (North America) internal model code →
 *  marketing name lookup table. Fetched once from the Feishu "Barcode" sheet
 *  and bundled as static data (src/data/gbuModels.ts). Two-column search
 *  filters both the internal Model # and the marketing name. */
export default function GbuPopup({ open, onOpenChange }: GbuPopupProps) {
  const [query, setQuery] = useState('');

  const rows = useMemo<GbuModelEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GBU_MODELS;
    return GBU_MODELS.filter(
      (r) =>
        r.internal.toLowerCase().includes(q) ||
        r.marketing.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="glass-panel flex max-h-[92vh] w-[95vw] max-w-[1100px] flex-col gap-0 overflow-hidden bg-card/55! p-0 backdrop-blur-2xl backdrop-saturate-150"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-lg font-bold tracking-tight">
              GBU Model Lookup
            </DialogTitle>
            <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {GBU_MODEL_COUNT} models
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search internal code or marketing name…"
              className="pl-9 font-mono text-sm"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card/70 backdrop-blur-md">
              <tr className="text-left">
                <th className="border-b border-border/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Internal Model Name (Model #)
                </th>
                <th className="border-b border-border/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Marketing Model Name
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.internal}-${r.marketing}-${i}`}
                  className="border-b border-border/30 transition-colors hover:bg-foreground/5"
                >
                  <td className="px-4 py-2 font-mono text-[13px] text-accent">
                    {r.internal || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2 text-[13px] text-foreground">
                    {r.marketing || <span className="text-muted-foreground/40">—</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No models match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 border-t border-border/60 px-5 py-2.5 text-[11px] text-muted-foreground">
          Source: 史上最全GBU (北美) · Barcode sheet · {rows.length} of {GBU_MODEL_COUNT} shown
        </div>
      </DialogContent>
    </Dialog>
  );
}
