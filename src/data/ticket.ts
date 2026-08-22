// EXPORTS: DEEBOT_MODELS, ISSUE_TYPES, QUICK_PHRASES, DEFAULT_NODE_POSITIONS, NODE_IDS, NODE_CONNECTIONS

export const DEEBOT_MODELS = [
  'Famibot LilMilo',
  'ULTRAMARINE P1',
  'X12 Series',
  'X11S Series',
  'X11 Series',
  'X9S PRO OMNI',
  'X9 Pro OMNI',
  'X8 Pro OMNI',
  'X5 Pro OMNI',
  'X2 OMNI',
  'X2 Combo',
  'X1 OMNI',
  'X1 TURBO',
  'X1 PLUS',
  'W3 OMNI',
  'W2S OMNI',
  'W2S',
  'W2 Pro OMNI',
  'W2 Pro',
  'W2 OMNI',
  'W1 Pro',
  'Winbot MINI 2',
  'Winbot MINI',
  'GOAT A Series',
  'GOAT O Series',
  'GX-600',
  'T90',
  'T80S',
  'T80',
  'T50S',
  'T50 Max',
  'T50',
  'T30S',
  'T30S Combo',
  'T30S PRO',
  'T30S AI',
  'T30C SE',
  'T30C',
  'T20 OMNI',
  'T10 OMNI',
  'T10 PLUS',
  'T9',
  'T8',
  'T8AiVi',
  'N30 Pro OMNI',
  'N20,N20e+,N20Pro+',
  'N10',
  'N8',
  'N8 PRO',
  'U2',
  'U2 PRO',
  'OZMO',
  'Deebot',
  'Other',
];

export const ISSUE_TYPES = [
  'Not charging',
  'Not cleaning properly',
  'Wi-Fi connection issue',
  'Strange noises',
  'Error codes',
  'Water/mop issue',
  'Brush issue',
  'Sensor issue',
  'Battery issue',
  'Other',
];

export const RESOLUTION_QUICK_TEXTS = [
  'Email for POP',
  'Email Follow Up',
  'Reset Machine',
  'Warranty Replacement',
  'Courtesy Replacement',
  'Checked Network',
];

export const QUICK_PHRASES: Record<string, string[]> = {
  Greetings: [
    "Hello, thanks for calling Ecovacs.",
    "How can I assist you today?",
    "Thank you for your patience.",
  ],
  Verification: [
    "Can I please have your name?",
    "And the best number to reach you at?",
    "Could you confirm your email address?",
    "What's your current shipping address?",
  ],
  Troubleshooting: [
    "Let's try to figure this out together.",
    "Have you tried restarting the device?",
    "Please check if the sensors are clean.",
    "Let's verify the brush assembly.",
  ],
  Closing: [
    "Is there anything else I can help with?",
    "Thank you for calling Ecovacs, have a great day!",
    "We'll follow up with you shortly.",
    "Your ticket has been created successfully.",
  ],
};

export const NODE_IDS = {
  START: 'start',
  FIRST_COMPLAINT: 'firstComplaint',
  ASK_NAME: 'askName',
  CUSTOMER_NAME: 'customerName',
  ASK_NUMBER: 'askNumber',
  CONTACT_NUMBER: 'contactNumber',
  TRANSITION: 'transition',
  DEEBOT_MODEL: 'deebotModel',
  SKU_NUMBER: 'skuNumber',
  SERIAL_NUMBER: 'serialNumber',
  ISSUE_TYPE: 'issueType',
  DETAILED_ISSUE: 'detailedIssue',
  EMAIL_ADDRESS: 'emailAddress',
  SHIPPING_ADDRESS: 'shippingAddress',
  RESOLUTION_SUMMARY: 'resolutionSummary',
  ADDITIONAL_NOTES: 'additionalNotes',
  HANG_UP: 'hangUp',
} as const;

export interface NoteHistoryEntry {
  id: string;
  timestamp: number;
  customerName: string;
  issueType: string;
  noteText: string;
}

export const MAX_HISTORY_ENTRIES = 50;

// Default node positions - compact vertical flow with horizontal branching
// Coordinates are in px, relative to canvas top-left
// Canvas: 680 wide. Center column x=220 (width 240). Side columns x=20 / x=460 (width 200).
export const DEFAULT_NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  [NODE_IDS.START]: { x: 220, y: 20 },
  [NODE_IDS.FIRST_COMPLAINT]: { x: 220, y: 110 },
  [NODE_IDS.ASK_NAME]: { x: 220, y: 236 },
  [NODE_IDS.CUSTOMER_NAME]: { x: 220, y: 330 },
  [NODE_IDS.ASK_NUMBER]: { x: 220, y: 440 },
  [NODE_IDS.CONTACT_NUMBER]: { x: 220, y: 534 },
  [NODE_IDS.TRANSITION]: { x: 220, y: 644 },
  // Model identification row - 3 side by side
  [NODE_IDS.DEEBOT_MODEL]: { x: 20, y: 738 },
  [NODE_IDS.SKU_NUMBER]: { x: 240, y: 738 },
  [NODE_IDS.SERIAL_NUMBER]: { x: 460, y: 738 },
  // Issue identification
  [NODE_IDS.ISSUE_TYPE]: { x: 20, y: 848 },
  [NODE_IDS.DETAILED_ISSUE]: { x: 220, y: 848 },
  // Additional info row (email + shipping + resolution, side by side)
  [NODE_IDS.EMAIL_ADDRESS]: { x: 20, y: 974 },
  [NODE_IDS.SHIPPING_ADDRESS]: { x: 240, y: 974 },
  // Resolution node is wider/taller (quick insert chips below the textarea)
  [NODE_IDS.RESOLUTION_SUMMARY]: { x: 440, y: 974 },
  [NODE_IDS.ADDITIONAL_NOTES]: { x: 200, y: 1152 },
  // Hang up
  [NODE_IDS.HANG_UP]: { x: 200, y: 1280 },
};

// Connection definitions: from -> to[]
export const NODE_CONNECTIONS: Array<{ from: string; to: string }> = [
  { from: NODE_IDS.START, to: NODE_IDS.FIRST_COMPLAINT },
  { from: NODE_IDS.FIRST_COMPLAINT, to: NODE_IDS.ASK_NAME },
  { from: NODE_IDS.ASK_NAME, to: NODE_IDS.CUSTOMER_NAME },
  { from: NODE_IDS.CUSTOMER_NAME, to: NODE_IDS.ASK_NUMBER },
  { from: NODE_IDS.ASK_NUMBER, to: NODE_IDS.CONTACT_NUMBER },
  { from: NODE_IDS.CONTACT_NUMBER, to: NODE_IDS.TRANSITION },
  { from: NODE_IDS.TRANSITION, to: NODE_IDS.DEEBOT_MODEL },
  { from: NODE_IDS.TRANSITION, to: NODE_IDS.SKU_NUMBER },
  { from: NODE_IDS.TRANSITION, to: NODE_IDS.SERIAL_NUMBER },
  { from: NODE_IDS.DEEBOT_MODEL, to: NODE_IDS.ISSUE_TYPE },
  { from: NODE_IDS.SKU_NUMBER, to: NODE_IDS.DETAILED_ISSUE },
  { from: NODE_IDS.SERIAL_NUMBER, to: NODE_IDS.DETAILED_ISSUE },
  { from: NODE_IDS.ISSUE_TYPE, to: NODE_IDS.RESOLUTION_SUMMARY },
  { from: NODE_IDS.DETAILED_ISSUE, to: NODE_IDS.RESOLUTION_SUMMARY },
  { from: NODE_IDS.DETAILED_ISSUE, to: NODE_IDS.EMAIL_ADDRESS },
  { from: NODE_IDS.DETAILED_ISSUE, to: NODE_IDS.SHIPPING_ADDRESS },
  { from: NODE_IDS.EMAIL_ADDRESS, to: NODE_IDS.ADDITIONAL_NOTES },
  { from: NODE_IDS.SHIPPING_ADDRESS, to: NODE_IDS.ADDITIONAL_NOTES },
  { from: NODE_IDS.RESOLUTION_SUMMARY, to: NODE_IDS.ADDITIONAL_NOTES },
  { from: NODE_IDS.ADDITIONAL_NOTES, to: NODE_IDS.HANG_UP },
];
