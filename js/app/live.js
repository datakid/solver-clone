(function (N) {
  'use strict';
  const S = N.Store;
  const E = window.Engine;

  let scheduled = 0;
  let lastMs = 0;

  function run() {
    scheduled = 0;
    const t0 = performance.now();
    let C;
    try {
      C = E.compile(S.model, { nonNegative: S.settings.nonNegative !== false });
    } catch (e) {
      console.error(e);
      return;
    }
    let check = null, cls = null;
    try { check = E.check(C); } catch (e) { check = null; }
    cls = E.classify(C, S.solverSettings());
    S.compiled = C;
    S.live = { check, cls, errors: C.errors, errorCount: C.errorCount };
    lastMs = performance.now() - t0;
    N.Field.setSymbols(symbols);
    S.emit('live', S.live);
  }

  function symbols() {
    const C = S.compiled;
    const vars = [], params = [];
    if (C) {
      C.vars.forEach((v) => vars.push({ name: v.name, desc: (v.shape.length ? E.shapeText(v.shape) + ' · ' : '') + ({ real: 'real', int: 'integer', bin: 'binary' })[v.type] }));
      const byName = new Map(C.params.map((p) => [p.name, p]));
      S.model.parameters.forEach((p) => {
        const nm = p.name.trim();
        if (!nm) return;
        const cp = byName.get(nm);
        let desc = 'given';
        if (cp) desc = cp.shape.length ? E.shapeText(cp.shape) : N.util.fmt(cp.values[0]);
        params.push({ name: nm, desc });
      });
    }
    S.model.variables.forEach((v) => { const nm = v.name.trim(); if (nm && !vars.some((x) => x.name === nm)) vars.push({ name: nm, desc: 'decision' }); });
    return { vars, params };
  }

  function schedule() {
    if (scheduled) return;
    const delay = lastMs > 12 ? 120 : 30;
    scheduled = setTimeout(() => requestAnimationFrame(run), delay);
  }

  function flush() {
    if (scheduled) { clearTimeout(scheduled); scheduled = 0; }
    run();
  }

  S.on('model', schedule);
  S.on('settings', (p) => { if (p && 'explain' in p) schedule(); });
  N.Live = { schedule, flush, get ms() { return lastMs; } };
})(window.Nadir);
