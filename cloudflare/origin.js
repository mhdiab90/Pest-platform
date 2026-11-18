export function isAllowedOrigin(origin) {
  if (!origin) return false;
  let parsed;
  try { parsed = new URL(origin); } catch (_) { return false; }
  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  // Local Capacitor/WebView and local development origins.
  if (["localhost", "127.0.0.1", "::1"].includes(host) &&
      ["http:", "https:", "capacitor:"].includes(protocol)) return true;
  if (protocol !== "https:") return false;
  if (origin === ALLOWED_ORIGIN ||
      origin === "https://pest-platform.netlify.app" ||
      origin === "https://pest-platform.ai-mhdiab90.workers.dev") return true;
  if (/^deploy-preview-\d+--pest-platform\.netlify\.app$/.test(host)) return true;
  // The named production Worker and this account's generated Preview Worker
  // hosts are both first-party application origins.
  return /^(?:[a-z0-9-]+-)?pest-platform\.ai-mhdiab90\.workers\.dev$/.test(host);
}
