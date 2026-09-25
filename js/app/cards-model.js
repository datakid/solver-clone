(function (N) {
  'use strict';
  const { h, icon, esc, fmt, debounce, keys } = N.util;
  const { keyedList, sortable, move, segmented, textInput } = N.List;
  const S = N.Store;
  const E = window.Engine;

  function shell(id, title, opts) {
    const o = opts || {};
    const el = h('section', { class: 'card', id, 'aria-labelledby': id + '-title' });
    const head = h('header', { class: 'card-head' });
    const label = h('h2', { class: 'label-caps', id: id + '-title' }, title);
    const count = h('span', { class: 'chip', 'aria-label': 'count' }, '0');
    if (o.count !== false) label.append(count);
    const actions = h('div', { class: 'card-head-actions' });
    head.append(label, actions);
    const body = h('div', { class: 'card-body' });
    el.append(head, body);
    let foot = null;
    if (o.foot) { foot = h('footer', { class: 'card-foot', 'aria-live': 'polite' }); el.append(foot); }
    return { el, head, actions, body, foot, count, setCount(n) { if (count.textContent !== String(n)) count.textContent = String(n); } };
  }

  function editField(item, key) {
    return (v) => { S.beginEdit(); item()[key] = v; S.edit(null, { field: key }); };
  }
  function commitOnBlur(el) { el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) S.commitEdit(); }); }

  function GoalCard() {
    const c = shell('goal-card', 'Goal', { count: false });
    const view = segmented([{ value: 'form', label: 'Form' }, { value: 'text', label: 'Text' }], S.ui.goalView, (v) => setView(v));
    view.el.setAttribute('aria-label', 'Editor view');
    c.actions.append(view.el);
    const form = h('div', { class: 'goal-form' });
    const sense = segmented([
      { value: 'max', label: 'Maximize' }, { value: 'min', label: 'Minimize' }, { value: 'target', label: 'Target' }
    ], S.model.goal.sense, (v) => { S.edit((m) => { m.goal.sense = v; if (v === 'target' && m.goal.target == null) m.goal.target = ''; }, { undo: true }); syncTarget(); if (v === 'target') target.focus('end'); }, 'segmented-lg');
    sense.el.setAttribute('aria-label', 'Goal direction');
    const expr = N.Field.create({ size: 'lg', placeholder: 'e.g. sum(profit * make)', ariaLabel: 'Goal expression', id: 'goal-input', onInput: editField(() => S.model.goal, 'expr'), onKey: (e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); N.Cards.focusFirstRule(); } } });
    const target = N.Field.create({ size: 'lg', placeholder: 'value', ariaLabel: 'Target value', noVars: true, onInput: editField(() => S.model.goal, 'target') });
    const targetWrap = h('div', { class: 'goal-target' }, h('span', { class: 'goal-eq' }, '='), target.el);
    const err = N.Field.errorLine();
    const terr = N.Field.errorLine();
    const liveVal = h('span', { class: 'num' }, '—');
    const liveLabel = h('span', null, 'Current value ');
    const targetGap = h('span', { class: 'faint' });
    const engine = h('span', { class: 'engine-hint' });
    const line = h('div', { class: 'goal-line' }, sense.el, expr.el, targetWrap);
    form.append(line, err.el, terr.el, h('div', { class: 'goal-live' }, h('span', null, liveLabel, liveVal, targetGap), engine));
    commitOnBlur(form);

    const text = h('div', { class: 'text-view', hidden: true });
    const ta = h('textarea', { spellcheck: 'false', 'aria-label': 'Model as text', autocomplete: 'off' });
    const tstatus = h('span', null, 'Edits apply as you type');
    const terrs = h('div', { class: 'text-errors', role: 'alert' });
    const copyBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('copy', 'icon-sm') + 'Copy' });
    copyBtn.addEventListener('click', async () => { N.toast((await N.util.copyText(ta.value)) ? 'Model text copied' : 'Copy failed', { kind: 'ok' }); });
    text.append(ta, terrs, h('div', { class: 'text-view-foot' }, h('span', { class: 'faint', html: 'One line each: <span class="mono">maximize …</span>, <span class="mono">var …</span>, <span class="mono">param … = …</span>, or a rule.' }), copyBtn));
    let textDirty = false;
    const applyText = debounce(() => {
      const { model, errors } = E.fromText(ta.value, S.model);
      textDirty = false;
      S.edit((m) => {
        m.name = model.name; m.notes = model.notes; m.goal = model.goal;
        m.variables = model.variables; m.constraints = model.constraints; m.parameters = model.parameters;
      }, { structural: true, fromText: true });
      N.Header && N.Header.syncName();
      terrs.textContent = errors.slice(0, 3).map((e) => `Line ${e.line}: ${e.message}`).join('\n');
    }, 450);
    ta.addEventListener('input', () => { textDirty = true; applyText(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    });
    ta.addEventListener('blur', () => { if (textDirty) applyText.flush(); });

    c.body.append(form, text);

    function setView(v) {
      if (v === 'text') { ta.value = E.toText(S.model); terrs.textContent = ''; }
      else if (textDirty) applyText.flush();
      S.saveUI({ goalView: v });
      view.set(v);
      form.hidden = v === 'text';
      text.hidden = v !== 'text';
      document.body.classList.toggle('is-text-view', v === 'text');
      c.el.querySelector('.label-caps').firstChild.textContent = v === 'text' ? 'Model' : 'Goal';
      if (v === 'text') ta.focus();
      S.emit('view', v);
    }
    function syncTarget() {
      const t = S.model.goal.sense === 'target';
      targetWrap.hidden = !t;
      if (!t) terr.set(null);
    }
    function bind() {
      const g = S.model.goal;
      sense.set(g.sense);
      expr.setValue(g.expr);
      target.setValue(g.target == null ? '' : String(g.target));
      syncTarget();
      if (!text.hidden && document.activeElement !== ta && !textDirty) ta.value = E.toText(S.model);
    }
    function live(L) {
      const e = L.errors;
      expr.setError(e.goal); err.set(e.goal);
      target.setError(e.target); terr.set(S.model.goal.sense === 'target' ? e.target : null);
      const v = L.check ? L.check.goal : null;
      const has = v != null && !e.goal;
      liveLabel.textContent = has ? 'Current value ' : E.isBlank(S.model.goal.expr) ? 'Write what to optimize' : '';
      liveVal.textContent = has ? fmt(v) : '';
      const C = S.compiled;
      targetGap.textContent = has && S.model.goal.sense === 'target' && C && C.target != null ? `  ·  ${fmt(Math.abs(v - C.target))} from target` : '';
      const cls = L.cls;
      if (cls && cls.engine) engine.innerHTML = icon(cls.linear ? 'layers' : cls.nonsmooth ? 'activity' : 'function', 'icon-xs') + esc(`${cls.linear ? 'Linear' : cls.nonsmooth ? 'Nonsmooth' : 'Smooth nonlinear'}${cls.hasInt ? ' · integer' : ''} → ${cls.label}`);
      else engine.textContent = '';
    }
    S.on('model', bind);
    S.on('live', live);
    bind();
    if (S.ui.goalView === 'text') setTimeout(() => setView('text'), 0);
    return { el: c.el, focus: () => (S.ui.goalView === 'text' ? ta.focus() : expr.focus('end')), setView, flash: () => flash(c.el) };
  }

  function flash(el) { el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1300); }

  function DecideCard() {
    const c = shell('decide-card', 'Decide', { foot: true });
    const list = h('div', { class: 'rows', role: 'list', 'aria-label': 'Decisions' });
    const add = h('button', { class: 'add-row', type: 'button', html: icon('plus', 'icon-sm') + '<span>Variable</span>' });
    add.addEventListener('click', () => addVar());
    c.body.append(list, add);
    const TYPES = [{ value: 'real', label: 'ℝ', tip: 'Real — any value' }, { value: 'int', label: 'ℤ', tip: 'Integer — whole numbers' }, { value: 'bin', label: '0/1', tip: 'Binary — yes or no' }];

    const rows = keyedList(list, (item) => {
      let cur = item;
      const get = () => cur;
      const el = h('div', { class: 'row var-row', role: 'listitem', dataset: { id: item.id } });
      const grip = h('button', { class: 'grip', type: 'button', 'aria-label': 'Drag to reorder (or use arrow keys)', html: icon('grip', 'icon-sm') });
      const name = textInput({ className: 'input-mono name-input', value: item.name, placeholder: 'name', aria: 'Variable name', field: 'name', onInput: (v) => { S.beginEdit(); cur.name = v; S.edit(null, { field: 'name' }); bx.textContent = v.trim() || '·'; } });
      const shape = textInput({ className: 'shape-input', value: item.shape === '1' ? '' : item.shape, placeholder: '1', aria: 'Size — 1, 3, 2x3 or a given name', field: 'shape', onInput: (v) => { S.beginEdit(); cur.shape = v.trim() || '1'; S.edit(null, { field: 'shape' }); } });
      shape.el.dataset.tip = 'Size: 1, 3, 2x3, or a given name';
      const type = segmented(TYPES, item.type, (v) => { S.edit(() => { cur.type = v; }, { undo: true }); syncType(); }, 'segmented-mono');
      type.el.setAttribute('aria-label', 'Type');
      const lower = N.Field.create({ placeholder: '', ariaLabel: 'Lower bound', noVars: true, value: item.lower, onInput: editField(get, 'lower') });
      const upper = N.Field.create({ placeholder: '∞', ariaLabel: 'Upper bound', noVars: true, value: item.upper, onInput: editField(get, 'upper') });
      const bx = h('span', { class: 'bounds-x' }, item.name.trim() || '·');
      const bounds = h('div', { class: 'bounds' }, lower.el, h('span', { class: 'bounds-sym' }, '≤'), bx, h('span', { class: 'bounds-sym' }, '≤'), upper.el);
      const advBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Advanced: initial values and labels', 'aria-expanded': 'false', 'data-tip': 'Initial values & labels', html: icon('sliders', 'icon-sm') });
      const del = h('button', { class: 'btn btn-ghost btn-icon btn-sm row-del', type: 'button', 'aria-label': 'Remove variable', html: icon('trash', 'icon-sm') });
      del.addEventListener('click', () => removeVar(cur.id));
      const init = N.Field.create({ placeholder: 'auto', ariaLabel: 'Initial value', noVars: true, value: item.init, onInput: editField(get, 'init') });
      const labels = textInput({ value: (item.labels || []).join(', '), placeholder: 'e.g. Chairs, Tables, Desks', aria: 'Element labels', onInput: (v) => { S.beginEdit(); cur.labels = v.split(',').map((s) => s.trim()).filter(Boolean); S.edit(null, { field: 'labels' }); } });
      const adv = h('div', { class: 'var-adv row-sub', hidden: true },
        h('label', null, h('span', { class: 'field-label' }, 'Start from'), init.el),
        h('label', null, h('span', { class: 'field-label' }, 'Labels (comma separated)'), labels.el));
      const errl = N.Field.errorLine();
      errl.el.classList.add('row-sub');
      errl.el.style.paddingLeft = '28px';
      const meta = h('div', { class: 'var-meta row-sub' });
      advBtn.addEventListener('click', () => {
        const open = adv.hidden;
        adv.hidden = !open;
        advBtn.setAttribute('aria-expanded', String(open));
        advBtn.setAttribute('aria-pressed', String(open));
        S.ui.advanced[cur.id] = open;
        if (open) init.focus('end');
      });
      el.append(grip, name.el, shape.el, type.el, bounds, advBtn, del, errl.el, meta, adv);
      commitOnBlur(el);
      name.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const last = S.model.variables[S.model.variables.length - 1]; if (last && last.id === cur.id) addVar(); else shape.el.focus(); }
        if (e.key === 'Backspace' && !name.el.value && !cur.shape.replace('1', '') && !cur.lower && !cur.upper) { e.preventDefault(); removeVar(cur.id, true); }
      });
      function syncType() {
        const bin = cur.type === 'bin';
        lower.input.placeholder = bin ? '0' : S.settings.nonNegative !== false ? '0' : '−∞';
        upper.input.placeholder = bin ? '1' : '∞';
      }
      if (S.ui.advanced[item.id] || (item.labels && item.labels.length && false)) { adv.hidden = false; advBtn.setAttribute('aria-expanded', 'true'); advBtn.setAttribute('aria-pressed', 'true'); }
      syncType();
      return {
        el,
        bind(it) {
          cur = it;
          name.setValue(it.name); shape.setValue(it.shape === '1' ? '' : it.shape); type.set(it.type);
          lower.setValue(it.lower); upper.setValue(it.upper); init.setValue(it.init);
          if (document.activeElement !== labels.el) labels.el.value = (it.labels || []).join(', ');
          if (document.activeElement !== name.el) bx.textContent = it.name.trim() || '·';
          syncType();
        },
        live(errs, info) {
          const e = errs || {};
          name.el.classList.toggle('is-invalid', !!e.name);
          shape.el.classList.toggle('is-invalid', !!e.shape);
          lower.setError(e.lower); upper.setError(e.upper); init.setError(e.init);
          if (e.init && adv.hidden) advBtn.click();
          errl.set(e.name || e.shape || e.lower || e.upper || e.init || null);
          const txt = info ? `${info.size} ${info.size === 1 ? 'value' : 'values'}${info.shape.length === 2 ? ` · ${info.shape[0]}×${info.shape[1]}` : ''}` : '';
          const show = info && info.size > 1;
          if (meta.textContent !== (show ? txt : '')) meta.textContent = show ? txt : '';
          meta.hidden = !show;
        },
        refresh() { lower.refresh(); upper.refresh(); init.refresh(); syncType(); },
        focus() { name.el.focus(); },
        flash: () => flash(el)
      };
    });
    sortable(list, { onMove: (id, to, kb) => { S.edit((m) => move(m.variables, id, to), { structural: true }); if (kb) requestAnimationFrame(() => list.querySelector(`[data-id="${id}"] .grip`).focus()); } });

    function nextName() {
      const used = new Set([...S.model.variables.map((v) => v.name), ...S.model.parameters.map((p) => p.name)]);
      for (const n of ['x', 'y', 'z', 'w', 'u', 'v']) if (!used.has(n)) return n;
      let k = 1; while (used.has('x' + k)) k++; return 'x' + k;
    }
    function addVar() {
      const v = { id: E.uid('v'), name: nextName(), shape: '1', type: 'real', lower: '', upper: '', init: '', labels: [] };
      S.edit((m) => m.variables.push(v), { structural: true });
      requestAnimationFrame(() => { const r = rows.get(v.id); if (r) { r.focus(); r.el.querySelector('.name-input').select(); } });
    }
    function removeVar(id, focusPrev) {
      const i = S.model.variables.findIndex((v) => v.id === id);
      if (i < 0) return;
      const gone = S.model.variables[i];
      S.edit((m) => m.variables.splice(i, 1), { structural: true });
      if (focusPrev) { const p = S.model.variables[Math.max(0, i - 1)]; if (p) requestAnimationFrame(() => rows.get(p.id).focus()); else add.focus(); }
      if (gone.name.trim()) N.toast(`Removed ${gone.name.trim()}`, { action: { label: 'Undo', run: () => S.undo() } });
    }
    function sync() { rows.sync(S.model.variables); c.setCount(S.model.variables.length); }
    function live(L) {
      const C = S.compiled;
      const infos = new Map(C ? C.vars.map((v) => [v.id, v]) : []);
      for (const v of S.model.variables) { const r = rows.get(v.id); if (r) r.live(L.errors.vars[v.id], infos.get(v.id)); }
      const n = C ? C.n : 0;
      const ints = C ? C.integer.reduce((a, b) => a + b, 0) : 0;
      const errs = Object.keys(L.errors.vars).length;
      const parts = [`${S.model.variables.length} ${S.model.variables.length === 1 ? 'decision' : 'decisions'}`];
      if (n !== S.model.variables.length) parts.push(`${fmt(n)} values`);
      if (ints) parts.push(`${fmt(ints)} whole-number`);
      if (errs) parts.push(`${errs} to fix`);
      const t = S.model.variables.length ? parts.join(' · ') : 'Add the quantities Nadir should choose';
      if (c.foot.textContent !== t) c.foot.textContent = t;
    }
    S.on('structure', sync);
    S.on('model', () => { for (const v of S.model.variables) { const r = rows.get(v.id); if (r) r.bind(v); } });
    S.on('live', live);
    S.on('settings', () => rows.rows.forEach((r) => r.refresh()));
    S.on('symbols', () => rows.rows.forEach((r) => r.refresh()));
    sync();
    return { el: c.el, rows, add: addVar, focusRow: (id) => { const r = rows.get(id); if (r) { r.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.flash(); r.focus(); } } };
  }

  N.Cards = N.Cards || {};
  Object.assign(N.Cards, { shell, GoalCard, DecideCard, flash, editField, commitOnBlur });
})(window.Nadir);
