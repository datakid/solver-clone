NadirEngine.define('nlp', function (E) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Problem(spec) {
    const { n, fn, m, ops, lower, upper, objective } = spec;
    const o = new Float64Array(m + 1);
    const w = new Float64Array(m + 1);
    const scale = spec.scale || new Float64Array(m).fill(1);
    const feasTol = spec.feasTol || 1e-6;
    const P = { n, m, ops, lower, upper, o, scale, feasTol, evals: 0 };

    P.values = (x) => { fn(x, o); P.evals++; return o; };
    P.f = (x) => objective(o[0]);
    P.violation = (x, fresh) => {
      if (fresh !== false) fn(x, o);
      let tot = 0, worst = 0;
      for (let i = 0; i < m; i++) {
        const h = o[i + 1];
        let v = ops[i] === '<=' ? Math.max(0, h) : ops[i] === '>=' ? Math.max(0, -h) : Math.abs(h);
        if (!Number.isFinite(h)) v = 1e300;
        v /= scale[i];
        tot += v;
        if (v > worst) worst = v;
      }
      return { tot, worst };
    };
    P.score = (x) => {
      fn(x, o);
      P.evals++;
      let f = objective(o[0]);
      if (!Number.isFinite(f)) f = Infinity;
      const v = P.violation(x, false);
      return { f, v: v.tot, worst: v.worst };
    };
    P.objective = objective;
    P.fn = fn;
    P.w = w;
    return P;
  }

  function project(x, lo, hi) {
    for (let j = 0; j < x.length; j++) {
      if (x[j] < lo[j]) x[j] = lo[j];
      else if (x[j] > hi[j]) x[j] = hi[j];
    }
    return x;
  }

  function lbfgs(func, x0, lo, hi, opt) {
    const n = x0.length;
    const M = 8;
    const tol = opt.tol || 1e-8;
    const maxIt = opt.maxIt || 1000;
    const deadline = opt.deadline || Infinity;
    const x = project(Float64Array.from(x0), lo, hi);
    const g = new Float64Array(n);
    let f = func(x, g);
    if (!Number.isFinite(f)) return { x, f, it: 0 };
    const S = [], Y = [], RHO = [];
    const d = new Float64Array(n), xn = new Float64Array(n), gn = new Float64Array(n), q = new Float64Array(n);
    const alpha = new Float64Array(M);
    let it = 0;
    let stall = 0;
    const free = new Uint8Array(n);
    for (; it < maxIt; it++) {
      if ((it & 15) === 0 && Date.now() > deadline) break;
      let pg = 0;
      for (let j = 0; j < n; j++) {
        const p = Math.min(hi[j], Math.max(lo[j], x[j] - g[j])) - x[j];
        if (Math.abs(p) > pg) pg = Math.abs(p);
        free[j] = !((x[j] <= lo[j] && g[j] > 0) || (x[j] >= hi[j] && g[j] < 0));
      }
      if (pg <= tol * (1 + Math.abs(f)) || pg < 1e-14) break;
      for (let j = 0; j < n; j++) q[j] = free[j] ? g[j] : 0;
      const k = S.length;
      for (let i = k - 1; i >= 0; i--) {
        let s = 0; const Si = S[i];
        for (let j = 0; j < n; j++) if (free[j]) s += Si[j] * q[j];
        alpha[i] = RHO[i] * s;
        const Yi = Y[i];
        for (let j = 0; j < n; j++) if (free[j]) q[j] -= alpha[i] * Yi[j];
      }
      let gamma = 1;
      if (k) {
        const Sl = S[k - 1], Yl = Y[k - 1];
        let sy = 0, yy = 0;
        for (let j = 0; j < n; j++) { sy += Sl[j] * Yl[j]; yy += Yl[j] * Yl[j]; }
        gamma = yy > 0 ? sy / yy : 1;
      } else {
        let gn2 = 0;
        for (let j = 0; j < n; j++) gn2 += q[j] * q[j];
        gamma = gn2 > 0 ? Math.min(1, 1 / Math.sqrt(gn2)) : 1;
      }
      for (let j = 0; j < n; j++) q[j] *= gamma;
      for (let i = 0; i < k; i++) {
        let s = 0; const Yi = Y[i];
        for (let j = 0; j < n; j++) if (free[j]) s += Yi[j] * q[j];
        const b = RHO[i] * s;
        const Si = S[i];
        for (let j = 0; j < n; j++) if (free[j]) q[j] += Si[j] * (alpha[i] - b);
      }
      let gd = 0;
      for (let j = 0; j < n; j++) { d[j] = free[j] ? -q[j] : 0; gd += d[j] * g[j]; }
      if (!(gd < 0)) {
        S.length = 0; Y.length = 0; RHO.length = 0;
        gd = 0;
        for (let j = 0; j < n; j++) { d[j] = free[j] ? -g[j] : 0; gd += d[j] * g[j]; }
        if (!(gd < 0)) break;
      }
      let t = 1, fn = Infinity, ok = false;
      for (let ls = 0; ls < 50; ls++) {
        for (let j = 0; j < n; j++) xn[j] = x[j] + t * d[j];
        project(xn, lo, hi);
        let dec = 0;
        for (let j = 0; j < n; j++) dec += g[j] * (xn[j] - x[j]);
        fn = func(xn, gn);
        if (Number.isFinite(fn) && fn <= f + 1e-4 * dec) { ok = true; break; }
        t *= 0.5;
      }
      if (!ok) break;
      const s = new Float64Array(n), y = new Float64Array(n);
      let sy = 0, ss = 0;
      for (let j = 0; j < n; j++) { s[j] = xn[j] - x[j]; y[j] = gn[j] - g[j]; sy += s[j] * y[j]; ss += s[j] * s[j]; }
      if (sy > 1e-12 * Math.max(1, ss)) {
        if (S.length === M) { S.shift(); Y.shift(); RHO.shift(); }
        S.push(s); Y.push(y); RHO.push(1 / sy);
      }
      const df = f - fn;
      x.set(xn); g.set(gn);
      if (df <= 1e-16 * Math.max(1, Math.abs(f))) { if (++stall > 8) { f = fn; break; } } else stall = 0;
      f = fn;
      if (Math.sqrt(ss) < 1e-16 * (1 + Math.sqrt(x.reduce((a, b) => a + b * b, 0)))) break;
    }
    return { x, f, it };
  }

  function alm(P, x0, opt) {
    const n = P.n, m = P.m;
    const lam = new Float64Array(m);
    let rho = 10;
    const tol = opt.tol || 1e-8;
    const deadline = opt.deadline || Infinity;
    const lo = opt.lower || P.lower, hi = opt.upper || P.upper;
    const o = P.o, w = P.w;
    const ops = P.ops, sc = P.scale;
    const objective = P.objective;
    const dobj = opt.dobj;
    let x = project(Float64Array.from(x0), lo, hi);
    let iters = 0;

    const lag = (xx, g) => {
      P.fn(xx, o);
      P.evals++;
      const fo = objective(o[0]);
      let L = fo;
      w[0] = dobj(o[0]);
      for (let i = 0; i < m; i++) {
        let h = o[i + 1] / sc[i];
        if (ops[i] === '>=') h = -h;
        if (ops[i] === '=') {
          L += lam[i] * h + 0.5 * rho * h * h;
          w[i + 1] = (lam[i] + rho * h) / sc[i];
        } else {
          const t = h + lam[i] / rho;
          if (t > 0) {
            L += 0.5 * rho * t * t - lam[i] * lam[i] / (2 * rho);
            w[i + 1] = rho * t / sc[i] * (ops[i] === '>=' ? -1 : 1);
          } else {
            L -= lam[i] * lam[i] / (2 * rho);
            w[i + 1] = 0;
          }
        }
      }
      if (g) {
        g.fill(0);
        P.fn(xx, o, g, w);
      }
      return Number.isFinite(L) ? L : Infinity;
    };

    const viol = () => {
      P.fn(x, o);
      let worst = 0;
      for (let i = 0; i < m; i++) {
        const h = o[i + 1] / sc[i];
        const v = ops[i] === '<=' ? Math.max(0, h) : ops[i] === '>=' ? Math.max(0, -h) : Math.abs(h);
        if (v > worst) worst = v;
      }
      return worst;
    };

    let prevViol = m ? viol() : 0;
    const outerMax = m ? 50 : 1;
    for (let k = 0; k < outerMax; k++) {
      if (Date.now() > deadline) break;
      const innerTol = m ? Math.max(tol, Math.min(1e-3, 1e-2 / (k + 1) ** 2)) : tol;
      const r = lbfgs(lag, x, lo, hi, { tol: k === outerMax - 1 ? tol : innerTol, maxIt: opt.maxIt || 2000, deadline });
      x = r.x;
      iters += r.it;
      if (!m) break;
      P.fn(x, o);
      for (let i = 0; i < m; i++) {
        let h = o[i + 1] / sc[i];
        if (ops[i] === '>=') h = -h;
        if (ops[i] === '=') lam[i] += rho * h;
        else lam[i] = Math.max(0, lam[i] + rho * h);
      }
      const v = viol();
      if (opt.onOuter) opt.onOuter(k, x, v);
      if (v <= P.feasTol && k > 0) {
        const chk = lbfgs(lag, x, lo, hi, { tol, maxIt: opt.maxIt || 2000, deadline });
        iters += chk.it;
        let moved = 0;
        for (let j = 0; j < n; j++) moved = Math.max(moved, Math.abs(chk.x[j] - x[j]) / (1 + Math.abs(x[j])));
        x = chk.x;
        const v2 = viol();
        if (moved < Math.sqrt(tol) && v2 <= P.feasTol) break;
        prevViol = v2;
        continue;
      }
      if (v > 0.25 * prevViol) rho = Math.min(1e8, rho * 10);
      prevViol = v;
    }
    return { x, iters };
  }

  function sampleBox(lo, hi, init, rand, count) {
    const n = lo.length;
    const L = new Float64Array(n), U = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const span = 10 * Math.max(1, Math.abs(init[j]));
      L[j] = Number.isFinite(lo[j]) ? lo[j] : (Number.isFinite(hi[j]) ? Math.min(hi[j], init[j]) - span : init[j] - span);
      U[j] = Number.isFinite(hi[j]) ? hi[j] : (Number.isFinite(lo[j]) ? Math.max(lo[j], init[j]) + span : init[j] + span);
      if (U[j] < L[j]) U[j] = L[j];
    }
    const pts = [];
    const perms = [];
    for (let j = 0; j < n; j++) {
      const p = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [p[i], p[k]] = [p[k], p[i]]; }
      perms.push(p);
    }
    for (let i = 0; i < count; i++) {
      const x = new Float64Array(n);
      for (let j = 0; j < n; j++) x[j] = L[j] + (U[j] - L[j]) * (perms[j][i] + rand()) / count;
      pts.push(x);
    }
    return { pts, L, U };
  }

  function better(a, b, tol) {
    const af = a.v <= tol, bf = b.v <= tol;
    if (af && bf) return a.f < b.f;
    if (af !== bf) return af;
    return a.v < b.v;
  }

  function multistart(P, init, opt, report) {
    const rand = mulberry32(opt.seed || 1);
    const starts = Math.max(1, opt.multistart || 1);
    const { pts } = sampleBox(P.lower, P.upper, init, rand, Math.max(1, starts - 1));
    const list = [Float64Array.from(init)].concat(starts > 1 ? pts : []);
    let best = null;
    let iters = 0;
    const history = [];
    for (let s = 0; s < list.length; s++) {
      if (Date.now() > opt.deadline) break;
      const r = alm(P, list[s], {
        tol: opt.tol, deadline: opt.deadline, dobj: opt.dobj, maxIt: opt.maxIt,
        onOuter: (k, x) => { const sc = P.score(x); report(iters + k, sc); }
      });
      iters += r.iters;
      const sc = P.score(r.x);
      const cand = { x: r.x, f: sc.f, v: sc.worst };
      if (!best || better(cand, best, P.feasTol)) best = cand;
      history.push(best.f);
      report(iters, { f: best.f, v: best.v });
    }
    return { best, iters, starts: list.length };
  }

  function evolve(P, init, isInt, opt, report) {
    const n = P.n;
    const rand = mulberry32(opt.seed || 1);
    const NP = Math.max(20, Math.min(200, 10 * n));
    const { pts, L, U } = sampleBox(P.lower, P.upper, init, rand, NP - 1);
    const lo = P.lower, hi = P.upper;
    const fix = (x) => {
      for (let j = 0; j < n; j++) {
        if (x[j] < lo[j]) x[j] = lo[j];
        if (x[j] > hi[j]) x[j] = hi[j];
        if (isInt[j]) {
          x[j] = Math.round(x[j]);
          if (x[j] < lo[j]) x[j] = Math.ceil(lo[j]);
          if (x[j] > hi[j]) x[j] = Math.floor(hi[j]);
        }
      }
      return x;
    };
    const tol = P.feasTol;
    const pop = [fix(Float64Array.from(init))].concat(pts.map(fix));
    const fit = pop.map((x) => { const s = P.score(x); return { f: s.f, v: s.worst }; });
    const Fs = new Float64Array(NP).fill(0.5), CRs = new Float64Array(NP).fill(0.9);
    let bi = 0;
    for (let i = 1; i < NP; i++) if (better(fit[i], fit[bi], tol)) bi = i;
    let since = 0;
    let gen = 0;
    const patience = opt.patience || 150;
    const maxGen = opt.maxGen || 100000;
    const trial = new Float64Array(n);
    while (gen < maxGen && since < patience && Date.now() < opt.deadline) {
      gen++;
      let improved = false;
      for (let i = 0; i < NP; i++) {
        const F = rand() < 0.1 ? 0.1 + 0.9 * rand() : Fs[i];
        const CR = rand() < 0.1 ? rand() : CRs[i];
        let a, b, c;
        do { a = Math.floor(rand() * NP); } while (a === i);
        do { b = Math.floor(rand() * NP); } while (b === i || b === a);
        do { c = Math.floor(rand() * NP); } while (c === i || c === a || c === b);
        const jr = Math.floor(rand() * n);
        const xi = pop[i], xa = pop[a], xb = pop[b], xc = pop[c];
        for (let j = 0; j < n; j++) {
          if (j === jr || rand() < CR) {
            let v = xa[j] + F * (xb[j] - xc[j]);
            const lj = Number.isFinite(lo[j]) ? lo[j] : -Infinity, hj = Number.isFinite(hi[j]) ? hi[j] : Infinity;
            if (v < lj) v = lj + rand() * (xi[j] - lj);
            if (v > hj) v = hj - rand() * (hj - xi[j]);
            if (isInt[j] && n > 0 && rand() < 0.02) v = xi[j] + (rand() < 0.5 ? -1 : 1);
            trial[j] = v;
          } else trial[j] = xi[j];
        }
        fix(trial);
        const s = P.score(trial);
        const cand = { f: s.f, v: s.worst };
        if (!better(fit[i], cand, tol)) {
          pop[i].set(trial);
          fit[i] = cand;
          Fs[i] = F; CRs[i] = CR;
          if (better(cand, fit[bi], tol)) { bi = i; improved = true; }
        }
      }
      if (improved) since = 0; else since++;
      if ((gen & 3) === 0) report(gen, fit[bi]);
    }
    report(gen, fit[bi]);
    return { best: { x: Float64Array.from(pop[bi]), f: fit[bi].f, v: fit[bi].v }, gens: gen, popSize: NP, L, U };
  }

  E.mulberry32 = mulberry32;
  E.NLProblem = Problem;
  E.lbfgs = lbfgs;
  E.alm = alm;
  E.multistart = multistart;
  E.evolve = evolve;
  E.betterPoint = better;
});
