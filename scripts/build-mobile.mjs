import { mkdir, copyFile, access } from 'node:fs/promises';
import { build } from 'esbuild';

const required = ['index.html', 'pest-crm-module.js', 'capacitor-bridge.js', 'capacitor-bridge.mjs'];
for (const file of required) {
  try { await access(file); }
  catch { throw new Error('Required mobile build input is missing: ' + file); }
}

await mkdir('www', { recursive: true });
await copyFile('index.html', 'www/index.html');
await copyFile('pest-crm-module.js', 'www/pest-crm-module.js');
await copyFile('capacitor-bridge.js', 'www/capacitor-bridge.js');

await build({
  entryPoints: ['capacitor-bridge.mjs'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  outfile: 'www/capacitor-bridge.js',
  sourcemap: false,
  minify: true
});

console.log('Prepared www/ assets and bundled the native Capacitor bridge.');
