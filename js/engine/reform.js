NadirEngine.define('reform', function (E) {
  'use strict';

  const { OP } = E;
  const MAX_AUX = 60000;
  const MAX_BIN = 400;
  const BIG = 1e7;

  function reformulate(C, rowsIdx, opt) {
    const o = opt || {};
    const allowBin = o.bigM !== false;
    const ir = C.ir, op = ir.op, a = ir.a, b = ir.b, cc = ir.c, fl = ir.flags, val = ir.val;
    const linMemo = new Array(ir.size);
    const memo = new Map();
    const rows = [];
    const kinds = { abs: 0, max: 0, min: 0, switched: 0 };
    const auxLo = [], auxHi = [], binaries = [];
    let nAux = 0;
    let T0 = null;

    const comb = (parts) => {
      const m = new Map();
      let c = 0;
      for (const [L, s] of parts) {
        if (s === 0) continue;
        for (const [k, x] of L.m) m.set(k, (m.get(k) || 0) + x * s);
        c += L.c * s;
      }
      return { m, c };
    };

    const affine = (id) => {
      if (op[id] === OP.K) return { m: new Map(), c: val[id] };
      if (!(fl[id] & 1)) { if (!T0) T0 = ir.evaluate(new Float64Array(C.n)); return { m: new Map(), c: T0[id] }; }
      return ir.linearize([id], linMemo)[0];
    };

    const constOf = (id) => (op[id] === OP.K ? val[id] : null);

    const newAux = (lo, hi) => {
      if (nAux >= MAX_AUX) throw new Error('too many pieces');
      auxLo.push(lo == null ? -Infinity : lo);
      auxHi.push(hi == null ? Infinity : hi);
      return C.n + nAux++;
    };

    const newBin = () => {
      if (binaries.length >= MAX_BIN) throw new Error('too many switches');
      const z = newAux(0, 1);
      binaries.push(z);
      return z;
    };

    const boundsOf = (j) => (j < C.n ? [C.lower[j], C.upper[j]] : [auxLo[j - C.n], auxHi[j - C.n]]);

    const range = (L) => {
      let lo = L.c, hi = L.c;
      for (const [j, x] of L.m) {
        if (x === 0) continue;
        const [l, u] = boundsOf(j);
        if (!Number.isFinite(l) || !Number.isFinite(u)) return null;
        if (x > 0) { lo += x * l; hi += x * u; } else { lo += x * u; hi += x * l; }
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || Math.max(Math.abs(lo), Math.abs(hi)) > BIG) return null;
      return [lo, hi];
    };

    const addRow = (L, t, tCoef, opName) => {
      const idx = [], v = [];
      for (const [k, x] of L.m) if (x !== 0) { idx.push(k); v.push(x); }
      idx.push(t); v.push(tCoef);
      rows.push({ idx, val: v, op: opName, rhs: -L.c });
    };

    const addRowZ = (L, t, tCoef, z, zCoef, opName, k) => {
      const idx = [], v = [];
      for (const [j, x] of L.m) if (x !== 0) { idx.push(j); v.push(x); }
      idx.push(t); v.push(tCoef);
      idx.push(z); v.push(zCoef);
      rows.push({ idx, val: v, op: opName, rhs: -L.c + k });
    };

    function rep(id, s) {
      if (!(fl[id] & 4)) return affine(id);
      const key = id * 3 + (s + 1);
      if (memo.has(key)) return memo.get(key);
      const r = build(id, s);
      memo.set(key, r);
      return r;
    }

    function exactAbs(id) {
      if (!allowBin) return null;
      const L = rep(a[id], 0);
      if (!L) return null;
      const R = range(L);
      if (!R) return null;
      const [lo, hi] = R;
      if (lo >= 0) return L;
      if (hi <= 0) return comb([[L, -1]]);
      const M = 2 * Math.max(-lo, hi);
      const t = newAux(0, Math.max(-lo, hi));
      const z = newBin();
      addRow(L, t, -1, '<=');
      addRow(comb([[L, -1]]), t, -1, '<=');
      addRowZ(L, t, -1, z, -M, '>=', -M);
      addRowZ(comb([[L, -1]]), t, -1, z, M, '>=', 0);
      kinds.abs++; kinds.switched++;
      return { m: new Map([[t, 1]]), c: 0 };
    }

    function exactPair(id, isMax) {
      if (!allowBin) return null;
      const L = rep(a[id], 0), R = rep(b[id], 0);
      if (!L || !R) return null;
      const dR = range(comb([[L, 1], [R, -1]]));
      const rl = range(L), rr = range(R);
      if (!dR || !rl || !rr) return null;
      if (dR[0] >= 0) return isMax ? L : R;
      if (dR[1] <= 0) return isMax ? R : L;
      const M = Math.max(-dR[0], dR[1]);
      const t = newAux(isMax ? Math.max(rl[0], rr[0]) : Math.min(rl[0], rr[0]), isMax ? Math.max(rl[1], rr[1]) : Math.min(rl[1], rr[1]));
      const z = newBin();
      if (isMax) {
        addRow(L, t, -1, '<=');
        addRow(R, t, -1, '<=');
        addRowZ(L, t, -1, z, -M, '>=', -M);
        addRowZ(R, t, -1, z, M, '>=', 0);
        kinds.max++;
      } else {
        addRow(L, t, -1, '>=');
        addRow(R, t, -1, '>=');
        addRowZ(L, t, -1, z, M, '<=', M);
        addRowZ(R, t, -1, z, -M, '<=', 0);
        kinds.min++;
      }
      kinds.switched++;
      return { m: new Map([[t, 1]]), c: 0 };
    }

    function build(id, s) {
      const o2 = op[id];
      switch (o2) {
        case OP.ADD: case OP.SUB: {
          const neg = o2 === OP.SUB;
          const L = rep(a[id], s);
          if (!L) return null;
          const R = rep(b[id], neg ? -s : s);
          return R ? comb([[L, 1], [R, neg ? -1 : 1]]) : null;
        }
        case OP.SUM: {
          const parts = [];
          for (const x of ir.lists[cc[id]]) { const L = rep(x, s); if (!L) return null; parts.push([L, 1]); }
          return comb(parts);
        }
        case OP.NEG: { const L = rep(a[id], -s); return L ? comb([[L, -1]]) : null; }
        case OP.MUL: {
          const ka = constOf(a[id]), kb = constOf(b[id]);
          const k = ka != null ? ka : kb;
          if (k == null) return null;
          if (k === 0) return { m: new Map(), c: 0 };
          const L = rep(ka != null ? b[id] : a[id], s * Math.sign(k));
          return L ? comb([[L, k]]) : null;
        }
        case OP.DIV: {
          const kb = constOf(b[id]);
          if (kb == null || kb === 0) return null;
          const L = rep(a[id], s * Math.sign(kb));
          return L ? comb([[L, 1 / kb]]) : null;
        }
        case OP.POW: return constOf(b[id]) === 1 ? rep(a[id], s) : null;
        case OP.ABS: {
          if (s !== 1) return exactAbs(id);
          const hi = rep(a[id], 1), lo = rep(a[id], -1);
          if (!hi || !lo) return null;
          const t = newAux();
          addRow(hi, t, -1, '<=');
          addRow(comb([[lo, -1]]), t, -1, '<=');
          kinds.abs++;
          return { m: new Map([[t, 1]]), c: 0 };
        }
        case OP.MAX: {
          if (s !== 1) return exactPair(id, true);
          const L = rep(a[id], 1), R = rep(b[id], 1);
          if (!L || !R) return null;
          const t = newAux();
          addRow(L, t, -1, '<=');
          addRow(R, t, -1, '<=');
          kinds.max++;
          return { m: new Map([[t, 1]]), c: 0 };
        }
        case OP.MIN: {
          if (s !== -1) return exactPair(id, false);
          const L = rep(a[id], -1), R = rep(b[id], -1);
          if (!L || !R) return null;
          const t = newAux();
          addRow(L, t, -1, '>=');
          addRow(R, t, -1, '>=');
          kinds.min++;
          return { m: new Map([[t, 1]]), c: 0 };
        }
        default: return null;
      }
    }

    const tidy = (L) => {
      const m = new Map();
      for (const [k, x] of L.m) if (x !== 0 && Number.isFinite(x)) m.set(k, x);
      return { m, c: L.c };
    };

    try {
      const gs = C.sense === 'max' ? -1 : C.sense === 'min' ? 1 : 0;
      let goalLin = { m: new Map(), c: 0 };
      if (C.goalRoot >= 0) {
        const g = rep(C.goalRoot, gs);
        if (!g) return null;
        goalLin = tidy(g);
      }
      const rowLin = [];
      for (const ri of rowsIdx) {
        const r = C.rows[ri];
        const L = rep(r.g, r.op === '<=' ? 1 : r.op === '>=' ? -1 : 0);
        if (!L) return null;
        rowLin.push(tidy(L));
      }
      if (!nAux) return null;
      return { goalLin, rowLin, nAux, rows, kinds, auxLo: Float64Array.from(auxLo), auxHi: Float64Array.from(auxHi), binaries };
    } catch (e) {
      return null;
    }
  }

  E.reformulate = reformulate;
});
