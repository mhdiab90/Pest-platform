import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, worker, financialApi] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../cloudflare/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../financial-api.js", import.meta.url), "utf8")
]);

test("Thabet partner custody action is tied to his exact email, including the full user profile when the directory has no email", () => {
  assert.match(index, /profileUser=activeUsers\.find\(item=>item\.uid===ownerUid\)/);
  assert.match(index, /email==='thabetrabea@gmail\.com'/);
  assert.match(index, /onClick=\{\(\)=>void transferCashCustodyToPartnerCurrent\(cashCustodyTarget,t\)\}/);
  assert.match(financialApi, /email:"thabetrabea@gmail\.com"/);
  assert.match(financialApi, /normalize\(user\.email\)===normalize\(item\.email\)/);
  assert.match(financialApi, /حساب الشريك المرتبط غير نشط/);
});

test("permanent user removal is server-side, admin-only, and preserves historical data", () => {
  assert.match(index, /sendPushWorkerRequest\('\/admin\/users\/delete'/);
  assert.match(index, /Delete user permanently|مسح المستخدم نهائيًا/);
  assert.match(worker, /"\/admin\/users\/delete"/);
  assert.match(worker, /profile\.role !== "admin"/);
  assert.match(worker, /https:\/\/www\.googleapis\.com\/auth\/identitytoolkit/);
  assert.match(worker, /firebaseauth\.users\.delete/);
  assert.match(worker, /"users\/" \+ targetUid \+ "\/status"] = "deleted"/);
  assert.match(worker, /"userDirectory\/" \+ targetUid \+ "\/status"] = "deleted"/);
  assert.match(worker, /financialRecordsRetained: true/);
  assert.doesNotMatch(worker, /finalUpdates\["users\/" \+ targetUid\] = null/);
});
