(function (N) {
  'use strict';
  const { h, icon, esc, debounce } = N.util;
  const S = N.Store;
  const E = window.Engine;
  const O = N.Overlays;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const names = (rows) => rows.filter((r) => String(r.name || '').trim()).map((r) => String(r.name).trim());

  const KINDS = [
    {
      key: 'produce', icon: 'box', title: 'Make the most profit', blurb: 'Choose how many of each product to make when materials, time or money run out.',
      eg: 'Bakery, workshop, factory', defaultName: 'Production plan',
      example: { items: [{ name: 'Chairs', value: '45', max: '' }, { name: 'Tables', value: '80', max: '' }, { name: 'Desks', value: '60', max: '10' }], resources: [{ name: 'Wood (kg)', available: '400', use: ['5', '20', '10'] }, { name: 'Labour (hours)', available: '130', use: ['2', '5', '4'] }], whole: true },
      empty: { items: [{ name: '', value: '', max: '' }, { name: '', value: '', max: '' }], resources: [{ name: '', available: '', use: [] }], whole: true }
    },
    {
      key: 'budget', icon: 'pie', title: 'Split a budget', blurb: 'Share money or time across options to get the biggest total return.',
      eg: 'Ads, investments, staff hours', defaultName: 'Budget split',
      example: { channels: [{ name: 'Search ads', value: '1.2', min: '', max: '6000' }, { name: 'Social ads', value: '1.6', min: '1000', max: '' }, { name: 'Radio', value: '0.8', min: '', max: '3000' }], total: '10000', diminishing: true, spendAll: false },
      empty: { channels: [{ name: '', value: '', min: '', max: '' }, { name: '', value: '', min: '', max: '' }], total: '', diminishing: true, spendAll: false }
    },
    {
      key: 'pick', icon: 'backpack', title: 'Pick the best set', blurb: 'Say yes or no to each item to get the most value without going over a limit.',
      eg: 'Projects, packing, shortlist', defaultName: 'Best selection',
      example: { items: [{ name: 'Tent', value: '10', cost: '5' }, { name: 'Stove', value: '13', cost: '6' }, { name: 'Camera', value: '7', cost: '3' }, { name: 'Book', value: '8', cost: '4' }, { name: 'Food', value: '15', cost: '7' }], costLabel: 'Weight', limit: '15', maxCount: '' },
      empty: { items: [{ name: '', value: '', cost: '' }, { name: '', value: '', cost: '' }], costLabel: 'Cost', limit: '', maxCount: '' }
    },
    {
      key: 'blend', icon: 'leaf', title: 'Cheapest mix', blurb: 'Blend ingredients at the lowest cost while meeting minimums and maximums.',
      eg: 'Diet, feed, recipes, alloys', defaultName: 'Cheapest mix',
      example: { items: [{ name: 'Oats', value: '0.30', max: '8' }, { name: 'Milk', value: '0.25', max: '8' }, { name: 'Eggs', value: '0.40', max: '8' }, { name: 'Beans', value: '0.35', max: '8' }], needs: [{ name: 'Calories', min: '2000', max: '2600', use: ['150', '120', '155', '230'] }, { name: 'Protein (g)', min: '55', max: '', use: ['5', '8', '13', '15'] }], totalAmount: '' },
      empty: { items: [{ name: '', value: '', max: '' }, { name: '', value: '', max: '' }], needs: [{ name: '', min: '', max: '', use: [] }], totalAmount: '' }
    },
    {
      key: 'assign', icon: 'users', title: 'Who does what', blurb: 'Match people to tasks, one each, for the least total time or cost.',
      eg: 'Shifts, jobs, rooms', defaultName: 'Assignment',
      example: { rowsList: [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Chen' }], colsList: [{ name: 'Cook' }, { name: 'Clean' }, { name: 'Serve' }], matrix: [['30', '45', '25'], ['35', '20', '40'], ['50', '30', '20']], cellLabel: 'Minutes', maximize: false },
      empty: { rowsList: [{ name: '' }, { name: '' }], colsList: [{ name: '' }, { name: '' }], matrix: [], cellLabel: 'Cost', maximize: false }
    },
    {
      key: 'ship', icon: 'truck', title: 'Ship at lowest cost', blurb: 'Send goods from where they are to where they are needed, as cheaply as possible.',
      eg: 'Warehouses, deliveries', defaultName: 'Shipping plan',
      example: { rowsList: [{ name: 'Plant A', value: '20' }, { name: 'Plant B', value: '30' }], colsList: [{ name: 'Store 1', value: '10' }, { name: 'Store 2', value: '25' }, { name: 'Store 3', value: '15' }], matrix: [['8', '6', '10'], ['9', '12', '13']], whole: false },
      empty: { rowsList: [{ name: '', value: '' }, { name: '', value: '' }], colsList: [{ name: '', value: '' }, { name: '', value: '' }], matrix: [], whole: false }
    }
  ];

  function field(label, value, onInput, opts) {
    const o = opts || {};
    const inp = h('input', { class: 'input' + (o.num ? ' is-num' : ''), type: 'text', value: value == null ? '' : value, placeholder: o.placeholder || '', inputmode: o.num ? 'decimal' : null, 'aria-label': label });
    inp.addEventListener('input', () => onInput(inp.value));
    return h('label', { class: 'wz-field' + (o.wide ? ' is-wide' : '') }, h('span', { class: 'wz-label' }, label, o.hint ? h('span', { class: 'wz-hint' }, o.hint) : null), inp);
  }
  function check(label, on, onChange, hint) {
    const b = h('input', { type: 'checkbox' });
    b.checked = !!on;
    b.addEventListener('change', () => onChange(b.checked));
    return h('label', { class: 'wz-check' }, b, h('span', null, h('strong', null, label), hint ? h('span', null, hint) : null));
  }

  function table(opts) {
    const { rows, cols, onChange, onNames, addLabel, min } = opts;
    const wrap = h('div', { class: 'wz-table-wrap' });
    const tbl = h('table', { class: 'wz-table' });
    const draw = () => {
      tbl.textContent = '';
      const head = h('tr');
      cols.forEach((c) => head.append(h('th', { class: c.num ? 'num' : '', title: c.tip || '' }, c.label)));
      head.append(h('th', { class: 'wz-x' }));
      tbl.append(h('thead', null, head));
      const tb = h('tbody');
      rows.forEach((r, i) => {
        const tr = h('tr');
        cols.forEach((c) => {
          const v = c.get ? c.get(r) : r[c.key];
          const inp = h('input', { class: 'wz-cell' + (c.num ? ' is-num' : ''), type: 'text', value: v == null ? '' : v, placeholder: c.placeholder || '', inputmode: c.num ? 'decimal' : null, 'aria-label': `${c.label}, row ${i + 1}` });
          inp.addEventListener('input', () => { if (c.set) c.set(r, inp.value); else r[c.key] = inp.value; onChange(); });
          if (c.key === 'name' && onNames) inp.addEventListener('change', onNames);
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (i === rows.length - 1) { addRow(); requestAnimationFrame(() => { const f = tbl.querySelector('tbody tr:last-child input'); if (f) f.focus(); }); }
              else { const nx = tbl.querySelectorAll('tbody tr')[i + 1]; if (nx) nx.querySelector('input').focus(); }
            }
          });
          tr.append(h('td', null, inp));
        });
        const del = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Remove row', html: icon('x', 'icon-sm'), disabled: rows.length <= (min || 1) });
        del.addEventListener('click', () => { rows.splice(i, 1); draw(); onChange(); if (onNames) onNames(); });
        tr.append(h('td', { class: 'wz-x' }, del));
        tb.append(tr);
      });
      tbl.append(tb);
    };
    function addRow() { rows.push(opts.blank()); draw(); onChange(); if (onNames) onNames(); }
    const add = h('button', { class: 'wz-add', type: 'button', html: icon('plus', 'icon-xs') + esc(addLabel || 'Add a row') });
    add.addEventListener('click', addRow);
    draw();
    wrap.append(tbl);
    return { el: h('div', { class: 'wz-table-box' }, wrap, add), redraw: draw };
  }

  function matrix(opts) {
    const { rowsList, colsList, data, onChange, label } = opts;
    const box = h('div', { class: 'wz-table-wrap' });
    const draw = () => {
      box.textContent = '';
      const rn = rowsList.map((r, i) => String(r.name || '').trim() || `Row ${i + 1}`);
      const cn = colsList.map((c, i) => String(c.name || '').trim() || `Column ${i + 1}`);
      const tbl = h('table', { class: 'wz-table wz-matrix' });
      const head = h('tr', null, h('th', { class: 'wz-corner' }, label || ''));
      cn.forEach((c) => head.append(h('th', { class: 'num' }, c)));
      tbl.append(h('thead', null, head));
      const tb = h('tbody');
      rn.forEach((r, i) => {
        data[i] = data[i] || [];
        const tr = h('tr', null, h('th', { scope: 'row' }, r));
        cn.forEach((c, j) => {
          const inp = h('input', { class: 'wz-cell is-num', type: 'text', value: data[i][j] == null ? '' : data[i][j], inputmode: 'decimal', 'aria-label': `${r} → ${c}` });
          inp.addEventListener('input', () => { data[i][j] = inp.value; onChange(); });
          tr.append(h('td', null, inp));
        });
        tb.append(tr);
      });
      tbl.append(tb);
      box.append(tbl);
    };
    draw();
    return { el: box, redraw: draw };
  }

  const sec = (title, sub, ...kids) => h('section', { class: 'wz-sec' }, h('h4', null, title), sub ? h('p', { class: 'wz-sub' }, sub) : null, ...kids);

  const FORMS = {
    produce(d, ch) {
      let resT;
      const itemsT = table({
        rows: d.items, blank: () => ({ name: '', value: '', max: '' }), addLabel: 'Add a product', onChange: ch, onNames: () => resT.redraw(),
        cols: [{ key: 'name', label: 'Product', placeholder: 'e.g. Chairs' }, { key: 'value', label: 'Profit each', num: true, placeholder: '0' }, { key: 'max', label: 'Most you can sell', num: true, placeholder: 'no limit' }]
      });
      const resCols = () => [{ key: 'name', label: 'Resource', placeholder: 'e.g. Wood' }, { key: 'available', label: 'Available', num: true, placeholder: '0' }].concat(names(d.items).map((n, i) => ({ label: `per ${n}`, num: true, placeholder: '0', get: (r) => (r.use || [])[i], set: (r, v) => { r.use = r.use || []; r.use[i] = v; } })));
      const resOpts = { rows: d.resources, blank: () => ({ name: '', available: '', use: [] }), addLabel: 'Add something that runs out', onChange: ch, min: 0 };
      resT = { el: h('div'), redraw() { const t = table(Object.assign({}, resOpts, { cols: resCols() })); this.el.replaceChildren(t.el); } };
      resT.redraw();
      return [
        sec('What do you make?', 'One row per product, with the profit you make on each one.', itemsT.el),
        sec('What runs out?', 'Materials, hours or money you only have so much of — and how much each product uses.', resT.el),
        check('Only whole units', d.whole, (v) => { d.whole = v; ch(); }, 'You can’t make half a chair')
      ];
    },
    budget(d, ch) {
      const t = table({
        rows: d.channels, blank: () => ({ name: '', value: '', min: '', max: '' }), addLabel: 'Add an option', onChange: ch,
        cols: [{ key: 'name', label: 'Option', placeholder: 'e.g. Search ads' }, { key: 'value', label: 'Return per 1 spent', num: true, placeholder: '0', tip: 'What one unit of money brings back at the start' }, { key: 'min', label: 'At least', num: true, placeholder: '0' }, { key: 'max', label: 'At most', num: true, placeholder: 'no limit' }]
      });
      return [
        h('div', { class: 'wz-row' }, field('Total budget', d.total, (v) => { d.total = v; ch(); }, { num: true, placeholder: 'e.g. 10000' })),
        sec('Where can it go?', 'List the options and what each one returns.', t.el),
        check('Each extra dollar brings a little less', d.diminishing, (v) => { d.diminishing = v; ch(); }, 'Diminishing returns — spreading out usually pays. Turn off if every dollar earns the same.'),
        check('Spend the whole budget', d.spendAll, (v) => { d.spendAll = v; ch(); })
      ];
    },
    pick(d, ch) {
      const mk = () => table({
        rows: d.items, blank: () => ({ name: '', value: '', cost: '' }), addLabel: 'Add an item', onChange: ch,
        cols: [{ key: 'name', label: 'Item', placeholder: 'e.g. Tent' }, { key: 'value', label: 'Value', num: true, placeholder: '0' }, { key: 'cost', label: d.costLabel || 'Cost', num: true, placeholder: '0' }]
      });
      const holder = h('div');
      let t = mk(); holder.append(t.el);
      return [
        h('div', { class: 'wz-row' },
          field('What is limited?', d.costLabel, (v) => { d.costLabel = v; ch(); const nt = mk(); holder.replaceChildren(nt.el); }, { placeholder: 'Cost, Weight, Hours…' }),
          field('Limit', d.limit, (v) => { d.limit = v; ch(); }, { num: true, placeholder: 'e.g. 15' }),
          field('Pick at most', d.maxCount, (v) => { d.maxCount = v; ch(); }, { num: true, placeholder: 'any number', hint: 'optional' })),
        sec('What can you pick?', 'Nadir answers yes or no for each item.', holder)
      ];
    },
    blend(d, ch) {
      let needT;
      const ingT = table({
        rows: d.items, blank: () => ({ name: '', value: '', max: '' }), addLabel: 'Add an ingredient', onChange: ch, onNames: () => needT.redraw(),
        cols: [{ key: 'name', label: 'Ingredient', placeholder: 'e.g. Oats' }, { key: 'value', label: 'Cost per unit', num: true, placeholder: '0' }, { key: 'max', label: 'At most', num: true, placeholder: 'no limit' }]
      });
      const needCols = () => [{ key: 'name', label: 'Requirement', placeholder: 'e.g. Protein' }, { key: 'min', label: 'At least', num: true, placeholder: '—' }, { key: 'max', label: 'At most', num: true, placeholder: '—' }].concat(names(d.items).map((n, i) => ({ label: `in 1 ${n}`, num: true, placeholder: '0', get: (r) => (r.use || [])[i], set: (r, v) => { r.use = r.use || []; r.use[i] = v; } })));
      const needOpts = { rows: d.needs, blank: () => ({ name: '', min: '', max: '', use: [] }), addLabel: 'Add a requirement', onChange: ch };
      needT = { el: h('div'), redraw() { this.el.replaceChildren(table(Object.assign({}, needOpts, { cols: needCols() })).el); } };
      needT.redraw();
      return [
        sec('What can go in?', 'Ingredients and what one unit of each costs.', ingT.el),
        sec('What must the mix meet?', 'Fill “at least”, “at most”, or both — and how much each ingredient contributes.', needT.el),
        h('div', { class: 'wz-row' }, field('Total amount (exactly)', d.totalAmount, (v) => { d.totalAmount = v; ch(); }, { num: true, placeholder: 'any', hint: 'optional' }))
      ];
    },
    assign(d, ch) {
      const m = matrix({ rowsList: d.rowsList, colsList: d.colsList, data: d.matrix, onChange: ch, label: '' });
      const redraw = () => m.redraw();
      const a = table({ rows: d.rowsList, blank: () => ({ name: '' }), addLabel: 'Add a person', onChange: () => { ch(); }, onNames: redraw, cols: [{ key: 'name', label: 'People', placeholder: 'e.g. Ana' }] });
      const b = table({ rows: d.colsList, blank: () => ({ name: '' }), addLabel: 'Add a task', onChange: () => { ch(); }, onNames: redraw, cols: [{ key: 'name', label: 'Tasks', placeholder: 'e.g. Cook' }] });
      return [
        h('div', { class: 'wz-two' }, a.el, b.el),
        h('div', { class: 'wz-row' },
          field('What does each pairing cost?', d.cellLabel, (v) => { d.cellLabel = v; ch(); }, { placeholder: 'Minutes, Cost…' }),
          check('Higher is better', d.maximize, (v) => { d.maximize = v; ch(); }, 'Tick if the numbers are scores to maximize')),
        sec('Fill in the table', 'Each cell: what it takes for that person to do that task.', m.el)
      ];
    },
    ship(d, ch) {
      const m = matrix({ rowsList: d.rowsList, colsList: d.colsList, data: d.matrix, onChange: ch, label: 'Cost per unit' });
      const a = table({ rows: d.rowsList, blank: () => ({ name: '', value: '' }), addLabel: 'Add a source', onChange: ch, onNames: () => m.redraw(), cols: [{ key: 'name', label: 'From', placeholder: 'e.g. Plant A' }, { key: 'value', label: 'Supply', num: true, placeholder: '0' }] });
      const b = table({ rows: d.colsList, blank: () => ({ name: '', value: '' }), addLabel: 'Add a destination', onChange: ch, onNames: () => m.redraw(), cols: [{ key: 'name', label: 'To', placeholder: 'e.g. Store 1' }, { key: 'value', label: 'Demand', num: true, placeholder: '0' }] });
      return [
        h('div', { class: 'wz-two' }, a.el, b.el),
        sec('Shipping costs', 'Cost to send one unit along each route.', m.el),
        check('Only whole units', d.whole, (v) => { d.whole = v; ch(); })
      ];
    }
  };

  function open(startKey) {
    let kind = null, data = null, nameVal = '';
    const body = h('div', { class: 'wz' });
    const dlg = O.dialog({ title: 'Guided setup', body, size: 'lg', className: 'wizard-dialog' });
    const steps = h('ol', { class: 'wz-steps', 'aria-hidden': 'true' });
    const setStep = (i) => { steps.innerHTML = ['Situation', 'Your numbers', 'Solve'].map((t, k) => `<li class="${k < i ? 'is-done' : k === i ? 'is-on' : ''}"><span>${k < i ? icon('check', 'icon-xs') : k + 1}</span>${t}</li>`).join(''); };
    dlg.el.querySelector('.dialog-head h2').after(steps);

    function choose() {
      setStep(0);
      const grid = h('div', { class: 'wz-kinds' });
      KINDS.forEach((k, i) => {
        const b = h('button', { class: 'wz-kind', type: 'button', style: { '--i': i } });
        b.innerHTML = `<span class="wz-kind-ic">${icon(k.icon)}</span><strong>${esc(k.title)}</strong><span>${esc(k.blurb)}</span><em>${esc(k.eg)}</em>`;
        b.addEventListener('click', () => form(k));
        grid.append(b);
      });
      body.replaceChildren(h('p', { class: 'wz-lead' }, 'Which sounds most like your situation? You can change everything afterwards.'), grid);
      requestAnimationFrame(() => { const f = grid.querySelector('button'); if (f) f.focus(); });
    }

    function form(k, useEmpty) {
      setStep(1);
      kind = k;
      data = clone(useEmpty ? k.empty : k.example);
      nameVal = nameVal && !KINDS.some((x) => x.defaultName === nameVal) ? nameVal : k.defaultName;
      const status = h('div', { class: 'wz-status', 'aria-live': 'polite' });
      const create = h('button', { class: 'btn btn-primary', type: 'button', html: icon('play', 'icon-sm') + 'Create & solve' });
      const back = h('button', { class: 'btn btn-ghost', type: 'button', html: icon('arrowLeft', 'icon-sm') + 'Back' });
      back.addEventListener('click', choose);
      const swap = h('button', { class: 'btn btn-ghost btn-sm wz-swap', type: 'button', html: useEmpty ? icon('restore', 'icon-xs') + 'Show the example again' : icon('x', 'icon-xs') + 'Clear the example' });
      swap.addEventListener('click', () => form(k, !useEmpty));
      const update = debounce(() => {
        const b = E.buildFromRecipe(k.key, data, { name: nameVal });
        create.disabled = !b.model || b.problems.length > 0;
        if (b.problems.length) {
          status.className = 'wz-status is-todo';
          status.innerHTML = `<strong>${icon('info', 'icon-xs')}Still to fill in</strong><ul>${b.problems.slice(0, 5).map((p) => `<li>${esc(p)}</li>`).join('')}${b.problems.length > 5 ? `<li>…and ${b.problems.length - 5} more</li>` : ''}</ul>`;
        } else {
          const m = b.model;
          const goal = E.explainGoal(m.goal, { labels: {} });
          status.className = 'wz-status is-ok';
          status.innerHTML = `<strong>${icon('check', 'icon-xs')}Ready — Nadir will:</strong><ul><li>${esc(sayGoal(k.key, data))}</li><li>${esc(m.constraints.length)} ${m.constraints.length === 1 ? 'limit' : 'limits'}: ${esc(m.constraints.map((c) => c.label).join(', ') || 'none')}</li></ul>${goal ? `<p class="wz-formula">As a formula: <span class="mono">${esc(m.goal.expr)}</span></p>` : ''}`;
        }
      }, 120);
      create.addEventListener('click', () => {
        const b = E.buildFromRecipe(k.key, data, { name: nameVal, notes: k.blurb });
        if (!b.model || b.problems.length) return;
        apply(b.model);
      });
      const top = h('div', { class: 'wz-top' }, h('span', { class: 'wz-kind-ic sm', html: icon(k.icon) }), h('div', { class: 'wz-top-t' }, h('strong', null, k.title), h('span', null, useEmpty ? 'Fill in your own numbers.' : 'Here’s a worked example — change it to your numbers.')), swap);
      const nm = field('Name your model', nameVal, (v) => { nameVal = v; }, { placeholder: k.defaultName, wide: true });
      body.replaceChildren(top, nm, ...FORMS[k.key](data, update), status, h('div', { class: 'wz-foot' }, back, create));
      update.flush();
    }

    function apply(model) {
      dlg.close();
      S.replace(model);
      S.saveUI({ goalView: 'form', toured: true });
      if (S.ui.goalView === 'text' && N.App) N.App.goal.setView('form');
      N.Live.flush();
      setTimeout(() => N.Solve.run(), 80);
      N.toast('Model created — every card on the left is now filled in and editable', { kind: 'ok', duration: 4200 });
    }

    if (startKey && KINDS.find((x) => x.key === startKey)) form(KINDS.find((x) => x.key === startKey));
    else choose();
    return dlg;
  }

  function sayGoal(key, d) {
    const L = (rows) => names(rows).join(', ');
    switch (key) {
      case 'produce': return `Choose how many ${L(d.items)} to make for the most profit`;
      case 'budget': return `Split ${d.total || 'the budget'} across ${L(d.channels)} for the biggest return`;
      case 'pick': return `Pick from ${L(d.items)} for the most value, keeping ${String(d.costLabel || 'cost').toLowerCase()} within ${d.limit || 'the limit'}`;
      case 'blend': return `Find the cheapest amounts of ${L(d.items)}`;
      case 'assign': return `Match ${L(d.rowsList)} to ${L(d.colsList)} for the ${d.maximize ? 'highest' : 'lowest'} total ${String(d.cellLabel || 'cost').toLowerCase()}`;
      case 'ship': return `Ship from ${L(d.rowsList)} to ${L(d.colsList)} at the lowest cost`;
      default: return '';
    }
  }

  const QuickFix = {
    addNumber(name) { if (!N.App) return; N.App.given.add({ name, expr: '', slider: null }, { focusValue: true }); N.toast(`Added “${name}” to Numbers — type its value`, { kind: 'info' }); },
    addDecision(name) { if (!N.App) return; N.App.decide.add(name, { quiet: true }); N.toast(`Added “${name}” as a decision`, { kind: 'ok' }); }
  };

  N.Wizard = { open, kinds: KINDS };
  N.QuickFix = QuickFix;
})(window.Nadir);
