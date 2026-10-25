# Visualization spec: rivers (timeline-sankey)

Binding for phase 4 (`src/core/layout/*`, `src/core/palette.ts`) and the phase 5/6/9 renderer. It follows PLAN §3 and §4.4. Each deviation is tagged **[DEV-n]** and listed in §11. Every number shown in the chart comes from `RiverView` or `RepoAggregate`. Nothing is hard-coded.

## 1. The question it answers
"Where did the work in this repo happen over time, how did that shift, and when was code moved between parts?" Secondary: "Who carried each era?" (Contributors dimension). It does not try to answer exact per-bucket comparisons; the readout and the table do that.

## 2. Data → visual encoding
| Data (from `RiverView`) | Channel | Notes |
|---|---|---|
| Bucket `i` (time) | x position: column centre `x_i` | Even band scale. Time runs left to right. |
| `river.values[i]` (lines changed or commits) | Vertical thickness at `x_i` | Linear (§3). Value 0 tapers to a point. |
| River identity | Lane position (stable order), **direct label**, highlight on focus | Primary identity channels. |
| River identity (secondary) | Fill hue | Never the only cue (A1). |
| `kind: 'other'` | Neutral grey fill + 45° hatch in the background colour; label `other` | Always the last lane. |
| `bot: true` | Its hue + a 1.5 px dotted ink outline; label suffix ` · bot` | Only when Include bots is on. |
| Transfer `{from,to,bucket,files}` | Dashed ink curve with an arrowhead; stroke width = files | §5.5. |
| Column total | Stack height (centred, so the stack meanders) | |
| Clipped outlier column | A double-slash break mark through the column + a `↑ 224K` mono label above it | §3.2 **[DEV-1]**. |
| `source.truncatedBuckets` | A dotted rule under the axis spanning those buckets; readout flag "estimated" | Low-key: most buckets are truncated (Vite 23/27, Svelte 35/41). |
| Partial last bucket (`generatedAt` < its end) | A dashed vertical "survey line" at the cutoff x + a mono label `to 20 Oct 2026` | §5.8 **[DEV-7]**. The value is not extrapolated. |
| Year boundaries | Graticule lines ("meridians") + year labels | §5.7. |

## 3. Scales and domains
All geometry is in **CSS pixels at the container's real width**. The SVG uses `viewBox="0 0 W H"` with `width=W` and is never scaled to fit. Phase 3's mobile screenshot shrank the whole viewBox, which made the labels about 5 px tall. That must never happen again.

**3.1 x (band).** The plot spans `[left, right]`, with `w = (right − left) / B` and `x_i = left + (i + 0.5)·w`. Rivers extend as flat half-bucket stubs from `x_0` to `left` and from `x_{B−1}` to `right`, so the drawn extent equals the time extent.

**3.2 Thickness (linear, with outlier clipping) [DEV-1].** `T_i` is the column total over `view.rivers`. The domain `D`:
1. Take the non-zero `T_i`, sorted. Compute `Q1` and `Q3` (linear interpolation, type 7). `fence = Q3 + 3·(Q3 − Q1)` (Tukey far-out).
2. Candidates are the columns with `T_i > fence`. `D0` is the largest non-candidate `T_i`.
3. **Clip** only if there are 1-2 candidates and `max T / D0 ≥ 2.5`. Then `D = D0`. Otherwise `D = max T` (pure linear, as in PLAN).
- `k = (H − g·(R − 1)) / D`. Column factor `c_i = min(1, D / T_i)`. Thickness = `v · k · c_i`. Shares inside a clipped column are preserved, and clipped stacks are drawn exactly as tall as `D`.
- Results on the committed samples: only **Svelte · modules · Q1 2019** (index 9, `T` = 223,808, `D` = 50,628, `c` ≈ 0.226) is clipped. Vite and Express contributors have real, non-estimated spikes of 2.0× and 1.5×; they stay below the 2.5× gate and are drawn linearly.
- **Why not sqrt:** it distorts every comparison (2× reads as 1.41×) to fix one column. **Why not cap the estimate:** that is a data change, not a display decision. I recommend a separate follow-up for `git-history-analyst` to bound the truncation extrapolation (§11). The break mark stays useful for genuine spikes, such as vendoring commits.
- The `sqrt` option is kept as PLAN says (unit-tested, off by default). It applies to the column total: `S_i ∝ sqrt(T_i)`, with rivers sharing the column by value, so shares stay exact.

**3.3 Transfer width.** `1 + 5·sqrt(files / maxFiles)` px, where `maxFiles` is taken over the view's transfers (range 1-6 px).

**3.4 Gaps.** `g = 3` px, only between consecutive rivers that are **non-zero in that column**.

## 4. Palette (A2)
Okabe-Ito hue families. Lightness and chroma were tuned per theme by a constrained search (hue ±10° of Okabe-Ito). The light set moves toward earth tones (umber, terracotta, olive-ochre), which is the only way every fill clears 3:1 on paper **[DEV-6]**.

| # | Name | Light (paper `#F5F1E8`) | Dark (night `#10161F`) |
|---|---|---|---|
| 0 | orange / umber | `#704C01` | `#E0AE60` |
| 1 | sky blue | `#0390CE` | `#97D5FB` |
| 2 | bluish green | `#048A5F` | `#3CC494` |
| 3 | yellow / ochre | `#928A02` | `#E4D50C` |
| 4 | blue | `#0B67AB` | `#0698F4` |
| 5 | vermillion / terracotta | `#9E5D3E` | `#E36A1C` |
| 6 | reddish purple | `#BE6C9A` | `#D27FAD` |
| 7 | deep teal | `#00595C` | `#468E8C` |
| other | grey base (+ hatch) | `#6C7178` | `#61676D` |

These were measured with my prototype checker (Machado 2009 in **linear** sRGB, clamped to [0,1], then CIEDE2000):
- Min ΔE over **all** 36 pairs, light: normal 15.8, protanopia 10.3, deuteranopia 10.3, tritanopia 10.4.
- Min ΔE over all 36 pairs, dark: 17.9 / 10.7 / 10.4 / 10.5.
- Fill contrast, light: 3.17-7.21:1. Dark: 3.17-11.95:1.

Every pair passes, so "pairs that can be adjacent" = all pairs. This matters because zero-valued lanes can make any two lanes touch. Apply the matrices to **linear** RGB: applying them in gamma space drops light-theme deuteranopia to 7.0, which fails.

Text tokens are unchanged from §3: ink 14.0:1 and secondary 6.4:1 on paper; 14.3:1 and 8.2:1 on night.

PLAN's "other = ink at 30%" measures only 1.6:1 on paper, which fails, hence the grey base **[DEV-6]**. The hatch is drawn in the background colour: 1.5 px lines, 6 px period, 45°, `patternUnits="userSpaceOnUse"`.

**Assignment.** Rivers are coloured greedily in lane order. The preferred hue is `lane mod 8`. Skip any hue already used by a river that is **co-adjacent** to this one: consecutive among the non-zero lanes in any column. Sticky rule: on re-layout (dimension, depth or bots change), a surviving river id keeps its previous hue if that causes no co-adjacency conflict. "other" is always grey.

## 5. Layout algorithm (`layoutRivers`)
**5.1 Size.** Desktop: `W` = card width. The right gutter is `min(180, widest gutter label + 24)`, or 0 if there are no gutter labels. Bottom axis 28 px, top 8 px. Plot height `H = clamp(320, 0.45·W, 480)`. Phone (viewport ≤ 640 px, redesign R6): the layout is transposed, not scrolled sideways. `layoutRivers` runs with the time axis as `W = 56·B` and the cross axis as `H` = column width − 58 (300 at a 390 page), `inset: 0`, `labelRoom: 0`, `top: 0`, and the phone draws it with time running down the page (`transpose.ts`; docs/redesign/DESIGN.md §5).

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
- Labels are mono, 12 px (never smaller, in CSS px), ink fill with a 3 px background-colour halo (`paint-order: stroke`).
- Box = measured width × 14 px. Core uses an injected `measure(text)`, defaulting to `7.4 px × chars`. Text longer than 26 characters gets a middle ellipsis (`packages/…/create-vite`); the full text appears in the readout and the table.
- Rivers are placed in order of total, descending; `other` goes last. Each river tries these candidates in order:
  1. **Inside.** Slide the box along the river's x-range in steps of `w/2`. It fits if, at samples every 2 px across the box, the band contains the box with 2 px padding. That means a thickness of at least **18 px** (PLAN said 14; 14 px only fits a 10 px font). Choose the position with the largest minimum clearance; break ties by nearest to the peak column.
  2. **End gutter.** Only for rivers with `v_{B−1} > 0`. Place the label at `x = right + 8` at the river's centre y in the last column, with a 1 px leader line in secondary ink.
  3. **Stack edge.** If the river is the top-most (or bottom-most) non-zero lane at its peak column, place the label 4 px above (or below) the stack there.
  4. **Dropped.** The id goes into `labels.dropped`.
- Gutter labels are then dodged: sort by desired y, sweep with a 16 px minimum pitch inside `[top, top + H]`. If they still overflow, drop the lowest-total gutter label and repeat.
- Every placed box is disjoint from every other box, the break-mark labels and the partial label, with a 2 px margin.
- **Mobile (≤ 640 px):** superseded by the redesign (docs/redesign/DESIGN.md §5, R6): the phone chart is this layout transposed, time running down the page, with names only where a smoothed run fits them (`placeRiverNames` with `phone`).

**5.7 Axis.**
- Year graticule lines (1 px, graticule colour, full plot height) at year starts, at `left + j·w`.
- Year labels: mono 12 px, secondary ink, centred in each year span. Thin them to every 2nd, 5th or 10th year so that labels are ≥ 48 px apart.
- With the year unit (Express), each bucket is labelled when `w ≥ 40`.

**5.8 Partial and estimated markers [DEV-7].**
- `layoutRivers` takes `asOf` (from `generatedAt`) and `truncatedBuckets`.
- Cutoff x = bucket start + fraction × `w`.
- The dotted rule (2 px dots, secondary ink) runs 3 px below the axis line across each run of truncated buckets. The label `estimated` appears at the first run if 70 px are free.

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

**Active rendering.**
- The active river is drawn at opacity 1 with a 1.5 px ink outline. This is the non-colour cue.
- All other rivers and their labels drop to **0.18**.
- All of the active river's transfers are shown. Other transfers drop to 0.18.
- A dropped label floats above the band at the active bucket, with a halo.
- Bucket cursor: a 1 px ink line at 0.6 opacity at `x_bucket`, plus the bucket label boxed on the axis.
- Focus ring: a 2 px ink rect around the plot with a 2 px offset (`:focus-visible`, 14:1).

**Readout** (aria-live polite; announced after 150 ms without changes):
- Main line: `{label} · {bucket.label} · {value} {metric} · {share}% of the {unit}`, for example, from the Vite sample: `packages/vite · Q2 2023 · 4,811 lines changed · 56% of the quarter · estimated (GitHub listed only 300 files)`.
- Share = `round(100·v/T_i)`; values under 0.5% show as `<1%`. When `v = 0`, the line reads `no {metric} this {unit}`.
- Flags are appended in this order:
  - ` · estimated (GitHub listed only 300 files)`
  - ` · partial {unit}, to 20 Oct`
  - ` · column clipped, drawn at 23% scale`
  - ` · {n} files moved in from {src}` / ` · {n} files moved out to {dst}`
  - ` · bot`
- Idle state: `{owner/name} · {first}–{last} · {B} {unit}s · {R} rivers by {metric}. Hover, tap or Tab into the chart.`
- Numbers use `Intl.NumberFormat('en')`.

## 7. Motion
| What | Spec | Reduced motion |
|---|---|---|
| Reveal | `clip-path: inset(0 100% 0 0)` → `inset(0)` on the rivers, transfers and labels group; 700 ms `cubic-bezier(.22,1,.36,1)`; once per dataset (not on resize, dimension, depth or bots) | None: drawn on first paint |
| Dim/highlight | Opacity over 120 ms ease-out | 0 ms |
| Dimension or depth change | Cross-fade old → new layout over 180 ms; no path morphing | 0 ms |
| Transfers, era track | Static dashes, no marching ants, nothing loops | Same |

`performance.mark('rivers-rendered')` fires after the first paint of the paths, not at the end of the reveal.

## 8. Era track (phase 9)
- The track sits directly above the chart card and shares its x scale (same `left` and `w`). On mobile it is inside the same scroll region.
- Its height is reserved **before** the eras arrive: 48 px, or 72 px if any bracket is narrower than 200 px. Bracket widths depend only on the deterministic segments, so swapping in AI names never shifts the layout.
- Era `{start, end}` (end bucket inclusive) spans `left + start·w` to `left + (end+1)·w`, inset 3 px at each end, which leaves a 6 px gap between brackets.
- Bracket: a 1 px secondary-ink line at y = 40 with 6 px down-ticks at both ends.
- Title: Fraunces italic 16 px (14 px on mobile), ink, baseline y = 32, starting at bracket start + 4. Titles are truncated with an ellipsis to the bracket width − 8. If any bracket is narrower than 200 px, titles alternate rows: even eras on row 1 (y = 32), odd eras on row 2 (y = 58), and each title may run to the start of the next same-row bracket (era i+2), or the track end, − 8.
- In the chart: odd-indexed eras get a background band of ink at 4% opacity behind the rivers (8% when that era is focused or hovered).
- Each era is a `<button>` in tab order after the chart. Focus or hover underlines the title and sets the readout to `{title} · {first}–{last} · {note}`. While an era is active and nothing is pinned, the chart shows its neutral state (no dimming, no cursor).
- `named by AI` (mono 12 px, secondary ink) appears once at the right end of the track, only if any era has `source === 'ai'`.

## 9. States
- **Default:** a sample is always drawn; there is never an empty first view.
- **Loading** (P8): the previous chart stays at 0.35 opacity with `aria-busy="true"`, and the progress line sits above the card. With no previous chart, the plot area shows only the graticule skeleton. No fake rivers.
- **Empty selection** (`R = 0`, for example contributors who are all bots with bots hidden): a centred message in the plot area at the same card height, "No {metric} to draw for this selection", with one action ("Include bots" or "Show modules").
- **Single river:** drawn as normal, centred, with an inside label.
- **Error:** the card keeps its height and shows the §3 error copy; the sample chips stay usable.
- **No eras:** the track keeps its reserved height and is blank.

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
- **L10** Colour:
  - No two consecutive non-zero lanes in any column share a hue.
  - `other` is grey.
  - Hues are sticky across a depth change when there is no conflict.
- **L11** Partial marker: `asOf` falls inside the last bucket, and the marker x is inside `[x_{B−1} − w/2, x_{B−1} + w/2]`.
- **L12** Performance: 48 × 13 including labels runs in < 50 ms.
- **L13** A snapshot of the `demo.json` path strings.

**Palette (P4 Vitest).**
- **C1** All 36 pairs (8 hues + grey) have ΔE2000 ≥ 8 under normal vision, protanopia, deuteranopia and tritanopia (Machado 2009 severity 1.0, linear RGB), in both themes.
- **C2** Every fill is ≥ 3:1 against its background. Ink and secondary text are ≥ 4.5:1. The focus ring is ≥ 3:1.
- **C3** Checker sanity:
  - CIEDE2000 matches the Sharma 2005 test pairs to ±0.0001.
  - The §4 minima are reproduced to ±0.2.

**Screenshots (P5 / P6 / P9 checks and designer review).**
- **S1** Desktop 1280: no visible label overlap; the top 3 rivers are labelled; no label extends outside its band.
- **S2** Svelte: a break mark and `↑ 224K` at Q1 2019, and the pre-2019 rivers visibly thick (at least one non-clipped column reaches full plot height).
- **S3** Dashed, arrowed transfers are visible: Svelte `site→documentation`; Vite `playground→packages/playground`.
- **S4** Mobile 390: label computed font-size ≥ 12 px; the region scrolls; the caption is visible; ≥ 2 labels are in the first viewport.
- **S5** CVD screenshots: the hatch, the labels and the dotted bot outline are all still visible.
- **S6** Reduced motion: fully drawn at t = 50 ms.
- **S7** Dark theme uses the dark palette. The dotted estimated rule and the partial marker are present.
- **S8 (P6)** Hover gives a computed opacity of 0.18 on the others and an outline on the active river. The readout matches the §6 template, and its numbers equal the view model.
- **S9 (P9)** Bracket ends are within ±1 px of bucket boundaries (± 3 px inset). The chart's top y is identical before and after the AI swap.

## 11. Deviations from PLAN (for DECISIONS.md)
- **DEV-1** Outlier clipping with a break mark, using a Tukey far fence gated at 2-or-fewer outliers and ≥ 2.5× (PLAN: linear with an optional sqrt). The Svelte Q1 2019 estimate is 16.7× the median and flattens every other column. Follow-up for `git-history-analyst`: bound the truncated-bucket extrapolation in the data.
- **DEV-2** Transfers span `x_{b−1} → x_b` (PLAN: `t → t+1`), because the target's onset equals the transfer bucket in the data.
- **DEV-3** The visibility rule adds `files ≥ 3` (PLAN: ≥ 5% only), because 1-file moves alone in a bucket counted as 100% and added noise.
- **DEV-4** Labels are 12 px mono with an 18 px minimum inside thickness (PLAN: 14 px threshold; type scale minimum 14). This applies to data labels only.
- **DEV-5** Label candidates are inside / end gutter / stack edge / dropped, with mobile labels repeating every 360 px (PLAN: peak, else outside at the last non-zero column; labels stay at the peak on mobile). A label "outside at a mouth" lands on top of other rivers.
- **DEV-6** Concrete palette: light theme in earth tones within the Okabe-Ito hue families. `other` uses a grey base with a background-colour hatch, because "ink at 30%" measures 1.6:1 and fails A2.
- **DEV-7** `layoutRivers` gets extra inputs `asOf` and `truncatedBuckets`, and returns `clipped[]` and `partial` markers. Optional: add `River.members` so `other` can read "other · 34 smaller modules".
- **DEV-8** Render at real CSS-pixel width (no viewBox scaling). PLAN does not say this, but phase-3's mobile screenshot shows why it is needed.
