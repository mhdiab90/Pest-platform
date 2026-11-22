import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");

test("account analysis drills from account balance to analytical source and posted journal lines", () => {
  assert.ok(source.includes('accountAnalysis:"reports"'));
  assert.ok(source.includes("['accountAnalysis','تحليل الحسابات','Account Analysis']"));
  assert.ok(source.includes("const accountAnalysisLines=accountAnalysisData?balanceFlat.filter"));
  assert.ok(source.includes("const counterparts=journalLines.filter"));
  assert.ok(source.includes("party|'+type+'|'+id"));
  assert.ok(source.includes("accountAnalysisDistributedNet-accountAnalysisTotalNet"));
  assert.ok(source.includes("onClick:()=>openStatementJournal(line.journalId)"));
  assert.ok(source.includes("statementAttachmentAction(line)"));
  assert.ok(source.includes("const renderAccountAnalysis=()=>{"));
  assert.ok(source.includes("if(tab==='accountAnalysis')content=renderAccountAnalysis()"));
});

test("financial tables align RTL amounts below matching headers", () => {
  assert.match(source, /className:'pest-finance-workspace p-2 md:p-3 space-y-2'/);
  assert.match(source, /\.pest-finance-workspace\[dir="rtl"\] table\{direction:rtl!important;text-align:right!important;\}/);
  assert.match(source, /table td\[class~="text-end"\]\{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;\}/);
  assert.match(source, /className:'p-3 whitespace-nowrap text-right align-middle'/);
  assert.match(source, /dir:rtl\?'rtl':'ltr',className:'w-full text-sm text-right'/);
});

test("all shared financial sections have individual collapse and expand buttons", () => {
  assert.match(source, /const \[collapsedPanels,setCollapsedPanels\]=React\.useState\(\{\}\)/);
  assert.match(source, /const panel=\(title,sub,child\)=>\{/);
  assert.match(source, /aria-expanded':!collapsed/);
  assert.match(source, /setCollapsedPanels\(previous=>Object\.assign\(\{\},previous,\{\[panelKey\]:!previous\[panelKey\]\}\)\)/);
  assert.match(source, /collapsed\?null:h\('div',\{className:'mt-3 min-w-0'\},child\)/);
  assert.match(source, /collapsed\?t\('إظهار القسم','Show section'\):t\('إخفاء القسم','Hide section'\)/);
});

test("unified statements support GL accounts, cost centers, vendors and customers with searchable selection and journal drill-through", () => {
  assert.match(source, /type:"account"/);
  assert.match(source, /value:"account",label:"حساب من دليل الحسابات"/);
  assert.match(source, /value:"costCenter",label:"مركز تكلفة"/);
  assert.match(source, /value:"vendor",label:"مورد"/);
  assert.match(source, /value:"customer",label:"عميل"/);
  assert.match(source, /ابحث عن الحساب بالاسم أو الرقم أو أي بيان/);
  assert.match(source, /normalizeMatch\(Object\.entries\(item\|\|\{\}\)/);
  assert.match(source, /openStatementJournal\(line\.journalId\)/);
  assert.match(source, /statementAttachmentAction\(line\)/);
  assert.match(source, /الرصيد الافتتاحي/);
  assert.match(source, /الرصيد الختامي/);
});

test("balance sheet reconciles warehouse stock values to inventory GL account 1300 and purchase journals", () => {
  assert.match(source, /const inventoryReconciliationPanel=\(\)=>\{/);
  assert.match(source, /const inventoryStockValue=Object\.values\(warehouseBalances\)/);
  assert.match(source, /const inventoryGeneralLedgerValue=inventoryAccountCodes\.reduce/);
  assert.match(source, /inventoryReconciliationPanel\(\)/);
  assert.match(source, /قيمة 1300 بالقيد/);
  assert.match(source, /openStatementJournal\(item\.journalId\)/);
});


test("application loader requests the exact financial module build declared by the module", () => {
  const appHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const version = source.match(/window\.PEST_FINANCE_MODULE_VERSION="([^"]+)"/);
  const expected = appHtml.match(/const FINANCE_MODULE_BUILD='([^']+)'/);
  assert.ok(version, "financial module must declare its build version");
  assert.ok(expected, "application shell must declare the required financial module version");
  assert.equal(expected[1], version[1], "application shell and financial module version must match");
});


test("financial reports compare control-account debit and credit movements to analytical subledger lines", () => {
  assert.match(source, /const controlSubledgerAuditRows=accounts\.filter\(account=>account\.subledgerType/);
  assert.match(source, /const controlSubledgerMismatchCount=controlSubledgerAuditRows\.filter/);
  assert.match(source, /مطابقة الحسابات الرقابية مع الأستاذ المساعد/);
  assert.match(source, /controlSubledgerIntegrityPanel\(\)/);
  assert.match(source, /row\.account\.subledgerType/);
});


test("financial reports validate critical balance-sheet and tax control account classifications", () => {
  assert.match(source, /const criticalAccountConfiguration=\[/);
  assert.match(source, /\{code:"1300",type:"asset",nature:"debit",label:"المخزون"\}/);
  assert.match(source, /\{code:"1410",type:"asset",nature:"debit",label:"ضريبة القيمة المضافة - مدخلات"\}/);
  assert.match(source, /\{code:"2110",type:"liability",nature:"credit",label:"ضريبة القيمة المضافة - مخرجات"\}/);
  assert.match(source, /\{code:"281",type:"liability",nature:"credit",subledgerType:"vendor",label:"الموردون"\}/);
  assert.match(source, /const criticalAccountMismatchCount=/);
  assert.match(source, /criticalAccountIntegrityPanel\(\)/);
});


test("inventory balances and movement rows are both loaded into financial module state", () => {
  assert.match(source, /setMaster\(previous=>Object\.assign\(\{\},previous,\{inventory:Object\.assign\(\{\},previous\.inventory\|\|\{\},\{\.\.\.inventory,balances:inventory\.balances\|\|previous\.inventory&&previous\.inventory\.balances\|\|\{\},movements:inventory\.movements\|\|\{\}\}\)\}\)\)/);
  assert.match(source, /tab==='inventory'\|\|tab==='inventoryMovements'\|\|\(tab==='reports'&&report==='balance'\)/);
  assert.match(source, /const warehouseBalances=master\.inventory&&master\.inventory\.balances\|\|\{\}/);
});
