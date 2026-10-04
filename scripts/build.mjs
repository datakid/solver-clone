import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'dist/nadir.html');

const window = {};
const context = vm.createContext({ window, location: { protocol: 'node:' }, fetch: undefined });
vm.runInContext(await readFile(resolve(root, 'js/app/build.js'), 'utf8'), context);
const { inline } = window.Nadir.Build;

const html = await readFile(resolve(root, 'index.html'), 'utf8');
const result = await inline(html, (p) => readFile(resolve(root, p), 'utf8'));

await import('node:fs').then((fs) => fs.mkdirSync(dirname(out), { recursive: true }));
await writeFile(out, result.html);
console.log(`Wrote ${out} — ${result.files} files inlined, ${(result.bytes / 1024).toFixed(1)} KB`);
