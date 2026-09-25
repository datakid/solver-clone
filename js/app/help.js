(function (N) {
  'use strict';
  const { h, icon, esc, fuzzy, markText, copyText } = N.util;
  const E = window.Engine;
  const O = N.Overlays;

  const BASICS = [
    { t: 'Numbers', d: 'Plain, decimal, scientific or percent.', ex: ['12', '3.5', '1e6', '7%'] },
    { t: 'Lists and tables', d: 'Square brackets make a list; a list of lists is a table. Ranges count up.', ex: ['[45, 80, 60]', '[[1, 2], [3, 4]]', '1..12'] },
    { t: 'Arithmetic', d: 'Works element by element; a single number spreads over a list. You can skip × before a name.', ex: ['price * qty', '2x + 3y', '100(y - x^2)'] },
    { t: 'Picking elements', d: 'Counting starts at 1. Use : for a whole row or column.', ex: ['make[3]', 'ship[1, 2]', 'x[2..4]', 'cost[:, 1]'] },
    { t: 'Rules', d: 'Compare two sides. A rule on a list becomes one rule per element. Chain for a range.', ex: ['sum(x) <= 100', 'rowsum(ship) = supply', '0 <= x - y <= 5'] },
    { t: 'Ranges on decisions', d: 'Blank lower bound means 0 (like Excel). Type -inf to allow negatives.', ex: ['0 ≤ x ≤ 10', '-inf ≤ a'] },
    { t: 'Comments', d: 'Anything after # is ignored.', ex: ['sum(x) <= 9  # weekly cap'] }
  ];

  const EXAMPLES = {
    sum: 'sum(profit * make)', prod: 'prod(1 + r)', mean: 'mean(scores)', min: 'min(a, b)', max: 'max(x)', len: 'len(x)',
    dot: 'dot(cost, qty)', quad: 'quad(w, cov)', sumsq: 'sumsq(fit - y)', norm: 'norm(x - p)', rowsum: 'rowsum(ship) <= supply',
    colsum: 'colsum(ship) >= demand', cumsum: 'cumsum(stock)', matmul: 'matmul(A, x) <= b', T: 'T(M)', rows: 'rows(M)', cols: 'cols(M)',
    ones: 'ones(3)', zeros: 'zeros(2, 3)', abs: 'abs(x - 5)', sqrt: 'sqrt(area)', exp: 'exp(-t / 4)', log: 'log(1 + spend)', ln: 'ln(x)',
    log10: 'log10(x)', sin: 'sin(angle)', cos: 'cos(angle)', tan: 'tan(angle)', pow: 'pow(x, 1.5)', round: 'round(x)', floor: 'floor(x)',
    ceil: 'ceil(x)', sign: 'sign(x)', if: 'if(x > 10, 5, 8)'
  };
  const GROUPS = [
    ['Totals & lists', ['sum', 'prod', 'mean', 'min', 'max', 'len', 'cumsum', 'ones', 'zeros']],
    ['Tables & vectors', ['dot', 'rowsum', 'colsum', 'matmul', 'T', 'rows', 'cols', 'quad', 'sumsq', 'norm']],
    ['Math', ['abs', 'sqrt', 'exp', 'log', 'ln', 'log10', 'pow', 'sin', 'cos', 'tan']],
    ['Rounding & logic', ['round', 'floor', 'ceil', 'sign', 'if']]
  ];

  function exChip(text) {
    const b = h('button', { class: 'ex-chip mono', type: 'button', 'data-tip': 'Copy', 'aria-label': 'Copy ' + text }, text);
    b.addEventListener('click', async () => { const ok = await copyText(text); N.toast(ok ? `Copied ${text}` : 'Copy failed', { kind: ok ? 'ok' : 'bad', duration: 1400 }); });
    return b;
  }

  function guide(focus) {
    const box = h('div', { class: 'guide' });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search functions — e.g. total, row, round', 'aria-label': 'Search functions' });
    const sb = h('div', { class: 'search-box', html: icon('search') });
    sb.append(search);
    const tabs = N.List.segmented([{ value: 'basics', label: 'Basics' }, { value: 'functions', label: 'Functions' }, { value: 'results', label: 'Reading results' }], focus || 'basics', (v) => show(v));
    tabs.el.classList.add('guide-tabs');
    const pane = h('div', { class: 'guide-pane' });
    box.append(tabs.el, pane);

    function basics() {
      const w = h('div', { class: 'guide-basics' });
      BASICS.forEach((b) => {
        const ex = h('div', { class: 'ex-row' });
        b.ex.forEach((x) => ex.append(exChip(x)));
        w.append(h('section', { class: 'guide-item' }, h('h4', null, b.t), h('p', null, b.d), ex));
      });
      return w;
    }
    function functions() {
      const w = h('div');
      const list = h('div', { class: 'fn-list' });
      w.append(sb, list);
      const render = () => {
        const q = search.value.trim();
        list.textContent = '';
        let any = false;
        GROUPS.forEach(([title, names]) => {
          const hits = names.map((n) => {
            const f = E.FUNCTIONS[n];
            if (!f) return null;
            const r = q ? fuzzy(q, n + ' ' + f.doc) : { score: 1 };
            const m = q ? fuzzy(q, n) : null;
            return r ? { n, f, marks: m ? m.marks : [] } : null;
          }).filter(Boolean);
          if (!hits.length) return;
          any = true;
          list.append(h('h4', { class: 'label-caps fn-group' }, title));
          hits.forEach(({ n, f, marks }) => {
            const row = h('div', { class: 'fn-row' });
            row.innerHTML = `<span class="fn-name mono">${markText(n, marks)}</span><span class="fn-doc">${esc(f.doc)}<span class="fn-sig mono">${esc(f.sig)}</span></span>`;
            row.append(exChip(EXAMPLES[n] || f.sig));
            list.append(row);
          });
        });
        if (!any) list.append(h('p', { class: 'empty-hint' }, 'No function matches. Constants: pi, e, inf.'));
      };
      search.oninput = render;
      render();
      setTimeout(() => search.focus(), 30);
      return w;
    }
    function results() {
      const w = h('div', { class: 'guide-basics' });
      const T = [
        ['Optimal', 'The best possible answer under your rules. Nothing better exists.', 'ok'],
        ['Feasible', 'A valid answer that follows every rule; the search stopped before proving it is the very best.', 'info'],
        ['Infeasible', 'The rules contradict each other. Nadir points at the smallest set of rules that clash.', 'bad'],
        ['Unbounded', 'Nothing stops the goal from growing forever — add a limit.', 'warn'],
        ['Binding / at limit', 'A rule the answer is pressed right up against. Loosen it and the goal can improve.', 'info'],
        ['Slack', 'How much room a rule still has before it starts to bite.', 'ok'],
        ['Shadow price', 'Under Advanced: how much the goal changes if a rule’s limit moves by one unit. The biggest lever.', 'muted'],
        ['Reduced cost', 'Under Advanced: how much worse the goal gets per unit if you force a zero decision up.', 'muted']
      ];
      T.forEach(([t, d, k]) => w.append(h('section', { class: 'guide-item guide-term' }, h('h4', null, h('span', { class: 'pill pill-' + k }, t)), h('p', null, d))));
      return w;
    }
    function show(v) { pane.replaceChildren(v === 'functions' ? functions() : v === 'results' ? results() : basics()); }
    show(focus || 'basics');
    return O.dialog({ title: 'Language guide', body: box, size: 'lg', className: 'guide-dialog' });
  }

  function menu(anchor) {
    return O.menu(anchor, [
      { label: 'Take the tour', icon: 'compass', run: () => N.Tour.start() },
      { label: 'Language guide', icon: 'book', run: () => guide() },
      { label: 'Function reference', icon: 'function', run: () => guide('functions') },
      { label: 'Reading the results', icon: 'info', run: () => guide('results') },
      '-',
      { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => N.App.shortcutSheet() },
      { label: 'Run test suite', icon: 'flask', run: () => N.App.runTests() }
    ], { align: 'right' });
  }

  N.Help = { guide, menu };
})(window.Nadir);
