import { useEffect, useRef, useState } from 'react';
import { BookOpen, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact phonetic-alphabet callout — opens from an "Az" icon button on the
 * Email field gridbox (and any other field that opts in via `phonetic: true`).
 * Useful for agents spelling out serial numbers to customers who need to
 * read them back. The copy button copies the whole table as plain text.
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

export default function PhoneticPopover({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toPlain());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* no-op */ }
  };

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Phonetic alphabet — click to open"
        className={cn(
          'flex h-5 w-8 items-center justify-center rounded border text-[9px] font-bold tracking-wider transition-colors',
          open
            ? 'border-primary/50 bg-primary/15 text-primary'
            : 'border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-primary'
        )}
      >
        Az
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[280px] rounded-lg border border-border bg-popover p-2 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="size-3" /> Phonetic Alphabet
            </div>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 rounded border border-border/60 bg-card/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-0.5 text-[10px]">
            {PHONETIC.map((p) => (
              <div key={p.char} className="flex items-center gap-1">
                <span className="w-3.5 font-mono font-bold text-primary">{p.char}</span>
                <span className="text-muted-foreground">{p.word}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 border-t border-border/40 pt-1">
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Specials
            </div>
            <div className="grid grid-cols-2 gap-0.5 text-[10px]">
              {SPECIALS.map((p) => (
                <div key={p.char} className="flex items-center gap-1">
                  <span className="w-3.5 font-mono font-bold text-primary">{p.char}</span>
                  <span className="text-muted-foreground">{p.word}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
