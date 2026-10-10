# DASH Redesign: Interactive KPI Workspace

Status: Implemented. Automated test suites intentionally not run so the user can perform acceptance testing.
Date: 2026-10-10
Scope: DASH only, preserving the existing application shell, hidden analytics entry, and report-driven architecture.

Implementation note: the workspace, visualizations, source refresh behavior, and scorecard are in place. TypeScript and production build checks passed; interactive acceptance testing remains with the user.

## 1. Recommendation

Replace the five-section scrolling report with an interactive KPI workspace:

- **Overview:** team health, a cross-metric agent matrix, and a compact workload summary.
- **Explore:** focused visual analysis of Quality, Workload, or Response Times.
- **Scorecard:** the clearly labeled static Money Go High snapshot and its scoring rules.

The distinctive feature is not a decorative chart. It is linked interaction: select an agent or metric once, see the relevant evidence, and keep that context as you explore.

Use three primary visualization families:

1. **Threshold-aware dot plots:** position explains performance precisely, with readable agent names and native-unit values.
2. **Interactive matrices:** expose patterns across agents, metrics, and channels without requiring repeated hovering.
3. **Stacked horizontal bars:** explain workload composition and volume directly.

Keep the dark glass material, existing app typography, restrained geometry, and subtle motion. Remove repeated colored card backgrounds, unnecessary nested borders, tiny chart labels, and decorative chart area.

## 2. What the Current Design Actually Shows

Reviewed the current component code, shared theme, loader/parser contracts, roster calculations, and local dataset. Opened `http://localhost:8001` and inspected the rendered dashboard and its accessibility structure at the current narrow browser viewport, then inspected Full view at 1440x900 and Mini at 1280x720 through Playwright. This was a design inspection, not a full cross-browser or responsive test.

### Visual findings

- Full view is a vertical stack of five large sections. At the inspected viewport, the opening CSAT section consumes most of the initial screen before the other KPIs become visible.
- Outer panels contain bordered inner panels, colored statistic cards, chart frames, and badges. These compete with the actual values.
- CSAT and volume charts squeeze agent names into rotated, small labels.
- The One-Touch parliament is recognizable but exact rates are hidden behind hover; seat position does not directly encode an agent's numeric rate.
- Response-time charts have a fixed 260px height even with roughly three dozen agents. Names and reference lines compete for space.
- The surrounding application already has a floating left rail and a five-step theme system. DASH should not add another permanent sidebar or a conflicting visual shell.
- Full and Mini views duplicate composition decisions. Mini hides useful charts rather than intentionally choosing a compact visual summary.
- At 1280x720, Mini retains a narrow workload summary inside a much wider panel, leaving a large unused area. Response labels wrap into cramped tiles, while the lower content and static scorecard remain below the viewport.
- Wide response charts expose long decimal axis endpoints and omit many agent tick labels to fit the height. Axis formatting and row-driven chart sizing need explicit implementation rules.

### Data findings that affect design

| Observation | Consequence for the redesign |
| --- | --- |
| Current CSAT export has 34 agents; One-Touch has 38; response exports have 19, 36, and 38 | Plan around readable rows and explicit pagination, not tiny marks or labels |
| The currently rendered global count is 31 | Label it as metric breaches, not 31 unique people |
| Team CSAT is 94.98% while the static scorecard says 96% | Do not visually combine static achievements with current reports |
| Operational cutoffs and payout bands differ | Separate these concepts in labels and the metric model |
| Several chat response rows are zero; the numeric parser also converts blanks to zero | Preserve genuine zero values, but audit raw cells before claiming every zero is valid |
| Response team average can fall back to an unweighted mean | Do not always label it "weighted" without provenance |
| Agent workload includes estimated shifts for unmatched roster names | Mark estimates explicitly and avoid confident staff-performance conclusions |
| Call metrics have no parsed report-as-of field | Do not present file modification time as the call reporting period |
| Existing scorecard weights sum to 90%; displayed scores sum to 99.05 | Preserve supplied values and flag incomplete/unclear weighting; do not normalize silently |
| Browser email discovery allows a broad email filename match, unlike the sync script | Add parity tests and align file selection before relying on refreshed workload values |
| Hooks prefer existing precomputed JSON without checking for newer raw exports | Refresh must not claim a newly dropped export was used unless freshness is established |

Snapshot examples above document the inspected dataset, not hardcoded values for the new UI.

## 3. Revision of the Earlier Plan

| Earlier proposal | Revised decision | Reason |
| --- | --- | --- |
| Add summary cards above the existing page | Build an Overview that replaces the initial report stack | Avoid duplicating the same numbers and making the page longer |
| Add sticky section jump links | Use one compact `Overview / Explore / Scorecard` control | The app already has navigation; focused views reduce scrolling |
| Standardize existing cards | Flatten panel hierarchy and standardize visualization anatomy | Consistent borders alone will not solve information density |
| Add search/sort to each chart | Share agent search, selection, and comparison across views | Users should not repeatedly find the same person |
| Improve the current parliament | Replace it with an agent-by-channel matrix | Numeric position, visible rates, and channel context are more direct |
| Mini View hides charts | Replace it with a deliberate `Briefing` mode | Small threshold tracks and distributions remain informative at 720p |
| Make the scoring matrix more prominent | Give it a separate, explicitly static Scorecard view | A static payout score must not look like a current operational aggregate |

## 4. Visual Direction

### Material and hierarchy

- Keep the existing background, foreground, card, border, accent, and semantic color tokens.
- Use one glass surface per major analysis panel. Avoid blur on every nested row or metric.
- Use the existing 12px base radius for analysis cards and popovers. Keep the app rail's existing pill geometry.
- Neutral foreground for headline values. Small status marks and short labels carry semantic color.
- Blue indicates selection and interactive focus. Green indicates a healthy status where needed. Warning/error colors mark exceptions.
- Remove decorative channel-colored panel borders and purple/fuchsia panel themes. Channels remain identifiable through names, icons, and distinct line/fill treatments.
- Keep the current app font system; use existing monospace tokens for numeric values and tabular numerals. No new font download or global typography rewrite.
- Suggested scale: 24px workspace title, 28-36px headline metrics, 14px section labels, 12-13px chart/data labels. Do not use 8-9px text for essential information.
- Use 16-24px panel padding and 12-16px gaps, adapting to the available content width.

### Motion

- 120-180ms hover and focus response; a selected point gains a subtle halo.
- 180-240ms transitions for tabs and detail-panel entry.
- On sort changes, rows may reposition smoothly; never animate a data value through invented intermediate readings.
- Keep chart domains and row order stable while merely hovering or selecting.
- Refresh retains the last successful visualization and replaces data atomically when ready.
- Honor reduced-motion settings. No continuously pulsing charts, rotating graphics, or ornamental count-up animations.
- Small controls can use subtle scale feedback; dense matrix rows should not scale or shift neighboring data.

## 5. Information Architecture and Layout

### Workspace header

Left: `AMR Dashboard`, `MTD`, and a compact source-period summary.

Right: `Overview / Explore / Scorecard`, `Briefing`, and `Refresh`.

A second compact context row contains the agent search, `All agents / Needs attention`, and a source-status button when applicable. At narrower widths, controls wrap deliberately; do not make the entire header horizontally scrollable.

Source filenames and parser details move into an on-demand `Data sources` popover/dialog. Keep scope exclusions such as CSAT's DTC/other-region exclusion visible next to that metric, not buried only in source metadata.

The toolbar is sticky within the actual `FlowchartCanvas` scroll container. It must not cover the app rail or create a new page-level scrolling container.

### Overview, wide layout

```text
AMR Dashboard   MTD / source status         Overview  Explore  Scorecard
Search agents...       All agents | Needs attention       Briefing  Refresh

CSAT        One-Touch        Chat response      Email first      Email avg
value       value            value + s          value + h        value + h
cutoff      cutoff           limit              limit            limit

Agent signal matrix                               Workload snapshot
Agent | CSAT | Touch | Chat | First | Avg           Call / Chat / Email totals
Name  | value and status in each available cell    Channel composition
...                                                Roster coverage
Showing 1-10 of N agents                           Explore workload

Current data coverage / source warnings            Static scorecard shortcut
```

- Headline metrics stay team-level even when agent rows are filtered. Label them `Team overview` to prevent confusion.
- Each metric tile contains one small threshold track, not another full chart.
- Overview matrix uses 10 rows per page initially, with visible total and page controls. All agents remain reachable.
- Default order: breach count descending, then stable full-name ordering. Label it `Most metric breaches`; it is not an overall performance ranking.
- Workload summary remains descriptive. Do not mix its advisory volume signals into the KPI breach total.
- Static score appears only as a quiet shortcut labeled `October 2026 static scorecard`, not a sixth live KPI.

### Explore

Local tabs: `Quality`, `Workload`, `Response`.

Quality contains a `CSAT / One-Touch` switch. A click on an Overview metric opens its corresponding Explore view with agent context preserved.

One primary visualization is expanded at a time, alongside only the relevant summary and controls. At wide widths, complementary small summaries can share a row; avoid rebuilding the current five-section page inside Explore.

### Responsive behavior

| Available content width | Layout |
| --- | --- |
| 1280px and above | Five KPI tiles; matrix and workload side by side |
| 960-1279px | KPI tiles wrap intentionally; workload moves below the matrix |
| 640-959px | Two-column KPI grid; one analysis panel per row; matrix shows a selected metric group |
| Below 640px | Single-column metric list; agent rows become expandable summaries; full data table can scroll horizontally inside its own clearly bounded container |

Use container width, not only window width: the app rail and any native window chrome reduce the actual workspace.

At 200% zoom, prioritize readable content and natural scrolling over a forced one-screen layout.

### Briefing mode

- Replaces Mini View with a purpose-built 1280x720 presentation.
- Keeps the five headline metrics, per-metric breach counts, tiny threshold tracks, source coverage, and channel totals.
- Uses a compact five-lane agent distribution plot instead of the full matrix; each lane is explicitly labeled in its own native units.
- Shows any partial/stale-data warning. Never hides it merely to fit.
- No full agent table, source filenames, scoring matrix, or large section headers.
- At the target size, primary content fits without vertical scrolling at normal text scale. At smaller sizes or enlarged text, scrolling is allowed.
- `Briefing` does not imply OS fullscreen; keep fullscreen behavior out of initial scope.

## 6. Visualization Specifications

### A. Overview: Agent Signal Matrix

**Question:** Which agents have issues across which metrics?

- Rows are resolved agent identities; columns are CSAT, One-Touch, Chat response, Email first response, and Email average response.
- Cells show native values and units, plus a small discrete status mark. No rainbow heatmap and no comparing raw seconds to raw percentages by color intensity.
- Missing data reads `Not reported`; invalid data reads `Unavailable`. Neither is treated as healthy or counted as a breach.
- Row summary reads, for example, `2 breaches / 4 reported metrics`, not a synthetic employee score.
- Hover/focus lightly highlights the row and column. Clicking a cell opens a persistent detail popover with value, operational cutoff, signed gap, denominator when available, and source-as-of.
- Clicking an agent name opens the Agent Inspector.
- Clicking a metric heading offers sort and `Explore metric`; the sort button has an explicit label.
- Optional cell subtext can show distance from the cutoff: percentage points for rates, seconds/hours for times.
- Implement as an actual HTML table with buttons in cells. Use small inline SVG tracks only where they add value.

### B. CSAT: Ranked Dot Plot with Survey Evidence

**Replace:** tall vertical bar chart and three oversized Good/Bad/Surveys cards.

**Question:** Who is below the cutoff, by how much, and on how many surveys?

- One horizontal row per agent: full readable name, dot on a 0-100% track, exact rate, and good/bad counts.
- Draw one shared vertical 85% operational cutoff line with a label. Retain the existing cutoff unless explicitly changed.
- Place team rate and a thin good/bad composition strip in the section header.
- Default sort: lowest CSAT first. Other sorts: most bad surveys, most surveyed, alphabetical.
- Dot size stays constant to preserve readability. Survey volume appears numerically rather than as ambiguous bubble area.
- Zero surveyed responses mean `No surveyed responses`, not an actionable 0% rate.
- Default page size: 15 agents; offer 30 or all with natural page scrolling.
- Selecting a row pins its full name and survey evidence in the Agent Inspector.
- Hover is supplementary: rate, cutoff, and sample size remain visible without hovering.
- Do not invent confidence bands, significance claims, or a low-sample policy. An optional minimum-surveys filter can be added later with an explicit user-set value.

### C. One-Touch: Agent-by-Channel Matrix

**Replace:** the semicircle parliament and repeated channel mini-cards.

**Question:** Is a low overall rate concentrated in Chat, Email, or Call?

- Columns: `Overall`, `Chat`, `Email`, `Call`, and `Other` when unmapped origins exist.
- Each cell shows percentage plus a slim in-cell rate track. A pinned detail reveals `one-touch / closed`.
- Fixed 0-100% scale makes cells comparable. The operational cutoff is 72%; it is not the scorecard's 68% threshold.
- Group rates use `sum(oneTime) / sum(closed)`, not average-of-percentages.
- A channel header opens its aggregate detail; an agent cell opens that agent/channel's contributing origins.
- Clicking a channel changes the focus/sort of this matrix. It does not pretend to filter unrelated CSAT or response datasets by channel.
- Zero closed cases produce `No closed cases`, not a red 0%.
- Preserve every raw origin in drill-down, including origins outside current hardcoded channel groups.
- Default sort: overall ascending. Column sort switches to the selected channel rate, with missing values last.
- Display channel evaluation as `Compared with overall 72% cutoff` until channel-specific policy exists.
- Keep exact values visible. No glow on every mark and no seat labels competing with each other.

### D. Workload: Channel Mix and Ranked Stacked Bars

**Rename:** `Dailies` to `Workload - MTD`. These exports do not provide a true daily time series.

**Question:** How much work is being handled, in which channels, and how does it relate to roster coverage?

- Top: direct Call, Chat, and Email totals and a labeled channel-mix strip, provided periods are compatible.
- Separate call detail: incoming/outbound handled counts, abandoned count, 20-second service level, and average handle time.
- Never stack total handled alongside its outbound subset. Do not combine abandoned and handled into a claimed total unless source definitions confirm the relationship.
- Per-agent primary chart: horizontal stacked Chat + Email bars, with readable names and exact totals at row ends.
- Toggle `Total contacts / Per roster shift`. Calls remain team-level because the current data has no per-agent call allocation.
- Per-shift mode only ranks agents with verified identity, appropriate roster coverage, and a usable positive denominator.
- Keep estimated/unmatched rows visible in a separate clearly labeled group. Do not silently insert them into the verified ranking.
- Existing relative thresholds may be shown as `Above comparison range` and `Below comparison range`, with 1.25x/0.70x rules stated. They are workload review cues, not clinical fatigue or staff-quality judgments.
- Remove `Top performers`, `Bottom performers`, and `Needs rest` language.
- Show denominator provenance: included skills, period, actual/estimated shifts, and roster coverage.
- If source periods differ, show independent channel totals and a period warning; suppress misleading combined/per-shift comparisons until compatible.
- Do not create a calendar heatmap or daily sparkline from MTD totals.

### E. Response Times: Team/Agent Dumbbells and Aligned Dot Rows

**Replace:** three independent fixed-height bar charts and six equally prominent number tiles.

**Question:** How does the team aggregate compare with the average agent, and who exceeds the operational limit?

- Top: one small horizontal dumbbell plot per metric, with distinguishable markers for team aggregate and mean of agent averages.
- A connecting line expresses a difference between aggregates, not a change over time. Label both markers directly.
- Each metric has its own clearly labeled native-unit axis and operational cutoff.
- Below: three aligned dot-plot columns sharing the same ordered agent rows. Missing metrics leave explicit empty cells rather than shifting names independently.
- Chat uses seconds. Both email metrics use hours and share a numeric domain for comparability.
- Native units are the default. A later `Relative to limit` option may use value/cutoff and a 1x line, but must label the normalization explicitly.
- Default ordering: number of response breaches, then largest value/cutoff among reported response metrics, then name. Explain that this orders review needs, not business severity.
- Stable domains derive from the complete loaded dataset, not just the currently filtered rows.
- If an outlier makes native-scale rows hard to read, use focused single-metric Explore or an explicitly labeled scale mode. Never silently clip a point or use a broken axis.
- Show valid zero as `0.0s` or `0.00h`; display missing/invalid values separately.
- Use `Team aggregate` unless provenance supports the more specific `Count-weighted mean` or `Report total`.
- Never call these percentiles or response-time distributions of individual cases; they are per-agent averages.

### F. Scorecard: Static Achievement Ladder

**Replace:** oversized trophy/settlement cards, category bars, and repetitive weight bars.

**Question:** What does the supplied scoring snapshot contain, and where do its achievements sit relative to its bands?

- Header: `Money Go High`, `October 2026 - static snapshot`, supplied total score, and settlement coefficient.
- Main view: one compact achievement track per KPI with labeled threshold, target, and challenge markers and the supplied achievement marker.
- Make direction explicit: `Higher is better` or `Lower is better`. Axis orientation and labels must agree.
- Keep units visible. Do not imply track lengths are comparable across unrelated KPI units.
- Exact weight, supplied score, and resulting band sit beside the track.
- Retain the full source-like table under `View scoring details`.
- Show `Listed weights: 90%` with a note that the remaining allocation is not represented in the current data. Do not synthesize a missing KPI.
- Keep supplied scores unchanged. The current matrix does not provide enough information to infer a payout formula or a reliable live score calculator.
- Label the current 99.05 score as supplied/summed snapshot points. Retain the source's stated 100-point basis only with the weighting caveat visible.
- No animated progress ring pretending this is a real-time completion measure.

## 7. Shared Interaction Contract

| Action | Behavior |
| --- | --- |
| Search agent | Filters analytical rows; team totals and scorecard stay unchanged and labeled |
| Needs attention | Shows agents with at least one valid operational breach; displays metric-breach count separately from resolved-agent count |
| Filter on Overview | Preserves all five metric cells for each matching agent, so context is not lost |
| Filter in single-metric Explore | Uses that metric's cutoff; label the scope visibly |
| Filter in response Explore | Uses any of the three response cutoffs |
| Enter Workload or Scorecard | Hide inapplicable KPI filter controls, retain their state for return; do not silently apply them |
| Select an agent | Open Agent Inspector; preserve selection when switching related analyses |
| Compare | Allow at most two agents, using the same metric rows and explicit missing-data cells |
| Escape/close inspector | Close overlay and restore focus to the originating row/cell |
| Refresh | Preserve filters and old successful data, show per-source progress, then update; unresolved errors retain labeled previous data |
| Clear filters | Restore default scope, search, and sorting in one action |
| Open sources | Show report as-of, raw source name, file timestamp if available, snapshot generation, and last successful check separately |

Agent Inspector is an on-demand dialog, not a permanent sidebar. On large screens it can be a wide centered overlay; on mobile it becomes a full-width sheet. Keep its data read-only. Comparison can use the same dialog layout.

Persistent preferences: view, Briefing choice, density/page size, and sort. Do not persist personal agent searches or pinned comparisons by default. Version preferences under a DASH-specific localStorage key and validate stored values.

## 8. Data and Implementation Design

### Preserve

- React/TypeScript implementation already used by this DASH feature.
- `Shift+D` analytics reveal/hide behavior and the existing app rail.
- The report files and isomorphic parser architecture.
- Both precomputed JSON and runtime parsing paths.
- Existing theme behavior, including light themes and larger-text mode.
- Operational business thresholds until a deliberate business decision changes them.

The original single-file prototype brief is not a reason to rewrite the existing DASH application. This is a scoped redesign of the current React feature.

### New normalized presentation model

Add a pure derivation layer between reports and components. The same records must drive charts, tables, filters, counts, and accessible summaries.

Conceptual fields:

```ts
type ValueState = 'valid' | 'missing' | 'invalid';
type AggregateMethod = 'report-total' | 'count-weighted' | 'agent-mean';
type IdentityState = 'exact' | 'mapped' | 'unresolved';

// Proposed shape; final types are an implementation task.
interface MetricObservation {
  agentKey: string;
  metricId: string;
  value: number | null;
  state: ValueState;
  unit: 'percent' | 'seconds' | 'hours' | 'count';
  sampleCount: number | null;
  sourceId: string;
}
```

- Canonical agent matching starts with normalized full names and reviewed aliases. Never merge people by first name alone.
- Preserve original owner text and source ID. Ambiguous names remain separate unresolved records.
- Distinguish team/shared accounts from people only through an explicit mapping; do not infer role from a name fragment.
- Report the count as `resolved agents` only when identity resolution supports it. Otherwise use `report identities` and surface unresolved coverage.
- Registry stores operational cutoff separately from scoring threshold/target/challenge.
- Breach logic runs on unrounded valid values. Presentation rounding must not move an observation across a cutoff.
- Keep null different from zero and zero denominator different from zero numerator.
- Response aggregate method is carried from the parser; legacy snapshots without provenance say `Method not recorded`.
- All visual sorting and comparison derivations are pure and tested.

### Source reliability changes

1. Align Node and browser report selection, especially AMR Email volume versus email response exports.
2. Add per-source metadata: filename, source fingerprint/mtime where available, raw report-as-of, snapshot generation, availability, and derivation method.
3. Version the precomputed JSON schema; accept older snapshots with conservative labels or fall back to source parsing where possible.
4. On refresh, compare available raw-source metadata with snapshot metadata. Parse newer raw sources or explicitly say the snapshot is still being used.
5. If a production/static environment cannot expose a directory index, show that limitation. Do not mark a snapshot "fresh" merely because it was fetched successfully.
6. Support partial report success instead of making all response/workload tiles fail because one source is missing.
7. Preserve last successful data on refresh failure and label it `Previous data`; distinguish initial unavailable from refresh failed.
8. Reuse one refresh transaction/source manifest across the workspace to avoid four independent fetches producing an incoherent view.
9. Audit raw blank/zero handling before changing parser output. Do not mass-convert zeros to null.
10. Keep report period, source-file modification, JSON generation, and UI fetch time separate. An unverified timezone string must not become an invented precise local timestamp.

### Rendering technology

- **HTML/CSS:** accessible matrices, labels, controls, stacked bars, pagers, detail tables.
- **SVG/React:** compact threshold tracks and dot plots with custom hit areas.
- **Recharts:** retain where axes and responsive plotting are useful; use shared styling and accessible HTML companions.
- **Existing Radix primitives:** dialog, popover, tabs, and focus management.
- **Existing motion library or CSS:** restrained transitions; no additional motion dependency.
- Do not migrate to ECharts just to make the charts look different, even though it is installed. Current scale does not require Canvas, WebGL, or a new charting package.
- At roughly 40-100 agents, pagination and SVG are sufficient. Consider virtualization only after measuring larger real datasets.

### Proposed file map

| File / area | Planned responsibility |
| --- | --- |
| `src/components/Dash.tsx` | Small orchestrator; active view, shared selection, source controller |
| `src/components/dash/DashToolbar.tsx` | View switching, refresh, search, and applicable filters |
| `src/components/dash/DashOverview.tsx` | KPI strip, agent matrix, workload summary |
| `src/components/dash/AgentMetricMatrix.tsx` | Accessible cross-metric table and sorting |
| `src/components/dash/AgentInspector.tsx` | Selected agent and two-agent comparison |
| `src/components/dash/DashBriefing.tsx` | Deliberate compact presentation |
| `src/components/dash/DataSourcesPanel.tsx` | Freshness, coverage, errors, and provenance |
| Existing four report-section components | Refactor progressively into the new focused views; remove old presentation after parity |
| `src/components/dash/MoneyScorecard.tsx` | Extract and redesign static scoring presentation |
| `src/components/dash/charts/` | Shared threshold track, ranked dots, aggregate dumbbell, and stacked-bar primitives |
| `src/lib/dash-model.ts` | Normalized observations, counts, filters, sorting, comparison |
| `src/lib/dash-agent-identity.ts` | Full-name normalization and explicit aliases |
| `src/lib/kpi-thresholds.ts` | Typed metric keys and operational-cutoff semantics |
| `src/lib/money-kpis.ts` | Static scoring snapshot and scoring-band definitions |
| `src/hooks/use-dashboard-reports.ts` | Shared source/refresh coordination and per-source states |
| Existing report hooks | Compatibility adapters during migration, removed only when unused |
| `src/lib/sf-reports.ts`, `src/lib/report-parsers.ts` | Discovery parity, provenance, value validity, versioned contracts |
| `scripts/sync-reports.ts` | Emit compatible source metadata and schema version |
| `src/components/dash/dash.css` | Scoped dashboard layout and visual treatments |
| `src/components/FlowchartCanvas.tsx` | Only necessary container/sticky integration; no rail redesign |

These are proposed filenames, not files created by this planning task.

## 9. Implementation Phases

### Phase 0: Baseline and semantic guardrails

Tasks:
- Capture Full/Mini at wide, 1280x720, and narrow sizes, plus representative light/larger-text states.
- Add synthetic report fixtures and baseline tests for current derived values.
- Audit blank/zero handling against raw exports and document any intentional aggregate changes.
- Define separate operational-cutoff and static-scorecard contracts.
- Align report selectors and introduce source/version metadata.
- Implement identity resolution with unresolved coverage.

Exit criteria:
- Existing valid values reconcile to current reports.
- Missing, zero, invalid, and zero-denominator cases have distinct tests.
- No unapproved threshold or payout changes.
- Source period and freshness labels have traceable evidence.

### Phase 1: Shell and visual foundations

Tasks:
- Build the scoped header, three workspace views, shared panel anatomy, and source panel.
- Add shared metric tile, threshold track, loading, empty, and error states.
- Make the actual canvas container support the sticky toolbar without extra nested page scrolling.
- Leave existing visualizations available inside Explore during migration.

Exit criteria:
- App rail, hidden entry, theme changes, keyboard entry, and larger-text behavior remain intact.
- Toolbar works at all target widths.
- Initial load and refresh errors do not shift the page unpredictably.

### Phase 2: Overview and linked agent interaction

Tasks:
- Implement normalized presentation selectors, KPI strip, matrix, search, sorting, and scoped attention filter.
- Add Agent Inspector and direct cell-to-Explore navigation.
- Add shared source controller with partial/previous-data states.
- Add two-agent comparison after basic selection/focus behavior is stable.

Exit criteria:
- User can identify a breached metric and open its evidence in at most two activations from Overview.
- Team totals never silently become filtered-agent totals.
- Matrix, detail views, and counts agree.
- Unique identity count is never confused with total metric breaches.

### Phase 3: Quality visualization replacement

Tasks:
- Replace CSAT vertical bars with ranked dot rows and visible survey evidence.
- Replace One-Touch parliament with channel matrix and raw-origin drill-down.
- Add page-size, sort, keyboard, and no-results behavior.

Exit criteria:
- Every source agent and origin remains reachable.
- Exact rates and denominators are accessible without hover.
- 0-100% geometry and cutoff boundaries are correct.
- Zero-volume channels are not flagged as low-rate failures.

### Phase 4: Workload and response redesign

Tasks:
- Build channel composition, safe call breakdown, and stacked Chat/Email agent bars.
- Separate verified and estimated per-shift comparisons.
- Replace judgmental workload wording.
- Build aggregate dumbbells and aligned response dot rows.

Exit criteria:
- Calls are not allocated to individuals.
- Incompatible report periods do not produce a misleading combined comparison.
- Response units, valid zeros, aggregate provenance, and outliers display correctly.
- Shared row identities remain aligned across all response columns.

### Phase 5: Static scorecard and Briefing

Tasks:
- Extract static scoring data and build achievement ladders plus an exact table.
- Show the 90% listed-weight caveat without inventing a formula.
- Implement the 720p Briefing layout and validated display preferences.
- Remove duplicate Mini/Full composition once replacement behavior is verified.

Exit criteria:
- Static and report-driven data cannot be mistaken for each other.
- Briefing retains useful visualization and source warnings at 1280x720.
- Stored preferences recover gracefully from old/invalid values.

### Phase 6: Accessibility, performance, and release verification

Tasks:
- Run data tests, typecheck, lint, production build, and browser checks.
- Exercise partial failures, repeat refresh, new source files, empty reports, and missing roster coverage.
- Verify dark and light themes, reduced motion, 200% zoom, touch targets, and focus restoration.
- Remove obsolete chart code and unused imports only after visual/data parity.

Exit criteria:
- No regressions in Notes, Trak, Shifts, or analytics locking.
- No essential information is hover-only or color-only.
- No clipped names, mislabeled axes, hidden outliers, or chart overflow at tested widths.
- Hover/selection does not rerun workbook parsing or rebuild the entire report model.

Phases are ordered implementation batches, not an instruction to start coding before this plan is approved.

## 10. Validation Matrix

### Automated data tests

- Exact cutoff equality is healthy for both higher-is-better and lower-is-better metrics.
- Valid zero remains zero; missing/invalid values do not enter breach counts.
- Percentage-point gaps are not described as percent changes.
- Distinct full names sharing a first name never auto-merge.
- Unresolved aliases and team accounts are represented without fabricated identities.
- Agent union handles metrics reported for different populations.
- One-Touch grouped rates use count-weighted arithmetic and retain unknown origins.
- Response aggregate provenance matches Total-row, count-weighted, and unweighted fallback paths.
- Zero/missing shifts never cause infinity or a fake healthy rate.
- Verified/estimated workload comparisons and period mismatches are covered.
- Scoring bands respect direction and preserve supplied scores; listed weights remain 90 unless source data changes.
- Browser/Node selectors choose the same reports when filenames and mtimes compete.
- Legacy snapshots, partial snapshots, newer raw exports, aborts, and refresh errors have explicit behavior.

### Browser scenarios

1. Reveal DASH with Shift+D, open it, hide analytics, and confirm return to Notes.
2. Search an agent, open a metric cell, enter Explore, and return with context intact.
3. Apply Needs attention, verify scope label, and clear all filters.
4. Compare two agents including a missing metric; open and close with keyboard only.
5. Refresh successfully, then simulate a failed source and verify labeled previous data.
6. Switch Full/Briefing without losing source warnings or corrupting preferences.
7. Test 1440x900, 1280x720, 1024x768, and 390x844; repeat key paths at 200% zoom.
8. Verify theme extremes and one intermediate theme, plus the app's larger-text setting.
9. Confirm row names and values remain readable, source popovers stay in bounds, and the rail never overlaps controls.
10. Test a larger synthetic dataset, an all-healthy dataset, no-data inputs, and unusually long agent names.

Use synthetic names and records for committed fixtures/screenshots. Do not commit real agent exports as new test fixtures.

There is currently no dedicated test script in `package.json`. Add a minimal TypeScript/Node test entry for pure selectors and Playwright smoke checks as implementation work, using existing tooling where practical. Existing `typecheck`, lint, and build commands remain required; unrelated baseline failures should be documented, not silently fixed as part of this redesign.

## 11. Deliberately Out of Scope

- Historical trend charts, period-over-period arrows, calendar heatmaps, or date-range filtering without archived compatible snapshots.
- Case-level response percentiles or distribution curves from per-agent averages.
- A live payout score, payout simulator, or inferred compensation formula.
- Automated coaching, fatigue, or employee-quality conclusions based on contact volume.
- A second permanent navigation/sidebar system.
- Drag-and-drop dashboard builders, 3D charts, radar charts, Sankey diagrams, or decorative gauges.
- New report infrastructure beyond the metadata/reliability changes needed to make the existing UI truthful.
- Changes to the rest of the app's visual system or native window controls.

## 12. Approval Defaults

Recommended defaults for implementation:

1. Adopt `Overview / Explore / Scorecard` instead of keeping five expanded sections.
2. Replace the parliament with the channel matrix; do not maintain two redundant One-Touch visualizations.
3. Keep the current operational limits: CSAT 85%, One-Touch MTD 72%, Chat 26s, Email first 4h, Email average 4h.
4. Keep static scorecard bands and supplied scores unchanged, visibly separate from those limits.
5. Keep verified workload comparisons separate from estimated/unresolved roster data.
6. Use the existing app fonts, 12px base radius, theme tokens, and current dependencies.
7. Ship the complete vertical slice through Overview and Quality first, then Workload/Response, then Scorecard/Briefing.

Business confirmation is needed only to change operational thresholds, resolve ambiguous identities, decide how unverified shift estimates should affect comparisons, or repair the incomplete scorecard allocation. Those decisions should not block the basic visual shell and interaction work.
