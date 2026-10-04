NadirEngine.define('tests', function (E) {
  'use strict';

  let n = 0;
  const id = () => 'x' + (n++);
  const V = (name, o) => Object.assign({ id: id(), name, shape: '1', type: 'real', lower: '', upper: '', init: '', labels: [] }, o || {});
  const R = (expr, label) => ({ id: id(), label: label || '', expr, enabled: true });
  const P = (name, expr) => ({ id: id(), name, expr, slider: null });
  const M = (goal, variables, constraints, parameters) => ({ format: 'nadir', version: 1, name: 'test', goal, variables, constraints, parameters: parameters || [], settings: {} });

  const close = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-5) * Math.max(1, Math.abs(b));

  function cases() {
    return [
      {
        name: '1 · LP with shadow prices', run() {
          const m = M({ sense: 'max', expr: '3x + 5y' }, [V('x'), V('y')], [R('x <= 4'), R('2y <= 12'), R('3x + 2y <= 18')]);
          const r = E.solve(m, {});
          const d = r.constraints.map((c) => c.dual);
          return [r.status === 'optimal', close(r.values[0], 2), close(r.values[1], 6), close(r.objective, 36), close(d[0], 0), close(d[1], 1.5), close(d[2], 1), r.engine === 'simplex'].every(Boolean) || fmt(r, d);
        }
      },
      {
        name: '2 · LP minimize with ≥ rows', run() {
          const r = E.solve(M({ sense: 'min', expr: '2x+3y' }, [V('x'), V('y')], [R('x+y>=4'), R('x+3y>=6')]), {});
          return (r.status === 'optimal' && close(r.values[0], 3) && close(r.values[1], 1) && close(r.objective, 9)) || fmt(r);
        }
      },
      {
        name: '3 · Integer LP', run() {
          const r = E.solve(M({ sense: 'max', expr: '5x+4y' }, [V('x', { type: 'int' }), V('y', { type: 'int' })], [R('6x+4y<=24'), R('x+2y<=6')]), {});
          return (r.status === 'optimal' && close(r.values[0], 4) && close(r.values[1], 0) && close(r.objective, 20) && r.engine === 'bb') || fmt(r);
        }
      },
      {
        name: '4 · Knapsack (binary)', run() {
          const r = E.solve(M({ sense: 'max', expr: 'sum(value*take)' }, [V('take', { shape: '4', type: 'bin' })], [R('sum(weight*take) <= cap')], [P('value', '[10,13,7,8]'), P('weight', '[5,6,3,4]'), P('cap', '10')]), {});
          return (r.status === 'optimal' && r.values.join(',') === '0,1,0,1' && close(r.objective, 21)) || fmt(r);
        }
      },
      {
        name: '5 · Rosenbrock (free)', run() {
          const r = E.solve(M({ sense: 'min', expr: '(1-x)^2 + 100(y-x^2)^2' }, [V('x', { lower: '-inf' }), V('y', { lower: '-inf' })], []), {});
          return (r.status === 'optimal' && close(r.values[0], 1, 1e-4) && close(r.values[1], 1, 1e-4) && Math.abs(r.objective) < 1e-8 && r.engine === 'alm') || fmt(r);
        }
      },
      {
        name: '6 · Equality-constrained QP', run() {
          const r = E.solve(M({ sense: 'min', expr: 'x^2+y^2' }, [V('x'), V('y')], [R('x+y=1')]), {});
          return (r.status === 'optimal' && close(r.values[0], 0.5) && close(r.values[1], 0.5) && close(r.objective, 0.5)) || fmt(r);
        }
      },
      {
        name: '7 · Infeasible + Diagnose', run() {
          const m = M({ sense: 'max', expr: 'x+y' }, [V('x'), V('y')], [R('x+y<=1', 'Cap'), R('x+y>=2', 'Floor')]);
          const r = E.solve(m, {});
          const ids = (r.diagnosis && r.diagnosis.rules) || [];
          return (r.status === 'infeasible' && ids.length === 2 && ids.includes(m.constraints[0].id) && ids.includes(m.constraints[1].id)) || fmt(r);
        }
      },
      {
        name: '8 · Unbounded', run() {
          const r = E.solve(M({ sense: 'max', expr: 'x+y' }, [V('x'), V('y')], [R('x-y<=1')]), {});
          return r.status === 'unbounded' || fmt(r);
        }
      },
      {
        name: '9 · Target mode (nonlinear)', run() {
          const r = E.solve(M({ sense: 'target', expr: 'x^3-2x', target: '5' }, [V('x', { init: '1' })], []), {});
          return (['optimal', 'feasible'].includes(r.status) && close(r.values[0], 2.0945514815, 1e-5)) || fmt(r);
        }
      },
      {
        name: '10 · Transportation (2D)', run() {
          const r = E.solve(M({ sense: 'min', expr: 'sum(cost*ship)' }, [V('ship', { shape: '2x3' })], [R('rowsum(ship) <= supply'), R('colsum(ship) >= demand')], [P('supply', '[20,30]'), P('demand', '[10,25,15]'), P('cost', '[[8,6,10],[9,12,13]]')]), {});
          return (r.status === 'optimal' && close(r.objective, 465)) || fmt(r);
        }
      },
      {
        name: 'Language · errors and suggestions', run() {
          const C = E.compile(M({ sense: 'max', expr: 'sum(profti*make)' }, [V('make', { shape: '3' })], [R('make <= [1,2]')], [P('profit', '[1,2,3]')]));
          const g = C.errors.goal && C.errors.goal.message;
          const rr = Object.values(C.errors.rules)[0];
          return (/Did you mean 'profit'/.test(g) && rr && /Sizes don't match/.test(rr.message)) || JSON.stringify(C.errors);
        }
      },
      {
        name: 'Language · circular parameters', run() {
          const C = E.compile(M({ sense: 'max', expr: 'x' }, [V('x')], [], [P('a', 'b+1'), P('b', 'a*2')]));
          const msgs = Object.values(C.errors.params).map((e) => e.expr && e.expr.message).join('|');
          return /Circular/.test(msgs) || msgs;
        }
      },
      {
        name: 'Language · linear detection', run() {
          const lin = E.classify(E.compile(M({ sense: 'max', expr: 'sum(p*x)/2 + 3' }, [V('x', { shape: '3' })], [R('x[1]*2 <= 4'), R('0 <= x <= 5')], [P('p', '1..3')])), {});
          const non = E.classify(E.compile(M({ sense: 'max', expr: 'x*y' }, [V('x'), V('y')], [])), {});
          return (lin.linear && !non.linear) || JSON.stringify([lin, non]);
        }
      },
      {
        name: 'Gradient · reverse mode matches finite differences', run() {
          const C = E.compile(M({ sense: 'min', expr: 'exp(x)*sin(y) + sqrt(x^2+1) / (y+3) + max(x, y) + log(x+2)^2' }, [V('x', { lower: '-inf' }), V('y', { lower: '-inf' })], []));
          const fn = C.ir.compile([C.goalRoot]);
          const v = new Float64Array([0.3, 0.7]), g = new Float64Array(2), o = new Float64Array(1);
          fn(v, o, g, new Float64Array([1]));
          const h = 1e-6;
          const fd = [0, 1].map((j) => { const a = Float64Array.from(v), b = Float64Array.from(v); a[j] += h; b[j] -= h; const oa = new Float64Array(1), ob = new Float64Array(1); fn(a, oa); fn(b, ob); return (oa[0] - ob[0]) / (2 * h); });
          return (close(g[0], fd[0], 1e-6) && close(g[1], fd[1], 1e-6)) || JSON.stringify([Array.from(g), fd]);
        }
      },
      {
        name: 'Text view · round trip', run() {
          const m = M({ sense: 'max', expr: 'sum(profit*make)' }, [V('make', { shape: '3', type: 'int', lower: '0', labels: ['A', 'B', 'C'] })], [R('sum(wood*make) <= 400', 'Wood')], [P('profit', '[45,80,60]'), P('wood', '[5,20,10]')]);
          const t = E.toText(m);
          const back = E.fromText(t).model;
          const r1 = E.solve(m, {}), r2 = E.solve(back, {});
          return (close(r1.objective, r2.objective) && back.variables[0].labels.length === 3 && back.constraints[0].label === 'Wood') || t;
        }
      },
      {
        name: 'Plain words · goals and rules read naturally', run() {
          const ctx = { labels: { make: ['Chairs', 'Tables', 'Desks'] } };
          const cases = [
            [E.explainGoal({ sense: 'max', expr: 'sum(profit * make)' }, ctx), 'Make the total of profit × make as large as possible'],
            [E.explainGoal({ sense: 'min', expr: 'dot(cost, serve)' }, ctx), 'Make the total of cost × serve as small as possible'],
            [E.explainGoal({ sense: 'target', expr: 'units * (price - unitCost)', target: '0' }, ctx), 'Get units × (price − unitCost) to exactly 0'],
            [E.explainRule('sum(wood * make) <= woodStock', ctx), 'The total of wood × make must be at most woodStock'],
            [E.explainRule('make[3] >= 2', ctx), 'make[Desks] must be at least 2'],
            [E.explainRule('10 <= x', ctx), 'x must be at least 10'],
            [E.explainRule('0 <= x + y <= 5', ctx), 'x + y must be between 0 and 5'],
            [E.explainRule('rowsum(ship) <= supply', { each: 2 }), 'Each row total of ship must be at most supply'],
            [E.explainRule('x >= lo', { each: 3 }), 'x must be at least lo — for each of the 3'],
            [E.explainRule('sum(x) = 1', ctx), 'The total of x must equal 1']
          ];
          const bad = cases.filter(([a, b]) => a !== b);
          const broken = E.explainRule('x + <= 3') === null && E.explainGoal({ sense: 'max', expr: '' }) === null;
          return (!bad.length && broken) || JSON.stringify(bad.map(([a, b]) => ({ got: a, want: b })));
        }
      },
      {
        name: 'LU · dense and sparse factors solve Bx = b and yᵀB = cᵀ', run() {
          const rand = E.mulberry32(11);
          const bad = [];
          for (const [m, force] of [[40, 'dense'], [40, 'sparse'], [600, 'sparse']]) {
            const cols = [];
            for (let k = 0; k < m; k++) {
              const idx = [k], val = [4 + rand() * 4];
              for (let t = 0; t < 3; t++) { const i = Math.floor(rand() * m); if (i !== k) { idx.push(i); val.push(rand() * 2 - 1); } }
              cols.push({ idx, val });
            }
            const f = E.luFactor(m, cols, { force });
            if (!f.ok) { bad.push(`${force} ${m}: singular`); continue; }
            const b = Float64Array.from({ length: m }, () => rand() * 10 - 5);
            const x = f.ftran(b), y = f.btran(b);
            const Bx = new Float64Array(m);
            let yres = 0;
            cols.forEach((c, k) => { let s = 0; c.idx.forEach((i, t) => { Bx[i] += c.val[t] * x[k]; s += c.val[t] * y[i]; }); yres = Math.max(yres, Math.abs(s - b[k])); });
            let xres = 0;
            for (let i = 0; i < m; i++) xres = Math.max(xres, Math.abs(Bx[i] - b[i]));
            if (xres > 1e-8 || yres > 1e-8) bad.push(`${force} ${m}: residual ${xres.toExponential(2)} / ${yres.toExponential(2)}`);
          }
          const sing = E.luFactor(3, [{ idx: [0], val: [1] }, { idx: [0], val: [2] }, { idx: [2], val: [1] }], { force: 'sparse' });
          if (sing.ok || sing.singular.length !== 1) bad.push('singular basis not detected');
          return !bad.length || bad.join('; ');
        }
      },
      {
        name: 'Revised simplex · matches dense tableau on 60 random LPs', run() {
          const rand = E.mulberry32(3);
          const bad = [];
          for (let t = 0; t < 60 && bad.length < 3; t++) {
            const n = 2 + Math.floor(rand() * 10), m = 1 + Math.floor(rand() * 9);
            const rows = [];
            for (let i = 0; i < m; i++) {
              const idx = [], val = [];
              for (let j = 0; j < n; j++) if (rand() < 0.7) { idx.push(j); val.push(Math.round(rand() * 18 - 6)); }
              const op = ['<=', '<=', '>=', '='][Math.floor(rand() * 4)];
              rows.push({ idx, val, op, rhs: Math.round(rand() * 40 - (op === '<=' ? 5 : 15)) });
            }
            const lower = new Float64Array(n), upper = new Float64Array(n);
            for (let j = 0; j < n; j++) {
              const k = rand();
              lower[j] = k < 0.15 ? -Infinity : k < 0.3 ? -Math.round(rand() * 5) : 0;
              upper[j] = rand() < 0.5 ? Math.round(3 + rand() * 20) : Infinity;
            }
            const c = Float64Array.from({ length: n }, () => Math.round(rand() * 20 - 8));
            const P = { n, c, c0: 0, rows, lower, upper, maximize: rand() < 0.5 };
            const a = E.solveDense(P, {}), b = E.solveRevised(P, {});
            if (a.status !== b.status) { bad.push(`#${t} status ${a.status} vs ${b.status}`); continue; }
            if (a.status === 'optimal' && Math.abs(a.obj - b.obj) > 1e-6 * Math.max(1, Math.abs(a.obj))) bad.push(`#${t} obj ${a.obj} vs ${b.obj}`);
          }
          return !bad.length || bad.join('; ');
        }
      },
      {
        name: 'Revised simplex · sparse 3,000×3,000 LP (sparse LU)', run() {
          const rand = E.mulberry32(21);
          const m = 3000, n = 3000;
          const rows = [];
          for (let i = 0; i < m; i++) {
            const idx = [i], val = [2 + rand() * 3];
            for (let t = 0; t < 4; t++) { const j = Math.floor(rand() * n); if (j !== i) { idx.push(j); val.push(0.2 + rand()); } }
            rows.push({ idx, val, op: '<=', rhs: 50 + rand() * 50 });
          }
          const c = Float64Array.from({ length: n }, () => 1 + rand() * 9);
          const P = { n, c, c0: 0, rows, lower: new Float64Array(n), upper: new Float64Array(n).fill(Infinity), maximize: true };
          const t0 = Date.now();
          const r = E.solveLP(P, { deadline: Date.now() + 20000, maxIter: 200000 });
          const ms = Date.now() - t0;
          if (r.status !== 'optimal') return `status ${r.status} after ${r.iterations} pivots, ${ms}ms`;
          let viol = 0;
          for (const row of rows) { let s = 0; row.idx.forEach((j, k) => { s += row.val[k] * r.x[j]; }); viol = Math.max(viol, s - row.rhs); }
          let dualObj = 0;
          for (let i = 0; i < m; i++) dualObj += r.duals[i] * rows[i].rhs;
          const gapRel = Math.abs(dualObj - r.obj) / Math.max(1, Math.abs(r.obj));
          return (r.lu === 'sparse' && viol < 1e-6 && gapRel < 1e-6 && ms < 15000) || `lu ${r.lu}, viol ${viol}, duality gap ${gapRel}, ${ms}ms`;
        }
      },
      {
        name: 'Sensitivity ranging · textbook RHS and cost ranges', run() {
          const m = M({ sense: 'max', expr: '3x + 5y' }, [V('x'), V('y')], [R('x <= 4'), R('2y <= 12'), R('3x + 2y <= 18')]);
          const r = E.solve(m, {});
          const rg = r.constraints.map((c) => c.range);
          const cr = r.costRanges;
          const ok = rg.every(Boolean) && cr &&
            rg[0].inc === Infinity && close(rg[0].dec, 2) &&
            close(rg[1].inc, 6) && close(rg[1].dec, 6) &&
            close(rg[2].inc, 6) && close(rg[2].dec, 6) &&
            close(cr[0].inc, 4.5) && close(cr[0].dec, 3) &&
            cr[1].inc === Infinity && close(cr[1].dec, 3);
          const mn = E.solve(M({ sense: 'min', expr: '2x+3y' }, [V('x'), V('y')], [R('x+y>=4'), R('x+3y>=6')]), {});
          const mr = mn.costRanges, rr = mn.constraints.map((c) => c.range);
          const ok2 = mr && close(mr[0].inc, 1) && close(mr[0].dec, 1) && close(mr[1].inc, 3) && close(mr[1].dec, 1) && close(rr[0].inc, 2) && close(rr[0].dec, 2) && close(rr[1].inc, 6) && close(rr[1].dec, 2);
          return (ok && ok2) || JSON.stringify({ rg, cr, mr, rr });
        }
      },
      {
        name: 'MIP · presolve + cuts agree with classic B&B on 40 random models', run() {
          const rand = E.mulberry32(99);
          const bad = [];
          let cuts = 0, removed = 0;
          for (let t = 0; t < 40 && bad.length < 3; t++) {
            const n = 3 + Math.floor(rand() * 6), m = 2 + Math.floor(rand() * 5);
            const rows = [];
            for (let i = 0; i < m; i++) {
              const idx = [], val = [];
              for (let j = 0; j < n; j++) if (rand() < 0.75) { idx.push(j); val.push(1 + Math.floor(rand() * 9)); }
              rows.push({ idx, val, op: rand() < 0.8 ? '<=' : '>=', rhs: 5 + Math.floor(rand() * 30) });
            }
            if (rand() < 0.3) rows.push({ idx: [0], val: [1], op: '<=', rhs: 3 });
            const isInt = Uint8Array.from({ length: n }, () => (rand() < 0.8 ? 1 : 0));
            const P = { n, c: Float64Array.from({ length: n }, () => 1 + Math.floor(rand() * 12)), c0: 0, rows, lower: new Float64Array(n), upper: Float64Array.from({ length: n }, () => (rand() < 0.5 ? 1 + Math.floor(rand() * 6) : Infinity)), maximize: true };
            const a = E.branchAndBoundClassic(P, isInt, { gap: 0 });
            const b = E.solveMIP(P, isInt, { gap: 0 });
            cuts += b.stats.cuts; removed += (b.stats.presolve && b.stats.presolve.rowsRemoved) || 0;
            if (a.status !== b.status) { bad.push(`#${t} ${a.status} vs ${b.status}`); continue; }
            if (a.status === 'optimal' && Math.abs(a.obj - b.obj) > 1e-6 * Math.max(1, Math.abs(a.obj))) { bad.push(`#${t} obj ${a.obj} vs ${b.obj}`); continue; }
            if (b.x) for (const r of rows) { let s = 0; r.idx.forEach((j, k) => { s += r.val[k] * b.x[j]; }); if ((r.op === '<=' && s > r.rhs + 1e-6) || (r.op === '>=' && s < r.rhs - 1e-6)) bad.push(`#${t} infeasible incumbent`); }
          }
          return (!bad.length && cuts > 0 && removed > 0) || (bad.join('; ') || `cuts ${cuts}, presolve removed ${removed}`);
        }
      },
      {
        name: 'Performance · 100×100 LP under budget', run() {
          const rand = E.mulberry32(7);
          const A = [], b = [], c = [];
          for (let i = 0; i < 100; i++) { const row = []; for (let j = 0; j < 100; j++) row.push(Math.round(rand() * 9 + 1)); A.push('[' + row.join(',') + ']'); b.push(Math.round(500 + rand() * 500)); }
          for (let j = 0; j < 100; j++) c.push(Math.round(rand() * 20 + 1));
          const m = M({ sense: 'max', expr: 'dot(c, x)' }, [V('x', { shape: '100' })], [R('matmul(A, x) <= b')], [P('A', '[' + A.join(',') + ']'), P('b', '[' + b.join(',') + ']'), P('c', '[' + c.join(',') + ']')]);
          const t0 = Date.now();
          const r = E.solve(m, {});
          const ms = Date.now() - t0;
          return (r.status === 'optimal' && ms < 400) || `status ${r.status} in ${ms}ms`;
        }
      },
      {
        name: 'v3 · Infeasible models come with concrete fixes', run() {
          const a = V('a'), b = V('b');
          const m = M({ sense: 'max', expr: 'a + b' }, [a, b], [R('a + b <= 10', 'Cap'), R('a >= 8', 'MinA'), R('b >= 6', 'MinB')]);
          const r = E.solve(m, {});
          const fx = (r.diagnosis && r.diagnosis.fixes) || [];
          const tot = fx.reduce((s, f) => s + f.amount, 0);
          return (r.status === 'infeasible' && fx.length >= 1 && close(tot, 4, 1e-6)) || JSON.stringify({ status: r.status, fx });
        }
      },
      {
        name: 'v3 · Unbounded points at the growing decision', run() {
          const r = E.solve(M({ sense: 'max', expr: 'x + 2y' }, [V('x', { upper: '5' }), V('y')], [R('x - y <= 3')]), {});
          return (r.status === 'unbounded' && Array.isArray(r.growing) && r.growing.includes(1) && !r.growing.includes(0)) || JSON.stringify({ status: r.status, g: r.growing });
        }
      },
      {
        name: 'v3 · Nonlinear integer model finds the true best', run() {
          const r = E.solve(M({ sense: 'min', expr: '(x - 3.4)^2 + (y - 1.6)^2 + x*y/10' }, [V('x', { type: 'int', upper: '10' }), V('y', { type: 'int', upper: '10' })], [R('x + y >= 4')]), {});
          return (['optimal', 'feasible'].includes(r.status) && r.values[0] === 3 && r.values[1] === 1) || fmt(r);
        }
      },
      {
        name: 'Guide · every recipe builds a model that solves', run() {
          const want = {
            produce: [{ items: [{ name: 'Chairs', value: '45' }, { name: 'Tables', value: '80' }], resources: [{ name: 'Wood', available: '400', use: ['5', '20'] }, { name: 'Labour hours', available: '130', use: ['2', '5'] }], whole: true }, 2925],
            budget: [{ channels: [{ name: 'Search', value: '5000' }, { name: 'Social', value: '8000', max: '6000' }], total: '10000', diminishing: true }, null],
            pick: [{ items: [{ name: 'Tent', value: 10, cost: 5 }, { name: 'Stove', value: 13, cost: 6 }, { name: 'Camera', value: 7, cost: 3 }, { name: 'Food', value: 15, cost: 7 }], limit: '15', costLabel: 'Weight' }, 32],
            blend: [{ items: [{ name: 'Oats', value: '0.3' }, { name: 'Milk', value: '0.25' }], needs: [{ name: 'Calories', min: '600', use: ['150', '120'] }] }, 1.2],
            assign: [{ rowsList: [{ name: 'Ana' }, { name: 'Ben' }], colsList: [{ name: 'Cook' }, { name: 'Clean' }], matrix: [['5', '9'], ['4', '2']] }, 7],
            ship: [{ rowsList: [{ name: 'A', value: '20' }, { name: 'B', value: '30' }], colsList: [{ name: 'X', value: '10' }, { name: 'Y', value: '25' }, { name: 'Z', value: '15' }], matrix: [['8', '6', '10'], ['9', '12', '13']] }, 465]
          };
          const bad = [];
          for (const k of Object.keys(want)) {
            const [data, obj] = want[k];
            const b = E.buildFromRecipe(k, data);
            if (!b.model || b.problems.length) { bad.push(k + ': ' + b.problems.join('; ')); continue; }
            const r = E.solve(b.model, {});
            if (!['optimal', 'feasible'].includes(r.status) || (obj != null && !close(r.objective, obj, 1e-4))) bad.push(k + ': ' + fmt(r));
          }
          const broken = E.buildFromRecipe('produce', { items: [{ name: 'A', value: 'abc' }] });
          if (!broken.problems.length) bad.push('no problems reported for bad input');
          return !bad.length || bad.join('\n');
        }
      },
      {
        name: 'v3 · Unknown names carry a quick fix', run() {
          const C = E.compile(M({ sense: 'max', expr: '3*chairs + pricee' }, [V('chairs')], [], [P('price', '4')]));
          const f = C.errors.goal && C.errors.goal.fix;
          return (f && f.kind === 'unknown' && f.name === 'pricee' && f.suggest === 'price') || JSON.stringify(C.errors.goal);
        }
      }
    ];
  }

  function fmt(r, extra) {
    return JSON.stringify({ status: r.status, engine: r.engine, obj: r.objective, values: r.values && r.values.slice(0, 8), message: r.message, extra });
  }

  function runAll() {
    const out = [];
    for (const c of cases()) {
      const t0 = Date.now();
      let ok, detail = '';
      try {
        const r = c.run();
        ok = r === true;
        if (!ok) detail = String(r);
      } catch (e) {
        ok = false;
        detail = (e && e.stack) || String(e);
      }
      out.push({ name: c.name, ok, detail, ms: Date.now() - t0 });
    }
    return out;
  }

  E.runTests = runAll;
  E.testCases = cases;
});
