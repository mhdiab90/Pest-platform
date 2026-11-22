import test from "node:test";
import assert from "node:assert/strict";
import { handleFinancialRequest, DEFAULT_FINANCE_ACCOUNTS } from "../financial-api.js";

function makeHarness(){
 const database={
  chartOfAccounts:Object.fromEntries(DEFAULT_FINANCE_ACCOUNTS.map(account=>[account.code,{...account,active:true}])),
  costCenters:{},
  settings:{accountingStartMonth:"2026-01"}
 };
 const parts=path=>String(path||"").split("/").filter(Boolean);
 const read=path=>parts(path).reduce((value,key)=>value&&Object.prototype.hasOwnProperty.call(value,key)?value[key]:null,database);
 const write=(path,value)=>{
  const keys=parts(path),last=keys.pop();let parent=database;
  for(const key of keys){if(!parent[key]||typeof parent[key]!=="object")parent[key]={};parent=parent[key];}
  if(value===null)delete parent[last];else parent[last]=value;
 };
 const adminRead=async path=>read(path);
 const adminPatch=async updates=>{for(const [path,value] of Object.entries(updates))write(path,value);return true;};
 const profile={uid:"opening-test-admin",role:"admin",status:"active",fullName:"Opening Test"};
 const claims={sub:"opening-test-admin"};
 const invoke=body=>handleFinancialRequest({
  request:{method:"POST"},
  url:new URL("https://example.test/finance"),
  body,claims,profile,env:{},
  hasPermission:()=>true,requirePermission:()=>true,
  adminRead,adminPatch
 });
 return {database,read,invoke};
}

test("opening balances create one reviewable journal and automatically offset to account 3100",async()=>{
 const harness=makeHarness();
 const result=await harness.invoke({
  action:"submitOpeningBalances",date:"2025-12-31",reference:"OPENING-2025-12-31",
  lines:[
   {accountCode:"1110",debit:100,credit:0},
   {accountCode:"281",debit:0,credit:70,partyType:"vendor",partyId:"VENDOR-01"}
  ]
 });
 assert.equal(result.success,true);
 assert.equal(result.status,"pending_review");
 const journal=harness.read("documents/"+result.id);
 assert.equal(journal.openingBalance,true);
 assert.equal(journal.sourceType,"manual");
 const offset=journal.lines.find(line=>line.accountCode==="3100");
 assert.equal(offset.debit,0);
 assert.equal(offset.credit,30);
 assert.equal(journal.balance.difference,0);
 assert.equal(harness.read("reviewQueue/"+result.id).status,"pending_review");
});

test("opening balances require an analytical party on vendor and customer control accounts",async()=>{
 const harness=makeHarness();
 await assert.rejects(()=>harness.invoke({
  action:"submitOpeningBalances",date:"2025-12-31",
  lines:[{accountCode:"281",debit:0,credit:10}]
 }),/الطرف التحليلي/);
});

test("opening balances cannot be dated on or after the configured accounting start month",async()=>{
 const harness=makeHarness();
 await assert.rejects(()=>harness.invoke({
  action:"submitOpeningBalances",date:"2026-01-01",
  lines:[{accountCode:"1110",debit:10,credit:0}]
 }),/يجب أن يسبق تاريخ الأرصدة الافتتاحية/);
});

test("opening balances cannot be submitted twice while a prior opening journal remains active",async()=>{
 const harness=makeHarness();
 const input={action:"submitOpeningBalances",date:"2025-12-31",lines:[{accountCode:"1110",debit:100,credit:0}]};
 await harness.invoke(input);
 await assert.rejects(()=>harness.invoke(input),/لا يمكن إنشاء قيد افتتاحي مكرر/);
});
