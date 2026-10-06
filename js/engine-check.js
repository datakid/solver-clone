(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const only = q.get('only'), skip = q.get('skip');
  const res = Engine.runTests((name) => (!only || name.includes(only)) && (!skip || !name.includes(skip)));
  const pass = res.filter((r) => r.ok).length;
  const lines = res.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + ' (' + r.ms + 'ms)' + (r.ok ? '' : '\n   ' + r.detail));
  document.getElementById('out').textContent = `${pass}/${res.length} passed\n` + lines.join('\n');
  console.log(`SUMMARY ${pass}/${res.length} passed`);
  res.filter((r) => !r.ok).forEach((r) => console.log('FAIL ' + r.name + ' :: ' + String(r.detail).slice(0, 900)));
  res.filter((r) => r.ok).forEach((r) => console.log('PASS ' + r.name + ' ' + r.ms + 'ms'));
})();
