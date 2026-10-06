# Nadir — Solver

Nadir means the lowest point, which is what an optimizer looks for. It is a vanilla-JavaScript optimization app. You describe a decision problem in four readable cards (**Goal · Decide · Subject to · Given**) and Nadir finds the best values. There is no grid and no chatbot. It uses no frameworks, no CDNs, no fonts and makes no network requests.

Core loop: **type → live check → ⌘↵ → answer.**

## What's new in v4 — a smarter solver, a calmer UI

### Solver
- **Corner straightening** (`js/engine/reform.js`). Models using `abs`, `max`, `min`, `pos`, `neg` or `clamp` in a convex way (minimizing `abs`/`max`, maximizing `min`, `abs(…) <= k`, `max(…) <= k`, `min(…) >= k`) are rewritten into an exact linear program with helper variables (epigraph form). Before v4 these went to Differential Evolution, which only gives a "good" answer. Now they go to **Simplex or Branch & Bound**, which proves the very best answer and keeps shadow prices. The check is sign-aware (convexity is tracked through `+ − ×k ÷k`). Non-convex uses such as `maximize abs(x)` or `abs(x) >= 2` still go to the search engines, so results stay correct. Infeasibility diagnosis, smallest fixes, the unbounded culprit and CPLEX `.lp` export (`aux_k` columns, `piece` rows) all work on the rewritten model. You can switch it off in Settings → Smart modelling → *Straighten corners*.
- Kinked models that can't be rewritten no longer go to the gradient engine (ALM). They go to DE, which is the safer choice for corners.
- **Warm starts**: a live re-solve (from a slider or number edit) and each step of a parameter sweep start from the previous answer. Nonlinear search converges in fewer steps and stays in the same valley.
- `linearize` takes a shared memo, so linearizing node by node stays linear-time.
- **New functions**: `pos(x)` (shortfall/excess), `neg(x)`, `clamp(x, lo, hi)`, `sumprod(a, b)` (Excel SUMPRODUCT). The names stay free to use for your own numbers. Help → *Shortfalls & caps*.
- **New templates**: *Staffing with shortfalls* (penalised unmet demand plus an overtime cap via `pos`) and *Robust line fit* (L1 regression that ignores an outlier). Both solve to proven Optimal with Simplex.

### UI performance and polish
- The results panel is **diffed in place** (`N.util.morph/patch`, keyed sections and rows). It is no longer rebuilt with `replaceChildren`. Re-rendering the same result changes almost nothing in the DOM. Scroll position, open `<details>`, focus and the chart canvas all survive. There is one delegated click handler and one toggle handler, instead of a listener on every row.
- The entrance animation runs only when results first appear. Later updates use a short fade, so there is no stagger flicker on each re-solve. The readiness checklist only re-renders when its inputs change.
- The chart repaints at most once per animation frame. The solve ring and the "best so far" label are throttled to one frame and skip writes when nothing changed. `countUp` can be cancelled, so quick re-solves don't fight each other.
- Fields cache their highlighted HTML (keyed on text, error and symbol version) and their symbol sets. A live check no longer repaints every input. Fields repaint only when the set of names changes (`symbols` event).
- Guarded attribute and tooltip writes, a debounced save-state badge, and title or name writes only when the text changes. `scrollbar-gutter: stable` and containment on the results card prevent layout shift. Reduced-motion users get no result animation.
- Goal-card hint, readiness panel and limit rows say *"Straight lines with corners · Simplex LP"* / *"corners → straight lines"*. The story adds *"…rewritten as straight lines, so Simplex could prove this is the very best answer"*.
- Tests: engine **35/35** (8 new v4 cases: median via abs, minimax and L1 fit, `pos` penalties in goal and rules, abs with integers via B&B, non-convex fallback and the toggle, diagnose, unbounded and export on rewritten models, new functions, warm start). All 12 templates solve Optimal.

## What's new in v3 — built for newcomers
- **Guided setup** (`js/app/wizard.js` + pure `js/engine/guide.js`). Pick a situation (*Make the most profit · Split a budget · Pick the best set · Cheapest mix · Who does what · Ship at lowest cost*) and fill in a small table. Nadir writes the goal, decisions, limits and numbers for you, checks your inputs live ("Labour hours used per Desks is empty"), then solves. Each recipe opens with a worked example you can clear. You can reach it from the welcome panel, the header button, the Goal card tip, the palette, the Help menu, or `?wizard[=produce|budget|pick|blend|assign|ship]`.
- **Click-to-build formulas**: when you focus the goal or a limit, a bar appears under it with your decisions, numbers, ≤ / ≥ / =, + − × ÷ and "total of…". It adds `*` and spacing for you, so you don't need to know the syntax.
- **One-click error fixes**: errors are written in plain English and come with buttons, for example "Use *ovenHours*", "Add *ovenHour* as a number / as a decision", and "≤ at most / ≥ at least / = exactly" when a limit has no comparison.
- **Plain-language labels**: Goal · **Decisions** · **Limits** · **Numbers**. Statuses read *Best answer / Good answer / No answer fits / No ceiling* (the technical term is in the tooltip). Columns read *Used / Allowed / Spare*. "slack/binding" became "*N to spare* / *at the limit* / *used up*". Shadow prices and the rest sit under "Expert details".
- **Infeasible → concrete fixes**: an elastic LP finds the smallest changes that make the model solvable ("Cake demand: need 4 less"). Each fix has **Apply & re-solve** (patches the limit's right side, can be undone) and **Pause it**.
- **Unbounded → culprit**: Nadir names the decisions that grow forever, and **Set a max for x** jumps straight to that box.
- **Better nonlinear integer solving**: after DE (and ALM polish), an integer local search (±1 moves and pairwise swaps, re-polishing the continuous part) finds the true best on small mixed-integer nonlinear models.
- **Responsive at half-screen**: single column below 1100px. The welcome panel sits inline at the top (it is no longer hidden in a bottom sheet), toasts move to the top so they never cover results, and the header collapses its secondary actions.
- **Visual polish** (`css/polish.css`): higher-contrast secondary text (WCAG AA), larger card titles, white input boxes that look editable, a gradient guided-setup hero, and tidier limit suggestions.
- Your logo is used as the PWA / touch icon (`images/nadir-icon.png`).
- Tests: engine 27/27 (`engine-check.html`). New: infeasible fixes, unbounded culprit, MINLP true best, all 6 guide recipes solve, unknown-name quick fixes.

## What's new in v2
- **Plain-English layer** (`js/engine/explain.js`, pure, runs in the worker too). The goal and every rule are read back as a sentence, for example "The total of wood × make must be at most woodStock". Labels are used where they exist (`make[Desks]`). You can turn this off in Settings → Behaviour or from the palette.
- **"In plain words" result story**: the best plan, the goal compared with your starting values, which rules are holding you back, and the single biggest lever (the largest shadow price, Simplex only). There are also notes that explain the engine choice.
- **Guided tour** (`js/app/tour.js`): 7 steps with a spotlight. Use ←/→/Enter/Esc. If the model is empty it loads the Bakery starter first. Open it from Help, the palette, Settings, the welcome panel, or `?tour`.
- **Language guide** (`js/app/help.js`): Basics, a searchable function reference with click-to-copy examples, and Reading results (Optimal, Binding, Slack, Shadow price…). Open it with `?guide` or `?guide=functions`.
- **Welcome and readiness panels**: an animated valley illustration, 3 numbered steps and template cards with icons. Once you start typing, a live checklist ("Ready to solve" / "Almost there") appears, with a one-click action for each missing piece and the engine Nadir will pick.
- **Friendlier cards**: numbered step badges (these fill in once each step is done) and subtitles. Kind labels are `1.5 / 1, 2 / Y/N`, with column headers on Decide. The Rules card shows suggestion chips when it is empty.
- **New templates**: Bakery (a scalar starter) and Ad budget (NLP with diminishing returns). All 10 are checked to solve Optimal in the test suite.
- **Visual polish**: refined tokens, a gradient accent, layered shadows, and staggered entrance, count-up and found-dot animations. The Solve button pulses when the model is ready. There is a floating drawer, blurred scrims, and a collapsible convergence chart ("How Nadir got there"). Dark mode, mobile, print and reduced-motion are all kept.
- Tests: 20/20 (new: Plain words, Templates solve Optimal).

## Features

### Modeling language (`js/engine/syntax.js`, `model.js`)
- Scalars, vectors and matrices. Supports `12`, `3.5`, `1e6`, `7%`, `[1,2,3]`, `[[1,2],[3,4]]`, `1..5`, and implicit multiplication like `2x` and `100(y-x^2)`.
- Operators `- ^ * / + -` work elementwise with scalar broadcasting. Shapes are checked exactly.
- Indexing is 1-based, with slices: `x[2]`, `M[1,3]`, `x[2..4]`, `M[1,:]`, `M[:,2]`.
- Functions: `sum prod mean min max len dot quad sumsq norm rowsum colsum cumsum matmul T rows cols ones zeros abs sqrt exp log ln log10 sin cos tan pow round floor ceil sign if`.
- Rules use `[label:] a <= b`, `>=`, `=`, `≤`, `≥`, and chained `lo <= e <= hi`. A vector rule expands to one rule per element.
- Pipeline: Lexer → Pratt parser → shape analyzer and scalarizer (hash-consed IR with constant folding, capped at 300k nodes) → exact linearizer → reverse-mode codegen. `new Function` is used only on source generated from the validated IR.
- Error messages point to the exact character range, for example "Unknown name 'profti'. Did you mean 'profit'?" Circular parameters are detected.

### Engines (`js/engine/lp.js`, `nlp.js`, `solve.js`)
- **Simplex**: dense two-phase tableau with bound substitution. It uses Dantzig pricing and switches to Bland's rule after degenerate pivots. It reports shadow prices and reduced costs.
- **Branch & Bound**: branches by changing bounds only. It dives depth-first until it finds an incumbent, then switches to best-bound. It stops on the gap, node or time limit.
- **ALM + projected L-BFGS**: multistart from Latin hypercube samples. It keeps the best feasible point.
- **Differential Evolution**: jDE with Deb's feasibility rules and a seeded mulberry32 generator. It finishes with an ALM polish of the continuous variables.
- **Auto choice**: linear → Simplex or B&B; smooth nonlinear → ALM; nonsmooth or integer nonlinear → DE.
- **Target mode**: linear targets become an equality. Nonlinear targets minimize (goal − target)².
- **Diagnose**: for infeasible LPs it deletion-filters down to an irreducible conflicting set of rules. Nonlinear models get a least-violation report.
- All solves run in a **Web Worker** built from the same engine source through a Blob URL. Progress messages are throttled to 50 ms. Stop terminates the worker and starts a fresh one.

### UI (`js/app/*`)
- Syntax-highlighted mono inputs with a mirror layer, a wavy error underline and autocomplete for variables, parameters and functions.
- Live status pills on every rule (`slack 42` / `binding` / `off by 3.5` / `1 of 3 off`) and the live goal value.
- Card footers give summaries such as "3 rules · all satisfied at current values".
- Keyed row lists never re-render a focused input. Rows reorder by dragging the grip or with ↑/↓ on a focused grip.
- The results panel shows the status, engine, time and pivots or nodes. It includes the hero value with the found marker, the change vs current, the decisions table with bound bars, the rules table (shadow prices under Advanced), a live convergence chart, and the Keep / Restore / Save scenario / Copy for Excel actions.
- Drawer tabs: Library, Templates, Scenarios (compare table and CSV), Sweep (canvas plot and CSV), Settings (presets, custom presets, engine, tolerances, theme, decimals).
- Command palette (⌘K), shortcut sheet (?), toasts with Undo, accessible dialogs with focus trapping.
- Responsive layout: two columns on desktop. Below 960px the results become a bottom sheet. Includes print CSS and light, dark and system themes.

### IO
- Autosave to `localStorage['nadir:current']` (400 ms debounce), library in `nadir:library`, settings in `nadir:settings`, custom presets in `nadir:presets`.
- Share links `#m=` use deflate-raw and base64url, falling back to `#j=`. Opening one loads the model as Unsaved.
- Export: `.nadir.json`, results CSV, Copy for Excel (TSV blocks, with matrices laid out as tables), Markdown report, print, and CPLEX `.lp`.
- Import: file picker, drag-and-drop anywhere, and multi-model library files.
- **Paste table** dialog: each column → vector, whole table → matrix, or each row → vector. It handles headers, label columns, currency and thousands separators, and can apply labels to a decision.
- **Text view**: the whole model as one document, converting both ways.

### Templates
Product mix, Diet, Transportation, Assignment, Knapsack, Portfolio, Curve fit, Break-even. All eight are checked to solve Optimal.

## Entry URIs
| URI | Effect |
|---|---|
| `index.html` | App |
| `index.html?test` | Runs the built-in test suite (25 tests: spec tests 1–10, language, gradient, text round-trip, plain words, LU, revised vs dense, 3,000×3,000 sparse LP, ranging, MIP v2, performance, worker, all templates, live-check budget) |
| `index.html?tour` | Starts the guided tour |
| `index.html?wizard[=kind]` | Opens Guided setup (optionally straight into `produce`, `budget`, `pick`, `blend`, `assign`, `ship`) |
| `index.html?guide[=functions\|results]` | Opens the Language guide |
| `index.html?template=<key>` | Loads a template (`bakery`, `ad-budget`, `product-mix`, `diet`, `transport`, `assignment`, `knapsack`, `portfolio`, `curve-fit`, `staffing`, `robust-fit`, `break-even`) |
| `&solve` | Solves right after loading |
| `&text` | Opens Text view |
| `&theme=dark\|light\|system` | Sets the theme |
| `index.html#m=…` / `#j=…` | Opens a shared model |
| `engine-check.html` | Runs the engine tests alone, without the UI |
| `sw.js`, `manifest.webmanifest` | Offline service worker and install manifest |
| `node tools/build.mjs [out.html]` | Builds the single-file `nadir.html` |

## Architecture
```
index.html
css/base.css          tokens → reset → primitives (button, input, chip, pill, kbd, segmented, switch)
css/components.css    header, card, code field, rows, popover, drawer, dialog, toast, palette, solve button
css/layout.css        layout, results, lists, responsive, print
js/engine/            pure, no DOM, shared by main thread and worker
  core.js             module registry and self-serialisation into the worker source
  syntax.js           lexer, Pratt parser, highlighter, suggestions
  ir.js               scalar IR: folding, evaluation, linearizer, value+gradient codegen
  model.js            analyzer, scalarizer, compile(model)
  reform.js           sign-aware epigraph rewrite of convex abs/max/min/pos into extra LP rows and columns
  lp.js               simplex, branch & bound, elastic LP
  nlp.js              L-BFGS-B, ALM, multistart, differential evolution
  solve.js            engine choice, target mode, diagnose, live check, CPLEX export, sweep, worker entry
  text.js             Text view ⇄ model
  tests.js            test suite
js/app/               util, store (state, undo, persistence), worker-host, overlays, field (highlight and autocomplete),
                      list (keyed rows, sortable), live, cards-model, cards-rules, results, solve, templates, io, drawer, main
```
Where it departs from the spec, and why: the spec asks for a single `.html` file. This project uses the same section order split across files, which is easier to maintain and still works offline from `file://`. The worker is still built from the engine source at runtime (`NadirEngine.source()`), so there is one source of truth.

## Data model
The JSON matches the spec (§6): `{format:"nadir", version:1, id, name, notes, goal:{sense,expr,target}, variables:[{id,name,shape,type,lower,upper,init,labels}], constraints:[{id,label,expr,enabled}], parameters:[{id,name,expr,slider}], settings, scenarios, updatedAt}`. No server tables are used; everything is stored in the browser.

## v2.1 — solver and platform
- **Bounded revised simplex** (`js/engine/revised.js`) is now the default LP engine. It keeps column-major sparse storage and handles bounds without extra rows. Phase 1 is composite (minimises infeasibility), then the ratio test uses the Harris two-pass rule. Pricing is Devex-style steepest edge with partial pricing on large models. Bland's rule takes over after degenerate stalls, and the basis is refactorized to verify optimality. Warm starts reuse a basis.
- **LU factorization** (`js/engine/lu.js`): dense partial pivoting for m ≤ 320, and sparse Markowitz with threshold pivoting (singletons first) above that. It uses product-form eta updates and refactorizes when the etas grow too large. A singular basis is repaired by swapping in slack columns. A sparse 3,000×3,000 LP solves in about 5–8 s in the test suite. The dense tableau is still available (Settings → LP method) and is the automatic fallback if the revised method hits numerical trouble.
- **MIP presolve** (`js/engine/mip.js`): empty or singleton rows become bounds, activity-based bound tightening, redundant-row removal, big-M coefficient tightening for binaries, and early infeasibility detection.
- **Cutting planes**: up to 4 rounds of Gomory mixed-integer cuts at the root, with efficacy ranking and filtering for numerical safety. These are followed by a round-and-fix heuristic.
- **Branch & bound v2**: node bound propagation, warm-started child LPs, depth-first search until an incumbent is found, then best-bound. The classic v1 B&B is kept (Dense LP method).
- **Sensitivity ranging**: allowable increase and decrease for every rule's right-hand side (the range where the shadow price holds) and every goal weight (the range where the plan stays optimal). You can see them under Results → Advanced → Sensitivity. They are also included in the CSV (Excel `1E+30` convention for infinite values), Copy for Excel and Markdown. The "Biggest lever" sentence now says how far the lever holds. Very large models skip ranging and say so.
- **Single file**: Export → "Nadir as one file" (or the palette) downloads `nadir.html` with every CSS and JS file inlined. The worker still builds from the same source. `node tools/build.mjs [out]` produces the same file (default `dist/nadir.html`) using the same inliner (`js/app/build.js`).
- **Installable offline app**: `sw.js` precaches every file (versioned cache, network-first for pages, cache-first for assets). Also added: `manifest.webmanifest` (with shortcuts), SVG icons, an "offline ready" toast, an update prompt that doesn't reload in the middle of editing, and a Settings → Offline & install panel (Install, Check for update, Download as one file). The service worker only runs on https or localhost; the single-file build and `file://` pages don't use it.
- New settings: LP method, Presolve, Cutting planes, Sensitivity ranging.
- Tests: 25/25 (new: LU residuals, revised vs dense on 60 random LPs, 3,000×3,000 sparse LP with a strong-duality check, textbook ranging for max and min, MIP v2 vs classic on 40 random models).

## Known limits
- The sparse LU uses Markowitz pivoting on a hash-map active submatrix. It is fine up to roughly 10⁴ rows. It is not a Forrest–Tomlin/HiGHS-class kernel, so very large (10⁵+) LPs are still slow in a browser.
- Cuts are Gomory mixed-integer only (no knapsack cover or flow cover cuts). There is no dual simplex for re-optimising B&B nodes; child nodes are warm-started with the primal method.
- Ranging applies to continuous LPs (Simplex engine). It is not available for MIP or NLP results, or for models rewritten from abs/max/min (shadow prices still are).
- Corner straightening covers convex uses only. Non-convex ones (for example `maximize abs(x)`) would need binary big-M variables, which aren't generated automatically yet.
- Install buttons depend on the browser: iOS needs Share → Add to Home Screen.
