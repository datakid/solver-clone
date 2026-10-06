(function (N) {
  'use strict';
  const S = N.Store;
  const E = window.Engine;

  const V = (name, o) => Object.assign({ name, shape: '1', type: 'real', lower: '', upper: '', init: '', labels: [] }, o || {});
  const R = (label, expr) => ({ label, expr, enabled: true });
  const P = (name, expr, slider) => ({ name, expr, slider: slider || null });

  const list = [
    {
      key: 'bakery', name: 'Bakery', kind: 'starter', icon: 'cake', blurb: 'How many loaves and cakes to bake for the most profit?',
      note: ['Decide how many loaves and cakes to bake today for the most profit.', 'Oven time and flour are limited, and only 30 cakes will sell. A perfect first model.'],
      model: {
        goal: { sense: 'max', expr: 'loafProfit * loaves + cakeProfit * cakes' },
        variables: [V('loaves', { type: 'int' }), V('cakes', { type: 'int' })],
        constraints: [R('Oven time', '0.5 * loaves + 1.5 * cakes <= ovenHours'), R('Flour', '1 * loaves + 0.5 * cakes <= flourKg'), R('Cake demand', 'cakes <= 30')],
        parameters: [P('loafProfit', '4', { min: 0, max: 20, step: 0.5 }), P('cakeProfit', '10', { min: 0, max: 30, step: 0.5 }), P('ovenHours', '60', { min: 0, max: 120, step: 1 }), P('flourKg', '70', { min: 0, max: 150, step: 1 })]
      }
    },
    {
      key: 'product-mix', name: 'Product mix', kind: 'int LP', icon: 'box', blurb: 'Build chairs, tables and desks for the most profit.',
      note: ['Choose how many chairs, tables and desks to build for the most profit.', 'Wood and labour are limited; you can only build whole pieces.'],
      model: {
        goal: { sense: 'max', expr: 'sum(profit * make)' },
        variables: [V('make', { shape: '3', type: 'int', labels: ['Chairs', 'Tables', 'Desks'] })],
        constraints: [R('Wood', 'sum(wood * make) <= woodStock'), R('Labour', 'sum(hours * make) <= labourHours'), R('Min desks', 'make[3] >= 2')],
        parameters: [P('profit', '[45, 80, 60]'), P('wood', '[5, 20, 10]'), P('hours', '[2, 5, 4]'), P('woodStock', '400', { min: 0, max: 1000, step: 10 }), P('labourHours', '130', { min: 0, max: 300, step: 5 })]
      }
    },
    {
      key: 'diet', name: 'Diet', kind: 'LP', icon: 'leaf', blurb: 'The cheapest mix of foods that meets daily nutrition.',
      note: ['Find the cheapest mix of foods that meets daily nutrition targets.', 'Each food has a cost per serving and a nutrient profile; servings are capped.'],
      model: {
        goal: { sense: 'min', expr: 'dot(cost, serve)' },
        variables: [V('serve', { shape: '5', upper: '8', labels: ['Oats', 'Milk', 'Eggs', 'Beans', 'Spinach'] })],
        constraints: [R('Calories', 'dot(kcal, serve) >= 2000'), R('Protein', 'dot(protein, serve) >= 55'), R('Iron', 'dot(iron, serve) >= 18'), R('Calorie cap', 'dot(kcal, serve) <= 2600')],
        parameters: [P('cost', '[0.30, 0.25, 0.40, 0.35, 0.60]'), P('kcal', '[150, 120, 155, 230, 40]'), P('protein', '[5, 8, 13, 15, 5]'), P('iron', '[1.7, 0.1, 1.8, 3.6, 6.4]')]
      }
    },
    {
      key: 'transport', name: 'Transportation', kind: '2D LP', icon: 'truck', blurb: 'Ship from two plants to three stores at the lowest cost.',
      note: ['Ship goods from two plants to three stores at the lowest cost.', 'Row sums are what each plant sends; column sums are what each store receives.'],
      model: {
        goal: { sense: 'min', expr: 'sum(cost * ship)' },
        variables: [V('ship', { shape: '2x3', labels: ['Plant A', 'Plant B'] })],
        constraints: [R('Supply', 'rowsum(ship) <= supply'), R('Demand', 'colsum(ship) >= demand')],
        parameters: [P('supply', '[20, 30]'), P('demand', '[10, 25, 15]'), P('cost', '[[8, 6, 10], [9, 12, 13]]')]
      }
    },
    {
      key: 'assignment', name: 'Assignment', kind: 'bin 2D', icon: 'users', blurb: 'Give four people one task each, in the least total time.',
      note: ['Give each of four people exactly one task so the total time is lowest.', 'A yes/no table: every row and every column must sum to one.'],
      model: {
        goal: { sense: 'min', expr: 'sum(minutes * assign)' },
        variables: [V('assign', { shape: '4x4', type: 'bin', labels: ['Ana', 'Ben', 'Chen', 'Dara'] })],
        constraints: [R('One task each', 'rowsum(assign) = 1'), R('One person per task', 'colsum(assign) = 1')],
        parameters: [P('minutes', '[[90, 76, 75, 70], [35, 85, 55, 65], [125, 95, 90, 105], [45, 110, 95, 115]]')]
      }
    },
    {
      key: 'knapsack', name: 'Knapsack', kind: 'bin', icon: 'backpack', blurb: 'Pack the most valuable gear under a weight limit.',
      note: ['Pick which items to pack for the most value without going over the weight limit.', 'Each item is either taken or left: a classic yes/no decision.'],
      model: {
        goal: { sense: 'max', expr: 'sum(value * take)' },
        variables: [V('take', { shape: '6', type: 'bin', labels: ['Tent', 'Stove', 'Camera', 'Book', 'Food', 'Rope'] })],
        constraints: [R('Weight', 'sum(weight * take) <= capacity')],
        parameters: [P('value', '[10, 13, 7, 8, 15, 4]'), P('weight', '[5, 6, 3, 4, 7, 2]'), P('capacity', '15', { min: 0, max: 30, step: 1 })]
      }
    },
    {
      key: 'portfolio', name: 'Portfolio', kind: 'NLP', icon: 'pie', blurb: 'Reach a target return with the least risk.',
      note: ['Split money across four assets to reach a target return with the least risk.', 'Risk is the quadratic form wᵀΣw; weights sum to one and no shorting.'],
      model: {
        goal: { sense: 'min', expr: 'quad(w, cov)' },
        variables: [V('w', { shape: '4', upper: '0.6', labels: ['Stocks', 'Bonds', 'Gold', 'REITs'] })],
        constraints: [R('Fully invested', 'sum(w) = 1'), R('Return', 'dot(ret, w) >= minReturn')],
        parameters: [P('ret', '[9%, 4%, 6%, 7.5%]'), P('cov', '[[0.040, 0.004, 0.002, 0.018], [0.004, 0.006, 0.001, 0.003], [0.002, 0.001, 0.025, 0.004], [0.018, 0.003, 0.004, 0.032]]'), P('minReturn', '6.5%', { min: 0.04, max: 0.09, step: 0.0025 })]
      }
    },
    {
      key: 'ad-budget', name: 'Ad budget', kind: 'NLP', icon: 'bolt', blurb: 'Split a budget across channels with diminishing returns.',
      note: ['Split a marketing budget across three channels to reach the most people.', 'Each extra dollar reaches fewer new people than the last — so spreading out pays.'],
      model: {
        goal: { sense: 'max', expr: 'sum(reach * log(1 + spend / 1000))' },
        variables: [V('spend', { shape: '3', labels: ['Search', 'Social', 'Radio'], init: '[1000, 1000, 1000]' })],
        constraints: [R('Budget', 'sum(spend) <= budget')],
        parameters: [P('reach', '[5000, 8000, 3000]'), P('budget', '10000', { min: 0, max: 30000, step: 500 })]
      }
    },
    {
      key: 'curve-fit', name: 'Curve fit', kind: 'least squares', icon: 'trend', blurb: 'Fit an exponential curve to measured points.',
      note: ['Fit y = a·exp(b·t) + c to measured points by least squares.', 'The goal is the sum of squared residuals; nothing else is needed.'],
      model: {
        goal: { sense: 'min', expr: 'sumsq(a * exp(b * t) + c - y)' },
        variables: [V('a', { lower: '-inf', init: '1' }), V('b', { lower: '-inf', init: '0.1' }), V('c', { lower: '-inf', init: '0' })],
        constraints: [],
        parameters: [P('t', '0..9'), P('y', '[2.1, 2.9, 3.9, 5.2, 7.1, 9.4, 12.6, 16.8, 22.6, 30.1]')]
      }
    },
    {
      key: 'staffing', name: 'Staffing with shortfalls', kind: 'LP · pos()', icon: 'users', blurb: 'Plan production when missing demand costs a penalty.',
      note: ['Decide how much of each product to make; every unit of unmet demand costs a penalty.', 'pos(demand − make) counts only the shortfall. Nadir turns it into straight lines and proves the best plan.'],
      model: {
        goal: { sense: 'min', expr: 'sum(cost * make) + penalty * sum(pos(demand - make))' },
        variables: [V('make', { shape: '3', upper: '60', labels: ['Basic', 'Plus', 'Pro'] })],
        constraints: [R('Line hours', 'sum(hours * make) <= lineHours'), R('Overtime cap', 'sum(pos(make - 40)) <= 10')],
        parameters: [P('cost', '[5, 8, 14]'), P('demand', '[40, 45, 30]'), P('hours', '[1, 1.5, 2]'), P('lineHours', '160', { min: 0, max: 300, step: 5 }), P('penalty', '20', { min: 0, max: 60, step: 1 })]
      }
    },
    {
      key: 'robust-fit', name: 'Robust line fit', kind: 'LP · abs()', icon: 'trend', blurb: 'Fit a line that ignores one bad measurement.',
      note: ['Fit y = m·t + c by the smallest total absolute error, so one outlier barely moves the line.', 'abs() in the goal is solved exactly by Simplex — compare with squared errors in Curve fit.'],
      model: {
        goal: { sense: 'min', expr: 'sum(abs(m * t + c - y))' },
        variables: [V('m', { lower: '-inf' }), V('c', { lower: '-inf' })],
        constraints: [],
        parameters: [P('t', '1..8'), P('y', '[3.1, 4.9, 7.2, 8.8, 11.1, 40, 15.2, 16.9]')]
      }
    },
    {
      key: 'spread-out', name: 'Keep away from hazards', kind: 'MIP · switches', icon: 'scale', blurb: 'Place a depot as far as possible from two hazards, inside a site.',
      note: ['Place a depot on a 10 × 10 site so its distance to the nearer of two hazards is as large as possible, while staying within reach of the road.', 'Maximizing a min of abs() bends the wrong way for straight lines alone — Nadir adds on/off switches and Branch & Bound proves the best spot.'],
      model: {
        goal: { sense: 'max', expr: 'min(abs(x - hx[1]) + abs(y - hy[1]), abs(x - hx[2]) + abs(y - hy[2]))' },
        variables: [V('x', { upper: '10' }), V('y', { upper: '10' })],
        constraints: [R('Near the road', 'y <= roadReach'), R('Budget', 'x + y <= 16')],
        parameters: [P('hx', '[2, 7]'), P('hy', '[3, 6]'), P('roadReach', '8', { min: 0, max: 10, step: 0.5 })]
      }
    },
    {
      key: 'break-even', name: 'Break-even', kind: 'Target', icon: 'tag', blurb: 'The sales volume where profit is exactly zero.',
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

  function open(key, opts) {
    const o = opts || {};
    const t = list.find((x) => x.key === key);
    if (!t) return;
    const m = build(t);
    S.replace(m);
    N.Drawer && N.Drawer.close();
    if (!o.quiet) N.toast(`${t.name} example loaded — press Solve to see the best plan`, { kind: 'info' });
  }

  N.Templates = { list, build, open };
})(window.Nadir);
