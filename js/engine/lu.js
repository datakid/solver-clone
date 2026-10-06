NadirEngine.define('lu', function (E) {
  'use strict';

  const DENSE_MAX = 320;
  const ABS_TOL = 1e-11;
  const REL_TOL = 0.01;
  const DROP = 1e-14;

  function denseFactor(m, cols) {
    const A = new Float64Array(m * m);
    for (let k = 0; k < m; k++) {
      const c = cols[k];
      for (let t = 0; t < c.idx.length; t++) A[c.idx[t] * m + k] += c.val[t];
    }
    const rowAt = new Int32Array(m);
    for (let i = 0; i < m; i++) rowAt[i] = i;
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
    const rI = new Array(m), rV = new Array(m), cP = new Array(m);
    for (let i = 0; i < m; i++) { rI[i] = []; rV[i] = []; }
    const seen = new Int32Array(m).fill(-1);
    for (let k = 0; k < m; k++) {
      const pat = [];
      const c = cols[k];
      for (let t = 0; t < c.idx.length; t++) {
        const i = c.idx[t], v = c.val[t];
        if (v === 0) continue;
        if (seen[i] === k) { const L = rI[i].length - 1; rV[i][L] += v; continue; }
        seen[i] = k;
        rI[i].push(k); rV[i].push(v); pat.push(i);
      }
      cP[k] = pat;
    }

    const bHead = new Int32Array(m + 2).fill(-1), bNext = new Int32Array(m).fill(-1), bPrev = new Int32Array(m).fill(-1), bCnt = new Int32Array(m);
    const bIn = (j, c) => { bCnt[j] = c; bPrev[j] = -1; bNext[j] = bHead[c]; if (bHead[c] >= 0) bPrev[bHead[c]] = j; bHead[c] = j; };
    const bOut = (j) => { const c = bCnt[j]; if (bPrev[j] >= 0) bNext[bPrev[j]] = bNext[j]; else bHead[c] = bNext[j]; if (bNext[j] >= 0) bPrev[bNext[j]] = bPrev[j]; bPrev[j] = bNext[j] = -1; };
    const colDone = new Uint8Array(m), rowDone = new Uint8Array(m);
    const recount = (j) => { if (colDone[j]) return; const c = Math.min(cP[j].length, m + 1); if (c !== bCnt[j]) { bOut(j); bIn(j, c); } };
    for (let k = 0; k < m; k++) bIn(k, Math.min(cP[k].length, m + 1));

    const valueAt = (i, j) => { const I = rI[i]; for (let t = 0; t < I.length; t++) if (I[t] === j) return rV[i][t]; return 0; };
    const dropFromPat = (j, i) => { const p = cP[j]; for (let t = 0; t < p.length; t++) if (p[t] === i) { p[t] = p[p.length - 1]; p.pop(); return; } };
    const colMax = (j) => { let mx = 0; for (const i of cP[j]) { const v = Math.abs(valueAt(i, j)); if (v > mx) mx = v; } return mx; };

    const rowQ = [];
    for (let i = 0; i < m; i++) if (rI[i].length === 1) rowQ.push(i);

    function choose() {
      while (rowQ.length) {
        const r = rowQ.pop();
        if (rowDone[r] || rI[r].length !== 1) continue;
        const c = rI[r][0], v = rV[r][0];
        if (Math.abs(v) > ABS_TOL && Math.abs(v) >= REL_TOL * colMax(c)) return [r, c, v];
      }
      for (let j = bHead[1]; j >= 0; j = bNext[j]) {
        const r = cP[j][0], v = valueAt(r, j);
        if (Math.abs(v) > ABS_TOL) return [r, j, v];
      }
      let best = Infinity, br = -1, bc = -1, bv = 0, looked = 0;
      for (let cnt = 2; cnt <= m + 1; cnt++) {
        for (let j = bHead[cnt]; j >= 0; j = bNext[j]) {
          const pat = cP[j];
          let mx = 0;
          const vals = new Array(pat.length);
          for (let t = 0; t < pat.length; t++) { const v = valueAt(pat[t], j); vals[t] = v; const a = Math.abs(v); if (a > mx) mx = a; }
          looked++;
          if (mx <= ABS_TOL) continue;
          for (let t = 0; t < pat.length; t++) {
            const a = Math.abs(vals[t]);
            if (a < REL_TOL * mx || a <= ABS_TOL) continue;
            const cost = (rI[pat[t]].length - 1) * (cnt - 1);
            if (cost < best || (cost === best && a > Math.abs(bv))) { best = cost; br = pat[t]; bc = j; bv = vals[t]; }
          }
          if (br >= 0 && (looked >= 8 || best <= (cnt - 1) * (cnt - 1))) return [br, bc, bv];
        }
        if (br >= 0 && best <= (cnt - 1) * cnt) return [br, bc, bv];
      }
      if (br >= 0) return [br, bc, bv];
      for (let j = bHead[1]; j >= 0; j = bNext[j]) {
        const r = cP[j][0], v = valueAt(r, j);
        if (Math.abs(v) > ABS_TOL) return [r, j, v];
      }
      return null;
    }

    const pivRow = new Int32Array(m), pivCol = new Int32Array(m);
    const Ls = [0], Lr = [], Lv = [];
    const D = new Float64Array(m), rowOf = new Int32Array(m);
    const UrI = new Array(m), UrV = new Array(m);
    const stampOf = new Int32Array(m).fill(-1), posOf = new Int32Array(m);
    let stamp = 0, K = 0;

    while (K < m) {
      const pick = choose();
      if (!pick) break;
      const [r, c, p] = pick;
      pivRow[K] = r; pivCol[K] = c;
      D[c] = p; rowOf[c] = r;
      const ri = rI[r], rv = rV[r];
      const uc = [], uv = [];
      for (let t = 0; t < ri.length; t++) if (ri[t] !== c) { uc.push(ri[t]); uv.push(rv[t]); }
      UrI[c] = uc; UrV[c] = uv;
      for (let t = 0; t < ri.length; t++) { dropFromPat(ri[t], r); }
      rowDone[r] = 1; colDone[c] = 1; bOut(c);
      rI[r] = null; rV[r] = null;
      const rowsC = cP[c];
      cP[c] = [];
      for (let q = 0; q < rowsC.length; q++) {
        const i = rowsC[q];
        const Ii = rI[i], Vi = rV[i];
        let l = 0;
        for (let t = 0; t < Ii.length; t++) if (Ii[t] === c) { l = Vi[t] / p; Ii[t] = Ii[Ii.length - 1]; Vi[t] = Vi[Vi.length - 1]; Ii.pop(); Vi.pop(); break; }
        Lr.push(i); Lv.push(l);
        if (l === 0) continue;
        stamp++;
        for (let t = 0; t < Ii.length; t++) { stampOf[Ii[t]] = stamp; posOf[Ii[t]] = t; }
        let small = false;
        for (let k = 0; k < uc.length; k++) {
          const j = uc[k], nv = -l * uv[k];
          if (stampOf[j] === stamp) { const t = posOf[j]; Vi[t] += nv; if (Math.abs(Vi[t]) < DROP) small = true; }
          else { stampOf[j] = stamp; posOf[j] = Ii.length; Ii.push(j); Vi.push(nv); cP[j].push(i); }
        }
        if (small) {
          let w = 0;
          for (let t = 0; t < Ii.length; t++) {
            if (Math.abs(Vi[t]) < DROP) { dropFromPat(Ii[t], i); continue; }
            Ii[w] = Ii[t]; Vi[w] = Vi[t]; w++;
          }
          Ii.length = w; Vi.length = w;
        }
        if (Ii.length === 1) rowQ.push(i);
      }
      Ls.push(Lr.length);
      for (let k = 0; k < uc.length; k++) recount(uc[k]);
      for (let k = 0; k < uc.length; k++) { const j = uc[k]; for (const i of cP[j]) if (rI[i] && rI[i].length === 1) rowQ.push(i); }
      K++;
    }
    if (K < m) {
      const rows = [], singular = [];
      for (let i = 0; i < m; i++) if (!rowDone[i]) rows.push(i);
      for (let k = 0; k < m; k++) if (!colDone[k]) singular.push(k);
      return { ok: false, singular: singular.map((pos, i) => ({ pos, row: rows[i] })) };
    }

    const LsA = Int32Array.from(Ls), LrA = Int32Array.from(Lr), LvA = Float64Array.from(Lv);
    const seq = Array.from(pivCol);
    const seqPos = new Int32Array(m);
    for (let k = 0; k < m; k++) seqPos[seq[k]] = k;
    const Ucol = new Array(m), UcolV = new Array(m);
    for (let c = 0; c < m; c++) { Ucol[c] = []; UcolV[c] = []; }
    let uNnz = 0;
    for (let c = 0; c < m; c++) { const I = UrI[c], V = UrV[c]; uNnz += I.length; for (let t = 0; t < I.length; t++) { Ucol[I[t]].push(c); UcolV[I[t]].push(V[t]); } }
    const LtS = new Int32Array(m + 1), nL = LrA.length;
    for (let t = 0; t < nL; t++) LtS[LrA[t] + 1]++;
    for (let i = 0; i < m; i++) LtS[i + 1] += LtS[i];
    const LtK = new Int32Array(nL), LtV = new Float64Array(nL), fillL = LtS.slice(0, m);
    for (let k = 0; k < m; k++) for (let t = LsA[k]; t < LsA[k + 1]; t++) { const p = fillL[LrA[t]]++; LtK[p] = pivRow[k]; LtV[p] = LvA[t]; }
    const pivOrder = new Int32Array(m);
    for (let k = 0; k < m; k++) pivOrder[pivRow[k]] = k;
    const removeCol = (c, p) => { const I = Ucol[c], V = UcolV[c]; for (let t = 0; t < I.length; t++) if (I[t] === p) { I[t] = I[I.length - 1]; I.pop(); V[t] = V[V.length - 1]; V.pop(); return; } };
    const nnz0 = LrA.length + uNnz + m;
    const etaR = [], etaI = [], etaV = [];
    let etaNnz = 0;
    let spike = null;
    const work = new Float64Array(m), inHeap = new Uint8Array(m);
    const heap = [];
    const hPush = (c) => {
      heap.push(c);
      let i = heap.length - 1;
      while (i > 0) { const pa = (i - 1) >> 1; if (seqPos[heap[pa]] <= seqPos[heap[i]]) break; const t = heap[pa]; heap[pa] = heap[i]; heap[i] = t; i = pa; }
    };
    const hPop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r2 = l + 1;
          let s = i;
          if (l < heap.length && seqPos[heap[l]] < seqPos[heap[s]]) s = l;
          if (r2 < heap.length && seqPos[heap[r2]] < seqPos[heap[s]]) s = r2;
          if (s === i) break;
          const t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s;
        }
      }
      return top;
    };
    const removeIn = (arrI, arrV, c) => { for (let t = 0; t < arrI.length; t++) if (arrI[t] === c) { arrI[t] = arrI[arrI.length - 1]; arrI.pop(); if (arrV) { arrV[t] = arrV[arrV.length - 1]; arrV.pop(); } return true; } return false; };

    function ftran(b) {
      const w = Float64Array.from(b);
      for (let k = 0; k < m; k++) {
        const br = w[pivRow[k]];
        if (br === 0) continue;
        for (let t = LsA[k]; t < LsA[k + 1]; t++) w[LrA[t]] -= LvA[t] * br;
      }
      for (let e = 0; e < etaR.length; e++) {
        const I = etaI[e], V = etaV[e];
        let s = 0;
        for (let t = 0; t < I.length; t++) s += V[t] * w[I[t]];
        if (s !== 0) w[etaR[e]] -= s;
      }
      spike = Float64Array.from(w);
      const x = new Float64Array(m);
      for (let q = seq.length - 1; q >= 0; q--) {
        const c = seq[q];
        if (seqPos[c] !== q) continue;
        const s = w[rowOf[c]];
        if (s === 0) continue;
        const xc = s / D[c];
        x[c] = xc;
        const I = Ucol[c], V = UcolV[c];
        for (let t = 0; t < I.length; t++) w[rowOf[I[t]]] -= V[t] * xc;
      }
      return x;
    }

    function btran(cv) {
      const cc = Float64Array.from(cv);
      const v = new Float64Array(m);
      for (let q = 0; q < seq.length; q++) {
        const c = seq[q];
        if (seqPos[c] !== q) continue;
        const vr = cc[c] / D[c];
        v[rowOf[c]] = vr;
        if (vr === 0) continue;
        const I = UrI[c], V = UrV[c];
        for (let t = 0; t < I.length; t++) cc[I[t]] -= V[t] * vr;
      }
      for (let e = etaR.length - 1; e >= 0; e--) {
        const vr = v[etaR[e]];
        if (vr === 0) continue;
        const I = etaI[e], V = etaV[e];
        for (let t = 0; t < I.length; t++) v[I[t]] -= V[t] * vr;
      }
      for (let k = m - 1; k >= 0; k--) {
        const i = pivRow[k], vi = v[i];
        if (vi === 0) continue;
        for (let t = LtS[i]; t < LtS[i + 1]; t++) v[LtK[t]] -= LtV[t] * vi;
      }
      return v;
    }

    function update(p, w) {
      if (!spike) return false;
      const s = spike;
      spike = null;
      const Dold = D[p];
      const col = Ucol[p];
      for (let t = 0; t < col.length; t++) { const c = col[t]; if (removeIn(UrI[c], UrV[c], p)) uNnz--; }
      const fresh = [], freshV = [];
      let smax = 0;
      for (let c = 0; c < m; c++) {
        if (c === p) continue;
        const v = s[rowOf[c]];
        if (v === 0 || Math.abs(v) < DROP) continue;
        UrI[c].push(p); UrV[c].push(v); fresh.push(c); freshV.push(v); uNnz++;
        if (Math.abs(v) > smax) smax = Math.abs(v);
      }
      Ucol[p] = fresh; UcolV[p] = freshV;
      let dp = s[rowOf[p]];
      const oldI = UrI[p], oldV = UrV[p];
      UrI[p] = []; UrV[p] = [];
      uNnz -= oldI.length;
      seqPos[p] = seq.length;
      seq.push(p);
      for (let t = 0; t < oldI.length; t++) {
        const c = oldI[t];
        removeCol(c, p);
        work[c] = oldV[t];
        if (!inHeap[c]) { inHeap[c] = 1; hPush(c); }
      }
      const eI = [], eV = [];
      while (heap.length) {
        const c = hPop();
        inHeap[c] = 0;
        const u = work[c];
        work[c] = 0;
        if (Math.abs(u) < DROP) continue;
        const mult = u / D[c];
        eI.push(rowOf[c]); eV.push(mult);
        const I = UrI[c], V = UrV[c];
        for (let t = 0; t < I.length; t++) {
          const c2 = I[t];
          if (c2 === p) { dp -= mult * V[t]; continue; }
          work[c2] -= mult * V[t];
          if (!inHeap[c2]) { inHeap[c2] = 1; hPush(c2); }
        }
      }
      D[p] = dp;
      if (eI.length) { etaR.push(rowOf[p]); etaI.push(Int32Array.from(eI)); etaV.push(Float64Array.from(eV)); etaNnz += eI.length; }
      const expect = w[p] * Dold;
      const scale = Math.max(Math.abs(dp), Math.abs(expect), 1e-300);
      if (!(Math.abs(dp) > ABS_TOL * Math.max(1, smax)) || Math.abs(dp - expect) > 1e-7 * scale + 1e-12) return false;
      return true;
    }

    const grown = () => uNnz + etaNnz + LrA.length + m > 3 * nnz0 + 4 * m || seq.length > 3 * m;

    return { ok: true, ftran, btran, update, grown, kind: 'sparse', get nnz() { return LrA.length + uNnz + etaNnz + m; } };
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
      m, updates: 0, refactors: 0, broken: false,
      get kind() { return lu ? lu.kind : null; },
      factor(head) {
        const cols = new Array(m);
        for (let k = 0; k < m; k++) cols[k] = getCol(head[k]);
        const f = factor(m, cols, o);
        etas.length = 0; etaNnz = 0; B.updates = 0; B.refactors++; B.broken = false;
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
        if (!etas.length) return lu.btran(c);
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
        B.updates++;
        if (lu.update) { if (!lu.update(r, w)) B.broken = true; return; }
        const idx = [], val = [];
        for (let i = 0; i < m; i++) if (i !== r && w[i] !== 0 && Math.abs(w[i]) > 1e-14) { idx.push(i); val.push(w[i]); }
        etas.push({ r, wr: w[r], idx: Int32Array.from(idx), val: Float64Array.from(val) });
        etaNnz += idx.length;
      },
      needsRefactor() {
        if (B.broken) return true;
        if (lu && lu.update) return B.updates >= (o.refactorEvery || Math.max(160, Math.min(600, m >> 3))) || lu.grown();
        return B.updates >= (o.refactorEvery || 80) || etaNnz > 4 * ((lu && lu.nnz) || m) + 20 * m;
      }
    };
    return B;
  }

  E.luFactor = factor;
  E.LUBasis = Basis;
  E.LU_DENSE_MAX = DENSE_MAX;
});
