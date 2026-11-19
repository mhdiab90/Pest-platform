
const COMPANY_TAX_REGISTRATION_NUMBER = "589845268";
function normalizeTaxRegistrationNumber(value) {
  return String(value || "").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[^0-9]/g, "");
}
function extractEtaParty(block) {
  const source = String(block || "");
  const nameMatch = source.match(/Taxpayer\s+Name\s*:\s*([\s\S]*?)(?=\s+Registration\s+Number\s*:)/i);
  const taxMatch = source.match(/Registration\s+Number\s*:\s*#?\s*([0-9]{6,15})/i);
  const cleanName = value => String(value || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return { name: cleanName(nameMatch && nameMatch[1]), taxNumber: normalizeTaxRegistrationNumber(taxMatch && taxMatch[1]) };
}
function extractEtaInvoiceParties(value) {
  const source = String(value || ""), issuerMarker = /Issuer\s*\(\s*From\s*\)/i.exec(source), recipientMarker = /Recipients?\s*\(\s*To\s*\)/i.exec(source);
  if (!issuerMarker || !recipientMarker || recipientMarker.index <= issuerMarker.index) return {};
  const recipientRest = source.slice(recipientMarker.index + recipientMarker[0].length), itemMarker = /Code\s+Name/i.exec(recipientRest);
  const issuer = extractEtaParty(source.slice(issuerMarker.index + issuerMarker[0].length, recipientMarker.index));
  const recipient = extractEtaParty(itemMarker ? recipientRest.slice(0, itemMarker.index) : recipientRest);
  return { issuerName: issuer.name, issuerTaxNumber: issuer.taxNumber, recipientName: recipient.name, recipientTaxNumber: recipient.taxNumber };
}

function extractInternalInvoiceNumber(value) {
  const source = String(value || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  const marker = /\bInternal\s*id\s*[:：]\s*/i.exec(source);
  if (!marker) return "";
  let candidate = source.slice(marker.index + marker[0].length);
  candidate = candidate.split(/\r?\n/, 1)[0];
  const nextField = /\s+(?=(?:Document\s+Type(?:\s+Version)?|Date\s+Time\s+Issued|Issue\s+Date(?:\s+Time)?|Invoice\s+Date|Issuer\s*\(\s*From\s*\)|Recipients?\s*\(\s*To\s*\)|Seller\b|Buyer\b|Internal\s*id\s*[:：]|Total\s+(?:Sales\s+)?Amount|Taxable\s+Items|Items\s+Count|Payment\s+Method|Signature\b|QR\s+Code)(?:\s|[:：]|$))/i.exec(candidate);
  if (nextField) candidate = candidate.slice(0, nextField.index);
  return candidate.replace(/^\s*[:：#-]+\s*/, "").replace(/[\s|;,]+$/, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

const DEFAULT_VAT_CODES = [
 {code:"VAT-IN-14",name:"ضريبة قيمة مضافة مدخلات — السعر العام 14%",taxType:"vat_input",rate:14,effectiveFrom:"2017-07-01",etaTaxType:"T1"},
 {code:"VAT-OUT-14",name:"ضريبة قيمة مضافة مخرجات — السعر العام 14%",taxType:"vat_output",rate:14,effectiveFrom:"2017-07-01",etaTaxType:"T1"},
 {code:"VAT-IN-05",name:"ضريبة مدخلات — سعر خاص 5% (للحالات القانونية فقط)",taxType:"vat_input",rate:5,effectiveFrom:"2026-07-29",etaTaxType:"T1"},
 {code:"VAT-OUT-05",name:"ضريبة مخرجات — سعر خاص 5% (للحالات القانونية فقط)",taxType:"vat_output",rate:5,effectiveFrom:"2026-07-29",etaTaxType:"T1"},
 {code:"VAT-IN-00",name:"ضريبة مدخلات — صفرية 0%",taxType:"vat_input",rate:0,effectiveFrom:"2017-07-01",etaTaxType:"T1"},
 {code:"VAT-OUT-00",name:"ضريبة مخرجات — صفرية 0%",taxType:"vat_output",rate:0,effectiveFrom:"2017-07-01",etaTaxType:"T1"}
];

const DEFAULT_STAFF_ACCOUNTS = [
 {code:"1220",name:"العهد لدى العاملين",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"employeeCustody"},
 {code:"1230",name:"السلف لدى العاملين",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"employeeAdvance"}
];
const DEFAULT_PARTY_ADVANCE_ACCOUNTS = [
 {code:"1240",name:"دفعات مقدمة للموردين",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"vendor"},
 {code:"2130",name:"دفعات مقدمة من العملاء",type:"liability",nature:"credit",parentCode:"21",isControl:true,subledgerType:"customer"}
];

const DEFAULT_EXPENSE_ACCOUNTS = [
 {code:"65",name:"مصروفات الصيانة والإصلاحات",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"6501",name:"صيانة وإصلاح الآلات والمعدات",type:"expense",nature:"debit",parentCode:"65",statementGroup:"operating"},
 {code:"6502",name:"صيانة المباني والمنشآت",type:"expense",nature:"debit",parentCode:"65",statementGroup:"operating"},
 {code:"6503",name:"صيانة الكهرباء والسباكة والتكييف",type:"expense",nature:"debit",parentCode:"65",statementGroup:"operating"},
 {code:"6504",name:"قطع غيار ومستلزمات صيانة مستهلكة",type:"expense",nature:"debit",parentCode:"65",statementGroup:"operating"},
 {code:"6505",name:"مقاولات وخدمات صيانة خارجية",type:"expense",nature:"debit",parentCode:"65",statementGroup:"operating"},
 {code:"66",name:"مصروفات التدريب والتطوير",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"6601",name:"دورات تدريبية وتأهيل العاملين",type:"expense",nature:"debit",parentCode:"66",statementGroup:"administrative"},
 {code:"6602",name:"مؤتمرات وندوات وورش عمل",type:"expense",nature:"debit",parentCode:"66",statementGroup:"administrative"},
 {code:"6603",name:"كتب ومراجع ومواد تعليمية",type:"expense",nature:"debit",parentCode:"66",statementGroup:"administrative"},
 {code:"67",name:"مصروفات النظافة والصحة العامة",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"6701",name:"مواد ومستلزمات النظافة",type:"expense",nature:"debit",parentCode:"67",statementGroup:"operating"},
 {code:"6702",name:"خدمات وعقود النظافة",type:"expense",nature:"debit",parentCode:"67",statementGroup:"operating"},
 {code:"6703",name:"مكافحة الحشرات والتطهير والتعقيم",type:"expense",nature:"debit",parentCode:"67",statementGroup:"operating"},
 {code:"6704",name:"جمع المخلفات والتخلص الآمن منها",type:"expense",nature:"debit",parentCode:"67",statementGroup:"operating"},
 {code:"68",name:"مصروفات البوفيه والضيافة",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"6801",name:"مشتريات البوفيه والأغذية",type:"expense",nature:"debit",parentCode:"68",statementGroup:"administrative"},
 {code:"6802",name:"مشروبات وقهوة وشاي ومياه",type:"expense",nature:"debit",parentCode:"68",statementGroup:"administrative"},
 {code:"6803",name:"ضيافة واستقبال الزوار والعملاء",type:"expense",nature:"debit",parentCode:"68",statementGroup:"administrative"},
 {code:"6804",name:"تموين الاجتماعات والفعاليات",type:"expense",nature:"debit",parentCode:"68",statementGroup:"administrative"},
 {code:"69",name:"مصروفات الأدوات والمستلزمات المكتبية",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"6901",name:"أدوات كتابية وقرطاسية",type:"expense",nature:"debit",parentCode:"69",statementGroup:"administrative"},
 {code:"6902",name:"طباعة وتصوير ومستندات",type:"expense",nature:"debit",parentCode:"69",statementGroup:"administrative"},
 {code:"6903",name:"أحبار وتونر ومستلزمات الطابعات",type:"expense",nature:"debit",parentCode:"69",statementGroup:"administrative"},
 {code:"6904",name:"أدوات ومستلزمات مكتبية صغيرة",type:"expense",nature:"debit",parentCode:"69",statementGroup:"administrative"},
 {code:"70",name:"مصروفات المرافق والطاقة",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7001",name:"استهلاك الكهرباء",type:"expense",nature:"debit",parentCode:"70",statementGroup:"operating"},
 {code:"7002",name:"استهلاك المياه",type:"expense",nature:"debit",parentCode:"70",statementGroup:"operating"},
 {code:"7003",name:"الغاز والوقود التشغيلي",type:"expense",nature:"debit",parentCode:"70",statementGroup:"operating"},
 {code:"71",name:"مصروفات الاتصالات وتقنية المعلومات",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7101",name:"إنترنت وخدمات نقل البيانات",type:"expense",nature:"debit",parentCode:"71",statementGroup:"administrative"},
 {code:"7102",name:"هواتف واتصالات محمولة وثابتة",type:"expense",nature:"debit",parentCode:"71",statementGroup:"administrative"},
 {code:"7103",name:"اشتراكات البرامج والتراخيص السحابية",type:"expense",nature:"debit",parentCode:"71",statementGroup:"administrative"},
 {code:"7104",name:"صيانة ودعم أجهزة الحاسب والشبكات",type:"expense",nature:"debit",parentCode:"71",statementGroup:"administrative"},
 {code:"72",name:"المصروفات المهنية والاستشارية",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7201",name:"استشارات إدارية وفنية وهندسية",type:"expense",nature:"debit",parentCode:"72",statementGroup:"administrative"},
 {code:"7202",name:"مراجعة ومحاسبة واستشارات ضريبية",type:"expense",nature:"debit",parentCode:"72",statementGroup:"administrative"},
 {code:"7203",name:"خدمات قانونية ومحاماة",type:"expense",nature:"debit",parentCode:"72",statementGroup:"administrative"},
 {code:"7204",name:"رسوم حكومية وتراخيص وتجديدات",type:"expense",nature:"debit",parentCode:"72",statementGroup:"administrative"},
 {code:"73",name:"مصروفات الانتقالات والسفر والإقامة",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7301",name:"انتقالات العاملين ومأموريات داخلية",type:"expense",nature:"debit",parentCode:"73",statementGroup:"administrative"},
 {code:"7302",name:"سفر وانتقالات عمل خارجية",type:"expense",nature:"debit",parentCode:"73",statementGroup:"administrative"},
 {code:"7303",name:"إقامة وانتقالات سفر",type:"expense",nature:"debit",parentCode:"73",statementGroup:"administrative"},
 {code:"74",name:"مصروفات السلامة والصحة المهنية والبيئة",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7401",name:"ملابس ومهمات الوقاية الشخصية",type:"expense",nature:"debit",parentCode:"74",statementGroup:"operating"},
 {code:"7402",name:"مستلزمات السلامة والإطفاء المستهلكة",type:"expense",nature:"debit",parentCode:"74",statementGroup:"operating"},
 {code:"7403",name:"فحوصات وخدمات الصحة المهنية",type:"expense",nature:"debit",parentCode:"74",statementGroup:"administrative"},
 {code:"7404",name:"خدمات حماية البيئة والقياسات البيئية",type:"expense",nature:"debit",parentCode:"74",statementGroup:"operating"},
 {code:"75",name:"مصروفات المعامل والجودة والاختبارات",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7501",name:"كيماويات وخامات ومستهلكات المعامل",type:"expense",nature:"debit",parentCode:"75",statementGroup:"operating"},
 {code:"7502",name:"اختبارات وتحاليل ومعايرة خارجية",type:"expense",nature:"debit",parentCode:"75",statementGroup:"operating"},
 {code:"7503",name:"اعتمادات وشهادات الجودة والمواصفات",type:"expense",nature:"debit",parentCode:"75",statementGroup:"operating"},
 {code:"76",name:"مصروفات العاملين والرعاية الاجتماعية",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7601",name:"رعاية وأنشطة اجتماعية للعاملين",type:"expense",nature:"debit",parentCode:"76",statementGroup:"administrative"},
 {code:"7602",name:"وجبات ومياه للعاملين",type:"expense",nature:"debit",parentCode:"76",statementGroup:"administrative"},
 {code:"7603",name:"رعاية طبية ومستلزمات إسعافات أولية",type:"expense",nature:"debit",parentCode:"76",statementGroup:"administrative"},
 {code:"77",name:"مصروفات التأمين والاشتراكات",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7701",name:"أقساط التأمين على الممتلكات والمسؤولية",type:"expense",nature:"debit",parentCode:"77",statementGroup:"administrative"},
 {code:"7702",name:"اشتراكات ورسوم عضوية مهنية",type:"expense",nature:"debit",parentCode:"77",statementGroup:"administrative"},
 {code:"78",name:"مصروفات الدعاية والتسويق",type:"expense",nature:"debit",isGroup:true,parentCode:"6"},
 {code:"7801",name:"دعاية وإعلان وتسويق",type:"expense",nature:"debit",parentCode:"78",statementGroup:"administrative"},
 {code:"7802",name:"معارض ومطبوعات ومواد ترويجية",type:"expense",nature:"debit",parentCode:"78",statementGroup:"administrative"}
];

export const DEFAULT_FINANCE_ACCOUNTS = [
{code:"1",name:"الأصول",type:"asset",nature:"debit",isGroup:true},
{code:"11",name:"الأصول المتداولة",type:"asset",nature:"debit",isGroup:true,parentCode:"1"},
{code:"1110",name:"الخزينة",type:"asset",nature:"debit",parentCode:"11",isControl:true},
{code:"1120",name:"البنوك",type:"asset",nature:"debit",parentCode:"11",isControl:true},
{code:"1210",name:"العملاء",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"customer"},
{code:"1220",name:"العهد لدى العاملين",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"employeeCustody"},
{code:"1230",name:"السلف لدى العاملين",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"employeeAdvance"},
{code:"1240",name:"دفعات مقدمة للموردين",type:"asset",nature:"debit",parentCode:"11",isControl:true,subledgerType:"vendor"},
{code:"1300",name:"المخزون",type:"asset",nature:"debit",parentCode:"11",isControl:true},
{code:"1410",name:"ضريبة القيمة المضافة - مدخلات",type:"asset",nature:"debit",parentCode:"11"},
{code:"2",name:"الالتزامات",type:"liability",nature:"credit",isGroup:true},
{code:"21",name:"الالتزامات المتداولة",type:"liability",nature:"credit",isGroup:true,parentCode:"2"},
{code:"281",name:"الموردون",type:"liability",nature:"credit",parentCode:"21",isControl:true,subledgerType:"vendor"},
{code:"2110",name:"ضريبة القيمة المضافة - مخرجات",type:"liability",nature:"credit",parentCode:"21"},
{code:"2130",name:"دفعات مقدمة من العملاء",type:"liability",nature:"credit",parentCode:"21",isControl:true,subledgerType:"customer"},
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
{code:"6400",name:"عمولات ومصاريف بنكية",type:"expense",nature:"debit",parentCode:"6",statementGroup:"finance"},
...DEFAULT_EXPENSE_ACCOUNTS
];
const txt=(v,n=2000)=>{const s=String(v==null?"":v).trim();if(s.length>n)throw new Error("A financial field is too long.");return s;};
const id=v=>{const s=txt(v,120);if(!s||/[.#$\/\[\]]/.test(s))throw new Error("Invalid financial identifier.");return s;};
const num=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e15)throw new Error("Invalid amount.");return Math.round(n*10000)/10000;};
const rnd=v=>Math.round((Number(v)||0)*100)/100;
const month=d=>String(d||"").slice(0,7);
const date=v=>{const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+"T00:00:00Z")))throw new Error("A valid transaction date is required.");return s;};
const uid=p=>(p||"FIN")+"_"+crypto.randomUUID().replace(/-/g,"");
const balance=lines=>{const debit=rnd((lines||[]).reduce((s,x)=>s+Number(x.debit||0),0)),credit=rnd((lines||[]).reduce((s,x)=>s+Number(x.credit||0),0));return {debit,credit,difference:rnd(debit-credit)};};
const reviewRecord=doc=>({id:doc.id,documentId:doc.id,type:doc.type,invoiceType:doc.invoiceType||"",movementType:doc.movementType||"",title:doc.title||doc.number||doc.id,number:doc.number||"",date:doc.date||"",partyName:doc.partyName||"",total:Number(doc.total||doc.amount||0),status:doc.status,createdAt:doc.createdAt,createdBy:doc.createdBy,createdByName:doc.createdByName||"",attachmentUploadStatus:doc.attachmentUploadStatus||"",attachmentFileName:doc.attachmentFileName||"",attachmentUploadError:doc.attachmentUploadError||"",errors:doc.errors||[],warnings:doc.warnings||[]});
function journalUpdates(j){
 const u={},m=month(j.date);u["journals/"+j.id]=j;u["periods/"+m+"/entries/"+j.id]=j;
 (j.lines||[]).forEach((l,i)=>{const row={journalId:j.id,lineNo:i+1,date:j.date,description:l.description||j.description||"",accountCode:l.accountCode,debit:Number(l.debit||0),credit:Number(l.credit||0),currency:l.currency||j.currency||"EGP",costCenterId:l.costCenterId||"",projectCode:l.projectCode||"",partyType:l.partyType||"",partyId:l.partyId||"",sourceType:j.sourceType||"manual",sourceId:j.sourceId||"",reference:j.reference||"",taxCode:l.taxCode||"",taxType:l.taxType||""};u["ledger/"+l.accountCode+"/"+m+"/"+j.id+"_"+(i+1)]=row;if(l.partyType&&l.partyId)u["partyLedger/"+l.partyType+"/"+l.partyId+"/"+m+"/"+j.id+"_"+(i+1)]=row;if(l.costCenterId)u["costLedger/"+l.costCenterId+"/"+m+"/"+j.id+"_"+(i+1)]=row;});
 if(j.sourceType&&j.sourceId)u["sourceLocks/"+j.sourceType+"_"+j.sourceId]={journalId:j.id,postedAt:Date.now()};return u;
}
function containsMasterReference(value,fields,code,parentKey="") {
 const target=String(code);
 if(Array.isArray(value)){
  if(fields.has(parentKey)&&value.some(item=>String(item||"")===target))return true;
  return value.some(item=>containsMasterReference(item,fields,target,parentKey));
 }
 if(!value||typeof value!=="object")return false;
 return Object.entries(value).some(([key,child])=>{
  if(fields.has(key)){
   if(Array.isArray(child)&&child.some(item=>String(item||"")===target))return true;
   if(child!==null&&typeof child!=="object"&&String(child)===target)return true;
  }
  return child&&typeof child==="object"&&containsMasterReference(child,fields,target,key);
 });
}
const hasStoredRecords=value=>!!value&&typeof value==="object"&&Object.keys(value).length>0;
async function findMasterReferences(ctx,kind,code,partyType="") {
 const {adminRead,adminReadRoot}=ctx;
 const references=[];
 const [documents,journals]=await Promise.all([
  adminRead("documents").catch(()=>({})),
  adminRead("journals").catch(()=>({}))
 ]);
 const docs=documents||{},entries=journals||{};
 const check=(source,fields,label)=>{
  if(containsMasterReference(source,new Set(fields),code))references.push(label);
 };
 if(kind==="chartOfAccounts"){
  const [ledger,bankAccounts]=await Promise.all([adminRead("ledger/"+code),adminRead("bankAccounts")]);
  if(hasStoredRecords(ledger))references.push("حركات دفتر الأستاذ");
  check(entries,["accountCode"],"قيود اليومية");
  check(docs,["accountCode","incomeAccountCode","offsetAccountCode","cashAccountCode","accountingAccountCode"],"المستندات المالية");
  check(bankAccounts||{},["accountCode"],"حسابات البنوك المرتبطة");
  check(await adminRead("chartOfAccounts")||{},["parentCode"],"الحسابات الفرعية");
 }else if(kind==="costCenters"){
  const ledger=await adminRead("costLedger/"+code);
  if(hasStoredRecords(ledger))references.push("حركات مراكز التكلفة");
  check(entries,["costCenterId"],"قيود اليومية");
  check(docs,["costCenterId"],"المستندات المالية");
 }else if(kind==="items"){
  const balances=(await adminRead("inventory/balances"))||{},movements=(await adminRead("inventory/movements"))||{};
  const hasBalance=Object.values(balances).some(warehouseRows=>warehouseRows&&typeof warehouseRows==="object"&&warehouseRows[code]&&Number(warehouseRows[code].quantity||0)!==0);
  if(hasBalance)references.push("رصيد الصنف في المخازن");
  check(movements,["itemCode"],"حركات المخزون");
  check(docs,["itemCode"],"فواتير وحركات الأصناف");
 }else if(kind==="itemGroups"){
  check(await adminRead("items")||{},["groupCode"],"الأصناف المرتبطة بالمجموعة");
 }else if(kind==="warehouses"){
  check(await adminRead("items")||{},["warehouseCode"],"الأصناف المرتبطة بالمخزن");
  const balances=(await adminRead("inventory/balances"))||{},movements=(await adminRead("inventory/movements"))||{};
  if(hasStoredRecords(balances[code]))references.push("أرصدة المخزن");
  check(movements,["warehouseCode"],"حركات المخزون");
 }else if(kind==="bankAccounts"){
  check(await adminRead("bankImports")||{},["bankAccountCode","accountCode"],"كشوف وحركات البنوك");
  check(docs,["bankAccountCode"],"المستندات المالية");
  check(entries,["bankAccountCode","accountCode"],"قيود اليومية");
  check(await adminRead("cashMovements")||{},["bankAccountCode"],"حركات النقدية والبنوك");
 }else if(kind==="taxCodes"){
  check(docs,["taxCode"],"الفواتير والمستندات الضريبية");
  check(entries,["taxCode"],"قيود اليومية الضريبية");
 }else if(kind==="parties"){
  const type=partyType==="vendor"?"vendor":"customer";
  const partyLedger=await adminRead("partyLedger/"+type+"/"+code);
  if(hasStoredRecords(partyLedger))references.push("كشف حساب الطرف");
  check(docs,["partyId","partyCode"],"الفواتير والمستندات المالية");
  check(entries,["partyId","partyCode"],"قيود اليومية");
  check(await adminRead("cashMovements")||{},["partyId","partyCode"],"حركات النقدية");
  const projects=adminReadRoot?(await adminReadRoot("projects").catch(()=>({})))||{}:{};
  const projectFields=type==="vendor"?["vendorCodes","partyCode"]:["clientCodes","clientCode","partyCode"];
  if(containsMasterReference(projects,new Set(projectFields),code))references.push("المشروعات وأحداثها");
 }else{
  throw new Error("Unsupported master-data type.");
 }
 return references;
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
function invoiceTotals(inv){const net=rnd(invoiceLineAmounts(inv).reduce(function(sum,row){return sum+row.amount;},0)),hasFixedTax=inv.taxAmount!==undefined&&inv.taxAmount!==null&&String(inv.taxAmount).trim()!=="",tax=rnd(hasFixedTax?num(inv.taxAmount):net*num(inv.taxRate||0)/100);return {net,tax,total:rnd(net+tax)};}
async function sha(v){const a=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join("");}

export async function handleFinancialRequest(ctx){
 const {request,url,body,claims,profile,env,hasPermission,requirePermission,adminRead,adminPatch,adminReadRoot,adminPutRoot,adminPatchRoot}=ctx;
 if(!profile||!["active","نشط","مفعل","enabled"].includes(String(profile.status||"").toLowerCase()))throw new Error("This user account is not active.");
 if(request.method==="GET"){
  requirePermission(profile,"financial","view");const res=txt(url.searchParams.get("resource")||"bootstrap",40);
  if(res==="bootstrap"){
   let chart=(await adminRead("chartOfAccounts"))||{};
   if(!Object.keys(chart).length){
    if(profile.role!=="admin")throw new Error("يجب على مدير النظام تهيئة دليل الحسابات أولاً.");
    const u={};DEFAULT_FINANCE_ACCOUNTS.forEach(a=>u["chartOfAccounts/"+a.code]={...a,active:true,createdAt:Date.now(),createdBy:claims.sub});u["settings/baseCurrency"]="EGP";u["settings/seedVersion"]=1;await adminPatch(u);chart=Object.fromEntries(DEFAULT_FINANCE_ACCOUNTS.map(a=>[a.code,{...a,active:true}]));
   }
   // Idempotent migration: add only missing expense groups/accounts without overwriting existing account data.
   if(profile.role==="admin"){
    const migrated={};
    const updates={};
    for(const account of [...DEFAULT_EXPENSE_ACCOUNTS,...DEFAULT_STAFF_ACCOUNTS,...DEFAULT_PARTY_ADVANCE_ACCOUNTS]){
     if(chart[account.code])continue;
     const parent=account.parentCode?(chart[account.parentCode]||migrated[account.parentCode]):null;
     if(account.parentCode&&(!parent||!parent.isGroup))continue;
     const saved={...account,active:true,createdAt:Date.now(),createdBy:claims.sub};
     migrated[account.code]=saved;
     chart[account.code]=saved;
     updates["chartOfAccounts/"+account.code]=saved;
    }
    if(Object.keys(updates).length)await adminPatch(updates);
   }
   if(profile.role==="admin"){
    const currentTaxCodes=(await adminRead("taxCodes"))||{},taxUpdates={};
    for(const taxCode of DEFAULT_VAT_CODES){if(!currentTaxCodes[taxCode.code])taxUpdates["taxCodes/"+taxCode.code]={...taxCode,active:true,createdAt:Date.now(),createdBy:claims.sub};}
    if(Object.keys(taxUpdates).length)await adminPatch(taxUpdates);
    const accountingStartMonth=await adminRead("settings/accountingStartMonth");
    if(!accountingStartMonth){
     const postedJournals=Object.values((await adminRead("journals"))||{}).filter(j=>j&&j.status==="posted"&&/^\d{4}-\d{2}-\d{2}$/.test(String(j.date||"")));
     const earliestMonth=postedJournals.map(j=>String(j.date).slice(0,7)).sort()[0]||new Date().toISOString().slice(0,7);
     await adminPatch({"settings/accountingStartMonth":earliestMonth});
    }
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
  if(res==="document"){const docId=id(url.searchParams.get("id"));const item=await adminRead("documents/"+docId);if(!item)throw new Error("المستند المطلوب غير موجود أو تم نقله من قائمة المراجعة.");return {item};}
  if(res==="review"||res==="journals"||res==="documents"||res==="inventory"||res==="tax"||res==="audit")return {items:(await adminRead(res==="review"?"reviewQueue":res))||{}};
  if(res==="bank")return {items:(await adminRead("bankImports"))||{},accounts:(await adminRead("bankAccounts"))||{}};
  if(res==="periods"){
   const from=txt(url.searchParams.get("from")||new Date().toISOString().slice(0,7),7),to=txt(url.searchParams.get("to")||from,7);
   if(!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to))throw new Error("Invalid financial period.");
   const configuredStart=await adminRead("settings/accountingStartMonth"),balanceFrom=String(configuredStart||from);
   if(!/^\d{4}-\d{2}$/.test(balanceFrom))throw new Error("تاريخ بداية الدفاتر المحاسبية غير مضبوط. راجع إعدادات النظام المالي.");
   const startDate=new Date(balanceFrom+"-01T00:00:00Z"),fromDate=new Date(from+"-01T00:00:00Z"),toDate=new Date(to+"-01T00:00:00Z");
   const diff=(toDate.getUTCFullYear()-startDate.getUTCFullYear())*12+toDate.getUTCMonth()-startDate.getUTCMonth();
   const periodDiff=(toDate.getUTCFullYear()-fromDate.getUTCFullYear())*12+toDate.getUTCMonth()-fromDate.getUTCMonth();
   if(diff<0||periodDiff<0||diff>120||periodDiff>24)throw new Error("مدى التقرير غير صحيح. الحد الأقصى 24 شهرًا لحركة الفترة و120 شهرًا للأرصدة التراكمية.");
   const months=[],entries={},balanceEntries={};
   for(let i=0;i<=diff;i++){
    const d=new Date(Date.UTC(startDate.getUTCFullYear(),startDate.getUTCMonth()+i,1)),m=d.toISOString().slice(0,7);
    const monthly=(await adminRead("periods/"+m+"/entries"))||{};
    balanceEntries[m]=monthly;
    if(m>=from&&m<=to){months.push(m);entries[m]=monthly;}
   }
   return {months,entries,balanceEntries,accountingStartMonth:balanceFrom};
  }
  if(res==="party"){
   const requested=txt(url.searchParams.get("type")||"customer",32);
   const allowed=["customer","vendor","employeeCustody","employeeAdvance"];
   if(!allowed.includes(requested))throw new Error("Invalid analytic party type.");
   const partyId=id(url.searchParams.get("id"));
   return {entries:(await adminRead("partyLedger/"+requested+"/"+partyId))||{}};
  }
  if(res==="assignments"){
   requirePermission(profile,"financial","view");
   const assigned=(await adminRead("assignments/"+claims.sub))||{};
   const output=[];
   for(const [assignmentId,record] of Object.entries(assigned)){
    if(!record||record.assigneeUid!==claims.sub||record.status!=="open")continue;
    const invoice=await adminRead("documents/"+id(record.invoiceId));
    if(!invoice||invoice.type!=="invoice"||invoice.assignedTo!==claims.sub||invoice.status!=="assigned")continue;
    output.push({...record,id:assignmentId,invoice:{id:invoice.id,date:invoice.date,number:invoice.number,invoiceType:invoice.invoiceType,partyName:invoice.partyName,partyId:invoice.partyId,lines:invoice.lines||[],currency:invoice.currency||"EGP",total:invoice.total||0,projectCode:invoice.projectCode||""}});
   }
   return {items:output};
  }
  throw new Error("Unknown financial data resource.");
 }
 if(request.method!=="POST")throw new Error("Method not allowed.");const action=txt(body.action,40),now=Date.now();
 if(action==="ocr"||action==="ocrText"){
  requirePermission(profile,"financial","add");
  if(!env.AI)throw new Error("Workers AI is not enabled.");
  const textOnly=action==="ocrText",pageNumber=Math.max(1,Math.floor(Number(body.pageNumber)||1)),totalPages=Math.max(pageNumber,Math.floor(Number(body.totalPages)||pageNumber));
  let content;
  if(textOnly){
   const invoiceText=String(body.text||"").trim();
   if(invoiceText.length<20||invoiceText.length>36000)throw new Error("نص صفحة PDF فارغ أو أكبر من الحد المسموح.");
   content=[{type:"text",text:"PDF page text:\n"+invoiceText}];
  }else{
   const image=String(body.image||"");
   if(!/^data:image\/(png|jpeg|webp);base64,/i.test(image)||image.length>12*1024*1024)throw new Error("ارفع صورة JPG أو PNG أو WebP لا تتجاوز 9 MB.");
   content=[{type:"image_url",image_url:{url:image}}];
  }
  const accounts=Array.isArray(body.expenseAccounts)?body.expenseAccounts.slice(0,80).map(x=>({code:txt(x&&x.code,32),name:txt(x&&x.name,120)})).filter(x=>x.code&&x.name):[];
  const prompt="Read this Egyptian e-invoice page "+pageNumber+" of "+totalPages+". Return only valid JSON with fields type (purchase or sales or unknown), number, date YYYY-MM-DD, issuerName, issuerTaxNumber, recipientName, recipientTaxNumber, partyName, taxNumber, currency, netTotal, taxRate, taxAmount, total, discount, items array. IMPORTANT INVOICE NUMBER RULE: when the document contains the label 'Internal id :' (case-insensitive, with optional spaces and either colon style), the complete value immediately following that label is the invoice number. Copy that value exactly into number, preserving letters, digits, slashes and hyphens; stop only at the next printed field label. This value takes priority over any other serial, UUID, receipt ID or AI guess. The company's Egyptian tax registration number is "+COMPANY_TAX_REGISTRATION_NUMBER+". Read the two party blocks separately: Issuer (From) is the document issuer/seller; Recipients (To) is the recipient/buyer. Determine direction from exact tax-number match: when the company number appears in Recipients (To), this is a PURCHASE invoice received by the company from the Issuer; when the company number appears in Issuer (From), this is a SALES invoice issued by the company to the Recipient. In these cases set type accordingly, and set partyName and taxNumber to the OTHER party (supplier for purchase, customer for sales), not our own company. Do not infer direction from words like Total Sales Amount, item descriptions, or filename. If neither party tax number matches the company number, return the separately extracted issuer/recipient fields and use explicit invoice roles only; otherwise type=unknown. Each item must include description, quantity, unit, unitPrice, discount, kind (stock or service), itemCode if printed, and suggestedExpenseCode if it is an expense and a matching code exists in the allowed account list. Classify as stock ONLY goods that should enter inventory for resale or production. Classify maintenance, repairs, training, cleaning, pantry, hospitality, stationery, office supplies, transport, utilities, consulting and similar consumed services/costs as service. Allowed expense accounts: "+JSON.stringify(accounts)+". Select suggestedExpenseCode only from this list. This is one page of a possibly multi-page invoice: extract header fields when visible and only the line items actually visible on this page. Do not invent unreadable values. Preserve Arabic and English. Human review is mandatory.";
  const messages=[{role:"user",content:[{type:"text",text:prompt},...content]}];
  const out=await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct",{messages,max_tokens:2200,temperature:0.1});
  let raw=String(out&&out.response||"").trim();const first=raw.indexOf("{"),last=raw.lastIndexOf("}");
  if(first<0||last<=first)throw new Error("تعذر استخراج بيانات واضحة من الفاتورة. أدخل البيانات يدويًا.");
  let data;try{data=JSON.parse(raw.slice(first,last+1));}catch(_){throw new Error("نتيجة قراءة الفاتورة غير مكتملة. أدخل البيانات يدويًا.");}
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("نتيجة قراءة الفاتورة غير صالحة.");
  const etaParties=textOnly?extractEtaInvoiceParties(body.text):{};
  const internalInvoiceNumber=textOnly?extractInternalInvoiceNumber(body.text):"";
  if(internalInvoiceNumber)data.number=internalInvoiceNumber;
  ["issuerName","issuerTaxNumber","recipientName","recipientTaxNumber"].forEach(key=>{if(etaParties[key])data[key]=etaParties[key];else if(key.endsWith("TaxNumber"))data[key]=normalizeTaxRegistrationNumber(data[key]);});
  const issuerIsCompany=normalizeTaxRegistrationNumber(data.issuerTaxNumber)===COMPANY_TAX_REGISTRATION_NUMBER;
  const recipientIsCompany=normalizeTaxRegistrationNumber(data.recipientTaxNumber)===COMPANY_TAX_REGISTRATION_NUMBER;
  if(issuerIsCompany&&!recipientIsCompany){data.type="sales";data.partyName=data.recipientName||data.partyName||"";data.taxNumber=data.recipientTaxNumber||data.taxNumber||"";data.companyPartyRole="issuer";}
  else if(recipientIsCompany&&!issuerIsCompany){data.type="purchase";data.partyName=data.issuerName||data.partyName||"";data.taxNumber=data.issuerTaxNumber||data.taxNumber||"";data.companyPartyRole="recipient";}
  return {success:true,extracted:data,needsHumanReview:true,pageNumber,totalPages,model:"llama-4-scout-17b-16e-instruct"};
 }
 if(action==="saveMaster"){
  const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];
  if(!allowed.includes(kind))throw new Error("Unsupported master data type.");
  const item=body.item||{},code=id(item.code),originalCode=body.originalCode?id(body.originalCode):code;
  const permissionModule=body.permissionModule==="master"?"master":"financial";
  let previous=body.originalCode?await adminRead(kind+"/"+originalCode):null;
  if(body.originalCode&&!previous&&kind==="parties"&&adminReadRoot){
   previous=await adminReadRoot("clients/"+originalCode)||await adminReadRoot("vendors/"+originalCode);
  }
  if(body.originalCode&&!previous)throw new Error("السجل المراد تعديله لم يعد موجودًا. حدّث القائمة ثم حاول مرة أخرى.");
  const sameKey=Boolean(body.originalCode)&&originalCode===code;
  const target=sameKey?previous:await adminRead(kind+"/"+code);
  if(target&&!sameKey)throw new Error("الكود الجديد مستخدم بالفعل. اختر كودًا غير مستخدم.");
  if(!txt(item.name,180))throw new Error("الاسم مطلوب");
  requirePermission(profile,permissionModule,previous?"edit":"add");
  if(!previous&&target&&kind!=="parties")throw new Error("هذا الكود مسجل بالفعل. اختر كودًا آخر حتى لا يتم استبدال بياناته.");
  if(previous&&!sameKey){
   const usages=await findMasterReferences(ctx,kind,originalCode,previous.partyType||item.partyType||"");
   if(usages.length)throw new Error("لا يمكن تغيير الكود "+originalCode+" لأنه مرتبط بـ: "+usages.join("، ")+". يمكنك تعديل الاسم وباقي البيانات مع الاحتفاظ بالكود حتى لا تتأثر الحركات والتقارير.");
  }
  if(kind==="chartOfAccounts"){
   if(!["asset","liability","equity","revenue","expense"].includes(item.type)||!["debit","credit"].includes(item.nature))throw new Error("نوع أو طبيعة الحساب غير صحيحة");
   if(item.isGroup&&item.allowPosting)throw new Error("الحساب التجميعي لا يقبل الترحيل");
   if(item.parentCode){const parent=await adminRead("chartOfAccounts/"+id(item.parentCode));if(!parent||!parent.isGroup)throw new Error("الحساب الأب يجب أن يكون مجموعة");}
  }
  if(kind==="items"){
   if(!["stock","consumable","spare_part","finished_good","raw_material","office_supply"].includes(item.itemType||"stock"))throw new Error("حدد تصنيف الصنف المخزني.");
   if(item.groupCode){const group=await adminRead("itemGroups/"+id(item.groupCode));if(!group)throw new Error("مجموعة الصنف غير موجودة. أضف المجموعة أولاً.");}
  }
  if(kind==="itemGroups"&& !["raw_material","finished_good","spare_part","consumable","office_supply","packaging","other"].includes(item.groupType||"other"))throw new Error("حدد نوع مجموعة الأصناف.");
  if(kind==="taxCodes"){
   if(!["vat_input","vat_output","withholding","addition"].includes(item.taxType))throw new Error("حدد نوع الضريبة بصورة صحيحة.");
   const rate=Number(item.rate);if(!Number.isFinite(rate)||rate<0||rate>100)throw new Error("نسبة الضريبة يجب أن تكون من 0 إلى 100.");
  }
  if(kind==="bankAccounts"){const account=await adminRead("chartOfAccounts/"+id(item.accountCode||code));if(!account||account.isGroup||account.active===false||account.type!=="asset")throw new Error("اربط حساب البنك بحساب أصول نشطًا وقابلًا للترحيل في دليل الحسابات.");}
  let saved={...(previous||{}),...item,code,name:txt(item.name,180),active:item.active!==false,createdAt:(previous&&previous.createdAt)||item.createdAt||now,createdBy:(previous&&previous.createdBy)||item.createdBy||claims.sub,updatedAt:now,updatedBy:claims.sub};
  const audit={action:previous?"update_master":"save_master",kind,code,originalCode:previous?originalCode:"",uid:claims.sub,createdAt:now};
  let linkedExisting=false;
  const updates={};
  if(kind==="parties"){
   if(!["customer","vendor"].includes(item.partyType))throw new Error("حدد نوع الطرف: عميل أو مورد.");
   if(!txt(item.code,120)||!txt(item.name,180))throw new Error("كود واسم المورد/العميل مطلوبان.");
   if(!adminReadRoot||!adminPatchRoot)throw new Error("خدمة سجل العملاء والموردين غير متاحة.");
   const [currentCustomer,currentVendor,targetCustomer,targetVendor]=await Promise.all([
    adminReadRoot("clients/"+originalCode),adminReadRoot("vendors/"+originalCode),
    sameKey?Promise.resolve(null):adminReadRoot("clients/"+code),sameKey?Promise.resolve(null):adminReadRoot("vendors/"+code)
   ]);
   const correctParty=item.partyType==="customer"?currentCustomer:currentVendor;
   const oppositeParty=item.partyType==="customer"?currentVendor:currentCustomer;
   if(targetCustomer||targetVendor)throw new Error("الكود الجديد مستخدم بالفعل في سجل العملاء أو الموردين.");
   if(oppositeParty)throw new Error("هذا الكود مستخدم بالفعل في سجل "+(item.partyType==="customer"?"الموردين":"العملاء")+".");
   const partyNameOf=p=>String(p&&(p.name||p.companyName||p.legalName||p.supplierName||p.vendorName||p.customerName||p.clientName)||"").trim();
   const taxOf=p=>String(p&&(p.taxNumber||p.taxRegistrationNumber||p.registrationNumber||p.registrationNo||p.vatNumber||p.taxId)||"").replace(/[^0-9]/g,"");
   const mergedPrevious=previous||correctParty||{};
   if(mergedPrevious.partyType&&mergedPrevious.partyType!==item.partyType)throw new Error("لا يمكن تحويل سجل العميل إلى مورد أو العكس بعد إنشائه؛ أنشئ سجلًا جديدًا بالنوع الصحيح.");
   if(!previous&&partyNameOf(correctParty)&&partyNameOf(correctParty)!==txt(item.name,180)&&!(taxOf(correctParty)&&taxOf(item)&&taxOf(correctParty)===taxOf(item)))throw new Error("كود المورد/العميل موجود باسم أو رقم ضريبي مختلف في السجل الرئيسي.");
   linkedExisting=Boolean(correctParty&&!previous);
   const supplied=Object.fromEntries(Object.entries(item).filter(([,value])=>value!==undefined&&value!==null&&value!==""));
   saved={...(correctParty||{}),...(previous||{}),...supplied,code,name:txt(item.name,180),partyType:item.partyType,active:item.active!==false,createdAt:(previous&&previous.createdAt)||(correctParty&&correctParty.createdAt)||now,createdBy:(previous&&previous.createdBy)||(correctParty&&correctParty.createdBy)||claims.sub,updatedAt:now,updatedBy:claims.sub};
   if(!saved.taxNumber&&saved.taxRegistrationNumber)saved.taxNumber=saved.taxRegistrationNumber;
   if(!saved.taxRegistrationNumber&&saved.taxNumber)saved.taxRegistrationNumber=saved.taxNumber;
   const root=saved.partyType==="customer"?"clients":"vendors";
   saved.companyName=saved.companyName||saved.name;
   if(previous&&!sameKey){
    await adminPatchRoot({[root+"/"+code]:saved,[root+"/"+originalCode]:null});
   }else{
    await adminPutRoot(root+"/"+code,saved);
   }
   updates["parties/"+code]=saved;
   if(previous&&!sameKey)updates["parties/"+originalCode]=null;
  }else{
   updates[kind+"/"+code]=saved;
   if(previous&&!sameKey)updates[kind+"/"+originalCode]=null;
  }
  updates["audit/"+uid("AUD")]=audit;
  await adminPatch(updates);
  const persisted=await adminRead(kind+"/"+code);
  if(!persisted||String(persisted.code||code)!==code)throw new Error("تعذر التأكد من حفظ السجل. حدّث القائمة قبل إعادة المحاولة.");
  return {success:true,item:saved,linkedExisting:kind==="parties"&&linkedExisting,created:!previous};
 }
 if(action==="deleteMaster"){
  const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];
  if(!allowed.includes(kind))throw new Error("Unsupported master data type.");
  const code=id(body.code),permissionModule=body.permissionModule==="master"?"master":"financial";
  let existing=await adminRead(kind+"/"+code);
  let crmCustomer=null,crmVendor=null;
  if(kind==="parties"&&adminReadRoot){
   [crmCustomer,crmVendor]=await Promise.all([adminReadRoot("clients/"+code),adminReadRoot("vendors/"+code)]);
   existing=existing||crmCustomer||crmVendor;
  }
  if(!existing)throw new Error("السجل غير موجود أو تم حذفه بالفعل.");
  requirePermission(profile,permissionModule,"delete");
  const partyType=existing.partyType||(crmVendor?"vendor":"customer");
  const usages=await findMasterReferences(ctx,kind,code,partyType);
  const now=Date.now();
  const updated={...existing,code,active:false,updatedAt:now,updatedBy:claims.sub};
  if(usages.length){
   updated.deactivatedAt=now;updated.deactivatedBy=claims.sub;
   const updates={};
   updates[kind+"/"+code]=updated;
   updates["audit/"+uid("AUD")]={action:"deactivate_master",kind,code,uid:claims.sub,createdAt:now,references:usages};
   if(kind==="parties"){
    const root=partyType==="vendor"?"vendors":"clients";
    if(!adminPatchRoot)throw new Error("خدمة سجل العملاء والموردين غير متاحة.");
    await adminPatchRoot({[root+"/"+code]:updated});
   }
   await adminPatch(updates);
   return {success:true,deleted:false,deactivated:true,code,references:usages,item:updated};
  }
  const updates={[kind+"/"+code]:null};
  updates["audit/"+uid("AUD")]={action:"delete_master",kind,code,uid:claims.sub,createdAt:now};
  if(kind==="parties"){
   if(!adminPatchRoot)throw new Error("خدمة سجل العملاء والموردين غير متاحة.");
   await adminPatchRoot({["clients/"+code]:null,["vendors/"+code]:null});
  }
  await adminPatch(updates);
  return {success:true,deleted:true,deactivated:false,code,references:[]};
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
  const otherLegacy=partyRoot&&adminReadRoot?(await adminReadRoot(partyRoot==="clients"?"vendors":"clients"))||{}:{};
  let count=0;
  for(let i=0;i<sourceRows.length;i++){
   const row=sourceRows[i]||{},code=id(row.code),name=txt(row.name,180);
   if(!name)throw new Error("الصف "+(i+2)+": الاسم مطلوب.");
   if(seen.has(code)||existing[code]||(legacy&&legacy[code])||(otherLegacy&&otherLegacy[code]))throw new Error("الصف "+(i+2)+": الكود "+code+" موجود بالفعل أو مكرر في سجل العملاء/الموردين أو الملف.");
   seen.add(code);
   if(kind==="chartOfAccounts"){
    if(!["asset","liability","equity","revenue","expense"].includes(row.type)||!["debit","credit"].includes(row.nature))throw new Error("الصف "+(i+2)+": نوع أو طبيعة الحساب غير صحيحة.");
    if(row.parentCode){const parent=await adminRead("chartOfAccounts/"+id(row.parentCode));if(!parent||!parent.isGroup)throw new Error("الصف "+(i+2)+": الحساب الأب يجب أن يكون مجموعة موجودة.");}
    if(row.isGroup===true||String(row.isGroup).toLowerCase()==="true"||String(row.isGroup)==="1")row.isGroup=true;else row.isGroup=false;
   }
   if(kind==="items"){
    if(!["stock","consumable","spare_part","finished_good","raw_material","office_supply"].includes(row.itemType||"stock"))throw new Error("الصف "+(i+2)+": تصنيف الصنف المخزني غير صحيح.");
    if(row.groupCode&&!groups[row.groupCode])throw new Error("الصف "+(i+2)+": مجموعة الصنف "+row.groupCode+" غير موجودة.");
   }
   if(kind==="itemGroups"&&!["raw_material","finished_good","spare_part","consumable","office_supply","packaging","other"].includes(row.groupType||"other"))throw new Error("الصف "+(i+2)+": نوع مجموعة الأصناف غير صحيح.");
   if(kind==="bankAccounts"){const account=await adminRead("chartOfAccounts/"+id(row.accountCode||code));if(!account||account.isGroup||account.active===false)throw new Error("الصف "+(i+2)+": حساب البنك المحاسبي غير موجود أو غير قابل للترحيل.");}
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
  requirePermission(profile,"financial","add");let previous=null;const journalId=id(body.id||uid("DOC"));if(body.id){previous=await adminRead("documents/"+journalId);if(!previous||previous.type!=="journal"||!["needs_correction","draft","returned_to_creator"].includes(previous.status)||previous.createdBy!==claims.sub)throw new Error("لا يمكن تعديل هذا القيد: قد يكون غير موجود أو أُرسل للمراجعة أو تم اعتماده.");}const j={id:journalId,type:"journal",date:date(body.date),description:txt(body.description,500),reference:txt(body.reference,120),currency:txt(body.currency||"EGP",3),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:previous&&previous.createdAt||now,createdBy:previous&&previous.createdBy||claims.sub,createdByName:previous&&previous.createdByName||txt(profile.fullName||profile.username||profile.email,120)};
  if(j.currency!=="EGP")throw new Error("القيود متعددة العملات وأسعار الصرف غير مفعّلة بعد. استخدم الجنيه المصري حتى لا تختلط أرصدة العملات في القوائم.");
  if(body.id){
   const previous=await adminRead("documents/"+j.id);
   if(previous&&(!["needs_correction","draft","returned_to_creator"].includes(previous.status)||previous.createdBy!==claims.sub))throw new Error("لا يمكن تعديل هذا القيد بعد إرساله أو اعتماده.");
  }
  const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},v=validateJournal(j,chart,centers);j.errors=v.errors;j.balance=v.balance;j.status=v.errors.length?"needs_correction":"pending_review";const u={};u["documents/"+j.id]=j;u["reviewQueue/"+j.id]=v.errors.length?null:reviewRecord(j);u["audit/"+uid("AUD")]={action:"submit_journal",documentId:j.id,status:j.status,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,id:j.id,status:j.status,errors:v.errors,balance:v.balance};
 }
 if(action==="saveInvoiceDraft"){
  requirePermission(profile,"financial","add");
  const direction=body.type;
  if(!["purchase","sales"].includes(direction))throw new Error("حدد نوع الفاتورة أولاً: مشتريات أو مبيعات.");
  const draftId=id(body.id||uid("INV")),previous=body.id?await adminRead("documents/"+draftId):null;
  if(previous&&(!(previous.type==="invoice"&&["draft","needs_correction","returned_to_creator"].includes(previous.status))||previous.createdBy!==claims.sub))throw new Error("لا يمكن تعديل هذه الفاتورة في حالتها الحالية.");
  const inv={...body,id:draftId,type:"invoice",invoiceType:direction,date:date(body.date),number:txt(body.number,120),partyId:txt(body.partyId,120),partyName:txt(body.partyName,180),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:previous&&previous.createdAt||now,createdBy:previous&&previous.createdBy||claims.sub,createdByName:previous&&previous.createdByName||txt(profile.fullName||profile.username||profile.email,120),status:"draft"};
  if(previous&&previous.returnedTaskId)inv.returnedTaskId=previous.returnedTaskId;
  if(previous&&previous.attachments)inv.attachments=previous.attachments;
  if(previous&&previous.returnedTaskId)inv.returnedTaskId=previous.returnedTaskId;
  if(previous)for(const field of ["attachmentUploadStatus","attachmentFileName","attachmentUploadError"])if(previous[field])inv[field]=previous[field];
  inv.errors=[];
  if(!inv.partyId)inv.errors.push("اختيار العميل أو المورد مطلوب");
  if(!inv.number)inv.errors.push("رقم الفاتورة مطلوب");
  if(!inv.lines.length)inv.errors.push("أضف بندًا واحدًا على الأقل");
  inv.lines.forEach((line,index)=>{
   if(!txt(line.description,250))inv.errors.push("وصف البند "+(index+1)+" مطلوب");
   if(!(Number(line.quantity)>0))inv.errors.push("الكمية غير صحيحة في البند "+(index+1));
   if(!["stock","service"].includes(line.kind))inv.errors.push("حدد طبيعة البند "+(index+1));
   if(line.kind==="stock"&&!line.itemCode)inv.errors.push("يحتاج البند "+(index+1)+" إلى كود مخزني");
  });
  const updates={};updates["documents/"+draftId]=inv;updates["reviewQueue/"+draftId]=null;
  updates["audit/"+uid("AUD")]={action:"save_invoice_draft",documentId:draftId,uid:claims.sub,createdAt:now};
  await adminPatch(updates);
  return {success:true,id:draftId,status:"draft",errors:inv.errors};
 }
 if(action==="assignInvoice"){
  requirePermission(profile,"financial","add");
  const invoiceId=id(body.invoiceId),invoice=await adminRead("documents/"+invoiceId);
  if(!invoice||invoice.type!=="invoice")throw new Error("الفاتورة المطلوب تحويلها غير موجودة.");
  if(invoice.createdBy!==claims.sub&&profile.role!=="admin")throw new Error("لا يمكنك تحويل فاتورة أنشأها مستخدم آخر.");
  if(!["draft","needs_correction","returned_to_creator"].includes(invoice.status))throw new Error("لا يمكن تحويل الفاتورة في حالتها الحالية.");
  const assigneeUid=id(body.assigneeUid),assignee=adminReadRoot?await adminReadRoot("users/"+assigneeUid):null;
  if(!assignee||!["active","نشط","مفعل","enabled"].includes(String(assignee.status||"").toLowerCase()))throw new Error("المستخدم المحدد غير نشط أو غير موجود.");
  if(assigneeUid===claims.sub)throw new Error("اختر مستخدمًا آخر لاستكمال الفاتورة.");
  const instruction=txt(body.instruction||"مراجعة تصنيف البنود وتحديد الأكواد المخزنية أو حسابات المصروفات",700);
  const taskId=uid("FIN-TASK"),assignmentId=uid("ASN"),createdByName=txt(profile.fullName||profile.username||profile.email,120),assigneeName=txt(assignee.fullName||assignee.username||assignee.email||assigneeUid,120);
  const assignment={id:assignmentId,invoiceId,assigneeUid,assigneeName,createdBy:claims.sub,createdByName,instruction,status:"open",taskId,createdAt:now,invoiceNumber:invoice.number||"",invoiceType:invoice.invoiceType||"purchase",partyName:invoice.partyName||"",date:invoice.date||""};
  const task={id:taskId,title:"استكمال تصنيف فاتورة "+(invoice.number||invoiceId),description:instruction,status:"open",createdAt:now,createdBy:claims.sub,createdByName,kind:"financialAssignment",financialAssignmentId:assignmentId,sourceInvoiceId:invoiceId,assigneeUid};
  const updates={};
  updates["documents/"+invoiceId+"/status"]="assigned";
  updates["documents/"+invoiceId+"/assignedTo"]=assigneeUid;
  updates["documents/"+invoiceId+"/assignmentId"]=assignmentId;
  updates["documents/"+invoiceId+"/assignedAt"]=now;
  updates["reviewQueue/"+invoiceId]=null;
  updates["assignments/"+assigneeUid+"/"+assignmentId]=assignment;
  updates["audit/"+uid("AUD")]={action:"assign_invoice",documentId:invoiceId,assignmentId,assigneeUid,uid:claims.sub,createdAt:now};
  if(!adminPatchRoot)throw new Error("خدمة تحويل المهام غير متاحة.");
  updates["tasks/"+assigneeUid+"/"+taskId]=task;
  updates["cashCustodyNotifications/"+assigneeUid+"/"+assignmentId]={id:assignmentId,type:"financialAssignment",recipientUid:assigneeUid,assignmentId,invoiceId,senderUid:claims.sub,senderName:createdByName,title:"فاتورة محولة إليك",description:instruction,createdAt:now,read:false};
  const globalUpdates={};Object.entries(updates).forEach(([key,value])=>globalUpdates[key.startsWith("documents/")||key.startsWith("reviewQueue/")||key.startsWith("assignments/")||key.startsWith("audit/")?"financial/"+key:key]=value);
  await adminPatchRoot(globalUpdates);
  return {success:true,id:invoiceId,assignmentId,taskId,status:"assigned",pushNotification:{recipientUid:assigneeUid,eventType:"financialAssignment",eventId:assignmentId,content:{title:"فاتورة محولة إليك",body:"مطلوب: "+instruction}}};
 }
 if(action==="completeInvoiceAssignment"){
  if(!hasPermission(profile,"financial","add")&&!hasPermission(profile,"financial","edit"))throw new Error("Permission denied: financial.add or financial.edit.");
  const assignmentId=id(body.assignmentId),assignment=await adminRead("assignments/"+claims.sub+"/"+assignmentId);
  if(!assignment||assignment.assigneeUid!==claims.sub||assignment.status!=="open")throw new Error("المهمة غير موجودة أو تم إغلاقها بالفعل.");
  const invoice=await adminRead("documents/"+id(assignment.invoiceId));
  if(!invoice||invoice.status!=="assigned"||invoice.assignedTo!==claims.sub||invoice.assignmentId!==assignmentId)throw new Error("الفاتورة لم تعد في عهدة هذا المستخدم.");
  const chart=(await adminRead("chartOfAccounts"))||{},items=(await adminRead("items"))||{},groups=(await adminRead("itemGroups"))||{};
  const changes=Array.isArray(body.lines)?body.lines.slice(0,100):[],seen=new Set(),nextLines=(invoice.lines||[]).map(line=>({...line}));
  if(!changes.length)throw new Error("لم يتم تحديد أي تصنيف أو أكواد لإرجاعها.");
  for(const change of changes){
   const index=Math.floor(Number(change.index));
   if(!Number.isInteger(index)||index<0||index>=nextLines.length||seen.has(index))throw new Error("ترقيم بند الفاتورة غير صحيح.");
   seen.add(index);
   const kind=change.kind;
   if(!["stock","service"].includes(kind))throw new Error("حدد البند كبضاعة مخزنية أو مصروف/خدمة.");
   const line=nextLines[index];line.kind=kind;
   if(kind==="stock"){
    const itemCode=txt(change.itemCode||line.itemCode,120),item=items[itemCode];
    if(!item)throw new Error("كود الصنف "+itemCode+" غير موجود. أنشئ الصنف أولاً ثم أعد المحاولة.");
    if(change.groupCode&&!groups[id(change.groupCode)])throw new Error("مجموعة الصنف المحددة غير موجودة.");
    line.itemCode=itemCode;line.groupCode=txt(change.groupCode||item.groupCode||"",120);line.itemType=item.itemType||change.itemType||"stock";line.warehouseCode=txt(change.warehouseCode||line.warehouseCode||"default",120);
   }else{
    const accountCode=id(change.accountCode||line.accountCode||"6100"),account=chart[accountCode];
    if(invoice.invoiceType==="purchase"&&(!account||account.isGroup||account.active===false||account.type!=="expense"))throw new Error("اختر حساب مصروف نشطًا لهذا البند.");
    if(invoice.invoiceType==="sales"&&(!account||account.isGroup||account.active===false||account.type!=="revenue"))throw new Error("اختر حساب إيراد نشطًا لهذا البند.");
    if(invoice.invoiceType==="purchase")line.accountCode=accountCode;else line.incomeAccountCode=accountCode;
    line.itemCode="";
   }
  }
  const nowCompleted=Date.now(),ownerUid=assignment.createdBy,ownerTaskId=uid("FIN-TASK");
  const returnedTask={id:ownerTaskId,title:"اكتمل استكمال الفاتورة "+(invoice.number||invoice.id),description:"قام "+txt(profile.fullName||profile.username||profile.email,120)+" باستكمال التصنيف والأكواد. راجع المسودة ثم أرسلها للمراجعة.",status:"open",createdAt:nowCompleted,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120),kind:"financialAssignmentReturned",financialAssignmentId:assignmentId,sourceInvoiceId:invoice.id,assigneeUid:ownerUid};
  const rootUpdates={};
  rootUpdates["financial/documents/"+invoice.id+"/lines"]=nextLines;
  rootUpdates["financial/documents/"+invoice.id+"/status"]="returned_to_creator";
  rootUpdates["financial/reviewQueue/"+invoice.id]=null;
  rootUpdates["financial/documents/"+invoice.id+"/assignedTo"]=null;
  rootUpdates["financial/documents/"+invoice.id+"/assignmentReturnedAt"]=nowCompleted;
  rootUpdates["financial/documents/"+invoice.id+"/lastAssignedTo"]=claims.sub;
  rootUpdates["financial/assignments/"+claims.sub+"/"+assignmentId+"/status"]="completed";
  rootUpdates["financial/assignments/"+claims.sub+"/"+assignmentId+"/completedAt"]=nowCompleted;
  rootUpdates["financial/assignments/"+claims.sub+"/"+assignmentId+"/completedBy"]=claims.sub;
  rootUpdates["financial/audit/"+uid("AUD")]={action:"complete_invoice_assignment",documentId:invoice.id,assignmentId,uid:claims.sub,createdAt:nowCompleted};
  if(assignment.taskId)rootUpdates["tasks/"+claims.sub+"/"+assignment.taskId+"/status"]="completed";
  rootUpdates["tasks/"+ownerUid+"/"+ownerTaskId]=returnedTask;
  rootUpdates["cashCustodyNotifications/"+ownerUid+"/"+ownerTaskId]={id:ownerTaskId,type:"financialAssignmentReturned",recipientUid:ownerUid,assignmentId,invoiceId:invoice.id,senderUid:claims.sub,senderName:txt(profile.fullName||profile.username||profile.email,120),title:"اكتمل استكمال الفاتورة",description:"عاد المستند إلى مسوداتك للمراجعة والإرسال.",createdAt:nowCompleted,read:false};
  rootUpdates["financial/documents/"+invoice.id+"/returnedTaskId"]=ownerTaskId;
  await adminPatchRoot(rootUpdates);
  return {success:true,id:invoice.id,assignmentId,status:"returned_to_creator",pushNotification:{recipientUid:ownerUid,eventType:"financialAssignmentReturned",eventId:invoice.id,content:{title:"اكتمل استكمال الفاتورة",body:"عاد المستند إلى مسوداتك للمراجعة والإرسال."}}};
 }
 if(action==="submitInvoice"){
  requirePermission(profile,"financial","add");if(!["purchase","sales"].includes(body.type))throw new Error("حدد هل الفاتورة مشتريات من مورد أم مبيعات لعميل.");const inv={...body,id:id(body.id||uid("INV")),type:"invoice",invoiceType:body.type,date:date(body.date),number:txt(body.number,120),partyId:txt(body.partyId,120),partyName:txt(body.partyName,180),currency:txt(body.currency||"EGP",3),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120)},errors=[];
  if(body.taxCode){
   const taxCode=await adminRead("taxCodes/"+id(body.taxCode)),expectedTaxType=inv.invoiceType==="purchase"?"vat_input":"vat_output";
   if(!taxCode||taxCode.active===false||taxCode.taxType!==expectedTaxType)errors.push("كود ضريبة القيمة المضافة لا يتوافق مع نوع الفاتورة أو أنه غير نشط.");
   else if(taxCode.effectiveFrom&&inv.date<String(taxCode.effectiveFrom))errors.push("كود الضريبة "+taxCode.code+" غير سارٍ بتاريخ الفاتورة. تاريخ بداية السريان: "+taxCode.effectiveFrom);
   else{inv.taxCode=taxCode.code||body.taxCode;inv.taxType=taxCode.taxType;inv.taxRate=num(taxCode.rate||0);}
  }
  else if(Number(inv.taxRate||0)>0||Number(inv.taxAmount||0)>0)errors.push("يجب اختيار كود ضريبي نشط من نوع مدخلات للمشتريات أو مخرجات للمبيعات، ومطابق لتاريخ الفاتورة ونسبتها.");
  if(inv.currency!=="EGP")errors.push("لا يمكن ترحيل فاتورة بعملة أجنبية قبل تفعيل أسعار الصرف وإعادة تقييم أرصدة العملات. اختر الجنيه المصري أو اترك المستند مسودة.");
  if(!inv.partyId)errors.push("اختيار العميل أو المورد مطلوب");
  else{
   const expectedPartyType=inv.invoiceType==="purchase"?"vendor":"customer",masterParty=await adminRead("parties/"+id(inv.partyId));
   const legacyParty=adminReadRoot?await adminReadRoot((expectedPartyType==="vendor"?"vendors/":"clients/")+id(inv.partyId)):null;
   const oppositeParty=adminReadRoot?await adminReadRoot((expectedPartyType==="vendor"?"clients/":"vendors/")+id(inv.partyId)):null;
   const party=masterParty&&masterParty.partyType===expectedPartyType?masterParty:legacyParty;
   if(oppositeParty&&!legacyParty)errors.push("نوع الطرف المحدد لا يتوافق مع نوع الفاتورة.");
   else if(!party)errors.push("المورد أو العميل غير مسجل في البيانات الأساسية بالنوع الصحيح.");
   else{
    inv.partyName=txt(party.name||party.companyName||party.legalName||party.supplierName||party.vendorName||party.customerName||party.clientName||inv.partyName,180);
    inv.partyTaxNumber=party.taxNumber||party.taxRegistrationNumber||party.registrationNumber||party.registrationNo||party.vatNumber||party.taxId||inv.partyTaxNumber||"";
   }
  }
  if(!inv.number)errors.push("رقم الفاتورة مطلوب");if(!inv.lines.length)errors.push("أضف بندًا واحدًا على الأقل");
  const invoiceChart=(await adminRead("chartOfAccounts"))||{};
  inv.lines.forEach((l,i)=>{
   if(!txt(l.description,250))errors.push("وصف البند "+(i+1)+" مطلوب");
   if(!["stock","service"].includes(l.kind))errors.push("حدد طبيعة البند "+(i+1)+" هل هو مخزني أم مصروف/خدمة");
   if(!(Number(l.quantity)>0))errors.push("الكمية غير صحيحة في البند "+(i+1));
   if(l.kind==="stock"&&!l.itemCode)errors.push("حدد الصنف المخزني في البند "+(i+1));
   if(l.kind==="service"){
    const expectedType=inv.invoiceType==="purchase"?"expense":"revenue";
    const code=txt(inv.invoiceType==="purchase"?(l.accountCode||"6100"):(l.incomeAccountCode||"4200"),32);
    const account=invoiceChart[code];
    if(!account||account.isGroup||account.active===false||account.type!==expectedType)errors.push("حدد حساب "+(expectedType==="expense"?"مصروف صحيح":"إيراد صحيح")+" للبند "+(i+1));
   }
  });
  let previous=null;
  if(body.id){
   previous=await adminRead("documents/"+inv.id);
   if(!previous||previous.type!=="invoice"||!["needs_correction","draft","returned_to_creator"].includes(previous.status)||previous.createdBy!==claims.sub)throw new Error("لا يمكن تعديل هذه الفاتورة: قد تكون غير موجودة أو أُرسلت للمراجعة أو تم اعتمادها.");
   inv.createdAt=previous.createdAt||inv.createdAt;
   inv.createdBy=previous.createdBy||inv.createdBy;
   inv.createdByName=previous.createdByName||inv.createdByName||"";
   if(previous.attachments)inv.attachments=previous.attachments;
   if(previous.returnedTaskId)inv.returnedTaskId=previous.returnedTaskId;
   for(const field of ["attachmentUploadStatus","attachmentFileName","attachmentUploadError"])if(previous[field])inv[field]=previous[field];
  }
  const totals=invoiceTotals(inv);inv.totals=totals;inv.total=totals.total;inv.errors=errors;inv.fingerprint=await sha([inv.invoiceType,inv.partyId,inv.number,inv.date,totals.total.toFixed(2)].join("|").toLowerCase());const duplicate=await adminRead("documentFingerprints/"+inv.fingerprint);inv.duplicateOf=duplicate&&duplicate.documentId||"";inv.warnings=duplicate?["مستند مشابه مسجل سابقًا: "+duplicate.documentId]:[];inv.status=errors.length?"needs_correction":duplicate?"duplicate_review":"pending_review";
  const u={};u["documents/"+inv.id]=inv;u["reviewQueue/"+inv.id]=errors.length?null:reviewRecord(inv);u["audit/"+uid("AUD")]={action:"submit_invoice",documentId:inv.id,status:inv.status,uid:claims.sub,createdAt:now};await adminPatch(u);if(!errors.length&&previous&&previous.returnedTaskId&&adminPatchRoot){const taskUpdates={};taskUpdates["tasks/"+claims.sub+"/"+id(previous.returnedTaskId)+"/status"]="completed";taskUpdates["tasks/"+claims.sub+"/"+id(previous.returnedTaskId)+"/completedAt"]=now;taskUpdates["tasks/"+claims.sub+"/"+id(previous.returnedTaskId)+"/completedBy"]=claims.sub;await adminPatchRoot(taskUpdates);}return {success:true,id:inv.id,status:inv.status,errors,warnings:inv.warnings,totals};
 }
 if(action==="submitCash"){
  requirePermission(profile,"financial","add");
  const movementTypes=["customer_receipt","supplier_payment","other_receipt","other_payment","cash_to_bank","bank_to_cash","employee_custody","employee_custody_return","employee_advance","employee_advance_recovery"];
  const movementType=txt(body.movementType||"",40);
  if(!movementTypes.includes(movementType))throw new Error("حدد نوع حركة الخزينة.");
  const doc={...body,id:id(body.id||uid("CASH")),type:"cash",movementType,date:date(body.date),amount:num(body.amount),description:txt(body.description,500),reference:txt(body.reference||"",120),cashAccountCode:txt(body.cashAccountCode||"1110",32),createdAt:now,createdBy:claims.sub,status:"pending_review"};
  if(!doc.amount)throw new Error("أدخل مبلغًا صحيحًا.");
  if(doc.currency!=="EGP")throw new Error("القيود متعددة العملات وأسعار الصرف غير مفعّلة بعد. سجّل الحركة بالجنيه المصري حتى لا تختلط أرصدة العملات في القوائم المالية.");
  const chart=(await adminRead("chartOfAccounts"))||{};
  const requirePosting=(code,expected)=>{const account=chart[code];if(!account||account.isGroup||account.active===false||account.type!==expected)throw new Error("الحساب "+code+" غير صالح لهذه الحركة.");return account;};
  requirePosting(doc.cashAccountCode,"asset");
  if(["customer_receipt","supplier_payment"].includes(movementType)){
   doc.partyType=movementType==="customer_receipt"?"customer":"vendor";
   doc.partyId=id(body.partyId);
   doc.partyName=txt(body.partyName||"",180);
   const party=await adminRead("parties/"+doc.partyId),legacyParty=adminReadRoot?await adminReadRoot((doc.partyType==="vendor"?"vendors/":"clients/")+doc.partyId):null,oppositeParty=adminReadRoot?await adminReadRoot((doc.partyType==="vendor"?"clients/":"vendors/")+doc.partyId):null;
   if(oppositeParty&&!legacyParty)throw new Error("نوع الطرف المحدد لا يتوافق مع نوع حركة الخزينة.");
   if(!(party&&party.partyType===doc.partyType)&&!legacyParty)throw new Error("العميل أو المورد غير مسجل بالنوع الصحيح في البيانات الأساسية.");
   const savedParty=party&&party.partyType===doc.partyType?party:legacyParty;
   doc.partyName=txt(savedParty.name||savedParty.companyName||savedParty.legalName||savedParty.supplierName||savedParty.vendorName||savedParty.customerName||doc.partyName,180);
   requirePosting(doc.partyType==="customer"?"1210":"281",doc.partyType==="customer"?"asset":"liability");
  }
  if(movementType==="other_receipt"){
   doc.offsetAccountCode=id(body.offsetAccountCode||"");
   requirePosting(doc.offsetAccountCode,"revenue");
  }
  if(movementType==="other_payment"){
   doc.offsetAccountCode=id(body.offsetAccountCode||"");
   requirePosting(doc.offsetAccountCode,"expense");
  }
  if(["cash_to_bank","bank_to_cash"].includes(movementType)){
   doc.bankAccountCode=id(body.bankAccountCode||"1120");
   requirePosting(doc.bankAccountCode,"asset");
   if(doc.bankAccountCode===doc.cashAccountCode)throw new Error("اختر حساب خزينة وحساب بنك مختلفين لإجراء التحويل.");
  }
  if(["employee_custody","employee_custody_return","employee_advance","employee_advance_recovery"].includes(movementType)){
   if(profile.role!=="admin")throw new Error("تحويل العهد والسلف للعاملين متاح لمدير النظام أو مستخدم مخوّل من الإدارة.");
   doc.employeeUid=id(body.employeeUid);
   const employee=adminReadRoot?await adminReadRoot("users/"+doc.employeeUid):null;
   if(!employee||!["active","نشط","مفعل","enabled"].includes(String(employee.status||"").toLowerCase()))throw new Error("اختر مستخدمًا داخليًا نشطًا.");
   doc.employeeName=txt(employee.fullName||employee.username||employee.email||doc.employeeUid,120);
   const isCustody=movementType.startsWith("employee_custody");
   requirePosting(isCustody?"1220":"1230","asset");
   if(isCustody)doc.pairCustody=true;
  }
  if(["customer_receipt","supplier_payment"].includes(movementType)&&!doc.partyId)throw new Error("اختر العميل أو المورد.");
  const u={};u["documents/"+doc.id]=doc;u["reviewQueue/"+doc.id]=reviewRecord({...doc,title:doc.movementType+" — "+(doc.partyName||doc.employeeName||doc.description)});u["audit/"+uid("AUD")]={action:"submit_cash",movementType,documentId:doc.id,uid:claims.sub,createdAt:now};await adminPatch(u);
  return {success:true,id:doc.id,status:doc.status};
 }
 if(action==="submitBankImport"){
  requirePermission(profile,"financial","add");const importId=id(body.id||uid("BANK")),rows=Array.isArray(body.rows)?body.rows.slice(0,500):[];if(!rows.length)throw new Error("ملف البنك لا يحتوي على حركات");const u={},duplicates=[];let count=0;
  const bankCode=id(body.bankAccountCode||"1120"),bankAccount=await adminRead("chartOfAccounts/"+bankCode);
  if(!bankAccount||bankAccount.isGroup||bankAccount.active===false||bankAccount.type!=="asset")throw new Error("اختر حساب بنك نشطًا من حسابات الأصول قبل استيراد الكشف.");
  for(const row of rows){const d=date(row.date),amount=num(row.amount);if(!amount)continue;const fingerprint=await sha([txt(body.bankAccountCode||"1120",32),d,amount.toFixed(2),txt(row.reference,100),txt(row.description,500).toLowerCase().replace(/\s+/g," ")].join("|")),prev=await adminRead("bankFingerprints/"+fingerprint),docId=uid("BNK"),doc={id:docId,type:"bankLine",importId,date:d,amount,description:txt(row.description,500),reference:txt(row.reference,100),direction:row.direction==="in"?"in":"out",bankAccountCode:txt(body.bankAccountCode||"1120",32),fingerprint,status:prev?"duplicate_review":"pending_review",warnings:prev?["تكرار محتمل لحركة "+prev.documentId]:[],duplicateOf:prev&&prev.documentId||"",createdAt:now,createdBy:claims.sub};if(prev)duplicates.push(docId);else u["bankFingerprints/"+fingerprint]={documentId:docId,importId,createdAt:now};u["documents/"+docId]=doc;u["reviewQueue/"+docId]=reviewRecord(doc);count++;}
  u["bankImports/"+importId]={id:importId,bankAccountCode:body.bankAccountCode||"1120",fileName:txt(body.fileName,180),rowCount:count,duplicateCount:duplicates.length,createdAt:now,createdBy:claims.sub};u["audit/"+uid("AUD")]={action:"bank_import",importId,rowCount:count,duplicates:duplicates.length,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,importId,rows:count,duplicates:duplicates.length};
 }
 if(action==="addAttachment"){
  requirePermission(profile,"financial","add");
  const documentId=id(body.documentId),document=await adminRead("documents/"+documentId),attachment=body.attachment||{},attachmentId=id(attachment.id);
  if(!document)throw new Error("الفاتورة أو المستند غير موجود.");
  if(document.createdBy!==claims.sub&&profile.role!=="admin"&&!hasPermission(profile,"financial","edit"))throw new Error("ليس لديك صلاحية ربط المرفقات بهذا المستند.");
  const metadata={id:attachmentId,fileName:txt(attachment.fileName||attachment.name,240),mimeType:txt(attachment.mimeType||attachment.contentType,120),size:num(attachment.size||attachment.fileSize||0),createdAt:now,uploadedBy:claims.sub};
  const updates={};updates["documents/"+documentId+"/attachments/"+attachmentId]=metadata;updates["audit/"+uid("AUD")]={action:"attach_financial_document",documentId,attachmentId,uid:claims.sub,createdAt:now};
  await adminPatch(updates);return {success:true,attachment:metadata};
 }
 if(action==="setAttachmentUploadStatus"){
  requirePermission(profile,"financial","add");
  const documentId=id(body.documentId),document=await adminRead("documents/"+documentId);
  if(!document||document.type!=="invoice")throw new Error("الفاتورة غير موجودة لتحديث حالة المرفق.");
  if(document.createdBy!==claims.sub&&profile.role!=="admin"&&!hasPermission(profile,"financial","edit"))throw new Error("ليس لديك صلاحية تحديث مرفقات هذه الفاتورة.");
  if(!["pending","uploaded"].includes(body.status))throw new Error("حالة المرفق غير صحيحة.");
  const updates={};
  if(body.status==="pending"){
   const fileName=txt(body.fileName,240),uploadError=txt(body.error,300);
   updates["documents/"+documentId+"/attachmentUploadStatus"]="pending";
   updates["documents/"+documentId+"/attachmentFileName"]=fileName;
   updates["documents/"+documentId+"/attachmentUploadError"]=uploadError;
   const queued=await adminRead("reviewQueue/"+documentId);
   if(queued){
    updates["reviewQueue/"+documentId+"/attachmentUploadStatus"]="pending";
    updates["reviewQueue/"+documentId+"/attachmentFileName"]=fileName;
    updates["reviewQueue/"+documentId+"/attachmentUploadError"]=uploadError;
   }
  }else{
   updates["documents/"+documentId+"/attachmentUploadStatus"]=null;
   updates["documents/"+documentId+"/attachmentFileName"]=null;
   updates["documents/"+documentId+"/attachmentUploadError"]=null;
   const queued=await adminRead("reviewQueue/"+documentId);
   if(queued){
    updates["reviewQueue/"+documentId+"/attachmentUploadStatus"]=null;
    updates["reviewQueue/"+documentId+"/attachmentFileName"]=null;
    updates["reviewQueue/"+documentId+"/attachmentUploadError"]=null;
   }
  }
  updates["audit/"+uid("AUD")]={action:"update_invoice_attachment_status",documentId,status:body.status,uid:claims.sub,createdAt:now};
  await adminPatch(updates);
  return {success:true,documentId,status:body.status};
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
  if(!hasPermission(profile,"financial","approve"))throw new Error("Permission denied: financial.approve.");const docId=id(body.id),decision=txt(body.decision,20),doc=await adminRead("documents/"+docId);if(!doc)throw new Error("مستند المراجعة غير موجود");
  const lockType=doc.type==="invoice"?"invoice":doc.type==="cash"?"cash":doc.type==="bankLine"?"bankLine":"";
  if(lockType){
   const sourceLock=await adminRead("sourceLocks/"+lockType+"_"+docId);
   if(sourceLock&&sourceLock.journalId){
    const postedJournal=await adminRead("journals/"+id(sourceLock.journalId));
    if(!postedJournal||postedJournal.status!=="posted")throw new Error("يوجد قفل ترحيل للمستند لكن القيد المرحّل غير موجود أو غير مكتمل. أوقف الاعتماد وراجع سجل النظام قبل أي تعديل.");
    const alreadyPosted={};
    alreadyPosted["documents/"+docId+"/status"]="posted";
    alreadyPosted["documents/"+docId+"/journalId"]=postedJournal.id||sourceLock.journalId;
    alreadyPosted["documents/"+docId+"/approvedAt"]=doc.approvedAt||postedJournal.approvedAt||sourceLock.postedAt||now;
    alreadyPosted["documents/"+docId+"/approvedBy"]=doc.approvedBy||postedJournal.approvedBy||"";
    alreadyPosted["documents/"+docId+"/postedAt"]=doc.postedAt||postedJournal.postedAt||sourceLock.postedAt||now;
    alreadyPosted["reviewQueue/"+docId]=null;
    alreadyPosted["audit/"+uid("AUD")]={action:"reconcile_existing_posted_workflow",documentId:docId,journalId:postedJournal.id||sourceLock.journalId,uid:claims.sub,createdAt:now};
    await adminPatch(alreadyPosted);
    return {success:true,status:"posted",journalId:postedJournal.id||sourceLock.journalId,reconciled:true};
   }
  }
  if(!["pending_review","duplicate_review"].includes(doc.status))throw new Error("المستند ليس في قائمة المراجعة");
  if(decision==="approve"&&doc.status==="duplicate_review"&&doc.duplicateOf)throw new Error("هذه الحركة مكررة محتملة. لا تعتمدها إلا باستخدام قرار اعتماد التكرار الصريح.");
  if(decision==="approveDuplicate"&&doc.status!=="duplicate_review")throw new Error("هذا المستند ليس تكرارًا محتملاً.");
  if(decision==="reject"||decision==="return"){const status=decision==="reject"?"rejected":"needs_correction",u={};u["documents/"+docId+"/status"]=status;u["documents/"+docId+"/reviewReason"]=txt(body.reason,1000);u["documents/"+docId+"/reviewedBy"]=claims.sub;u["documents/"+docId+"/reviewedAt"]=now;u["reviewQueue/"+docId]=null;u["audit/"+uid("AUD")]={action:status,documentId:docId,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,status};}
  if(decision!=="approve"&&decision!=="approveDuplicate")throw new Error("قرار المراجعة غير صحيح");const updates={};let j;
  if(doc.type==="journal"){const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},v=validateJournal(doc,chart,centers);if(v.errors.length)throw new Error(v.errors.join("؛ "));j={...doc,status:"posted",approvedAt:now,approvedBy:claims.sub,postedAt:now};Object.assign(updates,journalUpdates(j));}
  else if(doc.type==="cash"){
   const amount=num(doc.amount),cash=txt(doc.cashAccountCode||"1110",32),movement=txt(doc.movementType||"",40),chart=(await adminRead("chartOfAccounts"))||{};
   const validate=(code,type)=>{const account=chart[code];if(!account||account.isGroup||account.active===false||account.type!==type)throw new Error("الحساب المقابل غير صالح: "+code);return account;};
   let lines=[],custodyMirror=null,advanceRecord=null;
   if(movement==="customer_receipt"){
    if(!doc.partyId)throw new Error("اختر العميل قبل اعتماد التحصيل.");
    const ledger=(await adminRead("partyLedger/customer/"+doc.partyId))||{};
    const receivable=Object.values(ledger).reduce((sum,periodRows)=>sum+Object.values(periodRows||{}).reduce((part,row)=>part+(row.accountCode==="1210"?Number(row.debit||0)-Number(row.credit||0):0),0),0);
    const settled=rnd(Math.min(amount,Math.max(0,receivable))),advance=rnd(amount-settled);
    lines=[{accountCode:cash,debit:amount,credit:0,description:doc.description}];
    if(settled)lines.push({accountCode:"1210",debit:0,credit:settled,description:"تحصيل مقابل مديونية العميل — "+doc.description,partyType:"customer",partyId:doc.partyId});
    if(advance)lines.push({accountCode:"2130",debit:0,credit:advance,description:"دفعة مقدمة من العميل — "+doc.description,partyType:"customer",partyId:doc.partyId});
   }else if(movement==="supplier_payment"){
    if(!doc.partyId)throw new Error("اختر المورد قبل اعتماد السداد.");
    const ledger=(await adminRead("partyLedger/vendor/"+doc.partyId))||{};
    const payable=Object.values(ledger).reduce((sum,periodRows)=>sum+Object.values(periodRows||{}).reduce((part,row)=>part+(row.accountCode==="281"?Number(row.credit||0)-Number(row.debit||0):0),0),0);
    const settled=rnd(Math.min(amount,Math.max(0,payable))),advance=rnd(amount-settled);
    lines=[];
    if(settled)lines.push({accountCode:"281",debit:settled,credit:0,description:"سداد مديونية المورد — "+doc.description,partyType:"vendor",partyId:doc.partyId});
    if(advance)lines.push({accountCode:"1240",debit:advance,credit:0,description:"دفعة مقدمة للمورد — "+doc.description,partyType:"vendor",partyId:doc.partyId});
    lines.push({accountCode:cash,debit:0,credit:amount,description:doc.description});
   }else if(movement==="other_receipt"){
    const offset=id(doc.offsetAccountCode);validate(offset,"revenue");
    lines=[{accountCode:cash,debit:amount,credit:0,description:doc.description},{accountCode:offset,debit:0,credit:amount,description:doc.description}];
   }else if(movement==="other_payment"){
    const offset=id(doc.offsetAccountCode);validate(offset,"expense");
    lines=[{accountCode:offset,debit:amount,credit:0,description:doc.description,costCenterId:doc.costCenterId||""},{accountCode:cash,debit:0,credit:amount,description:doc.description}];
   }else if(movement==="cash_to_bank"){
    const bank=id(doc.bankAccountCode||"1120");validate(bank,"asset");
    lines=[{accountCode:bank,debit:amount,credit:0,description:doc.description},{accountCode:cash,debit:0,credit:amount,description:doc.description}];
   }else if(movement==="bank_to_cash"){
    const bank=id(doc.bankAccountCode||"1120");validate(bank,"asset");
    lines=[{accountCode:cash,debit:amount,credit:0,description:doc.description},{accountCode:bank,debit:0,credit:amount,description:doc.description}];
   }else if(["employee_custody","employee_custody_return","employee_advance","employee_advance_recovery"].includes(movement)){
    if(profile.role!=="admin")throw new Error("اعتماد تحويلات العهد والسلف للعاملين يتطلب صلاحية مدير النظام.");
    const employeeUid=id(doc.employeeUid),employee=adminReadRoot?await adminReadRoot("users/"+employeeUid):null;
    if(!employee||!["active","نشط","مفعل","enabled"].includes(String(employee.status||"").toLowerCase()))throw new Error("المستخدم الداخلي غير موجود أو غير نشط.");
    const employeeName=txt(employee.fullName||employee.username||employee.email||employeeUid,120),custody=movement.startsWith("employee_custody"),accountCode=custody?"1220":"1230",partyType=custody?"employeeCustody":"employeeAdvance";
    validate(accountCode,"asset");
    const incoming=["employee_custody_return","employee_advance_recovery"].includes(movement);
    if(incoming){
     const ledger=(await adminRead("partyLedger/"+partyType+"/"+employeeUid))||{};
     let outstanding=0;
     Object.values(ledger).forEach(periodRows=>Object.values(periodRows||{}).forEach(entry=>{outstanding+=Number(entry.debit||0)-Number(entry.credit||0);}));
     if(amount>outstanding+0.01)throw new Error((custody?"قيمة الاسترداد أكبر من رصيد العهدة المستحق للموظف.":"قيمة تحصيل السلفة أكبر من رصيد السلفة المستحق على الموظف.")+" الرصيد الحالي: "+Math.max(0,outstanding).toFixed(2));
    }
    lines=incoming?
     [{accountCode:cash,debit:amount,credit:0,description:doc.description},{accountCode:accountCode,debit:0,credit:amount,description:doc.description,partyType,partyId:employeeUid}]:
     [{accountCode:accountCode,debit:amount,credit:0,description:doc.description,partyType,partyId:employeeUid},{accountCode:cash,debit:0,credit:amount,description:doc.description}];
    if(custody){
     const users=adminReadRoot?await adminReadRoot("users"):{};
     const companyOwnerUid=profile.role==="admin"?claims.sub:Object.keys(users||{}).find(uid=>users[uid]&&users[uid].role==="admin"&&["active","نشط","مفعل","enabled"].includes(String(users[uid].status||"").toLowerCase()));
     if(!companyOwnerUid)throw new Error("تعذر تحديد دفتر الشركة للعهدة الشخصية.");
     const sourceId=uid("CCY"),mirrorId=uid("CCY"),sourceType=incoming?"receipt":"expense",mirrorType=incoming?"expense":"receipt";
     const senderName=txt(profile.fullName||profile.username||profile.email,120),currency=txt(doc.currency||"EGP",8);
     const source={id:sourceId,ownerUid:companyOwnerUid,bookScope:"company",type:sourceType,amount,currency,date:doc.date,counterparty:employeeName,counterpartyType:"user",counterpartyUid:employeeUid,counterpartyCode:null,counterpartyName:employeeName,projectCode:doc.projectCode||"",reference:doc.reference||"",description:doc.description,status:"approved",createdBy:claims.sub,createdByName:senderName,createdAt:now,pairRole:"origin",pairGroupId:sourceId,linkedOwnerUid:employeeUid,linkedTransactionId:mirrorId};
     const mirror={id:mirrorId,ownerUid:employeeUid,bookScope:"personal",type:mirrorType,amount,currency,date:doc.date,counterparty:senderName,counterpartyType:"company",counterpartyUid:null,counterpartyCode:null,counterpartyName:senderName,projectCode:doc.projectCode||"",reference:doc.reference||"",description:"حركة عهدة مرتبطة: "+doc.description,status:"approved",createdBy:claims.sub,createdByName:senderName,createdAt:now,pairRole:"counterparty",pairGroupId:sourceId,linkedOwnerUid:companyOwnerUid,linkedTransactionId:sourceId};
     const notificationId=uid("CCN");
     const notification={id:notificationId,recipientUid:employeeUid,senderUid:claims.sub,senderName,amount,currency,date:doc.date,description:doc.description,bookScope:"personal",transactionId:mirrorId,pairGroupId:sourceId,createdAt:now,read:false};
     custodyMirror={companyOwnerUid,sourceId,mirrorId,employeeUid,source,mirror,notificationId,notification};
    }else{
     advanceRecord={id:doc.id,employeeUid,employeeName,kind:movement,amount,currency:doc.currency||"EGP",date:doc.date,reference:doc.reference||"",description:doc.description,createdAt:now,createdBy:doc.createdBy,approvedAt:now,approvedBy:claims.sub,status:"posted"};
     updates["employeeAdvanceRecords/"+employeeUid+"/"+doc.id]=advanceRecord;
    }
   }else throw new Error("نوع حركة الخزينة غير مدعوم.");
   j={id:uid("JRN"),date:doc.date,description:doc.description,reference:doc.reference||"",sourceType:"cash",sourceId:doc.id,currency:doc.currency||"EGP",lines,status:"posted",createdAt:doc.createdAt,createdBy:doc.createdBy,approvedAt:now,approvedBy:claims.sub,postedAt:now};
   Object.assign(updates,journalUpdates(j));
   updates["documents/"+docId+"/movementType"]=movement;
   if(custodyMirror||advanceRecord){
    updates["documents/"+docId+"/employeeUid"]=doc.employeeUid;
    if(advanceRecord)updates["documents/"+docId+"/employeeAdvanceRecordId"]=advanceRecord.id;
   }
   if(custodyMirror){
    if(!adminPatchRoot)throw new Error("خدمة ربط العهد الشخصية غير متاحة.");
    const rootUpdates={};
    Object.entries(updates).forEach(([key,value])=>{rootUpdates["financial/"+key]=value;});
    rootUpdates["cashCustodies/"+custodyMirror.companyOwnerUid+"/transactions/"+custodyMirror.sourceId]=custodyMirror.source;
    rootUpdates["cashCustodies/"+custodyMirror.employeeUid+"/transactions/"+custodyMirror.mirrorId]=custodyMirror.mirror;
    rootUpdates["cashCustodyNotifications/"+custodyMirror.employeeUid+"/"+custodyMirror.notificationId]=custodyMirror.notification;
    rootUpdates["financial/documents/"+docId+"/status"]="posted";
    rootUpdates["financial/documents/"+docId+"/journalId"]=j.id;
    rootUpdates["financial/documents/"+docId+"/approvedAt"]=now;
    rootUpdates["financial/documents/"+docId+"/approvedBy"]=claims.sub;
    rootUpdates["financial/documents/"+docId+"/postedAt"]=now;
    rootUpdates["financial/reviewQueue/"+docId]=null;
    rootUpdates["financial/audit/"+uid("AUD")]={action:"approve_and_post",documentId:docId,journalId:j.id,uid:claims.sub,createdAt:now};
    rootUpdates["financial/audit/"+uid("AUD")]={action:"link_employee_custody",documentId:docId,journalId:j.id,employeeUid:custodyMirror.employeeUid,companyOwnerUid:custodyMirror.companyOwnerUid,uid:claims.sub,createdAt:now};
    await adminPatchRoot(rootUpdates);
    return {success:true,status:"posted",journalId:j.id,employeeCustodyLinked:true,pushNotification:{recipientUid:custodyMirror.employeeUid,eventType:"cashCustody",eventId:custodyMirror.notificationId,content:{title:"حركة عهدة جديدة",body:doc.description}}};
   }
  }
  else if(doc.type==="bankLine"){if(!doc.offsetAccountCode)throw new Error("حدد الحساب المقابل قبل الاعتماد");const amount=num(doc.amount),bank=txt(doc.bankAccountCode||"1120",32),offset=txt(doc.offsetAccountCode,32),incoming=doc.direction==="in",lines=incoming?[{accountCode:bank,debit:amount,credit:0,description:doc.description},{accountCode:offset,debit:0,credit:amount,description:doc.description,partyType:doc.partyType||"",partyId:doc.partyId||"",costCenterId:doc.costCenterId||""}]:[{accountCode:offset,debit:amount,credit:0,description:doc.description,partyType:doc.partyType||"",partyId:doc.partyId||"",costCenterId:doc.costCenterId||""},{accountCode:bank,debit:0,credit:amount,description:doc.description}];j={id:uid("JRN"),date:doc.date,description:"حركة بنك: "+doc.description,reference:doc.reference||"",sourceType:"bankLine",sourceId:doc.id,currency:"EGP",lines,status:"posted",createdAt:doc.createdAt,createdBy:doc.createdBy,approvedAt:now,approvedBy:claims.sub,postedAt:now};Object.assign(updates,journalUpdates(j));updates["bankFingerprints/"+doc.fingerprint+"/journalId"]=j.id;}
  else if(doc.type==="invoice"){
   const inv=doc,tot=invoiceTotals(inv),purchase=inv.invoiceType==="purchase",partyId=id(inv.partyId),lines=[],items=(await adminRead("items"))||{},centers=(await adminRead("costCenters"))||{},chart=(await adminRead("chartOfAccounts"))||{};
   const projectCenter=inv.projectCode?Object.values(centers).find(function(center){return center&&(center.projectCode===inv.projectCode||center.code===inv.projectCode);}):null;

   const lock=await adminRead("documentFingerprints/"+inv.fingerprint);
   if(lock&&lock.documentId!==doc.id)throw new Error("الفاتورة مكررة ومربوطة بالمستند "+lock.documentId+"؛ ارفضها أو راجع المستند الأصلي قبل الترحيل.");
   const invoiceAmounts=invoiceLineAmounts(inv);
   for(const amountRow of invoiceAmounts){const l=amountRow.line,value=amountRow.amount;
    if(!["stock","service"].includes(l.kind))throw new Error("طبيعة بند الفاتورة غير صحيحة.");
    if(l.kind==="stock"&&!items[l.itemCode])throw new Error("الصنف "+l.itemCode+" غير معرف بالمخزون. أضفه أو اربطه بكود موجود.");
    if(l.kind==="service"){
     const expectedType=purchase?"expense":"revenue",accountCode=txt(purchase?(l.accountCode||"6100"):(l.incomeAccountCode||"4200"),32),account=chart[accountCode];
     if(!account||account.isGroup||account.active===false||account.type!==expectedType)throw new Error("حساب بند الفاتورة غير صالح: "+accountCode);
    }
    lines.push(purchase?{accountCode:l.kind==="stock"?"1300":txt(l.accountCode||"6100",32),debit:value,credit:0,description:l.description,costCenterId:l.costCenterId||(projectCenter&&projectCenter.code)||"",projectCode:inv.projectCode||"",itemCode:l.kind==="stock"?l.itemCode:"",quantity:num(l.quantity),warehouseCode:l.warehouseCode||"default"}:{accountCode:l.kind==="stock"?"4100":txt(l.incomeAccountCode||"4200",32),debit:0,credit:value,description:l.description,costCenterId:l.costCenterId||(projectCenter&&projectCenter.code)||"",projectCode:inv.projectCode||"",itemCode:l.kind==="stock"?l.itemCode:"",quantity:num(l.quantity),warehouseCode:l.warehouseCode||"default"});}
   if(purchase&&tot.tax)lines.push({accountCode:"1410",debit:tot.tax,credit:0,description:"ضريبة مدخلات",taxCode:inv.taxCode||"",taxType:inv.taxType||"vat_input"});
   if(!purchase&&tot.tax)lines.push({accountCode:"2110",debit:0,credit:tot.tax,description:"ضريبة مخرجات",taxCode:inv.taxCode||"",taxType:inv.taxType||"vat_output"});
   if(purchase){
    lines.push({accountCode:"281",debit:0,credit:tot.total,description:"فاتورة مشتريات",partyType:"vendor",partyId});
    const supplierLedger=(await adminRead("partyLedger/vendor/"+partyId))||{};
    const supplierAdvance=Object.values(supplierLedger).reduce((sum,periodRows)=>sum+Object.values(periodRows||{}).reduce((part,row)=>part+(row.accountCode==="1240"?Number(row.debit||0)-Number(row.credit||0):0),0),0);
    const applied=rnd(Math.min(tot.total,Math.max(0,supplierAdvance)));
    if(applied)lines.push({accountCode:"281",debit:applied,credit:0,description:"تسوية دفعة مقدمة للمورد",partyType:"vendor",partyId},{accountCode:"1240",debit:0,credit:applied,description:"تسوية دفعة مقدمة للمورد",partyType:"vendor",partyId});
   }else{
    lines.push({accountCode:"1210",debit:tot.total,credit:0,description:"فاتورة مبيعات",partyType:"customer",partyId});
    const customerLedger=(await adminRead("partyLedger/customer/"+partyId))||{};
    const customerAdvance=Object.values(customerLedger).reduce((sum,periodRows)=>sum+Object.values(periodRows||{}).reduce((part,row)=>part+(row.accountCode==="2130"?Number(row.credit||0)-Number(row.debit||0):0),0),0);
    const applied=rnd(Math.min(tot.total,Math.max(0,customerAdvance)));
    if(applied)lines.push({accountCode:"2130",debit:applied,credit:0,description:"تسوية دفعة مقدمة من العميل",partyType:"customer",partyId},{accountCode:"1210",debit:0,credit:applied,description:"تسوية دفعة مقدمة من العميل",partyType:"customer",partyId});
   }
   const bal=(await adminRead("inventory/balances"))||{};
   if(!purchase){for(const l of lines.filter(x=>x.itemCode)){const stock=bal[l.warehouseCode]&&bal[l.warehouseCode][l.itemCode]||{quantity:0,averageCost:0};if(Number(stock.quantity||0)<l.quantity)throw new Error("الرصيد غير كافٍ للصنف "+l.itemCode);const cost=rnd(l.quantity*Number(stock.averageCost||0));lines.push({accountCode:"5100",debit:cost,credit:0,description:"تكلفة مبيعات "+l.description,itemCode:l.itemCode,quantity:l.quantity,warehouseCode:l.warehouseCode,costCenterId:l.costCenterId||(projectCenter&&projectCenter.code)||"",projectCode:inv.projectCode||""},{accountCode:"1300",debit:0,credit:cost,description:"صرف مخزون "+l.description,itemCode:l.itemCode,quantity:l.quantity,warehouseCode:l.warehouseCode});}}
   const check=balance(lines);if(Math.abs(check.difference)>0.01)throw new Error("القيد الناتج غير متوازن: "+check.difference);
   j={id:uid("JRN"),date:inv.date,description:(purchase?"فاتورة مشتريات ":"فاتورة مبيعات ")+inv.number,reference:inv.number,sourceType:"invoice",sourceId:doc.id,currency:inv.currency||"EGP",lines,status:"posted",createdAt:inv.createdAt,createdBy:inv.createdBy,approvedAt:now,approvedBy:claims.sub,postedAt:now,totals:tot};Object.assign(updates,journalUpdates(j));
   for(const amountRow of invoiceAmounts.filter(function(row){return row.line.kind==="stock";})){const l=amountRow.line,warehouse=id(l.warehouseCode||"default"),code=id(l.itemCode),stock=bal[warehouse]&&bal[warehouse][code]||{quantity:0,value:0,averageCost:0},qty=num(l.quantity),gross=amountRow.amount,inward=purchase,oldQty=Number(stock.quantity||0),oldValue=Number(stock.value||0),cost=inward?gross:rnd(qty*Number(stock.averageCost||0)),nextQty=inward?oldQty+qty:oldQty-qty,nextValue=inward?oldValue+gross:oldValue-cost,mov=uid("MOV");updates["inventory/balances/"+warehouse+"/"+code]={quantity:rnd(nextQty),value:rnd(nextValue),averageCost:nextQty>0?rnd(nextValue/nextQty):0,updatedAt:now};updates["inventory/movements/"+mov]={id:mov,date:inv.date,invoiceId:doc.id,journalId:j.id,itemCode:code,warehouseCode:warehouse,kind:inward?"purchase":"sale",quantity:inward?qty:-qty,unitCost:inward?rnd(gross/qty):Number(stock.averageCost||0),value:inward?gross:-cost,createdAt:now,createdBy:claims.sub};}
   updates["documentFingerprints/"+inv.fingerprint]={documentId:doc.id,createdAt:now};updates["documents/"+doc.id+"/totals"]=tot;
  }else throw new Error("نوع المستند غير مدعوم في الترحيل");
  updates["documents/"+docId+"/status"]="posted";updates["documents/"+docId+"/journalId"]=j.id;updates["documents/"+docId+"/approvedAt"]=now;updates["documents/"+docId+"/approvedBy"]=claims.sub;updates["documents/"+docId+"/postedAt"]=now;updates["reviewQueue/"+docId]=null;updates["audit/"+uid("AUD")]={action:"approve_and_post",documentId:docId,journalId:j.id,uid:claims.sub,createdAt:now};await adminPatch(updates);return {success:true,status:"posted",journalId:j.id};
 }
 if(action==="returnToReview"){requirePermission(profile,"financial","edit");throw new Error("إعادة الإرسال المباشر غير مسموح بها لأنها تتجاوز التحقق المحاسبي. أعد حفظ القيد أو الفاتورة من الشاشة المخصصة ليُعاد احتساب الأخطاء والتحقق من البيانات قبل دخول قائمة المراجعة.");}
 throw new Error("Unknown financial action.");
}
