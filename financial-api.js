export const DEFAULT_FINANCE_ACCOUNTS = [
{code:"1",name:"الأصول",type:"asset",nature:"debit",isGroup:true},
{code:"11",name:"الأصول المتداولة",type:"asset",nature:"debit",isGroup:true,parentCode:"1"},
{code:"1110",name:"الخزينة",type:"asset",nature:"debit",parentCode:"11",isControl:true},
{code:"1120",name:"البنوك",type:"asset",nature:"debit",parentCode:"11",isControl:true},
{code:"1210",name:"العملاء",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"customer"},
{code:"1300",name:"المخزون",type:"asset",nature:"debit",parentCode:"11",isControl:true},
{code:"1410",name:"ضريبة القيمة المضافة - مدخلات",type:"asset",nature:"debit",parentCode:"11"},
{code:"2",name:"الالتزامات",type:"liability",nature:"credit",isGroup:true},
{code:"21",name:"الالتزامات المتداولة",type:"liability",nature:"credit",isGroup:true,parentCode:"2"},
{code:"281",name:"الموردون",type:"liability",nature:"credit",parentCode:"21",isControl:true,subledgerType:"vendor"},
{code:"2110",name:"ضريبة القيمة المضافة - مخرجات",type:"liability",nature:"credit",parentCode:"21"},
{code:"2120",name:"ضرائب الخصم والإضافة المستحقة",type:"liability",nature:"credit",parentCode:"21"},
{code:"3",name:"حقوق الملكية",type:"equity",nature:"credit",isGroup:true},
{code:"3100",name:"رأس المال والأرصدة الافتتاحية",type:"equity",nature:"credit",parentCode:"3"},
{code:"4",name:"الإيرادات",type:"revenue",nature:"credit",isGroup:true},
{code:"4100",name:"إيرادات المبيعات",type:"revenue",nature:"credit",parentCode:"4"},
{code:"4200",name:"إيرادات الخدمات",type:"revenue",nature:"credit",parentCode:"4"},
{code:"5",name:"تكلفة المبيعات",type:"expense",nature:"debit",isGroup:true},
{code:"5100",name:"تكلفة البضاعة المباعة",type:"expense",nature:"debit",parentCode:"5",statementGroup:"cogs"},
{code:"6",name:"المصروفات",type:"expense",nature:"debit",isGroup:true},
{code:"6100",name:"مصروفات تشغيلية عامة",type:"expense",nature:"debit",parentCode:"6",statementGroup:"operating"},
{code:"6200",name:"مصروفات إدارية وعمومية",type:"expense",nature:"debit",parentCode:"6",statementGroup:"administrative"},
{code:"6300",name:"مصروفات نقل وشحن",type:"expense",nature:"debit",parentCode:"6",statementGroup:"operating"},
{code:"6400",name:"عمولات ومصاريف بنكية",type:"expense",nature:"debit",parentCode:"6",statementGroup:"finance"}
];
const txt=(v,n=2000)=>{const s=String(v==null?"":v).trim();if(s.length>n)throw new Error("A financial field is too long.");return s;};
const id=v=>{const s=txt(v,120);if(!s||/[.#$\/\[\]]/.test(s))throw new Error("Invalid financial identifier.");return s;};
const num=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e15)throw new Error("Invalid amount.");return Math.round(n*10000)/10000;};
const rnd=v=>Math.round((Number(v)||0)*100)/100;
const month=d=>String(d||"").slice(0,7);
const date=v=>{const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+"T00:00:00Z")))throw new Error("A valid transaction date is required.");return s;};
const uid=p=>(p||"FIN")+"_"+crypto.randomUUID().replace(/-/g,"");
const balance=lines=>{const debit=rnd((lines||[]).reduce((s,x)=>s+Number(x.debit||0),0)),credit=rnd((lines||[]).reduce((s,x)=>s+Number(x.credit||0),0));return {debit,credit,difference:rnd(debit-credit)};};
const reviewRecord=doc=>({id:doc.id,documentId:doc.id,type:doc.type,title:doc.title||doc.number||doc.id,number:doc.number||"",date:doc.date||"",partyName:doc.partyName||"",total:Number(doc.total||0),status:doc.status,createdAt:doc.createdAt,createdBy:doc.createdBy,errors:doc.errors||[],warnings:doc.warnings||[]});
function journalUpdates(j){
 const u={},m=month(j.date);u["journals/"+j.id]=j;u["periods/"+m+"/entries/"+j.id]=j;
 (j.lines||[]).forEach((l,i)=>{const row={journalId:j.id,lineNo:i+1,date:j.date,description:l.description||j.description||"",accountCode:l.accountCode,debit:Number(l.debit||0),credit:Number(l.credit||0),currency:l.currency||j.currency||"EGP",costCenterId:l.costCenterId||"",projectCode:l.projectCode||"",partyType:l.partyType||"",partyId:l.partyId||"",sourceType:j.sourceType||"manual",sourceId:j.sourceId||"",reference:j.reference||""};u["ledger/"+l.accountCode+"/"+m+"/"+j.id+"_"+(i+1)]=row;if(l.partyType&&l.partyId)u["partyLedger/"+l.partyType+"/"+l.partyId+"/"+m+"/"+j.id+"_"+(i+1)]=row;if(l.costCenterId)u["costLedger/"+l.costCenterId+"/"+m+"/"+j.id+"_"+(i+1)]=row;});
 if(j.sourceType&&j.sourceId)u["sourceLocks/"+j.sourceType+"_"+j.sourceId]={journalId:j.id,postedAt:Date.now()};return u;
}
function validateJournal(j,chart,centers){
 const errors=[],lines=Array.isArray(j.lines)?j.lines:[];if(lines.length<2)errors.push("القيد يجب أن يحتوي على سطرين على الأقل");
 lines.forEach((l,i)=>{const a=chart[txt(l.accountCode,32)];if(!a)errors.push("السطر "+(i+1)+": الحساب غير موجود");else if(a.isGroup||a.active===false)errors.push("السطر "+(i+1)+": الحساب غير قابل للترحيل");const d=Number(l.debit||0),c=Number(l.credit||0);if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0||((d>0)===(c>0)))errors.push("السطر "+(i+1)+": أدخل مدين أو دائن فقط");if(l.costCenterId&&!centers[l.costCenterId])errors.push("السطر "+(i+1)+": مركز التكلفة غير موجود");if(a&&a.subledgerType&&!l.partyId)errors.push("السطر "+(i+1)+": يجب اختيار الطرف التحليلي");});
 const b=balance(lines);if(Math.abs(b.difference)>0.01)errors.push("القيد غير متوازن. الفرق: "+b.difference);return {errors,balance:b};
}
function invoiceLineAmounts(inv){
 const rows=(inv.lines||[]).map(function(line){return {line,base:rnd(num(line.quantity)*num(line.unitPrice)-num(line.discount||0))};});
 const subtotal=rnd(rows.reduce(function(sum,row){return sum+row.base;},0));
 const discount=rnd(num(inv.discount||0));
 if(discount>subtotal+0.01)throw new Error("خصم الفاتورة أكبر من صافي البنود.");
 let remaining=discount;
 return rows.map(function(row,index){
  const share=index===rows.length-1?remaining:(subtotal>0?rnd(discount*row.base/subtotal):0);
  remaining=rnd(remaining-share);
  return {line:row.line,amount:rnd(Math.max(0,row.base-share))};
 });
}
function invoiceTotals(inv){const net=rnd(invoiceLineAmounts(inv).reduce(function(sum,row){return sum+row.amount;},0)),tax=rnd(inv.taxAmount==null?net*num(inv.taxRate||0)/100:num(inv.taxAmount));return {net,tax,total:rnd(net+tax)};}
async function sha(v){const a=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join("");}

export async function handleFinancialRequest(ctx){
 const {request,url,body,claims,profile,env,hasPermission,requirePermission,adminRead,adminPatch,adminReadRoot,adminPatchRoot}=ctx;
 if(!profile||!["active","نشط","مفعل","enabled"].includes(String(profile.status||"").toLowerCase()))throw new Error("This user account is not active.");
 if(request.method==="GET"){
  requirePermission(profile,"financial","view");const res=txt(url.searchParams.get("resource")||"bootstrap",40);
  if(res==="bootstrap"){
   let chart=(await adminRead("chartOfAccounts"))||{};
   if(!Object.keys(chart).length){
    if(profile.role!=="admin")throw new Error("يجب على مدير النظام تهيئة دليل الحسابات أولاً.");
    const u={};DEFAULT_FINANCE_ACCOUNTS.forEach(a=>u["chartOfAccounts/"+a.code]={...a,active:true,createdAt:Date.now(),createdBy:claims.sub});u["settings/baseCurrency"]="EGP";u["settings/seedVersion"]=1;await adminPatch(u);chart=Object.fromEntries(DEFAULT_FINANCE_ACCOUNTS.map(a=>[a.code,{...a,active:true}]));
   }
   const out={chartOfAccounts:chart};for(const k of ["costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","settings"])out[k]=(await adminRead(k))||{};
   const parties=(await adminRead("parties"))||{};
   const crmClients=adminReadRoot?(await adminReadRoot("clients"))||{}:{};
   const crmVendors=adminReadRoot?(await adminReadRoot("vendors"))||{}:{};
   Object.entries(crmClients).forEach(([code,party])=>{if(party&&typeof party==="object")parties[code]={...party,code:party.code||code,partyType:"customer"};});
   Object.entries(crmVendors).forEach(([code,party])=>{if(party&&typeof party==="object")parties[code]={...party,code:party.code||code,partyType:"vendor"};});
   out.parties=parties;
   out.inventory={balances:(await adminRead("inventory/balances"))||{}};
   return out;
  }
  if(res==="review"||res==="journals"||res==="documents"||res==="inventory"||res==="tax"||res==="audit")return {items:(await adminRead(res==="review"?"reviewQueue":res))||{}};
  if(res==="bank")return {items:(await adminRead("bankImports"))||{},accounts:(await adminRead("bankAccounts"))||{}};
  if(res==="periods"){const from=txt(url.searchParams.get("from")||new Date().toISOString().slice(0,7),7),to=txt(url.searchParams.get("to")||from,7);if(!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to))throw new Error("Invalid financial period.");const a=new Date(from+"-01T00:00:00Z"),b=new Date(to+"-01T00:00:00Z"),diff=(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth();if(diff<0||diff>24)throw new Error("Report period must not exceed 24 months.");const months=[],entries={};for(let i=0;i<=diff;i++){const d=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+i,1)),m=d.toISOString().slice(0,7);months.push(m);entries[m]=(await adminRead("periods/"+m+"/entries"))||{};}return {months,entries};}
  if(res==="party"){const type=url.searchParams.get("type")==="vendor"?"vendor":"customer",partyId=id(url.searchParams.get("id"));return {entries:(await adminRead("partyLedger/"+type+"/"+partyId))||{}};}
  throw new Error("Unknown financial data resource.");
 }
 if(request.method!=="POST")throw new Error("Method not allowed.");const action=txt(body.action,40),now=Date.now();
 if(action==="ocr"){
  requirePermission(profile,"financial","add");if(!env.AI)throw new Error("Workers AI is not enabled.");const image=String(body.image||"");if(!/^data:image\/(png|jpeg|webp);base64,/i.test(image)||image.length>12*1024*1024)throw new Error("ارفع صورة JPG أو PNG أو WebP لا تتجاوز 9 MB.");
  const prompt="Extract invoice data from this image. Return only JSON with fields type (purchase or sales), number, date YYYY-MM-DD, partyName, taxNumber, currency, netTotal, taxAmount, total, items array with description, quantity, unit, unitPrice, discount. Preserve Arabic and English text. Do not guess unreadable values. Human verification is required.";
  const out=await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct",{messages:[{role:"user",content:[{type:"text",text:prompt},{type:"image_url",image_url:{url:image}}]}],max_tokens:1800,temperature:0.1});
  let raw=String(out&&out.response||"").trim();const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a<0||b<=a)throw new Error("تعذر استخراج بيانات واضحة من الصورة. أدخل البيانات يدويًا.");let data;try{data=JSON.parse(raw.slice(a,b+1));}catch(_){throw new Error("نتيجة قراءة الصورة غير مكتملة. أدخل البيانات يدويًا.");}return {success:true,extracted:data,needsHumanReview:true,model:"llama-4-scout-17b-16e-instruct"};
 }
 if(action==="saveMaster"){
  requirePermission(profile,"financial","add");const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];if(!allowed.includes(kind))throw new Error("Unsupported master data type.");const item=body.item||{},code=id(item.code);if(!txt(item.name,180))throw new Error("الاسم مطلوب");const existingCode=await adminRead(kind+"/"+code);if(existingCode)throw new Error("هذا الكود مسجل بالفعل. اختر كودًا آخر حتى لا يتم استبدال بياناته.");
  if(kind==="chartOfAccounts"){if(!["asset","liability","equity","revenue","expense"].includes(item.type)||!["debit","credit"].includes(item.nature))throw new Error("نوع أو طبيعة الحساب غير صحيحة");if(item.isGroup&&item.allowPosting)throw new Error("الحساب التجميعي لا يقبل الترحيل");if(item.parentCode){const p=await adminRead("chartOfAccounts/"+id(item.parentCode));if(!p||!p.isGroup)throw new Error("الحساب الأب يجب أن يكون مجموعة");}}if(kind==="items"&&item.groupCode){const group=await adminRead("itemGroups/"+id(item.groupCode));if(!group)throw new Error("مجموعة الصنف غير موجودة. أضف المجموعة أولاً.");}
  if(kind==="parties"){
   if(!["customer","vendor"].includes(item.partyType))throw new Error("حدد نوع الطرف: عميل أو مورد.");
   const root= item.partyType==="customer"?"clients":"vendors";
   const current=adminReadRoot?await adminReadRoot(root+"/"+code):null;
   if(current)throw new Error("كود الطرف موجود بالفعل في سجل العملاء أو الموردين.");
  }
  const saved={...item,code,name:txt(item.name,180),active:item.active!==false,createdAt:item.createdAt||now,createdBy:item.createdBy||claims.sub,updatedAt:now,updatedBy:claims.sub};
  const audit={action:"save_master",kind,code,uid:claims.sub,createdAt:now},u={};u[kind+"/"+code]=saved;u["audit/"+uid("AUD")]=audit;
  if(kind==="parties"&&adminPatchRoot){
   const root=saved.partyType==="customer"?"clients":"vendors",globalUpdates={};globalUpdates[root+"/"+code]=saved;globalUpdates["financial/parties/"+code]=saved;globalUpdates["financial/audit/"+uid("AUD")]=audit;
   await adminPatchRoot(globalUpdates);
  }else await adminPatch(u);
  return {success:true,item:saved};
 }
 if(action==="importMasters"){
  requirePermission(profile,"financial","add");
  const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];
  if(!allowed.includes(kind))throw new Error("Unsupported master data import type.");
  const sourceRows=Array.isArray(body.rows)?body.rows:[];
  if(!sourceRows.length)throw new Error("ملف الاستيراد لا يحتوي على صفوف.");
  if(sourceRows.length>500)throw new Error("الحد الأقصى 500 سجل في عملية الاستيراد الواحدة.");
  const existing=(await adminRead(kind))||{},groups=(await adminRead("itemGroups"))||{},seen=new Set(),updates={},rootUpdates={};
  const partyRoot=kind==="parties"?(body.partyType==="customer"?"clients":body.partyType==="vendor"?"vendors":""):"";
  if(kind==="parties"&&!partyRoot)throw new Error("حدد هل ملف الأطراف للعملاء أم الموردين.");
  const legacy=partyRoot&&adminReadRoot?(await adminReadRoot(partyRoot))||{}:{};
  let count=0;
  for(let i=0;i<sourceRows.length;i++){
   const row=sourceRows[i]||{},code=id(row.code),name=txt(row.name,180);
   if(!name)throw new Error("الصف "+(i+2)+": الاسم مطلوب.");
   if(seen.has(code)||existing[code]||(legacy&&legacy[code]))throw new Error("الصف "+(i+2)+": الكود "+code+" موجود بالفعل أو مكرر في الملف.");
   seen.add(code);
   if(kind==="chartOfAccounts"){
    if(!["asset","liability","equity","revenue","expense"].includes(row.type)||!["debit","credit"].includes(row.nature))throw new Error("الصف "+(i+2)+": نوع أو طبيعة الحساب غير صحيحة.");
    if(row.parentCode){const parent=await adminRead("chartOfAccounts/"+id(row.parentCode));if(!parent||!parent.isGroup)throw new Error("الصف "+(i+2)+": الحساب الأب يجب أن يكون مجموعة موجودة.");}
    if(row.isGroup===true||String(row.isGroup).toLowerCase()==="true"||String(row.isGroup)==="1")row.isGroup=true;else row.isGroup=false;
   }
   if(kind==="items"&&row.groupCode&&!groups[row.groupCode])throw new Error("الصف "+(i+2)+": مجموعة الصنف "+row.groupCode+" غير موجودة.");
   if(kind==="taxCodes"&&!["vat_input","vat_output","withholding","addition"].includes(row.taxType))throw new Error("الصف "+(i+2)+": نوع الضريبة غير صحيح.");
   const saved={...row,code,name,active:row.active!==false,createdAt:now,createdBy:claims.sub,updatedAt:now,updatedBy:claims.sub};
   if(kind==="parties")saved.partyType=body.partyType;
   updates[kind+"/"+code]=saved;
   if(kind==="parties")rootUpdates[partyRoot+"/"+code]=saved;
   count++;
  }
  const audit={action:"import_masters",kind,count,uid:claims.sub,createdAt:now};
  if(kind==="parties"&&adminPatchRoot){Object.entries(updates).forEach(([path,value])=>{rootUpdates["financial/"+path]=value;});rootUpdates["financial/audit/"+uid("AUD")]=audit;await adminPatchRoot(rootUpdates);}
  else{updates["audit/"+uid("AUD")]=audit;await adminPatch(updates);}
  return {success:true,kind,count};
 }
 if(action==="submitJournal"){
  requirePermission(profile,"financial","add");const j={id:id(body.id||uid("DOC")),type:"journal",date:date(body.date),description:txt(body.description,500),reference:txt(body.reference,120),currency:txt(body.currency||"EGP",3),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120)};
  if(body.id){
   const previous=await adminRead("documents/"+j.id);
   if(previous&&(!(previous.status==="needs_correction"||previous.status==="draft")||previous.createdBy!==claims.sub))throw new Error("لا يمكن تعديل هذا القيد بعد إرساله أو اعتماده.");
  }
  const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},v=validateJournal(j,chart,centers);j.errors=v.errors;j.balance=v.balance;j.status=v.errors.length?"needs_correction":"pending_review";const u={};u["documents/"+j.id]=j;if(!v.errors.length)u["reviewQueue/"+j.id]=reviewRecord(j);u["audit/"+uid("AUD")]={action:"submit_journal",documentId:j.id,status:j.status,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,id:j.id,status:j.status,errors:v.errors,balance:v.balance};
 }
 if(action==="submitInvoice"){
  requirePermission(profile,"financial","add");const inv={...body,id:id(body.id||uid("INV")),type:"invoice",invoiceType:body.type==="purchase"?"purchase":"sales",date:date(body.date),number:txt(body.number,120),partyId:txt(body.partyId,120),partyName:txt(body.partyName,180),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:now,createdBy:claims.sub},errors=[];
  if(!inv.partyId)errors.push("اختيار العميل أو المورد مطلوب");if(!inv.number)errors.push("رقم الفاتورة مطلوب");if(!inv.lines.length)errors.push("أضف بندًا واحدًا على الأقل");
  inv.lines.forEach((l,i)=>{if(!txt(l.description,250))errors.push("وصف البند "+(i+1)+" مطلوب");if(!(Number(l.quantity)>0))errors.push("الكمية غير صحيحة في البند "+(i+1));if(l.kind==="stock"&&!l.itemCode)errors.push("حدد الصنف المخزني في البند "+(i+1));if(l.kind==="service"&&!l.accountCode)errors.push("حدد حساب البند "+(i+1));});
  if(body.id){
   const previous=await adminRead("documents/"+inv.id);
   if(previous&&(!(previous.status==="needs_correction"||previous.status==="draft")||previous.createdBy!==claims.sub))throw new Error("لا يمكن تعديل هذا المستند بعد إرساله أو اعتماده.");
  }
  const totals=invoiceTotals(inv);inv.totals=totals;inv.total=totals.total;inv.errors=errors;inv.fingerprint=await sha([inv.invoiceType,inv.partyId,inv.number,inv.date,totals.total.toFixed(2)].join("|").toLowerCase());const duplicate=await adminRead("documentFingerprints/"+inv.fingerprint);inv.warnings=duplicate?["مستند مشابه مسجل سابقًا: "+duplicate.documentId]:[];inv.status=errors.length?"needs_correction":"pending_review";
  const u={};u["documents/"+inv.id]=inv;if(!errors.length)u["reviewQueue/"+inv.id]=reviewRecord(inv);u["audit/"+uid("AUD")]={action:"submit_invoice",documentId:inv.id,status:inv.status,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,id:inv.id,status:inv.status,errors,warnings:inv.warnings,totals};
 }
 if(action==="submitCash"){
  requirePermission(profile,"financial","add");const doc={...body,id:id(body.id||uid("CASH")),type:"cash",date:date(body.date),amount:num(body.amount),description:txt(body.description,500),createdAt:now,createdBy:claims.sub,status:"pending_review"};if(!doc.amount||!["in","out"].includes(doc.direction))throw new Error("حدد اتجاه الحركة ومبلغًا صحيحًا");const u={};u["documents/"+doc.id]=doc;u["reviewQueue/"+doc.id]=reviewRecord(doc);u["audit/"+uid("AUD")]={action:"submit_cash",documentId:doc.id,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,id:doc.id,status:doc.status};
 }
 if(action==="submitBankImport"){
  requirePermission(profile,"financial","add");const importId=id(body.id||uid("BANK")),rows=Array.isArray(body.rows)?body.rows.slice(0,500):[];if(!rows.length)throw new Error("ملف البنك لا يحتوي على حركات");const u={},duplicates=[];let count=0;
  for(const row of rows){const d=date(row.date),amount=num(row.amount);if(!amount)continue;const fingerprint=await sha([txt(body.bankAccountCode||"1120",32),d,amount.toFixed(2),txt(row.reference,100),txt(row.description,500).toLowerCase().replace(/\s+/g," ")].join("|")),prev=await adminRead("bankFingerprints/"+fingerprint),docId=uid("BNK"),doc={id:docId,type:"bankLine",importId,date:d,amount,description:txt(row.description,500),reference:txt(row.reference,100),direction:row.direction==="in"?"in":"out",bankAccountCode:txt(body.bankAccountCode||"1120",32),fingerprint,status:prev?"duplicate_review":"pending_review",warnings:prev?["تكرار محتمل لحركة "+prev.documentId]:[],duplicateOf:prev&&prev.documentId||"",createdAt:now,createdBy:claims.sub};if(prev)duplicates.push(docId);else u["bankFingerprints/"+fingerprint]={documentId:docId,importId,createdAt:now};u["documents/"+docId]=doc;u["reviewQueue/"+docId]=reviewRecord(doc);count++;}
  u["bankImports/"+importId]={id:importId,bankAccountCode:body.bankAccountCode||"1120",fileName:txt(body.fileName,180),rowCount:count,duplicateCount:duplicates.length,createdAt:now,createdBy:claims.sub};u["audit/"+uid("AUD")]={action:"bank_import",importId,rowCount:count,duplicates:duplicates.length,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,importId,rows:count,duplicates:duplicates.length};
 }
 if(action==="addAttachment"){
  requirePermission(profile,"financial","add");
  const documentId=id(body.documentId),document=await adminRead("documents/"+documentId),attachment=body.attachment||{},attachmentId=id(attachment.id);
  if(!document)throw new Error("الفاتورة أو المستند غير موجود.");
  if(document.createdBy!==claims.sub&&profile.role!=="admin"&&!hasPermission(profile,"financial","edit"))throw new Error("ليس لديك صلاحية ربط المرفقات بهذا المستند.");
  const metadata={id:attachmentId,fileName:txt(attachment.fileName||attachment.name,240),mimeType:txt(attachment.mimeType||attachment.contentType,120),size:num(attachment.size||0),createdAt:now,uploadedBy:claims.sub};
  const updates={};updates["documents/"+documentId+"/attachments/"+attachmentId]=metadata;updates["audit/"+uid("AUD")]={action:"attach_financial_document",documentId,attachmentId,uid:claims.sub,createdAt:now};
  await adminPatch(updates);return {success:true,attachment:metadata};
 }
 if(action==="setBankOffset"){
  if(!hasPermission(profile,"financial","approve"))throw new Error("Permission denied: financial.approve.");
  const docId=id(body.id),doc=await adminRead("documents/"+docId);
  if(!doc||doc.type!=="bankLine"||!["pending_review","duplicate_review"].includes(doc.status))throw new Error("حركة البنك غير متاحة للتعديل");
  const offset=id(body.offsetAccountCode),account=await adminRead("chartOfAccounts/"+offset);
  if(!account||account.isGroup||account.active===false)throw new Error("اختر حسابًا تحليليًا فعالًا");
  const updates={};updates["documents/"+docId+"/offsetAccountCode"]=offset;updates["reviewQueue/"+docId+"/offsetAccountCode"]=offset;
  updates["audit/"+uid("AUD")]={action:"set_bank_offset",documentId:docId,accountCode:offset,uid:claims.sub,createdAt:now};
  await adminPatch(updates);return {success:true};
 }
 if(action==="review"){
  if(!hasPermission(profile,"financial","approve"))throw new Error("Permission denied: financial.approve.");const docId=id(body.id),decision=txt(body.decision,20),doc=await adminRead("documents/"+docId);if(!doc)throw new Error("مستند المراجعة غير موجود");if(!["pending_review","duplicate_review"].includes(doc.status))throw new Error("المستند ليس في قائمة المراجعة");
  if(decision==="approve"&&doc.status==="duplicate_review"&&doc.duplicateOf)throw new Error("هذه الحركة مكررة محتملة. لا تعتمدها إلا باستخدام قرار اعتماد التكرار الصريح.");
  if(decision==="approveDuplicate"&&doc.status!=="duplicate_review")throw new Error("هذا المستند ليس تكرارًا محتملاً.");
  if(decision==="reject"||decision==="return"){const status=decision==="reject"?"rejected":"needs_correction",u={};u["documents/"+docId+"/status"]=status;u["documents/"+docId+"/reviewReason"]=txt(body.reason,1000);u["documents/"+docId+"/reviewedBy"]=claims.sub;u["documents/"+docId+"/reviewedAt"]=now;u["reviewQueue/"+docId]=null;u["audit/"+uid("AUD")]={action:status,documentId:docId,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,status};}
  if(decision!=="approve"&&decision!=="approveDuplicate")throw new Error("قرار المراجعة غير صحيح");const updates={};let j;
  if(doc.type==="journal"){const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},v=validateJournal(doc,chart,centers);if(v.errors.length)throw new Error(v.errors.join("؛ "));j={...doc,status:"posted",approvedAt:now,approvedBy:claims.sub,postedAt:now};Object.assign(updates,journalUpdates(j));}
  else if(doc.type==="cash"){const amount=num(doc.amount),receipt=doc.direction==="in",cash=txt(doc.cashAccountCode||"1110",32),party=txt(doc.partyAccountCode||(receipt?"1210":"281"),32);if(!doc.partyId)throw new Error("يجب اختيار العميل أو المورد لضمان تحديث حسابه التحليلي.");const lines=receipt?[{accountCode:cash,debit:amount,credit:0,description:doc.description},{accountCode:party,debit:0,credit:amount,description:doc.description,partyType:doc.partyType||"",partyId:doc.partyId||""}]:[{accountCode:party,debit:amount,credit:0,description:doc.description,partyType:doc.partyType||"",partyId:doc.partyId||""},{accountCode:cash,debit:0,credit:amount,description:doc.description}];j={id:uid("JRN"),date:doc.date,description:doc.description,reference:doc.reference||"",sourceType:"cash",sourceId:doc.id,currency:doc.currency||"EGP",lines,status:"posted",createdAt:doc.createdAt,createdBy:doc.createdBy,approvedAt:now,approvedBy:claims.sub,postedAt:now};Object.assign(updates,journalUpdates(j));}
  else if(doc.type==="bankLine"){if(!doc.offsetAccountCode)throw new Error("حدد الحساب المقابل قبل الاعتماد");const amount=num(doc.amount),bank=txt(doc.bankAccountCode||"1120",32),offset=txt(doc.offsetAccountCode,32),incoming=doc.direction==="in",lines=incoming?[{accountCode:bank,debit:amount,credit:0,description:doc.description},{accountCode:offset,debit:0,credit:amount,description:doc.description,partyType:doc.partyType||"",partyId:doc.partyId||"",costCenterId:doc.costCenterId||""}]:[{accountCode:offset,debit:amount,credit:0,description:doc.description,partyType:doc.partyType||"",partyId:doc.partyId||"",costCenterId:doc.costCenterId||""},{accountCode:bank,debit:0,credit:amount,description:doc.description}];j={id:uid("JRN"),date:doc.date,description:"حركة بنك: "+doc.description,reference:doc.reference||"",sourceType:"bankLine",sourceId:doc.id,currency:"EGP",lines,status:"posted",createdAt:doc.createdAt,createdBy:doc.createdBy,approvedAt:now,approvedBy:claims.sub,postedAt:now};Object.assign(updates,journalUpdates(j));updates["bankFingerprints/"+doc.fingerprint+"/journalId"]=j.id;}
  else if(doc.type==="invoice"){
   const inv=doc,tot=invoiceTotals(inv),purchase=inv.invoiceType==="purchase",partyId=id(inv.partyId),lines=[],items=(await adminRead("items"))||{},centers=(await adminRead("costCenters"))||{};
   const projectCenter=inv.projectCode?Object.values(centers).find(function(center){return center&&(center.projectCode===inv.projectCode||center.code===inv.projectCode);}):null;

   const lock=await adminRead("documentFingerprints/"+inv.fingerprint);
   if(lock&&lock.documentId!==doc.id)throw new Error("الفاتورة مكررة ومربوطة بالمستند "+lock.documentId+"؛ ارفضها أو راجع المستند الأصلي قبل الترحيل.");
   const invoiceAmounts=invoiceLineAmounts(inv);
   for(const amountRow of invoiceAmounts){const l=amountRow.line,value=amountRow.amount;if(l.kind==="stock"&&!items[l.itemCode])throw new Error("الصنف "+l.itemCode+" غير معرف بالمخزون. أضفه أو اربطه بكود موجود.");lines.push(purchase?{accountCode:l.kind==="stock"?"1300":txt(l.accountCode||"6100",32),debit:value,credit:0,description:l.description,costCenterId:l.costCenterId||(projectCenter&&projectCenter.code)||"",projectCode:inv.projectCode||"",itemCode:l.kind==="stock"?l.itemCode:"",quantity:num(l.quantity),warehouseCode:l.warehouseCode||"default"}:{accountCode:l.kind==="stock"?"4100":txt(l.incomeAccountCode||"4200",32),debit:0,credit:value,description:l.description,costCenterId:l.costCenterId||(projectCenter&&projectCenter.code)||"",projectCode:inv.projectCode||"",itemCode:l.kind==="stock"?l.itemCode:"",quantity:num(l.quantity),warehouseCode:l.warehouseCode||"default"});}
   if(purchase&&tot.tax)lines.push({accountCode:"1410",debit:tot.tax,credit:0,description:"ضريبة مدخلات"});if(!purchase&&tot.tax)lines.push({accountCode:"2110",debit:0,credit:tot.tax,description:"ضريبة مخرجات"});lines.push(purchase?{accountCode:"281",debit:0,credit:tot.total,description:"فاتورة مشتريات",partyType:"vendor",partyId}:{accountCode:"1210",debit:tot.total,credit:0,description:"فاتورة مبيعات",partyType:"customer",partyId});
   const bal=(await adminRead("inventory/balances"))||{};
   if(!purchase){for(const l of lines.filter(x=>x.itemCode)){const stock=bal[l.warehouseCode]&&bal[l.warehouseCode][l.itemCode]||{quantity:0,averageCost:0};if(Number(stock.quantity||0)<l.quantity)throw new Error("الرصيد غير كافٍ للصنف "+l.itemCode);const cost=rnd(l.quantity*Number(stock.averageCost||0));lines.push({accountCode:"5100",debit:cost,credit:0,description:"تكلفة مبيعات "+l.description,itemCode:l.itemCode,quantity:l.quantity,warehouseCode:l.warehouseCode,costCenterId:l.costCenterId},{accountCode:"1300",debit:0,credit:cost,description:"صرف مخزون "+l.description,itemCode:l.itemCode,quantity:l.quantity,warehouseCode:l.warehouseCode});}}
   const check=balance(lines);if(Math.abs(check.difference)>0.01)throw new Error("القيد الناتج غير متوازن: "+check.difference);
   j={id:uid("JRN"),date:inv.date,description:(purchase?"فاتورة مشتريات ":"فاتورة مبيعات ")+inv.number,reference:inv.number,sourceType:"invoice",sourceId:doc.id,currency:inv.currency||"EGP",lines,status:"posted",createdAt:inv.createdAt,createdBy:inv.createdBy,approvedAt:now,approvedBy:claims.sub,postedAt:now,totals:tot};Object.assign(updates,journalUpdates(j));
   for(const amountRow of invoiceAmounts.filter(function(row){return row.line.kind==="stock";})){const l=amountRow.line,warehouse=id(l.warehouseCode||"default"),code=id(l.itemCode),stock=bal[warehouse]&&bal[warehouse][code]||{quantity:0,value:0,averageCost:0},qty=num(l.quantity),gross=amountRow.amount,inward=purchase,oldQty=Number(stock.quantity||0),oldValue=Number(stock.value||0),cost=inward?gross:rnd(qty*Number(stock.averageCost||0)),nextQty=inward?oldQty+qty:oldQty-qty,nextValue=inward?oldValue+gross:oldValue-cost,mov=uid("MOV");updates["inventory/balances/"+warehouse+"/"+code]={quantity:rnd(nextQty),value:rnd(nextValue),averageCost:nextQty>0?rnd(nextValue/nextQty):0,updatedAt:now};updates["inventory/movements/"+mov]={id:mov,date:inv.date,invoiceId:doc.id,journalId:j.id,itemCode:code,warehouseCode:warehouse,kind:inward?"purchase":"sale",quantity:inward?qty:-qty,unitCost:inward?rnd(gross/qty):Number(stock.averageCost||0),value:inward?gross:-cost,createdAt:now,createdBy:claims.sub};}
   updates["documentFingerprints/"+inv.fingerprint]={documentId:doc.id,createdAt:now};updates["documents/"+doc.id+"/totals"]=tot;
  }else throw new Error("نوع المستند غير مدعوم في الترحيل");
  updates["documents/"+docId+"/status"]="posted";updates["documents/"+docId+"/journalId"]=j.id;updates["documents/"+docId+"/approvedAt"]=now;updates["documents/"+docId+"/approvedBy"]=claims.sub;updates["documents/"+docId+"/postedAt"]=now;updates["reviewQueue/"+docId]=null;updates["audit/"+uid("AUD")]={action:"approve_and_post",documentId:docId,journalId:j.id,uid:claims.sub,createdAt:now};await adminPatch(updates);return {success:true,status:"posted",journalId:j.id};
 }
 if(action==="returnToReview"){requirePermission(profile,"financial","edit");const docId=id(body.id),doc=await adminRead("documents/"+docId);if(!doc||!["draft","needs_correction"].includes(doc.status))throw new Error("المستند غير متاح لإعادة الإرسال");const u={};u["documents/"+docId+"/status"]="pending_review";u["documents/"+docId+"/errors"]=[];u["reviewQueue/"+docId]=reviewRecord({...doc,status:"pending_review"});await adminPatch(u);return {success:true,status:"pending_review"};}
 throw new Error("Unknown financial action.");
}
