/**
 * Whisper garbage detection — keeps hallucinated "speech" out of the
 * transcript, the parsers and the ticket note.
 *
 * On music, echo, silence or heavily degraded audio Whisper does not stay
 * quiet — it invents text. Two dominant failure shapes, both visible when
 * feeding a recorded conversation through the capture pipeline:
 *
 *  1. ARTIFACT TAGS — bracketed non-speech markers, English ([BLANK_AUDIO],
 *     [INAUDIBLE], [Music]) or French ([Musique], [ouh]), plus turns that
 *     strip down to punctuation only (".").
 *  2. REPETITION LOOPS — one phrase copypasted many times ("Je vous invite
 *     à vous dire que vous avez une question qui vous donne à vous dire
 *     que …"). Whisper emits these on music/echo segments; a single turn
 *     can carry 30+ repetitions and eat the whole LLM prompt window.
 *
 *  3. TINY TURNS — a single French/English function word ("de", "à") with
 *     no information content. Real single-word acknowledgments ("Oui",
 *     "Okay", "Merci") are KEPT — they carry turn-taking signal.
 *
 * Cross-turn duplicates (the same normalized line from the same speaker
 * arriving as many separate turns — e.g. "Je vous invite à vous dire que
 * vous êtes une bonne journée." ×10) are handled by the capture hook with
 * a family counter: see use-call-capture.ts.
 */

/** French function words that carry no information when said alone */
const LONE_FUNCTION_WORDS = new Set([
  // French
  'de', 'du', 'des', 'à', 'au', 'aux', 'et', 'la', 'le', 'les', 'un', 'une',
  'en', 'dans', 'pour', 'par', 'sur', 'ou', 'où', 'que', 'qui', 'quoi', 'ce',
  'cet', 'cette', 'ces', 'se', 'sa', 'son', 'ses', 'leur', 'leurs', 'mais',
  'donc', 'or', 'ni', 'car', 'comme', 'tout', 'tous', 'toute', 'toutes',
  'plus', 'moins', 'très', 'bien', 'aussi', 'alors', 'quand', 'chez', 'vers',
  'sous', 'entre', 'voici', 'voilà', 'ça', 'cela', 'y', 'en',
  // English (tiny connectives — NOT yes/no/ok/thanks, those are meaningful)
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'is', 'it', 'and', 'or',
  'but', 'so', 'for', 'with', 'that', 'this', 'you', 'your',
]);

/** Turn is one lone function word — no information, not even an ack */
function isLoneFunctionWord(words: string[]): boolean {
  return words.length === 1 && LONE_FUNCTION_WORDS.has(words[0]);
}

/**
 * Artifact tag: any short bracketed or parenthesized non-speech marker.
 * Whisper only emits brackets for audio events — user speech never lands
 * inside them — so a whole-line tag (of any wording, any language) is safe
 * to drop, and inline tags are safe to strip.
 */
const ANY_TAG = /[[(][^\])]{1,30}[\])]/g;

/** Words only: lowercase, letters/digits, single-spaced (for comparisons) */
function toWords(text: string): string[] {
  return text
    .replace(ANY_TAG, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Why a turn is garbage */
export type GarbageReason = 'artifact' | 'empty' | 'tiny' | 'loop';

export interface GarbageVerdict {
  reason: GarbageReason;
  /** The repeated phrase, when reason === 'loop' (debug/UI display) */
  unit?: string;
}

/** Shortest repetition unit worth reporting, in words */
const MIN_UNIT_WORDS = 3;
/** A loop needs at least this many back-to-back repetitions of the unit */
const MIN_REPEATS = 3;
/** Repeated words must cover at least this share of the turn */
const MIN_COVERAGE = 0.55;

/**
 * Detect the repetition-loop hallucination INSIDE one turn: the same word
 * window repeated back-to-back. Consecutive EXACT equality is the safe
 * signal — real speech never stacks the same 3+ words 3+ times in a row
 * (a caller spelling an email says "L comme Lyon, E comme Éric" — every
 * unit differs), while a hallucination loop is literally the same phrase
 * over and over, often truncated mid-unit at the end.
 */
function findRepetitionLoop(words: string[]): string | null {
  if (words.length < MIN_UNIT_WORDS * MIN_REPEATS) return null;

  const maxUnit = Math.min(14, Math.floor(words.length / MIN_REPEATS));
  for (let unitLen = maxUnit; unitLen >= MIN_UNIT_WORDS; unitLen -= 1) {
    for (let start = 0; start + unitLen * 2 <= words.length; start += 1) {
      let repeats = 1;
      for (
        let j = start + unitLen;
        j + unitLen <= words.length;
        j += unitLen
      ) {
        let equal = true;
        for (let k = 0; k < unitLen; k += 1) {
          if (words[start + k] !== words[j + k]) {
            equal = false;
            break;
          }
        }
        if (!equal) break;
        repeats += 1;
      }
      if (
        repeats >= MIN_REPEATS &&
        (repeats * unitLen) / words.length >= MIN_COVERAGE
      ) {
        return words.slice(start, start + unitLen).join(' ');
      }
    }
  }
  return null;
}

/**
 * Classify one transcribed turn. Returns null for real speech (keep it),
 * or the reason it is Whisper garbage (drop it before it ever reaches the
 * transcript / regex extraction / LLM prompt).
 */
export function classifyWhisperGarbage(text: string): GarbageVerdict | null {
  const words = toWords(text);

  // Only artifact tags / punctuation — no letters or digits survive
  if (words.length === 0) {
    return /[[(][^\])]{1,30}[\])]/.test(text)
      ? { reason: 'artifact' }
      : { reason: 'empty' };
  }

  // A single function word ("de", "à") — hallucinated filler, not an ack
  if (isLoneFunctionWord(words)) return { reason: 'tiny' };

  // Repetition loop ("… vous donne à vous dire que …" × 30)
  const unit = findRepetitionLoop(words);
  if (unit) return { reason: 'loop', unit };

  return null;
}

/**
 * Normalized comparison key for CROSS-TURN duplicate detection: same
 * speaker saying the same ≥4-word line again and again as separate turns
 * ("Je vous invite à vous faire une autre vidéo." ×6) is a hallucination
 * family — the capture hook counts occurrences per key and drops the
 * family once it repeats.
 */
export function familyKey(speaker: string, text: string): string {
  const words = toWords(text);
  return words.length >= 4 ? `${speaker}::${words.join(' ')}` : '';
}

/** Word count used by the family rule (≥4 words to qualify) */
export function familyEligible(text: string): boolean {
  return toWords(text).length >= 4;
}
