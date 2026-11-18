import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { transform } from "esbuild";

const outputDirectory = "web-dist";
const requiredAssets = [
  "capacitor-bridge.js",
  "pest-crm-module.js",
  "financial-module.js",
  "firebase-messaging-sw.js"
];

for (const file of ["index.html", ...requiredAssets, "assets/icon.png", "assets/pest-logo-horizontal.webp"]) {
  try {
    await access(file);
  } catch {
    throw new Error("Required web build input is missing: " + file);
  }
}

const htmlSource = await readFile("index.html", "utf8");
const babelScripts = [...htmlSource.matchAll(/<script\b[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/gi)];
if (babelScripts.length !== 1) {
  throw new Error("Expected exactly one React JSX source script; found " + babelScripts.length + ".");
}

const compiled = await transform(babelScripts[0][1], {
  loader: "jsx",
  target: "es2020",
  minify: true,
  legalComments: "none"
});
const bundleHash = createHash("sha256").update(compiled.code).digest("hex").slice(0, 16);
const bundleName = "app." + bundleHash + ".js";

let html = htmlSource.replace(babelScripts[0][0], '<script defer src="./' + bundleName + '"></script>');
html = html.replace(/<script\b[^>]*babel-standalone[^>]*><\/script>/i, "");
html = html.replace(
  /<script\b([^>]*\bsrc=["']\.\/(?:capacitor-bridge|pest-crm-module|financial-module)\.js["'][^>]*)><\/script>/gi,
  (tag) => /\bdefer\b/i.test(tag) ? tag : tag.replace("<script", "<script defer")
);
html = html.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["'](https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.4\.0\/css\/all\.min\.css)["']\s*\/?>/i,
  '<link rel="preload" as="style" href="$1" onload="this.onload=null;this.rel=\'stylesheet\'" />'
);
html = html.replace(
  /<link\s+href=["'](https:\/\/fonts\.googleapis\.com\/css2\?family=Cairo[^"']+)["']\s+rel=["']stylesheet["']\s*\/?>/i,
  '<link rel="preload" as="style" href="$1" onload="this.onload=null;this.rel=\'stylesheet\'" />'
);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputDirectory + "/" + bundleName, compiled.code, "utf8");
await writeFile(outputDirectory + "/index.html", html, "utf8");
await writeFile(outputDirectory + "/_headers", "/index.html\\n  Cache-Control: no-cache, must-revalidate\\n\\n/app.*.js\\n  Cache-Control: public, max-age=31536000, immutable\\n\\n/assets/*\\n  Cache-Control: public, max-age=604800\\n", "utf8");
for (const file of requiredAssets) {
  await copyFile(file, outputDirectory + "/" + file);
}
await cp("assets", outputDirectory + "/assets", { recursive: true });

console.log("Web build ready: JSX precompiled to " + bundleName + "; Babel runtime removed; non-critical icon/font stylesheets load without blocking first paint.");
