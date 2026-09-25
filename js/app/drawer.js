(function (N) {
  'use strict';
  const { h, icon, esc, fmt, timeAgo, download, toCSV, fuzzy } = N.util;
  const S = N.Store;
  const E = window.Engine;
  const O = N.Overlays;

  const TABS = [
    { key: 'library', label: 'Library' },
    { key: 'templates', label: 'Templates' },
    { key: 'scenarios', label: 'Scenarios' },
    { key: 'sweep', label: 'Sweep' },
    { key: 'settings', label: 'Settings' }
  ];

  let root = null, bodyEl = null, tabEls = {}, current = 'library', layer = null, prevFocus = null;

  function open(tab) {
    if (tab) current = tab;
    if (root) { select(current); return; }
    prevFocus = document.activeElement;
    const scrim = h('div', { class: 'scrim' });
    const dr = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Workspace' });
    const title = h('h2', null, 'Workspace');
    const x = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Close', html: icon('x') });
    x.addEventListener('click', close);
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    tabEls = {};
    TABS.forEach((t) => {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', id: 'tab-' + t.key }, t.label);
      b.addEventListener('click', () => select(t.key));
      tabs.append(b);
      tabEls[t.key] = b;
    });
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = TABS.findIndex((t) => t.key === current);
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      select(TABS[j].key); tabEls[TABS[j].key].focus();
    });
    bodyEl = h('div', { class: 'drawer-body', role: 'tabpanel' });
    dr.append(h('div', { class: 'drawer-head' }, title, x), tabs, bodyEl);
    scrim.addEventListener('click', close);
    root = h('div', null, scrim, dr);
    document.getElementById('overlay-root').append(root);
    layer = { close };
    O.pushLayer(layer);
    dr.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else O.trapFocus(dr, e); });
    select(current);
    requestAnimationFrame(() => tabEls[current].focus());
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    O.popLayer(layer);
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }

  function select(key) {
    current = key;
    Object.entries(tabEls).forEach(([k, b]) => { b.setAttribute('aria-selected', String(k === key)); b.tabIndex = k === key ? 0 : -1; });
    bodyEl.setAttribute('aria-labelledby', 'tab-' + key);
    bodyEl.replaceChildren(PANELS[key]());
  }

  function refresh() { if (root) select(current); }
  S.on('library', () => { if (current === 'library') refresh(); });
  S.on('scenarios', () => { if (current === 'scenarios') refresh(); });

  function section(title, ...kids) {
    return h('section', { class: 'drawer-section' }, title ? h('h3', { class: 'label-caps' }, title) : null, ...kids);
  }

  function library() {
    const wrap = h('div');
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search models', 'aria-label': 'Search library' });
    const sb = h('div', { class: 'search-box', html: icon('search') });
    sb.append(search);
    const newBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', html: icon('newFile', 'icon-sm') + 'New model' });
    newBtn.addEventListener('click', () => { N.App.newModel(); close(); });
    const saveBtn = h('button', { class: 'btn btn-soft btn-sm', type: 'button', html: icon('bookmark', 'icon-sm') + (S.inLibrary() ? 'Save changes' : 'Save current') });
    saveBtn.addEventListener('click', () => { S.saveToLibrary(); N.toast('Saved to library'); refresh(); });
    const imp = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('upload', 'icon-sm') + 'Import' });
    imp.addEventListener('click', () => N.IO.pickFile());
    const exp = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('download', 'icon-sm') + 'Export all', disabled: !S.library.length });
    exp.addEventListener('click', () => download('nadir-library.json', JSON.stringify(S.library.map(S.serialize), null, 2), 'application/json'));
    const list = h('div', { class: 'list' });
    function render() {
      const q = search.value.trim();
      list.textContent = '';
      let items = S.library.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (q) items = items.map((m) => ({ m, r: fuzzy(q, m.name + ' ' + (m.notes || '')) })).filter((x) => x.r).sort((a, b) => b.r.score - a.r.score).map((x) => x.m);
      if (!items.length) { list.append(h('p', { class: 'empty-hint' }, S.library.length ? 'No matches' : 'Saved models appear here. Press ' + N.util.MOD + 'S to save the current one.')); return; }
      items.forEach((m) => {
        const it = h('div', { class: 'list-item' + (m.id === S.model.id ? ' is-current' : '') });
        const openB = h('button', { class: 'list-item-open', type: 'button' });
        const nV = (m.variables || []).length, nR = (m.constraints || []).length;
        openB.innerHTML = `<span class="list-item-title">${esc(m.name)}</span><span class="list-item-sub">${esc(timeAgo(m.updatedAt))} · ${nV} ${nV === 1 ? 'decision' : 'decisions'} · ${nR} ${nR === 1 ? 'rule' : 'rules'}</span>`;
        openB.addEventListener('click', () => openModel(m));
        const acts = h('div', { class: 'list-item-actions' });
        const mk = (ic, label, fn, cls) => { const b = h('button', { class: 'btn btn-ghost btn-icon btn-sm' + (cls ? ' ' + cls : ''), type: 'button', 'aria-label': label, 'data-tip': label, html: icon(ic, 'icon-sm') }); b.addEventListener('click', fn); return b; };
        acts.append(
          mk('edit', 'Rename', async () => { const nm = await O.prompt('Rename model', m.name, { ok: 'Rename' }); if (nm) S.updateLibraryItem(m.id, { name: nm }); }),
          mk('duplicate', 'Duplicate', () => { const c = JSON.parse(JSON.stringify(m)); c.id = E.uid('m_'); c.name = m.name + ' copy'; c.updatedAt = Date.now(); S.library.unshift(c); N.util.store('nadir:library', S.library); S.emit('library'); N.toast('Duplicated'); }),
          mk('trash', 'Delete', () => { const gone = S.removeFromLibrary(m.id); if (gone) N.toast(`Deleted ${m.name}`, { action: { label: 'Undo', run: () => S.restoreToLibrary(gone) } }); }, 'btn-danger')
        );
        it.append(openB, acts);
        list.append(it);
      });
    }
    search.addEventListener('input', render);
    render();
    wrap.append(sb, h('div', { class: 'preset-row', style: { marginBottom: '14px' } }, saveBtn, newBtn, imp, exp), list);
    setTimeout(() => S.library.length > 4 && search.focus(), 0);
    return wrap;
  }

  function openModel(m) {
    const st = S.saveState();
    const go = () => { S.replace(JSON.parse(JSON.stringify(m))); close(); N.toast(`Opened ${m.name}`, { kind: 'info' }); };
    if ((st === 'dirty' || st === 'unsaved' || (st === 'draft' && hasContent())) && m.id !== S.model.id) {
      O.dialog({ title: 'Open another model?', body: `<p>“${esc(S.model.name)}” has changes that aren't in the library.</p>`, actions: [
        { label: 'Cancel' },
        { label: 'Discard', kind: 'danger', run: () => { go(); } },
        { label: 'Save and open', kind: 'primary', run: () => { S.saveToLibrary(); go(); } }
      ] });
    } else go();
  }
  function hasContent() { return S.model.variables.length || S.model.constraints.length || !E.isBlank(S.model.goal.expr); }

  function templates() {
    const wrap = h('div', { class: 'list' });
    N.Templates.list.forEach((t) => {
      const b = h('button', { class: 'template-card template-card-wide', type: 'button' });
      b.innerHTML = `<span class="template-ic">${icon(t.icon || 'layers', 'icon-sm')}</span><strong>${esc(t.name)}<span class="chip">${esc(t.kind)}</span></strong><span>${esc(t.note[0])}</span><span class="faint">${esc(t.note[1])}</span>`;
      b.addEventListener('click', () => {
        if (hasContent() && S.saveState() !== 'saved') {
          O.dialog({ title: `Open ${t.name}?`, body: '<p>The current model has unsaved changes.</p>', actions: [{ label: 'Cancel' }, { label: 'Discard', kind: 'danger', run: () => N.Templates.open(t.key) }, { label: 'Save and open', kind: 'primary', run: () => { S.saveToLibrary(); N.Templates.open(t.key); } }] });
        } else N.Templates.open(t.key);
      });
      wrap.append(b);
    });
    return wrap;
  }

  function scenarios() {
    const wrap = h('div');
    const list = S.model.scenarios || [];
    const save = h('button', { class: 'btn btn-soft btn-sm', type: 'button', html: icon('bookmark', 'icon-sm') + 'Save current result', disabled: !(S.result && S.result.values) });
    save.addEventListener('click', () => N.Scenarios.saveCurrent());
    wrap.append(h('div', { class: 'preset-row', style: { marginBottom: '14px' } }, save));
    if (!list.length) {
      wrap.append(h('p', { class: 'empty-hint' }, 'A scenario stores a result together with the given values that produced it. Save a few, then compare them side by side.'));
      return wrap;
    }
    const selected = new Set(list.map((s) => s.id));
    const cmp = h('div', { class: 'cmp-wrap' });
    function table() {
      const sel = list.filter((s) => selected.has(s.id));
      const keys = [];
      const seen = new Set();
      sel.forEach((s) => (s.decisions || []).forEach((d) => { if (!seen.has(d.name)) { seen.add(d.name); keys.push(d.name); } }));
      const params = [];
      const pseen = new Set();
      sel.forEach((s) => Object.keys(s.params || {}).forEach((k) => { if (!pseen.has(k) && sel.some((o) => o.params[k] !== s.params[k])) { pseen.add(k); params.push(k); } }));
      const sense = S.model.goal.sense;
      const objs = sel.map((s) => s.objective).filter(Number.isFinite);
      const bestV = sense === 'min' ? Math.min(...objs) : Math.max(...objs);
      let html = '<table class="cmp-table"><thead><tr><th></th>' + sel.map((s) => `<th>${esc(s.name)}</th>`).join('') + '</tr></thead><tbody>';
      html += '<tr><td>Objective</td>' + sel.map((s) => `<td class="${sense !== 'target' && s.objective === bestV && sel.length > 1 ? 'best' : ''}">${esc(fmt(s.objective))}</td>`).join('') + '</tr>';
      html += '<tr><td>Status</td>' + sel.map((s) => `<td>${esc(s.status)}</td>`).join('') + '</tr>';
      params.forEach((k) => { html += `<tr><td class="mono">${esc(k)}</td>` + sel.map((s) => `<td class="mono">${esc(s.params[k] == null ? '—' : String(s.params[k]).slice(0, 18))}</td>`).join('') + '</tr>'; });
      keys.slice(0, 24).forEach((k) => { html += `<tr><td class="mono">${esc(k)}</td>` + sel.map((s) => { const d = (s.decisions || []).find((x) => x.name === k); return `<td>${d ? esc(fmt(d.value)) : '—'}</td>`; }).join('') + '</tr>'; });
      html += '</tbody></table>';
      cmp.innerHTML = sel.length ? html : '<p class="empty-hint">Select scenarios to compare</p>';
    }
    const items = h('div', { class: 'list' });
    list.forEach((s) => {
      const it = h('div', { class: 'list-item' });
      const left = h('label', { class: 'check-row', style: { minWidth: 0 } });
      const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Include in comparison' });
      cb.addEventListener('change', () => { if (cb.checked) selected.add(s.id); else selected.delete(s.id); table(); });
      left.append(cb, h('span', { class: 'list-item-open' }, h('span', { class: 'list-item-title' }, s.name), h('span', { class: 'list-item-sub' }, `${fmt(s.objective)} · ${timeAgo(s.at)}`)));
      const acts = h('div', { class: 'list-item-actions' });
      const apply = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-tip': 'Apply these given values and decisions' }, 'Apply');
      apply.addEventListener('click', () => N.Scenarios.apply(s));
      const del = h('button', { class: 'btn btn-ghost btn-icon btn-sm btn-danger', type: 'button', 'aria-label': 'Delete scenario', html: icon('trash', 'icon-sm') });
      del.addEventListener('click', () => { S.edit((m) => { m.scenarios = m.scenarios.filter((x) => x.id !== s.id); }, { undo: true }); S.emit('scenarios'); N.toast(`Deleted ${s.name}`, { action: { label: 'Undo', run: () => { S.undo(); S.emit('scenarios'); } } }); });
      acts.append(apply, del);
      it.append(left, acts);
      items.append(it);
    });
    table();
    const csv = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('download', 'icon-sm') + 'Comparison CSV' });
    csv.addEventListener('click', () => {
      const sel = list.filter((s) => selected.has(s.id));
      const names = [...new Set(sel.flatMap((s) => (s.decisions || []).map((d) => d.name)))];
      const rows = [['', ...sel.map((s) => s.name)], ['objective', ...sel.map((s) => s.objective)], ...names.map((n) => [n, ...sel.map((s) => { const d = (s.decisions || []).find((x) => x.name === n); return d ? d.value : ''; })])];
      download('scenarios.csv', toCSV(rows), 'text/csv');
    });
    wrap.append(section('Saved', items), section('Compare', cmp, h('div', { style: { marginTop: '10px' } }, csv)));
    return wrap;
  }

  function sweep() {
    const wrap = h('div');
    const C = S.compiled;
    const scal = C ? C.params.filter((p) => p.shape.length === 0) : [];
    if (!scal.length) { wrap.append(h('p', { class: 'empty-hint' }, 'Sweep re-solves the model while one single-number given value moves across a range. Add a scalar value under Given to start.')); return wrap; }
    const sel = h('select', { class: 'input', 'aria-label': 'Parameter' });
    sel.innerHTML = scal.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (now ${esc(fmt(p.values[0]))})</option>`).join('');
    const from = h('input', { class: 'input', type: 'number', 'aria-label': 'From' });
    const to = h('input', { class: 'input', type: 'number', 'aria-label': 'To' });
    const steps = h('input', { class: 'input', type: 'number', min: '5', max: '50', value: '20', 'aria-label': 'Steps' });
    const setRange = () => {
      const p = scal.find((q) => q.name === sel.value);
      const mp = S.model.parameters.find((q) => q.name === sel.value);
      const v = p.values[0];
      if (mp && mp.slider) { from.value = mp.slider.min; to.value = mp.slider.max; }
      else { from.value = +(v * 0.5).toPrecision(4) || 0; to.value = +(v * 1.5).toPrecision(4) || 10; }
    };
    sel.addEventListener('change', setRange);
    setRange();
    const run = h('button', { class: 'btn btn-primary btn-sm', type: 'button', html: icon('play', 'icon-sm') + 'Run sweep' });
    const chartBox = h('div', { class: 'chart chart-tall', hidden: true });
    const cv = h('canvas', { role: 'img', 'aria-label': 'Objective versus parameter' });
    chartBox.append(cv);
    const meta = h('div', { class: 'chart-meta' });
    const tbl = h('div', { class: 'cmp-wrap' });
    const csv = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true, html: icon('download', 'icon-sm') + 'Export CSV' });
    let results = [];
    const lab = (t, el) => h('label', null, h('span', { class: 'field-label' }, t), el);
    wrap.append(
      h('p', { class: 'field-hint', style: { marginTop: 0, marginBottom: '14px' } }, 'Solve the model at evenly spaced values of one given and plot the best goal at each.'),
      h('div', { class: 'sweep-form' }, h('label', { class: 'full' }, h('span', { class: 'field-label' }, 'Given value'), sel), lab('From', from), lab('To', to), lab('Steps', steps)),
      h('div', { style: { margin: '14px 0' }, class: 'preset-row' }, run, csv), chartBox, meta, tbl);
    function paint() {
      const pts = results.filter((r) => r.objective != null && (r.status === 'optimal' || r.status === 'feasible')).map((r) => [r.param, r.objective]);
      chartBox.hidden = false;
      N.Results.drawChart(cv, pts, { dots: true, axes: true, left: 8, mark: -1 });
      const n = results.length;
      meta.innerHTML = n ? `<span>${esc(sel.value)} = ${esc(fmt(results[0].param))}</span><span>${n} solved</span><span>${esc(fmt(results[n - 1].param))}</span>` : '';
      tbl.innerHTML = '<table class="cmp-table"><thead><tr><th>' + esc(sel.value) + '</th><th>Objective</th><th>Status</th></tr></thead><tbody>' + results.map((r) => `<tr><td>${esc(fmt(r.param))}</td><td>${esc(r.objective == null ? '—' : fmt(r.objective))}</td><td>${esc(r.status)}</td></tr>`).join('') + '</tbody></table>';
    }
    run.addEventListener('click', async () => {
      if (N.WorkerHost.busy) { N.WorkerHost.stop(); return; }
      if (S.live && S.live.errorCount) { N.toast('Fix the highlighted lines first', { kind: 'bad' }); return; }
      const a = +from.value, b = +to.value, n = Math.max(5, Math.min(50, Math.round(+steps.value || 20)));
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) { N.toast('Enter a range', { kind: 'bad' }); return; }
      const vals = Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)).map((v) => +v.toPrecision(10));
      results = [];
      run.innerHTML = icon('stop', 'icon-sm') + 'Stop';
      csv.hidden = true;
      paint();
      try {
        await N.WorkerHost.sweep(JSON.parse(JSON.stringify(S.model)), S.solverSettings(), sel.value, vals, (step) => { results.push(step); paint(); });
        csv.hidden = false;
      } catch (e) {
        if (!e.stopped) N.toast(e.message, { kind: 'bad' });
        csv.hidden = !results.length;
      }
      run.innerHTML = icon('play', 'icon-sm') + 'Run sweep';
    });
    csv.addEventListener('click', () => {
      const names = [];
      const L = S.result && S.result.layout;
      if (L) L.forEach((v) => { for (let i = 0; i < v.size; i++) names.push(E.elementName(v, i)); });
      const rows = [[sel.value, 'objective', 'status', ...names], ...results.map((r) => [r.param, r.objective == null ? '' : r.objective, r.status, ...(r.values && names.length === r.values.length ? r.values : [])])];
      download(`sweep-${sel.value}.csv`, toCSV(rows), 'text/csv');
    });
    return wrap;
  }

  function settings() {
    const s = S.settings;
    const wrap = h('div');
    const presetRow = h('div', { class: 'preset-row' });
    const allPresets = [...Object.entries(E.PRESETS).map(([k, p]) => ({ key: k, label: p.label })), ...S.presets];
    allPresets.forEach((p) => {
      const b = h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-pressed': String(s.preset === p.key) }, p.label);
      b.addEventListener('click', () => { S.applyPreset(p.key); refresh(); });
      if (p.custom) {
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); O.menu(b, [{ label: 'Delete preset', icon: 'trash', danger: true, run: () => { S.deletePreset(p.key); refresh(); } }]); });
        b.dataset.tip = 'Right-click to delete';
      }
      presetRow.append(b);
    });
    const savePreset = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('plus', 'icon-sm') + 'Save as preset' });
    savePreset.addEventListener('click', async () => { const nm = await O.prompt('Save settings as preset', '', { placeholder: 'e.g. Overnight', ok: 'Save' }); if (nm) { S.savePreset(nm); refresh(); N.toast(`Preset “${nm}” saved`); } });
    presetRow.append(savePreset);

    const num = (key, label, attrs, hint) => {
      const i = h('input', Object.assign({ class: 'input', type: 'number', value: s[key], 'aria-label': label }, attrs || {}));
      i.addEventListener('change', () => { const v = +i.value; if (Number.isFinite(v)) { S.setSettings({ [key]: v, preset: customPreset(key) }); markPreset(); } });
      return h('label', null, h('span', { class: 'field-label' }, label), i, hint ? h('div', { class: 'field-hint' }, hint) : null);
    };
    const sel = (key, label, options, hint) => {
      const i = h('select', { class: 'input', 'aria-label': label });
      i.innerHTML = options.map(([v, t]) => `<option value="${esc(v)}"${String(s[key]) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');
      i.addEventListener('change', () => { S.setSettings({ [key]: i.value }); });
      return h('label', null, h('span', { class: 'field-label' }, label), i, hint ? h('div', { class: 'field-hint' }, hint) : null);
    };
    const toggle = (key, title, sub) => {
      const sw = N.List.switchEl(s[key] !== false, (v) => S.setSettings({ [key]: v }), title);
      return h('div', { class: 'setting-toggle' }, h('div', null, h('strong', null, title), h('span', null, sub)), sw.el);
    };
    function customPreset(changed) {
      const p = E.PRESETS[s.preset];
      return p && ['tol', 'timeLimit', 'multistart', 'gap', 'patience'].includes(changed) ? 'custom' : s.preset;
    }
    function markPreset() { presetRow.querySelectorAll('.btn[aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', 'false')); }

    const theme = N.List.segmented([{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], s.theme, (v) => N.App.setTheme(v));
    const dec = h('select', { class: 'input', 'aria-label': 'Decimals' });
    dec.innerHTML = ['auto', 0, 1, 2, 3, 4, 5, 6, 8, 10].map((d) => `<option value="${d}"${String(s.decimals) === String(d) ? ' selected' : ''}>${d === 'auto' ? 'Auto' : d}</option>`).join('');
    dec.addEventListener('change', () => { S.setSettings({ decimals: dec.value === 'auto' ? 'auto' : +dec.value }); S.emit('result'); N.Live.flush(); });

    wrap.append(
      section('Preset', presetRow),
      section('Engine', h('div', { class: 'settings-grid' },
        h('div', { class: 'full' }, sel('engine', 'Engine', [['auto', 'Auto — pick the right one'], ['simplex', 'Simplex / Branch & Bound (linear only)'], ['nonlinear', 'Nonlinear — ALM + L-BFGS'], ['evolutionary', 'Evolutionary — differential evolution']])),
        num('tol', 'Tolerance', { step: 'any', min: '0' }),
        num('timeLimit', 'Time limit (s)', { step: '1', min: '0.1' }),
        num('multistart', 'Multistart', { step: '1', min: '1', max: '64' }, 'Nonlinear starting points'),
        num('gap', 'Integer gap', { step: 'any', min: '0' }, 'Fraction — 0.01 means 1%'),
        num('patience', 'DE patience', { step: '10', min: '10' }, 'Generations without progress'),
        num('seed', 'Seed', { step: '1' }, 'Makes random engines repeatable'),
        num('maxIter', 'Max iterations', { step: '1000', min: '100' }),
        num('nodeLimit', 'Node limit', { step: '1000', min: '10' }))),
      section('Behaviour',
        toggle('nonNegative', 'Unbounded decisions are non-negative', 'Like Excel Solver. Type -inf as a lower bound to allow negatives.'),
        toggle('liveResolve', 'Live re-solve', 'Re-solve as sliders and given values change, when the last solve took under 150 ms.'),
        toggle('explain', 'Plain-English lines', 'Repeat the goal and each rule back as a sentence, and summarise results in plain words.')),
      section('Help', h('div', { class: 'preset-row' },
        (() => { const b = h('button', { class: 'btn btn-outline btn-sm', type: 'button', html: icon('compass', 'icon-sm') + 'Take the tour' }); b.addEventListener('click', () => { close(); N.Tour.start(); }); return b; })(),
        (() => { const b = h('button', { class: 'btn btn-outline btn-sm', type: 'button', html: icon('book', 'icon-sm') + 'Language guide' }); b.addEventListener('click', () => { close(); N.Help.guide(); }); return b; })())),
      section('Display', h('div', { class: 'settings-grid' },
        h('div', { class: 'full' }, h('span', { class: 'field-label' }, 'Theme'), theme.el),
        h('label', null, h('span', { class: 'field-label' }, 'Decimals'), dec))),
      section('About', h('p', { class: 'field-hint', html: `Nadir runs entirely in this browser. Models are saved locally. Solves run in a ${N.WorkerHost.inWorker ? 'background worker' : 'fallback thread'}. <a href="?test" style="color:var(--accent-strong)">Run the test suite</a>.` }))
    );
    return wrap;
  }

  const PANELS = { library, templates, scenarios, sweep, settings };

  N.Scenarios = {
    async saveCurrent() {
      const r = S.result;
      if (!r || !r.values) { N.toast('Solve first to save a scenario', { kind: 'info' }); return; }
      const n = (S.model.scenarios || []).length + 1;
      const name = await O.prompt('Save scenario', `Scenario ${n}`, { ok: 'Save' });
      if (!name) return;
      const params = {};
      S.model.parameters.forEach((p) => { if (p.name.trim()) params[p.name.trim()] = p.expr; });
      const decisions = [];
      r.layout.forEach((v) => { for (let i = 0; i < v.size; i++) decisions.push({ name: E.elementName(v, i), value: r.values[v.offset + i] }); });
      const sc = { id: E.uid('s'), name, at: Date.now(), objective: r.objective, status: r.status, params, decisions: decisions.slice(0, 500), values: r.values.slice(0, 5000), layout: r.layout.map((v) => ({ id: v.id, offset: v.offset, size: v.size, shape: v.shape })) };
      S.edit((m) => { m.scenarios = (m.scenarios || []).concat([sc]); }, { undo: true });
      S.emit('scenarios');
      N.toast(`Saved ${name}`, { action: { label: 'Compare', run: () => open('scenarios') } });
    },
    apply(sc) {
      S.edit((m) => {
        m.parameters.forEach((p) => { const k = p.name.trim(); if (k in sc.params) p.expr = sc.params[k]; });
        (sc.layout || []).forEach((L) => {
          const v = m.variables.find((x) => x.id === L.id);
          if (v && sc.values) v.init = N.util.literal(sc.values.slice(L.offset, L.offset + L.size), L.shape);
        });
      }, { undo: true });
      N.toast(`Applied ${sc.name}`, { action: { label: 'Undo', run: () => S.undo() } });
    }
  };

  N.Drawer = { open, close, refresh, get isOpen() { return !!root; } };
})(window.Nadir);
