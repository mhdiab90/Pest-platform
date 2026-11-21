import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../financial-api.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("journal source labels are shared by the daily register and financial statements", () => {
  const helper = source.indexOf("const journalSourceLabel=");
  const moduleFactory = source.indexOf("function FinanceModule(props)");
  assert.ok(helper >= 0 && helper < moduleFactory, "journalSourceLabel must be defined outside renderJournal and before FinanceModule");
  assert.equal((source.match(/const journalSourceLabel=/g) || []).length, 1, "there must be one shared journal source label helper");
  assert.match(source, /journalSourceLabel\(statementJournal\)/);
});

test("journal detail dialogs lazily load and display linked attachments", () => {
  assert.match(source, /loadStatementAttachments\(\[journalModalDraft\]\)/);
  assert.match(source, /loadStatementAttachments\(\[statementJournal\]\)/);
  assert.match(source, /statementAttachmentAction\(draft\)/);
  assert.match(source, /statementAttachmentAction\(statementJournal\)/);
});

test("journal register scrolling chains to the page at the bottom", () => {
  assert.match(source, /overscrollBehavior:'auto'/);
  assert.doesNotMatch(source, /overscrollBehavior:'contain'/);
});

test("daily journal rows search attachments against both the source document and journal", () => {
  assert.match(source, /sourceId:doc\.sourceId\|\|""/);
  assert.match(source, /journalId:doc\.journalId\|\|""/);
  assert.match(source, /statementAttachmentAction\(x\)/);
  assert.match(source, /loadStatementAttachments\(journalRecords\.concat\(documents\.filter\(document=>document&&document\.type==='journal'\)\)\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test("all finance screens allow scroll chaining from nested lists to the workspace", () => {
  assert.match(shell, /\.app-root-shell \.app-workspace\{[^}]*overscroll-behavior-y:auto!important/);
  assert.match(shell, /overflow-y-auto[^}]*overscroll-behavior-y:auto!important/);
  assert.doesNotMatch(shell, /\.app-root-shell \.app-workspace\{[^}]*overscroll-behavior:contain/);
});


test("financial statement journal details expose the same safe journal actions as the daily register", () => {
  assert.match(source, /statementJournalPosted=Boolean\(statementJournal/);
  assert.match(source, /statementJournalManual=Boolean\(statementJournal/);
  assert.match(source, /button\('تعديل القيد',\(\)=>void startJournalRevision\(statementJournal,'edit'\)/);
  assert.match(source, /button\('إرجاع للمراجعة',\(\)=>void startJournalRevision\(statementJournal,'return'\)/);
  assert.match(source, /button\('إلغاء القيد \(إنشاء قيد عكسي\)',\(\)=>void reverseJournal\(statementJournal\)/);
  assert.match(source, /button\('إلغاء القيد',\(\)=>void cancelJournal\(statementJournal\)/);
  assert.match(source, /إجراءات تعديل القيد أو إرجاعه للمراجعة أو إلغاؤه غير متاحة مباشرة من تتبع الحساب/);
});

test("confirmed statement journal actions close the statement detail before opening a review dialog", () => {
  assert.match(source, /setStatementJournalId\(''\);\s*setBusy\(true\);/);
  assert.equal((source.match(/setStatementJournalId\(''\);\s*setBusy\(true\);/g)||[]).length, 3);
});


test("statement journal revision launched from reports displays the edit modal", () => {
  assert.match(source, /setTab\('journal'\);\s*openJournalModal\(result\.item\)/);
  assert.match(source, /إجراءات القيد/);
  assert.match(source, /إرجاع للمراجعة/);
  assert.match(source, /قيد عكسي للمراجعة/);
});

test("every financial screen table supports the shared search input", () => {
  assert.match(source, /screenTableSearch/);
  assert.match(source, /const screenSearchText=node/);
  assert.match(source, /filtered=query\?source\.filter/);
  assert.match(source, /بحث في بيانات الشاشة الحالية/);
});

test("inventory transactions are exposed in a separate screen", () => {
  assert.match(source, /inventoryMovements:'inventory'/);
  assert.match(source, /inventoryMovements/);
  assert.match(source, /const renderInventoryMovements=/);
  assert.match(source, /resource=inventory/);
});

test("balance sheet displays leaf accounts, zero inventory, and orphaned ledger codes", () => {
  assert.match(source, /balanceAssetRows=statementRowsWithBalance\(account=>account\.type==='asset'&&!account\.isGroup,'debit',true\)/);
  assert.match(source, /unmappedBalanceRows/);
  assert.match(source, /ledgerBalanceDifference/);
});

test("existing charts backfill the inventory control account 1300", () => {
  assert.match(apiSource, /code:'1300',name:'المخزون',type:'asset',nature:'debit',parentCode:'11'/);
});
