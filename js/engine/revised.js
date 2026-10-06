NadirEngine.define('revised', function (E) {
  'use strict';

  const PTOL = 1e-7;
  const DTOL = 1e-7;
  const PIV = 1e-9;
  const BASIC = 0, LOW = 1, UPP = 2, FREE = 3;

  function prepare(P, L, U) {
    const n = P.n, rows = P.rows, m = rows.length;
    const cs = new Int32Array(n + 1);
    for (const r of rows) for (let k = 0; k < r.idx.length; k++) cs[r.idx[k] + 1]++;
    for (let j = 0; j < n; j++) cs[j + 1] += cs[j];
    const nnz = cs[n];
    const ci = new Int32Array(nnz), cv = new Float64Array(nnz);
    const fill = cs.slice(0, n);
    rows.forEach((r, i) => {
      for (let k = 0; k < r.idx.length; k++) { const p = fill[r.idx[k]]++; ci[p] = i; cv[p] = r.val[k]; }
    });
    const N = n + m;
    const lo = new Float64Array(N), up = new Float64Array(N), cost = new Float64Array(N), cnorm = new Float64Array(N);
    const dir = P.maximize ? -1 : 1;
    for (let j = 0; j < n; j++) {
      lo[j] = L[j]; up[j] = U[j]; cost[j] = (P.c[j] || 0) * dir;
      let s = 1;
      for (let p = cs[j]; p < cs[j + 1]; p++) s += cv[p] * cv[p];
      cnorm[j] = s;
    }
    rows.forEach((r, i) => {
      const s = n + i;
      if (r.op === '<=') { lo[s] = -Infinity; up[s] = r.rhs; }
      else if (r.op === '>=') { lo[s] = r.rhs; up[s] = Infinity; }
      else { lo[s] = r.rhs; up[s] = r.rhs; }
      cnorm[s] = 2;
    });
    return { n, m, N, cs, ci, cv, lo, up, cost, cnorm, dir, nnz };
  }

  function solveRevised(P, opt) {
    const o = opt || {};
    const maxIter = o.maxIter || 50000;
    const deadline = o.deadline || Infinity;
    const Q = prepare(P, o.lower || P.lower, o.upper || P.upper);
    const { n, m, N, cs, ci, cv, lo, up, cost, cnorm, dir } = Q;
    for (let j = 0; j < N; j++) if (lo[j] > up[j] + 1e-9 * Math.max(1, Math.abs(lo[j]))) return { status: 'infeasible', iterations: 0, method: 'revised' };

    const objOf = (x) => { let v = P.c0 || 0; for (let j = 0; j < n; j++) v += (P.c[j] || 0) * x[j]; return v; };
    const roundInts = (x) => { if (P.integerHint) for (let j = 0; j < n; j++) if (P.integerHint[j] && Math.abs(x[j] - Math.round(x[j])) < 1e-9) x[j] = Math.round(x[j]); };

    if (m === 0) {
      const x = new Float64Array(n), reduced = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const c = cost[j];
        if (c > 0) { if (lo[j] === -Infinity) return { status: 'unbounded', iterations: 0, method: 'revised' }; x[j] = lo[j]; }
        else if (c < 0) { if (up[j] === Infinity) return { status: 'unbounded', iterations: 0, method: 'revised' }; x[j] = up[j]; }
        else x[j] = lo[j] > -Infinity ? lo[j] : up[j] < Infinity ? up[j] : 0;
        reduced[j] = c * dir;
      }
      roundInts(x);
      const out = { status: 'optimal', x, obj: objOf(x), duals: new Float64Array(0), reduced, iterations: 0, method: 'revised', lu: null };
      if (o.ranging) out.ranging = { rows: [], cols: Array.from({ length: n }, (_, j) => (cost[j] === 0 && lo[j] !== up[j] ? { inc: 0, dec: 0 } : { inc: Infinity, dec: Infinity })) };
      return out;
    }

    const getCol = (j) => (j < n ? { idx: ci.subarray(cs[j], cs[j + 1]), val: cv.subarray(cs[j], cs[j + 1]) } : { idx: [j - n], val: [-1] });
    const dot = (y, j) => {
      if (j >= n) return -y[j - n];
      let s = 0;
      for (let p = cs[j]; p < cs[j + 1]; p++) s += cv[p] * y[ci[p]];
      return s;
    };
    const denseCol = (j) => {
      const a = new Float64Array(m);
      if (j >= n) a[j - n] = -1;
      else for (let p = cs[j]; p < cs[j + 1]; p++) a[ci[p]] += cv[p];
      return a;
    };

    const head = new Int32Array(m), stat = new Int8Array(N), x = new Float64Array(N), pos = new Int32Array(N).fill(-1);
    function park(j, prefer) {
      const l = lo[j], u = up[j];
      if (l > -Infinity && u < Infinity) {
        const s = prefer === UPP ? UPP : prefer === LOW ? LOW : (Math.abs(x[j] - u) < Math.abs(x[j] - l) ? UPP : LOW);
        stat[j] = l === u ? LOW : s; x[j] = stat[j] === LOW ? l : u;
      } else if (l > -Infinity) { stat[j] = LOW; x[j] = l; }
      else if (u < Infinity) { stat[j] = UPP; x[j] = u; }
      else { stat[j] = FREE; x[j] = 0; }
      pos[j] = -1;
    }
    function coldStart() {
      for (let j = 0; j < n; j++) park(j, LOW);
      for (let i = 0; i < m; i++) { const s = n + i; head[i] = s; pos[s] = i; stat[s] = BASIC; }
    }
    let warm = false;
    const wb = o.basis;
    if (wb && wb.n === n && wb.head && wb.head.length <= m) {
      const mb = wb.head.length;
      for (let j = 0; j < n + mb; j++) {
        const s = wb.stat[j];
        if (s !== BASIC) park(j, s === UPP ? UPP : s === LOW ? LOW : 0);
      }
      for (let i = 0; i < mb; i++) { const h = wb.head[i]; head[i] = h; pos[h] = i; stat[h] = BASIC; }
      for (let i = mb; i < m; i++) { const s = n + i; head[i] = s; pos[s] = i; stat[s] = BASIC; }
      warm = true;
    } else coldStart();

    const B = E.LUBasis(m, getCol, { force: o.lu });
    let repairs = 0;

    function computeXB() {
      const rhs = new Float64Array(m);
      for (let j = 0; j < N; j++) {
        if (stat[j] === BASIC) continue;
        const v = x[j];
        if (v === 0) continue;
        if (j >= n) rhs[j - n] += v;
        else for (let p = cs[j]; p < cs[j + 1]; p++) rhs[ci[p]] -= cv[p] * v;
      }
      const xb = B.ftran(rhs);
      for (let i = 0; i < m; i++) x[head[i]] = xb[i];
    }

    function refactor() {
      for (let tries = 0; ; tries++) {
        const f = B.factor(head);
        if (f.ok) break;
        repairs++;
        if (tries > 3) {
          coldStart();
          const f2 = B.factor(head);
          if (!f2.ok) throw new Error('Basis could not be factorized');
          break;
          continue;
        }
        for (const s of f.singular) {
          const out = head[s.pos];
          const inn = n + s.row;
          if (pos[inn] >= 0) continue;
          park(out, 0);
          head[s.pos] = inn; pos[inn] = s.pos; stat[inn] = BASIC;
        }
      }
      computeXB();
    }

    refactor();
    let iter = 0, degen = 0, bland = false, trouble = 0, verified = false, priceStart = 0, dualIters = 0, dualRun = 'off';
    const cB = new Float64Array(m);

    function dualPhase() {
      const d = new Float64Array(N), alpha = new Float64Array(N), e = new Float64Array(m);
      const prices = () => {
        for (let i = 0; i < m; i++) cB[i] = cost[head[i]];
        const y = B.btran(cB);
        for (let j = 0; j < N; j++) d[j] = stat[j] === BASIC ? 0 : cost[j] - dot(y, j);
      };
      prices();
      for (let j = 0; j < N; j++) {
        const s = stat[j];
        if (s === BASIC || lo[j] === up[j]) continue;
        const dj = d[j];
        if (s === LOW ? dj < -10 * DTOL : s === UPP ? dj > 10 * DTOL : Math.abs(dj) > 10 * DTOL) return 'skip';
      }
      let retried = false, best = Infinity, since = 0, bad = 0;
      for (;;) {
        if (iter >= maxIter) return 'limit';
        if ((iter & 31) === 0 && Date.now() > deadline) return 'limit';
        if (B.needsRefactor()) { refactor(); prices(); }
        let r = -1, worst = 0, below = false, tot = 0;
        for (let i = 0; i < m; i++) {
          const h = head[i], v = x[h], l = lo[h], u = up[h];
          let inf;
          if (l > -Infinity && v < l - PTOL * (1 + Math.abs(l))) { inf = l - v; if (inf > worst) { worst = inf; r = i; below = true; } }
          else if (u < Infinity && v > u + PTOL * (1 + Math.abs(u))) { inf = v - u; if (inf > worst) { worst = inf; r = i; below = false; } }
          else continue;
          tot += inf;
        }
        if (r < 0) return 'done';
        if (tot < best * (1 - 1e-9)) { best = tot; since = 0; } else if (++since > 300) return 'skip';
        e.fill(0); e[r] = 1;
        const rho = B.btran(e);
        const sg = below ? -1 : 1;
        let bound = Infinity;
        for (let j = 0; j < N; j++) {
          const s = stat[j];
          if (s === BASIC || lo[j] === up[j]) { alpha[j] = 0; continue; }
          const a = dot(rho, j);
          alpha[j] = a;
          if (Math.abs(a) <= PIV) continue;
          if (!(s === FREE || (s === LOW && sg * a > 0) || (s === UPP && sg * a < 0))) continue;
          const rr = (Math.abs(d[j]) + DTOL) / Math.abs(a);
          if (rr < bound) bound = rr;
        }
        if (bound === Infinity) {
          if (!retried && B.updates > 0) { refactor(); prices(); retried = true; continue; }
          return 'infeasible';
        }
        let q = -1, qa = 0;
        for (let j = 0; j < N; j++) {
          const a = alpha[j];
          if (Math.abs(a) <= PIV) continue;
          const s = stat[j];
          if (s === BASIC || lo[j] === up[j]) continue;
          if (!(s === FREE || (s === LOW && sg * a > 0) || (s === UPP && sg * a < 0))) continue;
          if (Math.abs(d[j]) / Math.abs(a) <= bound && Math.abs(a) > Math.abs(qa)) { q = j; qa = a; }
        }
        const w = B.ftran(denseCol(q));
        const wr = w[r];
        if (Math.abs(wr) <= PIV || Math.abs(wr - qa) > 1e-6 * (1 + Math.abs(wr))) {
          if (++bad > 4) return 'skip';
          refactor(); prices();
          continue;
        }
        retried = false;
        const thetaD = d[q] / qa;
        const h = head[r];
        const target = below ? lo[h] : up[h];
        const t = (x[h] - target) / wr;
        if (t !== 0) for (let i = 0; i < m; i++) if (w[i] !== 0) x[head[i]] -= t * w[i];
        x[q] += t;
        x[h] = target;
        stat[h] = lo[h] === up[h] ? LOW : below ? LOW : UPP;
        pos[h] = -1;
        head[r] = q; pos[q] = r; stat[q] = BASIC;
        B.update(r, w);
        if (thetaD !== 0) for (let j = 0; j < N; j++) if (alpha[j] !== 0) d[j] -= thetaD * alpha[j];
        d[h] = -thetaD; d[q] = 0;
        iter++; dualIters++;
      }
    }

    if (warm && o.dual !== false) {
      dualRun = dualPhase();
      if (dualRun === 'infeasible') return { status: 'infeasible', iterations: iter, method: 'revised', lu: B.kind, repairs, warm, dual: dualIters };
      if (dualRun === 'limit') return { status: 'limit', iterations: iter, method: 'revised', lu: B.kind, repairs, warm, dual: dualIters };
    }
    const chunk = Math.max(1500, Math.ceil(N / 8));
    let status = null;

    for (;;) {
      if (iter >= maxIter) { status = 'limit'; break; }
      if ((iter & 31) === 0 && Date.now() > deadline) { status = 'limit'; break; }
      if (B.needsRefactor()) refactor();
      let ph1 = false;
      for (let i = 0; i < m; i++) {
        const h = head[i], v = x[h], l = lo[h], u = up[h];
        if (l > -Infinity && v < l - PTOL * (1 + Math.abs(l))) { cB[i] = -1; ph1 = true; }
        else if (u < Infinity && v > u + PTOL * (1 + Math.abs(u))) { cB[i] = 1; ph1 = true; }
        else cB[i] = 0;
      }
      if (!ph1) for (let i = 0; i < m; i++) cB[i] = cost[head[i]];
      const y = B.btran(cB);

      let q = -1, best = 0, qd = 0, scanned = 0;
      for (let t = 0; t < N; t++) {
        const j = bland ? t : (priceStart + t) % N;
        scanned++;
        const s = stat[j];
        if (s === BASIC || lo[j] === up[j]) continue;
        const d = (ph1 ? 0 : cost[j]) - dot(y, j);
        const ok = s === LOW ? d < -DTOL : s === UPP ? d > DTOL : Math.abs(d) > DTOL;
        if (!ok) continue;
        if (bland) { q = j; qd = d; break; }
        const sc = d * d / cnorm[j];
        if (sc > best) { best = sc; q = j; qd = d; }
        if (N > 6000 && scanned >= chunk && q >= 0) { priceStart = (j + 1) % N; break; }
      }

      if (q < 0) {
        if (!verified && B.updates > 0) { refactor(); verified = true; continue; }
        status = ph1 ? 'infeasible' : 'optimal';
        break;
      }

      const delta = qd < 0 ? 1 : -1;
      const w = B.ftran(denseCol(q));
      const tq = lo[q] > -Infinity && up[q] < Infinity ? up[q] - lo[q] : Infinity;
      let thMax = tq;
      for (let i = 0; i < m; i++) {
        const wi = w[i];
        if (Math.abs(wi) <= PIV) continue;
        const rate = -delta * wi;
        const h = head[i], v = x[h], l = lo[h], u = up[h];
        const tl = PTOL * (1 + Math.abs(l)), tu = PTOL * (1 + Math.abs(u));
        let hr = Infinity;
        if (l > -Infinity && v < l - tl) { if (rate > 0) hr = (l - v + tl) / rate; }
        else if (u < Infinity && v > u + tu) { if (rate < 0) hr = (v - u + tu) / -rate; }
        else if (rate < 0) { if (l > -Infinity) hr = (v - l + tl) / -rate; }
        else if (u < Infinity) hr = (u - v + tu) / rate;
        if (hr < thMax) thMax = hr;
      }
      let r = -1, bestAbs = 0, th = 0, leaveVal = 0;
      const flip = tq < Infinity && tq <= thMax;
      if (!flip && thMax < Infinity) {
        for (let i = 0; i < m; i++) {
          const wi = w[i];
          const aw = Math.abs(wi);
          if (aw <= PIV) continue;
          const rate = -delta * wi;
          const h = head[i], v = x[h], l = lo[h], u = up[h];
          const tl = PTOL * (1 + Math.abs(l)), tu = PTOL * (1 + Math.abs(u));
          let ex = Infinity, bv = 0;
          if (l > -Infinity && v < l - tl) { if (rate > 0) { ex = (l - v) / rate; bv = l; } }
          else if (u < Infinity && v > u + tu) { if (rate < 0) { ex = (v - u) / -rate; bv = u; } }
          else if (rate < 0) { if (l > -Infinity) { ex = (v - l) / -rate; bv = l; } }
          else if (u < Infinity) { ex = (u - v) / rate; bv = u; }
          if (ex <= thMax && aw > bestAbs) { bestAbs = aw; r = i; th = Math.max(0, ex); leaveVal = bv; }
        }
      }

      if (flip) {
        const step = delta * tq;
        for (let i = 0; i < m; i++) if (w[i] !== 0) x[head[i]] -= step * w[i];
        stat[q] = stat[q] === LOW ? UPP : LOW;
        x[q] = stat[q] === LOW ? lo[q] : up[q];
        iter++; degen = 0; bland = false; verified = false;
        continue;
      }
      if (r < 0) {
        if (ph1 || B.updates > 0) {
          if (++trouble > 6) { status = 'numerical'; break; }
          refactor();
          continue;
        }
        status = 'unbounded';
        break;
      }
      const step = delta * th;
      if (step !== 0) for (let i = 0; i < m; i++) if (w[i] !== 0) x[head[i]] -= step * w[i];
      x[q] += step;
      const out = head[r];
      x[out] = leaveVal;
      stat[out] = lo[out] === up[out] ? LOW : leaveVal === lo[out] ? LOW : UPP;
      pos[out] = -1;
      head[r] = q; pos[q] = r; stat[q] = BASIC;
      B.update(r, w);
      iter++;
      verified = false;
      if (th * Math.max(1, bestAbs) < 1e-11) { if (++degen > 60) bland = true; }
      else { degen = 0; bland = false; }
    }

    const base = { status, iterations: iter, method: 'revised', lu: B.kind, repairs, warm, dual: dualIters, dualRun };
    if (status !== 'optimal') return base;

    for (let i = 0; i < m; i++) cB[i] = cost[head[i]];
    const y = B.btran(cB);
    const xs = new Float64Array(n);
    for (let j = 0; j < n; j++) xs[j] = x[j];
    roundInts(xs);
    const reduced = new Float64Array(n);
    const dAll = new Float64Array(N);
    for (let j = 0; j < N; j++) dAll[j] = stat[j] === BASIC ? 0 : cost[j] - dot(y, j);
    for (let j = 0; j < n; j++) reduced[j] = dAll[j] * dir + 0;
    const duals = new Float64Array(m);
    for (let i = 0; i < m; i++) duals[i] = y[i] * dir + 0;

    const res = Object.assign(base, { x: xs, obj: objOf(xs), duals, reduced });
    res.basis = { n, head: Int32Array.from(head), stat: Int8Array.from(stat) };
    res.state = {
      n, m, N, x: Float64Array.from(x), lo, up, stat: res.basis.stat, head: res.basis.head,
      tableauRow(rr) {
        const e = new Float64Array(m); e[rr] = 1;
        const rho = B.btran(e);
        const alpha = new Float64Array(N);
        for (let j = 0; j < N; j++) if (stat[j] !== BASIC) alpha[j] = dot(rho, j);
        return alpha;
      }
    };
    if (o.ranging) res.ranging = ranging(o.rangingBudget || 6e7);
    return res;

    function ranging(budget) {
      const rowsR = new Array(m), colsR = new Array(n);
      let nbLog = 0, bStruct = 0;
      for (let i = 0; i < m; i++) if (stat[n + i] !== BASIC) nbLog++;
      for (let i = 0; i < m; i++) if (head[i] < n) bStruct++;
      const work = nbLog * (m * 4 + (B.kind === 'dense' ? m * m : Q.nnz * 3)) + bStruct * (Q.nnz + N + m * 4);
      if (work > budget) return { skipped: true, reason: 'Model too large for full sensitivity ranging' };
      const primalRange = (w) => {
        let up2 = Infinity, dn = Infinity;
        for (let k = 0; k < m; k++) {
          const wk = w[k];
          if (Math.abs(wk) <= 1e-11) continue;
          const h = head[k], v = x[h], l = lo[h], u = up[h];
          if (wk > 0) {
            if (l > -Infinity) up2 = Math.min(up2, Math.max(0, (v - l) / wk));
            if (u < Infinity) dn = Math.min(dn, Math.max(0, (u - v) / wk));
          } else {
            if (u < Infinity) up2 = Math.min(up2, Math.max(0, (v - u) / wk));
            if (l > -Infinity) dn = Math.min(dn, Math.max(0, (l - v) / wk));
          }
        }
        return { inc: up2, dec: dn };
      };
      for (let i = 0; i < m; i++) {
        const s = n + i;
        if (stat[s] === BASIC) {
          const v = x[s];
          const rw = P.rows[i];
          if (rw.op === '<=') rowsR[i] = { inc: Infinity, dec: Math.max(0, up[s] - v) };
          else if (rw.op === '>=') rowsR[i] = { inc: Math.max(0, v - lo[s]), dec: Infinity };
          else rowsR[i] = { inc: 0, dec: 0 };
        } else {
          const w = B.ftran(denseCol(s));
          const pr = primalRange(w);
          rowsR[i] = pr;
        }
      }
      for (let j = 0; j < n; j++) {
        let dlo, dhi;
        if (lo[j] === up[j]) { dlo = -Infinity; dhi = Infinity; }
        else if (stat[j] !== BASIC) {
          const d = dAll[j];
          if (stat[j] === LOW) { dlo = -Math.max(0, d); dhi = Infinity; }
          else if (stat[j] === UPP) { dlo = -Infinity; dhi = Math.max(0, -d); }
          else { dlo = 0; dhi = 0; }
        } else {
          const e = new Float64Array(m); e[pos[j]] = 1;
          const rho = B.btran(e);
          dlo = -Infinity; dhi = Infinity;
          for (let k = 0; k < N; k++) {
            const sk = stat[k];
            if (sk === BASIC || lo[k] === up[k]) continue;
            const a = dot(rho, k);
            if (Math.abs(a) <= 1e-11) continue;
            const d = dAll[k];
            if (sk === FREE) { dlo = Math.max(dlo, 0); dhi = Math.min(dhi, 0); continue; }
            const bound = d / a;
            const atLow = sk === LOW;
            if ((atLow && a > 0) || (!atLow && a < 0)) dhi = Math.min(dhi, Math.max(0, bound));
            else dlo = Math.max(dlo, Math.min(0, bound));
          }
        }
        colsR[j] = dir > 0 ? { inc: dhi, dec: -dlo } : { inc: -dlo, dec: dhi };
      }
      return { rows: rowsR, cols: colsR };
    }
  }

  E.solveRevised = solveRevised;
  E.REVISED = { BASIC, LOW, UPP, FREE };
});
