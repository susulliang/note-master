import { useMemo } from 'react';
import { FileText, X, MousePointerClick, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { parseTemplate } from '@/lib/amr-templates';
import { toast } from 'sonner';
/**
 * Glassmorphism viewer for an AMR template. The template's HTML is parsed
 * and re-rendered with our global theme styles (no foreign CSS leaks in).
 * The live Resolution Summary sits at the top so added lines are visible
 * immediately; every content line is clickable — clicking appends it to
 * the Resolution Summary, exactly like a quick-insert chip.
 */
export default function TemplatePanel({ template, onClose, onInsertLine, resolutionText, onResolutionChange, }) {
    const parsed = useMemo(() => (template ? parseTemplate(template) : null), [template]);
    const handleInsert = (text) => {
        onInsertLine(text);
        toast.success('Added to Resolution Summary');
    };
    return (<Dialog open={template !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        {template && parsed && (<>
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <FileText className="size-5 shrink-0 text-primary"/>
                <span className="truncate">{parsed.title || template.name}</span>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
                <span className="uppercase tracking-wider">
                  {template.kind === 'amr'
                ? 'AMR Template'
                : template.kind === 'tbs'
                    ? 'TBS Steps'
                    : template.kind === 'err'
                        ? 'Error Code'
                        : 'FAQ'}{' '}
                  #{template.id}
                </span>
                <span className="rounded-full bg-foreground/10 px-1.5 text-[9px] text-muted-foreground">
                  {template.category}
                </span>
                {parsed.meta.map((m) => (<span key={m} className="truncate">
                    {m}
                  </span>))}
              </DialogDescription>
            </DialogHeader>

            {/* Live Resolution Summary — mirrors the canvas node */}
            <div className="shrink-0">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-primary/70"/>
                Resolution Summary
              </div>
              <Textarea value={resolutionText} onChange={(e) => onResolutionChange(e.target.value)} rows={3} spellCheck={false} className="resize-none text-xs font-semibold leading-relaxed" placeholder="Added lines will appear here..."/>
            </div>

            <div className="my-2 flex shrink-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
              <MousePointerClick className="size-3.5 shrink-0"/>
              Click any line below to add it to the Resolution Summary
            </div>

            <div className="custom-scrollbar -mr-2 flex-1 overflow-y-auto pr-2">
              <div className="space-y-1.5">
                {parsed.lines.map((line, idx) => (<button key={idx} type="button" onClick={() => handleInsert(line.text)} title="Add to Resolution Summary" className="glass-chip group block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="mr-2 inline-flex size-5 shrink-0 select-none items-center justify-center rounded bg-foreground/10 text-[10px] font-semibold text-muted-foreground transition-colors group-hover:bg-primary/25 group-hover:text-primary">
                      {idx + 1}
                    </span>
                    {line.text}
                  </button>))}
                {parsed.lines.length === 0 && (<p className="py-8 text-center text-xs font-semibold text-muted-foreground">
                    No content lines in this template.
                  </p>)}
              </div>
            </div>

            <div className="flex shrink-0 justify-end pt-2">
              <button type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground">
                <X className="size-4"/>
                Close
              </button>
            </div>
          </>)}
      </DialogContent>
    </Dialog>);
}
