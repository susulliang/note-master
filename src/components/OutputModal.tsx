import { useState, useCallback, useEffect, useMemo } from 'react';
import { Copy, Check, X, Pencil } from 'lucide-react';
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

export default function OutputModal({
  open,
  onOpenChange,
  noteText,
  onSaveToHistory,
}: OutputModalProps) {
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState(noteText);

  // Parse contact fields out of the (possibly edited) note text
  const contactFields = useMemo(() => {
    const fields: { label: string; value: string }[] = [];
    for (const label of CONTACT_FIELD_LABELS) {
      const match = editableText.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
      const value = match?.[1]?.trim() ?? '';
      if (value && value !== 'N/A') {
        fields.push({ label, value });
      }
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

  // Re-sync local editable text whenever the modal opens or noteText changes;
  // auto-copy the freshly generated note so it's ready to paste right away
  useEffect(() => {
    if (open) {
      setEditableText(noteText);
      navigator.clipboard
        .writeText(noteText)
        .then(() => toast.success('Ticket note auto-copied to clipboard!'))
        .catch(() => {
          // Clipboard unavailable (permissions/focus) — manual Copy stays available
        });
    }
  }, [open, noteText]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editableText);
      setCopied(true);
      toast.success('Ticket note copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-primary">📋</span>
            Ticket Note Generated
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Pencil className="size-3.5" />
            Edit the note below before copying, then paste it into your ticket system.
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

        {/* Editable note — full-width textarea; Copy lives in the footer */}
        <div className="relative rounded-xl p-3">
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            spellCheck={false}
            className="glass-field max-h-[55vh] min-h-[200px] w-full resize-none whitespace-pre-wrap break-words rounded-lg p-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
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
                Copy to Clipboard
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
