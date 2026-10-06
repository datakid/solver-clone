(function (N) {
  'use strict';

  let url = null;
  let worker = null;
  let runSeq = 0;
  let current = null;
  let fallback = false;

  function makeUrl() {
    if (url) return url;
    const src = NadirEngine.source('Engine.workerMain(self);');
    url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return url;
  }

  function spawn() {
    if (fallback) return null;
    try {
      worker = new Worker(makeUrl());
      worker.onmessage = onMessage;
      worker.onerror = (e) => {
        e.preventDefault && e.preventDefault();
        if (current) { const c = current; current = null; c.reject(new Error(e.message || 'Worker failed')); }
        worker = null;
      };
    } catch (e) {
      fallback = true;
      worker = null;
    }
    return worker;
  }

  function onMessage(ev) {
    const msg = ev.data;
    if (!current || msg.runId !== current.runId) return;
    if (msg.type === 'progress') current.onProgress && current.onProgress(msg);
    else if (msg.type === 'step') current.onStep && current.onStep(msg.step);
    else if (msg.type === 'done') { const c = current; current = null; c.resolve(msg.result); }
    else if (msg.type === 'error') { const c = current; current = null; c.reject(new Error(msg.message)); }
  }

  function run(payload, handlers) {
    if (current) stop();
    if (!worker) spawn();
    const runId = ++runSeq;
    return new Promise((resolve, reject) => {
      current = Object.assign({ runId, resolve, reject }, handlers || {});
      if (!worker) {
        setTimeout(() => {
          try {
            const res = payload.type === 'sweep'
              ? { steps: Engine.sweep(payload.model, payload.settings, payload.param, payload.values, null, (s) => handlers.onStep && handlers.onStep(s)) }
              : Engine.solve(payload.model, payload.settings, (p) => handlers.onProgress && handlers.onProgress(p));
            if (current && current.runId === runId) { current = null; resolve(res); }
          } catch (e) { current = null; reject(e); }
        }, 0);
        return;
      }
      worker.postMessage(Object.assign({ runId }, payload));
    });
  }

  let pool = null;
  const poolSize = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

  function stopPool() {
    if (!pool) return false;
    const p = pool;
    pool = null;
    p.workers.forEach((w) => w.terminate());
    p.reject(Object.assign(new Error('Stopped'), { stopped: true }));
    return true;
  }

  function parallelSweep(model, settings, param, values, onStep) {
    const k = Math.min(poolSize(), Math.ceil(values.length / 2));
    if (fallback || k < 2 || values.length < 4) return run({ type: 'sweep', model, settings, param, values }, { onStep });
    if (current) stop();
    stopPool();
    return new Promise((resolve, reject) => {
      const chunks = Array.from({ length: k }, () => []);
      const span = Math.ceil(values.length / k);
      values.forEach((v, i) => chunks[Math.min(k - 1, Math.floor(i / span))].push(i));
      const steps = new Array(values.length);
      let left = k;
      const P = { workers: [], reject };
      pool = P;
      const fail = (msg) => { if (pool !== P) return; stopPool(); };
      chunks.forEach((idx, c) => {
        let w;
        try { w = new Worker(makeUrl()); } catch (e) { fallback = true; pool = null; P.workers.forEach((x) => x.terminate()); run({ type: 'sweep', model, settings, param, values }, { onStep }).then(resolve, reject); return; }
        P.workers.push(w);
        const runId = ++runSeq;
        w.onmessage = (ev) => {
          const m = ev.data;
          if (pool !== P || m.runId !== runId) return;
          if (m.type === 'step') { const s = Object.assign({}, m.step, { i: idx[m.step.i], worker: c }); steps[s.i] = s; onStep && onStep(s); }
          else if (m.type === 'done') { w.terminate(); if (--left === 0) { pool = null; resolve({ steps: steps.filter(Boolean), workers: k }); } }
          else if (m.type === 'error') { P.reject = () => {}; stopPool(); reject(new Error(m.message)); }
        };
        w.onerror = (e) => { e.preventDefault && e.preventDefault(); if (pool !== P) return; P.reject = () => {}; stopPool(); reject(new Error(e.message || 'Worker failed')); };
        w.postMessage({ type: 'sweep', runId, model, settings, param, values: idx.map((i) => values[i]) });
      });
    });
  }

  function stop() {
    if (stopPool()) return true;
    if (!current) return false;
    const c = current;
    current = null;
    if (worker) { worker.terminate(); worker = null; }
    c.reject(Object.assign(new Error('Stopped'), { stopped: true }));
    spawn();
    return true;
  }

  N.WorkerHost = {
    warm() { if (!worker) spawn(); },
    solve(model, settings, onProgress) { return run({ type: 'solve', model, settings }, { onProgress }); },
    sweep: parallelSweep,
    stop,
    get poolSize() { return poolSize(); },
    get busy() { return !!current || !!pool; },
    get inWorker() { return !fallback; }
  };
})(window.Nadir);
