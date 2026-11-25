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


test("financial invoice attachment deletion requires an edit, delete, or own-upload grant", () => {
  assert.match(worker, /action==="delete"&&!hasPermission\(profile,"financial_invoices","delete"\)&&!hasPermission\(profile,"financial_invoices","edit"\)&&!hasPermission\(profile,"financial","delete"\)&&!hasPermission\(profile,"financial","edit"\)/);
  assert.match(worker, /financialRecord\.createdBy===claims\.sub&&hasPermission\(profile,"financial_invoices","add"\)/);
  assert.match(worker, /await validateAttachmentEntity\(type,entityId,claims,profile,token,"delete",attachment\.ownerUid,env\)/);
});

test("screen attachment records are allow-listed and require the underlying screen view permission", () => {
  assert.match(worker, /function attachmentEntityModule\(type,entityId=""\)/);
  assert.match(worker, /if\(type==="screen"\)/);
  assert.match(worker, /const allowed=new Set\(\[/);
  assert.match(worker, /if\(entityType==="screen"\)/);
  assert.match(worker, /requirePermission\(profile,moduleId,"view"\)/);
  assert.match(worker, /moduleId==="admin"/);
  assert.match(worker, /moduleId==="announcements"/);
});


test("financial screen attachments use financial module permissions instead of generic attachments grants", () => {
  assert.match(worker, /const financialScreen=entityType==="screen"&&moduleId\.startsWith\("financial_"\)/);
  assert.match(worker, /entityType!=="financial"&&!financialScreen/);
  assert.match(worker, /else if\(moduleId\.startsWith\("financial_"\)\)\{\s*requireEntityPermission\(moduleId\)/);
});
