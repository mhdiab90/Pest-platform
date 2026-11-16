import { mkdir, copyFile, access, readFile, writeFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';

const required = ['index.html', 'pest-crm-module.js', 'capacitor-bridge.js', 'capacitor-bridge.mjs'];
for (const file of required) {
  try { await access(file); }
  catch { throw new Error('Required mobile build input is missing: ' + file); }
}

await mkdir('www', { recursive: true });
await copyFile('index.html', 'www/index.html');
await copyFile('pest-crm-module.js', 'www/pest-crm-module.js');
await copyFile('capacitor-bridge.js', 'www/capacitor-bridge.js');

let html = await readFile('www/index.html', 'utf8');
const babelScript = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/i);
if (!babelScript) throw new Error('Could not locate the main Babel application script in index.html.');
const compiled = await transform(babelScript[1], {
  loader: 'jsx', target: 'es2020', minify: true, legalComments: 'none'
});
html = html.replace(babelScript[0], '<script>' + compiled.code + '</script>');
html = html.replace(/<script([^>]+)src="([^"]+)"([^>]*)><\/script>/gi, (all, before, src, after) => {
  if (/xlsx-js-style|pdf\.js\/3\.11\.174\/pdf\.min\.js|pdf-lib\/1\.17\.1\/pdf-lib\.min\.js/i.test(src) && !/\bdefer\b/i.test(after)) {
    return '<script' + before + 'src="' + src + '"' + after + ' defer></script>';
  }
  return all;
});
html = html.replace(/<script[^>]+babel-standalone[^>]*><\/script>/i, '');
await writeFile('www/index.html', html, 'utf8');

await build({
  entryPoints: ['capacitor-bridge.mjs'], bundle: true, platform: 'browser',
  format: 'iife', target: ['es2020'], outfile: 'www/capacitor-bridge.js',
  sourcemap: false, minify: true
});
console.log('Optimized mobile assets: JSX precompiled, Babel runtime removed, reports libraries deferred.');
