NadirEngine.define('model', function (E) {
  'use strict';

  const { OP, IR, NadirError } = E;

  const FUNCTIONS = {
    sum: { sig: 'sum(x)', doc: 'Sum of all elements' },
    prod: { sig: 'prod(x)', doc: 'Product of all elements' },
    mean: { sig: 'mean(x)', doc: 'Average of all elements' },
    min: { sig: 'min(x) · min(a, b, …)', doc: 'Smallest element, or elementwise minimum' },
    max: { sig: 'max(x) · max(a, b, …)', doc: 'Largest element, or elementwise maximum' },
    len: { sig: 'len(x)', doc: 'Number of elements' },
    dot: { sig: 'dot(a, b)', doc: 'Dot product' },
    sumprod: { sig: 'sumprod(a, b)', doc: 'Multiply element by element, then add up (like Excel SUMPRODUCT)' },
    pos: { sig: 'pos(x)', doc: 'The part above zero: max(x, 0) — shortfalls, overtime, excess' },
    neg: { sig: 'neg(x)', doc: 'The part below zero, as a positive number: max(−x, 0)' },
    clamp: { sig: 'clamp(x, lo, hi)', doc: 'x kept between lo and hi' },
    quad: { sig: 'quad(x, Q)', doc: 'Quadratic form xᵀQx' },
    sumsq: { sig: 'sumsq(x)', doc: 'Sum of squares' },
    norm: { sig: 'norm(x)', doc: 'Euclidean length' },
    rowsum: { sig: 'rowsum(M)', doc: 'Sum of each row' },
    colsum: { sig: 'colsum(M)', doc: 'Sum of each column' },
    cumsum: { sig: 'cumsum(x)', doc: 'Running total' },
    matmul: { sig: 'matmul(A, x)', doc: 'Matrix product' },
    T: { sig: 'T(M)', doc: 'Transpose' },
    rows: { sig: 'rows(M)', doc: 'Number of rows' },
    cols: { sig: 'cols(M)', doc: 'Number of columns' },
    ones: { sig: 'ones(n) · ones(r, c)', doc: 'Filled with 1' },
    zeros: { sig: 'zeros(n) · zeros(r, c)', doc: 'Filled with 0' },
    abs: { sig: 'abs(x)', doc: 'Absolute value' },
    sqrt: { sig: 'sqrt(x)', doc: 'Square root' },
    exp: { sig: 'exp(x)', doc: 'e to the power x' },
    log: { sig: 'log(x)', doc: 'Natural logarithm' },
    ln: { sig: 'ln(x)', doc: 'Natural logarithm' },
    log10: { sig: 'log10(x)', doc: 'Base-10 logarithm' },
    sin: { sig: 'sin(x)', doc: 'Sine (radians)' },
    cos: { sig: 'cos(x)', doc: 'Cosine (radians)' },
    tan: { sig: 'tan(x)', doc: 'Tangent (radians)' },
    pow: { sig: 'pow(a, b)', doc: 'a to the power b' },
    round: { sig: 'round(x)', doc: 'Nearest integer' },
    floor: { sig: 'floor(x)', doc: 'Round down' },
    ceil: { sig: 'ceil(x)', doc: 'Round up' },
    sign: { sig: 'sign(x)', doc: '−1, 0 or 1' },
    if: { sig: 'if(cond, a, b)', doc: 'a where cond holds, otherwise b' }
  };
  const CONSTANTS = { pi: Math.PI, e: Math.E, inf: Infinity };
  const UNARY_FN = { abs: OP.ABS, sqrt: OP.SQRT, exp: OP.EXP, log: OP.LOG, ln: OP.LOG, log10: OP.LOG10, sin: OP.SIN, cos: OP.COS, tan: OP.TAN, round: OP.ROUND, floor: OP.FLOOR, ceil: OP.CEIL, sign: OP.SIGN };
  const BIN_OP = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '^': OP.POW };
  const CMP_OP = { '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE, '=': OP.EQ };
  const NAME_RE = /^[A-Za-z_\u00C0-\u024F\u0370-\u03FF][A-Za-z0-9_\u00C0-\u024F\u0370-\u03FF]*$/;
  const SOFT = new Set(['pos', 'neg', 'clamp', 'sumprod']);
  const RESERVED = new Set(['maximize', 'minimize', 'target', 'var', 'param', 'int', 'bin', 'real', 'labels']);

  const size = (s) => s.reduce((a, b) => a * b, 1);
  const T = (s, d) => ({ s, d });

  function describe(s) {
    if (s.length === 0) return 'a single number';
    if (s.length === 1) return `a list of ${s[0]}`;
    return `a ${s[0]}×${s[1]} table`;
  }
  function shapeText(s) {
    if (s.length === 0) return '1';
    return s.join('×');
  }

  function err(node, msg) {
    return new NadirError(msg, node ? node.start : 0, node ? node.end : 0);
  }

  function Builder(ir, scope, opts) {
    const allowVars = !!opts.allowVars;
    const resolve = opts.resolve || (() => null);

    function kOf(t, node, what) {
      const out = new Array(t.d.length);
      for (let i = 0; i < t.d.length; i++) {
        if (!ir.isK(t.d[i])) throw err(node, `${what || 'This'} must be a fixed number, not depend on decisions`);
        out[i] = ir.kv(t.d[i]);
      }
      return out;
    }
    function scalarK(node, what) {
      const t = ev(node);
      if (t.d.length !== 1) throw err(node, `${what || 'This'} must be a single number, got ${describe(t.s)}`);
      return kOf(t, node, what)[0];
    }
    function intK(node, what) {
      const v = scalarK(node, what);
      if (!Number.isFinite(v) || Math.abs(v - Math.round(v)) > 1e-9) throw err(node, `${what || 'This'} must be a whole number`);
      return Math.round(v);
    }

    function broadcast(a, b, node, fn) {
      if (a.d.length === 1 && b.d.length === 1) return T(a.s.length >= b.s.length ? a.s : b.s, [fn(a.d[0], b.d[0])]);
      if (a.d.length === 1) return T(b.s, b.d.map((y) => fn(a.d[0], y)));
      if (b.d.length === 1) return T(a.s, a.d.map((x) => fn(x, b.d[0])));
      const same = a.s.length === b.s.length && a.s.every((x, i) => x === b.s[i]);
      if (!same) throw err(node, `Sizes don't match: ${describe(a.s)} vs ${describe(b.s)}`);
      const d = new Array(a.d.length);
      for (let i = 0; i < d.length; i++) d[i] = fn(a.d[i], b.d[i]);
      return T(a.s, d);
    }
    const map = (t, fn) => T(t.s, t.d.map(fn));

    function lookup(node) {
      const name = node.name;
      let entry = scope.get(name);
      if (!entry) entry = resolve(name, node);
      if (entry) {
        if (entry.kind === 'var' && !allowVars) throw err(node, `Given values can't depend on the decision '${name}'`);
        if (entry.kind === 'broken') throw err(node, `'${name}' has an error of its own`);
        return entry.t;
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return T([], [ir.k(CONSTANTS[name])]);
      if (opts.varNames && opts.varNames.has(name)) throw err(node, `Given values and bounds can't depend on the decision '${name}'`);
      if (FUNCTIONS[name]) throw err(node, `'${name}' is a function — use ${FUNCTIONS[name].sig}`);
      const pool = [...scope.keys(), ...(opts.names || []), ...Object.keys(FUNCTIONS)];
      const s = E.suggest(name, pool);
      const ue = err(node, s ? `Unknown name '${name}'. Did you mean '${s}'?` : `Unknown name '${name}'`);
      ue.fix = { kind: 'unknown', name, suggest: s || null, canDefine: !opts.varNames || allowVars };
      throw ue;
    }

    function indexSpec(arg, n, pos) {
      if (arg.type === 'All') return { list: Array.from({ length: n }, (_, i) => i), drop: false };
      const t = ev(arg);
      const vals = kOf(t, arg, 'An index');
      const list = vals.map((v) => {
        if (Math.abs(v - Math.round(v)) > 1e-9) throw err(arg, 'Indexes must be whole numbers');
        const k = Math.round(v);
        if (k < 1 || k > n) throw err(arg, `Index ${k} is out of range 1..${n}${pos ? ' for ' + pos : ''}`);
        return k - 1;
      });
      return { list, drop: t.s.length === 0 };
    }

    function index(node) {
      const base = ev(node.base);
      const args = node.args;
      if (base.s.length === 0) throw err(node, 'Only lists and tables can be indexed');
      if (base.s.length === 1) {
        if (args.length !== 1) throw err(node, `A list takes one index, got ${args.length}`);
        const sp = indexSpec(args[0], base.s[0]);
        const d = sp.list.map((i) => base.d[i]);
        return sp.drop ? T([], d) : T([d.length], d);
      }
      if (args.length !== 2) throw err(node, 'A table takes two indexes, like M[row, col]');
      const [r, c] = base.s;
      const si = indexSpec(args[0], r, 'rows');
      const sj = indexSpec(args[1], c, 'columns');
      const d = [];
      for (const i of si.list) for (const j of sj.list) d.push(base.d[i * c + j]);
      if (si.drop && sj.drop) return T([], d);
      if (si.drop) return T([sj.list.length], d);
      if (sj.drop) return T([si.list.length], d);
      return T([si.list.length, sj.list.length], d);
    }

    function range(node) {
      const a = scalarK(node.from, 'A range start');
      const b = scalarK(node.to, 'A range end');
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw err(node, 'Range ends must be finite');
      const len = Math.floor(b - a + 1e-9) + 1;
      if (len < 1) throw err(node, `Range ${a}..${b} is empty`);
      if (len > 1e6) throw err(node, 'Range is too long');
      const d = new Array(len);
      for (let i = 0; i < len; i++) d[i] = ir.k(a + i);
      return T([len], d);
    }

    function vec(node) {
      const d = [];
      for (const it of node.items) {
        const t = ev(it);
        if (t.s.length > 1) throw err(it, 'A list item cannot be a table');
        for (const x of t.d) d.push(x);
      }
      return T([d.length], d);
    }

    function mat(node) {
      const rows = node.rows.map((r) => vec(r));
      const c = rows[0].d.length;
      rows.forEach((r, i) => { if (r.d.length !== c) throw err(node.rows[i], `Row ${i + 1} has ${r.d.length} values, expected ${c}`); });
      const d = [];
      rows.forEach((r) => d.push(...r.d));
      return T([rows.length, c], d);
    }

    function compare(node) {
      if (node.type !== 'Compare') return ev(node);
      let acc = null;
      let prev = ev(node.terms[0]);
      for (let k = 0; k < node.ops.length; k++) {
        const next = ev(node.terms[k + 1]);
        const t = broadcast(prev, next, node, (x, y) => ir.bin(CMP_OP[node.ops[k]], x, y));
        acc = acc ? broadcast(acc, t, node, (x, y) => ir.bin(OP.MUL, x, y)) : t;
        prev = next;
      }
      return acc;
    }

    function reduce(t, fn, empty) {
      if (t.d.length === 0) return ir.k(empty);
      let acc = t.d[0];
      for (let i = 1; i < t.d.length; i++) acc = fn(acc, t.d[i]);
      return acc;
    }

    function prodTree(ids) {
      if (ids.length === 0) return ir.k(1);
      let layer = ids.slice();
      while (layer.length > 1) {
        const next = [];
        for (let i = 0; i < layer.length; i += 2) next.push(i + 1 < layer.length ? ir.bin(OP.MUL, layer[i], layer[i + 1]) : layer[i]);
        layer = next;
      }
      return layer[0];
    }

    function matrixOf(t, node, what) {
      if (t.s.length !== 2) throw err(node, `${what} needs a table, got ${describe(t.s)}`);
      return t.s;
    }

    function call(node) {
      const name = node.name;
      const A = node.args;
      if (!FUNCTIONS[name]) {
        if (scope.has(name)) throw err(node, `'${name}' is not a function — use ${name}[i] to pick an element`);
        const s = E.suggest(name, Object.keys(FUNCTIONS));
        throw new NadirError(s ? `Unknown function '${name}'. Did you mean '${s}'?` : `Unknown function '${name}'`, node.start, node.nameEnd);
      }
      const need = (lo, hi) => {
        if (A.length < lo || A.length > hi) {
          const want = lo === hi ? `${lo}` : hi === Infinity ? `at least ${lo}` : `${lo}–${hi}`;
          throw err(node, `${name} takes ${want} argument${lo === 1 && hi === 1 ? '' : 's'} — ${FUNCTIONS[name].sig}`);
        }
      };
      if (UNARY_FN[name] !== undefined) {
        need(1, 1);
        return map(ev(A[0]), (x) => ir.un(UNARY_FN[name], x));
      }
      switch (name) {
        case 'sum': case 'prod': case 'mean': case 'sumsq': case 'norm': {
          need(1, Infinity);
          const all = [];
          for (const a of A) all.push(...ev(a).d);
          if (name === 'sum') return T([], [ir.sum(all)]);
          if (name === 'prod') return T([], [prodTree(all)]);
          if (name === 'mean') return T([], [ir.bin(OP.MUL, ir.sum(all), ir.k(1 / Math.max(1, all.length)))]);
          const sq = ir.sum(all.map((x) => ir.bin(OP.MUL, x, x)));
          return T([], [name === 'norm' ? ir.un(OP.SQRT, sq) : sq]);
        }
        case 'min': case 'max': {
          need(1, Infinity);
          const o = name === 'min' ? OP.MIN : OP.MAX;
          if (A.length === 1) {
            const t = ev(A[0]);
            if (t.d.length === 0) throw err(node, `${name} of an empty list`);
            return T([], [reduce(t, (x, y) => ir.bin(o, x, y))]);
          }
          let acc = ev(A[0]);
          for (let i = 1; i < A.length; i++) acc = broadcast(acc, ev(A[i]), node, (x, y) => ir.bin(o, x, y));
          return acc;
        }
        case 'len': { need(1, 1); return T([], [ir.k(ev(A[0]).d.length)]); }
        case 'rows': case 'cols': {
          need(1, 1);
          const t = ev(A[0]);
          const s = t.s.length === 2 ? t.s : t.s.length === 1 ? [t.s[0], 1] : [1, 1];
          return T([], [ir.k(name === 'rows' ? s[0] : s[1])]);
        }
        case 'ones': case 'zeros': {
          need(1, 2);
          const dims = A.map((a) => intK(a, 'A size'));
          if (dims.some((x) => x < 1 || x > 1e6)) throw err(node, 'Sizes must be between 1 and 1,000,000');
          const k = ir.k(name === 'ones' ? 1 : 0);
          return T(dims, new Array(size(dims)).fill(k));
        }
        case 'pos': case 'neg': {
          need(1, 1);
          const z = ir.k(0);
          return map(ev(A[0]), (x) => ir.bin(OP.MAX, name === 'pos' ? x : ir.un(OP.NEG, x), z));
        }
        case 'clamp': {
          need(3, 3);
          const lo = broadcast(ev(A[0]), ev(A[1]), node, (x, y) => ir.bin(OP.MAX, x, y));
          return broadcast(lo, ev(A[2]), node, (x, y) => ir.bin(OP.MIN, x, y));
        }
        case 'sumprod':
        case 'dot': {
          need(2, 2);
          const a = ev(A[0]), b = ev(A[1]);
          if (a.d.length !== b.d.length) throw err(node, `${name} needs equal lengths: ${a.d.length} vs ${b.d.length}`);
          return T([], [ir.sum(a.d.map((x, i) => ir.bin(OP.MUL, x, b.d[i])))]);
        }
        case 'quad': {
          need(2, 2);
          const x = ev(A[0]), Q = ev(A[1]);
          const n = x.d.length;
          if (Q.s.length !== 2 || Q.s[0] !== n || Q.s[1] !== n) throw err(node, `quad needs a ${n}×${n} table, got ${describe(Q.s)}`);
          const terms = [];
          for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
              const q = Q.d[i * n + j];
              if (ir.isK(q) && ir.kv(q) === 0) continue;
              row.push(ir.bin(OP.MUL, q, x.d[j]));
            }
            if (row.length) terms.push(ir.bin(OP.MUL, x.d[i], ir.sum(row)));
          }
          return T([], [ir.sum(terms)]);
        }
        case 'rowsum': case 'colsum': {
          need(1, 1);
          const t = ev(A[0]);
          const [r, c] = matrixOf(t, A[0], name);
          if (name === 'rowsum') return T([r], Array.from({ length: r }, (_, i) => ir.sum(t.d.slice(i * c, i * c + c))));
          return T([c], Array.from({ length: c }, (_, j) => ir.sum(Array.from({ length: r }, (_, i) => t.d[i * c + j]))));
        }
        case 'cumsum': {
          need(1, 1);
          const t = ev(A[0]);
          const d = [];
          let acc = ir.k(0);
          for (const x of t.d) { acc = ir.bin(OP.ADD, acc, x); d.push(acc); }
          return T([d.length], d);
        }
        case 'T': {
          need(1, 1);
          const t = ev(A[0]);
          if (t.s.length < 2) return T(t.s.length ? [1, t.s[0]] : [], t.d.slice());
          const [r, c] = t.s;
          const d = new Array(r * c);
          for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) d[j * r + i] = t.d[i * c + j];
          return T([c, r], d);
        }
        case 'matmul': {
          need(2, 2);
          const a = ev(A[0]), b = ev(A[1]);
          const [r, k] = matrixOf(a, A[0], 'matmul');
          const bk = b.s.length === 2 ? b.s[0] : b.d.length;
          if (bk !== k) throw err(node, `matmul: ${describe(a.s)} can't multiply ${describe(b.s)}`);
          const c = b.s.length === 2 ? b.s[1] : 1;
          const d = [];
          for (let i = 0; i < r; i++) {
            for (let j = 0; j < c; j++) {
              const terms = [];
              for (let q = 0; q < k; q++) terms.push(ir.bin(OP.MUL, a.d[i * k + q], b.d[q * c + j]));
              d.push(ir.sum(terms));
            }
          }
          return b.s.length === 2 ? T([r, c], d) : T([r], d);
        }
        case 'pow': {
          need(2, 2);
          return broadcast(ev(A[0]), ev(A[1]), node, (x, y) => ir.bin(OP.POW, x, y));
        }
        case 'if': {
          need(3, 3);
          const cnd = compare(A[0]);
          const ab = broadcast(ev(A[1]), ev(A[2]), node, (x, y) => [x, y]);
          const pairs = ab.d;
          return broadcast(cnd, T(ab.s, pairs.map((_, i) => i)), node, (c, i) => ir.ifelse(c, pairs[i][0], pairs[i][1]));
        }
        default: throw err(node, `Unknown function '${name}'`);
      }
    }

    function ev(node) {
      switch (node.type) {
        case 'Num': return T([], [ir.k(node.value)]);
        case 'Name': return lookup(node);
        case 'Vec': return vec(node);
        case 'Mat': return mat(node);
        case 'Range': return range(node);
        case 'Index': return index(node);
        case 'Unary': return map(ev(node.arg), (x) => ir.un(OP.NEG, x));
        case 'Binary': {
          const a = ev(node.left), b = ev(node.right);
          return broadcast(a, b, node, (x, y) => ir.bin(BIN_OP[node.op], x, y));
        }
        case 'Call': return call(node);
        case 'Compare': throw err(node, 'A comparison only belongs in a rule or inside if(…)');
        case 'All': throw err(node, "':' only works inside an index like M[:, 2]");
        default: throw err(node, 'Unsupported expression');
      }
    }

    return { ev, scalarK, intK, kOf, broadcast };
  }

  function isName(s) { return NAME_RE.test(s); }

  function parseShape(src, B) {
    const text = String(src == null ? '' : src).trim();
    if (text === '' || text === '1') return [];
    const tryDims = (parts) => parts.map((p) => {
      const node = E.parseExpr(p);
      if (!node) throw new NadirError('Empty size', 0, text.length);
      const v = B.intK(node, 'A size');
      if (v < 1 || v > 1e6) throw new NadirError('Sizes must be between 1 and 1,000,000', 0, text.length);
      return v;
    });
    let parts = text.replace(/^\[|\]$/g, '').split(/\s*[×,*]\s*/);
    if (parts.length === 1) {
      const m = text.match(/^(.+?)\s*x\s*(.+)$/);
      if (m) {
        try { return tryDims([m[1], m[2]]); } catch (e) { parts = [text]; }
      }
    }
    if (parts.length > 2) throw new NadirError('At most two dimensions, like 2x3', 0, text.length);
    const dims = tryDims(parts);
    return dims;
  }

  function compile(model, options) {
    const opts = Object.assign({ nonNegative: true, limit: 300000 }, options || {});
    const ir = new IR(opts.limit);
    const scope = new Map();
    const errors = { goal: null, target: null, vars: {}, rules: {}, params: {}, model: null };
    let errorCount = 0;
    const fail = (bucket, id, field, e) => {
      const info = e && e.nadir ? { message: e.message, start: e.start, end: e.end, fix: e.fix || null } : { message: String(e && e.message || e), start: 0, end: 0 };
      if (!e || !e.nadir) console.error(e);
      if (id == null) errors[bucket] = info;
      else if (field) (errors[bucket][id] = errors[bucket][id] || {})[field] = info;
      else errors[bucket][id] = info;
      errorCount++;
    };

    const params = model.parameters || [];
    const variables = model.variables || [];
    const reservedNames = new Set();
    const nameOwner = new Map();
    const claim = (name, kind, id) => {
      if (!name) return 'Give it a name';
      if (!isName(name)) return 'Names start with a letter and use letters, digits or _';
      if (FUNCTIONS[name] && !SOFT.has(name)) return `'${name}' is a built-in function`;
      if (RESERVED.has(name)) return `'${name}' is a reserved word`;
      if (nameOwner.has(name)) return `'${name}' is already used`;
      nameOwner.set(name, { kind, id });
      reservedNames.add(name);
      return null;
    };
    const varNameOk = new Map();
    for (const v of variables) {
      const m = claim((v.name || '').trim(), 'var', v.id);
      if (m) fail('vars', v.id, 'name', new NadirError(m, 0, (v.name || '').length));
      else varNameOk.set(v.id, true);
    }
    const paramByName = new Map();
    for (const p of params) {
      const m = claim((p.name || '').trim(), 'param', p.id);
      if (m) fail('params', p.id, 'name', new NadirError(m, 0, (p.name || '').length));
      else paramByName.set(p.name.trim(), p);
    }

    const state = new Map();
    const paramScope = new Map();
    const allNames = [...nameOwner.keys()];
    const varNames = new Set(variables.map((v) => (v.name || '').trim()).filter(Boolean));
    function resolveParam(name) {
      const p = paramByName.get(name);
      if (!p) return null;
      const st = state.get(name);
      if (st === 2) return paramScope.get(name);
      if (st === 3) return { kind: 'broken' };
      if (st === 1) throw new NadirError(`Circular reference through '${name}'`, 0, 0);
      state.set(name, 1);
      try {
        const node = E.parseExpr(p.expr);
        if (!node) throw new NadirError('Enter a value', 0, 0);
        const B = Builder(ir, paramScope, { allowVars: false, resolve: resolveParam, names: allNames, varNames });
        const t = B.ev(node);
        B.kOf(t, node, 'A given value');
        const entry = { kind: 'param', t, id: p.id };
        paramScope.set(name, entry);
        state.set(name, 2);
        return entry;
      } catch (e) {
        state.set(name, 3);
        const cyc = /^Circular/.test(e.message);
        fail('params', p.id, 'expr', cyc ? new NadirError(`Circular reference: '${name}' depends on itself`, 0, (p.expr || '').length) : e);
        return { kind: 'broken' };
      }
    }
    const paramOut = [];
    for (const p of params) {
      const name = (p.name || '').trim();
      if (!paramByName.has(name) || paramByName.get(name) !== p) continue;
      const entry = resolveParam(name);
      if (entry && entry.kind === 'param') {
        paramOut.push({ id: p.id, name, shape: entry.t.s, values: entry.t.d.map((x) => ir.kv(x)) });
      }
    }
    const PB = Builder(ir, paramScope, { allowVars: false, resolve: resolveParam, names: allNames, varNames });

    const vars = [];
    let n = 0;
    const lowerA = [], upperA = [], initA = [], intA = [];
    const constField = (src, shape, v, field, dflt) => {
      const text = String(src == null ? '' : src).trim();
      const cnt = size(shape);
      if (text === '') return new Array(cnt).fill(dflt);
      try {
        const node = E.parseExpr(text);
        const t = PB.ev(node);
        const vals = PB.kOf(t, node, 'A bound');
        if (vals.length === 1) return new Array(cnt).fill(vals[0]);
        if (vals.length !== cnt) throw new NadirError(`Expected ${describe(shape)}, got ${describe(t.s)}`, node.start, node.end);
        return vals;
      } catch (e) {
        fail('vars', v.id, field, e);
        return new Array(cnt).fill(dflt);
      }
    };
    for (const v of variables) {
      if (!varNameOk.get(v.id)) continue;
      let shape = [];
      try { shape = parseShape(v.shape, PB); } catch (e) { fail('vars', v.id, 'shape', e); continue; }
      const cnt = size(shape);
      if (n + cnt > 200000) { fail('vars', v.id, 'shape', new NadirError('Too many decisions in total', 0, 0)); continue; }
      const type = v.type === 'int' || v.type === 'bin' ? v.type : 'real';
      let lo = constField(v.lower, shape, v, 'lower', opts.nonNegative ? 0 : -Infinity);
      let hi = constField(v.upper, shape, v, 'upper', Infinity);
      if (type === 'bin') { lo = lo.map((x) => Math.max(0, x)); hi = hi.map((x) => Math.min(1, x)); }
      if (type !== 'real') { lo = lo.map((x) => Math.ceil(x - 1e-9)); hi = hi.map((x) => Math.floor(x + 1e-9)); }
      for (let i = 0; i < cnt; i++) if (lo[i] > hi[i]) { fail('vars', v.id, 'upper', new NadirError(`Upper bound is below lower bound${cnt > 1 ? ' at element ' + (i + 1) : ''}`, 0, String(v.upper || '').length)); break; }
      const clampDefault = lo.map((l, i) => Math.min(hi[i], Math.max(l, 0)));
      let ini = constField(v.init, shape, v, 'init', NaN);
      ini = ini.map((x, i) => Number.isFinite(x) ? x : (Number.isFinite(clampDefault[i]) ? clampDefault[i] : 0));
      const labels = Array.isArray(v.labels) ? v.labels.map((s) => String(s)) : [];
      const offset = n;
      const d = [];
      for (let i = 0; i < cnt; i++) {
        d.push(ir.variable(n + i));
        lowerA.push(lo[i]); upperA.push(hi[i]); initA.push(ini[i]); intA.push(type === 'real' ? 0 : 1);
      }
      n += cnt;
      const entry = { kind: 'var', t: T(shape, d), id: v.id };
      scope.set(v.name.trim(), entry);
      vars.push({ id: v.id, name: v.name.trim(), shape, offset, size: cnt, type, labels });
    }
    for (const [k, e] of paramScope) scope.set(k, e);
    for (const p of params) {
      const nm = (p.name || '').trim();
      if (paramByName.get(nm) === p && !scope.has(nm)) scope.set(nm, { kind: 'broken' });
    }

    const MB = Builder(ir, scope, { allowVars: true, resolve: () => null, names: allNames });

    const goal = model.goal || {};
    const sense = goal.sense === 'min' || goal.sense === 'target' ? goal.sense : 'max';
    let goalRoot = -1;
    let target = null;
    if (!E.isBlank(goal.expr)) {
      try {
        const node = E.parseExpr(goal.expr);
        const t = MB.ev(node);
        if (t.d.length !== 1) throw new NadirError(`The goal must be a single number, got ${describe(t.s)}. Wrap it in sum(…)`, node.start, node.end);
        goalRoot = t.d[0];
      } catch (e) { fail('goal', null, null, e); }
    }
    if (sense === 'target') {
      const text = goal.target == null ? '' : String(goal.target);
      if (E.isBlank(text)) fail('target', null, null, new NadirError('Enter a target value', 0, 0));
      else {
        try { target = PB.scalarK(E.parseExpr(text), 'The target'); } catch (e) { fail('target', null, null, e); }
      }
    }

    const rows = [];
    const ruleInfo = {};
    const rules = model.constraints || [];
    rules.forEach((c, ci) => {
      if (E.isBlank(c.expr)) return;
      try {
        const parsed = E.parseRule(c.expr);
        const node = parsed.node;
        const label = (c.label && c.label.trim()) || parsed.label || `Rule ${ci + 1}`;
        const ts = node.terms.map((t) => MB.ev(t));
        const start = rows.length;
        let shape = [];
        for (let k = 0; k < node.ops.length; k++) {
          const opRaw = node.ops[k];
          const op = opRaw === '<' ? '<=' : opRaw === '>' ? '>=' : opRaw;
          const pairs = MB.broadcast(ts[k], ts[k + 1], node, (x, y) => [x, y]);
          if (pairs.s.length > shape.length) shape = pairs.s;
          pairs.d.forEach(([l, r], i) => {
            const g = ir.bin(OP.SUB, l, r);
            rows.push({ cid: c.id, ci, label, elem: i, shape: pairs.s, op, lhs: l, rhs: r, g, enabled: c.enabled !== false, part: k });
          });
        }
        ruleInfo[c.id] = { start, count: rows.length - start, shape, label, enabled: c.enabled !== false, parts: node.ops.length };
      } catch (e) { fail('rules', c.id, null, e); }
    });

    return {
      n, vars, ir, sense, target, goalRoot, rows, ruleInfo, params: paramOut,
      lower: Float64Array.from(lowerA), upper: Float64Array.from(upperA), init: Float64Array.from(initA), integer: Uint8Array.from(intA),
      errors, errorCount,
      hasGoal: goalRoot >= 0
    };
  }

  function elementName(v, i) {
    if (v.shape.length === 0) return v.name;
    if (v.shape.length === 1) return `${v.name}[${v.labels[i] || i + 1}]`;
    const c = v.shape[1];
    const r = Math.floor(i / c), q = i % c;
    const rl = v.labels[r] || r + 1;
    return `${v.name}[${rl},${q + 1}]`;
  }

  function rowName(row, info) {
    if (!info) return row.label;
    const s = row.shape;
    let name = row.label;
    if (s.length === 1) name += `[${row.elem + 1}]`;
    else if (s.length === 2) name += `[${Math.floor(row.elem / s[1]) + 1},${(row.elem % s[1]) + 1}]`;
    if (info.parts > 1) name += row.part === 0 ? ' (low)' : ' (high)';
    return name;
  }

  E.FUNCTIONS = FUNCTIONS;
  E.CONSTANTS = CONSTANTS;
  E.compile = compile;
  E.describeShape = describe;
  E.shapeText = shapeText;
  E.elementName = elementName;
  E.rowName = rowName;
  E.isName = isName;
});
