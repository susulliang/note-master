import type { TestSuite } from './types';

// Week 3 (Aug 17–23) & Week 4 (Aug 24–30) — 2026
export const suitesPart2: TestSuite[] = [
  {
    id: 'w03',
    label: 'Week 3',
    range: 'Aug 17 – Aug 23',
    articles: [
      {
        article: 'Call Handling — Availability & Case Notes Reminder',
        date: '2026-08-18',
        questions: [
          {
            id: 'w03q1',
            prompt: 'If a call needs email follow-up, what ETA should you give the customer for the email?',
            options: [
              'About 30 minutes (shorter or longer depending on the situation)',
              'Within 24 hours',
              'Within 5 minutes',
              '3 business days',
            ],
            answerIndex: 0,
            explanation: 'Tell the customer we normally send the email within about 30 minutes. Also: set yourself available promptly after calls and keep case info updated.',
            source: '2026-08-18 · General',
          },
        ],
      },
      {
        article: 'Download the Latest GBU Package',
        date: '2026-08-19',
        questions: [
          {
            id: 'w03q2',
            prompt: 'News flash: the latest GBU (Global Business Guide) package is available on the shared drive. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Path: K:\\Guangzhou\\Ecovacs\\Agent\\Ecovacs NA\\产品资料\\GBU',
            source: '2026-08-19 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Hands-On Assessment — HQ Observations',
        date: '2026-08-20',
        questions: [
          {
            id: 'w03q3',
            prompt: 'In the hands-on assessment observations, which installation mistake did HQ call out?',
            options: [
              'The trimmer module\'s built-in screws were not tightened',
              'The RTK station was mounted too high',
              'The mower blade was installed backwards',
              'The dust bag was inserted upside down',
            ],
            answerIndex: 0,
            explanation: 'HQ flagged: confusing the mower LiDAR with the AIVI 3D TOF camera, unknown electrode-plate locations, pool basket cannot be used alone, W3 side-brush cleaning, X12 roller cover removal, and the trimmer module\'s built-in screws needing tightening.',
            source: '2026-08-20 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Hands-On Assessment — Topic List',
        date: '2026-08-20',
        questions: [
          {
            id: 'w03q4',
            prompt: 'News flash: the full hands-on assessment topic list (DEEBOT / WINBOT / GOAT / Pool categories) was shared for pre-session prep. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'The topic list covers DEEBOT (cleaning/disassembly, usage, app, faults), WINBOT, GOAT, and Pool robot scenarios — review before your session.',
            source: '2026-08-20 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Overseas Login — Forced Verification & Alternative Methods',
        date: '2026-08-20',
        questions: [
          {
            id: 'w03q5',
            prompt: 'An overseas user cannot receive the email verification code on a new-device login. Besides email troubleshooting, what alternative verification methods can you suggest?',
            options: [
              'Scan the robot\'s SN QR code, manually enter the SN, or use a one-time passkey',
              'Fax a copy of the purchase invoice',
              'Factory reset the robot and re-pair',
              'Create a new account on a different phone',
            ],
            answerIndex: 0,
            explanation: 'Other verification methods: scan the robot SN QR code, manually enter the SN, or a one-time passkey.',
            source: '2026-08-20 · 知识点分享群',
          },
          {
            id: 'w03q6',
            prompt: 'In the verification-code troubleshooting flow, if the email shown on screen belongs to a deactivated account, what must the user do?',
            options: [
              'Start the account recovery process to change their bindings',
              'Wait 24 hours and retry',
              'Register a new robot',
              'Contact their email provider only',
            ],
            answerIndex: 0,
            explanation: 'Ensure the displayed email is one they can access; if the account is deactivated, they need the account recovery process to change bindings. Also: check spam, review filters, then "Resend code".',
            source: '2026-08-20 · 知识点分享群',
          },
        ],
      },
    ],
  },
  {
    id: 'w04',
    label: 'Week 4',
    range: 'Aug 24 – Aug 30',
    articles: [
      {
        article: 'US Site — T90 OMNI Sold Out / Delisted',
        date: '2026-08-25',
        questions: [
          {
            id: 'w04q1',
            prompt: 'News flash: US webstore T90 OMNI is fully sold out and delisted — recommend alternatives when asked. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'T90 OMNI stock fully sold out; delisted from the US webstore. Advise out-of-stock and recommend an available alternative model.',
            source: '2026-08-25 · General',
          },
        ],
      },
      {
        article: 'Extended Warranty Cancellation Notice Incident (Aug 24)',
        date: '2026-08-25',
        questions: [
          {
            id: 'w04q2',
            prompt: 'Customers received "extended warranty cancelled" notices on Aug 24. What actually happened?',
            options: [
              'The warranty provider\'s server data migration mistakenly triggered the notices — customers\' orders remain valid',
              'ECOVACS ended its warranty program',
              'Only CA customers were affected; their warranties were voided',
              'The notices were phishing — no system event occurred',
            ],
            answerIndex: 0,
            explanation: 'Confirmed by DTC: server data migration at the warranty provider caused mistaken notices. Orders remain valid — reassure customers; they may also confirm with the warranty company directly.',
            source: '2026-08-25 · General',
          },
        ],
      },
      {
        article: 'US Site — X11 OmniCyclone Sold Out / Delisted',
        date: '2026-08-26',
        questions: [
          {
            id: 'w04q3',
            prompt: 'News flash: US webstore X11 OmniCyclone is fully sold out and delisted. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'X11 OmniCyclone stock fully sold out; delisted from the US webstore.',
            source: '2026-08-26 · General',
          },
        ],
      },
      {
        article: 'X12S 49mm Obstacle-Crossing Spec Clarification',
        date: '2026-08-26',
        questions: [
          {
            id: 'w04q4',
            prompt: 'What does "up to 49mm obstacle crossing" mean for the X12S family?',
            options: [
              'Crossing a two-step obstacle totalling up to 49mm — first step ≤25mm, second step ≤24mm (lab figure)',
              'A single obstacle up to 49mm in any home',
              '49mm only with auxiliary wheels installed',
              '49mm only in sweeping mode',
            ],
            answerIndex: 0,
            explanation: '"Up to 49mm" = double-layer crossing with first step ≤25mm and second ≤24mm. Sourced from the ECOVACS lab; real-world results vary.',
            source: '2026-08-26 · 知识点分享群',
          },
        ],
      },
      {
        article: 'X12S OmniCyclone — US Launch',
        date: '2026-08-29',
        questions: [
          {
            id: 'w04q5',
            prompt: 'Which X12S OmniCyclone bundles went live on the US site at launch?',
            options: [
              'X12S OC alone; X12S OC + cleaning solution kit (heavy ×1 + regular ×1); X12S OC + WINBOT W3 OMNI',
              'X12S OC + T90 PRO OMNI only',
              'X12S OC + spare roller brush only',
              'X12S OC + extended warranty only',
            ],
            answerIndex: 0,
            explanation: 'Three listings: standalone X12S OmniCyclone, X12S OC + heavy/regular cleaning solution ×1 each, and X12S OC + W3 OMNI bundle.',
            source: '2026-08-29 · General',
          },
          {
            id: 'w04q6',
            prompt: 'When are the X12S OmniCyclone compatible consumables expected in stock?',
            options: [
              'Around November',
              'Immediately at launch',
              'Around September',
              'Next year',
            ],
            answerIndex: 0,
            explanation: 'Compatible consumables for X12S OmniCyclone expected around November.',
            source: '2026-08-29 · General',
          },
        ],
      },
    ],
  },
];
