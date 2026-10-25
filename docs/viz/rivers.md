# Visualization spec: rivers (timeline-sankey)

Binding for phase 4 (`src/core/layout/*`, `src/core/palette.ts`) and the phase 5/6/9 renderer. It follows PLAN §3 and §4.4.

> **Since the "Cyanotype" redesign (R1–R7), the drawing follows [docs/redesign/DESIGN.md](../redesign/DESIGN.md).** The geometry here still holds (§3, §5.1–§5.5: scales, clipping, lane order, stacking, ribbons, transfers) and so do the layout tests (§10). What the redesign replaced is marked below and summarised, not repeated: the palette (§4), labels (§5.6), axis and markers (§5.7–§5.8), focus rendering and readout (§6), motion (§7) and the era track (§8). Each deviation is tagged **[DEV-n]** and listed in §11. Every number shown in the chart comes from `RiverView` or `RepoAggregate`. Nothing is hard-coded.

## 1. The question it answers
"Where did the work in this repo happen over time, how did that shift, and when was code moved between parts?" Secondary: "Who carried each era?" (Contributors dimension). It does not try to answer exact per-bucket comparisons; the readout and the table do that.

## 2. Data → visual encoding
| Data (from `RiverView`) | Channel | Notes |
|---|---|---|
| Bucket `i` (time) | x position: column centre `x_i` | Even band scale. Time runs left to right. |
| `river.values[i]` (lines changed or commits) | Vertical thickness at `x_i` | Linear (§3). Value 0 tapers to a point. |
| River identity | Lane position (stable order), **direct label**, highlight on focus | Primary identity channels. |
| River tone | Water A or water B (two blues of different lightness), chosen so neighbours differ | No hue (DESIGN §4). |
| `kind: 'other'` | 45° hatch of water B on the ground, 0.5 water B outline; label `other` | Always the last lane. |
| `bot: true` | A dotted outline in the ground colour; ` bot` after the name unless it ends in `[bot]` | Only when Include bots is on. |
| Transfer `{from,to,bucket,files}` | Dashed water B curve on a ground casing with a 7 px arrowhead; width from files | §5.5. |
| Column total | Stack height (centred, so the stack meanders) | |
| Clipped outlier column | A double-slash break mark through the column + a `↑ 224K` label above it | §3.2 **[DEV-1]**. |
| `source.truncatedBuckets` | A dotted rule under the axis spanning those buckets; readout flag "estimated" | Low-key: most buckets are truncated (Vite 23/27, Svelte 35/41). |
| Partial last bucket (`generatedAt` < its end) | A 0.5 ink dashed vertical line at the cutoff x; the legend says "quarter in progress" and the readout gives the date | §5.8 **[DEV-7]**. The value is not extrapolated. |
| Year boundaries | Year ticks on the axis with the year at each | §5.7. |

## 3. Scales and domains
All geometry is in **CSS pixels at the container's real width**. The SVG uses `viewBox="0 0 W H"` with `width=W` and is never scaled to fit. Phase 3's mobile screenshot shrank the whole viewBox, which made the labels about 5 px tall. That must never happen again.

**3.1 x (band).** The plot spans `[left, right]`, with `w = (right − left) / B` and `x_i = left + (i + 0.5)·w`. Rivers extend as flat half-bucket stubs from `x_0` to `left` and from `x_{B−1}` to `right`, so the drawn extent equals the time extent.

**3.2 Thickness (linear, with outlier clipping) [DEV-1].** `T_i` is the column total over `view.rivers`. The domain `D`:
1. Take the non-zero `T_i`, sorted. Compute `Q1` and `Q3` (linear interpolation, type 7). `fence = Q3 + 3·(Q3 − Q1)` (Tukey far-out).
2. Candidates are the columns with `T_i > fence`. `D0` is the largest non-candidate `T_i`.
3. **Clip** only if there are 1-2 candidates and `max T / D0 ≥ 2.5`. Then `D = D0`. Otherwise `D = max T` (pure linear, as in PLAN).
- `k = (H − g·(R − 1)) / D`. Column factor `c_i = min(1, D / T_i)`. Thickness = `v · k · c_i`. Shares inside a clipped column are preserved, and clipped stacks are drawn exactly as tall as `D`.
- Results on the committed samples: only **Svelte modules, Q1 2019** (index 9, `T` = 223,808, `D` = 50,628, `c` ≈ 0.226) is clipped. Vite and Express contributors have real, non-estimated spikes of 2.0× and 1.5×; they stay below the 2.5× gate and are drawn linearly.
- **Why not sqrt:** it distorts every comparison (2× reads as 1.41×) to fix one column. **Why not cap the estimate:** that is a data change, not a display decision. I recommend a separate follow-up for `git-history-analyst` to bound the truncation extrapolation (§11). The break mark stays useful for genuine spikes, such as vendoring commits.
- The `sqrt` option is kept as PLAN says (unit-tested, off by default). It applies to the column total: `S_i ∝ sqrt(T_i)`, with rivers sharing the column by value, so shares stay exact.

**3.3 Transfer width.** `1 + 5·sqrt(files / maxFiles)` px, where `maxFiles` is taken over the view's transfers (range 1-6 px).

**3.4 Gaps.** `g = 3` px, only between consecutive rivers that are **non-zero in that column**.

## 4. Palette (A2)
**Replaced by the redesign (DESIGN §2, §4).** Rivers carry no hue: each is water A (Radix blue 12) or water B (blue 11), chosen by a greedy two-colouring that minimises the columns where two touching rivers share a tone (`src/core/tones.ts`); "other" is a water B hatch on the ground. The chrome is Radix blue and slate, light and dark (`src/ui/theme/tokens.css`). Tests: both waters ≥ 3:1 against the ground and ≥ 15 L* apart under normal vision and protanopia, deuteranopia and tritanopia simulation; text ≥ 4.5:1 (`tokens.test.ts`). The Okabe-Ito palette and its sticky hue assignment described here before R3 are gone; `palette.ts` keeps the colour science (Machado 2009, CIEDE2000, contrast).

## 5. Layout algorithm (`layoutRivers`)
**5.1 Size.** Desktop: `W` = card width. Since the redesign the plot ends a fixed `labelRoom` (140 px) left of `W` for mouth names, and starts at `top` = 92 under the era band (8 without eras); the axis room below is 44 px. Plot height `H = clamp(320, 0.45·W, 480)`. Phone (viewport ≤ 640 px, redesign R6): the layout is transposed, not scrolled sideways. `layoutRivers` runs with the time axis as `W = 56·B` and the cross axis as `H` = column width − 58 (300 at a 390 page), `inset: 0`, `labelRoom: 0`, `top: 0`, and the phone draws it with time running down the page (`transpose.ts`; docs/redesign/DESIGN.md §5).

**5.2 Lane order.** Stable and deterministic:
1. Sort by onset (first `i` with `v > 0`), then total descending, then id.
2. **Born from a transfer:** if river `r` has incoming transfers with `bucket == onset(r)`, its parent is the source with the most files (ties: the earlier lane). Move `r` to directly below the parent, unless the parent is `other`. Multiple children of one parent are ordered by total descending.
3. `other` goes last.

The data shows this behaves as intended: Vite `packages/vite` ← `src/node`, `packages/playground` ← `playground`; Svelte `documentation` ← `site`, `playgrounds` ← `packages`.

**5.3 Column stacking.** In column `i`, the non-zero lanes stack in lane order with gap `g`. The stack height is `S_i = Σ thickness + g·(n_i − 1)`. It is centred: `top_i = top + (H − S_i)/2`. A zero-valued river sits as a point at the middle of the gap between its nearest non-zero neighbours, or on the stack edge if there is no neighbour on that side.

**5.4 Ribbons.** Each river is one `<path>` made of one closed subpath per maximal run of non-zero columns. Each run starts at the zero column before it (a point, the "spring") and ends at the zero column after it (the "mouth"), or at a flat stub at the plot edge. Each edge segment from `(x_a, y_a)` to `(x_b, y_b)` is `C m,y_a m,y_b x_b,y_b` with `m = (x_a + x_b)/2`: timeline-sankey "solution 2", horizontal tangents. Coordinates are rounded to 0.1 px.

**5.5 Transfers [DEV-2, DEV-3].**
- A transfer in bucket `b` runs from the source at `x_{b−1}` to the target at `x_b`. For `b = 0` it runs from `x_0` to `x_1`. Reason: in the data, a move's target already has weight in bucket `b` itself (onset == transfer bucket in all 4 born-from-transfer cases), so PLAN's `t → t+1` would land one bucket after the birth.
- Each endpoint sits on the edge that faces the other river (the bottom edge if the other lane is below). On a zero-valued end, it sits on the point.
- The curve uses the same mid-x cubic. It is drawn above the rivers: a background-colour halo (width + 2 px), then the ink stroke with `stroke-dasharray: 6 4` and a fixed 7 px filled-ink arrowhead (`markerUnits="userSpaceOnUse"`).
- **Always visible** if `files ≥ 3` **and** the transfer carries ≥ 5% of that bucket's moved files. Otherwise it is shown only while its source or target is active.
- From the data: Vite shows 5 always-visible transfers (`playground→packages/playground` 16, `other→packages/playground` 3, `other→packages/create-vite` 122, `playground→packages/vite` 11, `other→docs/.vitepress` 7). Svelte shows 2 (`site→documentation` 6, `packages→playgrounds` 10).

**5.6 Labels [DEV-4, DEV-5].**
**Replaced by the redesign (DESIGN §4, R4).** River names are 13 px italic 500 in Alegreya Sans, measured with the loaded font, and placed by `placeRiverNames` (`src/core/layout/riverNames.ts`): along the river's course where a smoothed run holds the name, else level at its widest, else at its mouth right of the plot with a leader, else above its peak with a ground halo, else not at all (the Rivers table names it). Names never overlap each other, the transfers or the break marks. On the phone (R6) names appear only along a run, reading downward.

**5.7 Axis.**
**Replaced by the redesign (DESIGN §4).** A 0.5 rule 8 px below the plot with a year tick and year label (13 px, muted) at each year start; the first bucket's year only if the next label is at least 3 buckets away; no graticule (the era rules are the only verticals). Estimated runs are an ink dotted line on the axis; the partial bucket is a 0.5 dashed vertical line. `layoutRivers` still takes `asOf` and `truncatedBuckets` **[DEV-7]**.

## 6. Interaction (phase 6; state `{river, bucket, pinned}`)
**Focus model.** The chart is a single tab stop: `<g tabindex="0" role="application" aria-roledescription="river chart">`. The prose summary is linked through `aria-describedby`.

**Pointer.**
- `bucket = clamp(floor((x − left)/w), 0, B−1)`.
- `river` = the band under the pointer, using the interpolated edges at the pointer's x. Bands thinner than 8 px get an 8 px hit zone; the nearest wins. If there is no band, `river = null` and the cursor still shows the column.
- Hover is ignored while pinned.
- Clicking a river pins it. Clicking the pinned river again, or clicking the background, unpins it.
- Touch: tap = pin.

**Keyboard (A3).**

| Key | Action |
|---|---|
| Focus in, empty state | `river` = largest by total, `bucket` = its peak |
| ↑ / ↓ | Previous/next lane (stops at the ends; zero-valued rivers are included and read as "no changes") |
| ← / → | Bucket −1 / +1 |
| Home / End | Bucket 0 / B−1 |
| Enter / Space | Toggle pinned |
| Esc | Unpin; if not pinned, clear (focus stays) |

Keyboard state survives the pointer leaving the chart.

**Active rendering and readout.** **Replaced by the redesign (DESIGN §4).** The focused river keeps full strength in water A; the others and their names fade (18 %, names 45 %) in 250 ms ease-out; its transfers turn ink and run their dashes forward once. A 0.5 ink rule marks the bucket and a dot sits on the river. The readout under the chart is a sentence, for example "*packages*, Q2 2023: **7,732** lines changed, 21% of the quarter. 952 files moved in from *test*."; the estimate, partial and clipped caveats are drawn as marks and spoken by the live region only. The idle readout names the largest river and the files moved. No middle dots anywhere.

## 7. Motion
**Replaced by the redesign (DESIGN §6, R7; `src/ui/motion.ts`).** Arrive: a clip reveal left to right (top to bottom on the phone), 900 ms ease-out, once per load and after choosing a sample or drawing a repo, with the era rules and names fading in over the last 250 ms. Focus: fades 250 ms ease-out, the readout changes at once, the focused river's dashes run forward once (600 ms). A view switch (Modules or Contributors, depth, bots) crossfades in 250 ms, with no path morphing. Theme: instant. While a repo loads, the progress line fills with each step. Reduced motion: everything instant. Nothing loops.

`performance.mark('rivers-rendered')` fires after the first paint of the paths, not at the end of the reveal.

## 8. Era track (phase 9)
**Replaced by the redesign (DESIGN §4, R3).** An 84 px band above the plot: every era has a 0.5 rule at its start from the band to the axis, its name (16 px, 500) on the rule wrapped to at most two lines inside the era's width, and its range ("Q2 2020 to Q1 2021", 13 px muted) under it. Each era is a button over its name, in tab order after the chart; hover or focus bands its span and puts its note in the readout. When any name is by AI, the legend says so and each era button's name ends with "named by AI". The Eras section under the Rivers table lists every era. On the phone each era starts with a rule across the chart and its name on the right.

## 9. States
- **Default:** a sample is always drawn; there is never an empty first view.
- **Loading** (P8, restyled in R2): a 0.5-bordered panel, "Reading owner/name: n of m requests", a 2 px ink line filling a 0.5 track, and Cancel, with `aria-busy="true"` on the chart frame. No fake rivers.
- **Empty selection** (`R = 0`, for example contributors who are all bots with bots hidden): a centred message in the plot area at the same card height, "No {metric} to draw for this selection", with one action ("Include bots" or "Show modules").
- **Single river:** drawn as normal, centred, with an inside label.
- **Error:** the card keeps its height and shows the §3 error copy; the sample links stay usable.
- **No eras:** the chart has no era band.

## 10. Acceptance criteria
**Layout (P4 Vitest).** These use the committed samples and `demo.json` at `W = 1104`, `H = 440`.
- **L1** For every river and column, `|thickness − v·k·c_i| ≤ 0.5` px, with `c_i = 1` in unclipped columns.
- **L2** `S_i ≤ H + 0.5` in every column. Every stack is centred: `|top_i + S_i/2 − (top + H/2)| ≤ 0.5`.
- **L3** Consecutive non-zero rivers are `3 ± 0.1` px apart. A zero river has thickness ≤ 0.01 (it tapers to a point).
- **L4** Path strings have no `NaN` or `Infinity`. Every subpath is closed. All points lie within `[left, right] × [top, top + H]`.
- **L5** Every ribbon cubic has both control points at mid-x, at the y of their own endpoints.
- **L6** Outliers:
  - Svelte modules: exactly one clipped column, index 9; `D` = 50,628; `c_9` = 0.226 ± 0.001.
  - Vite modules and contributors, Svelte contributors, Express modules and contributors: none clipped.
  - Synthetic `[10,10,10,10,100]` is clipped; `[10,12,11,25]` is not.
  - The `sqrt` option keeps shares exact.
- **L7** Lane order:
  - Deterministic: the same input twice gives the same order.
  - `other` is last.
  - Vite: `packages/vite` sits directly after `src/node`, and `packages/playground` directly after `playground`.
  - Svelte: `documentation` sits directly after `site`, and `playgrounds` directly after `packages`.
- **L8** Transfers:
  - Endpoints are at `x_{b−1}` and `x_b` (±0.1 px) and within 0.5 px of the facing edge.
  - Width is in [1, 6], and the widest transfer is the one with the most files.
  - The always-visible sets are exactly Vite's 5 and Svelte's 2 listed in §5.5.
- **L9** Labels:
  - Placed boxes are pairwise disjoint with a 2 px margin.
  - Each inside label lies within its band with 2 px padding at 2 px samples.
  - placed ∪ `dropped` = all rivers, and they are disjoint.
  - Desktop: the top 3 rivers by total are labelled in every sample, and ≥ 5 rivers are labelled for each sample in the modules dimension.
  - Phone (transposed, R6): names only where a smoothed run holds them (`placeRiverNames` with `phone`), straight along time so they read downward; the rest are named by the Rivers table.
- **L10** Tones (since R3, `tones.test.ts`): at most half of the columns where two rivers touch have them in the same water; "other" is hatched.
- **L11** Partial marker: `asOf` falls inside the last bucket, and the marker x is inside `[x_{B−1} − w/2, x_{B−1} + w/2]`.
- **L12** Performance: 48 × 13 including labels runs in < 50 ms.
- **L13** A snapshot of the `demo.json` path strings.

**Palette (P4 Vitest).**
- **C1** Since R3: water A and water B differ by ≥ 15 L* and ΔE2000 ≥ 10 under normal vision, protanopia, deuteranopia and tritanopia (Machado 2009 severity 1.0, linear RGB), in both themes (`tokens.test.ts`).
- **C2** Every fill is ≥ 3:1 against its background. Ink and secondary text are ≥ 4.5:1. The focus ring is ≥ 3:1.
- **C3** Checker sanity:
  - CIEDE2000 matches the Sharma 2005 test pairs to ±0.0001.
  - The §4 minima are reproduced to ±0.2.

**Screenshots (P5 / P6 / P9 checks and designer review).**
- **S1** Desktop 1280: no visible label overlap; the top 3 rivers are labelled; no label extends outside its band.
- **S2** Svelte: a break mark and `↑ 224K` at Q1 2019, and the pre-2019 rivers visibly thick (at least one non-clipped column reaches full plot height).
- **S3** Dashed, arrowed transfers are visible: Svelte `site→documentation`; Vite `playground→packages/playground`.
- **S4** Mobile 390 (since R6): the chart runs down the page with no horizontal scroll; names are ≥ 12 px, read downward and never overlap.
- **S5** CVD screenshots: the hatch, the labels and the dotted bot outline are all still visible.
- **S6** Reduced motion: fully drawn at t = 50 ms.
- **S7** Dark theme uses the dark palette. The dotted estimated rule and the partial marker are present.
- **S8 (P6)** Hover gives a computed opacity of 0.18 on the others and water A on the active river. The readout matches the §6 sentence, and its numbers equal the view model.
- **S9 (P9)** Era rules are within ±1 px of bucket boundaries. The chart's top y is identical before and after the AI swap.

## 11. Deviations from PLAN (for DECISIONS.md)
- **DEV-1** Outlier clipping with a break mark, using a Tukey far fence gated at 2-or-fewer outliers and ≥ 2.5× (PLAN: linear with an optional sqrt). The Svelte Q1 2019 estimate is 16.7× the median and flattens every other column. Follow-up for `git-history-analyst`: bound the truncated-bucket extrapolation in the data.
- **DEV-2** Transfers span `x_{b−1} → x_b` (PLAN: `t → t+1`), because the target's onset equals the transfer bucket in the data.
- **DEV-3** The visibility rule adds `files ≥ 3` (PLAN: ≥ 5% only), because 1-file moves alone in a bucket counted as 100% and added noise.
- **DEV-4** Labels are 12 px mono with an 18 px minimum inside thickness (PLAN: 14 px threshold; type scale minimum 14). This applies to data labels only.
- **DEV-5** Label candidates are inside / end gutter / stack edge / dropped, with mobile labels repeating every 360 px (PLAN: peak, else outside at the last non-zero column; labels stay at the peak on mobile). A label "outside at a mouth" lands on top of other rivers.
- **DEV-6** Concrete palette: light theme in earth tones within the Okabe-Ito hue families. `other` uses a grey base with a background-colour hatch, because "ink at 30%" measures 1.6:1 and fails A2.
- **DEV-7** `layoutRivers` gets extra inputs `asOf` and `truncatedBuckets`, and returns `clipped[]` and `partial` markers. Optional: add `River.members` so `other` can read "other · 34 smaller modules".
- **DEV-8** Render at real CSS-pixel width (no viewBox scaling). PLAN does not say this, but phase-3's mobile screenshot shows why it is needed.
