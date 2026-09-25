(function (N) {
  'use strict';
  const { h, icon, esc, fmt, download, copyText, encodeShare, decodeShare, parseTable, toNumber, toTSV, toCSV, literal, safeName } = N.util;
  const S = N.Store;
  const E = window.Engine;
  const O = N.Overlays;

  const slug = () => (S.model.name || 'model').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';

  function resultRows() {
    const r = S.result;
    if (!r || !r.values) return null;
    const rows = [['Decision', 'Value']];
    r.layout.forEach((v) => {
      for (let i = 0; i < v.size; i++) rows.push([E.elementName(v, i), r.values[v.offset + i]]);
    });
    return rows;
  }

  function matrixBlocks() {
    const r = S.result;
    const blocks = [];
    r.layout.forEach((v) => {
      const vals = r.values.slice(v.offset, v.offset + v.size);
      if (v.shape.length === 2) {
        const [rr, cc] = v.shape;
        const out = [[v.name, ...Array.from({ length: cc }, (_, j) => j + 1)]];
        for (let i = 0; i < rr; i++) out.push([v.labels[i] || i + 1, ...vals.slice(i * cc, i * cc + cc)]);
        blocks.push(out);
      } else if (v.shape.length === 1) {
        blocks.push([[v.name, 'Value'], ...vals.map((x, i) => [v.labels[i] || i + 1, x])]);
      } else blocks.push([[v.name, vals[0]]]);
    });
    return blocks;
  }

  async function copyForExcel() {
    const r = S.result;
    if (!r || !r.values) { N.toast('Solve first, then copy the results', { kind: 'info' }); return; }
    const parts = [];
    parts.push([[S.model.name], ['Status', r.status], ['Objective', r.objective]]);
    matrixBlocks().forEach((b) => parts.push(b));
    if (r.constraints && r.constraints.length) {
      parts.push([['Rule', 'LHS', 'RHS', 'Slack', 'Binding', 'Shadow price'], ...r.constraints.map((c) => [c.label, c.lhs, c.rhs, c.slack, c.binding ? 'yes' : '', c.dual == null ? '' : c.dual])]);
    }
    const text = parts.map((b) => toTSV(b.map((row) => row.map((x) => (typeof x === 'number' ? fmt.plain(x) : x))))).join('\n\n');
    N.toast((await copyText(text)) ? 'Copied — paste into Excel' : 'Copy failed', { kind: 'ok' });
  }

  function resultsCSV() {
    const r = S.result;
    const rows = [['section', 'name', 'value', 'lower', 'upper', 'reduced_cost']];
    rows.push(['status', r.status, '', '', '', '']);
    rows.push(['objective', S.model.goal.expr, fmt.plain(r.objective), '', '', '']);
    r.layout.forEach((v) => {
      for (let i = 0; i < v.size; i++) {
        const j = v.offset + i;
        rows.push(['decision', E.elementName(v, i), fmt.plain(r.values[j]), fmt.plain(r.bounds.lower[j]), fmt.plain(r.bounds.upper[j]), r.reducedCosts ? fmt.plain(r.reducedCosts[j]) : '']);
      }
    });
    (r.constraints || []).forEach((c) => rows.push(['rule', c.label, fmt.plain(c.lhs), c.op, fmt.plain(c.rhs), c.dual == null ? '' : fmt.plain(c.dual)]));
    return toCSV(rows);
  }

  function markdown() {
    const m = S.model, r = S.result;
    const L = [];
    L.push(`# ${m.name}`, '');
    if (m.notes) L.push(m.notes, '');
    L.push('## Model', '', '```', E.toText(m).trim(), '```', '');
    if (r && r.values) {
      L.push('## Result', '');
      L.push(`**${r.status[0].toUpperCase() + r.status.slice(1)}** · ${r.engineLabel || ''} · ${Math.round(r.ms)} ms`, '');
      L.push(`Objective: **${fmt(r.objective)}**`, '');
      L.push('| Decision | Value |', '|---|---:|');
      r.layout.forEach((v) => { for (let i = 0; i < v.size; i++) L.push(`| ${E.elementName(v, i)} | ${fmt(r.values[v.offset + i])} |`); });
      if (r.constraints && r.constraints.length) {
        L.push('', '| Rule | LHS | RHS | Slack | Binding | Shadow |', '|---|---:|---:|---:|:-:|---:|');
        r.constraints.forEach((c) => L.push(`| ${c.label} | ${fmt(c.lhs)} | ${fmt(c.rhs)} | ${fmt(c.slack)} | ${c.binding ? '●' : ''} | ${c.dual == null ? '' : fmt(c.dual)} |`));
      }
    }
    L.push('', `_Exported from Nadir · ${new Date().toLocaleString()}_`);
    return L.join('\n') + '\n';
  }

  function exportJSON() { download(`${slug()}.nadir.json`, JSON.stringify(S.serialize(S.model), null, 2), 'application/json'); }

  function exportDialog() {
    const hasRes = !!(S.result && S.result.values);
    const items = [
      { icon: 'file', title: 'Nadir model', sub: '.nadir.json — reopen or share', run: exportJSON },
      { icon: 'table', title: 'Results CSV', sub: 'Decisions and rules', need: true, run: () => download(`${slug()}-results.csv`, resultsCSV(), 'text/csv') },
      { icon: 'copy', title: 'Copy for Excel', sub: 'Tab-separated tables', need: true, run: copyForExcel },
      { icon: 'text', title: 'Markdown report', sub: 'Model and results', run: () => download(`${slug()}.md`, markdown(), 'text/markdown') },
      { icon: 'printer', title: 'Print report', sub: 'Or save as PDF', run: () => setTimeout(() => window.print(), 150) },
      { icon: 'code', title: 'CPLEX .lp', sub: 'For Gurobi, CPLEX, HiGHS…', run: () => { const r = E.toLP(S.model, S.solverSettings()); if (r.error) { N.toast(r.error, { kind: 'bad' }); return false; } download(`${slug()}.lp`, r.text); } }
    ];
    const grid = h('div', { class: 'export-grid' });
    let dlg;
    items.forEach((it) => {
      const b = h('button', { class: 'export-item', type: 'button', disabled: it.need && !hasRes });
      b.innerHTML = icon(it.icon) + `<div><strong>${esc(it.title)}</strong><span>${esc(it.need && !hasRes ? 'Solve first' : it.sub)}</span></div>`;
      b.addEventListener('click', () => { const r = it.run(); if (r !== false) dlg.close(); });
      grid.append(b);
    });
    const imp = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: icon('upload', 'icon-sm') + 'Import a .nadir.json file…' });
    imp.addEventListener('click', () => { dlg.close(); pickFile(); });
    dlg = O.dialog({ title: 'Export', body: h('div', null, grid, h('div', { style: { marginTop: '14px' } }, imp)) });
  }

  function pickFile() {
    const inp = h('input', { type: 'file', accept: '.json,.nadir,.txt,.csv,.tsv,application/json,text/plain' });
    inp.addEventListener('change', () => { if (inp.files[0]) importFile(inp.files[0]); });
    inp.click();
  }

  async function importFile(file) {
    const text = await file.text();
    const name = file.name.toLowerCase();
    if (/\.(csv|tsv)$/.test(name)) { pasteDialog(text); return; }
    try {
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      const models = items.filter((x) => x && (x.format === 'nadir' || x.goal || x.variables));
      if (!models.length) throw new Error('Not a Nadir model');
      if (models.length > 1) {
        models.forEach((m) => { const nm = S.normalize(m); if (!S.library.some((x) => x.id === nm.id)) S.library.push(nm); });
        S.library.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        N.util.store('nadir:library', S.library);
        S.emit('library');
        N.toast(`Imported ${models.length} models into the library`);
        N.Drawer.open('library');
        return;
      }
      const m = S.normalize(models[0]);
      if (S.library.some((x) => x.id === m.id) && S.model.id !== m.id) m.id = E.uid('m_');
      S.replace(m, { unsaved: true });
      N.toast(`Opened ${m.name}`, { action: { label: 'Save to library', run: () => { S.saveToLibrary(); N.toast('Saved to library'); } } });
    } catch (e) {
      if (/^\s*(#|maximize|minimize|target|var |param )/m.test(text)) {
        const { model } = E.fromText(text);
        S.replace(model, { unsaved: true });
        N.toast(`Opened ${model.name} from text`);
        return;
      }
      N.toast("Couldn't read that file — expected a .nadir.json model", { kind: 'bad' });
    }
  }

  async function shareDialog() {
    const payload = S.serialize(S.model);
    delete payload.scenarios;
    const code = await encodeShare(payload);
    const url = location.href.split('#')[0].replace(/\?test\b.*$/, '') + '#' + code;
    const inp = h('input', { class: 'input', type: 'text', readonly: true, value: url, 'aria-label': 'Share link' });
    const copy = h('button', { class: 'btn btn-primary', type: 'button', html: icon('copy', 'icon-sm') + 'Copy link' });
    copy.addEventListener('click', async () => { N.toast((await copyText(url)) ? 'Link copied' : 'Copy failed'); });
    const body = h('div', null,
      h('p', null, 'Anyone with this link opens a copy of the model. Everything lives in the link itself, so nothing is uploaded.'),
      h('div', { class: 'share-url' }, inp, copy),
      h('p', { class: 'field-hint' }, `${fmt(url.length)} characters · ${code.startsWith('m=') ? 'compressed' : 'uncompressed'}`));
    O.dialog({ title: 'Share', body });
    setTimeout(() => inp.select(), 50);
  }

  async function openFromHash() {
    const hs = location.hash;
    if (!/^#(m|j)=/.test(hs)) return false;
    try {
      const data = await decodeShare(hs);
      const m = S.normalize(data);
      if (S.library.some((x) => x.id === m.id)) m.id = E.uid('m_');
      S.replace(m, { unsaved: true, fresh: true });
      history.replaceState(null, '', location.pathname + location.search);
      N.toast(`Opened shared model “${m.name}”`, { kind: 'info', action: { label: 'Save to library', run: () => { S.saveToLibrary(); N.toast('Saved to library'); } } });
      return true;
    } catch (e) {
      N.toast('That share link is damaged', { kind: 'bad' });
      return false;
    }
  }

  function pasteDialog(initial) {
    let grid = parseTable(initial);
    let mode = 'columns';
    let hasHeader = true, firstLabels = false;
    const ta = h('textarea', { class: 'input input-mono', style: { height: '110px', padding: '10px', resize: 'vertical' }, placeholder: 'Paste cells copied from Excel or Google Sheets here', 'aria-label': 'Table data' });
    ta.value = initial || '';
    const preview = h('div', { class: 'paste-preview' });
    const opts = h('div', { class: 'paste-options', role: 'radiogroup', 'aria-label': 'How to import' });
    const OPTS = [
      { v: 'columns', t: 'Each column → vector', s: 'One value per column, named from the header row' },
      { v: 'matrix', t: 'Whole table → matrix', s: 'One r×c table you can index as M[i, j]' },
      { v: 'rows', t: 'Each row → vector', s: 'One value per row, named from the first column' }
    ];
    const optBtns = OPTS.map((o) => {
      const b = h('button', { class: 'paste-option', type: 'button', role: 'radio', 'aria-checked': String(o.v === mode) });
      b.innerHTML = `<strong>${esc(o.t)}</strong><span>${esc(o.s)}</span>`;
      b.addEventListener('click', () => { mode = o.v; optBtns.forEach((x, i) => x.setAttribute('aria-checked', String(OPTS[i].v === mode))); if (mode === 'rows') firstLabels = false; refresh(); });
      opts.append(b);
      return b;
    });
    const hdr = N.List.switchEl(hasHeader, (v) => { hasHeader = v; refresh(); }, 'First row is a header');
    const lab = N.List.switchEl(firstLabels, (v) => { firstLabels = v; refresh(); }, 'First column holds labels');
    const nameIn = h('input', { class: 'input input-mono', type: 'text', value: 'data', 'aria-label': 'Matrix name', style: { width: '160px' } });
    const labelTarget = h('select', { class: 'input', 'aria-label': 'Apply labels to decision', style: { width: '200px' } });
    const nameRow = h('label', { class: 'check-row' }, h('span', null, 'Name'), nameIn);
    const labRow = h('label', { class: 'check-row' }, h('span', null, 'Also label decision'), labelTarget);
    const out = h('div', { class: 'paste-result' });
    const warn = h('div', { class: 'field-hint' });
    const body = h('div', null, ta, preview,
      h('div', { class: 'check-row' }, hdr.el, h('span', null, 'First row is a header'), h('span', { style: { width: '16px' } }), lab.el, h('span', null, 'First column → labels')),
      opts, nameRow, labRow, h('div', null, h('div', { class: 'field-label' }, 'Will add to Given'), out, warn));
    let plan = [];
    function refresh() {
      grid = parseTable(ta.value);
      const nums = grid.map((r) => r.map(toNumber));
      const R = grid.length, Cn = grid[0] ? grid[0].length : 0;
      preview.hidden = !R;
      const r0 = hasHeader ? 1 : 0, c0 = firstLabels || mode === 'rows' ? 1 : 0;
      let html = '<table>';
      grid.slice(0, 30).forEach((row, i) => {
        html += '<tr>' + row.slice(0, 20).map((cell, j) => {
          if (i < r0) return `<th>${esc(cell)}</th>`;
          if (j < c0) return `<td class="is-label">${esc(cell)}</td>`;
          const bad = !Number.isFinite(nums[i][j]);
          return `<td class="${bad ? 'is-bad' : ''}">${esc(cell)}</td>`;
        }).join('') + '</tr>';
      });
      preview.innerHTML = html + '</table>';
      nameRow.hidden = mode !== 'matrix';
      const taken = new Set([...S.model.variables.map((v) => v.name), ...S.model.parameters.map((p) => p.name)]);
      plan = [];
      let bad = 0;
      const body = grid.slice(r0);
      const cols = Cn - c0;
      const labels = c0 ? body.map((r) => r[0]) : [];
      if (!R || cols < 1 || !body.length) { out.textContent = 'Nothing to import yet'; warn.textContent = ''; labRow.hidden = true; return; }
      const cellNum = (i, j) => { const v = nums[i + r0][j + c0]; if (!Number.isFinite(v)) { bad++; return 0; } return v; };
      if (mode === 'columns') {
        for (let j = 0; j < cols; j++) {
          const nm = safeName(hasHeader ? grid[0][j + c0] : 'col' + (j + 1), taken);
          taken.add(nm);
          const vals = body.map((_, i) => cellNum(i, j));
          plan.push({ name: nm, expr: vals.length === 1 ? fmt.plain(vals[0]) : literal(vals, [vals.length]) });
        }
      } else if (mode === 'rows') {
        body.forEach((row, i) => {
          const nm = safeName(row[0] || 'row' + (i + 1), taken);
          taken.add(nm);
          const vals = Array.from({ length: cols }, (_, j) => cellNum(i, j));
          plan.push({ name: nm, expr: vals.length === 1 ? fmt.plain(vals[0]) : literal(vals, [vals.length]) });
        });
      } else {
        const nm = safeName(nameIn.value || 'data', new Set([...taken].filter((x) => x !== nameIn.value)));
        const vals = [];
        body.forEach((_, i) => { for (let j = 0; j < cols; j++) vals.push(cellNum(i, j)); });
        plan.push({ name: nm, expr: body.length === 1 ? literal(vals, [vals.length]) : literal(vals, [body.length, cols]) });
      }
      out.textContent = plan.map((p) => `${p.name} = ${p.expr.length > 90 ? p.expr.slice(0, 88) + '…' : p.expr}`).join('\n');
      warn.textContent = bad ? `${bad} ${bad === 1 ? 'cell is' : 'cells are'} not numbers and will become 0` : `${fmt(body.length)} × ${fmt(cols)} numbers`;
      warn.style.color = bad ? 'var(--warn)' : '';
      const vecs = S.model.variables.filter((v) => /^\d+$/.test(String(v.shape).trim()) || /^\d+\s*x\s*\d+$/.test(String(v.shape).trim()));
      labRow.hidden = !(c0 && labels.length && vecs.length);
      const prev = labelTarget.value;
      labelTarget.innerHTML = '<option value="">No</option>' + vecs.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
      labelTarget.value = prev;
      plan.labels = labels;
    }
    ta.addEventListener('input', refresh);
    nameIn.addEventListener('input', refresh);
    const dlg = O.dialog({
      title: 'Paste table', size: 'lg', body,
      actions: [{ label: 'Cancel' }, {
        label: 'Add to Given', kind: 'primary', run: () => {
          if (!plan.length) return false;
          S.edit((m) => {
            plan.forEach((p) => {
              const ex = m.parameters.find((q) => q.name === p.name);
              if (ex) ex.expr = p.expr; else m.parameters.push({ id: E.uid('p'), name: p.name, expr: p.expr, slider: null });
            });
            if (labelTarget.value && plan.labels && plan.labels.length) {
              const v = m.variables.find((x) => x.id === labelTarget.value);
              if (v) v.labels = plan.labels.slice();
            }
          }, { structural: true });
          N.App.given.expand();
          N.toast(`Added ${plan.length} ${plan.length === 1 ? 'value' : 'values'} to Given`);
        }
      }]
    });
    refresh();
    if (!initial) setTimeout(() => ta.focus(), 30);
    return dlg;
  }

  function dropZone() {
    let depth = 0, overlay = null;
    const show = () => { if (overlay) return; overlay = h('div', { class: 'drop-overlay', html: icon('upload') + '<span>Drop a .nadir.json model or a CSV table</span>' }); document.body.append(overlay); };
    const hide = () => { depth = 0; if (overlay) { overlay.remove(); overlay = null; } };
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; show(); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth--; if (depth <= 0) hide(); });
    window.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); hide(); const f = e.dataTransfer.files[0]; if (f) importFile(f); });
  }

  N.IO = { copyForExcel, exportDialog, exportJSON, shareDialog, openFromHash, pasteDialog, pickFile, importFile, dropZone, resultsCSV, markdown };
})(window.Nadir);
