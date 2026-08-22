import { memo, useRef, useState, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { GripVertical, Plus, X, ChevronDown, Check } from 'lucide-react';
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

export type NodeType = 'start' | 'agent' | 'input' | 'select' | 'dynamic-list' | 'hangup';

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
  icon?: LucideIcon;
}

const accentBorders: Record<string, string> = {
  green: 'border-primary/60 shadow-[0_0_20px_rgba(35_134_54_0.15)]',
  blue: 'border-info/60 shadow-[0_0_20px_rgba(88_166_255_0.15)]',
  red: 'border-destructive/60 shadow-[0_0_20px_rgba(248_81_73_0.15)]',
  default: 'border-border/60',
};

const accentGlows: Record<string, string> = {
  green: 'shadow-[0_0_30px_rgba(35_134_54_0.4)] border-primary',
  blue: 'shadow-[0_0_30px_rgba(88_166_255_0.4)] border-info',
  red: 'shadow-[0_0_30px_rgba(248_81_73_0.4)] border-destructive',
  default: 'shadow-[0_0_20px_rgba(255_255_255_0.1)] border-foreground/30',
};

interface ComboboxFieldProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  icon?: LucideIcon;
}

function ComboboxField({
  label,
  value,
  options,
  onChange,
  onFocus,
  onBlur,
  icon: Icon,
}: ComboboxFieldProps) {
  const [open, setOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options;
    return options.filter((opt) => opt.toLowerCase().includes(query));
  }, [options, value]);

  const isCustomValue = value.trim().length > 0 && !options.includes(value);

  return (
    <div className="px-3 py-2">
      {label && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="size-3 text-accent/70" />}
          {label}
        </div>
      )}
      <div className="relative flex items-center">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Type or select..."
          className="h-8 bg-background/50 pr-8 text-sm"
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
            align="end"
            sideOffset={4}
            className="min-w-[200px] max-w-[260px] p-0"
          >
            <Command shouldFilter={false}>
              <CommandList>
                {filteredOptions.length === 0 ? (
                  <CommandEmpty>
                    {value.trim()
                      ? `Press Enter to keep "${value.trim()}"`
                      : 'No options'}
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredOptions.map((opt) => (
                      <CommandItem
                        key={opt}
                        value={opt}
                        onSelect={() => {
                          onChange(opt);
                          setOpen(false);
                        }}
                        className="gap-2 text-xs"
                      >
                        <Check
                          className={cn(
                            'size-3.5',
                            value === opt ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {opt}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {isCustomValue && (
        <div className="mt-1 text-[9px] uppercase tracking-wider text-accent/80">
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
  icon: Icon,
}: FlowNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleFocus = useCallback(() => {
    onFocus(id);
  }, [id, onFocus]);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Only start drag from header/grip area
      onDragStart(id, e);
    },
    [id, onDragStart]
  );

  const renderContent = () => {
    if (type === 'start' || type === 'agent') {
      return (
        <div className="px-3 py-2">
          {label && (
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <p className="text-xs leading-snug text-foreground">{text}</p>
        </div>
      );
    }

    if (type === 'hangup') {
      return (
        <div className="px-3 py-2.5 text-center">
          <Button
            variant="destructive"
            size="sm"
            className="w-full gap-1.5 text-xs font-semibold"
            onClick={() => onChange('hangup')}
          >
            📞 Hang Up &amp; Generate Note
          </Button>
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
        />
      );
    }

    if (type === 'dynamic-list') {
      const steps = Array.isArray(value) ? value : [];
      return (
        <div className="px-3 py-2">
          {label && (
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
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
                  className="h-7 bg-background/50 text-xs"
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
              className="w-full gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
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
      <div className="px-3 py-2">
        {label && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {Icon && <Icon className="size-3 text-accent/70" />}
            {label}
          </div>
        )}
        {inputType === 'textarea' ? (
          <Textarea
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={onBlur}
            rows={2}
            className="resize-none bg-background/50 text-xs"
            placeholder="Type here..."
          />
        ) : (
          <Input
            type={inputType}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={onBlur}
            className="h-8 bg-background/50 text-xs"
            placeholder="Type here..."
          />
        )}
      </div>
    );
  };

  const isDraggable = type !== 'start' && type !== 'hangup';

  return (
    <div
      ref={nodeRef}
      style={{
        left: position.x,
        top: position.y,
        width,
      }}
      className={cn(
        'absolute rounded-lg border backdrop-blur-xl bg-card/70 transition-all duration-200',
        isActive ? accentGlows[accent] : accentBorders[accent],
        isHovered && !isActive && 'border-foreground/20',
        isActive && 'animate-pulse-slow'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag handle - top area */}
      {isDraggable && (
        <div
          onMouseDown={handleMouseDown}
          className="flex h-4 cursor-grab items-center justify-center rounded-t-lg border-b border-border/30 text-muted-foreground/40 active:cursor-grabbing hover:text-muted-foreground"
        >
          <GripVertical className="size-3" />
        </div>
      )}
      {/* Non-draggable nodes still get a subtle top bar for visual consistency */}
      {!isDraggable && type !== 'hangup' && (
        <div className="flex h-3 items-center justify-center rounded-t-lg border-b border-border/20">
          <ChevronDown className="size-2.5 text-muted-foreground/30" />
        </div>
      )}

      {renderContent()}
    </div>
  );
}

export default memo(FlowNodeComponent);
