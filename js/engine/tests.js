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
