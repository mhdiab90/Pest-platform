import test from "node:test";
import assert from "node:assert/strict";
import { handleFinancialRequest } from "../financial-api.js";
import { isAllowedOrigin } from "../cloudflare/origin.js";

const database = {};
const adminPatchCalls = [];
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
  adminPatchCalls.push(updates);
  for (const [path, value] of Object.entries(updates)) write(path, value);
  return true;
}
async function adminReadRoot(path) { return read(path); }
const adminPutRootCalls = [];
async function adminPutRoot(path, value) {
  adminPutRootCalls.push({ path, value });
  write(path, value);
  return true;
}
const adminPatchRootCalls = [];
async function adminPatchRoot(updates) {
  adminPatchRootCalls.push(updates);
  for (const [path, value] of Object.entries(updates)) {
    write(path.startsWith("financial/") ? path.slice("financial/".length) : path, value);
  }
  return true;
}
const adminPatchRootAtCalls = [];
async function adminPatchRootAt(path, updates) {
  adminPatchRootAtCalls.push({path, updates});
  for (const [key, value] of Object.entries(updates)) write(path + "/" + key, value);
  return true;
}
const profile = {uid:"test-admin",role:"admin",status:"active",fullName:"Finance Test"};
const claims = {sub:"test-admin"};
const env = {};
const hasPermission = () => true;
const requirePermission = () => true;
async function invoke(method, path, body, options = {}) {
  const requestProfile=options.profile||profile;
  const requestClaims=options.claims||claims;
  const requestHasPermission=options.hasPermission||hasPermission;
  const requestRequirePermission=options.requirePermission||requirePermission;
  return handleFinancialRequest({
    request:{method},
    url:new URL("https://example.test/finance" + (path || "")),
    body:body || {},
    claims:requestClaims,profile:requestProfile,env,
    hasPermission:requestHasPermission,requirePermission:requestRequirePermission,
    adminRead,adminPatch,adminReadRoot,adminPutRoot,adminPatchRoot,adminPatchRootAt
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

test("invoice number uses only the numeric token beside Internal ID, not the ETA document ID", async () => {
  const pdfText = ["Invoice","ID: HPQ0GXW34P4KXH0S2FJFJ77M10 Proforma Invoice Number:","PO Reference:","Internal ID: 13672","Signed By: Egypt Laptop"].join(String.fromCharCode(10));
  env.AI = {run:async(_model,request)=>{
    const prompt=request.messages[0].content.map(part=>part.text||"").join(" ");
    assert.match(prompt,/Internal id/i);
    assert.match(prompt,/first contiguous numeric digit sequence immediately to the right/i);
    assert.match(prompt,/Return digits only/i);
    return {response:JSON.stringify({type:"purchase",number:"HPQ0GXW34P4KXH0S2FJFJ77M10",items:[]})};
  }};
  const fromPdf = await invoke("POST","",{action:"ocrText",text:pdfText,pageNumber:1,totalPages:1});
  assert.equal(fromPdf.extracted.number,"13672","the printed Internal ID wins over the long ETA document ID and any model guess");

  env.AI.run=async(_model,request)=>{
    const prompt=request.messages[0].content.map(part=>part.text||"").join(" ");
    assert.match(prompt,/Internal id/i);
    assert.match(prompt,/Stop at the first non-digit/i);
    return {response:JSON.stringify({type:"purchase",internalIdValue:"13672 EXTRA COLUMN 999999",number:"HPQ0GXW34P4KXH0S2FJFJ77M10",items:[]})};
  };
  const fromImage=await invoke("POST","",{action:"ocr",image:"data:image/jpeg;base64,AAAA",pageNumber:1,totalPages:1});
  assert.equal(fromImage.extracted.number,"13672","image OCR keeps only the first digit sequence after Internal ID");
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
    item:{code:"SUP-NEW-MASTER-01",name:"New Supplier Master Test",partyType:"vendor",phone:"01110000000",mobile:"01099998888",taxNumber:"589566777",commercialRegister:"CR-1001",contactPerson:"Contact Person",contactTitle:"Purchasing",email:"supplier@example.test",city:"Cairo",country:"Egypt",paymentTerms:"30 days",creditLimit:25000,currency:"EGP",bankName:"Test Bank",bankAccount:"12345",iban:"EG00TEST",address:"Test address",notes:"Created from invoice"}
  });
  assert.equal(supplierCreate.success,true);
  assert.equal(supplierCreate.created,true);
  assert.equal(read("vendors/SUP-NEW-MASTER-01").name,"New Supplier Master Test","supplier is added to the global supplier register");
  assert.equal(read("vendors/SUP-NEW-MASTER-01").companyName,"New Supplier Master Test","supplier company name remains readable by the CRM screen");
  assert.equal(read("vendors/SUP-NEW-MASTER-01").commercialRegister,"CR-1001","full master-data fields are stored in the CRM supplier record");
  assert.equal(read("vendors/SUP-NEW-MASTER-01").creditLimit,25000,"supplier credit limit is retained");
  assert.equal(read("parties/SUP-NEW-MASTER-01").taxRegistrationNumber,"589566777","supplier tax number is stored on the financial party master");
  assert.equal(read("parties/SUP-NEW-MASTER-01").iban,"EG00TEST","full supplier data is synchronized to the finance master");
  const supplierReadback=await invoke("GET","?resource=bootstrap");
  assert.equal(supplierReadback.parties["SUP-NEW-MASTER-01"].partyType,"vendor","saved supplier is visible again after server readback");
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
  const supplierUpsert = await invoke("POST","",{action:"importMasters",kind:"parties",partyType:"vendor",rows:[{code:"SUP-IMPORT-01",name:"Updated supplier",phone:""}]});
  assert.equal(supplierUpsert.updated,1,"an existing customer/supplier code updates the current record");
  assert.equal(read("vendors/SUP-IMPORT-01").name,"Updated supplier");
  assert.equal(read("vendors/SUP-IMPORT-01").phone,"01111111111","blank spreadsheet cells do not erase existing contact data");
  assert.equal(read("vendors/SUP-IMPORT-01").id,undefined,"the import does not manufacture a replacement record ID");
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
  assert.equal(earlySpecialRate.status,"pending_review");
  assert.equal(read("documents/"+earlySpecialRate.id).taxCode,"VAT-IN-14","purchase invoices always use the fixed standard input VAT code");
  assert.equal(read("documents/"+earlySpecialRate.id).taxRate,14,"the primary VAT rate is fixed at 14%, even when OCR suggests another rate");
  assert.ok(!earlySpecialRate.errors.some(x=>x.includes("غير سارٍ بتاريخ الفاتورة")));
  assert.ok(read("reviewQueue/"+earlySpecialRate.id));
  const unclassifiedVat=await invoke("POST","",{action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-VAT-NO-CODE",partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxRate:5,lines:[{description:"Equipment",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:100}]});
  assert.equal(unclassifiedVat.status,"pending_review","a missing or nonstandard VAT choice is normalized to the fixed 14% code");
  assert.equal(read("documents/"+unclassifiedVat.id).taxCode,"VAT-IN-14");
  assert.equal(read("documents/"+unclassifiedVat.id).taxRate,14);
  assert.equal(unclassifiedVat.totals.vat,14);
  assert.ok(!unclassifiedVat.errors.some(x=>x.includes("كود ضريبي")));
  assert.ok(read("reviewQueue/"+unclassifiedVat.id));
  await invoke("POST","",{
    action:"saveMaster",kind:"bankAccounts",
    item:{code:"1120",name:"Main Test Bank",accountCode:"1120"}
  });
  assert.equal(read("bankAccounts/1120").accountCode,"1120","bank account master is linked to a valid ledger account");

  write("chartOfAccounts/6200",{code:"6200",name:"رسوم وضرائب أخرى",type:"expense",nature:"debit",active:true});
  write("parties/VENDOR-TAX-01",{code:"VENDOR-TAX-01",name:"Other Tax Supplier",partyType:"vendor",active:true});
  const additionalTax=await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-OTHER-TAX-01",
    partyId:"VENDOR-TAX-01",partyName:"Other Tax Supplier",currency:"EGP",taxCode:"",taxRate:4,taxAmount:"",
    otherTaxes:[{description:"Stamp tax",rate:1,amount:"",accountCode:"6200"}],
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}]
  });
  assert.equal(additionalTax.status,"pending_review");
  assert.equal(additionalTax.totals.vat,14,"the fixed primary VAT is calculated at 14%");
  assert.equal(additionalTax.totals.otherTax,1,"an additional tax is calculated separately");
  assert.equal(additionalTax.totals.total,115,"the supplier total includes both taxes");
  assert.equal(read("documents/"+additionalTax.id).taxCode,"VAT-IN-14");
  const additionalTaxPosted=await invoke("POST","",{action:"review",id:additionalTax.id,decision:"approve",reason:"separate tax test"});
  assert.equal(additionalTaxPosted.status,"posted");
  const additionalTaxJournal=read("journals/"+additionalTaxPosted.journalId);
  assert.ok(additionalTaxJournal.lines.some(line=>line.accountCode==="1410"&&line.debit===14),"primary VAT posts to input VAT only");
  assert.ok(additionalTaxJournal.lines.some(line=>line.accountCode==="6200"&&line.debit===1),"additional tax posts to its selected account");
  assert.ok(additionalTaxJournal.lines.some(line=>line.accountCode==="281"&&line.credit===115),"supplier control includes both taxes");

  const fixedOverride=await invoke("POST","",{action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-VAT-OVERRIDE-01",partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxAmount:12,otherTaxes:[],lines:[{description:"Tax override test",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}]});
  assert.equal(fixedOverride.totals.vat,12,"a user-entered fixed primary VAT amount overrides the 14% calculation");
  assert.equal(read("documents/"+fixedOverride.id).taxRate,14,"manual VAT amount does not change the fixed VAT code rate");

  const correction = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-CORR-01",
    partyId:"SUP-IMPORT-01",partyName:"Imported Supplier One",
    lines:[{description:"Missing stock code",kind:"stock",itemCode:"",quantity:1,unitPrice:20}]
  });
  assert.equal(correction.status,"pending_review","a missing stock code is queued for reviewer completion");
  assert.ok(read("reviewQueue/"+correction.id));
  await invoke("POST","",{
    action:"addAttachment",documentId:correction.id,
    attachment:{id:"ATTACH-ORIGINAL",fileName:"invoice-original.jpg",mimeType:"image/jpeg",size:100}
  });
  const corrected = await invoke("POST","",{
    action:"updateReviewInvoice",id:correction.id,
    invoice:{invoiceType:"purchase",date:"2026-11-18",number:"PUR-CORR-01",partyId:"SUP-IMPORT-01",partyName:"Imported Supplier One",currency:"EGP",taxRate:0,taxAmount:"",discount:0},
    lines:[{description:"Corrected stock code",kind:"stock",itemCode:"ITEM-001",quantity:1,unitPrice:20}]
  });
  assert.equal(corrected.status,"pending_review");
  assert.deepEqual(corrected.errors,[],"the reviewer can correct the missing stock code before approval");
  assert.equal(read("documents/"+correction.id+"/attachments/ATTACH-ORIGINAL").fileName,"invoice-original.jpg","review edits preserve the original scanned invoice attachment");

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
  assert.equal(wrongExpenseAccount.status,"pending_review","an invalid expense account is sent to the reviewer for correction");
  assert.ok(wrongExpenseAccount.errors.some(x=>x.includes("مصروف صحيح")));

  const duplicate = await invoke("POST","",{
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-001",
    partyId:"VENDOR-001",partyName:"Supplier Test",currency:"EGP",taxCode:"VAT-IN-14",taxRate:14,discount:10,
    lines:[{description:"Test stock",kind:"stock",itemCode:"ITEM-001",quantity:2,unitPrice:50,discount:0,warehouseCode:"default"}]
  });
  assert.equal(duplicate.status,"duplicate_review","duplicate invoice must enter a dedicated review status");
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

test("review inbox retains incomplete invoices and lets reviewers correct them without losing attachments", async () => {
  await invoke("GET","?resource=bootstrap");
  write("vendors/VENDOR-REVIEW-01",{code:"VENDOR-REVIEW-01",name:"Review Supplier",partyType:"vendor"});
  write("parties/VENDOR-REVIEW-01",{code:"VENDOR-REVIEW-01",name:"Review Supplier",partyType:"vendor"});
  const payload={
    action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-REVIEW-FLOW-01",
    partyId:"VENDOR-REVIEW-01",partyName:"Review Supplier",currency:"EGP",taxCode:"VAT-IN-14",taxRate:14,
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}]
  };
  const submitted=await invoke("POST","",payload);
  assert.equal(submitted.status,"pending_review");
  const inbox=await invoke("GET","?resource=review");
  const queued=inbox.items[submitted.id];
  assert.ok(queued,"a submitted invoice must be visible in the review queue");
  assert.equal(queued.invoiceType,"purchase");
  assert.equal(queued.createdByName,"Finance Test");
  assert.equal(queued.total,114);
  const detail=await invoke("GET","?resource=document&id="+encodeURIComponent(submitted.id));
  assert.equal(detail.item.id,submitted.id);
  assert.equal(detail.item.lines[0].description,"Maintenance service");

  const attachment={id:"ATT-REVIEW-01",fileName:"invoice-original.pdf",mimeType:"application/pdf",size:4096};
  write("documents/"+submitted.id+"/attachments/"+attachment.id,attachment);
  write("documents/"+submitted.id+"/attachmentUploadStatus","pending");
  write("documents/"+submitted.id+"/attachmentFileName","invoice-original.pdf");

  const incomplete=await invoke("POST","",{
    action:"updateReviewInvoice",id:submitted.id,
    invoice:{invoiceType:"purchase",date:"2026-11-18",number:"PUR-REVIEW-FLOW-01",partyId:"VENDOR-REVIEW-01",partyName:"Review Supplier",currency:"EGP",taxCode:"VAT-IN-14",taxType:"vat_input",taxRate:14,taxAmount:"",discount:0},
    lines:[]
  });
  assert.equal(incomplete.status,"pending_review","reviewer can retain an incomplete invoice in the queue while correcting it");
  assert.equal(read("reviewQueue/"+submitted.id).status,"pending_review");
  assert.equal(read("documents/"+submitted.id+"/status"),"pending_review");
  assert.ok(read("documents/"+submitted.id+"/errors").length>0,"missing invoice lines are visible to the reviewer as validation errors");
  assert.equal(read("documents/"+submitted.id+"/attachments/"+attachment.id).fileName,"invoice-original.pdf","review submission preserves the original scanned invoice");
  assert.equal(read("documents/"+submitted.id+"/attachmentUploadStatus"),"pending","a pending upload remains pending after resubmission");
  const afterIncomplete=await invoke("GET","?resource=review");
  assert.ok(afterIncomplete.items[submitted.id],"incomplete documents must remain visible in the reviewer inbox");

  const repaired=await invoke("POST","",{
    action:"updateReviewInvoice",id:submitted.id,
    invoice:{invoiceType:"purchase",date:"2026-11-18",number:"PUR-REVIEW-FLOW-01",partyId:"VENDOR-REVIEW-01",partyName:"Review Supplier",currency:"EGP",taxCode:"VAT-IN-14",taxType:"vat_input",taxRate:14,taxAmount:"",discount:0},
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100,discount:0}]
  });
  assert.equal(repaired.status,"pending_review");
  assert.deepEqual(repaired.errors,[],"reviewer fixes the missing line details");
  assert.equal(read("documents/"+submitted.id+"/attachments/"+attachment.id).fileName,"invoice-original.pdf");
  assert.equal(read("documents/"+submitted.id+"/attachmentUploadStatus"),"pending");
});
test("invoice remains in review when its Drive attachment upload is pending", async () => {
  await invoke("GET","?resource=bootstrap");
  write("vendors/VENDOR-ATTACH-01",{code:"VENDOR-ATTACH-01",name:"Attachment Supplier",partyType:"vendor"});
  write("parties/VENDOR-ATTACH-01",{code:"VENDOR-ATTACH-01",name:"Attachment Supplier",partyType:"vendor"});
  const submitted=await invoke("POST","",{action:"submitInvoice",type:"purchase",date:"2026-11-18",number:"PUR-ATTACH-01",partyId:"VENDOR-ATTACH-01",partyName:"Attachment Supplier",currency:"EGP",taxCode:"VAT-IN-14",taxRate:14,lines:[
    {description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}
  ]});
  assert.equal(submitted.status,"pending_review");
  assert.ok(read("reviewQueue/"+submitted.id),"invoice is placed in the review queue before any Drive upload is attempted");
  const pending=await invoke("POST","",{action:"setAttachmentUploadStatus",documentId:submitted.id,status:"pending",fileName:"invoice.jpg",error:"Google Drive is not configured"});
  assert.equal(pending.success,true);
  assert.equal(read("documents/"+submitted.id).status,"pending_review","attachment failure must not change the invoice's review status");
  assert.equal(read("documents/"+submitted.id).attachmentUploadStatus,"pending");
  assert.equal(read("documents/"+submitted.id).attachmentFileName,"invoice.jpg");
  assert.equal(read("reviewQueue/"+submitted.id).attachmentUploadStatus,"pending","reviewers can see that the attachment still needs uploading");
  const uploaded=await invoke("POST","",{action:"setAttachmentUploadStatus",documentId:submitted.id,status:"uploaded"});
  assert.equal(uploaded.success,true);
  assert.equal(read("documents/"+submitted.id).attachmentUploadStatus,undefined,"successful retry removes the pending marker");
  assert.equal(read("reviewQueue/"+submitted.id).attachmentUploadStatus,undefined);
  assert.ok(read("reviewQueue/"+submitted.id),"successful attachment retry does not remove the invoice from review");
});

test("supplier linking, delegated invoice completion, staff custody and advances", async () => {
  await invoke("GET","?resource=bootstrap");
  write("vendors/VENDOR-LEGACY",{code:"VENDOR-LEGACY",name:"Legacy Supplier",taxRegistrationNumber:"TX-8899",phone:"01000000000"});
  const linked=await invoke("POST","",{action:"saveMaster",kind:"parties",item:{code:"VENDOR-LEGACY",name:"Legacy Supplier",partyType:"vendor",taxNumber:"TX-8899"}});
  assert.equal(linked.success,true);
  assert.equal(linked.linkedExisting,true);
  assert.equal(read("parties/VENDOR-LEGACY").taxRegistrationNumber,"TX-8899","legacy supplier tax registration is preserved");
  assert.equal(read("vendors/VENDOR-LEGACY").name,"Legacy Supplier","existing CRM supplier remains unchanged");

  const newVendor=await invoke("POST","",{action:"saveMaster",kind:"parties",item:{
    code:"VENDOR-NEW-01",name:"New Test Supplier",partyType:"vendor",taxNumber:"TX-NEW-01",
    phone:"01012345678",email:"supplier@example.test",paymentTerms:"30 days"
  }});
  assert.equal(newVendor.success,true);
  assert.equal(adminPutRootCalls[adminPutRootCalls.length-1].path,"vendors/VENDOR-NEW-01","supplier CRM record is saved with a path-scoped PUT, not a root PATCH");
  assert.equal(read("vendors/VENDOR-NEW-01").name,"New Test Supplier");
  assert.equal(read("vendors/VENDOR-NEW-01").taxRegistrationNumber,"TX-NEW-01");
  assert.equal(read("parties/VENDOR-NEW-01").email,"supplier@example.test","the finance subledger master is synchronized");
  assert.equal(newVendor.created,true);

  const newClient=await invoke("POST","",{action:"saveMaster",kind:"parties",item:{
    code:"CLIENT-NEW-01",name:"New Test Customer",partyType:"customer",taxNumber:"TX-CLIENT-01",mobile:"01098765432"
  }});
  assert.equal(newClient.success,true);
  assert.equal(adminPutRootCalls[adminPutRootCalls.length-1].path,"clients/CLIENT-NEW-01","customer CRM record is saved directly to its own path");
  assert.equal(read("clients/CLIENT-NEW-01").mobile,"01098765432");
  assert.equal(read("parties/CLIENT-NEW-01").partyType,"customer");

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
  assert.equal(read("documents/"+custody.id).status,"posted","employee custody approval must finalize its source document");
  assert.equal(read("documents/"+custody.id).journalId,custodyPosted.journalId,"the source document must link to the one posted journal");
  assert.equal(read("reviewQueue/"+custody.id),null,"employee custody must be removed from the review queue in the same transaction");
  assert.equal(read("sourceLocks/cash_"+custody.id).journalId,custodyPosted.journalId,"the source lock must point at the posted journal");
  const custodyLines=Object.values(read("partyLedger/employeeCustody/EMPLOYEE-01/2026-11")||{});
  assert.ok(custodyLines.some(x=>x.accountCode==="1220"&&x.debit===500),"employee custody is posted to control account 1220 and staff subledger");
  assert.ok(Object.keys(read("cashCustodies/EMPLOYEE-01/transactions")||{}).length>0,"custody handover appears in the existing personal cash-custody book");
  const custodyRowsAfterPost=Object.values(read("partyLedger/employeeCustody/EMPLOYEE-01/2026-11")||{}).length;
  write("documents/"+custody.id+"/status","pending_review");
  write("reviewQueue/"+custody.id,{id:custody.id,status:"pending_review",type:"cash"});
  const reconciled=await invoke("POST","",{action:"review",id:custody.id,decision:"approve",reason:"recover legacy partial posting"});
  assert.equal(reconciled.status,"posted");
  assert.equal(reconciled.reconciled,true,"a legacy source lock repairs a stale review state instead of reposting");
  assert.equal(reconciled.journalId,custodyPosted.journalId);
  assert.equal(read("documents/"+custody.id).status,"posted");
  assert.equal(read("reviewQueue/"+custody.id),null);
  assert.equal(Object.values(read("partyLedger/employeeCustody/EMPLOYEE-01/2026-11")||{}).length,custodyRowsAfterPost,"reconciliation must not duplicate party-ledger lines");

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



test("all cash and bank transfer postings remain balanced and synchronized with source documents", async () => {
  await invoke("GET","?resource=bootstrap");
  const movements = [
    {movementType:"other_receipt",amount:125.50,offsetAccountCode:"4200",description:"Other cash receipt transfer audit"},
    {movementType:"other_payment",amount:65.25,offsetAccountCode:"6100",description:"Other cash payment transfer audit"},
    {movementType:"cash_to_bank",amount:200,bankAccountCode:"1120",description:"Cash deposited to bank transfer audit"},
    {movementType:"bank_to_cash",amount:150,bankAccountCode:"1120",description:"Bank withdrawal to cash transfer audit"}
  ];
  for (const movement of movements) {
    const submitted=await invoke("POST","",{action:"submitCash",date:"2026-11-19",currency:"EGP",cashAccountCode:"1110",...movement});
    assert.equal(submitted.status,"pending_review",movement.movementType+" must first enter review");
    assert.ok(read("reviewQueue/"+submitted.id),"every cash movement must have a queue record");
    const approved=await invoke("POST","",{action:"review",id:submitted.id,decision:"approve",reason:"transfer workflow test"});
    assert.equal(approved.status,"posted",movement.movementType+" must be posted after approval");
    const document=read("documents/"+submitted.id),journal=read("journals/"+approved.journalId);
    assert.equal(document.status,"posted");
    assert.equal(document.journalId,approved.journalId);
    assert.equal(read("reviewQueue/"+submitted.id),null,"posted source document must leave the review queue");
    assert.equal(read("sourceLocks/cash_"+submitted.id).journalId,approved.journalId,"posted transfer must have one source lock");
    const debit=journal.lines.reduce((sum,line)=>sum+Number(line.debit||0),0);
    const credit=journal.lines.reduce((sum,line)=>sum+Number(line.credit||0),0);
    assert.equal(Math.round(debit*100),Math.round(credit*100),movement.movementType+" journal must balance to the cent");
    assert.equal(Math.round(debit*100),Math.round(Number(movement.amount)*100));
  }

  const imported=await invoke("POST","",{action:"submitBankImport",bankAccountCode:"1120",fileName:"bank-transfer-audit.csv",rows:[
    {date:"2026-11-19",amount:88.75,direction:"in",description:"Bank statement interest audit",reference:"BANK-AUDIT-20261119-01"}
  ]});
  assert.equal(imported.rows,1);
  const bankDocument=Object.values(read("documents")||{}).find(doc=>doc&&doc.importId===imported.importId);
  assert.ok(bankDocument,"imported bank row must create a source document");
  assert.equal(bankDocument.status,"pending_review");
  assert.ok(read("reviewQueue/"+bankDocument.id),"imported bank row must enter review");
  await invoke("POST","",{action:"setBankOffset",id:bankDocument.id,offsetAccountCode:"4200"});
  const bankApproved=await invoke("POST","",{action:"review",id:bankDocument.id,decision:"approve",reason:"bank import reconciliation test"});
  assert.equal(bankApproved.status,"posted");
  const bankJournal=read("journals/"+bankApproved.journalId);
  assert.ok(bankJournal.lines.some(line=>line.accountCode==="1120"&&line.debit===88.75),"bank receipt increases the bank asset account");
  assert.ok(bankJournal.lines.some(line=>line.accountCode==="4200"&&line.credit===88.75),"bank receipt credits the selected offset account");
  assert.equal(read("documents/"+bankDocument.id).status,"posted");
  assert.equal(read("reviewQueue/"+bankDocument.id),null);
  assert.equal(read("sourceLocks/bankLine_"+bankDocument.id).journalId,bankApproved.journalId);
  assert.equal(Math.round(bankJournal.lines.reduce((sum,line)=>sum+Number(line.debit||0),0)*100),Math.round(bankJournal.lines.reduce((sum,line)=>sum+Number(line.credit||0),0)*100));
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
  assert.equal(foreignInvoice.status,"pending_review","foreign-currency invoices are queued but blocked from posting until corrected");
  assert.ok(read("documents/"+foreignInvoice.id).errors.some(x=>x.includes("عملة أجنبية")));
  assert.ok(read("reviewQueue/"+foreignInvoice.id));
  assert.equal(read("documents/"+foreignInvoice.id).currency,"USD","original invoice currency is preserved until the user deliberately converts it");
});


test("first accounting start month migration preserves the earliest existing posted journal", async () => {
  write("settings/accountingStartMonth",null);
  write("journals/OLD-POSTED",{id:"OLD-POSTED",date:"2026-08-14",status:"posted",lines:[]});
  write("journals/PENDING",{id:"PENDING",date:"2026-07-01",status:"pending_review",lines:[]});
  await invoke("GET","?resource=bootstrap");
  assert.equal(read("settings/accountingStartMonth"),"2026-08","the first period includes all existing posted financial history");
});


test("master records support editing, safe code changes and protected deletion", async () => {
  const itemCode="ITEM-CRUD-TEST";
  await invoke("POST","",{action:"saveMaster",kind:"items",item:{code:itemCode,name:"Before edit",itemType:"stock",unit:"piece",warehouseCode:"default"}});
  assert.equal(read("items/"+itemCode).name,"Before edit");

  await invoke("POST","",{action:"saveMaster",kind:"items",originalCode:itemCode,item:{code:itemCode,name:"After edit",itemType:"stock",unit:"piece",warehouseCode:"default"}});
  assert.equal(read("items/"+itemCode).name,"After edit","editing a master record preserves its key and updates the data");

  write("documents/CRUD-ITEM-REFERENCE",{id:"CRUD-ITEM-REFERENCE",type:"invoice",lines:[{itemCode}]});
  await assert.rejects(
    invoke("POST","",{action:"saveMaster",kind:"items",originalCode:itemCode,item:{code:"ITEM-CRUD-RENAMED",name:"Renamed item",itemType:"stock",unit:"piece",warehouseCode:"default"}}),
    /لا يمكن تغيير الكود/
  );
  assert.ok(read("items/"+itemCode),"the original code remains available when historical documents reference it");
  assert.equal(read("items/ITEM-CRUD-RENAMED"),null,"a blocked code migration does not create a second item");

  const deleted=await invoke("POST","",{action:"deleteMaster",kind:"items",code:itemCode});
  assert.equal(deleted.deactivated,true,"a referenced item is deactivated instead of being physically deleted");
  assert.equal(read("items/"+itemCode).active,false);
  assert.equal(read("documents/CRUD-ITEM-REFERENCE").lines[0].itemCode,itemCode,"historical invoice references remain intact");

  await invoke("POST","",{action:"saveMaster",kind:"warehouses",item:{code:"WH-CRUD-UNUSED",name:"Unused warehouse"}});
  const removed=await invoke("POST","",{action:"deleteMaster",kind:"warehouses",code:"WH-CRUD-UNUSED"});
  assert.equal(removed.deleted,true,"an unused master record can be deleted");
  assert.equal(read("warehouses/WH-CRUD-UNUSED"),null);

  write("clients/CUS-CRUD-OLD",{code:"CUS-CRUD-OLD",name:"Old customer",partyType:"customer"});
  const changedParty=await invoke("POST","",{action:"saveMaster",kind:"parties",permissionModule:"master",originalCode:"CUS-CRUD-OLD",item:{code:"CUS-CRUD-NEW",name:"Updated customer",partyType:"customer"}});
  assert.equal(changedParty.item.code,"CUS-CRUD-NEW");
  assert.equal(read("clients/CUS-CRUD-OLD"),null,"the old CRM key is removed after a safe unused code change");
  assert.equal(read("clients/CUS-CRUD-NEW").name,"Updated customer");
  assert.equal(read("parties/CUS-CRUD-NEW").partyType,"customer","the finance party directory is updated together with the CRM record");

  write("projects/PRJ-CRUD-REFERENCE",{code:"PRJ-CRUD-REFERENCE",clientCodes:["CUS-CRUD-NEW"],events:{}});
  const partyDelete=await invoke("POST","",{action:"deleteMaster",kind:"parties",permissionModule:"master",code:"CUS-CRUD-NEW"});
  assert.equal(partyDelete.deactivated,true,"customer records referenced by projects are deactivated, not erased");
  assert.equal(read("clients/CUS-CRUD-NEW").active,false);
  assert.equal(read("projects/PRJ-CRUD-REFERENCE").clientCodes[0],"CUS-CRUD-NEW");
});


test("master imports upsert by code, keep blank columns unchanged and report no-op rows", async () => {
  write("costCenters/CC-UPSERT-01",{code:"CC-UPSERT-01",name:"Old Center",projectCode:"PRJ-OLD",active:false,createdAt:123});
  const updated = await invoke("POST","",{action:"importMasters",kind:"costCenters",rows:[{code:"CC-UPSERT-01",name:"New Center",projectCode:""}]});
  assert.equal(updated.updated,1);
  assert.equal(read("costCenters/CC-UPSERT-01").name,"New Center");
  assert.equal(read("costCenters/CC-UPSERT-01").projectCode,"PRJ-OLD","empty Excel columns preserve existing values");
  assert.equal(read("costCenters/CC-UPSERT-01").active,false,"existing inactive status is preserved");
  assert.equal(read("costCenters/CC-UPSERT-01").createdAt,123,"original creation metadata is preserved");
  const unchanged = await invoke("POST","",{action:"importMasters",kind:"costCenters",rows:[{code:"CC-UPSERT-01",name:"New Center",projectCode:""}]});
  assert.equal(unchanged.unchanged,1,"identical re-imports are counted but do not replace the record");
});

test("bulk master deletion deletes unused records and deactivates referenced records", async () => {
  write("items/BULK-DELETE-UNUSED",{code:"BULK-DELETE-UNUSED",name:"Unused item",itemType:"stock",active:true});
  write("items/BULK-DELETE-USED",{code:"BULK-DELETE-USED",name:"Used item",itemType:"stock",active:true});
  write("documents/BULK-DELETE-REFERENCE",{id:"BULK-DELETE-REFERENCE",type:"invoice",lines:[{itemCode:"BULK-DELETE-USED"}]});
  const result = await invoke("POST","",{action:"deleteMasters",kind:"items",codes:["BULK-DELETE-UNUSED","BULK-DELETE-USED"]});
  assert.equal(result.deleted,1);
  assert.equal(result.deactivated,1);
  assert.equal(result.failed,0);
  assert.equal(read("items/BULK-DELETE-UNUSED"),null,"unused records are physically removed");
  assert.equal(read("items/BULK-DELETE-USED").active,false,"referenced records are deactivated safely");
  assert.equal(read("documents/BULK-DELETE-REFERENCE").lines[0].itemCode,"BULK-DELETE-USED","historical document references are retained");
});

test("master permission cannot be used to edit or delete financial master records", async () => {
  write("items/SECURE-ITEM-001",{code:"SECURE-ITEM-001",name:"Protected item",itemType:"stock",active:true});
  const userProfile={uid:"test-user",role:"user",status:"active",fullName:"Master Data Test"};
  const userClaims={sub:userProfile.uid};
  const userPermissions={master:{add:true,edit:true,delete:true}};
  const userHasPermission=(_profile,moduleName,action)=>userPermissions[moduleName]?.[action]===true;
  const userRequirePermission=(_profile,moduleName,action)=>{
    if(!userHasPermission(_profile,moduleName,action))throw new Error("Permission denied: "+moduleName+"."+action+".");
  };
  const invokeAsUser=(method,path,body)=>invoke(method,path,body,{
    profile:userProfile,claims:userClaims,hasPermission:userHasPermission,requirePermission:userRequirePermission
  });
  await assert.rejects(
    invokeAsUser("POST","",{action:"saveMaster",kind:"items",permissionModule:"master",item:{code:"SECURE-ITEM-002",name:"Unauthorized item",itemType:"stock"}}),
    /Permission denied: financial_inventory.add/
  );
  await assert.rejects(
    invokeAsUser("POST","",{action:"deleteMaster",kind:"items",permissionModule:"master",code:"SECURE-ITEM-001"}),
    /Permission denied: financial_inventory.delete/
  );
  assert.ok(read("items/SECURE-ITEM-001"),"the protected financial master record must remain untouched");

  const party=await invokeAsUser("POST","",{action:"saveMaster",kind:"parties",permissionModule:"master",item:{code:"PERMITTED-CLIENT-001",name:"Permitted customer",partyType:"customer"}});
  assert.equal(party.success,true,"the master permission is still valid for customer/supplier records");
  assert.equal(read("clients/PERMITTED-CLIENT-001").name,"Permitted customer");
  const deleted=await invokeAsUser("POST","",{action:"deleteMaster",kind:"parties",permissionModule:"master",code:"PERMITTED-CLIENT-001"});
  assert.equal(deleted.deleted,true,"the master permission can delete an unused customer/supplier record");
});


test("invoice delegation and return use scoped RTDB writes and return-to-review queue is preserved", async () => {
  const invoiceId = "INV-DELEGATION-SCOPED-01";
  const assigneeUid = "finance-assignee-01";
  const ownerUid = claims.sub;
  const rootPatchCount = adminPatchRootCalls.length;
  write("chartOfAccounts/6100", {code:"6100",name:"مصروفات تشغيل",type:"expense",nature:"debit",active:true});
  write("parties/VENDOR-DELEGATION-01", {code:"VENDOR-DELEGATION-01",name:"Supplier Delegation",partyType:"vendor",active:true});
  write("users/" + assigneeUid, {uid:assigneeUid,status:"active",fullName:"Finance Assignee"});
  write("documents/" + invoiceId, {
    id:invoiceId,type:"invoice",invoiceType:"purchase",status:"draft",createdBy:ownerUid,
    createdByName:"Finance Test",number:"PUR-DELEGATION-01",date:"2026-11-19",
    partyId:"VENDOR-DELEGATION-01",partyName:"Supplier Delegation",currency:"EGP",
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}]
  });

  const assigned = await invoke("POST","",{
    action:"assignInvoice",invoiceId,assigneeUid,instruction:"استكمال تصنيف بنود الفاتورة"
  });
  assert.equal(assigned.success,true);
  assert.equal(assigned.status,"assigned");
  assert.equal(read("documents/" + invoiceId).status,"assigned");
  assert.equal(read("documents/" + invoiceId).assignedTo,assigneeUid);
  assert.equal(read("assignments/" + assigneeUid + "/" + assigned.assignmentId).status,"open");
  assert.equal(read("tasks/" + assigneeUid + "/" + assigned.taskId).kind,"financialAssignment");
  assert.equal(read("cashCustodyNotifications/" + assigneeUid + "/" + assigned.assignmentId).type,"financialAssignment");
  assert.equal(read("sentAssignments/" + ownerUid + "/" + assigned.assignmentId).status,"open","the sender's outgoing transfer is stored separately from the assignee inbox");
  const senderTransferList=await invoke("GET","?resource=assignments");
  assert.equal(senderTransferList.sentItems[0].id,assigned.assignmentId,"the creator can see the transfer in their outgoing transfers list");
  assert.ok(adminPatchRootAtCalls.some(call=>call.path==="tasks"));
  assert.ok(adminPatchRootAtCalls.some(call=>call.path==="cashCustodyNotifications"));
  assert.equal(adminPatchRootCalls.length,rootPatchCount,"assignment must not PATCH the RTDB root");

  const assigneeProfile={uid:assigneeUid,role:"user",status:"active",fullName:"Finance Assignee"};
  const completed = await invoke("POST","",{
    action:"completeInvoiceAssignment",assignmentId:assigned.assignmentId,
    lines:[{index:0,kind:"service",accountCode:"6100"}]
  },{profile:assigneeProfile,claims:{sub:assigneeUid}});
  assert.equal(completed.success,true);
  assert.equal(completed.status,"returned_to_creator");
  assert.equal(read("documents/" + invoiceId).status,"returned_to_creator");
  assert.equal(read("documents/" + invoiceId).assignedTo,null);
  assert.equal(read("documents/" + invoiceId).lines[0].accountCode,"6100");
  assert.equal(read("assignments/" + assigneeUid + "/" + assigned.assignmentId).status,"completed");
  const returnedTaskId=read("documents/" + invoiceId).returnedTaskId;
  assert.equal(read("tasks/" + ownerUid + "/" + returnedTaskId).kind,"financialAssignmentReturned");
  assert.equal(read("cashCustodyNotifications/" + ownerUid + "/" + returnedTaskId).type,"financialAssignmentReturned");
  assert.equal(read("sentAssignments/" + ownerUid + "/" + assigned.assignmentId).status,"returned_to_creator","returned work remains visible in the creator's sent transfers");
  assert.equal(adminPatchRootCalls.length,rootPatchCount,"returning the invoice must not PATCH the RTDB root");

  const resubmitted = await invoke("POST","",{
    action:"submitInvoice",id:invoiceId,type:"purchase",date:"2026-11-19",
    number:"PUR-DELEGATION-01",partyId:"VENDOR-DELEGATION-01",partyName:"Supplier Delegation",
    currency:"EGP",taxRate:0,taxAmount:0,
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}]
  });
  assert.equal(resubmitted.status,"pending_review");
  assert.equal(read("documents/" + invoiceId).status,"pending_review");
  assert.ok(read("reviewQueue/" + invoiceId),"resubmitted invoice must reappear in the review queue");
  assert.equal(read("tasks/" + ownerUid + "/" + returnedTaskId + "/status"),"completed");
  assert.equal(read("sentAssignments/" + ownerUid + "/" + assigned.assignmentId).status,"sent_for_review","a creator resubmission updates the outgoing transfer status");
  assert.equal(adminPatchRootCalls.length,rootPatchCount,"invoice resubmission must not PATCH the RTDB root");
});

test("delegated invoice can be sent straight to review and notifies every user with review approval rights", async () => {
  await invoke("GET","?resource=bootstrap");
  const ownerUid=claims.sub,assigneeUid="FIN-DIRECT-REVIEW-ASSIGNEE",reviewerUid="FIN-DIRECT-REVIEWER";
  write("users/"+assigneeUid,{uid:assigneeUid,status:"active",role:"user",fullName:"Assignee"});
  write("users/"+reviewerUid,{uid:reviewerUid,status:"active",role:"user",fullName:"Reviewer",permissions:{financial_review:{approve:true}}});
  write("parties/FIN-DIRECT-REVIEW-VENDOR",{code:"FIN-DIRECT-REVIEW-VENDOR",name:"Review Supplier",partyType:"vendor",active:true});
  write("chartOfAccounts/6100",{code:"6100",name:"مصروفات تشغيل",type:"expense",nature:"debit",active:true});
  const invoiceId="INV-DIRECT-REVIEW-001";
  write("documents/"+invoiceId,{
    id:invoiceId,type:"invoice",invoiceType:"purchase",status:"draft",createdBy:ownerUid,createdByName:"Owner",
    number:"PUR-DIRECT-REVIEW-001",date:"2026-11-19",partyId:"FIN-DIRECT-REVIEW-VENDOR",
    partyName:"Review Supplier",currency:"EGP",taxRate:0,taxAmount:0,
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:125}]
  });
  const assigned=await invoke("POST","",{action:"assignInvoice",invoiceId,assigneeUid,instruction:"راجع التصنيف"});
  const reviewerPermissions=(user,moduleId,action)=>moduleId==="financial_review"&&(action==="view"||action==="approve")&&user.uid===reviewerUid;
  const completed=await invoke("POST","",{
    action:"completeInvoiceAssignment",assignmentId:assigned.assignmentId,decision:"submit_for_review",
    lines:[{index:0,kind:"service",accountCode:"6100"}]
  },{profile:{uid:assigneeUid,role:"user",status:"active",fullName:"Assignee"},claims:{sub:assigneeUid},hasPermission:reviewerPermissions});
  assert.equal(completed.success,true);
  assert.equal(completed.status,"pending_review");
  assert.equal(completed.reviewersNotified,1);
  assert.equal(read("documents/"+invoiceId).status,"pending_review");
  assert.ok(read("reviewQueue/"+invoiceId),"the submitted delegated invoice enters the approval queue");
  assert.equal(read("assignments/"+assigneeUid+"/"+assigned.assignmentId).status,"completed");
  assert.equal(read("sentAssignments/"+ownerUid+"/"+assigned.assignmentId).status,"sent_for_review");
  assert.equal(read("tasks/"+assigneeUid+"/"+assigned.taskId+"/status"),"completed");
  const reviewerNotification=Object.values(read("cashCustodyNotifications/"+reviewerUid)||{}).find(item=>item&&item.type==="financialReviewRequired");
  assert.ok(reviewerNotification,"the authorized reviewer receives an in-app approval notification");
  assert.equal(reviewerNotification.invoiceId,invoiceId);
  assert.equal(reviewerNotification.read,false);
  assert.equal(completed.pushNotifications[0].recipientUid,reviewerUid,"the same reviewer is included in push delivery");
  const reviewList=await invoke("GET","?resource=review");
  assert.ok(reviewList.items[invoiceId]||reviewList.items.find?.(item=>item.id===invoiceId),"the submitted invoice is present in the review resource");
});

test("finance endpoints request screen-specific permission scopes", async () => {
  const seen=[];
  const requireScoped=(requestProfile,moduleId,action)=>{
    seen.push([moduleId,action]);
    if(moduleId!=="financial_assignments"||action!=="add")throw new Error("wrong permission scope: "+moduleId+"."+action);
    return true;
  };
  write("documents/INV-PERMISSION-SCOPE",{id:"INV-PERMISSION-SCOPE",type:"invoice",status:"draft",createdBy:claims.sub});
  write("users/finance-assignee-permission",{uid:"finance-assignee-permission",status:"active"});
  const result=await invoke("POST","",{
    action:"assignInvoice",invoiceId:"INV-PERMISSION-SCOPE",assigneeUid:"finance-assignee-permission"
  },{requirePermission:requireScoped});
  assert.equal(result.status,"assigned");
  assert.deepEqual(seen[0],["financial_assignments","add"]);
});


function assertNoOverlappingPaths(updates){
  const paths=Object.keys(updates||{});
  for(let i=0;i<paths.length;i++)for(let j=0;j<paths.length;j++){
    if(i!==j&&paths[j].startsWith(paths[i]+"/")){
      assert.fail("Overlapping Firebase PATCH paths: "+paths[i]+" and "+paths[j]);
    }
  }
}

test("forwarded invoices preserve full details and attachments through a multi-user chain before review", async () => {
  await invoke("GET","?resource=bootstrap");
  const ownerUid=claims.sub,firstUid="FIN-FORWARD-FIRST",secondUid="FIN-FORWARD-SECOND",thirdUid="FIN-FORWARD-THIRD",reviewerUid="FIN-FORWARD-REVIEWER";
  const invoiceId="INV-FORWARD-CHAIN-001";
  write("users/"+firstUid,{uid:firstUid,status:"active",role:"user",fullName:"First Assignee"});
  write("users/"+secondUid,{uid:secondUid,status:"active",role:"user",fullName:"Second Assignee"});
  write("users/"+thirdUid,{uid:thirdUid,status:"active",role:"user",fullName:"Third Assignee"});
  write("users/"+reviewerUid,{uid:reviewerUid,status:"active",role:"user",fullName:"Reviewer",permissions:{financial_review:{view:true,approve:true,edit:true}}});
  write("parties/FIN-FORWARD-VENDOR",{code:"FIN-FORWARD-VENDOR",name:"Forward Supplier",partyType:"vendor",active:true});
  write("chartOfAccounts/6100",{code:"6100",name:"مصروفات تشغيل",type:"expense",nature:"debit",active:true});
  write("documents/"+invoiceId,{
    id:invoiceId,type:"invoice",invoiceType:"purchase",status:"draft",createdBy:ownerUid,createdByName:"Owner",
    number:"13672",date:"2026-11-19",partyId:"FIN-FORWARD-VENDOR",partyName:"Forward Supplier",
    currency:"EGP",taxCode:"",taxRate:14,taxAmount:"",discount:0,
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100,discount:0}],
    attachments:{"ATT-FORWARD-01":{id:"ATT-FORWARD-01",fileName:"13672.pdf",mimeType:"application/pdf",size:4096}}
  });

  const assigned=await invoke("POST","",{action:"assignInvoice",invoiceId,assigneeUid:firstUid,instruction:"استكمال بيانات الفاتورة"});
  assert.equal(assigned.status,"assigned");

  const forwardPatchStart=adminPatchCalls.length;
  const forwarded=await invoke("POST","",{
    action:"forwardInvoiceAssignment",assignmentId:assigned.assignmentId,nextAssigneeUid:secondUid,
    instruction:"مراجعة الضريبة واستكمال البيانات",
    invoice:{invoiceType:"purchase",date:"2026-11-19",number:"13672",partyId:"FIN-FORWARD-VENDOR",partyName:"Forward Supplier",partyTaxNumber:"329566725",currency:"EGP",taxCode:"",taxRate:14,taxAmount:"",discount:0,projectCode:""}
  },{
    profile:{uid:firstUid,role:"user",status:"active",fullName:"First Assignee"},
    claims:{sub:firstUid}
  });
  assert.equal(forwarded.status,"assigned");
  const nextAssignmentId=forwarded.nextAssignmentId;
  const currentInvoice=read("documents/"+invoiceId);
  assert.equal(currentInvoice.assignedTo,secondUid);
  assert.equal(currentInvoice.number,"13672");
  assert.equal(currentInvoice.partyTaxNumber,"329566725");
  assert.equal(currentInvoice.attachments["ATT-FORWARD-01"].fileName,"13672.pdf","the original attachment metadata stays linked to the same invoice");
  assert.equal(currentInvoice.assignmentChain.length,2,"both the original transfer and onward transfer remain in the chain");
  assert.equal(read("assignments/"+firstUid+"/"+assigned.assignmentId).status,"forwarded");
  assert.equal(read("assignments/"+secondUid+"/"+nextAssignmentId).status,"open");
  assert.equal(read("tasks/"+firstUid+"/"+assigned.taskId+"/status"),"completed");
  assert.equal(read("tasks/"+secondUid+"/"+read("assignments/"+secondUid+"/"+nextAssignmentId).taskId).kind,"financialAssignment");
  assert.equal(read("cashCustodyNotifications/"+secondUid+"/"+nextAssignmentId).type,"financialAssignment");

  const secondInbox=await invoke("GET","?resource=assignments",{},{
    profile:{uid:secondUid,role:"user",status:"active",fullName:"Second Assignee"},
    claims:{sub:secondUid}
  });
  assert.equal(secondInbox.items[0].invoice.taxRate,14);
  assert.equal(secondInbox.items[0].invoice.attachments["ATT-FORWARD-01"].fileName,"13672.pdf");

  const forwardedPatch=adminPatchCalls.slice(forwardPatchStart).find(patch=>Object.prototype.hasOwnProperty.call(patch,"documents/"+invoiceId));
  assert.ok(forwardedPatch,"forwarding writes the full invoice once");
  assertNoOverlappingPaths(forwardedPatch);

  await assert.rejects(
    invoke("POST","",{
      action:"forwardInvoiceAssignment",assignmentId:nextAssignmentId,nextAssigneeUid:firstUid,
      instruction:"محاولة إعادة الفاتورة إلى المرسل المباشر"
    },{
      profile:{uid:secondUid,role:"user",status:"active",fullName:"Second Assignee"},
      claims:{sub:secondUid}
    }),
    /غير المستخدم الذي أحال إليك/
  );

  const secondForwardPatchStart=adminPatchCalls.length;
  const forwardedToThird=await invoke("POST","",{
    action:"forwardInvoiceAssignment",assignmentId:nextAssignmentId,nextAssigneeUid:thirdUid,
    instruction:"استكمال المراجعة النهائية",
    invoice:{invoiceType:"purchase",date:"2026-11-19",number:"13672",partyId:"FIN-FORWARD-VENDOR",partyName:"Forward Supplier",partyTaxNumber:"329566725",currency:"EGP",taxCode:"",taxRate:14,taxAmount:"",discount:0,projectCode:""}
  },{
    profile:{uid:secondUid,role:"user",status:"active",fullName:"Second Assignee"},
    claims:{sub:secondUid}
  });
  assert.equal(forwardedToThird.status,"assigned");
  const thirdAssignmentId=forwardedToThird.nextAssignmentId;
  assert.equal(read("documents/"+invoiceId).assignedTo,thirdUid);
  assert.equal(read("documents/"+invoiceId).assignmentChain.length,3,"the handoff history records the originator and every assigned user");
  assert.equal(read("assignments/"+secondUid+"/"+nextAssignmentId).status,"forwarded");
  assert.equal(read("assignments/"+thirdUid+"/"+thirdAssignmentId).status,"open");
  assert.equal(read("cashCustodyNotifications/"+thirdUid+"/"+thirdAssignmentId).type,"financialAssignment");
  const secondForwardPatch=adminPatchCalls.slice(secondForwardPatchStart).find(patch=>Object.prototype.hasOwnProperty.call(patch,"documents/"+invoiceId));
  assert.ok(secondForwardPatch,"the second handoff writes the full invoice once");
  assertNoOverlappingPaths(secondForwardPatch);

  const thirdInbox=await invoke("GET","?resource=assignments",{},{
    profile:{uid:thirdUid,role:"user",status:"active",fullName:"Third Assignee"},
    claims:{sub:thirdUid}
  });
  assert.equal(thirdInbox.items[0].invoice.attachments["ATT-FORWARD-01"].fileName,"13672.pdf");
  assert.equal(thirdInbox.items[0].invoice.partyTaxNumber,"329566725");

  const completePatchStart=adminPatchCalls.length;
  const completed=await invoke("POST","",{
    action:"completeInvoiceAssignment",assignmentId:thirdAssignmentId,decision:"submit_for_review",
    invoice:{invoiceType:"purchase",date:"2026-11-19",number:"13672",partyId:"FIN-FORWARD-VENDOR",partyName:"Forward Supplier",partyTaxNumber:"329566725",currency:"EGP",taxCode:"",taxRate:14,taxAmount:"",discount:0},
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100,discount:0}]
  },{
    profile:{uid:thirdUid,role:"user",status:"active",fullName:"Third Assignee"},
    claims:{sub:thirdUid}
  });
  assert.equal(completed.status,"pending_review","the third user can send an incomplete invoice to review");
  assert.ok(read("reviewQueue/"+invoiceId));
  assert.equal(read("documents/"+invoiceId).taxCode,"VAT-IN-14","completed delegated invoices also receive the fixed input VAT code");
  assert.equal(read("documents/"+invoiceId).taxRate,14);
  assert.ok(!read("documents/"+invoiceId).errors.some(error=>error.includes("كود ضريبي")),"the fixed VAT code is already available when the invoice reaches review");
  assert.equal(read("documents/"+invoiceId).attachments["ATT-FORWARD-01"].fileName,"13672.pdf");
  const completedPatch=adminPatchCalls.slice(completePatchStart).find(patch=>Object.prototype.hasOwnProperty.call(patch,"documents/"+invoiceId));
  assert.ok(completedPatch,"completion writes the full invoice once");
  assertNoOverlappingPaths(completedPatch);

  const reviewerProfile={uid:reviewerUid,role:"user",status:"active",fullName:"Reviewer"};
  const corrected=await invoke("POST","",{
    action:"updateReviewInvoice",id:invoiceId,
    invoice:{invoiceType:"purchase",date:"2026-11-19",number:"13672",partyId:"FIN-FORWARD-VENDOR",partyName:"Forward Supplier",partyTaxNumber:"329566725",currency:"EGP",taxCode:"VAT-IN-14",taxType:"vat_input",taxRate:14,taxAmount:"",discount:0},
    lines:[{description:"Maintenance service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100,discount:0}]
  },{profile:reviewerProfile,claims:{sub:reviewerUid}});
  assert.deepEqual(corrected.errors,[],"the reviewer can select the missing active input VAT code and clear the error");
  const approved=await invoke("POST","",{action:"review",id:invoiceId,decision:"approve"},{profile:reviewerProfile,claims:{sub:reviewerUid}});
  assert.equal(approved.status,"posted");
  assert.equal(read("documents/"+invoiceId).status,"posted");
});

test("journal edit and delete permissions work for any manual journal and clean posted ledgers", async () => {
  await invoke("GET","?resource=bootstrap");
  const draft=await invoke("POST","",{
    action:"submitJournal",date:"2026-11-19",description:"Permission journal test",reference:"PERM-JRN-01",
    lines:[{accountCode:"6100",debit:100,credit:0,description:"Before edit"},{accountCode:"1110",debit:0,credit:100,description:"Cash"}]
  });
  assert.equal(draft.status,"pending_review");
  const approved=await invoke("POST","",{action:"review",id:draft.id,decision:"approve",reason:"test approval"});
  assert.equal(approved.status,"posted");
  assert.equal(read("ledger/6100/2026-11/"+draft.id+"_1").debit,100);

  const editCalls=[];
  const editPermission=(_profile,moduleId,action)=>{
    editCalls.push([moduleId,action]);
    if(moduleId!=="financial_journal"||action!=="edit")throw new Error("wrong journal edit permission scope");
    return true;
  };
  const edited=await invoke("POST","",{
    action:"submitJournal",id:draft.id,date:"2026-11-19",description:"Permission journal test — edited",
    reference:"PERM-JRN-01",lines:[{accountCode:"6200",debit:125,credit:0,description:"After edit"},{accountCode:"1110",debit:0,credit:125,description:"Cash"}]
  },{
    profile:{uid:"FIN-JOURNAL-EDITOR",role:"user",status:"active",fullName:"Journal Editor"},
    claims:{sub:"FIN-JOURNAL-EDITOR"},requirePermission:editPermission
  });
  assert.equal(edited.status,"posted");
  assert.deepEqual(editCalls[0],["financial_journal","edit"]);
  assert.equal(read("ledger/6100/2026-11/"+draft.id+"_1"),null,"editing removes the old account row");
  assert.equal(read("ledger/6200/2026-11/"+draft.id+"_1").debit,125,"editing recreates the ledger row with the new account and amount");
  assert.equal(read("ledger/1110/2026-11/"+draft.id+"_2").credit,125);

  const deleteCalls=[];
  const deletePermission=(_profile,moduleId,action)=>{
    deleteCalls.push([moduleId,action]);
    if(moduleId!=="financial_journal"||action!=="delete")throw new Error("wrong journal delete permission scope");
    return true;
  };
  const removed=await invoke("POST","",{action:"deleteJournal",id:draft.id},{
    profile:{uid:"FIN-JOURNAL-DELETE",role:"user",status:"active",fullName:"Journal Deleter"},
    claims:{sub:"FIN-JOURNAL-DELETE"},requirePermission:deletePermission
  });
  assert.equal(removed.deleted,true);
  assert.deepEqual(deleteCalls[0],["financial_journal","delete"]);
  assert.equal(read("journals/"+draft.id),null);
  assert.equal(read("documents/"+draft.id),null);
  assert.equal(read("periods/2026-11/entries/"+draft.id),null);
  assert.equal(read("ledger/6200/2026-11/"+draft.id+"_1"),null);
  assert.equal(read("ledger/1110/2026-11/"+draft.id+"_2"),null);
});

test("invoice drafts can be deleted and review invoices can be safely cancelled", async () => {
  await invoke("GET","?resource=bootstrap");
  const draft=await invoke("POST","",{action:"saveInvoiceDraft",type:"purchase",date:"2026-11-19",number:"PUR-DELETE-01",partyId:"",lines:[{description:"Draft item",kind:"stock",itemCode:"",quantity:1,unitPrice:10}]});
  assert.equal(draft.status,"draft");
  const removed=await invoke("POST","",{action:"deleteInvoice",id:draft.id,reason:"wrong upload"});
  assert.equal(removed.status,"deleted");
  assert.equal(removed.deleted,true);
  assert.equal(read("documents/"+draft.id+"/status"),"deleted");
  assert.equal(read("reviewQueue/"+draft.id),null);

  write("vendors/VENDOR-CANCEL-01",{code:"VENDOR-CANCEL-01",name:"Cancel Supplier",partyType:"vendor"});
  write("parties/VENDOR-CANCEL-01",{code:"VENDOR-CANCEL-01",name:"Cancel Supplier",partyType:"vendor"});
  const pending=await invoke("POST","",{action:"submitInvoice",type:"purchase",date:"2026-11-19",number:"PUR-CANCEL-01",partyId:"VENDOR-CANCEL-01",partyName:"Cancel Supplier",currency:"EGP",lines:[{description:"Service",kind:"service",accountCode:"6100",quantity:1,unitPrice:100}]});
  assert.equal(pending.status,"pending_review");
  assert.ok(read("reviewQueue/"+pending.id));
  const cancelled=await invoke("POST","",{action:"deleteInvoice",id:pending.id,reason:"uploaded by mistake"});
  assert.equal(cancelled.status,"cancelled");
  assert.equal(read("documents/"+pending.id+"/status"),"cancelled");
  assert.equal(read("reviewQueue/"+pending.id),null);
  await assert.rejects(invoke("POST","",{action:"deleteInvoice",id:pending.id}),/حالتها الحالية/);
});


test("project accounting events create review journals and only affect ledgers after approval", async () => {
  await invoke("GET","?resource=bootstrap");
  const projectCode="PRJ-EVENT-ACCOUNTING-01",vendorCode="VENDOR-PROJECT-01";
  write("projects/"+projectCode,{code:projectCode,name:"Project Event Accounting",vendorCodes:[vendorCode],clientCodes:[]});
  write("vendors/"+vendorCode,{code:vendorCode,name:"Project Supplier",taxNumber:"123",status:"active"});
  write("partyLedger/vendor/"+vendorCode+"/2026-11/opening",{journalId:"OPENING-PROJECT-VENDOR",accountCode:"281",debit:0,credit:1000});
  await invoke("GET","?resource=bootstrap");
  assert.ok(read("costCenters/"+projectCode),"the project code is mirrored to the financial cost center master");

  const submitted=await invoke("POST","",{action:"submitProjectEvent",projectCode,event:{
    id:"EVT-SUPPLIER-PAYMENT-01",actionCode:"supplier_payment",actionName:"تسليم شيك للمورد",
    date:"2026-11-19",partyType:"vendor",partyCode:"",amount:250,settledAmount:250,
    currency:"EGP",paymentMethod:"cheque",referenceNo:"CHQ-001",status:"full",note:"Cheque handover"
  }});
  assert.equal(submitted.success,true);
  assert.equal(submitted.accountingImpact,true);
  assert.equal(submitted.accountingStatus,"pending_review");
  assert.ok(read("reviewQueue/"+submitted.journalId),"the project journal is sent to review automatically");
  assert.equal(read("documents/"+submitted.journalId).status,"pending_review");
  assert.equal(read("documents/"+submitted.journalId).sourceType,"projectEvent");
  assert.equal(read("documents/"+submitted.journalId).lines[0].costCenterId,projectCode);
  assert.equal(read("projects/"+projectCode+"/events/EVT-SUPPLIER-PAYMENT-01/partyCode"),vendorCode,"the single vendor linked to the project is inferred automatically");
  assert.equal(read("documents/"+submitted.journalId).lines[1].accountCode,"2140","an issued cheque credits outstanding cheques, not the bank account");
  assert.equal(read("ledger/281/2026-11/"+submitted.journalId+"_1"),null,"a proposed journal does not change the ledger before approval");

  const approved=await invoke("POST","",{action:"review",id:submitted.journalId,decision:"approve",reason:"Project cheque approved"});
  assert.equal(approved.status,"posted");
  assert.ok(read("ledger/281/2026-11/"+submitted.journalId+"_1"),"approval posts the payable line");
  assert.ok(read("costLedger/"+projectCode+"/2026-11/"+submitted.journalId+"_1"),"approval posts the cost-center line");
  assert.equal(read("projects/"+projectCode+"/events/EVT-SUPPLIER-PAYMENT-01/accountingStatus"),"posted");
  assert.equal(read("projects/"+projectCode+"/events/EVT-SUPPLIER-PAYMENT-01/accountingJournalId"),submitted.journalId);

  const note=await invoke("POST","",{action:"submitProjectEvent",projectCode,event:{
    id:"EVT-GENERAL-NOTE-01",actionCode:"general_note",actionName:"زيارة موقع",
    date:"2026-11-19",partyType:"",partyCode:"",amount:0,currency:"EGP",status:"completed",note:"Non-financial activity"
  }});
  assert.equal(note.accountingImpact,false);
  assert.equal(note.accountingStatus,"not_applicable");
  assert.equal(note.journalId,"");
  assert.equal(read("reviewQueue/EVT-GENERAL-NOTE-01"),null,"a non-financial project event does not create a review journal");
});

test("reviewers can edit project-event journals before posting", async () => {
  await invoke("GET","?resource=bootstrap");
  const projectCode="PRJ-REVIEW-JOURNAL-01";
  write("projects/"+projectCode,{code:projectCode,name:"Journal Edit Project"});
  await invoke("GET","?resource=bootstrap");
  const journalId="PRJ-JRN-REVIEW-EDIT-01";
  const journal={id:journalId,type:"journal",sourceType:"projectEvent",sourceId:projectCode+"--EVT-01",projectCode,
    date:"2026-11-19",description:"Project event draft",reference:"EVT-01",currency:"EGP",status:"pending_review",
    lines:[{accountCode:"6100",debit:100,credit:0,description:"Initial",costCenterId:projectCode,projectCode},{accountCode:"1110",debit:0,credit:100,description:"Cash",costCenterId:projectCode,projectCode}]};
  write("documents/"+journalId,journal);
  write("reviewQueue/"+journalId,{id:journalId,documentId:journalId,type:"journal",status:"pending_review"});
  const result=await invoke("POST","",{action:"updateReviewJournal",id:journalId,
    journal:{date:"2026-11-19",description:"Corrected project event",reference:"EVT-EDIT"},
    lines:[{accountCode:"6200",debit:125,credit:0,description:"Corrected expense",costCenterId:projectCode,projectCode},{accountCode:"1110",debit:0,credit:125,description:"Cash",costCenterId:projectCode,projectCode}]});
  assert.equal(result.status,"pending_review");
  assert.deepEqual(result.errors,[]);
  assert.equal(read("documents/"+journalId+"/description"),"Corrected project event");
  assert.equal(read("documents/"+journalId+"/lines/0/accountCode"),"6200");
  assert.ok(read("reviewQueue/"+journalId),"the edited source journal remains in review");
  assert.equal(read("ledger/6200/2026-11/"+journalId+"_1"),null,"editing a review journal does not post it");
});

test("daily journals can be reversed through review and unposted entries can be cancelled", async () => {
  await invoke("GET","?resource=bootstrap");
  const postedDraft=await invoke("POST","",{action:"submitJournal",date:"2026-11-19",description:"Original journal to reverse",reference:"REV-ORIGINAL-01",
    lines:[{accountCode:"6100",debit:300,credit:0,description:"Expense"},{accountCode:"1110",debit:0,credit:300,description:"Cash"}]});
  const posted=await invoke("POST","",{action:"review",id:postedDraft.id,decision:"approve",reason:"Approve original"});
  assert.equal(posted.status,"posted");
  const reversal=await invoke("POST","",{action:"reverseJournal",id:postedDraft.id});
  assert.equal(reversal.status,"pending_review");
  assert.equal(read("documents/"+reversal.id+"/lines/0/debit"),0);
  assert.equal(read("documents/"+reversal.id+"/lines/0/credit"),300);
  assert.equal(read("ledger/6100/2026-11/"+reversal.id+"_1"),null,"the reversal has no ledger effect before review");
  const reversed=await invoke("POST","",{action:"review",id:reversal.id,decision:"approve",reason:"Approve reversal"});
  assert.equal(reversed.status,"posted");
  assert.equal(read("journals/"+postedDraft.id+"/reversedByJournalId"),reversal.id);
  assert.equal(read("ledger/6100/2026-11/"+postedDraft.id+"_1").debit,300);
  assert.equal(read("ledger/6100/2026-11/"+reversal.id+"_1").credit,300);

  const draft=await invoke("POST","",{action:"submitJournal",date:"2026-11-19",description:"Journal to cancel",reference:"REV-CANCEL-01",
    lines:[{accountCode:"6100",debit:50,credit:0,description:"Expense"},{accountCode:"1110",debit:0,credit:50,description:"Cash"}]});
  assert.equal(draft.status,"pending_review");
  const cancelled=await invoke("POST","",{action:"cancelJournal",id:draft.id,reason:"Entered in error"});
  assert.equal(cancelled.status,"cancelled");
  assert.equal(read("reviewQueue/"+draft.id),null);
  assert.equal(read("documents/"+draft.id+"/status"),"cancelled");
});

test("a transferred invoice recipient can cancel the assigned invoice and close its task", async () => {
  await invoke("GET","?resource=bootstrap");
  const invoiceId="INV-ASSIGNED-CANCEL-01",recipientUid="FIN-CANCEL-RECIPIENT";
  write("users/"+recipientUid,{uid:recipientUid,status:"active",role:"user",fullName:"Invoice Recipient"});
  write("documents/"+invoiceId,{id:invoiceId,type:"invoice",invoiceType:"purchase",status:"draft",createdBy:claims.sub,createdByName:"Finance Test",number:"CANCEL-01",date:"2026-11-19",partyId:"VENDOR-X",partyName:"Supplier",currency:"EGP",lines:[]});
  const assigned=await invoke("POST","",{action:"assignInvoice",invoiceId,assigneeUid:recipientUid,instruction:"Review invoice"});
  const result=await invoke("POST","",{action:"deleteInvoice",id:invoiceId,reason:"Wrong invoice uploaded"},{
    profile:{uid:recipientUid,role:"user",status:"active",fullName:"Invoice Recipient"},
    claims:{sub:recipientUid}
  });
  assert.equal(result.status,"cancelled");
  assert.equal(read("documents/"+invoiceId+"/status"),"cancelled");
  assert.equal(read("assignments/"+recipientUid+"/"+assigned.assignmentId+"/status"),"cancelled");
  assert.equal(read("tasks/"+recipientUid+"/"+assigned.taskId+"/status"),"completed");
});


test("incoming cheques use a clearing account then transfer to bank on collection", async () => {
  await invoke("GET","?resource=bootstrap");
  const projectCode="PRJ-INCOMING-CHEQUE-01",customerCode="CUSTOMER-CHEQUE-01";
  write("projects/"+projectCode,{code:projectCode,name:"Incoming Cheque Project",clientCodes:[customerCode],vendorCodes:[]});
  write("clients/"+customerCode,{code:customerCode,name:"Cheque Customer",status:"active"});
  write("partyLedger/customer/"+customerCode+"/2026-11/opening",{journalId:"OPENING-CHEQUE-CUSTOMER",accountCode:"1210",debit:1000,credit:0});
  await invoke("GET","?resource=bootstrap");

  const received=await invoke("POST","",{action:"submitProjectEvent",projectCode,event:{
    id:"EVT-IN-CHEQUE-01",actionCode:"cheque_received",actionName:"استلام شيك",
    date:"2026-11-19",partyType:"client",amount:400,settledAmount:400,currency:"EGP",
    paymentMethod:"cheque",referenceNo:"CHQ-IN-01",status:"full"
  }});
  assert.equal(received.accountingStatus,"pending_review");
  const receivedJournal=read("documents/"+received.journalId);
  assert.ok(receivedJournal.lines.some(line=>line.accountCode==="1130"&&line.debit===400),"incoming cheque is recorded under cheques in collection");
  assert.ok(receivedJournal.lines.some(line=>line.accountCode==="1210"&&line.credit===400),"customer receivable is reduced");
  await invoke("POST","",{action:"review",id:received.journalId,decision:"approve",reason:"Accept customer cheque"});
  assert.ok(read("ledger/1130/2026-11/"+received.journalId+"_1"));

  const cleared=await invoke("POST","",{action:"submitProjectEvent",projectCode,event:{
    id:"EVT-CLEAR-CHEQUE-01",actionCode:"cheque_cleared_in",actionName:"تحصيل الشيك بالبنك",
    date:"2026-11-19",partyType:"client",partyCode:customerCode,amount:400,settledAmount:400,
    currency:"EGP",paymentMethod:"bank_transfer",referenceNo:"CHQ-IN-01",status:"full"
  }});
  const clearedJournal=read("documents/"+cleared.journalId);
  assert.ok(clearedJournal.lines.some(line=>line.accountCode==="1120"&&line.debit===400),"clearing moves the amount into bank");
  assert.ok(clearedJournal.lines.some(line=>line.accountCode==="1130"&&line.credit===400),"clearing removes the cheque from transit");
  await invoke("POST","",{action:"review",id:cleared.journalId,decision:"approve",reason:"Bank cleared"});
  assert.ok(read("ledger/1120/2026-11/"+cleared.journalId+"_1"));
});


test("cash custody recovery sync creates a missing review journal once and reports retries as existing", async () => {
  await invoke("GET","?resource=bootstrap");
  const ownerUid="CUSTODY-RECOVERY-OWNER",transactionId="CUSTODY-RECOVERY-01";
  write("users/"+ownerUid,{uid:ownerUid,status:"active",role:"user",fullName:"Recovery Employee"});
  write("cashCustodies/"+ownerUid+"/transactions/"+transactionId,{
    id:transactionId,ownerUid,bookScope:"personal",type:"expense",amount:87.5,currency:"EGP",
    date:"2026-11-19",description:"Previously saved custody movement",status:"pending",
    financialReviewStatus:"blocked",createdBy:ownerUid,createdByName:"Recovery Employee"
  });

  const first=await invoke("POST","",{action:"syncCashCustodyJournals",ownerUid,transactions:[{id:transactionId}]});
  assert.equal(first.failed,0);
  assert.equal(first.created,1);
  const journalId=read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialDocumentId");
  assert.ok(journalId,"recovery sync links the previously saved custody transaction");
  write("projects/PRJ-CUSTODY-REVIEW",{code:"PRJ-CUSTODY-REVIEW",name:"Custody Review Project"});
  write("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/projectCode","PRJ-CUSTODY-REVIEW");
  const detailed=await invoke("GET","?resource=document&id="+encodeURIComponent(journalId));
  assert.equal(detailed.item.lines.length,2,"review detail returns the complete accounting journal");
  assert.equal(detailed.sourceDetails.kind,"cashCustody","journal detail includes the original custody movement");
  assert.equal(detailed.sourceDetails.employeeName,"Recovery Employee");
  assert.equal(detailed.sourceDetails.amount,87.5);
  assert.equal(detailed.sourceDetails.projectName,"Custody Review Project");
  assert.ok(read("reviewQueue/"+journalId),"recovered journal appears in the financial review queue");
  assert.equal(read("documents/"+journalId+"/status"),"pending_review");
  assert.equal(read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialReviewStatus"),"pending_review");
  assert.equal(read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialReviewError"),null,"a successful retry clears the previous sync error");

  const retry=await invoke("POST","",{action:"syncCashCustodyJournals",ownerUid,transactions:[{id:transactionId}]});
  assert.equal(retry.failed,0);
  assert.equal(retry.created,0,"retrying an already-linked journal must not be counted as a new journal");
  assert.equal(read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialDocumentId"),journalId);
  assert.ok(read("reviewQueue/"+journalId),"the same journal remains in the review queue");
});

test("personal custody movements create a single accounting review journal and approve paired books together", async () => {
  await invoke("GET","?resource=bootstrap");
  const ownerUid="CUSTODY-EMPLOYEE-01",projectCode="PRJ-CUSTODY-ACCOUNTING-01",transactionId="CUSTODY-EXPENSE-01",mirrorId="CUSTODY-COMPANY-MIRROR-01";
  write("users/"+ownerUid,{uid:ownerUid,status:"active",role:"user",fullName:"Custody Employee"});
  write("projects/"+projectCode,{code:projectCode,name:"Custody Project"});
  write("cashCustodies/"+ownerUid+"/transactions/"+transactionId,{
    id:transactionId,ownerUid,bookScope:"personal",type:"expense",amount:125,currency:"EGP",
    date:"2026-11-19",description:"Project field expense",projectCode,status:"approved",
    linkedOwnerUid:"test-admin",linkedTransactionId:mirrorId,pairRole:"origin",createdBy:ownerUid,createdByName:"Custody Employee"
  });
  write("cashCustodies/test-admin/transactions/"+mirrorId,{
    id:mirrorId,ownerUid:"test-admin",bookScope:"company",type:"receipt",amount:125,currency:"EGP",
    date:"2026-11-19",description:"Linked employee custody",projectCode,status:"approved",
    linkedOwnerUid:ownerUid,linkedTransactionId:transactionId,pairRole:"counterparty"
  });
  await invoke("GET","?resource=bootstrap");

  const result=await invoke("POST","",{action:"submitCashCustodyJournal",ownerUid,transactionId});
  assert.equal(result.status,"pending_review");
  assert.ok(read("reviewQueue/"+result.id),"personal custody journal appears in financial review");
  assert.equal(read("documents/"+result.id+"/sourceType"),"cashCustody");
  assert.equal(read("documents/"+result.id+"/lines/0/costCenterId"),projectCode);
  assert.equal(read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/status"),"pending");
  assert.equal(read("cashCustodies/test-admin/transactions/"+mirrorId+"/status"),"pending");
  assert.equal(read("ledger/6100/2026-11/"+result.id+"_1"),null,"custody movement cannot affect ledger before review");

  const approved=await invoke("POST","",{action:"review",id:result.id,decision:"approve",reason:"Approve custody expense"});
  assert.equal(approved.status,"posted");
  assert.ok(read("ledger/6100/2026-11/"+result.id+"_1"));
  assert.ok(read("partyLedger/employeeCustody/"+ownerUid+"/2026-11/"+result.id+"_2"));
  assert.equal(read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/status"),"approved");
  assert.equal(read("cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialReviewStatus"),"posted");
  assert.equal(read("cashCustodies/test-admin/transactions/"+mirrorId+"/status"),"approved");
  assert.equal(read("cashCustodies/test-admin/transactions/"+mirrorId+"/financialReviewStatus"),"posted");
});
