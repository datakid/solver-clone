NadirEngine.define('reform', function (E) {
  'use strict';

  const { OP } = E;
  const MAX_AUX = 60000;

  function reformulate(C, rowsIdx) {
    const ir = C.ir, op = ir.op, a = ir.a, b = ir.b, cc = ir.c, fl = ir.flags, val = ir.val;
    const linMemo = new Array(ir.size);
    const memo = new Map();
    const rows = [];
    const kinds = { abs: 0, max: 0, min: 0 };
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

    const newAux = () => {
      if (nAux >= MAX_AUX) throw new Error('too many pieces');
      return C.n + nAux++;
    };

    const addRow = (L, t, tCoef, opName) => {
      const idx = [], v = [];
      for (const [k, x] of L.m) if (x !== 0) { idx.push(k); v.push(x); }
      idx.push(t); v.push(tCoef);
      rows.push({ idx, val: v, op: opName, rhs: -L.c });
    };

    function rep(id, s) {
      if (!(fl[id] & 4)) return affine(id);
      const key = id * 3 + (s + 1);
      if (memo.has(key)) return memo.get(key);
      const r = build(id, s);
      memo.set(key, r);
      return r;
    }

    function build(id, s) {
      const o = op[id];
      switch (o) {
        case OP.ADD: case OP.SUB: {
          const neg = o === OP.SUB;
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
          if (s !== 1) return null;
          const hi = rep(a[id], 1), lo = rep(a[id], -1);
          if (!hi || !lo) return null;
          const t = newAux();
          addRow(hi, t, -1, '<=');
          addRow(comb([[lo, -1]]), t, -1, '<=');
          kinds.abs++;
          return { m: new Map([[t, 1]]), c: 0 };
        }
        case OP.MAX: {
          if (s !== 1) return null;
          const L = rep(a[id], 1), R = rep(b[id], 1);
          if (!L || !R) return null;
          const t = newAux();
          addRow(L, t, -1, '<=');
          addRow(R, t, -1, '<=');
          kinds.max++;
          return { m: new Map([[t, 1]]), c: 0 };
        }
        case OP.MIN: {
          if (s !== -1) return null;
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
      return { goalLin, rowLin, nAux, rows, kinds };
    } catch (e) {
      return null;
    }
  }

  E.reformulate = reformulate;
});
