/**
 * Pure merge policy for auto-parsed values into the ticket form fields.
 *
 * Extracted from the page so the exact layering semantics — which engine may
 * overwrite whose text — are unit-testable (scripts/test-parser-trading.ts):
 *
 *  - REGEX (the relegated engine) only ever fills an EMPTY field — anything
 *    a human or another parser already wrote is untouchable;
 *  - REGEX-GROW / PARAPHRASE (the evolving machine text) replace the value a
 *    previous regex or paraphrase pass wrote — that is what keeps the
 *    accumulating boxes GROWING as the call talks about new information —
 *    but never touch human-typed or main-LLM text;
 *  - the LLM is authoritative: it replaces a provisional REGEX value and
 *    replaces its OWN previous value (keeping the human-typed base in
 *    front), but APPENDS to text the agent typed by hand, so nothing a
 *    human wrote is ever lost and repeated parses never pile up.
 */
export function mergeAutoFill(curTrimmed, priorSource, humanBase, value, source) {
    if (curTrimmed.length === 0) {
        return { next: value, base: source === 'llm' ? '' : null };
    }
    if (source === 'regex') {
        // Never disturbs an existing value (also the race guard: the field was
        // filled after this callback was captured)
        return { next: curTrimmed, base: null };
    }
    if (source === 'regex-grow' || source === 'paraphrase') {
        // Evolving machine text: replace the regex/paraphrase-authored value.
        // Human-typed and main-parse text is untouchable.
        if (priorSource === 'regex' ||
            priorSource === 'regex-grow' ||
            priorSource === 'paraphrase') {
            return { next: value, base: null };
        }
        return { next: curTrimmed, base: null };
    }
    if (priorSource === 'llm') {
        // Replace the machine-written portion; the human base stays in front
        return { next: humanBase ? `${humanBase} -> ${value}` : value, base: humanBase };
    }
    if (priorSource === 'regex' || priorSource === 'regex-grow' || priorSource === 'paraphrase') {
        // LLM supersedes the provisional pattern-matched / paraphrased value
        return { next: value, base: '' };
    }
    // Human-typed text — append, never overwrite
    const sep = curTrimmed.endsWith('->') ? ' ' : ' -> ';
    return { next: `${curTrimmed}${sep}${value}`, base: curTrimmed };
}
