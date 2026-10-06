NadirEngine.define('lp', function (E) {
  'use strict';

  const PIV = 1e-9;
  const FEAS = 1e-7;

  function solveLP(P, opt) {
    const o = opt || {};
    const want = o.method || 'auto';
    const cells = P.rows.length * (P.n * 2 + P.rows.length * 2 + 1);
    if (want === 'dense') return solveDense(P, o);
    if (o.presolve && !o.basis && E.presolveLP) { const pr = E.presolveLP(P, o); if (pr) return pr; }
    let r;
    try { r = E.solveRevised(P, o); } catch (e) { r = { status: 'numerical', iterations: 0, error: e.message }; }
    if (r.status === 'numerical') {
      if (cells <= 2.5e7) { const d = solveDense(P, o); d.method = 'dense'; d.fallback = true; return d; }
      r.status = 'limit';
    }
    return r;
  }

  function solveDense(P, opt) {
    opt = opt || {};
    const maxIter = opt.maxIter || 50000;
    const deadline = opt.deadline || Infinity;
    const n = P.n;
    const lower = opt.lower || P.lower;
    const upper = opt.upper || P.upper;

    const col = new Int32Array(n), sgn = new Float64Array(n), off = new Float64Array(n), neg = new Int32Array(n).fill(-1);
    let nc = 0;
    const cons = [];
    for (let j = 0; j < n; j++) {
      const l = lower[j], u = upper[j];
      if (l > u + 1e-12) return { status: 'infeasible', iterations: 0 };
      if (l > -Infinity) {
        col[j] = nc++; sgn[j] = 1; off[j] = l;
        if (u < Infinity) cons.push({ idx: [col[j]], val: [1], op: '<=', rhs: u - l, src: -1 });
      } else if (u < Infinity) {
        col[j] = nc++; sgn[j] = -1; off[j] = u;
      } else {
        col[j] = nc++; sgn[j] = 1; off[j] = 0; neg[j] = nc++;
      }
    }
    const nBound = cons.length;
    P.rows.forEach((r, ri) => {
      let rhs = r.rhs;
      const acc = new Map();
      for (let k = 0; k < r.idx.length; k++) {
        const j = r.idx[k], a = r.val[k];
        rhs -= a * off[j];
        acc.set(col[j], (acc.get(col[j]) || 0) + a * sgn[j]);
        if (neg[j] >= 0) acc.set(neg[j], (acc.get(neg[j]) || 0) - a);
      }
      const idx = [], val = [];
      for (const [c, a] of acc) if (a !== 0) { idx.push(c); val.push(a); }
      if (idx.length === 0) {
        const ok = r.op === '<=' ? rhs >= -FEAS : r.op === '>=' ? rhs <= FEAS : Math.abs(rhs) <= FEAS;
        cons.push({ idx, val, op: r.op, rhs, src: ri, empty: true, ok });
        return;
      }
      cons.push({ idx, val, op: r.op, rhs, src: ri });
    });
    for (const c of cons) if (c.empty && !c.ok) return { status: 'infeasible', iterations: 0, trivial: c.src };

    const live = cons.filter((c) => !c.empty);
    const m = live.length;
    let ns = 0, na = 0;
    for (const c of live) {
      c.flip = c.rhs < 0;
      if (c.flip) { c.val = c.val.map((x) => -x); c.rhs = -c.rhs; c.op = c.op === '<=' ? '>=' : c.op === '>=' ? '<=' : '='; }
      if (c.op !== '=') ns++;
      if (c.op !== '<=') na++;
    }
    const S0 = nc, A0 = nc + ns, W = nc + ns + na + 1, RHS = W - 1;
    const Tb = new Array(m);
    const basis = new Int32Array(m);
    let si = S0, ai = A0;
    for (let i = 0; i < m; i++) {
      const c = live[i];
      const row = new Float64Array(W);
      for (let k = 0; k < c.idx.length; k++) row[c.idx[k]] = c.val[k];
      row[RHS] = c.rhs;
      c.slack = -1; c.art = -1;
      if (c.op === '<=') { row[si] = 1; c.slack = si; basis[i] = si++; }
      else if (c.op === '>=') { row[si] = -1; c.slack = si++; row[ai] = 1; c.art = ai; basis[i] = ai++; }
      else { row[ai] = 1; c.art = ai; basis[i] = ai++; }
      Tb[i] = row;
    }

    const cost = new Float64Array(W);
    const dir = P.maximize ? -1 : 1;
    for (let j = 0; j < n; j++) {
      const cj = (P.c[j] || 0) * dir;
      cost[col[j]] = cj * sgn[j];
      if (neg[j] >= 0) cost[neg[j]] = -cj;
    }

    let iterations = 0;
    const nzBuf = new Int32Array(W);

    function pivot(r, e, zs) {
      const pr = Tb[r];
      const inv = 1 / pr[e];
      let nz = 0;
      for (let j = 0; j < W; j++) {
        if (pr[j] !== 0) { pr[j] *= inv; if (Math.abs(pr[j]) < 1e-14) pr[j] = 0; else nzBuf[nz++] = j; }
      }
      pr[e] = 1;
      for (let i = 0; i < m; i++) {
        if (i === r) continue;
        const row = Tb[i];
        const f = row[e];
        if (f === 0) continue;
        for (let k = 0; k < nz; k++) { const j = nzBuf[k]; row[j] -= f * pr[j]; }
        row[e] = 0;
      }
      for (const z of zs) {
        const f = z[e];
        if (f === 0) continue;
        for (let k = 0; k < nz; k++) { const j = nzBuf[k]; z[j] -= f * pr[j]; }
        z[e] = 0;
      }
      basis[r] = e;
      iterations++;
    }

    function run(z, limitCol, extra) {
      let degenerate = 0;
      let bland = false;
      for (;;) {
        if (iterations >= maxIter) return 'limit';
        if ((iterations & 63) === 0 && Date.now() > deadline) return 'limit';
        let e = -1;
        if (bland) {
          for (let j = 0; j < limitCol; j++) if (z[j] < -PIV) { e = j; break; }
        } else {
          let best = -PIV;
          for (let j = 0; j < limitCol; j++) if (z[j] < best) { best = z[j]; e = j; }
        }
        if (e < 0) return 'optimal';
        let r = -1, rr = Infinity;
        for (let i = 0; i < m; i++) {
          const a = Tb[i][e];
          if (a > PIV) {
            const q = Tb[i][RHS] / a;
            if (q < rr - 1e-12 || (Math.abs(q - rr) <= 1e-12 && r >= 0 && basis[i] < basis[r])) { rr = q; r = i; }
          }
        }
        if (r < 0) return 'unbounded';
        if (rr < 1e-12) { if (++degenerate > 50) bland = true; } else { degenerate = 0; bland = false; }
        pivot(r, e, extra ? [z, extra] : [z]);
      }
    }

    const z2 = new Float64Array(W);
    for (let j = 0; j < W; j++) z2[j] = cost[j];
    for (let i = 0; i < m; i++) {
      const cb = cost[basis[i]];
      if (cb !== 0) { const row = Tb[i]; for (let j = 0; j < W; j++) z2[j] -= cb * row[j]; }
    }

    if (na > 0) {
      const z1 = new Float64Array(W);
      for (let i = 0; i < m; i++) {
        if (basis[i] >= A0) { const row = Tb[i]; for (let j = 0; j < W; j++) z1[j] -= row[j]; }
      }
      for (let j = A0; j < RHS; j++) z1[j] = 0;
      const s1 = run(z1, A0 + na, z2);
      if (s1 === 'limit') return { status: 'limit', iterations };
      let scale = 1;
      for (const c of live) scale = Math.max(scale, Math.abs(c.rhs));
      if (-z1[RHS] > FEAS * scale) return { status: 'infeasible', iterations, phase1: -z1[RHS] };
      for (let i = 0; i < m; i++) {
        if (basis[i] < A0) continue;
        let best = -1, bv = PIV;
        for (let j = 0; j < A0; j++) { const a = Math.abs(Tb[i][j]); if (a > bv) { bv = a; best = j; } }
        if (best >= 0) pivot(i, best, [z2]);
      }
    }

    const s2 = run(z2, A0, null);
    if (s2 === 'unbounded') return { status: 'unbounded', iterations };
    if (s2 === 'limit') return { status: 'limit', iterations };

    const xp = new Float64Array(nc + ns + na);
    for (let i = 0; i < m; i++) xp[basis[i]] = Tb[i][RHS];
    const x = new Float64Array(n);
    const reduced = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let v = off[j] + sgn[j] * xp[col[j]];
      if (neg[j] >= 0) v -= xp[neg[j]];
      if (P.integerHint && P.integerHint[j] && Math.abs(v - Math.round(v)) < 1e-9) v = Math.round(v);
      x[j] = v;
      reduced[j] = z2[col[j]] * sgn[j] * dir;
    }
    const duals = new Float64Array(P.rows.length);
    for (const c of live) {
      if (c.src < 0) continue;
      let y;
      if (c.op === '<=') y = -z2[c.slack];
      else if (c.op === '>=') y = z2[c.slack];
      else y = -z2[c.art];
      if (c.flip) y = -y;
      duals[c.src] = y * dir + 0;
    }
    let obj = P.c0 || 0;
    for (let j = 0; j < n; j++) obj += (P.c[j] || 0) * x[j];
    return { status: 'optimal', x, obj, duals, reduced, iterations, bounds: nBound, method: 'dense' };
  }

  class Heap {
    constructor(key) { this.a = []; this.key = key; }
    get size() { return this.a.length; }
    push(x) {
      const a = this.a, k = this.key;
      a.push(x);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (k(a[p]) <= k(a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    }
    pop() {
      const a = this.a, k = this.key;
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let s = i;
          if (l < a.length && k(a[l]) < k(a[s])) s = l;
          if (r < a.length && k(a[r]) < k(a[s])) s = r;
          if (s === i) break;
          [a[s], a[i]] = [a[i], a[s]]; i = s;
        }
      }
      return top;
    }
    peek() { return this.a[0]; }
  }

  function branchAndBound(P, isInt, opt, onEvent) {
    if (opt && opt.classic) return branchAndBoundClassic(P, isInt, opt, onEvent);
    return E.solveMIP(P, isInt, opt, onEvent);
  }

  function branchAndBoundClassic(P, isInt, opt, onEvent) {
    const t0 = Date.now();
    const deadline = opt.deadline || Infinity;
    const nodeLimit = opt.nodeLimit || 100000;
    const gap = opt.gap == null ? 1e-4 : opt.gap;
    const dir = P.maximize ? -1 : 1;
    const ITOL = 1e-6;
    let nodes = 0, pivots = 0;
    let inc = null, incVal = Infinity;
    const stack = [];
    let heap = null;
    const root = { lo: Float64Array.from(P.lower), hi: Float64Array.from(P.upper), bound: -Infinity, depth: 0 };
    stack.push(root);
    let unbounded = false;
    let stopped = false;
    const integerObj = (() => {
      for (let j = 0; j < P.n; j++) {
        const cj = P.c[j] || 0;
        if (cj === 0) continue;
        if (!isInt[j] || Math.abs(cj - Math.round(cj)) > 1e-12) return false;
      }
      return Math.abs((P.c0 || 0) - Math.round(P.c0 || 0)) < 1e-12;
    })();
    const pruneAt = () => {
      if (!inc) return Infinity;
      const tol = Math.max(1e-9, gap * Math.max(1, Math.abs(incVal)));
      return integerObj ? incVal - Math.max(tol, 1 - 1e-6) : incVal - tol;
    };

    const next = () => {
      if (heap) return heap.size ? heap.pop() : null;
      return stack.length ? stack.pop() : null;
    };
    const add = (nd) => { if (heap) heap.push(nd); else stack.push(nd); };

    for (;;) {
      if (nodes >= nodeLimit || Date.now() > deadline) { stopped = true; break; }
      const nd = next();
      if (!nd) break;
      if (nd.bound >= pruneAt()) continue;
      nodes++;
      const r = solveDense(P, { lower: nd.lo, upper: nd.hi, deadline, maxIter: opt.maxIter });
      pivots += r.iterations || 0;
      if (r.status === 'limit') { stopped = true; break; }
      if (r.status === 'infeasible') continue;
      if (r.status === 'unbounded') { if (!inc) { unbounded = true; break; } continue; }
      const val = r.obj * dir;
      if (val >= pruneAt()) continue;
      let bj = -1, bf = 0;
      for (let j = 0; j < P.n; j++) {
        if (!isInt[j]) continue;
        const f = r.x[j] - Math.floor(r.x[j]);
        const d = Math.min(f, 1 - f);
        if (d > ITOL && d > bf) { bf = d; bj = j; }
      }
      if (bj < 0) {
        const x = Float64Array.from(r.x);
        for (let j = 0; j < P.n; j++) if (isInt[j]) x[j] = Math.round(x[j]);
        inc = { x, obj: r.obj, duals: r.duals, reduced: r.reduced };
        incVal = val;
        if (!heap) {
          heap = new Heap((q) => q.bound);
          for (const s of stack) heap.push(s);
          stack.length = 0;
        }
        if (onEvent) onEvent({ incumbent: r.obj, nodes, ms: Date.now() - t0 });
        continue;
      }
      const v = r.x[bj];
      const down = { lo: Float64Array.from(nd.lo), hi: Float64Array.from(nd.hi), bound: val, depth: nd.depth + 1 };
      down.hi[bj] = Math.floor(v);
      const up = { lo: Float64Array.from(nd.lo), hi: Float64Array.from(nd.hi), bound: val, depth: nd.depth + 1 };
      up.lo[bj] = Math.ceil(v);
      if (v - Math.floor(v) >= 0.5) { add(down); add(up); } else { add(up); add(down); }
      if (onEvent && (nodes & 31) === 0) onEvent({ nodes, ms: Date.now() - t0, bound: val });
    }
    let bestBound = incVal;
    if (heap && heap.size) bestBound = Math.min(bestBound, heap.a.reduce((m, q) => Math.min(m, q.bound), Infinity));
    if (!heap && stack.length) bestBound = -Infinity;
    const result = { nodes, iterations: pivots };
    if (unbounded) return Object.assign(result, { status: 'unbounded' });
    if (!inc) return Object.assign(result, { status: stopped ? 'stopped' : 'infeasible' });
    const exhausted = !stopped;
    const gapNow = Number.isFinite(bestBound) ? Math.abs(incVal - bestBound) / Math.max(1, Math.abs(incVal)) : Infinity;
    return Object.assign(result, {
      status: exhausted || gapNow <= gap ? 'optimal' : 'feasible',
      x: inc.x, obj: inc.obj, duals: null, reduced: null,
      gap: exhausted ? 0 : gapNow
    });
  }

  function elastic(P) {
    const n = P.n;
    const m = P.rows.length;
    const ext = { n: n, c: new Float64Array(n), c0: 0, rows: [], lower: Array.from(P.lower), upper: Array.from(P.upper), maximize: false };
    const cols = [];
    const add = () => { ext.lower.push(0); ext.upper.push(Infinity); return ext.n++; };
    for (let i = 0; i < m; i++) {
      const r = P.rows[i];
      const idx = Array.from(r.idx), val = Array.from(r.val);
      const mine = [];
      if (r.op === '<=' || r.op === '=') { const e = add(); idx.push(e); val.push(-1); mine.push(e); }
      if (r.op === '>=' || r.op === '=') { const e = add(); idx.push(e); val.push(1); mine.push(e); }
      cols.push(mine);
      ext.rows.push({ idx, val, op: r.op, rhs: r.rhs });
    }
    const boundCols = [];
    for (let j = 0; j < n; j++) {
      if (P.lower[j] > -Infinity && P.upper[j] < Infinity && P.lower[j] > P.upper[j]) boundCols.push(j);
    }
    const c = new Float64Array(ext.n);
    for (let j = n; j < ext.n; j++) c[j] = 1;
    ext.c = c;
    ext.lower = Float64Array.from(ext.lower);
    ext.upper = Float64Array.from(ext.upper);
    const r = solveLP(ext, {});
    if (r.status !== 'optimal') return { conflict: [], x: null };
    const conflict = [];
    cols.forEach((mine, i) => {
      let s = 0;
      for (const e of mine) s += r.x[e];
      if (s > 1e-7) conflict.push({ row: i, amount: s });
    });
    return { conflict, x: r.x.slice(0, n) };
  }

  E.solveLP = solveLP;
  E.solveDense = solveDense;
  E.branchAndBound = branchAndBound;
  E.branchAndBoundClassic = branchAndBoundClassic;
  E.elasticLP = elastic;
  E.Heap = Heap;
});
