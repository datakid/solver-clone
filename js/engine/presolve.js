NadirEngine.define('presolve', function (E) {
  'use strict';

  const BASIC = 0, LOW = 1, UPP = 2, FREE = 3;

  function reduce(P, lo, up) {
    const n = P.n, m = P.rows.length, dir = P.maximize ? -1 : 1;
    const c = Float64Array.from({ length: n }, (_, j) => P.c[j] || 0);
    let c0 = P.c0 || 0;
    const rows = P.rows.map((r) => {
      const mp = new Map();
      for (let k = 0; k < r.idx.length; k++) { const a = r.val[k]; if (a) mp.set(r.idx[k], (mp.get(r.idx[k]) || 0) + a); }
      for (const [j, a] of mp) if (Math.abs(a) < 1e-13) mp.delete(j);
      return { m: mp, op: r.op, rhs: r.rhs, alive: true };
    });
    const cols = Array.from({ length: n }, () => new Set());
    rows.forEach((r, i) => { for (const j of r.m.keys()) cols[j].add(i); });
    const alive = new Uint8Array(n).fill(1);
    const loSrc = new Int32Array(n).fill(-1), upSrc = new Int32Array(n).fill(-1);
    const recs = [], dropped = [];
    const tl = (v) => 1e-9 * Math.max(1, Math.abs(v));
    let bad = false;

    const killRow = (i) => { const r = rows[i]; r.alive = false; for (const j of r.m.keys()) cols[j].delete(i); };
    function dropCol(j, side) {
      const v = side === LOW ? lo[j] : side === UPP ? up[j] : 0;
      for (const i of cols[j]) { const r = rows[i]; r.rhs -= r.m.get(j) * v; r.m.delete(j); }
      cols[j].clear(); c0 += c[j] * v; alive[j] = 0; dropped.push({ j, side });
    }
    function tighten(j, nl, nu, id) {
      if (nl > lo[j] + tl(nl)) { lo[j] = nl; loSrc[j] = id; }
      if (nu < up[j] - tl(nu)) { up[j] = nu; upSrc[j] = id; }
      if (lo[j] > up[j]) { if (lo[j] - up[j] <= 1e-7 * Math.max(1, Math.abs(lo[j]))) up[j] = lo[j]; else bad = true; }
    }

    for (let pass = 0; pass < 12 && !bad; pass++) {
      let changed = 0;
      for (let i = 0; i < m && !bad; i++) {
        const r = rows[i];
        if (!r.alive) continue;
        const sz = r.m.size;
        if (sz === 0) {
          const b = r.rhs, t = 1e-7 * Math.max(1, Math.abs(b));
          if (r.op === '<=' ? b < -t : r.op === '>=' ? b > t : Math.abs(b) > t) { bad = true; break; }
          r.alive = false; recs.push({ kind: 'empty', i }); changed++;
          continue;
        }
        if (sz === 1) {
          const [j, a] = r.m.entries().next().value;
          const v = r.rhs / a, id = recs.length;
          const op = a > 0 ? r.op : r.op === '<=' ? '>=' : r.op === '>=' ? '<=' : '=';
          tighten(j, op !== '<=' ? v : -Infinity, op !== '>=' ? v : Infinity, id);
          killRow(i); recs.push({ kind: 'single', i, j, id }); changed++;
          continue;
        }
        if (sz === 2 && r.op === '=') {
          let [[j, aj], [k, ak]] = [...r.m.entries()];
          if (cols[k].size > cols[j].size) { [j, aj, k, ak] = [k, ak, j, aj]; }
          if (cols[k].size > 8 || Math.abs(ak) < 1e-3 * Math.abs(aj)) continue;
          const rr = -aj / ak, s = r.rhs / ak;
          if (Math.abs(rr) > 1e6) continue;
          const id = recs.length;
          let nl = -Infinity, nu = Infinity, loFrom = LOW, upFrom = UPP;
          if (rr > 0) { if (lo[k] > -Infinity) nl = (lo[k] - s) / rr; if (up[k] < Infinity) nu = (up[k] - s) / rr; }
          else { if (lo[k] > -Infinity) { nu = (lo[k] - s) / rr; upFrom = LOW; } if (up[k] < Infinity) { nl = (up[k] - s) / rr; loFrom = UPP; } }
          tighten(j, nl, nu, id);
          c[j] += c[k] * rr; c0 += c[k] * s;
          killRow(i);
          for (const i2 of cols[k]) {
            const R2 = rows[i2], a2 = R2.m.get(k);
            R2.rhs -= a2 * s; R2.m.delete(k);
            const nj = (R2.m.get(j) || 0) + a2 * rr;
            if (Math.abs(nj) < 1e-12) { R2.m.delete(j); cols[j].delete(i2); } else { R2.m.set(j, nj); cols[j].add(i2); }
          }
          cols[k].clear(); alive[k] = 0;
          recs.push({ kind: 'dbl', i, j, k, id, loFrom, upFrom }); changed++;
        }
      }
      for (let j = 0; j < n && !bad; j++) {
        if (!alive[j]) continue;
        if (lo[j] === up[j]) { dropCol(j, LOW); changed++; continue; }
        const cd = c[j] * dir;
        if (!cols[j].size) {
          if (cd > 0) { if (lo[j] > -Infinity) dropCol(j, LOW); else { bad = true; break; } }
          else if (cd < 0) { if (up[j] < Infinity) dropCol(j, UPP); else { bad = true; break; } }
          else dropCol(j, lo[j] > -Infinity ? LOW : up[j] < Infinity ? UPP : FREE);
          changed++;
          continue;
        }
        let dec = true, inc = true;
        for (const i of cols[j]) {
          const r = rows[i], a = r.m.get(j);
          if (r.op === '=') { dec = inc = false; break; }
          if (r.op === '<=' ? a > 0 : a < 0) inc = false; else dec = false;
          if (!dec && !inc) break;
        }
        if (dec && cd >= 0 && lo[j] > -Infinity) { dropCol(j, LOW); changed++; }
        else if (inc && cd <= 0 && up[j] < Infinity) { dropCol(j, UPP); changed++; }
      }
      if (!changed) break;
    }
    if (bad) return null;

    const colMap = [], newCol = new Int32Array(n).fill(-1);
    for (let j = 0; j < n; j++) if (alive[j]) { newCol[j] = colMap.length; colMap.push(j); }
    const rowMap = [], R = [];
    rows.forEach((r, i) => {
      if (!r.alive) return;
      rowMap.push(i);
      const idx = [], val = [];
      for (const [j, a] of r.m) { idx.push(newCol[j]); val.push(a); }
      R.push({ idx, val, op: r.op, rhs: r.rhs });
    });
    return {
      P: { n: colMap.length, c: Float64Array.from(colMap, (j) => c[j]), c0, rows: R, lower: Float64Array.from(colMap, (j) => lo[j]), upper: Float64Array.from(colMap, (j) => up[j]), maximize: P.maximize },
      colMap, rowMap, recs, dropped, loSrc, upSrc, n, m, ops: P.rows.map((r) => r.op)
    };
  }

  function liftBasis(Z, rb) {
    const { n, m, colMap, rowMap } = Z, n2 = colMap.length, N = n + m;
    const stat = new Int8Array(N).fill(-1);
    for (let t = 0; t < rb.stat.length; t++) stat[t < n2 ? colMap[t] : n + rowMap[t - n2]] = rb.stat[t];
    for (const d of Z.dropped) stat[d.j] = d.side;
    for (let q = Z.recs.length - 1; q >= 0; q--) {
      const r = Z.recs[q], s = n + r.i;
      if (r.kind === 'empty') { stat[s] = BASIC; continue; }
      const sj = stat[r.j];
      const own = (sj === LOW && Z.loSrc[r.j] === r.id) ? LOW : (sj === UPP && Z.upSrc[r.j] === r.id) ? UPP : 0;
      if (r.kind === 'single') {
        if (own) { stat[r.j] = BASIC; stat[s] = Z.ops[r.i] === '<=' ? UPP : LOW; } else stat[s] = BASIC;
        continue;
      }
      stat[s] = LOW;
      if (own) { stat[r.j] = BASIC; stat[r.k] = own === LOW ? r.loFrom : r.upFrom; } else stat[r.k] = BASIC;
    }
    const head = [];
    for (let j = 0; j < N; j++) { if (stat[j] < 0) return null; if (stat[j] === BASIC) head.push(j); }
    if (head.length !== m) return null;
    return { n, head: Int32Array.from(head), stat };
  }

  function presolveLP(P, o) {
    const n = P.n, m = P.rows.length;
    if (!m || (o.presolve !== 'force' && n + m < 300)) return null;
    const Z = reduce(P, Float64Array.from(o.lower || P.lower), Float64Array.from(o.upper || P.upper));
    if (!Z) { E.__psWhy = 'reduce-null'; return null; }
    const gone = (n - Z.P.n) + (m - Z.P.rows.length);
    if (!gone || (o.presolve !== 'force' && gone < Math.max(10, 0.02 * (n + m)))) return null;
    let rr, fin;
    try { rr = E.solveRevised(Z.P, { maxIter: o.maxIter, deadline: o.deadline }); } catch (e) { return null; }
    if (rr.status !== 'optimal') { E.__psWhy = 'reduced:' + rr.status; return null; }
    if (!rr.basis) {
      if (Z.P.rows.length) return null;
      rr.basis = { stat: Int8Array.from(rr.x, (v, j) => (v === Z.P.lower[j] ? LOW : v === Z.P.upper[j] ? UPP : FREE)) };
    }
    const basis = liftBasis(Z, rr.basis);
    if (!basis) { E.__psWhy = 'lift'; return null; }
    try { fin = E.solveRevised(P, Object.assign({}, o, { basis, presolve: false })); } catch (e) { return null; }
    if (fin.status !== 'optimal') { E.__psWhy = 'fin:' + fin.status; return null; }
    fin.presolve = { rows: m - Z.P.rows.length, cols: n - Z.P.n, reducedPivots: rr.iterations, cleanupPivots: fin.iterations };
    fin.iterations += rr.iterations;
    fin.dual = (fin.dual || 0) + (rr.dual || 0);
    return fin;
  }

  E.presolveLP = presolveLP;
  E.presolveReduce = reduce;
});
