(function (N) {
  'use strict';
  const { storage, store, debounce } = N.util;
  const E = window.Engine;

  const KEY_CURRENT = 'nadir:current';
  const KEY_LIBRARY = 'nadir:library';
  const KEY_SETTINGS = 'nadir:settings';
  const KEY_PRESETS = 'nadir:presets';
  const KEY_UI = 'nadir:ui';

  function blankModel() {
    return {
      format: 'nadir', version: 1, id: E.uid('m_'), name: 'Untitled model', notes: '',
      goal: { sense: 'max', expr: '', target: null },
      variables: [], constraints: [], parameters: [],
      settings: { preset: 'balanced' }, scenarios: [], updatedAt: Date.now()
    };
  }

  function normalize(raw) {
    const b = blankModel();
    if (!raw || typeof raw !== 'object') return b;
    const m = Object.assign(b, raw);
    m.format = 'nadir';
    m.version = 1;
    m.id = typeof m.id === 'string' && m.id ? m.id : E.uid('m_');
    m.name = String(m.name || 'Untitled model');
    m.notes = String(m.notes || '');
    const g = Object.assign({ sense: 'max', expr: '', target: null }, m.goal || {});
    g.sense = ['max', 'min', 'target'].includes(g.sense) ? g.sense : 'max';
    g.expr = String(g.expr || '');
    g.target = g.target == null ? null : String(g.target);
    m.goal = g;
    const arr = (x) => (Array.isArray(x) ? x : []);
    const seen = new Set();
    const idOf = (x, p) => { let id = typeof x.id === 'string' && x.id ? x.id : E.uid(p); while (seen.has(id)) id = E.uid(p); seen.add(id); return id; };
    m.variables = arr(m.variables).map((v) => ({
      id: idOf(v, 'v'), name: String(v.name || ''), shape: Array.isArray(v.shape) ? (v.shape.length ? v.shape.join('x') : '1') : String(v.shape == null ? '1' : v.shape),
      type: ['real', 'int', 'bin'].includes(v.type) ? v.type : 'real',
      lower: v.lower == null ? '' : String(v.lower), upper: v.upper == null ? '' : String(v.upper), init: v.init == null ? '' : String(v.init),
      labels: arr(v.labels).map(String)
    }));
    m.constraints = arr(m.constraints).map((c) => ({ id: idOf(c, 'c'), label: String(c.label || ''), expr: String(c.expr || ''), enabled: c.enabled !== false }));
    m.parameters = arr(m.parameters).map((p) => ({
      id: idOf(p, 'p'), name: String(p.name || ''), expr: String(p.expr == null ? '' : p.expr),
      slider: p.slider && typeof p.slider === 'object' ? { min: +p.slider.min || 0, max: Number.isFinite(+p.slider.max) ? +p.slider.max : 100, step: +p.slider.step || 1 } : null
    }));
    m.scenarios = arr(m.scenarios).filter((s) => s && typeof s === 'object');
    m.settings = m.settings && typeof m.settings === 'object' ? m.settings : { preset: 'balanced' };
    m.updatedAt = +m.updatedAt || Date.now();
    return m;
  }

  function serialize(m) {
    const out = JSON.parse(JSON.stringify(m));
    out.variables.forEach((v) => {
      const s = String(v.shape || '1').trim();
      const parts = s.split(/\s*[x×,]\s*/).map(Number);
      v.shape = s === '1' || s === '' ? [] : parts.every((x) => Number.isInteger(x) && x > 0) ? parts : s;
    });
    return out;
  }

  const defaultSettings = () => Object.assign({}, E.DEFAULT_SETTINGS, { decimals: 'auto', liveResolve: true, theme: 'system', collapseGiven: null, explain: true });

  const listeners = new Map();
  const S = {
    model: null,
    settings: null,
    library: [],
    presets: [],
    unsaved: false,
    result: null,
    baseline: null,
    kept: null,
    running: false,
    progress: null,
    stale: false,
    compiled: null,
    live: null,
    history: [],
    future: [],
    ui: Object.assign({ goalView: 'form', advanced: {}, givenCollapsed: null, showAdvancedResults: false, toured: false }, storage(KEY_UI, {})),

    on(topic, fn) {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(fn);
      return () => listeners.get(topic).delete(fn);
    },
    emit(topic, payload) {
      const set = listeners.get(topic);
      if (set) for (const fn of [...set]) { try { fn(payload); } catch (e) { console.error(e); } }
    },

    pending: null,
    beginEdit() {
      if (S.pending == null) S.pending = JSON.stringify(S.model);
    },
    commitEdit() {
      if (S.pending == null) return;
      const before = S.pending;
      S.pending = null;
      if (before !== JSON.stringify(S.model)) {
        S.history.push(before);
        if (S.history.length > 100) S.history.shift();
        S.future.length = 0;
      }
    },
    snapshot() {
      S.commitEdit();
      S.history.push(JSON.stringify(S.model));
      if (S.history.length > 100) S.history.shift();
      S.future.length = 0;
    },
    edit(fn, opts) {
      const o = opts || {};
      if (o.structural || o.undo) S.snapshot();
      if (fn) fn(S.model);
      S.model.updatedAt = Date.now();
      if (o.structural) S.emit('structure', o);
      S.changed(o);
    },
    changed(o) {
      S.stale = !!S.result;
      S.emit('model', o || {});
      saveCurrent();
      S.emit('dirty');
    },
    replace(model, opts) {
      const o = opts || {};
      if (!o.fresh) S.snapshot();
      S.model = normalize(model);
      S.unsaved = !!o.unsaved;
      if (!o.keepResult) { S.result = null; S.baseline = null; S.kept = null; S.stale = false; }
      S.emit('structure', { all: true });
      S.emit('model', { all: true });
      S.emit('result');
      if (!o.fresh) saveCurrent.flush();
      else saveCurrent();
      S.emit('dirty');
    },
    undo() {
      S.commitEdit();
      if (!S.history.length) return false;
      S.future.push(JSON.stringify(S.model));
      S.model = normalize(JSON.parse(S.history.pop()));
      S.emit('structure', { all: true });
      S.changed({ all: true });
      return true;
    },
    redo() {
      if (!S.future.length) return false;
      S.history.push(JSON.stringify(S.model));
      S.model = normalize(JSON.parse(S.future.pop()));
      S.emit('structure', { all: true });
      S.changed({ all: true });
      return true;
    },

    setSettings(patch, opts) {
      Object.assign(S.settings, patch);
      store(KEY_SETTINGS, S.settings);
      if (patch.decimals !== undefined) N.util.fmt.setDecimals(S.settings.decimals);
      S.emit('settings', patch);
      if (!opts || !opts.quiet) {
        if ('nonNegative' in patch || 'engine' in patch || 'reform' in patch || 'bigM' in patch) S.emit('model', { settings: true });
      }
    },
    applyPreset(key) {
      const p = E.PRESETS[key] || S.presets.find((x) => x.key === key);
      if (!p) return;
      const vals = { preset: key, tol: p.tol, timeLimit: p.timeLimit, multistart: p.multistart, gap: p.gap, patience: p.patience };
      if (p.engine) vals.engine = p.engine;
      S.setSettings(vals);
    },
    savePreset(name) {
      const key = 'custom_' + Date.now().toString(36);
      const s = S.settings;
      const p = { key, label: name, tol: s.tol, timeLimit: s.timeLimit, multistart: s.multistart, gap: s.gap, patience: s.patience, engine: s.engine, custom: true };
      S.presets.push(p);
      store(KEY_PRESETS, S.presets);
      S.setSettings({ preset: key });
      return p;
    },
    deletePreset(key) {
      S.presets = S.presets.filter((p) => p.key !== key);
      store(KEY_PRESETS, S.presets);
      if (S.settings.preset === key) S.applyPreset('balanced');
      S.emit('settings', {});
    },
    solverSettings() {
      const s = S.settings;
      return { reform: s.reform !== false, bigM: s.bigM !== false, lpMethod: s.lpMethod || 'auto', presolve: s.presolve !== false, cuts: s.cuts !== false, ranging: s.ranging !== false, engine: s.engine, tol: +s.tol, timeLimit: +s.timeLimit, multistart: +s.multistart, gap: +s.gap, patience: +s.patience, maxIter: +s.maxIter, nodeLimit: +s.nodeLimit, seed: +s.seed, nonNegative: s.nonNegative !== false };
    },

    saveUI(patch) {
      Object.assign(S.ui, patch);
      store(KEY_UI, { goalView: S.ui.goalView, givenCollapsed: S.ui.givenCollapsed, showAdvancedResults: S.ui.showAdvancedResults, toured: !!S.ui.toured, showChart: !!S.ui.showChart, showSensitivity: S.ui.showSensitivity !== false });
    },

    inLibrary(id) { return S.library.some((m) => m.id === (id || S.model.id)); },
    saveToLibrary() {
      const copy = JSON.parse(JSON.stringify(S.model));
      copy.updatedAt = Date.now();
      const i = S.library.findIndex((m) => m.id === copy.id);
      if (i >= 0) S.library[i] = copy; else S.library.unshift(copy);
      S.unsaved = false;
      persistLibrary();
      S.emit('library');
      S.emit('dirty');
      return copy;
    },
    removeFromLibrary(id) {
      const i = S.library.findIndex((m) => m.id === id);
      if (i < 0) return null;
      const [gone] = S.library.splice(i, 1);
      persistLibrary();
      S.emit('library');
      S.emit('dirty');
      return { item: gone, index: i };
    },
    restoreToLibrary(entry) {
      S.library.splice(Math.min(entry.index, S.library.length), 0, entry.item);
      persistLibrary();
      S.emit('library');
      S.emit('dirty');
    },
    updateLibraryItem(id, patch) {
      const it = S.library.find((m) => m.id === id);
      if (!it) return;
      Object.assign(it, patch, { updatedAt: Date.now() });
      persistLibrary();
      if (id === S.model.id && patch.name) { S.model.name = patch.name; S.emit('name'); saveCurrent(); }
      S.emit('library');
    },
    saveState() {
      if (S.unsaved) return 'unsaved';
      const lib = S.library.find((m) => m.id === S.model.id);
      if (!lib) return 'draft';
      const a = JSON.stringify(Object.assign({}, lib, { updatedAt: 0 }));
      const b = JSON.stringify(Object.assign({}, S.model, { updatedAt: 0 }));
      return a === b ? 'saved' : 'dirty';
    }
  };

  function persistLibrary() {
    S.library.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!store(KEY_LIBRARY, S.library)) N.toast && N.toast('Storage is full — export a few models to free space', { kind: 'bad' });
  }

  const saveCurrent = debounce(() => {
    if (S.unsaved) return;
    store(KEY_CURRENT, S.model);
    S.emit('autosaved');
  }, 400);

  S.load = function () {
    S.settings = Object.assign(defaultSettings(), storage(KEY_SETTINGS, {}));
    N.util.fmt.setDecimals(S.settings.decimals);
    S.presets = storage(KEY_PRESETS, []).filter((p) => p && p.key);
    S.library = storage(KEY_LIBRARY, []).map(normalize);
    const cur = storage(KEY_CURRENT, null);
    S.model = cur ? normalize(cur) : blankModel();
  };
  S.isBlank = () => !S.model.variables.length && !S.model.constraints.length && !S.model.parameters.length && E.isBlank(S.model.goal.expr);
  S.labelMap = () => {
    const out = {};
    S.model.variables.forEach((v) => { const n = v.name.trim(); if (n && v.labels && v.labels.length) out[n] = v.labels; });
    return out;
  };
  S.flushSave = () => saveCurrent.flush();
  S.blankModel = blankModel;
  S.normalize = normalize;
  S.serialize = serialize;
  S.defaultSettings = defaultSettings;

  N.Store = S;
})(window.Nadir);
