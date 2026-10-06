(function (N) {
  'use strict';

  let deferred = null, reg = null, reloading = false;
  const state = { supported: 'serviceWorker' in navigator, active: false, offlineReady: false, installable: false, installed: false, version: null, platform: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { } });
  const KEY_NUDGE = 'nadir:install-nudge';

  const FAKE = { ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 'ios-chrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1', 'ios-inapp': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0', mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' };

  function platform() {
    const forced = new URLSearchParams(location.search).get('install');
    const ua = (forced && FAKE[forced]) || navigator.userAgent || '';
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1 && !forced;
    const ios = /iPhone|iPad|iPod/.test(ua) || touchMac;
    const ipad = /iPad/.test(ua) || touchMac;
    const inApp = /FBAN|FBAV|Instagram|Line\/|LinkedInApp|Twitter|GSA\/|Snapchat|Pinterest|MicroMessenger|WhatsApp/.test(ua);
    const otherIOS = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/.test(ua);
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|Android/.test(ua);
    const mac = /Macintosh/.test(ua) && !touchMac;
    const ver = (() => { const m = ua.match(/Version\/(\d+)(?:\.(\d+))?/); return m ? +m[1] + (+(m[2] || 0)) / 10 : 0; })();
    const iosVer = (() => { const m = ua.match(/OS (\d+)_(\d+)/); return m ? +m[1] + +m[2] / 10 : ver; })();
    const firefox = /Firefox\//.test(ua) && !ios;
    const android = /Android/.test(ua);
    if (ios && inApp) return { kind: 'ios-inapp', ipad, iosVer };
    if (ios && (otherIOS || !safari)) return { kind: iosVer >= 16.4 && /CriOS|EdgiOS/.test(ua) ? 'ios-chrome' : 'ios-other', ipad, iosVer, browser: /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : 'this browser' };
    if (ios) return { kind: 'ios-safari', ipad, iosVer };
    if (mac && safari) return { kind: ver >= 17 ? 'mac-safari' : 'mac-safari-old', ver };
    if (firefox) return { kind: 'firefox' };
    if (android) return { kind: 'android' };
    return { kind: 'desktop' };
  }

  function standalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
  }

  function eligible() {
    if (!state.supported) return false;
    if (document.documentElement.dataset.build === 'single') return false;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return false;
    return true;
  }

  function promptUpdate(worker) {
    N.toast('A new version of Nadir is ready', { kind: 'info', duration: 15000, action: { label: 'Update', run: () => { state.updateRequested = true; worker.postMessage({ type: 'skip-waiting' }); } } });
  }

  async function register() {
    state.platform = platform();
    state.installed = standalone();
    document.documentElement.classList.toggle('is-standalone', state.installed);
    if (state.installed && state.platform.kind.startsWith('ios')) document.documentElement.classList.add('is-ios-app');
    if (state.installed && /source=pwa/.test(location.search)) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]source=pwa/, '').replace(/^&/, '?') + location.hash);
    if (!eligible()) { emit(); return; }
    const hadController = !!navigator.serviceWorker.controller;
    try {
      reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      state.active = true;
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state !== 'installed') return;
          if (navigator.serviceWorker.controller) promptUpdate(w);
          else { state.offlineReady = true; emit(); N.toast('Nadir now works offline', { kind: 'ok' }); }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading || !state.updateRequested) return;
        reloading = true;
        N.Store && N.Store.flushSave();
        location.reload();
      });
      navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.type === 'version') { state.version = ev.data.version; emit(); } });
      await navigator.serviceWorker.ready;
      state.offlineReady = true;
      if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'version' });
      emit();
      setInterval(() => reg.update().catch(() => { }), 60 * 60 * 1000);
      if (navigator.storage && navigator.storage.persist && state.installed) navigator.storage.persist().catch(() => { });
      nudge();
    } catch (e) {
      state.active = false;
      emit();
    }
  }

  function nudge() {
    const p = state.platform;
    if (state.installed || !p || !/^ios-safari$|^mac-safari$/.test(p.kind)) return;
    const seen = N.util.storage(KEY_NUDGE, { visits: 0, dismissed: 0 });
    seen.visits++;
    N.util.store(KEY_NUDGE, seen);
    if (seen.dismissed >= 2 || seen.visits < 3 || seen.visits % 4 !== 3) return;
    setTimeout(() => {
      if (N.Overlays.hasLayer()) return;
      N.toast(p.kind === 'ios-safari' ? 'Add Nadir to your Home Screen for full-screen, offline use' : 'Add Nadir to your Dock to use it like an app', {
        kind: 'info', duration: 9000,
        action: { label: 'Show me', run: () => install() }
      });
      seen.dismissed++;
      N.util.store(KEY_NUDGE, seen);
    }, 4000);
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; state.installable = true; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; state.installable = false; state.installed = true; emit(); N.toast('Nadir installed'); });

  const SHARE_SVG = '<svg viewBox="0 0 24 24" class="ios-glyph" aria-hidden="true"><path d="M12 3.5v11M8 7.5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 10.5H7a1.5 1.5 0 00-1.5 1.5v7A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5v-7a1.5 1.5 0 00-1.5-1.5h-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ADD_SVG = '<svg viewBox="0 0 24 24" class="ios-glyph" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const DOTS_SVG = '<svg viewBox="0 0 24 24" class="ios-glyph" aria-hidden="true"><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/></svg>';
  const DOCK_SVG = '<svg viewBox="0 0 24 24" class="ios-glyph" aria-hidden="true"><rect x="3" y="15" width="18" height="5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="5" width="6" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

  function guide(p) {
    const k = p.kind;
    if (k === 'ios-safari') {
      const where = p.ipad ? 'at the top right, next to the address bar' : 'in the toolbar at the bottom (tap the page once if the toolbar is hidden)';
      return {
        title: p.ipad ? 'Add Nadir to your iPad' : 'Add Nadir to your iPhone',
        lead: 'It opens full-screen from your Home Screen and keeps working with no connection.',
        steps: [
          { ic: SHARE_SVG, t: 'Tap Share', d: `The square with an arrow, ${where}.` },
          { ic: ADD_SVG, t: 'Tap “Add to Home Screen”', d: 'Scroll down the list if you don’t see it — or tap “Edit Actions” to pin it.' },
          { ic: '<span class="ios-add-pill">Add</span>', t: 'Tap Add', d: 'Nadir appears on your Home Screen with its icon.' }
        ],
        point: p.ipad ? 'top' : 'bottom',
        note: p.iosVer && p.iosVer < 16.4 ? 'Your models stay on this device. Tip: update iOS for the best offline experience.' : 'Your models stay on this device; the installed app shares nothing with Safari tabs, so export a library file first if you want to bring models across.',
        copy: false
      };
    }
    if (k === 'ios-chrome') {
      return {
        title: 'Add Nadir to your Home Screen',
        lead: `${p.browser} on iOS can add apps too.`,
        steps: [
          { ic: SHARE_SVG, t: 'Tap Share', d: 'In the address bar at the top right.' },
          { ic: ADD_SVG, t: 'Tap “Add to Home Screen”', d: 'Scroll the list if needed.' },
          { ic: '<span class="ios-add-pill">Add</span>', t: 'Tap Add', d: 'If you don’t see the option, open this page in Safari instead.' }
        ],
        point: 'top', copy: true
      };
    }
    if (k === 'ios-other' || k === 'ios-inapp') {
      return {
        title: 'Open in Safari to install',
        lead: k === 'ios-inapp' ? 'This in-app browser can’t add apps to your Home Screen.' : `${p.browser || 'This browser'} can’t add apps to your Home Screen on iOS.`,
        steps: [
          { ic: '<span class="ios-n">1</span>', t: 'Copy the link', d: 'Use the button below.' },
          { ic: '<span class="ios-n">2</span>', t: 'Open Safari and paste it', d: k === 'ios-inapp' ? 'Or tap ' + '•••' + ' and choose “Open in Safari”.' : 'Tap the address bar, paste, and go.' },
          { ic: SHARE_SVG, t: 'Then Share → Add to Home Screen', d: 'Nadir will open full-screen and offline.' }
        ],
        point: null, copy: true
      };
    }
    if (k === 'mac-safari') {
      return {
        title: 'Add Nadir to your Dock',
        lead: 'Safari turns it into a Mac app with its own window and Dock icon.',
        steps: [
          { ic: DOCK_SVG, t: 'File → Add to Dock…', d: 'Or click Share in the toolbar and choose “Add to Dock”.' },
          { ic: '<span class="ios-add-pill">Add</span>', t: 'Click Add', d: 'Nadir opens from the Dock, Launchpad and Spotlight.' }
        ],
        point: null, copy: false
      };
    }
    if (k === 'mac-safari-old') {
      return { title: 'Install needs Safari 17', lead: 'Update macOS to Sonoma or later to add Nadir to your Dock — or open it in Chrome or Edge and use the install icon in the address bar.', steps: [], copy: true };
    }
    if (k === 'firefox') {
      return { title: 'Firefox can’t install web apps', lead: 'Nadir already works offline here. To get a Dock / Start-menu app, open it in Chrome, Edge or Safari — or download it as a single file you can open anywhere.', steps: [], copy: true, single: true };
    }
    if (k === 'android') {
      return { title: 'Install Nadir', lead: 'Open your browser menu and choose “Install app” or “Add to Home screen”.', steps: [{ ic: DOTS_SVG, t: 'Tap ⋮ (menu)', d: 'Top right of the browser.' }, { ic: ADD_SVG, t: 'Install app', d: 'Then confirm.' }], copy: false };
    }
    return { title: 'Install Nadir', lead: 'Click the install icon at the right of the address bar, or open the browser menu and choose “Install Nadir…”.', steps: [], copy: false, single: true };
  }

  function sheet() {
    const { h, icon } = N.util;
    const p = state.platform || platform();
    const g = guide(p);
    const box = h('div', { class: 'install-sheet' });
    const head = h('div', { class: 'install-head' },
      h('img', { class: 'install-icon', src: 'images/icon-1024.png', alt: '', width: 64, height: 64 }),
      h('div', { class: 'install-titles' }, h('strong', null, 'Nadir'), h('span', null, 'Solver · works offline')));
    box.append(head, h('p', { class: 'install-lead' }, g.lead));
    if (g.steps.length) {
      const ol = h('ol', { class: 'install-steps' });
      g.steps.forEach((s, i) => {
        ol.append(h('li', { style: `--i:${i}` }, h('span', { class: 'install-ic', html: s.ic }), h('span', { class: 'install-txt' }, h('strong', null, s.t), h('span', null, s.d))));
      });
      box.append(ol);
    }
    const acts = h('div', { class: 'install-acts' });
    if (g.copy) {
      const c = h('button', { class: 'btn btn-soft btn-sm', type: 'button', html: icon('link', 'icon-sm') + 'Copy link' });
      c.addEventListener('click', async () => { const ok = await N.util.copyText(location.origin + location.pathname); N.toast(ok ? 'Link copied — paste it in Safari' : 'Copy failed', { kind: ok ? 'ok' : 'bad' }); });
      acts.append(c);
    }
    if (g.single && N.Build) {
      const s = h('button', { class: 'btn btn-outline btn-sm', type: 'button', html: icon('box', 'icon-sm') + 'Download as one file' });
      s.addEventListener('click', () => N.Build.download());
      acts.append(s);
    }
    if (acts.children.length) box.append(acts);
    if (g.note) box.append(h('p', { class: 'field-hint' }, g.note));
    const dlg = N.Overlays.dialog({ title: g.title, body: box, className: 'install-dialog' + (g.point ? ' points-' + g.point : ''), actions: [{ label: 'Got it', kind: 'primary', value: true }] });
    if (g.point) {
      const arrow = h('div', { class: 'install-arrow is-' + g.point + (p.ipad ? ' is-ipad' : ''), 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M12 4v16M6 14l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
      document.getElementById('overlay-root').append(arrow);
      dlg.done.then(() => { if (N.Motion) N.Motion.leave(arrow, 'is-leaving', 160); else arrow.remove(); });
    }
    return dlg;
  }

  async function install() {
    if (state.installed) { N.toast('Nadir is already installed — you’re using the app', { kind: 'ok' }); return; }
    if (!deferred) { sheet(); return; }
    deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    state.installable = false;
    emit();
    if (choice && choice.outcome === 'accepted') state.installed = true;
  }

  async function checkUpdate() {
    if (!reg) { N.toast('Offline support is not active on this address', { kind: 'info' }); return; }
    await reg.update();
    if (!reg.waiting && !reg.installing) N.toast('You have the latest version');
  }

  function label() {
    const p = state.platform || platform();
    if (/^ios/.test(p.kind)) return 'Add to Home Screen';
    if (/^mac-safari/.test(p.kind)) return 'Add to Dock';
    return 'Install Nadir';
  }

  N.PWA = { register, install, checkUpdate, state, label, platform, sheet, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
})(window.Nadir);
