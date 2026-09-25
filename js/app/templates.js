(function (N) {
  'use strict';
  const S = N.Store;
  const E = window.Engine;

  const V = (name, o) => Object.assign({ name, shape: '1', type: 'real', lower: '', upper: '', init: '', labels: [] }, o || {});
  const R = (label, expr) => ({ label, expr, enabled: true });
  const P = (name, expr, slider) => ({ name, expr, slider: slider || null });

  const list = [
    {
      key: 'product-mix', name: 'Product mix', kind: 'int LP',
      note: ['Choose how many chairs, tables and desks to build for the most profit.', 'Wood and labour are limited; you can only build whole pieces.'],
      model: {
        goal: { sense: 'max', expr: 'sum(profit * make)' },
        variables: [V('make', { shape: '3', type: 'int', labels: ['Chairs', 'Tables', 'Desks'] })],
        constraints: [R('Wood', 'sum(wood * make) <= woodStock'), R('Labour', 'sum(hours * make) <= labourHours'), R('Min desks', 'make[3] >= 2')],
        parameters: [P('profit', '[45, 80, 60]'), P('wood', '[5, 20, 10]'), P('hours', '[2, 5, 4]'), P('woodStock', '400', { min: 0, max: 1000, step: 10 }), P('labourHours', '130', { min: 0, max: 300, step: 5 })]
      }
    },
    {
      key: 'diet', name: 'Diet', kind: 'LP',
      note: ['Find the cheapest mix of foods that meets daily nutrition targets.', 'Each food has a cost per serving and a nutrient profile; servings are capped.'],
      model: {
        goal: { sense: 'min', expr: 'dot(cost, serve)' },
        variables: [V('serve', { shape: '5', upper: '8', labels: ['Oats', 'Milk', 'Eggs', 'Beans', 'Spinach'] })],
        constraints: [R('Calories', 'dot(kcal, serve) >= 2000'), R('Protein', 'dot(protein, serve) >= 55'), R('Iron', 'dot(iron, serve) >= 18'), R('Calorie cap', 'dot(kcal, serve) <= 2600')],
        parameters: [P('cost', '[0.30, 0.25, 0.40, 0.35, 0.60]'), P('kcal', '[150, 120, 155, 230, 40]'), P('protein', '[5, 8, 13, 15, 5]'), P('iron', '[1.7, 0.1, 1.8, 3.6, 6.4]')]
      }
    },
    {
      key: 'transport', name: 'Transportation', kind: '2D LP',
      note: ['Ship goods from two plants to three stores at the lowest cost.', 'Row sums are what each plant sends; column sums are what each store receives.'],
      model: {
        goal: { sense: 'min', expr: 'sum(cost * ship)' },
        variables: [V('ship', { shape: '2x3', labels: ['Plant A', 'Plant B'] })],
        constraints: [R('Supply', 'rowsum(ship) <= supply'), R('Demand', 'colsum(ship) >= demand')],
        parameters: [P('supply', '[20, 30]'), P('demand', '[10, 25, 15]'), P('cost', '[[8, 6, 10], [9, 12, 13]]')]
      }
    },
    {
      key: 'assignment', name: 'Assignment', kind: 'bin 2D',
      note: ['Give each of four people exactly one task so the total time is lowest.', 'A yes/no table: every row and every column must sum to one.'],
      model: {
        goal: { sense: 'min', expr: 'sum(minutes * assign)' },
        variables: [V('assign', { shape: '4x4', type: 'bin', labels: ['Ana', 'Ben', 'Chen', 'Dara'] })],
        constraints: [R('One task each', 'rowsum(assign) = 1'), R('One person per task', 'colsum(assign) = 1')],
        parameters: [P('minutes', '[[90, 76, 75, 70], [35, 85, 55, 65], [125, 95, 90, 105], [45, 110, 95, 115]]')]
      }
    },
    {
      key: 'knapsack', name: 'Knapsack', kind: 'bin',
      note: ['Pick which items to pack for the most value without going over the weight limit.', 'Each item is either taken or left: a classic yes/no decision.'],
      model: {
        goal: { sense: 'max', expr: 'sum(value * take)' },
        variables: [V('take', { shape: '6', type: 'bin', labels: ['Tent', 'Stove', 'Camera', 'Book', 'Food', 'Rope'] })],
        constraints: [R('Weight', 'sum(weight * take) <= capacity')],
        parameters: [P('value', '[10, 13, 7, 8, 15, 4]'), P('weight', '[5, 6, 3, 4, 7, 2]'), P('capacity', '15', { min: 0, max: 30, step: 1 })]
      }
    },
    {
      key: 'portfolio', name: 'Portfolio', kind: 'NLP',
      note: ['Split money across four assets to reach a target return with the least risk.', 'Risk is the quadratic form wᵀΣw; weights sum to one and no shorting.'],
      model: {
        goal: { sense: 'min', expr: 'quad(w, cov)' },
        variables: [V('w', { shape: '4', upper: '0.6', labels: ['Stocks', 'Bonds', 'Gold', 'REITs'] })],
        constraints: [R('Fully invested', 'sum(w) = 1'), R('Return', 'dot(ret, w) >= minReturn')],
        parameters: [P('ret', '[9%, 4%, 6%, 7.5%]'), P('cov', '[[0.040, 0.004, 0.002, 0.018], [0.004, 0.006, 0.001, 0.003], [0.002, 0.001, 0.025, 0.004], [0.018, 0.003, 0.004, 0.032]]'), P('minReturn', '6.5%', { min: 0.04, max: 0.09, step: 0.0025 })]
      }
    },
    {
      key: 'curve-fit', name: 'Curve fit', kind: 'least squares',
      note: ['Fit y = a·exp(b·t) + c to measured points by least squares.', 'The goal is the sum of squared residuals; nothing else is needed.'],
      model: {
        goal: { sense: 'min', expr: 'sumsq(a * exp(b * t) + c - y)' },
        variables: [V('a', { lower: '-inf', init: '1' }), V('b', { lower: '-inf', init: '0.1' }), V('c', { lower: '-inf', init: '0' })],
        constraints: [],
        parameters: [P('t', '0..9'), P('y', '[2.1, 2.9, 3.9, 5.2, 7.1, 9.4, 12.6, 16.8, 22.6, 30.1]')]
      }
    },
    {
      key: 'break-even', name: 'Break-even', kind: 'Target',
      note: ['Find the sales volume where profit is exactly zero.', 'Target mode solves goal = value instead of maximizing.'],
      model: {
        goal: { sense: 'target', expr: 'units * (price - unitCost) - fixedCost', target: '0' },
        variables: [V('units', { init: '100' })],
        constraints: [],
        parameters: [P('price', '24', { min: 10, max: 60, step: 1 }), P('unitCost', '9.5'), P('fixedCost', '18000', { min: 0, max: 50000, step: 500 })]
      }
    }
  ];

  function build(t) {
    const m = S.blankModel();
    m.name = t.name;
    m.notes = t.note.join('\n');
    m.goal = Object.assign({ target: null }, t.model.goal);
    m.variables = t.model.variables.map((v) => Object.assign({ id: E.uid('v') }, JSON.parse(JSON.stringify(v))));
    m.constraints = t.model.constraints.map((c) => Object.assign({ id: E.uid('c') }, c));
    m.parameters = t.model.parameters.map((p) => Object.assign({ id: E.uid('p') }, JSON.parse(JSON.stringify(p))));
    return m;
  }

  function open(key) {
    const t = list.find((x) => x.key === key);
    if (!t) return;
    const m = build(t);
    S.replace(m);
    N.Drawer && N.Drawer.close();
    N.toast(`${t.name} template loaded`, { kind: 'info', action: { label: 'Solve', run: () => N.Solve.run() } });
  }

  N.Templates = { list, build, open };
})(window.Nadir);
