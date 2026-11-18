import test from "node:test";
import assert from "node:assert/strict";
import { handleFinancialRequest } from "../financial-api.js";

const database = {};
const segments = path => String(path || "").split("/").filter(Boolean);
function read(path) {
  return segments(path).reduce((value, key) => value && value[key] !== undefined ? value[key] : null, database);
}
function write(path, value) {
  const parts = segments(path);
  const key = parts.pop();
  let parent = database;
  for (const part of parts) {
    if (!parent[part] || typeof parent[part] !== "object") parent[part] = {};
    parent = parent[part];
  }
  if (value === null) delete parent[key];
  else parent[key] = value;
}
async function adminRead(path) { return read(path); }
async function adminPatch(updates) {
  for (const [path, value] of Object.entries(updates)) write(path, value);
  return true;
}
const profile = {uid:"test-admin",role:"admin",status:"active",fullName:"Finance Test"};
const claims = {sub:"test-admin"};
const env = {};
const hasPermission = () => true;
const requirePermission = (_profile, _module, _action) => true;
async function invoke(method, path, body) {
  return handleFinancialRequest({
    request:{method},
    url:new URL("https://example.test/finance" + (path || "")),
    body:body || {},
    claims,profile,env,hasPermission,requirePermission,adminRead,adminPatch
  });
}

test("financial workflow: bootstrap, double-entry review, invoice stock costing and duplicate protection", async () => {
  await invoke("GET","?resource=bootstrap");
  assert.ok(read("chartOfAccounts/281"),"default supplier control account is created");
  assert.ok(read("chartOfAccounts/1210"),"default customer control account is created");

  const journalDraft = await invoke("POST","",{
    action:"submitJournal",
    date:"2026-11-18",
    description:"Manual journal test",
    reference:"TEST-JRN-1",
    lines:[
      {accountCode:"6100",debit:100,credit:0,description:"Expense"},
      {accountCode:"1110",debit:0,credit:100,description:"Cash"}
    ]
  });
  assert.equal(journalDraft.status,"pending_review");
  assert.equal(journalDraft.balance.difference,0);
  const journalApproved = await invoke("POST","",{
    action:"review",id:journalDraft.id,decision:"approve",reason:"test approval"
  });
  assert.equal(journalApproved.status,"posted");
  assert.equal(read("journals/"+journalDraft.id).status,"posted");
  assert.equal(read("ledger/6100/2026-11/"+journalDraft.id+"_1").debit,100);

  const unbalanced = await invoke("POST","",{
    action:"submitJournal",
    date:"2026-11-18",
    description:"Unbalanced test",
    lines:[
      {accountCode:"6100",debit:50,credit:0},
      {accountCode:"1110",debit:0,credit:20}
    ]
  });
  assert.equal(unbalanced.status,"needs_correction");
  assert.ok(unbalanced.errors.some(x=>x.includes("غير متوازن")));
  assert.equal(read("reviewQueue/"+unbalanced.id),null,"invalid draft is not placed in approval queue");

  await invoke("POST","",{
    action:"saveMaster",kind:"costCenters",
    item:{code:"CC-PRJ-1",name:"Project 1 cost center",projectCode:"PRJ-1"}
  });
  await invoke("POST","",{
    action:"saveMaster",kind:"items",
    item:{code:"ITEM-001",name:"Test stock item",unit:"piece",groupCode:"GROUP-1",version:"V1",warehouseCode:"default"}
  });
  const purchase = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-001",projectCode:"PRJ-1",
    partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxRate:14,discount:10,
    lines:[{description:"Test stock",kind:"stock",itemCode:"ITEM-001",quantity:2,unitPrice:50,discount:0,warehouseCode:"default"}]
  });
  assert.equal(purchase.status,"pending_review");
  assert.equal(purchase.totals.net,90,"invoice-level discount is allocated across lines");
  assert.equal(purchase.totals.tax,12.6);
  const purchasePosted = await invoke("POST","",{
    action:"review",id:purchase.id,decision:"approve",reason:"purchase approval"
  });
  assert.equal(purchasePosted.status,"posted");
  const purchaseStock = read("inventory/balances/default/ITEM-001");
  assert.equal(purchaseStock.quantity,2);
  assert.equal(purchaseStock.value,90);
  assert.equal(purchaseStock.averageCost,45);
  const supplierLines = Object.values(read("partyLedger/vendor/VENDOR-001/2026-11") || {});
  assert.ok(supplierLines.some(x=>x.credit===102.6),"supplier subledger records the full invoice total");
  const projectRows = Object.values(read("costLedger/CC-PRJ-1/2026-11") || {});
  assert.ok(projectRows.some(x=>x.debit===90&&x.projectCode==="PRJ-1"),"invoice expense/inventory line carries the project cost center");

  const duplicate = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-001",
    partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxRate:14,discount:10,
    lines:[{description:"Test stock",kind:"stock",itemCode:"ITEM-001",quantity:2,unitPrice:50,discount:0,warehouseCode:"default"}]
  });
  assert.ok(duplicate.warnings.length>0,"duplicate invoice is flagged");
  await assert.rejects(
    invoke("POST","",{action:"review",id:duplicate.id,decision:"approve",reason:"duplicate"}),
    /مكررة/
  );

  const sale = await invoke("POST","",{
    action:"submitInvoice",type:"sales",date:"2026-11-18",number:"SAL-001",
    partyId:"CUSTOMER-001",partyName:"Customer Test",currency:"EGP",taxRate:14,
    lines:[{description:"Test stock sale",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:200,discount:0,warehouseCode:"default"}]
  });
  const salePosted = await invoke("POST","",{action:"review",id:sale.id,decision:"approve",reason:"sale approval"});
  assert.equal(salePosted.status,"posted");
  const saleStock = read("inventory/balances/default/ITEM-001");
  assert.equal(saleStock.quantity,1);
  assert.equal(saleStock.value,45);
  const saleJournal = read("journals/"+salePosted.journalId);
  assert.ok(saleJournal.lines.some(x=>x.accountCode==="5100"&&x.debit===45),"sale posts cost of goods sold");
  assert.ok(saleJournal.lines.some(x=>x.accountCode==="1300"&&x.credit===45),"sale credits inventory");
});
