(function (N) {
  'use strict';
  const { h, icon, fmt, keys, literal } = N.util;
  const S = N.Store;
  const E = window.Engine;
  const W = N.WorkerHost;

  let btn, label, ring, best, kbd;
  let liveTimer = 0, pendingLive = false;
  const RING = 2 * Math.PI * 9;

  function buildButton() {
    btn = h('button', { class: 'solve-btn', type: 'button', id: 'solve-button', 'aria-label': 'Solve' });
    ring = h('span', { hidden: true, html: `<svg class="solve-ring" viewBox="0 0 24 24"><circle class="ring-bg" cx="12" cy="12" r="9"/><circle class="ring-fg" cx="12" cy="12" r="9" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>` });
    const ic = h('span', { html: icon('play') });
    label = h('span', null, 'Solve');
    best = h('span', { class: 'solve-best', hidden: true });
    kbd = h('span', { class: 'kbd' }, N.util.MOD + '↵');
    btn.append(ring, ic, label, best, kbd);
    btn.addEventListener('click', () => (S.running ? stop() : run()));
    btn._icon = ic;
    return btn;
  }

  function setRunning(on) {
    btn.classList.toggle('is-running', on);
    ring.hidden = !on;
    best.hidden = !on;
    btn._icon.innerHTML = icon(on ? 'stop' : 'play');
    btn._icon.hidden = on;
    label.textContent = on ? 'Stop' : 'Solve';
    kbd.textContent = on ? 'esc' : N.util.MOD + '↵';
    btn.setAttribute('aria-label', on ? 'Stop solving' : 'Solve');
    if (!on) best.textContent = '';
  }

  function celebrate(r) {
    if (!btn || (r.status !== 'optimal' && r.status !== 'feasible')) return;
    btn.classList.remove('is-done');
    void btn.offsetWidth;
    btn.classList.add('is-done');
    setTimeout(() => btn.classList.remove('is-done'), 900);
  }

  function blocked() {
    const n = S.live ? S.live.errorCount : 0;
    btn.classList.toggle('is-blocked', n > 0 && !S.running);
    const ready = !n && !S.running && S.model.variables.length > 0 && !S.result && !!(S.live && S.live.cls);
    btn.classList.toggle('is-ready', ready);
    btn.dataset.tip = n > 0 ? `${n} ${n === 1 ? 'line needs' : 'lines need'} fixing` : '';
    if (!n) delete btn.dataset.tip;
  }

  const Solve = {
    liveHistory: [],
    button: buildButton,
    async run(opts) {
      const o = opts || {};
      N.Live.flush();
      if (S.running) { if (o.quiet) { pendingLive = true; return; } stop(); }
      if (S.live && S.live.errorCount) {
        if (!o.quiet) { N.toast(`Fix ${S.live.errorCount === 1 ? 'the highlighted line' : S.live.errorCount + ' highlighted lines'} first`, { kind: 'bad' }); focusFirstError(); }
        return;
      }
      const C = S.compiled;
      const goal = S.live && S.live.check ? S.live.check.goal : null;
      S.baseline = { goal: goal == null ? NaN : goal };
      S.running = true;
      S.progress = { iter: 0, best: NaN, ms: 0 };
      Solve.liveHistory = [];
      const t0 = performance.now();
      let startTimer = 0;
      if (!o.quiet) {
        startTimer = setTimeout(() => { setRunning(true); S.emit('result'); animate(); }, 60);
      }
      const settings = S.solverSettings();
      const limit = settings.timeLimit * 1000;
      let raf = 0;
      function animate() {
        const el = ring.querySelector('.ring-fg');
        const p = Math.min(1, (performance.now() - t0) / limit);
        el.setAttribute('stroke-dashoffset', String(RING * (1 - p)));
        if (S.running) raf = requestAnimationFrame(animate);
      }
      try {
        const res = await W.solve(JSON.parse(JSON.stringify(S.model)), settings, (p) => {
          S.progress = p;
          if (Number.isFinite(p.best)) { Solve.liveHistory.push(p.best); best.textContent = fmt(p.best); }
          S.emit('progress', p);
        });
        clearTimeout(startTimer);
        cancelAnimationFrame(raf);
        S.running = false;
        setRunning(false);
        res.clientMs = performance.now() - t0;
        if (o.quiet) res.quiet = true;
        S.result = res;
        S.stale = false;
        S.lastSolveMs = res.clientMs;
        S.emit('result');
        document.getElementById('results-col').classList.add('is-open');
        if (!o.quiet) { announce(res); celebrate(res); }
      } catch (e) {
        clearTimeout(startTimer);
        cancelAnimationFrame(raf);
        S.running = false;
        setRunning(false);
        if (e && e.stopped) {
          S.result = { status: 'stopped', message: 'You stopped the solve.', ms: performance.now() - t0, history: Solve.liveHistory.slice(), engine: null };
          S.emit('result');
        } else {
          S.result = { status: 'error', message: e && e.message ? e.message : String(e), ms: performance.now() - t0, history: [] };
          S.emit('result');
        }
      }
      blocked();
      if (pendingLive) { pendingLive = false; Solve.liveResolve(); }
    },
    stop() { return stop(); },
    focusFirstError() { return focusFirstError(); },
    keep() {
      const r = S.result;
      if (!r || !r.values) return;
      const prev = S.model.variables.map((v) => ({ id: v.id, init: v.init }));
      S.edit((m) => {
        r.layout.forEach((L) => {
          const v = m.variables.find((x) => x.id === L.id);
          if (!v) return;
          const vals = r.values.slice(L.offset, L.offset + L.size);
          v.init = literal(vals, L.shape);
        });
      }, { undo: true });
      S.kept = prev;
      S.stale = false;
      S.emit('result');
      N.toast('Solution kept as the starting values');
    },
    restore() {
      if (!S.kept) return;
      const prev = S.kept;
      S.edit((m) => { prev.forEach((p) => { const v = m.variables.find((x) => x.id === p.id); if (v) v.init = p.init; }); }, { undo: true });
      S.kept = null;
      S.stale = false;
      S.emit('result');
      N.toast('Restored the previous starting values');
    },
    liveResolve() {
      if (!S.settings.liveResolve) return;
      if (!S.result || !S.lastSolveMs || S.lastSolveMs > 150) return;
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => Solve.run({ quiet: true }), 40);
    }
  };

  function stop() {
    if (!S.running) return false;
    W.stop();
    return true;
  }

  function announce(r) {
    const s = r.status;
    if (s === 'optimal' || s === 'feasible') return;
    if (s === 'error') N.toast(r.message || 'Could not solve', { kind: 'bad' });
  }

  function focusFirstError() {
    const L = S.live;
    if (!L) return;
    const e = L.errors;
    if (e.goal || e.target) { N.App.goal.focus(); return; }
    for (const v of S.model.variables) if (e.vars[v.id]) { N.App.decide.focusRow(v.id); return; }
    for (const c of S.model.constraints) if (e.rules[c.id]) { N.App.rules.focusRow(c.id); return; }
    for (const p of S.model.parameters) if (e.params[p.id]) { N.App.given.focusRow(p.id); return; }
  }

  S.on('live', () => btn && blocked());
  S.on('result', () => btn && blocked());
  S.on('model', (o) => { if (o && o.param && !o.slider) Solve.liveResolve(); });

  N.Solve = Solve;
})(window.Nadir);
