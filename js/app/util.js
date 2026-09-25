(function (N) {
  'use strict';

  const ICONS = {
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    grip: '<circle cx="9" cy="6" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="18" r=".9"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    library: '<path d="M4 5a1 1 0 011-1h3a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1zM10 5a1 1 0 011-1h3a1 1 0 011 1v14a1 1 0 01-1 1h-3a1 1 0 01-1-1zM16.2 5.6l2.8-.8a1 1 0 011.2.7l3 11a1 1 0 01-.7 1.2" transform="translate(-1 0)"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    pin: '<path d="M12 21s-6-5.3-6-10.5a6 6 0 1112 0C18 15.7 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>',
    restore: '<path d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    command: '<path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3z"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
    text: '<path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z"/><path d="M14 3.5v5h5M9 13h6M9 17h4"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v0"/>',
    printer: '<path d="M7 9V4h10v5M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="7" y="14" width="10" height="6"/>',
    code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    flask: '<path d="M9.5 3.5h5M10 3.5v6L4.8 18.2A1.5 1.5 0 006.1 20.5h11.8a1.5 1.5 0 001.3-2.3L14 9.5v-6"/><path d="M7.5 14.5h9"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h0M10 10h0M14 10h0M17.5 10h0M7.5 14h9"/>',
    more: '<circle cx="5.5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18.5" cy="12" r=".9"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 012-2h10M14 11v6M11 14h6"/>',
    file: '<path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z"/><path d="M14 3.5v5h5"/>',
    newFile: '<path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z"/><path d="M14 3.5v5h5M12 11.5v6M9 14.5h6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
    valley: '<path d="M3 6c5 0 6 12 9 12s4-12 9-12"/><circle cx="12" cy="18" r="1.6"/>',
    function: '<path d="M14.5 4.5c-2 0-3 1-3.4 3L9 18c-.4 2-1.4 2.5-3 2.5M7.5 10h8"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    link: '<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/>',
    toggle: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
  };

  function icon(name, cls) {
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }

  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="nadir-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4E9483"/><stop offset="1" stop-color="#2F6457"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#nadir-g)"/><path d="M12 18C22 18 24 46 32 46S42 18 52 18" fill="none" stroke="#F4F8F6" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="46" r="6" fill="#E2B26A" stroke="#2F6457" stroke-width="2"/></svg>';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const frag = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  let decimals = 'auto';
  const NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function fmt(x, opts) {
    if (x == null || x === '') return '—';
    if (typeof x !== 'number') x = Number(x);
    if (Number.isNaN(x)) return 'NaN';
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '−∞';
    const d = opts && opts.decimals != null ? opts.decimals : decimals;
    const minus = (s) => s.replace(/^-/, '−');
    if (d !== 'auto' && d !== '' && d != null) {
      const k = Math.max(0, Math.min(10, Number(d)));
      if (Math.abs(x) >= 1e15) return minus(x.toExponential(3));
      return minus(new Intl.NumberFormat('en-US', { minimumFractionDigits: k, maximumFractionDigits: k }).format(x));
    }
    const a = Math.abs(x);
    if (a < 1e-9) return '0';
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-9 && a < 1e15) return minus(NF.format(r));
    if (a >= 1e9 || a < 1e-4) return minus(x.toExponential(3).replace(/\.?0+e/, 'e'));
    const p = Number(x.toPrecision(6));
    const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(p))) + 1);
    const frac = Math.max(0, 6 - intDigits);
    return minus(new Intl.NumberFormat('en-US', { maximumFractionDigits: frac }).format(p));
  }
  fmt.setDecimals = (d) => { decimals = d == null ? 'auto' : d; };
  fmt.plain = (x) => {
    if (!Number.isFinite(x)) return String(x);
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-9 * Math.max(1, Math.abs(x))) return String(r);
    return String(Number(x.toPrecision(12)));
  };

  function debounce(fn, ms) {
    let t = 0;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.cancel = () => clearTimeout(t);
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    return d;
  }

  function fuzzy(query, text) {
    if (!query) return { score: 1, marks: [] };
    const q = query.toLowerCase(), t = text.toLowerCase();
    const at = t.indexOf(q);
    if (at >= 0) {
      const marks = []; for (let i = 0; i < q.length; i++) marks.push(at + i);
      const wordStart = at === 0 || /[\s_\-.(]/.test(t[at - 1]);
      return { score: 100 - at + (wordStart ? 40 : 0) - t.length * 0.1, marks };
    }
    let ti = 0, score = 0, run = 0;
    const marks = [];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      let found = -1;
      while (ti < t.length) { if (t[ti] === c) { found = ti; break; } ti++; }
      if (found < 0) return null;
      marks.push(found);
      run = marks.length > 1 && marks[marks.length - 2] === found - 1 ? run + 1 : 0;
      score += 2 + run * 3 + (found === 0 || /[\s_\-.(]/.test(t[found - 1]) ? 6 : 0);
      ti = found + 1;
    }
    return { score: score - t.length * 0.1, marks };
  }
  function markText(text, marks) {
    if (!marks || !marks.length) return esc(text);
    const set = new Set(marks);
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      const m = set.has(i);
      if (m && !open) { out += '<mark>'; open = true; }
      if (!m && open) { out += '</mark>'; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function b64urlFromBytes(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  async function encodeShare(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try { return 'm=' + b64urlFromBytes(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { }
    }
    return 'j=' + b64urlFromBytes(bytes);
  }
  async function decodeShare(hash) {
    const h2 = hash.replace(/^#/, '');
    const m = h2.match(/^(m|j)=(.+)$/);
    if (!m) return null;
    let bytes = bytesFromB64url(m[2]);
    if (m[1] === 'm') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function parseTable(text) {
    const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!src.trim()) return [];
    const tab = src.includes('\t');
    const semi = !tab && (src.split('\n')[0].match(/;/g) || []).length > (src.split('\n')[0].match(/,/g) || []).length;
    const sep = tab ? '\t' : semi ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell);
    rows.push(row);
    const w = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => { const o = r.map((s) => s.trim()); while (o.length < w) o.push(''); return o; });
  }
  function toNumber(s) {
    let t = String(s == null ? '' : s).trim();
    if (t === '') return NaN;
    let pct = false;
    if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
    t = t.replace(/^\((.*)\)$/, '-$1').replace(/[$€£¥\s\u00A0]/g, '');
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    const v = parseFloat(t);
    return pct ? v / 100 : v;
  }
  function toTSV(rows) {
    return rows.map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join('\t')).join('\n');
  }
  function toCSV(rows) {
    return rows.map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[,\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
  }

  function literal(values, shape) {
    const f = (v) => fmt.plain(v);
    if (!shape || shape.length === 0) return f(values[0]);
    if (shape.length === 1) return '[' + values.map(f).join(', ') + ']';
    const [r, c] = shape;
    const rows = [];
    for (let i = 0; i < r; i++) rows.push('[' + values.slice(i * c, i * c + c).map(f).join(', ') + ']');
    return '[' + rows.join(', ') + ']';
  }

  function safeName(s, taken) {
    let n = String(s || '').trim().replace(/[^A-Za-z0-9_]+(.)?/g, (m, c) => (c ? c.toUpperCase() : ''));
    if (!n) n = 'col';
    if (/^[0-9]/.test(n)) n = 'c' + n;
    n = n[0].toLowerCase() + n.slice(1);
    let out = n, k = 2;
    while (taken && taken.has(out)) out = n + k++;
    return out;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    const hr = Math.round(m / 60);
    if (hr < 24) return hr + ' h ago';
    const d = Math.round(hr / 24);
    if (d < 7) return d + ' d ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? '⌘' : 'Ctrl';
  function keys(spec) {
    return spec.split('+').map((k) => `<span class="kbd">${esc(k === 'Mod' ? MOD : k === 'Shift' ? (isMac ? '⇧' : 'Shift') : k === 'Alt' ? (isMac ? '⌥' : 'Alt') : k === 'Enter' ? '↵' : k)}</span>`).join('');
  }
  function keyText(spec) {
    return spec.split('+').map((k) => (k === 'Mod' ? MOD : k === 'Shift' ? (isMac ? '⇧' : 'Shift+') : k === 'Alt' ? (isMac ? '⌥' : 'Alt+') : k === 'Enter' ? '↵' : k)).join(isMac ? '' : '').replace(/Ctrl(?!\+)/, 'Ctrl+');
  }

  function storage(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  N.util = { ICONS, icon, LOGO, esc, h, frag, fmt, debounce, fuzzy, markText, download, copyText, encodeShare, decodeShare, parseTable, toNumber, toTSV, toCSV, literal, safeName, timeAgo, isMac, MOD, keys, keyText, storage, store };
})(window.Nadir = window.Nadir || {});
