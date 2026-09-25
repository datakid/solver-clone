NadirEngine.define('text', function (E) {
  'use strict';

  let seq = 0;
  const uid = (p) => p + Date.now().toString(36).slice(-4) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

  function shapeOut(s) {
    const t = String(s || '').trim();
    if (!t || t === '1') return '';
    return '[' + t.replace(/\s*[x×*]\s*/g, ',') + ']';
  }

  function toText(model) {
    const L = [];
    L.push('# ' + (model.name || 'Untitled'));
    if (model.notes) model.notes.split('\n').forEach((n) => L.push('# ' + n));
    const g = model.goal || {};
    if (g.sense === 'target') L.push(`target ${g.expr || ''} = ${g.target == null ? '' : g.target}`);
    else L.push(`${g.sense === 'min' ? 'minimize' : 'maximize'} ${g.expr || ''}`);
    for (const v of model.variables || []) {
      let s = `var ${v.name}${shapeOut(v.shape)}`;
      if (v.type && v.type !== 'real') s += ' ' + v.type;
      if (String(v.lower || '').trim() !== '') s += ` >= ${v.lower}`;
      if (String(v.upper || '').trim() !== '') s += ` <= ${v.upper}`;
      if (String(v.init || '').trim() !== '' && String(v.init).trim() !== '0') s += ` init ${v.init}`;
      if (v.labels && v.labels.length) s += ' labels ' + v.labels.join(', ');
      L.push(s);
    }
    for (const p of model.parameters || []) {
      let s = `param ${p.name} = ${p.expr}`;
      if (p.slider) s += `  # slider ${p.slider.min}..${p.slider.max} step ${p.slider.step}`;
      L.push(s);
    }
    for (const c of model.constraints || []) {
      if (!String(c.expr || '').trim()) continue;
      const lab = c.label && c.label.trim() ? c.label.trim().replace(/[^A-Za-z0-9_]/g, '_') + ': ' : '';
      L.push((c.enabled === false ? '# off: ' : '') + lab + c.expr);
    }
    return L.join('\n') + '\n';
  }

  function splitTop(s, stops) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth === 0) {
        for (const st of stops) if (s.startsWith(st, i) && (i === 0 || /\s/.test(s[i - 1]))) return i;
      }
    }
    return -1;
  }

  function fromText(text, base) {
    const errors = [];
    const m = {
      format: 'nadir', version: 1, id: (base && base.id) || uid('m_'), name: (base && base.name) || 'Untitled', notes: '',
      goal: { sense: 'max', expr: '', target: null }, variables: [], constraints: [], parameters: [],
      settings: (base && base.settings) || { preset: 'balanced' }, scenarios: (base && base.scenarios) || [], updatedAt: Date.now()
    };
    const lines = String(text || '').split(/\r?\n/);
    let named = false;
    const notes = [];
    const oldVars = new Map(((base && base.variables) || []).map((v) => [v.name, v]));
    const oldParams = new Map(((base && base.parameters) || []).map((p) => [p.name, p]));
    const oldRules = ((base && base.constraints) || []).slice();
    lines.forEach((raw, li) => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith('#')) {
        const body = line.replace(/^#\s?/, '');
        const off = body.match(/^off:\s*(.*)$/);
        if (off) { addRule(off[1], false, li); return; }
        if (!named) { m.name = body.trim() || m.name; named = true; } else notes.push(body);
        return;
      }
      const hash = line.indexOf('#');
      const clean = hash >= 0 ? line.slice(0, hash).trim() : line;
      const comment = hash >= 0 ? line.slice(hash + 1) : '';
      const kw = clean.match(/^(maximize|minimize|maximise|minimise|max|min|target)\s+(.*)$/i);
      if (kw) {
        const k = kw[1].toLowerCase();
        if (k === 'target') {
          const at = kw[2].lastIndexOf('=');
          if (at < 0) errors.push({ line: li + 1, message: 'target needs "= value"' });
          m.goal = { sense: 'target', expr: at < 0 ? kw[2].trim() : kw[2].slice(0, at).trim(), target: at < 0 ? '' : kw[2].slice(at + 1).trim() };
        } else m.goal = { sense: k.startsWith('min') ? 'min' : 'max', expr: kw[2].trim(), target: null };
        return;
      }
      const vm = clean.match(/^var\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])?\s*(.*)$/);
      if (vm) {
        let rest = vm[3] || '';
        const v = { id: (oldVars.get(vm[1]) || {}).id || uid('v'), name: vm[1], shape: vm[2] ? vm[2].slice(1, -1).replace(/\s*,\s*/g, 'x') : '1', type: 'real', lower: '', upper: '', init: '0', labels: [] };
        const lab = rest.search(/\blabels\b/);
        if (lab >= 0) { v.labels = rest.slice(lab + 6).split(',').map((s) => s.trim()).filter(Boolean); rest = rest.slice(0, lab); }
        const tm = rest.match(/^\s*(real|int|bin|integer|binary)\b/i);
        if (tm) { const t = tm[1].toLowerCase(); v.type = t.startsWith('int') ? 'int' : t.startsWith('bin') ? 'bin' : 'real'; rest = rest.slice(tm[0].length); }
        const grab = (key) => {
          const at = rest.indexOf(key);
          if (at < 0) return '';
          const after = rest.slice(at + key.length);
          const end = splitTop(after, ['>=', '<=', 'init ']);
          const val = (end < 0 ? after : after.slice(0, end)).trim();
          rest = rest.slice(0, at) + (end < 0 ? '' : after.slice(end));
          return val;
        };
        v.lower = grab('>=');
        v.upper = grab('<=');
        const ini = grab('init ');
        if (ini) v.init = ini;
        if (rest.trim()) errors.push({ line: li + 1, message: `Didn't understand '${rest.trim()}'` });
        m.variables.push(v);
        return;
      }
      const pm = clean.match(/^param\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (pm) {
        const p = { id: (oldParams.get(pm[1]) || {}).id || uid('p'), name: pm[1], expr: pm[2].trim(), slider: null };
        const sm = comment.match(/slider\s+(-?[\d.e+-]+)\.\.(-?[\d.e+-]+)(?:\s+step\s+([\d.e+-]+))?/);
        if (sm) p.slider = { min: +sm[1], max: +sm[2], step: sm[3] ? +sm[3] : 1 };
        m.parameters.push(p);
        return;
      }
      if (/^(var|param)\b/.test(clean)) { errors.push({ line: li + 1, message: `Couldn't read this ${clean.split(/\s/)[0]} line` }); return; }
      addRule(clean, true, li);
    });
    function addRule(src, enabled, li) {
      let label = '', expr = src.trim();
      const lm = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (lm) { label = lm[1].replace(/_/g, ' '); expr = lm[2]; }
      const prev = oldRules.find((r) => r.expr === expr) || oldRules.find((r) => label && (r.label || '').replace(/[^A-Za-z0-9_]/g, '_') === lm[1]);
      if (prev) oldRules.splice(oldRules.indexOf(prev), 1);
      if (prev && prev.label && lm && prev.label.replace(/[^A-Za-z0-9_]/g, '_') === lm[1]) label = prev.label;
      m.constraints.push({ id: prev ? prev.id : uid('c'), label, expr, enabled });
    }
    m.notes = notes.join('\n');
    return { model: m, errors };
  }

  E.toText = toText;
  E.fromText = fromText;
  E.uid = uid;
});
