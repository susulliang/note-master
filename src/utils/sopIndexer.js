/**
 * SOP indexer — splits SOP.md into its heading/section tree so the SOP
 * gridbox can search it, surface candidate headings, and hand the LLM
 * a clean list of (id → title) pairs for a final-note-based rerank.
 *
 * Works against the raw markdown string imported via Vite's `?raw` loader.
 * Headings are split on lines starting with `#{1,6} `; subheadings live
 * inside the body of their parent until a same-or-higher-level heading
 * appears, which closes the current section and opens a new one.
 */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
/** Cheap backslash-escape cleaner: `1\. DTC` → `1. DTC` */
function cleanEscapes(raw) {
    return raw.replace(/\\([!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-])/g, '$1').trim();
}
/** Parse a raw SOP markdown string into sections indexed by heading. */
export function indexSopMarkdown(raw) {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const sections = [];
    // Stack of active open sections by heading level; index = heading level-1
    // value = section index in `sections` array, or -1 if nothing open.
    const levelStack = [0, 0, 0, 0, 0, 0].map(() => -1);
    let counter = 0;
    const openSection = (level, title) => {
        // Close any subsection that is DEEPER than the incoming heading.
        for (let l = 6; l >= level; l -= 1) {
            levelStack[l - 1] = -1;
        }
        // Parent = the nearest active higher-level heading.
        let parentIdx = -1;
        for (let l = level - 1; l >= 1; l -= 1) {
            if (levelStack[l - 1] !== -1) {
                parentIdx = levelStack[l - 1];
                break;
            }
        }
        const idx = sections.length;
        const id = `h${level}-${counter}`;
        counter += 1;
        sections.push({
            id,
            level,
            title: cleanEscapes(title),
            bodyLines: [],
            parentId: parentIdx === -1 ? null : sections[parentIdx].id,
        });
        levelStack[level - 1] = idx;
        // Nested headings below this one live INSIDE this section's body until
        // a same-or-higher heading closes them. But we still treat them as
        // first-class searchable sub-sections, so the search surface stays
        // granular. We accomplish this by letting the content accumulate into
        // ALL currently-open ancestors' bodyLines as well as the leaf's.
        return idx;
    };
    const appendLine = (line) => {
        // Push this content line into every currently-open section so a
        // top-level heading's "full body" also includes its subheading
        // content (useful for coarse matches). The leaf gets it too via the
        // levelStack's lowest active slot.
        for (let l = 6; l >= 1; l -= 1) {
            const sIdx = levelStack[l - 1];
            if (sIdx !== -1) {
                sections[sIdx].bodyLines.push(line);
            }
        }
    };
    // Sentinel: ensure the very first line is always a heading (SOP.md
    // starts with `# 北美流程整合...`). If it doesn't, treat preamble lines
    // as belonging to a synthetic root section.
    for (const rawLine of lines) {
        const m = rawLine.match(HEADING_RE);
        if (m) {
            const level = m[1].length;
            openSection(level, m[2]);
        }
        else {
            appendLine(rawLine);
        }
    }
    // Trim trailing empty lines from each section's body.
    for (const s of sections) {
        while (s.bodyLines.length > 0 && s.bodyLines[s.bodyLines.length - 1].trim() === '') {
            s.bodyLines.pop();
        }
    }
    return sections;
}
/* -------------------------------------------------------------------------- */
/*                                   Search                                   */
/* -------------------------------------------------------------------------- */
/** Very small stopword set — bilingual (English + a few very common CN
 *  助词) so heading scoring isn't dominated by "the / 的 / 了 / is".
 *  Intentionally tiny; a real porter/icu tokenizer is not worth the
 *  50KB bundle weight for a local keyword scorer that's only used as a
 *  FIRST-PASS surface before the LLM reranks. */
const STOPWORDS = new Set([
    // English
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is',
    'are', 'was', 'were', 'be', 'with', 'from', 'that', 'this', 'how',
    'do', 'does', 'did', 'can', 'cannot', 'if', 'not', 'no', 'you',
    'customer', 'please', 'agent', 'need', 'needs', 'about', 'when',
    // CN high-frequency function words
    '的', '了', '和', '是', '在', '与', '及', '或', '等', '有', '将',
    '进行', '可以', '需要', '请', '您', '我们', '他们', '相关',
]);
/** Split a string into case-folded tokens. Runs both a space/punct split
 *  (for English/numbers/codes) and a 2-gram CJK split (for Chinese terms
 *  that don't use spaces as word boundaries). */
export function tokenize(input) {
    if (!input)
        return [];
    const s = input.toLowerCase();
    const out = [];
    // (1) Word tokens: letters/digits/slashes/hyphens/underscores/percent
    // separated by punctuation/space.
    const wordRe = /[a-z0-9/%#_+-]+/g;
    let m;
    while ((m = wordRe.exec(s)) !== null) {
        const tok = m[0];
        if (tok.length >= 2 && !STOPWORDS.has(tok))
            out.push(tok);
    }
    // (2) CJK n-grams: every consecutive 2-char window of CJK ideographs
    // becomes a token. 2-grams give good specificity without the massive
    // blow-up of 1-grams' noise.
    const cjkRe = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7a3]+/g;
    while ((m = cjkRe.exec(s)) !== null) {
        const chunk = m[0];
        for (let i = 0; i + 2 <= chunk.length; i += 1) {
            out.push(chunk.substring(i, i + 2));
        }
    }
    return out;
}
export function scoreKeywordCandidates(sections, query) {
    const qTokens = tokenize(query);
    if (qTokens.length === 0)
        return [];
    // Document frequency: how many sections each token appears in.
    const df = new Map();
    const sectionTokens = sections.map((s) => {
        const doc = `${s.title}\n\n${s.bodyLines.slice(0, 40).join('\n').slice(0, 600)}`;
        const toks = tokenize(doc);
        const unique = new Set(toks);
        for (const t of unique)
            df.set(t, (df.get(t) ?? 0) + 1);
        return toks;
    });
    const N = sections.length || 1;
    const qSet = new Set(qTokens);
    const results = [];
    for (let i = 0; i < sections.length; i += 1) {
        const s = sections[i];
        const titleTokens = tokenize(s.title);
        const titleSet = new Set(titleTokens);
        const bodyToks = sectionTokens[i];
        const matched = new Set();
        let score = 0;
        for (const qt of qSet) {
            const freq = df.get(qt) ?? 0;
            const rareBoost = freq > 0 && freq / N <= 0.3 ? 2 : 1;
            let hitCount = 0;
            if (titleSet.has(qt)) {
                hitCount += 4; // title match ×4
            }
            // count body occurrences, cap at 4
            let bodyHits = 0;
            for (const bt of bodyToks) {
                if (bt === qt) {
                    bodyHits += 1;
                    if (bodyHits >= 4)
                        break;
                }
            }
            hitCount += bodyHits;
            if (hitCount > 0) {
                score += hitCount * rareBoost;
                matched.add(qt);
            }
        }
        if (score > 0) {
            results.push({ section: s, score, matchedTokens: Array.from(matched) });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
}
/* -------------------------------------------------------------------------- */
/*                       LLM prompt for heading selection                     */
/* -------------------------------------------------------------------------- */
/** Build the prompt pair that asks the local LLM to pick the single best
 *  SOP heading for a given ticket context / final note. Returns a JSON
 *  shape contract of `{ bestId: string, reason?: string }` so we can
 *  extract it with the same `extractJsonLoose` helper already used by the
 *  transcript parser. */
export function buildSopRerankPrompt(args) {
    const { finalNote, issueType, issueDescription, purchaseChannelAndDate, candidates } = args;
    const candidateList = candidates
        .map((c, idx) => {
        const snippet = c.snippet.replace(/\s+/g, ' ').trim().slice(0, 180);
        return `${idx + 1}. [id:${c.id}] ${c.title}${snippet ? ` — preview: "${snippet}"` : ''}`;
    })
        .join('\n');
    const system = [
        'You are an Ecovacs North America agent-assistant working inside the',
        'ticket-taking workspace. Your job is to read a ticket summary and',
        'select the single BEST-MATCHING Standard Operating Procedure (SOP)',
        'heading from the candidate list that the support agent should follow.',
        '',
        "Match primarily on the customer's issue and purchase situation.",
        'Warranty-eligibility decisions depend on purchase date/channel.',
        'When nothing fits perfectly, pick the closest general category, not',
        'a hyper-specific sub-section that only covers one edge case.',
        '',
        'Respond ONLY in valid JSON with this exact shape:',
        '  { "bestId": "<candidate id>", "reason": "<1 short sentence>" }',
        'If NO candidate is relevant at all, set bestId to "__NONE__".',
    ].join('\n');
    const user = [
        '## Ticket context',
        `Issue type: ${issueType || '(not set)'}`,
        `Issue description: ${issueDescription || '(not set)'}`,
        `Purchase channel / date: ${purchaseChannelAndDate || '(not set)'}`,
        '',
        '## Final formatted note (use for disambiguation if details above are empty)',
        finalNote || '(no final note yet)',
        '',
        '## SOP candidate headings',
        candidateList || '(no indexed SOP headings available)',
        '',
        'Pick bestId and reason. Strict JSON only, no prose outside JSON.',
    ].join('\n');
    return { system, user };
}
