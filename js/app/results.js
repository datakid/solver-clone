(function (N) {
  'use strict';
  const { h, icon, esc, fmt, keys, LOGO, VALLEY, plural, joinWords, countUp } = N.util;
  const S = N.Store;
  const E = window.Engine;

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawChart(canvas, series, opts) {
    const o = opts || {};
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, ht = canvas.clientHeight;
    if (!w || !ht) return;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(ht * dpr)) canvas.height = Math.round(ht * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    const pts = series.filter((p) => Number.isFinite(p[1]) && Number.isFinite(p[0]));
    if (!pts.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 === x0) { x0 -= 1; x1 += 1; }
    if (y1 === y0) { const d = Math.abs(y0) * 0.1 || 1; y0 -= d; y1 += d; }
    const padY = (y1 - y0) * 0.14;
    y0 -= padY; y1 += padY;
    const L = o.left || 10, R = 12, T = 12, B = o.bottom || 12;
    const X = (x) => L + (x - x0) / (x1 - x0) * (w - L - R);
    const Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (ht - T - B);
    g.strokeStyle = cssVar('--border');
    g.lineWidth = 1;
    g.setLineDash([2, 4]);
    for (let k = 1; k < 4; k++) { const yy = Math.round(T + k * (ht - T - B) / 4) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(w - R, yy); g.stroke(); }
    g.setLineDash([]);
    const accent = cssVar('--accent');
    const trace = () => { g.beginPath(); pts.forEach(([x, y], i) => { const px = X(x), py = Y(y); if (i) { if (o.step) g.lineTo(px, Y(pts[i - 1][1])); g.lineTo(px, py); } else g.moveTo(px, py); }); };
    trace();
    const grad = g.createLinearGradient(0, T, 0, ht - B);
    grad.addColorStop(0, cssVar('--accent-soft'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.lineTo(X(pts[pts.length - 1][0]), ht - B); g.lineTo(X(pts[0][0]), ht - B); g.closePath();
    g.globalAlpha = 0.85; g.fillStyle = grad; g.fill();
    g.restore();
    trace();
    g.strokeStyle = accent; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
    if (o.dots) {
      g.fillStyle = accent;
      for (const [x, y] of pts) { g.beginPath(); g.arc(X(x), Y(y), 2.5, 0, Math.PI * 2); g.fill(); }
    }
    const mark = o.mark != null ? pts[o.mark < 0 ? pts.length + o.mark : o.mark] : pts[pts.length - 1];
    if (mark) {
      g.beginPath(); g.arc(X(mark[0]), Y(mark[1]), 7, 0, Math.PI * 2); g.fillStyle = cssVar('--found-soft'); g.fill();
      g.beginPath(); g.arc(X(mark[0]), Y(mark[1]), 4, 0, Math.PI * 2); g.fillStyle = cssVar('--found'); g.fill();
    }
    if (o.axes) {
      g.fillStyle = cssVar('--text-3'); g.font = '11px ' + cssVar('--font');
      g.textAlign = 'left'; g.fillText(fmt(y1 - padY), 6, T + 9);
      g.fillText(fmt(y0 + padY), 6, ht - B - 3);
    }
  }

  const STATUS = {
    optimal: { word: 'Optimal', cls: 'st-optimal', say: 'Best possible answer' },
    feasible: { word: 'Feasible', cls: 'st-feasible', say: 'A good answer — maybe not the very best' },
    infeasible: { word: 'Infeasible', cls: 'st-infeasible', say: 'The rules contradict each other' },
    unbounded: { word: 'Unbounded', cls: 'st-unbounded', say: 'Nothing stops the goal' },
    stopped: { word: 'Stopped', cls: 'st-stopped', say: 'Stopped early' },
    error: { word: 'Error', cls: 'st-error', say: 'Could not solve' },
    running: { word: 'Solving', cls: 'st-running', say: 'Searching…' }
  };

  const TEMPLATE_ICON = (t) => t.icon || 'layers';

  function ResultsPanel(root) {
    const card = h('section', { class: 'card', id: 'results-card', 'aria-label': 'Results', 'aria-live': 'polite' });
    const handle = h('button', { class: 'sheet-handle', type: 'button', 'aria-label': 'Toggle results' });
    handle.addEventListener('click', () => root.classList.toggle('is-open'));
    const body = h('div', { class: 'res-body' });
    card.append(handle, h('div', { class: 'print-title' }, ''), body);
    root.append(card);
    let chart = null, chartMeta = null, liveStatus = null, showAllVars = false, showAllRows = false, emptyKind = '', animated = null;

    function welcome() {
      const box = h('div', { class: 'res-empty res-welcome' });
      box.innerHTML = `<div class="welcome-art">${VALLEY}</div>` +
        `<h3>Find the best decision</h3>` +
        `<p>Tell Nadir what you want, what you can change and what limits you. It works out the best answer — right here in your browser.</p>`;
      const steps = h('ol', { class: 'welcome-steps' });
      [['target', 'Goal', 'What do you want more or less of?'], ['sliders', 'Decide', 'Which numbers can you choose?'], ['scale', 'Subject to', 'What rules must the answer follow?']].forEach(([ic, t, d], i) => {
        steps.append(h('li', { html: `<span class="welcome-step-n">${i + 1}</span><span class="welcome-step-ic">${icon(ic, 'icon-sm')}</span><span><strong>${esc(t)}</strong><span>${esc(d)}</span></span>` }));
      });
      const ctas = h('div', { class: 'welcome-ctas' });
      const tour = h('button', { class: 'btn btn-primary', type: 'button', html: icon('compass', 'icon-sm') + 'Take the 1-minute tour' });
      tour.addEventListener('click', () => N.Tour.start());
      const guide = h('button', { class: 'btn btn-outline', type: 'button', html: icon('book', 'icon-sm') + 'Language guide' });
      guide.addEventListener('click', () => N.Help.guide());
      ctas.append(tour, guide);
      box.append(steps, ctas, h('div', { class: 'welcome-divider' }, h('span', null, 'or start from an example')));
      const grid = h('div', { class: 'template-grid' });
      N.Templates.list.slice(0, 6).forEach((t, i) => {
        const b = h('button', { class: 'template-card', type: 'button', style: { '--i': i } });
        b.innerHTML = `<span class="template-ic">${icon(TEMPLATE_ICON(t), 'icon-sm')}</span><strong>${esc(t.name)}<span class="chip">${esc(t.kind)}</span></strong><span>${esc(t.blurb || t.note[0])}</span>`;
        b.addEventListener('click', () => N.Templates.open(t.key));
        grid.append(b);
      });
      box.append(grid);
      const more = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: 'All templates' + icon('arrowRight', 'icon-xs') });
      more.addEventListener('click', () => N.Drawer.open('templates'));
      box.append(more);
      return box;
    }

    function readiness() {
      const L = S.live;
      const e = L ? L.errors : { vars: {}, rules: {}, params: {} };
      const m = S.model;
      const box = h('div', { class: 'res-empty res-ready' });
      const errs = L ? L.errorCount : 0;
      const goalBlank = E.isBlank(m.goal.expr);
      const goalOk = !goalBlank && !e.goal && !(m.goal.sense === 'target' && (e.target || String(m.goal.target == null ? '' : m.goal.target).trim() === ''));
      const nV = m.variables.length, nR = m.constraints.length;
      const varErr = Object.keys(e.vars || {}).length;
      const items = [];
      if (goalOk) items.push({ st: 'ok', t: m.goal.sense === 'target' ? 'Goal: hit a target' : `Goal: ${m.goal.sense === 'min' ? 'make it small' : 'make it big'}`, d: explainGoal() });
      else if (goalBlank && nR) items.push({ st: 'warn', t: 'No goal yet', d: 'Nadir will just find any answer that fits the rules.', act: ['Write a goal', () => N.App.goal.focus()] });
      else items.push({ st: 'todo', t: 'Write a goal', d: 'What should be as big — or as small — as possible?', act: ['Write it', () => N.App.goal.focus()] });
      if (nV && !varErr) {
        const C = S.compiled;
        const n = C ? C.n : nV;
        items.push({ st: 'ok', t: `${plural(nV, 'decision')}`, d: n !== nV ? `${fmt(n)} numbers for Nadir to choose` : 'The numbers Nadir will choose' });
      } else if (nV) items.push({ st: 'bad', t: `${plural(varErr, 'decision')} to fix`, d: 'Check the highlighted names and ranges.', act: ['Show me', () => N.Solve.focusFirstError()] });
      else items.push({ st: 'todo', t: 'Add a decision', d: 'Something Nadir can change — a quantity, a price, a yes/no.', act: ['Add', () => N.App.decide.add()] });
      if (nR) items.push({ st: 'ok', t: plural(nR, 'rule'), d: 'Limits the answer must respect' });
      else items.push({ st: 'opt', t: 'No rules yet', d: 'Optional — without rules only the ranges limit the answer.', act: ['Add a rule', () => N.App.rules.add()] });
      if (errs) items.push({ st: 'bad', t: `${plural(errs, 'line')} to fix`, d: 'The red underline shows exactly where.', act: ['Show me', () => N.Solve.focusFirstError()] });
      const ready = !errs && nV > 0 && (goalOk || (goalBlank && nR > 0));
      box.innerHTML = `<div class="res-empty-mark${ready ? ' is-ready' : ''}">${LOGO}</div><h3>${ready ? 'Ready to solve' : 'Almost there'}</h3>` +
        `<p>${ready ? `Press ${keys('Mod+Enter')} or the Solve button — Nadir picks the right method for you.` : 'A few things before Nadir can solve:'}</p>`;
      const list = h('ul', { class: 'ready-list' });
      items.forEach((it) => {
        const li = h('li', { class: 'ready-item is-' + it.st });
        const ic = { ok: 'check', warn: 'info', todo: 'dot', opt: 'dot', bad: 'alert' }[it.st];
        li.innerHTML = `<span class="ready-ic">${icon(ic, 'icon-xs')}</span><span class="ready-txt"><strong>${esc(it.t)}</strong>${it.d ? `<span>${esc(it.d)}</span>` : ''}</span>`;
        if (it.act) {
          const b = h('button', { class: 'btn btn-soft btn-sm', type: 'button' }, it.act[0]);
          b.addEventListener('click', it.act[1]);
          li.append(b);
        }
        list.append(li);
      });
      box.append(list);
      const cls = L && L.cls;
      if (ready && cls && cls.label) {
        const kind = cls.linear ? (cls.hasInt ? 'linear with whole numbers' : 'linear') : cls.nonsmooth ? 'nonsmooth' : 'smooth and nonlinear';
        box.append(h('p', { class: 'ready-engine', html: `${icon(cls.linear ? 'layers' : cls.nonsmooth ? 'activity' : 'function', 'icon-xs')}Your model is ${esc(kind)} — Nadir will use <strong>${esc(cls.label)}</strong>.` }));
      }
      if (ready) {
        const go = h('button', { class: 'btn btn-primary btn-lg', type: 'button', html: icon('play', 'icon-sm') + 'Solve now' });
        go.addEventListener('click', () => N.Solve.run());
        box.append(go);
      }
      return box;
    }

    function explainGoal() {
      if (!S.settings.explain) return '';
      return E.explainGoal(S.model.goal, { labels: S.labelMap() }) || '';
    }

    function empty() {
      root.classList.add('is-empty');
      const blank = S.isBlank();
      const box = blank ? welcome() : readiness();
      emptyKind = blank ? 'welcome' : 'ready';
      body.replaceChildren(box);
      chart = null;
    }

    function statusLine(r, running) {
      const st = STATUS[running ? 'running' : r.status] || STATUS.error;
      const el = h('div', { class: 'res-status ' + st.cls });
      const meta = h('span', { class: 'muted res-meta' });
      el.append(h('span', { class: 'status-badge' }, h('span', { class: 'dot' }), h('strong', null, st.word)), h('span', { class: 'status-say' }, st.say), meta);
      return { el, meta };
    }

    function metaText(r) {
      const bits = [];
      if (r.engineLabel) bits.push(r.engineLabel);
      if (r.ms != null) bits.push(r.ms < 1 ? '<1 ms' : r.ms < 1000 ? `${Math.round(r.ms)} ms` : `${(r.ms / 1000).toFixed(r.ms < 10000 ? 2 : 1)} s`);
      if (r.engine === 'simplex' && r.pivots != null) bits.push(`${fmt(r.pivots)} ${r.pivots === 1 ? 'pivot' : 'pivots'}`);
      if (r.engine === 'bb' && r.nodes != null) bits.push(`${fmt(r.nodes)} nodes`);
      if (r.engine === 'alm' && r.starts) bits.push(`${r.starts} ${r.starts === 1 ? 'start' : 'starts'}`);
      if (r.engine === 'de' && r.generations) bits.push(`${fmt(r.generations)} generations`);
      if (r.gap) bits.push(`gap ${fmt(r.gap * 100)}%`);
      return bits.join(' · ');
    }

    function valueLabel(v, i) {
      const nm = E.elementName(v, i);
      const br = nm.indexOf('[');
      if (br < 0) return esc(nm);
      return esc(nm.slice(0, br)) + '<span class="lbl">' + esc(nm.slice(br)) + '</span>';
    }

    function friendlyName(v, i) {
      if (v.shape.length === 1 && v.labels && v.labels[i]) return v.labels[i];
      return E.elementName(v, i);
    }

    function ruleNames() {
      return new Map(S.model.constraints.map((c, i) => [c.id, c.label.trim() || `Rule ${i + 1}`]));
    }

    function story(r) {
      if (!S.settings.explain) return null;
      if (!(r.status === 'optimal' || r.status === 'feasible') || !r.values) return null;
      const sense = r.sense || S.model.goal.sense;
      const sec = h('section', { class: 'res-story' });
      sec.append(h('header', null, h('span', { class: 'story-ic', html: icon('sparkle', 'icon-sm') }), h('h3', null, 'In plain words')));
      const P = [];
      const nz = [];
      let total = 0;
      r.layout.forEach((v) => { for (let i = 0; i < v.size; i++) { total++; const x = r.values[v.offset + i]; if (Math.abs(x) > 1e-9) nz.push([v, i, x]); } });
      if (!nz.length) P.push('The best plan keeps <strong>every decision at zero</strong>.');
      else {
        const shown = nz.slice(0, 4).map(([v, i, x]) => `<span class="story-pair"><span>${esc(friendlyName(v, i))}</span> <strong class="num">${esc(fmt(x))}</strong></span>`);
        const rest = nz.length - shown.length;
        const zeros = total - nz.length;
        P.push(`The best plan: ${joinWords(shown)}${rest > 0 ? `, plus ${plural(rest, 'other value')}` : ''}.${zeros > 0 && total <= 60 ? ` ${zeros === 1 ? 'One value stays' : `The other ${fmt(zeros)} stay`} at zero.` : ''}`);
      }
      if (r.objective != null && Number.isFinite(r.objective)) {
        let g;
        if (sense === 'target') g = r.targetMiss ? `That gets the goal to <strong class="num">${esc(fmt(r.objective))}</strong>, ${esc(fmt(r.targetMiss))} away from the target of ${esc(fmt(r.target))}.` : `That hits the target of <strong class="num">${esc(fmt(r.target))}</strong> exactly.`;
        else {
          g = `That gives a ${sense === 'min' ? 'minimum' : 'maximum'} of <strong class="num">${esc(fmt(r.objective))}</strong>`;
          const b = S.baseline && S.baseline.goal;
          if (Number.isFinite(b) && Math.abs(r.objective - b) > 1e-9 * Math.max(1, Math.abs(b))) {
            const better = sense === 'max' ? r.objective > b : r.objective < b;
            g += better ? `, ${esc(fmt(Math.abs(r.objective - b)))} ${sense === 'max' ? 'more' : 'less'} than your starting values` : '';
          }
          g += '.';
        }
        P.push(g);
      }
      const names = ruleNames();
      const enabled = new Set(S.model.constraints.filter((c) => c.enabled !== false).map((c) => c.id));
      const bind = [];
      const seen = new Set();
      (r.constraints || []).forEach((c) => { if (c.binding && c.ok && c.op !== '=' && enabled.has(c.id) && !seen.has(c.id)) { seen.add(c.id); bind.push(c.id); } });
      const onlyEq = (r.constraints || []).length > 0 && (r.constraints || []).every((c) => c.op === '=');
      if (enabled.size) {
        if (bind.length) {
          const nm = bind.slice(0, 4).map((id) => `<strong>${esc(names.get(id) || 'a rule')}</strong>`);
          P.push(`What holds you back: ${joinWords(nm)}${bind.length > 4 ? ` and ${fmt(bind.length - 4)} more` : ''} ${bind.length === 1 ? 'is' : 'are'} right at the limit.`);
        } else if (!onlyEq) P.push('No limit rule is tight — the ranges on your decisions set the answer.');
      }
      if (r.engine === 'simplex' && r.constraints && sense !== 'target') {
        let best = null;
        r.constraints.forEach((c) => { if (c.dual != null && Math.abs(c.dual) > 1e-9 && enabled.has(c.id) && (!best || Math.abs(c.dual) > Math.abs(best.dual))) best = c; });
        if (best) {
          const nm = names.get(best.id) || best.label;
          const amt = esc(fmt(Math.abs(best.dual)));
          P.push(best.op === '='
            ? `Biggest lever: changing <strong>${esc(nm)}</strong> by one unit moves the goal by about <strong class="num">${amt}</strong>.`
            : `Biggest lever: one more unit of room in <strong>${esc(nm)}</strong> would ${sense === 'min' ? 'cut' : 'add'} about <strong class="num">${amt}</strong> ${sense === 'min' ? 'from' : 'to'} the goal.`);
        }
      }
      if (r.engine === 'alm') P.push(`<span class="faint">Nonlinear models can have more than one valley; Nadir compared ${plural(r.starts || 1, 'starting point')} and kept the best.</span>`);
      if (r.engine === 'de') P.push(`<span class="faint">Found by an evolutionary search over ${plural(r.generations || 0, 'generation')}${r.polished ? ', then polished' : ''}.</span>`);
      if (r.engine === 'bb' && r.status === 'feasible' && r.gap) P.push(`<span class="faint">Stopped within ${esc(fmt(r.gap * 100))}% of the best possible — close enough under the current settings.</span>`);
      const p = h('div', { class: 'story-text' });
      p.innerHTML = P.map((x) => `<p>${x}</p>`).join('');
      sec.append(p);
      return sec;
    }

    function decisions(r) {
      const sec = h('section', { class: 'res-section' });
      const adv = S.ui.showAdvancedResults;
      const head = h('header', null, h('h3', { class: 'label-caps' }, 'Decisions'));
      const advBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-pressed': String(adv), 'data-tip': 'Show reduced costs and shadow prices' }, 'Advanced');
      advBtn.addEventListener('click', () => { S.saveUI({ showAdvancedResults: !S.ui.showAdvancedResults }); render(); });
      head.append(advBtn);
      sec.append(head);
      const tbl = h('table', { class: 'res-table' });
      const hasRC = adv && r.reducedCosts;
      tbl.innerHTML = `<thead><tr><th>Name</th><th class="num">Value</th><th class="num" style="width:80px"><span class="sr-only">Position in bounds</span></th>${hasRC ? '<th class="num" data-tip="How much the goal would worsen per unit if forced up">Reduced cost</th>' : ''}</tr></thead>`;
      const tb = h('tbody');
      let count = 0;
      const LIMIT = 40;
      const total = r.values.length;
      const nonzeroFirst = total > LIMIT && !showAllVars;
      const order = [];
      r.layout.forEach((v) => { for (let i = 0; i < v.size; i++) order.push([v, i]); });
      const list = nonzeroFirst ? order.filter(([v, i]) => Math.abs(r.values[v.offset + i]) > 1e-9) : order;
      for (const [v, i] of list) {
        if (!showAllVars && count >= LIMIT) break;
        const j = v.offset + i;
        const x = r.values[j];
        const lo = r.bounds.lower[j], hi = r.bounds.upper[j];
        let bar = '';
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
          const p = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
          const edge = p < 1e-6 || p > 1 - 1e-6;
          bar = `<span class="bound-bar${edge ? ' is-edge' : ''}" data-tip="${esc(fmt(lo))} … ${esc(fmt(hi))}"><b style="width:${(p * 100).toFixed(1)}%"></b><i style="left:${(p * 100).toFixed(1)}%"></i></span>`;
        } else if (Number.isFinite(lo) || Number.isFinite(hi)) {
          const atEdge = Math.abs(x - (Number.isFinite(lo) ? lo : hi)) < 1e-9;
          bar = `<span class="bound-bar is-open${atEdge ? ' is-edge' : ''}" data-tip="${Number.isFinite(lo) ? '≥ ' + esc(fmt(lo)) : '≤ ' + esc(fmt(hi))}"><i style="left:${Number.isFinite(lo) ? (atEdge ? 0 : 50) : (atEdge ? 100 : 50)}%"></i></span>`;
        }
        const tr = h('tr', { class: 'is-link' + (Math.abs(x) < 1e-9 ? ' is-zero' : ''), dataset: { var: v.id } });
        tr.innerHTML = `<td class="nm">${valueLabel(v, i)}</td><td class="num keep">${esc(fmt(x))}</td><td class="num">${bar}</td>${hasRC ? `<td class="num">${esc(fmt(r.reducedCosts[j]))}</td>` : ''}`;
        tr.addEventListener('click', () => N.App.decide.focusRow(v.id));
        tb.append(tr);
        count++;
      }
      tbl.append(tb);
      sec.append(h('div', { class: 'table-wrap' }, tbl));
      const hidden = total - count;
      if (hidden > 0) {
        const m = h('div', { class: 'more-rows' }, nonzeroFirst && !showAllVars ? `Showing ${fmt(count)} nonzero of ${fmt(total)}` : `${fmt(hidden)} more`);
        const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Show all');
        b.addEventListener('click', () => { showAllVars = true; render(); });
        m.append(b);
        sec.append(m);
      }
      return sec;
    }

    function rules(r) {
      if (!r.constraints || !r.constraints.length) return null;
      const adv = S.ui.showAdvancedResults;
      const hasDual = adv && r.constraints.some((c) => c.dual != null);
      const sec = h('section', { class: 'res-section' });
      sec.append(h('header', null, h('h3', { class: 'label-caps' }, 'Rules')));
      const tbl = h('table', { class: 'res-table' });
      tbl.innerHTML = `<thead><tr><th>Rule</th><th class="num" data-tip="Left-hand side at the answer">LHS</th><th class="num" data-tip="Right-hand side at the answer">RHS</th><th class="num" data-tip="Room left before the rule bites">Slack</th><th><span class="sr-only">State</span></th>${hasDual ? '<th class="num" data-tip="Change in goal per unit of RHS">Shadow</th>' : ''}</tr></thead>`;
      const tb = h('tbody');
      const LIMIT = 30;
      let list = r.constraints;
      if (list.length > LIMIT && !showAllRows) list = list.filter((c) => c.binding || !c.ok).slice(0, LIMIT);
      for (const c of list) {
        const tr = h('tr', { class: 'is-link' });
        const opSym = c.op === '<=' ? '≤' : c.op === '>=' ? '≥' : '=';
        const badge = !c.ok ? '<span class="badge-off">off</span>' : c.binding ? '<span class="badge-binding" data-tip="Binding — the rule is exactly at its limit">at limit</span>' : '';
        tr.innerHTML = `<td class="nm" title="${esc(opSym)}">${esc(c.label)}</td><td class="num">${esc(fmt(c.lhs))}</td><td class="num">${esc(fmt(c.rhs))}</td><td class="num">${c.op === '=' ? '' : esc(fmt(c.slack))}</td><td>${badge}</td>${hasDual ? `<td class="num">${c.dual == null ? '' : esc(fmt(c.dual))}</td>` : ''}`;
        tr.addEventListener('click', () => N.App.rules.focusRow(c.id));
        tb.append(tr);
      }
      tbl.append(tb);
      sec.append(h('div', { class: 'table-wrap' }, tbl));
      if (list.length < r.constraints.length) {
        const m = h('div', { class: 'more-rows' }, `Showing binding rules · ${fmt(r.constraints.length)} in total`);
        const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Show all');
        b.addEventListener('click', () => { showAllRows = true; render(); });
        m.append(b);
        sec.append(m);
      }
      return sec;
    }

    function diagnosis(r) {
      const d = r.diagnosis;
      const box = h('div', { class: 'diag-box', role: 'alert' });
      const byId = ruleNames();
      if (!d) { box.innerHTML = `<h4>${icon('alert', 'icon-sm')}No solution satisfies every rule</h4>`; return box; }
      if (d.kind === 'integer' || d.kind === 'bounds') {
        box.innerHTML = `<h4>${icon('alert', 'icon-sm')}No solution satisfies every rule</h4><p>${esc(d.message)}</p>`;
        return box;
      }
      const names = d.rules.map((id) => byId.get(id)).filter(Boolean);
      box.innerHTML = `<h4>${icon('alert', 'icon-sm')}${names.length > 1 ? "These rules can't all hold together" : names.length ? "This rule can't hold" : 'No solution satisfies every rule'}</h4>`;
      const p = h('p');
      p.textContent = names.length ? (names.length > 1 ? `${names.join(', ')}.` : `${names[0]}${d.withBounds === false ? ' together with the bounds on the decisions' : ''}.`) + (d.approximate ? ' Found by searching for the least-violating point.' : ' Relax any one of them to make the model solvable.') : 'Try relaxing a bound or a rule.';
      box.append(p);
      const chips = h('div', { class: 'diag-rules' });
      d.rules.forEach((id) => {
        if (!byId.has(id)) return;
        const b = h('button', { type: 'button', html: icon('arrowRight', 'icon-xs') + esc(byId.get(id)) });
        b.addEventListener('click', () => N.App.rules.focusRow(id));
        chips.append(b);
      });
      box.append(chips);
      return box;
    }

    function convergence(running, hist) {
      const sec = h('details', { class: 'res-section res-details' });
      if (running || S.ui.showChart) sec.open = true;
      const sum = h('summary', null, h('h3', { class: 'label-caps' }, 'How Nadir got there'), h('span', { class: 'faint res-details-sub' }, running ? 'live' : plural(hist.length, 'step')), h('span', { class: 'summary-chev', html: icon('chevronDown', 'icon-xs') }));
      const ch = h('div', { class: 'chart' });
      const cv = h('canvas', { role: 'img', 'aria-label': 'Objective by iteration' });
      ch.append(cv);
      chartMeta = h('div', { class: 'chart-meta' });
      sec.append(sum, ch, chartMeta);
      sec.addEventListener('toggle', () => { if (!S.running) S.saveUI({ showChart: sec.open }); if (sec.open) paintChart(); });
      chart = cv;
      return sec;
    }

    function render() {
      const r = S.result;
      const running = S.running;
      root.classList.toggle('is-empty', !r && !running);
      if (!r && !running) { empty(); return; }
      emptyKind = '';
      root.classList.remove('is-empty');
      const wrap = h('div', { class: 'res' + (S.stale && !running ? ' is-stale' : '') + (running ? ' is-running' : '') });
      const src = running ? (S.progress || {}) : r;
      const sl = statusLine(r || {}, running);
      liveStatus = sl;
      if (!running) {
        sl.meta.textContent = metaText(r);
        const copy = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Copy for Excel', 'data-tip': 'Copy for Excel', html: icon('copy', 'icon-sm') });
        copy.addEventListener('click', () => N.IO.copyForExcel());
        if (r.values) sl.el.append(copy);
      } else sl.meta.textContent = 'working…';
      wrap.append(sl.el);
      if (S.stale && !running) {
        const n = h('button', { class: 'stale-note', type: 'button', html: icon('info', 'icon-xs') + `<span>Model changed since this solve</span><span class="stale-cta">Refresh ${keys('Mod+Enter')}</span>` });
        n.addEventListener('click', () => N.Solve.run());
        wrap.append(n);
      }
      if (!running && r.status === 'error') {
        wrap.append(h('div', { class: 'error-box', html: icon('alert', 'icon-sm') + `<span>${esc(r.message || 'Something went wrong')}</span>` }));
        body.replaceChildren(wrap);
        return;
      }
      const showHero = running || (r.objective != null && Number.isFinite(r.objective));
      if (showHero) {
        const hero = h('div', { class: 'res-hero' + (!running && r.status === 'optimal' ? ' is-optimal' : '') });
        const sense = S.model.goal.sense;
        const label = h('div', { class: 'res-hero-label' }, running ? 'Best so far' : r.status === 'infeasible' ? 'Goal at least-violating point' : sense === 'target' ? 'Goal reached' : sense === 'min' ? 'Minimum' : 'Maximum');
        const val = h('div', { class: 'res-hero-value' });
        const num = h('span', { class: 'num' }, running ? (Number.isFinite(src.best) ? fmt(src.best) : '…') : fmt(r.objective));
        if (!running && (r.status === 'optimal' || r.status === 'feasible')) val.append(h('span', { class: 'found-dot', 'aria-hidden': 'true' }));
        val.append(num);
        hero.append(label, val);
        if (!running && animated !== r && !r.quiet) {
          animated = r;
          const b = S.baseline && Number.isFinite(S.baseline.goal) ? S.baseline.goal : 0;
          countUp(num, b, r.objective, 620);
          hero.classList.add('is-fresh');
        }
        if (!running && S.baseline && Number.isFinite(S.baseline.goal) && (r.status === 'optimal' || r.status === 'feasible')) {
          const b = S.baseline.goal, v = r.objective;
          const d = h('div', { class: 'res-delta' });
          if (sense === 'target') {
            d.textContent = r.targetMiss ? `${fmt(r.targetMiss)} from target ${fmt(r.target)}` : `Hits target ${fmt(r.target)}`;
          } else if (Math.abs(v - b) < 1e-9 * Math.max(1, Math.abs(b))) d.textContent = 'Same as current values';
          else {
            const better = sense === 'max' ? v > b : v < b;
            const pct = Math.abs(b) > 1e-12 ? ((v - b) / Math.abs(b)) * 100 : null;
            const txt = pct != null && Math.abs(pct) < 1e6 ? `${pct > 0 ? '+' : '−'}${fmt(Math.abs(pct), { decimals: Math.abs(pct) < 10 ? 1 : 0 })}%` : `${v > b ? '+' : '−'}${fmt(Math.abs(v - b))}`;
            d.innerHTML = `<span class="delta-chip ${better ? 'up' : 'down'}">${icon(v > b ? 'arrowUp' : 'arrowDown', 'icon-xs')}${esc(txt)}</span> vs current (${esc(fmt(b))})`;
          }
          hero.append(d);
        }
        if (running) liveStatus.num = num;
        wrap.append(hero);
      }
      if (!running && r.status === 'infeasible') wrap.append(diagnosis(r));
      if (!running && r.status === 'unbounded') {
        wrap.append(h('div', { class: 'diag-box', html: `<h4>${icon('alert', 'icon-sm')}The goal can grow without limit</h4><p>Add an upper bound on a decision or a rule that caps the goal.</p>` }));
      }
      if (!running && r.status === 'stopped') {
        wrap.append(h('div', { class: 'diag-box', html: `<h4>${icon('info', 'icon-sm')}Stopped before an answer</h4><p>${esc(r.message || 'The solve was interrupted. Try the Thorough preset or a longer time limit in Settings.')}</p>` }));
      }
      if (!running) { const st = story(r); if (st) wrap.append(st); }
      if (!running && r.values) wrap.append(decisions(r));
      if (!running && r.values && r.status !== 'infeasible') { const rs = rules(r); if (rs) wrap.append(rs); }
      const hist = running ? (N.Solve.liveHistory || []) : (r.history || []);
      if (running || hist.length > 1) wrap.append(convergence(running, hist));
      else chart = null;
      if (!running && r.values && r.status !== 'infeasible') {
        const acts = h('div', { class: 'res-actions' });
        const keep = h('button', { class: 'btn btn-soft', type: 'button', html: icon('pin', 'icon-sm') + 'Keep solution', 'data-tip': 'Use these values as the new starting point' });
        keep.addEventListener('click', () => N.Solve.keep());
        const restore = h('button', { class: 'btn btn-outline', type: 'button', html: icon('restore', 'icon-sm') + 'Restore', disabled: !S.kept, 'data-tip': 'Go back to the values before Keep' });
        restore.addEventListener('click', () => N.Solve.restore());
        const scen = h('button', { class: 'btn btn-outline', type: 'button', html: icon('bookmark', 'icon-sm') + 'Save scenario', 'data-tip': 'Remember this answer to compare later' });
        scen.addEventListener('click', () => N.Scenarios.saveCurrent());
        const xl = h('button', { class: 'btn btn-ghost', type: 'button', html: icon('table', 'icon-sm') + 'Copy for Excel' });
        xl.addEventListener('click', () => N.IO.copyForExcel());
        acts.append(keep, restore, scen, xl);
        wrap.append(acts);
      }
      body.replaceChildren(wrap);
      card.querySelector('.print-title').textContent = S.model.name;
      paintChart();
    }

    function paintChart() {
      if (!chart) return;
      const hist = S.running ? (N.Solve.liveHistory || []) : (S.result && S.result.history) || [];
      drawChart(chart, hist.map((y, i) => [i, y]), { step: S.result && (S.result.engine === 'bb' || S.result.engine === 'de') });
      if (chartMeta) {
        chartMeta.innerHTML = hist.length ? `<span>start ${esc(fmt(hist[0]))}</span><span>${esc(fmt(hist.length))} steps</span><span>best ${esc(fmt(hist[hist.length - 1]))}</span>` : '';
      }
    }

    function progress(p) {
      if (!liveStatus) return;
      if (liveStatus.num && Number.isFinite(p.best)) liveStatus.num.textContent = fmt(p.best);
      liveStatus.meta.textContent = `${p.ms < 1000 ? Math.round(p.ms) + ' ms' : (p.ms / 1000).toFixed(1) + ' s'} · iteration ${fmt(p.iter || 0)}${Number.isFinite(p.violation) && p.violation > 1e-6 ? ` · violation ${fmt(p.violation)}` : ''}`;
      paintChart();
    }

    let staleShown = false;
    const refreshEmpty = () => {
      if (S.result || S.running) return false;
      const want = S.isBlank() ? 'welcome' : 'ready';
      if (want === 'welcome' && emptyKind === 'welcome') return true;
      empty();
      return true;
    };
    S.on('result', () => { showAllVars = false; showAllRows = false; staleShown = S.stale; render(); });
    S.on('model', () => {
      if (refreshEmpty()) return;
      if (S.stale !== staleShown && !S.running) { staleShown = S.stale; render(); }
    });
    S.on('live', () => { refreshEmpty(); });
    S.on('settings', (p) => { if (p && 'explain' in p) { if (!refreshEmpty()) render(); } });
    S.on('progress', progress);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(paintChart, 80); });
    new MutationObserver(() => paintChart()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    render();
    return { render, drawChart };
  }

  N.Results = { ResultsPanel, drawChart };
})(window.Nadir);
