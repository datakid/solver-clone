# Nadir: a solver app spec for Sonnet 5 to build

Your earlier attempts felt like toys because they copied the shape of something bigger. An Excel grid will always lose to Excel, and a chat window will always lose to real LLMs. What Solver actually does for people is let them describe a decision problem and get an answer. So this app does only that, and does it better. It has no grid. You write the model as short, readable math lines in four cards: **Goal, Decide, Subject to, Given**. As you type, it checks every line against the current values. It solves in a background thread in milliseconds. It connects to Excel both ways: you can paste tables in and copy results out. You can reuse and share everything.

The name is **Nadir**, which means the lowest point. That's what an optimizer looks for, and the icon shows it directly.

How to use this: paste the whole document below into Sonnet, then ask for **one milestone at a time** (section 12). Don't ask for the entire file in one go. Section 13 has the tests. Don't accept a milestone until they pass.

---

## 0. Product definition (read first, never violate)

Nadir is a single-file, offline, vanilla-JavaScript optimization app. You describe what to optimize, which quantities to decide, the rules they must follow, and the data you're given. Nadir finds the best values.

**It is NOT** a spreadsheet, a grid, a chatbot, a notebook, or a charting tool. If a feature pushes toward any of those, drop it.

The core loop must feel instant: **type → live check → ⌘↵ → answer**.

## 1. Hard rules (non-negotiable)

1. One `.html` file. It makes zero network requests: no CDNs, no web fonts, no libraries, no analytics. It must work when opened from `file://`.
2. Vanilla JS (ES2020+), vanilla CSS. No frameworks, no build step.
3. Never call `eval`/`new Function` on raw user text. Only compile code generated from a validated AST (section 5).
4. **All solver loops run in a Web Worker.** The main thread only parses and runs live checks, and it must never freeze. Stop = `worker.terminate()`, then create a fresh worker.
5. No `alert`/`confirm`/`prompt`. Use the in-app toast and dialog components.
6. Colors only come from the CSS custom properties in section 3. No hex values appear anywhere except `:root`, the dark theme block, and the favicon.
7. No emojis in the UI. Icons are inline SVG, 24×24 viewBox, `stroke="currentColor"`, `stroke-width="1.75"`, round caps and joins, no fills, drawn in one consistent geometric style.
8. Never re-render a focused input. Rebuild list DOM only on structural changes (add, remove, reorder). Live status updates change `textContent` or classes on existing elements, found by `data-id`.
9. The default screen shows only the four cards and the results panel. Everything advanced sits behind an "Advanced" disclosure, the settings drawer, or the command palette.
10. All numbers use `font-variant-numeric: tabular-nums` and the `fmt()` function (section 9).
11. Code is organized in the exact section order from section 4, with a banner comment for each section.
12. `?test` in the URL runs the built-in test suite (section 13) and shows pass/fail in a dialog.

## 2. Visual identity

The mood is a calm instrument, like a well-made drafting tool: warm neutrals, one sage-teal accent, and a single amber "found point" highlight used sparingly. The amber appears only on the logo dot and the optimal-result marker.

**Typography.** Sans: `ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, sans-serif`. Mono (all math input and values): `ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace`. Sizes: 12 / 13 / 14 (base) / 16 / 20 / 32 (result hero). Weights: 400, 500, 600 only.

**Shape.** Radii: 8 for inputs and chips, 12 for buttons and rows, 16 for cards, 999 for pills and the primary button. Spacing uses a 4px scale (4, 8, 12, 16, 20, 24, 32). Cards have a 1px border plus a very soft shadow. There are no heavy shadows and no gradients anywhere except the logo.

**Motion.** 160ms `cubic-bezier(.2,.8,.2,1)`. Respect `prefers-reduced-motion`.

**Wordmark.** Lowercase "nadir", 600 weight, letter-spacing −0.01em, next to the 24px icon.

**Card names and microcopy.** The cards are titled Goal, Decide, Subject to, and Given. Titles use a 12px uppercase label with 0.06em letter-spacing, color `--text-3`, followed by a count chip. Copy is short and plain, like "3 rules · all satisfied". Never write "Oops!".

## 3. Tokens (paste exactly)

```css
:root{
  --bg:#F6F7F5; --surface:#FFFFFF; --surface-2:#F0F2EF; --border:#E3E6E1; --border-strong:#CDD3CE;
  --text:#1D2421; --text-2:#5B6660; --text-3:#8E9893;
  --accent:#3F7D6E; --accent-strong:#2F6457; --accent-soft:#E3EFEB; --on-accent:#FFFFFF;
  --found:#E2B26A; --found-soft:#F7EBD6;
  --ok:#4E8A5B; --ok-soft:#E4F0E6; --warn:#B7873A; --warn-soft:#F5ECDB;
  --bad:#B45A55; --bad-soft:#F5E3E1; --info:#5A74A8; --info-soft:#E4E9F3;
  --shadow:0 1px 2px rgba(20,30,25,.04),0 4px 16px rgba(20,30,25,.05);
  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-pill:999px;
  --ease:cubic-bezier(.2,.8,.2,1); --dur:160ms;
  --font:ui-sans-serif,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Consolas,monospace;
}
[data-theme="dark"]{
  --bg:#121614; --surface:#181D1B; --surface-2:#1F2522; --border:#2A322E; --border-strong:#3A443F;
  --text:#E6EBE8; --text-2:#A3AEA8; --text-3:#6F7A74;
  --accent:#7CC0AE; --accent-strong:#9AD3C3; --accent-soft:#1F3530; --on-accent:#0F1412;
  --found:#E9BF7E; --found-soft:#3A3122;
  --ok:#7DB889; --ok-soft:#1E3024; --warn:#D9AE63; --warn-soft:#352C1C;
  --bad:#D98580; --bad-soft:#3A2321; --info:#8FA6D6; --info-soft:#222B3B;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);
}
```

Theme options are System, Light, and Dark. System follows `prefers-color-scheme`. Focus ring: `outline:2px solid var(--accent); outline-offset:2px` on `:focus-visible` only.

**Favicon and logo.** The icon is a valley curve with the found point at its bottom. Use this exact SVG, inline in the header at 24px and as the favicon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4E9483"/><stop offset="1" stop-color="#2F6457"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <path d="M12 18C22 18 24 46 32 46S42 18 52 18" fill="none" stroke="#F4F8F6" stroke-width="5" stroke-linecap="round"/>
  <circle cx="32" cy="46" r="6" fill="#E2B26A" stroke="#2F6457" stroke-width="2"/>
</svg>
```

Favicon tag (note that `#` is encoded as `%23`):

```html
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234E9483'/%3E%3Cstop offset='1' stop-color='%232F6457'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='16' fill='url(%23g)'/%3E%3Cpath d='M12 18C22 18 24 46 32 46S42 18 52 18' fill='none' stroke='%23F4F8F6' stroke-width='5' stroke-linecap='round'/%3E%3Ccircle cx='32' cy='46' r='6' fill='%23E2B26A' stroke='%232F6457' stroke-width='2'/%3E%3C/svg%3E">
<meta name="theme-color" content="#3F7D6E">
```

## 4. File architecture (exact order)

```
<head>  meta, title "Nadir — Solver", favicon, <style>
        CSS order: tokens → reset/base → primitives (button, input, chip, pill, kbd,
        segmented, switch) → components (card, row, dropdown, drawer, dialog, toast,
        palette) → layout → responsive → print
<body>  static app shell (header, #model column, #results column, drawer/dialog roots)
<script id="engine-src" type="text/plain">   ENGINE (pure, no DOM)
   Lexer · Parser · Analyzer(shapes) · Scalarizer(IR) · Linearizer · Codegen(value+grad)
   Simplex · BranchBound · ALM+LBFGS · DiffEvolution · Diagnose · solve()
   + worker bootstrap guarded by `if (typeof window === 'undefined')`
</script>
<script>  APP
   Boot (Engine = new Function(src+';return Engine;')(); worker = Blob URL of same src)
   Store (state, subscribe, persistence, undo) · WorkerHost · Live (debounced check)
   UI: Header · GoalCard · DecideCard · RulesCard · GivenCard · ResultsPanel · Drawer
       · Palette · Autocomplete · Toast · Dialog
   IO (export/import/share) · Templates · Shortcuts · Tests
</script>
```

The engine source is shared: the main thread uses it for parsing and live checks, and the worker uses the same code for solving. The engine must never touch `document` or `window`.

## 5. The modeling language

The language is small, readable, and vectorized. It needs no loops, and that's the main reason it beats spreadsheet formulas.

**Values** can be scalars, vectors (length n), or matrices (r×c). Nothing goes above 2D.

**Literals:**
- Numbers: `12`, `3.5`, `1e6`.
- Percentages: `7%` becomes 0.07.
- Vectors: `[1,2,3]`.
- Matrices: `[[1,2],[3,4]]`.
- Ranges: `1..5` becomes a vector.

**Operators by precedence:** unary `-`, then `^` (right-assoc), then `* /`, then `+ -`. All operators work elementwise. A scalar broadcasts to any shape. Otherwise the shapes must match exactly, or the analyzer reports an error.

**Indexing** is 1-based: `x[2]`, `ship[1,3]`, slices `x[2..4]`, `ship[1,:]` (a row), `ship[:,2]` (a column).

**Functions.** Aggregates return a scalar:

| Function | Meaning |
|---|---|
| `sum` | Sum of all elements |
| `prod` | Product of all elements |
| `mean` | Average |
| `min`, `max` | With 1 argument: aggregate. With 2+ arguments: elementwise |
| `len` | Number of elements |
| `dot(a,b)` | Dot product |
| `quad(x,Q)` | xᵀQx |

Shape functions: `rowsum(M)` (vector of length r), `colsum(M)` (vector of length c), `matmul(A,x)`, `T(M)` (transpose).

Math functions: `abs, sqrt, exp, log, ln, sin, cos, tan, pow, round, floor, ceil, if(cond, a, b)`. Conditions inside `if` may use `< > <= >=`.

**Comments:** `#` to end of line.

**Constraint lines** have the form `[label:] expr OP expr [OP expr]`, where OP is one of `<= >= = == ≤ ≥`. Chained forms like `10 <= x + y <= 20` are allowed. A vector or matrix constraint expands to one scalar constraint per element. The UI shows this as "expands to 3".

**Pipeline** (each stage has its own function and unit tests):
1. **Lexer** turns text into tokens with `{type, value, start, end}`. Positions are used for error carets.
2. **Pratt parser** turns tokens into an AST. Node types: `Num, Name, Vec, Mat, Range, Index, Unary, Binary, Call, Compare`.
3. **Analyzer** resolves each name to a variable, parameter, or function and computes each node's shape. Errors look like `{message, start, end}`. Example: "Unknown name 'profti'. Did you mean 'profit'?" (Levenshtein ≤ 2). Parameters may reference earlier parameters. Circular references are an error.
4. **Scalarizer** expands everything into scalar IR nodes over a flat `Float64Array v` of all decision variables. Vector variables occupy contiguous slots. Parameters fold to constants, and constant subtrees fold. Cap the result at 300,000 IR nodes and show a clear error beyond that.
5. **Linearizer** tries to turn each scalar IR expression into `{coef: Map<slot,number>, c: number}`. It fails (the expression is nonlinear) on: a product of two non-constants, division by a non-constant, `^` with a non-constant base and exponent ≠ 1, or any math function applied to a non-constant. This gives **exact** linearity detection with no numeric guessing.
6. **Codegen** emits JS source from the IR: assign temporaries `t0…tk` in the forward pass, then a reverse-mode gradient pass with `g_k` adjoints. Derivative rules:
   - `a+b` → both adjoints += g
   - `a*b` → ga += g·b, gb += g·a
   - `a/b` → ga += g/b, gb −= g·a/b²
   - `a^c` → g·c·a^(c−1)
   - `exp` → g·e
   - `log` → g/a
   - `sqrt` → g/(2·s)
   - `sin` → g·cos, `cos` → −g·sin
   - `abs` → g·sign(a)
   - `min`/`max` → the adjoint goes to the argument that won
   - `round`/`floor`/`ceil`/`if` → 0, and the expression is marked **nonsmooth**

   Compile with `new Function('v','g', src)`. The function returns the value and fills `g`. This one AST-validated compile step is the only use of `new Function`.

## 6. Data model (the JSON that's saved, shared, and exported)

```json
{
  "format": "nadir", "version": 1, "id": "m_k3j2", "name": "Product mix", "notes": "",
  "goal": { "sense": "max", "expr": "sum(profit * make)", "target": null },
  "variables": [
    { "id":"v1", "name":"make", "shape":[3], "type":"int", "lower":"0", "upper":"", "init":"0",
      "labels":["Chairs","Tables","Desks"] }
  ],
  "constraints": [
    { "id":"c1", "label":"Wood", "expr":"sum(wood * make) <= woodStock", "enabled":true }
  ],
  "parameters": [
    { "id":"p1", "name":"profit", "expr":"[45, 80, 60]", "slider":null },
    { "id":"p2", "name":"woodStock", "expr":"400", "slider":{"min":0,"max":1000,"step":10} }
  ],
  "settings": { "preset":"balanced" },
  "scenarios": [], "updatedAt": 0
}
```

Field rules:
- `sense` is `max`, `min`, or `target`.
- `type` is `real`, `int`, or `bin`.
- `lower`, `upper`, and `init` are expressions. They may be scalars or vectors, and an empty string means unbounded.
- A global setting "Unbounded variables are non-negative" is on by default, matching Excel's Solver.

## 7. Layout and UI

**Header** (56px, surface, bottom border). Left: logo, wordmark, and the model name as an inline-editable text field with a small "saved" dot. Right: Library, Share, Export, a settings icon, and a theme toggle. All of these are ghost icon buttons with tooltips.

**Main area.** Max width 1440px, centered, 24px gutters. Two columns: the model column (`minmax(520px, 7fr)`) and the results column (`5fr`, `position: sticky; top: 80px`). Below 960px there's one column, and results become a bottom sheet that slides up after a solve.

**Goal card.** Written as a sentence: a segmented control `[Maximize | Minimize | Target]`, then a mono input holding the expression. In Target mode, a trailing `= [value]` input appears. Under the input, show a live line in `--text-2`: "Current value: 12,400".

**Decide card.** One compact row per variable: drag grip, name input, shape input (`1`, `3`, or `2x3`, and it accepts a parameter name), a type segmented control `[ℝ | ℤ | 0/1]`, bounds as `[lower] ≤ · ≤ [upper]`, and init. Initial values sit behind the row's Advanced disclosure along with labels. Show a "+ Variable" ghost row at the end.

**Subject to card.** One row per constraint:
- drag grip
- enable switch
- optional label (muted, 140px)
- mono expression input (flex)
- a live status pill on the right: ✓ `slack 42` (ok-soft), ● `binding` (info-soft), or ✗ `off by 3.5` (bad-soft)

For vector constraints, the pill reads `3/3 ok` or `1 of 3 off`. Pressing Enter in the last row creates a new row and focuses it. Backspace in an empty row deletes the row. The card footer summarizes: "5 rules · 12 scalar · all satisfied at current values".

**Given card** (collapsed by default if it has more than 6 items). Rows are `name = expression`. A scalar parameter can toggle a **slider**. Slider changes trigger a live re-solve when "Live re-solve" is on and the last solve took under 150ms.

The **Paste table** button (and pasting TSV straight into the card) opens a dialog that previews the grid. It offers three options: "each column → vector" (names from the header row), "whole table → matrix", and "first column → labels". This is the Excel bridge, so make it smooth.

**Autocomplete** in every mono input. After one identifier character, a dropdown lists variables (accent dot), parameters (neutral dot), and functions (with their signatures). Arrow keys navigate, Tab or Enter accepts, Esc closes. Errors appear as a single `--bad` line under the input: the message, plus a thin underline under the character range if you use a mirror layer. A message alone is acceptable.

**Results panel** (card):
- **Empty state:** the Nadir icon at 48px, muted, with "Press ⌘↵ to solve", plus template cards if the model is empty.
- **Status line:** a colored dot and a word: Optimal, Feasible, Infeasible, Unbounded, Stopped, or Error. Next to it, muted: "Simplex LP · 3 ms · 14 pivots".
- **Hero:** the objective value in 32px mono, with a small `--found` marker dot. Below it, the change versus current values, like "+18% vs current".
- **Decisions table:** name (with labels, e.g. `make[Tables]`), value, and a thin bar showing where the value sits between its bounds. An Advanced toggle adds reduced cost.
- **Rules table:** label, LHS, RHS, slack, a binding badge, and shadow price (LP only, under Advanced).
- **Convergence chart:** 120px canvas, drawn by hand, 1.5px accent line. It updates live during the solve.
- **Actions:** `Keep solution` (primary soft), `Restore`, `Save scenario`, `Copy for Excel` (TSV).
- **If infeasible:** a warn-soft box listing the conflicting rules (section 8, Diagnose). Clicking a rule scrolls to it and flashes it.

**Solve button.** Floating bottom-right of the model column, sticky. Pill shape, 44px, accent background, play icon, label "Solve", and a `⌘↵` kbd. While running it becomes "Stop" with a progress ring and a live best value.

**Drawer** (right side, 420px) with tabs: Library, Templates, Scenarios, Sweep, Settings.

**Command palette** (⌘K): fuzzy search across all actions, templates, and saved models.

**Shortcuts:**

| Keys | Action |
|---|---|
| ⌘/Ctrl+Enter | Solve |
| Esc | Stop, or close the top overlay |
| ⌘K | Command palette |
| ⌘S | Save to library |
| ⌘⇧E | Export |
| ⌘Z / ⌘⇧Z | Structural undo/redo (outside inputs) |
| Alt+N | New rule |
| ? | Shortcut sheet |

## 8. Engines

**Auto engine choice:**
- Everything is linear and there are no int/bin variables → Simplex.
- Linear with int/bin variables → Branch & Bound.
- Smooth nonlinear with only real variables → ALM + L-BFGS (with multistart).
- Nonsmooth, or nonlinear with integers → Differential Evolution, then polish the continuous variables with ALM.

Users can force a specific engine in Settings.

**Target mode.**
- Linear: add the equality `goal = target` and solve for feasibility (objective 0).
- Nonlinear: minimize `(goal − target)²`, subject to the rules.

**Simplex** (dense two-phase tableau, `Float64Array` rows).

Bounds preprocessing:
- Finite lower `l`: substitute `x = l + x'`.
- Only a finite upper `u`: substitute `x = u − x'`.
- Free variable: split into `x⁺ − x⁻`.
- Both bounds finite: add the row `x' ≤ u − l`.

Then:
- Add slack columns for `≤`, surplus plus artificial columns for `≥`, and artificials for `=`. Make the RHS ≥ 0 first by flipping rows.
- Phase I minimizes the sum of artificials. If that minimum is above 1e-7, the model is Infeasible.
- Use Dantzig's pivot rule. Switch to Bland's rule after 50 consecutive degenerate pivots.
- Tolerances: pivot 1e-9, feasibility 1e-7.
- An unbounded ratio test → Unbounded.
- Output: primal values (un-substituted), shadow prices from the slack columns' reduced costs (sign-adjusted by constraint sense and max/min), and reduced costs.

**Branch & Bound.** Change the variable's bounds; never add rows. Dive depth-first until the first incumbent is found, then switch to best-bound. Branch on the most fractional variable. Integer tolerance 1e-6. Stop on the gap setting, the node limit, or the time limit. Report the incumbent after every improvement.

**ALM + projected L-BFGS.**
- Box bounds are handled by projection.
- Equalities h use `λh + ρ/2·h²`.
- Inequalities g ≤ 0 use `(ρ/2)·max(0, g + μ/ρ)² − μ²/(2ρ)`.
- Update `λ += ρh` and `μ = max(0, μ + ρg)`. If the violation didn't drop by 75%, set `ρ ×= 10`.
- Start with ρ = 10, cap it at 1e8, and run at most 50 outer iterations.
- Inner loop: L-BFGS with memory 8, a projected step, and Armijo backtracking (c = 1e-4, factor 0.5). Stop when the projected gradient norm < tol.
- Multistart: the first start is the current values. The rest are Latin hypercube samples inside the bounds. An unbounded side uses `init ± 10·max(1, |init|)`.
- Keep the best **feasible** point. If none is feasible, keep the least-violated point.

**Differential Evolution.**
- Self-adaptive jDE with population `clamp(10n, 20, 200)`.
- Deb's feasibility rules: feasible beats infeasible, and between two infeasible points the lower total violation wins.
- Int/bin variables are rounded before evaluation.
- Seeded PRNG (mulberry32, `settings.seed`), so runs are reproducible.
- Stop on the time limit or after `patience` generations without improvement.

**Diagnose** (runs automatically when a model is infeasible).
- LP: add elastic variables `e ≥ 0` to each enabled rule, then minimize Σe. The rules with e > 1e-7 are the conflict set.
- NLP: minimize total violation and report the violated rules.

Show the result as: "These rules can't all hold together: Wood, Min output."

**Worker protocol:**
- Main → worker: `{type:'solve', runId, model, settings}`
- Worker → main: `{type:'progress', runId, iter, best, violation, ms}`, throttled to at most one message per 50ms
- Worker → main: `{type:'done', runId, result}` or `{type:'error', runId, message}`

`result` has the shape `{status, engine, objective, values, constraints:[{id, lhs, rhs, slack, binding, dual}], reducedCosts, iterations, ms, history:[...]}`.

## 9. Settings and presets

| Preset | Tolerance | Time limit | Multistart | Int gap | DE patience |
|---|---|---|---|---|---|
| Fast | 1e-6 | 2 s | 1 | 1% | 50 |
| Balanced (default) | 1e-8 | 10 s | 4 | 0.01% | 150 |
| Thorough | 1e-10 | 60 s | 16 | 0 | 400 |

Other settings: engine (Auto, Simplex, Nonlinear, Evolutionary), max iterations, node limit, seed, non-negative default, decimals (Auto or 0–10), live re-solve, and theme. Users can **Save current settings as preset**. Custom presets live in localStorage and appear next to the built-in ones.

**`fmt(x)`:**
- |x| < 1e-9 → "0"
- Within 1e-9 of an integer → the integer with thousands separators
- |x| ≥ 1e9 or < 1e-4 → exponential with 4 significant digits
- Otherwise → up to 6 significant digits, with trailing zeros stripped
- The decimals setting overrides all of the above.

## 10. Reuse, IO, and persistence

- **Autosave:** the working model goes to `localStorage['nadir:current']`, debounced 400ms. The library is `nadir:library` (an array of models). Settings go in `nadir:settings`.
- **Library:** search, open, duplicate, rename, delete (with an undo toast), and a sort order of last-edited first.
- **Scenarios:** save a result under a name together with its parameter values. The Compare view is a table of scenarios × (objective plus key decisions). Selected scenarios can be applied again.
- **Sweep** (Advanced): pick a scalar parameter, a from/to range, and 5–50 steps. Nadir solves each step in the worker and plots the objective against the parameter on a canvas. The results export as CSV.
- **Share link:** `#m=` + base64url(deflate-raw(JSON)), using `CompressionStream`. If that's not available, fall back to plain base64url with a `#j=` prefix. Opening a link loads the model as "Unsaved", and nothing is overwritten.
- **Export:**
  - `.nadir.json`
  - Results CSV
  - Copy for Excel (TSV)
  - Markdown report
  - Print report (print CSS: results and model only, no chrome)
  - **CPLEX `.lp` file** for linear models, so power users can move to industrial solvers
- **Import:** a JSON file picker, drag-and-drop anywhere (show a full-window dashed accent overlay), and TSV paste into the Given card.
- **Text view** (toggle in the Goal card header: `Form | Text`). This is the whole model as one document, converting both ways:

```
# Product mix
maximize sum(profit * make)
var make[3] int >= 0 labels Chairs, Tables, Desks
param profit = [45, 80, 60]
param wood = [5, 20, 10]
param woodStock = 400
Wood: sum(wood * make) <= woodStock
```

Each line is one of: `maximize | minimize | target <expr> = <v>`, `var name[shape] [real|int|bin] [>= lo] [<= hi] [labels a, b]`, `param name = expr`, or else a constraint.

## 11. Templates

Each template ships with a two-line note explaining it. All eight must be available:

1. Product mix (int LP)
2. Diet (LP)
3. Transportation (2D, `rowsum`/`colsum`)
4. Assignment (bin 2D)
5. Knapsack (bin)
6. Portfolio (`quad`, NLP)
7. Curve fit (least squares with `exp`)
8. Break-even (Target mode)

## 12. Build milestones (one per request; each must run standalone)

1. Shell, tokens, header, favicon, the four cards with static rows, theme toggle, and responsive layout.
2. Lexer, parser, and analyzer with live error messages and autocomplete.
3. Scalarizer, linearizer, and live evaluation (status pills, current goal value).
4. Worker plus Simplex, the results panel, and Keep/Restore. **Tests 1, 2, 7, 8, 10 must pass.**
5. Branch & Bound and Diagnose. **Tests 3, 4, 7 must pass.**
6. Codegen gradient, ALM + L-BFGS, DE, auto engine choice, and target mode. **Tests 5, 6, 9 must pass.**
7. Persistence, library, templates, settings and presets, command palette, shortcuts.
8. Share link, all exports and imports, paste-table dialog, Text view.
9. Scenarios, sweep, sliders with live re-solve, print CSS, and a final polish pass against section 1.

## 13. Test suite (`?test`, relative tolerance 1e-5)

| # | Model | Expected |
|---|---|---|
| 1 | max 3x+5y; x≤4, 2y≤12, 3x+2y≤18; x,y≥0 | x=2, y=6, obj 36; shadow prices 0, 1.5, 1 |
| 2 | min 2x+3y; x+y≥4, x+3y≥6 | x=3, y=1, obj 9 |
| 3 | max 5x+4y; 6x+4y≤24, x+2y≤6; int | x=4, y=0, obj 20 |
| 4 | knapsack: values [10,13,7,8], weights [5,6,3,4], cap 10, bin | items 2 and 4, obj 21 |
| 5 | min (1−x)²+100(y−x²)², free | (1,1), obj 0 |
| 6 | min x²+y²; x+y=1 | (0.5,0.5), obj 0.5 |
| 7 | x+y≤1, x+y≥2 | Infeasible; Diagnose names both rules |
| 8 | max x+y; x−y≤1 | Unbounded |
| 9 | target x³−2x = 5 | x ≈ 2.094551 |
| 10 | transport: supply [20,30], demand [10,25,15], cost [[8,6,10],[9,12,13]], min, `rowsum(ship)<=supply`, `colsum(ship)>=demand` | obj 465 |

Performance budget:
- Parsing and live check of a 1,000-term model: under 5ms.
- A 100×100 LP: under 50ms in the worker.
- First paint: under 100ms.
- The main thread never blocks for more than 16ms.

---

The four ideas that make this beat Excel's Solver instead of copying it are: vectorized readable rules instead of cell references, live feasibility pills as you type, automatic infeasibility diagnosis, and paste-in/copy-out tables plus share links. If Sonnet starts adding anything that looks like a grid, or starts cutting any of those four, point it back to section 0.