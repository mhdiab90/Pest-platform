import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { transform } from "esbuild";

const outputDirectory = "web-dist";
const requiredAssets = [
  "code-intelligence.js",
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

const appScriptTag = '<script defer src="./' + bundleName + '"></script>';
const appBootstrap = `<script>
(() => {
  const bundleUrl = "./${bundleName}";
  const root = () => document.getElementById("root");
  let lastStartupError = "";
  let finished = false;

  const showFailure = (message) => {
    if (finished) return;
    finished = true;
    const host = root();
    if (!host) return;
    host.replaceChildren();
    const panel = document.createElement("section");
    panel.dir = "rtl";
    panel.style.cssText = "min-height:100vh;display:grid;place-content:center;gap:12px;padding:24px;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif";
    const title = document.createElement("h1");
    title.textContent = "تعذر تشغيل البرنامج";
    title.style.cssText = "font-size:22px;font-weight:800;color:#b91c1c;margin:0";
    const detail = document.createElement("p");
    detail.textContent = message || lastStartupError || "لم تكتمل تهيئة مكتبات التشغيل.";
    detail.style.cssText = "max-width:680px;line-height:1.8;overflow-wrap:anywhere;margin:0";
    const diagnostic = document.createElement("pre");
    diagnostic.textContent = lastStartupError && lastStartupError !== detail.textContent ? lastStartupError : "";
    diagnostic.style.cssText = "max-width:680px;white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:12px";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "إعادة تحميل البرنامج";
    retry.style.cssText = "padding:11px 18px;border:0;border-radius:8px;background:#1d4ed8;color:white;font-weight:800;cursor:pointer";
    retry.onclick = () => window.location.reload();
    panel.append(title, detail);
    if (diagnostic.textContent) panel.append(diagnostic);
    panel.append(retry);
    host.append(panel);
  };

  const startupWatchdog = window.setTimeout(() => {
    if (window.PEST_APP_BOOTED !== true) {
      showFailure(lastStartupError || "لم تكتمل ملفات بدء تشغيل البرنامج خلال المهلة المحددة. تحقق من تحميل ملفات التطبيق والاتصال بالشبكة.");
    }
  }, 25000);

  window.addEventListener("error", event => {
    const target = event.target;
    if (target && target.tagName === "SCRIPT") {
      lastStartupError = "تعذر تحميل ملف: " + (target.src || "script");
    } else if (event.message) {
      lastStartupError = String(event.message) + (event.filename ? " — " + event.filename + ":" + event.lineno : "");
    }
  }, true);
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    lastStartupError = String(reason && (reason.stack || reason.message) || reason || "Unhandled promise rejection");
  });

  const loadScript = (url, timeoutMs = 12000) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      script.remove();
      reject(new Error("انتهت مهلة تحميل: " + url));
    }, timeoutMs);
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error("تعذر تحميل: " + url));
    };
    document.head.appendChild(script);
  });

  const ensure = async (test, urls, label) => {
    if (test()) return;
    let lastError = null;
    for (const url of urls) {
      try {
        await loadScript(url);
        if (test()) return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(label + (lastError ? " — " + lastError.message : ""));
  };

  const start = async () => {
    try {
      await ensure(
        () => window.React && typeof window.React.createElement === "function",
        [
          "https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js",
          "https://unpkg.com/react@18.2.0/umd/react.production.min.js"
        ],
        "تعذر تحميل مكتبة React من المصادر الأساسية والبديلة."
      );
      await ensure(
        () => window.ReactDOM && typeof window.ReactDOM.createRoot === "function",
        [
          "https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js",
          "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"
        ],
        "تعذر تحميل مكتبة ReactDOM."
      );
      await ensure(
        () => window.firebase && typeof window.firebase.initializeApp === "function",
        ["https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js?retry=1"],
        "تعذر تحميل Firebase App."
      );
      await ensure(
        () => window.firebase && typeof window.firebase.auth === "function",
        ["https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js?retry=1"],
        "تعذر تحميل Firebase Authentication."
      );
      await ensure(
        () => window.firebase && typeof window.firebase.database === "function",
        ["https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js?retry=1"],
        "تعذر تحميل Firebase Database."
      );

      const bundle = document.createElement("script");
      bundle.src = bundleUrl;
      bundle.async = true;
      bundle.onerror = () => showFailure("تعذر تحميل ملف تشغيل التطبيق: " + bundleUrl);
      bundle.onload = () => {
        window.setTimeout(() => {
          if (window.PEST_APP_BOOTED === true) {
            finished = true;
            window.clearTimeout(startupWatchdog);
          } else showFailure("تم تنزيل ملف التطبيق، لكن React لم يكمل إنشاء الواجهة. " + (lastStartupError || ""));
        }, 1200);
      };
      document.body.appendChild(bundle);
    } catch (error) {
      lastStartupError = String(error && (error.stack || error.message) || error);
      showFailure(error.message || "تعذر تحميل مكتبات التشغيل.");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    void start();
  }
})();
</script>`;
if (!html.includes(appScriptTag)) throw new Error("Compiled application script tag was not found.");
html = html.replace(appScriptTag, appBootstrap);
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
await writeFile(outputDirectory + "/_headers", [
  "/index.html",
  "  Cache-Control: no-cache, must-revalidate",
  "",
  "/app.*.js",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
  "/assets/*",
  "  Cache-Control: public, max-age=604800"
].join("\n") + "\n", "utf8")
for (const file of requiredAssets) {
  await copyFile(file, outputDirectory + "/" + file);
}
await cp("assets", outputDirectory + "/assets", { recursive: true });

console.log("Web build ready: JSX precompiled to " + bundleName + "; code intelligence and screen-level finance permissions included; Babel runtime removed; non-critical icon/font stylesheets load without blocking first paint.");
