import type { TestSuite } from './types';

// Week 11 (Oct 12–18) & Week 12 (Oct 19–25) — 2026
export const suitesPart6: TestSuite[] = [
  {
    id: 'w11',
    label: 'Week 11',
    range: 'Oct 12 – Oct 18',
    articles: [
      {
        article: 'T90 & T90S Water Tank — Mops Dry, Water Level Does Not Decrease',
        date: '2026-10-13',
        questions: [
          {
            id: 'w11q1',
            prompt: 'T90/T90S mops dry and the clean water tank level never drops. After the 6-step check (reseating, sealing plug, filter cleaning, "Wash Mop" test) the tank still outputs no water. What next?',
            options: [
              'Register for a replacement clean water tank',
              'Replace the entire dock',
              'Tell the user to buy a new filter every week',
              'Escalate to HQ engineering',
            ],
            answerIndex: 0,
            explanation:
              'A portion of T90/T90S clean water tanks had early-stage defects. If the tank still outputs no water after the standard steps, register a replacement clean water tank.',
            source: '2026-10-13 · 知识点分享群',
          },
        ],
      },
      {
        article: 'DTC Website Coupons — CCRB5 / CCACE10 (CA) Update',
        date: '2026-10-14',
        questions: [
          {
            id: 'w11q2',
            prompt: 'What is the current state of the CA DTC coupon codes CCRB5 and CCACE10, and what happens during Black Friday?',
            options: [
              'Active until ~Nov 12, ending before Black Friday; BF stays one-code-per-person',
              'Expired for good; agents may still hand out codes during Black Friday',
              'Active indefinitely; during BF each customer may claim several codes',
              'CA codes track the US PF schedule and renew automatically in December',
            ],
            answerIndex: 0,
            explanation:
              'CA DTC: CCRB5 + CCACE10 active, tentatively valid until Nov 12, ending before Black Friday starts. BF period keeps the one-code-per-person format. US DTC support-side code validity is adjusted only after US PF ends.',
            source: '2026-10-14 · 流程相关',
          },
        ],
      },
      {
        article: 'US & CA Trade-In Back Online, Coupon Codes Restored',
        date: '2026-10-15',
        questions: [
          {
            id: 'w11q3',
            prompt: 'What changed on the US and CA official websites as of 2026-10-15?',
            options: [
              'Trade-in is back online on both sites; old coupon codes work again',
              'Trade-in was discontinued on both sites; coupons all expired',
              'Only the CA trade-in returned; US is still down; new codes only',
              'Both sites switched to app-only coupons; trade-in paused',
            ],
            answerIndex: 0,
            explanation: 'Trade-in on both the US and CA sites is back online, and the previous coupon codes have been restored.',
            source: '2026-10-15 · General',
          },
        ],
      },
      {
        article: 'FAQ Update — T90, T90S, T90 (80) MAX, X12, X12S Series',
        date: '2026-10-15',
        questions: [
          {
            id: 'w11q4',
            prompt: 'Per the FAQ logic change: the customer manually presses the robot\'s bottom drain port and NO wastewater flows out. Is the machine broken?',
            options: [
              'No — no air pressure without the dock\'s push rod; run the FAQ checks instead',
              'Yes — the dirty water box pump has failed and needs a swap',
              'Yes — the drain port is stuck and must be replaced',
              'Yes — the robot has to be returned to the factory',
            ],
            answerIndex: 0,
            explanation:
              'After docking, the station\'s push rod opens the drain port and air pushes wastewater out. Pressing the port manually produces no flow — that is expected. Updated FAQ topics: Dirty Water Box Abnormal, and Frequent Returns to Station (check AI Stain Recognition off, Instant Supercharge on "Standard").',
            source: '2026-10-15 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Call Transfer Rule — Reassign Case Owner to the Answering Agent',
        date: '2026-10-15',
        questions: [
          {
            id: 'w11q5',
            prompt: 'You transfer a call to a Premium Agent (or a French call to the French-line colleague). What MUST you do with the ticket?',
            options: [
              'Set the Case Owner to the agent who took the call',
              'Create a brand-new ticket for the receiving agent',
              'Leave the Case Owner unchanged — it stays with you',
              'Close the ticket first, then hand over the call',
            ],
            answerIndex: 0,
            explanation:
              'For ANY type of call transfer, reassign the Case Owner to the agent who actually answered — ownership and responsibility must stay clear.',
            source: '2026-10-15 · 流程相关',
          },
        ],
      },
      {
        article: 'PIN Reset — Verification Requirements',
        date: '2026-10-16',
        questions: [
          {
            id: 'w11q6',
            prompt: 'A customer requests a PIN reset. Which of the following satisfies the verification requirement?',
            options: [
              'SN + proof of purchase, a bound app account, or an OTP to the bound contact',
              'Just their full name and a phone number they recite from memory',
              'A screenshot of the machine — no other checks are needed',
              'Nothing — PIN resets are never allowed under any circumstance',
            ],
            answerIndex: 0,
            explanation:
              'Verify at least ONE of: (1) machine SN + proof of purchase (receipt/order/invoice), (2) the account the customer registered and bound in the brand app, (3) a one-time verification code sent to the device-bound email/phone.',
            source: '2026-10-16 · 流程相关',
          },
        ],
      },
      {
        article: 'Video Too Large for Email — Cloud-Drive Link Script',
        date: '2026-10-16',
        questions: [
          {
            id: 'w11q7',
            prompt: 'A user\'s video is too large to attach to an email. What do you advise?',
            options: [
              'Upload to Google Drive, iCloud, or Dropbox and share the link',
              'Compress the video under 1 MB and retry the attachment',
              'Mail the video on a USB drive to the support office',
              'Skip the video entirely — it is never actually needed',
            ],
            answerIndex: 0,
            explanation:
              'Use the cloud-drive script: upload the video to Google Drive, iCloud, or Dropbox and share the link so the team can review it.',
            source: '2026-10-16 · 流程相关',
          },
        ],
      },
      {
        article: 'T90 Series Clean Water Tank — Replacement Part Numbers',
        date: '2026-10-17',
        questions: [
          {
            id: 'w11q8',
            prompt: 'A T90S (white) needs the new clean water tank after standard troubleshooting fails. Which part number?',
            options: [
              '201-L006-0199',
              '201-L001-0091',
              '201-L001-0090',
              '201-L006-0091',
            ],
            answerIndex: 0,
            explanation:
              'T90: 201-L001-0091 (black) / 201-L001-0090 (white). T90S: 201-L006-0199 (white). Effective from 2026-10-16.',
            source: '2026-10-17 · 知识点分享群',
          },
        ],
      },
      {
        article: 'US WINBOT Beta Tester Recruitment',
        date: '2026-10-17',
        questions: [
          {
            id: 'w11q9',
            prompt: 'A US DEEBOT user asks about the window-bot tester survey they received. When does screening complete?',
            options: [
              '2026/10/28, notified by email',
              '2026/10/24, notified by phone',
              '2026/11/1, notified in the app',
              'There is no screening process',
            ],
            answerIndex: 0,
            explanation:
              'Survey runs (GMT+8) Oct 17 10:00 – Oct 24 23:59; selection notices go out by email and screening completes 2026/10/28.',
            source: '2026-10-17 · General',
          },
        ],
      },
      {
        article: 'Black Friday 2026 — Preparation & Official Period',
        date: '2026-10-17',
        questions: [
          {
            id: 'w11q10',
            prompt: 'Black Friday 2026 is confirmed. What are the official period and core days?',
            options: [
              'Official period Nov 19 – Nov 30; core days Nov 26 – 30',
              'Official period Nov 11 – Nov 30; core days Nov 26 – 28',
              'Official period Nov 19 – Dec 15; core days Dec 1 – 7',
              'Official period Nov 25 – Dec 1; core days Nov 27 – 28',
            ],
            answerIndex: 0,
            explanation:
              'Confirmed: Black Friday official period runs Nov 19 – Nov 30, with Nov 26 – Nov 30 as the official core days. Prep support needs (product knowledge, pre-sales, price-match, flagship troubleshooting) via DM Hoi.',
            source: '2026-10-17 · General',
          },
        ],
      },
    ],
  },
  {
    id: 'w12',
    label: 'Week 12',
    range: 'Oct 19 – Oct 25',
    articles: [
      {
        article: 'QA Details — Voice/Softphone Calls & Email Entries',
        date: '2026-10-20',
        questions: [
          {
            id: 'w12q1',
            prompt: 'Per the QA details: how many times should you address the customer by name during a call, and what must you do after a hold?',
            options: [
              'Name twice; thank them for waiting when you return',
              'Name once; no acknowledgment needed after a hold',
              'Never use names; send a follow-up email instead',
              'Name three times; apologize once at call closing',
            ],
            answerIndex: 0,
            explanation:
              'Address the customer by name 2×, give a complete closing and ask if anything else is needed, thank them for waiting after a hold ("Thank you for waiting."), and check back if a hold exceeds 2 minutes.',
            source: '2026-10-20 · 流程相关',
          },
          {
            id: 'w12q2',
            prompt: 'For Email QA: the user mentioned a model in the subject and an SN via Web Form. What should you enter?',
            options: [
              'The model (verify via SN search); issue type per AI Summary',
              'Leave the model blank — QA does not check that field',
              'Only the issue type; the model field stays empty',
              'Guess the model from keywords in the email body',
            ],
            answerIndex: 0,
            explanation:
              'Enter the model whenever it is mentioned in the email or verifiable by searching the submitted SN, and follow the AI Summary recommendation for issue type.',
            source: '2026-10-20 · 流程相关',
          },
        ],
      },
      {
        article: 'Other-Region Service Inquiry — Response Script',
        date: '2026-10-20',
        questions: [
          {
            id: 'w12q3',
            prompt: 'A customer writes in from Europe. Per the HQ-specified script, what do you tell them?',
            options: [
              'We cover US & CA only; redirect them to their local ECOVACS support',
              'Handle the case ourselves — no script change is needed',
              'Transfer them to the CA sales line for further handling',
              'Ignore the email; regional teams will find them directly',
            ],
            answerIndex: 0,
            explanation:
              'We provide product and warranty support for the US and Canada only. Use the HQ script: apologize, redirect to the customer\'s local ECOVACS support team (insert the region\'s support entry/link).',
            source: '2026-10-20 · 流程相关',
          },
        ],
      },
      {
        article: 'QA Standard — Refill/Drain Module Issue Types Not Applicable in NA',
        date: '2026-10-21',
        questions: [
          {
            id: 'w12q4',
            prompt: 'A NA customer reports a fault and "Refill/Drain Module" looks like half the description matches. Which issue type do you pick?',
            options: [
              'Avoid module issue types — pick the matching non-module type',
              'Pick "Automatic water refill and drain module" — closest match',
              'Use the module type whenever the description half-matches',
              'Leave issue type empty and note it in the case comments',
            ],
            answerIndex: 0,
            explanation:
              'NA machines do not support the automatic water refill/drain module. Issue types like "Automatic water refill and drain module", "Refill/Drain Module", "water recycle module" are module-dedicated — avoid them regardless of how well the first half matches. Exception: "can I use it" inquiries fit Aftersale-Service inquiry: Refill/Drain Module application confirmation.',
            source: '2026-10-21 · 流程相关',
          },
        ],
      },
      {
        article: 'New DEEBOT Error Code Reference Sheet',
        date: '2026-10-21',
        questions: [
          {
            id: 'w12q5',
            prompt: 'News flash: a new DEEBOT error code reference sheet was shared. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Feishu sheet: https://lmgx8md8u1.feishu.cn/sheets/SiedsZWcThDIAGtUov8cLDP7nVd?sheet=3n8KN8',
            source: '2026-10-21 · 知识点分享群',
          },
        ],
      },
      {
        article: 'Amazon CA Orders (ECOVACS ROBOTICS 3P Seller) Verifiable in Salesforce',
        date: '2026-10-21',
        questions: [
          {
            id: 'w12q6',
            prompt: 'A customer bought from Amazon Canada sold by ECOVACS ROBOTICS (3P seller). How do you verify the order in Salesforce?',
            options: [
              'Search the order; check Order No., Order Date, and Product Name',
              'Request an Amazon invoice screenshot by email instead',
              'Call Amazon seller support for order confirmation',
              'Orders cannot be verified — proceed without checking',
            ],
            answerIndex: 0,
            explanation:
              'Amazon CA orders sold by ECOVACS ROBOTICS can be verified directly in Salesforce via Search — key fields: Customer Order No., Customer Order Date, Order Product > Product Name.',
            source: '2026-10-21 · General',
          },
        ],
      },
      {
        article: 'ECOVACS HOME App V3.17.0 Released',
        date: '2026-10-22',
        questions: [
          {
            id: 'w12q7',
            prompt: 'News flash: ECOVACS HOME app V3.17.0 is out — details are in an internal doc. Did you catch this one?',
            options: ['Yup, I know 👍', 'Nope — where do I find it?'],
            answerIndex: 0,
            explanation: 'Latest app version V3.17.0; details: https://ecovacs.feishu.cn/wiki/I5cMwl5E3isJlikSLQKcy4y0n6e (internal reference only).',
            source: '2026-10-22 · General',
          },
        ],
      },
      {
        article: 'Call Transfer (转 Call) — Process & Rules',
        date: '2026-10-22',
        questions: [
          {
            id: 'w12q8',
            prompt: 'Before transferring a call that needs a specific model/language agent, what must you do?',
            options: [
              'Confirm with T2/TL that a matching Available agent exists',
              'Transfer directly — the receiving agent will figure it out',
              'Ask the customer to call back again a bit later',
              'Email the request after the call has ended',
            ],
            answerIndex: 0,
            explanation:
              'Transfers for specific models/languages require T2/TL confirmation first — verify a matching agent is Available. Never transfer unconfirmed.',
            source: '2026-10-22 · 流程相关',
          },
          {
            id: 'w12q9',
            prompt: 'A call has already run 5 minutes and the user asks to switch agents. What does the red line say?',
            options: [
              'Do not transfer — calls over 4 min stay with you (AHT fairness)',
              'Transfer freely — the receiving agent\'s timer resets',
              'Transfer only if the user raises their voice',
              'Hang up and log the case for a callback later',
            ],
            answerIndex: 0,
            explanation:
              'Red line: do not transfer calls over 4 minutes — AHT standard is 6.5 min and past-halfpoint transfers inflate the receiving agent\'s time (unfair). High-risk or escalated customers: contact T2/TL immediately; never self-schedule callbacks without T2/TL approval. When in doubt, treat as high-risk.',
            source: '2026-10-22 · 流程相关',
          },
          {
            id: 'w12q10',
            prompt: 'A user insists twice on speaking only with a specific agent. What is the correct path?',
            options: [
              'Decline once; on repeat insistence transfer only with that agent\'s consent',
              'Transfer immediately — the first request is enough',
              'Refuse permanently no matter how often they insist',
              'Tell the user agents never take direct calls here',
            ],
            answerIndex: 0,
            explanation:
              'Regular transfer flow: politely decline once while offering help ("I understand you\'d prefer... I\'m more than happy to assist"). If the user insists 2+ times, confirm the agent\'s availability and transfer only with that agent\'s explicit consent.',
            source: '2026-10-22 · 流程相关',
          },
        ],
      },
    ],
  },
];
