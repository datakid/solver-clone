(function (N) {
  'use strict';

  let deferred = null, reg = null, reloading = false;
  const state = { supported: 'serviceWorker' in navigator, active: false, offlineReady: false, installable: false, installed: false, version: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { } });

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
    state.installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
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
    } catch (e) {
      state.active = false;
      emit();
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; state.installable = true; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; state.installable = false; state.installed = true; emit(); N.toast('Nadir installed'); });

  async function install() {
    if (!deferred) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      N.toast(ios ? 'In Safari, tap Share → Add to Home Screen' : 'Use your browser menu → Install Nadir', { kind: 'info', duration: 5000 });
      return;
    }
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

  N.PWA = { register, install, checkUpdate, state, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
})(window.Nadir);
