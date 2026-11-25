const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createAppsScriptEnvelope(payload, secret, options = {}) {
  const sharedSecret = String(secret || "").trim();
  if (sharedSecret.length < 32) {
    throw new Error("GOOGLE_DRIVE_GATEWAY_SECRET must contain at least 32 characters.");
  }

  const payloadText = JSON.stringify(payload);
  if (typeof payloadText !== "string" || payloadText.length > 31 * 1024 * 1024) {
    throw new Error("Apps Script gateway payload is invalid or exceeds the 31 MiB pilot limit.");
  }

  const timestamp = String(options.timestamp ?? Date.now());
  const nonce = String(options.nonce || crypto.randomUUID().replace(/-/g, ""));
  if (!/^\d{10,16}$/.test(timestamp) || !/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) {
    throw new Error("Invalid Apps Script gateway timestamp or nonce.");
  }

  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(payloadText));
  const digestBase64Url = bytesToBase64Url(new Uint8Array(digest));
  const canonicalMessage = [timestamp, nonce, digestBase64Url].join("\n");
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(sharedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(canonicalMessage));

  return {
    timestamp,
    nonce,
    payload: payloadText,
    signature: bytesToBase64Url(new Uint8Array(signature))
  };
}

export async function callAppsScriptGateway(env, payload, fetchImpl = fetch) {
  const endpoint = String(env && env.GOOGLE_DRIVE_GATEWAY_URL || "").trim();
  const secret = String(env && env.GOOGLE_DRIVE_GATEWAY_SECRET || "").trim();
  if (!endpoint) throw new Error("GOOGLE_DRIVE_GATEWAY_URL is not configured.");
  if (!secret) throw new Error("GOOGLE_DRIVE_GATEWAY_SECRET is not configured.");

  let parsedUrl;
  try {
    parsedUrl = new URL(endpoint);
  } catch (_) {
    throw new Error("GOOGLE_DRIVE_GATEWAY_URL is invalid.");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "script.google.com") {
    throw new Error("The Apps Script gateway URL must be an HTTPS script.google.com Web App URL.");
  }

  const envelope = await createAppsScriptEnvelope(payload, secret);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope)
  });
  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (_) {
    throw new Error("Apps Script gateway returned a non-JSON response (HTTP " + response.status + ").");
  }
  if (!response.ok || !data || data.ok !== true) {
    const message = data && data.error ? String(data.error) : "HTTP " + response.status;
    throw new Error("Apps Script gateway request failed: " + message.slice(0, 240));
  }
  return data.result || {};
}
