import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("presence writes use the authenticated Firebase UID", () => {
  assert.match(source, /const authUser=auth\.currentUser/);
  assert.match(source, /const uid=authUser\?\.uid\|\|currentUser\?\.uid\|\|''/);
  assert.match(source, /db\.ref\('presence\/'\+uid\)\.push\(\)/);
});

test("a denied onDisconnect registration cannot prevent the initial online marker", () => {
  const disconnect = source.indexOf("ownPresenceRef.onDisconnect().remove().catch");
  const write = source.indexOf("const writePresence=()=>", disconnect);
  assert.ok(disconnect >= 0, "disconnect cleanup is registered separately");
  assert.ok(write > disconnect, "initial presence write follows separately handled cleanup");
  assert.match(source.slice(disconnect, write), /reportPresenceError\('Online presence disconnect cleanup:'/);
  assert.match(source, /heartbeatTimer=window\.setInterval\(writePresence,45000\)/);
});

test("stale presence markers expire from the online list", () => {
  assert.match(source, /onlinePresenceFreshnessCutoff=onlinePresenceClock-120000/);
  assert.match(source, /Number\(connection\.lastChanged\|\|0\)>=onlinePresenceFreshnessCutoff/);
  assert.match(source, /setOnlinePresenceClock\(Date\.now\(\)\)/);
});
