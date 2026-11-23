import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");

test("financial journal attachments use review permissions while pending and journal permissions after posting", () => {
  assert.match(worker, /const document=await adminDatabaseRequest\("financial\/documents\/"\+entityId/);
  assert.match(worker, /const journalFallback=!document\?await adminDatabaseRequest\("financial\/journals\/"\+entityId/);
  assert.match(worker, /const journalRecord=!!\(financialRecord&&financialRecord\.type==="journal"\)/);
  assert.match(worker, /hasPermission\(profile,"financial_review",action==="view"\?"view":"edit"\)/);
  assert.match(worker, /hasPermission\(profile,"financial_journal","view"\)/);
  assert.match(worker, /hasPermission\(profile,"financial_journal","add"\)/);
  assert.match(worker, /hasPermission\(profile,"financial_journal","edit"\)/);
  assert.match(worker, /financial journal attachment upload/);
});
