import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const finance = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");
const crm = readFileSync(new URL("../pest-crm-module.js", import.meta.url), "utf8");

test("spreadsheet grid is mounted globally so dynamically rendered application tables are enhanced", () => {
  assert.match(app, /function installPestSpreadsheetGrid\(root\)/);
  assert.match(app, /installPestSpreadsheetGrid\(document\.body\)/);
  assert.match(app, /root\.querySelectorAll\("table"\)\.forEach\(decorate\)/);
  assert.match(app, /observer\.observe\(root,\{childList:true,subtree:true,characterData:true\}\)/);
  assert.match(app, /const candidates=new Set\(\)/);
});

test("spreadsheet grid supports full-text search and multiple independent column filters", () => {
  for (const operator of ["contains", "notContains", "equals", "notEquals", "starts", "ends", "greater", "less", "empty", "notEmpty"]) {
    assert.ok(app.includes('["' + operator + '"'), "missing filter operator: " + operator);
  }
  assert.match(app, /state\.filters\.push\(\{column:index,operator:op,value:filterValue\}\)/);
  assert.match(app, /state\.filters\.every\(filter=>matches/);
  assert.match(app, /searchPlaceholder:"ابحث في كل بيانات الجدول/);
});


test("adding a value filter immediately applies it to the table and Enter submits it", () => {
  const start = app.indexOf("const add=button(t.addFilter");
  const end = app.indexOf("first.append(labelWrap(t.column", start);
  assert.ok(start >= 0 && end > start, "filter add handler must exist");
  const handler = app.slice(start, end);
  assert.match(handler, /renderFilterChips\(state,key\);\s*apply\(state,key\);\s*savePrefs\(state,key\);/);
  assert.match(handler, /value\.addEventListener\("keydown".*add\.click\(\)/);
  assert.match(app, /state\.filters\.every\(filter=>matches/);
});

test("value filtering compares localized numeric amounts correctly", () => {
  const gridStart = app.indexOf("function installPestSpreadsheetGrid(root)");
  const helperStart = app.indexOf("  const normalizeFilterText=", gridStart);
  const helperEnd = app.indexOf("  const hash=", helperStart);
  const matchesStart = app.indexOf("  const matches=", helperEnd);
  const matchesEnd = app.indexOf("  const apply=", matchesStart);
  assert.ok(gridStart >= 0 && helperStart > gridStart && helperEnd > helperStart && matchesEnd > matchesStart);
  const helpers = app.slice(helperStart, helperEnd) + app.slice(matchesStart, matchesEnd);
  const sandbox = {};
  vm.runInNewContext(
    `const clean=value=>String(value==null?"":value).replace(/\\s+/g," ").trim();
     const arabic=()=>true;
     ${helpers}
     globalThis.gridTest={parseNumber,matches};`,
    sandbox
  );
  const { parseNumber, matches } = sandbox.gridTest;
  assert.equal(parseNumber("١٬٢٣٤٫٥٠ ج.م"), 1234.5);
  assert.equal(matches("١٬٢٣٤٫٥٠ ج.م", { operator: "equals", value: "1234.50" }), true);
  assert.equal(matches("1,234.50 EGP", { operator: "greater", value: "1000" }), true);
  assert.equal(matches("95", { operator: "less", value: "100" }), true);
  assert.equal(matches("١٬٢٣٤٫٥٠ ج.م", { operator: "contains", value: "1234.5" }), true);
  assert.equal(matches("1234.50", { operator: "contains", value: "1234" }), true);
  assert.equal(matches("abc 123", { operator: "notContains", value: "xyz" }), true);
  assert.equal(matches("100", { operator: "notEquals", value: "90" }), true);
  assert.equal(matches("123", { operator: "starts", value: "12" }), true);
  assert.equal(matches("123", { operator: "ends", value: "23" }), true);
  assert.equal(matches("", { operator: "empty", value: "" }), true);
  assert.equal(matches("0", { operator: "notEmpty", value: "" }), true);
  assert.equal(matches("invoice 123", { operator: "equals", value: "123" }), false);
});

test("spreadsheet grid supports ascending/descending sorting, pagination, and saved column visibility", () => {
  assert.match(app, /state\.sortDirection=state\.sortDirection==="asc"\?"desc":"asc"/);
  assert.match(app, /state\.hiddenColumns\.add\(index\)/);
  assert.match(app, /state\.hiddenColumns\.delete\(index\)/);
  assert.match(app, /\[\[25,"25"\],\[50,"50"\],\[100,"100"\],\[250,"250"\],\[0/);
  assert.match(app, /localStorage\.setItem\(key,JSON\.stringify\(\{sortColumn/);
});

test("spreadsheet grid supports multi-row selection, select-visible, copy and CSV export", () => {
  assert.match(app, /state\.selected\.add\(k\)/);
  assert.match(app, /state\.visibleRows\.forEach\(row=>/);
  assert.match(app, /exportSelected\(state,"copy"\)/);
  assert.match(app, /exportSelected\(state,"csv"\)/);
  assert.match(app, /text\/csv;charset=utf-8/);
});

test("financial and CRM screens keep using real semantic tables covered by the global grid", () => {
  assert.match(finance, /h\('table'/);
  assert.match(crm, /h\(['"]table['"]/);
  assert.match(app, /<table\b/);
});

test("spreadsheet controls refresh their labels and direction when the app language changes", () => {
  assert.match(app, /window\.PEST_REFRESH_SPREADSHEET_GRID_LANGUAGE/);
  assert.match(app, /useEffect\(\(\)=>\{if\(window\.PEST_REFRESH_SPREADSHEET_GRID_LANGUAGE\)window\.PEST_REFRESH_SPREADSHEET_GRID_LANGUAGE\(\);\},\[lang\]\)/);
  assert.match(app, /bar\.setAttribute\("dir"/);
});


test("spreadsheet grid batches DOM observation and ignores its own row and control mutations", () => {
  assert.match(app, /const pendingTables=new Set\(\)/);
  assert.match(app, /const scheduleGridRefresh=table=>/);
  assert.match(app, /const isGridOnlyMutation=\(record,table\)=>/);
  assert.match(app, /state\.baseRows\.includes\(node\)/);
  assert.match(app, /if\(!newTable&&!newHeaders&&!newData\)return/);
  assert.doesNotMatch(app, /activeStates\.forEach\(state=>\{if\(!state\.host\.isConnected\)activeStates\.delete\(state\);\}\);/);
});

test("spreadsheet grid removes the orphaned filter toolbar when its table host is removed", () => {
  assert.match(app, /const disposeState=state=>\{/);
  assert.match(app, /state\.toolbar\.remove\(\)/);
  assert.match(app, /states\.delete\(state\.host\)/);
  assert.match(app, /if\(state&&!state\.host\.isConnected\)disposeState\(state\)/);
  assert.match(app, /if\(!state\.host\.isConnected\)\{disposeState\(state\);return;\}/);
});

test("financial workspace loads review and journal lists only when their sections are opened", () => {
  assert.match(finance, /const initialOnly=Boolean\(options&&options\.initialOnly\)/);
  assert.match(finance, /refresh\(\{initialOnly:true\}\)/);
  assert.match(finance, /if\(tab!=='journal'\|\|!canFinance\('journal','view'\)\)return/);
  assert.match(finance, /Promise\.all\(\[api\('\?resource=documents'\),api\('\?resource=journals'\)\]\)/);
  assert.match(finance, /window\.setInterval\(sync,60000\)/);
});
