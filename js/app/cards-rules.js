(function (N) {
  'use strict';
  const { h, icon, esc, fmt, literal, keys } = N.util;
  const { keyedList, sortable, move, switchEl, textInput } = N.List;
  const S = N.Store;
  const E = window.Engine;
  const { shell, flash, editField, commitOnBlur } = N.Cards;

  function RulesCard() {
    const c = shell('rules-card', 'Limits', { foot: true, step: 3, sub: 'What the answer must respect — budgets, capacities, minimums.' });
    const list = h('div', { class: 'rows', role: 'list', 'aria-label': 'Rules' });
    const add = h('button', { class: 'add-row', type: 'button', html: icon('plus', 'icon-sm') + '<span>Add a limit</span>' + keys('Alt+N') });
    add.addEventListener('click', () => addRule());
    const ideas = h('div', { class: 'rule-ideas', hidden: true });
    c.body.append(list, add, ideas);
    function syncIdeas() {
      const vars = S.model.variables.map((v) => v.name.trim()).filter(Boolean);
      const show = !S.model.constraints.length && vars.length > 0;
      ideas.hidden = !show;
      if (!show) return;
      const a = vars[0], b = vars[1];
      const sum = vars.length > 1 ? `${a} + ${b}` : (S.compiled && S.compiled.vars[0] && S.compiled.vars[0].size > 1 ? `sum(${a})` : a);
      const sugg = [[`${sum} <= 100`, 'Total cap', 'no more than 100 in total'], [`${a} >= 10`, 'Minimum', `at least 10 ${a}`]];
      if (b) sugg.push([`${a} <= 2 * ${b}`, 'Ratio', `${a} at most twice ${b}`]);
      ideas.replaceChildren(h('span', { class: 'idea-lead' }, 'Common limits — click one, then change the numbers:'));
      sugg.forEach(([ex, why, say]) => {
        const bt = h('button', { class: 'idea-chip', type: 'button', 'data-tip': say, html: `<strong>${esc(why)}</strong><span class="mono">${esc(ex)}</span>` });
        bt.addEventListener('click', () => addRule(null, ex));
        ideas.append(bt);
      });
    }

    const rows = keyedList(list, (item) => {
      let cur = item;
      const get = () => cur;
      const el = h('div', { class: 'row rule-row', role: 'listitem', dataset: { id: item.id } });
      const grip = h('button', { class: 'grip', type: 'button', 'aria-label': 'Drag to reorder (or use arrow keys)', html: icon('grip', 'icon-sm') });
      const sw = switchEl(item.enabled !== false, (v) => { S.edit(() => { cur.enabled = v; }, { undo: true }); el.classList.toggle('is-disabled', !v); }, 'Rule enabled');
      const label = textInput({ className: 'input-bare rule-label', value: item.label, placeholder: 'Name it', aria: 'Limit name', field: 'label', onInput: (v) => { S.beginEdit(); cur.label = v; S.edit(null, { field: 'label' }); } });
      const expr = N.Field.create({
        kind: 'rule', assist: 'rule', placeholder: 'e.g. 2 * chairs + 5 * tables <= 100', ariaLabel: 'Limit', value: item.expr, dataField: 'expr',
        onInput: editField(get, 'expr'),
        onKey: (e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            const i = S.model.constraints.findIndex((r) => r.id === cur.id);
            if (i === S.model.constraints.length - 1) addRule(i + 1);
            else rows.get(S.model.constraints[i + 1].id).focus();
          } else if (e.key === 'Backspace' && !expr.input.value && !cur.label) {
            e.preventDefault(); removeRule(cur.id, true);
          } else if (e.key === 'ArrowUp' && !e.altKey) {
            const i = S.model.constraints.findIndex((r) => r.id === cur.id);
            if (i > 0) { e.preventDefault(); rows.get(S.model.constraints[i - 1].id).focus(); }
          } else if (e.key === 'ArrowDown' && !e.altKey) {
            const i = S.model.constraints.findIndex((r) => r.id === cur.id);
            if (i < S.model.constraints.length - 1) { e.preventDefault(); rows.get(S.model.constraints[i + 1].id).focus(); }
          }
        }
      });
      const pill = h('span', { class: 'pill pill-muted', 'aria-live': 'off' }, '—');
      const del = h('button', { class: 'btn btn-ghost btn-icon btn-sm row-del', type: 'button', 'aria-label': 'Remove rule', html: icon('trash', 'icon-sm') });
      del.addEventListener('click', () => removeRule(cur.id));
      const errl = N.Field.errorLine(expr, { vars: true });
      errl.el.classList.add('row-sub', 'rule-err');
      const meta = h('div', { class: 'rule-meta row-sub' });
      const says = h('div', { class: 'plain-line rule-says row-sub', hidden: true });
      el.append(grip, sw.el, label.el, expr.el, pill, del, errl.el, says, meta);
      el.classList.toggle('is-disabled', item.enabled === false);
      commitOnBlur(el);
      let pillKey = '';
      return {
        el,
        bind(it) { cur = it; label.setValue(it.label); expr.setValue(it.expr); sw.set(it.enabled !== false); el.classList.toggle('is-disabled', it.enabled === false); },
        live(err, st, nonlinear, pwl) {
          expr.setError(err);
          errl.set(err);
          const phrase = S.settings.explain && !err && !E.isBlank(cur.expr) ? E.explainRule(cur.expr, { labels: S.labelMap(), each: st && st.scalar > 1 ? st.scalar : 0 }) : null;
          says.hidden = !phrase;
          if (phrase && says.dataset.t !== phrase) { says.dataset.t = phrase; says.textContent = phrase; }
          let cls = 'pill pill-muted', html = '—', tip = '';
          if (err) { cls = 'pill pill-bad'; html = icon('x') + 'fix me'; }
          else if (E.isBlank(cur.expr)) { cls = 'pill pill-muted'; html = 'empty'; }
          else if (cur.enabled === false) { cls = 'pill pill-muted'; html = 'paused'; }
          else if (st) {
            if (st.scalar > 1) {
              if (st.off) { cls = 'pill pill-bad'; html = icon('x') + `${fmt(st.off)} of ${fmt(st.count)} broken`; tip = `Worst one is missed by ${fmt(st.worst)}`; }
              else if (st.binding) { cls = 'pill pill-info'; html = icon('dot') + `all ${fmt(st.count)} ok`; tip = `${fmt(st.binding)} exactly at the limit`; }
              else { cls = 'pill pill-ok'; html = icon('check') + `all ${fmt(st.count)} ok`; tip = `Smallest room left: ${fmt(st.slack)}`; }
            } else if (st.off) { cls = 'pill pill-bad'; html = icon('x') + `broken by ${fmt(st.worst)}`; tip = 'Not met'; }
            else if (st.binding) { cls = 'pill pill-info'; html = icon('dot') + 'at the limit'; tip = 'Exactly at the limit'; }
            else { cls = 'pill pill-ok'; html = icon('check') + `${fmt(st.slack)} to spare`; tip = `Met, with ${fmt(st.slack)} of room left`; }
          }
          const key = cls + html;
          if (key !== pillKey) { pill.className = cls; pill.innerHTML = html; pillKey = key; }
          const ftip = tip ? tip + ' — checked with today’s starting values, before solving' : '';
          if (ftip) { if (pill.dataset.tip !== ftip) pill.dataset.tip = ftip; } else if (pill.dataset.tip) delete pill.dataset.tip;
          const parts = [];
          if (st && !err && st.count > 1) parts.push(`expands to ${fmt(st.count)}`);
          if (pwl && !err) parts.push('corners → straight lines');
          else if (nonlinear && !err) parts.push('nonlinear');
          const mt = parts.join(' · ');
          if (meta.textContent !== mt) meta.textContent = mt;
        },
        refresh() { expr.refresh(); },
        focus(pos) { expr.focus(pos || 'end'); },
        flash: () => flash(el)
      };
    });
    sortable(list, { onMove: (id, to, kb) => { S.edit((m) => move(m.constraints, id, to), { structural: true }); if (kb) requestAnimationFrame(() => list.querySelector(`[data-id="${id}"] .grip`).focus()); } });

    function addRule(at, expr) {
      const r = { id: E.uid('c'), label: '', expr: expr || '', enabled: true };
      S.edit((m) => { const i = at == null ? m.constraints.length : at; m.constraints.splice(i, 0, r); }, { structural: true });
      requestAnimationFrame(() => { const row = rows.get(r.id); if (row) { row.focus(); row.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
      return r;
    }
    function removeRule(id, focusPrev) {
      const i = S.model.constraints.findIndex((r) => r.id === id);
      if (i < 0) return;
      const gone = S.model.constraints[i];
      S.edit((m) => m.constraints.splice(i, 1), { structural: true });
      if (focusPrev) { const p = S.model.constraints[Math.max(0, i - 1)]; if (p) requestAnimationFrame(() => rows.get(p.id).focus('end')); else add.focus(); }
      if (gone.expr.trim()) N.toast(`Removed ${gone.label || 'rule'}`, { action: { label: 'Undo', run: () => S.undo() } });
    }
    function sync() { rows.sync(S.model.constraints); c.setCount(S.model.constraints.length); syncIdeas(); }
    function live(L) {
      syncIdeas();
      const st = L.check ? L.check.rules : {};
      const nl = new Set((L.cls && L.cls.nonlinearRules) || []);
      const pw = new Set((L.cls && L.cls.pwlRules) || []);
      let scalar = 0, off = 0, enabled = 0, errs = 0, binding = 0;
      for (const r of S.model.constraints) {
        const row = rows.get(r.id);
        const e = L.errors.rules[r.id];
        const s = st[r.id];
        if (row) row.live(e, s, nl.has(r.id), pw.has(r.id));
        if (e) errs++;
        if (s && r.enabled !== false) { enabled++; scalar += s.count; if (s.off) off++; if (s.binding) binding++; }
      }
      const n = S.model.constraints.length;
      let t;
      if (!n) t = 'No limits yet — only the allowed ranges in Decisions hold the answer back';
      else {
        const parts = [`${n} ${n === 1 ? 'limit' : 'limits'}`];
        if (scalar !== enabled) parts.push(`${fmt(scalar)} checks in total`);
        if (errs) parts.push(`${errs} to fix`);
        else if (off) parts.push(`${off} broken by the starting values — that’s fine, Solve fixes it`);
        else if (enabled) parts.push('the starting values already respect them');
        t = parts.join(' · ');
      }
      if (c.foot.textContent !== t) c.foot.textContent = t;
    }
    S.on('structure', sync);
    S.on('model', () => { for (const r of S.model.constraints) { const row = rows.get(r.id); if (row) row.bind(r); } });
    S.on('live', live);
    S.on('symbols', () => rows.rows.forEach((r) => r.refresh()));
    sync();
    return {
      el: c.el, rows, add: addRule,
      focusFirst() { const r = S.model.constraints[0]; if (r) rows.get(r.id).focus(); else addRule(); },
      focusRow(id) { const r = rows.get(id); if (r) { r.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.flash(); setTimeout(() => r.focus(), 250); } }
    };
  }

  function GivenCard() {
    const c = shell('given-card', 'Numbers', { foot: true, step: 4, sub: 'Facts that don’t change — prices, costs, stock. Name them once, use them anywhere. Paste from Excel.' });
    const collapse = h('button', { class: 'btn btn-ghost btn-icon btn-sm collapse-btn', type: 'button', 'aria-label': 'Collapse', 'aria-expanded': 'true', html: icon('chevronDown', 'icon-sm') });
    const paste = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-tip': 'Paste a table from Excel', html: icon('table', 'icon-sm') + '<span>Paste table</span>' });
    c.actions.append(paste, collapse);
    const list = h('div', { class: 'rows', role: 'list', 'aria-label': 'Given values' });
    const add = h('button', { class: 'add-row', type: 'button', html: icon('plus', 'icon-sm') + '<span>Add a number</span>' });
    add.addEventListener('click', () => addParam());
    c.body.append(list, add);
    paste.addEventListener('click', () => N.IO.pasteDialog(''));
    c.el.addEventListener('paste', (e) => {
      const txt = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!txt || !/\t|\n.*\S/.test(txt.trim())) return;
      const t = e.target;
      if (t && t.tagName === 'INPUT' && !/\t/.test(txt)) return;
      e.preventDefault();
      N.IO.pasteDialog(txt);
    });
    function setCollapsed(v, save) {
      c.el.classList.toggle('is-collapsed', v);
      collapse.setAttribute('aria-expanded', String(!v));
      collapse.setAttribute('aria-label', v ? 'Expand' : 'Collapse');
      if (save) S.saveUI({ givenCollapsed: v });
    }
    collapse.addEventListener('click', () => setCollapsed(!c.el.classList.contains('is-collapsed'), true));
    c.head.addEventListener('click', (e) => { if (e.target === c.head || e.target.closest('.label-caps')) { if (c.el.classList.contains('is-collapsed')) setCollapsed(false, true); } });

    const rows = keyedList(list, (item) => {
      let cur = item;
      const get = () => cur;
      const el = h('div', { class: 'row param-row', role: 'listitem', dataset: { id: item.id } });
      const grip = h('button', { class: 'grip', type: 'button', 'aria-label': 'Drag to reorder (or use arrow keys)', html: icon('grip', 'icon-sm') });
      const name = textInput({ className: 'input-mono name-input', value: item.name, placeholder: 'e.g. price', aria: 'Number name', field: 'name', onInput: (v) => { S.beginEdit(); cur.name = v; S.edit(null, { field: 'name' }); } });
      const expr = N.Field.create({ placeholder: 'e.g. 45  or a list [45, 80, 60]', ariaLabel: 'Value', noVars: true, value: item.expr, onInput: (v) => { S.beginEdit(); cur.expr = v; S.edit(null, { field: 'expr', param: true }); syncSliderValue(); },
        onKey: (e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const last = S.model.parameters[S.model.parameters.length - 1]; if (last && last.id === cur.id) addParam(); else rows.get(S.model.parameters[S.model.parameters.findIndex((p) => p.id === cur.id) + 1].id).focus(); } } });
      const shapeTxt = h('span', { class: 'param-shape' });
      const sliderBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Slider', 'aria-pressed': String(!!item.slider), 'data-tip': 'Turn into a slider to try “what if”', html: icon('toggle', 'icon-sm') });
      const del = h('button', { class: 'btn btn-ghost btn-icon btn-sm row-del', type: 'button', 'aria-label': 'Remove value', html: icon('trash', 'icon-sm') });
      del.addEventListener('click', () => removeParam(cur.id));
      const errl = N.Field.errorLine();
      errl.el.classList.add('row-sub');
      errl.el.style.paddingLeft = '28px';
      const range = h('input', { class: 'range', type: 'range', 'aria-label': 'Slider value' });
      const smin = h('input', { class: 'input', type: 'number', 'aria-label': 'Slider minimum' });
      const smax = h('input', { class: 'input', type: 'number', 'aria-label': 'Slider maximum' });
      const sstep = h('input', { class: 'input', type: 'number', 'aria-label': 'Slider step', min: '0' });
      const slider = h('div', { class: 'param-slider', hidden: true }, range, h('div', { class: 'param-slider-bounds' }, smin, h('span', null, 'to'), smax, h('span', null, 'step'), sstep));
      el.append(grip, name.el, h('span', { class: 'param-eq' }, '='), expr.el, shapeTxt, sliderBtn, del, errl.el, slider);
      commitOnBlur(el);
      let scalarOk = false;
      function syncSlider() {
        const s = cur.slider;
        slider.hidden = !s;
        sliderBtn.setAttribute('aria-pressed', String(!!s));
        if (!s) return;
        range.min = s.min; range.max = s.max; range.step = s.step || 'any';
        if (document.activeElement !== smin) smin.value = s.min;
        if (document.activeElement !== smax) smax.value = s.max;
        if (document.activeElement !== sstep) sstep.value = s.step;
        syncSliderValue();
      }
      function syncSliderValue() {
        if (!cur.slider) return;
        const v = N.util.toNumber(cur.expr);
        if (Number.isFinite(v) && document.activeElement !== range) range.value = v;
      }
      sliderBtn.addEventListener('click', () => {
        if (cur.slider) { S.edit(() => { cur.slider = null; }, { undo: true }); syncSlider(); return; }
        const C = S.compiled;
        const p = C && C.params.find((q) => q.id === cur.id);
        if (!p || p.shape.length) { N.toast('Sliders work on single-number values', { kind: 'info' }); return; }
        const v = p.values[0];
        const mag = Math.abs(v) || 10;
        const step = Math.pow(10, Math.floor(Math.log10(mag)) - 1);
        const min = v >= 0 ? 0 : Math.floor(v * 2 / step) * step;
        const max = Math.ceil((v === 0 ? 10 : Math.abs(v) * 2) / step) * step;
        S.edit(() => { cur.slider = { min, max, step: +step.toPrecision(3) }; if (String(cur.expr).trim() !== N.util.fmt.plain(v)) cur.expr = N.util.fmt.plain(v); }, { undo: true });
        syncSlider();
        expr.setValue(cur.expr);
      });
      range.addEventListener('input', () => {
        S.beginEdit();
        cur.expr = N.util.fmt.plain(+range.value);
        S.edit(null, { field: 'expr', param: true, slider: true });
        expr.setValue(cur.expr);
        N.Solve && N.Solve.liveResolve();
      });
      range.addEventListener('change', () => S.commitEdit());
      const bnd = () => { const a = +smin.value, b = +smax.value, st = +sstep.value; if (!(b > a) || !(st >= 0)) return; S.beginEdit(); cur.slider = { min: a, max: b, step: st || 0 }; S.edit(null, { field: 'slider' }); syncSlider(); };
      [smin, smax, sstep].forEach((i) => i.addEventListener('change', bnd));
      name.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); expr.focus('end'); }
        if (e.key === 'Backspace' && !name.el.value && !cur.expr) { e.preventDefault(); removeParam(cur.id, true); }
      });
      syncSlider();
      return {
        el,
        bind(it) { cur = it; name.setValue(it.name); expr.setValue(it.expr); syncSlider(); },
        live(errs, info) {
          const e = errs || {};
          name.el.classList.toggle('is-invalid', !!e.name);
          expr.setError(e.expr);
          errl.set(e.name || e.expr || null);
          let t = '';
          if (info && !e.expr) {
            if (info.shape.length === 0) t = /^[-+]?[\d.]+(e[-+]?\d+)?%?$/i.test(String(cur.expr).trim()) ? '' : '= ' + fmt(info.values[0]);
            else t = E.shapeText(info.shape) + (info.shape.length === 1 ? ' values' : '');
          }
          scalarOk = !!(info && info.shape.length === 0);
          sliderBtn.disabled = !scalarOk && !cur.slider;
          if (shapeTxt.textContent !== t) shapeTxt.textContent = t;
        },
        refresh() { expr.refresh(); },
        focus() { expr.focus('end'); },
        focusName() { name.el.focus(); name.el.select(); },
        flash: () => flash(el)
      };
    });
    sortable(list, { onMove: (id, to, kb) => { S.edit((m) => move(m.parameters, id, to), { structural: true }); if (kb) requestAnimationFrame(() => list.querySelector(`[data-id="${id}"] .grip`).focus()); } });

    function nextName() {
      const used = new Set([...S.model.variables.map((v) => v.name), ...S.model.parameters.map((p) => p.name)]);
      let k = 1; while (used.has('p' + k)) k++; return 'p' + k;
    }
    function addParam(p, opts) {
      const o = opts || {};
      const it = Object.assign({ id: E.uid('p'), name: nextName(), expr: '', slider: null }, p && typeof p === 'object' && !p.nodeType && !p.type ? p : {});
      S.edit((m) => m.parameters.push(it), { structural: true });
      setCollapsed(false, false);
      requestAnimationFrame(() => {
        const r = rows.get(it.id);
        if (!r) return;
        if (o.focusValue) { r.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.flash(); setTimeout(() => r.focus(), 260); }
        else if (p && typeof p === 'object' && p.name) r.flash(); else r.focusName();
      });
      return it;
    }
    function removeParam(id, focusPrev) {
      const i = S.model.parameters.findIndex((p) => p.id === id);
      if (i < 0) return;
      const gone = S.model.parameters[i];
      S.edit((m) => m.parameters.splice(i, 1), { structural: true });
      if (focusPrev) { const p = S.model.parameters[Math.max(0, i - 1)]; if (p) requestAnimationFrame(() => rows.get(p.id).focus()); else add.focus(); }
      if (gone.name.trim()) N.toast(`Removed ${gone.name.trim()}`, { action: { label: 'Undo', run: () => S.undo() } });
    }
    let autoCollapsedFor = null;
    function sync(o) {
      rows.sync(S.model.parameters);
      c.setCount(S.model.parameters.length);
      if (o && o.all && autoCollapsedFor !== S.model.id) {
        autoCollapsedFor = S.model.id;
        const pref = S.ui.givenCollapsed;
        setCollapsed(pref == null ? S.model.parameters.length > 6 : pref && S.model.parameters.length > 0, false);
      }
    }
    function live(L) {
      const C = S.compiled;
      const infos = new Map(C ? C.params.map((p) => [p.id, p]) : []);
      let errs = 0, scalars = 0, cells = 0;
      for (const p of S.model.parameters) {
        const r = rows.get(p.id);
        const e = L.errors.params[p.id];
        if (e) errs++;
        const info = infos.get(p.id);
        if (info) { if (info.shape.length) cells += info.values.length; else scalars++; }
        if (r) r.live(e, info);
      }
      const n = S.model.parameters.length;
      const parts = n ? [`${n} ${n === 1 ? 'value' : 'values'}`] : [];
      if (cells) parts.push(`${fmt(cells)} table cells`);
      if (errs) parts.push(`${errs} to fix`);
      const t = n ? parts.join(' · ') : 'Example: price = 45. Then write price in the goal instead of 45.';
      if (c.foot.textContent !== t) c.foot.textContent = t;
    }
    S.on('structure', sync);
    S.on('model', () => { for (const p of S.model.parameters) { const r = rows.get(p.id); if (r) r.bind(p); } });
    S.on('live', live);
    S.on('symbols', () => rows.rows.forEach((r) => r.refresh()));
    sync({ all: true });
    return { el: c.el, rows, add: addParam, expand: () => setCollapsed(false, false), focusRow: (id) => { setCollapsed(false, false); const r = rows.get(id); if (r) { r.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.flash(); } } };
  }

  Object.assign(N.Cards, { RulesCard, GivenCard });
})(window.Nadir);
