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
