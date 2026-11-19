import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rulesPath = new URL("../firebase-rules/Pest-Platform-Firebase-Rules-Custody-v12-Online-Presence-Push.json", import.meta.url);
const { rules } = JSON.parse(await readFile(rulesPath, "utf8"));

test("presence can be read only by authenticated active accounts", () => {
  const readRule = rules.presence?.[".read"] || "";
  assert.match(readRule, /auth != null/);
  assert.match(readRule, /users/);
  assert.match(readRule, /status/);
  const writeRule = rules.presence?.["$uid"]?.["$connectionId"]?.[".write"] || "";
  for (const status of ["active", "Active", "ACTIVE", "نشط", "مفعل", "enabled", "Enabled", "ENABLED"]) {
    assert.ok(readRule.includes("=== '" + status + "'"), "missing read status compatibility: " + status);
    assert.ok(writeRule.includes("=== '" + status + "'"), "missing write status compatibility: " + status);
  }
  assert.equal(rules.presence?.[".write"], undefined, "there must be no broad write permission on /presence");
});

test("presence connection writes are restricted to the authenticated owner's UID", () => {
  const writeRule = rules.presence?.["$uid"]?.["$connectionId"]?.[".write"] || "";
  assert.match(writeRule, /auth != null/);
  assert.match(writeRule, /auth\.uid === \$uid/);
  assert.match(writeRule, /newData\.exists\(\)/);
  assert.match(writeRule, /status/);
});

test("an owner can delete its own stale connection marker after account deactivation", () => {
  const writeRule = rules.presence?.["$uid"]?.["$connectionId"]?.[".write"] || "";
  assert.match(writeRule, /!newData\.exists\(\)/);
  assert.ok(writeRule.indexOf("!newData.exists()") < writeRule.indexOf("status"), "delete permission must not depend on active status");
});

test("presence records allow state and lastChanged while rejecting unknown fields", () => {
  const connectionRules = rules.presence?.["$uid"]?.["$connectionId"];
  assert.match(connectionRules?.[".validate"] || "", /hasChildren\(\['state', 'lastChanged'\]\)/);
  assert.match(connectionRules?.[".validate"] || "", /state/);
  assert.match(connectionRules?.[".validate"] || "", /lastChanged/);
  assert.match(connectionRules?.state?.[".validate"] || "", /newData\.isString\(\)/);
  assert.match(connectionRules?.state?.[".validate"] || "", /'online'/);
  assert.match(connectionRules?.lastChanged?.[".validate"] || "", /newData\.isNumber\(\)/);
  assert.equal(connectionRules?.["$other"]?.[".validate"], false, "unexpected fields must be rejected");
});
