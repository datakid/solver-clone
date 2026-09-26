NadirEngine.define('mip', function (E) {
  'use strict';

  const ITOL = 1e-6;
  const isIntVal = (v) => Math.abs(v - Math.round(v)) <= 1e-9 * Math.max(1, Math.abs(v));

  function activity(r, lo, up) {
    let mn = 0, mx = 0, mnInf = 0, mxInf = 0;
    for (let k = 0; k < r.idx.length; k++) {
      const j = r.idx[k], a = r.val[k];
      if (a > 0) {
        if (lo[j] === -Infinity) mnInf++; else mn += a * lo[j];
        if (up[j] === Infinity) mxInf++; else mx += a * up[j];
      } else {
        if (up[j] === Infinity) mnInf++; else mn += a * up[j];
        if (lo[j] === -Infinity) mxInf++; else mx += a * lo[j];
      }
    }
    return { mn, mx, mnInf, mxInf };
  }

  function propagate(rows, lo, up, isInt, opt) {
    const o = opt || {};
    const passes = o.passes || 6;
    const only = o.rows || null;
    let changes = 0;
    const tighten = (j, nl, nu) => {
      let ch = false;
      if (nl > lo[j]) {
        if (isInt[j]) nl = Math.ceil(nl - 1e-6);
        const gain = nl - lo[j];
        if (isInt[j] ? gain >= 1 - 1e-9 || lo[j] === -Infinity : gain > 1e-3 * Math.max(1, Math.abs(nl)) || lo[j] === -Infinity) { lo[j] = nl; ch = true; }
      }
      if (nu < up[j]) {
        if (isInt[j]) nu = Math.floor(nu + 1e-6);
        const gain = up[j] - nu;
        if (isInt[j] ? gain >= 1 - 1e-9 || up[j] === Infinity : gain > 1e-3 * Math.max(1, Math.abs(nu)) || up[j] === Infinity) { up[j] = nu; ch = true; }
      }
      if (lo[j] > up[j]) {
        if (lo[j] - up[j] <= 1e-7 * Math.max(1, Math.abs(lo[j]))) { if (isInt[j]) return 'bad'; up[j] = lo[j]; }
        else return 'bad';
      }
      return ch;
    };
    for (let pass = 0; pass < passes; pass++) {
      let passCh = 0;
      const list = only || rows;
      for (let ri = 0; ri < list.length; ri++) {
        const r = list[ri];
        if (r.dead) continue;
        const A = activity(r, lo, up);
        const b = r.rhs;
        const tol = 1e-7 * Math.max(1, Math.abs(b));
        if ((r.op === '<=' || r.op === '=') && A.mnInf === 0 && A.mn > b + tol * 10) return { infeasible: true, changes };
        if ((r.op === '>=' || r.op === '=') && A.mxInf === 0 && A.mx < b - tol * 10) return { infeasible: true, changes };
        if (r.idx.length > 60 && pass > 0) continue;
        for (let k = 0; k < r.idx.length; k++) {
          const j = r.idx[k], a = r.val[k];
          if (Math.abs(a) < 1e-9) continue;
          if (r.op === '<=' || r.op === '=') {
            let rest;
            const own = a > 0 ? lo[j] : up[j];
            if (own === -Infinity || own === Infinity) rest = A.mnInf === 1 ? A.mn : null;
            else rest = A.mnInf === 0 ? A.mn - a * own : null;
            if (rest !== null) {
              const bound = (b - rest) / a;
              const res = a > 0 ? tighten(j, -Infinity, bound) : tighten(j, bound, Infinity);
              if (res === 'bad') return { infeasible: true, changes };
              if (res) { changes++; passCh++; }
            }
          }
          if (r.op === '>=' || r.op === '=') {
            let rest;
            const own = a > 0 ? up[j] : lo[j];
            if (own === -Infinity || own === Infinity) rest = A.mxInf === 1 ? A.mx : null;
            else rest = A.mxInf === 0 ? A.mx - a * own : null;
            if (rest !== null) {
              const bound = (b - rest) / a;
              const res = a > 0 ? tighten(j, bound, Infinity) : tighten(j, -Infinity, bound);
              if (res === 'bad') return { infeasible: true, changes };
              if (res) { changes++; passCh++; }
            }
          }
        }
      }
      if (!passCh) break;
    }
    return { infeasible: false, changes };
  }

  function presolve(P, isInt) {
    const n = P.n;
    const lo = Float64Array.from(P.lower), up = Float64Array.from(P.upper);
    for (let j = 0; j < n; j++) if (isInt[j]) { lo[j] = Math.ceil(lo[j] - 1e-9); up[j] = Math.floor(up[j] + 1e-9); if (lo[j] > up[j]) return { infeasible: true }; }
    const rows = P.rows.map((r) => {
      const acc = new Map();
      for (let k = 0; k < r.idx.length; k++) if (r.val[k] !== 0) acc.set(r.idx[k], (acc.get(r.idx[k]) || 0) + r.val[k]);
      const idx = [], val = [];
      for (const [j, a] of acc) if (Math.abs(a) > 1e-12) { idx.push(j); val.push(a); }
      return { idx, val, op: r.op, rhs: r.rhs };
    });
    const stats = { rowsIn: rows.length, rowsRemoved: 0, boundsTightened: 0, singletons: 0, fixed: 0, coefTightened: 0 };
    for (const r of rows) {
      if (r.idx.length === 0) {
        const b = r.rhs, tol = 1e-7 * Math.max(1, Math.abs(b));
        const ok = r.op === '<=' ? b >= -tol : r.op === '>=' ? b <= tol : Math.abs(b) <= tol;
        if (!ok) return { infeasible: true };
        r.dead = true; stats.rowsRemoved++;
      } else if (r.idx.length === 1) {
        const j = r.idx[0], a = r.val[0], v = r.rhs / a;
        const cmp = a > 0 ? r.op : r.op === '<=' ? '>=' : r.op === '>=' ? '<=' : '=';
        let nl = lo[j], nu = up[j];
        if (cmp === '<=' || cmp === '=') nu = Math.min(nu, isInt[j] ? Math.floor(v + 1e-9) : v);
        if (cmp === '>=' || cmp === '=') nl = Math.max(nl, isInt[j] ? Math.ceil(v - 1e-9) : v);
        if (nl > up[j] + 1e-9 * Math.max(1, Math.abs(nl)) || nu < lo[j] - 1e-9 * Math.max(1, Math.abs(nu)) || nl > nu + 1e-9 * Math.max(1, Math.abs(nl))) return { infeasible: true };
        if (nl > lo[j]) stats.boundsTightened++;
        if (nu < up[j]) stats.boundsTightened++;
        lo[j] = nl; up[j] = Math.max(nl, nu);
        r.dead = true; stats.rowsRemoved++; stats.singletons++;
      }
    }
    const live = rows.filter((r) => !r.dead);
    const pr = propagate(live, lo, up, isInt, { passes: 10 });
    if (pr.infeasible) return { infeasible: true };
    stats.boundsTightened += pr.changes;
    for (const r of live) {
      const A = activity(r, lo, up);
      const tol = 1e-9 * Math.max(1, Math.abs(r.rhs));
      if (r.op === '<=' && A.mxInf === 0 && A.mx <= r.rhs + tol) { r.dead = true; stats.rowsRemoved++; continue; }
      if (r.op === '>=' && A.mnInf === 0 && A.mn >= r.rhs - tol) { r.dead = true; stats.rowsRemoved++; continue; }
      if (r.op === '<=' && A.mxInf === 0) {
        for (let k = 0; k < r.idx.length; k++) {
          const j = r.idx[k], a = r.val[k];
          if (!isInt[j] || lo[j] !== 0 || up[j] !== 1) continue;
          if (a <= 0) continue;
          const d = r.rhs - (A.mx - a);
          if (d > 1e-9 && d < a - 1e-9) {
            r.val[k] = a - d; r.rhs -= d;
            A.mx -= d;
            stats.coefTightened++;
          }
        }
      }
    }
    for (let j = 0; j < n; j++) if (lo[j] === up[j] && P.lower[j] !== P.upper[j]) stats.fixed++;
    const keep = rows.filter((r) => !r.dead).map((r) => ({ idx: r.idx, val: r.val, op: r.op, rhs: r.rhs }));
    stats.rowsOut = keep.length;
    return { infeasible: false, P: { n, c: P.c, c0: P.c0, rows: keep, lower: lo, upper: up, maximize: P.maximize, integerHint: P.integerHint }, stats };
  }

  function gomoryCuts(P, isInt, st, x, maxCuts) {
    const { n, m, lo, up, stat, head } = st;
    const S = E.REVISED;
    const rowInt = P.rows.map((r) => r.idx.every((j, k) => isInt[j] && isIntVal(r.val[k])) && isIntVal(r.rhs));
    const cand = [];
    for (let p = 0; p < m; p++) {
      const h = head[p];
      if (h >= n || !isInt[h]) continue;
      const v = st.x[h];
      const f0 = v - Math.floor(v);
      if (f0 < 0.01 || f0 > 0.99) continue;
      cand.push({ p, f0, score: Math.min(f0, 1 - f0) });
    }
    cand.sort((a, b) => b.score - a.score);
    const cuts = [];
    for (const c of cand.slice(0, maxCuts * 2)) {
      if (cuts.length >= maxCuts) break;
      const alpha = st.tableauRow(c.p);
      const f0 = c.f0;
      const coefT = new Map();
      let ok = true;
      for (let j = 0; j < n + m; j++) {
        if (stat[j] === S.BASIC) continue;
        const a = alpha[j];
        if (Math.abs(a) < 1e-11) continue;
        if (lo[j] === up[j]) continue;
        if (stat[j] === S.FREE) { ok = false; break; }
        const abar = stat[j] === S.LOW ? a : -a;
        const intT = j < n ? isInt[j] && isIntVal(lo[j] === -Infinity ? 0 : stat[j] === S.LOW ? lo[j] : up[j]) : rowInt[j - n] && isIntVal(stat[j] === S.LOW ? lo[j] : up[j]);
        let g;
        if (intT) { const fj = abar - Math.floor(abar); g = fj <= f0 ? fj / f0 : (1 - fj) / (1 - f0); }
        else g = abar >= 0 ? abar / f0 : -abar / (1 - f0);
        if (g > 1e-12) coefT.set(j, g);
      }
      if (!ok || !coefT.size) continue;
      const dense = new Float64Array(n);
      let rhs = 1;
      for (const [j, g] of coefT) {
        const atLow = stat[j] === S.LOW;
        if (j < n) {
          if (atLow) { dense[j] += g; rhs += g * lo[j]; }
          else { dense[j] -= g; rhs -= g * up[j]; }
        } else {
          const r = P.rows[j - n];
          const sgn = atLow ? 1 : -1;
          for (let k = 0; k < r.idx.length; k++) dense[r.idx[k]] += sgn * g * r.val[k];
          rhs += atLow ? g * lo[j] : -g * up[j];
        }
      }
      const idx = [], val = [];
      let mx = 0, mn = Infinity;
      for (let j = 0; j < n; j++) {
        const a = dense[j];
        if (Math.abs(a) > 1e-9) { idx.push(j); val.push(a); mx = Math.max(mx, Math.abs(a)); mn = Math.min(mn, Math.abs(a)); }
      }
      if (!idx.length || mx / mn > 1e6 || idx.length > Math.max(40, n * 0.6)) continue;
      let act = 0;
      for (let k = 0; k < idx.length; k++) act += val[k] * x[idx[k]];
      const viol = rhs - act;
      if (viol < 1e-5 * Math.max(1, Math.abs(rhs))) continue;
      const sc = 1 / mx;
      cuts.push({ idx, val: val.map((a) => a * sc), op: '>=', rhs: rhs * sc - 1e-9, cut: true, eff: viol * sc / Math.sqrt(val.reduce((s, a) => s + a * a * sc * sc, 0)) });
    }
    cuts.sort((a, b) => b.eff - a.eff);
    return cuts;
  }

  function roundAndFix(P, isInt, x, lo, up, deadline) {
    const L = Float64Array.from(lo), U = Float64Array.from(up);
    for (let j = 0; j < P.n; j++) if (isInt[j]) { const v = Math.min(U[j], Math.max(L[j], Math.round(x[j]))); L[j] = v; U[j] = v; }
    let allInt = true;
    for (let j = 0; j < P.n; j++) if (!isInt[j]) { allInt = false; break; }
    if (allInt) {
      for (const r of P.rows) {
        let s = 0;
        for (let k = 0; k < r.idx.length; k++) s += r.val[k] * L[r.idx[k]];
        const tol = 1e-7 * Math.max(1, Math.abs(r.rhs));
        if ((r.op === '<=' && s > r.rhs + tol) || (r.op === '>=' && s < r.rhs - tol) || (r.op === '=' && Math.abs(s - r.rhs) > tol)) return null;
      }
      let obj = P.c0 || 0;
      for (let j = 0; j < P.n; j++) obj += (P.c[j] || 0) * L[j];
      return { x: L, obj };
    }
    const r = E.solveLP(P, { lower: L, upper: U, deadline, maxIter: 5000 });
    return r.status === 'optimal' ? { x: r.x, obj: r.obj } : null;
  }

  function mip(P0, isInt, opt, onEvent) {
    const t0 = Date.now();
    const o = opt || {};
    const deadline = o.deadline || Infinity;
    const nodeLimit = o.nodeLimit || 100000;
    const gap = o.gap == null ? 1e-4 : o.gap;
    const dir = P0.maximize ? -1 : 1;
    const stats = { presolve: null, cuts: 0, cutRounds: 0, heuristic: 0, warm: 0 };
    let P = P0;
    if (o.presolve !== false) {
      const pre = presolve(P0, isInt);
      if (pre.infeasible) return { status: 'infeasible', nodes: 0, iterations: 0, stats: Object.assign(stats, { presolve: { infeasible: true } }) };
      P = pre.P;
      stats.presolve = pre.stats;
    } else P = Object.assign({}, P0, { rows: P0.rows.slice(), lower: Float64Array.from(P0.lower), upper: Float64Array.from(P0.upper) });

    const n = P.n;
    let nodes = 0, pivots = 0;
    let inc = null, incVal = Infinity;
    const integerObj = (() => {
      for (let j = 0; j < n; j++) {
        const cj = P.c[j] || 0;
        if (cj === 0) continue;
        if (!isInt[j] || !isIntVal(cj)) return false;
      }
      return isIntVal(P.c0 || 0);
    })();
    const pruneAt = () => {
      if (!inc) return Infinity;
      const tol = Math.max(1e-9, gap * Math.max(1, Math.abs(incVal)));
      return integerObj ? incVal - Math.max(tol, 1 - 1e-6) : incVal - tol;
    };
    const offer = (cand) => {
      if (!cand) return false;
      const v = cand.obj * dir;
      if (!inc || v < incVal - 1e-9 * Math.max(1, Math.abs(incVal))) {
        const x = Float64Array.from(cand.x);
        for (let j = 0; j < n; j++) if (isInt[j]) x[j] = Math.round(x[j]);
        inc = { x, obj: cand.obj }; incVal = v;
        if (onEvent) onEvent({ incumbent: cand.obj, nodes, ms: Date.now() - t0 });
        return true;
      }
      return false;
    };
    const fractional = (x) => {
      let bj = -1, bf = 0;
      for (let j = 0; j < n; j++) {
        if (!isInt[j]) continue;
        const f = x[j] - Math.floor(x[j]);
        const d = Math.min(f, 1 - f);
        if (d > ITOL && d > bf) { bf = d; bj = j; }
      }
      return bj;
    };

    let root = E.solveLP(P, { deadline, maxIter: o.maxIter });
    pivots += root.iterations || 0;
    if (root.status === 'limit') return { status: 'stopped', nodes: 0, iterations: pivots, stats };
    if (root.status === 'infeasible') return { status: 'infeasible', nodes: 1, iterations: pivots, stats };
    if (root.status === 'unbounded') return { status: 'unbounded', nodes: 1, iterations: pivots, stats };

    const cutOk = o.cuts !== false && n <= 3000 && P.rows.length <= 3000;
    if (cutOk) {
      const maxRounds = 4;
      let lastObj = root.obj * dir;
      for (let round = 0; round < maxRounds && Date.now() < deadline; round++) {
        if (fractional(root.x) < 0 || !root.state) break;
        const cuts = gomoryCuts(P, isInt, root.state, root.x, Math.min(40, Math.max(8, n >> 2)));
        if (!cuts.length) break;
        const rows = P.rows.concat(cuts);
        const next = E.solveLP(Object.assign({}, P, { rows }), { deadline, maxIter: o.maxIter, basis: root.basis });
        pivots += next.iterations || 0;
        if (next.status !== 'optimal') break;
        P = Object.assign({}, P, { rows });
        stats.cuts += cuts.length; stats.cutRounds++;
        root = next;
        const now = root.obj * dir;
        if (Math.abs(now - lastObj) < 1e-6 * Math.max(1, Math.abs(lastObj))) break;
        lastObj = now;
      }
    }
    if (fractional(root.x) < 0) offer(root);
    else if (offer(roundAndFix(P, isInt, root.x, P.lower, P.upper, deadline))) stats.heuristic++;

    const keepBasis = (P.n + P.rows.length) <= 6000;
    const stack = [];
    let heap = null;
    const add = (nd) => { if (heap) heap.push(nd); else stack.push(nd); };
    const next = () => (heap ? (heap.size ? heap.pop() : null) : (stack.length ? stack.pop() : null));
    const toHeap = () => { if (heap) return; heap = new E.Heap((q) => q.bound); for (const s of stack) heap.push(s); stack.length = 0; };
    if (inc) toHeap();
    let unbounded = false, stopped = false;

    function branch(nd, r) {
      const bj = fractional(r.x);
      const val = r.obj * dir;
      const v = r.x[bj];
      const basis = keepBasis ? r.basis : null;
      const down = { lo: Float64Array.from(nd.lo), hi: Float64Array.from(nd.hi), bound: val, depth: nd.depth + 1, basis, j: bj };
      down.hi[bj] = Math.floor(v);
      const up = { lo: Float64Array.from(nd.lo), hi: Float64Array.from(nd.hi), bound: val, depth: nd.depth + 1, basis, j: bj };
      up.lo[bj] = Math.ceil(v);
      if (v - Math.floor(v) >= 0.5) { add(down); add(up); } else { add(up); add(down); }
    }

    const rootNode = { lo: P.lower, hi: P.upper, bound: root.obj * dir, depth: 0 };
    nodes = 1;
    if (fractional(root.x) >= 0 && root.obj * dir < pruneAt()) branch(rootNode, root);

    for (;;) {
      if (nodes >= nodeLimit || Date.now() > deadline) { stopped = true; break; }
      const nd = next();
      if (!nd) break;
      if (nd.bound >= pruneAt()) continue;
      nodes++;
      const pr = propagate(P.rows, nd.lo, nd.hi, isInt, { passes: 2 });
      if (pr.infeasible) continue;
      const r = E.solveLP(P, { lower: nd.lo, upper: nd.hi, deadline, maxIter: o.maxIter, basis: nd.basis });
      if (r.warm) stats.warm++;
      pivots += r.iterations || 0;
      if (r.status === 'limit') { stopped = true; break; }
      if (r.status === 'infeasible') continue;
      if (r.status === 'unbounded') { if (!inc) { unbounded = true; break; } continue; }
      const val = r.obj * dir;
      if (val >= pruneAt()) continue;
      if (fractional(r.x) < 0) { offer(r); toHeap(); continue; }
      if ((nodes % 40 === 0 || (!inc && nd.depth % 6 === 0)) && offer(roundAndFix(P, isInt, r.x, nd.lo, nd.hi, deadline))) { stats.heuristic++; toHeap(); if (val >= pruneAt()) continue; }
      branch(nd, r);
      if (onEvent && (nodes & 31) === 0) onEvent({ nodes, ms: Date.now() - t0, bound: val });
    }
    let bestBound = incVal;
    if (heap && heap.size) bestBound = Math.min(bestBound, heap.a.reduce((mm, q) => Math.min(mm, q.bound), Infinity));
    if (!heap && stack.length) bestBound = -Infinity;
    const result = { nodes, iterations: pivots, stats };
    if (unbounded) return Object.assign(result, { status: 'unbounded' });
    if (!inc) return Object.assign(result, { status: stopped ? 'stopped' : 'infeasible' });
    const exhausted = !stopped || (!heap || !heap.size) && !stack.length;
    const gapNow = Number.isFinite(bestBound) ? Math.abs(incVal - bestBound) / Math.max(1, Math.abs(incVal)) : Infinity;
    return Object.assign(result, {
      status: exhausted || gapNow <= gap ? 'optimal' : 'feasible',
      x: inc.x, obj: inc.obj, duals: null, reduced: null,
      gap: exhausted ? 0 : gapNow
    });
  }

  E.presolveMIP = presolve;
  E.propagateBounds = propagate;
  E.gomoryCuts = gomoryCuts;
  E.solveMIP = mip;
});
