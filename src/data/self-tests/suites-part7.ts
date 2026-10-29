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
      {
        article: 'QC Pitfalls — Two-Week Deduction Review',
        date: '2026-10-27',
        questions: [
          {
            id: 'w13q4',
            prompt: 'How many times must you address the customer by name on a call before QC starts deducting — and how much is the deduction?',
            options: [
              'At least twice; fewer than twice is an instant -10',
              'At least once; fewer than once is an instant -5',
              'At least three times; fewer is -10',
              'Names are optional; only the closing matters',
            ],
            answerIndex: 0,
            explanation:
              'QC pitfall review: failing to address the customer by name twice or more is an instant -10. Other flagged items: incomplete Call Notes, wrong OOW case tag (-15 each), wrong issue type/model/SN entry, repeated info collection (Class-B escalation), and dead air over 5 seconds (Class-C escalation).',
            source: '2026-10-27 · 流程相关',
          },
        ],
      },
      {
        article: 'US & CA Halloween Sale Live',
        date: '2026-10-27',
        questions: [
          {
            id: 'w13q5',
            prompt: 'What are the Halloween sale windows for the US and CA sites?',
            options: [
              'US Oct 27 – Nov 2; CA Oct 26 – Nov 1',
              'US Oct 26 – Nov 1; CA Oct 27 – Nov 2',
              'US Oct 27 – Nov 2; CA Oct 27 – Nov 2',
              'US Oct 26 – Nov 2; CA Oct 26 – Nov 2',
            ],
            answerIndex: 0,
            explanation:
              'US Halloween sale runs Oct 27 – Nov 2 (ecovacs.com/us/shop/promotion); CA runs Oct 26 – Nov 1 (ecovacs.com/ca/shop/promotion). Featured: X12S OC+ transition bundle, T90S ULTRA OMNI, W3 OMNI Package, A3000 LiDAR PRO mini bundle.',
            source: '2026-10-27 · General',
          },
        ],
      },
      {
        article: 'T90S ULTRA OMNI Black & White Launch on US Site',
        date: '2026-10-27',
        questions: [
          {
            id: 'w13q6',
            prompt: 'A customer asks how the new T90S ULTRA OMNI differs from the T90S PRO OMNI. What do you tell them?',
            options: [
              'Dual tanks plus an extra heavy-soil cleaning solution in the box',
              'A stronger lidar and an extra mop cloth',
              'Same hardware, only the colorways are new',
              'It adds auto-empty dust bags the PRO lacks',
            ],
            answerIndex: 0,
            explanation:
              'The T90S ULTRA OMNI (Black/White, launched Oct 27 on the US site) differs from the T90S PRO OMNI by having dual tanks and an extra bottle of heavy-soil cleaning solution in the box.',
            source: '2026-10-27 · General',
          },
        ],
      },
      {
        article: 'Salesforce New Features — Chat, AMR Shipping Limits, WO Changes',
        date: '2026-10-27',
        questions: [
          {
            id: 'w13q7',
            prompt: 'With the new Salesforce Chat History tab, how far back can you see a returning customer\'s past chats?',
            options: [
              'Last 2 days, with Open Case linking to the related case',
              'Last 7 days, read-only with no case links',
              'Last 24 hours only',
              'Full MTD history for the current month',
            ],
            answerIndex: 0,
            explanation:
              'New SF chat features: highlighted customer messages, busy-queue with auto-connect, and a Chat History tab (scroll down on the right panel) showing the customer\'s chats from the last 2 days — "Open Case" opens the related case. Also rolling out: AMR country shipping limits (US cases search US stock only; CA may fall back to US stock), auto-pulled OOW repair WOs under the AMR Repair view, and a Cancellation Remarks page on WO close.',
            source: '2026-10-27 · General',
          },
        ],
      },
      {
        article: 'OOW Courtesy Email Templates — Pick the Right One',
        date: '2026-10-28',
        questions: [
          {
            id: 'w13q8',
            prompt: 'An out-of-warranty customer bought their unit over 2 years ago. What does the courtesy replacement carry?',
            options: [
              'No extra warranty — use the Special OOW Courtesy template',
              '90-day warranty — use the OOW Courtesy template',
              '6-month warranty — use the Special OOW Courtesy template',
              '1-year warranty — same as a new purchase',
            ],
            answerIndex: 0,
            explanation:
              'OOW Courtesy (purchase >1 yr and <2 yrs): replacement carries a 90-day warranty. OOW Special Courtesy (purchase >2 yrs): NO extra warranty. Sending the 90-day template to 2-year-plus customers is the flagged mistake — templates updated 2026-10-27.',
            source: '2026-10-28 · 流程相关',
          },
        ],
      },
      {
        article: 'Connection Outage — Response Flow & Escalation Template',
        date: '2026-10-29',
        questions: [
          {
            id: 'w13q9',
            prompt: 'Users report "cannot connect to server" and a server-side outage is confirmed. What do you do?',
            options: [
              'Skip troubleshooting; say the team is fixing it and to retry later',
              'Keep running the full standard troubleshooting script',
              'Register a replacement unit for every affected case',
              'Tell users to reinstall the app and factory reset',
            ],
            answerIndex: 0,
            explanation:
              'During the Oct 29 outage: once the server-side issue is confirmed, skip further troubleshooting and say "Some users may experience connection issues with our app right now. Our team is working on it and it will be back soon. Please try again later." Collect SN + Case Number in the group thread; use the urgent escalation template only for fully-collected users (SN is mandatory — get it during the conversation if it cannot be fetched).',
            source: '2026-10-29 · General',
          },
        ],
      },
      {
        article: 'WINBOT MINI 2 — Detachable Corner Brush Design Transition',
        date: '2026-10-29',
        questions: [
          {
            id: 'w13q10',
            prompt: 'A WINBOT MINI 2 produced BEFORE August 2026 gets a corner-brush question triggered by the manual. What is the correct response?',
            options: [
              'Brushes are fixed — cleaning only; repair service if they insist',
              'Tell the user to pull the brush off and plug a new one in',
              'Register four replacement brushes as spare parts',
              'Mark the unit as defective and offer a swap',
            ],
            answerIndex: 0,
            explanation:
              'Version cutoff by production date: pre-August 2026 units have FIXED corner brushes — explain routine cleaning is enough, arrange repair only if the user strongly insists (self-replacement not supported). Post-August 2026 units are detachable by design — guide plug-in/out reattachment, never route to repair. Maintenance follows manual page 19 for all versions.',
            source: '2026-10-29 · 知识点分享群',
          },
        ],
      },
      {
        article: 'ECOVACS HOME App V3.17.1 Released',
        date: '2026-10-29',
        questions: [
          {
            id: 'w13q11',
            prompt: 'News flash: ECOVACS HOME app V3.17.1 is out with details in an internal doc. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Latest app version V3.17.1; details: https://ecovacs.feishu.cn/wiki/I5cMwl5E3isJlikSLQKcy4y0n6e (internal reference only).',
            source: '2026-10-29 · General',
          },
        ],
      },
      {
        article: 'Halloween App Theme Live — 3D Map Default & How to Turn It Off',
        date: '2026-10-30',
        questions: [
          {
            id: 'w13q12',
            prompt: 'A user dislikes the Halloween app theme and its 3D map. What are their options?',
            options: [
              'Reject it once from the popup, or disable Personalized ambience in Settings',
              'Uninstall and reinstall the app to clear the theme',
              'The theme cannot be turned off until the event ends',
              'Contact support to have the theme removed remotely',
            ],
            answerIndex: 0,
            explanation:
              'Halloween theme runs Oct 27 20:00 – Nov 2 11:59 (GMT+8) for DEEBOT X12/X11/X9S/T90/T80S+, WINBOT W1+, GOAT G1+. The map defaults to 3D — double-tap to return to 2D. One-time off: tap "Reject this theme" on the homepage popup. Permanent off: Me - Settings - Personalized ambience, switch it off.',
            source: '2026-10-30 · General',
          },
        ],
      },
      {
        article: 'Remove "AI Support" from Email Subjects Before Replying',
        date: '2026-10-30',
        questions: [
          {
            id: 'w13q13',
            prompt: 'After the AI Agent drafts an email reply, what must you do with the subject line before sending?',
            options: [
              'Manually delete the auto-inserted "AI Support" text',
              'Leave it — the system strips it automatically',
              'Replace it with the customer\'s first name',
              'Add "ECOVACS Official" in front of it',
            ],
            answerIndex: 0,
            explanation:
              'The AI Agent auto-inserts "AI Support" into the subject of Interaction - Email replies. Manually delete it before sending to avoid confusing the customer.',
            source: '2026-10-30 · 流程相关',
          },
        ],
      },
      {
        article: 'Technical Escalation Cases — Tag, Status & Daily Follow-Up',
        date: '2026-10-30',
        questions: [
          {
            id: 'w13q14',
            prompt: 'What tag and status must every technical-escalation case you own carry — and how often do you check progress?',
            options: [
              'Tag "Waiting for Technical", status "Working", checked daily',
              'Tag "Escalated", status "Pending", checked weekly',
              'Tag "Waiting for Technical", status "On Hold", checked on request',
              'No tag needed; just email engineering and wait',
            ],
            answerIndex: 0,
            explanation:
              'Technical escalation standard: set Case Tag to "Waiting for Technical" and Status to "Working", then check progress once every day.',
            source: '2026-10-30 · 流程相关',
          },
        ],
      },
    ],
  },
];
