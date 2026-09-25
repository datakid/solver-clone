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

  function stop() {
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
    sweep(model, settings, param, values, onStep) { return run({ type: 'sweep', model, settings, param, values }, { onStep }); },
    stop,
    get busy() { return !!current; },
    get inWorker() { return !fallback; }
  };
})(window.Nadir);
