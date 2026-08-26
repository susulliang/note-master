import { memo, useRef, useState, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { Plus, X, ChevronDown, Check, PhoneOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { AmrTemplate } from '@/lib/amr-templates';

export type NodeType = 'start' | 'agent' | 'input' | 'select' | 'dynamic-list' | 'hangup';

export interface QuickTextGroup {
  label: string;
  items: string[];
}

export interface FlowNodeProps {
  id: string;
  type: NodeType;
  label?: string;
  text?: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  onFocus: (id: string) => void;
  onBlur: () => void;
  isActive: boolean;
  position: { x: number; y: number };
  onDragStart: (id: string, e: ReactMouseEvent) => void;
  options?: string[];
  accent?: 'green' | 'blue' | 'red' | 'default';
  inputType?: 'text' | 'email' | 'tel' | 'textarea';
  width?: number;
  /** Visible textarea rows (defaults to 2) */
  textareaRows?: number;
  /** Focus this node's input once on mount (initial page focus target) */
  autoFocus?: boolean;
  icon?: LucideIcon;
  /** Quick insert chips rendered below the field (e.g. Resolution Summary) */
  quickTexts?: string[];
  /**
   * Grouped quick insert chips. Takes precedence over quickTexts: the panel
   * collapses to a preview row and expands into a hover overlay panel with a
   * smooth animation, covering neighbouring nodes (no layout reflow).
   */
  quickTextGroups?: QuickTextGroup[];
  /** Subset of quickTexts that were user-added (rendered with a remove button) */
  customQuickTexts?: string[];
  onAddQuickText?: (text: string) => void;
  onRemoveQuickText?: (text: string) => void;
  /** Fuzzy-matched AMR templates for the typed issue text */
  templateMatches?: AmrTemplate[];
  onOpenTemplate?: (template: AmrTemplate) => void;
}

// Shared glass shadow: specular top edge + soft drop shadow (+ optional accent glow)
const glassShadow = (glow?: string) =>
  `shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_8px_32px_rgba(0,0,0,0.35)${
    glow ? `,${glow}` : ''
  }]`;

const accentBorders: Record<string, string> = {
  green: `border-primary/50 ${glassShadow('0_0_24px_rgba(35_134_54,0.18)')}`,
  blue: `border-info/50 ${glassShadow('0_0_24px_rgba(88_166_255,0.18)')}`,
  red: `border-destructive/50 ${glassShadow('0_0_24px_rgba(248_81_73,0.18)')}`,
  default: `border-foreground/15 ${glassShadow()}`,
};

const accentGlows: Record<string, string> = {
  green: `border-primary ${glassShadow('0_0_36px_rgba(35_134_54,0.45)')}`,
  blue: `border-info ${glassShadow('0_0_36px_rgba(88_166_255,0.45)')}`,
  red: `border-destructive ${glassShadow('0_0_36px_rgba(248_81_73,0.45)')}`,
  default: `border-foreground/35 ${glassShadow('0_0_28px_rgba(255,255,255,0.14)')}`,
};

interface ComboboxFieldProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  icon?: LucideIcon;
  /** Node width — the dropdown matches the input width (min 300px) */
  width?: number;
}

/**
 * Cap on rendered dropdown rows. Option sets like the issue-type list hold
 * ~800 entries; filtering is cheap but rendering all rows at once is not,
 * so only the first COMBOBOX_MAX_RENDERED matches are mounted.
 */
const COMBOBOX_MAX_RENDERED = 100;

function ComboboxField({
  label,
  value,
  options,
  onChange,
  onFocus,
  onBlur,
  icon: Icon,
  width,
}: ComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Group options by "Category::" prefix when present (e.g. issue types);
  // un-prefixed option sets (e.g. Deebot models) fall back to one flat group.
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const opt of options) {
      const sep = opt.indexOf('::');
      const key = sep > 0 ? opt.slice(0, sep) : '';
      const list = map.get(key);
      if (list) list.push(opt);
      else map.set(key, [opt]);
    }
    return Array.from(map.entries());
  }, [options]);

  const filteredGroups = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map(
        ([cat, items]) =>
          [cat, items.filter((o) => o.toLowerCase().includes(query))] as [string, string[]]
      )
      .filter(([, items]) => items.length > 0);
  }, [groups, value]);

  const totalFiltered = filteredGroups.reduce((n, [, items]) => n + items.length, 0);
  const truncated = totalFiltered > COMBOBOX_MAX_RENDERED;

  // Slice groups against the render budget (groups later in the list are cut first)
  let budget = COMBOBOX_MAX_RENDERED;
  const visibleGroups = filteredGroups
    .map(([cat, items]): [string, string[]] | null => {
      if (budget <= 0) return null;
      const shown = items.slice(0, budget);
      budget -= shown.length;
      return [cat, shown];
    })
    .filter((g): g is [string, string[]] => g !== null && g[1].length > 0);

  const isCustomValue = value.trim().length > 0 && !options.includes(value);

  return (
    <div className="px-2.5 py-1.5">
      {label && (
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="size-3.5 text-accent/70" />}
          {label}
        </div>
      )}
      <div ref={wrapperRef} className="relative flex items-center">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            onFocus();
            setOpen(true);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Type or select..."
          className="h-9 border-foreground/15 bg-foreground/5 pr-8 text-sm backdrop-blur-sm"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Toggle options"
              className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              onMouseDown={(e) => {
                // Prevent input blur before popover opens
                e.preventDefault();
              }}
              onClick={() => {
                onFocus();
                setOpen((o) => !o);
              }}
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', open && 'rotate-180')}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            style={{ width: Math.max(300, width ?? 300) }}
            className="border-foreground/10 bg-card/75 p-0 shadow-2xl backdrop-blur-2xl"
            onInteractOutside={(e) => {
              // Keep the dropdown open while the agent works in the input
              if (wrapperRef.current?.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
            onFocusOutside={(e) => {
              if (wrapperRef.current?.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-[280px]">
                {filteredGroups.length === 0 ? (
                  <CommandEmpty>
                    {value.trim()
                      ? 'No match — your text will be kept as a custom value'
                      : 'No options'}
                  </CommandEmpty>
                ) : (
                  visibleGroups.map(([cat, items]) => (
                    <CommandGroup
                      key={cat || 'all'}
                      heading={cat || undefined}
                    >
                      {items.map((opt) => {
                        const sep = opt.indexOf('::');
                        const display = sep > 0 ? opt.slice(sep + 2) : opt;
                        return (
                          <CommandItem
                            key={opt}
                            value={opt}
                            onSelect={() => {
                              onChange(opt);
                              setOpen(false);
                            }}
                            className="gap-2 text-sm"
                          >
                            <Check
                              className={cn(
                                'size-3.5 shrink-0',
                                value === opt ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{display}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))
                )}
                {truncated && (
                  <div className="px-2 py-1.5 text-center text-[11px] text-muted-foreground">
                    {totalFiltered - COMBOBOX_MAX_RENDERED} more — keep typing to narrow down
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {isCustomValue && (
        <div className="mt-1 text-[10px] uppercase tracking-wider text-accent/80">
          Custom value
        </div>
      )}
    </div>
  );
}

function FlowNodeComponent({
  id,
  type,
  label,
  text,
  value,
  onChange,
  onFocus,
  onBlur,
  isActive,
  position,
  onDragStart,
  options = [],
  accent = 'default',
  inputType = 'text',
  width = 240,
  textareaRows = 2,
  autoFocus = false,
  icon: Icon,
  quickTexts,
  quickTextGroups,
  customQuickTexts,
  onAddQuickText,
  onRemoveQuickText,
  templateMatches,
  onOpenTemplate,
}: FlowNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showAddQuickText, setShowAddQuickText] = useState(false);
  const [newQuickText, setNewQuickText] = useState('');
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);

  // Grouped panel: total chip count + collapsed preview (first group's chips)
  const groupedTotal = quickTextGroups
    ? quickTextGroups.reduce((n, g) => n + g.items.length, 0) + (customQuickTexts?.length ?? 0)
    : 0;
  const previewItems = quickTextGroups?.[0]?.items.slice(0, 5) ?? [];
  const hiddenCount = Math.max(0, groupedTotal - previewItems.length);

  const handleFocus = useCallback(() => {
    onFocus(id);
  }, [id, onFocus]);

  /**
   * Insert a quick text chip into the field value.
   * When the field already has text, the chip is appended after a "->"
   * separator (e.g. "Email for POP -> Reset Machine").
   */
  const handleInsertQuickText = useCallback(
    (quickText: string) => {
      const current = typeof value === 'string' ? value.trimEnd() : '';
      let next: string;
      if (!current) {
        next = quickText;
      } else if (current.endsWith('->')) {
        // Avoid doubling the separator if the text already ends with one
        next = `${current} ${quickText}`;
      } else {
        next = `${current} -> ${quickText}`;
      }
      onChange(next);
      // Refocus the textarea and place the caret at the end for continued typing
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    },
    [value, onChange]
  );

  const handleAddQuickTextSubmit = useCallback(() => {
    const t = newQuickText.trim();
    if (t) {
      onAddQuickText?.(t);
    }
    setNewQuickText('');
    setShowAddQuickText(false);
  }, [newQuickText, onAddQuickText]);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Whole box is draggable, except when grabbing an interactive control
      // (text fields, chips, buttons) inside it
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, button, select, [contenteditable="true"], [role="combobox"], [role="listbox"]'
        )
      ) {
        return;
      }
      onDragStart(id, e);
    },
    [id, onDragStart]
  );

  // Initial focus target: focus this node's input once, after layout settles
  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => {
      const el = nodeRef.current?.querySelector('textarea, input') as HTMLElement | null;
      el?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  /** Shared quick-insert chip (optionally with a hover remove badge) */
  const renderQuickChip = (qt: string, onRemove?: () => void) => (
    <span key={qt} className="group relative">
      <button
        type="button"
        onClick={() => handleInsertQuickText(qt)}
        title={`Insert: ${qt}`}
        className="h-7 min-w-0 max-w-full truncate rounded-md border border-foreground/15 bg-foreground/5 px-2 text-[11px] font-semibold text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/60 hover:bg-primary/15 hover:text-primary"
      >
        {qt}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove quick text: ${qt}`}
          title={`Remove: ${qt}`}
          className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full border border-background bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="size-2" />
        </button>
      )}
    </span>
  );

  const renderContent = () => {
    if (type === 'start' || type === 'agent') {
      return (
        <div className="px-2.5 py-1.5">
          {label && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <p className="text-sm leading-snug text-foreground">{text}</p>
        </div>
      );
    }

    if (type === 'hangup') {
      return (
        <div className="px-2.5 py-2">
          <button
            type="button"
            onClick={() => onChange('hangup')}
            className="group flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-destructive/50 bg-gradient-to-b from-destructive to-destructive/85 px-3 text-sm font-semibold text-destructive-foreground shadow-[0_6px_20px_rgba(248,81,73,0.35)] transition-all duration-200 hover:border-destructive hover:brightness-110 hover:shadow-[0_8px_28px_rgba(248,81,73,0.5)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <PhoneOff className="size-4 shrink-0 transition-transform duration-200 group-hover:rotate-12" />
            Hang Up &amp; Generate Note
          </button>
        </div>
      );
    }

    if (type === 'select') {
      return (
        <ComboboxField
          label={label}
          value={typeof value === 'string' ? value : ''}
          options={options}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={onBlur}
          icon={Icon}
          width={width}
        />
      );
    }

    if (type === 'dynamic-list') {
      const steps = Array.isArray(value) ? value : [];
      return (
        <div className="px-2.5 py-1.5">
          {label && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-[11px] text-muted-foreground">
                  {idx + 1}.
                </span>
                <Input
                  value={step}
                  onChange={(e) => {
                    const newSteps = [...steps];
                    newSteps[idx] = e.target.value;
                    onChange(newSteps);
                  }}
                  onFocus={handleFocus}
                  onBlur={onBlur}
                  className="h-8 border-foreground/15 bg-foreground/5 text-sm backdrop-blur-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="!absolute right-1 top-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const newSteps = steps.filter((_, i) => i !== idx);
                    onChange(newSteps);
                  }}
                  aria-label="Remove step"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange([...steps, ''])}
            >
              <Plus className="size-3" />
              Add step
            </Button>
          </div>
        </div>
      );
    }

    // input type
    const strValue = typeof value === 'string' ? value : '';
    return (
      <div className="px-2.5 py-1.5">
        {label && (
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {Icon && <Icon className="size-3.5 text-accent/70" />}
            {label}
          </div>
        )}
        {inputType === 'textarea' ? (
          <Textarea
            ref={textareaRef}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={onBlur}
            rows={textareaRows}
            className="resize-none border-foreground/15 bg-foreground/5 text-sm backdrop-blur-sm"
            placeholder="Type here..."
          />
        ) : (
          <Input
            type={inputType}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={onBlur}
            className="h-9 border-foreground/15 bg-foreground/5 text-sm backdrop-blur-sm"
            placeholder="Type here..."
          />
        )}
        {templateMatches && templateMatches.length > 0 && onOpenTemplate && (
          <div className="mt-1.5 border-t border-border/30 pt-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Matching AMR templates
            </div>
            <div className="flex flex-wrap gap-1">
              {templateMatches.map((tpl) => (
                <button
                  key={tpl.file}
                  type="button"
                  onClick={() => onOpenTemplate(tpl)}
                  title={`Open template: ${tpl.name}`}
                  className="h-7 min-w-0 max-w-full truncate rounded-md border border-accent/40 bg-accent/10 px-2 text-[11px] font-semibold text-accent backdrop-blur-sm transition-colors hover:border-accent hover:bg-accent/25 hover:text-accent-foreground"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {quickTextGroups ? (
          /* Grouped quick inserts — collapsed preview row, hover expands a
             smooth overlay panel that covers neighbouring nodes */
          <div
            className="relative mt-1.5 border-t border-border/30 pt-1.5"
            onMouseEnter={() => setQuickPanelOpen(true)}
            onMouseLeave={() => setQuickPanelOpen(false)}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick insert
              <span className="rounded-full bg-foreground/10 px-1.5 text-[9px] font-semibold text-muted-foreground">
                {groupedTotal}
              </span>
              <span className="ml-auto flex items-center gap-0.5 text-[9px] normal-case tracking-normal text-muted-foreground/70">
                hover to expand
                <ChevronDown
                  className={cn(
                    'size-3 transition-transform duration-300',
                    quickPanelOpen && 'rotate-180'
                  )}
                />
              </span>
            </div>
            {/* Collapsed preview */}
            <div className="flex flex-wrap gap-1">
              {previewItems.map((qt) => renderQuickChip(qt))}
              {hiddenCount > 0 && (
                <span className="flex h-7 items-center rounded-md border border-dashed border-foreground/20 px-2 text-[11px] text-muted-foreground/80">
                  +{hiddenCount} more
                </span>
              )}
            </div>
            {/* Expanding overlay */}
            <div
              className={cn(
                'absolute left-0 right-0 top-full z-40 mt-1 origin-top transition-all duration-300 ease-out',
                quickPanelOpen
                  ? 'pointer-events-auto max-h-[320px] translate-y-0 opacity-100'
                  : 'pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0'
              )}
            >
              <div className="custom-scrollbar max-h-[320px] overflow-y-auto rounded-lg border border-foreground/15 bg-card/90 p-2 shadow-2xl backdrop-blur-2xl">
                {customQuickTexts && customQuickTexts.length > 0 && (
                  <div className="mb-2 last:mb-0">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Custom
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {customQuickTexts.map((qt) =>
                        renderQuickChip(qt, () => onRemoveQuickText?.(qt))
                      )}
                    </div>
                  </div>
                )}
                {quickTextGroups.map((g) => (
                  <div key={g.label} className="mb-2 last:mb-0">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.items.map((qt) => renderQuickChip(qt))}
                    </div>
                  </div>
                ))}
                {onAddQuickText && (
                  <div className="mt-1 border-t border-border/30 pt-1.5">
                    {showAddQuickText ? (
                      <Input
                        value={newQuickText}
                        onChange={(e) => setNewQuickText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddQuickTextSubmit();
                          } else if (e.key === 'Escape') {
                            setShowAddQuickText(false);
                            setNewQuickText('');
                          }
                        }}
                        placeholder="New quick text + Enter"
                        autoFocus
                        className="h-7 border-foreground/15 bg-foreground/5 text-[11px] backdrop-blur-sm"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setNewQuickText('');
                          setShowAddQuickText(true);
                        }}
                        className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-foreground/20 text-[11px] text-muted-foreground transition-colors hover:border-accent/60 hover:bg-accent/15 hover:text-accent"
                      >
                        <Plus className="size-3" />
                        Add quick text
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : quickTexts ? (
          /* Flat quick inserts (e.g. Resolution Summary, Purchase info) */
          <div className="mt-1.5 border-t border-border/30 pt-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick insert
            </div>
            <div className="flex flex-wrap gap-1">
              {quickTexts.map((qt) =>
                renderQuickChip(
                  qt,
                  customQuickTexts?.includes(qt) && onRemoveQuickText
                    ? () => onRemoveQuickText(qt)
                    : undefined
                )
              )}
              {onAddQuickText && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddQuickText((v) => !v);
                    if (!showAddQuickText) {
                      setNewQuickText('');
                    }
                  }}
                  aria-label="Add quick text"
                  title="Add quick text"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-foreground/20 text-muted-foreground transition-colors hover:border-accent/60 hover:bg-accent/15 hover:text-accent"
                >
                  <Plus className="size-3" />
                </button>
              )}
            </div>
            {showAddQuickText && onAddQuickText && (
              <Input
                value={newQuickText}
                onChange={(e) => setNewQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddQuickTextSubmit();
                  } else if (e.key === 'Escape') {
                    setShowAddQuickText(false);
                    setNewQuickText('');
                  }
                }}
                placeholder="New quick text + Enter"
                autoFocus
                className="mt-1.5 h-7 border-foreground/15 bg-foreground/5 text-[11px] backdrop-blur-sm"
              />
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={nodeRef}
      style={{
        left: position.x,
        top: position.y,
        width,
      }}
      className={cn(
        'absolute cursor-grab select-none rounded-xl border bg-card/45 backdrop-blur-2xl transition-all duration-200 active:cursor-grabbing',
        '[&_button]:cursor-pointer [&_input]:cursor-text [&_textarea]:cursor-text [&_input]:select-text [&_textarea]:select-text',
        isActive ? accentGlows[accent] : accentBorders[accent],
        isHovered && !isActive && 'border-foreground/25',
        isActive && 'animate-pulse-slow',
        // Expanded quick-insert overlay sits above neighbouring nodes
        quickPanelOpen && 'z-30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
    >
      {renderContent()}
    </div>
  );
}

export default memo(FlowNodeComponent);
