import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  adminListSavedTicketNotes,
  adminUpdateSavedTicketNote,
  type SavedTicketNote,
} from '@/lib/auth-client';

const PAGE_SIZE = 50;

function withSavedSolvedLine(noteText: string, solved: boolean): string {
  const line = `Solved: ${solved ? 'Y' : 'N'}`;
  const solvedLine = /^Solved:\s*[YN]\s*$/im;
  if (solvedLine.test(noteText)) return noteText.replace(solvedLine, line);
  const additionalInfoLine = /^Additional information\b/im;
  if (additionalInfoLine.test(noteText)) return noteText.replace(additionalInfoLine, `${line}\n\n$&`);
  return `${noteText.trimEnd()}\n\n${line}`;
}

export default function SavedTicketNotesTab() {
  const [notes, setNotes] = useState<SavedTicketNote[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SavedTicketNote>>({});
  const [issueFilter, setIssueFilter] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number, append: boolean) => {
    setError(null);
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const result = await adminListSavedTicketNotes({
        offset,
        limit: PAGE_SIZE,
        issueType: issueFilter,
      });
      setNotes((current) => append ? [...current, ...result.notes] : result.notes);
      setDrafts((current) => {
        const next = append ? { ...current } : {};
        for (const note of result.notes) next[note.id] = note;
        return next;
      });
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved ticket notes.');
      if (!append) {
        setNotes([]);
        setDrafts({});
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [issueFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(0, false), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateDraft = (id: string, patch: Partial<SavedTicketNote>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const save = async (id: string) => {
    const draft = drafts[id];
    if (!draft || savingId) return;
    const noteText = withSavedSolvedLine(draft.noteText, draft.solved);
    setSavingId(id);
    setError(null);
    try {
      await adminUpdateSavedTicketNote({
        id: draft.id,
        noteText,
        issueType: draft.issueType,
        solved: draft.solved,
      });
      const updated = { ...draft, noteText, updatedAt: Date.now() };
      setNotes((current) => current.map((note) => note.id === id ? updated : note));
      setDrafts((current) => ({ ...current, [id]: updated }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update saved ticket note.');
    } finally {
      setSavingId(null);
    }
  };

  const visibleNotes = search.trim()
    ? notes.filter((note) => {
        const draft = drafts[note.id] ?? note;
        const query = search.trim().toLowerCase();
        return `${draft.issueType}\n${draft.noteText}\n${draft.createdBy}`.toLowerCase().includes(query);
      })
    : notes;

  return (
    <div className="custom-scrollbar -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/95 p-2 backdrop-blur">
        <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={issueFilter}
            onChange={(event) => setIssueFilter(event.target.value)}
            placeholder="Exact issue type"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none placeholder:text-muted-foreground/60"
            aria-label="Filter saved notes by issue type"
          />
        </label>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search loaded notes"
          className="min-w-[160px] flex-1 rounded-lg border border-border/50 bg-background/50 px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60"
          aria-label="Search loaded saved notes"
        />
        <button
          type="button"
          onClick={() => void load(0, false)}
          disabled={loading}
          className="rounded-lg border border-border/60 p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Reload saved notes"
          title="Reload saved ticket notes"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
        <span className="w-full text-[10px] text-muted-foreground">
          {total} saved · newest first · indexed by issue type and push time
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {loading && notes.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading saved ticket notes…
        </div>
      )}
      {!loading && notes.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-border/60 py-10 text-center text-xs text-muted-foreground">
          No ticket notes have been archived yet.
        </p>
      )}

      {visibleNotes.map((note) => {
        const draft = drafts[note.id] ?? note;
        const changed =
          draft.noteText !== note.noteText ||
          draft.issueType !== note.issueType ||
          draft.solved !== note.solved;
        const busy = savingId === note.id;
        return (
          <article key={note.id} className="space-y-2 rounded-xl border border-border/60 bg-background/35 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={draft.issueType}
                onChange={(event) => updateDraft(note.id, { issueType: event.target.value })}
                maxLength={180}
                aria-label={`Issue type for note ${note.id}`}
                className="min-w-[180px] flex-1 rounded-lg border border-border/50 bg-background/50 px-2 py-1.5 text-xs font-semibold text-foreground outline-none"
                placeholder="Issue type"
              />
              <time className="text-[10px] text-muted-foreground" dateTime={new Date(note.pushedAt).toISOString()}>
                {new Date(note.pushedAt).toLocaleString()}
              </time>
              <span className="text-[10px] text-muted-foreground">by {note.createdBy}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                <Switch
                  checked={draft.solved}
                  onCheckedChange={(solved) => updateDraft(note.id, {
                    solved,
                    noteText: withSavedSolvedLine(draft.noteText, solved),
                  })}
                  aria-label={`Solved status for note ${note.id}`}
                />
                <span>Problem solved</span>
                <span className={draft.solved ? 'text-emerald-400' : 'text-amber-300'}>
                  {draft.solved ? 'Y' : 'N'}
                </span>
              </label>
              <button
                type="button"
                onClick={() => void save(note.id)}
                disabled={!changed || !!savingId}
                className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
            <textarea
              value={draft.noteText}
              onChange={(event) => updateDraft(note.id, {
                noteText: withSavedSolvedLine(event.target.value, draft.solved),
              })}
              rows={6}
              maxLength={64_000}
              aria-label={`Ticket note text ${note.id}`}
              className="custom-scrollbar w-full resize-y rounded-lg border border-border/50 bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
          </article>
        );
      })}

      {search.trim() && visibleNotes.length === 0 && notes.length > 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No loaded notes match that search.</p>
      )}
      {notes.length < total && (
        <button
          type="button"
          onClick={() => void load(notes.length, true)}
          disabled={loadingMore}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
          Load older notes ({notes.length} of {total})
        </button>
      )}
    </div>
  );
}
