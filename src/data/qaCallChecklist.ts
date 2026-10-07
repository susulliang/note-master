/**
 * Call-channel QA checklist — distilled from the EN "Quality Assurance
 * Standards V4" (see qaStandards.ts) for PHONE calls only: the chat/email
 * etiquette rows are excluded, and each item keeps its table weight so the
 * whole checklist sums to 100 points. Drives the bottom-bar QA menu progress
 * bars and the LLM completion scoring that runs alongside the cloud parse.
 */

export interface QaChecklistItem {
  /** Stable id used in the LLM reply JSON and the scores state map */
  id: string;
  /** Short EN label shown in the QA menu */
  label: string;
  /** Max points (QA table weight) */
  max: number;
  /** What the scorer should look for — one compact instruction line */
  criteria: string;
}

export interface QaChecklistDimension {
  dimension: string;
  weight: string;
  items: QaChecklistItem[];
}

export const QA_CALL_CHECKLIST: QaChecklistDimension[] = [
  {
    dimension: 'Issue Identification',
    weight: '20%',
    items: [
      {
        id: 'probe',
        label: 'Summarize & uncover customer needs',
        max: 10,
        criteria:
          'Agent gathered the necessary info before proposing solutions, summarized a complex situation to confirm understanding, checked history for repeat contacts, and did NOT re-ask for information the customer already provided.',
      },
      {
        id: 'questions',
        label: 'Clear, logical questioning',
        max: 10,
        criteria:
          'Questions were plain and jargon-free, built progressively on the customer\u2019s answers, and only asked for necessary, relevant information.',
      },
    ],
  },
  {
    dimension: 'Product Knowledge',
    weight: '30%',
    items: [
      {
        id: 'solution',
        label: 'Correct, complete solutions',
        max: 15,
        criteria:
          'Agent identified root cause, gave correct troubleshooting/resolution steps consistent with product knowledge, answered EVERY question the customer asked, and included necessary risk reminders (e.g. data wiped by a reset).',
      },
      {
        id: 'sop',
        label: 'Followed correct SOP',
        max: 15,
        criteria:
          'Correct warranty/escalation path given purchase verification, proper commitment timelines stated, correct process for the case type (replacement, return, part order, escalation).',
      },
    ],
  },
  {
    dimension: 'Communication Skills',
    weight: '25%',
    items: [
      {
        id: 'empathy',
        label: 'Empathy expressed',
        max: 5,
        criteria:
          'Agent acknowledged the customer\u2019s frustration or situation with genuine (non-mechanical) empathy at appropriate moments.',
      },
      {
        id: 'language',
        label: 'Clear, unambiguous language',
        max: 10,
        criteria:
          'No ambiguous statements that could mislead (e.g. wrong warranty promise), no internal abbreviations used with the customer, no prohibited phrases like "it\u2019s a known issue".',
      },
      {
        id: 'etiquette',
        label: 'Phone etiquette',
        max: 10,
        criteria:
          'Agent used a standard opening and closing, asked for and used the customer\u2019s name at least twice, asked permission before holds, thanked the customer for waiting, and kept responses prompt (no dead air).',
      },
    ],
  },
  {
    dimension: 'Operational Skills',
    weight: '15%',
    items: [
      {
        id: 'notes',
        label: 'Complete info captured',
        max: 15,
        criteria:
          'Agent verbally confirmed the key ticket facts: model, purchase channel/date, serial or proof of purchase when needed, contact details, issue details — everything needed to document the case.',
      },
    ],
  },
  {
    dimension: 'Risk Awareness',
    weight: '10%',
    items: [
      {
        id: 'risk',
        label: 'Risk awareness',
        max: 10,
        criteria:
          'Agent recognized frustration / repeat-contact / complaint-escalation signals and proactively offered a call-back or follow-up commitment when the situation warranted it.',
      },
    ],
  },
];

/** Flat view of every item (id → item, ordered list) */
export const QA_CHECKLIST_ITEMS: QaChecklistItem[] = QA_CALL_CHECKLIST.flatMap((d) => d.items);

/** Total possible points — the denominator of the overall progress bar */
export const QA_CHECKLIST_TOTAL = QA_CHECKLIST_ITEMS.reduce((n, i) => n + i.max, 0);

/** Per-item score map returned by the LLM scorer (null = not scored yet) */
export type QaScores = Record<string, number>;

/**
 * Build the system+user prompt for the LLM QA scoring call. The model sees
 * the transcript plus the weighted checklist and must reply with ONE JSON
 * object of per-item scores (0..max, halves allowed).
 */
export function buildQaScoringPrompt(
  transcriptText: string
): { system: string; user: string } {
  const checklistLines = QA_CHECKLIST_ITEMS.map(
    (i) => `- "${i.id}" (max ${i.max} pts): ${i.label} — ${i.criteria}`
  ).join('\n');
  const system = [
    'You are a QA auditor scoring an Ecovacs North America CUSTOMER SUPPORT PHONE CALL (AGENT = support rep, CUSTOMER = caller).',
    'The transcript is machine-garbled ASR text — read for INTENT, not literally ("Acovox" = ECOVACS).',
    'Score EVERY checklist item from 0 to its max points based ONLY on transcript evidence. Partial credit is allowed (halves, e.g. 7.5).',
    'When the transcript gives no evidence either way for an item, give a neutral mid score (50% of max) — do not zero it.',
    'Reply with ONE JSON object only, no markdown fences, no explanations:',
    '{"scores": {"<id>": <number>, ...}, "summary": "<one short sentence on the weakest area>"}',
  ].join('\n');
  const user = [
    'Checklist (id — max points — criteria):',
    checklistLines,
    '',
    'Support call transcript:',
    transcriptText,
    '',
    'Reply with the JSON object now. Every checklist id must appear exactly once in "scores".',
  ].join('\n');
  return { system, user };
}
