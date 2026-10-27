# Design spec: "Cyanotype"

The visual design of the page and the chart, light and dark, on the desktop (1440 px) and on the phone (390 px).
The chart's geometry and its layout tests are in [viz/rivers.md](viz/rivers.md). Where this spec and
accessibility disagree, accessibility wins.

## 1. Rules (binding)

1. No middle dot `·` as a separator anywhere in UI copy, titles or meta. 2. No redundant explanatory text.
3. Copy is clear, plain, no coined words. 4. All colours from Radix Colors (radix-ui.com/colors), 12-step usage
(1-2 backgrounds, 3-5 component backgrounds, 6-8 borders, 9-10 solids, 11-12 text). 5. Optical alignment; nested
radii concentric (outer = inner + padding). 6. Lines and borders 0.5px. 7. Minimal motion, ease-out, 250 ms base.
8. At most 4 type sizes per view: 13 / 16 / 22 / 56 (phone h1 32). 9. Few decisions for the user. 10. No decorative
radius or shadow, no coloured left-stripe cards. 11. No eyebrows (small labels above headings).
Colour-vision deficiency: nothing depends on telling hues apart. Light/dark: follows the system by default; the header
button switches and remembers (`repo-rivers:theme` in localStorage), choice cleared when it equals the system; set before
first paint; print is always light.

## 2. Tokens

Radix 3.0 `blue` and `slate`, light and dark scales (values in `src/ui/theme/tokens.css`).

| Role | Light | Dark |
|---|---|---|
| ground (page) | blue 1 `#fbfdff` | blue 2 `#111927` |
| ink (text, headings) | blue 12 `#113264` | blue 12 `#c2e6ff` |
| muted text | slate 11 `#60646c` | slate 11 `#b0b4ba` |
| water A (river tone 1) | blue 12 | blue 12 |
| water B (river tone 2) | blue 11 `#0d74ce` | blue 11 `#70b8ff` |
| on-water (river names) | blue 1 | blue 1 |
| line (rules, borders, table head rule) | blue 7 `#8ec8f6` | blue 6 `#104d87` |
| hair (table row rules) | blue 6 | blue 5 |
| band (selected segment, selected era, focused row) | blue 3 | blue 3 |
| solid button | blue 12 bg, blue 1 text | blue 12 bg, blue 1 text |
| field bg | `#ffffff` | blue 1 |
| focus ring | 2px blue 9 `#0090ff`, offset 2 | same |

Type: **Alegreya Sans** only (OFL), self-hosted subset woff2 in `public/fonts/` (400, 500, 700, italic 400, italic 500;
Latin; keep the total small, budget in `pnpm size`). Sizes: 56/60 (h1, 500; the italic part 400),
22/28 (h2, chart title, 500), 16/24 (body, controls, readout), 13/20 (meta, axis, table head, river names italic 500,
footer). Numbers use `lining-nums`; tables and readout numbers `tabular-nums`.
Layout: content column 1200px centred (x 120..1320 at 1440). Section grid: 280px label column + 920px content.
Spacing steps used: 4 8 12 16 24 40 64 104 144 160. Radius: 6 outer (field, button, segmented, state panels),
3 inner (segment inside 3px padding). Controls 36 (segmented, select) and 48 (field, button) tall; hit targets >= 44.

## 3. Page, top to bottom (desktop 1440)

- **Header** 72px: logo 28 + "Repo Rivers" (16/700) at x 120; right: "Source" link and the theme icon button (44px,
  glyph optically flush with 1320: nav `margin-right: -12px`).
- **Hero**: padding-top 104. h1 "A repository’s history, *drawn as rivers*" (56, letter-spacing -0.025em,
  `text-wrap: balance`, shifted -3px for the A's side bearing). 40 below: one row: field 440x48 (placeholder
  `github.com/owner/name`, accessible name "GitHub repository"), 12 gap, button "Draw", then 16 gap and the sentence
  "or open Vite, Svelte or Express" (muted; sample names are links/buttons, ink with a 0.5px underline, the current one
  1.5px). No separate label above the field, no lede.
- **Chart head**, 104 below: left h2 `owner/name` (22) and under it the meta line (13 muted):
  "Lines changed per quarter, Apr 2020 to Oct 2026." plus, when sampled, a dashed-underline button
  "Estimated from 6,310 of 9,799 commits" that opens the source notes popover. Right (flush 1320): for
  Modules the "Folder depth **Auto** ⌄" select; for Contributors an "Include bots" checkbox; then the segmented control
  Modules | Contributors (radiogroup). No other options or disclosures.
- **Chart** (svg 1440 wide, see §4), then the **under row**: left the live readout (16, `aria-live="polite"`); right the
  legend (13 muted) with drawn glyphs: dotted line "estimated" (only if any bucket is estimated), dashed vertical
  "quarter in progress" (unit word follows the bucket unit; only if partial), dashed arrow "files moved" (only if the view has transfers).
- **Rivers** section (144 below): grid 280 | 920. h2 "Rivers" baseline-aligned with the table head. Table columns
  240 / 380 / 120 / 80 / 100: name (italic 500, "bot" muted after bots) | sparkline 360x24 of each bucket scaled to the
  river's own peak (water A; "other" water B at 55%) | lines changed or commits (right) | share (right; one decimal
  below 10%) | active span "2020 to now" / "2021 to 2026" / "2020" (right, muted). Head 13 muted with a 0.5 `line`
  rule; rows 48 tall with 0.5 `hair` rules. Head labels: "Module" or "Contributor", "Each quarter, scaled to its own
  peak", "Lines changed" or "Commits", "Share", "Active". Clicking or pressing Enter on a row focuses that river
  (same state as the chart); the focused row has the band background. Visually hidden caption. The prose
  summary of the chart stays available to screen readers via `aria-describedby`.
- **Eras** section: h2 "Eras" baseline-aligned with the first row. Rows: range (muted, column 240) | title (500) and
  the note (muted, first letter capitalised, `; ` shown as `, `, ending with a full stop). Era titles start at x 640,
  the same x as the sparklines.
- **Footer** (160 below, 0.5 rule full width, padding 32/56): grid 520 | 680, 13/20 muted. Left: "Data from the GitHub
  API, read without an account; large histories are sampled. The built-in samples work offline." /
  "AI era names are capped site-wide each day; past the cap, eras get rule-based names." (a JSX comment points at
  `DAILY_AI_CAP` in wrangler.jsonc) / "Open source under MIT. Source on GitHub". Right (x 640): "Made by GeekPlux"
  (ink 500) and links geekplux.com (500), Vert, Explorable, Pagelapse, Reasontrail, markvis with 0.5 underlines.

## 4. The chart (desktop)

- Geometry comes from `layoutRivers` (pure and tested; see [viz/rivers.md](viz/rivers.md)). Plot spans x 120..1180 of the
  1440 page (the SVG may stay full container width; what matters is the plot's left edge on the column's left edge and
  mouth labels ending by 1320). Plot height 480; gap between rivers 2px (ground shows through).
- **Era band** above the plot (84px): every era, including the first, has a 0.5 `line` rule at its start x from 8px
  above the plot to the axis. Its name (16/500 ink) sits on the rule (text x = rule x), wrapping inside the era's width
  minus 16 to at most two lines (20px line step), bottom-aligned; under it the range "Q2 2020 to Q1 2021" (13 muted). A
  selected era gets a `band` rect over its span (era band + plot). Eras are keyboard operable (buttons).
- **Fills**: no hue. Each river gets water A or water B by a greedy two-colouring that minimises the number of columns
  where two rivers of the same tone touch (`tones()` in `src/core/tones.ts`). "other" is a 45° hatch (water B 1.6px lines every
  6px on ground) with a 0.5 water B outline. Bots have a dotted outline.
- **Transfers**: a ground-coloured casing (width + 2) then a dashed stroke (`6 3`, width min(w, 3.5), water B) with a
  7px arrowhead; when an end river is focused they turn ink, others fade with the rivers.
- **Focus**: the focused river keeps full strength and is drawn in water A; every other river and its label fade to
  18% (labels 45%, drawn in ink). A 0.5 ink vertical rule marks the bucket from the era band to the axis and a 4.5r dot
  (ground fill, 1.5 ink stroke) sits on the river's centre. Readout example:
  "*packages*, Q2 2023: **7,732** lines changed, 21% of the quarter. 952 files moved in from *test*." Idle readout:
  "*packages/vite* carries 46% of all lines changed, and 167 files moved between modules."
- **Axis**: 0.5 `line` baseline 8 below the plot; estimated runs drawn on it as ink dotted 1.5 (`1 3`); a year tick
  (0.5, 8 long) at each year start with the year (13 muted) left-aligned at the tick; the first bucket gets its year
  only if the next year label is at least 3 buckets away. Partial last bucket: 0.5 ink dashed (`2 3`) vertical line.
- **River names** (13 italic 500): in this order, with collision boxes (labels, transfers):
  1. inside the river, straight, slanted along its course: find the longest run of buckets where thickness >= 17 and
     the 5-bucket smoothed centreline stays inside by 7.5px; centre the text in the run; fit a least-squares line to the
     smoothed centre under the text; clamp slope to ±0.35; accept if the band contains the text ±8px along its length;
     colour on-water ("other": ink with a 3px ground halo).
  2. else horizontal inside the river at its thickest buckets (same containment test).
  3. else, if the river reaches the present: a mouth label in the gutter right of the plot, stacked 17px apart with a
     0.5 leader curve from the river's end.
  4. else above its peak with a 4px ground halo, if free. Otherwise none (the Rivers table names it).
- Placement is `placeRiverNames` in `src/core/layout/riverNames.ts`, covered by tests.

## 5. Phone (390)

- Same order of sections; margins 16. h1 32/36. Field fills the row next to "Draw" (262 + 8 + button); the samples
  sentence wraps under. Chart head stacks: title, meta, then a row with folder depth left and the segmented control right.
- **Time runs down the page.** The chart is the desktop layout transposed: cross axis (rivers side by side) spans
  x 50..350, time runs from top to bottom (about 56px per bucket, so the chart is long and the page scrolls through
  history; no horizontal scrolling). Year labels at x 16 (13 muted). Era starts: a 0.5 rule across the full width with
  the era name right-aligned at 374 (13/500 ink, 6px ground halo). River names only where a smoothed run fits the name,
  set along the river reading downward; no other labels on the phone chart (more labels add nothing).
- Tapping a river focuses it; the readout docks to the bottom of the viewport (72px, ground, 0.5 top rule) while a
  river is focused. The Rivers table keeps name | sparkline 100x20 | share.

## 6. Motion

Code: `src/ui/motion.ts`.

Arrive: clip reveal left to right (top to bottom on the phone), 900 ms ease-out, once per load and after choosing a
sample or drawing a repo; era names fade in over the last 250 ms. Focus: fades 250 ms ease-out; the readout changes at
once. Files moved: on focus the dashes of the river's transfers run forward once (600 ms). Switching Modules and
Contributors: crossfade 250 ms. Theme: instant. While a repo loads, the axis line fills left to right with progress.
`prefers-reduced-motion: reduce`: everything instant.

## 7. States and system

Loading: panel with "Reading owner/name: 18 of 51 requests" and a 2px ink progress line on a 0.5 line track.
Errors show their copy and actions (`src/ui/states/copy.ts`) in 0.5-bordered panels with a solid primary and a
0.5-bordered secondary button. Logo: the confluence mark (two streams join, a third leaves; gradient blue 12 ->
blue 9 -> sky `#7ce2fe` on a `#0d2847` rounded square, radius 7 at 32) used for favicon, header and the social card.
Wordmark text "Repo Rivers". Page `<title>`: "owner/name, Repo Rivers" style without middle dots.
