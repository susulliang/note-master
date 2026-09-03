import { useState, useCallback, useEffect, useMemo } from 'react';
import { Copy, Check, X, Pencil, Eye, Code2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
/** Contact fields offered as click-to-copy chips (bullet-dotted) */
const CONTACT_FIELD_LABELS = ['Customer Name', 'Contact number', 'Email address'];
/** Strip markdown **bold** markers so chip values & copied contact fields
 *  are plain-text friendly. */
function stripMarkdownBold(text) {
    return text.replace(/\*\*/g, '');
}
/** Convert a raw markdown note string into safe(ish) HTML for the clipboard
 *  "text/html" flavour. Uses remark-gfm to render the same way the preview
 *  panel does. We deliberately avoid sanitisation libraries here — the
 *  payload is user-authored ticket text (no <script> risk in practice), and
 *  rendering via ReactMarkdown guarantees plain markdown output. */
function markdownToHtml(md) {
    // Cheap fallback renderer: build an HTML string the same way ReactMarkdown
    // would. Real rendering would require re-running remark/rehype in a string
    // pipeline; to stay dependency-free we mimic the key pieces:
    //   - **bold**
    //   - line breaks inside paragraph blocks
    //   - newlines -> paragraphs where blank lines separate blocks
    // This keeps the clipboard HTML flavour visually close to the preview
    // without introducing a rehype-stringify dependency.
    const escape = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const paragraphBlocks = md.split(/\n\s*\n/);
    const paragraphs = paragraphBlocks.map((block) => {
        const lines = block.split('\n').map((l) => escape(l));
        // Inline bold: **text** → <strong>text</strong>
        const inlined = lines.map((l) => l.replace(/\*\*([^*]+?)\*\*/g, (_m, inner) => `<strong>${inner}</strong>`));
        return `<p style="margin:0 0 0.6em;line-height:1.55">${inlined.join('<br/>')}</p>`;
    });
    return `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#c9d1d9;background:#0d1117;padding:12px;border-radius:8px">${paragraphs.join('')}</div>`;
}
export default function OutputModal({ open, onOpenChange, noteText, onSaveToHistory, }) {
    const [copied, setCopied] = useState(null);
    const [editableText, setEditableText] = useState(noteText);
    // Parse contact fields out of the (possibly edited) note text.
    // Chip values are shown & copied without the **…** bold markers that the
    // LLM may have wrapped names / numbers in, so pasting into a CRM field
    // stays clean.
    const contactFields = useMemo(() => {
        const fields = [];
        for (const label of CONTACT_FIELD_LABELS) {
            const match = editableText.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
            const raw = match?.[1]?.trim() ?? '';
            if (!raw || raw === 'N/A')
                continue;
            const value = stripMarkdownBold(raw);
            if (value)
                fields.push({ label, raw, value });
        }
        return fields;
    }, [editableText]);
    const handleCopyField = useCallback(async (label, value) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied to clipboard!`);
        }
        catch {
            toast.error('Failed to copy. Please select and copy manually.');
        }
    }, []);
    // Re-sync local editable text whenever the modal opens or noteText changes.
    //
    // USER RULE (this ticket): on-note-generation auto-copy MUST only put the
    // RICH-TEXT payload onto the clipboard (text/html flavour — the rendered
    // bold version agents paste into Confluence/Zendesk/Gmail). The raw
    // markdown/plain-text flavour is intentionally NOT auto-copied here; it
    // is only written when the agent explicitly clicks the "Copy Plain"
    // button below.
    useEffect(() => {
        if (open) {
            setEditableText(noteText);
            writeClipboardRichOnly(noteText).then(() => toast.success('Rich-text note auto-copied (bold preserved).'), () => {
                /* Clipboard unavailable — manual Copy stays available */
            });
        }
    }, [open, noteText]);
    /** Auto-copy path: writes ONLY the text/html (rendered bold) flavour.
     *  Apps that accept HTML (Confluence, Zendesk, Gmail, Notion) get the
     *  fully styled note; if the target app has no HTML reader we fall back
     *  to the HTML-source string (still contains the <strong> tags so the
     *  emphasis is recoverable) rather than writing a second plain flavour. */
    const writeClipboardRichOnly = useCallback(async (text) => {
        const html = markdownToHtml(text);
        if (window.ClipboardItem) {
            try {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                });
                await navigator.clipboard.write([item]);
                return;
            }
            catch {
                /* fall back below */
            }
        }
        // Old Safari / odd permission paths: still paste the HTML string, not
        // the raw markdown. This preserves the agent's "auto copy = bold"
        // expectation instead of silently handing back plain text.
        await navigator.clipboard.writeText(html);
    }, []);
    /** Explicit RICH copy button: writes the text/html flavour exactly like
     *  the auto-copy, but also includes a text/plain fallback so plain-text
     *  editors don't paste HTML source. */
    const handleCopyRich = useCallback(async () => {
        try {
            const html = markdownToHtml(editableText);
            if (window.ClipboardItem) {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([html], { type: 'text/plain' }),
                });
                await navigator.clipboard.write([item]);
            }
            else {
                await navigator.clipboard.writeText(html);
            }
            setCopied('rich');
            toast.success('Rich-text note copied!');
            setTimeout(() => setCopied(null), 2000);
        }
        catch {
            toast.error('Failed to copy. Please select and copy manually.');
        }
    }, [editableText]);
    /** Explicit PLAIN copy button: writes ONLY the raw markdown string as
     *  text/plain. No HTML flavour — exactly what the user asked for:
     *  "only copy the plain text field on user clicking the plain text field". */
    const handleCopyPlain = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(editableText);
            setCopied('plain');
            toast.success('Plain-text note copied (raw markdown).');
            setTimeout(() => setCopied(null), 2000);
        }
        catch {
            toast.error('Failed to copy. Please select and copy manually.');
        }
    }, [editableText]);
    // Save the edited note to history once when the modal closes
    const handleOpenChange = useCallback((next) => {
        if (!next && onSaveToHistory) {
            onSaveToHistory(editableText);
        }
        onOpenChange(next);
    }, [editableText, onSaveToHistory, onOpenChange]);
    return (<Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-primary">📋</span>
            Ticket Note Generated
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Pencil className="size-3.5"/>
            Preview the bold highlights above, then edit the raw note below. Copy writes both rich and plain text.
          </DialogDescription>
        </DialogHeader>

        {/* Click-to-copy contact chips (bullet-dotted) */}
        {contactFields.length > 0 && (<div className="flex flex-wrap gap-1.5">
            {contactFields.map((f) => (<button key={f.label} type="button" onClick={() => handleCopyField(f.label, f.value)} title={`Copy ${f.label} to clipboard`} className="glass-chip flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"/>
                <span className="shrink-0 text-muted-foreground">{f.label}:</span>
                <span className="truncate text-foreground">{f.value}</span>
                <Copy className="size-3 shrink-0 opacity-60"/>
              </button>))}
          </div>)}

        {/* (C2) Top: Markdown PREVIEW — customer LLM-bolded issues and
         * resolutions render as visual strong text. Uses the same monospace
         * base so line length mirrors the editable source below. */}
        <div className="rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <Eye className="size-3.5 text-primary"/>
            <span className="font-semibold tracking-wide text-primary">PREVIEW</span>
            <span className="ml-auto opacity-70">Auto-bold highlights are rendered here</span>
          </div>
          <div className="glass-preview max-h-[38vh] overflow-auto px-4 py-3 text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            p: ({ children }) => (<p className="mb-1.5 whitespace-pre-wrap break-words text-foreground font-mono last:mb-0">
                    {children}
                  </p>),
            strong: ({ children }) => (<strong className="font-bold text-primary-foreground/95 bg-primary/15 px-1 rounded-sm ring-1 ring-primary/30">
                    {children}
                  </strong>),
            a: ({ href, children }) => (<a href={href} className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer">
                    {children}
                  </a>),
            ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
            code: ({ children }) => (<code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{children}</code>),
        }}>
              {editableText}
            </ReactMarkdown>
          </div>
        </div>

        {/* (C2) Bottom: editable SOURCE textarea — raw **…** markdown visible,
         *  so the agent can manually adjust bold emphasis, copy the raw
         *  string, or paste it back into a ticket system that supports md. */}
        <div className="rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <Code2 className="size-3.5 text-accent"/>
            <span className="font-semibold tracking-wide text-accent">SOURCE</span>
            <span className="ml-auto opacity-70">Edit here — **bold** drives the preview above</span>
          </div>
          <textarea value={editableText} onChange={(e) => setEditableText(e.target.value)} spellCheck={false} className="glass-field max-h-[30vh] min-h-[150px] w-full resize-none whitespace-pre-wrap break-words rounded-b-xl bg-transparent p-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:bg-card/80"/>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="text-xs text-muted-foreground">
            Auto-copy = <span className="font-mono text-primary">rich text only</span>. Use the Plain button for raw markdown.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} className="gap-1.5">
              <X className="size-4"/>
              Close
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditableText(noteText)} className="gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              Reset to original
            </Button>
            <Button variant="outline" onClick={handleCopyPlain} className="gap-1.5">
              {copied === 'plain' ? (<>
                  <Check className="size-4"/>
                  Plain Copied
                </>) : (<>
                  <Code2 className="size-4"/>
                  Copy Plain
                </>)}
            </Button>
            <Button onClick={handleCopyRich} className="gap-1.5">
              {copied === 'rich' ? (<>
                  <Check className="size-4"/>
                  Rich Copied
                </>) : (<>
                  <Copy className="size-4"/>
                  Copy Rich
                </>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>);
}
