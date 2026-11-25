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
  assert.match(app, /activeFilters\.every\(filter=>matches/);
  assert.match(app, /searchPlaceholder:"ابحث في كل بيانات الجدول/);
});


test("adding a value filter immediately applies it to the table and Enter submits it", () => {
  const start = app.indexOf("const add=button(t.addFilter");
  const end = app.indexOf("first.append(labelWrap(t.column", start);
  assert.ok(start >= 0 && end > start, "filter add handler must exist");
  const handler = app.slice(start, end);
  assert.match(handler, /renderFilterChips\(state,key\);\s*apply\(state,key\);\s*savePrefs\(state,key\);/);
  assert.match(handler, /value\.addEventListener\("keydown".*add\.click\(\)/);
  assert.match(app, /activeFilters\.every\(filter=>matches/);
});

test("column value filter applies live while typing and retains its selected column", () => {
  assert.ok(app.includes('column.addEventListener("change",()=>updateDraftFilter(state,key))'));
  assert.ok(app.includes('operator.addEventListener("change",()=>{value.disabled=["empty","notEmpty"].includes(operator.value);updateDraftFilter(state,key);})'));
  assert.ok(app.includes('value.addEventListener("input",()=>updateDraftFilter(state,key))'));
  assert.ok(app.includes('state.draftFilter?[...state.filters,state.draftFilter]:state.filters'));
  assert.ok(app.includes('const preferredColumn=state.draftFilter?String(state.draftFilter.column):selectedColumn'));
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

test("global table filters provide live account and cost center autocomplete with code-or-name matching", () => {
  assert.match(app, /const filterColumnKind=header=>/);
  assert.match(app, /window\\.PEST_FINANCE_FILTER_LOOKUPS/);
  assert.match(app, /const renderSuggestions=\\(\\)=>/);
  assert.match(app, /operator\\.value="contains"/);
  assert.match(app, /filterSelection=\\{code:item\\.code,name:item\\.name,label:item\\.label\\}/);
  assert.match(app, /matchAny:selection\\?\\[selection\\.code,selection\\.name\\]\\.filter\\(Boolean\\)/);
  assert.match(app, /filterSuggestionMenu/);
  assert.match(app, /pest-grid-filter-suggestion/);
  const gridStart = app.indexOf("function installPestSpreadsheetGrid(root)");
  const helperStart = app.indexOf("  const normalizeFilterText=", gridStart);
  const helperEnd = app.indexOf("  const hash=", helperStart);
  const matchesStart = app.indexOf("  const matches=", helperEnd);
  const matchesEnd = app.indexOf("  const updateDraftFilter=", matchesStart);
  assert.ok(gridStart >= 0 && helperStart > gridStart && helperEnd > helperStart && matchesEnd > matchesStart);
  const helpers = app.slice(helperStart, helperEnd) + app.slice(matchesStart, matchesEnd);
  const sandbox = {};
  vm.runInNewContext(
    `const clean=value=>String(value==null?"":value).replace(/\\\\s+/g," ").trim();
     const arabic=()=>true;
     ${helpers}
     globalThis.gridTest={matches};`,
    sandbox
  );
  const {matches}=sandbox.gridTest;
  const selected={operator:"contains",value:"4010 — إيرادات المبيعات",matchAny:["4010","إيرادات المبيعات"]};
  assert.equal(matches("4010 — إيرادات المبيعات",selected),true);
  assert.equal(matches("إيرادات المبيعات",selected),true);
  assert.equal(matches("4010",selected),true);
  assert.equal(matches("4020 — إيرادات أخرى",selected),false);
  assert.equal(matches("مركز 07", {operator:"contains",value:"07 — مركز الإنتاج",matchAny:["07","مركز الإنتاج"]}),true);
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
