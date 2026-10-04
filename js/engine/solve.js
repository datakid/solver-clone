NadirEngine.define('solve', function (E) {
  'use strict';

  const PRESETS = {
    fast: { label: 'Fast', tol: 1e-6, timeLimit: 2, multistart: 1, gap: 0.01, patience: 50 },
    balanced: { label: 'Balanced', tol: 1e-8, timeLimit: 10, multistart: 4, gap: 0.0001, patience: 150 },
    thorough: { label: 'Thorough', tol: 1e-10, timeLimit: 60, multistart: 16, gap: 0, patience: 400 }
  };
  const DEFAULTS = Object.assign({ preset: 'balanced', engine: 'auto', maxIter: 50000, nodeLimit: 100000, seed: 1, nonNegative: true, lpMethod: 'auto', presolve: true, cuts: true, ranging: true }, PRESETS.balanced);

  function resolveSettings(s) {
    const out = Object.assign({}, DEFAULTS, s || {});
    for (const k of ['tol', 'timeLimit', 'multistart', 'gap', 'patience', 'maxIter', 'nodeLimit', 'seed']) {
      const v = Number(out[k]);
      out[k] = Number.isFinite(v) ? v : DEFAULTS[k];
    }
    out.timeLimit = Math.max(0.05, out.timeLimit);
    out.lpMethod = ['auto', 'revised', 'dense'].includes(out.lpMethod) ? out.lpMethod : 'auto';
    for (const k of ['presolve', 'cuts', 'ranging']) out[k] = out[k] !== false && out[k] !== 'false';
    out.multistart = Math.max(1, Math.round(out.multistart));
    return out;
  }

  function enabledRows(C) {
    const idx = [];
    C.rows.forEach((r, i) => { if (r.enabled) idx.push(i); });
    return idx;
  }

  function analyze(C) {
    const rowsIdx = enabledRows(C);
    const roots = [C.goalRoot].concat(rowsIdx.map((i) => C.rows[i].g));
    const lin = C.ir.linearize(roots.filter((r) => r >= 0));
    const goalLin = C.goalRoot >= 0 ? lin[0] : { m: new Map(), c: 0 };
    const rowLin = C.goalRoot >= 0 ? lin.slice(1) : lin;
    const linear = !!goalLin && rowLin.every((x) => !!x);
    let nonsmooth = false;
    for (const r of roots) if (r >= 0 && (C.ir.flags[r] & 2)) nonsmooth = true;
    let hasInt = false;
    for (let j = 0; j < C.n; j++) if (C.integer[j]) hasInt = true;
    const nonlinearRules = [];
    rowLin.forEach((x, k) => { if (!x) nonlinearRules.push(C.rows[rowsIdx[k]].cid); });
    return { rowsIdx, goalLin, rowLin, linear, nonsmooth, hasInt, goalLinear: !!goalLin, nonlinearRules: [...new Set(nonlinearRules)] };
  }

  function chooseEngine(A, settings) {
    const want = settings.engine || 'auto';
    if (want === 'simplex') return A.linear ? (A.hasInt ? 'bb' : 'simplex') : null;
    if (want === 'nonlinear') return A.hasInt ? 'de' : 'alm';
    if (want === 'evolutionary') return 'de';
    if (A.linear) return A.hasInt ? 'bb' : 'simplex';
    if (!A.nonsmooth && !A.hasInt) return 'alm';
    return 'de';
  }

  const ENGINE_LABEL = { simplex: 'Simplex LP', bb: 'Branch & Bound', alm: 'ALM + L-BFGS', de: 'Differential Evolution' };

  function buildLP(C, A, withTarget) {
    const rows = [];
    const src = [];
    A.rowsIdx.forEach((ri, k) => {
      const L = A.rowLin[k];
      const idx = [], val = [];
      for (const [j, a] of L.m) { idx.push(j); val.push(a); }
      rows.push({ idx, val, op: C.rows[ri].op, rhs: -L.c });
      src.push(ri);
    });
    const c = new Float64Array(C.n);
    let c0 = 0, maximize = C.sense === 'max';
    if (C.sense === 'target') {
      maximize = false;
      if (withTarget && A.goalLin) {
        const idx = [], val = [];
        for (const [j, a] of A.goalLin.m) { idx.push(j); val.push(a); }
        rows.push({ idx, val, op: '=', rhs: C.target - A.goalLin.c });
        src.push(-1);
      }
    } else {
      for (const [j, a] of A.goalLin.m) c[j] = a;
      c0 = A.goalLin.c;
    }
    return { n: C.n, c, c0, rows, src, lower: C.lower, upper: C.upper, maximize, integerHint: C.integer };
  }

  function makeNL(C, A, settings) {
    const rowsIdx = A.rowsIdx;
    const roots = [C.goalRoot >= 0 ? C.goalRoot : C.ir.k(0)].concat(rowsIdx.map((i) => C.rows[i].g));
    const fn = C.ir.compile(roots);
    const ops = rowsIdx.map((i) => C.rows[i].op);
    const T = C.ir.evaluate(C.init);
    const scale = new Float64Array(rowsIdx.length);
    rowsIdx.forEach((ri, k) => {
      const r = C.rows[ri];
      scale[k] = Math.max(1, Math.abs(T[r.rhs]) , Math.abs(T[r.lhs]) * 1e-3);
    });
    let objective, dobj;
    if (C.sense === 'max') { objective = (f) => -f; dobj = () => -1; }
    else if (C.sense === 'min') { objective = (f) => f; dobj = () => 1; }
    else { const t = C.target; objective = (f) => (f - t) * (f - t); dobj = (f) => 2 * (f - t); }
    const P = E.NLProblem({ n: C.n, fn, m: rowsIdx.length, ops, lower: C.lower, upper: C.upper, objective, scale, feasTol: Math.max(1e-7, Math.sqrt(settings.tol) * 0.1) });
    return { P, dobj };
  }

  function Reporter(post, t0) {
    let last = 0;
    const history = [];
    let lastIter = 0;
    return {
      history,
      push(iter, best, violation, force) {
        const now = Date.now();
        if (Number.isFinite(best)) {
          if (history.length < 2000) history.push(best);
          else history[history.length - 1] = best;
        }
        lastIter = iter;
        if (post && (force || now - last >= 50)) {
          last = now;
          post({ iter, best, violation, ms: now - t0 });
        }
      },
      get iter() { return lastIter; }
    };
  }

  function rowReport(C, x, rowsIdx, duals, rng) {
    const T = C.ir.evaluate(x);
    const out = [];
    const tolOf = (a, b) => 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
    rowsIdx.forEach((ri, k) => {
      const r = C.rows[ri];
      const lhs = T[r.lhs], rhs = T[r.rhs];
      let slack;
      if (r.op === '<=') slack = rhs - lhs;
      else if (r.op === '>=') slack = lhs - rhs;
      else slack = -Math.abs(lhs - rhs);
      const tol = tolOf(lhs, rhs) * 10;
      const ok = slack >= -Math.max(tol, 1e-6);
      out.push({
        row: ri, id: r.cid, elem: r.elem, label: E.rowName(r, C.ruleInfo[r.cid]), op: r.op,
        lhs: clean(lhs), rhs: clean(rhs), slack: clean(r.op === '=' ? Math.abs(lhs - rhs) : slack),
        binding: Math.abs(lhs - rhs) <= Math.max(tol, 1e-6) , ok,
        dual: duals ? clean(duals[k]) : null,
        range: rng && rng[k] ? { inc: clean(rng[k].inc), dec: clean(rng[k].dec) } : null
      });
    });
    return { rows: out, goal: C.goalRoot >= 0 ? T[C.goalRoot] : NaN };
  }

  function clean(v) {
    if (!Number.isFinite(v)) return v;
    if (Math.abs(v) < 1e-11) return 0;
    const r = Math.round(v);
    if (Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v))) return r;
    return v;
  }

  function diagnoseLP(C, A, deadline) {
    const groups = [];
    const byCid = new Map();
    A.rowsIdx.forEach((ri, k) => {
      const cid = C.rows[ri].cid;
      if (!byCid.has(cid)) { byCid.set(cid, groups.length); groups.push({ cid, ks: [] }); }
      groups[byCid.get(cid)].ks.push(k);
    });
    const P0 = buildLP(C, A, true);
    const targetRow = C.sense === 'target' ? P0.rows.length - 1 : -1;
    const feasible = (keep, freeBounds) => {
      const rows = [];
      keep.forEach((gi) => groups[gi].ks.forEach((k) => rows.push(P0.rows[k])));
      if (targetRow >= 0) rows.push(P0.rows[targetRow]);
      const P = { n: P0.n, c: new Float64Array(P0.n), c0: 0, rows, lower: P0.lower, upper: P0.upper, maximize: false };
      if (freeBounds) { P.lower = new Float64Array(P0.n).fill(-Infinity); P.upper = new Float64Array(P0.n).fill(Infinity); }
      const r = E.solveLP(P, { deadline });
      return r.status !== 'infeasible';
    };
    if (feasible([], false) === false) {
      return { kind: 'bounds', rules: [], message: 'The bounds on the decisions contradict each other or the target.' };
    }
    let set = groups.map((_, i) => i);
    if (feasible(set, false)) return null;
    for (let i = 0; i < set.length && Date.now() < deadline;) {
      const trial = set.slice(0, i).concat(set.slice(i + 1));
      if (!feasible(trial, false)) set = trial; else i++;
    }
    const rules = set.map((gi) => groups[gi].cid);
    const withBounds = feasible(set, true);
    const fixes = relaxLP(C, A, Math.max(deadline, Date.now() + 1500)) || [];
    return { kind: 'rules', rules, withBounds, exact: Date.now() < deadline, fixes };
  }

  function relaxLP(C, A, deadline) {
    try {
      const P0 = buildLP(C, A, true);
      const n = P0.n;
      let N = n;
      const lower = Array.from(P0.lower), upper = Array.from(P0.upper);
      const rows = [], cols = [], cost = [];
      P0.rows.forEach((r) => {
        const idx = Array.from(r.idx), val = Array.from(r.val);
        const w = 1 / Math.max(1, Math.abs(r.rhs));
        const mine = [];
        if (r.op === '<=' || r.op === '=') { idx.push(N); val.push(-1); mine.push([N, 1]); lower.push(0); upper.push(Infinity); cost.push(w); N++; }
        if (r.op === '>=' || r.op === '=') { idx.push(N); val.push(1); mine.push([N, -1]); lower.push(0); upper.push(Infinity); cost.push(w); N++; }
        rows.push({ idx, val, op: r.op, rhs: r.rhs });
        cols.push(mine);
      });
      const c = new Float64Array(N);
      cost.forEach((w, i) => { c[n + i] = w; });
      const r = E.solveLP({ n: N, c, c0: 0, rows, lower: Float64Array.from(lower), upper: Float64Array.from(upper), maximize: false }, { deadline });
      if (r.status !== 'optimal' || !r.x) return null;
      const by = new Map();
      cols.forEach((mine, k) => {
        const ri = P0.src[k];
        for (const [j, dir] of mine) {
          const a = r.x[j];
          if (!(a > 1e-7)) continue;
          const id = ri >= 0 ? C.rows[ri].cid : '__target';
          const cur = by.get(id);
          if (!cur) by.set(id, { id, amount: clean(a), dir, op: ri >= 0 ? C.rows[ri].op : '=', count: 1 });
          else { cur.count++; if (a > cur.amount) { cur.amount = clean(a); cur.dir = dir; } }
        }
      });
      return [...by.values()];
    } catch (e) { return null; }
  }

  function fixesFromReport(rows) {
    const by = new Map();
    rows.forEach((r) => {
      if (r.ok) return;
      const d = r.lhs - r.rhs;
      const amount = clean(Math.abs(d));
      const dir = d > 0 ? 1 : -1;
      const cur = by.get(r.id);
      if (!cur) by.set(r.id, { id: r.id, amount, dir, op: r.op, count: 1, approximate: true });
      else { cur.count++; if (amount > cur.amount) { cur.amount = amount; cur.dir = dir; } }
    });
    return [...by.values()];
  }

  function diagnoseNL(C, A, x) {
    const rep = rowReport(C, x, A.rowsIdx, null);
    const bad = [...new Set(rep.rows.filter((r) => !r.ok).map((r) => r.id))];
    return { kind: 'rules', rules: bad, withBounds: false, approximate: true, fixes: fixesFromReport(rep.rows) };
  }

  function growingLP(C, A, deadline) {
    try {
      const LP = buildLP(C, A, true);
      const BIG = 1e7;
      const lo = Float64Array.from(LP.lower, (v) => Math.max(v, -BIG));
      const hi = Float64Array.from(LP.upper, (v) => Math.min(v, BIG));
      const r = E.solveLP(Object.assign({}, LP, { lower: lo, upper: hi }), { deadline });
      if (!r.x) return [];
      const out = [];
      for (let j = 0; j < C.n && out.length < 50; j++) {
        const x = r.x[j];
        if ((x >= BIG * 0.999 && LP.upper[j] === Infinity) || (x <= -BIG * 0.999 && LP.lower[j] === -Infinity)) out.push(j);
      }
      return out;
    } catch (e) { return []; }
  }

  function intPolish(P, C, A, start, settings, deadline, dobj) {
    const isInt = C.integer;
    const n = C.n;
    const ints = [];
    for (let j = 0; j < n; j++) if (isInt[j]) ints.push(j);
    let cur = { x: Float64Array.from(start.x), f: start.f, v: start.v };
    if (!ints.length || ints.length > 400) return { best: cur, moves: 0 };
    const anyReal = ints.length < n;
    const smooth = !A.nonsmooth;
    const at = (y) => {
      if (anyReal && smooth) {
        const lo = Float64Array.from(P.lower), hi = Float64Array.from(P.upper);
        for (const j of ints) { lo[j] = y[j]; hi[j] = y[j]; }
        const pol = E.alm(P, y, { tol: Math.max(settings.tol, 1e-9), deadline, dobj, lower: lo, upper: hi, maxIt: 300 });
        const sc = P.score(pol.x);
        return { x: pol.x, f: sc.f, v: sc.worst };
      }
      const sc = P.score(y);
      return { x: Float64Array.from(y), f: sc.f, v: sc.worst };
    };
    const inBox = (y, j) => y[j] >= P.lower[j] - 1e-9 && y[j] <= P.upper[j] + 1e-9;
    let moves = 0;
    for (let round = 0; round < 60 && Date.now() < deadline; round++) {
      let improved = false;
      for (const j of ints) {
        for (const d of [-1, 1]) {
          const y = Float64Array.from(cur.x);
          y[j] = Math.round(y[j]) + d;
          if (!inBox(y, j)) continue;
          const c = at(y);
          if (E.betterPoint(c, cur, P.feasTol)) { cur = c; improved = true; moves++; }
        }
        if (Date.now() > deadline) break;
      }
      if (!improved && ints.length <= 40) {
        for (let a = 0; a < ints.length && !improved && Date.now() < deadline; a++) {
          for (let b = 0; b < ints.length && !improved; b++) {
            if (a === b) continue;
            const y = Float64Array.from(cur.x);
            const ja = ints[a], jb = ints[b];
            y[ja] = Math.round(y[ja]) + 1; y[jb] = Math.round(y[jb]) - 1;
            if (!inBox(y, ja) || !inBox(y, jb)) continue;
            const c = at(y);
            if (E.betterPoint(c, cur, P.feasTol)) { cur = c; improved = true; moves++; }
          }
        }
      }
      if (!improved) break;
    }
    return { best: cur, moves };
  }

  function solveCompiled(C, settingsIn, post) {
    const t0 = Date.now();
    const settings = resolveSettings(settingsIn);
    const deadline = t0 + settings.timeLimit * 1000;
    const R = Reporter(post, t0);
    const done = (res) => Object.assign({ ms: Date.now() - t0, history: R.history, iterations: R.iter }, res);

    if (C.errorCount) return done({ status: 'error', message: 'Fix the highlighted lines first', engine: null });
    if (C.n === 0) return done({ status: 'error', message: 'Add at least one decision to solve for', engine: null });
    if (C.sense === 'target' && C.target == null) return done({ status: 'error', message: 'Enter a target value', engine: null });
    if (C.goalRoot < 0 && C.sense !== 'target') {
      if (!C.rows.some((r) => r.enabled)) return done({ status: 'error', message: 'Write a goal or at least one rule', engine: null });
    }

    const A = analyze(C);
    const engine = chooseEngine(A, settings);
    if (!engine) return done({ status: 'error', message: 'Simplex needs every line to be linear. Switch the engine to Auto.', engine: null, nonlinearRules: A.nonlinearRules });

    const pack = (status, x, extra) => {
      const rg = extra && extra.ranging && !extra.ranging.skipped ? extra.ranging : null;
      const rep = x ? rowReport(C, x, A.rowsIdx, extra && extra.duals, rg ? rg.rows : null) : { rows: [], goal: NaN };
      const values = x ? Array.from(x, clean) : null;
      return done(Object.assign({
        status, engine, engineLabel: ENGINE_LABEL[engine], objective: x ? clean(rep.goal) : null,
        values, constraints: rep.rows, reducedCosts: extra && extra.reduced ? Array.from(extra.reduced, clean) : null,
        costRanges: rg ? rg.cols.map((c) => ({ inc: clean(c.inc), dec: clean(c.dec) })) : null,
        objWeights: rg && C.sense !== 'target' ? Array.from(A.goalLin ? (() => { const w = new Array(C.n).fill(0); for (const [j, a] of A.goalLin.m) w[j] = clean(a); return w; })() : []) : null,
        rangingNote: extra && extra.ranging && extra.ranging.skipped ? extra.ranging.reason : null,
        iterations: extra && extra.iterations, sense: C.sense, target: C.target
      }, extra && extra.more));
    };

    if (engine === 'simplex' || engine === 'bb') {
      const LP = buildLP(C, A, true);
      if (C.sense === 'target' && !A.goalLinear) return done({ status: 'error', message: 'Goal is nonlinear', engine });
      let r;
      if (engine === 'simplex') {
        r = E.solveLP(LP, { deadline, maxIter: settings.maxIter, method: settings.lpMethod === 'dense' ? 'dense' : 'auto', ranging: settings.ranging && C.sense !== 'target' });
        if (settings.ranging && C.sense !== 'target' && r.status === 'optimal' && !r.ranging && r.method === 'dense') r.ranging = { skipped: true, reason: 'Ranging needs the revised simplex (switch LP method to Auto)' };
        R.push(r.iterations, r.obj, 0, true);
      } else {
        const isInt = C.integer;
        r = E.branchAndBound(LP, isInt, { deadline, nodeLimit: settings.nodeLimit, gap: settings.gap, maxIter: settings.maxIter, presolve: settings.presolve, cuts: settings.cuts, classic: settings.lpMethod === 'dense' }, (ev) => {
          if (ev.incumbent !== undefined) R.push(ev.nodes, ev.incumbent, 0, true);
          else if (post) R.push(ev.nodes, R.history.length ? R.history[R.history.length - 1] : NaN, NaN, false);
        });
      }
      const iters = engine === 'bb' ? r.iterations : r.iterations;
      const metric = engine === 'bb' ? { nodes: r.nodes, pivots: r.iterations, gap: r.gap, mip: r.stats || null } : { pivots: r.iterations, lpMethod: r.method || 'dense', lu: r.lu || null };
      if (r.status === 'optimal' || r.status === 'feasible') {
        const duals = engine === 'simplex' && r.duals ? Float64Array.from(A.rowsIdx.map((_, k) => r.duals[k])) : null;
        return pack(r.status, r.x, { duals, reduced: engine === 'simplex' ? r.reduced : null, ranging: engine === 'simplex' ? r.ranging : null, iterations: iters, more: metric });
      }
      if (r.status === 'unbounded') return pack('unbounded', null, { iterations: iters, more: Object.assign({ growing: growingLP(C, A, Date.now() + 2000) }, metric) });
      if (r.status === 'limit' || r.status === 'stopped') return pack('stopped', null, { iterations: iters, more: Object.assign({ message: 'Hit the time or node limit before finding a solution' }, metric) });
      let diagnosis = null;
      if (engine === 'bb') {
        const relaxed = E.solveLP(LP, { deadline: Date.now() + 3000 });
        if (relaxed.status === 'infeasible') diagnosis = diagnoseLP(C, A, Date.now() + 3000);
        else diagnosis = { kind: 'integer', rules: [], message: 'The rules can be met with fractional values, but not with whole numbers.' };
      } else diagnosis = diagnoseLP(C, A, Date.now() + 3000);
      return pack('infeasible', null, { iterations: iters, more: Object.assign({ diagnosis }, metric) });
    }

    const { P, dobj } = makeNL(C, A, settings);
    const report = (it, s) => R.push(it, s.f === undefined ? NaN : sign(C, s.f), s.v, false);
    let best, more = {};
    if (engine === 'alm') {
      const ms = E.multistart(P, C.init, { seed: settings.seed, multistart: settings.multistart, tol: settings.tol, deadline, dobj, maxIt: Math.min(settings.maxIter, 5000) }, report);
      best = ms.best;
      more = { starts: ms.starts, inner: ms.iters };
      R.push(ms.iters, sign(C, best.f), best.v, true);
    } else {
      const isInt = C.integer;
      const deBudget = Date.now() + (deadline - Date.now()) * 0.8;
      const de = E.evolve(P, C.init, isInt, { seed: settings.seed, patience: settings.patience, deadline: deBudget }, report);
      best = de.best;
      more = { generations: de.gens, population: de.popSize };
      if (!A.nonsmooth || true) {
        const lo = Float64Array.from(P.lower), hi = Float64Array.from(P.upper);
        let anyReal = false;
        for (let j = 0; j < C.n; j++) {
          if (isInt[j]) { lo[j] = best.x[j]; hi[j] = best.x[j]; } else anyReal = true;
        }
        if (anyReal && !A.nonsmooth) {
          const pol = E.alm(P, best.x, { tol: settings.tol, deadline, dobj, lower: lo, upper: hi, maxIt: 2000 });
          const sc = P.score(pol.x);
          const cand = { x: pol.x, f: sc.f, v: sc.worst };
          if (E.betterPoint(cand, best, P.feasTol)) { best = cand; more.polished = true; }
        }
      }
      if (A.hasInt) {
        const lp = intPolish(P, C, A, best, settings, deadline, dobj);
        if (lp.moves && E.betterPoint(lp.best, best, P.feasTol)) { best = lp.best; more.polished = true; more.localMoves = lp.moves; }
      }
      R.push(more.generations, sign(C, best.f), best.v, true);
    }
    const feasible = best.v <= P.feasTol * 10;
    const goalVal = C.ir.evaluate(best.x)[C.goalRoot >= 0 ? C.goalRoot : 0];
    if (feasible && C.sense !== 'target' && Math.abs(goalVal) > 1e14) {
      const growing = [];
      for (let j = 0; j < C.n && growing.length < 50; j++) if (Math.abs(best.x[j]) > 1e6) growing.push(j);
      return pack('unbounded', null, { iterations: R.iter, more: Object.assign({ growing }, more) });
    }
    if (!feasible) {
      const diagnosis = diagnoseNL(C, A, best.x);
      const r = pack('infeasible', best.x, { iterations: R.iter, more: Object.assign({ diagnosis, leastViolation: best.v }, more) });
      r.values = Array.from(best.x, clean);
      return r;
    }
    let status = engine === 'alm' ? 'optimal' : 'feasible';
    if (C.sense === 'target') {
      const miss = Math.abs(goalVal - C.target);
      more.targetMiss = clean(miss);
      if (miss > 1e-6 * Math.max(1, Math.abs(C.target))) status = 'feasible';
      else status = 'optimal';
    }
    if (Date.now() > deadline) more.timedOut = true;
    return pack(status, best.x, { iterations: R.iter, more });
  }

  function sign(C, f) {
    if (C.sense === 'max') return -f;
    return f;
  }

  function solve(model, settings, post) {
    const s = resolveSettings(settings);
    const C = E.compile(model, { nonNegative: s.nonNegative !== false });
    const r = solveCompiled(C, s, post);
    r.layout = C.vars.map((v) => ({ id: v.id, name: v.name, offset: v.offset, size: v.size, shape: v.shape, labels: v.labels, type: v.type }));
    r.bounds = { lower: Array.from(C.lower), upper: Array.from(C.upper) };
    return r;
  }

  function classify(C, settings) {
    if (C.errorCount || C.n === 0) return null;
    try {
      const A = analyze(C);
      const engine = chooseEngine(A, resolveSettings(settings));
      return { engine, label: engine ? ENGINE_LABEL[engine] : null, linear: A.linear, hasInt: A.hasInt, nonsmooth: A.nonsmooth, nonlinearRules: A.nonlinearRules };
    } catch (e) { return null; }
  }

  function check(C, x) {
    const v = x || C.init;
    const T = C.ir.evaluate(v);
    const rules = {};
    for (const cid in C.ruleInfo) {
      const info = C.ruleInfo[cid];
      let worst = 0, off = 0, minSlack = Infinity, binding = 0;
      for (let i = info.start; i < info.start + info.count; i++) {
        const r = C.rows[i];
        const l = T[r.lhs], h = T[r.rhs];
        const tol = 1e-7 * Math.max(1, Math.abs(l), Math.abs(h));
        let slack = r.op === '<=' ? h - l : r.op === '>=' ? l - h : -Math.abs(l - h);
        if (!Number.isFinite(slack)) slack = -Infinity;
        if (slack < -tol) { off++; worst = Math.max(worst, -slack); }
        else if (Math.abs(l - h) <= tol) binding++;
        if (slack < minSlack) minSlack = slack;
      }
      const scalar = info.parts > 1 ? info.count / info.parts : info.count;
      rules[cid] = { count: info.count, scalar, off, worst: clean(worst), slack: clean(Math.max(0, minSlack)), binding, enabled: info.enabled };
    }
    return { goal: C.goalRoot >= 0 ? clean(T[C.goalRoot]) : null, rules };
  }

  function sanitize(s) {
    return String(s).replace(/[^A-Za-z0-9_.]/g, '_').replace(/^([0-9.])/, '_$1');
  }

  function toLP(model, settings) {
    const s = resolveSettings(settings);
    const C = E.compile(model, { nonNegative: s.nonNegative !== false });
    if (C.errorCount) return { error: 'Fix the highlighted lines first' };
    const A = analyze(C);
    if (!A.linear) return { error: 'CPLEX .lp export needs a linear model' };
    const LP = buildLP(C, A, true);
    const names = [];
    C.vars.forEach((v) => {
      for (let i = 0; i < v.size; i++) {
        if (v.size === 1) names.push(sanitize(v.name));
        else if (v.shape.length === 2) names.push(sanitize(`${v.name}_${Math.floor(i / v.shape[1]) + 1}_${(i % v.shape[1]) + 1}`));
        else names.push(sanitize(`${v.name}_${i + 1}`));
      }
    });
    const num = (x) => {
      const r = Math.round(x);
      if (Math.abs(x - r) < 1e-12) return String(r);
      return String(+x.toPrecision(15));
    };
    const expr = (idx, val) => {
      if (!idx.length) return '0 ' + names[0];
      return idx.map((j, k) => {
        const a = val[k];
        const sg = a < 0 ? '- ' : '+ ';
        const mag = Math.abs(a) === 1 ? '' : num(Math.abs(a)) + ' ';
        return sg + mag + names[j];
      }).join(' ').replace(/^\+ /, '');
    };
    const wrap = (line) => {
      const out = [];
      let cur = '';
      for (const w of line.split(' ')) {
        if ((cur + ' ' + w).length > 250) { out.push(cur); cur = '  ' + w; } else cur = cur ? cur + ' ' + w : w;
      }
      out.push(cur);
      return out.join('\n');
    };
    const L = [];
    L.push('\\ ' + (model.name || 'Nadir model'));
    L.push('\\ Exported by Nadir');
    L.push(LP.maximize ? 'Maximize' : 'Minimize');
    const cidx = [], cval = [];
    for (let j = 0; j < C.n; j++) if (LP.c[j]) { cidx.push(j); cval.push(LP.c[j]); }
    L.push(wrap(' obj: ' + (cidx.length ? expr(cidx, cval) : '0 ' + names[0]) + (LP.c0 ? (LP.c0 < 0 ? ' - ' : ' + ') + num(Math.abs(LP.c0)) : '')));
    L.push('Subject To');
    const used = new Set();
    LP.rows.forEach((r, k) => {
      const ri = LP.src[k];
      let nm = ri >= 0 ? sanitize(E.rowName(C.rows[ri], C.ruleInfo[C.rows[ri].cid])) : 'target';
      while (used.has(nm)) nm += '_';
      used.add(nm);
      const op = r.op === '=' ? '=' : r.op;
      L.push(wrap(' ' + nm + ': ' + expr(r.idx, r.val) + ' ' + op + ' ' + num(r.rhs)));
    });
    L.push('Bounds');
    for (let j = 0; j < C.n; j++) {
      const lo = C.lower[j], hi = C.upper[j];
      if (lo === -Infinity && hi === Infinity) L.push(' ' + names[j] + ' free');
      else if (lo === hi) L.push(' ' + names[j] + ' = ' + num(lo));
      else {
        const a = lo === -Infinity ? '-inf' : num(lo);
        const b = hi === Infinity ? '+inf' : num(hi);
        L.push(' ' + a + ' <= ' + names[j] + ' <= ' + b);
      }
    }
    const gen = [], bin = [];
    C.vars.forEach((v) => {
      for (let i = 0; i < v.size; i++) {
        if (v.type === 'int') gen.push(names[v.offset + i]);
        if (v.type === 'bin') bin.push(names[v.offset + i]);
      }
    });
    if (gen.length) { L.push('General'); L.push(wrap(' ' + gen.join(' '))); }
    if (bin.length) { L.push('Binary'); L.push(wrap(' ' + bin.join(' '))); }
    L.push('End');
    return { text: L.join('\n') + '\n' };
  }

  function withParam(model, name, value) {
    const m = JSON.parse(JSON.stringify(model));
    const p = (m.parameters || []).find((q) => q.name === name);
    if (p) p.expr = String(value);
    return m;
  }

  function sweep(model, settings, param, values, post, onStep) {
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const r = solve(withParam(model, param, values[i]), Object.assign({}, settings, { timeLimit: Math.min(resolveSettings(settings).timeLimit, 5) }), null);
      const step = { i, param: values[i], status: r.status, objective: r.objective, values: r.values, ms: r.ms };
      out.push(step);
      if (onStep) onStep(step);
    }
    return out;
  }

  function workerMain(scope) {
    scope.onmessage = (ev) => {
      const msg = ev.data || {};
      const runId = msg.runId;
      try {
        if (msg.type === 'solve') {
          const result = E.solve(msg.model, msg.settings, (p) => scope.postMessage(Object.assign({ type: 'progress', runId }, p)));
          scope.postMessage({ type: 'done', runId, result });
        } else if (msg.type === 'sweep') {
          const steps = E.sweep(msg.model, msg.settings, msg.param, msg.values, null, (step) => scope.postMessage({ type: 'step', runId, step }));
          scope.postMessage({ type: 'done', runId, result: { steps } });
        }
      } catch (e) {
        scope.postMessage({ type: 'error', runId, message: e && e.message ? e.message : String(e) });
      }
    };
  }

  E.PRESETS = PRESETS;
  E.DEFAULT_SETTINGS = DEFAULTS;
  E.resolveSettings = resolveSettings;
  E.solve = solve;
  E.solveCompiled = solveCompiled;
  E.classify = classify;
  E.check = check;
  E.toLP = toLP;
  E.sweep = sweep;
  E.withParam = withParam;
  E.workerMain = workerMain;
  E.ENGINE_LABEL = ENGINE_LABEL;
  E.cleanNumber = clean;
});
