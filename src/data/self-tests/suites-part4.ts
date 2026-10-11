import type { TestSuite } from './types';

// Week 7 (Sep 14–20) & Week 8 (Sep 21–27) — 2026
export const suitesPart4: TestSuite[] = [
  {
    id: 'w07',
    label: 'Week 7',
    range: 'Sep 14 – Sep 20',
    articles: [
      {
        article: 'OMNI Station Hot-Water Mop Washing — Why the Water Feels Cool',
        date: '2026-09-14',
        questions: [
          {
            id: 'w07q1',
            prompt: 'A user takes the mop out mid-cleaning and says it feels cool — "hot water washing is broken". What do you explain?',
            options: [
              'The FIRST wash of a session always uses cold water; hot water only starts for subsequent washes — and wash water gradually cools as heat dissipates, so cool mops are normal',
              'The heating element is faulty — replace the station',
              'Hot water only works in deep-clean mode',
              'The user should raise the water temperature in the app',
            ],
            answerIndex: 0,
            explanation: 'First wash = cold; heating kicks in on later washes. During washing, heat is consumed and dissipates with the water flow, so mops feeling cooler and cooler is normal.',
            source: '2026-09-14 · 知识点分享群',
          },
        ],
      },
      {
        article: 'WINBOT W3 OMNI — "Insufficient Air Pressure" Alarm Handling (Updated)',
        date: '2026-09-15',
        questions: [
          {
            id: 'w07q2',
            prompt: 'A W3 OMNI alarms "insufficient air pressure". Step 1 is removing the robot via app remote control. Where is the Wi-Fi pairing QR code if the app was never connected?',
            options: [
              'Inside the station\'s storage bay, next to the hook on the inner wall — or use "Add manually" in the app',
              'On the back of the remote control',
              'Inside the dust bag compartment',
              'Printed on the power adapter only',
            ],
            answerIndex: 0,
            explanation: 'Pairing code: station storage bay, next to the hook on the inner wall. Alternative: "Add manually" → select model. The robot also gives voice prompts.',
            source: '2026-09-15 · 知识点分享群',
          },
          {
            id: 'w07q3',
            prompt: 'For the W3 OMNI pressure alarm, after how many cumulative uses should a cleaning cloth be replaced, and what is the NEW cloth part number?',
            options: [
              'Replace after 30 uses; new cloth 201-J001-00A7 (fits both new and old W3 units)',
              'Replace after 10 uses; new cloth 201-J001-0072',
              'Replace after 100 uses; no part number change',
              'Cloths never need replacement',
            ],
            answerIndex: 0,
            explanation: '30 uses per cloth (or immediately if worn/curled/unglued or alarms recur). New cloth: 201-J001-00A7. Old: 201-J001-0072 (old stock consumed first). New W3 (V2.7.0, Sep 2026) + old cloth alarms → OTA via the app\'s red dot.',
            source: '2026-09-15 · 知识点分享群',
          },
        ],
      },
      {
        article: 'WINBOT Cleaning Fluid — No Nano Particles',
        date: '2026-09-15',
        questions: [
          {
            id: 'w07q4',
            prompt: 'News flash: the WINBOT cleaning fluid does NOT contain nano particles — use the approved answer for customer concerns. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'The WINBOT cleaning fluid contains no nano particles; reassure customers accordingly.',
            source: '2026-09-15 · 知识点分享群',
          },
        ],
      },
      {
        article: 'GOAT Mower — Path Creation Requires Two Separate Zones',
        date: '2026-09-17',
        questions: [
          {
            id: 'w07q5',
            prompt: 'A GOAT user cannot add a Path (channel). Why?',
            options: [
              'A Path can only be created when there are exactly TWO zones, and a gap is required between zones',
              'Paths require a paid subscription',
              'Paths only work with LiDAR models',
              'Paths were removed in the latest app version',
            ],
            answerIndex: 0,
            explanation: 'Path creation requires exactly two zones; when creating additional zones, there must be a gap between the two zones.',
            source: '2026-09-17 · 知识点分享群',
          },
        ],
      },
      {
        article: 'X12S Obstacle Crossing Claims — 50mm and 49mm Clarifications',
        date: '2026-09-17',
        questions: [
          {
            id: 'w07q6',
            prompt: 'A customer asks about "50mm continuous obstacle crossing" on X12S. What are the lab test conditions?',
            options: [
              'First step ≤25mm high and ≥20cm wide; second step ≤25mm — two connected steps',
              'One 50mm step, any width',
              'Three steps of 17mm each',
              '50mm only with the ramp accessory',
            ],
            answerIndex: 0,
            explanation: '50mm = continuous crossing of two connected 25mm steps (first ≤25mm high, ≥20cm wide; second ≤25mm). Lab figure — actual home results vary.',
            source: '2026-09-17 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Issue Type & Model No. — Accurate Entry Required',
        date: '2026-09-18',
        questions: [
          {
            id: 'w07q7',
            prompt: 'What did Alexia\'s reminder say about Issue Type and Model No. entry?',
            options: [
              'Always enter accurately and keep them up to date on every ticket — QA has a dedicated audit and errors will cost points',
              'Only fill them in at case closure',
              'Only Issue Type matters for QA',
              'Model No. is auto-filled, never check it',
            ],
            answerIndex: 0,
            explanation: 'Issue Type and (AMR) Model No. must be accurate and up to date on every ticket; QA audits are strict and affect both team metrics and individual scores.',
            source: '2026-09-18 · 流程相关',
          },
        ],
      },
      {
        article: 'Original Device Return Policy Update (Effective Sep 17, 2026)',
        date: '2026-09-18',
        questions: [
          {
            id: 'w07q8',
            prompt: 'Under the return-policy update (effective Sep 17, 2026), when must a user return the original device?',
            options: [
              'For listed models purchased within ≤6 months, the original device MUST be returned',
              'All models, always',
              'Only GOAT models over 1 year old',
              'Only when the user requests it',
            ],
            answerIndex: 0,
            explanation: 'Listed DEEBOT/GOAT models purchased ≤6 months ago require the original device back. Other models (all WINBOTs, pool robots, mother & baby machines, GOAT GX600) do not.',
            source: '2026-09-18 · 流程相关',
          },
          {
            id: 'w07q9',
            prompt: 'Which of these does NOT require returning the original device under the new policy?',
            options: [
              'WINBOT W3',
              'X12 OmniCyclone (purchased 3 months ago)',
              'T50S PRO OMNI (purchased 2 months ago)',
              'GOAT A3000 LiDAR PRO (purchased 1 month ago)',
            ],
            answerIndex: 0,
            explanation: 'All WINBOTs are exempt. The others are on the must-return list when purchased within 6 months.',
            source: '2026-09-18 · 流程相关',
          },
          {
            id: 'w07q10',
            prompt: 'A user bought a T30S 4 months ago and needs a replacement. Does the T30 series require returning the original device?',
            options: [
              'No — the T30 series is also exempt (confirmed Sep 8/19)',
              'Yes, T30S must always be returned',
              'Yes, but only for CA customers',
              'Only if the unit is damaged',
            ],
            answerIndex: 0,
            explanation: 'T30 series is exempt from returning the original device — a supplement to the Sep 17 policy update.',
            source: '2026-09-19 · 流程相关',
          },
        ],
      },
      {
        article: 'UltraMarine P1 — Spin in Circles FAQ',
        date: '2026-09-19',
        questions: [
          {
            id: 'w07q11',
            prompt: 'News flash: the UltraMarine P1 "spin in circles" FAQ (updated 2026-9-18) was shared in the knowledge group. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'P1 spin-in-circles FAQ updated 2026-9-18 — refer to the knowledge group post for the full handling.',
            source: '2026-09-19 · 知识点分享群',
          },
        ],
      },
      {
        article: 'X12S Side Brush Breakage & Weak Obstacle Avoidance (Camera Shutter)',
        date: '2026-09-19',
        questions: [
          {
            id: 'w07q12',
            prompt: 'An X12S user reports a broken side brush. What is the resolution?',
            options: [
              'Send replacement side brushes — NO full-unit replacement',
              'Replace the whole robot',
              'Replace the main brush instead',
              'Escalate to DTC for a refund',
            ],
            answerIndex: 0,
            explanation: 'Side brush breakage → send replacement side brushes only; no full-unit replacement needed.',
            source: '2026-09-19 · 知识点分享群',
          },
          {
            id: 'w07q13',
            prompt: 'An X12S owner complains about weak obstacle avoidance. What check does the notice add to the troubleshooting flow?',
            options: [
              'Whether the camera shutter is closed — advise opening it while cleaning (close it when not cleaning)',
              'Whether the bumper is loose',
              'Whether LiDAR firmware is updated',
              'Whether the side brush is installed',
            ],
            answerIndex: 0,
            explanation: 'X12S ships with a camera shutter; the camera assists obstacle avoidance, so it should be OPEN during cleaning and may be closed otherwise.',
            source: '2026-09-19 · 知识点分享群',
          },
        ],
      },
      {
        article: 'UltraMarine P1 V5.39.0 OTA Paused',
        date: '2026-09-20',
        questions: [
          {
            id: 'w07q14',
            prompt: 'The P1 V5.39.0 OTA rollout was paused. What should you tell users asking for the update?',
            options: [
              'Do not direct users to check for the update; a follow-up notice will come when it resumes',
              'Tell them to force-update via USB',
              'Tell them to factory reset to trigger the update',
              'Roll back to V5.33.0',
            ],
            answerIndex: 0,
            explanation: 'V5.39.0 rollout paused — don\'t have users check/wait. (It resumed Sep 22 as V5.40.0 with identical content.)',
            source: '2026-09-20 · General',
          },
        ],
      },
    ],
  },
  {
    id: 'w08',
    label: 'Week 8',
    range: 'Sep 21 – Sep 27',
    articles: [
      {
        article: 'DTC Web 5.0 Order Lookup — Shared Credentials Rotated',
        date: '2026-09-21',
        questions: [
          {
            id: 'w08q1',
            prompt: 'News flash: the shared credentials for the US/CA DTC Web 5.0 order lookup system were rotated (not shown in-app for security — see the group message or ask T2/TL). Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'New Web 5.0 credentials are in the original Feishu message (Sep 21) — or ask the on-duty TL / Tier 2.',
            source: '2026-09-21 · 流程相关',
          },
        ],
      },
      {
        article: 'UltraMarine P1 OTA Re-pushed as V5.40.0',
        date: '2026-09-22',
        questions: [
          {
            id: 'w08q2',
            prompt: 'A user asks why their P1 shows V5.40.0 when the announcement said V5.39.0. What do you say?',
            options: [
              'Normal — after the pause, the resumed rollout uses 5.40.0 with identical content',
              'Their unit got a wrong build; schedule a replacement',
              '5.40.0 is a beta build; wait for 5.39.0',
              'Downgrade instructions needed',
            ],
            answerIndex: 0,
            explanation: 'Re-pushed at 100% with the version number updated to 5.40.0; content unchanged.',
            source: '2026-09-22 · General',
          },
        ],
      },
      {
        article: 'North America Laws & Regulations Reference',
        date: '2026-09-22',
        questions: [
          {
            id: 'w08q3',
            prompt: 'News flash: a North America laws & regulations reference wiki was shared for everyone\'s reference. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Reference wiki: https://ecovacs.feishu.cn/wiki/Oup9wVFAjiBFoVkpPfzcP4Zznqc',
            source: '2026-09-22 · 流程相关',
          },
        ],
      },
      {
        article: 'T90 Max Pro Omni & T90 Max Omni — Spec Notes',
        date: '2026-09-22',
        questions: [
          {
            id: 'w08q4',
            prompt: 'Which statement about the T90 Max (Pro) Omni is TRUE?',
            options: [
              '3D structured-light obstacle avoidance, no AIVI camera, no YIKO voice/microphone, no auto solution refill',
              'AIVI camera with YIKO voice',
              'Has auto cleaning-solution refill',
              'Has Agent Hosting',
            ],
            answerIndex: 0,
            explanation: 'T90 Max family: 3D structured light (no AIVI camera), infrared edge detection, Intelligent Hosting (NOT Agent Hosting), no YIKO/mic, no auto refill, no instant flash charging.',
            source: '2026-09-22 · 知识点分享群',
          },
          {
            id: 'w08q5',
            prompt: 'What are the T90 Max (Pro) Omni roller-mop and obstacle-crossing specs?',
            options: [
              'Roller extends 1.5cm, lifts 15mm; single-level obstacle crossing only, at 20mm',
              'Roller extends 5cm, lifts 25mm; multi-level crossing to 49mm',
              'Roller fixed; 22mm crossing',
              'Roller extends 1.5cm; 4.9cm continuous crossing',
            ],
            answerIndex: 0,
            explanation: 'Roller mop extends 1.5cm and lifts 15mm. No auxiliary wheels; no multi-level crossing — single-level 20mm only. Main and side brushes cannot lift.',
            source: '2026-09-22 · 知识点分享群',
          },
          {
            id: 'w08q6',
            prompt: 'On the T90 Max (Pro) Omni station, what changed about Auto Empty?',
            options: [
              'Renamed Quiet Auto Empty; only "Standard" and "High-frequency" frequency levels remain',
              'Removed entirely',
              'Now has 5 adjustable levels',
              'Renamed Turbo Empty with 3 levels',
            ],
            answerIndex: 0,
            explanation: 'Auto Empty became Quiet Auto Empty; the dust-emptying level selector was removed (Standard / High-frequency only). The dust-bag filter cotton is screw-fixed; cleaning-tray filter is a 1–2 month consumable.',
            source: '2026-09-22 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Side Brush Behavior Change — T90 / X12 Series',
        date: '2026-09-24',
        questions: [
          {
            id: 'w08q7',
            prompt: 'What side-brush behavior change rolled out to T90 / X12 series (Sep 24 notice)?',
            options: [
              'The side brush automatically lifts/stows in specific situations (e.g. on carpet or during dock approach) — this is expected behavior, not a fault',
              'Side brushes were removed from these models',
              'Side brush speed is now fixed at low',
              'The side brush now spins only during mopping',
            ],
            answerIndex: 0,
            explanation: 'T90/X12 series side brush now changes state (lifts) automatically in certain situations — this is the intended new behavior, not a malfunction.',
            source: '2026-09-24 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Prime Fall Promotion Schedule & Trade-in Pause',
        date: '2026-09-25',
        questions: [
          {
            id: 'w08q8',
            prompt: 'What are the Prime Fall (PF) promotion windows for US and CA?',
            options: [
              'US: Sep 26 – Oct 14 (main: Oct 3–7); CA: Oct 3 – Oct 11 (main: Oct 6–7)',
              'US: Oct 3–7 only; CA: Oct 6–7 only',
              'US: Sep 26 – Oct 3; CA: Sep 26 – Oct 3',
              'US and CA both: Oct 1 – Oct 31',
            ],
            answerIndex: 0,
            explanation: 'US PF: 9.26–10.14 (main 10.3–10.7). CA PF: 10.3–10.11 (main 10.6–10.7).',
            source: '2026-09-25 · General',
          },
          {
            id: 'w08q9',
            prompt: 'What happens to the Trade-in program during PF and Black Friday?',
            options: [
              'Suspended from Sep 26 — banners removed, nav entry stays but shows a "promotion paused" notice',
              'Doubled rewards during PF',
              'CA-only suspension',
              'Nothing changes',
            ],
            answerIndex: 0,
            explanation: 'Trade-in pauses during PF/Black Friday. All banners come down; the Trade-in / Upgrade Program nav entry remains with a "paused" notice.',
            source: '2026-09-25 · General',
          },
        ],
      },
      {
        article: 'T90S / T90 MAX Bundles — US Launch',
        date: '2026-09-25',
        questions: [
          {
            id: 'w08q10',
            prompt: 'News flash: new US bundles launched — T90S PRO OMNI Black/White + Accessories and T90 MAX Plus OMNI + Accessories. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Three US bundle listings went live Sep 25: T90S PRO OMNI Black + Accessories, White + Accessories, and T90 MAX Plus OMNI + Accessories.',
            source: '2026-09-25 · General',
          },
        ],
      },
    ],
  },
];
