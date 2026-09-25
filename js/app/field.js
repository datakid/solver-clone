(function (N) {
  'use strict';
  const { h, esc, icon, fuzzy, markText } = N.util;
  const E = window.Engine;

  let symbols = () => ({ vars: [], params: [] });
  const fieldSymbols = (fn) => { symbols = fn; };

  function highlightHTML(src, err, rule) {
    const n = src.length;
    if (!n) return '';
    const cls = new Array(n).fill('');
    const spans = E.highlight(src);
    const sym = symbols();
    const vars = new Set(sym.vars.map((v) => v.name));
    const params = new Set(sym.params.map((p) => p.name));
    spans.forEach((s, i) => {
      let c = '';
      if (s.type === 'num') c = 'tk-num';
      else if (s.type === 'comment') c = 'tk-comment';
      else if (s.type === 'op') c = ['<=', '>=', '=', '<', '>'].includes(s.value) ? 'tk-cmp' : 'tk-op';
      else if (s.type === 'name') {
        if (rule && i === 0 && spans[1] && spans[1].type === 'op' && spans[1].value === ':') c = 'tk-label';
        else if (s.callee || (E.FUNCTIONS[s.value] && !vars.has(s.value))) c = 'tk-fn';
        else if (vars.has(s.value)) c = 'tk-var';
        else if (params.has(s.value)) c = 'tk-param';
      }
      if (rule && i === 1 && s.type === 'op' && s.value === ':' && cls[spans[0].start] === 'tk-label') c = 'tk-label';
      for (let k = s.start; k < s.end && k < n; k++) cls[k] = c;
    });
    if (err) {
      let a = Math.max(0, Math.min(n, err.start)), b = Math.max(a, Math.min(n, err.end));
      if (b === a) { if (a >= n) { a = Math.max(0, n - 1); } b = Math.min(n, a + 1); }
      for (let k = a; k < b; k++) cls[k] += ' tk-err';
    }
    let out = '', cur = null, buf = '';
    for (let k = 0; k < n; k++) {
      if (cls[k] !== cur) {
        if (buf) out += cur ? `<span class="${cur.trim()}">${esc(buf)}</span>` : esc(buf);
        cur = cls[k]; buf = '';
      }
      buf += src[k];
    }
    if (buf) out += cur ? `<span class="${cur.trim()}">${esc(buf)}</span>` : esc(buf);
    return out;
  }

  let acOpen = null;

  function createField(opts) {
    const o = opts || {};
    const wrap = h('div', { class: 'code' + (o.size === 'lg' ? ' code-lg' : '') + (o.className ? ' ' + o.className : '') });
    const mirror = h('div', { class: 'code-hl', 'aria-hidden': 'true' });
    const inner = h('span', { class: 'code-hl-inner' });
    mirror.append(inner);
    const input = h('input', {
      class: 'code-input', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
      placeholder: o.placeholder || '', 'aria-label': o.ariaLabel || 'Expression', value: o.value || ''
    });
    if (o.id) input.id = o.id;
    if (o.dataField) input.dataset.field = o.dataField;
    wrap.append(mirror, input);
    let err = null;
    const paint = () => {
      inner.innerHTML = highlightHTML(input.value, err, o.kind === 'rule') + '&#8203;';
      sync();
    };
    const sync = () => { inner.style.transform = input.scrollLeft ? `translateX(${-input.scrollLeft}px)` : ''; };

    input.addEventListener('input', () => {
      paint();
      if (o.onInput) o.onInput(input.value);
      autocomplete.update(api);
    });
    input.addEventListener('scroll', sync);
    input.addEventListener('keyup', sync);
    input.addEventListener('select', sync);
    input.addEventListener('focus', () => wrap.classList.add('is-focus'));
    input.addEventListener('blur', () => { wrap.classList.remove('is-focus'); setTimeout(() => autocomplete.closeIf(api), 120); if (o.onBlur) o.onBlur(input.value); });
    input.addEventListener('keydown', (e) => {
      if (autocomplete.key(api, e)) return;
      if (o.onKey) o.onKey(e, api);
    });
    input.addEventListener('click', () => autocomplete.closeIf(api));

    const api = {
      el: wrap, input,
      get value() { return input.value; },
      setValue(v) {
        if (document.activeElement === input) return;
        if (input.value !== v) { input.value = v; }
        paint();
      },
      setError(e) {
        const next = e ? { start: e.start, end: e.end } : null;
        const same = (!next && !err) || (next && err && next.start === err.start && next.end === err.end);
        wrap.classList.toggle('is-invalid', !!e);
        err = next;
        if (!same) paint();
      },
      refresh: paint,
      focus(pos) {
        input.focus({ preventScroll: false });
        if (pos === 'end') { const L = input.value.length; input.setSelectionRange(L, L); }
      },
      insert(text, replaceFrom, replaceTo, caretBack) {
        input.focus();
        input.setSelectionRange(replaceFrom, replaceTo);
        let ok = false;
        try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
        if (!ok) {
          input.setRangeText(text, replaceFrom, replaceTo, 'end');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (caretBack) { const p = input.selectionStart - caretBack; input.setSelectionRange(p, p); }
      },
      kind: o.kind || 'expr',
      noVars: !!o.noVars
    };
    paint();
    return api;
  }

  const autocomplete = (() => {
    let pop = null, owner = null, items = [], sel = 0, range = null;
    const FN_NAMES = Object.keys(E.FUNCTIONS);
    function prefixAt(input) {
      const v = input.value, p = input.selectionStart;
      if (p !== input.selectionEnd) return null;
      let s = p;
      while (s > 0 && /[A-Za-z0-9_\u00C0-\u024F\u0370-\u03FF]/.test(v[s - 1])) s--;
      if (s === p) return null;
      const word = v.slice(s, p);
      if (/^[0-9]/.test(word)) return null;
      if (/[A-Za-z0-9_]/.test(v[p] || '')) return null;
      const hash = v.indexOf('#');
      if (hash >= 0 && hash < s) return null;
      return { word, from: s, to: p };
    }
    function update(field) {
      const input = field.input;
      if (document.activeElement !== input) { close(); return; }
      const pre = prefixAt(input);
      if (!pre) { close(); return; }
      const sym = symbols();
      const pool = [];
      if (!field.noVars) sym.vars.forEach((v) => pool.push({ name: v.name, kind: 'var', desc: v.desc }));
      sym.params.forEach((p) => pool.push({ name: p.name, kind: 'param', desc: p.desc }));
      FN_NAMES.forEach((f) => pool.push({ name: f, kind: 'fn', desc: E.FUNCTIONS[f].sig }));
      const scored = [];
      for (const it of pool) {
        if (it.name === pre.word) continue;
        const r = fuzzy(pre.word, it.name);
        if (!r) continue;
        const starts = it.name.toLowerCase().startsWith(pre.word.toLowerCase());
        if (!starts && pre.word.length < 2) continue;
        scored.push({ it, score: r.score + (starts ? 50 : 0) + (it.kind === 'var' ? 6 : it.kind === 'param' ? 4 : 0), marks: r.marks });
      }
      scored.sort((a, b) => b.score - a.score);
      items = scored.slice(0, 8);
      if (!items.length) { close(); return; }
      owner = field;
      range = pre;
      sel = 0;
      render();
    }
    function render() {
      const list = h('div', { role: 'listbox', 'aria-label': 'Suggestions' });
      items.forEach((x, i) => {
        const b = h('div', { class: 'pop-item', role: 'option', 'aria-selected': String(i === sel), dataset: { i } });
        b.innerHTML = `<span class="dot is-${x.it.kind}"></span><span class="pop-name">${markText(x.it.name, x.marks)}</span><span class="pop-desc">${esc(x.it.desc || '')}</span>`;
        b.addEventListener('mousedown', (e) => { e.preventDefault(); sel = i; accept(); });
        list.append(b);
      });
      const foot = h('div', { class: 'pop-foot', html: '<span>↑↓ move</span><span>↵ or tab accept</span><span>esc close</span>' });
      if (!pop) {
        pop = h('div', { class: 'pop', role: 'presentation' });
        document.getElementById('overlay-root').append(pop);
      }
      pop.textContent = '';
      pop.append(list, foot);
      place();
    }
    function place() {
      if (!pop || !owner) return;
      const r = owner.el.getBoundingClientRect();
      const w = pop.offsetWidth;
      let x = r.left, y = r.bottom + 4;
      const ht = pop.offsetHeight;
      if (y + ht > innerHeight - 8) y = r.top - ht - 4;
      x = Math.max(8, Math.min(innerWidth - w - 8, x));
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
    }
    function accept() {
      const x = items[sel];
      if (!x || !owner) return;
      const f = owner, rg = range;
      close();
      if (x.it.kind === 'fn') {
        const next = f.input.value[rg.to];
        if (next === '(') f.insert(x.it.name, rg.from, rg.to, 0);
        else f.insert(x.it.name + '()', rg.from, rg.to, 1);
      } else f.insert(x.it.name, rg.from, rg.to, 0);
    }
    function close() {
      if (pop) { pop.remove(); pop = null; }
      owner = null; items = []; range = null;
    }
    function key(field, e) {
      if (!pop || owner !== field) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; render(); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; render(); return true; }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') { e.preventDefault(); accept(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return true; }
      return false;
    }
    function closeIf(field) { if (owner === field) close(); }
    window.addEventListener('resize', close);
    document.addEventListener('scroll', () => place(), true);
    return { update, key, close, closeIf, get open() { return !!pop; } };
  })();

  function errorLine() {
    const el = h('div', { class: 'field-error', hidden: true, role: 'alert' });
    return {
      el,
      set(e) {
        if (!e) { if (!el.hidden) { el.hidden = true; el.textContent = ''; } return; }
        const msg = e.message;
        if (el.dataset.msg === msg && !el.hidden) return;
        el.dataset.msg = msg;
        el.innerHTML = icon('alert') + `<span>${esc(msg)}</span>`;
        el.hidden = false;
      }
    };
  }

  N.Field = { create: createField, errorLine, setSymbols: fieldSymbols, autocomplete, highlightHTML };
})(window.Nadir);
