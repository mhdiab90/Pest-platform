import test from "node:test";
import assert from "node:assert/strict";
import { handleFinancialRequest, DEFAULT_FINANCE_ACCOUNTS } from "../financial-api.js";

function makeHarness({movement={id:"MOV-1",date:"2025-12-01",itemCode:"ITEM-1",warehouseCode:"MAIN",kind:"purchase",quantity:10,value:1000,unitCost:100,createdAt:1},stock={quantity:10,value:1000,averageCost:100},journals={}}={}){
 const database={
  chartOfAccounts:Object.fromEntries(DEFAULT_FINANCE_ACCOUNTS.map(account=>[account.code,{...account,active:true}])),
  costCenters:{},items:{"ITEM-1":{code:"ITEM-1",name:"Test item",active:true}},
  inventory:{balances:{MAIN:{"ITEM-1":stock}},movements:{[movement.id]:movement}},
  journals,documents:{},reviewQueue:{},periods:{},ledger:{},settings:{}
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
 const profile={uid:"inventory-admin",role:"admin",status:"active",fullName:"Inventory Test"};
 const claims={sub:"inventory-admin"};
 const invoke=(body)=>handleFinancialRequest({
  request:{method:"POST"},url:new URL("https://example.test/finance"),body,claims,profile,env:{},
  hasPermission:()=>true,requirePermission:()=>true,adminRead,adminPatch
 });
 return {database,read,invoke};
}

test("editing an orphan inventory movement queues a balanced stock-control journal and applies only after approval",async()=>{
 const h=makeHarness();
 const result=await h.invoke({action:"changeInventoryMovement",mode:"editMovement",movementId:"MOV-1",itemCode:"ITEM-1",warehouseCode:"MAIN",date:"2025-12-01",kind:"purchase",quantity:10,value:800});
 assert.equal(result.pendingReview,true);
 assert.equal(h.read("inventory/movements/MOV-1").value,1000,"stock is not changed before approval");
 const pending=h.read("documents/"+result.id);
 assert.equal(pending.status,"pending_review");
 assert.equal(pending.inventoryMovementChange.mode,"editMovement");
 assert.equal(pending.lines.find(line=>line.accountCode==="1300").debit,800);
 const approved=await h.invoke({action:"review",id:result.id,decision:"approve"});
 assert.equal(approved.status,"posted");
 assert.equal(h.read("inventory/movements/MOV-1").value,800);
 assert.equal(h.read("inventory/balances/MAIN/ITEM-1").value,800);
 assert.equal(h.read("journals/"+result.id).status,"posted");
});

test("deleting an orphan movement clears its quantity and value and queues the matching ledger correction",async()=>{
 const h=makeHarness({journals:{"OPEN-GL":{id:"OPEN-GL",status:"posted",type:"journal",date:"2025-12-01",lines:[{accountCode:"1300",debit:1000,credit:0},{accountCode:"3100",debit:0,credit:1000}]}}});
 const result=await h.invoke({action:"changeInventoryMovement",mode:"deleteMovement",movementId:"MOV-1",itemCode:"ITEM-1",warehouseCode:"MAIN"});
 assert.equal(result.pendingReview,true);
 assert.ok(result.deltaValue<0);
 await h.invoke({action:"review",id:result.id,decision:"approve"});
 assert.equal(h.read("inventory/movements/MOV-1"),null);
 assert.equal(h.read("inventory/balances/MAIN/ITEM-1").quantity,0);
 assert.equal(h.read("inventory/balances/MAIN/ITEM-1").value,0);
});

test("setting a stock balance to zero can repair an orphan balance even when its movement record is missing",async()=>{
 const movement={id:"OLD",date:"2025-12-01",itemCode:"ITEM-1",warehouseCode:"MAIN",kind:"purchase",quantity:0,value:0,createdAt:1,cancelledByJournalDeletion:true};
 const h=makeHarness({movement,stock:{quantity:8,value:640,averageCost:80}});
 const result=await h.invoke({action:"changeInventoryMovement",mode:"setBalance",itemCode:"ITEM-1",warehouseCode:"MAIN",date:"2025-12-22",quantity:0,value:0});
 assert.equal(result.applied,true);
 assert.equal(h.read("inventory/balances/MAIN/ITEM-1").quantity,0);
 assert.equal(h.read("inventory/balances/MAIN/ITEM-1").value,0);
});

test("posted invoice-linked movements cannot be changed independently",async()=>{
 const movement={id:"MOV-POSTED",date:"2025-12-01",itemCode:"ITEM-1",warehouseCode:"MAIN",kind:"purchase",quantity:10,value:1000,unitCost:100,createdAt:1,invoiceId:"INV-1",journalId:"JRN-1"};
 const h=makeHarness({movement,journals:{"JRN-1":{id:"JRN-1",status:"posted",type:"journal",lines:[]}}});
 await assert.rejects(()=>h.invoke({action:"changeInventoryMovement",mode:"deleteMovement",movementId:"MOV-POSTED",itemCode:"ITEM-1",warehouseCode:"MAIN"}),/مرتبطة بقيد مرحّل/);
});

test("inventory replay refuses a deletion that would make historical issue quantities negative",async()=>{
 const purchase={id:"PUR",date:"2025-12-01",itemCode:"ITEM-1",warehouseCode:"MAIN",kind:"purchase",quantity:3,value:300,unitCost:100,createdAt:1};
 const sale={id:"SALE",date:"2025-12-02",itemCode:"ITEM-1",warehouseCode:"MAIN",kind:"sale",quantity:-5,value:-500,unitCost:100,createdAt:2};
 const h=makeHarness({movement:purchase,stock:{quantity:-2,value:-200,averageCost:100}});
 h.database.inventory.movements.SALE=sale;
 await assert.rejects(()=>h.invoke({action:"changeInventoryMovement",mode:"deleteMovement",movementId:"PUR",itemCode:"ITEM-1",warehouseCode:"MAIN"}),/رصيد كمية سالب/);
});
