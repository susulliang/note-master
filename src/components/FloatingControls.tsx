import { RotateCcw, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface FloatingControlsProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onReset: () => void;
}

/**
 * Glass pill with the two global actions (Reset + theme toggle) that floats
 * over the top-right corner of the canvas — replaces the old top bar.
 */
export default function FloatingControls({
  theme,
  onToggleTheme,
  onReset,
}: FloatingControlsProps) {
  return (
    <div className="absolute right-4 top-4 z-50 flex items-center gap-1 rounded-full border border-foreground/10 bg-card/40 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Reset form"
            title="Reset"
          >
            <RotateCcw className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="border-foreground/15 bg-card/70 backdrop-blur-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all fields?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all ticket data and reset node positions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="h-5 w-px bg-foreground/10" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleTheme}
        className="size-8 rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Toggle theme"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </div>
  );
}
