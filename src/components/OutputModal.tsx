import { useState, useCallback, useEffect, useMemo } from 'react';
import { Copy, Check, X, Pencil, Eye, Code2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface OutputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteText: string;
  onSaveToHistory?: (finalText: string) => void;
}

/** Contact fields offered as click-to-copy chips (bullet-dotted) */
const CONTACT_FIELD_LABELS = ['Customer Name', 'Contact number', 'Email address'] as const;

/** Strip markdown **bold** markers so chip values & copied contact fields
 *  are plain-text friendly. */
function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*/g, '');
}

/** Convert a raw markdown note string into safe(ish) HTML for the clipboard
 *  "text/html" flavour. Uses remark-gfm to render the same way the preview
 *  panel does. We deliberately avoid sanitisation libraries here — the
 *  payload is user-authored ticket text (no <script> risk in practice), and
 *  rendering via ReactMarkdown guarantees plain markdown output. */
function markdownToHtml(md: string): string {
  // Cheap fallback renderer: build an HTML string the same way ReactMarkdown
  // would. Real rendering would require re-running remark/rehype in a string
  // pipeline; to stay dependency-free we mimic the key pieces:
  //   - **bold**
  //   - line breaks inside paragraph blocks
  //   - newlines -> paragraphs where blank lines separate blocks
  // This keeps the clipboard HTML flavour visually close to the preview
  // without introducing a rehype-stringify dependency.
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const paragraphBlocks = md.split(/\n\s*\n/);
  const paragraphs = paragraphBlocks.map((block) => {
    const lines = block.split('\n').map((l) => escape(l));
    // Inline bold: **text** → <strong>text</strong>
    const inlined = lines.map((l) =>
      l.replace(/\*\*([^*]+?)\*\*/g, (_m, inner: string) => `<strong>${inner}</strong>`)
    );
    return `<p style="margin:0 0 0.6em;line-height:1.55">${inlined.join('<br/>')}</p>`;
  });
  return `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#c9d1d9;background:#0d1117;padding:12px;border-radius:8px">${paragraphs.join('')}</div>`;
}

export default function OutputModal({
  open,
  onOpenChange,
  noteText,
  onSaveToHistory,
}: OutputModalProps) {
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState(noteText);

  // Parse contact fields out of the (possibly edited) note text.
  // Chip values are shown & copied without the **…** bold markers that the
  // LLM may have wrapped names / numbers in, so pasting into a CRM field
  // stays clean.
  const contactFields = useMemo(() => {
    const fields: { label: string; raw: string; value: string }[] = [];
    for (const label of CONTACT_FIELD_LABELS) {
      const match = editableText.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
      const raw = match?.[1]?.trim() ?? '';
      if (!raw || raw === 'N/A') continue;
      const value = stripMarkdownBold(raw);
      if (value) fields.push({ label, raw, value });
    }
    return fields;
  }, [editableText]);

  const handleCopyField = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard!`);
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  }, []);

  // Re-sync local editable text whenever the modal opens or noteText changes.
  // Auto-copy on open — write BOTH the markdown source (text/plain, default
  // paste) and a rendered HTML flavour so pasting into Confluence / Zendesk
  // / Gmail preserves the bold highlights.
  useEffect(() => {
    if (open) {
      setEditableText(noteText);
      writeClipboardDual(noteText).then(
        () => toast.success('Ticket note auto-copied (rich text ready).'),
        () => {
          /* Clipboard unavailable — manual Copy stays available */
        }
      );
    }
  }, [open, noteText]);

  /** Write BOTH plain text (markdown source) and HTML flavours to the
   *  clipboard. Apps that ask for text/html get the bold-rendered version;
   *  plain text editors get the raw **…** source. */
  const writeClipboardDual = useCallback(async (text: string): Promise<void> => {
    const html = markdownToHtml(text);
    if (window.ClipboardItem) {
      try {
        const item = new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
        return;
      } catch {
        /* fall back to plain-text copy below */
      }
    }
    await navigator.clipboard.writeText(text);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await writeClipboardDual(editableText);
      setCopied(true);
      toast.success('Ticket note copied (with rich-text bold)!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  }, [editableText, writeClipboardDual]);

  // Save the edited note to history once when the modal closes
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && onSaveToHistory) {
        onSaveToHistory(editableText);
      }
      onOpenChange(next);
    },
    [editableText, onSaveToHistory, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-primary">📋</span>
            Ticket Note Generated
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Pencil className="size-3.5" />
            Preview the bold highlights above, then edit the raw note below. Copy writes both rich and plain text.
          </DialogDescription>
        </DialogHeader>

        {/* Click-to-copy contact chips (bullet-dotted) */}
        {contactFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contactFields.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => handleCopyField(f.label, f.value)}
                title={`Copy ${f.label} to clipboard`}
                className="glass-chip flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <span className="shrink-0 text-muted-foreground">{f.label}:</span>
                <span className="truncate text-foreground">{f.value}</span>
                <Copy className="size-3 shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        )}

        {/* (C2) Top: Markdown PREVIEW — customer LLM-bolded issues and
         * resolutions render as visual strong text. Uses the same monospace
         * base so line length mirrors the editable source below. */}
        <div className="rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <Eye className="size-3.5 text-primary" />
            <span className="font-semibold tracking-wide text-primary">PREVIEW</span>
            <span className="ml-auto opacity-70">Auto-bold highlights are rendered here</span>
          </div>
          <div className="glass-preview max-h-[38vh] overflow-auto px-4 py-3 text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-1.5 whitespace-pre-wrap break-words text-foreground font-mono last:mb-0">
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold text-primary-foreground/95 bg-primary/15 px-1 rounded-sm ring-1 ring-primary/30">
                    {children}
                  </strong>
                ),
                a: ({ href, children }) => (
                  <a href={href} className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
                ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
                code: ({ children }) => (
                  <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{children}</code>
                ),
              }}
            >
              {editableText}
            </ReactMarkdown>
          </div>
        </div>

        {/* (C2) Bottom: editable SOURCE textarea — raw **…** markdown visible,
         *  so the agent can manually adjust bold emphasis, copy the raw
         *  string, or paste it back into a ticket system that supports md. */}
        <div className="rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <Code2 className="size-3.5 text-accent" />
            <span className="font-semibold tracking-wide text-accent">SOURCE</span>
            <span className="ml-auto opacity-70">Edit here — **bold** drives the preview above</span>
          </div>
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            spellCheck={false}
            className="glass-field max-h-[30vh] min-h-[150px] w-full resize-none whitespace-pre-wrap break-words rounded-b-xl bg-transparent p-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:bg-card/80"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="text-xs text-muted-foreground">
            Copy writes <span className="font-mono text-accent">text/html</span> (bold) and{' '}
            <span className="font-mono text-accent">text/plain</span> (markdown) simultaneously.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} className="gap-1.5">
              <X className="size-4" />
              Close
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditableText(noteText)}
              className="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Reset to original
            </Button>
            <Button onClick={handleCopy} className="gap-1.5">
              {copied ? (
                <>
                  <Check className="size-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy Rich + Plain
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
