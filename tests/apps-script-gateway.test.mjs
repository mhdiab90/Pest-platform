import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createAppsScriptEnvelope,
  callAppsScriptGateway
} from "../cloudflare/apps-script-gateway.js";

const secret = "a".repeat(64);

test("Apps Script envelope signs the exact serialized payload with HMAC-SHA256", async () => {
  const payload = { action: "ping", detail: "pilot" };
  const timestamp = "1795636800000";
  const nonce = "0123456789abcdef0123456789abcdef";
  const envelope = await createAppsScriptEnvelope(payload, secret, { timestamp, nonce });
  const payloadText = JSON.stringify(payload);
  const digest = createHash("sha256").update(payloadText, "utf8").digest("base64url");
  const canonical = [timestamp, nonce, digest].join("\n");
  const expected = createHmac("sha256", secret).update(canonical, "utf8").digest("base64url");
  assert.equal(envelope.timestamp, timestamp);
  assert.equal(envelope.nonce, nonce);
  assert.equal(envelope.payload, payloadText);
  assert.equal(envelope.signature, expected);
});

test("Apps Script envelope rejects weak secrets and invalid nonces", async () => {
  await assert.rejects(createAppsScriptEnvelope({ action: "ping" }, "too-short"), /at least 32 characters/);
  await assert.rejects(
    createAppsScriptEnvelope({ action: "ping" }, secret, { timestamp: "1795636800000", nonce: "bad" }),
    /timestamp or nonce/
  );
});

test("gateway client posts a signed request and returns the parsed result", async () => {
  let captured;
  const output = await callAppsScriptGateway({
    GOOGLE_DRIVE_GATEWAY_URL: "https://script.google.com/macros/s/test-deployment/exec",
    GOOGLE_DRIVE_GATEWAY_SECRET: secret
  }, { action: "ping" }, async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        result: { gatewayVersion: "test", effectiveUserEmail: "company@example.com" }
      })
    };
  });
  assert.equal(captured.url, "https://script.google.com/macros/s/test-deployment/exec");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.redirect, "follow");
  assert.equal(JSON.parse(captured.options.body).payload, JSON.stringify({ action: "ping" }));
  assert.equal(output.gatewayVersion, "test");
  assert.equal(output.effectiveUserEmail, "company@example.com");
});

test("gateway client rejects non-HTTPS or non-Google Apps Script endpoints", async () => {
  await assert.rejects(callAppsScriptGateway({
    GOOGLE_DRIVE_GATEWAY_URL: "http://script.google.com/macros/s/test/exec",
    GOOGLE_DRIVE_GATEWAY_SECRET: secret
  }, { action: "ping" }), /HTTPS script.google.com/);
  await assert.rejects(callAppsScriptGateway({
    GOOGLE_DRIVE_GATEWAY_URL: "https://example.com/exec",
    GOOGLE_DRIVE_GATEWAY_SECRET: secret
  }, { action: "ping" }), /HTTPS script.google.com/);
});

test("gateway client surfaces Apps Script application errors", async () => {
  await assert.rejects(callAppsScriptGateway({
    GOOGLE_DRIVE_GATEWAY_URL: "https://script.google.com/macros/s/test/exec",
    GOOGLE_DRIVE_GATEWAY_SECRET: secret
  }, { action: "ping" }, async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: false, error: "Gateway signature is invalid." })
  })), /Gateway signature is invalid/);
});

test("Cloudflare gateway test pins the existing company folder and enforces account identity", () => {
  const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
  assert.ok(worker.includes('import { callAppsScriptGateway } from "./apps-script-gateway.js"'));
  assert.ok(worker.includes('/drive/gateway/test'));
  assert.ok(worker.includes('profile.role!=="admin"'));
  assert.ok(worker.includes('folderId:String(companyDriveConnection&&companyDriveConnection.folderId||"")'));
  assert.ok(worker.includes("effectiveUserEmail!==expectedCompanyEmail"));
  assert.ok(worker.includes("productionAttachmentsUnchanged:true"));
  const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(app.includes("testAppsScriptDriveGateway"));
  assert.ok(app.includes("/drive/gateway/test"));
  assert.ok(app.includes("Google Apps Script gateway test"));
});

test("Apps Script source enforces signed requests, nonce checks, file size and company Drive access", () => {
  const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(source, /verifyEnvelope_\(envelope\)/);
  assert.match(source, /computeHmacSha256Signature/);
  assert.match(source, /getScriptLock/);
  assert.match(source, /properties\.setProperty\(nonceKey, timestamp\)/);
  assert.ok(source.includes("ensureAttachmentFolder_(request.folderId)"));
  assert.ok(source.includes("preferredFolderId"));
  assert.match(source, /MAX_FILE_BYTES = 20 \* 1024 \* 1024/);
  assert.match(source, /Session\.getEffectiveUser\(\)\.getEmail\(\)/);
  assert.match(source, /DriveApp\.getFoldersByName\("Pest Platform Attachments"\)/);
  assert.match(source, /file\.setTrashed\(true\)/);
});
