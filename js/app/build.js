(function (N) {
  'use strict';

  const SCRIPT_CLOSE = new RegExp('<' + '/(script)', 'gi');
  const STYLE_CLOSE = new RegExp('<' + '/(style)', 'gi');
  const SCRIPT_TAG = new RegExp('<' + 'script src="([^"]+)"><' + '/script>', 'g');
  const LINK_TAG = /<link rel="stylesheet" href="([^"]+)">/g;
  const PWA_TAGS = /<link rel="manifest"[^>]*>\s*|<link rel="apple-touch-icon"[^>]*>\s*/g;

  const safeJS = (s) => s.replace(SCRIPT_CLOSE, '<\\/$1').replace(/<!--/g, '<\\!--');
  const safeCSS = (s) => s.replace(STYLE_CLOSE, '<\\/$1');

  function inline(html, read) {
    const assets = [];
    const collect = (re) => { let m; re.lastIndex = 0; while ((m = re.exec(html))) assets.push(m[1]); };
    collect(LINK_TAG); collect(SCRIPT_TAG);
    return Promise.all(assets.map((p) => Promise.resolve(read(p)).then((t) => [p, t]))).then((pairs) => {
      const got = new Map(pairs);
      let out = html.replace(PWA_TAGS, '');
      out = out.replace(LINK_TAG, (_, p) => '<style data-src="' + p + '">\n' + safeCSS(got.get(p)) + '\n<' + '/style>');
      out = out.replace(SCRIPT_TAG, (_, p) => '<' + 'script data-src="' + p + '">\n' + safeJS(got.get(p)) + '\n<' + '/script>');
      out = out.replace('<html lang="en"', '<html lang="en" data-build="single"');
      return { html: out, files: assets.length, bytes: out.length };
    });
  }

  async function fromServer() {
    if (location.protocol === 'file:') throw new Error('Open Nadir from a web server (or use tools/build.mjs) to build a single file');
    const get = (p) => fetch(p, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`Could not read ${p}`); return r.text(); });
    const html = await get('index.html');
    return inline(html, get);
  }

  async function download() {
    try {
      const r = await fromServer();
      N.util.download('nadir.html', r.html, 'text/html;charset=utf-8');
      N.toast(`nadir.html built — ${r.files} files, ${Math.round(r.bytes / 1024)} KB, works offline`);
    } catch (e) {
      N.toast(e.message, { kind: 'bad' });
    }
  }

  N.Build = { inline, fromServer, download, isSingle: () => document.documentElement.dataset.build === 'single' };
})(window.Nadir);
