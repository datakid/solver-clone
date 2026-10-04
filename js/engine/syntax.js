NadirEngine.define('syntax', function (E) {
  'use strict';

  class NadirError extends Error {
    constructor(message, start, end) {
      super(message);
      this.start = start == null ? 0 : start;
      this.end = end == null ? this.start : end;
      this.nadir = true;
    }
  }

  const OPS = ['<=', '>=', '==', '..', '≤', '≥', '+', '-', '−', '*', '×', '·', '/', '^', '(', ')', '[', ']', ',', ':', '=', '<', '>'];
  const ALIAS = { '≤': '<=', '≥': '>=', '==': '=', '−': '-', '×': '*', '·': '*' };
  const DIGIT = /[0-9]/;
  const ID_START = /[A-Za-z_\u00C0-\u024F\u0370-\u03FF]/;
  const ID_PART = /[A-Za-z0-9_\u00C0-\u024F\u0370-\u03FF]/;

  function lex(src) {
    const out = [];
    const n = src.length;
    let i = 0;
    while (i < n) {
      const c = src[i];
      if (c === '#') break;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\u00A0') { i++; continue; }
      if (DIGIT.test(c) || (c === '.' && DIGIT.test(src[i + 1] || '') && src[i - 1] !== '.')) {
        let j = i;
        while (j < n && DIGIT.test(src[j])) j++;
        if (src[j] === '.' && src[j + 1] !== '.') {
          j++;
          while (j < n && DIGIT.test(src[j])) j++;
        }
        if ((src[j] === 'e' || src[j] === 'E')) {
          let k = j + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (DIGIT.test(src[k] || '')) {
            j = k;
            while (j < n && DIGIT.test(src[j])) j++;
          }
        }
        let value = parseFloat(src.slice(i, j));
        if (src[j] === '%') { value /= 100; j++; }
        out.push({ type: 'num', value, start: i, end: j });
        if (ID_START.test(src[j] || '') || src[j] === '(') out.push({ type: 'op', value: '*', start: j, end: j, implicit: true });
        i = j;
        continue;
      }
      if (ID_START.test(c)) {
        let j = i + 1;
        while (j < n && ID_PART.test(src[j])) j++;
        out.push({ type: 'name', value: src.slice(i, j), start: i, end: j });
        i = j;
        continue;
      }
      let op = null;
      for (const o of OPS) if (src.startsWith(o, i)) { op = o; break; }
      if (op) {
        out.push({ type: 'op', value: ALIAS[op] || op, start: i, end: i + op.length });
        i += op.length;
        continue;
      }
      throw new NadirError(`Unexpected character '${c}'`, i, i + 1);
    }
    out.push({ type: 'end', value: null, start: n, end: n });
    return out;
  }

  const CMP = new Set(['=', '<=', '>=', '<', '>']);
  const BP = { '=': 10, '<=': 10, '>=': 10, '<': 10, '>': 10, '..': 20, '+': 30, '-': 30, '*': 40, '/': 40, '^': 60, '[': 70 };

  function Parser(src, tokens, from) {
    let p = from || 0;
    const t = () => tokens[p];
    const text = (tk) => src.slice(tk.start, tk.end);
    const isOp = (v, k) => { const tk = tokens[p + (k || 0)]; return tk && tk.type === 'op' && tk.value === v; };

    function fail(tk, msg) {
      throw new NadirError(msg, tk.start, Math.max(tk.end, tk.start + 1));
    }

    function expect(v) {
      const tk = t();
      if (tk.type === 'op' && tk.value === v) { p++; return tk; }
      if (tk.type === 'end') fail(tk, `Missing '${v}'`);
      fail(tk, `Expected '${v}' but found '${text(tk)}'`);
    }

    function list(close) {
      const items = [];
      if (isOp(close)) return items;
      for (;;) {
        items.push(expr(0));
        if (isOp(',')) { p++; continue; }
        break;
      }
      return items;
    }

    function nud(tk) {
      if (tk.type === 'num') return { type: 'Num', value: tk.value, start: tk.start, end: tk.end };
      if (tk.type === 'name') {
        if (isOp('(')) {
          p++;
          const args = list(')');
          const close = expect(')');
          return { type: 'Call', name: tk.value, args, start: tk.start, end: close.end, nameEnd: tk.end };
        }
        return { type: 'Name', name: tk.value, start: tk.start, end: tk.end };
      }
      if (tk.type === 'op') {
        if (tk.value === '(') {
          if (isOp(')')) fail(t(), 'Empty parentheses');
          const e = expr(0);
          const close = expect(')');
          return Object.assign({}, e, { paren: true, start: tk.start, end: close.end });
        }
        if (tk.value === '[') {
          if (isOp(']')) fail(t(), 'Empty list — add at least one value');
          const items = list(']');
          const close = expect(']');
          const isMat = items.every((x) => x.type === 'Vec' && !x.paren);
          if (isMat) return { type: 'Mat', rows: items, start: tk.start, end: close.end };
          return { type: 'Vec', items, start: tk.start, end: close.end };
        }
        if (tk.value === '-') {
          const arg = expr(50);
          return { type: 'Unary', op: '-', arg, start: tk.start, end: arg.end };
        }
        if (tk.value === '+') return expr(50);
      }
      if (tk.type === 'end') fail(tk, 'Expression ends too early');
      fail(tk, `Unexpected '${text(tk)}'`);
    }

    function led(tk, left) {
      const op = tk.value;
      if (op === '[') {
        const args = [];
        for (;;) {
          if (isOp(':') && (isOp(',', 1) || isOp(']', 1))) {
            const c = t(); p++;
            args.push({ type: 'All', start: c.start, end: c.end });
          } else {
            args.push(expr(0));
          }
          if (isOp(',')) { p++; continue; }
          break;
        }
        const close = expect(']');
        return { type: 'Index', base: left, args, start: left.start, end: close.end };
      }
      if (op === '..') {
        const right = expr(20);
        return { type: 'Range', from: left, to: right, start: left.start, end: right.end };
      }
      if (CMP.has(op)) {
        const right = expr(10);
        if (left.type === 'Compare' && !left.paren) {
          return Object.assign({}, left, { terms: left.terms.concat([right]), ops: left.ops.concat([op]), end: right.end });
        }
        return { type: 'Compare', terms: [left, right], ops: [op], start: left.start, end: right.end, opStart: tk.start };
      }
      const right = expr(op === '^' ? 59 : BP[op]);
      return { type: 'Binary', op, left, right, start: left.start, end: right.end };
    }

    function expr(rbp) {
      const tk = tokens[p++];
      let left = nud(tk);
      for (;;) {
        const o = t();
        if (o.type !== 'op') {
          if (o.type !== 'end' && rbp === 0 && (o.type === 'name' || o.type === 'num') && left.end === o.start) break;
          break;
        }
        const bp = BP[o.value];
        if (bp === undefined || bp <= rbp) break;
        p++;
        left = led(o, left);
      }
      return left;
    }

    function done() {
      const tk = t();
      if (tk.type !== 'end') {
        if (tk.type === 'name' || tk.type === 'num') fail(tk, `Missing operator before '${text(tk)}'`);
        fail(tk, `Unexpected '${text(tk)}'`);
      }
    }

    return { expr, done, pos: () => p };
  }

  function isBlank(src) {
    const toks = lex(src || '');
    return toks.length === 1;
  }

  function parseExpr(src) {
    const tokens = lex(src || '');
    if (tokens.length === 1) return null;
    const P = Parser(src, tokens, 0);
    const node = P.expr(0);
    P.done();
    return node;
  }

  function parseRule(src) {
    const tokens = lex(src || '');
    if (tokens.length === 1) return null;
    let from = 0;
    let label = null;
    if (tokens[0].type === 'name' && tokens[1].type === 'op' && tokens[1].value === ':') {
      label = tokens[0].value;
      from = 2;
    }
    const P = Parser(src, tokens, from);
    const node = P.expr(0);
    P.done();
    if (node.type !== 'Compare' || node.paren) {
      const ce = new NadirError('A rule needs a comparison such as <=, >= or =', node.start, node.end);
      ce.fix = { kind: 'compare' };
      throw ce;
    }
    return { label, node };
  }

  function walk(node, fn) {
    if (!node || typeof node !== 'object') return;
    fn(node);
    switch (node.type) {
      case 'Unary': walk(node.arg, fn); break;
      case 'Binary': walk(node.left, fn); walk(node.right, fn); break;
      case 'Vec': node.items.forEach((x) => walk(x, fn)); break;
      case 'Mat': node.rows.forEach((x) => walk(x, fn)); break;
      case 'Range': walk(node.from, fn); walk(node.to, fn); break;
      case 'Index': walk(node.base, fn); node.args.forEach((x) => walk(x, fn)); break;
      case 'Call': node.args.forEach((x) => walk(x, fn)); break;
      case 'Compare': node.terms.forEach((x) => walk(x, fn)); break;
      default: break;
    }
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  function suggest(name, candidates) {
    let best = null, bd = 3;
    const low = name.toLowerCase();
    for (const c of candidates) {
      const d = c.toLowerCase() === low ? 0.5 : levenshtein(name, c);
      if (d < bd) { bd = d; best = c; }
    }
    return bd <= 2 ? best : null;
  }

  function highlight(src) {
    const spans = [];
    const n = src.length;
    const hashAt = (() => {
      let i = 0;
      while (i < n) {
        if (src[i] === '#') return i;
        i++;
      }
      return -1;
    })();
    let tokens;
    try {
      tokens = lex(hashAt >= 0 ? src.slice(0, hashAt) : src);
    } catch (e) {
      tokens = null;
    }
    if (tokens) {
      for (const tk of tokens) {
        if (tk.type === 'end') break;
        spans.push({ start: tk.start, end: tk.end, type: tk.type, value: tk.value, callee: false });
      }
      for (let k = 0; k < spans.length - 1; k++) {
        if (spans[k].type === 'name' && spans[k + 1].type === 'op' && spans[k + 1].value === '(') spans[k].callee = true;
      }
    }
    if (hashAt >= 0) spans.push({ start: hashAt, end: n, type: 'comment' });
    return spans;
  }

  E.NadirError = NadirError;
  E.lex = lex;
  E.parseExpr = parseExpr;
  E.parseRule = parseRule;
  E.isBlank = isBlank;
  E.walk = walk;
  E.levenshtein = levenshtein;
  E.suggest = suggest;
  E.highlight = highlight;
});
