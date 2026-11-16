import { mkdir, copyFile, access, readFile, writeFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';

const required = ['index.html', 'pest-crm-module.js', 'capacitor-bridge.mjs'];
for (const file of required) {
  try { await access(file); }
  catch { throw new Error('Required mobile build input is missing: ' + file); }
}

await mkdir('www', { recursive: true });
await copyFile('index.html', 'www/index.html');
await copyFile('pest-crm-module.js', 'www/pest-crm-module.js');

let html = await readFile('www/index.html', 'utf8');
const babelScripts = [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/gi)];
if (babelScripts.length !== 1) {
  throw new Error('Expected exactly one main Babel application script; found ' + babelScripts.length + '.');
}
const compiled = await transform(babelScripts[0][1], {
  loader: 'jsx', target: 'es2020', minify: true, legalComments: 'none'
});
await writeFile('www/app.js', compiled.code, 'utf8');
html = html.replace(babelScripts[0][0], '<script defer src="./app.js"></script>');

// Defer external scripts while preserving their document order.
html = html.replace(/<script\b([^>]*?)src="([^"]+)"([^>]*)><\/script>/gi, (all, before, src, after) => {
  if (/\bdefer\b/i.test(before + ' ' + after)) return all;
  return '<script' + before + 'src="' + src + '"' + after + ' defer></script>';
});

// Babel Standalone is unnecessary after build-time JSX compilation.
html = html.replace(/<script[^>]+babel-standalone[^>]*><\/script>/i, '');
const preconnects = [
  '<link rel="preconnect" href="https://cdn.tailwindcss.com">',
  '<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>',
  '<link rel="preconnect" href="https://www.gstatic.com" crossorigin>',
  '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>'
].join('\n  ');
html = html.replace('</head>', '  ' + preconnects + '\n</head>');
await writeFile('www/index.html', html, 'utf8');

await build({
  entryPoints: ['capacitor-bridge.mjs'], bundle: true, platform: 'browser',
  format: 'iife', target: ['es2020'], outfile: 'www/capacitor-bridge.js',
  sourcemap: false, minify: true
});
console.log('Optimized mobile assets: JSX precompiled, scripts deferred in order, Babel runtime removed.');
