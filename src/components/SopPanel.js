import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import sopRaw from '../../SOP/SOP.md?raw';
import { indexSopMarkdown, scoreKeywordCandidates, buildSopRerankPrompt, } from '@/utils/sopIndexer';
import { extractJsonLoose } from '@/lib/llm-parser';
import { MicOff, Sparkles, Search, BookOpen, Loader2, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderBodyMarkdown } from './SopPanel.md';
/* -------------------------------------------------------------------------- */
/*                                 SopPanel                                   */
/* -------------------------------------------------------------------------- */
const CANDIDATE_TOP_N = 5;
export default function SopPanel({ formData, issueTypeId, detailedIssueId, purchaseInfoId, getFinalNote, cloudGenerate, llmGenerate, llmStatus = 'disabled', llmIsReady = false, warmLlm, }) {
    // --- index -----------------------------------------------------------
    const sections = useMemo(() => indexSopMarkdown(sopRaw), []);
    const byId = useMemo(() => {
        const m = new Map();
        for (const s of sections)
            m.set(s.id, s);
        return m;
    }, [sections]);
    // --- query inputs ----------------------------------------------------
    const issueType = String(formData[issueTypeId] ?? '').trim();
    const detailedIssue = String(formData[detailedIssueId] ?? '').trim();
    const purchaseInfo = String(formData[purchaseInfoId] ?? '').trim();
    // Keep a debounced (250ms) snapshot of keyword candidates so typing
    // into the issue textarea doesn't thrash scoring on every keystroke.
    const [query, setQuery] = useState(() => `${issueType}\n${detailedIssue}\n${purchaseInfo}`);
    const debounceRef = useRef(null);
    useEffect(() => {
        const next = `${issueType}\n${detailedIssue}\n${purchaseInfo}`;
        if (next === query)
            return;
        if (debounceRef.current !== null)
            window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => setQuery(next), 250);
        return () => {
            if (debounceRef.current !== null)
                window.clearTimeout(debounceRef.current);
        };
    }, [issueType, detailedIssue, purchaseInfo, query]);
    const keyword = useMemo(() => scoreKeywordCandidates(sections, query).slice(0, CANDIDATE_TOP_N), [sections, query]);
    // --- active section --------------------------------------------------
    const [activeId, setActiveId] = useState(() => keyword[0]?.section.id ?? null);
    // Auto-promote the new top keyword hit when user doesn't have a manual
    // selection pinned, and keyword list changes.
    const [pinned, setPinned] = useState(false);
    useEffect(() => {
        if (pinned)
            return;
        const top = keyword[0]?.section.id ?? null;
        setActiveId((prev) => prev ?? top);
        if (top && activeId !== top)
            setActiveId(top);
    }, [keyword[0]?.section.id, pinned, activeId]);
    const activeSection = activeId ? byId.get(activeId) ?? null : null;
    // --- manual dropdown -------------------------------------------------
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownFilter, setDropdownFilter] = useState('');
    const dropdownCandidates = useMemo(() => {
        const needle = dropdownFilter.trim().toLowerCase();
        if (!needle)
            return sections.slice(0, 400); // cap list length safely
        const scored = scoreKeywordCandidates(sections, needle).slice(0, 200);
        return scored.map((k) => k.section);
    }, [sections, dropdownFilter]);
    // --- LLM rerank ------------------------------------------------------
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmResult, setLlmResult] = useState(null);
    const [llmError, setLlmError] = useState(null);
    // --- SOP image lightbox ----------------------------------------------
    const [lightbox, setLightbox] = useState(null);
    // Close lightbox on Escape key (standard UX)
    useEffect(() => {
        if (!lightbox)
            return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape')
                setLightbox(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightbox]);
    const runLlmRerank = useCallback(async () => {
        setLlmError(null);
        // Priority of LLM backends for SOP heading match:
        //   1. `cloudGenerate` — DeepSeek via env secret (the default backend).
        //      Warm-up is instant (no model download) so we call it directly.
        //   2. `llmGenerate` — the on-device local WASM LLM, which may still
        //      be downloading; we warm it up and check readiness first.
        let generator;
        if (cloudGenerate) {
            generator = cloudGenerate;
        }
        else if (llmGenerate) {
            if (warmLlm) {
                await warmLlm();
                if (!llmIsReady) {
                    setLlmError(llmStatus === 'disabled'
                        ? 'Local LLM is disabled — enable it in the transcript panel engine settings, or set VITE_DEEPSEEK_API_KEY for cloud matching.'
                        : 'Local LLM is still loading. Wait ~30s and try again, or use the keyword picks below.');
                    return;
                }
            }
            generator = llmGenerate;
        }
        else {
            setLlmError('No AI backend is available yet. Set VITE_DEEPSEEK_API_KEY for cloud matching, or enable a local LLM build in settings.');
            return;
        }
        // Ticket-context fields sent explicitly to the LLM along with the
        // SOP candidate titles (buildSopRerankPrompt includes them as the
        // primary context, with the formatted note only a disambiguation tie
        // breaker).
        const finalNote = getFinalNote().trim();
        const fieldSummary = [
            issueType && `Issue: ${issueType}`,
            detailedIssue && `Details: ${detailedIssue.slice(0, 220)}`,
            purchaseInfo && `Purchase: ${purchaseInfo}`,
        ].filter(Boolean).join(' · ');
        // Pick candidate pool: top CANDIDATE_TOP_N keywords, plus the currently
        // active section if it's not already in there. Gives the LLM a short,
        // relevant shortlist instead of 500+ headings (would overflow prompt
        // context on the 0.5B models).
        const pool = [];
        const seen = new Set();
        for (const k of keyword) {
            if (!seen.has(k.section.id)) {
                pool.push(k.section);
                seen.add(k.section.id);
            }
        }
        if (activeSection && !seen.has(activeSection.id)) {
            pool.push(activeSection);
            seen.add(activeSection.id);
        }
        if (pool.length === 0) {
            setLlmError('No SOP headings to pick from.');
            return;
        }
        setLlmLoading(true);
        try {
            const { system, user } = buildSopRerankPrompt({
                finalNote,
                issueType,
                issueDescription: detailedIssue,
                purchaseChannelAndDate: purchaseInfo,
                candidates: pool.map((s) => ({
                    id: s.id,
                    title: s.title,
                    snippet: s.bodyLines.slice(0, 8).join(' ').slice(0, 220),
                })),
            });
            const reply = await generator(system, user, 256);
            const cleaned = reply.text.trim();
            if (!cleaned || reply.timedOut) {
                setLlmError(reply.timedOut
                    ? 'AI call failed or timed out. (For the on-device local LLM, WASM generation can take a minute on CPU.)'
                    : 'AI returned an empty reply.');
                return;
            }
            const json = extractJsonLoose(cleaned);
            const bestIdRaw = json && typeof json === 'object' && 'bestId' in json
                ? String(json.bestId ?? '')
                : '';
            const reasonRaw = json && typeof json === 'object' && 'reason' in json
                ? String(json.reason ?? '')
                : '';
            if (!json || bestIdRaw === '') {
                setLlmError(`Couldn't parse AI reply as valid JSON. Raw (${cleaned.length} chars): ${cleaned.slice(0, 180)}${cleaned.length > 180 ? '…' : ''}`);
                return;
            }
            const bestId = bestIdRaw === '__NONE__' ? pool[0].id : bestIdRaw;
            if (!byId.has(bestId)) {
                setLlmError(`AI picked unknown section id "${bestId}" — falling back to keyword top pick.`);
                // Fall through to keyword #1 anyway, don't hard-break.
                const fallbackId = pool[0].id;
                setLlmResult({ bestId: fallbackId, reason: reasonRaw + ' (fallback: AI id unknown)', notePreview: fieldSummary.slice(0, 140) || finalNote.slice(0, 120) });
                setPinned(true);
                setActiveId(fallbackId);
                return;
            }
            setLlmResult({ bestId, reason: reasonRaw, notePreview: fieldSummary.slice(0, 140) || finalNote.slice(0, 120) });
            setPinned(true);
            setActiveId(bestId);
        }
        catch (e) {
            setLlmError(String(e?.message ?? e));
        }
        finally {
            setLlmLoading(false);
        }
    }, [
        cloudGenerate,
        llmGenerate,
        warmLlm,
        llmStatus,
        llmIsReady,
        getFinalNote,
        keyword,
        activeSection,
        byId,
        issueType,
        detailedIssue,
        purchaseInfo,
    ]);
    // --- header/status bits ---------------------------------------------
    const total = sections.length;
    const keywordTopTitle = keyword[0]?.section.title ?? 'Waiting for issue details…';
    const breadcrumb = (() => {
        const chain = [];
        let cur = activeSection;
        while (cur) {
            chain.unshift(cur.title);
            cur = cur.parentId ? byId.get(cur.parentId) : null;
        }
        return chain;
    })();
    return (<div className="flex min-h-[280px] flex-col gap-2">
      {/* Status row: SOP stats + AI rerank button */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-foreground/10 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground">
          <BookOpen className="size-3 text-primary"/>
          SOP indexed · <span className="font-semibold text-foreground">{total}</span> headings
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-foreground/10 bg-card/40 px-2 py-1 text-[11px] text-muted-foreground">
          <Search className="size-3 text-accent/80"/>
          Keyword best:
          <span className="max-w-[220px] truncate font-medium text-foreground" title={keywordTopTitle}>
            {keywordTopTitle}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={runLlmRerank} disabled={llmLoading || (!cloudGenerate && !llmGenerate)} className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-all', 'border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25', (llmLoading || (!cloudGenerate && !llmGenerate)) && 'opacity-60 cursor-not-allowed')} title={cloudGenerate
            ? 'Use AI to match ticket fields against the indexed SOP heading titles and return the best relevant section. Runs on the remote AI backend (no local download).'
            : llmStatus === 'loading'
                ? 'Local LLM is still downloading / warming up…'
                : 'Use the on-device LLM to match ticket fields against the indexed SOP heading titles and return the best relevant section.'}>
            {llmLoading ? <Loader2 className="size-3 animate-spin"/> : <Sparkles className="size-3"/>}
            {llmLoading ? 'AI matching…' : 'SOP AI Match'}
          </button>
        </div>
      </div>

      {/* LLM status / error line */}
      {llmError && (<div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
          ⚠ {llmError}
        </div>)}
      {llmResult && (<div className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] text-primary/90">
          <strong>AI picked:</strong> <span className="font-semibold">{byId.get(llmResult.bestId)?.title ?? llmResult.bestId}</span>
          {llmResult.reason && <span className="ml-2 text-primary/75">— {llmResult.reason}</span>}
        </div>)}

      {/* Candidate chips (Top N keyword) */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Closest matches by issue details
        </div>
        <div className="flex flex-wrap gap-1.5">
          {keyword.length === 0 && (<span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground">
              <MicOff className="size-3"/>
              Fill in <strong>Issue Type</strong> and <strong>Detailed Issue</strong> above to get auto-matches.
            </span>)}
          {keyword.map((k) => {
            const active = k.section.id === activeId;
            return (<button key={k.section.id} type="button" onClick={() => {
                    setActiveId(k.section.id);
                    setPinned(true);
                }} className={cn('group inline-flex max-w-full items-baseline gap-1.5 rounded-md border px-2 py-1 text-left transition-all', active
                    ? 'border-primary/50 bg-primary/15 text-primary-foreground/95 ring-1 ring-primary/40'
                    : 'border-foreground/10 bg-card/40 hover:border-accent/40 hover:bg-accent/10 text-foreground/90')} title={`Score: ${k.score.toFixed(1)} — matches: ${k.matchedTokens.join(', ') || '(none shown)'}`}>
                <span className={cn('text-[10px] font-mono', active ? 'text-primary/80' : 'text-muted-foreground/70')}>
                  {k.score.toFixed(0)}
                </span>
                <span className="line-clamp-1 max-w-[260px] text-[11.5px] font-medium">{k.section.title}</span>
                <RefreshCw className="size-2.5 opacity-0 transition-opacity group-hover:opacity-60"/>
              </button>);
        })}
        </div>
      </div>

      {/* Manual section picker (combobox-ish) */}
      <div className="relative">
        <button type="button" onClick={() => setDropdownOpen((o) => !o)} className="flex w-full items-center justify-between rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-left text-[12px] text-foreground/90 hover:border-accent/40">
          <span className="truncate">
            {activeSection ? (<>
                <span className="font-mono text-[10px] text-muted-foreground mr-1">{activeSection.id}</span>
                {breadcrumb.join(' › ')}
              </>) : (<span className="text-muted-foreground">Browse or search all {total} SOP headings…</span>)}
          </span>
          <ChevronDown className={cn('size-3.5 transition-transform', dropdownOpen && 'rotate-180')}/>
        </button>
        {dropdownOpen && (<div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-hidden rounded-md border border-border/60 bg-card/95 shadow-2xl backdrop-blur-md">
            <div className="border-b border-border/60 px-2 py-1.5">
              <input autoFocus value={dropdownFilter} onChange={(e) => setDropdownFilter(e.target.value)} placeholder="Filter headings by keyword…" className="w-full rounded-sm bg-background/60 px-2 py-1 text-[12px] outline-none ring-1 ring-transparent focus:ring-accent/40"/>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {dropdownCandidates.slice(0, 300).map((s) => {
                const selected = s.id === activeId;
                return (<button key={s.id} type="button" onClick={() => {
                        setActiveId(s.id);
                        setPinned(true);
                        setDropdownOpen(false);
                    }} className={cn('flex w-full items-baseline gap-2 px-2 py-1 text-left text-[12px]', selected
                        ? 'bg-primary/15 text-primary-foreground/95'
                        : 'text-foreground/90 hover:bg-accent/10')}>
                    <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0 w-12">{s.id}</span>
                    <span className="truncate">{s.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">H{s.level}</span>
                  </button>);
            })}
              {dropdownCandidates.length === 0 && (<div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                  No matching SOP headings for “{dropdownFilter}”.
                </div>)}
            </div>
          </div>)}
      </div>

      {/* Content viewer. NOTE: this scrolling reader area is intentionally
            NOT draggable as a gridbox node handle — the content area swallows
            mouse-down so only the SopPanel's header/chip/status row initiates
            a node drag. Users interact with text selection, scroll, image
            clicks etc. without accidentally nudging the box. */}
      <div className="flex-1 overflow-y-auto rounded-md border border-foreground/10 bg-background/40 px-3 py-2.5 max-h-[260px]" onMouseDownCapture={(e) => {
            // Text selection / scroll / img click / link click — all need to
            // bypass the FlowNode outer drag-handler.
            e.stopPropagation();
        }} onClick={() => {
            // Click outside → close the open heading picker dropdown
            if (dropdownOpen)
                setDropdownOpen(false);
        }}>
        {!activeSection && (<div className="flex flex-col items-start gap-1 py-4 text-[12px] text-muted-foreground">
            <div className="flex items-center gap-1.5 font-semibold text-foreground/80">
              <BookOpen className="size-3.5 text-primary"/> No SOP section picked yet.
            </div>
            <p>
              As you fill in <strong>Issue Type</strong>, <strong>Detailed Issue</strong>, and <strong>Purchase Channel/Date</strong>,
              the chips above will auto-rank. Click any chip to read the full SOP content for that heading.
              Or hit <span className="text-primary font-semibold">SOP AI Match</span> once your ticket fields are ready to have the AI rerank the
              indexed heading candidates against the ticket fields and current SOP title matches.
            </p>
          </div>)}
        {activeSection && (<div>
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-foreground/10 pb-1.5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                  {activeSection.id} · H{activeSection.level} · {activeSection.bodyLines.length} body lines
                </div>
                <div className="mt-0.5 text-[14px] font-bold text-foreground">{activeSection.title}</div>
              </div>
              {pinned && (<span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent/90">
                  Pinned
                </span>)}
            </div>
            <div className="space-y-0.5">
              {renderBodyMarkdown(activeSection.bodyLines, {
                onImageClick: (src, alt) => setLightbox({ src, alt }),
            })}
            </div>
          </div>)}
      </div>

      {/* Near-fullscreen image lightbox — anchored to viewport (fixed), sits
            above everything with a near-black frosted backdrop. Covers the
            whole browser window regardless of canvas scroll position. */}
      {lightbox && (<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-6 backdrop-blur-md animate-in fade-in duration-150" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label={lightbox.alt || 'Full-size SOP image'} onMouseDownCapture={(e) => {
                // Don't let the lightbox overlay be a drag handle for the
                // parent FlowNode either.
                e.stopPropagation();
            }}>
          <button type="button" className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 shadow-lg transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60" onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
            }} aria-label="Close image viewer">
            ✕
          </button>
          <div className="relative z-0 max-h-[92vh] max-w-[92vw] rounded-xl border border-white/10 bg-black/40 p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.alt} className="block max-h-[90vh] max-w-[90vw] w-auto h-auto rounded-lg object-contain" onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent && !parent.querySelector('[data-sop-lightbox-missing]')) {
                    const fallback = document.createElement('div');
                    fallback.setAttribute('data-sop-lightbox-missing', '');
                    fallback.className = 'flex h-72 w-96 max-w-[85vw] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-6 text-center text-[13px] text-white/70';
                    fallback.innerHTML = '🖼️ <strong class="text-white/90">Image unavailable</strong><br /><span class="mt-2 max-w-[85%] truncate text-[11px] text-white/50">' + lightbox.src + '</span>';
                    parent.prepend(fallback);
                }
            }}/>
            <div className="mt-2 px-1 text-[11px] text-white/55">
              <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-white/40">SOP reference image</span>
              {lightbox.alt && <span className="text-white/70">{lightbox.alt}  ·  </span>}
              <span className="truncate">{decodeURIComponent(lightbox.src.split('/').pop() || '')}</span>
            </div>
          </div>
        </div>)}
    </div>);
}
