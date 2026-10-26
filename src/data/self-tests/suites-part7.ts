import type { TestSuite } from './types';

// Week 13 (Oct 26 – Nov 1) — 2026
export const suitesPart7: TestSuite[] = [
  {
    id: 'w13',
    label: 'Week 13',
    range: 'Oct 26 – Nov 1',
    articles: [
      {
        article: 'WO Missing Tracking Number — Interim Lookup Sheet',
        date: '2026-10-26',
        questions: [
          {
            id: 'w13q1',
            prompt: 'A customer wants the tracking number for their warranty replacement unit, but the WO shows no synced Tracking. What do you do?',
            options: [
              'Look the number up in the interim lookup sheet first',
              'Tell the customer tracking is unavailable in any channel',
              'Open a new warranty case to force a tracking refresh',
              'Ask the customer to wait for the courier to call them',
            ],
            answerIndex: 0,
            explanation:
              'Interim workaround (2026-10-26 ET): when a warranty replacement\'s tracking is not synced into the WO, check the WO Tracking Interim Lookup Sheet first (internal Feishu sheet). Example lookup: WE16515 / WO260911504665.',
            source: '2026-10-26 · 流程相关',
          },
        ],
      },
      {
        article: 'Canada Out-of-Warranty — Atravesar Services Inspection Fee Update',
        date: '2026-10-27',
        questions: [
          {
            id: 'w13q2',
            prompt: 'For a Canada out-of-warranty repair via Atravesar Services, how is the CAD 40 inspection fee handled?',
            options: [
              'It is a separate upfront payment, not added to the repair bill',
              'It is charged but deducted from spare-parts purchases',
              'It is waived when the repair quote is accepted',
              'It is billed together with the final repair invoice',
            ],
            answerIndex: 0,
            explanation:
              'Update: the CAD 40 inspection fee is NOT merged into the total repair cost — it is payable upfront with the quotation. The CA OOW wiki and the Salesforce email template were updated accordingly (in effect since 2026-9-18, purchase older than 2 years).',
            source: '2026-10-27 · 流程相关',
          },
          {
            id: 'w13q3',
            prompt: 'What is the correct first step when sending a Canadian customer to Atravesar Services for an out-of-warranty repair?',
            options: [
              'Have them fill in the Atravesar Repair Request web form',
              'Ask them to ship the unit before any paperwork',
              'Have them call the repair center to book a slot first',
              'Email Atravesar the case number on the customer\'s behalf',
            ],
            answerIndex: 0,
            explanation:
              'Step 1 is filling in the Atravesar Services Repair Request form (https://www.atravesar.ca/OOW-Webform/); step 2 they receive the quotation + payment link (inspection fee CAD 40 upfront); step 3 pay and ship to Dock 5, 145 Riviera Dr, Markham, ON.',
            source: '2026-10-27 · 流程相关',
          },
        ],
      },
    ],
  },
];
