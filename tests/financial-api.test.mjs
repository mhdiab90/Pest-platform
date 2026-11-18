import test from "node:test";
import assert from "node:assert/strict";
import { handleFinancialRequest } from "../financial-api.js";
import { isAllowedOrigin } from "../cloudflare/origin.js";

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
async function adminReadRoot(path) { return read(path); }
async function adminPatchRoot(updates) {
  for (const [path, value] of Object.entries(updates)) {
    write(path.startsWith("financial/") ? path.slice("financial/".length) : path, value);
  }
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
    claims,profile,env,hasPermission,requirePermission,adminRead,adminPatch,adminReadRoot,adminPatchRoot
  });
}


test("CORS allows both supported app clients and rejects unrelated websites", () => {
  assert.equal(isAllowedOrigin("https://mhdiab90.github.io"), true);
  assert.equal(isAllowedOrigin("https://pest-platform.netlify.app"), true);
  assert.equal(isAllowedOrigin("https://pest-platform.ai-mhdiab90.workers.dev"), true);
  assert.equal(isAllowedOrigin("https://feature-mobile-push-performance-pest-platform.ai-mhdiab90.workers.dev"), true);
  assert.equal(isAllowedOrigin("capacitor://localhost"), true);
  assert.equal(isAllowedOrigin("https://localhost"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("https://random-account.workers.dev"), false);
  assert.equal(isAllowedOrigin("https://attacker.example"), false);
  assert.equal(isAllowedOrigin(""), false);
});

test("PDF page text is sent through invoice extraction and preserves suggested expense codes", async () => {
  env.AI={run:async(_model,request)=>{
    const prompt=request.messages[0].content.map(part=>part.text||"").join(" ");
    assert.match(prompt,/page 2 of 3/i);
    assert.match(prompt,/6503/);
    return {response:JSON.stringify({type:"purchase",number:"PDF-001",items:[{description:"إصلاح تكييف",quantity:1,unitPrice:900,kind:"service",suggestedExpenseCode:"6503"}]})};
  }};
  const result=await invoke("POST","",{
    action:"ocrText",text:"Invoice page text: supplier, HVAC maintenance, total 900",
    pageNumber:2,totalPages:3,expenseAccounts:[{code:"6503",name:"صيانة الكهرباء والتكييف"}]
  });
  assert.equal(result.needsHumanReview,true);
  assert.equal(result.pageNumber,2);
  assert.equal(result.extracted.items[0].suggestedExpenseCode,"6503");
  delete env.AI;
});

test("Egyptian ETA invoice direction is determined by the company's tax registration number and party role", async () => {
  const supplierInvoiceText = "Invoice\nIssuer (From)\nTaxpayer Name : Egypt Laptop\nRegistration Number : #329566725\nRecipients (To)\nTaxpayer Name: الشركة\nRegistration Number : #589845268\nCode Name";
  env.AI = {run:async(_model,request)=>{
    const prompt=request.messages[0].content.map(part=>part.text||"").join(" ");
    assert.match(prompt,/589845268/);
    assert.match(prompt,/issuerName/);
    assert.match(prompt,/recipientTaxNumber/);
    return {response:JSON.stringify({type:"sales",partyName:"wrong party",taxNumber:"wrong",issuerName:"AI supplier",issuerTaxNumber:"111111111",recipientName:"AI recipient",recipientTaxNumber:"222222222"})};
  }};
  const purchase=await invoke("POST","",{action:"ocrText",text:supplierInvoiceText,pageNumber:1,totalPages:1});
  assert.equal(purchase.extracted.type,"purchase","company tax ID in Recipients(To) must force purchase direction");
  assert.equal(purchase.extracted.issuerName,"Egypt Laptop");
  assert.equal(purchase.extracted.issuerTaxNumber,"329566725");
  assert.equal(purchase.extracted.recipientTaxNumber,"589845268");
  assert.equal(purchase.extracted.partyName,"Egypt Laptop","supplier is the counterparty");
  assert.equal(purchase.extracted.taxNumber,"329566725");

  const customerInvoiceText = "Invoice\nIssuer (From)\nTaxpayer Name : الشركة\nRegistration Number : #589845268\nRecipients (To)\nTaxpayer Name: الجامعة الأمريكية\nRegistration Number : #200128086\nCode Name";
  env.AI.run=async()=>({response:JSON.stringify({type:"purchase",partyName:"wrong party",taxNumber:"wrong",items:[]})});
  const sale=await invoke("POST","",{action:"ocrText",text:customerInvoiceText,pageNumber:1,totalPages:1});
  assert.equal(sale.extracted.type,"sales","company tax ID in Issuer(From) must force sales direction");
  assert.equal(sale.extracted.recipientName,"الجامعة الأمريكية");
  assert.equal(sale.extracted.recipientTaxNumber,"200128086");
  assert.equal(sale.extracted.partyName,"الجامعة الأمريكية","customer is the counterparty");
  assert.equal(sale.extracted.taxNumber,"200128086");
  delete env.AI;
});

test("financial workflow: bootstrap, double-entry review, invoice stock costing and duplicate protection", async () => {
  await invoke("GET","?resource=bootstrap");
  write("vendors/VENDOR-001",{code:"VENDOR-001",name:"Supplier Test",taxRegistrationNumber:"329566725"});
  write("clients/CUSTOMER-001",{code:"CUSTOMER-001",name:"Customer Test",taxRegistrationNumber:"200128086"});
  assert.equal(read("taxCodes/VAT-IN-14").taxType,"vat_input","standard input VAT code is seeded");
  assert.equal(read("taxCodes/VAT-OUT-14").taxType,"vat_output","standard output VAT code is seeded");
  assert.equal(read("taxCodes/VAT-IN-05").rate,5,"special input VAT code is seeded separately");
  assert.equal(read("taxCodes/VAT-OUT-05").rate,5,"special output VAT code is seeded separately");
  assert.equal(read("taxCodes/VAT-OUT-00").rate,0,"zero-rated sales code is seeded separately");
  assert.ok(read("chartOfAccounts/281"),"default supplier control account is created");
  assert.equal(read("chartOfAccounts/1240").subledgerType,"vendor","supplier advances have a separate asset control account");
  assert.equal(read("chartOfAccounts/2130").subledgerType,"customer","customer advances have a separate liability control account");
  assert.ok(read("chartOfAccounts/1210"),"default customer control account is created");
  assert.equal(read("chartOfAccounts/65").isGroup,true,"maintenance expense group is created");
  assert.equal(read("chartOfAccounts/6501").type,"expense","maintenance expense ledger account is created");
  assert.equal(read("chartOfAccounts/6601").parentCode,"66","training account is nested under its expense group");
  assert.equal(read("chartOfAccounts/6701").name,"مواد ومستلزمات النظافة","cleaning materials expense is seeded");
  assert.equal(read("chartOfAccounts/6802").name,"مشروبات وقهوة وشاي ومياه","pantry beverages expense is seeded");
  assert.equal(read("chartOfAccounts/6901").name,"أدوات كتابية وقرطاسية","stationery expense is seeded");

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
    action:"saveMaster",kind:"itemGroups",
    item:{code:"GROUP-1",name:"Test stock group"}
  });
  await assert.rejects(
    invoke("POST","",{action:"saveMaster",kind:"itemGroups",item:{code:"GROUP-1",name:"Attempted overwrite"}}),
    /مسجل بالفعل/
  );

  const customer = await invoke("POST","",{
    action:"saveMaster",kind:"parties",
    item:{code:"CUSTOMER-MASTER-01",name:"Customer Master Test",partyType:"customer",phone:"01000000000",taxNumber:"TAX-001"}
  });
  assert.equal(customer.item.code,"CUSTOMER-MASTER-01");
  assert.equal(read("clients/CUSTOMER-MASTER-01").name,"Customer Master Test","new finance customers are also registered in the main CRM");
  const supplierCreate = await invoke("POST","",{
    action:"saveMaster",kind:"parties",
    item:{code:"SUP-NEW-MASTER-01",name:"New Supplier Master Test",partyType:"vendor",phone:"01110000000",taxNumber:"589566777"}
  });
  assert.equal(supplierCreate.success,true);
  assert.equal(supplierCreate.created,true);
  assert.equal(read("vendors/SUP-NEW-MASTER-01").name,"New Supplier Master Test","supplier is added to the global supplier register");
  assert.equal(read("parties/SUP-NEW-MASTER-01").taxRegistrationNumber,"589566777","supplier tax number is stored on the financial party master");
  const supplierRetry=await invoke("POST","",{
    action:"saveMaster",kind:"parties",
    item:{code:"SUP-NEW-MASTER-01",name:"New Supplier Master Test",partyType:"vendor",taxNumber:"589566777"}
  });
  assert.equal(supplierRetry.success,true);
  assert.equal(supplierRetry.linkedExisting,true,"retry returns a successful linked record rather than failing silently");
  const bootstrapAfterParty = await invoke("GET","?resource=bootstrap");
  assert.equal(bootstrapAfterParty.parties["CUSTOMER-MASTER-01"].partyType,"customer","finance picker bootstrap merges CRM clients and vendors");

  const supplierImport = await invoke("POST","",{
    action:"importMasters",kind:"parties",partyType:"vendor",
    rows:[
      {code:"SUP-IMPORT-01",name:"Imported Supplier One",phone:"01111111111"},
      {code:"SUP-IMPORT-02",name:"Imported Supplier Two",taxNumber:"TAX-002"}
    ]
  });
  assert.equal(supplierImport.count,2);
  assert.equal(read("vendors/SUP-IMPORT-01").name,"Imported Supplier One");
  assert.equal(read("parties/SUP-IMPORT-02").partyType,"vendor");
  await assert.rejects(
    invoke("POST","",{action:"importMasters",kind:"parties",partyType:"vendor",rows:[{code:"SUP-IMPORT-01",name:"Duplicate supplier"}]}),
    /موجود بالفعل/
  );
  await invoke("POST","",{
    action:"saveMaster",kind:"items",
    item:{code:"ITEM-001",name:"Test stock item",unit:"piece",groupCode:"GROUP-1",version:"V1",warehouseCode:"default"}
  });
  const purchase = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-001",projectCode:"PRJ-1",
    partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxCode:"VAT-IN-14",taxAmount:"",taxRate:14,discount:10,
    lines:[{description:"Test stock",kind:"stock",itemCode:"ITEM-001",quantity:2,unitPrice:50,discount:0,warehouseCode:"default"}]
  });
  assert.equal(purchase.status,"pending_review");
  assert.equal(purchase.totals.net,90,"invoice-level discount is allocated across lines");
  assert.equal(purchase.totals.tax,12.6);
  assert.equal(read("documents/"+purchase.id).taxCode,"VAT-IN-14","input VAT code is retained on the purchase invoice");
  const earlySpecialRate=await invoke("POST","",{action:"submitInvoice",type:"purchase",date:"2026-07-01",number:"PUR-5-EARLY",partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxCode:"VAT-IN-05",lines:[{description:"Production machine",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:100}]});
  assert.equal(earlySpecialRate.status,"needs_correction","the 5% special rate cannot be used before its effective date");
  assert.ok(earlySpecialRate.errors.some(x=>x.includes("غير سارٍ بتاريخ الفاتورة")));
  await invoke("POST","",{
    action:"saveMaster",kind:"bankAccounts",
    item:{code:"1120",name:"Main Test Bank",accountCode:"1120"}
  });
  assert.equal(read("bankAccounts/1120").accountCode,"1120","bank account master is linked to a valid ledger account");

  const correction = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-CORR-01",
    partyId:"SUP-IMPORT-01",partyName:"Imported Supplier One",
    lines:[{description:"Missing stock code",kind:"stock",itemCode:"",quantity:1,unitPrice:20}]
  });
  assert.equal(correction.status,"needs_correction");
  await invoke("POST","",{
    action:"addAttachment",documentId:correction.id,
    attachment:{id:"ATTACH-ORIGINAL",fileName:"invoice-original.jpg",mimeType:"image/jpeg",size:100}
  });
  const corrected = await invoke("POST","",{
    action:"submitInvoice",id:correction.id,type:"purchase",date:"2026-11-18",number:"PUR-CORR-01",
    partyId:"SUP-IMPORT-01",partyName:"Imported Supplier One",
    lines:[{description:"Corrected stock code",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:20}]
  });
  assert.equal(corrected.status,"pending_review");
  assert.equal(read("documents/"+correction.id+"/attachments/ATTACH-ORIGINAL").fileName,"invoice-original.jpg","editing a correction keeps its original scanned invoice attachment");

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
  const supplierPayment=await invoke("POST","",{action:"submitCash",movementType:"supplier_payment",date:"2026-11-18",amount:150,currency:"EGP",partyId:"VENDOR-001",partyName:"Supplier Test",cashAccountCode:"1110",description:"Supplier payment and advance"});
  const supplierPaymentPosted=await invoke("POST","",{action:"review",id:supplierPayment.id,decision:"approve",reason:"test supplier settlement"});
  assert.equal(supplierPaymentPosted.status,"posted");
  const supplierPaymentJournal=read("journals/"+supplierPaymentPosted.journalId);
  assert.ok(supplierPaymentJournal.lines.some(x=>x.accountCode==="281"&&x.debit===102.6&&x.partyId==="VENDOR-001"),"supplier payment settles only open payable");
  assert.ok(supplierPaymentJournal.lines.some(x=>x.accountCode==="1240"&&x.debit===47.4&&x.partyId==="VENDOR-001"),"supplier overpayment is recognized as a supplier advance asset");

  const projectRows = Object.values(read("costLedger/CC-PRJ-1/2026-11") || {});
  assert.ok(projectRows.some(x=>x.debit===90&&x.projectCode==="PRJ-1"),"invoice expense/inventory line carries the project cost center");

  const mixedPurchase = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-MIX-EXP-01",
    partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",
    lines:[
      {description:"إصلاح وحدة تكييف",kind:"service",accountCode:"6503",quantity:1,unitPrice:1500},
      {description:"دورة تدريب للعاملين",kind:"service",accountCode:"6601",quantity:2,unitPrice:500},
      {description:"مستلزمات نظافة",kind:"service",accountCode:"6701",quantity:5,unitPrice:100}
    ]
  });
  assert.equal(mixedPurchase.status,"pending_review","expense invoice is accepted without inventory item codes");
  const expensePosted=await invoke("POST","",{action:"review",id:mixedPurchase.id,decision:"approve",reason:"expense invoice approval"});
  assert.equal(expensePosted.status,"posted");
  const expenseJournal=read("journals/"+expensePosted.journalId);
  assert.ok(expenseJournal.lines.some(x=>x.accountCode==="6503"&&x.debit===1500),"maintenance line posts to maintenance expense");
  assert.ok(expenseJournal.lines.some(x=>x.accountCode==="6601"&&x.debit===1000),"training line posts to training expense");
  assert.ok(expenseJournal.lines.some(x=>x.accountCode==="6701"&&x.debit===500),"cleaning supplies post to cleaning expense");
  assert.equal(read("inventory/balances/default/ITEM-001").quantity,2,"service/expense lines do not change inventory quantity");
  assert.ok(expenseJournal.lines.some(x=>x.accountCode==="1240"&&x.credit===47.4&&x.partyId==="VENDOR-001"),"new supplier invoice automatically applies the outstanding supplier advance");
  assert.ok(expenseJournal.lines.some(x=>x.accountCode==="281"&&x.debit===47.4&&x.partyId==="VENDOR-001"),"supplier advance clearing reduces accounts payable");

  const wrongExpenseAccount=await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-WRONG-ACC-01",
    partyId:"VENDOR-001",partyName:"Supplier Test",
    lines:[{description:"Training",kind:"service",accountCode:"4100",quantity:1,unitPrice:100}]
  });
  assert.equal(wrongExpenseAccount.status,"needs_correction","purchase expenses cannot be posted to revenue accounts");

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
    partyId:"CUSTOMER-001",partyName:"Customer Test",currency:"EGP",taxCode:"VAT-OUT-14",taxAmount:"",taxRate:14,
    lines:[{description:"Test stock sale",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:200,discount:0,warehouseCode:"default"}]
  });
  const salePosted = await invoke("POST","",{action:"review",id:sale.id,decision:"approve",reason:"sale approval"});
  assert.equal(salePosted.status,"posted");
  assert.equal(read("documents/"+sale.id).taxCode,"VAT-OUT-14","output VAT code is retained on the sales invoice");
  const saleStock = read("inventory/balances/default/ITEM-001");
  assert.equal(saleStock.quantity,1);
  assert.equal(saleStock.value,45);
  const saleJournal = read("journals/"+salePosted.journalId);
  assert.ok(saleJournal.lines.some(x=>x.accountCode==="5100"&&x.debit===45),"sale posts cost of goods sold");
  assert.ok(saleJournal.lines.some(x=>x.accountCode==="1300"&&x.credit===45),"sale credits inventory");
  const customerReceipt=await invoke("POST","",{action:"submitCash",movementType:"customer_receipt",date:"2026-11-18",amount:250,currency:"EGP",partyId:"CUSTOMER-001",partyName:"Customer Test",cashAccountCode:"1110",description:"Customer receipt with advance"});
  const customerReceiptPosted=await invoke("POST","",{action:"review",id:customerReceipt.id,decision:"approve",reason:"test customer settlement"});
  assert.equal(customerReceiptPosted.status,"posted");
  const customerReceiptJournal=read("journals/"+customerReceiptPosted.journalId);
  assert.ok(customerReceiptJournal.lines.some(x=>x.accountCode==="1210"&&x.credit===228&&x.partyId==="CUSTOMER-001"),"customer receipt settles the existing receivable");
  assert.ok(customerReceiptJournal.lines.some(x=>x.accountCode==="2130"&&x.credit===22&&x.partyId==="CUSTOMER-001"),"customer overpayment is recognized as a customer advance liability");

  const followingSale=await invoke("POST","",{action:"submitInvoice",type:"sales",date:"2026-11-18",number:"SAL-ADV-APPLY-01",partyId:"CUSTOMER-001",partyName:"Customer Test",currency:"EGP",taxRate:0,lines:[{description:"Service following customer advance",kind:"service",incomeAccountCode:"4200",quantity:1,unitPrice:100}]});
  const followingSalePosted=await invoke("POST","",{action:"review",id:followingSale.id,decision:"approve",reason:"apply customer advance"});
  assert.equal(followingSalePosted.status,"posted");
  const followingSaleJournal=read("journals/"+followingSalePosted.journalId);
  assert.ok(followingSaleJournal.lines.some(x=>x.accountCode==="2130"&&x.debit===22&&x.partyId==="CUSTOMER-001"),"new sale automatically applies the available customer advance");
  assert.ok(followingSaleJournal.lines.some(x=>x.accountCode==="1210"&&x.credit===22&&x.partyId==="CUSTOMER-001"),"customer advance application reduces the new receivable");

});

test("supplier linking, delegated invoice completion, staff custody and advances", async () => {
  await invoke("GET","?resource=bootstrap");
  write("vendors/VENDOR-LEGACY",{code:"VENDOR-LEGACY",name:"Legacy Supplier",taxRegistrationNumber:"TX-8899",phone:"01000000000"});
  const linked=await invoke("POST","",{action:"saveMaster",kind:"parties",item:{code:"VENDOR-LEGACY",name:"Legacy Supplier",partyType:"vendor",taxNumber:"TX-8899"}});
  assert.equal(linked.success,true);
  assert.equal(linked.linkedExisting,true);
  assert.equal(read("parties/VENDOR-LEGACY").taxRegistrationNumber,"TX-8899","legacy supplier tax registration is preserved");
  assert.equal(read("vendors/VENDOR-LEGACY").name,"Legacy Supplier","existing CRM supplier remains unchanged");

  write("users/EMPLOYEE-01",{uid:"EMPLOYEE-01",status:"active",fullName:"Employee One",username:"employee.one",role:"user"});
  const draft=await invoke("POST","",{action:"saveInvoiceDraft",type:"purchase",date:"2026-11-18",number:"ASSIGN-001",partyId:"VENDOR-LEGACY",partyName:"Legacy Supplier",lines:[
    {description:"Stationery supplies",kind:"stock",itemCode:"",quantity:1,unitPrice:300,accountCode:"6901"}
  ]});
  assert.equal(draft.status,"draft");
  const assigned=await invoke("POST","",{action:"assignInvoice",invoiceId:draft.id,assigneeUid:"EMPLOYEE-01",instruction:"صنّف البند كمستلزمات مكتبية واربط حسابه الصحيح"});
  assert.equal(assigned.status,"assigned");
  assert.equal(read("tasks/EMPLOYEE-01/"+assigned.taskId).kind,"financialAssignment");
  assert.equal(read("cashCustodyNotifications/EMPLOYEE-01/"+assigned.assignmentId).type,"financialAssignment");

  const previousUid=claims.sub,previousRole=profile.role,previousName=profile.fullName;
  claims.sub="EMPLOYEE-01";profile.role="user";profile.fullName="Employee One";
  const assignmentList=await invoke("GET","?resource=assignments");
  assert.equal(assignmentList.items.length,1,"assignee only sees their own open assignment");
  const completed=await invoke("POST","",{action:"completeInvoiceAssignment",assignmentId:assigned.assignmentId,lines:[
    {index:0,kind:"service",accountCode:"6901"}
  ]});
  assert.equal(completed.status,"returned_to_creator");
  assert.equal(read("documents/"+draft.id).status,"returned_to_creator");
  assert.equal(read("cashCustodyNotifications/"+previousUid+"/"+read("documents/"+draft.id).returnedTaskId).type,"financialAssignmentReturned");
  assert.equal(read("tasks/EMPLOYEE-01/"+assigned.taskId+"/status"),"completed");

  claims.sub=previousUid;profile.role=previousRole;profile.fullName=previousName;
  const resubmitted=await invoke("POST","",{action:"submitInvoice",id:draft.id,type:"purchase",date:"2026-11-18",number:"ASSIGN-001",partyId:"VENDOR-LEGACY",partyName:"Legacy Supplier",lines:[
    {description:"Stationery supplies",kind:"service",accountCode:"6901",quantity:1,unitPrice:300}
  ]});
  assert.equal(resubmitted.status,"pending_review","creator can submit a returned delegated invoice");
  assert.equal(read("tasks/test-admin/"+read("documents/"+draft.id).returnedTaskId+"/status"),"completed");

  const custody=await invoke("POST","",{action:"submitCash",movementType:"employee_custody",date:"2026-11-18",amount:500,currency:"EGP",description:"Employee cash custody",employeeUid:"EMPLOYEE-01",cashAccountCode:"1110"});
  const custodyPosted=await invoke("POST","",{action:"review",id:custody.id,decision:"approve",reason:"custody handover"});
  assert.equal(custodyPosted.status,"posted");
  const custodyLines=Object.values(read("partyLedger/employeeCustody/EMPLOYEE-01/2026-11")||{});
  assert.ok(custodyLines.some(x=>x.accountCode==="1220"&&x.debit===500),"employee custody is posted to control account 1220 and staff subledger");
  assert.ok(Object.keys(read("cashCustodies/EMPLOYEE-01/transactions")||{}).length>0,"custody handover appears in the existing personal cash-custody book");

  const advance=await invoke("POST","",{action:"submitCash",movementType:"employee_advance",date:"2026-11-18",amount:400,currency:"EGP",description:"Employee advance",employeeUid:"EMPLOYEE-01",cashAccountCode:"1110"});
  const advancePosted=await invoke("POST","",{action:"review",id:advance.id,decision:"approve",reason:"advance issue"});
  assert.equal(advancePosted.status,"posted");
  const advanceLines=Object.values(read("partyLedger/employeeAdvance/EMPLOYEE-01/2026-11")||{});
  assert.ok(advanceLines.some(x=>x.accountCode==="1230"&&x.debit===400),"employee advance is posted to separate control account 1230");

  const recovery=await invoke("POST","",{action:"submitCash",movementType:"employee_advance_recovery",date:"2026-11-18",amount:150,currency:"EGP",description:"Advance recovery",employeeUid:"EMPLOYEE-01",cashAccountCode:"1110"});
  const recoveryPosted=await invoke("POST","",{action:"review",id:recovery.id,decision:"approve",reason:"advance recovered"});
  assert.equal(recoveryPosted.status,"posted");
  const finalAdvanceRows=Object.values(read("partyLedger/employeeAdvance/EMPLOYEE-01/2026-11")||{});
  const finalAdvanceBalance=finalAdvanceRows.reduce((sum,x)=>sum+Number(x.debit||0)-Number(x.credit||0),0);
  assert.equal(finalAdvanceBalance,250,"advance recovery reduces the employee's separate loan balance");

  const excessRecovery=await invoke("POST","",{action:"submitCash",movementType:"employee_advance_recovery",date:"2026-11-18",amount:300,currency:"EGP",description:"Excess recovery",employeeUid:"EMPLOYEE-01",cashAccountCode:"1110"});
  await assert.rejects(invoke("POST","",{action:"review",id:excessRecovery.id,decision:"approve",reason:"must not over recover"}),/أكبر من رصيد السلفة/);
});



test("period report returns selected-period activity and cumulative balances separately", async () => {
  write("settings/accountingStartMonth","2026-10");
  write("periods/2026-10/entries/opening",{id:"OPENING",date:"2026-10-01",status:"posted",lines:[{accountCode:"1110",debit:1000,credit:0}]});
  write("periods/2026-11/entries/november",{id:"NOV",date:"2026-11-10",status:"posted",lines:[{accountCode:"6100",debit:100,credit:0}]});
  write("periods/2026-12/entries/december",{id:"DEC",date:"2026-12-10",status:"posted",lines:[{accountCode:"1110",debit:200,credit:0}]});
  const report=await invoke("GET","?resource=periods&from=2026-11&to=2026-12");
  assert.deepEqual(report.months,["2026-11","2026-12"]);
  assert.deepEqual(Object.keys(report.entries),["2026-11","2026-12"]);
  assert.deepEqual(Object.keys(report.balanceEntries),["2026-10","2026-11","2026-12"]);
  assert.equal(report.accountingStartMonth,"2026-10");
  assert.equal(report.balanceEntries["2026-10"].opening.lines[0].debit,1000);
  assert.equal(report.entries["2026-11"].november.lines[0].debit,100);
});

test("foreign-currency posting is blocked until exchange rates and revaluation exist", async () => {
  await assert.rejects(
    invoke("POST","",{
      action:"submitJournal",date:"2026-11-18",description:"USD manual journal",currency:"USD",
      lines:[{accountCode:"6100",debit:100,credit:0},{accountCode:"1110",debit:0,credit:100}]
    }),
    /عملات/
  );
  await assert.rejects(
    invoke("POST","",{action:"submitCash",movementType:"other_payment",date:"2026-11-18",amount:100,currency:"USD",cashAccountCode:"1110",offsetAccountCode:"6100",description:"USD cash payment"}),
    /عملات/
  );
  const foreignInvoice=await invoke("POST","",{action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-USD-TEST",partyId:"VENDOR-001",partyName:"Supplier Test",currency:"USD",taxRate:0,lines:[{description:"Foreign currency item",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:10}]});
  assert.equal(foreignInvoice.status,"needs_correction","foreign invoice is retained as a draft requiring correction, not posted");
  assert.equal(read("documents/"+foreignInvoice.id).currency,"USD","original invoice currency is preserved until the user deliberately converts it");
});
