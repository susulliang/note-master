/**
 * Note Master — demo deck generator.
 *
 * Aesthetic: Apple-keynote minimal (editorial-gallery recipe).
 *  - White / near-white surface, deep ink text, one restrained accent.
 *  - Generous margins, thin rules, small folios, measured typography.
 *  - Dark app screenshots pop as "evidence" against the clean white canvas.
 *
 * Run:  node ppt-build/build-deck.mjs
 * Out:  ppt-build/note-master-demo.pptx
 */

import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const HERE = import.meta.dirname;
const ASSETS = path.join(HERE, "assets", "fit");
const OUT = path.join(HERE, "note-master-demo.pptx");

// ---------------------------------------------------------------------------
//  Design tokens — role-based, not slide-based
// ---------------------------------------------------------------------------
const T = {
  // Surfaces
  bg: "FFFFFF", // primary canvas
  surface: "F7F7F5", // soft panel
  surfaceAlt: "EFEFEC", // recessed band
  // Ink
  ink: "111114", // primary text (near-black)
  ink2: "3A3A3F", // secondary text
  ink3: "7A7A80", // muted / captions / folio
  hairline: "D9D9D6", // thin rules
  // Accent (one restrained blue — SF-style)
  accent: "0A84FF", // Apple system blue
  accentSoft: "E6F0FF", // accent wash
  // Semantic
  positive: "34C759", // green
  caution: "FF9F0A", // amber
  risk: "FF453A", // red
  // Fonts (present in target env / safe fallbacks)
  display: "Helvetica Neue", // titles
  body: "Helvetica Neue", // body
  mono: "Menlo", // code / labels
};

// Slide canvas (16:9)
const W = 13.333;
const H = 7.5;
// Outer margin (Apple-generous)
const MX = 0.85; // left/right
const MW = W - 2 * MX; // master content width = 11.63

// Image aspect (1280x948 = 1.351). Pre-baked; place with explicit w/h.
const IMG_W = 1280;
const IMG_H = 948;
const IMG_R = IMG_W / IMG_H; // 1.351
const imgHFor = (w) => w / IMG_R;
const imgWFor = (h) => h * IMG_R;

// ---------------------------------------------------------------------------
//  Primitives
// ---------------------------------------------------------------------------
function folio(slide, n, total) {
  // Bottom-right page number, small + muted
  slide.addText(`${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
    x: W - 1.1, y: H - 0.5, w: 0.85, h: 0.3,
    fontFace: T.body, fontSize: 9, color: T.ink3,
    align: "right", valign: "middle", margin: 0,
  });
}

function brandMark(slide) {
  // Top-left wordmark — tiny, restrained
  slide.addText("Note Master", {
    x: MX, y: 0.32, w: 3.0, h: 0.28,
    fontFace: T.display, fontSize: 11, bold: true, color: T.ink,
    charSpacing: 1, valign: "middle", margin: 0,
  });
}

function sectionLabel(slide, text) {
  slide.addText(text.toUpperCase(), {
    x: MX, y: 0.78, w: 8.0, h: 0.3,
    fontFace: T.body, fontSize: 11, bold: true, color: T.accent,
    charSpacing: 3, valign: "middle", margin: 0,
  });
}

function claim(slide, text, opts = {}) {
  // Big claim — one line, deep ink, tight leading
  const { y = 1.18, size = 38, w = MW, color = T.ink, bold = true } = opts;
  slide.addText(text, {
    x: MX, y, w, h: 1.0,
    fontFace: T.display, fontSize: size, bold, color,
    valign: "top", margin: 0, lineSpacingMultiple: 1.0,
  });
}

function hairline(slide, x, y, w, color = T.hairline) {
  slide.addShape("line", {
    x, y, w, h: 0, line: { color, width: 0.5 },
  });
}

function caption(slide, text, opts = {}) {
  const { x = MX, y = H - 0.78, w = MW, align = "left" } = opts;
  slide.addText(text, {
    x, y, w, h: 0.32,
    fontFace: T.body, fontSize: 10, color: T.ink3,
    align, valign: "middle", margin: 0, italic: true,
  });
}

// Single-line token guard (sequence, code, count) — no wrap
function token(slide, value, opts) {
  const { x, y, w, h, size = 22, color = T.accent, bold = true, align = "left" } = opts;
  slide.addText(String(value), {
    x, y, w, h, fontFace: T.mono, fontSize: size, bold, color,
    align, valign: "middle", margin: 0, wrap: false, fit: "shrink", vert: "horz",
  });
}

// Body paragraph block
function body(slide, text, opts = {}) {
  const { x = MX, y, w = MW, h = 1.6, size = 14, color = T.ink2, spacing = 1.25 } = opts;
  slide.addText(text, {
    x, y, w, h, fontFace: T.body, fontSize: size, color,
    valign: "top", margin: 0, lineSpacingMultiple: spacing,
  });
}

// Bulleted list — Apple style: no bullet glyph, hanging indent via em-dash
function bullets(slide, items, opts = {}) {
  const { x = MX, y, w = MW, size = 13, color = T.ink2, gap = 0.34 } = opts;
  let cy = y;
  for (const it of items) {
    slide.addText(it, {
      x, y: cy, w, h: 0.5,
      fontFace: T.body, fontSize: size, color,
      valign: "top", margin: 0, lineSpacingMultiple: 1.2, bullet: false,
    });
    cy += gap;
  }
}

// Place a pre-fitted app screenshot (contain, no runtime crop)
function appShot(slide, file, opts = {}) {
  const { x, y, w } = opts;
  const h = imgHFor(w);
  slide.addImage({
    path: path.join(ASSETS, file),
    x, y, w, h,
    rounding: 8, // soft radius on the corner (renderer permits)
  });
  return h;
}

// ---------------------------------------------------------------------------
//  Build
// ---------------------------------------------------------------------------
const pres = new PptxGenJS();
pres.defineLayout({ name: "16x9", width: W, height: H });
pres.layout = "16x9";
pres.author = "Note Master";
pres.title = "Note Master — Demo";
pres.company = "Ecovacs CS Tools";

const slides = [];
const TOTAL = 18; // for folio; will reconcile at end

// Helper to push + auto-number
function addSlide() {
  const s = pres.addSlide();
  s.background = { color: T.bg };
  slides.push(s);
  return s;
}

// ───────────────────────────────────────────────────────────────────────────
// 01 — Cover
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  // Massive claim, top-anchored with breathing room
  slide_block0(s);
  function slide_block0(s) {
    // thin top rule
    hairline(s, MX, 0.85, MW);
    // eyebrow
    s.addText("A CONTACT-CENTER NOTE TAKER", {
      x: MX, y: 1.2, w: MW, h: 0.4,
      fontFace: T.body, fontSize: 13, bold: true, color: T.accent,
      charSpacing: 4, valign: "middle", margin: 0,
    });
    // Title — two lines, oversized
    s.addText("Hear the call.", {
      x: MX, y: 2.1, w: MW, h: 1.3,
      fontFace: T.display, fontSize: 72, bold: true, color: T.ink,
      valign: "top", margin: 0, lineSpacingMultiple: 1.0,
    });
    s.addText("Fill the note.", {
      x: MX, y: 3.3, w: MW, h: 1.3,
      fontFace: T.display, fontSize: 72, bold: true, color: T.ink,
      valign: "top", margin: 0, lineSpacingMultiple: 1.0,
    });
    s.addText("Ship the ticket.", {
      x: MX, y: 4.5, w: MW, h: 1.3,
      fontFace: T.display, fontSize: 72, bold: true, color: T.accent,
      valign: "top", margin: 0, lineSpacingMultiple: 1.0,
    });
    // bottom meta
    hairline(s, MX, H - 1.0, MW);
    s.addText("Note Master  ·  v0.2.25  ·  React 19 + Vite 8 + Whisper", {
      x: MX, y: H - 0.8, w: MW, h: 0.3,
      fontFace: T.body, fontSize: 11, color: T.ink3, valign: "middle", margin: 0,
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 02 — The problem
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "The problem");
  claim(s, "Every agent juggles four things at once.");
  hairline(s, MX, 2.35, MW);
  body(s,
    "The customer on the line. The SOP they should be following. " +
    "The CRM they must type into. And a 90-second QA checklist they cannot forget.",
    { y: 2.6, w: 9.5, size: 17, color: T.ink2 }
  );
  body(s,
    "Notes get short, fields get skipped, and the next agent picks up a ticket " +
    "that barely explains what just happened.",
    { y: 3.8, w: 9.5, size: 17, color: T.ink2 }
  );
  // pull-quote
  s.addText("\u201CThe note is the product of a support call.\u201D", {
    x: MX, y: 5.2, w: MW, h: 0.6,
    fontFace: T.display, fontSize: 22, italic: true, color: T.ink,
    valign: "middle", margin: 0,
  });
  caption(s, "Source: agent shadowing, 2026 Q3 — average handle time vs. note completeness.");
  folio(s, 2, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 03 — The thesis (manifesto)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "The thesis");
  claim(s, "Let the agent listen. The app does the typing.");
  hairline(s, MX, 2.35, MW);

  const cols = [
    { k: "HEAR", v: "On-device Whisper transcribes the mic and the call, speaker-tagged, in the browser." },
    { k: "FILL",  v: "A speaker-aware parser maps the transcript onto the ticket fields as the agent speaks." },
    { k: "SHIP",  v: "One button turns the form into a Salesforce-ready note and pushes it back to the case." },
  ];
  const cw = (MW - 2 * 0.5) / 3;
  let cx = MX;
  for (const c of cols) {
    token(s, c.k, { x: cx, y: 2.7, w: cw, h: 0.4, size: 13, color: T.accent });
    body(s, c.v, { x: cx, y: 3.15, w: cw - 0.2, h: 2.6, size: 13, color: T.ink2 });
    cx += cw + 0.5;
  }
  caption(s, "Three engines, one pipeline — hear, fill, ship.");
  folio(s, 3, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 04 — System overview (architecture)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "System");
  claim(s, "One pipeline, three engines, all in the browser.");
  hairline(s, MX, 2.35, MW);

  // Pipeline as a horizontal flow of labeled chips with arrows
  const stages = [
    { t: "Mic + Tab audio", d: "getUserMedia" },
    { t: "Whisper (local)", d: "transformers.js · WASM" },
    { t: "Field extractor", d: "speaker-aware regex" },
    { t: "LLM parser", d: "DeepSeek cloud / Qwen local" },
    { t: "Form", d: "gridbox state" },
    { t: "Salesforce", d: "Chrome MV3 bridge" },
  ];
  const sx = MX, sy = 3.0;
  const chipW = 1.62, chipH = 1.5, gap = 0.18;
  let cx = sx;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    // chip
    s.addShape("roundRect", {
      x: cx, y: sy, w: chipW, h: chipH,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.75 },
      rectRadius: 0.08,
    });
    s.addText(st.t, {
      x: cx, y: sy + 0.18, w: chipW, h: 0.5,
      fontFace: T.display, fontSize: 12, bold: true, color: T.ink,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.d, {
      x: cx, y: sy + 0.72, w: chipW, h: 0.6,
      fontFace: T.mono, fontSize: 8.5, color: T.ink3,
      align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.1,
    });
    // arrow
    if (i < stages.length - 1) {
      s.addText("\u2192", {
        x: cx + chipW, y: sy, w: gap, h: chipH,
        fontFace: T.body, fontSize: 16, bold: true, color: T.ink3,
        align: "center", valign: "middle", margin: 0,
      });
    }
    cx += chipW + gap;
  }
  // caption rail
  body(s,
    "Audio is captured in the tab. Whisper runs on the device. Field extraction is shared " +
    "between the live hook and the LLM worker. The form is the single source of truth, " +
    "and a Tier-2 extension writes the result back to Salesforce.",
    { y: 5.0, w: MW, size: 12, color: T.ink2 }
  );
  caption(s, "No audio leaves the browser except the optional DeepSeek parse of the transcript text.");
  folio(s, 4, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 05 — The workspace (hero screenshot)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "The workspace");
  claim(s, "A flowchart of the call, not a form to fill.");
  hairline(s, MX, 2.35, MW);

  // Hero screenshot, centered, contained
  const iw = 9.4;
  const ih = imgHFor(iw); // 6.96
  const ix = (W - iw) / 2;
  const iy = 2.6;
  appShot(s, "fit_01_main_workspace.png", { x: ix, y: iy, w: iw });
  // thin frame
  s.addShape("rect", {
    x: ix, y: iy, w: iw, h: ih,
    fill: { type: "none" }, line: { color: T.hairline, width: 0.5 },
  });
  caption(s, "Gridbox canvas — every node is a ticket field; the bottom call bar drives capture.");
  folio(s, 5, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 06 — Whisper auto transcription
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 01");
  claim(s, "On-device Whisper transcription.");
  hairline(s, MX, 2.35, MW);

  // Left: copy. Right: screenshot.
  body(s,
    "Whisper runs entirely in the browser through transformers.js + ONNX Runtime Web (WASM). " +
    "Models cache after the first download; nothing is sent to a server.",
    { y: 2.7, w: 6.0, size: 13.5, color: T.ink2 }
  );
  bullets(s, [
    "Mic channel = agent speech (Web Speech API).",
    "Tab-audio channel = customer (CCP) — local Whisper.",
    "base / tiny · en + fr multilingual variants.",
    "Hallucination & repetition loops filtered live.",
    "Live input meters + per-segment status.",
  ], { y: 3.9, w: 6.0, size: 12.5, gap: 0.32 });

  const iw = 5.7;
  const ih = imgHFor(iw);
  appShot(s, "fit_06_settings_or_engine_panel.png", { x: 6.95, y: 2.7, w: iw });
  s.addShape("rect", {
    x: 6.95, y: 2.7, w: iw, h: ih,
    fill: { type: "none" }, line: { color: T.hairline, width: 0.5 },
  });
  caption(s, "Engine settings panel — Whisper model, dtype, downloads, RAM badge.", { x: 6.95, w: iw });
  folio(s, 6, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 07 — Auto note filling (merge policy)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 02");
  claim(s, "Auto note filling that never overwrites a human.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "A speaker-aware parser maps the transcript onto ticket fields. Customer first-person " +
    "phrasings only parse from the customer's speech; agent dictation (\u201Ccustomer's number is\u2026\u201D) " +
    "only from the agent's. Model names canonicalize against the combobox list.",
    { y: 2.7, w: MW, size: 13.5, color: T.ink2 }
  );

  // Source priority ladder — 5 rungs
  const rungs = [
    { src: "regex",       rule: "fills empty fields only", color: T.ink3 },
    { src: "regex-grow",  rule: "replaces regex / paraphrase", color: T.ink2 },
    { src: "paraphrase",  rule: "polished machine text", color: T.ink2 },
    { src: "llm",         rule: "authoritative over machine", color: T.accent },
    { src: "human",       rule: "never overwritten", color: T.ink },
  ];
  const rx = MX, ry = 4.0, rh = 0.62, rw = MW;
  for (let i = 0; i < rungs.length; i++) {
    const r = rungs[i];
    const yy = ry + i * (rh + 0.16);
    // bar
    s.addShape("roundRect", {
      x: rx, y: yy, w: rw, h: rh,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.5 },
      rectRadius: 0.05,
    });
    token(s, r.src, { x: rx + 0.25, y: yy, w: 2.4, h: rh, size: 13, color: r.color });
    s.addText(r.rule, {
      x: rx + 2.8, y: yy, w: rw - 3.0, h: rh,
      fontFace: T.body, fontSize: 12, color: T.ink2,
      valign: "middle", margin: 0,
    });
  }
  caption(s, "mergeAutoFill() — lib/autofill-merge.ts · unit-tested in scripts/test-parser-trading.ts");
  folio(s, 7, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 08 — Cloud LLM parse + bilingual TLDR
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 03");
  claim(s, "Cloud LLM parse + bilingual call TLDR.");
  hairline(s, MX, 2.35, MW);

  // Two columns: Parse | TLDR
  const cw = (MW - 0.6) / 2;
  const colY = 2.7;
  // Col 1 — Parse
  token(s, "PARSE", { x: MX, y: colY, w: cw, h: 0.4, size: 12, color: T.accent });
  body(s,
    "Two buttons in the transcript header. Parse keeps every customer clause and every " +
    "agent step; Concise trims to the 2\u20134 primary complaints and the 2\u20134 confirmed fixes.",
    { x: MX, y: colY + 0.45, w: cw, h: 2.6, size: 12.5, color: T.ink2 }
  );
  bullets(s, [
    "DeepSeek backend (optional API key).",
    "Streams progress inline.",
    "QA scoring runs alongside.",
  ], { x: MX, y: colY + 2.0, w: cw, size: 12, gap: 0.3 });

  // divider
  s.addShape("line", {
    x: MX + cw + 0.3, y: colY, w: 0, h: 4.0,
    line: { color: T.hairline, width: 0.5 },
  });
  // Col 2 — TLDR
  token(s, "TLDR", { x: MX + cw + 0.6, y: colY, w: cw, h: 0.4, size: 12, color: T.accent });
  body(s,
    "On French-call captures the panel regenerates an English + Chinese 1\u20133-sentence summary " +
    "of the whole conversation — so an agent can follow a call they may not fully understand.",
    { x: MX + cw + 0.6, y: colY + 0.45, w: cw, h: 2.6, size: 12.5, color: T.ink2 }
  );
  bullets(s, [
    "Refresh at 10s, 30s, then every 30s.",
    "One request in flight at most.",
    "Persists as the whole-call summary.",
  ], { x: MX + cw + 0.6, y: colY + 2.0, w: cw, size: 12, gap: 0.3 });

  caption(s, "use-cloud-parser.ts · use-call-tldr.ts — bilingual because the local Qwen 0.5B cannot write Chinese.");
  folio(s, 8, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 09 — Salesforce extension bridge
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 04");
  claim(s, "A Chrome extension that reads and writes Salesforce.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "A Tier-2 MV3 extension (\u201CEcovacs Note Helper\u201D) bridges the React app and the agent's " +
    "open Salesforce Console tab. Two transport channels, tried in order:",
    { y: 2.7, w: MW, size: 13.5, color: T.ink2 }
  );

  const flow = [
    { k: "01", t: "chrome.runtime.sendMessage", d: "official channel on blessed origins" },
    { k: "02", t: "window.postMessage + bridge.js", d: "fallback for any custom host" },
  ];
  const fx = MX, fy = 3.7, fw = 5.5, fh = 1.7, gap = 0.3;
  let fxp = fx;
  for (const f of flow) {
    s.addShape("roundRect", {
      x: fxp, y: fy, w: fw, h: fh,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.5 },
      rectRadius: 0.08,
    });
    token(s, f.k, { x: fxp + 0.25, y: fy + 0.2, w: 0.7, h: 0.4, size: 14, color: T.accent });
    s.addText(f.t, {
      x: fxp + 1.0, y: fy + 0.2, w: fw - 1.2, h: 0.4,
      fontFace: T.mono, fontSize: 11, bold: true, color: T.ink,
      valign: "middle", margin: 0,
    });
    s.addText(f.d, {
      x: fxp + 0.25, y: fy + 0.7, w: fw - 0.5, h: 0.9,
      fontFace: T.body, fontSize: 11, color: T.ink2,
      valign: "top", margin: 0, lineSpacingMultiple: 1.2,
    });
    fxp += fw + gap;
  }
  // right note
  body(s,
    "Pull: scrapeAll() imports the open case fields into the form, tagged source 'dom-ext'. " +
    "Push: applyCaseFields() writes the post body + customer fields back to the case tab.",
    { x: MX, y: 5.7, w: MW, size: 12.5, color: T.ink2 }
  );
  caption(s, "use-ccp-extension-bridge.ts · extension/ — externally_connectable + content-script fallback.");
  folio(s, 9, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 10 — Product lookup (screenshot)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 05");
  claim(s, "Product lookup — ten knowledge tabs in one panel.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "One panel, ten tabs: specs, error codes, FAQ, templates, news, firmware, app updates, " +
    "scientist notes, free search, and selling tips. Everything an agent needs mid-call, " +
    "auto-narrowed by the robot model selected on the form.",
    { y: 2.7, w: 6.4, size: 13, color: T.ink2 }
  );
  bullets(s, [
    "Fuzzy model match against the form.",
    "Bilingual (EN + \u4e2d\u6587) free search.",
    "Spec comparison across models.",
    "Error codes cross-checked vs. issue text.",
  ], { y: 4.3, w: 6.4, size: 12.5, gap: 0.32 });

  const iw = 5.6;
  appShot(s, "fit_02_product_lookup.png", { x: 7.0, y: 2.7, w: iw });
  s.addShape("rect", {
    x: 7.0, y: 2.7, w: iw, h: imgHFor(iw),
    fill: { type: "none" }, line: { color: T.hairline, width: 0.5 },
  });
  caption(s, "Product Lookup panel — GOAT O1000 LiDAR PRO specs.", { x: 7.0, w: iw });
  folio(s, 10, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 11 — SOP handbook (screenshot)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 06");
  claim(s, "The SOP handbook, indexed and AI-reranked.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "The handbook ships as numbered markdown sections, lazy-loaded so the app shell paints " +
    "first. A bilingual tokenizer (English words + Chinese 2-grams) indexes 142 headings; " +
    "title matches weigh 4\u00D7 body matches.",
    { y: 2.7, w: 6.4, size: 13, color: T.ink2 }
  );
  bullets(s, [
    "As the form fills, candidate chips auto-rank.",
    "\u201CSOP AI Match\u201D reranks with DeepSeek.",
    "Click a chip to read the full section.",
    "Markdown rendered with theme styles.",
  ], { y: 4.3, w: 6.4, size: 12.5, gap: 0.32 });

  const iw = 5.6;
  appShot(s, "fit_03_sop_panel.png", { x: 7.0, y: 2.7, w: iw });
  s.addShape("rect", {
    x: 7.0, y: 2.7, w: iw, h: imgHFor(iw),
    fill: { type: "none" }, line: { color: T.hairline, width: 0.5 },
  });
  caption(s, "SOP panel — 142 headings indexed, keyword candidates pending.", { x: 7.0, w: iw });
  folio(s, 11, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 12 — SKU spare-parts lookup
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Major feature · 07");
  claim(s, "SKU spare-parts lookup across 11,800 parts.");
  hairline(s, MX, 2.35, MW);

  // Classifier chain — 4 narrowing levels
  body(s,
    "A four-stage classifier chain narrows the ~11.8k-part database to the one part the " +
    "agent needs, then auto-fills the SKU field with \u201CSKU \u2014 English part name.\u201D",
    { y: 2.7, w: MW, size: 13.5, color: T.ink2 }
  );

  const chain = [
    { n: "1", t: "Robot Model", d: "fuzzy: \u201CT30S PRO\u201D \u2192 DEEBOT T30S PRO list" },
    { n: "2", t: "Robot \u2194 Base", d: "workbooks ship separate sheets per side" },
    { n: "3", t: "Region", d: "NA / EU / JP \u2026 \u00B7 untagged always kept" },
    { n: "4", t: "Free text", d: "EN + \u4e2d\u6587, debounced 250 ms" },
  ];
  const cw = (MW - 3 * 0.25) / 4;
  let cx = MX;
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    s.addShape("roundRect", {
      x: cx, y: 3.7, w: cw, h: 1.7,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.5 },
      rectRadius: 0.06,
    });
    token(s, c.n, { x: cx + 0.2, y: 3.85, w: 0.5, h: 0.4, size: 14, color: T.accent });
    s.addText(c.t, {
      x: cx + 0.75, y: 3.85, w: cw - 0.9, h: 0.4,
      fontFace: T.display, fontSize: 12.5, bold: true, color: T.ink,
      valign: "middle", margin: 0,
    });
    s.addText(c.d, {
      x: cx + 0.2, y: 4.35, w: cw - 0.4, h: 1.0,
      fontFace: T.body, fontSize: 10.5, color: T.ink2,
      valign: "top", margin: 0, lineSpacingMultiple: 1.2,
    });
    if (i < chain.length - 1) {
      s.addText("\u2192", {
        x: cx + cw, y: 3.7, w: 0.25, h: 1.7,
        fontFace: T.body, fontSize: 14, color: T.ink3,
        align: "center", valign: "middle", margin: 0,
      });
    }
    cx += cw + 0.25;
  }
  body(s,
    "One match \u2192 auto-fills the field. Multiple matches \u2192 a dropdown to pick from, with a " +
    "part-picture preview at the bottom of the card.",
    { y: 5.8, w: MW, size: 12.5, color: T.ink2 }
  );
  caption(s, "SkuLookupCard.tsx · utils/skuData.ts — 11.8k parts, region-bucketed.");
  folio(s, 12, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 13 — QOL · Quick replies (screenshot)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Quality of life · 01");
  claim(s, "Quick replies — a radial dial of email templates.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "Hover the bottom-bar button and HTML email templates fan out onto a frosted radial disc, " +
    "smart-grouped by intent. Click to copy; hover a card 2.5s to preview the rendered HTML.",
    { y: 2.7, w: 6.4, size: 13, color: T.ink2 }
  );
  bullets(s, [
    "Loaded from /quick_reply/*.html via import.meta.glob.",
    "Groups: Closing Ticket, Must Return, Collect Info\u2026",
    "Click-to-copy into Salesforce's rich-text editor.",
    "Centered portal preview auto-dismisses.",
  ], { y: 4.3, w: 6.4, size: 12.5, gap: 0.32 });

  const iw = 5.6;
  appShot(s, "fit_04_quick_replies.png", { x: 7.0, y: 2.7, w: iw });
  s.addShape("rect", {
    x: 7.0, y: 2.7, w: iw, h: imgHFor(iw),
    fill: { type: "none" }, line: { color: T.hairline, width: 0.5 },
  });
  caption(s, "Quick Replies expanded — categorized reply templates.", { x: 7.0, w: iw });
  folio(s, 13, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 14 — QOL · Phonetic alphabet (screenshot)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Quality of life · 02");
  claim(s, "Phonetic alphabet, inline in the email field.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "A tiny \u201CAz\u201D toggle on the Email Address gridbox expands the node downwards to reveal " +
    "the NATO alphabet plus specials (dot, hyphen, at-sign, underscore). Inline \u2014 never " +
    "covers neighbouring fields \u2014 and one click copies the whole reference.",
    { y: 2.7, w: 6.4, size: 13, color: T.ink2 }
  );
  bullets(s, [
    "A = Alpha \u2026 Z = Zulu, always at hand.",
    "Specials for email-safe characters.",
    "Copy-to-clipboard for the full table.",
    "Frosted inset, matches gridbox chrome.",
  ], { y: 4.3, w: 6.4, size: 12.5, gap: 0.32 });

  const iw = 5.6;
  appShot(s, "fit_05_phonetic_alphabet.png", { x: 7.0, y: 2.7, w: iw });
  s.addShape("rect", {
    x: 7.0, y: 2.7, w: iw, h: imgHFor(iw),
    fill: { type: "none" }, line: { color: T.hairline, width: 0.5 },
  });
  caption(s, "Phonetic alphabet expanded inline under the Email field.", { x: 7.0, w: iw });
  folio(s, 14, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 15 — QOL · Cat assistant + keyword alerts
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Quality of life · 03");
  claim(s, "A cat that watches the call with you.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "A draggable pixel-art sprite (128px, six states \u00D7 three frames each) lives on the canvas " +
    "and pops thought bubbles. It is a Clippy-style nudge layer \u2014 never steals focus, " +
    "auto-dismisses, and dozes off after 20s of inactivity.",
    { y: 2.7, w: MW, size: 13.5, color: T.ink2 }
  );

  const states = [
    { k: "resting", d: "dozed off after 20s idle" },
    { k: "standby", d: "calm default, sitting" },
    { k: "side",    d: "glancing at a thought bubble" },
    { k: "thinking", d: "LLM advice request in flight" },
    { k: "alert",   d: "live call capture running" },
    { k: "dragged", d: "pointer down, being moved" },
  ];
  const cw = (MW - 2 * 0.3) / 3;
  let cx = MX, cy = 4.0;
  for (let i = 0; i < states.length; i++) {
    const st = states[i];
    const col = i % 3, row = Math.floor(i / 3);
    const x = MX + col * (cw + 0.3);
    const y = 4.0 + row * 1.2;
    s.addShape("roundRect", {
      x, y, w: cw, h: 1.0,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.5 },
      rectRadius: 0.06,
    });
    token(s, st.k, { x: x + 0.2, y: y + 0.12, w: cw - 0.4, h: 0.35, size: 11, color: T.accent });
    s.addText(st.d, {
      x: x + 0.2, y: y + 0.5, w: cw - 0.4, h: 0.4,
      fontFace: T.body, fontSize: 10.5, color: T.ink2,
      valign: "top", margin: 0,
    });
  }
  // keyword alerts note
  body(s,
    "Bonus: a keyword-alert dictionary. Add a word; when the transcript hears it, the cat " +
    "pops an amber bubble with your custom reminder.",
    { y: 6.55, w: MW, size: 11.5, color: T.ink3 }
  );
  folio(s, 15, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 16 — QOL · Themes, glass UI, gridbox toggles
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Quality of life · 04");
  claim(s, "Eleven themes, glass panels, and a canvas you control.");
  hairline(s, MX, 2.35, MW);

  body(s,
    "Eleven themes (5 time-of-day + 3 neutral greys + 3 tints) cycle from the left rail. " +
    "Every panel is a frosted-glass surface \u2014 backdrop-blur, saturation, hairline ring \u2014 " +
    "and the canvas itself is composable.",
    { y: 2.7, w: MW, size: 13.5, color: T.ink2 }
  );

  // Theme swatches — 11 chips
  const themes = [
    "Daylight", "Morning", "Afternoon", "Slate", "Neutral", "Breezy",
    "Evening", "Midnight", "Zinc", "Amethyst", "Moss",
  ];
  const swW = 1.65, swH = 0.5, gap = 0.18;
  const perRow = 6;
  let cx = MX, cy = 3.9;
  for (let i = 0; i < themes.length; i++) {
    const col = i % perRow, row = Math.floor(i / perRow);
    const x = MX + col * (swW + gap);
    const y = 3.9 + row * (swH + 0.18);
    s.addShape("roundRect", {
      x, y, w: swW, h: swH,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.5 },
      rectRadius: 0.06,
    });
    s.addText(themes[i], {
      x, y, w: swW, h: swH,
      fontFace: T.body, fontSize: 10.5, color: T.ink2,
      align: "center", valign: "middle", margin: 0,
    });
  }

  body(s,
    "Gridbox toggles hide or show canvas nodes \u2014 Shipping address, 24h tracker, SKU, Order " +
    "number, Additional notes \u2014 without losing their values. A larger-text toggle scales " +
    "the whole UI for the back of the room.",
    { y: 5.5, w: MW, size: 12.5, color: T.ink2 }
  );
  caption(s, "themes.ts · FloatingControls.tsx — 11 themes, glass-panel class, gridbox visibility.");
  folio(s, 16, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 17 — More QOL (history, quick inserts, QA, case board)
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Quality of life · 05");
  claim(s, "Dozens of smaller touches.");
  hairline(s, MX, 2.35, MW);

  // Four mini-features in a 2x2 grid, two with screenshots
  const cards = [
    { t: "History panel", d: "Searchable archive of past notes by customer or issue.", img: "fit_07_history_panel.png" },
    { t: "Quick inserts", d: "67 one-click chips for the common issue descriptions.", img: "fit_08_template_panel.png" },
    { t: "QA checklist",   d: "Weighted call-channel items, red/amber/green bars, scored by the LLM pass.", img: null },
    { t: "Case board",     d: "Kanban for the team \u2014 28 agents, drag-and-drop, persists to localStorage.", img: null },
  ];
  const cw = (MW - 0.4) / 2;
  const ch = 1.95;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const col = i % 2, row = Math.floor(i / 2);
    const x = MX + col * (cw + 0.4);
    const y = 2.7 + row * (ch + 0.25);
    s.addShape("roundRect", {
      x, y, w: cw, h: ch,
      fill: { color: T.surface }, line: { color: T.hairline, width: 0.5 },
      rectRadius: 0.08,
    });
    token(s, c.t, { x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.4, size: 13, color: T.ink });
    s.addText(c.d, {
      x: x + 0.25, y: y + 0.62, w: c.img ? cw * 0.55 : cw - 0.5, h: 1.1,
      fontFace: T.body, fontSize: 11, color: T.ink2,
      valign: "top", margin: 0, lineSpacingMultiple: 1.25,
    });
    if (c.img) {
      const iw = cw * 0.4;
      const ih = imgHFor(iw);
      const iy = y + (ch - ih) / 2;
      appShot(s, c.img, { x: x + cw - iw - 0.2, y: iy, w: iw });
    }
  }
  folio(s, 17, TOTAL);
}

// ───────────────────────────────────────────────────────────────────────────
// 18 — Stack & closing
// ───────────────────────────────────────────────────────────────────────────
{
  const s = addSlide();
  brandMark(s);
  sectionLabel(s, "Stack & summary");
  claim(s, "Built on a modern, fully-typed stack.");
  hairline(s, MX, 2.35, MW);

  const stack = [
    { k: "UI",        v: "React 19 · Vite 8 · Tailwind 4 · Radix UI" },
    { k: "Voice",     v: "transformers.js · ONNX Runtime Web · Web Speech API" },
    { k: "AI",        v: "DeepSeek (cloud) · Qwen 0.5B / 1.5B (local, Web Worker)" },
    { k: "Content",   v: "Markdown + import.meta.glob · bilingual tokenizer" },
    { k: "Bridge",    v: "Chrome MV3 · externally_connectable + content script" },
    { k: "Notes",     v: "v0.2.25 · ~90 components, hooks, libs, workers" },
  ];
  let cy = 2.8;
  for (const row of stack) {
    s.addText(row.k.toUpperCase(), {
      x: MX, y: cy, w: 1.8, h: 0.35,
      fontFace: T.body, fontSize: 10, bold: true, color: T.accent,
      charSpacing: 2, valign: "middle", margin: 0,
    });
    s.addText(row.v, {
      x: MX + 1.9, y: cy, w: MW - 1.9, h: 0.35,
      fontFace: T.mono, fontSize: 12, color: T.ink,
      valign: "middle", margin: 0,
    });
    cy += 0.5;
  }

  // closing line
  hairline(s, MX, H - 1.7, MW);
  s.addText("Hear. Fill. Ship.", {
    x: MX, y: H - 1.5, w: MW, h: 0.8,
    fontFace: T.display, fontSize: 34, bold: true, color: T.ink,
    valign: "middle", margin: 0,
  });
  s.addText("/Users/susul/Dev/econote/note-master", {
    x: MX, y: H - 0.6, w: MW, h: 0.3,
    fontFace: T.mono, fontSize: 10, color: T.ink3,
    valign: "middle", margin: 0,
  });
  folio(s, 18, TOTAL);
}

// ---------------------------------------------------------------------------
//  Write
// ---------------------------------------------------------------------------
await pres.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT}  (${slides.length} slides)`);
