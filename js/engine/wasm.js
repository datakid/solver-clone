NadirEngine.define('wasm', function (E) {
  'use strict';

  const leb = (v) => { const o = []; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; o.push(b); } while (v); return o; };
  const sec = (id, body) => [id, ...leb(body.length), ...body];
  const vec = (items) => [...leb(items.length), ...items.flat()];
  const str = (s) => [...leb(s.length), ...Array.from(s, (c) => c.charCodeAt(0))];
  const fn = (locals, code) => { const b = [...vec(locals), ...code, 0x0b]; return [...leb(b.length), ...b]; };

  const I32 = 0x7f, F64 = 0x7c, V128 = 0x7b;
  const get = (i) => [0x20, i], set = (i) => [0x21, i], tee = (i) => [0x22, i], c32 = (v) => [0x41, ...leb(v)];
  const ADD = 0x6a, SUB = 0x6b, SHL = 0x74, LT = 0x48, GT = 0x4a, GE = 0x4e;
  const V_LOAD = [0xfd, 0x00, 3, 0], V_STORE = [0xfd, 0x0b, 3, 0], SPLAT = [0xfd, 0x14], VADD = [0xfd, 0xf0, 0x01], VMUL = [0xfd, 0xf2, 0x01];
  const LANE = (k) => [0xfd, 0x21, k];
  const F_LOAD = [0x2b, 3, 0], F_STORE = [0x39, 3, 0], I_LOAD = (off) => [0x28, 2, off], FADD = 0xa0, FMUL = 0xa2;
  const F0 = [0x44, 0, 0, 0, 0, 0, 0, 0, 0];
  const step = (p, by) => [...get(p), ...c32(by), ADD, ...set(p)];

  const daxpy = fn([[1, V128]], [
    ...get(3), ...SPLAT, ...set(4),
    0x02, 0x40, 0x03, 0x40,
    ...get(2), ...c32(2), LT, 0x0d, 1,
    ...get(0), ...get(0), ...V_LOAD, ...get(1), ...V_LOAD, ...get(4), ...VMUL, ...VADD, ...V_STORE,
    ...step(0, 16), ...step(1, 16), ...get(2), ...c32(2), SUB, ...set(2),
    0x0c, 0, 0x0b, 0x0b,
    ...get(2), ...c32(0), GT, 0x04, 0x40,
    ...get(0), ...get(0), ...F_LOAD, ...get(1), ...F_LOAD, ...get(3), FMUL, FADD, ...F_STORE,
    0x0b
  ]);

  const ddot = fn([[1, V128], [1, F64]], [
    ...F0, ...SPLAT, ...set(3),
    0x02, 0x40, 0x03, 0x40,
    ...get(2), ...c32(2), LT, 0x0d, 1,
    ...get(3), ...get(0), ...V_LOAD, ...get(1), ...V_LOAD, ...VMUL, ...VADD, ...set(3),
    ...step(0, 16), ...step(1, 16), ...get(2), ...c32(2), SUB, ...set(2),
    0x0c, 0, 0x0b, 0x0b,
    ...get(3), ...LANE(0), ...get(3), ...LANE(1), FADD, ...set(4),
    ...get(2), ...c32(0), GT, 0x04, 0x40,
    ...get(4), ...get(0), ...F_LOAD, ...get(1), ...F_LOAD, FMUL, FADD, ...set(4),
    0x0b,
    ...get(4)
  ]);

  const spmv = fn([[2, I32], [1, F64], [1, I32]], [
    0x02, 0x40, 0x03, 0x40,
    ...get(9), ...get(5), GE, 0x0d, 1,
    ...get(0), ...get(9), ...c32(2), SHL, ADD, ...tee(7), ...I_LOAD(0), ...set(6),
    ...get(7), ...I_LOAD(4), ...set(7),
    ...F0, ...set(8),
    0x02, 0x40, 0x03, 0x40,
    ...get(6), ...get(7), GE, 0x0d, 1,
    ...get(2), ...get(6), ...c32(3), SHL, ADD, ...F_LOAD,
    ...get(3), ...get(1), ...get(6), ...c32(2), SHL, ADD, ...I_LOAD(0), ...c32(3), SHL, ADD, ...F_LOAD,
    FMUL, ...get(8), FADD, ...set(8),
    ...step(6, 1),
    0x0c, 0, 0x0b, 0x0b,
    ...get(4), ...get(9), ...c32(3), SHL, ADD, ...get(8), ...F_STORE,
    ...step(9, 1),
    0x0c, 0, 0x0b, 0x0b
  ]);

  const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...sec(1, vec([[0x60, 4, I32, I32, I32, F64, 0], [0x60, 3, I32, I32, I32, 1, F64], [0x60, 6, I32, I32, I32, I32, I32, I32, 0]])),
    ...sec(2, vec([[...str('e'), ...str('m'), 0x02, 0x00, 0x01]])),
    ...sec(3, vec([[0], [1], [2]])),
    ...sec(7, vec([[...str('a'), 0x00, 0], [...str('d'), 0x00, 1], [...str('t'), 0x00, 2]])),
    ...sec(10, vec([daxpy, ddot, spmv]))
  ]);

  let mod = null;
  try {
    if (typeof WebAssembly === 'object' && WebAssembly.validate(bytes)) mod = new WebAssembly.Module(bytes);
  } catch (e) { mod = null; }

  function instance(byteLen) {
    const pages = Math.max(1, Math.ceil(byteLen / 65536));
    const mem = new WebAssembly.Memory({ initial: pages });
    const ex = new WebAssembly.Instance(mod, { e: { m: mem } }).exports;
    return { mem, axpy: ex.a, dot: ex.d, spmv: ex.t };
  }

  function dense(m) {
    const k = instance((m * m + 2 * m) * 8);
    const buf = k.mem.buffer;
    return { A: new Float64Array(buf, 0, m * m), X: new Float64Array(buf, m * m * 8, m), W: new Float64Array(buf, (m * m + m) * 8, m), axpy: k.axpy, dot: k.dot, xo: m * m * 8, wo: (m * m + m) * 8 };
  }

  function pricer(cs, ci, cv, n, m) {
    const nnz = cs[n];
    const oCs = 0, oCi = oCs + (n + 1) * 4, oCv = Math.ceil((oCi + nnz * 4) / 8) * 8, oY = oCv + nnz * 8, oOut = oY + m * 8;
    const k = instance(oOut + n * 8);
    const buf = k.mem.buffer;
    new Int32Array(buf, oCs, n + 1).set(cs);
    new Int32Array(buf, oCi, nnz).set(ci);
    new Float64Array(buf, oCv, nnz).set(cv);
    const Y = new Float64Array(buf, oY, m), OUT = new Float64Array(buf, oOut, n);
    return { price(y) { Y.set(y); k.spmv(oCs, oCi, oCv, oY, oOut, n); return OUT; } };
  }

  E.wasm = mod ? { dense, pricer, simd: true } : null;
  E.wasmEnabled = () => !!E.wasm && !E.wasmOff;
});
