import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, financialApi] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../financial-api.js", import.meta.url), "utf8")
]);

test("personal custody screen exposes visible bulk transfer controls in both directions", () => {
  assert.match(index, /تحويل كل حركات العهدة إلى الجاري/);
  assert.match(index, /إعادة كل الحركات إلى العهدة الشخصية/);
  assert.match(index, /cashCustodyPartnerToCurrentRows/);
  assert.match(index, /cashCustodyPartnerToCustodyRows/);
  assert.match(index, /cashCustodyPartnerOwnerInfo\.uid===cashCustodyTarget/);
  assert.match(index, /transferPartnerCustodyMovementsBulk\('toCurrent'\)/);
  assert.match(index, /transferPartnerCustodyMovementsBulk\('toCustody'\)/);
});

test("the custody screen resolves Thabet from the full active profile and exact partner email", () => {
  assert.match(index, /db\.ref\('users\/'\+target\)\.once\('value'\)/);
  assert.match(index, /email==='thabetrabea@gmail\.com'/);
  assert.match(index, /accountCode:'3202',partnerName:'أ\/ ثابت ربيع'/);
  assert.match(financialApi, /email:"thabetrabea@gmail\.com"/);
});

test("bulk endpoint creates one reviewed transfer journal per source movement", () => {
  assert.match(financialApi, /action==="transferPartnerCurrentAccountBulk"/);
  assert.match(financialApi, /handleFinancialRequest\(\{\.\.\.ctx,body:\{\.\.\.body,action:"transferPartnerCurrentAccount"/);
  assert.match(financialApi, /transactionIds\.length>100/);
  assert.match(financialApi, /results\.push\(\{transactionId,success:true,amount:num\(transaction\.amount\|\|0\),journalId/);
});

test("approved custody movement rows expose a destination dialog and journal preview", () => {
  assert.match(index, /openCashCustodyTransfer\(cashCustodyTarget,t\)/);
  assert.match(index, /تحويل حركة عهدة معتمدة/);
  assert.match(index, /معاينة القيد المقترح قبل الإرسال للمراجعة/);
  assert.match(index, /إرسال القيد إلى المراجعة/);
  assert.match(index, /transferCashCustodyMovement/);
  assert.match(financialApi, /action==="transferCashCustodyMovement"/);
  assert.match(financialApi, /sourceType:"cashCustodyTransfer"/);
  assert.match(financialApi, /cashCustodyTransfer\/active/);
});
