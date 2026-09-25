(function boot(root) {
  'use strict';
  const Engine = {};
  const modules = [];
  function define(name, fn) {
    modules.push({ name, fn });
    fn(Engine);
  }
  function source(entry) {
    const parts = ['(' + boot.toString() + ')(self);'];
    for (const m of modules) parts.push('NadirEngine.define(' + JSON.stringify(m.name) + ', ' + m.fn.toString() + ');');
    if (entry) parts.push(entry);
    return parts.join('\n');
  }
  root.NadirEngine = { define, source, Engine, modules };
  root.Engine = Engine;
})(self);
