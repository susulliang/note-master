import { useState } from 'react';
import { BookOpen, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phonetic-alphabet helpers for the Email Address gridbox. The "Az" toggle
 * (PhoneticToggle) expands the node box itself downwards with an animation
 * to reveal an inline horizontal table (PhoneticTable) — no floating
 * popover — so agents can spell out email addresses without the table
 * covering neighbouring fields.
 */

const PHONETIC: { char: string; word: string }[] = [
  { char: 'A', word: 'Alpha' }, { char: 'N', word: 'November' },
  { char: 'B', word: 'Bravo' }, { char: 'O', word: 'Oscar' },
  { char: 'C', word: 'Charlie' }, { char: 'P', word: 'Papa' },
  { char: 'D', word: 'Delta' }, { char: 'Q', word: 'Quebec' },
  { char: 'E', word: 'Echo' }, { char: 'R', word: 'Romeo' },
  { char: 'F', word: 'Foxtrot' }, { char: 'S', word: 'Sierra' },
  { char: 'G', word: 'Golf' }, { char: 'T', word: 'Tango' },
  { char: 'H', word: 'Hotel' }, { char: 'U', word: 'Uniform' },
  { char: 'I', word: 'India' }, { char: 'V', word: 'Victor' },
  { char: 'J', word: 'Juliet' }, { char: 'W', word: 'Whiskey' },
  { char: 'K', word: 'Kilo' }, { char: 'X', word: 'X-ray' },
  { char: 'L', word: 'Lima' }, { char: 'Y', word: 'Yankee' },
  { char: 'M', word: 'Mike' }, { char: 'Z', word: 'Zulu' },
];

const SPECIALS: { char: string; word: string }[] = [
  { char: '.', word: 'Dot' }, { char: '-', word: 'Hyphen' },
  { char: '@', word: 'At sign' }, { char: '_', word: 'Underscore' },
];

function toPlain(): string {
  const a = PHONETIC.map((p) => `${p.char} = ${p.word}`).join(', ');
  const b = SPECIALS.map((p) => `${p.char} = ${p.word}`).join(', ');
  return `Phonetic alphabet: ${a}. Specials: ${b}.`;
}

/** The "Az" pill button — controlled so the owning node can expand itself. */
export function PhoneticToggle({
  open,
  onOpenChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      title={open ? 'Hide phonetic alphabet' : 'Show phonetic alphabet'}
      className={cn(
        'flex h-5 w-8 items-center justify-center rounded border text-[9px] font-bold tracking-wider transition-colors',
        open
          ? 'border-primary/50 bg-primary/15 text-primary'
          : 'border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-primary',
        className
      )}
    >
      Az
    </button>
  );
}

/** Horizontal phonetic table rendered INLINE inside the expanded node. */
export function PhoneticTable() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toPlain());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* no-op */ }
  };

  return (
    <div className="rounded-lg border border-border/40 bg-foreground/[0.03] p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <BookOpen className="size-3" /> Phonetic Alphabet
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded border border-border/60 bg-card/40 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-x-1 gap-y-0.5 text-[10px]">
        {PHONETIC.map((p) => (
          <div key={p.char} className="flex items-baseline gap-1">
            <span className="font-mono font-bold text-primary">{p.char}</span>
            <span className="truncate text-muted-foreground">{p.word}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-border/30 pt-1.5 text-[10px]">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          Specials
        </span>
        {SPECIALS.map((p) => (
          <span key={p.char} className="flex items-baseline gap-1">
            <span className="font-mono font-bold text-primary">{p.char}</span>
            <span className="text-muted-foreground">{p.word}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
