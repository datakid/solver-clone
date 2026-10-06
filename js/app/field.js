(function (N) {
  'use strict';
  const { h, esc, icon, fuzzy, markText } = N.util;
  const E = window.Engine;

  let symbols = () => ({ vars: [], params: [] });
  let symVersion = '';
  let symSets = null;
  const fieldSymbols = (fn, sig) => { symbols = fn; if (sig !== symVersion || sig == null) { symVersion = sig == null ? String(Math.random()) : sig; symSets = null; } };
  const sets = () => {
    if (!symSets) { const sym = symbols(); symSets = { vars: new Set(sym.vars.map((v) => v.name)), params: new Set(sym.params.map((p) => p.name)) }; }
    return symSets;
  };

  function highlightHTML(src, err, rule) {
    const n = src.length;
    if (!n) return '';
    const cls = new Array(n).fill('');
    const spans = E.highlight(src);
    const { vars, params } = sets();
    spans.forEach((s, i) => {
      let c = '';
      if (s.type === 'num') c = 'tk-num';
      else if (s.type === 'comment') c = 'tk-comment';
      else if (s.type === 'op') c = ['<=', '>=', '=', '<', '>'].includes(s.value) ? 'tk-cmp' : 'tk-op';
      else if (s.type === 'name') {
        if (rule && i === 0 && spans[1] && spans[1].type === 'op' && spans[1].value === ':') c = 'tk-label';
        else if (s.callee || (E.FUNCTIONS[s.value] && !vars.has(s.value) && !params.has(s.value))) c = 'tk-fn';
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
    const wrap = h('div', { class: 'code' + (o.size === 'lg' ? ' code-lg' : '') + (o.className ? ' ' + o.className : '') + (o.assist ? ' has-assist' : '') });
    const box = h('div', { class: 'code-box' });
    const mirror = h('div', { class: 'code-hl', 'aria-hidden': 'true' });
    const inner = h('span', { class: 'code-hl-inner' });
    mirror.append(inner);
    const input = h('input', {
      class: 'code-input', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
      placeholder: o.placeholder || '', 'aria-label': o.ariaLabel || 'Expression', value: o.value || ''
    });
    if (o.id) input.id = o.id;
    if (o.dataField) input.dataset.field = o.dataField;
    box.append(mirror, input);
    wrap.append(box);
    let assistEl = null;
    if (o.assist) {
      assistEl = h('div', { class: 'assist', hidden: true, role: 'toolbar', 'aria-label': 'Insert' });
      assistEl.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
      wrap.append(assistEl);
    }
    let err = null;
    let painted = null;
    const paint = () => {
      const key = input.value + '\u0000' + (err ? err.start + ':' + err.end : '') + '\u0000' + symVersion;
      if (key !== painted) {
        painted = key;
        inner.innerHTML = highlightHTML(input.value, err, o.kind === 'rule') + '&#8203;';
      }
      sync();
    };
    let shift = 0;
    const sync = () => { const s = input.scrollLeft; if (s !== shift) { shift = s; inner.style.transform = s ? `translateX(${-s}px)` : ''; } };

    input.addEventListener('input', () => {
      paint();
      if (o.onInput) o.onInput(input.value);
      autocomplete.update(api);
    });
    input.addEventListener('scroll', sync);
    input.addEventListener('keyup', sync);
    input.addEventListener('select', sync);
    input.addEventListener('focus', () => { wrap.classList.add('is-focus'); if (assistEl) { renderAssist(api, assistEl, o.assist); assistEl.hidden = false; } });
    input.addEventListener('blur', () => { wrap.classList.remove('is-focus'); if (assistEl) setTimeout(() => { if (document.activeElement !== input) assistEl.hidden = true; }, 80); setTimeout(() => autocomplete.closeIf(api), 120); if (o.onBlur) o.onBlur(input.value); });
    input.addEventListener('keydown', (e) => {
      if (autocomplete.key(api, e)) return;
      if (o.onKey) o.onKey(e, api);
    });
    input.addEventListener('click', () => autocomplete.closeIf(api));

    const api = {
      el: wrap, input, box,
      get value() { return input.value; },
      setValue(v) {
        if (document.activeElement === input) return;
        if (input.value !== v) { input.value = v; }
        paint();
      },
      setError(e) {
        const next = e ? { start: e.start, end: e.end } : null;
        const same = (!next && !err) || (next && err && next.start === err.start && next.end === err.end);
        if (wrap.classList.contains('is-invalid') !== !!e) wrap.classList.toggle('is-invalid', !!e);
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
      const r = (owner.box || owner.el).getBoundingClientRect();
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

  function friendly(msg) {
    return String(msg)
      .replace(/^Unknown name '([^']+)'\. Did you mean '([^']+)'\?$/, "Nadir doesn't know '$1' yet. Did you mean '$2'?")
      .replace(/^Unknown name '([^']+)'$/, "Nadir doesn't know '$1' yet — add it as a number or a decision")
      .replace(/^A rule needs a comparison such as <=, >= or =$/, 'A limit needs a comparison — ≤ (at most), ≥ (at least) or = (exactly)')
      .replace(/^Missing operator before '([^']+)'$/, "Something's missing before '$1' — try + or ×")
      .replace(/^Expression ends too early$/, 'This looks unfinished')
      .replace(/^Sizes don't match/, "The lists here have different lengths");
  }

  function fixButtons(e, field, opts) {
    const f = e.fix;
    const o = opts || {};
    const out = [];
    if (!f || !field) return out;
    const btn = (label, run, kind) => {
      const b = h('button', { class: 'fix-btn' + (kind ? ' ' + kind : ''), type: 'button', html: label });
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', run);
      out.push(b);
    };
    if (f.kind === 'unknown') {
      if (f.suggest) btn(icon('check', 'icon-xs') + `Use <b class="mono">${esc(f.suggest)}</b>`, () => field.insert(f.suggest, e.start, e.end), 'is-primary');
      if (N.QuickFix) {
        btn(icon('plus', 'icon-xs') + `Add <b class="mono">${esc(f.name)}</b> as a number`, () => N.QuickFix.addNumber(f.name));
        if (o.vars) btn(icon('plus', 'icon-xs') + `as a decision`, () => N.QuickFix.addDecision(f.name));
      }
    } else if (f.kind === 'compare') {
      [['<=', '≤ at most'], ['>=', '≥ at least'], ['=', '= exactly']].forEach(([op, t]) => btn(esc(t), () => { const L = field.input.value.replace(/\s+$/, '').length; field.insert(' ' + op + ' ', L, field.input.value.length); }));
    }
    return out;
  }

  function errorLine(field, opts) {
    const el = h('div', { class: 'field-error', hidden: true, role: 'alert' });
    return {
      el,
      set(e) {
        if (!e) { if (!el.hidden) { el.hidden = true; el.textContent = ''; el.dataset.msg = ''; } return; }
        const msg = e.message;
        const key = msg + '|' + e.start + '|' + e.end;
        if (el.dataset.msg === key && !el.hidden) return;
        el.dataset.msg = key;
        el.innerHTML = icon('alert') + `<span class="field-error-msg">${esc(friendly(msg))}</span>`;
        const fx = fixButtons(e, field, opts);
        if (fx.length) el.append(h('span', { class: 'fix-row' }, fx));
        el.hidden = false;
      }
    };
  }

  function renderAssist(field, el, mode) {
    const sym = symbols();
    el.textContent = '';
    const chip = (label, text, cls, tip) => {
      const b = h('button', { class: 'assist-chip' + (cls ? ' ' + cls : ''), type: 'button', 'data-tip': tip || null, html: label });
      b.addEventListener('click', () => insertSmart(field, text));
      return b;
    };
    const names = h('div', { class: 'assist-group' });
    const vs = sym.vars.slice(0, 10), ps = sym.params.slice(0, 14);
    vs.forEach((v) => names.append(chip(esc(v.name), v.name, 'is-var', 'Decision · ' + (v.desc || ''))));
    ps.forEach((p) => names.append(chip(esc(p.name), p.name, 'is-param', 'Number · ' + (p.desc || ''))));
    if (!vs.length && !ps.length) names.append(h('span', { class: 'assist-empty' }, 'Names you add in Decisions and Numbers show up here'));
    const ops = h('div', { class: 'assist-group assist-ops' });
    if (mode === 'rule') {
      ops.append(chip('≤ <span>at most</span>', '<=', 'is-cmp'), chip('≥ <span>at least</span>', '>=', 'is-cmp'), chip('= <span>exactly</span>', '=', 'is-cmp'));
    }
    ops.append(chip('+', '+', 'is-op'), chip('−', '-', 'is-op'), chip('×', '*', 'is-op'), chip('÷', '/', 'is-op'), chip('total of…', 'sum(', 'is-fn', 'sum(list) adds up every element'));
    el.append(names, ops);
  }

  function insertSmart(field, text) {
    const input = field.input;
    const v = input.value;
    const a = input.selectionStart == null ? v.length : input.selectionStart;
    const b = input.selectionEnd == null ? a : input.selectionEnd;
    const prev = v.slice(0, a).replace(/\s+$/, '');
    const isWord = /^[A-Za-z_]/.test(text);
    const isOp = !isWord && text !== 'sum(';
    let ins;
    if (text === 'sum(') { ins = (prev && !/[(\s]$/.test(v.slice(0, a)) ? ' ' : '') + 'sum()'; }
    else if (isOp) ins = (prev.length === a ? ' ' : '') + text + ' ';
    else {
      const needOp = /[A-Za-z0-9_)\]]$/.test(prev);
      ins = (needOp ? (prev.length === a ? ' * ' : '* ') : (prev && prev.length === a && !/[(\[]$/.test(prev) ? ' ' : '')) + text;
    }
    field.insert(ins, a, b, text === 'sum(' ? 1 : 0);
  }

  N.Field = { create: createField, errorLine, setSymbols: fieldSymbols, autocomplete, highlightHTML, friendly };
})(window.Nadir);
