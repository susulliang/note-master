import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { DEEBOT_MODELS, ISSUE_TYPES } from '@/data/ticket';
import {
  adminDeleteChallengeNpc,
  adminListChallengeNpcs,
  adminSaveChallengeNpc,
  NPC_PERSONALITIES,
  type ChallengeNpc,
} from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type NpcDraft = Omit<ChallengeNpc, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const EMPTY_DRAFT: NpcDraft = {
  name: '',
  modelNumber: '',
  issueType: '',
  personality: [],
  complaints: '',
  possibleResolution: '',
  correctResolution: '',
  enabled: true,
};

const FIELD_CLASS =
  'min-h-10 w-full rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-accent';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</span>;
}

export default function AdminChallengeNpcsTab() {
  const [npcs, setNpcs] = useState<ChallengeNpc[] | null>(null);
  const [draft, setDraft] = useState<NpcDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setNpcs(await adminListChallengeNpcs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load NPCs');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (npc: ChallengeNpc) => {
    setDraft({
      id: npc.id,
      name: npc.name,
      modelNumber: npc.modelNumber,
      issueType: npc.issueType,
      personality: [...npc.personality],
      complaints: npc.complaints,
      possibleResolution: npc.possibleResolution,
      correctResolution: npc.correctResolution,
      enabled: npc.enabled,
    });
    setError(null);
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await adminSaveChallengeNpc({ ...draft, id: draft.id ?? '' });
      setNpcs((current) => {
        const rows = current ?? [];
        return draft.id
          ? rows.map((npc) => npc.id === saved.id ? saved : npc)
          : [...rows, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save NPC');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteChallengeNpc(id);
      setNpcs((current) => current?.filter((npc) => npc.id !== id) ?? []);
      setConfirmDelete(null);
      if (draft?.id === id) setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete NPC');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="custom-scrollbar -mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1" aria-label="Commune NPC editor">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Commune role-play NPCs</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Configure a customer challenge. Agents can meet active characters in the Commune.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => void load()} className="glass-btn rounded-lg p-2 text-muted-foreground hover:text-foreground" aria-label="Reload NPCs">
            <RefreshCw className="size-3.5" />
          </button>
          <button type="button" onClick={() => { setDraft({ ...EMPTY_DRAFT }); setError(null); }} className="flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/15 px-3 py-2 text-[10px] font-bold text-primary hover:bg-primary/25">
            <Plus className="size-3.5" /> Add NPC
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {draft && (
        <div className="space-y-3 rounded-xl border border-accent/35 bg-card/50 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-foreground">{draft.id ? 'Edit NPC' : 'New Commune NPC'}</h4>
            <button type="button" onClick={() => setDraft(null)} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Close NPC editor">
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0"><FieldLabel>NPC name</FieldLabel><input className={FIELD_CLASS} maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Casey with the stuck DEEBOT" /></label>
            <label className="min-w-0"><FieldLabel>Robot model</FieldLabel><select className={FIELD_CLASS} value={draft.modelNumber} onChange={(e) => setDraft({ ...draft, modelNumber: e.target.value })}><option value="">Select a model</option>{DEEBOT_MODELS.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
            <label className="min-w-0 sm:col-span-2"><FieldLabel>Issue type</FieldLabel><select className={FIELD_CLASS} value={draft.issueType} onChange={(e) => setDraft({ ...draft, issueType: e.target.value })}><option value="">Select an issue type</option>{ISSUE_TYPES.map((issue) => <option key={issue} value={issue}>{issue.replace('::', ' · ')}</option>)}</select></label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Personality · quick inserts</legend>
            <div className="flex flex-wrap gap-1.5">
              {NPC_PERSONALITIES.map((trait) => {
                const selected = draft.personality.includes(trait);
                return (
                  <button
                    key={trait}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...draft, personality: selected ? draft.personality.filter((item) => item !== trait) : [...draft.personality, trait] })}
                    className={cn('rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', selected ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border/60 bg-background/30 text-muted-foreground hover:text-foreground')}
                  >
                    {trait}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0"><FieldLabel>Customer complaints</FieldLabel><textarea className={cn(FIELD_CLASS, 'min-h-24 resize-y')} maxLength={4000} value={draft.complaints} onChange={(e) => setDraft({ ...draft, complaints: e.target.value })} placeholder="Symptoms, history, and what the customer is upset about" /></label>
            <label className="min-w-0"><FieldLabel>Possible resolution · not the final fix</FieldLabel><textarea className={cn(FIELD_CLASS, 'min-h-24 resize-y')} maxLength={2000} value={draft.possibleResolution} onChange={(e) => setDraft({ ...draft, possibleResolution: e.target.value })} placeholder="A plausible troubleshooting step that may not fully solve the issue" /></label>
            <label className="min-w-0 sm:col-span-2"><FieldLabel>Correct resolution · challenge success condition</FieldLabel><textarea className={cn(FIELD_CLASS, 'min-h-24 resize-y')} maxLength={3000} value={draft.correctResolution} onChange={(e) => setDraft({ ...draft, correctResolution: e.target.value })} placeholder="The verified final resolution the agent must identify and explain" /></label>
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="accent-emerald-500" />
            Active in Commune
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border/60 px-3 py-2 text-[10px] font-bold text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="button" disabled={busy || !draft.name.trim() || !draft.modelNumber || !draft.issueType || !draft.complaints.trim() || !draft.correctResolution.trim()} onClick={() => void save()} className="flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-[10px] font-bold text-emerald-200 disabled:opacity-45">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save NPC
            </button>
          </div>
        </div>
      )}

      {npcs === null ? (
        <div className="grid min-h-24 place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : npcs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">No custom NPCs yet. Add one to place a new challenge in Commune.</p>
      ) : (
        <div className="space-y-2">
          {npcs.map((npc) => (
            <div key={npc.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3', npc.enabled ? 'border-border/60 bg-background/30' : 'border-border/40 bg-muted/20 opacity-70')}>
              <div className="grid size-9 shrink-0 place-items-center rounded-full border border-rose-300/30 bg-rose-300/10 font-mono text-[10px] font-bold text-rose-200">{npc.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">{npc.name}{!npc.enabled && <span className="ml-2 text-[9px] uppercase text-muted-foreground">Inactive</span>}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{npc.modelNumber} · {npc.issueType.replace('::', ' · ')}</p>
                <p className="mt-0.5 truncate text-[9px] text-muted-foreground/80">{npc.personality.join(' · ') || 'No personality tags'}</p>
              </div>
              <button type="button" onClick={() => startEdit(npc)} className="rounded-lg border border-border/60 p-2 text-muted-foreground hover:text-foreground" aria-label={`Edit ${npc.name}`}><Pencil className="size-3.5" /></button>
              {confirmDelete === npc.id ? (
                <span className="flex gap-1">
                  <button type="button" disabled={busy} onClick={() => void remove(npc.id)} className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] font-bold text-destructive">Confirm</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg border border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(npc.id)} className="rounded-lg border border-destructive/30 p-2 text-destructive/80 hover:bg-destructive/10" aria-label={`Delete ${npc.name}`}><Trash2 className="size-3.5" /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
