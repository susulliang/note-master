import type { TestSuite } from './types';

// Week 9 (Sep 28–Oct 4) & Week 10 (Oct 5–11) — 2026
export const suitesPart5: TestSuite[] = [
  {
    id: 'w09',
    label: 'Week 9',
    range: 'Sep 28 – Oct 4',
    articles: [
      {
        article: 'US Site — Prime Fall Early-Bird Live',
        date: '2026-09-29',
        questions: [
          {
            id: 'w09q1',
            prompt: 'What are the US PF early-bird dates and the landing page?',
            options: [
              '9/26 – 10/2; https://www.ecovacs.com/us/shop/promotion',
              '10/3 – 10/7; the homepage carousel',
              '9/26 – 10/14; the trade-in page',
              '10/6 – 10/7; the CA promotion page',
            ],
            answerIndex: 0,
            explanation: 'US early bird: 9/26–10/2, landing on https://www.ecovacs.com/us/shop/promotion.',
            source: '2026-09-29 · General',
          },
        ],
      },
      {
        article: 'Pool Robot Spinning — Screw Self-Replacement',
        date: '2026-09-29',
        questions: [
          {
            id: 'w09q2',
            prompt: 'A pool robot spins in circles. Per the updated FAQ, what new self-service option exists?',
            options: [
              'The user can replace the screw themselves (self-replacement guidance), before/instead of an after-sales exchange',
              'Only a full unit exchange is possible',
              'The user must buy a new climbing ring',
              'There is no fix — replace the drive belt',
            ],
            answerIndex: 0,
            explanation: 'The Sep 29 update added a self-service screw replacement solution for the spinning issue — check the FAQ for the full procedure.',
            source: '2026-09-29 · 知识点分享群',
          },
          {
            id: 'w09q3',
            prompt: 'For P1 spin-in-circles email replies, which template version should you use?',
            options: [
              'The LATEST updated email template (Sep 29 notice)',
              'The original August template',
              'Any template — all are current',
              'No template exists for this issue',
            ],
            answerIndex: 0,
            explanation: 'The spin-in-circles email template was updated — always reply with the latest version.',
            source: '2026-09-29 · 知识点分享群',
          },
        ],
      },
      {
        article: 'T50S Series Script Update — AIVI 3D 3.0 Label Mismatch',
        date: '2026-09-30',
        questions: [
          {
            id: 'w09q4',
            prompt: 'For T50S AIVI 3D 3.0 "label mismatch" concerns, what does the updated script do?',
            options: [
              'Provides the standardized reply script for the AIVI 3D 3.0 label mismatch scenario',
              'Disables AIVI 3D 3.0 entirely',
              'Offers a free camera replacement',
              'Confirms it is a hardware recall',
            ],
            answerIndex: 0,
            explanation: 'The 9/30 knowledge share updated the customer-facing script for the T50S AIVI 3D 3.0 label mismatch topic — use the new script.',
            source: '2026-09-30 · 知识点分享群',
          },
        ],
      },
      {
        article: 'QA Standard — Case Info Entry Requirements',
        date: '2026-10-01',
        questions: [
          {
            id: 'w09q5',
            prompt: 'News flash: the QA standard for entering case information in the system is documented in a wiki. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Full standard: https://ecovacs.feishu.cn/wiki/KNSjwpG2hilJZQk59r1cH5nenJd',
            source: '2026-10-01 · General',
          },
        ],
      },
    ],
  },
  {
    id: 'w10',
    label: 'Week 10',
    range: 'Oct 5 – Oct 11',
    articles: [
      {
        article: 'Canada Inventory — BESENDER No Longer Used',
        date: '2026-10-06',
        questions: [
          {
            id: 'w10q1',
            prompt: 'Where do you check Canadian inventory now that BESENDER is out?',
            options: [
              'SF first, or the weekly-updated inventory sheet shared by Hoi',
              'BESENDER read-only mode',
              'Amazon CA seller central',
              'The CA warehouse phone hotline',
            ],
            answerIndex: 0,
            explanation: 'Canada no longer uses BESENDER. Check SF first, or the weekly-updated sheet: https://lmgx8md8u1.feishu.cn/sheets/N11bsJjd3hdHYktGuP5cHoepned?sheet=0LoYQB',
            source: '2026-10-06 · 流程相关',
          },
        ],
      },
      {
        article: 'X12S Low-Price Order Cancellation Inquiries',
        date: '2026-10-06',
        questions: [
          {
            id: 'w10q2',
            prompt: 'A user\'s ~$200 X12S low-price order was cancelled. Who do they contact first?',
            options: [
              'Amazon (the original seller) — the price was set by the platform; only if Amazon cannot resolve it do we assist',
              'ECOVACS DTC directly for a price match',
              'The carrier',
              'Nobody — the cancellation is final',
            ],
            answerIndex: 0,
            explanation: 'Advise contacting Amazon first (platform-set price). If Amazon cannot resolve it, we will assist; report similar tickets to T2/TL.',
            source: '2026-10-06 · 流程相关',
          },
        ],
      },
      {
        article: 'PF Promo — CCRB5 / CCACE10 Coupon Handling',
        date: '2026-10-07',
        questions: [
          {
            id: 'w10q3',
            prompt: 'During PF (Oct 3–7) a user complains CCRB5 / CCACE10 won\'t work. What do you do?',
            options: [
              'Contact Tier 2 / Team Lead for a coupon code — one code per customer; escalate to DTC if they remain dissatisfied',
              'Tell them coupons are expired forever',
              'Give them your personal code',
              'Refund 10% manually',
            ],
            answerIndex: 0,
            explanation: 'PF-period coupon failures: get a code from T2/TL (one per customer), escalate to DTC as appropriate.',
            source: '2026-10-07 · 流程相关',
          },
        ],
      },
      {
        article: 'X12S OmniCyclone Restocked on Amazon.com',
        date: '2026-10-07',
        questions: [
          {
            id: 'w10q4',
            prompt: 'X12S OmniCyclone restocked on Amazon.com. What do you do with users whose earlier ~$200 cancelled orders are still unresolved?',
            options: [
              'Hand the case to Tier 2 / Team Lead',
              'Tell them to reorder at full price, case closed',
              'Promise a price match',
              'Refund from the support wallet',
            ],
            answerIndex: 0,
            explanation: 'Restock notice (Oct 7) with the Amazon link; cancelled ~$200 order cases go to T2/TL.',
            source: '2026-10-07 · 流程相关',
          },
        ],
      },
      {
        article: 'Warranty Exchange WO — No-Ship Remote Areas Update',
        date: '2026-10-08',
        questions: [
          {
            id: 'w10q5',
            prompt: 'News flash: Iqaluit, Nunavut, Canada was ADDED to the remote areas we do not ship Warranty Exchange WOs to. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Iqaluit, Nunavut, Canada is now on the Warranty Exchange no-ship remote-area list.',
            source: '2026-10-08 · 流程相关',
          },
        ],
      },
      {
        article: 'T90 PRO OMNI FBA Preorder Handling',
        date: '2026-10-08',
        questions: [
          {
            id: 'w10q6',
            prompt: 'T90 PRO OMNI FBA units are preorder-only (~1,500 units). What delivery date does Amazon show, and what do you tell anxious customers?',
            options: [
              'Amazon shows Oct 18 delivery; explain as usual (they knew the window when ordering); optionally offer consumables as goodwill per stock',
              'Amazon shows Oct 18; promise a full refund to anyone unhappy',
              'No date shown; tell them to cancel',
              'Amazon shows Nov 1; offer a free upgrade',
            ],
            answerIndex: 0,
            explanation: 'Effective Oct 7 until further notice: ~1,500 preorder units, Amazon shows delivery by Oct 18 (usually sooner). Explain normally; for especially anxious customers optionally offer consumables (stock permitting).',
            source: '2026-10-08 · General',
          },
        ],
      },
      {
        article: 'Claims / High-Risk Tickets — Mandatory Handling Rules',
        date: '2026-10-09',
        questions: [
          {
            id: 'w10q7',
            prompt: 'A ticket hints at a personal-injury claim. What MUST you do before replying?',
            options: [
              'Confirm with T2 / TL first — never admit fault or promise compensation on the client\'s behalf',
              'Reply with an apology and a discount code to defuse',
              'Admit fault to keep CSAT, then report',
              'Close the ticket immediately',
            ],
            answerIndex: 0,
            explanation: 'Claim-potential cases (injury, property damage) require T2/TL confirmation before any reply. Never admit fault or promise compensation. Unauthorized promises can trigger claims against the project/VXI and hit team settlement and individual performance.',
            source: '2026-10-09 · 流程相关',
          },
          {
            id: 'w10q8',
            prompt: 'You are UNSURE whether a case is high-risk. What does the policy say?',
            options: [
              'Treat it as high-risk and confirm with T2 / TL before responding',
              'Reply normally — only obvious claims need escalation',
              'Wait 24h; if the user follows up, escalate',
              'Ask the customer directly if they plan to claim',
            ],
            answerIndex: 0,
            explanation: 'If unsure, treat it as high-risk and confirm with T2/TL first. Report immediately — never reply or commit on your own.',
            source: '2026-10-09 · 流程相关',
          },
        ],
      },
      {
        article: 'New Instruction Manuals & FAQ Uploads',
        date: '2026-10-09',
        questions: [
          {
            id: 'w10q9',
            prompt: 'News flash: new manuals/FAQs uploaded — W2S PRO, T90S Family, T90 Max Family, X12S. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Under K:\\Guangzhou\\Ecovacs\\Agent\\Ecovacs NA\\产品资料\\: 说明书\\窗宝说明书\\W2S PRO, 说明书\\地宝说明书\\T90S Family, FAQ\\DEEBOT\\EN 莎士比亚S FAQ 2.0 T90S.xlsx, and 普朗克S PLUS（X12S Series）FAQ2.0.xlsx.',
            source: '2026-10-09 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Email Issue Type — Entry & QA Scoring Rule Change',
        date: '2026-10-10',
        questions: [
          {
            id: 'w10q10',
            prompt: 'The AI Summary issue-type recommendation applies to which channel, and when does QA scoring officially start?',
            options: [
              'Email only; scoring starts October 16 (transition window Oct 9–15)',
              'All channels; scoring started Oct 1',
              'Chat only; scoring starts Nov 1',
              'Email only; no scoring will ever apply',
            ],
            answerIndex: 0,
            explanation: 'AI Summary recommends issue types for Email cases only (Chat/Call unchanged; regions without the feature unchanged). Transition Oct 9–15; scoring officially starts Oct 16.',
            source: '2026-10-10 · 流程相关',
          },
          {
            id: 'w10q11',
            prompt: 'For QA scoring, which AI Summary recommendation is compared against the CC-entered issue type?',
            options: [
              'The LAST recommendation before the case closed — match = correct, mismatch = entry error',
              'The first recommendation of the conversation',
              'An average of all recommendations',
              'None — scoring is manual only',
            ],
            answerIndex: 0,
            explanation: 'QA samples Closed cases and compares the CC entry with the LAST AI Summary recommendation. Always follow the latest recommendation as the conversation clarifies.',
            source: '2026-10-10 · 流程相关',
          },
          {
            id: 'w10q12',
            prompt: 'AI Summary produced NO recommendation for a closed Email case. How is it scored?',
            options: [
              'Under the original manual-entry scoring rules',
              'Automatically incorrect',
              'Automatically correct',
              'The case is excluded from QA entirely',
            ],
            answerIndex: 0,
            explanation: 'No AI Summary generated → original manual-entry scoring rules apply. Same if the recommendation is visible during handling but lost after closure with no historical record; if a record exists and matches the entry, it counts as correct.',
            source: '2026-10-10 · 流程相关',
          },
        ],
      },
    ],
  },
];
