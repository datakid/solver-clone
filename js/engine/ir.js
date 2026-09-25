NadirEngine.define('ir', function (E) {
  'use strict';

  const OP = {
    K: 0, V: 1, ADD: 2, SUB: 3, MUL: 4, DIV: 5, NEG: 6, POW: 7, SUM: 8,
    ABS: 9, SQRT: 10, EXP: 11, LOG: 12, SIN: 13, COS: 14, TAN: 15,
    ROUND: 16, FLOOR: 17, CEIL: 18, MIN: 19, MAX: 20,
    LT: 21, LE: 22, GT: 23, GE: 24, IF: 25, LOG10: 26, SIGN: 27, EQ: 28
  };
  const UNARY = {
    [OP.ABS]: Math.abs, [OP.SQRT]: Math.sqrt, [OP.EXP]: Math.exp, [OP.LOG]: Math.log,
    [OP.SIN]: Math.sin, [OP.COS]: Math.cos, [OP.TAN]: Math.tan, [OP.ROUND]: Math.round,
    [OP.FLOOR]: Math.floor, [OP.CEIL]: Math.ceil, [OP.LOG10]: Math.log10, [OP.SIGN]: Math.sign
  };
  const NONSMOOTH = new Set([OP.ROUND, OP.FLOOR, OP.CEIL, OP.LT, OP.LE, OP.GT, OP.GE, OP.EQ, OP.IF, OP.SIGN]);
  const KINKED = new Set([OP.ABS, OP.MIN, OP.MAX]);
  const COMMUTE = new Set([OP.ADD, OP.MUL, OP.MIN, OP.MAX]);

  function binaryValue(op, x, y) {
    switch (op) {
      case OP.ADD: return x + y;
      case OP.SUB: return x - y;
      case OP.MUL: return x * y;
      case OP.DIV: return x / y;
      case OP.POW: return Math.pow(x, y);
      case OP.MIN: return Math.min(x, y);
      case OP.MAX: return Math.max(x, y);
      case OP.LT: return x < y ? 1 : 0;
      case OP.LE: return x <= y ? 1 : 0;
      case OP.GT: return x > y ? 1 : 0;
      case OP.GE: return x >= y ? 1 : 0;
      case OP.EQ: return x === y ? 1 : 0;
      default: return NaN;
    }
  }

  class IR {
    constructor(limit) {
      this.limit = limit || 300000;
      this.cap = 1024;
      this.op = new Uint8Array(this.cap);
      this.a = new Int32Array(this.cap);
      this.b = new Int32Array(this.cap);
      this.c = new Int32Array(this.cap);
      this.val = new Float64Array(this.cap);
      this.lists = [];
      this.size = 0;
      this.memo = new Map();
      this.flags = new Uint8Array(this.cap);
    }

    grow() {
      const cap = this.cap * 2;
      const re = (Ctor, old) => { const x = new Ctor(cap); x.set(old); return x; };
      this.op = re(Uint8Array, this.op);
      this.a = re(Int32Array, this.a);
      this.b = re(Int32Array, this.b);
      this.c = re(Int32Array, this.c);
      this.val = re(Float64Array, this.val);
      this.flags = re(Uint8Array, this.flags);
      this.cap = cap;
    }

    push(op, a, b, c, v, key) {
      if (key !== undefined) {
        const hit = this.memo.get(key);
        if (hit !== undefined) return hit;
      }
      if (this.size >= this.limit) {
        throw new E.NadirError(`This model expands to more than ${this.limit.toLocaleString('en-US')} scalar operations. Try smaller dimensions.`, 0, 0);
      }
      if (this.size >= this.cap) this.grow();
      const id = this.size++;
      this.op[id] = op; this.a[id] = a; this.b[id] = b; this.c[id] = c; this.val[id] = v;
      let f = 0;
      if (op === OP.V) f = 1;
      else if (op !== OP.K) {
        const fl = this.flags;
        if (op === OP.SUM) { for (const x of this.lists[c]) f |= fl[x]; }
        else if (op === OP.IF) f = fl[a] | fl[b] | fl[c];
        else f = fl[a] | (b >= 0 ? fl[b] : 0);
        if (NONSMOOTH.has(op) && (f & 1)) f |= 2;
        if (KINKED.has(op) && (f & 1)) f |= 4;
      }
      this.flags[id] = f;
      if (key !== undefined) this.memo.set(key, id);
      return id;
    }

    k(v) {
      if (Object.is(v, -0)) v = 0;
      return this.push(OP.K, -1, -1, -1, v, 'K' + v);
    }
    variable(slot) { return this.push(OP.V, slot, -1, -1, 0, 'V' + slot); }
    isK(id) { return this.op[id] === OP.K; }
    kv(id) { return this.val[id]; }
    isConst(id) { return (this.flags[id] & 1) === 0; }

    un(op, x) {
      if (this.isK(x)) {
        if (op === OP.NEG) return this.k(-this.val[x]);
        return this.k(UNARY[op](this.val[x]));
      }
      if (op === OP.NEG && this.op[x] === OP.NEG) return this.a[x];
      return this.push(op, x, -1, -1, 0, op + '|' + x);
    }

    bin(op, x, y) {
      const kx = this.isK(x), ky = this.isK(y);
      if (kx && ky) return this.k(binaryValue(op, this.val[x], this.val[y]));
      const vx = kx ? this.val[x] : NaN, vy = ky ? this.val[y] : NaN;
      switch (op) {
        case OP.ADD:
          if (vx === 0) return y;
          if (vy === 0) return x;
          break;
        case OP.SUB:
          if (vy === 0) return x;
          if (vx === 0) return this.un(OP.NEG, y);
          if (x === y) return this.k(0);
          break;
        case OP.MUL:
          if (vx === 0 || vy === 0) return this.k(0);
          if (vx === 1) return y;
          if (vy === 1) return x;
          if (vx === -1) return this.un(OP.NEG, y);
          if (vy === -1) return this.un(OP.NEG, x);
          break;
        case OP.DIV:
          if (vy === 1) return x;
          if (vx === 0) return this.k(0);
          if (ky && vy !== 0) return this.bin(OP.MUL, x, this.k(1 / vy));
          break;
        case OP.POW:
          if (vy === 1) return x;
          if (vy === 0) return this.k(1);
          break;
        default: break;
      }
      if (COMMUTE.has(op) && x > y) { const t = x; x = y; y = t; }
      return this.push(op, x, y, -1, 0, op + '|' + x + '|' + y);
    }

    sum(ids) {
      let kc = 0;
      const rest = [];
      for (const id of ids) {
        if (this.isK(id)) kc += this.val[id];
        else if (this.op[id] === OP.SUM) {
          for (const x of this.lists[this.c[id]]) {
            if (this.isK(x)) kc += this.val[x]; else rest.push(x);
          }
        } else rest.push(id);
      }
      if (kc !== 0) rest.push(this.k(kc));
      if (rest.length === 0) return this.k(0);
      if (rest.length === 1) return rest[0];
      if (rest.length === 2) return this.bin(OP.ADD, rest[0], rest[1]);
      const li = this.lists.length;
      this.lists.push(rest);
      return this.push(OP.SUM, -1, -1, li, 0);
    }

    ifelse(cnd, x, y) {
      if (this.isK(cnd)) return this.val[cnd] !== 0 ? x : y;
      if (x === y) return x;
      return this.push(OP.IF, x, y, cnd, 0, 'IF|' + cnd + '|' + x + '|' + y);
    }

    evaluate(v, out) {
      const N = this.size;
      const T = out && out.length >= N ? out : new Float64Array(N);
      const op = this.op, a = this.a, b = this.b, c = this.c, val = this.val, lists = this.lists;
      for (let i = 0; i < N; i++) {
        const o = op[i];
        let r;
        switch (o) {
          case OP.K: r = val[i]; break;
          case OP.V: r = v[a[i]]; break;
          case OP.ADD: r = T[a[i]] + T[b[i]]; break;
          case OP.SUB: r = T[a[i]] - T[b[i]]; break;
          case OP.MUL: r = T[a[i]] * T[b[i]]; break;
          case OP.DIV: r = T[a[i]] / T[b[i]]; break;
          case OP.NEG: r = -T[a[i]]; break;
          case OP.SUM: { const L = lists[c[i]]; r = 0; for (let k = 0; k < L.length; k++) r += T[L[k]]; break; }
          case OP.IF: r = T[c[i]] !== 0 ? T[a[i]] : T[b[i]]; break;
          default:
            r = UNARY[o] ? UNARY[o](T[a[i]]) : binaryValue(o, T[a[i]], T[b[i]]);
        }
        T[i] = r;
      }
      return T;
    }

    linearize(roots) {
      const memo = new Array(this.size);
      const op = this.op, a = this.a, b = this.b, c = this.c, val = this.val;
      const self = this;
      const EMPTY = new Map();
      function scale(L, s) {
        if (s === 0) return { m: EMPTY, c: 0 };
        const m = new Map();
        for (const [k, x] of L.m) m.set(k, x * s);
        return { m, c: L.c * s };
      }
      function addInto(m, L, s) {
        for (const [k, x] of L.m) {
          const nv = (m.get(k) || 0) + x * s;
          m.set(k, nv);
        }
      }
      function lin(id) {
        if (memo[id] !== undefined) return memo[id];
        const stack = [id];
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (memo[top] !== undefined) { stack.pop(); continue; }
          const o = op[top];
          const deps = [];
          if (o === OP.SUM) deps.push(...self.lists[c[top]]);
          else if (o === OP.IF) { deps.push(a[top], b[top], c[top]); }
          else if (o !== OP.K && o !== OP.V) { deps.push(a[top]); if (b[top] >= 0) deps.push(b[top]); }
          let pending = false;
          for (const d of deps) if (memo[d] === undefined && !self.isConst(d) && !(op[d] === OP.K)) { stack.push(d); pending = true; }
          if (pending) continue;
          stack.pop();
          memo[top] = compute(top);
        }
        return memo[id];
      }
      function get(id) {
        if (op[id] === OP.K) return { m: EMPTY, c: val[id] };
        if (memo[id] !== undefined) return memo[id];
        return lin(id);
      }
      function compute(id) {
        const o = op[id];
        if (o === OP.K) return { m: EMPTY, c: val[id] };
        if (o === OP.V) return { m: new Map([[a[id], 1]]), c: 0 };
        if (o === OP.ADD || o === OP.SUB) {
          const L = get(a[id]), R = get(b[id]);
          if (!L || !R) return null;
          const m = new Map(L.m);
          const s = o === OP.ADD ? 1 : -1;
          addInto(m, R, s);
          return { m, c: L.c + s * R.c };
        }
        if (o === OP.SUM) {
          const m = new Map();
          let cc = 0;
          for (const x of self.lists[c[id]]) {
            const L = get(x);
            if (!L) return null;
            addInto(m, L, 1);
            cc += L.c;
          }
          return { m, c: cc };
        }
        if (o === OP.NEG) { const L = get(a[id]); return L ? scale(L, -1) : null; }
        if (o === OP.MUL) {
          const L = get(a[id]), R = get(b[id]);
          if (!L || !R) return null;
          if (L.m.size === 0) return scale(R, L.c);
          if (R.m.size === 0) return scale(L, R.c);
          return null;
        }
        if (o === OP.DIV) {
          const L = get(a[id]), R = get(b[id]);
          if (!L || !R) return null;
          if (R.m.size === 0) return scale(L, 1 / R.c);
          return null;
        }
        if (o === OP.POW) {
          const L = get(a[id]), R = get(b[id]);
          if (!L || !R) return null;
          if (R.m.size === 0 && R.c === 1) return L;
          return null;
        }
        return null;
      }
      return roots.map((r) => {
        const L = get(r);
        if (!L) return null;
        const m = new Map();
        for (const [k, x] of L.m) if (x !== 0) m.set(k, x);
        return { m, c: L.c };
      });
    }

    reach(roots) {
      const mark = new Uint8Array(this.size);
      for (const r of roots) if (r >= 0) mark[r] = 1;
      const op = this.op, a = this.a, b = this.b, c = this.c;
      for (let i = this.size - 1; i >= 0; i--) {
        if (!mark[i]) continue;
        const o = op[i];
        if (o === OP.K || o === OP.V) continue;
        if (o === OP.SUM) { for (const x of this.lists[c[i]]) mark[x] = 1; continue; }
        mark[a[i]] = 1;
        if (b[i] >= 0) mark[b[i]] = 1;
        if (o === OP.IF) mark[c[i]] = 1;
      }
      return mark;
    }

    compile(roots) {
      const mark = this.reach(roots);
      const op = this.op, a = this.a, b = this.b, c = this.c, val = this.val;
      const slot = new Int32Array(this.size).fill(-1);
      let M = 0;
      for (let i = 0; i < this.size; i++) if (mark[i] && op[i] !== OP.K && op[i] !== OP.V) slot[i] = M++;
      const lit = (x) => {
        if (Number.isNaN(x)) return 'NaN';
        if (x === Infinity) return 'Infinity';
        if (x === -Infinity) return '-Infinity';
        return '(' + String(x) + ')';
      };
      const ref = (i) => op[i] === OP.K ? lit(val[i]) : op[i] === OP.V ? 'v[' + a[i] + ']' : 'T[' + slot[i] + ']';
      const F = [];
      const FN = { [OP.ABS]: 'Math.abs', [OP.SQRT]: 'Math.sqrt', [OP.EXP]: 'Math.exp', [OP.LOG]: 'Math.log', [OP.SIN]: 'Math.sin', [OP.COS]: 'Math.cos', [OP.TAN]: 'Math.tan', [OP.ROUND]: 'Math.round', [OP.FLOOR]: 'Math.floor', [OP.CEIL]: 'Math.ceil', [OP.LOG10]: 'Math.log10', [OP.SIGN]: 'Math.sign' };
      const CMPS = { [OP.LT]: '<', [OP.LE]: '<=', [OP.GT]: '>', [OP.GE]: '>=', [OP.EQ]: '===' };
      for (let i = 0; i < this.size; i++) {
        if (slot[i] < 0) continue;
        const o = op[i], x = ref(a[i]), y = b[i] >= 0 ? ref(b[i]) : '';
        let e;
        switch (o) {
          case OP.ADD: e = x + '+' + y; break;
          case OP.SUB: e = x + '-' + y; break;
          case OP.MUL: e = x + '*' + y; break;
          case OP.DIV: e = x + '/' + y; break;
          case OP.NEG: e = '-' + x; break;
          case OP.POW:
            if (op[b[i]] === OP.K && val[b[i]] === 2) e = x + '*' + x;
            else if (op[b[i]] === OP.K && val[b[i]] === 0.5) e = 'Math.sqrt(' + x + ')';
            else e = 'Math.pow(' + x + ',' + y + ')';
            break;
          case OP.SUM: {
            const L = this.lists[c[i]];
            if (L.length <= 64) e = L.map(ref).join('+');
            else {
              const s = 'T[' + slot[i] + ']';
              F.push(s + '=0;');
              for (let k = 0; k < L.length; k += 64) F.push(s + '+=' + L.slice(k, k + 64).map(ref).join('+') + ';');
              e = null;
            }
            break;
          }
          case OP.MIN: e = 'Math.min(' + x + ',' + y + ')'; break;
          case OP.MAX: e = 'Math.max(' + x + ',' + y + ')'; break;
          case OP.IF: e = '(' + ref(c[i]) + '!==0?' + x + ':' + y + ')'; break;
          default:
            if (FN[o]) e = FN[o] + '(' + x + ')';
            else if (CMPS[o]) e = '(' + x + CMPS[o] + y + '?1:0)';
            else e = 'NaN';
        }
        if (e !== null) F.push('T[' + slot[i] + ']=' + e + ';');
      }
      const R = [];
      const acc = (i, expr) => {
        if (op[i] === OP.K) return;
        if (op[i] === OP.V) R.push('g[' + a[i] + ']+=' + expr + ';');
        else R.push('A[' + slot[i] + ']+=' + expr + ';');
      };
      for (let i = this.size - 1; i >= 0; i--) {
        if (slot[i] < 0) continue;
        const o = op[i];
        const s = slot[i];
        const self = 'T[' + s + ']';
        const x = ref(a[i]), y = b[i] >= 0 ? ref(b[i]) : '';
        const before = R.length;
        R.push('if((q=A[' + s + '])!==0){');
        const mark0 = R.length;
        switch (o) {
          case OP.ADD: acc(a[i], 'q'); acc(b[i], 'q'); break;
          case OP.SUB: acc(a[i], 'q'); acc(b[i], '-q'); break;
          case OP.SUM: for (const k of this.lists[c[i]]) acc(k, 'q'); break;
          case OP.MUL: acc(a[i], 'q*' + y); acc(b[i], 'q*' + x); break;
          case OP.DIV: acc(a[i], 'q/' + y); acc(b[i], '-q*' + self + '/' + y); break;
          case OP.NEG: acc(a[i], '-q'); break;
          case OP.POW:
            if (op[b[i]] === OP.K) {
              const cv = val[b[i]];
              acc(a[i], cv === 2 ? 'q*2*' + x : 'q*' + lit(cv) + '*Math.pow(' + x + ',' + lit(cv - 1) + ')');
            } else {
              acc(a[i], 'q*' + y + '*Math.pow(' + x + ',' + y + '-1)');
              acc(b[i], '(' + x + '>0?q*' + self + '*Math.log(' + x + '):0)');
            }
            break;
          case OP.ABS: acc(a[i], 'q*Math.sign(' + x + ')'); break;
          case OP.SQRT: acc(a[i], '(' + self + '>0?q/(2*' + self + '):0)'); break;
          case OP.EXP: acc(a[i], 'q*' + self); break;
          case OP.LOG: acc(a[i], 'q/' + x); break;
          case OP.LOG10: acc(a[i], 'q/(' + x + '*2.302585092994046)'); break;
          case OP.SIN: acc(a[i], 'q*Math.cos(' + x + ')'); break;
          case OP.COS: acc(a[i], '-q*Math.sin(' + x + ')'); break;
          case OP.TAN: acc(a[i], 'q*(1+' + self + '*' + self + ')'); break;
          case OP.MIN: acc(a[i], '(' + x + '<=' + y + '?q:0)'); acc(b[i], '(' + x + '<=' + y + '?0:q)'); break;
          case OP.MAX: acc(a[i], '(' + x + '>=' + y + '?q:0)'); acc(b[i], '(' + x + '>=' + y + '?0:q)'); break;
          case OP.IF: acc(a[i], '(' + ref(c[i]) + '!==0?q:0)'); acc(b[i], '(' + ref(c[i]) + '!==0?0:q)'); break;
          default: break;
        }
        if (R.length === mark0) R.length = before; else R.push('}');
      }
      const outs = roots.map((r, k) => 'o[' + k + ']=' + ref(r) + ';');
      const seeds = roots.map((r, k) => {
        if (op[r] === OP.K) return '';
        if (op[r] === OP.V) return 'g[' + a[r] + ']+=w[' + k + '];';
        return 'A[' + slot[r] + ']+=w[' + k + '];';
      });
      const body = [
        'const T=new Float64Array(' + Math.max(1, M) + '),A=new Float64Array(' + Math.max(1, M) + ');',
        'return function(v,o,g,w){',
        F.join('\n'),
        outs.join('\n'),
        'if(!g)return o;',
        'let q=0;A.fill(0);',
        seeds.join('\n'),
        R.join('\n'),
        'return o;};'
      ].join('\n');
      return new Function(body)();
    }
  }

  E.OP = OP;
  E.IR = IR;
});
