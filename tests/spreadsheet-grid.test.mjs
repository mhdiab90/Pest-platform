import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
