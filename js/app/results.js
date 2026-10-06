(function (N) {
  'use strict';
  const { h, icon, esc, fmt, keys, LOGO, VALLEY, plural, joinWords, countUp, patch } = N.util;
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
    optimal: { word: 'Best answer', cls: 'st-optimal', say: 'Nothing beats this', tech: 'Optimal' },
    feasible: { word: 'Good answer', cls: 'st-feasible', say: 'Fits every limit — maybe not the very best', tech: 'Feasible' },
    infeasible: { word: 'No answer fits', cls: 'st-infeasible', say: 'Some limits clash', tech: 'Infeasible' },
    unbounded: { word: 'No ceiling', cls: 'st-unbounded', say: 'Something can grow forever', tech: 'Unbounded' },
    stopped: { word: 'Stopped', cls: 'st-stopped', say: 'Stopped early', tech: 'Stopped' },
    error: { word: 'Not ready', cls: 'st-error', say: 'Something needs fixing', tech: 'Error' },
    running: { word: 'Solving', cls: 'st-running', say: 'Searching…', tech: 'Running' }
  };

  const TEMPLATE_ICON = (t) => t.icon || 'layers';

  function niceUp(x) {
    if (!Number.isFinite(x) || x <= 0) return x;
    if (Math.abs(x - Math.round(x)) < 1e-7) return Math.round(x);
    const p = Math.pow(10, Math.floor(Math.log10(x)) - 2);
    return +(Math.ceil(x / p - 1e-9) * p).toPrecision(6);
  }
  function canPatch(expr) {
    if (!expr || expr.includes('#')) return false;
    try { const p = E.parseRule(expr); return p && p.node.ops.length === 1; } catch (e) { return false; }
  }

  function ResultsPanel(root) {
    const card = h('section', { class: 'card', id: 'results-card', 'aria-label': 'Results', 'aria-live': 'polite' });
    const handle = h('button', { class: 'sheet-handle', type: 'button', 'aria-label': 'Toggle results' });
    handle.addEventListener('click', () => root.classList.toggle('is-open'));
    const body = h('div', { class: 'res-body' });
    card.append(handle, h('div', { class: 'print-title' }, ''), body);
    root.append(card);
    let chart = null, chartMeta = null, liveStatus = null, showAllVars = false, showAllRows = false, emptyKind = '', animated = null;
    const actions = new Map();
    let actSeq = 0;
    const act = (el, fn) => { const k = 'a' + (actSeq++); actions.set(k, fn); el.dataset.act = k; return el; };
    body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || !body.contains(t)) return;
      const fn = actions.get(t.dataset.act);
      if (fn) fn(e, t);
    });
    const chartCanvas = h('canvas', { role: 'img', 'aria-label': 'Objective by iteration', 'data-morph': 'keep', 'data-key': 'chart-canvas' });
    let readyKey = '';

    function welcome() {
      const box = h('div', { class: 'res-empty res-welcome' });
      box.innerHTML = `<div class="welcome-art">${VALLEY}</div>` +
        `<h3>Find the best decision — no math needed</h3>` +
        `<p>How many to make, where to spend, who does what. Describe your situation and Nadir works out the best plan, then explains it in plain words.</p>`;
      const hero = h('button', { class: 'welcome-wizard', type: 'button', id: 'welcome-wizard' });
      hero.innerHTML = `<span class="welcome-wizard-ic">${icon('sparkle')}</span><span class="welcome-wizard-txt"><strong>Set up with simple questions</strong><span>Pick a situation, fill in a small table — Nadir writes the model for you.</span></span>${icon('arrowRight', 'icon-sm')}`;
      act(hero, () => N.Wizard.open());
      const ctas = h('div', { class: 'welcome-ctas' });
      const tour = h('button', { class: 'btn btn-outline btn-sm', type: 'button', html: icon('compass', 'icon-sm') + 'Show me around (1 min)' });
      act(tour, () => N.Tour.start());
      const scratch = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('edit', 'icon-sm') + 'Write it myself' });
      act(scratch, () => N.App.decide.add());
      ctas.append(tour, scratch);
      box.append(hero, ctas, h('div', { class: 'welcome-divider' }, h('span', null, 'or open a ready-made example')));
      const grid = h('div', { class: 'template-grid' });
      N.Templates.list.slice(0, 6).forEach((t, i) => {
        const b = h('button', { class: 'template-card', type: 'button', style: { '--i': i } });
        b.innerHTML = `<span class="template-ic">${icon(TEMPLATE_ICON(t), 'icon-sm')}</span><strong>${esc(t.name)}<span class="chip">${esc(t.kind)}</span></strong><span>${esc(t.blurb || t.note[0])}</span>`;
        act(b, () => N.Templates.open(t.key));
        grid.append(b);
      });
      box.append(grid);
      const more = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: 'All templates' + icon('arrowRight', 'icon-xs') });
      act(more, () => N.Drawer.open('templates'));
      box.append(more);
      return box;
    }

    function readiness() {
      const L = S.live;
      const e = L ? L.errors : { vars: {}, rules: {}, params: {} };
      const m = S.model;
      const box = h('div', { class: 'res-empty res-ready', 'data-key': 'ready' });
      const errs = L ? L.errorCount : 0;
      const goalBlank = E.isBlank(m.goal.expr);
      const goalOk = !goalBlank && !e.goal && !(m.goal.sense === 'target' && (e.target || String(m.goal.target == null ? '' : m.goal.target).trim() === ''));
      const nV = m.variables.length, nR = m.constraints.length;
      const varErr = Object.keys(e.vars || {}).length;
      const items = [];
      if (goalOk) items.push({ st: 'ok', t: m.goal.sense === 'target' ? 'Goal: hit a target' : `Goal: ${m.goal.sense === 'min' ? 'make it as small as possible' : 'make it as big as possible'}`, d: explainGoal() });
      else if (goalBlank && nR) items.push({ st: 'warn', t: 'No goal yet', d: 'Nadir will just find any answer that fits the limits.', act: ['Write a goal', () => N.App.goal.focus()] });
      else items.push({ st: 'todo', t: 'Write a goal', d: nV ? 'Click the names under the goal box to build it.' : 'What should be as big — or as small — as possible?', act: ['Write it', () => N.App.goal.focus()] });
      if (nV && !varErr) {
        const C = S.compiled;
        const n = C ? C.n : nV;
        items.push({ st: 'ok', t: `${plural(nV, 'decision')}`, d: n !== nV ? `${fmt(n)} numbers for Nadir to choose` : 'The numbers Nadir will choose' });
      } else if (nV) items.push({ st: 'bad', t: `${plural(varErr, 'decision')} to fix`, d: 'Check the highlighted names and ranges.', act: ['Show me', () => N.Solve.focusFirstError()] });
      else items.push({ st: 'todo', t: 'Add a decision', d: 'Something Nadir can choose — a quantity, an amount, a yes/no.', act: ['Add', () => N.App.decide.add()] });
      if (nR) items.push({ st: 'ok', t: plural(nR, 'limit'), d: 'What the answer must respect' });
      else items.push({ st: 'opt', t: 'No limits yet', d: 'Optional — but without limits, “more” is usually unlimited.', act: ['Add a limit', () => N.App.rules.add()] });
      if (errs) items.push({ st: 'bad', t: `${plural(errs, 'line')} to fix`, d: 'The red underline shows exactly where.', act: ['Show me', () => N.Solve.focusFirstError()] });
      const ready = !errs && nV > 0 && (goalOk || (goalBlank && nR > 0));
      box.innerHTML = `<div class="res-empty-mark${ready ? ' is-ready' : ''}" data-morph="keep" data-key="mark">${LOGO}</div><h3>${ready ? 'Ready to solve' : 'Almost there'}</h3>` +
        `<p>${ready ? `Press the button below or ${keys('Mod+Enter')}. Nadir picks the right method for you.` : 'A few things before Nadir can solve:'}</p>`;
      const list = h('ul', { class: 'ready-list' });
      items.forEach((it) => {
        const li = h('li', { class: 'ready-item is-' + it.st, 'data-key': 'ri-' + it.t.replace(/^[\d,]+ /, '#') });
        const ic = { ok: 'check', warn: 'info', todo: 'dot', opt: 'dot', bad: 'alert' }[it.st];
        li.innerHTML = `<span class="ready-ic">${icon(ic, 'icon-xs')}</span><span class="ready-txt"><strong>${esc(it.t)}</strong>${it.d ? `<span>${esc(it.d)}</span>` : ''}</span>`;
        if (it.act) {
          const b = h('button', { class: 'btn btn-soft btn-sm', type: 'button' }, it.act[0]);
          act(b, it.act[1]);
          li.append(b);
        }
        list.append(li);
      });
      box.append(list);
      const cls = L && L.cls;
      if (ready) {
        const go = h('button', { class: 'btn btn-primary btn-lg', type: 'button', html: icon('play', 'icon-sm') + 'Find the best answer' });
        act(go, () => N.Solve.run());
        box.append(go);
      }
      if (ready && cls && cls.label) {
        const kind = cls.pwl ? `straight lines with corners (abs / max / min)${cls.hasInt ? ' and whole numbers' : ''}` : cls.linear ? (cls.hasInt ? 'straight-line formulas with whole numbers' : 'straight-line formulas') : cls.nonsmooth ? 'formulas with jumps' : 'curved formulas';
        box.append(h('p', { class: 'ready-engine', html: `${icon(cls.linear ? 'layers' : cls.nonsmooth ? 'activity' : 'function', 'icon-xs')}Your model uses ${esc(kind)} — Nadir will use <strong>${esc(cls.label)}</strong>${cls.pwl ? ' and prove the very best answer' : ''}.` }));
      }
      if (!ready && !nV && !nR) {
        const wz = h('button', { class: 'btn btn-soft btn-sm', type: 'button', html: icon('sparkle', 'icon-xs') + 'Use guided setup instead' });
        act(wz, () => N.Wizard.open());
        box.append(wz);
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
      root.classList.toggle('is-welcome', blank);
      chart = null;
      if (blank) {
        if (emptyKind === 'welcome') return;
        emptyKind = 'welcome';
        readyKey = '';
        actions.clear();
        body.replaceChildren(welcome());
        return;
      }
      const L = S.live;
      const key = JSON.stringify([L && L.errorCount, L && L.errors && Object.keys(L.errors.vars || {}).length, !!(L && L.errors && L.errors.goal), S.model.goal.sense, S.model.goal.expr, S.model.goal.target, S.model.variables.length, S.model.constraints.length, L && L.cls && L.cls.label, L && L.cls && L.cls.pwl, S.compiled && S.compiled.n, S.settings.explain]);
      if (emptyKind === 'ready' && key === readyKey) return;
      const fresh = emptyKind !== 'ready';
      emptyKind = 'ready';
      readyKey = key;
      actions.clear();
      const box = readiness();
      if (fresh) body.replaceChildren(box); else patch(body, box);
    }

    function statusLine(r, running) {
      const st = STATUS[running ? 'running' : r.status] || STATUS.error;
      const el = h('div', { class: 'res-status ' + st.cls, 'data-key': 'status' });
      const meta = h('span', { class: 'muted res-meta' });
      el.append(h('span', { class: 'status-badge', 'data-tip': 'Technical term: ' + st.tech }, h('span', { class: 'dot' }), h('strong', null, st.word)), h('span', { class: 'status-say' }, st.say), meta);
      return { el, meta };
    }

    function metaText(r) {
      const bits = [];
      if (r.engineLabel) bits.push(r.engineLabel);
      if (r.ms != null) bits.push(r.ms < 1 ? '<1 ms' : r.ms < 1000 ? `${Math.round(r.ms)} ms` : `${(r.ms / 1000).toFixed(r.ms < 10000 ? 2 : 1)} s`);
      const pivTxt = (total, dual) => {
        const t = `${fmt(total)} ${total === 1 ? 'pivot' : 'pivots'}`;
        if (!dual) return t;
        const primal = Math.max(0, total - dual);
        return `${t} (${fmt(primal)} primal · ${fmt(dual)} dual)`;
      };
      if (r.engine === 'simplex' && r.pivots != null) bits.push(pivTxt(r.pivots, r.dualPivots));
      if (r.engine === 'bb' && r.mip && r.pivots != null) bits.push(pivTxt(r.pivots, r.mip.dualPivots));
      if (r.lpPresolve && (r.lpPresolve.rows || r.lpPresolve.cols)) bits.push(`presolve −${fmt(r.lpPresolve.rows)} rows −${fmt(r.lpPresolve.cols)} cols`);
      if (r.engine === 'bb' && r.mip && r.mip.strong) bits.push(`${fmt(r.mip.strong)} strong probes`);
      if (r.parallel && !r.parallel.noGain) bits.push(`${r.parallel.workers} workers`);
      if (/simd/.test(r.lu || '') || r.simd) bits.push('SIMD');
      if (r.parallel && r.parallel.steals) bits.push(`${fmt(r.parallel.steals)} ${r.parallel.steals === 1 ? 'steal' : 'steals'}${r.parallel.shared ? ' · shared bound' : ''}`);
      if (r.engine === 'bb' && r.mip && r.mip.automorphisms) bits.push(`${fmt(r.mip.automorphisms)} ${r.mip.automorphisms === 1 ? 'symmetry' : 'symmetries'}`);
      if (r.engine === 'bb' && r.mip && r.mip.orbitopes) bits.push(`${fmt(r.mip.orbitopes)} ${r.mip.orbitopes === 1 ? 'orbitope' : 'orbitopes'}`);
      if (r.engine === 'bb' && r.mip && r.mip.orbits) bits.push(`${fmt(r.mip.orbits)} ${r.mip.orbits === 1 ? 'orbit' : 'orbits'}`);
      if (r.engine === 'bb' && r.mip && r.mip.learned) bits.push(`${fmt(r.mip.learned)} learned`);
      if (r.engine === 'bb' && r.mip && r.mip.restarts) bits.push(`${r.mip.restarts === 1 ? 'restart' : fmt(r.mip.restarts) + ' restarts'}`);
      if (r.pwl && r.pwl.pieces) bits.push(`${fmt(r.pwl.pieces)} corner ${r.pwl.pieces === 1 ? 'piece' : 'pieces'} linearized`);
      if (r.pwl && r.pwl.switches) bits.push(`${fmt(r.pwl.switches)} ${r.pwl.switches === 1 ? 'switch' : 'switches'}`);
      if (r.engine === 'bb' && r.nodes != null) bits.push(`${fmt(r.nodes)} ${r.nodes === 1 ? 'node' : 'nodes'}`);
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
      const sec = h('section', { class: 'res-story', 'data-key': 'story' });
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
          P.push(`What holds you back: ${joinWords(nm)}${bind.length > 4 ? ` and ${fmt(bind.length - 4)} more` : ''} ${bind.length === 1 ? 'is' : 'are'} used up completely.`);
        } else if (!onlyEq) P.push('None of your limits is used up — the allowed ranges on your decisions set the answer.');
      }
      if ((r.engine === 'simplex' || r.fixedDuals) && r.constraints && sense !== 'target') {
        let best = null;
        r.constraints.forEach((c) => { if (c.dual != null && Math.abs(c.dual) > 1e-9 && enabled.has(c.id) && (!best || Math.abs(c.dual) > Math.abs(best.dual))) best = c; });
        if (best && r.fixedDuals) {
          const nm = names.get(best.id) || best.label;
          P.push(`Biggest lever: with the whole-number choices kept as they are, one more unit of room in <strong>${esc(nm)}</strong> would ${sense === 'min' ? 'cut' : 'add'} about <strong class="num">${esc(fmt(Math.abs(best.dual)))}</strong> ${sense === 'min' ? 'from' : 'to'} the goal.`);
          best = null;
        }
        if (best) {
          const nm = names.get(best.id) || best.label;
          const amt = esc(fmt(Math.abs(best.dual)));
          const rg = best.range;
          const loosen = best.op === '>=' ? 'dec' : 'inc';
          const valid = rg && Number.isFinite(rg[loosen]) ? ` That holds for the next <strong class="num">${esc(fmt(rg[loosen]))}</strong> units; beyond that a different rule takes over.` : rg && rg[loosen] === Infinity ? ' That rate holds however far you loosen it.' : '';
          P.push(best.op === '='
            ? `Biggest lever: changing <strong>${esc(nm)}</strong> by one unit moves the goal by about <strong class="num">${amt}</strong>.${rg ? ` Valid while the right side stays between <strong class="num">${esc(fmt(best.rhs - rg.dec))}</strong> and <strong class="num">${esc(fmt(best.rhs + rg.inc))}</strong>.` : ''}`
            : `Biggest lever: one more unit of room in <strong>${esc(nm)}</strong> would ${sense === 'min' ? 'cut' : 'add'} about <strong class="num">${amt}</strong> ${sense === 'min' ? 'from' : 'to'} the goal.${valid}`);
        }
      }
      if (r.pwl && r.pwl.pieces) {
        const k = r.pwl.kinds || {};
        const what = joinWords([k.abs ? 'abs' : '', k.max ? 'max' : '', k.min ? 'min' : ''].filter(Boolean).map((x) => `<span class="mono">${x}()</span>`));
        const sw = r.pwl.switches ? ` Nadir added ${plural(r.pwl.switches, 'on/off switch', 'on/off switches')} for the corners that bend the wrong way.` : '';
        P.push(`<span class="faint">Your ${what || 'corner'} formulas were rewritten as straight lines, so ${r.engine === 'bb' ? 'Branch & Bound' : 'Simplex'} could prove this is the very best answer — not just a good one.${sw}</span>`);
      }
      if (r.warmStart) P.push('<span class="faint">Started from the previous answer to get here faster.</span>');
      if (r.engine === 'alm') P.push(`<span class="faint">Nonlinear models can have more than one valley; Nadir compared ${plural(r.starts || 1, 'starting point')} and kept the best.</span>`);
      if (r.engine === 'de') P.push(`<span class="faint">Found by an evolutionary search over ${plural(r.generations || 0, 'generation')}${r.polished ? ', then polished' : ''}.</span>`);
      if (r.engine === 'bb' && r.mip && (r.mip.cuts || r.mip.restarts || r.mip.conflictPrunes || r.mip.conflictFixes || (r.mip.presolve && (r.mip.presolve.rowsRemoved || r.mip.presolve.boundsTightened)))) {
        const bits = [];
        const pr = r.mip.presolve;
        if (pr && pr.rowsRemoved) bits.push(`presolve dropped ${plural(pr.rowsRemoved, 'redundant rule')}`);
        if (pr && pr.boundsTightened) bits.push(`tightened ${plural(pr.boundsTightened, 'bound')}`);
        if (r.mip.restarts) bits.push(`fixed ${plural(r.mip.restartFixed || 0, 'whole-number choice')} at the root and restarted on the smaller model`);
        if (r.mip.conflictPrunes || r.mip.conflictFixes) bits.push(`used ${plural(r.mip.conflictEdges || 0, 'either-or pair')} to rule out ${plural((r.mip.conflictPrunes || 0) + (r.mip.conflictFixes || 0), 'option')} during the search`);
        if (r.mip.cuts) {
          const kinds = [r.mip.cliques ? plural(r.mip.cliques, 'clique') : '', r.mip.covers ? plural(r.mip.covers, 'knapsack cover') : '', r.mip.flows ? plural(r.mip.flows, 'flow cover') : '', r.mip.gomory ? `${fmt(r.mip.gomory)} Gomory` : ''].filter(Boolean);
          bits.push(`added ${plural(r.mip.cuts, 'cutting plane')}${kinds.length ? ` (${kinds.join(', ')})` : ''}`);
        }
        P.push(`<span class="faint">Before searching, Nadir ${joinWords(bits)}.</span>`);
      }
      if (r.engine === 'bb' && r.mip && r.mip.dualPivots > 0 && r.nodes > 1) P.push(`<span class="faint">Each branch restarted from its parent with the dual simplex (${esc(fmt(Math.round(100 * r.mip.dualPivots / Math.max(1, r.mip.dualPivots + r.mip.primalPivots))))}% of pivots).</span>`);
      if (r.engine === 'bb' && r.status === 'feasible' && r.gap) P.push(`<span class="faint">Stopped within ${esc(fmt(r.gap * 100))}% of the best possible — close enough under the current settings.</span>`);
      const p = h('div', { class: 'story-text' });
      p.innerHTML = P.map((x) => `<p>${x}</p>`).join('');
      sec.append(p);
      return sec;
    }

    function decisions(r) {
      const sec = h('section', { class: 'res-section', 'data-key': 'plan' });
      const adv = S.ui.showAdvancedResults;
      const head = h('header', null, h('h3', { class: 'label-caps' }, 'The plan'));
      const advBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-pressed': String(adv), 'data-tip': 'For experts: reduced costs, shadow prices and sensitivity ranges' }, adv ? 'Hide expert details' : 'Expert details');
      act(advBtn, () => { S.saveUI({ showAdvancedResults: !S.ui.showAdvancedResults }); render(); });
      head.append(advBtn);
      sec.append(head);
      const tbl = h('table', { class: 'res-table' });
      const hasRC = adv && r.reducedCosts;
      tbl.innerHTML = `<thead><tr><th>Decision</th><th class="num">Best value</th><th class="num" style="width:80px" data-tip="Where the value sits in its allowed range"><span class="sr-only">Position in range</span></th>${hasRC ? '<th class="num" data-tip="How much the goal would worsen per unit if forced up">Reduced cost</th>' : ''}</tr></thead>`;
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
        const tr = h('tr', { class: 'is-link' + (Math.abs(x) < 1e-9 ? ' is-zero' : ''), dataset: { var: v.id, key: 'v' + j }, style: count < 14 ? `--r:${count}` : null });
        const rc = hasRC ? r.reducedCosts[j] : null;
        tr.innerHTML = `<td class="nm">${valueLabel(v, i)}</td><td class="num keep">${esc(fmt(x))}</td><td class="num">${bar}</td>${hasRC ? `<td class="num">${rc == null ? '<span class="faint">whole</span>' : esc(fmt(rc))}</td>` : ''}`;
        act(tr, () => N.App.decide.focusRow(v.id));
        tb.append(tr);
        count++;
      }
      tbl.append(tb);
      sec.append(h('div', { class: 'table-wrap' }, tbl));
      const hidden = total - count;
      if (hidden > 0) {
        const m = h('div', { class: 'more-rows' }, nonzeroFirst && !showAllVars ? `Showing ${fmt(count)} nonzero of ${fmt(total)}` : `${fmt(hidden)} more`);
        const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Show all');
        act(b, () => { showAllVars = true; render(); });
        m.append(b);
        sec.append(m);
      }
      return sec;
    }

    function rules(r) {
      if (!r.constraints || !r.constraints.length) return null;
      const adv = S.ui.showAdvancedResults;
      const hasDual = adv && r.constraints.some((c) => c.dual != null);
      const sec = h('section', { class: 'res-section', 'data-key': 'limits' });
      sec.append(h('header', null, h('h3', { class: 'label-caps' }, 'Limits')));
      const tbl = h('table', { class: 'res-table' });
      tbl.innerHTML = `<thead><tr><th>Limit</th><th class="num" data-tip="The left side of the limit, with the best plan (technical: LHS)">Used</th><th class="num" data-tip="The right side of the limit (technical: RHS)">Allowed</th><th class="num" data-tip="Room left before the limit bites (technical: slack)">Spare</th><th><span class="sr-only">State</span></th>${hasDual ? '<th class="num" data-tip="Change in goal per unit of RHS (shadow price)">Worth</th>' : ''}</tr></thead>`;
      const tb = h('tbody');
      const LIMIT = 30;
      let list = r.constraints;
      if (list.length > LIMIT && !showAllRows) list = list.filter((c) => c.binding || !c.ok).slice(0, LIMIT);
      for (const c of list) {
        const tr = h('tr', { class: 'is-link', 'data-key': 'r' + c.row, style: list.indexOf(c) < 14 ? `--r:${list.indexOf(c) + 2}` : null });
        const opSym = c.op === '<=' ? '≤' : c.op === '>=' ? '≥' : '=';
        const badge = !c.ok ? '<span class="badge-off">broken</span>' : c.binding && c.op !== '=' ? '<span class="badge-binding" data-tip="Used up completely (technical: binding). Loosen it to improve the goal.">used up</span>' : '';
        tr.innerHTML = `<td class="nm" title="${esc(opSym)}">${esc(c.label)}</td><td class="num">${esc(fmt(c.lhs))}</td><td class="num">${esc(fmt(c.rhs))}</td><td class="num">${c.op === '=' ? '' : esc(fmt(c.slack))}</td><td>${badge}</td>${hasDual ? `<td class="num">${c.dual == null ? '' : esc(fmt(c.dual))}</td>` : ''}`;
        act(tr, () => N.App.rules.focusRow(c.id));
        tb.append(tr);
      }
      tbl.append(tb);
      sec.append(h('div', { class: 'table-wrap' }, tbl));
      if (list.length < r.constraints.length) {
        const m = h('div', { class: 'more-rows' }, `Showing binding rules · ${fmt(r.constraints.length)} in total`);
        const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Show all');
        act(b, () => { showAllRows = true; render(); });
        m.append(b);
        sec.append(m);
      }
      return sec;
    }

    function diagnosis(r) {
      const d = r.diagnosis;
      const box = h('div', { class: 'diag-box', role: 'alert', 'data-key': 'diag' });
      const byId = ruleNames();
      if (!d) { box.innerHTML = `<h4>${icon('alert', 'icon-sm')}No solution satisfies every rule</h4>`; return box; }
      if (d.kind === 'integer' || d.kind === 'bounds') {
        box.innerHTML = `<h4>${icon('alert', 'icon-sm')}No solution satisfies every rule</h4><p>${esc(d.message)}</p>`;
        return box;
      }
      const names = d.rules.map((id) => byId.get(id)).filter(Boolean);
      box.innerHTML = `<h4>${icon('alert', 'icon-sm')}${names.length > 1 ? "These limits can't all be met at once" : names.length ? "This limit can't be met" : 'No plan meets every limit'}</h4>`;
      const p = h('p');
      p.textContent = names.length ? (names.length > 1 ? `${joinWords(names)} work against each other.` : `${names[0]}${d.withBounds === false ? ' clashes with the allowed ranges in Decisions' : ''}.`) + (d.approximate ? ' Found by searching for the plan that breaks the least.' : ' Loosen any one of them and Nadir can solve it.') : 'Try loosening a range or a limit.';
      box.append(p);
      const fixes = (d.fixes || []).filter((f) => f.id === '__target' || byId.has(f.id)).sort((a, b) => a.amount - b.amount).slice(0, 4);
      if (fixes.length) {
        const list = h('div', { class: 'fix-list' });
        list.append(h('div', { class: 'fix-list-head' }, fixes.length > 1 ? 'Smallest changes that make it work (together):' : 'Smallest change that makes it work:'));
        fixes.forEach((f) => {
          const nm = f.id === '__target' ? 'the target' : byId.get(f.id);
          const amt = niceUp(f.amount);
          const verb = f.op === '>=' ? `need <strong class="num">${esc(fmt(amt))}</strong> less` : f.op === '<=' ? `allow <strong class="num">${esc(fmt(amt))}</strong> more` : `move it by <strong class="num">${esc(fmt(amt))}</strong>`;
          const row = h('div', { class: 'fix-item', html: `<span class="fix-item-txt"><strong>${esc(nm)}</strong>: ${verb}</span>` });
          const rule = S.model.constraints.find((c) => c.id === f.id);
          if (rule && canPatch(rule.expr)) {
            const ap = h('button', { class: 'btn btn-soft btn-sm', type: 'button', html: icon('check', 'icon-xs') + 'Apply & re-solve' });
            act(ap, () => {
              S.edit(() => { rule.expr = rule.expr.replace(/\s+$/, '') + (f.dir > 0 ? ' + ' : ' - ') + N.util.fmt.plain(amt); }, { undo: true });
              N.toast(`Loosened ${nm}`, { action: { label: 'Undo', run: () => S.undo() } });
              setTimeout(() => N.Solve.run(), 30);
            });
            row.append(ap);
          }
          if (rule) {
            const off = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-tip': 'Switch this limit off and solve without it' }, 'Pause it');
            act(off, () => { S.edit(() => { rule.enabled = false; }, { undo: true }); setTimeout(() => N.Solve.run(), 30); });
            row.append(off);
          }
          list.append(row);
        });
        box.append(list);
      }
      const chips = h('div', { class: 'diag-rules' });
      d.rules.forEach((id) => {
        if (!byId.has(id)) return;
        const b = h('button', { type: 'button', html: icon('arrowRight', 'icon-xs') + esc(byId.get(id)) });
        act(b, () => N.App.rules.focusRow(id));
        chips.append(b);
      });
      box.append(chips);
      return box;
    }

    function rangeTxt(v, base) {
      if (v == null) return '';
      if (v === Infinity) return '∞';
      return fmt(v);
    }

    function sensitivity(r) {
      const sec = h('details', { class: 'res-section res-details res-sensitivity', 'data-key': 'sens' });
      sec.open = S.ui.showSensitivity !== false;
      sec.append(h('summary', null, h('h3', { class: 'label-caps' }, 'Sensitivity'), h('span', { class: 'faint res-details-sub' }, 'how far numbers can move before the plan changes'), h('span', { class: 'summary-chev', html: icon('chevronDown', 'icon-xs') })));
      if (r.rangingNote) { sec.append(h('p', { class: 'field-hint' }, r.rangingNote)); return sec; }
      const sense = r.sense || S.model.goal.sense;
      const rows = (r.constraints || []).filter((c) => c.range);
      if (rows.length) {
        const t = h('table', { class: 'res-table sens-table' });
        t.innerHTML = `<thead><tr><th>Rule</th><th class="num">RHS</th><th class="num" data-tip="Goal change per unit of RHS">Shadow</th><th class="num" data-tip="The shadow price stays valid while the RHS stays in this range">Valid RHS range</th></tr></thead>`;
        const tb = h('tbody');
        rows.slice(0, S.ui.showAllSens ? rows.length : 30).forEach((c) => {
          const lo = c.range.dec === Infinity ? -Infinity : c.rhs - c.range.dec;
          const hi = c.range.inc === Infinity ? Infinity : c.rhs + c.range.inc;
          const tr = h('tr', { class: 'is-link' });
          tr.innerHTML = `<td class="nm">${esc(c.label)}</td><td class="num">${esc(fmt(c.rhs))}</td><td class="num">${c.dual == null ? '' : esc(fmt(c.dual))}</td><td class="num sens-range"><span>${esc(fmt(lo))}</span><i></i><span>${esc(fmt(hi))}</span></td>`;
          act(tr, () => N.App.rules.focusRow(c.id));
          tb.append(tr);
        });
        t.append(tb);
        sec.append(h('div', { class: 'table-wrap' }, t));
      }
      if (r.costRanges) {
        const t = h('table', { class: 'res-table sens-table' });
        t.innerHTML = `<thead><tr><th>Decision</th><th class="num" data-tip="The goal coefficient of this decision">Goal weight</th><th class="num" data-tip="The plan stays optimal while the weight stays in this range">Valid weight range</th></tr></thead>`;
        const tb = h('tbody');
        let shown = 0;
        for (const v of r.layout) {
          for (let i = 0; i < v.size && shown < 40; i++, shown++) {
            const j = v.offset + i;
            const cr = r.costRanges[j];
            const tr = h('tr', { class: 'is-link' + (Math.abs(r.values[j]) < 1e-9 ? ' is-zero' : '') });
            const w = r.objWeights ? r.objWeights[j] : null;
            if (cr.fixed) {
              tr.innerHTML = `<td class="nm">${valueLabel(v, i)}</td><td class="num">${w == null ? '' : esc(fmt(w))}</td><td class="num faint" data-tip="Whole-number decisions are held at their best value for this analysis">held at ${esc(fmt(r.values[j]))}</td>`;
              act(tr, () => N.App.decide.focusRow(v.id));
              tb.append(tr);
              continue;
            }
            tr.innerHTML = `<td class="nm">${valueLabel(v, i)}</td><td class="num">${w == null ? '' : esc(fmt(w))}</td><td class="num sens-range"><span>${w == null ? '−' + esc(rangeTxt(cr.dec)) : esc(fmt(cr.dec === Infinity ? -Infinity : w - cr.dec))}</span><i></i><span>${w == null ? '+' + esc(rangeTxt(cr.inc)) : esc(fmt(cr.inc === Infinity ? Infinity : w + cr.inc))}</span></td>`;
            act(tr, () => N.App.decide.focusRow(v.id));
            tb.append(tr);
          }
        }
        t.append(tb);
        sec.append(h('div', { class: 'table-wrap' }, t));
      }
      sec.append(h('p', { class: 'field-hint' }, sense === 'max' || sense === 'min' ? (r.rangingFixedInt ? 'Whole-number decisions are held at their best values; inside these ranges the continuous part of the plan and the shadow prices hold. Outside them, re-solve.' : 'Inside these ranges the same rules stay tight and the shadow prices hold. Outside them, re-solve.') : ''));
      return sec;
    }

    function convergence(running, hist) {
      const sec = h('details', { class: 'res-section res-details', 'data-key': 'chart' });
      if (running || S.ui.showChart) sec.open = true;
      const sum = h('summary', null, h('h3', { class: 'label-caps' }, 'How Nadir got there'), h('span', { class: 'faint res-details-sub' }, running ? 'live' : plural(hist.length, 'step')), h('span', { class: 'summary-chev', html: icon('chevronDown', 'icon-xs') }));
      const ch = h('div', { class: 'chart' });
      ch.append(chartCanvas);
      sec.append(sum, ch, h('div', { class: 'chart-meta' }));
      chart = chartCanvas;
      return sec;
    }

    body.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d || d.tagName !== 'DETAILS') return;
      if (d.dataset.key === 'chart') { if (!S.running) S.saveUI({ showChart: d.open }); if (d.open) paintChart(); }
      else if (d.dataset.key === 'sens') S.saveUI({ showSensitivity: d.open });
    }, true);

    let wasResult = false;
    function render() {
      const r = S.result;
      const running = S.running;
      root.classList.toggle('is-empty', !r && !running);
      if (!r && !running) { wasResult = false; empty(); return; }
      const enter = !wasResult || emptyKind !== '';
      wasResult = true;
      emptyKind = '';
      readyKey = '';
      actions.clear();
      root.classList.remove('is-empty', 'is-welcome');
      const wrap = h('div', { class: 'res' + (S.stale && !running ? ' is-stale' : '') + (running ? ' is-running' : '') + (enter ? ' is-enter' : '') });
      const src = running ? (S.progress || {}) : r;
      const sl = statusLine(r || {}, running);
      liveStatus = sl;
      if (!running) {
        sl.meta.textContent = metaText(r);
        const copy = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Copy for Excel', 'data-tip': 'Copy for Excel', html: icon('copy', 'icon-sm') });
        act(copy, () => N.IO.copyForExcel());
        if (r.values) sl.el.append(copy);
      } else sl.meta.textContent = 'working…';
      wrap.append(sl.el);
      if (S.stale && !running) {
        const n = h('button', { class: 'stale-note', type: 'button', 'data-key': 'stale', html: icon('info', 'icon-xs') + `<span>Model changed since this solve</span><span class="stale-cta">Refresh ${keys('Mod+Enter')}</span>` });
        act(n, () => N.Solve.run());
        wrap.append(n);
      }
      if (!running && r.status === 'error') {
        wrap.append(h('div', { class: 'error-box', html: icon('alert', 'icon-sm') + `<span>${esc(r.message || 'Something went wrong')}</span>` }));
        commit(wrap, enter);
        return;
      }
      const showHero = running || (r.objective != null && Number.isFinite(r.objective));
      if (showHero) {
        const hero = h('div', { class: 'res-hero' + (!running && r.status === 'optimal' ? ' is-optimal' : ''), 'data-key': 'hero' });
        const sense = S.model.goal.sense;
        const label = h('div', { class: 'res-hero-label' }, running ? 'Best so far' : r.status === 'infeasible' ? 'Goal at the closest plan' : sense === 'target' ? 'Goal reached' : sense === 'min' ? 'Lowest possible goal' : 'Highest possible goal');
        const val = h('div', { class: 'res-hero-value' });
        const num = h('span', { class: 'num', 'data-key': 'hero-num' }, running ? (Number.isFinite(src.best) ? fmt(src.best) : '…') : fmt(r.objective));
        if (!running && (r.status === 'optimal' || r.status === 'feasible')) val.append(h('span', { class: 'found-dot', 'aria-hidden': 'true' }));
        val.append(num);
        hero.append(label, val);
        if (!running && animated !== r && !r.quiet) {
          animated = r;
          hero.classList.add('is-fresh');
          heroCount = { from: S.baseline && Number.isFinite(S.baseline.goal) ? S.baseline.goal : 0, to: r.objective };
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
        const ub = h('div', { class: 'diag-box', 'data-key': 'unbounded', html: `<h4>${icon('alert', 'icon-sm')}The goal can grow forever</h4><p>Nothing stops ${r.growing && r.growing.length ? 'these decisions' : 'some decision'} from growing without end. Give ${r.growing && r.growing.length === 1 ? 'it' : 'them'} a maximum, or add a limit that caps ${r.growing && r.growing.length === 1 ? 'it' : 'them'}.</p>` });
        const chips = h('div', { class: 'diag-rules' });
        const seen = new Set();
        (r.growing || []).slice(0, 6).forEach((j) => {
          const v = r.layout.find((L) => j >= L.offset && j < L.offset + L.size);
          if (!v) return;
          const label = v.size === 1 ? v.name : friendlyName(v, j - v.offset);
          if (seen.has(label)) return;
          seen.add(label);
          const b = h('button', { type: 'button', html: icon('arrowRight', 'icon-xs') + `Set a max for <span class="mono">${esc(label)}</span>` });
          act(b, () => N.App.decide.focusUpper(v.id));
          chips.append(b);
        });
        const addR = h('button', { type: 'button', html: icon('plus', 'icon-xs') + 'Add a limit' });
        act(addR, () => N.App.rules.add());
        chips.append(addR);
        ub.append(chips);
        wrap.append(ub);
      }
      if (!running && r.status === 'stopped') {
        wrap.append(h('div', { class: 'diag-box', html: `<h4>${icon('info', 'icon-sm')}Stopped before an answer</h4><p>${esc(r.message || 'The solve was interrupted. Try the Thorough preset or a longer time limit in Settings.')}</p>` }));
      }
      if (!running) { const st = story(r); if (st) wrap.append(st); }
      if (!running && r.values) wrap.append(decisions(r));
      if (!running && r.values && r.status !== 'infeasible') { const rs = rules(r); if (rs) wrap.append(rs); }
      if (!running && r.values && r.status === 'optimal' && (r.costRanges || r.rangingNote) && S.ui.showAdvancedResults) wrap.append(sensitivity(r));
      const hist = running ? (N.Solve.liveHistory || []) : (r.history || []);
      if (running || hist.length > 1) wrap.append(convergence(running, hist));
      else chart = null;
      if (!running && r.values && r.status !== 'infeasible') {
        const acts = h('div', { class: 'res-actions', 'data-key': 'actions' });
        const keep = h('button', { class: 'btn btn-soft', type: 'button', html: icon('pin', 'icon-sm') + 'Use as starting point', 'data-tip': 'Copy these values into the decisions, so the live checks show this plan' });
        act(keep, () => N.Solve.keep());
        const restore = h('button', { class: 'btn btn-outline', type: 'button', html: icon('restore', 'icon-sm') + 'Restore', disabled: !S.kept, 'data-tip': 'Go back to the values before Keep' });
        act(restore, () => N.Solve.restore());
        const scen = h('button', { class: 'btn btn-outline', type: 'button', html: icon('bookmark', 'icon-sm') + 'Save scenario', 'data-tip': 'Remember this answer to compare later' });
        act(scen, () => N.Scenarios.saveCurrent());
        const xl = h('button', { class: 'btn btn-ghost', type: 'button', html: icon('table', 'icon-sm') + 'Copy for Excel' });
        act(xl, () => N.IO.copyForExcel());
        acts.append(keep, restore, scen, xl);
        wrap.append(acts);
      }
      commit(wrap, enter);
      const pt = card.querySelector('.print-title');
      if (pt.textContent !== S.model.name) pt.textContent = S.model.name;
      paintChart();
    }

    let heroCount = null;
    function commit(wrap, enter) {
      const live = enter ? (body.replaceChildren(wrap), wrap) : patch(body, wrap);
      liveStatus = liveStatus && {
        el: live.querySelector('[data-key="status"]'),
        meta: live.querySelector('.res-meta'),
        num: S.running ? live.querySelector('[data-key="hero-num"]') : null
      };
      chartMeta = live.querySelector('.chart-meta');
      if (!live.querySelector('[data-key="chart"]')) chart = null;
      if (!enter) live.classList.remove('is-enter');
      if (heroCount) {
        const n = live.querySelector('[data-key="hero-num"]');
        if (n) countUp(n, heroCount.from, heroCount.to, 620);
        heroCount = null;
      }
    }

    let chartRaf = 0;
    function paintChart() {
      if (!chart || chartRaf) return;
      chartRaf = requestAnimationFrame(paintNow);
    }
    function paintNow() {
      chartRaf = 0;
      if (!chart || !chart.isConnected) return;
      const hist = S.running ? (N.Solve.liveHistory || []) : (S.result && S.result.history) || [];
      drawChart(chart, hist.map((y, i) => [i, y]), { step: S.result && (S.result.engine === 'bb' || S.result.engine === 'de') });
      if (chartMeta) {
        const html = hist.length ? `<span>start ${esc(fmt(hist[0]))}</span><span>${esc(fmt(hist.length))} steps</span><span>best ${esc(fmt(hist[hist.length - 1]))}</span>` : '';
        if (chartMeta._h !== html) { chartMeta._h = html; chartMeta.innerHTML = html; }
      }
    }

    function progress(p) {
      if (!liveStatus || !liveStatus.meta) return;
      if (liveStatus.num && Number.isFinite(p.best)) { const t = fmt(p.best); if (liveStatus.num.textContent !== t) liveStatus.num.textContent = t; }
      liveStatus.meta.textContent = `${p.ms < 1000 ? Math.round(p.ms) + ' ms' : (p.ms / 1000).toFixed(1) + ' s'} · iteration ${fmt(p.iter || 0)}${Number.isFinite(p.violation) && p.violation > 1e-6 ? ` · violation ${fmt(p.violation)}` : ''}`;
      paintChart();
    }

    let staleShown = false;
    const refreshEmpty = () => {
      if (S.result || S.running) return false;
      empty();
      return true;
    };
    let lastResult = null;
    S.on('result', () => { if (S.result !== lastResult) { lastResult = S.result; showAllVars = false; showAllRows = false; } staleShown = S.stale; render(); });
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
