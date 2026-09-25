(function (N) {
  'use strict';
  const { h, icon, esc, fuzzy, markText, keys } = N.util;

  const stack = [];
  function pushLayer(layer) { stack.push(layer); }
  function popLayer(layer) { const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1); }
  function closeTop() {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }
  const hasLayer = () => stack.length > 0;

  function trapFocus(root, e) {
    if (e.key !== 'Tab') return;
    const f = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const toastRoot = () => document.getElementById('toast-root');
  function toast(message, opts) {
    const o = opts || {};
    const kind = o.kind || 'ok';
    const el = h('div', { class: `toast toast-${kind}`, role: kind === 'bad' ? 'alert' : 'status' });
    el.innerHTML = icon(kind === 'bad' ? 'alert' : kind === 'info' ? 'info' : 'check') + `<span>${esc(message)}</span>`;
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 180);
    };
    if (o.action) {
      const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, o.action.label);
      b.addEventListener('click', () => { close(); o.action.run(); });
      el.append(b);
    }
    const root = toastRoot();
    while (root.children.length >= 3) root.firstElementChild.remove();
    root.append(el);
    timer = setTimeout(close, o.duration || (o.action ? 6000 : 2600));
    return { close };
  }

  function dialog(opts) {
    const o = opts || {};
    const prev = document.activeElement;
    const wrap = h('div', { class: 'dialog-wrap', role: 'presentation' });
    const box = h('div', { class: 'dialog' + (o.size === 'lg' ? ' dialog-lg' : '') + (o.className ? ' ' + o.className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title' });
    const layer = { close: () => close(null) };
    let resolveFn;
    const done = new Promise((r) => { resolveFn = r; });
    function close(value) {
      popLayer(layer);
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
      if (o.onClose) o.onClose(value);
      resolveFn(value);
    }
    function onKey(e) {
      if (stack[stack.length - 1] !== layer) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else trapFocus(box, e);
    }
    if (o.title !== false) {
      const head = h('div', { class: 'dialog-head' }, h('h2', { id: 'dlg-title' }, o.title || ''));
      const x = h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Close', html: icon('x') });
      x.addEventListener('click', () => close(null));
      head.append(x);
      box.append(head);
    }
    const body = h('div', { class: 'dialog-body' });
    if (typeof o.body === 'string') body.innerHTML = o.body;
    else if (o.body) body.append(o.body);
    if (o.body !== null) box.append(body);
    if (o.actions && o.actions.length) {
      const foot = h('div', { class: 'dialog-foot' });
      for (const a of o.actions) {
        const b = h('button', { class: 'btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'), type: 'button' }, a.label);
        b.addEventListener('click', () => {
          if (a.run) { const r = a.run(api); if (r === false) return; }
          close(a.value !== undefined ? a.value : a.label);
        });
        foot.append(b);
      }
      box.append(foot);
    }
    wrap.append(box);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
    document.getElementById('overlay-root').append(wrap);
    pushLayer(layer);
    document.addEventListener('keydown', onKey, true);
    const api = { el: box, body, close, done };
    requestAnimationFrame(() => {
      const f = box.querySelector('[autofocus]') || box.querySelector('.dialog-body input, .dialog-body textarea, .dialog-body select') || box.querySelector('.dialog-foot .btn-primary') || box.querySelector('button');
      if (f) f.focus();
    });
    return api;
  }

  function confirmDialog(title, message, okLabel, kind) {
    return dialog({ title, body: `<p>${esc(message)}</p>`, actions: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', kind: kind || 'primary', value: true }] }).done;
  }

  function promptDialog(title, value, opts) {
    const o = opts || {};
    const input = h('input', { class: 'input', type: 'text', value: value || '', placeholder: o.placeholder || '', 'aria-label': title });
    const box = h('div', null, o.label ? h('label', { class: 'field-label' }, o.label) : null, input);
    let dlg;
    const submit = () => { const v = input.value.trim(); if (!v) { input.focus(); return false; } dlg.close(v); return false; };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    dlg = dialog({ title, body: box, actions: [{ label: 'Cancel', value: null }, { label: o.ok || 'Save', kind: 'primary', run: submit }] });
    requestAnimationFrame(() => { input.focus(); input.select(); });
    return dlg.done;
  }

  function popover(anchor, content, opts) {
    const o = opts || {};
    const el = h('div', { class: 'pop' + (o.className ? ' ' + o.className : ''), role: o.role || 'dialog' });
    if (typeof content === 'string') el.innerHTML = content; else el.append(content);
    document.getElementById('overlay-root').append(el);
    const layer = { close: () => close() };
    function place() {
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth, ht = el.offsetHeight;
      let x = o.align === 'right' ? r.right - w : r.left;
      let y = r.bottom + 6;
      if (y + ht > innerHeight - 8 && r.top - ht - 6 > 8) y = r.top - ht - 6;
      x = Math.max(8, Math.min(innerWidth - w - 8, x));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
    place();
    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape' && stack[stack.length - 1] === layer) { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); } };
    setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close, { once: true });
    pushLayer(layer);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      popLayer(layer);
      el.remove();
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      if (o.onClose) o.onClose();
    }
    return { el, close, place };
  }

  function menu(anchor, items, opts) {
    const list = h('div', { class: 'menu', role: 'menu' });
    let pop;
    for (const it of items) {
      if (it === '-') { list.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
      const b = h('button', { class: 'menu-item' + (it.danger ? ' btn-danger' : ''), type: 'button', role: 'menuitem', disabled: it.disabled });
      b.innerHTML = (it.icon ? icon(it.icon, 'icon-sm') : '') + `<span>${esc(it.label)}</span>` + (it.hint ? `<span class="menu-hint">${it.hint}</span>` : '');
      b.addEventListener('click', () => { pop.close(); it.run(); });
      list.append(b);
    }
    list.addEventListener('keydown', (e) => {
      const btns = [...list.querySelectorAll('.menu-item:not(:disabled)')];
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    });
    pop = popover(anchor, list, Object.assign({ role: 'menu' }, opts));
    const first = list.querySelector('.menu-item:not(:disabled)');
    if (first) first.focus();
    return pop;
  }

  function tooltips() {
    const tip = h('div', { class: 'tooltip', role: 'tooltip' });
    document.body.append(tip);
    let target = null, timer = 0;
    const show = (el) => {
      target = el;
      const k = el.dataset.tipKeys;
      tip.innerHTML = esc(el.dataset.tip) + (k ? keys(k) : '');
      tip.style.left = '0px'; tip.style.top = '0px';
      const r = el.getBoundingClientRect();
      const w = tip.offsetWidth;
      let x = r.left + r.width / 2 - w / 2;
      x = Math.max(8, Math.min(innerWidth - w - 8, x));
      let y = r.bottom + 8;
      if (y + 30 > innerHeight) y = r.top - 36;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      tip.classList.add('is-on');
    };
    const hide = () => { clearTimeout(timer); target = null; tip.classList.remove('is-on'); };
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el === target) return;
      hide();
      if (el && e.pointerType !== 'touch') timer = setTimeout(() => show(el), 450);
    });
    document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) { hide(); timer = setTimeout(() => show(el), 200); } });
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
  }

  function palette(sources) {
    const input = h('input', { type: 'text', placeholder: 'Search actions, templates and models…', 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'palette-list', role: 'listbox' });
    const search = h('div', { class: 'palette-search' });
    search.innerHTML = icon('search');
    search.append(input, h('span', { class: 'kbd' }, 'esc'));
    const body = h('div', null, search, list);
    const dlg = dialog({ title: false, body: null, className: 'palette' });
    dlg.el.append(body);
    let items = [], sel = 0;
    function render() {
      const q = input.value.trim();
      const all = sources();
      const scored = [];
      for (const it of all) {
        const r = fuzzy(q, it.label + (it.keywords ? ' ' + it.keywords : ''));
        if (!r) continue;
        const m = fuzzy(q, it.label);
        scored.push({ it, score: r.score + (it.boost || 0), marks: m ? m.marks : [] });
      }
      if (q) scored.sort((a, b) => b.score - a.score);
      items = scored.slice(0, 60);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.textContent = '';
      if (!items.length) { list.append(h('div', { class: 'palette-empty' }, 'Nothing matches')); return; }
      let group = null;
      items.forEach((x, i) => {
        if (!q && x.it.group !== group) { group = x.it.group; list.append(h('div', { class: 'palette-group' }, group)); }
        const b = h('button', { class: 'palette-item', type: 'button', role: 'option', 'aria-selected': String(i === sel), dataset: { i } });
        b.innerHTML = icon(x.it.icon || 'command') + `<span>${markText(x.it.label, x.marks)}</span>` + (x.it.hint || x.it.keys ? `<span class="palette-hint">${x.it.keys ? keys(x.it.keys) : esc(x.it.hint)}</span>` : '');
        b.addEventListener('click', () => choose(i));
        b.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
        list.append(b);
      });
    }
    function mark() {
      list.querySelectorAll('.palette-item').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === sel)));
      const cur = list.querySelector(`[data-i="${sel}"]`);
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    function choose(i) {
      const x = items[i];
      if (!x) return;
      dlg.close();
      setTimeout(() => x.it.run(), 0);
    }
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    });
    render();
    requestAnimationFrame(() => input.focus());
    return dlg;
  }

  N.toast = toast;
  N.Overlays = { dialog, confirm: confirmDialog, prompt: promptDialog, popover, menu, tooltips, palette, closeTop, hasLayer, pushLayer, popLayer, trapFocus };
})(window.Nadir);
