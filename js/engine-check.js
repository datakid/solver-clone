(function () {
  'use strict';
  const res = Engine.runTests();
  const pass = res.filter((r) => r.ok).length;
  const lines = res.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + ' (' + r.ms + 'ms)' + (r.ok ? '' : '\n   ' + r.detail));
  document.getElementById('out').textContent = `${pass}/${res.length} passed\n` + lines.join('\n');
  console.log(`SUMMARY ${pass}/${res.length} passed`);
  res.filter((r) => !r.ok).forEach((r) => console.log('FAIL ' + r.name + ' :: ' + String(r.detail).slice(0, 600)));
  res.filter((r) => /v3|Guide/.test(r.name)).forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + ' ' + r.ms + 'ms'));
})();
