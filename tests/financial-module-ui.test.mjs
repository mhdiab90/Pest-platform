import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");

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
