import { useMemo } from 'react';
import { FileText, X, MousePointerClick } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { parseTemplate, type AmrTemplate } from '@/lib/amr-templates';
import { toast } from 'sonner';

interface TemplatePanelProps {
  template: AmrTemplate | null;
  onClose: () => void;
  /** Appends the clicked line to the Resolution Summary (like quick inserts) */
  onInsertLine: (line: string) => void;
}

/**
 * Glassmorphism viewer for an AMR template. The template's HTML is parsed
 * and re-rendered with our global theme styles (no foreign CSS leaks in).
 * Every content line is clickable — clicking appends it to the Resolution
 * Summary, exactly like a quick-insert chip.
 */
export default function TemplatePanel({ template, onClose, onInsertLine }: TemplatePanelProps) {
  const parsed = useMemo(
    () => (template ? parseTemplate(template.html) : null),
    [template]
  );

  const handleInsert = (text: string) => {
    onInsertLine(text);
    toast.success('Added to Resolution Summary');
  };

  return (
    <Dialog open={template !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden border-foreground/15 bg-card/70 shadow-2xl backdrop-blur-3xl">
        {template && parsed && (
          <>
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileText className="size-5 shrink-0 text-primary" />
                <span className="truncate">{parsed.title || template.name}</span>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">
                  AMR Template #{template.id}
                </span>
                {parsed.meta.map((m) => (
                  <span key={m} className="truncate">
                    {m}
                  </span>
                ))}
              </DialogDescription>
            </DialogHeader>

            <div className="mb-2 flex shrink-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
              <MousePointerClick className="size-3.5 shrink-0" />
              Click any line below to add it to the Resolution Summary
            </div>

            <div className="custom-scrollbar -mr-2 flex-1 overflow-y-auto pr-2">
              <div className="space-y-1.5">
                {parsed.lines.map((line, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleInsert(line.text)}
                    title="Add to Resolution Summary"
                    className="group block w-full rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-left text-sm leading-relaxed text-foreground backdrop-blur-sm transition-all duration-150 hover:border-primary/50 hover:bg-primary/10 hover:shadow-[0_0_16px_rgba(35,134,54,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="mr-2 inline-flex size-5 shrink-0 select-none items-center justify-center rounded bg-foreground/10 text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-primary/25 group-hover:text-primary">
                      {idx + 1}
                    </span>
                    {line.text}
                  </button>
                ))}
                {parsed.lines.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No content lines in this template.
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-4" />
                Close
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
