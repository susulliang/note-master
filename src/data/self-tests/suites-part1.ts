import type { TestSuite } from './types';

// Week 1 (Aug 1–9) & Week 2 (Aug 10–16) — 2026
export const suitesPart1: TestSuite[] = [
  {
    id: 'w01',
    label: 'Week 1',
    range: 'Aug 1 – Aug 9',
    articles: [
      {
        article: 'UltraMarine P1 Frequently Lifts Its Nose While Moving',
        date: '2026-08-01',
        questions: [
          {
            id: 'w01q1',
            prompt: 'A user reports their UltraMarine P1 keeps lifting its nose while moving, and the debris basket is empty when they take it out. What is the likely cause?',
            options: [
              'Program crash — restart the robot (confirm firmware V5.33.0)',
              'Clogged debris basket — clean it',
              'Water pump not spinning — needs a hardware repair',
              'Battery fault — replace the battery',
            ],
            answerIndex: 0,
            explanation: 'Empty basket = program crash. Restarting the robot (with latest firmware V5.33.0) resolves it. Clogged basket would be full; pump bug means the blue light stays on and pump does not spin.',
            source: '2026-08-01 · 知识点分享群',
          },
          {
            id: 'w01q2',
            prompt: 'For the P1 water-pump-not-spinning bug, which firmware version fixed it, and which version should users be on?',
            options: [
              'Fixed in V5.29.0 — guide the user to upgrade to V5.33.0',
              'Fixed in V5.33.0 — no further action needed',
              'Fixed in V5.39.0 — register for targeted push',
              'Not fixed yet — hardware replacement required',
            ],
            answerIndex: 0,
            explanation: 'The pump bug was fixed in V5.29.0; guide users to the latest firmware V5.33.0.',
            source: '2026-08-01 · 知识点分享群',
          },
        ],
      },
      {
        article: 'ECOVACS HOME App V3.15.0 Release',
        date: '2026-08-04',
        questions: [
          {
            id: 'w01q3',
            prompt: 'For the ECOVACS HOME App 3.15.0 rollout, which store goes first and when does iOS follow?',
            options: [
              'Google Play first; iOS follows 2–3 days later',
              'iOS first; Google Play follows a week later',
              'All stores simultaneously',
              'Russia Rustore first, then others',
            ],
            answerIndex: 0,
            explanation: 'Rollout starts August 3 with Google Play first; iOS lags 2–3 days.',
            source: '2026-08-04 · General',
          },
        ],
      },
      {
        article: 'AI Chat Troubleshooting Assist — Preview',
        date: '2026-08-05',
        questions: [
          {
            id: 'w01q4',
            prompt: 'What is the AI Chat module designed to do once live?',
            options: [
              'Auto-close tickets without agent review',
              'Act as an intelligent assistant for after-sales troubleshooting, providing standardized reply scripts',
              'Translate calls in real time',
              'Replace the live chat vendor',
            ],
            answerIndex: 1,
            explanation: 'AI Chat assists overseas after-sales troubleshooting with standardized reply scripts; expected launch was Thursday, August 6.',
            source: '2026-08-05 · General',
          },
        ],
      },
      {
        article: 'US Site Featured Product Change — T90 PRO OMNI',
        date: '2026-08-05',
        questions: [
          {
            id: 'w01q5',
            prompt: 'Why was the US webstore featured product changed, and what is the new featured product?',
            options: [
              'T90 PRO OMNI CARE sold out; the featured product is now T90 PRO OMNI',
              'T90 PRO OMNI was recalled; featured is T90 PRO OMNI CARE',
              'Price drop on X11; featured is X11 OmniCyclone',
              'Seasonal change; featured is WINBOT W3',
            ],
            answerIndex: 0,
            explanation: 'T90 PRO OMNI CARE sold out and its stock was cleared; T90 PRO OMNI arrived at the warehouse and became the featured product.',
            source: '2026-08-05 · General',
          },
          {
            id: 'w01q6',
            prompt: 'When comparing the two models for customers, which feature difference did the notice call out specifically?',
            options: [
              'Auto solution-refill function',
              'Suction power',
              'Mop-washing water temperature',
              'Base station color',
            ],
            answerIndex: 0,
            explanation: 'Agents were told to note the feature differences between the two models, especially the auto solution-refill function.',
            source: '2026-08-05 · General',
          },
        ],
      },
      {
        article: 'GOAT Battery Issue Resolved — Exchange Logic Restored',
        date: '2026-08-06',
        questions: [
          {
            id: 'w01q7',
            prompt: 'A GOAT A2500 RTK user with the battery issue now explicitly asks for a SPARE battery. What do you do?',
            options: [
              'Promise the spare battery right away',
              'Refuse — spare batteries are never provided',
              'Consult Tier 2 and the TL before offering a solution',
              'Tell them to buy one from the webstore',
            ],
            answerIndex: 2,
            explanation: 'Normal exchange logic is restored, but explicit spare-battery requests require consulting Tier 2 and TL first.',
            source: '2026-08-06 · 流程相关',
          },
        ],
      },
      {
        article: 'GOAT A&O Series — Mowing Tasks Auto-Terminate After 48h Pause',
        date: '2026-08-06',
        questions: [
          {
            id: 'w01q8',
            prompt: 'A GOAT user asks why their paused mowing task disappeared. What happened?',
            options: [
              'Tasks paused for more than 48 hours are automatically terminated by the system/app',
              'The task was deleted during a map edit',
              'RTK signal loss cancels all tasks',
              'The robot battery dropped below 20%',
            ],
            answerIndex: 0,
            explanation: 'To avoid conflicts with the 2026 A&O series schedule, mowing tasks paused over 48 hours auto-terminate.',
            source: '2026-08-06 · 知识点分享群',
          },
        ],
      },
      {
        article: 'UltraMarine P1 — Online FAQ Updated',
        date: '2026-08-07',
        questions: [
          {
            id: 'w01q9',
            prompt: 'News flash: the UltraMarine P1 online FAQ was updated (read-only — do NOT share externally). Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Online FAQ sheet: https://ecovacs.feishu.cn/sheets/WCJ0sqcb1hx1nStogZocKYnznHc?sheet=lKcOWZ — read-only, do not share externally.',
            source: '2026-08-07 · 知识点分享群',
          },
        ],
      },
      {
        article: 'W2S PRO & W2S PRO OMNI — New Product Materials, FAQ & HTU Video',
        date: '2026-08-08',
        questions: [
          {
            id: 'w01q10',
            prompt: 'News flash: W2S PRO product materials, FAQ and the updated HTU video were uploaded to the shared drive and Email Template library. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Materials: K:\\Guangzhou\\...\\培训课件\\窗宝\\W2S PRO & W2S PRO OMNI; FAQ: K:\\...\\FAQ\\WINBOT\\W2S PRO OMNI; HTU video also added to the shared sheet + Email Template library.',
            source: '2026-08-08 · 知识点分享群',
          },
        ],
      },
    ],
  },
  {
    id: 'w02',
    label: 'Week 2',
    range: 'Aug 10 – Aug 16',
    articles: [
      {
        article: 'AI Chat Assist — Official Launch',
        date: '2026-08-10',
        questions: [
          {
            id: 'w02q1',
            prompt: 'AI CHAT is officially live. Where do you enable it and who do you report issues to?',
            options: [
              'Enable AI Assist in live chat; report issues to the on-duty Tier 2 / Team Leader',
              'Enable it in the SOP panel; report to DTC',
              'It auto-runs on all chats; no reporting needed',
              'Enable via the extension; report to QA',
            ],
            answerIndex: 0,
            explanation: 'Enable AI Assist in real-time chat to help generate troubleshooting FAQs; report faults to on-duty T2/TL (T2: Steve/Jonathan/Yang; TL: Alexia/Harrison).',
            source: '2026-08-10 · General',
          },
        ],
      },
      {
        article: 'FCC Act — Customer FAQ',
        date: '2026-08-10',
        questions: [
          {
            id: 'w02q2',
            prompt: 'A customer asks: "Is my robot being banned by the FCC Act, and is my warranty affected?" What is the approved answer?',
            options: [
              'No ban; products remain fully supported and warranty/after-sales are completely unaffected',
              'Older models will be banned; warranty transfers to a partner',
              'Yes, banned; warranty claims are frozen',
              'No ban, but warranty is shortened by 6 months',
            ],
            answerIndex: 0,
            explanation: 'FAQ: your robot is not banned, support continues, and warranty and after-sales service are completely unaffected.',
            source: '2026-08-10 · General',
          },
          {
            id: 'w02q3',
            prompt: 'A user asks whether they can flash modified firmware to run the robot locally, off ECOVACS servers. Per the FCC FAQ, what do you say?',
            options: [
              'Not officially supported — unauthorized firmware may compromise safety, performance and warranty coverage',
              'Yes, supported and warranty-safe',
              'Yes, but only for X12 series',
              'Only after deregistering the account',
            ],
            answerIndex: 0,
            explanation: 'Firmware updates continue as normal, but flashing/modifying firmware to bypass our servers is not officially supported and risks safety, performance and warranty.',
            source: '2026-08-10 · General',
          },
          {
            id: 'w02q4',
            prompt: 'A customer asks: "Which ECOVACS models fall within FCC scope, and can I still buy 2027 new models in the US?" Per the FAQ:',
            options: [
              'All models on sale plus planned 2026 models are developed per applicable regulations; 2027 availability cannot be confirmed in advance, but standard warranty and after-sales support are assured',
              'Only 2024 models are in scope; 2027 models are guaranteed',
              'No models are in scope; 2027 launches are confirmed',
              'All models are banned from 2027',
            ],
            answerIndex: 0,
            explanation: 'All on-sale and planned 2026 models comply with applicable regulatory requirements. Release dates/market availability for 2027 cannot be confirmed in advance; standard warranty and after-sales support are assured.',
            source: '2026-08-10 · General',
          },
        ],
      },
      {
        article: 'DEEBOT X9 Series OTA v1.64.0',
        date: '2026-08-11',
        questions: [
          {
            id: 'w02q5',
            prompt: 'What does the DEEBOT X9 Series August OTA v1.64.0 (global 100%) contain?',
            options: [
              'Fixes for known issues to improve overall experience',
              'Jet Mop by Zone',
              'Ramp setup on map',
              'New voice package',
            ],
            answerIndex: 0,
            explanation: 'v1.64.0 (pushed 2026/08/11, global 100%): fixed known issues, overall experience improvement.',
            source: '2026-08-11 · General',
          },
        ],
      },
      {
        article: 'DEEBOT X12 Series OTA v1.79.1',
        date: '2026-08-11',
        questions: [
          {
            id: 'w02q6',
            prompt: 'X12 Series OTA v1.79.1 adds "Jet Mop by Zone". What is the default zone and the 3-step deep clean cycle?',
            options: [
              'Kitchen; Sweep → Stain Spray Dissolve → Double Mop',
              'Bathroom; Mop → Sweep → Dry',
              'Living room; Vacuum → Mop → Vacuum again',
              'Whole home; Sweep only',
            ],
            answerIndex: 0,
            explanation: 'Configured in Advanced Robot Settings → Jet Mop Settings → Jet Mop Areas. Defaults to the kitchen, running Sweep → Stain Spray Dissolve → Double Mop.',
            source: '2026-08-11 · General',
          },
          {
            id: 'w02q7',
            prompt: 'Besides the X12 series, which model is also covered by OTA v1.79.1, and when was full push expected?',
            options: [
              'Yeedi S20 infinity Ultra; full push by August 13',
              'X9 Series; full push by August 15',
              'T30S; full push by August 20',
              'X11 OmniCyclone; full push by August 13',
            ],
            answerIndex: 0,
            explanation: 'The update also covers the Yeedi S20 infinity Ultra; the corresponding APP H5 page went live simultaneously with full push expected August 13.',
            source: '2026-08-11 · General',
          },
        ],
      },
      {
        article: 'August Promotions — US & Canada',
        date: '2026-08-12',
        questions: [
          {
            id: 'w02q8',
            prompt: 'What were the US "Summer Sale finale" dates, and which GOAT model was featured?',
            options: [
              'Aug 4 – Aug 17; GOAT A2000 LiDAR Pro',
              'Aug 14 – Aug 30; GOAT O1000 RTK Care Kit',
              'Aug 1 – Aug 31; GOAT A3000 LiDAR PRO',
              'Aug 28 – Aug 31; GOAT GX600',
            ],
            answerIndex: 0,
            explanation: 'US finale: Aug 4–17 featuring DEEBOT X12 OC / T90 PRO OMNI / T80s OMNI, WINBOT Mini 2 / W3, GOAT A2000 LiDAR Pro. (The CA finale ran Aug 14–30 with O1000 RTK Care Kit.)',
            source: '2026-08-12 · General',
          },
          {
            id: 'w02q9',
            prompt: 'For the August US/CA trade-in (Aug 1–31), what are the two accepted forms?',
            options: [
              '1) Buy new at full price, DTC sends a return label for the old unit, then refunds the difference; 2) Instant SN-based discount with no return needed',
              '1) Mail the old unit first and wait; 2) Store credit only',
              '1) In-store trade only; 2) Mail-in only',
              'Trade-in was not offered in August',
            ],
            answerIndex: 0,
            explanation: 'Option 1: buy the new unit at full price, DTC issues a return label, then refunds the difference. Option 2: instant discount by SN — the old unit does not need to be sent back.',
            source: '2026-08-12 · General',
          },
        ],
      },
      {
        article: 'Roller Mop Tangled — Updated Email Templates by Model Group',
        date: '2026-08-12',
        questions: [
          {
            id: 'w02q10',
            prompt: 'For a roller-mop tangling case on a model WITH a built-in dirty-water tank, which email template do you use?',
            options: [
              'Roller Mop Tangled - T90/X12',
              'Roller Mop Tangled - X8/T80/X9/T80S/X11',
              'Roller Mop Tangled - Generic',
              'Roller Mop Tangled - Pool Series',
            ],
            answerIndex: 0,
            explanation: 'Built-in dirty-water tank models (T90 / X12) → "Roller Mop Tangled - T90/X12". Removable-tank models (X8 / T80 / X9 / T80S / X11) use the other template.',
            source: '2026-08-12 · 知识点分享群',
          },
          {
            id: 'w02q11',
            prompt: 'Which of these models uses the "Roller Mop Tangled - X8/T80/X9/T80S/X11" template (removable dirty-water tank)?',
            options: [
              'X8',
              'T90',
              'X12',
              'T90 Max',
            ],
            answerIndex: 0,
            explanation: 'X8 (also T80 / X9 / T80S / X11) has a removable dirty-water tank → second template. T90/X12 are built-in-tank models.',
            source: '2026-08-12 · 知识点分享群',
          },
        ],
      },
      {
        article: 'GOAT Free-Battery Inquiries — Handling Rule',
        date: '2026-08-13',
        questions: [
          {
            id: 'w02q12',
            prompt: 'A GOAT user asks whether they can get a free battery but reports NO battery/charging problem. Correct handling?',
            options: [
              'Confirm the Serial Number, then check with Tier 2 / Team Lead before proceeding — never refuse outright or promise anything first',
              'Promise the free battery to keep CSAT high',
              'Refuse immediately — no free batteries ever',
              'Tell them to contact the webstore',
            ],
            answerIndex: 0,
            explanation: 'Confirm SN first, check with T2/TL, never refuse outright and never promise before confirmation — ask first.',
            source: '2026-08-13 · 流程相关',
          },
        ],
      },
      {
        article: 'GOAT A/O LiDAR PRO Series OTA V1.13.10',
        date: '2026-08-14',
        questions: [
          {
            id: 'w02q13',
            prompt: 'GOAT A/O LiDAR PRO OTA V1.13.10 (Aug 14, 20% rollout) — which fix is included?',
            options: [
              'Fixed frequent E659 alerts',
              'Added PIN-code reset',
              'Extended map limit to 500m',
              'Added YIKO voice control',
            ],
            answerIndex: 0,
            explanation: 'V1.13.10: better edge mowing, fixed frequent E659 alerts, smoother remote control, stuck-point deletion removes the obstacle immediately, A LiDAR PRO map limit changed to 150m.',
            source: '2026-08-14 · General',
          },
        ],
      },
      {
        article: 'T30S PRO Scheduled Start Issue — Targeted Push 1.50.0 Registration',
        date: '2026-08-14',
        questions: [
          {
            id: 'w02q14',
            prompt: 'News flash: T30S PRO scheduled-start issues persisting after 1.49.0 can be re-registered for a targeted push of firmware 1.50.0 (contact Alexia / Harrison / Hoi). Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'If 1.49.0 does not fix scheduled-start issues, re-register the unit via Alexia / Harrison / Hoi for a targeted 1.50.0 push.',
            source: '2026-08-14 · 知识点分享群',
          },
        ],
      },
      {
        article: 'T30S Series — OTA 1.50.0 Rollout & Scheduled-Cleaning Fix',
        date: '2026-08-15',
        questions: [
          {
            id: 'w02q15',
            prompt: 'T30S OTA 1.50.0 began a 30% general rollout. A user has scheduled-time mismatch issues and is NOT yet on 1.50.0. What do you do?',
            options: [
              'Check firmware version first, guide them to upgrade; if 1.50.0 not received, register for targeted push as normal',
              'Replace the base station',
              'Tell them to wait for 100% rollout, no action',
              'Factory reset and rebuild the map',
            ],
            answerIndex: 0,
            explanation: 'Check firmware first, guide upgrade; not on 1.50.0 → register for targeted push. Issues ON 1.50.0 should keep being reported in the group.',
            source: '2026-08-15 · 知识点分享群',
          },
          {
            id: 'w02q16',
            prompt: 'A user IS on 1.50.0 and still sees abnormal scheduled cleaning. What does the notice say?',
            options: [
              'Keep reporting these cases in the group',
              'Escalate directly to DTC',
              'Downgrade to 1.49.0',
              'Ignore — 1.50.0 has no known issues',
            ],
            answerIndex: 0,
            explanation: 'Abnormal scheduled-clean issues occurring on 1.50.0 should continue to be reported in the group.',
            source: '2026-08-15 · 知识点分享群',
          },
        ],
      },
    ],
  },
];
