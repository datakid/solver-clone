NadirEngine.define('guide', function (E) {
  'use strict';

  let seq = 0;
  const gid = (p) => p + 'g' + Date.now().toString(36).slice(-4) + (seq++).toString(36);

  function camel(s, fallback) {
    let n = String(s || '').trim().replace(/[^A-Za-z0-9_\u00C0-\u024F]+(.)?/g, (m, c) => (c ? c.toUpperCase() : ''));
    if (!n) n = fallback || 'item';
    if (/^[0-9]/.test(n)) n = 'n' + n;
    return n[0].toLowerCase() + n.slice(1);
  }

  function namer(reserved) {
    const used = new Set(reserved || []);
    return (s, fallback) => {
      let base = camel(s, fallback);
      if (E.FUNCTIONS[base] || ['inf', 'pi', 'e', 'if'].includes(base)) base += 'Value';
      let out = base, k = 2;
      while (used.has(out)) out = base + k++;
      used.add(out);
      return out;
    };
  }

  function num(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    let t = String(v).trim().replace(/[$€£¥\s\u00A0]/g, '');
    if (t === '') return NaN;
    let pct = false;
    if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    const x = parseFloat(t);
    return pct ? x / 100 : x;
  }
  const blank = (v) => v == null || String(v).trim() === '';
  const lit = (x) => {
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-12) return String(r);
    return String(Number(x.toPrecision(12)));
  };
  const vec = (a) => '[' + a.map(lit).join(', ') + ']';
  const mat = (m) => '[' + m.map(vec).join(', ') + ']';

  function Checker() {
    const problems = [];
    return {
      problems,
      need(v, where, opts) {
        const o = opts || {};
        if (blank(v)) { if (o.optional) return o.dflt; problems.push(`${where} is empty`); return 0; }
        const x = num(v);
        if (!Number.isFinite(x)) { problems.push(`${where} isn't a number (“${String(v).trim()}”)`); return 0; }
        if (o.min != null && x < o.min) { problems.push(`${where} can't be below ${o.min}`); return x; }
        return x;
      },
      list(rows, what, min) {
        const named = rows.filter((r) => r && !blank(r.name));
        if (named.length < (min || 1)) problems.push(min > 1 ? `Add at least ${min} ${what}` : `Add at least one ${what.replace(/s$/, '')}`);
        const seen = new Set();
        named.forEach((r) => { const k = String(r.name).trim().toLowerCase(); if (seen.has(k)) problems.push(`“${String(r.name).trim()}” appears twice in ${what}`); seen.add(k); });
        return named;
      }
    };
  }

  const V = (name, o) => Object.assign({ id: gid('v'), name, shape: '1', type: 'real', lower: '', upper: '', init: '', labels: [] }, o || {});
  const R = (label, expr) => ({ id: gid('c'), label, expr, enabled: true });
  const P = (name, expr, slider) => ({ id: gid('p'), name, expr: String(expr), slider: slider || null });
  const sliderFor = (x) => {
    if (!Number.isFinite(x) || x <= 0) return null;
    const step = Math.pow(10, Math.floor(Math.log10(x)) - 1);
    return { min: 0, max: Math.ceil((x * 2) / step) * step, step: +step.toPrecision(3) };
  };
  const nm = (r) => String(r.name).trim();

  const RECIPES = {
    produce(d, ck) {
      const items = ck.list(d.items || [], 'products');
      const res = ck.list(d.resources || [], 'limits', 0);
      const name = namer();
      const vName = name(d.verb || 'make');
      const pName = name(d.valueName || 'profit');
      const profit = items.map((it) => ck.need(it.value, `${d.valueLabel || 'Profit'} for ${nm(it)}`));
      const caps = items.map((it) => ck.need(it.max, `Max for ${nm(it)}`, { optional: true, dflt: Infinity, min: 0 }));
      const mins = items.map((it) => ck.need(it.min, `Min for ${nm(it)}`, { optional: true, dflt: 0, min: 0 }));
      const vars = [V(vName, { shape: String(items.length), type: d.whole ? 'int' : 'real', labels: items.map(nm), upper: caps.some(Number.isFinite) ? vec(caps) : '', lower: mins.some((x) => x > 0) ? vec(mins) : '' })];
      const params = [P(pName, vec(profit))];
      const rules = [];
      res.forEach((r) => {
        const avail = ck.need(r.available, `Amount of ${nm(r)} available`, { min: 0 });
        const use = items.map((it, i) => ck.need((r.use || [])[i], `${nm(r)} used per ${nm(it)}`, { optional: true, dflt: 0 }));
        const u = name(nm(r) + 'Per', 'use');
        const a = name(nm(r) + 'Available', 'available');
        params.push(P(u, vec(use)), P(a, lit(avail), sliderFor(avail)));
        rules.push(R(nm(r), `sum(${u} * ${vName}) <= ${a}`));
      });
      if (!res.length && !caps.some(Number.isFinite)) ck.problems.push('Add at least one limit (or a max per product), otherwise the answer is “make infinitely many”');
      return { goal: { sense: d.minimize ? 'min' : 'max', expr: `sum(${pName} * ${vName})`, target: null }, variables: vars, constraints: rules, parameters: params };
    },

    budget(d, ck) {
      const ch = ck.list(d.channels || [], 'options');
      const name = namer();
      const total = ck.need(d.total, 'The total budget', { min: 0 });
      const ret = ch.map((c) => ck.need(c.value, `Return for ${nm(c)}`));
      const lo = ch.map((c) => ck.need(c.min, `Min for ${nm(c)}`, { optional: true, dflt: 0, min: 0 }));
      const hi = ch.map((c) => ck.need(c.max, `Max for ${nm(c)}`, { optional: true, dflt: Infinity, min: 0 }));
      const v = name('spend');
      const r = name('returnPerDollar');
      const b = name('budget');
      const params = [P(r, vec(ret)), P(b, lit(total), sliderFor(total))];
      let goal;
      if (d.diminishing) {
        const s = name('scale');
        params.push(P(s, lit(Math.max(1, Math.round(total / Math.max(1, ch.length) / 2)))));
        goal = `sum(${r} * ${s} * log(1 + ${v} / ${s}))`;
      } else goal = `sum(${r} * ${v})`;
      const init = ch.length ? vec(ch.map((_, i) => Math.min(Number.isFinite(hi[i]) ? hi[i] : Infinity, Math.max(lo[i], total / ch.length)))) : '';
      const vars = [V(v, { shape: String(ch.length), labels: ch.map(nm), lower: lo.some((x) => x > 0) ? vec(lo) : '', upper: hi.some(Number.isFinite) ? vec(hi) : '', init: d.diminishing ? init : '', type: d.whole ? 'int' : 'real' })];
      const sumLo = lo.reduce((a, x) => a + x, 0);
      if (Number.isFinite(total) && sumLo > total + 1e-9) ck.problems.push(`The minimums add up to ${lit(sumLo)}, more than the budget of ${lit(total)}`);
      const rules = [R('Budget', d.spendAll ? `sum(${v}) = ${b}` : `sum(${v}) <= ${b}`)];
      return { goal: { sense: 'max', expr: goal, target: null }, variables: vars, constraints: rules, parameters: params };
    },

    pick(d, ck) {
      const items = ck.list(d.items || [], 'items');
      const name = namer();
      const value = items.map((it) => ck.need(it.value, `Value of ${nm(it)}`));
      const cost = items.map((it) => ck.need(it.cost, `${d.costLabel || 'Cost'} of ${nm(it)}`, { min: 0 }));
      const lim = ck.need(d.limit, `The ${String(d.costLabel || 'cost').toLowerCase()} limit`, { min: 0 });
      const t = name('pick'), v = name('value'), c = name(d.costLabel || 'cost'), L = name((d.costLabel || 'cost') + 'Limit');
      const params = [P(v, vec(value)), P(c, vec(cost)), P(L, lit(lim), sliderFor(lim))];
      const rules = [R(d.costLabel || 'Cost limit', `sum(${c} * ${t}) <= ${L}`)];
      if (!blank(d.maxCount)) {
        const k = ck.need(d.maxCount, 'How many you can pick at most', { min: 0 });
        const K = name('maxPicks');
        params.push(P(K, lit(k)));
        rules.push(R('How many', `sum(${t}) <= ${K}`));
      }
      return { goal: { sense: 'max', expr: `sum(${v} * ${t})`, target: null }, variables: [V(t, { shape: String(items.length), type: 'bin', labels: items.map(nm) })], constraints: rules, parameters: params };
    },

    blend(d, ck) {
      const ing = ck.list(d.items || [], 'ingredients');
      const req = ck.list(d.needs || [], 'requirements');
      const name = namer();
      const cost = ing.map((it) => ck.need(it.value, `Cost of ${nm(it)}`, { min: 0 }));
      const caps = ing.map((it) => ck.need(it.max, `Max of ${nm(it)}`, { optional: true, dflt: Infinity, min: 0 }));
      const a = name('amount'), c = name('cost');
      const params = [P(c, vec(cost))];
      const rules = [];
      req.forEach((r) => {
        const per = ing.map((it, i) => ck.need((r.use || [])[i], `${nm(r)} in one unit of ${nm(it)}`, { optional: true, dflt: 0 }));
        const mn = ck.need(r.min, `At least … of ${nm(r)}`, { optional: true, dflt: null });
        const mx = ck.need(r.max, `At most … of ${nm(r)}`, { optional: true, dflt: null });
        if (mn == null && mx == null) { ck.problems.push(`Give ${nm(r)} an “at least” or “at most” amount`); return; }
        if (mn != null && mx != null && mn > mx) ck.problems.push(`${nm(r)}: “at least” is bigger than “at most”`);
        const pn = name(nm(r) + 'Per', 'per');
        params.push(P(pn, vec(per)));
        const lhs = `sum(${pn} * ${a})`;
        if (mn != null && mx != null) {
          const L = name(nm(r) + 'Min'), H = name(nm(r) + 'Max');
          params.push(P(L, lit(mn)), P(H, lit(mx)));
          rules.push(R(nm(r), `${L} <= ${lhs} <= ${H}`));
        } else if (mn != null) {
          const L = name(nm(r) + 'Min');
          params.push(P(L, lit(mn), sliderFor(mn)));
          rules.push(R(nm(r), `${lhs} >= ${L}`));
        } else {
          const H = name(nm(r) + 'Max');
          params.push(P(H, lit(mx), sliderFor(mx)));
          rules.push(R(nm(r), `${lhs} <= ${H}`));
        }
      });
      if (!blank(d.totalAmount)) {
        const tot = ck.need(d.totalAmount, 'The total amount', { min: 0 });
        const T = name('totalAmount');
        params.push(P(T, lit(tot)));
        rules.push(R('Total amount', `sum(${a}) = ${T}`));
      }
      return { goal: { sense: 'min', expr: `sum(${c} * ${a})`, target: null }, variables: [V(a, { shape: String(ing.length), labels: ing.map(nm), upper: caps.some(Number.isFinite) ? vec(caps) : '', type: d.whole ? 'int' : 'real' })], constraints: rules, parameters: params };
    },

    assign(d, ck) {
      const A = ck.list(d.rowsList || [], 'people');
      const B = ck.list(d.colsList || [], 'tasks');
      const name = namer();
      const M = A.map((a, i) => B.map((b, j) => ck.need(((d.matrix || [])[i] || [])[j], `${d.cellLabel || 'Cost'} for ${nm(a)} → ${nm(b)}`)));
      const x = name('assign'), c = name(d.cellName || 'cost');
      const p = A.length, q = B.length;
      const rules = [
        R(`Each ${d.rowWord || 'person'}`, `rowsum(${x}) ${p <= q ? '=' : '<='} 1`),
        R(`Each ${d.colWord || 'task'}`, `colsum(${x}) ${q <= p ? '=' : '<='} 1`)
      ];
      return { goal: { sense: d.maximize ? 'max' : 'min', expr: `sum(${c} * ${x})`, target: null }, variables: [V(x, { shape: `${p}x${q}`, type: 'bin', labels: A.map(nm) })], constraints: rules, parameters: [P(c, mat(M))] };
    },

    ship(d, ck) {
      const A = ck.list(d.rowsList || [], 'sources');
      const B = ck.list(d.colsList || [], 'destinations');
      const name = namer();
      const sup = A.map((a) => ck.need(a.value, `Supply at ${nm(a)}`, { min: 0 }));
      const dem = B.map((b) => ck.need(b.value, `Demand at ${nm(b)}`, { min: 0 }));
      const M = A.map((a, i) => B.map((b, j) => ck.need(((d.matrix || [])[i] || [])[j], `Cost ${nm(a)} → ${nm(b)}`)));
      const totS = sup.reduce((s, x) => s + x, 0), totD = dem.reduce((s, x) => s + x, 0);
      if (A.length && B.length && totS + 1e-9 < totD) ck.problems.push(`Total supply (${lit(totS)}) is less than total demand (${lit(totD)}) — no plan can meet it`);
      const x = name('ship'), c = name('cost'), s = name('supply'), dm = name('demand');
      return {
        goal: { sense: 'min', expr: `sum(${c} * ${x})`, target: null },
        variables: [V(x, { shape: `${A.length}x${B.length}`, labels: A.map(nm), type: d.whole ? 'int' : 'real' })],
        constraints: [R('Supply', `rowsum(${x}) <= ${s}`), R('Demand', `colsum(${x}) >= ${dm}`)],
        parameters: [P(s, vec(sup)), P(dm, vec(dem)), P(c, mat(M))]
      };
    }
  };

  function buildFromRecipe(kind, data, opts) {
    const fn = RECIPES[kind];
    if (!fn) return { model: null, problems: ['Unknown kind of problem'] };
    const ck = Checker();
    let part;
    try { part = fn(data || {}, ck); } catch (e) { return { model: null, problems: [e.message] }; }
    const o = opts || {};
    const model = Object.assign({
      format: 'nadir', version: 1, id: gid('m_'), name: o.name || data.title || 'My model', notes: o.notes || '',
      settings: { preset: 'balanced' }, scenarios: [], updatedAt: Date.now()
    }, part);
    return { model, problems: [...new Set(ck.problems)] };
  }

  E.RECIPES = Object.keys(RECIPES);
  E.buildFromRecipe = buildFromRecipe;
  E.guideNumber = num;
  E.camelName = camel;
});
