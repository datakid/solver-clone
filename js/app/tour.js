(function (N) {
  'use strict';
  const { h, icon, esc, keys } = N.util;
  const S = N.Store;
  const O = N.Overlays;

  const STEPS = [
    { sel: '#goal-card', title: 'Start with a goal', text: 'Say what you want <strong>as big</strong> (profit, reach) or <strong>as small</strong> (cost, time) as possible. Use the names you define below — the line underneath repeats it back in plain words.' },
    { sel: '#decide-card', title: 'Decide what can change', text: 'These are the numbers Nadir chooses for you. Pick <strong>1.5</strong> for any number, <strong>1, 2</strong> for whole numbers, or <strong>Y/N</strong> for yes/no choices, and give each an allowed range.' },
    { sel: '#rules-card', title: 'Add the rules', text: 'Limits the answer must respect — like <span class="mono">oven time ≤ 60</span>. The pill on the right checks each rule live: <span class="tour-pill ok">slack</span> means there is room to spare, <span class="tour-pill info">binding</span> means it is right at the limit.' },
    { sel: '#given-card', title: 'Name your numbers', text: 'Put prices, costs and capacities here, so rules read like sentences. Paste a table straight from Excel, or turn a number into a <strong>slider</strong> to play “what if”.' },
    { sel: '#solve-button', title: 'Solve', text: `Press the button or ${keys('Mod+Enter')}. Nadir looks at your model and picks the right method automatically — linear, integer or nonlinear.`, pad: 6 },
    { sel: '#results-col', title: 'Read the answer', text: 'You get the best value, every decision, and a short <strong>In plain words</strong> summary: what to do, what holds you back, and which limit is worth loosening first.', sheet: true },
    { sel: '#help-btn', title: 'Help is always here', text: `The <strong>Language guide</strong> lists every function with examples. Press ${keys('Mod+K')} to search every action, and <span class="kbd">?</span> for shortcuts.`, pad: 4 }
  ];

  let st = null;

  function start(opts) {
    const o = opts || {};
    if (st) end();
    if (O.hasLayer()) O.closeTop();
    N.Drawer && N.Drawer.close();
    if (S.ui.goalView === 'text') N.App.goal.setView('form');
    let loaded = false;
    if (S.isBlank() || o.example) { N.Templates.open('bakery', { quiet: true }); loaded = true; N.Live.flush(); }
    const scrim = h('div', { class: 'tour-scrim' });
    const spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
    const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title' });
    const root = h('div', { class: 'tour' }, scrim, spot, card);
    document.getElementById('overlay-root').append(root);
    const layer = { close: () => end() };
    O.pushLayer(layer);
    const prev = document.activeElement;
    const onKey = (e) => {
      if (!st) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); go(st.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(st.i - 1); }
      else O.trapFocus(card, e);
    };
    const onMove = () => { if (st) place(); };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    scrim.addEventListener('click', () => end());
    st = { root, spot, card, layer, onKey, onMove, prev, i: 0, loaded };
    go(0);
  }

  function target(step) {
    const el = document.querySelector(step.sel);
    return el && el.getClientRects().length ? el : null;
  }

  function go(i) {
    if (!st) return;
    if (i >= STEPS.length) { end(true); return; }
    if (i < 0) return;
    st.i = i;
    const step = STEPS[i];
    const col = document.getElementById('results-col');
    if (col) col.classList.toggle('is-open', !!step.sheet || col.classList.contains('is-open'));
    const el = target(step);
    if (el) el.scrollIntoView({ block: el.offsetHeight > innerHeight * 0.6 ? 'start' : 'center', behavior: N.util.reduceMotion() ? 'auto' : 'smooth' });
    const last = i === STEPS.length - 1;
    st.card.innerHTML = '';
    const dots = h('div', { class: 'tour-dots', 'aria-hidden': 'true' });
    STEPS.forEach((_, k) => dots.append(h('span', { class: k === i ? 'is-on' : k < i ? 'is-done' : '' })));
    const back = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === 0, html: icon('arrowLeft', 'icon-xs') + 'Back' });
    back.addEventListener('click', () => go(i - 1));
    const next = h('button', { class: 'btn btn-primary btn-sm', type: 'button', html: last ? 'Finish' + icon('check', 'icon-xs') : 'Next' + icon('arrowRight', 'icon-xs') });
    next.addEventListener('click', () => go(i + 1));
    const skip = h('button', { class: 'btn btn-ghost btn-sm tour-skip', type: 'button' }, 'Skip tour');
    skip.addEventListener('click', () => end());
    st.card.append(
      h('div', { class: 'tour-top' }, h('span', { class: 'tour-count' }, `${i + 1} of ${STEPS.length}`), skip),
      h('h3', { id: 'tour-title' }, step.title),
      h('p', { html: step.text }),
      h('div', { class: 'tour-foot' }, dots, h('div', { class: 'tour-btns' }, back, next))
    );
    st.card.classList.remove('is-in');
    void st.card.offsetWidth;
    st.card.classList.add('is-in');
    place();
    setTimeout(place, 320);
    setTimeout(place, 620);
    requestAnimationFrame(() => next.focus({ preventScroll: true }));
  }

  function place() {
    if (!st) return;
    const step = STEPS[st.i];
    const el = target(step);
    const pad = step.pad != null ? step.pad : 10;
    const cw = Math.min(360, innerWidth - 24);
    st.card.style.width = cw + 'px';
    const ch = st.card.offsetHeight;
    if (!el) {
      st.spot.style.opacity = '0';
      st.card.style.left = (innerWidth - cw) / 2 + 'px';
      st.card.style.top = Math.max(12, (innerHeight - ch) / 2) + 'px';
      return;
    }
    const r = el.getBoundingClientRect();
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    const bottom = Math.min(innerHeight - 4, r.bottom + pad), right = Math.min(innerWidth - 4, r.right + pad);
    Object.assign(st.spot.style, { opacity: '1', top: top + 'px', left: left + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });
    const gap = 14;
    let x, y;
    if (innerWidth < 720) {
      x = (innerWidth - cw) / 2;
      y = bottom + gap + ch < innerHeight - 8 ? bottom + gap : top - gap - ch > 8 ? top - gap - ch : innerHeight - ch - 12;
    } else if (right + gap + cw < innerWidth - 8) {
      x = right + gap; y = Math.min(Math.max(12, top), innerHeight - ch - 12);
    } else if (left - gap - cw > 8) {
      x = left - gap - cw; y = Math.min(Math.max(12, top), innerHeight - ch - 12);
    } else {
      x = Math.min(Math.max(12, left), innerWidth - cw - 12);
      y = bottom + gap + ch < innerHeight - 8 ? bottom + gap : Math.max(12, top - gap - ch);
    }
    st.card.style.left = Math.round(x) + 'px';
    st.card.style.top = Math.round(Math.max(8, y)) + 'px';
  }

  function end(finished) {
    if (!st) return;
    const s = st;
    st = null;
    document.removeEventListener('keydown', s.onKey, true);
    window.removeEventListener('resize', s.onMove);
    document.removeEventListener('scroll', s.onMove, true);
    O.popLayer(s.layer);
    s.root.classList.add('is-out');
    setTimeout(() => s.root.remove(), 180);
    S.saveUI({ toured: true });
    if (s.prev && s.prev.focus && document.contains(s.prev)) s.prev.focus({ preventScroll: true });
    if (finished && s.loaded) N.toast('Try it — press Solve on the Bakery example', { kind: 'info', action: { label: 'Solve', run: () => N.Solve.run() } });
    else if (finished) N.toast('You are all set', { kind: 'ok' });
  }

  N.Tour = { start, end, get active() { return !!st; }, steps: STEPS };
})(window.Nadir);
