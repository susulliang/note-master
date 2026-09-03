import React from 'react';
import { cn } from '@/lib/utils';
/* --------------------------- Image path resolver --------------------------- */
/**
 * Resolve a markdown image src (relative to SOP.md's on-disk location) to
 * a URL the browser can fetch. SOP.md lives at the repo root `SOP/SOP.md`
 * and its pictures sit next to it in `SOP/assets/`. We serve that folder
 * under the URL prefix `${base}SOP/` where `base` = Vite's configured
 * deploy path (typically `/` or `/app/$MIAODA_APP_ID/`):
 *
 *   ![](assets/image%201.png)  →  `{base}SOP/assets/image%201.png`
 *   ![](./SOP/assets/foo.png)  →  `{base}SOP/assets/foo.png`
 *   ![](图片和附件/old.png)     →  `{base}SOP/assets/old.png`  (compat rewrite)
 */
export function resolveSopImageSrc(rawSrc) {
    const src = rawSrc.trim();
    if (!src)
        return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(src))
        return src;
    if (src.startsWith('/'))
        return src;
    let decoded;
    try {
        decoded = decodeURIComponent(src);
    }
    catch {
        decoded = src;
    }
    let normalized = decoded.replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (normalized.startsWith('SOP/'))
        normalized = normalized.slice(4);
    if (normalized.startsWith('图片和附件/')) {
        normalized = 'assets/' + normalized.slice(5);
    }
    const segments = normalized.split('/').filter((s) => s !== '' && s !== '.');
    const cleaned = [];
    for (const seg of segments) {
        if (seg === '..')
            cleaned.pop();
        else
            cleaned.push(seg);
    }
    if (cleaned.length === 0)
        return '';
    const encoded = cleaned.map((s) => encodeURIComponent(s)).join('/');
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/');
    return base + 'SOP/' + encoded;
}
/* ----------------------- Markdown escapes + helpers ----------------------- */
/** Unescape markdown backslash escapes in rendered text. Applied to plain
 *  text segments and (recursively) to the content of emphasis / link labels
 *  / headings / table cells. Code spans are left untouched. */
function unescapeMd(s) {
    return s.replace(/\\([\\`*_{}\[\]()#+\-.!|>&~=])/g, '$1');
}
/** Split a GFM pipe table row. Strips leading/trailing pipes, then splits
 *  on UNESCAPED `|` only. `\|` backslash escapes are preserved as-is and
 *  flattened later by `unescapeMd` when the cell renders. */
function splitPipeRow(raw) {
    const s = raw.replace(/^\s*\|+/, '').replace(/\|+\s*$/, '');
    const cells = [];
    let buf = '';
    for (let k = 0; k < s.length; k += 1) {
        const ch = s[k];
        if (ch === '\\' && s[k + 1] === '|') {
            buf += '\\|';
            k += 1;
        }
        else if (ch === '|') {
            cells.push(buf.trim());
            buf = '';
        }
        else {
            buf += ch;
        }
    }
    cells.push(buf.trim());
    return cells;
}
/** GFM table separator: `|:---|:---:|`  — every non-empty cell must match
 *  optional leading colon, ≥3 dashes, optional trailing colon. */
function isTableSeparator(line) {
    if (!line.includes('|'))
        return false;
    const cells = splitPipeRow(line).filter((c) => c !== '');
    if (cells.length === 0)
        return false;
    return cells.every((c) => /^\s*:?-{3,}:?\s*$/.test(c));
}
function isPlausibleTableRow(line) {
    return line.includes('|') && line.trim().length > 0;
}
/** Best-effort unfold of a line that's had newlines stripped out of its
 *  GFM table by a copy-paste. The pattern produced by rich text pasting
 *  into input fields is: `|hdrA|hdrB| |---|---| |bodyA|bodyB|` — rows are
 *  joined by literal ` | ` (space, pipe, space). We split on that boundary
 *  and restore leading/trailing pipes on each fragment. Only applied when
 *  (a) the line looks crushed (≥ 2× as many pipes as an N-column row
 *  would normally use) AND (b) the fragments after splitting produce a
 *  valid header + separator pair. Otherwise the original line is kept
 *  untouched so a weird paragraph that happens to mention `x | y` is not
 *  mis-classified as a table. */
function tryUnfoldCrushedTable(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|'))
        return null;
    if (!/\|\s+\|/.test(trimmed))
        return null;
    const fragments = trimmed.split(/\|\s+\|/);
    const rows = fragments.map((r, idx, arr) => {
        const needsLead = idx !== 0 && !r.startsWith('|');
        const needsTrail = idx !== arr.length - 1 && !r.endsWith('|');
        return (needsLead ? '|' : '') + r + (needsTrail ? '|' : '');
    });
    if (rows.length < 3)
        return null;
    if (!isTableSeparator(rows[1] ?? ''))
        return null;
    return rows;
}
/**
 * Compact in-house markdown renderer tuned for SOP content. Blocks:
 *   headings / GFM pipe tables / blockquotes / ordered lists / 2-level
 *   nested unordered lists / paragraphs. Inline: images (clickable →
 *   lightbox callback) / links / inline code / bold `**` or `__` / italic
 *   `*` or `_` / hard `<br>`. Escape: `\|`, `\*`, `\_`, `\&`, … → literal
 *   char. Images, code and links use the same card styling as before.
 */
export function renderBodyMarkdown(lines, opts = {}) {
    // Preprocess: unfold any single-line "crushed" tables that copy-paste
    // produced by stripping newlines from between rows. One line becomes
    // header + separator + N body rows, so the rest of the parser never has
    // to think about the crushed case.
    const normalizedLines = [];
    for (const raw of lines) {
        const unfolded = tryUnfoldCrushedTable(raw);
        if (unfolded) {
            for (const row of unfolded)
                normalizedLines.push(row);
        }
        else {
            normalizedLines.push(raw);
        }
    }
    const L = normalizedLines;
    const blocks = [];
    let i = 0;
    const keyRef = { n: 0 };
    const onImageClick = opts.onImageClick;
    // ---------- Inline tokenizer (runs per text node, returns node list) -------
    const inline = (s) => {
        const tokens = [];
        const pushText = (t) => {
            if (!t)
                return;
            const last = tokens[tokens.length - 1];
            if (last && last.kind === 'text')
                last.val += t;
            else
                tokens.push({ kind: 'text', val: t });
        };
        let pos = 0;
        while (pos < s.length) {
            const rest = s.slice(pos);
            // 1) Backslash escape — preserve the 2-char sequence, unescapeMd
            //    will flatten it on output.
            if (s[pos] === '\\' && /^\\[\\`*_{}\[\]()#+\-.!|>&~=]/.test(rest)) {
                pushText(s.slice(pos, pos + 2));
                pos += 2;
                continue;
            }
            // 2) Hard break: <br> <br/> <br />
            {
                const m = /^<br\s*\/?>/i.exec(rest);
                if (m) {
                    tokens.push({ kind: 'br' });
                    pos += m[0].length;
                    continue;
                }
            }
            // 3) Image: ![alt](src) with optional quoted title
            {
                const m = /^!\[([^\]]*)\]\(([^\s)]+(?:\s+"[^"]*")?)\)/.exec(rest);
                if (m) {
                    const alt = (m[1] || '').trim();
                    const rawSrc = (m[2] || '').split(/\s+/)[0];
                    tokens.push({ kind: 'img', alt, rawSrc });
                    pos += m[0].length;
                    continue;
                }
            }
            // 4) Link: [label](href) with optional quoted title
            {
                const m = /^\[([^\]]*)\]\(([^\s)]+(?:\s+"[^"]*")?)\)/.exec(rest);
                if (m) {
                    tokens.push({ kind: 'link', label: m[1] || '', href: (m[2] || '').split(/\s+/)[0] });
                    pos += m[0].length;
                    continue;
                }
            }
            // 5) Inline code: `x` / `` y ``
            {
                const m = /^(`+)([^`]+?)\1/.exec(rest);
                if (m) {
                    tokens.push({ kind: 'code', val: m[2] || '' });
                    pos += m[0].length;
                    continue;
                }
            }
            // 6) Bold: **foo** / __foo__ — multi-line non-greedy, accepts CJK
            //    and punctuation that the old `[^*_]+?` regex would reject.
            {
                const mb = /^(\*\*|__)([\s\S]*?)\1/.exec(rest);
                if (mb && (mb[2] || '').trim().length > 0) {
                    tokens.push({
                        kind: 'strong',
                        val: mb[2] || '',
                        marker: mb[1],
                    });
                    pos += mb[0].length;
                    continue;
                }
            }
            // 7) Italic: *foo* / _foo_ — same relaxed char class.
            {
                const mi = /^(\*|_)([\s\S]*?)\1/.exec(rest);
                if (mi && (mi[2] || '').length > 0) {
                    tokens.push({
                        kind: 'em',
                        val: mi[2] || '',
                        marker: mi[1],
                    });
                    pos += mi[0].length;
                    continue;
                }
            }
            // 8) Default — eat 1 character as plain text
            pushText(s[pos] || '');
            pos += 1;
        }
        let k = 0;
        const out = [];
        for (const t of tokens) {
            switch (t.kind) {
                case 'text':
                    out.push(unescapeMd(t.val));
                    break;
                case 'br':
                    out.push(<br key={`br-${k++}`}/>);
                    break;
                case 'img': {
                    const alt = t.alt || 'image';
                    const resolved = resolveSopImageSrc(t.rawSrc);
                    let baseFn = t.rawSrc.split('/').pop() || t.rawSrc || alt;
                    try {
                        baseFn = decodeURIComponent(baseFn);
                    }
                    catch { /* keep raw */ }
                    out.push(<span key={`img-${k++}`} className="my-2 inline-flex w-full max-w-md flex-col gap-1.5 rounded-lg border border-foreground/10 bg-card/40 p-2 text-[11px] text-muted-foreground shadow-sm">
              <button type="button" className="group w-full cursor-zoom-in overflow-hidden rounded-md bg-foreground/5 transition-all hover:bg-foreground/10 active:scale-[0.995]" onClick={() => onImageClick?.(resolved, alt)} title={`Click to open full-size image: ${baseFn}${alt && alt !== baseFn ? ` / ${alt}` : ''}`}>
                {resolved ? (<img src={resolved} alt={alt} loading="lazy" onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const sib = e.currentTarget.parentElement?.querySelector('[data-sop-img-fallback]');
                                if (sib)
                                    sib.style.display = 'flex';
                            }} className="h-auto max-h-52 w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"/>) : null}
                <span data-sop-img-fallback className="hidden min-h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-foreground/10 px-2 py-4 text-[10px] text-muted-foreground">
                  🖼️ <span className="truncate">{baseFn}</span>
                  <span className="text-muted-foreground/60">（image unavailable）</span>
                </span>
              </button>
              <span className="flex items-center gap-1 truncate px-0.5">
                <span className="shrink-0">🖼️</span>
                <span className="truncate" title={baseFn}>{baseFn}</span>
                {alt && alt !== baseFn && (<span className="ml-auto max-w-[55%] truncate text-muted-foreground/70" title={alt}>— {alt}</span>)}
              </span>
            </span>);
                    break;
                }
                case 'link':
                    out.push(<a key={`a-${k++}`} href={t.href} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
              {inline(t.label)}
            </a>);
                    break;
                case 'code':
                    out.push(<code key={`c-${k++}`} className="rounded bg-foreground/10 px-1 py-0.5 text-[11px] font-mono text-foreground/90">
              {t.val}
            </code>);
                    break;
                case 'strong':
                    out.push(<strong key={`b-${k++}`} className="text-foreground font-semibold">
              {inline(t.val)}
            </strong>);
                    break;
                case 'em':
                    out.push(<em key={`i-${k++}`} className="text-foreground/95 italic">
              {inline(t.val)}
            </em>);
                    break;
            }
        }
        return out;
    };
    // ---------- Block parser --------------------------------------------------
    while (i < L.length) {
        const raw = L[i] ?? '';
        // Blank → paragraph separator
        if (raw.trim() === '') {
            i += 1;
            continue;
        }
        // Headings (#, ##, ###)
        {
            const h = /^(#{1,6})\s+(.+?)\s*$/.exec(raw);
            if (h) {
                const lv = h[1].length;
                const sizeClass = lv <= 1 ? 'text-base font-bold' : lv === 2 ? 'text-[15px] font-semibold' : 'text-sm font-semibold';
                blocks.push(<div key={`h-${keyRef.n++}`} className={cn('mt-3 mb-1 text-foreground', sizeClass)}>
            {inline(h[2])}
          </div>);
                i += 1;
                continue;
            }
        }
        // Blockquote (leading >)
        if (/^>\s?/.test(raw)) {
            const buf = [];
            while (i < L.length && /^>\s?/.test(L[i])) {
                buf.push(L[i].replace(/^>\s?/, ''));
                i += 1;
            }
            blocks.push(<blockquote key={`bq-${keyRef.n++}`} className="my-1.5 border-l-2 border-accent/60 bg-accent/5 pl-3 pr-2 py-1.5 text-[13px] text-foreground/90 rounded-r-md">
          {buf.map((l, idx) => (<div key={idx}>{inline(l)}</div>))}
        </blockquote>);
            continue;
        }
        // GFM table — header row + `|:---:|---|` separator + contiguous body rows
        if (isPlausibleTableRow(raw)) {
            const next = L[i + 1] ?? '';
            if (isTableSeparator(next)) {
                const headerCells = splitPipeRow(raw);
                const separatorCells = splitPipeRow(next);
                const colCount = Math.max(headerCells.length, separatorCells.length);
                const align = [];
                for (let c = 0; c < colCount; c += 1) {
                    const sep = (separatorCells[c] ?? '').trim();
                    const l = sep.startsWith(':');
                    const r = sep.endsWith(':') && sep.length > 0;
                    align.push(l && r ? 'center' : r ? 'right' : 'left');
                }
                i += 2;
                const bodyRows = [];
                while (i < L.length) {
                    const r = L[i] ?? '';
                    if (r.trim() === '')
                        break;
                    if (!isPlausibleTableRow(r))
                        break;
                    bodyRows.push(splitPipeRow(r));
                    i += 1;
                }
                const alignClass = (a) => a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';
                blocks.push(<div key={`tbl-${keyRef.n++}`} className="my-2 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse border border-border bg-card/30 text-[12px] text-foreground/95">
              <thead>
                <tr>
                  {headerCells.map((cell, c) => {
                        const a = align[c] ?? 'left';
                        return (<th key={c} className={cn('border border-border bg-primary/20 px-3 py-1.5 text-[12px] font-semibold text-foreground', alignClass(a))}>
                        {inline(cell)}
                      </th>);
                    })}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (<tr key={ri} className={cn(ri % 2 === 1 ? 'bg-foreground/[0.04]' : undefined)}>
                    {headerCells.map((_h, c) => {
                            const a = align[c] ?? 'left';
                            const val = row[c] ?? '';
                            return (<td key={c} className={cn('border border-border px-3 py-1.5 align-top', alignClass(a))}>
                          {inline(val)}
                        </td>);
                        })}
                  </tr>))}
              </tbody>
            </table>
          </div>);
                continue;
            }
        }
        // Unordered list (- / * / +) — 2-level nesting via indent
        if (/^\s*[-*+]\s+/.test(raw)) {
            const rows = [];
            while (i < L.length && /^\s*[-*+]\s+/.test(L[i])) {
                const line = L[i];
                const indent = (/^\s*/.exec(line)?.[0] ?? '').length;
                rows.push({ indent, text: line.replace(/^\s*[-*+]\s+/, '') });
                i += 1;
            }
            const renderRows = (from, parentIndent) => {
                const items = [];
                let j = from;
                while (j < rows.length) {
                    const r = rows[j];
                    if (r.indent < parentIndent)
                        break;
                    if (r.indent > parentIndent) {
                        const [subTree, nextJ] = renderRows(j, r.indent);
                        const prev = items[items.length - 1];
                        if (prev) {
                            const prevProps = prev.props;
                            const cloned = React.cloneElement(prev, {
                                children: (<>
                    {prevProps.children}
                    <ul className="my-0.5 list-disc space-y-0.5 pl-4 marker:text-muted-foreground/70">
                      {subTree}
                    </ul>
                  </>),
                            });
                            items[items.length - 1] = cloned;
                        }
                        j = nextJ;
                        continue;
                    }
                    items.push(<li key={j}>{inline(r.text)}</li>);
                    j += 1;
                }
                return [items, j];
            };
            const [rootItems] = renderRows(0, rows[0]?.indent ?? 0);
            blocks.push(<ul key={`ul-${keyRef.n++}`} className="my-1 list-disc space-y-0.5 pl-5 text-[13px] text-foreground/90 marker:text-muted-foreground/70">
          {rootItems}
        </ul>);
            continue;
        }
        // Ordered list (1. / 2))
        if (/^\s*\d+[.)]\s+/.test(raw)) {
            const items = [];
            while (i < L.length && /^\s*\d+[.)]\s+/.test(L[i])) {
                items.push(L[i].replace(/^\s*\d+[.)]\s+/, ''));
                i += 1;
            }
            blocks.push(<ol key={`ol-${keyRef.n++}`} className="my-1 list-decimal space-y-0.5 pl-5 text-[13px] text-foreground/90 marker:text-muted-foreground/70">
          {items.map((it, idx) => (<li key={idx}>{inline(it)}</li>))}
        </ol>);
            continue;
        }
        // Paragraph — merge contiguous non-blank, non-special L. A table
        // header+separator pair terminates the paragraph.
        const pLines = [raw];
        i += 1;
        while (i < L.length &&
            L[i].trim() !== '' &&
            !/^(#{1,6})\s+/.test(L[i]) &&
            !/^>\s?/.test(L[i]) &&
            !/^\s*[-*+]\s+/.test(L[i]) &&
            !/^\s*\d+[.)]\s+/.test(L[i]) &&
            !(isPlausibleTableRow(L[i]) && isTableSeparator(L[i + 1] ?? ''))) {
            pLines.push(L[i]);
            i += 1;
        }
        blocks.push(<p key={`p-${keyRef.n++}`} className="my-1 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {inline(pLines.join(' '))}
      </p>);
    }
    return blocks;
}
