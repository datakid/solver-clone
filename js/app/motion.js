(function (N) {
  'use strict';

  const reduce = () => (N.util && N.util.reduceMotion ? N.util.reduceMotion() : false);
  const EASE = 'cubic-bezier(.16,1,.3,1)';

  function leave(el, cls, ms, done) {
    if (!el || !el.isConnected) { if (done) done(); return; }
    if (reduce()) { el.remove(); if (done) done(); return; }
    if (el._leaving) return;
    el._leaving = true;
    el.classList.add(cls || 'is-leaving');
    let finished = false;
    const end = () => { if (finished) return; finished = true; el.remove(); if (done) done(); };
    el.addEventListener('animationend', (e) => { if (e.target === el) end(); });
    setTimeout(end, (ms || 200) + 60);
  }

  function snapshot(container, sel) {
    const map = new Map();
    for (const el of container.querySelectorAll(sel || ':scope > [data-id]')) map.set(el, el.getBoundingClientRect());
    return map;
  }

  function flip(container, before, opts) {
    if (reduce() || !before || !before.size) return;
    const o = opts || {};
    const dur = o.duration || 260;
    for (const [el, r0] of before) {
      if (!el.isConnected || el.classList.contains('is-dragging')) continue;
      const r1 = el.getBoundingClientRect();
      const dy = r0.top - r1.top, dx = r0.left - r1.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
      if (el._flip) el._flip.cancel();
      el._flip = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: dur, easing: EASE });
      el._flip.onfinish = () => { el._flip = null; };
    }
  }

  function collapse(el, ms, done) {
    if (!el || !el.isConnected) { if (done) done(); return; }
    if (reduce()) { el.remove(); if (done) done(); return; }
    const h = el.getBoundingClientRect().height;
    const cs = getComputedStyle(el);
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'none';
    const a = el.animate([
      { height: h + 'px', opacity: 1, transform: 'translateX(0)', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
      { height: '0px', opacity: 0, transform: 'translateX(-6px)', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' }
    ], { duration: ms || 200, easing: 'cubic-bezier(.4,0,.2,1)' });
    let finished = false;
    const end = () => { if (finished) return; finished = true; el.remove(); if (done) done(); };
    a.onfinish = end;
    setTimeout(end, (ms || 200) + 80);
  }

  function autoHeight(el) {
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = 0, anim = null;
    const ro = new ResizeObserver(() => {
      const hNow = el.scrollHeight;
      if (!last) { last = hNow; return; }
      if (reduce() || Math.abs(hNow - last) < 24 || document.hidden) { last = hNow; return; }
      const from = last;
      last = hNow;
      if (anim) anim.cancel();
      const first = el.firstElementChild;
      if (!first) return;
      anim = first.animate([{ clipPath: `inset(0 0 ${Math.max(0, hNow - from)}px 0)` }, { clipPath: 'inset(0 0 0 0)' }], { duration: 240, easing: EASE });
      anim.onfinish = () => { anim = null; };
    });
    ro.observe(el);
    return ro;
  }

  function press(root) {
    root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.btn, .add-row, .template-card, .idea-chip, .segmented button, .solve-btn');
      if (!b || b.disabled || reduce()) return;
      const r = b.getBoundingClientRect();
      if (r.width > 520) return;
      const ink = document.createElement('span');
      ink.className = 'ink';
      const s = Math.max(r.width, r.height) * 1.6;
      ink.style.width = ink.style.height = s + 'px';
      ink.style.left = e.clientX - r.left - s / 2 + 'px';
      ink.style.top = e.clientY - r.top - s / 2 + 'px';
      if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
      b.classList.add('has-ink');
      b.append(ink);
      setTimeout(() => ink.remove(), 520);
    }, { passive: true });
  }

  N.Motion = { leave, flip, snapshot, collapse, autoHeight, press, reduce };
})(window.Nadir = window.Nadir || {});
