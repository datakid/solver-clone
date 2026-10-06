(function (N) {
  'use strict';
  const { h } = N.util;

  function keyedList(container, create) {
    const rows = new Map();
    return {
      rows,
      sync(items) {
        const M = N.Motion;
        const keep = new Set(items.map((x) => x.id));
        const before = M && rows.size && rows.size < 120 ? M.snapshot(container) : null;
        for (const [id, r] of rows) {
          if (keep.has(id)) continue;
          const el = r.el;
          delete el.dataset.id;
          if (M && before && el.isConnected) { el.classList.add('is-removing'); M.collapse(el, 200); }
          else el.remove();
          if (r.destroy) r.destroy();
          rows.delete(id);
        }
        let anchor = container.firstElementChild;
        items.forEach((item, i) => {
          let r = rows.get(item.id);
          if (!r) { r = create(item, i); rows.set(item.id, r); }
          else if (r.bind) r.bind(item, i);
          while (anchor && !anchor.dataset.id && anchor !== r.el) anchor = anchor.nextElementSibling;
          if (anchor !== r.el) container.insertBefore(r.el, anchor || null);
          else anchor = anchor.nextElementSibling;
          if (r.el === anchor) anchor = anchor.nextElementSibling;
        });
        if (before) M.flip(container, before);
      },
      get(id) { return rows.get(id); }
    };
  }

  function sortable(container, opts) {
    const line = h('div', { class: 'drop-line', 'aria-hidden': 'true' });
    let drag = null;
    container.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.grip');
      if (!grip || !container.contains(grip) || e.button !== 0) return;
      const row = grip.closest('[data-id]');
      if (!row) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const rows = [...container.querySelectorAll(':scope > [data-id]')];
      drag = { id: row.dataset.id, row, grip, from: rows.indexOf(row), to: rows.indexOf(row), startY: e.clientY, moved: false };
    });
    container.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dy) < 4) return;
      if (!drag.moved) { drag.moved = true; drag.row.classList.add('is-dragging'); document.body.style.cursor = 'grabbing'; }
      drag.row.style.transform = `translateY(${dy}px)`;
      const rows = [...container.querySelectorAll(':scope > [data-id]')].filter((r) => r !== drag.row);
      let to = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { to = i; break; }
      }
      drag.to = to;
      const ref = rows[to] || null;
      if (ref) container.insertBefore(line, ref); else {
        const last = rows[rows.length - 1];
        if (last) last.after(line); else container.append(line);
      }
    });
    const end = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      line.remove();
      d.row.classList.remove('is-dragging');
      d.row.style.transform = '';
      document.body.style.cursor = '';
      if (d.moved && d.to !== d.from) opts.onMove(d.id, d.to);
    };
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);
    container.addEventListener('keydown', (e) => {
      const grip = e.target.closest('.grip');
      if (!grip) return;
      const row = grip.closest('[data-id]');
      const rows = [...container.querySelectorAll(':scope > [data-id]')];
      const i = rows.indexOf(row);
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); opts.onMove(row.dataset.id, i - 1, true); }
      if (e.key === 'ArrowDown' && i < rows.length - 1) { e.preventDefault(); opts.onMove(row.dataset.id, i + 1, true); }
    });
  }

  function move(arr, id, to) {
    const from = arr.findIndex((x) => x.id === id);
    if (from < 0) return;
    const [it] = arr.splice(from, 1);
    arr.splice(Math.max(0, Math.min(arr.length, to)), 0, it);
  }

  function segmented(options, value, onChange, cls) {
    const el = h('div', { class: 'segmented' + (cls ? ' ' + cls : ''), role: 'radiogroup' });
    const btns = options.map((o) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), 'data-value': o.value, 'data-tip': o.tip || null, 'aria-label': o.aria || o.tip || null }, o.label);
      b.addEventListener('click', () => { if (b.getAttribute('aria-checked') === 'true') return; set(o.value); onChange(o.value); });
      return b;
    });
    el.append(...btns);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
      btns[j].focus();
      btns[j].click();
    });
    function set(v) { btns.forEach((b) => { const on = b.dataset.value === String(v); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); }
    set(value);
    return { el, set };
  }

  function switchEl(on, onChange, label) {
    const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label || 'Toggle' });
    b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); });
    return { el: b, set(v) { b.setAttribute('aria-checked', String(!!v)); } };
  }

  function textInput(opts) {
    const el = h('input', { class: 'input' + (opts.className ? ' ' + opts.className : ''), type: 'text', value: opts.value || '', placeholder: opts.placeholder || '', 'aria-label': opts.aria || opts.placeholder || '', spellcheck: 'false', autocomplete: 'off' });
    if (opts.field) el.dataset.field = opts.field;
    el.addEventListener('input', () => opts.onInput(el.value));
    return { el, setValue(v) { if (document.activeElement !== el && el.value !== v) el.value = v; } };
  }

  N.List = { keyedList, sortable, move, segmented, switchEl, textInput };
})(window.Nadir);
