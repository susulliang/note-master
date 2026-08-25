import { useState, useCallback, useEffect } from 'react';
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

export default function OutputModal({
  open,
  onOpenChange,
  noteText,
  onSaveToHistory,
}: OutputModalProps) {
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState(noteText);

  // Re-sync local editable text whenever the modal opens or noteText changes
  useEffect(() => {
    if (open) {
      setEditableText(noteText);
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
      <DialogContent className="max-w-2xl border-foreground/15 bg-card/70 shadow-2xl backdrop-blur-3xl">
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

        {/* Editable glass note panel */}
        <div className="relative rounded-lg border border-foreground/10 bg-foreground/5 p-3 text-sm leading-relaxed text-foreground backdrop-blur-md">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="!absolute right-2 top-2 z-10 gap-1.5 text-sm"
          >
            {copied ? (
              <>
                <Check className="size-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy
              </>
            )}
          </Button>
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            spellCheck={false}
            className="max-h-[55vh] min-h-[200px] w-full resize-none whitespace-pre-wrap break-words bg-transparent pr-20 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:outline-none"
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
            <Copy className="size-4" />
            Copy to Clipboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
