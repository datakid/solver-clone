NadirEngine.define('lu', function (E) {
  'use strict';

  const DENSE_MAX = 320;
  const ABS_TOL = 1e-11;
  const REL_TOL = 0.01;

  function denseFactor(m, cols) {
    const A = new Float64Array(m * m);
    for (let k = 0; k < m; k++) {
      const c = cols[k];
      for (let t = 0; t < c.idx.length; t++) A[c.idx[t] * m + k] += c.val[t];
    }
    const rowAt = new Int32Array(m);
    for (let i = 0; i < m; i++) rowAt[i] = i;
    const colAt = new Int32Array(m);
    const singular = [];
    let s = 0;
    for (let k = 0; k < m; k++) {
      let best = -1, bv = ABS_TOL;
      for (let i = s; i < m; i++) { const v = Math.abs(A[i * m + k]); if (v > bv) { bv = v; best = i; } }
      if (best < 0) { singular.push(k); continue; }
      if (best !== s) {
        for (let j = 0; j < m; j++) { const t = A[s * m + j]; A[s * m + j] = A[best * m + j]; A[best * m + j] = t; }
        const t = rowAt[s]; rowAt[s] = rowAt[best]; rowAt[best] = t;
      }
      const p = A[s * m + k];
      for (let i = s + 1; i < m; i++) {
        const f = A[i * m + k];
        if (f === 0) continue;
        const l = f / p;
        A[i * m + k] = l;
        const ri = i * m, rs = s * m;
        for (let j = k + 1; j < m; j++) { const u = A[rs + j]; if (u !== 0) A[ri + j] -= l * u; }
      }
      colAt[s] = k;
      s++;
    }
    if (singular.length) {
      const rows = [];
      for (let i = s; i < m; i++) rows.push(rowAt[i]);
      return { ok: false, singular: singular.map((pos, i) => ({ pos, row: rows[i] })) };
    }
    function ftran(b) {
      const z = new Float64Array(m);
      for (let i = 0; i < m; i++) z[i] = b[rowAt[i]];
      for (let i = 0; i < m; i++) {
        const zi = z[i];
        if (zi === 0) continue;
        for (let r = i + 1; r < m; r++) { const l = A[r * m + i]; if (l !== 0) z[r] -= l * zi; }
      }
      const x = new Float64Array(m);
      for (let i = m - 1; i >= 0; i--) {
        let v = z[i];
        const ri = i * m;
        for (let j = i + 1; j < m; j++) { const u = A[ri + j]; if (u !== 0) v -= u * x[j]; }
        x[i] = v / A[ri + i];
      }
      return x;
    }
    function btran(c) {
      const w = new Float64Array(m);
      for (let i = 0; i < m; i++) w[i] = c[i];
      for (let i = 0; i < m; i++) {
        const ri = i * m;
        const wi = w[i] / A[ri + i];
        w[i] = wi;
        if (wi === 0) continue;
        for (let j = i + 1; j < m; j++) { const u = A[ri + j]; if (u !== 0) w[j] -= u * wi; }
      }
      for (let i = m - 1; i >= 0; i--) {
        let v = w[i];
        for (let r = i + 1; r < m; r++) { const l = A[r * m + i]; if (l !== 0) v -= l * w[r]; }
        w[i] = v;
      }
      const y = new Float64Array(m);
      for (let i = 0; i < m; i++) y[rowAt[i]] = w[i];
      return y;
    }
    return { ok: true, ftran, btran, kind: 'dense', nnz: m * m };
  }

  function sparseFactor(m, cols) {
    const rowMap = new Array(m);
    const colSet = new Array(m);
    for (let i = 0; i < m; i++) rowMap[i] = new Map();
    for (let k = 0; k < m; k++) {
      colSet[k] = new Set();
      const c = cols[k];
      for (let t = 0; t < c.idx.length; t++) {
        const i = c.idx[t], v = c.val[t];
        if (v === 0) continue;
        const cur = rowMap[i].get(k);
        rowMap[i].set(k, (cur || 0) + v);
        colSet[k].add(i);
      }
    }
    const rowDone = new Uint8Array(m), colDone = new Uint8Array(m);
    const pivRow = new Int32Array(m), pivCol = new Int32Array(m), pivVal = new Float64Array(m);
    const Ls = [0], Lr = [], Lv = [];
    const Us = [0], Uc = [], Uv = [];
    const colQ = [], rowQ = [];
    for (let k = 0; k < m; k++) if (colSet[k].size === 1) colQ.push(k);
    for (let i = 0; i < m; i++) if (rowMap[i].size === 1) rowQ.push(i);
    let K = 0;

    function colMax(c) {
      let mx = 0;
      for (const i of colSet[c]) { const v = Math.abs(rowMap[i].get(c)); if (v > mx) mx = v; }
      return mx;
    }

    function choose() {
      while (colQ.length) {
        const c = colQ.pop();
        if (colDone[c] || colSet[c].size !== 1) continue;
        const r = colSet[c].values().next().value;
        const v = rowMap[r].get(c);
        if (Math.abs(v) > ABS_TOL) return [r, c];
      }
      while (rowQ.length) {
        const r = rowQ.pop();
        if (rowDone[r] || rowMap[r].size !== 1) continue;
        const [c, v] = rowMap[r].entries().next().value;
        if (Math.abs(v) > ABS_TOL && Math.abs(v) >= REL_TOL * colMax(c)) return [r, c];
      }
      let bestScore = Infinity, br = -1, bc = -1;
      let cmin = Infinity;
      for (let c = 0; c < m; c++) { if (colDone[c]) continue; const cc = colSet[c].size; if (cc && cc < cmin) cmin = cc; }
      const cand = [], rest = [];
      for (let c = 0; c < m; c++) {
        if (colDone[c]) continue;
        const cc = colSet[c].size;
        if (!cc) continue;
        if (cc <= cmin + 1 && cand.length < 8) cand.push(c); else rest.push(c);
      }
      const lim = cand.length;
      for (const c of rest) cand.push(c);
      for (let t = 0; t < lim; t++) {
        const c = cand[t];
        const mx = colMax(c);
        if (mx <= ABS_TOL) continue;
        const cc = colSet[c].size;
        for (const i of colSet[c]) {
          const v = Math.abs(rowMap[i].get(c));
          if (v < REL_TOL * mx || v <= ABS_TOL) continue;
          const score = (rowMap[i].size - 1) * (cc - 1) - v / (mx + 1) * 1e-3;
          if (score < bestScore) { bestScore = score; br = i; bc = c; }
        }
        if (bestScore <= 0) break;
      }
      if (br >= 0) return [br, bc];
      for (let t = lim; t < cand.length; t++) {
        const c = cand[t];
        const mx = colMax(c);
        if (mx <= ABS_TOL) continue;
        for (const i of colSet[c]) { const v = Math.abs(rowMap[i].get(c)); if (v >= REL_TOL * mx && v > ABS_TOL) return [i, c]; }
      }
      return null;
    }

    while (K < m) {
      const pick = choose();
      if (!pick) break;
      const [r, c] = pick;
      const row = rowMap[r];
      const p = row.get(c);
      pivRow[K] = r; pivCol[K] = c; pivVal[K] = p;
      const uc = [], uv = [];
      for (const [j, v] of row) if (j !== c) { uc.push(j); uv.push(v); }
      for (let t = 0; t < uc.length; t++) { Uc.push(uc[t]); Uv.push(uv[t]); }
      Us.push(Uc.length);
      for (const i of colSet[c]) {
        if (i === r) continue;
        const ri = rowMap[i];
        const l = ri.get(c) / p;
        ri.delete(c);
        Lr.push(i); Lv.push(l);
        for (let t = 0; t < uc.length; t++) {
          const j = uc[t];
          const old = ri.get(j);
          const nv = (old === undefined ? 0 : old) - l * uv[t];
          if (Math.abs(nv) < 1e-14) {
            if (old !== undefined) { ri.delete(j); colSet[j].delete(i); if (colSet[j].size === 1) colQ.push(j); }
          } else {
            ri.set(j, nv);
            if (old === undefined) colSet[j].add(i);
          }
        }
        if (ri.size === 1) rowQ.push(i);
      }
      Ls.push(Lr.length);
      for (const j of uc) { colSet[j].delete(r); if (colSet[j].size === 1) colQ.push(j); }
      colSet[c].clear();
      rowMap[r] = null;
      rowDone[r] = 1; colDone[c] = 1;
      K++;
    }
    if (K < m) {
      const rows = [], singular = [];
      for (let i = 0; i < m; i++) if (!rowDone[i]) rows.push(i);
      for (let k = 0; k < m; k++) if (!colDone[k]) singular.push(k);
      return { ok: false, singular: singular.map((pos, i) => ({ pos, row: rows[i] })) };
    }
    const LsA = Int32Array.from(Ls), LrA = Int32Array.from(Lr), LvA = Float64Array.from(Lv);
    const UsA = Int32Array.from(Us), UcA = Int32Array.from(Uc), UvA = Float64Array.from(Uv);
    function ftran(b) {
      const w = Float64Array.from(b);
      for (let k = 0; k < m; k++) {
        const br = w[pivRow[k]];
        if (br === 0) continue;
        for (let t = LsA[k]; t < LsA[k + 1]; t++) w[LrA[t]] -= LvA[t] * br;
      }
      const x = new Float64Array(m);
      for (let k = m - 1; k >= 0; k--) {
        let s = w[pivRow[k]];
        for (let t = UsA[k]; t < UsA[k + 1]; t++) s -= UvA[t] * x[UcA[t]];
        x[pivCol[k]] = s / pivVal[k];
      }
      return x;
    }
    function btran(c) {
      const cc = Float64Array.from(c);
      const v = new Float64Array(m);
      for (let k = 0; k < m; k++) {
        const vr = cc[pivCol[k]] / pivVal[k];
        v[pivRow[k]] = vr;
        if (vr === 0) continue;
        for (let t = UsA[k]; t < UsA[k + 1]; t++) cc[UcA[t]] -= UvA[t] * vr;
      }
      for (let k = m - 1; k >= 0; k--) {
        let s = 0;
        for (let t = LsA[k]; t < LsA[k + 1]; t++) s += LvA[t] * v[LrA[t]];
        if (s !== 0) v[pivRow[k]] -= s;
      }
      return v;
    }
    return { ok: true, ftran, btran, kind: 'sparse', nnz: LrA.length + UcA.length + m };
  }

  function factor(m, cols, opt) {
    const o = opt || {};
    const sparse = o.force ? o.force === 'sparse' : m > DENSE_MAX;
    return sparse ? sparseFactor(m, cols) : denseFactor(m, cols);
  }

  function Basis(m, getCol, opt) {
    const o = opt || {};
    let lu = null;
    const etas = [];
    let etaNnz = 0;
    const B = {
      m, updates: 0, refactors: 0,
      get kind() { return lu ? lu.kind : null; },
      factor(head) {
        const cols = new Array(m);
        for (let k = 0; k < m; k++) cols[k] = getCol(head[k]);
        const f = factor(m, cols, o);
        etas.length = 0; etaNnz = 0; B.updates = 0; B.refactors++;
        if (!f.ok) { lu = null; return f; }
        lu = f;
        return f;
      },
      ftran(b) {
        const x = lu.ftran(b);
        for (let e = 0; e < etas.length; e++) {
          const E1 = etas[e];
          const xr = x[E1.r] / E1.wr;
          x[E1.r] = xr;
          if (xr === 0) continue;
          const I = E1.idx, V = E1.val;
          for (let t = 0; t < I.length; t++) x[I[t]] -= V[t] * xr;
        }
        return x;
      },
      btran(c) {
        const w = Float64Array.from(c);
        for (let e = etas.length - 1; e >= 0; e--) {
          const E1 = etas[e];
          let s = w[E1.r];
          const I = E1.idx, V = E1.val;
          for (let t = 0; t < I.length; t++) s -= V[t] * w[I[t]];
          w[E1.r] = s / E1.wr;
        }
        return lu.btran(w);
      },
      update(r, w) {
        const idx = [], val = [];
        for (let i = 0; i < m; i++) if (i !== r && w[i] !== 0 && Math.abs(w[i]) > 1e-14) { idx.push(i); val.push(w[i]); }
        etas.push({ r, wr: w[r], idx: Int32Array.from(idx), val: Float64Array.from(val) });
        etaNnz += idx.length;
        B.updates++;
      },
      needsRefactor() {
        return B.updates >= (o.refactorEvery || 80) || etaNnz > 4 * ((lu && lu.nnz) || m) + 20 * m;
      }
    };
    return B;
  }

  E.luFactor = factor;
  E.LUBasis = Basis;
  E.LU_DENSE_MAX = DENSE_MAX;
});
