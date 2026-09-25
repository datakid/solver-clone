(function (N) {
  'use strict';
  const { h, icon, esc, fmt, keys, LOGO } = N.util;
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
    const padY = (y1 - y0) * 0.12;
    y0 -= padY; y1 += padY;
    const L = o.left || 8, R = 10, T = 10, B = o.bottom || 10;
    const X = (x) => L + (x - x0) / (x1 - x0) * (w - L - R);
    const Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (ht - T - B);
    g.strokeStyle = cssVar('--border');
    g.lineWidth = 1;
    g.setLineDash([2, 3]);
    for (let k = 1; k < 4; k++) { const yy = Math.round(T + k * (ht - T - B) / 4) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(w - R, yy); g.stroke(); }
    g.setLineDash([]);
    const accent = cssVar('--accent');
    g.beginPath();
    pts.forEach(([x, y], i) => { const px = X(x), py = Y(y); if (i) { if (o.step) g.lineTo(px, Y(pts[i - 1][1])); g.lineTo(px, py); } else g.moveTo(px, py); });
    const grad = g.createLinearGradient(0, T, 0, ht - B);
    grad.addColorStop(0, cssVar('--accent-soft'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.lineTo(X(pts[pts.length - 1][0]), ht - B); g.lineTo(X(pts[0][0]), ht - B); g.closePath();
    g.globalAlpha = 0.7; g.fillStyle = grad; g.fill();
    g.restore();
    g.beginPath();
    pts.forEach(([x, y], i) => { const px = X(x), py = Y(y); if (i) { if (o.step) g.lineTo(px, Y(pts[i - 1][1])); g.lineTo(px, py); } else g.moveTo(px, py); });
    g.strokeStyle = accent; g.lineWidth = 1.5; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
    if (o.dots) {
      g.fillStyle = accent;
      for (const [x, y] of pts) { g.beginPath(); g.arc(X(x), Y(y), 2.25, 0, Math.PI * 2); g.fill(); }
    }
    const mark = o.mark != null ? pts[o.mark] : pts[pts.length - 1];
    if (mark) {
      g.beginPath(); g.arc(X(mark[0]), Y(mark[1]), 6, 0, Math.PI * 2); g.fillStyle = cssVar('--found-soft'); g.fill();
      g.beginPath(); g.arc(X(mark[0]), Y(mark[1]), 3.5, 0, Math.PI * 2); g.fillStyle = cssVar('--found'); g.fill();
    }
    if (o.axes) {
      g.fillStyle = cssVar('--text-3'); g.font = '11px ' + cssVar('--font');
      g.textAlign = 'left'; g.fillText(fmt(y1 - padY), 4, T + 8);
      g.fillText(fmt(y0 + padY), 4, ht - B - 2);
    }
  }

  const STATUS = {
    optimal: { word: 'Optimal', cls: 'st-optimal' },
    feasible: { word: 'Feasible', cls: 'st-feasible' },
    infeasible: { word: 'Infeasible', cls: 'st-infeasible' },
    unbounded: { word: 'Unbounded', cls: 'st-unbounded' },
    stopped: { word: 'Stopped', cls: 'st-stopped' },
    error: { word: 'Error', cls: 'st-error' },
    running: { word: 'Solving', cls: 'st-running' }
  };

  function ResultsPanel(root) {
    const card = h('section', { class: 'card', id: 'results-card', 'aria-label': 'Results', 'aria-live': 'polite' });
    const handle = h('button', { class: 'sheet-handle', type: 'button', 'aria-label': 'Toggle results' });
    handle.addEventListener('click', () => root.classList.toggle('is-open'));
    const body = h('div');
    card.append(handle, h('div', { class: 'print-title' }, ''), body);
    root.append(card);
    let chart = null, chartMeta = null, liveStatus = null, showAllVars = false, showAllRows = false;

    function empty() {
      root.classList.add('is-empty');
      const isEmpty = !S.model.variables.length && !S.model.constraints.length && E.isBlank(S.model.goal.expr);
      const box = h('div', { class: 'res-empty' });
      box.innerHTML = `<div class="res-empty-mark">${LOGO}</div><h3>${isEmpty ? 'Describe a decision' : 'Ready when you are'}</h3>` +
        `<p>${isEmpty ? 'Write a goal, the quantities to decide and the rules they follow — or start from a template.' : `Press ${keys('Mod+Enter')} to solve`}</p>`;
      if (isEmpty) {
        const grid = h('div', { class: 'template-grid' });
        N.Templates.list.slice(0, 6).forEach((t) => {
          const b = h('button', { class: 'template-card', type: 'button' });
          b.innerHTML = `<strong>${esc(t.name)}<span class="chip">${esc(t.kind)}</span></strong><span>${esc(t.note[0])}</span>`;
          b.addEventListener('click', () => N.Templates.open(t.key));
          grid.append(b);
        });
        box.append(grid);
        const more = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'All templates');
        more.addEventListener('click', () => N.Drawer.open('templates'));
        box.append(more);
      } else if (S.live && S.live.errorCount) {
        box.append(h('p', { class: 'faint' }, `${S.live.errorCount} ${S.live.errorCount === 1 ? 'line needs' : 'lines need'} fixing first`));
      }
      body.replaceChildren(box);
      chart = null;
    }

    function statusLine(r, running) {
      const st = STATUS[running ? 'running' : r.status] || STATUS.error;
      const el = h('div', { class: 'res-status ' + st.cls });
      const meta = h('span', { class: 'muted' });
      el.append(h('span', { class: 'dot' }), h('strong', null, st.word), meta);
      return { el, meta };
    }

    function metaText(r) {
      const bits = [];
      if (r.engineLabel) bits.push(r.engineLabel);
      bits.push(r.ms < 1 ? '<1 ms' : r.ms < 1000 ? `${Math.round(r.ms)} ms` : `${(r.ms / 1000).toFixed(r.ms < 10000 ? 2 : 1)} s`);
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

    function decisions(r) {
      const sec = h('section', { class: 'res-section' });
      const adv = S.ui.showAdvancedResults;
      const head = h('header', null, h('h3', { class: 'label-caps' }, 'Decisions'));
      const advBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-pressed': String(adv) }, 'Advanced');
      advBtn.addEventListener('click', () => { S.saveUI({ showAdvancedResults: !S.ui.showAdvancedResults }); render(); });
      head.append(advBtn);
      sec.append(head);
      const tbl = h('table', { class: 'res-table' });
      const hasRC = adv && r.reducedCosts;
      tbl.innerHTML = `<thead><tr><th>Name</th><th class="num">Value</th><th class="num" style="width:80px"><span class="sr-only">Position in bounds</span></th>${hasRC ? '<th class="num">Reduced cost</th>' : ''}</tr></thead>`;
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
          bar = `<span class="bound-bar${edge ? ' is-edge' : ''}" data-tip="${esc(fmt(lo))} … ${esc(fmt(hi))}"><i style="left:${(p * 100).toFixed(1)}%"></i></span>`;
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
      sec.append(tbl);
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
      tbl.innerHTML = `<thead><tr><th>Rule</th><th class="num">LHS</th><th class="num">RHS</th><th class="num">Slack</th><th><span class="sr-only">State</span></th>${hasDual ? '<th class="num" data-tip="Change in goal per unit of RHS">Shadow</th>' : ''}</tr></thead>`;
      const tb = h('tbody');
      const LIMIT = 30;
      let list = r.constraints;
      if (list.length > LIMIT && !showAllRows) list = list.filter((c) => c.binding || !c.ok).slice(0, LIMIT);
      for (const c of list) {
        const tr = h('tr', { class: 'is-link' });
        const opSym = c.op === '<=' ? '≤' : c.op === '>=' ? '≥' : '=';
        const badge = !c.ok ? '<span class="badge-off">off</span>' : c.binding ? '<span class="badge-binding">binding</span>' : '';
        tr.innerHTML = `<td class="nm" title="${esc(opSym)}">${esc(c.label)}</td><td class="num">${esc(fmt(c.lhs))}</td><td class="num">${esc(fmt(c.rhs))}</td><td class="num">${c.op === '=' ? '' : esc(fmt(c.slack))}</td><td>${badge}</td>${hasDual ? `<td class="num">${c.dual == null ? '' : esc(fmt(c.dual))}</td>` : ''}`;
        tr.addEventListener('click', () => N.App.rules.focusRow(c.id));
        tb.append(tr);
      }
      tbl.append(tb);
      sec.append(tbl);
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
      const byId = new Map(S.model.constraints.map((c, i) => [c.id, c.label || `Rule ${i + 1}`]));
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
        const b = h('button', { type: 'button' }, byId.get(id));
        b.addEventListener('click', () => N.App.rules.focusRow(id));
        chips.append(b);
      });
      box.append(chips);
      return box;
    }

    function render() {
      const r = S.result;
      const running = S.running;
      root.classList.toggle('is-empty', !r && !running);
      if (!r && !running) { empty(); return; }
      root.classList.remove('is-empty');
      const wrap = h('div', { class: 'res' + (S.stale && !running ? ' is-stale' : '') });
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
        const n = h('div', { class: 'stale-note', html: icon('info', 'icon-xs') + `Model changed since this solve · ${keys('Mod+Enter')} to refresh` });
        wrap.append(n);
      }
      if (!running && r.status === 'error') {
        wrap.append(h('div', { class: 'error-box' }, r.message || 'Something went wrong'));
        body.replaceChildren(wrap);
        return;
      }
      const showHero = running || (r.objective != null && Number.isFinite(r.objective));
      if (showHero) {
        const hero = h('div', { class: 'res-hero' });
        const sense = S.model.goal.sense;
        const label = h('div', { class: 'res-hero-label' }, running ? 'Best so far' : r.status === 'infeasible' ? 'Goal at least-violating point' : sense === 'target' ? 'Goal reached' : sense === 'min' ? 'Minimum' : 'Maximum');
        const val = h('div', { class: 'res-hero-value' });
        const num = h('span', { class: 'num' }, running ? (Number.isFinite(src.best) ? fmt(src.best) : '…') : fmt(r.objective));
        if (!running && (r.status === 'optimal' || r.status === 'feasible')) val.append(h('span', { class: 'found-dot', 'aria-hidden': 'true' }));
        val.append(num);
        hero.append(label, val);
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
            d.innerHTML = `<span class="${better ? 'up' : 'down'}">${esc(txt)}</span> vs current (${esc(fmt(b))})`;
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
      const hist = running ? (N.Solve.liveHistory || []) : (r.history || []);
      if (running || hist.length > 1) {
        const sec = h('section', { class: 'res-section' });
        sec.append(h('header', null, h('h3', { class: 'label-caps' }, 'Convergence')));
        const ch = h('div', { class: 'chart' });
        const cv = h('canvas', { role: 'img', 'aria-label': 'Objective by iteration' });
        ch.append(cv);
        chartMeta = h('div', { class: 'chart-meta' });
        sec.append(ch, chartMeta);
        wrap.append(sec);
        chart = cv;
      } else chart = null;
      if (!running && r.values) wrap.append(decisions(r));
      if (!running && r.values && r.status !== 'infeasible') { const rs = rules(r); if (rs) wrap.append(rs); }
      if (!running && r.values && r.status !== 'infeasible') {
        const acts = h('div', { class: 'res-actions' });
        const keep = h('button', { class: 'btn btn-soft', type: 'button', html: icon('pin', 'icon-sm') + 'Keep solution', 'data-tip': 'Use these values as the new starting point' });
        keep.addEventListener('click', () => N.Solve.keep());
        const restore = h('button', { class: 'btn btn-outline', type: 'button', html: icon('restore', 'icon-sm') + 'Restore', disabled: !S.kept, 'data-tip': 'Go back to the values before Keep' });
        restore.addEventListener('click', () => N.Solve.restore());
        const scen = h('button', { class: 'btn btn-outline', type: 'button', html: icon('bookmark', 'icon-sm') + 'Save scenario' });
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
    S.on('result', () => { showAllVars = false; showAllRows = false; staleShown = S.stale; render(); });
    S.on('model', () => {
      if (!S.result && !S.running) { if (!body.querySelector('.res-empty') || S.model.variables.length < 2) empty(); return; }
      if (S.stale !== staleShown && !S.running) { staleShown = S.stale; render(); }
    });
    S.on('live', () => { if (!S.result && !S.running) empty(); });
    S.on('progress', progress);
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(paintChart, 80); });
    new MutationObserver(() => paintChart()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    render();
    return { render, drawChart };
  }

  N.Results = { ResultsPanel, drawChart };
})(window.Nadir);
