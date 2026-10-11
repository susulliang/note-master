import type { TestSuite } from './types';

// Week 5 (Aug 31–Sep 6) & Week 6 (Sep 7–13) — 2026
export const suitesPart3: TestSuite[] = [
  {
    id: 'w05',
    label: 'Week 5',
    range: 'Aug 31 – Sep 6',
    articles: [
      {
        article: 'WINBOT Tilt-Angle Cleaning Capability Update (Multiple Models)',
        date: '2026-09-01',
        questions: [
          {
            id: 'w05q1',
            prompt: 'After the WINBOT tilt-angle update, what does the NORMAL-hang state now support (referenced to 90° vertical)?',
            options: [
              '90°±90° — cleaning above horizontal is supported; inverted-hang restrictions unchanged',
              '90°±45° as before',
              'Only horizontal surfaces',
              'No change for any state',
            ],
            answerIndex: 0,
            explanation: 'Normal-hang expands to 90°±90° (cleaning above horizontal OK). Inverted-hang restrictions stay unchanged. W3 OTA already done; W2S PRO Aug 31; mini 2 Sep 24.',
            source: '2026-09-01 · 知识点分享群',
          },
          {
            id: 'w05q2',
            prompt: 'On horizontal glass, which cleaning mode is NOT supported after the tilt-angle update?',
            options: [
              'Edge-cleaning mode (in-app notification appears)',
              'Spray mode',
              'Deep-clean mode',
              'Remote control',
            ],
            answerIndex: 0,
            explanation: 'Edge-cleaning mode is unavailable for horizontal-surface cleaning; the app shows a notification. Also: the robot\'s own angle detection always takes priority over manual judgement.',
            source: '2026-09-01 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Service Languages — English & French Only',
        date: '2026-09-02',
        questions: [
          {
            id: 'w05q3',
            prompt: 'A Spanish-speaking customer writes in politely. What is the policy?',
            options: [
              'English and French only — no Spanish service, unless the user is highly agitated or there is a bad-review/similar risk',
              'Always serve in Spanish on request',
              'Spanish is fine for CA customers only',
              'Escalate all non-EN/FR cases to DTC immediately',
            ],
            answerIndex: 0,
            explanation: 'Service languages are English and French only. Spanish is only acceptable when the user is highly agitated or there is a risk such as a bad review.',
            source: '2026-09-02 · 流程相关',
          },
        ],
      },
      {
        article: 'X12S Series (Planck S Plus) — New Features Deep Dive',
        date: '2026-09-02',
        questions: [
          {
            id: 'w05q4',
            prompt: 'The X12S suction spec changed from Pa to AW (Air-Watt). What does AW measure?',
            options: [
              'Effective suction power — the combined efficiency of airflow (L/s) and vacuum suction (Pa)',
              'Battery charging speed',
              'Noise level in decibels',
              'Brush rotation torque',
            ],
            answerIndex: 0,
            explanation: 'Air-Watt is the industry-recognized, most accurate measure of vacuuming capability: the combined efficiency of airflow and vacuum suction.',
            source: '2026-09-02 · 知识点分享群',
          },
          {
            id: 'w05q5',
            prompt: 'On X12S Instant Flash Charging Plus: with the 25-minute mop-wash interval, what happens to protect battery life?',
            options: [
              'It returns for charging only (no mop wash) after at most ~15 minutes of work',
              'It works the full 25 minutes then charges',
              'Flash charging is disabled entirely',
              'It switches to sweeping-only mode',
            ],
            answerIndex: 0,
            explanation: 'With the 25-min interval, the robot returns after at most ~15 minutes for a charge-only visit (no mop wash). Flash charging triggers between 15%–89% battery during mop-wash returns and cannot be disabled.',
            source: '2026-09-02 · 知识点分享群',
          },
          {
            id: 'w05q6',
            prompt: 'For X12S "Big Wave" station self-clean, which statement is TRUE?',
            options: [
              'It auto-triggers after the FINAL mop wash, can be triggered manually, and requires the robot docked and idle',
              'It runs after every mop wash',
              'The robot must leave the station to fetch water',
              'It only works when the dust bin is full',
            ],
            answerIndex: 0,
            explanation: 'Big Wave replaces the old station self-clean with high-pressure jets flushing the cleaning-tray water pan. Triggers after the final mop wash or manually; robot stays docked.',
            source: '2026-09-02 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Login Verification Code Not Received — Handling & Whitelist Option',
        date: '2026-09-03',
        questions: [
          {
            id: 'w05q7',
            prompt: 'After basic troubleshooting fails, which two options do you discuss with a user who cannot receive the login verification code?',
            options: [
              '① Register a new account (robot history data is lost); ② apply for the login whitelist (verification no longer required, but security is reduced)',
              '① Refund the robot; ② replace the base station',
              '① Factory reset; ② downgrade the app',
              '① Change email provider; ② buy a new router',
            ],
            answerIndex: 0,
            explanation: 'Option ①: new account, robot history data lost. Option ②: whitelist — no verification on new-device logins, but account security is reduced (use a complex, unique password).',
            source: '2026-09-03 · 知识点分享群',
          },
          {
            id: 'w05q8',
            prompt: 'The user picks the whitelist option. What do you collect before escalating?',
            options: [
              'The email associated with the app account and the country of registration (US/CA) — escalate to Tier 2 / Team Lead',
              'Only the robot SN',
              'The purchase invoice',
              'Nothing — the user applies themselves',
            ],
            answerIndex: 0,
            explanation: 'Collect the app account email + registration country (US/CA), then escalate to T2/TL.',
            source: '2026-09-03 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Call Business Hours Restoring to 9AM-9PM (from Sep 7)',
        date: '2026-09-04',
        questions: [
          {
            id: 'w05q9',
            prompt: 'When did North America call business hours officially return to 9AM-9PM ET?',
            options: [
              'Monday, September 7',
              'September 1',
              'October 1',
              'September 21',
            ],
            answerIndex: 0,
            explanation: 'From Monday, September 7, NA call business hours officially returned to 9AM-9PM ET.',
            source: '2026-09-04 · General',
          },
        ],
      },
      {
        article: 'X12S vs X12 Series — Comparison',
        date: '2026-09-05',
        questions: [
          {
            id: 'w05q10',
            prompt: 'What are the X12S suction specs compared to X12?',
            options: [
              'X12S: 27 L/s airflow, 27,000 Pa; X12: 22 L/s, 22,000 Pa',
              'X12S: 22 L/s, 22,000 Pa; X12: 27 L/s, 27,000 Pa',
              'Both 27,000 Pa',
              'X12S: 53 AW only',
            ],
            answerIndex: 0,
            explanation: 'X12S: 27 L/s airflow and up to 27,000 Pa vs X12\'s 22 L/s and 22,000 Pa.',
            source: '2026-09-05 · 知识点分享群',
          },
          {
            id: 'w05q11',
            prompt: 'What obstacle-crossing heights does the X12S achieve, and how does X12 compare?',
            options: [
              'X12S: 2.5 cm without auxiliary wheels / 5 cm with; X12: 24mm threshold, 4cm sliding-door tracks',
              'X12S: 5 cm always; X12: 5 cm always',
              'X12S: 20mm single-level only; X12: 4.9cm continuous',
              'Both 49mm continuous',
            ],
            answerIndex: 0,
            explanation: 'X12S crosses 2.5 cm without and 5 cm with auxiliary wheels. X12 crosses 24 mm thresholds and sliding-door tracks up to 4 cm. (X12S drying: roller brush + dust bin + air duct at 63°C; X12: roller brush only.)',
            source: '2026-09-05 · 知识点分享群',
          },
        ],
      },
    ],
  },
  {
    id: 'w06',
    label: 'Week 6',
    range: 'Sep 7 – Sep 13',
    articles: [
      {
        article: 'DEEBOT X12 Series OTA v1.85.0',
        date: '2026-09-07',
        questions: [
          {
            id: 'w06q1',
            prompt: 'What is the rollout schedule for X12 Series OTA v1.85.0?',
            options: [
              'Sep 4: 30% → Sep 8: 60% → Sep 11: 100%',
              'Sep 4: 100% immediately',
              'Sep 11: 30% only',
              'No schedule announced',
            ],
            answerIndex: 0,
            explanation: 'General rollout: 30% on 2026/09/04, 60% on 09/08, 100% on 09/11.',
            source: '2026-09-07 · General',
          },
          {
            id: 'w06q2',
            prompt: 'Which improvement is included in X12 OTA v1.85.0?',
            options: [
              'Optimized low cleaning-solution level reminders to reduce excessive notifications',
              'Added YIKO voice wake word customization',
              'Removed the mop-washing function',
              'Changed the default map language',
            ],
            answerIndex: 0,
            explanation: 'v1.85.0: low-solution reminder optimization, water-full detection optimization, PowerBoost charging upgrade, dust-bag-installed voice prompt, collision handling improvement, minor fixes.',
            source: '2026-09-07 · General',
          },
        ],
      },
      {
        article: 'UltraMarine P1 OTA V5.39.0',
        date: '2026-09-08',
        questions: [
          {
            id: 'w06q3',
            prompt: 'News flash: UltraMarine P1 V5.39.0 pushed at 100% as a mandatory update on Sep 8–9 (performance optimization). Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'V5.39.0, 100% mandatory rollout Sep 8–9. External message: product performance optimization. (Rollout was later paused — see Week 7.)',
            source: '2026-09-08 · General',
          },
        ],
      },
      {
        article: 'Call Business Hours Officially Restored (9AM-9PM ET)',
        date: '2026-09-08',
        questions: [
          {
            id: 'w06q4',
            prompt: 'Besides restored call hours (9AM-9PM ET), what upcoming event did Harrison flag in the same notice?',
            options: [
              'Online training on September 21',
              'A new CSAT system rollout',
              'Office relocation',
              'New hire orientation on Sep 15',
            ],
            answerIndex: 0,
            explanation: 'A00 agents should prepare, check shift schedules, and note the September 21 online training.',
            source: '2026-09-08 · General',
          },
        ],
      },
      {
        article: 'ECOVACS HOME App V3.16.0 Release',
        date: '2026-09-08',
        questions: [
          {
            id: 'w06q5',
            prompt: 'The V3.16.0 network-mode switching feature (LAN / Standard / Hybrid) is available for which market and model?',
            options: [
              'South Korea — X12S only',
              'US — all DEEBOTs',
              'Europe — X9 series',
              'Canada — GOAT only',
            ],
            answerIndex: 0,
            explanation: 'Network Mode Switching is a South Korea feature for the X12S only.',
            source: '2026-09-08 · General',
          },
          {
            id: 'w06q6',
            prompt: 'V3.16.0 added a "Product & Service Data" download entry for Europe Data Act compliance. What are the three new languages added?',
            options: [
              'Estonian, Bulgarian, Hungarian',
              'Spanish, Portuguese, Italian',
              'Thai, Vietnamese, Indonesian',
              'Arabic, Hebrew, Turkish',
            ],
            answerIndex: 0,
            explanation: 'New languages: Estonian, Bulgarian, Hungarian. Data export path: Settings → Product & Service Data → enter email and submit → verify → download.',
            source: '2026-09-08 · General',
          },
        ],
      },
      {
        article: 'US Site — N30 PRO OMNI WHITE Sold Out / Delisted',
        date: '2026-09-09',
        questions: [
          {
            id: 'w06q7',
            prompt: 'News flash: US webstore N30 PRO OMNI WHITE is fully sold out and delisted. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'N30 PRO OMNI WHITE stock fully sold out; delisted from the US webstore.',
            source: '2026-09-09 · General',
          },
        ],
      },
    ],
  },
];
