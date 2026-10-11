import { useEffect, useState } from 'react';
import { AlertTriangle, LockKeyhole, Plus, Save, Trash2 } from 'lucide-react';
import KeywordAlertContent from '@/components/KeywordAlertContent';
import { useKeywordAlerts, KEYWORD_ALERTS_UPDATED_EVENT } from '@/hooks/use-keyword-alerts';
import type { KeywordAlert } from '@/lib/keyword-alerts';
import { cn } from '@/lib/utils';

const PANEL = 'rounded-xl border border-border/60 bg-card/45 backdrop-blur-md';
const INPUT =
  'w-full rounded-lg border border-border/70 bg-background/55 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70';

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
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => setDrafts(alerts), [alerts]);

  const updateAlert = (id: string, patch: Partial<KeywordAlert>) => {
    setDrafts((current) => current.map((alert) => alert.id === id ? { ...alert, ...patch } : alert));
    setMessage(null);
  };

  const save = async () => {
    if (!password || drafts.some((alert) => !alert.keyword.trim() || !alert.alert.trim())) {
      setMessage({ kind: 'error', text: 'Enter a password and complete every keyword and alert.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/keyword-alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ password, alerts: drafts }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save alerts.');
      setPassword('');
      setMessage({ kind: 'success', text: `Saved ${drafts.length} keyword alert${drafts.length === 1 ? '' : 's'} to D1.` });
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
            'rounded-full border px-2.5 py-1 text-[10px] font-medium',
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
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
            D1 is empty or unavailable, so these are the current built-in defaults. Saving will create the database list.
          </p>
        )}
      </section>

      <section className={cn(PANEL, 'p-3 sm:p-4')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Alerts <span className="font-mono text-xs text-muted-foreground">{drafts.length}</span></h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Changes stay in this draft until saved with the admin password.</p>
          </div>
          <button
            type="button"
            onClick={() => { setDrafts((current) => [...current, newAlert()]); setMessage(null); }}
            disabled={source === 'loading'}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-background/45 px-3 text-xs font-semibold text-foreground transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Plus className="size-3.5" /> Add alert
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
            No alerts in this draft. Saving an empty list restores the built-in defaults for agents.
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((alert, index) => (
              <article key={alert.id} className="rounded-lg border border-border/50 bg-background/25 p-3 sm:p-4">
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
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
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

                <div className="mt-3 rounded-md border border-border/40 bg-background/40 p-3">
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
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-xs font-medium text-muted-foreground">
            Admin password
            <div className="relative mt-1">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Required to submit changes"
                className={cn(INPUT, 'pl-9')}
              />
            </div>
            <span className="mt-1 block text-[10px] font-normal">The password is verified by the Worker and is never saved in the database.</span>
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || source === 'loading'}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait disabled:opacity-60"
          >
            <Save className="size-4" /> {saving ? 'Saving…' : 'Save to D1'}
          </button>
        </div>
        {message && (
          <p role="status" className={cn('mt-3 rounded-md border px-3 py-2 text-xs', message.kind === 'success' ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200' : 'border-rose-400/20 bg-rose-400/5 text-rose-200')}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
