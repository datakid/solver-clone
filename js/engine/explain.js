NadirEngine.define('explain', function (E) {
  'use strict';

  const WORD = { '<=': 'at most', '<': 'less than', '>=': 'at least', '>': 'more than', '=': 'equal to' };
  const FLIP = { '<=': '>=', '<': '>', '>=': '<=', '>': '<', '=': '=' };
  const OPS = { '+': ' + ', '-': ' − ', '*': ' × ', '/': ' ÷ ', '^': '^' };
  const CONST = { inf: 'infinity', pi: 'π', e: 'e' };

  const CALLS = {
    sum: (a) => (a.length === 1 ? `the total of ${a[0]}` : null),
    prod: (a) => (a.length === 1 ? `the product of ${a[0]}` : null),
    mean: (a) => (a.length === 1 ? `the average of ${a[0]}` : null),
    min: (a) => (a.length === 1 ? `the smallest of ${a[0]}` : `the ${a.length === 2 ? 'smaller' : 'smallest'} of ${list(a)}`),
    max: (a) => (a.length === 1 ? `the largest of ${a[0]}` : `the ${a.length === 2 ? 'larger' : 'largest'} of ${list(a)}`),
    len: (a) => `the count of ${a[0]}`,
    dot: (a) => (a.length === 2 ? `the total of ${a[0]} × ${a[1]}` : null),
    quad: (a) => (a.length === 2 ? `the quadratic form ${a[0]}ᵀ·${a[1]}·${a[0]}` : null),
    sumsq: (a) => `the sum of squares of ${a[0]}`,
    norm: (a) => `the length of ${a[0]}`,
    rowsum: (a) => `each row total of ${a[0]}`,
    colsum: (a) => `each column total of ${a[0]}`,
    cumsum: (a) => `the running total of ${a[0]}`,
    matmul: (a) => (a.length === 2 ? `the matrix product ${a[0]}·${a[1]}` : null),
    T: (a) => `${a[0]} transposed`,
    rows: (a) => `the number of rows in ${a[0]}`,
    cols: (a) => `the number of columns in ${a[0]}`,
    abs: (a) => `the absolute value of ${a[0]}`,
    sqrt: (a) => `the square root of ${a[0]}`,
    exp: (a) => `e to the power ${a[0]}`,
    log: (a) => `the log of ${a[0]}`,
    ln: (a) => `the log of ${a[0]}`,
    log10: (a) => `the base-10 log of ${a[0]}`,
    pow: (a) => (a.length === 2 ? `${a[0]} to the power ${a[1]}` : null),
    round: (a) => `${a[0]} rounded`,
    floor: (a) => `${a[0]} rounded down`,
    ceil: (a) => `${a[0]} rounded up`,
    sign: (a) => `the sign of ${a[0]}`
  };
  const WORDY = new Set(Object.keys(CALLS).filter((k) => !['T', 'round', 'floor', 'ceil', 'pow', 'exp'].includes(k)));

  function list(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function cap(s) {
    return /^(the|each|every|a|e) /.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function Phraser(src, ctx) {
    const labels = (ctx && ctx.labels) || {};
    const slice = (n) => src.slice(n.start, n.end).trim();
    const short = (s) => (s.length > 36 ? s.slice(0, 33).trim() + '…' : s);

    function operand(n) {
      const t = say(n);
      if (n.paren) return `(${t})`;
      if (n.type === 'Call' && WORDY.has(n.name)) return `(${t})`;
      return t;
    }

    function say(n) {
      if (!n) return '';
      switch (n.type) {
        case 'Num': return slice(n);
        case 'Name': return CONST[n.name] || n.name;
        case 'Vec': case 'Mat': return short(slice(n));
        case 'Range': return `${say(n.from)} to ${say(n.to)}`;
        case 'All': return ':';
        case 'Unary': return '−' + operand(n.arg);
        case 'Index': {
          if (n.base.type === 'Name' && n.args.length === 1 && n.args[0].type === 'Num') {
            const L = labels[n.base.name];
            const k = Number(slice(n.args[0]));
            if (L && Number.isInteger(k) && L[k - 1]) return `${n.base.name}[${L[k - 1]}]`;
          }
          return slice(n);
        }
        case 'Call': {
          const fn = CALLS[n.name];
          if (n.name === 'if' && n.args.length === 3) return `${operand(n.args[1])} when ${slice(n.args[0])}, otherwise ${operand(n.args[2])}`;
          if (!fn || !n.args.length) return slice(n);
          const out = fn(n.args.map(operand));
          return out == null ? slice(n) : out;
        }
        case 'Binary': {
          const l = operand(n.left), r = operand(n.right);
          return l + (OPS[n.op] || ` ${n.op} `) + r;
        }
        case 'Compare': return slice(n);
        default: return slice(n);
      }
    }
    return { say };
  }

  const isConst = (n) => n && (n.type === 'Num' || (n.type === 'Unary' && n.arg.type === 'Num'));

  function explainExpr(src, ctx) {
    try {
      const node = E.parseExpr(src);
      if (!node) return null;
      return Phraser(src, ctx).say(node);
    } catch (e) { return null; }
  }

  function explainGoal(goal, ctx) {
    const g = goal || {};
    const body = explainExpr(g.expr || '', ctx);
    if (!body) return null;
    if (g.sense === 'target') {
      const t = String(g.target == null ? '' : g.target).trim();
      return t ? `Get ${body} to exactly ${t}` : `Get ${body} to a target value`;
    }
    return `Make ${body} as ${g.sense === 'min' ? 'small' : 'large'} as possible`;
  }

  function explainRule(src, ctx) {
    let parsed;
    try { parsed = E.parseRule(src); } catch (e) { return null; }
    if (!parsed) return null;
    const P = Phraser(src, ctx);
    const node = parsed.node;
    const T = node.terms, O = node.ops;
    let text;
    if (T.length === 2) {
      let a = T[0], b = T[1], op = O[0];
      if (isConst(a) && !isConst(b)) { [a, b] = [b, a]; op = FLIP[op]; }
      const lhs = P.say(a), rhs = P.say(b);
      text = op === '=' ? `${lhs} must equal ${rhs}` : `${lhs} must be ${WORD[op]} ${rhs}`;
    } else if (T.length === 3 && O[0] === O[1] && O[0] !== '=') {
      const up = O[0] === '<=' || O[0] === '<';
      const lo = P.say(up ? T[0] : T[2]), hi = P.say(up ? T[2] : T[0]);
      text = `${P.say(T[1])} must be between ${lo} and ${hi}`;
    } else {
      const parts = [P.say(T[0])];
      for (let i = 0; i < O.length; i++) parts.push(O[i] === '=' ? 'equal to' : WORD[O[i]], P.say(T[i + 1]));
      text = parts.join(' ');
    }
    if (ctx && ctx.each > 1 && !/^each /.test(text)) text += ` — for each of the ${ctx.each}`;
    return cap(text);
  }

  E.explainExpr = explainExpr;
  E.explainGoal = explainGoal;
  E.explainRule = explainRule;
});
