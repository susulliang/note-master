import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import KeywordAlertContent from '@/components/KeywordAlertContent';
import { useKeywordAlerts, KEYWORD_ALERTS_UPDATED_EVENT } from '@/hooks/use-keyword-alerts';
import type { KeywordAlert } from '@/lib/keyword-alerts';
import { getStoredToken } from '@/lib/auth-client';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const PANEL = 'glass-panel rounded-xl';
const INPUT =
  'glass-field w-full rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70';

function newAlert(): KeywordAlert {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `kw-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    keyword: '',
    alert: '',
    format: 'markdown',
  };
}

export default function KeywordAlertsManager() {
  const { alerts, source } = useKeywordAlerts();
  const [drafts, setDrafts] = useState<KeywordAlert[]>(alerts);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const { setSpice } = useAuth();

  useEffect(() => setDrafts(alerts), [alerts]);

  const updateAlert = (id: string, patch: Partial<KeywordAlert>) => {
    setDrafts((current) => current.map((alert) => alert.id === id ? { ...alert, ...patch } : alert));
    setMessage(null);
  };

  const save = async () => {
    if (drafts.some((alert) => !alert.keyword.trim() || !alert.alert.trim())) {
      setMessage({ kind: 'error', text: 'Complete every keyword and alert before saving.' });
      return;
    }
    const token = getStoredToken();
    if (!token) {
      setMessage({ kind: 'error', text: 'Only logged-in admins can save keyword alerts.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/keyword-alerts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alerts: drafts }),
      });
      const result = await response.json() as { error?: string; spice?: number };
      if (!response.ok) throw new Error(result.error || 'Could not save alerts.');
      setMessage({ kind: 'success', text: `Saved ${drafts.length} keyword alert${drafts.length === 1 ? '' : 's'} to D1.` });
      // Editing the alert database earns the admin +5 spice.
      if (typeof result.spice === 'number') {
        setSpice(result.spice);
        try {
          toast.success('🌶️ +5 Spice', { description: 'Keyword alerts updated.' });
        } catch {
          /* Toaster not mounted */
        }
      }
      window.dispatchEvent(new Event(KEYWORD_ALERTS_UPDATED_EVENT));
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Could not save alerts.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className={cn(PANEL, 'overflow-hidden p-4 sm:p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-amber-400/10 p-2 text-amber-300">
              <AlertTriangle className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground sm:text-lg">Keyword Alert Database</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Manage the terms the cat listens for during live calls and the reminders agents see when one is mentioned.
                HTML is converted to safe formatting for preview; scripts and active markup never run.
              </p>
            </div>
          </div>
          <span className={cn(
            'glass-chip rounded-full px-2.5 py-1 text-[10px] font-medium',
            source === 'database'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
              : source === 'loading'
                ? 'border-border/60 bg-background/40 text-muted-foreground'
                : 'border-amber-400/20 bg-amber-400/10 text-amber-100',
          )}>
            {source === 'database' ? 'Cloudflare D1' : source === 'loading' ? 'Loading alerts…' : 'Built-in defaults'}
          </span>
        </div>
        {source === 'defaults' && (
          <p className="glass-panel mt-3 rounded-lg border-amber-400/25 bg-amber-400/[0.04] px-3 py-2 text-xs text-amber-100">
            D1 is empty or unavailable, so these are the current built-in defaults. Saving will create the database list.
          </p>
        )}
      </section>

      <section className={cn(PANEL, 'p-3 sm:p-4')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Alerts <span className="font-mono text-xs text-muted-foreground">{drafts.length}</span></h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Changes stay in this draft until you save them to D1.</p>
          </div>
          <button
            type="button"
            onClick={() => { setDrafts((current) => [...current, newAlert()]); setMessage(null); }}
            disabled={source === 'loading'}
            className="glass-btn inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Plus className="size-3.5" /> Add alert
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="glass-panel rounded-lg border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No alerts in this draft. Saving an empty list restores the built-in defaults for agents.
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((alert, index) => (
              <article key={alert.id} className="glass-panel rounded-lg p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Alert {String(index + 1).padStart(2, '0')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDrafts((current) => current.filter((item) => item.id !== alert.id));
                      setMessage(null);
                    }}
                    aria-label={`Delete ${alert.keyword || `alert ${index + 1}`}`}
                    disabled={source === 'loading'}
                    className="glass-btn inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                  <label className="block text-[11px] font-medium text-muted-foreground">
                    Trigger keyword or phrase
                    <input
                      value={alert.keyword}
                      onChange={(event) => updateAlert(alert.id, { keyword: event.target.value })}
                      disabled={source === 'loading'}
                      maxLength={200}
                      placeholder="e.g. factory reset"
                      className={cn(INPUT, 'mt-1')}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-muted-foreground">
                    Content format
                    <select
                      value={alert.format}
                      onChange={(event) => updateAlert(alert.id, { format: event.target.value as KeywordAlert['format'] })}
                      disabled={source === 'loading'}
                      className={cn(INPUT, 'mt-1')}
                    >
                      <option value="markdown">Markdown</option>
                      <option value="html">HTML formatting</option>
                    </select>
                  </label>
                </div>

                <label className="mt-3 block text-[11px] font-medium text-muted-foreground">
                  Alert content
                  <textarea
                    value={alert.alert}
                    onChange={(event) => updateAlert(alert.id, { alert: event.target.value })}
                    disabled={source === 'loading'}
                    maxLength={10_000}
                    rows={alert.format === 'html' ? 6 : 4}
                    placeholder={alert.format === 'html' ? '<strong>Reminder:</strong> ...' : '**Reminder:** ...'}
                    className={cn(INPUT, 'mt-1 resize-y font-mono text-xs leading-relaxed')}
                  />
                </label>

                <div className="glass-panel mt-3 rounded-md p-3">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Safe preview</p>
                  {alert.alert.trim()
                    ? <KeywordAlertContent alert={alert} />
                    : <p className="text-xs italic text-muted-foreground">Preview appears as you type.</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={cn(PANEL, 'p-3 sm:p-4')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Changes go live for every agent the moment you save. Admin login only — every save earns <span className="font-bold text-amber-400">🌶️ +5 Spice</span>.
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || source === 'loading'}
            className="glass-btn glass-btn-primary inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait disabled:opacity-60"
          >
            <Save className="size-4" /> {saving ? 'Saving…' : 'Save to D1'}
          </button>
        </div>
        {message && (
          <p role="status" className={cn('glass-panel mt-3 rounded-md px-3 py-2 text-xs', message.kind === 'success' ? 'border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200' : 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200')}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
