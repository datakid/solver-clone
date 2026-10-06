(function (N) {
  'use strict';
  const { h, icon, esc, fmt, keys, LOGO } = N.util;
  const S = N.Store;
  const E = window.Engine;
  const O = N.Overlays;

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = S.settings.theme;
    const dark = t === 'dark' || (t === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#121614' : '#3F7D6E';
    const b = document.getElementById('theme-btn');
    if (b) { b.innerHTML = icon(t === 'system' ? 'monitor' : dark ? 'moon' : 'sun'); b.dataset.tip = `Theme: ${t[0].toUpperCase() + t.slice(1)}`; }
  }
  function setTheme(v) { S.setSettings({ theme: v }, { quiet: true }); applyTheme(); }
  media.addEventListener && media.addEventListener('change', applyTheme);

  function Header() {
    const el = document.getElementById('app-header');
    const inner = h('div', { class: 'app-header-inner' });
    const brand = h('a', { class: 'brand', href: './', 'aria-label': 'Nadir home', html: LOGO + '<span class="wordmark">nadir</span>' });
    brand.addEventListener('click', (e) => e.preventDefault());
    const name = h('input', { class: 'model-name', type: 'text', value: S.model.name, 'aria-label': 'Model name', spellcheck: 'false' });
    name.addEventListener('input', () => { S.beginEdit(); S.model.name = name.value; S.edit(null, { field: 'name' }); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); name.blur(); } });
    name.addEventListener('blur', () => { if (!name.value.trim()) { S.model.name = 'Untitled model'; name.value = S.model.name; S.changed(); } S.commitEdit(); });
    const state = h('span', { class: 'save-state', 'aria-live': 'polite' }, h('span', { class: 'dot' }), h('span', { class: 'save-text' }, ''));
    const btn = (ic, tip, fn, opts) => {
      const o = opts || {};
      const b = h('button', { class: 'btn btn-ghost btn-icon' + (o.cls ? ' ' + o.cls : ''), type: 'button', 'aria-label': tip, 'data-tip': tip, 'data-tip-keys': o.keys || null, html: icon(ic), id: o.id || null });
      b.addEventListener('click', fn);
      return b;
    };
    const cmd = h('button', { class: 'btn btn-cmd', type: 'button', 'aria-label': 'Command palette', html: icon('search', 'icon-sm') + '<span class="cmd-label">Search</span>' + keys('Mod+K') });
    cmd.addEventListener('click', openPalette);
    const themeBtn = btn('monitor', 'Theme', (e) => O.menu(e.currentTarget, [
      { label: 'System', icon: 'monitor', run: () => setTheme('system') },
      { label: 'Light', icon: 'sun', run: () => setTheme('light') },
      { label: 'Dark', icon: 'moon', run: () => setTheme('dark') }
    ], { align: 'right' }), { id: 'theme-btn' });
    const wizBtn = h('button', { class: 'btn btn-soft btn-sm header-wizard', type: 'button', id: 'wizard-btn', html: icon('sparkle', 'icon-sm') + '<span>Guided setup</span>', 'data-tip': 'Build a model by answering simple questions' });
    wizBtn.addEventListener('click', () => N.Wizard.open());
    const actions = h('div', { class: 'header-actions' }, cmd,
      btn('undo', 'Undo', () => undo(), { keys: 'Mod+Z', cls: 'hide-sm' }),
      wizBtn,
      btn('library', 'Library', () => N.Drawer.open('library')),
      btn('share', 'Share link', () => N.IO.shareDialog(), { cls: 'hide-sm hide-md' }),
      btn('download', 'Export', () => N.IO.exportDialog(), { keys: 'Mod+Shift+E' }),
      btn('sliders', 'Settings', () => N.Drawer.open('settings'), { cls: 'hide-sm' }),
      themeBtn,
      btn('help', 'Help & tour', (e) => N.Help.menu(e.currentTarget), { id: 'help-btn', keys: '?' }));
    inner.append(brand, h('span', { class: 'header-sep' }), h('div', { class: 'model-name-wrap' }, name, state), actions);
    el.append(inner);
    function sync() {
      if (document.activeElement !== name && name.value !== S.model.name) name.value = S.model.name;
      const t = `${S.model.name} — Nadir`;
      if (document.title !== t) document.title = t;
    }
    function syncState() {
      const st = S.saveState();
      if (state.dataset.state === st) return;
      state.dataset.state = st;
      const txt = { saved: 'Saved', dirty: 'Edited', unsaved: 'Unsaved', draft: 'Draft' }[st];
      state.querySelector('.save-text').textContent = txt;
      state.title = { saved: 'Saved in your library', dirty: 'Changes not saved to library · autosaved locally', unsaved: 'Opened from a link or file — save to keep it', draft: 'Autosaved locally · not in library yet' }[st];
    }
    S.on('model', sync);
    S.on('name', sync);
    let stT = 0;
    S.on('dirty', () => { if (!stT) stT = setTimeout(() => { stT = 0; syncState(); }, 120); });
    S.on('library', syncState);
    sync(); syncState();
    return { syncName: sync };
  }

  function undo() { if (S.undo()) N.toast('Undone', { kind: 'info', duration: 1400 }); }
  function redo() { if (S.redo()) N.toast('Redone', { kind: 'info', duration: 1400 }); }

  function newModel() {
    const go = () => { S.replace(S.blankModel()); setTimeout(() => N.App.goal.focus(), 50); };
    const st = S.saveState();
    const has = S.model.variables.length || S.model.constraints.length || !E.isBlank(S.model.goal.expr);
    if (has && st !== 'saved') {
      O.dialog({ title: 'Start a new model?', body: `<p>“${esc(S.model.name)}” isn't saved to the library.</p>`, actions: [
        { label: 'Cancel' }, { label: 'Discard', kind: 'danger', run: go }, { label: 'Save and start new', kind: 'primary', run: () => { S.saveToLibrary(); go(); } }
      ] });
    } else go();
  }

  function shortcutSheet() {
    const list = [
      ['Solve', 'Mod+Enter'], ['Stop, or close the top overlay', 'Esc'], ['Command palette', 'Mod+K'], ['Save to library', 'Mod+S'],
      ['Export', 'Mod+Shift+E'], ['Undo / redo structure', 'Mod+Z'], ['', 'Mod+Shift+Z'], ['New rule', 'Alt+N'], ['Next rule / new rule', 'Enter'],
      ['Delete an empty row', 'Backspace'], ['Reorder a row (grip focused)', '↑'], ['Accept a suggestion', 'Tab'], ['Next / previous tour step', '→'], ['This sheet', '?']
    ];
    const g = h('div', { class: 'shortcut-list' });
    list.forEach(([t, k]) => { g.append(h('span', null, t), h('span', { class: 'keys', html: keys(k) })); });
    O.dialog({ title: 'Keyboard shortcuts', body: g });
  }

  function paletteSources() {
    const A = [];
    const act = (label, ic, run, extra) => A.push(Object.assign({ group: 'Actions', label, icon: ic, run }, extra || {}));
    act('Solve', 'play', () => N.Solve.run(), { keys: 'Mod+Enter', boost: 10 });
    act('Guided setup (no math)', 'sparkle', () => N.Wizard.open(), { keywords: 'wizard simple questions beginner start', boost: 6 });
    act('New model', 'newFile', newModel);
    act('Save to library', 'bookmark', save, { keys: 'Mod+S' });
    act('Add rule', 'plus', () => N.App.rules.add(), { keys: 'Alt+N' });
    act('Add decision variable', 'plus', () => N.App.decide.add());
    act('Add given value', 'plus', () => N.App.given.add());
    act('Paste table from Excel', 'table', () => N.IO.pasteDialog(''));
    act('Share link', 'share', () => N.IO.shareDialog());
    act('Export…', 'download', () => N.IO.exportDialog(), { keys: 'Mod+Shift+E' });
    act('Export model as .nadir.json', 'file', () => N.IO.exportJSON());
    act('Export CPLEX .lp file', 'code', () => { const r = E.toLP(S.model, S.solverSettings()); if (r.error) N.toast(r.error, { kind: 'bad' }); else N.util.download('model.lp', r.text); });
    act('Copy results for Excel', 'copy', () => N.IO.copyForExcel());
    act('Import model file', 'upload', () => N.IO.pickFile());
    act('Print report', 'printer', () => window.print());
    act('Toggle text view', 'text', () => N.App.goal.setView(S.ui.goalView === 'text' ? 'form' : 'text'), { keywords: 'form editor' });
    act('Keep solution', 'pin', () => N.Solve.keep());
    act('Save scenario', 'bookmark', () => N.Scenarios.saveCurrent());
    act('Compare scenarios', 'layers', () => N.Drawer.open('scenarios'));
    act('Parameter sweep', 'activity', () => N.Drawer.open('sweep'));
    act('Open library', 'library', () => N.Drawer.open('library'));
    act('Settings', 'sliders', () => N.Drawer.open('settings'));
    act('Preset: Fast', 'sliders', () => { S.applyPreset('fast'); N.toast('Fast preset'); });
    act('Preset: Balanced', 'sliders', () => { S.applyPreset('balanced'); N.toast('Balanced preset'); });
    act('Preset: Thorough', 'sliders', () => { S.applyPreset('thorough'); N.toast('Thorough preset'); });
    act('Theme: System', 'monitor', () => setTheme('system'));
    act('Theme: Light', 'sun', () => setTheme('light'));
    act('Theme: Dark', 'moon', () => setTheme('dark'));
    act('Undo', 'undo', undo, { keys: 'Mod+Z' });
    act('Redo', 'redo', redo, { keys: 'Mod+Shift+Z' });
    act('Keyboard shortcuts', 'keyboard', shortcutSheet, { keys: '?' });
    act('Run test suite', 'flask', runTests);
    act('Download Nadir as one file', 'box', () => N.Build.download(), { keywords: 'single html offline build portable' });
    act('Install Nadir as an app', 'download', () => N.PWA.install(), { keywords: 'pwa offline install home screen' });
    act('Check for update', 'restore', () => N.PWA.checkUpdate(), { keywords: 'version service worker' });
    act('Show sensitivity ranges', 'sliders', () => { S.saveUI({ showAdvancedResults: true, showSensitivity: true }); S.emit('result'); }, { keywords: 'ranging allowable increase decrease shadow' });
    act('Take the guided tour', 'compass', () => N.Tour.start(), { keywords: 'help onboarding learn intro' });
    act('Language guide', 'book', () => N.Help.guide(), { keywords: 'help syntax docs' });
    act('Function reference', 'function', () => N.Help.guide('functions'), { keywords: 'help sum dot rowsum' });
    act('Reading the results', 'info', () => N.Help.guide('results'), { keywords: 'help optimal binding slack shadow' });
    act(S.settings.explain ? 'Hide plain-English lines' : 'Show plain-English lines', 'quote', () => { S.setSettings({ explain: !S.settings.explain }); N.Live.flush(); }, { keywords: 'explain words sentence' });
    N.Templates.list.forEach((t) => A.push({ group: 'Templates', label: `Template: ${t.name}`, icon: 'layers', hint: t.kind, run: () => N.Templates.open(t.key), keywords: t.note.join(' ') }));
    S.library.forEach((m) => A.push({ group: 'Library', label: m.name, icon: 'file', hint: N.util.timeAgo(m.updatedAt), run: () => { S.replace(JSON.parse(JSON.stringify(m))); N.toast(`Opened ${m.name}`, { kind: 'info' }); } }));
    return A;
  }
  function openPalette() { if (O.hasLayer()) O.closeTop(); O.palette(paletteSources); }

  function save() {
    S.saveToLibrary();
    N.toast(`Saved “${S.model.name}” to library`);
  }

  function shortcuts() {
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (mod && k === 'Enter') { e.preventDefault(); if (O.hasLayer() && !N.Drawer.isOpen) return; N.Solve.run(); return; }
      if (mod && (k === 'k' || k === 'K')) { e.preventDefault(); openPalette(); return; }
      if (mod && (k === 's' || k === 'S') && !e.shiftKey) { e.preventDefault(); save(); return; }
      if (mod && e.shiftKey && (k === 'e' || k === 'E')) { e.preventDefault(); N.IO.exportDialog(); return; }
      if (k === 'Escape') {
        if (N.Field.autocomplete.open) return;
        if (O.hasLayer()) { e.preventDefault(); O.closeTop(); return; }
        if (S.running) { e.preventDefault(); N.Solve.stop(); return; }
        if (typing && t.blur) t.blur();
        return;
      }
      if (e.altKey && !mod && (e.code === 'KeyN')) { e.preventDefault(); if (!O.hasLayer()) N.App.rules.add(); return; }
      if (O.hasLayer()) return;
      if (mod && (k === 'z' || k === 'Z') && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && (k === 'y' || k === 'Y') && !typing) { e.preventDefault(); redo(); return; }
      if (k === '?' && !typing) { e.preventDefault(); shortcutSheet(); }
    });
  }

  function runTests() {
    const box = h('div', { class: 'test-list' }, h('p', null, 'Running…'));
    const dlg = O.dialog({ title: 'Test suite', body: box, size: 'lg' });
    setTimeout(async () => {
      const results = E.runTests();
      const t0 = performance.now();
      let workerOk = true, workerMs = 0;
      try {
        const r = await N.WorkerHost.solve({ goal: { sense: 'max', expr: '3x+5y' }, variables: [{ id: 'a', name: 'x', shape: '1' }, { id: 'b', name: 'y', shape: '1' }], constraints: [{ id: 'c', expr: 'x<=4' }, { id: 'd', expr: '2y<=12' }, { id: 'e', expr: '3x+2y<=18' }], parameters: [] }, {});
        workerOk = r.status === 'optimal' && Math.abs(r.objective - 36) < 1e-6;
        workerMs = performance.now() - t0;
      } catch (e) { workerOk = false; }
      results.push({ name: `Worker round-trip (${N.WorkerHost.inWorker ? 'Web Worker' : 'fallback'})`, ok: workerOk, detail: workerOk ? '' : 'Worker solve failed', ms: Math.round(workerMs) });
      const tt = performance.now();
      const tpl = [];
      for (const t of N.Templates.list) {
        try {
          const r = await N.WorkerHost.solve(JSON.parse(JSON.stringify(N.Templates.build(t))), {});
          if (r.status !== 'optimal') tpl.push(`${t.name}: ${r.status}`);
        } catch (e) { tpl.push(`${t.name}: ${e.message}`); }
      }
      results.push({ name: `Templates · all ${N.Templates.list.length} solve Optimal`, ok: !tpl.length, detail: tpl.join('\n'), ms: Math.round(performance.now() - tt) });
      const tp = performance.now();
      const big = S.blankModel();
      big.variables = [{ id: 'v', name: 'x', shape: '1000', type: 'real', lower: '', upper: '', init: '', labels: [] }];
      big.parameters = [{ id: 'p', name: 'w', expr: '1..1000', slider: null }];
      big.goal.expr = 'sum(w * x)';
      big.constraints = [{ id: 'c', label: '', expr: 'sum(x) <= 10', enabled: true }];
      for (let k = 0; k < 5; k++) { const C = E.compile(big); E.check(C); }
      const perMs = (performance.now() - tp) / 5;
      results.push({ name: `Live check · 1,000-term model (${perMs.toFixed(1)} ms)`, ok: perMs < 15, detail: perMs < 15 ? '' : 'Slower than budget', ms: Math.round(perMs) });
      const pass = results.filter((r) => r.ok).length;
      box.textContent = '';
      box.append(h('div', { class: 'test-summary', html: icon(pass === results.length ? 'check' : 'alert') + `${pass} of ${results.length} passed` }));
      results.forEach((r) => {
        const it = h('div', { class: 'test-item ' + (r.ok ? 'ok' : 'bad'), html: icon(r.ok ? 'check' : 'x') + `<span>${esc(r.name)}</span><span class="faint num">${r.ms} ms</span>` });
        if (!r.ok) it.append(h('pre', null, r.detail));
        box.append(it);
      });
      window.__nadirTests = { pass, total: results.length, results };
      console.log(`Nadir tests: ${pass}/${results.length} passed`);
      results.filter((r) => !r.ok).forEach((r) => console.warn('FAIL', r.name, r.detail));
    }, 30);
    return dlg;
  }

  async function boot() {
    S.load();
    applyTheme();
    const header = Header();
    N.Header = header;
    const col = document.getElementById('model-col');
    const goal = N.Cards.GoalCard();
    const decide = N.Cards.DecideCard();
    const rules = N.Cards.RulesCard();
    const given = N.Cards.GivenCard();
    col.append(goal.el, decide.el, rules.el, given.el);
    N.Cards.focusFirstRule = () => rules.focusFirst();
    const dock = document.getElementById('solve-dock');
    dock.append(N.Solve.button());
    N.App = { goal, decide, rules, given, newModel, setTheme, runTests, shortcutSheet };
    S.on('view', (v) => { [decide.el, rules.el, given.el].forEach((el) => { el.hidden = v === 'text'; }); });
    if (S.ui.goalView === 'text') [decide.el, rules.el, given.el].forEach((el) => { el.hidden = true; });
    const resCol = document.getElementById('results-col');
    N.Results.ResultsPanel(resCol);
    O.tooltips();
    shortcuts();
    N.IO.dropZone();
    await N.IO.openFromHash();
    window.addEventListener('hashchange', () => N.IO.openFromHash());
    S.emit('structure', { all: true });
    S.emit('model', { all: true });
    N.Live.flush();
    N.WorkerHost.warm();
    N.PWA.register();
    window.addEventListener('beforeunload', () => S.flushSave());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') S.flushSave(); });
    const qs = new URLSearchParams(location.search);
    if (qs.get('template')) { N.Templates.open(qs.get('template'), { quiet: qs.has('solve') }); N.Live.flush(); }
    if (qs.has('text')) goal.setView('text');
    if (qs.has('solve')) setTimeout(() => N.Solve.run(), 50);
    if (qs.has('theme')) setTheme(qs.get('theme'));
    if (qs.has('tour')) setTimeout(() => N.Tour.start(), 120);
    if (qs.has('guide')) N.Help.guide(qs.get('guide') || undefined);
    if (qs.has('wizard')) setTimeout(() => N.Wizard.open(qs.get('wizard') || undefined), 60);
    if (qs.has('test')) runTests();
    else if (!qs.has('tour') && !S.model.variables.length && E.isBlank(S.model.goal.expr) && !S.library.length && window.matchMedia('(min-width: 1101px)').matches) goal.focus();
    document.body.classList.add('is-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.Nadir);
