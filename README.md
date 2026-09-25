# Nadir — Solver

Nadir means the lowest point, which is what an optimizer looks for. It is a vanilla-JavaScript optimization app. You describe a decision problem in four readable cards (**Goal · Decide · Subject to · Given**) and Nadir finds the best values. There is no grid and no chatbot. It uses no frameworks, no CDNs, no fonts and makes no network requests.

Core loop: **type → live check → ⌘↵ → answer.**

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
| `index.html?test` | Runs the built-in test suite (18 tests: spec tests 1–10, language, gradient, text round-trip, performance, worker, live-check budget) |
| `index.html?template=<key>` | Loads a template (`product-mix`, `diet`, `transport`, `assignment`, `knapsack`, `portfolio`, `curve-fit`, `break-even`) |
| `&solve` | Solves right after loading |
| `&text` | Opens Text view |
| `&theme=dark\|light\|system` | Sets the theme |
| `index.html#m=…` / `#j=…` | Opens a shared model |
| `engine-check.html` | Runs the engine tests alone, without the UI |

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

## Not yet implemented
- Sparse revised simplex (LU) for LPs much larger than about 2,000×2,000.
- Cutting planes and presolve for harder MIPs.
- Sensitivity ranging (the allowable increase and decrease on the RHS and costs).
- An optional one-file build script that inlines the CSS and JS into a single `nadir.html`.
- Service worker for installable offline use.
