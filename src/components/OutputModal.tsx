import { useState, useCallback, useEffect, useMemo, useContext } from 'react';
import { Copy, Check, X, Pencil, Eye, Code2, Upload, Loader2 } from 'lucide-react';
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
import { TicketPanelsContext } from './FlowNode';
import { useCcpExtensionBridge } from '@/hooks/use-ccp-extension-bridge';
import { cn } from '@/lib/utils';

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
  const [copied, setCopied] = useState<null | 'rich' | 'plain'>(null);
  const [editableText, setEditableText] = useState(noteText);
  const [pushing, setPushing] = useState(false);
  const panelsCtx = useContext(TicketPanelsContext);

  // Defensive fallback: OutputModal was accidentally rendered outside
  // TicketPanelsContext in 0.1.22, and the symptom was that diagnostics
  // / Push buttons silently ran against a null context. To prevent this
  // class of regression forever, instantiate the extension bridge hook
  // directly here too and merge with the context: context wins if it
  // carries real values, hook fills in anything missing.
  const hookBridge = useCcpExtensionBridge({ onApply: () => [] });

  type ExtensionConnectionShape = NonNullable<Required<import('@/components/FlowNode').TicketPanelsContextShape>['extensionConnection']>;

  const applyCaseFields: ReturnType<typeof useCcpExtensionBridge>['applyCaseFields'] | undefined =
    panelsCtx?.applyCaseFields ?? (hookBridge.connected ? hookBridge.applyCaseFields.bind(hookBridge) : undefined);

  const openCaseFallback: NonNullable<ReturnType<typeof useCcpExtensionBridge>['openCase']> = async ({ caseNumber, directUrl, newTab }) => {
    if (hookBridge.connected) { try { return await hookBridge.openCase({ caseNumber, directUrl, newTab }); } catch (e: any) { return { ok: false, url: null, navigated: null, error: String(e?.message || e) }; } }
    if (directUrl) {
      if (newTab) window.open(directUrl, '_blank', 'noopener,noreferrer');
      else window.location.assign(directUrl);
      return { ok: true, url: directUrl, navigated: 'new' as const };
    }
    return { ok: false, url: null, navigated: null, error: 'Extension not connected. Paste a full Lightning Case URL or reload the Ecovacs Note Helper extension.' };
  };

  void panelsCtx?.openCase; // silence unused
  void openCaseFallback;

  const extConn: ExtensionConnectionShape = panelsCtx?.extensionConnection ?? {
    connected: hookBridge.connected,
    requestConnection: hookBridge.requestConnection.bind(hookBridge),
    diagnostics: hookBridge.connectionDiagnostics,
  };

  // Parse extra fields for "Push to Salesforce Case" (beyond the 3 chip ones)
  //   - Deebot Model / Serial / SKU / Email / Shipping Address / Phone → for
  //     this iteration we only expose the 4 editable SF fields the user
  //     explicitly asked about: AMR Model No. (← deebotModel), Name
  //     (customerName) → customerName/contact field, Account Name → account
  //     if available else customerName, Phone → contactNumber.
  const pushableFields = useMemo<{
    postBody: string;
    amrModelNo?: string;
    customerName?: string;
    accountName?: string;
    contactPhone?: string;
  }>(() => {
    const text = editableText;
    const oneLine = (label: string) => {
      const m = text.match(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'mi'));
      return stripMarkdownBold(m?.[1] ?? '').trim() || undefined;
    };
    const phone = oneLine('Contact number') || oneLine('Contact Number') || oneLine('Phone');
    const name = oneLine('Customer Name');
    const model = oneLine('Deebot Model') || oneLine('Robot Model') || oneLine('Model') || oneLine('Product Model') || oneLine('AMR Model No.');
    const accountName = oneLine('Account Name') || name;
    return {
      postBody: text,
      amrModelNo: model,
      customerName: name,
      accountName,
      contactPhone: phone,
    };
  }, [editableText]);

  /** Build a multi-line diagnostics text describing *why* the bridge isn't
   *  connected, and what the agent should do next.
   *  Text-first so we always have a fallback render path (window.alert)
   *  even if <Toaster> isn't mounted or toast() throws. */
  const diagnoseText = useCallback((): string[] => {
    const lines: string[] = [];
    const d = extConn?.diagnostics ?? null;
    lines.push('── Extension bridge diagnostics ──');
    const appOrigin = (d?.appOrigin) || (typeof location !== 'undefined' ? location.origin : '(unknown)');
    lines.push(`App origin: ${appOrigin}`);
    if (typeof location !== 'undefined') lines.push(`Full URL: ${location.href}`);
    if (!d) {
      lines.push('No diagnostics available — TicketPanelsContext.extensionConnection is missing from the page tree (OutputModal rendered outside the provider).');
      return lines;
    }
    lines.push(`Content-script bridge injected: ${d.bridgeInjected ? 'YES' : 'NO'} (listening for bridge.js handshake posts)`);
    lines.push(`Manifest bridge patterns: ${(d.manifestBridgePatterns || []).length === 0 ? '(unknown)' : d.manifestBridgePatterns.join(',  ')}`);
    lines.push(`Manifest external patterns: ${(d.manifestExternalPatterns || []).length === 0 ? '(unknown)' : d.manifestExternalPatterns.join(',  ')}`);
    lines.push(`Origin matched by bridge: ${d.originCoveredByBridge ? 'YES' : 'NO'}`);
    lines.push(`Origin matched by externally_connectable: ${d.originCoveredByExternal ? 'YES' : 'NO'}`);
    if (d.bridgeInjected) {
      lines.push(`Last handshake: ${d.lastHandshakeAt ? new Date(d.lastHandshakeAt).toLocaleString() : 'never'}`);
    } else if (d.originCoveredByBridge) {
      lines.push('Patterns SHOULD match this origin — click "Try probing bridge again" below, or open chrome://extensions and click 🔄 Reload on Ecovacs Note Helper, then refresh THIS ticket notes tab.');
    } else {
      lines.push('Current URL is NOT covered by the extension manifest content-script list.');
    }
    if (d.suggestedPatternsToAdd.length > 0) {
      lines.push('');
      lines.push('▸ Paste these patterns into Ecovacs Note Helper/manifest.json then 🔄 reload the extension:');
      lines.push('  content_scripts → bridge.js → matches:');
      d.suggestedPatternsToAdd.forEach((p) => lines.push(`    "${p}",`));
      lines.push('');
      lines.push('  externally_connectable → matches:');
      d.suggestedPatternsToAdd.forEach((p) => lines.push(`    "${p}",`));
    }
    if (d.lastExternalError) lines.push(`\nChrome.runtime error: "${d.lastExternalError.slice(0, 220)}"`);
    lines.push('');
    lines.push('Checklist: (1) extension loaded & enabled  (2) origin matches manifest  (3) reloaded the extension  (4) refresh this tab.');
    return lines;
  }, [extConn]);

  /** Always-works diagnostics renderer. Strategy:
   *    1. try plain `toast.message(...)` with the most important line +
   *       description (this always renders even without custom-toast JSX).
   *    2. always throw a full-text `window.alert(...)` backup so the user
   *       SEEs the info even if the Toaster region was never mounted or
   *       is hidden beneath the modal.
   *    3. also copy the manifest snippet (if any) + attach it to
   *       window.__debug so we don't ask users to "read console".
   *  No react-markdown / Button / sonner.custom inside this function
   *  because those are the first things that fail silently when the tree
   *  hasn't finished mounting its providers. */
  const showDiagnosticsToast = useCallback((): void => {
    try {
      const d = extConn?.diagnostics ?? null;
      const probe = extConn?.requestConnection;
      const lines = diagnoseText();
      const text = lines.join('\n');
      // Try to copy suggested patterns as a side-effect so the agent can paste
      // them into manifest quickly.
      const copyableSnippet = d && d.suggestedPatternsToAdd.length > 0
        ? `// manifest.json snippet:\n// content_scripts bridge.js matches + externally_connectable matches:\n"matches": [\n${d.suggestedPatternsToAdd.map((p) => `  "${p}"`).join(',\n')}\n]`
        : '';
      if (copyableSnippet) {
        try {
          void navigator.clipboard?.writeText(copyableSnippet).then(
            () => { try { toast.success('Manifest snippet copied to clipboard.'); } catch { /* ignore */ } },
            () => { /* ignore */ }
          );
        } catch { /* ignore */ }
      }
      // Stash under debug so anything short of full render failure still
      // leaves clues in DevTools / window.__debug.lastDiag.
      try {
        (window as any).__debug = (window as any).__debug || {};
        (window as any).__debug.lastDiag = { at: new Date().toISOString(), lines, extConn: extConn ?? null, copyableSnippet };
      } catch { /* ignore */ }

      // Short sonner toast first (safe subset API: message + description)
      try {
        const headline = lines[1] ?? 'Diagnostics collected.';
        const sub = (d?.suggestedPatternsToAdd?.length ?? 0) > 0
          ? `${(d as any).suggestedPatternsToAdd.length} manifest pattern${(d as any).suggestedPatternsToAdd.length === 1 ? '' : 's'} missing — full list in the alert dialog + copied to clipboard if allowed.`
          : !d
            ? 'TicketPanelsContext extensionConnection missing (provider not wired).'
            : d.bridgeInjected
              ? `Last handshake: ${d.lastHandshakeAt ? new Date(d.lastHandshakeAt).toLocaleString() : 'n/a'}`
              : `Origin ${d.appOrigin} not covered. Click 🔁 probe below or reload the extension.`;
        toast.message(headline, {
          description: sub,
          duration: 12_000,
          action: probe
            ? {
                label: '🔁 Probe',
                onClick: () => {
                  try {
                    probe();
                    toast.success('Handshake probe sent — Push-to-SF should un-gray within ~2s.');
                  } catch (e: any) { toast.error(`Probe failed: ${String(e?.message || e)}`); }
                },
              }
            : undefined,
        });
      } catch { /* sonner may not be mounted; fall through to alert below */ }

      // Always alert. This is the "no-op" insurance: even if every other
      // path short-circuited the user gets visible output and a copy of
      // the patterns they need to paste.
      try {
        const alt = copyableSnippet ? `${text}\n\n━━━━━━━━━━━━━━━━━━━━━━\nClipboard snippet:\n${copyableSnippet}` : text;
        window.alert(alt);
      } catch { /* extremely defensive */ }
    } catch (e: any) {
      try {
        window.alert(`Diagnostics render crashed: ${String(e?.message || e)}\n\nTell devs to check window.__debug.lastDiagError.`);
      } catch { /* ignore */ }
      try {
        (window as any).__debug = (window as any).__debug || {};
        (window as any).__debug.lastDiagError = String(e?.stack || e?.message || e);
      } catch { /* ignore */ }
    }
  }, [diagnoseText, extConn]);

  /** Run through the extension → SF Case tab. Each success/failure → toast.
   *  Wrap every branch in try/catch + synchronous visible side-effects so
   *  "silent nothing" can never happen: we always toast OR alert. */
  const handlePushToSalesforce = useCallback(async () => {
    try {
      if (!applyCaseFields) {
        // Bridge not up (button was clickable via keyboard or stale prop)
        // → surface diagnostics instead of generic gray text + toast.error
        // fallback if even showDiagnosticsToast somehow failed silently.
        try {
          showDiagnosticsToast();
        } catch (e: any) {
          try { toast.error(`Push aborted: ${String(e?.message || e)}`); } catch { /* ignore */ }
          try { window.alert(`Push aborted — extension not connected.\n\n${String(e?.message || e)}`); } catch { /* ignore */ }
        }
        return;
      }
      setPushing(true);
      const f = pushableFields;
      // Small visible pre-side-effect: if the very first console write on
      // click isn't seen we know click never fired (rare with native
      // buttons, but keeps the observability habit from ExperienceRecall).
      try {
        (window as any).__debug = (window as any).__debug || {};
        (window as any).__debug.lastPushAt = new Date().toISOString();
        (window as any).__debug.lastPushFields = {
          phone: f.contactPhone,
          model: f.amrModelNo,
          name: f.customerName,
          account: f.accountName,
          bodyLen: f.postBody?.length ?? 0,
        };
      } catch { /* ignore */ }
      const r = await applyCaseFields({
        fields: {
          postBody: f.postBody,
          postPublish: false, // never auto-publish — let the agent proofread Post tab before Publish
          amrModelNo: f.amrModelNo,
          customerName: f.customerName,
          accountName: f.accountName,
          contactPhone: f.contactPhone,
        },
      });
      if (!r.ok) {
        const msg = r.error || 'Push failed.';
        try { toast.error(msg, { description: 'Retry after opening any Lightning Case tab.', duration: 10_000 }); } catch { /* ignore */ }
        try { window.alert(`Push to Salesforce failed:\n\n${msg}\n\nOpen a Lightning Case tab, then try again.`); } catch { /* ignore */ }
        return;
      }
      // (1) Post body toast
      const pb = r.postBody as any;
      if (pb) {
        if (pb.ok) toast.success(`Post tab opened${pb.editorFound ? `, note body written (${pb.length ?? 0} chars)` : ''}${pb.publishClicked ? ' — auto-published.' : '.'}${!pb.publishClicked ? ' Review & click Publish in SF when ready.' : ''}`);
        else if (pb.tabFound === false) toast.warning('Post tab: not found on this Case layout.');
        else toast.warning(`Post tab: ${pb.error || 'editor not available'}. Paste manually from clipboard if needed.`);
      }
      // (2) Editable SF fields
      const labels: Record<string, string> = {
        contactPhone: 'Phone',
        customerName: 'Contact Name',
        accountName:  'Account Name',
        amrModelNo:   'AMR Model No.',
      };
      const fields = (r.fields ?? {}) as Record<string, any>;
      const ks = Object.keys(labels) as (keyof typeof labels)[];
      let good = 0; let skipped = 0; let failed = 0;
      for (const k of ks) {
        const s = fields[k];
        if (!s) continue;
        if (s.skipped) { skipped += 1; continue; }
        if (s.ok) good += 1;
        else {
          failed += 1;
          toast.warning(`${labels[k]}: ${s.error || 'could not be written.'}`, {
            description: 'Field may be read-only, not on this layout, or the inline-edit button was not found.',
          });
        }
      }
      if (good > 0) {
        toast.success(`Wrote ${good} editable SF field${good === 1 ? '' : 's'}.${skipped > 0 ? ` ${skipped} empty skipped.` : ''}${failed > 0 ? ` (${failed} had errors — see warnings above.)` : ''}`);
      } else if (skipped === Object.keys(labels).length && (pb?.ok || pb === null)) {
        toast.info('All editable layout fields were empty; note body was pushed to Post tab instead.');
      } else if (!pb?.ok && failed > 0 && good === 0) {
        toast.warning(`Push completed with ${failed} warning${failed === 1 ? '' : 's'}. (Fields were found but editing may require inline-edit permissions or different Case layout sections.)`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tab = (r as any).tab;
      if (tab?.title || tab?.url) {
        toast.message(`Pushed to tab: ${tab?.title || new URL(tab.url).origin}`, {
          description: tab?.url ? new URL(tab.url).pathname : undefined,
        });
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      try { toast.error(msg); } catch { /* ignore */ }
      try { window.alert(`Push to Salesforce crashed:\n\n${msg}\n\n${String(e?.stack || '')}`); } catch { /* ignore */ }
    } finally {
      setPushing(false);
    }
  }, [applyCaseFields, pushableFields, showDiagnosticsToast]);

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
      writeClipboardRichOnly(noteText).then(
        () => toast.success('Rich-text note auto-copied (bold preserved).'),
        () => {
          /* Clipboard unavailable — manual Copy stays available */
        }
      );
    }
  }, [open, noteText]);

  /** Auto-copy path: writes ONLY the text/html (rendered bold) flavour.
   *  Apps that accept HTML (Confluence, Zendesk, Gmail, Notion) get the
   *  fully styled note; if the target app has no HTML reader we fall back
   *  to the HTML-source string (still contains the <strong> tags so the
   *  emphasis is recoverable) rather than writing a second plain flavour. */
  const writeClipboardRichOnly = useCallback(async (text: string): Promise<void> => {
    const html = markdownToHtml(text);
    if (window.ClipboardItem) {
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
        return;
      } catch {
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
      } else {
        await navigator.clipboard.writeText(html);
      }
      setCopied('rich');
      toast.success('Rich-text note copied!');
      setTimeout(() => setCopied(null), 2000);
    } catch {
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
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  }, [editableText]);

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
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Auto-copy = <span className="font-mono text-primary">rich text only</span>. Use the Plain button for raw markdown.
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePushToSalesforce()}
              aria-disabled={pushing}
              className={cn('ml-2 gap-1.5', applyCaseFields ? 'text-foreground' : 'text-foreground')}
              title={
                applyCaseFields
                  ? "Open Post tab on the agent's current Lightning Case tab, paste the formatted note into the publisher, and try writing AMR Model No. / Name / Account Name / Phone via inline edit."
                  : extConn?.diagnostics
                    ? [
                        'Extension bridge not connected yet.',
                        extConn.diagnostics.bridgeInjected
                          ? 'Handshake received but waiting for external path.'
                          : extConn.diagnostics.originCoveredByBridge
                            ? 'Origin should match → try probing first.'
                            : `Origin ${extConn.diagnostics.appOrigin} is not matched by the extension manifest — click 🔎 Diagnostics for patterns to add.`,
                      ].join(' ')
                    : 'Extension bridge must be connected first (Ecovacs Note Helper extension + allowed origin).'
              }
            >
              {pushing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {pushing ? 'Pushing to Salesforce…' : '📤 Push to Salesforce Case'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                // Defensive: ensure user always gets visible feedback for
                // this click even if showDiagnosticsToast short-circuits.
                e.stopPropagation?.();
                try {
                  // eslint-disable-next-line no-console
                  console.log('[OutputModal] Diagnostics clicked at', new Date().toISOString(), 'extConn=', extConn);
                } catch { /* ignore */ }
                try { (window as any).__debug = (window as any).__debug || {}; (window as any).__debug.lastDiagClick = new Date().toISOString(); } catch { /* ignore */ }
                try {
                  showDiagnosticsToast();
                } catch (e: any) {
                  try { toast.error(`Diagnostics failed: ${String(e?.message || e)}`); } catch { /* ignore */ }
                  try { window.alert(`Diagnostics failed:\n\n${String(e?.message || e)}\n\n${String(e?.stack || '')}`); } catch { /* ignore */ }
                }
              }}
              className="gap-1.5"
              title="Open a diagnostics toast that shows the ticket app origin, manifest coverage, suggested patterns to add, reload instructions, and a one-click probe. Always shows a fallback alert so it never produces nothing."
            >
              🔎 Diagnostics
            </Button>
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
            <Button variant="outline" onClick={handleCopyPlain} className="gap-1.5">
              {copied === 'plain' ? (
                <>
                  <Check className="size-4" />
                  Plain Copied
                </>
              ) : (
                <>
                  <Code2 className="size-4" />
                  Copy Plain
                </>
              )}
            </Button>
            <Button onClick={handleCopyRich} className="gap-1.5">
              {copied === 'rich' ? (
                <>
                  <Check className="size-4" />
                  Rich Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy Rich
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
