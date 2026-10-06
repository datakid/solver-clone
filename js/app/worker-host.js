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

  function parallelTree(model, settings, onProgress, k) {
    if (current) stop();
    stopPool();
    return new Promise((resolve, reject) => {
      const res = new Array(k);
      let left = k;
      const P = { workers: [], reject };
      pool = P;
      for (let part = 0; part < k; part++) {
        let w;
        try { w = new Worker(makeUrl()); } catch (e) { P.reject = () => {}; stopPool(); reject(e); return; }
        P.workers.push(w);
        const runId = ++runSeq;
        w.onmessage = (ev) => {
          const m = ev.data;
          if (pool !== P || m.runId !== runId) return;
          if (m.type === 'progress') { if (part === 0 && onProgress) onProgress(m); }
          else if (m.type === 'done') { w.terminate(); res[part] = m.result; if (--left === 0) { pool = null; resolve(merge(res, k)); } }
          else if (m.type === 'error') { P.reject = () => {}; stopPool(); reject(new Error(m.message)); }
        };
        w.onerror = (e) => { e.preventDefault && e.preventDefault(); if (pool !== P) return; P.reject = () => {}; stopPool(); reject(new Error(e.message || 'Worker failed')); };
        w.postMessage({ type: 'solve', runId, model, settings: Object.assign({}, settings, { parts: k, part }) });
      }
    });
  }

  function merge(list, k) {
    const ok = list.filter((r) => r && (r.status === 'optimal' || r.status === 'feasible'));
    const sig = list.map((r) => r && r.mip && r.mip.split && r.mip.split.sig);
    const consistent = sig.every((s) => s === sig[0]);
    const sense = list[0] && list[0].sense;
    const better = (a, b) => (sense === 'min' ? a.objective < b.objective : a.objective > b.objective);
    let best = null;
    for (const r of ok) if (!best || better(r, best)) best = r;
    const allDone = list.every((r) => r && r.status !== 'stopped' && !(r.gap > 0));
    const nodes = list.reduce((s, r) => s + ((r && r.nodes) || 0), 0);
    const pivots = list.reduce((s, r) => s + ((r && r.pivots) || 0), 0);
    let out;
    if (best) {
      out = Object.assign({}, best);
      out.status = consistent && allDone ? 'optimal' : best.status === 'optimal' && consistent && list.every((r) => r && r.status !== 'stopped') ? 'optimal' : 'feasible';
      if (out.status === 'optimal') out.gap = 0;
    } else {
      out = Object.assign({}, list.find((r) => r && r.status === 'unbounded') || list.find((r) => r && r.status === 'stopped') || list[0]);
      if (out.status === 'infeasible' && !consistent) out.status = 'stopped';
    }
    out.nodes = nodes; out.pivots = pivots;
    out.parallel = { workers: k, consistent };
    if (out.mip) out.mip = Object.assign({}, out.mip, { dualPivots: list.reduce((s, r) => s + ((r && r.mip && r.mip.dualPivots) || 0), 0), primalPivots: list.reduce((s, r) => s + ((r && r.mip && r.mip.primalPivots) || 0), 0), learned: list.reduce((s, r) => s + ((r && r.mip && r.mip.learned) || 0), 0) });
    return out;
  }

  async function smartSolve(model, settings, onProgress) {
    const first = await run({ type: 'solve', model, settings }, { onProgress });
    const k = Math.min(poolSize(), 4);
    const hard = first && first.engine === 'bb' && (first.status === 'feasible' || first.status === 'stopped' || first.ms > 1500);
    if (!hard || fallback || k < 2 || settings.parallel === false) return first;
    const par = await parallelTree(model, settings, onProgress, k);
    const better = par.objective != null && (first.objective == null || (first.sense === 'min' ? par.objective < first.objective - 1e-9 : par.objective > first.objective + 1e-9));
    if (par.status === 'optimal' && first.status !== 'optimal') return Object.assign(par, { ms: first.ms + par.ms });
    if (better) return Object.assign(par, { ms: first.ms + par.ms });
    return Object.assign(first, { parallel: { workers: k, consistent: par.parallel.consistent, noGain: true } });
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
    solveSmart: smartSolve,
    solveTree: parallelTree,
    sweep: parallelSweep,
    stop,
    get poolSize() { return poolSize(); },
    get busy() { return !!current || !!pool; },
    get inWorker() { return !fallback; }
  };
})(window.Nadir);
