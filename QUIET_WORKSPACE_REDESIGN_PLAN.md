# COMMUNE / Ecovacs Notes: Quiet Workspace

Status: Quiet Workspace implementation for the v0.7.7 release line.

## Navigation Direction Update

The original sidebar/header/mobile-dock proposal below is superseded by the
single-orbit navigation requested during implementation. Do not add a persistent
top navigation panel, left rail, or separate mobile dock.

- One floating pill stays centered at the bottom: workspace icons on the left,
  Kitty Help in the center, and support widgets on the right.
- Every authorized workspace icon is visible to the left of Kitty, including
  DASH when the account has its grant. All six support-tool icons stay visible
  to the right; the pill scales them down rather than hiding them in overflow.
- Support drawers expand above the pill and can be dismissed without changing
  workspaces. Manuals and QA use centered dialogs. The call action dock sits at
  the top, while global controls remain individual floating buttons top-right.
- Structured Notes is the default Call Notes surface; Flow view remains
  available. Quick Responses use a searchable template-and-preview panel, not
  the previous radial fan.
- The Kitty orb first opens a compact Spotlight-style glass prompt. Enter opens
  the full Ask workspace and submits the typed question.

## 1. Context Reset

The current application is a multi-tool support workspace, not just its original flowchart prototype. The local baseline is v0.7.7. Previous work established authenticated call capture/parsing, note generation and archive submission, real-time Commune, AI Search conversations, evidence, and customer email drafting.

This redesign replaces the presentation and navigation model, not those working business flows. The original AGENTS.md styling specification is historical; the new user-supplied visual reference directs this proposal.

Source inspection covered App.tsx, Layout.tsx, TicketNotesPage.tsx, FlowchartCanvas.tsx, FloatingControls.tsx, EngineSettingsPanel.tsx, KittyHelpWorkspace.tsx, theme definitions, and the Ask/email integration points. The production browser reached sign-in, but a signed-in visual audit was unavailable. Visual findings below are inferred from component composition and styling, not claimed as measurements of every rendered workspace.

## 2. Design Thesis

**A quiet support workspace that feels like a well-organized personal instrument, not a dashboard full of competing widgets.**

The reference's strongest idea is hierarchy: one unmistakable focus card, quieter supporting layers, a compact action, and a soft atmospheric backdrop. Translate that hierarchy into support work rather than copying its calendar or tiny mobile typography.

"2030" is an aspirational design lens, not a prediction. Here it means:

- Context replaces toolbar density.
- Stable, useful surfaces replace piles of transient windows.
- AI works alongside the task, with provenance and controls visible when needed.
- Mobile gets a deliberately different composition, not a scaled-down desktop.
- Progress communicates readiness without gamifying customer calls.
- Animation explains a state change; it does not run continuously behind work.

Working name: **Quiet Workspace**. The established COMMUNE identity and Kitty character remain.

## 3. The Visual Direction

### Palette: Mist + Ink

The default concept is a warm pearl work surface against a muted mist-blue outer shell, with a gentle lavender undertone. The large work surface stays mostly opaque so text remains readable.

| Token | Light Proposal | Night Proposal | Role |
| --- | --- | --- | --- |
| shell | #DDE7EB | #161D25 | Atmospheric application background |
| surface | #F8F9F7 | #232B35 | Primary work plane |
| surface-subtle | #EEF2F3 | #2B3541 | Supporting regions |
| ink | #18252E | #EEF2F5 | Primary text |
| ink-muted | #52616B | #ABB7C2 | Secondary text |
| line | #D7E0E3 | #465360 | Boundaries |
| action | #16262F | #E3EBEF | High-contrast primary action |
| focus | #336D86 | #8BC7E0 | Focus rings and selected context |
| success | #27684F | #93D0B5 | Saved/completed states |
| warning | #865B16 | #E6C17C | Needs-review states |
| danger | #AC3E43 | #F2A1A5 | Recording and destructive states |

These are initial tokens, not a claim of accessibility certification. Test every actual foreground/background pair; adjust shades before rollout.

### Material and Shape

- Outer shell: one subtle, static atmospheric color field. No imagery required.
- Main work plane: 28px radius on desktop; 18px on mobile.
- Secondary cards: 16px radius. Inputs: 10px. Pills reserved for navigation/status.
- One low-elevation shadow on the main work plane; most internal regions use spacing and dividers, not shadows.
- Frosted material appears only on the navigation dock or temporary overlay. No nested blur.
- Avoid the current accumulation of colored borders, glass buttons, glow, gradients, and springy hover scaling.
- Matte rather than glossy. More generous whitespace outside; compact useful density inside.

### Typography and Rhythm

- Use one sans-serif stack for navigation, content, and inputs. Start with the installed Elms Sans/system fallback.
- Reserve JetBrains Mono for serial numbers, SKUs, timestamps, and diagnostics.
- Mobile inputs: at least 16px. Body: 15-16px. Auxiliary text: 12-13px, not 9-10px for essential controls.
- Display headers: 28-32px; workspace titles: 20-24px; labels: 13px.
- Desktop workspace padding: 24-32px. Mobile: 16px. Use a consistent 4/8px spacing system.
- Motion: 120-180ms for controls, 180-240ms for panel changes. Respect reduced motion.

## 4. Navigation: Places, Not an Icon Puzzle

Create a genuine application shell outside the flowchart canvas.

### Desktop

One compact labeled navigation column, approximately 176-192px wide:

- Commune
- Call Notes
- Cases
- Insights
- Schedule
- Learn

Account and Settings sit at the bottom. Entries are permission-aware; a keyboard shortcut is not an authorization mechanism.

Keep Commune as the post-sign-in landing destination, preserving the established workspace flow. Do not add a new mandatory "Today dashboard" between sign-in and Commune.

A small "Today" header can appear within Commune, using available schedule or announcement data. If the data is absent, omit it rather than inventing activity or progress.

Knowledge is a **contextual utility**, not a seventh competing destination: a visible "Find guidance" action opens the assistant/reference surface from any workspace.

### Tablet

Use an explicitly labeled navigation drawer opened from the workspace header. Do not rely on remembering collapsed rail icons. Keep the assistant as a sheet when a third column would crowd the primary tool.

### Phone

Four labeled dock items: Commune, Notes, Help, More.

More contains Cases, Insights, Schedule, Learn, account, and settings, filtered by access. The dock uses safe-area padding and gives way to the keyboard/composer during editing.

No hover-only control. Model menus, source access, and account actions must work by tap.

### URL Plan

| URL | Workspace | Existing Implementation |
| --- | --- | --- |
| /commune | Commune | CommunePanel |
| /notes | Call Notes | TicketNotesPage workflow, extracted presentation |
| /cases | Cases | CaseTrakBoard |
| /insights | Insights | Dash |
| /schedule | Schedule | ShiftsWorkspace |
| /learn | Learn | SelfTestWorkspace |

Root resolves to Commune after authentication. Existing / links remain valid. Browser back/forward restores the selected workspace.

Represent an open contextual assistant as URL state only if reload/back behavior is useful; do not put questions, customer data, or transcript content in URLs.

## 5. Call Notes: A Focused Work Plane

### Desktop Composition

```text
Navigation    Call Notes / Current customer       Find guidance   Account
              ----------------------------------------------------------
              Customer + model strip             Readiness summary
              ----------------------------------------------------------
              Main note editor                   Context panel
              Customer / Device / Issue          Guidance or transcript
              Resolution / Additional notes      Only one visible at once
              ----------------------------------------------------------
              Capture status   Fill notes        Generate note   More
```

The old flowchart becomes an optional **Flow view**. The new default is a structured editor grouped into Customer, Device, Issue, and Resolution sections. Reuse field definitions and the same values; do not build a disconnected second form.

Small stage markers and section dividers retain the sense of a guided workflow without permanent connecting lines or draggable cards.

### Focus Card

At the top of the work plane, a restrained summary identifies the current customer/model and the next useful action. Examples:

- "Capture this call" when idle.
- "Review parsed fields" when fresh generated values need inspection.
- "Ready to generate" when the configured required fields are complete.

Do not turn approximate completion into a fake percentage. Define required fields and conditions first. Clearly distinguish missing information from parsing still in progress.

### The Action Dock

Only three main actions: Capture, Fill notes, Generate note.

- Capture has a persistent recording indicator and explicit running/stopped state.
- Generate uses the main action style; red indicates recording or a genuinely destructive action, not every output action.
- Reset lives in More with confirmation.
- Audio devices, model selection, and diagnostics move to relevant settings, accessible through a labeled status action.
- QA becomes a compact "Review: n items" affordance with an expandable checklist.
- Quick replies appear beside the focused field or in the context panel, not as another permanent global toolbar.

Preserve the existing generation behavior that ends/drains active capture before creating a note. Explain this in the confirmation/action label; do not silently redefine the call lifecycle.

### Phone Call Notes

Use a single-column editor with section jump controls and collapsible completed sections. The primary action remains below the editor; avoid a second floating toolbar.

Transcript, reference, and QA open as full-height sheets with clear return paths. On-screen keyboard opening must keep the current input and send/action controls visible. Avoid global CSS zoom as a substitute for responsive layout.

## 6. Help: The Companion Desk

Make Kitty Help a coherent utility instead of a stack of overlapping popups.

- Desktop: an optional right-side companion panel within the work plane, roughly 360-420px. Expand to a focused full-workspace view for longer research.
- Phone: full-height Help sheet/workspace with the composer fixed beneath responses.
- Ask and Resolve remain recognizable actions; preserve their different workflows rather than silently merging inference behavior.
- Exact-model confirmation is a small inline callout next to the answer, followed by a focused reply prompt.
- Evidence is folded into "Sources (n)" attached to an answer. Desktop can pin it in a secondary inspector; phone opens sources on demand.
- Model selection sits under "Answer settings", not as an unlabeled icon or permanent technical ID in the main heading.
- Saved conversations remain until explicitly cleared. Clearing is available with a text label in the overflow menu.
- Kitty becomes a small header identity and optional status companion. Remove the floating mascot while a primary task is active; retain pet/personality features in Commune and account preferences.

Email drafting becomes a document preview attached to the current support task. The preview has a clear header, readable email body, and one primary "Copy email" action. It does not cover another modal.

Preserve both backend paths: AI Search + Workers AI for grounded Ask; selected parser/Kitty remote backend for the existing email integration. Keep explicit HTML paragraph/signature structure and rich/plain-text copy.

Streaming is a responsiveness feature, not proof of cache hits. Do not claim caching benefits without provider cache metrics.

## 7. Other Workspaces, One Design Language

### Commune

Give the town a clean, spacious scene frame. Move announcements and social context into a retractable side panel. Keep map movement, zoom, mobile joystick, message/reply actions, and live synchronization unchanged.

Let the town itself supply the personality. UI chrome is calm; do not restyle or rebuild Three.js geometry in this release.

### Cases

Use a clear list/detail composition with a stable filter row. Selecting a case reveals a detail pane; a contextual "Use in notes" action remains explicit. Preserve extension-backed Salesforce actions and imports.

### Insights

Lead with one concise scorecard summary, then comparison and detail. Use the shared type/palette/spacing without flattening meaningful chart semantics. Adapt the existing dashboard work rather than discarding its data model.

### Schedule

Use a readable week view with a selected-day detail surface. On phone, default to an agenda. Adopt the reference's compact date treatment here, where calendar navigation has a real purpose.

### Learn

One focus card for the next available quiz/task. Next activity and progress remain secondary. Use actual quiz completion data; do not reuse the reference's decorative week tracker without a product need.

### Settings and Sign-In

Sign-in becomes a clear centered page, not a task UI blurred underneath.

Split Settings into Account, Appearance & Accessibility, Call Capture, AI & Parsing, and Advanced. Put store/cards/pet preferences in an explicit personal area. Engine statistics and debug tools stay available but are not part of the first screen.

Support Mist and Night first. Migrate old theme choices to an understandable equivalent while keeping a legacy appearance option during rollout. This avoids deleting preferences before users see the replacement.

## 8. CSS and Component Architecture

### Proposed Modules

- src/components/workspace/AppShell.tsx
- src/components/workspace/WorkspaceNav.tsx
- src/components/workspace/MobileDock.tsx
- src/components/workspace/WorkspaceHeader.tsx
- src/components/workspace/ContextPanel.tsx
- src/components/workspace/ActionDock.tsx
- src/features/notes/NotesWorkspace.tsx
- src/features/notes/NotesEditor.tsx
- src/features/notes/CallSessionProvider.tsx
- src/styles/workspace-tokens.css
- src/styles/workspace-components.css

Treat this as proposed organization, not a requirement to relocate every existing file at once.

### Styling Strategy

1. Introduce a scoped new-shell boundary with tokens; leave the legacy workspace styling working outside it.
2. Share Surface, SectionHeader, StatusBadge, FieldGroup, ActionButton, and Sheet patterns.
3. Map semantic tokens to existing Tailwind/shadcn primitives rather than scattering literal palette values.
4. Replace bespoke glass/glow utility strings only as each surface migrates.
5. Remove redundant theme selectors and duplicate style rules after migration, not before.
6. Keep performance-critical view components memoized; do not broadcast caption updates through the whole shell.

## 9. Routing and State Wiring

Current structural issue: App routes mostly into TicketNotesPage; its workView state selects six workspaces through FlowchartCanvas. FloatingControls is portaled into a slot owned by that canvas. This binds global navigation to one tool's layout.

Target: the shell owns navigation and overlays; Notes owns note editing; the existing session/controller layer owns long-lived capture and ticket state.

- Mount call capture, transcript, draft storage, and extension bridge above workspace route outlets.
- Route navigation must not unmount active capture or regenerate ticket/archive IDs.
- Keep inactive heavy workspaces lazy and stop background rendering/subscriptions where appropriate.
- Give Commune connection/scene lifecycle an explicit policy; preserve real-time behavior rather than leaking multiple connections during route transitions.
- Replace canvas-provided rail slots with shell-owned controls.
- Share one stable TicketPanelsContext contract for note generation/Salesforce operations; preserve the fallback that protects output actions.
- Keep authentication/permissions authoritative in the server and apply matching visibility/route guards in the client.
- Retain Shift+C, Shift+R, and existing workspace shortcuts as accelerators with a visible shortcut directory.
- Migrate local preferences versionedly. Do not clear drafts, conversations, node positions, archived notes, or personal settings.

## 10. Implementation Phases

| Phase | Deliverable | Exit Gate |
| --- | --- | --- |
| 0. Baseline | Signed-in screenshots, control inventory, action/state map, representative test accounts | Every existing user-visible action has an owner and destination |
| 1. Design Prototype | Static desktop Notes, phone Notes, Help, Commune shell; Mist/Night tokens | Approve hierarchy, navigation labels, and density before product wiring |
| 2. Shell | Feature-flagged navigation/header/dock; legacy tools mounted unchanged | Switching workspaces preserves drafts/capture and respects access |
| 3. Notes | Structured editor, readiness summary, simplified action dock, optional Flow view | Existing parsing, manual editing, QA, generation, copy, archive, and extension flows pass |
| 4. Help & Output | Embedded assistant, expandable evidence, document-style email/output preview | Streams, model confirmation, persistence, source access, rich/plain copy all pass |
| 5. Remaining Workspaces | Commune chrome, Cases, Insights, Schedule, Learn, Settings, sign-in | Shared visual language; no lost controls or data |
| 6. Consolidation | Remove retired rail/modal/style paths; performance/accessibility checks | Approved pilot feedback, regression tests, and staged release |

Implement by surfaces, not a single global stylesheet replacement. The shell flag is a rollback mechanism, not a permanent second product.

Planning estimate: six to ten focused implementation sessions after prototype approval, with additional time for authenticated browser and device checks. The notes/session extraction is the highest-uncertainty part; revise the estimate after Phase 0.

## 11. Verification and Acceptance

- Review 360x640, 390x844, 768x1024, 1366x768, and 1920x1080 layouts; include landscape phones and the open keyboard.
- Main content and primary actions remain reachable without horizontal page overflow.
- Essential controls have visible labels or accessible names, keyboard focus, and 44px touch targets.
- Essential text meets WCAG AA contrast; no recording/review state depends on color alone.
- Workspaces support browser back/forward, reload, unauthorized URL entry, and lazy-load recovery.
- Start capture, switch workspace, return, and confirm no lost transcript or duplicate recorder/connection.
- Manual field edits, parser updates, resets, generate-note draining, archived-note IDs, Salesforce push, and copy remain behaviorally equivalent.
- Ask/Resolve streams, exact-model confirmation, evidence, saved history, clear action, and email content all work with real authenticated requests.
- Validate plain-text and HTML email copy in actual email clients, not just the preview.
- Keep public Commune chat transient and private interactions in Durable Objects. Do not migrate multiplayer storage as part of UI work.
- Test WebGL fallback, world-space click targeting, zoom, and mobile joystick after shell changes.
- Run npm run typecheck, lint, production build, and Worker validation when contracts change.
- Compare typing/streaming responsiveness and scene frame timing against the baseline; no permanent blur animation or increased heavy-workspace mounting.

## 12. Decisions for Approval

Recommended defaults:

1. Mist as the new light direction, with equally complete Night mode.
2. Commune remains the landing workspace.
3. Structured Notes editor becomes default; Flow view remains available.
4. Assistant becomes a contextual desk/sheet; existing workflow/backend behavior is preserved.
5. Global navigation becomes explicit routes instead of canvas-owned tabs.

The first implementation deliverable should be the design prototype, not a production CSS overwrite.
