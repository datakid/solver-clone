# Nadir — Solver

Nadir means the lowest point, which is what an optimizer looks for. It is a vanilla-JavaScript optimization app. You describe a decision problem in four readable cards (**Goal · Decide · Subject to · Given**) and Nadir finds the best values. There is no grid and no chatbot. It uses no frameworks, no CDNs, no fonts and makes no network requests.

Core loop: **type → live check → ⌘↵ → answer.**

## v5.6 — final release: general symmetry detection
- **Automorphism detection** (`mip.js` `autRows`), used for models without an orbitope structure (n ≤ 2,000, nnz ≤ 8,000, capped work budget):
  - Colour refinement (1-WL) runs on the variable–constraint graph. Colours take cost, bounds, integrality, row sense/RHS and coefficients into account.
  - For each colour class, Nadir tries to map its first member onto each of the others (individualise both, refine both in step, compare colour histograms, keep individualising until every colour is unique).
  - Every candidate permutation is **verified exactly**: it must preserve costs, bounds and integrality and map the multiset of rows onto itself.
  - Each verified generator σ adds one lexicographic-leader row xᵢ ≥ x_σ(ᵢ) on its first moved variable. That is valid for any permutation, so the optimum is preserved.
- This catches symmetries the simpler checks miss: rings, mirrored or duplicated sub-networks, and identical-but-relabelled components.
- The meta line shows `N symmetries`.
- Tests: **56 engine cases** (new: cycles C5–C9 and 14 mirrored random graphs vs brute force, with symmetry on and off, plus a check that no permutation is wrongly found on a near-asymmetric graph). The **full in-app suite passes 55/55** (engine, Web Worker round-trip, all 13 templates through the worker, live-check budget).

### Project status
Nadir is feature-complete for this cycle. The engine includes:
- presolved revised/dual simplex with a Forrest–Tomlin LU and WASM SIMD kernels;
- Branch & Bound with clique, cover, flow and Gomory cuts, reliability branching, restarts, conflict learning and symmetry handling (orbits, orbitopes, automorphisms);
- exact rewriting of corners and big-M switches;
- nonlinear engines (ALM + L-BFGS, Differential Evolution);
- parallel work-stealing search and parallel sweeps.

The UI covers guided setup, plain-English explanations, sensitivity analysis, offline use and installing on Safari.

## v5.5 — work stealing, WASM sparse solves, orbitopes (stable release)
- **Work-stealing parallel B&B** (`worker-host.js` `solveSteal`, used automatically by **Solve** for hard MIPs).
  - A task queue feeds up to 4 workers.
  - Each task is a *split path*: a list of `[parts, part]` levels, replayed deterministically by `mip.js` (`o.split`).
  - A task that runs out of its time slice is split into k child tasks and put back on the queue, so idle workers steal the unfinished subtree.
  - Every finished task passes its best value to the next as a `cutoff`. Outside cutoffs only apply after the deterministic split, so sibling replays stay identical, and sibling signatures are cross-checked.
  - **SharedArrayBuffer incumbent**: when the page is cross-origin isolated, all workers read and write one shared `Float64Array` best value, so pruning is instant. Open `index.html?isolate` and the service worker adds the COOP/COEP headers (it takes effect on the second load).
  - Results say *Optimal* only when every leaf finished and all signatures matched. Otherwise they say *Good*.
  - Verified in the app: a run forced into 112 steals across 3 workers reached the true optimum, and the pool shut down cleanly.
- **WASM sparse triangular solve** (`wasm.js` `u` + `lu.js`). On sparse factors with m ≥ 800, the U back-substitution runs as a CSR WebAssembly kernel over a pivot-ordered copy, until the first Forrest–Tomlin update (then it uses the JavaScript column solve). The factor reports `sparse-simd`. *Not a true supernodal LU yet*: this basis kernel is the foundation, and supernode detection is listed under next steps.
- **Orbitopes** (`mip.js` `orbitopeRows`). Assignment-like structures are detected: set-partitioning or packing rows (Σx ≤ 1 over binaries) crossed with identical "resource" column groups that have the same costs and coefficient profile. Nadir adds packing-orbitope ordering rows, so each column may only start a job once the previous column has, which removes the machine-permutation symmetry. Columns covered by orbitopes are excluded from the simpler orbit rows.
- **Settings** → Integer models: *Break symmetry*, *Learn from dead ends*, *Parallel search*. All three persist and are passed through to the engine.
- **Meta line** shows `N steals · shared bound` and `N orbitopes` when they apply.
- **Fix**: an outside cutoff could be undercut by a root or heuristic solution in `offer`. It is now guarded, and a test covers it.
- Tests: **52 engine cases**. New: orbitope detection plus the optimum unchanged on 12 assignment MIPs; a 2×2 nested split matching plain B&B; cutoff soundness; the WASM CSR U-solve residual; a 900×900 `sparse-simd` FTRAN residual.

## v5.4 — conflict learning, symmetry, parallel tree search, WASM SIMD
- **Conflict analysis** (`mip.js`). When a node fails (propagation, a conflict-graph clash, or an infeasible LP), Nadir minimises its branching path. It deletes decisions one at a time, keeping a deletion when the rest still fails: first by cheap propagation, then by a capped LP check (at most 400 probes). What remains becomes a *no-good* cut (Σ over the 0-decisions x + Σ over the 1-decisions (1−x) ≥ 1). No-goods are stored separately and checked at every node. This only applies to binary paths of 2–24 decisions, with at most 3,000 no-goods. Counters: `learned` and `learnedPrunes`.
- **Symmetry handling (orbital reduction).** Integer columns with identical cost, bounds and row pattern form an orbit. Nadir adds the ordering x₁ ≥ x₂ ≥ … inside each orbit, which keeps one representative of every symmetric solution, so the optimum is unchanged. It runs before presolve and can be switched off (`symmetry: false`).
- **Parallel Branch & Bound** (`worker-host.js` `solveTree`).
  - Every worker runs the same deterministic root (presolve, cuts, restart), then expands the tree breadth-first to about 4× the worker count of open nodes. Worker *p* takes nodes *i* where *i* mod *k* = *p*.
  - Each result carries a signature (open nodes, shared nodes and incumbent). The merged answer is proven Optimal only if all signatures match and every part finished. Otherwise it is reported as Good.
  - **Solve** switches to the parallel search automatically (up to 4 workers) for hard MIPs, i.e. ones not proven within 1.5 s, and keeps whichever answer is better.
- **WASM SIMD kernels** (`js/engine/wasm.js`). The module is assembled in JavaScript, so there's no binary file and no fetch, and it is checked with `WebAssembly.validate`. It provides `f64x2` axpy/dot and a sparse column pricing kernel (SpMV).
  - The dense LU (m ≥ 48) runs its elimination, FTRAN and BTRAN through SIMD (`lu: 'dense-simd'`).
  - The revised simplex prices with the WASM SpMV on big models (n ≥ 2,000 and nnz ≥ 8,000).
  - Where WebAssembly SIMD isn't supported, Nadir falls back to plain JavaScript.
  - The results are bit-for-bit the same objectives and pivot counts.
- **Meta line.** It shows `N workers`, `SIMD`, `N orbits` and `N learned` when they apply.
- Tests: **51 engine cases**. New: SIMD kernels vs JavaScript (axpy, dot, SpMV, dense LU residual); symmetric conflict MIPs, where orbits plus no-goods and the 3-way split match plain B&B, plus an orbit-detection unit test. Parallel tree search verified in the app: 3 workers, consistent split, same proven optimum.

## v5.3 — dual presolve, fill-aware LU, MIP restarts, conflict graph, parallel sweeps
- **Dual presolve** (`presolve.js`).
  - *Redundant rows*: a row is dropped when its activity bounds can never break it (e.g. `≤ 1000` when the max is 300). It is checked before columns are freed, so it never relies on a freed bound.
  - *Implied-free columns*: when a column's only row already implies its bounds, the bounds are lifted, which avoids degenerate bound pivots. This is guarded so that no freed column's bounds were ever used for another reduction.
  - The lifted basis is checked before use. If a freed column is non-basic, it falls back to the plain solve.
- **Fill-reducing LU ordering** (`lu.js`). Columns are pre-ranked by their Markowitz fill potential, and Markowitz ties are broken by that rank. The factor reports `fill`.
- **Conflict graph shared with propagation** (`mip.js`).
  - It is built once from all "x + y ≤ 1"-type rows.
  - Clique cuts and node propagation both use it: setting a binary to 1 fixes its neighbours to 0 and prunes contradictory nodes.
  - Counters: `conflictPrunes` and `conflictFixes`.
- **Root restarts.** After the root cuts and the first incumbent:
  - Reduced-cost fixing: integers whose reduced cost exceeds the gap are fixed.
  - Probing: each binary is tried at 1 using conflict propagation and bound propagation, and fixed to 0 if that is infeasible.
  - If at least 10% of the integers are fixed (and at least 3), Nadir drops the cuts, re-presolves and restarts the search on the smaller model. The incumbent is kept.
- **Parallel sweeps** (`worker-host.js`). Sweep values are split into contiguous chunks over up to `hardwareConcurrency − 1` Web Workers (max 8). Each chunk keeps its warm starts, and results stream back in order. Stop terminates them all. If workers aren't available it falls back to the single worker. When more than one worker is used, a toast reports how many and the time taken.
- **Meta line and story.** The meta line shows `restart`. The story says how many choices were fixed at the root and how many either-or pairs ruled out options.
- Tests: **48 engine cases**. New: dual presolve vs dense on 50 LPs (with bound checks); fill-aware LU residuals and fill bound; conflict propagation unit test plus restart/conflict B&B vs classic on 30 conflict-heavy MIPs. Parallel sweep verified in the app: 3 workers, identical results to the serial sweep, and Stop works.

## v5.2 — presolve, hypersparse solves, richer cuts, reliability branching
- **LP presolve** (`js/engine/presolve.js`, runs before the revised simplex when Presolve is on and the model has 300+ rows and columns). It does the following:
  - Removes empty rows.
  - Turns singleton rows into bounds.
  - Substitutes doubleton equalities (a·x + b·y = c), eliminating y and carrying its bounds onto x.
  - Fixes columns whose bounds are equal.
  - Fixes empty and dominated columns at their best bound.
  The reduced LP is solved, then its optimal basis is mapped back onto the full model and a short warm-started clean-up pass (normally 0 pivots) restores exact duals, reduced costs and ranging. Anything unusual (infeasible, unbounded, a basis that won't map back) falls back to the plain solve, so answers never change.
- **Hypersparse triangular solves** (`lu.js`). FTRAN now walks U column-wise and BTRAN walks L row-wise, so both skip every zero entry instead of computing dot products. This is a big saving on unit and slack columns. The Forrest–Tomlin update keeps the column copies in sync.
- **Clique cuts.** A conflict graph is built from rows where two binaries can't both be 1, then greedy maximal cliques are lifted into Σx ≤ 1.
- **Flow cover cuts.** Variable upper bounds y ≤ u·z are detected, and lifted flow covers are separated on single-node flow rows.
- **Reliability branching.** Pseudo-costs are seeded by strong branching (short dual-simplex probes of both children, at most 60 pivots each) until a variable has 4 observations per side, with a capped budget. Infeasible probes count as huge gains.
- **Meta line.** It shows the pivot breakdown, e.g. `Simplex LP · 12 ms · 840 pivots (610 primal · 230 dual)`, plus `presolve −R rows −C cols` and `N strong probes`. The story lists the cut families (cliques, knapsack covers, flow covers, Gomory). Also fixed: the meta line said "1 nodes".
- Tests: **45 engine cases**. New: presolve vs the dense tableau on 60 LPs (objective, feasibility and dual length); hypersparse FTRAN/BTRAN residuals over 120 updates; clique and flow cuts firing and reliability B&B agreeing with classic B&B on 25 fixed-charge models.

## v5.1 — installing on Safari
- **Add-to-Home-Screen guide** (`js/app/pwa.js`, `css/install.css`). iOS Safari has no install prompt, so *Install* now opens a sheet written for the browser you're on:
  - **iPhone Safari**: Share → Add to Home Screen → Add, with an animated arrow pointing at the Share button in the bottom toolbar.
  - **iPad Safari**: the same steps, with the arrow at the top right.
  - **Chrome / Edge on iOS 16.4+**: Share in the address bar.
  - **Firefox on iOS and in-app browsers** (Instagram, Facebook, LinkedIn…): *Open in Safari*, with a Copy link button.
  - **macOS Safari 17+**: File → Add to Dock.
  - **Older Safari**: a pointer to Sonoma or to Chrome/Edge.
  - **Desktop Firefox**: explains that it can't install, and offers the single-file download.
  - **Chromium**: the native prompt, as before.
- The install button and palette entry adapt their label (*Add to Home Screen* / *Add to Dock* / *Install Nadir*). On iOS and macOS Safari, a gentle reminder appears on the 3rd visit and then every 4 visits, at most twice.
- **A real web manifest** (`manifest.webmanifest`). It was referenced before but missing, so Chrome couldn't offer install and iOS fell back to defaults. It now has `id`, `scope`, standalone display with window-controls overlay, theme colours, three shortcuts, and both *any* and *maskable* icons.
- **Proper icons.** `images/icon-1024.png` (full-bleed square, so iOS rounds it cleanly) and `images/icon-maskable-1024.png` (logo inside the safe zone). These replace the 150 px JPEGs; the old one had black corners that showed on the Home Screen.
- **Standalone polish.** The header, results sheet, solve button, toasts and drawer all respect the notch and home-indicator safe areas. The status bar is translucent and there's no rubber-band overscroll or tap flash. Inputs are at least 16 px so iOS doesn't zoom in. There are light and dark `theme-color` tags. Nadir asks for persistent storage once installed, so iOS is less likely to clear saved models.
- `?install` opens the guide. `?install=ios|ipad|ios-chrome|ios-inapp|mac` previews each variant on any device.

## What's new in v5 — the four known limits, tackled

### Solver
- **Forrest–Tomlin LU updates** (`js/engine/lu.js`). The sparse factorization was rewritten: array-based rows with column count buckets (a Markowitz search over the few sparsest columns, no hash maps), then an in-place Forrest–Tomlin update of U on every basis change instead of piling up product-form etas. Accuracy is checked on each update (the new pivot must match `w[r]·d_old`), and the basis is refactorized automatically if that check fails. Refactor interval scales with model size. Result: the 3,000×3,000 sparse LP dropped from ~5–8 s to **~1.5–2.9 s**, and a 6,000×6,000 LP solves in ~7–8.5 s (new test).
- **Dual simplex** (`js/engine/revised.js`). Any warm-started solve whose basis is still dual feasible (B&B children after a bound change, LPs after cuts are added) is re-optimised with a bounded dual simplex (largest-infeasibility row choice, bound-flip-aware ratio test, safeguarded by refactorization). The primal method only runs as a fallback. Results report `dual` pivots.
- **Knapsack cover cuts** (`js/engine/mip.js`). At the root, every row with binaries is turned into a knapsack (complementing negative coefficients, moving continuous parts to their best bound). Nadir finds a violated minimal cover, extends it, and adds it next to the Gomory cuts. **Pseudo-cost branching** takes over from most-fractional branching once a few branches have been seen.
- **Sensitivity for integer models**. After Branch & Bound, Nadir re-solves the LP with the whole-number decisions held at their best values. That gives shadow prices, reduced costs and RHS/cost ranging for the continuous part. Integer decisions show as *held at N*. The "Biggest lever" sentence says the integers are held fixed.
- **Ranging on rewritten models**. Ranging is no longer hidden for models using `abs` / `max` / `min` / `pos`. Ranges come straight from the rewritten LP.
- **Exact switches for wrong-way corners (big-M)** (`js/engine/reform.js`). Non-convex uses such as `maximize abs(x)`, `abs(x - 5) >= 2`, `minimize min(a, b)`, `maximize max(a, b)` or maximin distances get one binary switch per corner. Each switch has a big-M tightened from the variable bounds, and the helper variables carry exact bounds. Branch & Bound then proves the very best answer. If a range is unbounded, Nadir falls back to the search engines as before. You can turn this off in Settings → Smart modelling → *Exact switches for wrong-way corners*. CPLEX export writes `switch_k` columns into the `Binary` section.
- New template **Keep away from hazards** (a maximin depot placement, solved as a MIP with 4 switches).

### Smoothness
- New `css/motion.css` + `js/app/motion.js`. Drawer, dialogs, popovers and toasts now animate *out* as well as in, with emphasised easing. Deleted rows collapse smoothly, and reordered rows glide to their new place using FLIP (Web Animations). Buttons get a soft press ink and spring-back. Switches stretch while pressed. The first result reveal staggers the story lines and table rows, grows the range bars, and gives the hero number a rise and glow. Later re-solves just cross-fade, so nothing flickers. `<details>` sections open with a slide. All of this is disabled for reduced-motion users.

### Tests
Engine suite: **42 cases** (`engine-check.html`). New: big-M classification, big-M exactness vs brute force on 30 random non-convex MIPs, Forrest–Tomlin residuals over 300 swaps, dual-simplex re-optimisation vs the dense tableau, cover cuts plus MIP sensitivity, ranging on rewritten models, and a 6,000×6,000 sparse LP. All 13 templates solve Optimal.

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
- Your logo is used as the PWA / touch icon (now `images/icon-1024.png`).
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
| `index.html?template=<key>` | Loads a template (`bakery`, `ad-budget`, `product-mix`, `diet`, `transport`, `assignment`, `knapsack`, `portfolio`, `curve-fit`, `staffing`, `robust-fit`, `spread-out`, `break-even`) |
| `&solve` | Solves right after loading |
| `&text` | Opens Text view |
| `&theme=dark\|light\|system` | Sets the theme |
| `?install[=ios\|ipad\|ios-chrome\|ios-inapp\|mac]` | Opens the install guide (optionally previewing a platform) |
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
- The LP is single-threaded JavaScript. Around 10⁴ rows takes seconds; 10⁵+ rows would need presolve for LPs, hypersparse FTRAN/BTRAN and LU fill reduction (planned next).
- MIP restarts happen only at the root. Symmetry handling covers identical columns and packing orbitopes, not arbitrary permutation groups. Without cross-origin isolation, workers share the best value only between tasks, not instantly.
- WASM SIMD speeds up the dense kernels a lot. Sparse models are still bound by the JavaScript sparse triangular solves, so the 3k×3k LP runs at about the same speed.
- MIP sensitivity is *conditional*: it is valid with the whole-number decisions held at their best values. NLP results have no ranging.
- Exact switches need finite ranges on everything inside the `abs`/`max`/`min` (at most 400 switches). Otherwise those models use the search engines.
- Apple doesn't let a web page trigger Add to Home Screen on iOS, so Nadir can only guide you through it. An installed iOS app also keeps its own storage, separate from Safari tabs; export a library file to move models across.

## Recommended next steps
- Supernode detection in the sparse LU, so it can use dense SIMD blocks.
- Keep the WASM U-solve after Forrest–Tomlin updates (patch the CSR in place).
- Orbital fixing in the tree, using the detected automorphism generators (today they're only used as root ordering rows).
