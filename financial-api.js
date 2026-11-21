
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
  const valueMatch = /\bInternal\s*id\s*[:：]\s*([0-9\u0660-\u0669\u06F0-\u06F9]+)/i.exec(source);
  return valueMatch ? normalizeTaxRegistrationNumber(valueMatch[1]).slice(0,120) : "";
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
const DEFAULT_CHEQUE_ACCOUNTS = [
 {code:"1130",name:"شيكات واردة تحت التحصيل",type:"asset",nature:"debit",parentCode:"11"},
 {code:"2140",name:"شيكات صادرة لم تقدم للبنك",type:"liability",nature:"credit",parentCode:"21"}
];
const PARTNER_CURRENT_ACCOUNT_CONFIG = [
 {username:"haitham Ibrahim mahmoud",partnerName:"م/ هيثم إبراهيم",code:"3201",name:"جاري شريك م/ هيثم إبراهيم"},
 {username:"Thabetrabea",email:"thabetrabea@gmail.com",partnerName:"أ/ ثابت ربيع",code:"3202",name:"جاري شريك أ/ ثابت ربيع"}
];
const DEFAULT_PARTNER_CURRENT_ACCOUNTS = [
 {code:"32",name:"جاري الشركاء",type:"equity",nature:"credit",isGroup:true,parentCode:"3"},
 {code:"3201",name:"جاري شريك م/ هيثم إبراهيم",type:"equity",nature:"credit",parentCode:"32",isControl:true,subledgerType:"partnerCurrentAccount"},
 {code:"3202",name:"جاري شريك أ/ ثابت ربيع",type:"equity",nature:"credit",parentCode:"32",isControl:true,subledgerType:"partnerCurrentAccount"}
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
const journalNumberFor=(dateValue,journalId)=>{const period=String(dateValue||"").slice(0,7).replace("-","");const token=String(journalId||uid("JRN")).replace(/[^A-Za-z0-9]/g,"").toUpperCase();return "JE-"+(period||"UNDATED")+"-"+token.slice(-32).padStart(32,"0");};
const balance=lines=>{const debit=rnd((lines||[]).reduce((s,x)=>s+Number(x.debit||0),0)),credit=rnd((lines||[]).reduce((s,x)=>s+Number(x.credit||0),0));return {debit,credit,difference:rnd(debit-credit)};};
const reviewRecord=doc=>({id:doc.id,documentId:doc.id,type:doc.type,invoiceType:doc.invoiceType||"",movementType:doc.movementType||"",title:doc.title||doc.number||doc.id,number:doc.number||"",date:doc.date||"",partyName:doc.partyName||"",total:Number(doc.total||doc.amount||0),status:doc.status,createdAt:doc.createdAt,createdBy:doc.createdBy,createdByName:doc.createdByName||"",attachmentUploadStatus:doc.attachmentUploadStatus||"",attachmentFileName:doc.attachmentFileName||"",attachmentUploadError:doc.attachmentUploadError||"",errors:doc.errors||[],warnings:doc.warnings||[]});
function journalUpdates(j){
 if(!j.number)j.number=journalNumberFor(j.date,j.id);
 const u={},m=month(j.date);u["journals/"+j.id]=j;u["periods/"+m+"/entries/"+j.id]=j;
 (j.lines||[]).forEach((l,i)=>{const row={journalId:j.id,journalNumber:j.number,lineNo:i+1,date:j.date,description:l.description||j.description||"",accountCode:l.accountCode,debit:Number(l.debit||0),credit:Number(l.credit||0),currency:l.currency||j.currency||"EGP",costCenterId:l.costCenterId||"",projectCode:l.projectCode||"",partyType:l.partyType||"",partyId:l.partyId||"",sourceType:j.sourceType||"manual",sourceId:j.sourceId||"",reference:j.reference||"",taxCode:l.taxCode||"",taxType:l.taxType||""};u["ledger/"+l.accountCode+"/"+m+"/"+j.id+"_"+(i+1)]=row;if(l.partyType&&l.partyId)u["partyLedger/"+l.partyType+"/"+l.partyId+"/"+m+"/"+j.id+"_"+(i+1)]=row;if(l.costCenterId)u["costLedger/"+l.costCenterId+"/"+m+"/"+j.id+"_"+(i+1)]=row;});
 if(j.sourceType&&j.sourceId)u["sourceLocks/"+j.sourceType+"_"+j.sourceId]={journalId:j.id,postedAt:Date.now()};return u;
}
function journalMaintenanceUpdates(previous,next){
 const updates=journalUpdates(next),newPaths=new Set(Object.keys(updates)),oldMonth=month(previous.date),newMonth=month(next.date);
 if(oldMonth!==newMonth)updates["periods/"+oldMonth+"/entries/"+previous.id]=null;
 (previous.lines||[]).forEach((line,index)=>{
  const suffix=previous.id+"_"+(index+1),paths=[];
  if(line.accountCode)paths.push("ledger/"+line.accountCode+"/"+oldMonth+"/"+suffix);
  if(line.partyType&&line.partyId)paths.push("partyLedger/"+line.partyType+"/"+line.partyId+"/"+oldMonth+"/"+suffix);
  if(line.costCenterId)paths.push("costLedger/"+line.costCenterId+"/"+oldMonth+"/"+suffix);
  for(const path of paths)if(!newPaths.has(path))updates[path]=null;
 });
 return updates;
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
function normalizeInvoiceOtherTaxes(rows){
 if(!Array.isArray(rows))return [];
 return rows.slice(0,20).filter(row=>row&&typeof row==="object"&&!Array.isArray(row)).map(row=>({
  description:txt(row.description||"",180),
  taxCode:txt(row.taxCode||"",80),
  rate:row.rate===""||row.rate===null||row.rate===undefined?"":num(row.rate||0),
  amount:row.amount===""||row.amount===null||row.amount===undefined?"":num(row.amount||0),
  accountCode:txt(row.accountCode||"",32)
 }));
}
function invoiceTotals(inv){
 const net=rnd(invoiceLineAmounts(inv).reduce(function(sum,row){return sum+row.amount;},0));
 const hasFixedVat=inv.taxAmount!==undefined&&inv.taxAmount!==null&&String(inv.taxAmount).trim()!=="";
 const vat=rnd(hasFixedVat?num(inv.taxAmount):net*num(inv.taxRate||0)/100);
 const otherTax=rnd(normalizeInvoiceOtherTaxes(inv.otherTaxes).reduce((sum,row)=>{
  const hasFixed=row.amount!==""&&row.amount!==null&&row.amount!==undefined;
  return sum+(hasFixed?num(row.amount):net*num(row.rate||0)/100);
 },0));
 const tax=rnd(vat+otherTax);
 return {net,vat,otherTax,tax,total:rnd(net+tax)};
}
function invoiceReviewErrors(inv,taxCodes,chart,items){
 const errors=[],lines=Array.isArray(inv.lines)?inv.lines:[],rawDate=String(inv.date||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)||!Number.isFinite(Date.parse(rawDate+"T00:00:00Z")))errors.push("تاريخ الفاتورة مطلوب أو غير صحيح.");
 if(!txt(inv.number,120))errors.push("رقم الفاتورة مطلوب.");
 if(!txt(inv.partyId,120))errors.push("يجب تحديد العميل أو المورد.");
 if(inv.currency!=="EGP")errors.push("يجب اختيار الجنيه المصري قبل اعتماد الفاتورة.");
 if(!lines.length)errors.push("يجب إضافة بند واحد على الأقل.");
 lines.forEach((line,index)=>{
  if(!txt(line.description,250))errors.push("وصف البند "+(index+1)+" مطلوب.");
  if(!(Number(line.quantity)>0))errors.push("الكمية غير صحيحة في البند "+(index+1)+".");
  if(!["stock","service"].includes(line.kind))errors.push("حدد طبيعة البند "+(index+1)+".");
  else if(line.kind==="stock"){if(!line.itemCode||!items[line.itemCode]||items[line.itemCode].active===false)errors.push("حدد صنفًا مخزنيًا نشطًا للبند "+(index+1)+".");}
  else{const expected=inv.invoiceType==="purchase"?"expense":"revenue",code=String(inv.invoiceType==="purchase"?(line.accountCode||""):(line.incomeAccountCode||"")),account=chart[code];if(!account||account.isGroup||account.active===false||account.type!==expected)errors.push("حدد حساب "+(expected==="expense"?"مصروف":"إيراد")+" صحيحًا للبند "+(index+1)+".");}
 });
 const rate=Number(inv.taxRate||0),expectedTaxType=inv.invoiceType==="purchase"?"vat_input":"vat_output";
 const standardVatCode=inv.invoiceType==="purchase"?"VAT-IN-14":"VAT-OUT-14",standardVat=taxCodes[standardVatCode];
 if(inv.taxCode!==standardVatCode)errors.push("يجب استخدام كود ضريبة القيمة المضافة الأساسي الثابت 14%.");
 if(!standardVat||standardVat.active===false||standardVat.taxType!==expectedTaxType||Math.abs(Number(standardVat.rate||0)-14)>0.01)errors.push("كود ضريبة القيمة المضافة الأساسي 14% غير موجود أو غير نشط أو غير مطابق لنوع الفاتورة.");
 else if(standardVat.effectiveFrom&&rawDate&&rawDate<String(standardVat.effectiveFrom))errors.push("كود ضريبة القيمة المضافة الأساسي غير سارٍ بتاريخ الفاتورة.");
 if(Math.abs(rate-14)>0.01)errors.push("نسبة ضريبة القيمة المضافة الأساسية ثابتة عند 14%.");
 normalizeInvoiceOtherTaxes(inv.otherTaxes).forEach((tax,index)=>{
  const hasData=!!(tax.description||tax.accountCode||Number(tax.rate||0)||Number(tax.amount||0));
  if(!hasData)return;
  if(!tax.description)errors.push("وصف الضريبة أو الرسم الإضافي رقم "+(index+1)+" مطلوب.");
  if(!(Number(tax.rate||0)>=0)||!(tax.amount===""||Number(tax.amount)>=0))errors.push("قيمة الضريبة الإضافية رقم "+(index+1)+" غير صحيحة.");
  const taxAccount=chart[tax.accountCode];
  if(!tax.accountCode||!taxAccount||taxAccount.isGroup||taxAccount.active===false)errors.push("اختر حسابًا مرحّلًا ونشطًا للضريبة أو الرسم الإضافي رقم "+(index+1)+".");
 });
 try{invoiceTotals(inv);}catch(error){errors.push(String(error.message||error));}
 return [...new Set(errors)];
}
async function sha(v){const a=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join("");}

export async function handleFinancialRequest(ctx){
 const {request,url,body,claims,profile,env,hasPermission,requirePermission,adminRead,adminPatch,adminReadRoot,adminPutRoot,adminPatchRoot,adminPatchRootAt}=ctx;
 const patchExternalBranch=async(path,updates)=>{
  if(!adminPatchRootAt)throw new Error("خدمة حفظ المهام والإشعارات بمساراتها المستقلة غير متاحة.");
  if(updates&&Object.keys(updates).length)await adminPatchRootAt(path,updates);
 };
 const removeExternalBranch=async(path,keys)=>{
  if(!adminPatchRootAt)throw new Error("خدمة التراجع عن تحديث المهمة غير متاحة.");
  const updates={};(keys||[]).forEach(key=>{updates[key]=null;});
  if(Object.keys(updates).length)await adminPatchRootAt(path,updates);
 };
 const financeAreaForMaster=kind=>({
  parties:"masters",chartOfAccounts:"accounts",costCenters:"centers",
  items:"inventory",itemGroups:"inventory",warehouses:"inventory",
  bankAccounts:"bank",taxCodes:"tax"
 })[kind]||"masters";
 const requireFinanceArea=(area,action)=>requirePermission(profile,"financial_"+area,action);
 const hasFinanceArea=(area,action)=>hasPermission(profile,"financial_"+area,action);
 const requireFinanceMaster=(kind,action)=>{
  if(kind==="parties"&&hasPermission(profile,"master",action))return true;
  return requireFinanceArea(financeAreaForMaster(kind),action);
 };
 const documentPermissionArea=document=>document&&document.type==="invoice"?"invoices":
  document&&document.type==="journal"?"journal":document&&document.type==="cash"?"cash":
  document&&document.type==="bankLine"?"bank":"reports";
 const submitCashCustodyJournalRecord=async(ownerUid,transactionId)=>{
  ownerUid=id(ownerUid);transactionId=id(transactionId);
  if(ownerUid!==claims.sub&&!hasPermission(profile,"cashCustody","viewOthers"))throw new Error("ليس لديك صلاحية ربط قيود عهدة مستخدم آخر.");
  const transaction=adminReadRoot?await adminReadRoot("cashCustodies/"+ownerUid+"/transactions/"+transactionId):null;
  if(!transaction)throw new Error("حركة العهدة غير موجودة.");
  if(transaction.pairRole==="counterparty")return {success:true,skipped:true,reason:"counterparty"};
  if(transaction.status==="cancelled"||transaction.status==="rejected")return {success:true,skipped:true,reason:"cancelled"};
  if(String(transaction.currency||"EGP").toUpperCase()!=="EGP")throw new Error("لا يمكن إرسال حركة العهدة للمراجعة المحاسبية بعملة أجنبية قبل تفعيل أسعار الصرف وإعادة التقييم.");
  const linkPath="cashCustodyJournalLinks/"+ownerUid+"/"+transactionId;
  const linkedId=await adminRead(linkPath),existingId=transaction.financialDocumentId||linkedId||"";
  let existingDraft=null;
  if(existingId){
   existingDraft=await adminRead("documents/"+id(existingId));
   if(existingDraft&&existingDraft.status==="posted")return {success:true,id:existingDraft.id,status:"posted",alreadyPosted:true};
   if(existingDraft&&existingDraft.status==="cancelled")throw new Error("قيد العهدة السابق ملغي. سجّل حركة تسوية جديدة بدل إعادة استخدام نفس الحركة.");
   if(existingDraft&&!["pending_review","needs_correction"].includes(existingDraft.status))throw new Error("حالة قيد العهدة لا تسمح بالتحديث. راجع النظام المالي.");
  }
  const amount=num(transaction.amount||0),movement=txt(transaction.type||"",40),dateValue=date(transaction.date||"");
  if(amount<=0)throw new Error("مبلغ حركة العهدة غير صحيح.");
  const incoming=["receipt","topup","refund","opening_balance","adjustment_in","transfer_in"].includes(movement);
  const owner=adminReadRoot?await adminReadRoot("users/"+ownerUid):null;
  const employeeName=txt(owner&& (owner.fullName||owner.username||owner.email)||transaction.createdByName||ownerUid,120);
  const projectCode=txt(transaction.projectCode||"",120),lines=[];
  const costCenterId=projectCode;
  if(movement==="opening_balance"){
   lines.push({accountCode:"1220",debit:amount,credit:0,description:transaction.description||"رصيد عهدة افتتاحي",partyType:"employeeCustody",partyId:ownerUid,costCenterId,projectCode});
   lines.push({accountCode:"3100",debit:0,credit:amount,description:"رصيد عهدة افتتاحي",costCenterId,projectCode});
  }else if(incoming){
   lines.push({accountCode:"1220",debit:amount,credit:0,description:transaction.description||"حركة عهدة واردة",partyType:"employeeCustody",partyId:ownerUid,costCenterId,projectCode});
   lines.push({accountCode:movement==="refund"?"6100":"1110",debit:0,credit:amount,description:transaction.description||"حركة عهدة واردة",costCenterId,projectCode});
  }else if(movement==="return"||movement==="transfer_out"){
   lines.push({accountCode:"1110",debit:amount,credit:0,description:transaction.description||"رد عهدة إلى الشركة",costCenterId,projectCode});
   lines.push({accountCode:"1220",debit:0,credit:amount,description:transaction.description||"رد عهدة إلى الشركة",partyType:"employeeCustody",partyId:ownerUid,costCenterId,projectCode});
  }else{
   lines.push({accountCode:"6100",debit:amount,credit:0,description:transaction.description||"مصروف من العهدة",costCenterId,projectCode});
   lines.push({accountCode:"1220",debit:0,credit:amount,description:transaction.description||"مصروف من العهدة",partyType:"employeeCustody",partyId:ownerUid,costCenterId,projectCode});
  }
  const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{};
  const rootUpdates={};
  if(projectCode&&!centers[projectCode]){
   const project=adminReadRoot?await adminReadRoot("projects/"+projectCode):null;
   if(project){
    const center={code:projectCode,name:txt(project.name||project.projectName||projectCode,180),projectCode,isProjectCenter:true,active:true,createdAt:now,createdBy:claims.sub};
    centers[projectCode]=center;rootUpdates["financial/costCenters/"+projectCode]=center;
   }
  }
  const journalId=existingDraft?existingDraft.id:(existingId||uid("CUST-JRN")),journal={
   ...(existingDraft||{}),id:journalId,number:existingDraft&&existingDraft.number||journalNumberFor(dateValue,journalId),type:"journal",sourceType:"cashCustody",sourceId:ownerUid+"--"+transactionId,ownerUid,custodyTransactionId:transactionId,
   projectCode,date:dateValue,description:"قيد عهدة شخصية — "+txt(transaction.description||movement,300)+" — "+employeeName,
   reference:txt(transaction.reference||transactionId,120),currency:"EGP",lines,status:"pending_review",
   createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120)
  };
  const validation=validateJournal(journal,chart,centers);
  journal.balance=validation.balance;journal.errors=validation.errors;journal.status="pending_review";journal.title="حركة عهدة بانتظار المراجعة — "+employeeName;
  rootUpdates["financial/documents/"+journalId]=journal;
  rootUpdates["financial/reviewQueue/"+journalId]=reviewRecord(journal);
  rootUpdates["financial/cashCustodyJournalLinks/"+ownerUid+"/"+transactionId]=journalId;
  rootUpdates["financial/audit/"+uid("AUD")]={action:"submit_cash_custody_journal",documentId:journalId,ownerUid,transactionId,uid:claims.sub,createdAt:now};
  rootUpdates["cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialDocumentId"]=journalId;
  rootUpdates["cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialReviewStatus"]="pending_review";
  rootUpdates["cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/financialReviewError"]=null;
  rootUpdates["cashCustodies/"+ownerUid+"/transactions/"+transactionId+"/status"]="pending";
  const mirrorOwner=transaction.linkedOwnerUid?id(transaction.linkedOwnerUid):"",mirrorId=transaction.linkedTransactionId?id(transaction.linkedTransactionId):"";
  if(mirrorOwner&&mirrorId){
   rootUpdates["cashCustodies/"+mirrorOwner+"/transactions/"+mirrorId+"/financialDocumentId"]=journalId;
   rootUpdates["cashCustodies/"+mirrorOwner+"/transactions/"+mirrorId+"/financialReviewStatus"]="pending_review";
   rootUpdates["cashCustodies/"+mirrorOwner+"/transactions/"+mirrorId+"/financialReviewError"]=null;
   rootUpdates["cashCustodies/"+mirrorOwner+"/transactions/"+mirrorId+"/status"]="pending";
  }
  if(transaction.linkedProjectEventId&&projectCode){
   const eventPath="projects/"+projectCode+"/events/"+id(transaction.linkedProjectEventId);
   rootUpdates[eventPath+"/accountingImpact"]=true;
   rootUpdates[eventPath+"/accountingStatus"]="pending_review";
   rootUpdates[eventPath+"/accountingDocumentId"]=journalId;
   rootUpdates[eventPath+"/accountingJournalId"]=journalId;
  }
  if(!adminPatchRoot)throw new Error("خدمة حفظ قيد العهدة غير متاحة.");
  await adminPatchRoot(rootUpdates);
  return {success:true,id:journalId,status:"pending_review",errors:journal.errors,existing:Boolean(existingDraft)};
 };
 if(!profile||!["active","نشط","مفعل","enabled"].includes(String(profile.status||"").toLowerCase()))throw new Error("This user account is not active.");
 if(request.method==="GET"){
  const res=txt(url.searchParams.get("resource")||"bootstrap",40);
  if(res==="bootstrap"){
   requirePermission(profile,"financial","view");
   let chart=(await adminRead("chartOfAccounts"))||{};
   if(!Object.keys(chart).length){
    if(profile.role!=="admin")throw new Error("يجب على مدير النظام تهيئة دليل الحسابات أولاً.");
    const u={};DEFAULT_FINANCE_ACCOUNTS.forEach(a=>u["chartOfAccounts/"+a.code]={...a,active:true,createdAt:Date.now(),createdBy:claims.sub});u["settings/baseCurrency"]="EGP";u["settings/seedVersion"]=1;await adminPatch(u);chart=Object.fromEntries(DEFAULT_FINANCE_ACCOUNTS.map(a=>[a.code,{...a,active:true}]));
   }
   // Idempotent migration: add only missing expense groups/accounts without overwriting existing account data.
   if(profile.role==="admin"){
    const migrated={};
    const updates={};
    for(const account of [...DEFAULT_PARTNER_CURRENT_ACCOUNTS,...DEFAULT_EXPENSE_ACCOUNTS,...DEFAULT_STAFF_ACCOUNTS,...DEFAULT_PARTY_ADVANCE_ACCOUNTS,...DEFAULT_CHEQUE_ACCOUNTS]){
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
   // Every project is also a cost center, using the exact project code. Create only missing
   // project-linked centers; never overwrite a manually maintained center with the same code.
   const projectCostCenterUpdates={},projectDirectory=adminReadRoot?(await adminReadRoot("projects"))||{}:{};
   for(const [projectCode,projectRecord] of Object.entries(projectDirectory)){
    if(!projectRecord||typeof projectRecord!=="object")continue;
    const code=id(projectRecord.code||projectCode);
    const projectName=txt(projectRecord.name||projectRecord.projectName||code,180),existingCenter=out.costCenters[code];
    if(!existingCenter){
     const center={code,name:projectName,projectCode:code,isProjectCenter:true,active:true,createdAt:Date.now(),createdBy:claims.sub};
     projectCostCenterUpdates["costCenters/"+code]=center;out.costCenters[code]=center;
    }else if(existingCenter.isProjectCenter===true&&(existingCenter.name!==projectName||existingCenter.projectCode!==code)){
     const center={...existingCenter,code,name:projectName,projectCode:code,updatedAt:Date.now(),updatedBy:claims.sub};
     projectCostCenterUpdates["costCenters/"+code]=center;out.costCenters[code]=center;
    }
   }
   if(Object.keys(projectCostCenterUpdates).length)await adminPatch(projectCostCenterUpdates);
   const parties=(await adminRead("parties"))||{};
   const crmClients=adminReadRoot?(await adminReadRoot("clients"))||{}:{};
   const crmVendors=adminReadRoot?(await adminReadRoot("vendors"))||{}:{};
   Object.entries(crmClients).forEach(([code,party])=>{if(party&&typeof party==="object")parties[code]={...party,code:party.code||code,partyType:"customer"};});
   Object.entries(crmVendors).forEach(([code,party])=>{if(party&&typeof party==="object")parties[code]={...party,code:party.code||code,partyType:"vendor"};});
   out.parties=parties;
   out.inventory={balances:(await adminRead("inventory/balances"))||{}};
   return out;
  }
  if(res==="document"){
   const docId=id(url.searchParams.get("id")),item=await adminRead("documents/"+docId);
   if(!item)throw new Error("المستند المطلوب غير موجود أو تم نقله من قائمة المراجعة.");
   const activeAssignment=item.status==="assigned"&&item.assignedTo===claims.sub&&item.assignmentId&&await adminRead("assignments/"+claims.sub+"/"+id(item.assignmentId));
   if(!hasFinanceArea("review","view")&&!hasFinanceArea(documentPermissionArea(item),"view")&&!activeAssignment)throw new Error("ليس لديك صلاحية عرض هذا المستند.");
   let sourceDetails=null;
   if(item.type==="journal"&&item.sourceType==="cashCustody"&&item.sourceId&&adminReadRoot){
    const separator=String(item.sourceId).indexOf("--");
    if(separator>0){
     const ownerUid=id(item.sourceId.slice(0,separator)),transactionId=id(item.sourceId.slice(separator+2));
     const transaction=await adminReadRoot("cashCustodies/"+ownerUid+"/transactions/"+transactionId);
     const owner=await adminReadRoot("users/"+ownerUid);
     const projectCode=String(transaction&&transaction.projectCode||item.projectCode||"");
     const project=projectCode?await adminReadRoot("projects/"+id(projectCode)):null;
     if(transaction)sourceDetails={
      kind:"cashCustody",employeeUid:ownerUid,
      employeeName:txt(owner&&(owner.fullName||owner.username||owner.email)||transaction.createdByName||ownerUid,120),
      bookScope:transaction.bookScope==="company"?"company":"personal",
      movementType:txt(transaction.type||"",40),date:txt(transaction.date||item.date||"",20),
      amount:Number(transaction.amount||0),currency:txt(transaction.currency||"EGP",12),
      description:txt(transaction.description||"",1000),reference:txt(transaction.reference||"",160),
      projectCode,projectName:txt(project&&(project.name||project.projectName)||projectCode,180),
      status:txt(transaction.status||"",40),createdByName:txt(transaction.createdByName||"",120),
      counterpartyType:txt(transaction.counterpartyType||"",40),
      counterpartyCode:txt(transaction.counterpartyCode||"",120),
      counterpartyName:txt(transaction.counterpartyName||transaction.counterparty||"",180)
     };
    }
   }
   return {item,sourceDetails};
  }
  if(res==="review"){
   requireFinanceArea("review","view");
   const queue=(await adminRead("reviewQueue"))||{},documents=(await adminRead("documents"))||{},items={},updates={};
   Object.entries(queue).forEach(([key,record])=>{
    if(!record||typeof record!=="object")return;
    const document=documents[key]||{},isJournal=document.type==="journal"||record.type==="journal";
    if(!isJournal){items[key]=record;return;}
    const number=document.number||record.number||journalNumberFor(document.date||record.date,document.id||record.id||key);
    const title=(!record.title||record.title===key||record.title===record.id)?"قيد رقم "+number:record.title;
    items[key]={...record,number,title};
    if(document.type==="journal"&&!document.number)updates["documents/"+key+"/number"]=number;
    if(record.number!==number)updates["reviewQueue/"+key+"/number"]=number;
    if(record.title!==title)updates["reviewQueue/"+key+"/title"]=title;
   });
   if(Object.keys(updates).length)await adminPatch(updates);
   return {items};
  }
  if(res==="journals"){
    requireFinanceArea("journal","view");
    const source=(await adminRead("journals"))||{},documents=(await adminRead("documents"))||{},items={},updates={};
    Object.entries(source).forEach(([key,value])=>{
     if(!value||typeof value!=="object")return;
     const journalId=String(value.id||key),number=value.number||journalNumberFor(value.date,journalId),journal=value.number?value:{...value,number};
     items[key]=journal;
     if(!value.number){
      updates["journals/"+key+"/number"]=number;
      if(journal.status==="posted"&&/^\d{4}-\d{2}-\d{2}$/.test(String(journal.date||""))){
       const journalMonth=month(journal.date);
       updates["periods/"+journalMonth+"/entries/"+journalId]=journal;
       (journal.lines||[]).forEach((line,index)=>{
        const suffix=journalId+"_"+(index+1);
        if(line.accountCode)updates["ledger/"+line.accountCode+"/"+journalMonth+"/"+suffix+"/journalNumber"]=number;
        if(line.partyType&&line.partyId)updates["partyLedger/"+line.partyType+"/"+line.partyId+"/"+journalMonth+"/"+suffix+"/journalNumber"]=number;
        if(line.costCenterId)updates["costLedger/"+line.costCenterId+"/"+journalMonth+"/"+suffix+"/journalNumber"]=number;
       });
      }
      if(documents[journalId])updates["documents/"+journalId+"/number"]=number;
      if(journal.sourceId&&documents[journal.sourceId])updates["documents/"+journal.sourceId+"/journalNumber"]=number;
     }
    });
    Object.entries(documents).forEach(([key,value])=>{
     if(!value||value.type!=="journal"||value.number)return;
     const linked=items[String(value.journalId||key)],number=linked&&linked.number||journalNumberFor(value.date,value.id||key);
     updates["documents/"+key+"/number"]=number;
     updates["reviewQueue/"+key+"/number"]=number;
    });
    if(Object.keys(updates).length)await adminPatch(updates);
    return {items};
   }
  if(res==="documents"){
   const allowed=["invoices","journal","cash","bank"].filter(area=>hasFinanceArea(area,"view"));
   if(!allowed.length)throw new Error("ليس لديك صلاحية عرض مستندات الوحدة المالية.");
   const source=(await adminRead("documents"))||{},items={};
   Object.entries(source).forEach(([key,document])=>{if(allowed.includes(documentPermissionArea(document)))items[key]=document;});
   return {items};
  }
  if(res==="inventory"){requireFinanceArea("inventory","view");return {items:(await adminRead("inventory"))||{}};}
  if(res==="tax"){requireFinanceArea("tax","view");return {items:(await adminRead("tax"))||{}};}
  if(res==="audit"){requireFinanceArea("reports","view");return {items:(await adminRead("audit"))||{}};}
  if(res==="bank"){requireFinanceArea("bank","view");return {items:(await adminRead("bankImports"))||{},accounts:(await adminRead("bankAccounts"))||{}};}
  if(res==="periods"){if(!hasFinanceArea("reports","view")&&!hasFinanceArea("overview","view")&&!hasFinanceArea("centers","view")&&!hasFinanceArea("tax","view"))throw new Error("ليس لديك صلاحية عرض التقارير المالية.");
   const from=txt(url.searchParams.get("from")||new Date().toISOString().slice(0,7),7),to=txt(url.searchParams.get("to")||from,7);
   if(!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to))throw new Error("Invalid financial period.");
   const configuredStart=await adminRead("settings/accountingStartMonth"),balanceFrom=String(configuredStart||from);
   if(!/^\d{4}-\d{2}$/.test(balanceFrom))throw new Error("تاريخ بداية الدفاتر المحاسبية غير مضبوط. راجع إعدادات النظام المالي.");
   const startDate=new Date(balanceFrom+"-01T00:00:00Z"),fromDate=new Date(from+"-01T00:00:00Z"),toDate=new Date(to+"-01T00:00:00Z");
   const diff=(toDate.getUTCFullYear()-startDate.getUTCFullYear())*12+toDate.getUTCMonth()-startDate.getUTCMonth();
   const periodDiff=(toDate.getUTCFullYear()-fromDate.getUTCFullYear())*12+toDate.getUTCMonth()-fromDate.getUTCMonth();
   if(diff<0||periodDiff<0||diff>120||periodDiff>24)throw new Error("مدى التقرير غير صحيح. الحد الأقصى 24 شهرًا لحركة الفترة و120 شهرًا للأرصدة التراكمية.");
   const months=[],entries={},balanceEntries={},numberUpdates={};
   for(let i=0;i<=diff;i++){
    const d=new Date(Date.UTC(startDate.getUTCFullYear(),startDate.getUTCMonth()+i,1)),m=d.toISOString().slice(0,7);
    const monthly=(await adminRead("periods/"+m+"/entries"))||{};
    if(m>=from&&m<=to){
     Object.entries(monthly).forEach(([key,value])=>{
      if(!value||typeof value!=="object"||value.number)return;
      const journalId=String(value.id||key),number=journalNumberFor(value.date,journalId),journal={...value,number};
      monthly[key]=journal;
      numberUpdates["journals/"+journalId+"/number"]=number;
      numberUpdates["periods/"+m+"/entries/"+key]=journal;
      (journal.lines||[]).forEach((line,index)=>{
       const suffix=journalId+"_"+(index+1);
       if(line.accountCode)numberUpdates["ledger/"+line.accountCode+"/"+m+"/"+suffix+"/journalNumber"]=number;
       if(line.partyType&&line.partyId)numberUpdates["partyLedger/"+line.partyType+"/"+line.partyId+"/"+m+"/"+suffix+"/journalNumber"]=number;
       if(line.costCenterId)numberUpdates["costLedger/"+line.costCenterId+"/"+m+"/"+suffix+"/journalNumber"]=number;
      });
     });
     months.push(m);entries[m]=monthly;
    }
    balanceEntries[m]=monthly;
   }
   if(Object.keys(numberUpdates).length)await adminPatch(numberUpdates);
   return {months,entries,balanceEntries,accountingStartMonth:balanceFrom};
  }
  if(res==="partnerCurrentAccounts"){
   requireFinanceArea("partyStatements","view");
   const userDirectory=adminReadRoot?(await adminReadRoot("users"))||{}:{};
   const results=[];
   for(const config of PARTNER_CURRENT_ACCOUNT_CONFIG){
    const normalize=value=>String(value||"").trim().toLowerCase().replace(/\s+/g," ");
    const target=normalize(config.username),targetEmail=normalize(config.email);
    const matched=Object.entries(userDirectory).find(([uidValue,user])=>{
     if(!user||typeof user!=="object")return false;
     if(targetEmail)return normalize(user.email)===targetEmail;
     const candidates=[user.username,user.fullName,String(user.email||"").split("@")[0]];
     return candidates.some(value=>normalize(value)===target);
    });
    const partnerUid=matched?matched[0]:"";
    if(profile.role!=="admin"&&partnerUid!==claims.sub)continue;
    const partnerProfile=matched?matched[1]:null;
    const ledger=partnerUid?(await adminRead("partyLedger/partnerCurrentAccount/"+id(partnerUid)))||{}:{};
    const custodyRows=partnerUid&&adminReadRoot?(await adminReadRoot("cashCustodies/"+id(partnerUid)+"/transactions"))||{}:{};
    const transactions=Object.entries(custodyRows).filter(([,item])=>item&&item.bookScope==="personal"&&item.pairRole!=="counterparty"&&item.partnerCurrentAccountTransfer&&item.partnerCurrentAccountTransfer.active===true).map(([transactionId,item])=>({id:item.id||transactionId,...item})).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.createdAt||0)-Number(a.createdAt||0));
    const entries=[];
    Object.values(ledger).forEach(periodRows=>Object.values(periodRows||{}).forEach(entry=>{if(entry)entries.push(entry);}));
    entries.sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))||String(a.journalId||"").localeCompare(String(b.journalId||"")));
    results.push({uid:partnerUid,username:partnerProfile&&partnerProfile.username||config.username,partnerName:config.partnerName,accountCode:config.code,accountName:config.name,linked:Boolean(partnerUid),active:partnerProfile&&["active","نشط","مفعل","enabled"].includes(String(partnerProfile.status||"").toLowerCase()),transactions,entries});
   }
   return {items:results};
  }
  if(res==="party"){
   requireFinanceArea("partyStatements","view");
   const requested=txt(url.searchParams.get("type")||"customer",32);
   const allowed=["customer","vendor","employeeCustody","employeeAdvance","partnerCurrentAccount"];
   if(!allowed.includes(requested))throw new Error("Invalid analytic party type.");
   const partyId=id(url.searchParams.get("id"));
   return {entries:(await adminRead("partyLedger/"+requested+"/"+partyId))||{}};
  }
  if(res==="assignments"){
   requireFinanceArea("assignments","view");
   const assigned=(await adminRead("assignments/"+claims.sub))||{};
   const sent=(await adminRead("sentAssignments/"+claims.sub))||{};
   const toInvoiceSummary=invoice=>invoice?{...invoice,lines:Array.isArray(invoice.lines)?invoice.lines.map(line=>({...line})):[],attachments:invoice.attachments||{}}:null;
   const output=[];
   for(const [assignmentId,record] of Object.entries(assigned)){
    if(!record||record.assigneeUid!==claims.sub||record.status!=="open")continue;
    const invoice=await adminRead("documents/"+id(record.invoiceId));
    if(!invoice||invoice.type!=="invoice"||invoice.assignedTo!==claims.sub||invoice.status!=="assigned")continue;
    output.push({...record,id:assignmentId,invoice:toInvoiceSummary(invoice)});
   }
   const sentOutput=[];
   for(const [assignmentId,record] of Object.entries(sent)){
    if(!record||record.createdBy!==claims.sub)continue;
    const invoice=await adminRead("documents/"+id(record.invoiceId));
    if(!invoice||invoice.type!=="invoice")continue;
    sentOutput.push({...record,id:assignmentId,invoice:toInvoiceSummary(invoice)});
   }
   sentOutput.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
   return {items:output,sentItems:sentOutput};
  }
  throw new Error("Unknown financial data resource.");
 }
 if(request.method!=="POST")throw new Error("Method not allowed.");const action=txt(body.action,40),now=Date.now();
 if(action==="transferPartnerCurrentAccountBulk"){
  if(profile.role!=="admin")throw new Error("تحويلات جاري الشركاء متاحة لمدير النظام فقط.");
  const ownerUid=id(body.ownerUid),direction=txt(body.direction,24);
  if(!["toCurrent","toCustody"].includes(direction))throw new Error("اتجاه التحويل غير صحيح.");
  const transactionIds=Array.isArray(body.transactionIds)?[...new Set(body.transactionIds.map(value=>id(value)).filter(Boolean))]:[];
  if(!transactionIds.length)throw new Error("لم يتم تحديد حركات لتحويلها.");
  if(transactionIds.length>100)throw new Error("يُسمح بتحويل 100 حركة في الطلب الواحد كحد أقصى. أرسل الحركات على دفعات.");
  const user=adminReadRoot?await adminReadRoot("users/"+ownerUid):null;
  if(!user)throw new Error("المستخدم صاحب الحركات غير موجود.");
  const normalize=value=>String(value||"").trim().toLowerCase().replace(/\s+/g," ");
  const config=PARTNER_CURRENT_ACCOUNT_CONFIG.find(item=>item.email
   ?normalize(user.email)===normalize(item.email)
   :[normalize(user.username),normalize(user.fullName),normalize(String(user.email||"").split("@")[0])].includes(normalize(item.username)));
  if(!config)throw new Error("المستخدم المحدد غير مربوط بحساب جاري أحد الشريكين.");
  if(!["active","نشط","مفعل","enabled"].includes(String(user.status||"").toLowerCase()))throw new Error("حساب الشريك المرتبط غير نشط.");
  const results=[];
  for(const transactionId of transactionIds){
   const transaction=adminReadRoot?await adminReadRoot("cashCustodies/"+ownerUid+"/transactions/"+transactionId):null;
   if(!transaction){results.push({transactionId,success:false,error:"حركة العهدة غير موجودة."});continue;}
   const transfer=transaction.partnerCurrentAccountTransfer||{};
   const stateMatches=direction==="toCurrent"?transfer.active!==true:transfer.active===true;
   if(!stateMatches){results.push({transactionId,success:false,skipped:true,error:direction==="toCurrent"?"الحركة محولة بالفعل أو ليست ضمن العهدة المتاحة.":"الحركة غير محولة حاليًا إلى الجاري."});continue;}
   if(transfer.pending===true){results.push({transactionId,success:false,skipped:true,error:"هناك طلب تحويل لهذه الحركة ما زال في انتظار المراجعة."});continue;}
   try{
    const result=await handleFinancialRequest({...ctx,body:{...body,action:"transferPartnerCurrentAccount",ownerUid,transactionId,direction}});
    results.push({transactionId,success:true,amount:num(transaction.amount||0),journalId:result.journalId,journalNumber:result.journalNumber,accountCode:result.accountCode});
   }catch(error){
    results.push({transactionId,success:false,amount:num(transaction.amount||0),error:String(error&&error.message||error).slice(0,360)});
   }
  }
  const completed=results.filter(item=>item.success);
  return {success:completed.length>0,status:"pending_review",ownerUid,direction,accountCode:config.code,partnerName:config.partnerName,requested:transactionIds.length,submitted:completed.length,failed:results.filter(item=>!item.success&&!item.skipped).length,skipped:results.filter(item=>item.skipped).length,totalAmount:rnd(completed.reduce((sum,item)=>sum+Number(item.amount||0),0)),journalIds:completed.map(item=>item.journalId),results};
 }
 if(action==="transferPartnerCurrentAccount"){
  if(profile.role!=="admin")throw new Error("تحويلات جاري الشركاء متاحة لمدير النظام فقط.");
  const ownerUid=id(body.ownerUid),transactionId=id(body.transactionId),direction=txt(body.direction,24);
  if(!["toCurrent","toCustody"].includes(direction))throw new Error("اتجاه التحويل غير صحيح.");
  const user=adminReadRoot?await adminReadRoot("users/"+ownerUid):null;
  if(!user)throw new Error("المستخدم صاحب الحركة غير موجود.");
  const normalize=value=>String(value||"").trim().toLowerCase().replace(/\s+/g," ");
  const username=normalize(user.username),fullName=normalize(user.fullName),emailName=normalize(String(user.email||"").split("@")[0]);
  const config=PARTNER_CURRENT_ACCOUNT_CONFIG.find(item=>item.email
   ?normalize(user.email)===normalize(item.email)
   :[username,fullName,emailName].includes(normalize(item.username)));
  if(!config)throw new Error("هذا المستخدم ليس ضمن الشريكين المحددين لحسابات الجاري.");
  if(!["active","نشط","مفعل","enabled"].includes(String(user.status||"").toLowerCase()))throw new Error("حساب الشريك المرتبط غير نشط. لم يتم تحويل الحركة إلى حساب آخر.");
  const path="cashCustodies/"+ownerUid+"/transactions/"+transactionId;
  const transaction=adminReadRoot?await adminReadRoot(path):null;
  if(!transaction||transaction.id!==transactionId)throw new Error("سجل العهدة المطلوب غير موجود.");
  if(transaction.ownerUid!==ownerUid||transaction.bookScope!=="personal"||transaction.pairRole==="counterparty")throw new Error("يمكن تحويل السجل الأصلي من دفتر العهدة الشخصية للشريك فقط.");
  if(transaction.status!=="approved")throw new Error("لا يمكن التحويل قبل اعتماد حركة العهدة.");
  if(String(transaction.currency||"EGP").toUpperCase()!=="EGP")throw new Error("تحويل الجاري متاح حاليًا للجنيه المصري فقط.");
  const previousTransfer=transaction.partnerCurrentAccountTransfer||{},currentState=previousTransfer.active===true;
  if(previousTransfer.pending===true)throw new Error("هناك تحويل سابق لهذا السجل ما زال في انتظار المراجعة.");
  if(direction==="toCurrent"&&currentState)throw new Error("هذه الحركة محولة بالفعل إلى جاري الشريك.");
  if(direction==="toCustody"&&!currentState)throw new Error("هذه الحركة غير موجودة حاليًا في جاري الشريك.");
  const sourceJournalId=transaction.financialJournalId||transaction.financialDocumentId||await adminRead("cashCustodyJournalLinks/"+ownerUid+"/"+transactionId);
  if(!sourceJournalId)throw new Error("لا يوجد قيد محاسبي مرتبط بحركة العهدة. أرسل الحركة للمراجعة واعتمد قيدها أولاً.");
  const sourceJournal=await adminRead("journals/"+id(sourceJournalId))||await adminRead("documents/"+id(sourceJournalId));
  if(!sourceJournal||sourceJournal.status!=="posted")throw new Error("يجب ترحيل قيد حركة العهدة أولاً قبل تحويلها إلى الجاري.");
  const sourceLines=(sourceJournal.lines||[]).filter(line=>line&&String(line.accountCode)==="1220"&&line.partyType==="employeeCustody"&&String(line.partyId)===ownerUid&&(Number(line.debit||0)>0||Number(line.credit||0)>0));
  if(sourceLines.length!==1)throw new Error("تعذر تحديد سطر العهدة الأصلي بصورة وحيدة وآمنة. راجع القيد قبل التحويل.");
  const originalLine=sourceLines[0],chart=(await adminRead("chartOfAccounts"))||{},partnerAccount=chart[config.code],custodyAccount=chart["1220"];
  if(!partnerAccount||partnerAccount.isGroup||partnerAccount.active===false||partnerAccount.subledgerType!=="partnerCurrentAccount")throw new Error("حساب جاري الشريك "+config.code+" غير مهيأ في دليل الحسابات. حدّث النظام المالي أولاً.");
  if(!custodyAccount||custodyAccount.isGroup||custodyAccount.active===false)throw new Error("حساب العهدة 1220 غير نشط.");
  const originalDebit=num(originalLine.debit||0),originalCredit=num(originalLine.credit||0);
  if(rnd(originalDebit+originalCredit)<=0)throw new Error("قيمة سطر العهدة الأصلي تساوي صفرًا.");
  const toCurrent=direction==="toCurrent";
  const partnerDebit=toCurrent?originalDebit:originalCredit,partnerCredit=toCurrent?originalCredit:originalDebit;
  const description=(toCurrent?"تحويل من العهدة إلى جاري الشريك — ":"إعادة من جاري الشريك إلى العهدة — ")+config.partnerName+" — "+txt(transaction.description||transactionId,240);
  const projectCode=txt(transaction.projectCode||originalLine.projectCode||"",120),costCenterId=txt(originalLine.costCenterId||"",120),dateValue=date(new Date(now).toISOString().slice(0,10));
  const transferId=uid("PCA"),journalId=uid("PCA-JRN");
  const lines=[
   {accountCode:config.code,debit:partnerDebit,credit:partnerCredit,description,partyType:"partnerCurrentAccount",partyId:ownerUid,projectCode,costCenterId,reference:txt(transaction.reference||transactionId,120)},
   {accountCode:"1220",debit:partnerCredit,credit:partnerDebit,description,partyType:"employeeCustody",partyId:ownerUid,projectCode,costCenterId,reference:txt(transaction.reference||transactionId,120)}
  ];
  const totals=balance(lines);
  if(Math.abs(totals.difference)>0.01)throw new Error("قيد إعادة التصنيف غير متوازن. تم إيقاف التحويل.");
  const journal={id:journalId,number:journalNumberFor(dateValue,journalId),type:"journal",sourceType:"partnerCurrentAccountTransfer",sourceId:ownerUid+"--"+transactionId+"--"+transferId,ownerUid,partnerCurrentAccountUid:ownerUid,partnerCurrentAccountCode:config.code,custodyTransactionId:transactionId,transferDirection:direction,date:dateValue,description,reference:txt(transaction.reference||transactionId,120),currency:"EGP",amount:rnd(originalDebit+originalCredit),lines,status:"pending_review",balance:totals,createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120),title:description};
  const centers=(await adminRead("costCenters"))||{},validation=validateJournal(journal,chart,centers);
  if(validation.errors.length)throw new Error("قيد إعادة التصنيف غير صالح: "+validation.errors.join("؛ "));
  journal.balance=validation.balance;journal.errors=[];
  const rootUpdates={};
  rootUpdates["financial/documents/"+journalId]=journal;
  rootUpdates["financial/reviewQueue/"+journalId]=reviewRecord(journal);
  rootUpdates["financial/audit/"+uid("AUD")]={action:"submit_partner_current_transfer_for_review",documentId:journalId,ownerUid,transactionId,partnerAccountCode:config.code,direction,uid:claims.sub,createdAt:now};
  const historyPath=path+"/partnerCurrentAccountTransferHistory/"+transferId;
  rootUpdates[historyPath]={id:transferId,direction,partnerUid:ownerUid,partnerName:config.partnerName,accountCode:config.code,journalId,amount:rnd(originalDebit+originalCredit),date:dateValue,status:"pending_review",createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120)};
  rootUpdates[path+"/partnerCurrentAccountTransfer"]={...previousTransfer,active:currentState,pending:true,pendingDirection:direction,pendingJournalId:journalId,pendingTransferId:transferId,pendingAt:now,pendingBy:claims.sub,partnerUid:ownerUid,partnerName:config.partnerName,accountCode:config.code,accountName:config.name,lastDirection:direction,lastJournalId:journalId,updatedAt:now,updatedBy:claims.sub};
  rootUpdates[path+"/partnerCurrentAccountTransferActive"]=currentState;
  rootUpdates[path+"/partnerCurrentAccountLastJournalId"]=journalId;
  if(!adminPatchRoot)throw new Error("خدمة الترحيل الموحد لجاري الشركاء غير متاحة.");
  await adminPatchRoot(rootUpdates);
  return {success:true,status:"pending_review",journalId,journalNumber:journal.number,accountCode:config.code,partnerName:config.partnerName,transactionId};
 }
 if(action==="transferCashCustodyMovement"){
  if(profile.role!=="admin")throw new Error("تحويل حركات العهدة متاح لمدير النظام فقط.");
  const ownerUid=id(body.ownerUid),transactionId=id(body.transactionId),destinationOwnerUid=id(body.destinationOwnerUid);
  if(!ownerUid||!transactionId||!destinationOwnerUid||ownerUid===destinationOwnerUid)throw new Error("حدد صاحب العهدة الأصلية وصاحب العهدة المستفيدة بصورة صحيحة.");
  const sourcePath="cashCustodies/"+ownerUid+"/transactions/"+transactionId;
  const transaction=adminReadRoot?await adminReadRoot(sourcePath):null;
  if(!transaction||transaction.id!==transactionId||transaction.ownerUid!==ownerUid||transaction.bookScope!=="personal"||transaction.pairRole==="counterparty")throw new Error("حركة العهدة الأصلية غير موجودة أو غير قابلة للتحويل.");
  if(transaction.status!=="approved")throw new Error("يجب أن تكون حركة العهدة الأصلية معتمدة.");
  if(String(transaction.currency||"EGP").toUpperCase()!=="EGP")throw new Error("التحويل متاح حاليًا بالجنيه المصري فقط.");
  const transfer=transaction.cashCustodyTransfer||{};
  if(transfer.pending===true||transfer.active===true)throw new Error("الحركة محولة بالفعل أو يوجد طلب تحويل لها قيد المراجعة.");
  const destinationUser=adminReadRoot?await adminReadRoot("users/"+destinationOwnerUid):null;
  if(!destinationUser||!["active","نشط","مفعل","enabled"].includes(String(destinationUser.status||"").toLowerCase()))throw new Error("صاحب العهدة المستفيدة غير موجود أو غير نشط.");
  const sourceJournalId=transaction.financialJournalId||transaction.financialDocumentId||await adminRead("cashCustodyJournalLinks/"+ownerUid+"/"+transactionId);
  if(!sourceJournalId)throw new Error("لا يوجد قيد محاسبي مرتبط بحركة العهدة. يجب ترحيل قيدها الأصلي أولاً.");
  const sourceJournal=await adminRead("journals/"+id(sourceJournalId))||await adminRead("documents/"+id(sourceJournalId));
  if(!sourceJournal||sourceJournal.status!=="posted")throw new Error("يجب ترحيل القيد الأصلي قبل تحويل الحركة.");
  const sourceLines=(sourceJournal.lines||[]).filter(line=>line&&String(line.accountCode)==="1220"&&line.partyType==="employeeCustody"&&String(line.partyId)===ownerUid&&(Number(line.debit||0)>0||Number(line.credit||0)>0));
  if(sourceLines.length!==1)throw new Error("تعذر تحديد سطر العهدة الأصلي بصورة آمنة.");
  const originalLine=sourceLines[0],chart=(await adminRead("chartOfAccounts"))||{},custodyAccount=chart["1220"];
  if(!custodyAccount||custodyAccount.isGroup||custodyAccount.active===false)throw new Error("حساب العهدة 1220 غير نشط أو غير قابل للترحيل.");
  const originalDebit=num(originalLine.debit||0),originalCredit=num(originalLine.credit||0),amount=rnd(originalDebit+originalCredit);
  if(amount<=0)throw new Error("قيمة الحركة الأصلية تساوي صفرًا.");
  const sourceUser=adminReadRoot?await adminReadRoot("users/"+ownerUid):null;
  const sourceName=txt(sourceUser&&(sourceUser.fullName||sourceUser.username||sourceUser.email)||ownerUid,160);
  const destinationName=txt(destinationUser.fullName||destinationUser.username||destinationUser.email||destinationOwnerUid,160);
  const description="تحويل عهدة من "+sourceName+" إلى "+destinationName+" — "+txt(transaction.description||transactionId,220);
  const projectCode=txt(transaction.projectCode||originalLine.projectCode||"",120),costCenterId=txt(originalLine.costCenterId||"",120),dateValue=date(new Date(now).toISOString().slice(0,10));
  const transferId=uid("CCT"),journalId=uid("CCT-JRN"),mirrorId=uid("CCT-MIR");
  const lines=[
   {accountCode:"1220",debit:originalDebit,credit:originalCredit,description,partyType:"employeeCustody",partyId:destinationOwnerUid,projectCode,costCenterId,reference:txt(transaction.reference||transactionId,120)},
   {accountCode:"1220",debit:originalCredit,credit:originalDebit,description,partyType:"employeeCustody",partyId:ownerUid,projectCode,costCenterId,reference:txt(transaction.reference||transactionId,120)}
  ];
  const totals=balance(lines);
  if(Math.abs(totals.difference)>0.01)throw new Error("قيد إعادة تصنيف العهدة غير متوازن.");
  const journal={id:journalId,number:journalNumberFor(dateValue,journalId),type:"journal",sourceType:"cashCustodyTransfer",sourceId:ownerUid+"--"+transactionId+"--"+transferId,ownerUid,destinationOwnerUid,destinationName,custodyTransactionId:transactionId,custodyTransferId:transferId,custodyMirrorId:mirrorId,date:dateValue,description,reference:txt(transaction.reference||transactionId,120),currency:"EGP",amount,lines,status:"pending_review",balance:totals,createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120),title:description};
  const centers=(await adminRead("costCenters"))||{},validation=validateJournal(journal,chart,centers);
  if(validation.errors.length)throw new Error("قيد تحويل العهدة غير صالح: "+validation.errors.join("؛ "));
  journal.balance=validation.balance;journal.errors=[];
  const mirror={...transaction,id:mirrorId,ownerUid:destinationOwnerUid,bookScope:"personal",status:"pending",pairRole:"counterparty",pairGroupId:transferId,linkedOwnerUid:ownerUid,linkedTransactionId:transactionId,counterparty:sourceName,counterpartyType:"user",counterpartyUid:ownerUid,counterpartyName:sourceName,description:"حركة عهدة محولة من "+sourceName+": "+txt(transaction.description||transactionId,220),financialReviewStatus:"pending_review",financialJournalId:journalId,cashCustodyTransfer:{active:false,pending:true,pendingJournalId:journalId,transferId,sourceOwnerUid:ownerUid,sourceTransactionId:transactionId}};
  const rootUpdates={};
  rootUpdates["financial/documents/"+journalId]=journal;
  rootUpdates["financial/reviewQueue/"+journalId]=reviewRecord(journal);
  rootUpdates["financial/audit/"+uid("AUD")]={action:"submit_cash_custody_transfer_for_review",documentId:journalId,ownerUid,destinationOwnerUid,transactionId,transferId,uid:claims.sub,createdAt:now};
  rootUpdates[sourcePath+"/cashCustodyTransfer"]={active:false,pending:true,pendingJournalId:journalId,transferId,destinationOwnerUid,destinationName,mirrorId,createdAt:now,createdBy:claims.sub};
  rootUpdates[sourcePath+"/cashCustodyTransferHistory/"+transferId]={id:transferId,journalId,destinationOwnerUid,destinationName,mirrorId,amount,date:dateValue,status:"pending_review",createdAt:now,createdBy:claims.sub};
  rootUpdates["cashCustodies/"+destinationOwnerUid+"/transactions/"+mirrorId]=mirror;
  if(!adminPatchRoot)throw new Error("خدمة التحويل الموحد للعهد غير متاحة.");
  await adminPatchRoot(rootUpdates);
  return {success:true,status:"pending_review",journalId,journalNumber:journal.number,amount,destinationOwnerUid,destinationName};
 }
 if(action==="ocr"||action==="ocrText"){
  requireFinanceArea("invoices","add");
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
  const prompt="Read this Egyptian e-invoice page "+pageNumber+" of "+totalPages+". Return only valid JSON with fields type (purchase or sales or unknown), internalIdValue, number, date YYYY-MM-DD, issuerName, issuerTaxNumber, recipientName, recipientTaxNumber, partyName, taxNumber, currency, netTotal, taxRate, taxAmount, total, discount, items array. IMPORTANT INVOICE NUMBER RULE: when the document contains the label 'Internal id' (case-insensitive, optional spaces and either colon style), read ONLY the first contiguous numeric digit sequence immediately to the right of that label on THE SAME HORIZONTAL ROW. Return digits only in internalIdValue and number. Example: 'Internal ID: 13672 EXTRA COLUMN 999' means number='13672' only. Stop at the first non-digit. Ignore letters, slashes, labels, spaces and all other nearby numbers. This same-row token takes priority over any other serial, UUID, receipt ID or AI guess. The company's Egyptian tax registration number is "+COMPANY_TAX_REGISTRATION_NUMBER+". Read the two party blocks separately: Issuer (From) is the document issuer/seller; Recipients (To) is the recipient/buyer. Determine direction from exact tax-number match: when the company number appears in Recipients (To), this is a PURCHASE invoice received by the company from the Issuer; when the company number appears in Issuer (From), this is a SALES invoice issued by the company to the Recipient. In these cases set type accordingly, and set partyName and taxNumber to the OTHER party (supplier for purchase, customer for sales), not our own company. Do not infer direction from words like Total Sales Amount, item descriptions, or filename. If neither party tax number matches the company number, return the separately extracted issuer/recipient fields and use explicit invoice roles only; otherwise type=unknown. Each item must include description, quantity, unit, unitPrice, discount, kind (stock or service), itemCode if printed, and suggestedExpenseCode if it is an expense and a matching code exists in the allowed account list. Classify as stock ONLY goods that should enter inventory for resale or production. Classify maintenance, repairs, training, cleaning, pantry, hospitality, stationery, office supplies, transport, utilities, consulting and similar consumed services/costs as service. Allowed expense accounts: "+JSON.stringify(accounts)+". Select suggestedExpenseCode only from this list. This is one page of a possibly multi-page invoice: extract header fields when visible and only the line items actually visible on this page. Do not invent unreadable values. Preserve Arabic and English. Human review is mandatory.";
  const messages=[{role:"user",content:[{type:"text",text:prompt},...content]}];
  const out=await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct",{messages,max_tokens:2200,temperature:0.1});
  let raw=String(out&&out.response||"").trim();const first=raw.indexOf("{"),last=raw.lastIndexOf("}");
  if(first<0||last<=first)throw new Error("تعذر استخراج بيانات واضحة من الفاتورة. أدخل البيانات يدويًا.");
  let data;try{data=JSON.parse(raw.slice(first,last+1));}catch(_){throw new Error("نتيجة قراءة الفاتورة غير مكتملة. أدخل البيانات يدويًا.");}
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("نتيجة قراءة الفاتورة غير صالحة.");
  const etaParties=textOnly?extractEtaInvoiceParties(body.text):{};
  const internalInvoiceNumber=extractInternalInvoiceNumber(textOnly?body.text:"Internal ID: "+String(data.internalIdValue||data.number||""));
  if(internalInvoiceNumber)data.number=internalInvoiceNumber;
  delete data.internalIdValue;
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
  const permissionArea=financeAreaForMaster(kind);
  let previous=body.originalCode?await adminRead(kind+"/"+originalCode):null;
  if(body.originalCode&&!previous&&kind==="parties"&&adminReadRoot){
   previous=await adminReadRoot("clients/"+originalCode)||await adminReadRoot("vendors/"+originalCode);
  }
  if(body.originalCode&&!previous)throw new Error("السجل المراد تعديله لم يعد موجودًا. حدّث القائمة ثم حاول مرة أخرى.");
  const sameKey=Boolean(body.originalCode)&&originalCode===code;
  const target=sameKey?previous:await adminRead(kind+"/"+code);
  if(target&&!sameKey&&kind!=="parties")throw new Error("هذا الكود مسجل بالفعل. اختر كودًا غير مستخدم.");
  if(kind==="parties"&&target&&target.partyType&&target.partyType!==item.partyType)throw new Error("هذا الكود مسجل بالفعل لنوع طرف مختلف.");
  if(!txt(item.name,180))throw new Error("الاسم مطلوب");
  if(kind==="parties"&&hasPermission(profile,"master",previous?"edit":"add")){}
  else requireFinanceArea(permissionArea,previous?"edit":"add");
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
    body.originalCode&&!sameKey?adminReadRoot("clients/"+code):Promise.resolve(null),
    body.originalCode&&!sameKey?adminReadRoot("vendors/"+code):Promise.resolve(null)
   ]);
   const correctParty=item.partyType==="customer"?currentCustomer:currentVendor;
   const oppositeParty=item.partyType==="customer"?currentVendor:currentCustomer;
   if(targetCustomer||targetVendor)throw new Error("الكود الجديد مستخدم بالفعل في سجل العملاء أو الموردين.");
   if(oppositeParty)throw new Error("هذا الكود مستخدم بالفعل في سجل "+(item.partyType==="customer"?"الموردين":"العملاء")+".");
   const partyNameOf=p=>String(p&&(p.name||p.companyName||p.legalName||p.supplierName||p.vendorName||p.customerName||p.clientName)||"").trim();
   const taxOf=p=>String(p&&(p.taxNumber||p.taxRegistrationNumber||p.registrationNumber||p.registrationNo||p.vatNumber||p.taxId)||"").replace(/[^0-9]/g,"");
   const mergedPrevious=previous||target||correctParty||{};
   if(mergedPrevious.partyType&&mergedPrevious.partyType!==item.partyType)throw new Error("لا يمكن تحويل سجل العميل إلى مورد أو العكس بعد إنشائه؛ أنشئ سجلًا جديدًا بالنوع الصحيح.");
   if(!previous&&partyNameOf(correctParty)&&partyNameOf(correctParty)!==txt(item.name,180)&&!(taxOf(correctParty)&&taxOf(item)&&taxOf(correctParty)===taxOf(item)))throw new Error("كود المورد/العميل موجود باسم أو رقم ضريبي مختلف في السجل الرئيسي.");
   linkedExisting=Boolean((target||correctParty)&&!previous);
   const supplied=Object.fromEntries(Object.entries(item).filter(([,value])=>value!==undefined&&value!==null&&value!==""));
   saved={...(correctParty||{}),...(target||{}),...(previous||{}),...supplied,code,name:txt(item.name,180),partyType:item.partyType,active:item.active!==false,createdAt:(previous&&previous.createdAt)||(target&&target.createdAt)||(correctParty&&correctParty.createdAt)||now,createdBy:(previous&&previous.createdBy)||(target&&target.createdBy)||(correctParty&&correctParty.createdBy)||claims.sub,updatedAt:now,updatedBy:claims.sub};
   if(!saved.taxNumber&&saved.taxRegistrationNumber)saved.taxNumber=saved.taxRegistrationNumber;
   if(!saved.taxRegistrationNumber&&saved.taxNumber)saved.taxRegistrationNumber=saved.taxNumber;
   const root=saved.partyType==="customer"?"clients":"vendors";
   saved.companyName=saved.companyName||saved.name;
   if(previous&&!sameKey){
    if(!adminPatchRootAt)throw new Error("خدمة تحديث سجل العملاء والموردين غير متاحة.");
    await adminPatchRootAt(root,{[code]:saved,[originalCode]:null});
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
  return {success:true,item:saved,linkedExisting:kind==="parties"&&linkedExisting,created:!previous&&!target};
 }
 if(action==="deleteMasters"){
  const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];
  if(!allowed.includes(kind))throw new Error("Unsupported master data type.");
  const rawCodes=Array.isArray(body.codes)?body.codes:[];
  const codes=Array.from(new Set(rawCodes.map(value=>id(value))));
  if(!codes.length)throw new Error("حدد سجلًا واحدًا على الأقل للحذف.");
  if(codes.length>50)throw new Error("الحد الأقصى 50 سجلًا في عملية الحذف المتعدد.");
  requireFinanceMaster(kind,"delete");
  const now=Date.now(),updates={},rootUpdates={},results=[];
  let deleted=0,deactivated=0,notFound=0,failed=0;
  const rootName=kind==="parties"?(body.partyType==="vendor"?"vendors":"clients"):"";
  if(kind==="parties"&&!["customer","vendor"].includes(body.partyType))throw new Error("حدد نوع الأطراف قبل الحذف المتعدد.");
  for(const code of codes){
   try{
    let existing=await adminRead(kind+"/"+code);
    if(kind==="parties"&&adminReadRoot){
     const rootRecord=await adminReadRoot(rootName+"/"+code);
     existing=existing||rootRecord;
    }
    if(!existing){notFound++;results.push({code,status:"not_found"});continue;}
    if(kind==="parties"&&existing.partyType&&existing.partyType!==body.partyType)throw new Error("نوع الطرف لا يطابق القائمة المحددة.");
    const usages=await findMasterReferences(ctx,kind,code,kind==="parties"?body.partyType:"");
    const updatedRecord={...existing,code,active:false,updatedAt:now,updatedBy:claims.sub};
    const wasReferenced=usages.length>0;
    updates[kind+"/"+code]=wasReferenced?updatedRecord:null;
    updates["audit/"+uid("AUD")]={action:wasReferenced?"deactivate_master":"delete_master",kind,code,uid:claims.sub,createdAt:now,...(wasReferenced?{references:usages}:{})};
    if(kind==="parties")rootUpdates[code]=wasReferenced?updatedRecord:null;
    if(wasReferenced){deactivated++;results.push({code,status:"deactivated",references:usages});}
    else{deleted++;results.push({code,status:"deleted"});}
   }catch(error){
    failed++;results.push({code,status:"failed",error:String(error&&error.message||error)});
   }
  }
  if(kind==="parties"&&Object.keys(rootUpdates).length){
   if(!adminPatchRootAt)throw new Error("خدمة سجل العملاء والموردين غير متاحة.");
   await adminPatchRootAt(rootName,rootUpdates);
  }
  if(Object.keys(updates).length)await adminPatch(updates);
  return {success:failed===0,kind,requested:codes.length,deleted,deactivated,notFound,failed,results};
 }
 if(action==="deleteMaster"){
  const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];
  if(!allowed.includes(kind))throw new Error("Unsupported master data type.");
  const code=id(body.code);
  let existing=await adminRead(kind+"/"+code);
  let crmCustomer=null,crmVendor=null;
  if(kind==="parties"&&adminReadRoot){
   [crmCustomer,crmVendor]=await Promise.all([adminReadRoot("clients/"+code),adminReadRoot("vendors/"+code)]);
   existing=existing||crmCustomer||crmVendor;
  }
  if(!existing)throw new Error("السجل غير موجود أو تم حذفه بالفعل.");
  requireFinanceMaster(kind,"delete");
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
    if(!adminPatchRootAt)throw new Error("خدمة تحديث سجل العملاء والموردين غير متاحة.");
    await adminPatchRootAt(root,{[code]:updated});
   }
   await adminPatch(updates);
   return {success:true,deleted:false,deactivated:true,code,references:usages,item:updated};
  }
  const updates={[kind+"/"+code]:null};
  updates["audit/"+uid("AUD")]={action:"delete_master",kind,code,uid:claims.sub,createdAt:now};
  if(kind==="parties"){
   if(!adminPatchRootAt)throw new Error("خدمة تحديث سجل العملاء والموردين غير متاحة.");
   await adminPatchRootAt("clients",{[code]:null});
   await adminPatchRootAt("vendors",{[code]:null});
  }
  await adminPatch(updates);
  return {success:true,deleted:true,deactivated:false,code,references:[]};
 }
 if(action==="importMasters"){
  const kind=txt(body.kind,32),allowed=["chartOfAccounts","costCenters","items","itemGroups","warehouses","bankAccounts","taxCodes","parties"];
  if(!allowed.includes(kind))throw new Error("Unsupported master data import type.");
  requireFinanceMaster(kind,"add");
  const sourceRows=Array.isArray(body.rows)?body.rows:[];
  if(!sourceRows.length)throw new Error("ملف الاستيراد لا يحتوي على صفوف.");
  if(sourceRows.length>500)throw new Error("الحد الأقصى 500 سجل في عملية الاستيراد الواحدة.");
  const existing=(await adminRead(kind))||{},groups=(await adminRead("itemGroups"))||{},seen=new Set(),updates={},rootUpdates={};
  const partyRoot=kind==="parties"?(body.partyType==="customer"?"clients":body.partyType==="vendor"?"vendors":""):"";
  if(kind==="parties"&&!partyRoot)throw new Error("حدد هل ملف الأطراف للعملاء أم الموردين.");
  const legacy=partyRoot&&adminReadRoot?(await adminReadRoot(partyRoot))||{}:{};
  const otherLegacy=partyRoot&&adminReadRoot?(await adminReadRoot(partyRoot==="clients"?"vendors":"clients"))||{}:{};
  let count=0,created=0,updated=0,unchanged=0;
  for(let i=0;i<sourceRows.length;i++){
   const row=sourceRows[i]||{},code=id(row.code),name=txt(row.name,180);
   if(!name)throw new Error("الصف "+(i+2)+": الاسم مطلوب.");
   if(seen.has(code))throw new Error("الصف "+(i+2)+": الكود "+code+" مكرر داخل الملف.");
   if(kind==="parties"&&otherLegacy&&otherLegacy[code])throw new Error("الصف "+(i+2)+": الكود "+code+" مسجل بالفعل كنوع طرف مختلف.");
   const rootPrevious=kind==="parties"?(legacy&&legacy[code]||null):null;
   const financePrevious=existing[code]||null;
   const previous=financePrevious||rootPrevious;
   if(previous&&kind==="parties"&&previous.partyType&&previous.partyType!==body.partyType)throw new Error("الصف "+(i+2)+": الكود "+code+" مسجل بنوع طرف مختلف.");
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
   // Empty spreadsheet cells mean "leave the current value unchanged"; false and zero remain valid updates.
   const supplied=Object.fromEntries(Object.entries(row).filter(([,value])=>value!==undefined&&value!==null&&value!==""));
   const changed=!previous||Object.entries(supplied).some(([field,value])=>JSON.stringify(previous[field])!==JSON.stringify(value));
   const saved={
    ...(previous||{}),...supplied,code,name,
    active:previous?previous.active!==false:row.active!==false,
    createdAt:(previous&&previous.createdAt)||now,
    createdBy:(previous&&previous.createdBy)||claims.sub,
    updatedAt:changed?now:(previous&&previous.updatedAt)||now,
    updatedBy:changed?claims.sub:(previous&&previous.updatedBy)||claims.sub
   };
   if(kind==="parties"){
    saved.partyType=body.partyType;
    saved.companyName=saved.companyName||saved.name;
    if(!saved.taxNumber&&saved.taxRegistrationNumber)saved.taxNumber=saved.taxRegistrationNumber;
    if(!saved.taxRegistrationNumber&&saved.taxNumber)saved.taxRegistrationNumber=saved.taxNumber;
   }
   const financeChanged=!financePrevious||Object.entries(supplied).some(([field,value])=>JSON.stringify(financePrevious[field])!==JSON.stringify(value));
   if(financeChanged||!financePrevious)updates[kind+"/"+code]=saved;
   if(kind==="parties"){
    const rootChanged=!rootPrevious||Object.entries(supplied).some(([field,value])=>JSON.stringify(rootPrevious[field])!==JSON.stringify(value));
    if(rootChanged)rootUpdates[code]=saved;
   }
   if(previous){if(changed)updated++;else unchanged++;}else created++;
   count++;
  }
  const audit={action:"import_masters_upsert",kind,count,created,updated,unchanged,uid:claims.sub,createdAt:now};
  if(kind==="parties"){
   if(!adminPatchRootAt)throw new Error("خدمة سجل العملاء والموردين غير متاحة.");
   if(Object.keys(rootUpdates).length)await adminPatchRootAt(partyRoot,rootUpdates);
   if(Object.keys(updates).length)await adminPatch(updates);
   await adminPatch({["audit/"+uid("AUD")]:audit});
  }else{
   updates["audit/"+uid("AUD")]=audit;
   await adminPatch(updates);
  }
  return {success:true,kind,count,created,updated,unchanged};
 }
 if(action==="submitProjectEvent"){
  const projectCode=id(body.projectCode),submitted=body.event&&typeof body.event==="object"&&!Array.isArray(body.event)?body.event:{};
  const eventId=id(submitted.id||uid("PRJ-EVT")),project=adminReadRoot?await adminReadRoot("projects/"+projectCode):null;
  if(!project||typeof project!=="object")throw new Error("المشروع غير موجود أو لا يمكن الوصول إلى ملفه.");
  const projectEvents=project.events&&typeof project.events==="object"?project.events:{},previous=projectEvents[eventId]||null;
  requirePermission(profile,"projects",previous?"edit":"add");
  const actionCode=txt(submitted.actionCode||"general_note",80),partyType=txt(submitted.partyType||"",16);let partyCode=txt(submitted.partyCode||"",120);
  const partyTypeValid=["vendor","client",""].includes(partyType);
  if(!partyTypeValid)throw new Error("نوع الطرف المرتبط بالحدث غير صحيح.");
  const amount=num(submitted.amount||0),settledAmount=num(submitted.settledAmount||0),dateValue=date(submitted.date||"");
  const configuredEffects={
   purchase_order:"payable",supplier_commitment:"payable",supplier_invoice:"payable",
   customer_receivable:"receivable",customer_invoice:"receivable",payment_request:"receivable",retention_due:"receivable",
   supplier_payment:"cash_out",cash_payment:"cash_out",bank_transfer_out:"cash_out",cheque_issued:"cheque_outstanding",cheque_cleared_out:"cash_out",advance_paid:"cash_out",
   customer_collection:"cash_in",cash_received:"cash_in",bank_transfer_in:"cash_in",cheque_received:"cheque_in_transit",cheque_cleared_in:"cash_in",advance_received:"cash_in"
  };
  let effect=configuredEffects[actionCode]||"none";
  const requestedPaymentMethod=txt(submitted.paymentMethod||"",40);
  if(effect==="cash_out"&&requestedPaymentMethod==="cheque"&&actionCode!=="cheque_cleared_out")effect="cheque_outstanding";
  if(effect==="cash_in"&&requestedPaymentMethod==="cheque"&&actionCode!=="cheque_cleared_in")effect="cheque_in_transit";
  if(amount<=0)effect="none";
  const currency=txt(submitted.currency||project.currency||"EGP",3).toUpperCase();
  const event={
   ...(previous||{}),...submitted,id:eventId,projectCode,type:effect==="cash_in"?"customer_collection":effect==="cash_out"?"supplier_payment":effect==="receivable"?"customer_receivable":effect==="payable"?"supplier_commitment":actionCode,
   actionCode,actionName:txt(submitted.actionName||actionCode,180),financialEffect:effect,date:dateValue,dueDate:txt(submitted.dueDate||"",10),
   partyType,partyCode,referenceNo:txt(submitted.referenceNo||"",120),quantity:num(submitted.quantity||0),unit:txt(submitted.unit||"",40),
   amount,settledAmount,currency,status:txt(submitted.status||"open",40),paymentMethod:txt(submitted.paymentMethod||"",40),
   responsible:txt(submitted.responsible||"",120),priority:txt(submitted.priority||"normal",20),note:txt(submitted.note||"",2000),
   createdBy:previous&&previous.createdBy||claims.sub,createdByName:previous&&previous.createdByName||txt(profile.fullName||profile.username||profile.email,120),
   createdAt:previous&&previous.createdAt||now,updatedAt:previous?now:undefined,updatedBy:previous?claims.sub:undefined
  };
  let existingJournal=null;
  if(previous&&previous.accountingDocumentId){
   existingJournal=await adminRead("documents/"+id(previous.accountingDocumentId));
   if(!existingJournal||existingJournal.type!=="journal")throw new Error("القيد المرتبط بالحدث غير موجود؛ أوقف التعديل وراجع سجل النظام.");
   if(existingJournal.status==="posted"||await adminRead("sourceLocks/projectEvent_"+projectCode+"--"+eventId))throw new Error("تم ترحيل أثر هذا الحدث. لا يمكن تعديل الحدث بعد الترحيل؛ أنشئ حدث تصحيح أو قيدًا عكسيًا.");
   if(!["pending_review","needs_correction","cancelled"].includes(existingJournal.status))throw new Error("القيد المرتبط بالحدث ليس في حالة تسمح بالتعديل.");
  }
  const linkedCodes=partyType==="vendor"?(Array.isArray(project.vendorCodes)?project.vendorCodes:[]):partyType==="client"?(Array.isArray(project.clientCodes)?project.clientCodes:(project.clientCode?[project.clientCode]:[])):[];
  if(!partyCode&&linkedCodes.length===1)partyCode=id(linkedCodes[0]);
  if(partyCode&&linkedCodes.length&&!linkedCodes.map(String).includes(String(partyCode)))throw new Error("الطرف المحدد غير مرتبط بهذا المشروع. أضف المورد أو العميل إلى بيانات المشروع أولًا.");
  event.partyCode=partyCode;
  if(partyCode&&partyType){
   const party=adminReadRoot?await adminReadRoot((partyType==="vendor"?"vendors/":"clients/")+id(partyCode)):null;
   if(!party)throw new Error("العميل أو المورد المحدد غير موجود في البيانات الموحدة.");
   event.partyName=txt(party.name||party.companyName||party.legalName||event.partyName||partyCode,180);
  }
  event.accountingStatus=submitted.status==="cancelled"&&existingJournal?"cancelled":effect==="none"?"not_applicable":"pending_review";
  event.accountingImpact=effect!=="none";
  const rootUpdates={};
  rootUpdates["projects/"+projectCode+"/lastActivityAt"]=now;
  rootUpdates["projects/"+projectCode+"/lastActivityType"]=actionCode;
  let journalId=previous&&previous.accountingDocumentId||"";
  let journalErrors=[];
  if(effect!=="none"){
   if(currency!=="EGP")throw new Error("لا يمكن إنشاء قيد للمشروع بعملة أجنبية قبل تفعيل أسعار الصرف وإعادة التقييم. احفظ الحدث كغير مالي مؤقتًا أو أدخل قيمته بالجنيه المصري.");
   if(!partyCode&&["vendor","client"].includes(partyType))journalErrors.push("اختر كود العميل أو المورد المرتبط حتى يظهر الأثر في كشف حساب الطرف.");
   const cashAccount=event.paymentMethod==="bank_transfer"||event.paymentMethod==="cheque"?"1120":"1110";
   const financialAmount=["cash_in","cash_out"].includes(effect)&&settledAmount>0?settledAmount:amount;
   if(financialAmount<=0)journalErrors.push("أدخل قيمة مالية أكبر من صفر للحدث المؤثر.");
   const centerUpdates={};
   let center=await adminRead("costCenters/"+projectCode);
   if(!center){
    center={code:projectCode,name:txt(project.name||project.projectName||projectCode,180),projectCode,isProjectCenter:true,active:true,createdAt:now,createdBy:claims.sub};
    centerUpdates["costCenters/"+projectCode]=center;
   }
   let outstandingPayable=0,outstandingReceivable=0;
   if(partyCode&&partyType==="vendor"){
    const ledger=(await adminRead("partyLedger/vendor/"+partyCode))||{};
    outstandingPayable=Object.values(ledger).reduce((sum,periodRows)=>sum+Object.values(periodRows||{}).reduce((part,row)=>part+(row.accountCode==="281"?Number(row.credit||0)-Number(row.debit||0):0),0),0);
   }else if(partyCode&&partyType==="client"){
    const ledger=(await adminRead("partyLedger/customer/"+partyCode))||{};
    outstandingReceivable=Object.values(ledger).reduce((sum,periodRows)=>sum+Object.values(periodRows||{}).reduce((part,row)=>part+(row.accountCode==="1210"?Number(row.debit||0)-Number(row.credit||0):0),0),0);
   }
   const lines=[];
   if(effect==="payable"){
    lines.push({accountCode:"6100",debit:amount,credit:0,description:event.actionName,costCenterId:projectCode,projectCode});
    lines.push({accountCode:"281",debit:0,credit:amount,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
   }else if(effect==="receivable"){
    lines.push({accountCode:"1210",debit:amount,credit:0,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"customer",partyId:partyCode});
    lines.push({accountCode:"4200",debit:0,credit:amount,description:event.actionName,costCenterId:projectCode,projectCode});
   }else if(effect==="cheque_outstanding"){
    if(actionCode==="advance_paid"){
     lines.push({accountCode:"1240",debit:financialAmount,credit:0,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
    }else{
     const settled=rnd(Math.min(financialAmount,Math.max(0,outstandingPayable))),advance=rnd(financialAmount-settled);
     if(settled)lines.push({accountCode:"281",debit:settled,credit:0,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
     if(advance)lines.push({accountCode:"1240",debit:advance,credit:0,description:"دفعة مقدمة للمورد بالشيك — "+event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
    }
    lines.push({accountCode:"2140",debit:0,credit:financialAmount,description:"شيك صادر لم يقدم للبنك — "+event.actionName,costCenterId:projectCode,projectCode});
   }else if(effect==="cheque_in_transit"){
    const isAdvance=actionCode==="advance_received",settled=isAdvance?0:rnd(Math.min(financialAmount,Math.max(0,outstandingReceivable))),advance=rnd(financialAmount-settled);
    lines.push({accountCode:"1130",debit:financialAmount,credit:0,description:"شيك وارد تحت التحصيل — "+event.actionName,costCenterId:projectCode,projectCode});
    if(settled)lines.push({accountCode:"1210",debit:0,credit:settled,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"customer",partyId:partyCode});
    if(advance)lines.push({accountCode:"2130",debit:0,credit:advance,description:"دفعة مقدمة من العميل بالشيك — "+event.actionName,costCenterId:projectCode,projectCode,partyType:"customer",partyId:partyCode});
   }else if(effect==="cash_in"){
    if(actionCode==="cheque_cleared_in"){
     lines.push({accountCode:cashAccount,debit:financialAmount,credit:0,description:event.actionName,costCenterId:projectCode,projectCode});
     lines.push({accountCode:"1130",debit:0,credit:financialAmount,description:"تحصيل شيك وارد — "+event.actionName,costCenterId:projectCode,projectCode});
    }else{
     const isAdvance=actionCode==="advance_received",settled=isAdvance?0:rnd(Math.min(financialAmount,Math.max(0,outstandingReceivable))),advance=rnd(financialAmount-settled);
     lines.push({accountCode:cashAccount,debit:financialAmount,credit:0,description:event.actionName,costCenterId:projectCode,projectCode});
     if(settled)lines.push({accountCode:"1210",debit:0,credit:settled,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"customer",partyId:partyCode});
     if(advance)lines.push({accountCode:"2130",debit:0,credit:advance,description:"دفعة مقدمة من العميل — "+event.actionName,costCenterId:projectCode,projectCode,partyType:"customer",partyId:partyCode});
    }
   }else if(effect==="cash_out"){
    if(actionCode==="cheque_cleared_out"){
     lines.push({accountCode:"2140",debit:financialAmount,credit:0,description:"صرف شيك صادر — "+event.actionName,costCenterId:projectCode,projectCode});
     lines.push({accountCode:cashAccount,debit:0,credit:financialAmount,description:event.actionName,costCenterId:projectCode,projectCode});
    }else if(actionCode==="advance_paid"){
     lines.push({accountCode:"1240",debit:financialAmount,credit:0,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
     lines.push({accountCode:cashAccount,debit:0,credit:financialAmount,description:event.actionName,costCenterId:projectCode,projectCode});
    }else{
     const settled=rnd(Math.min(financialAmount,Math.max(0,outstandingPayable))),advance=rnd(financialAmount-settled);
     if(settled)lines.push({accountCode:"281",debit:settled,credit:0,description:event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
     if(advance)lines.push({accountCode:"1240",debit:advance,credit:0,description:"دفعة مقدمة للمورد — "+event.actionName,costCenterId:projectCode,projectCode,partyType:"vendor",partyId:partyCode});
     lines.push({accountCode:cashAccount,debit:0,credit:financialAmount,description:event.actionName,costCenterId:projectCode,projectCode});
    }
   }
   if(lines.length<2)journalErrors.push("تعذر تكوين سطور القيد المقترح لهذا الحدث.");
   const chart=(await adminRead("chartOfAccounts"))||{},centers=Object.assign({},(await adminRead("costCenters"))||{});
   if(center)centers[projectCode]=center;
   const journalIdNext=journalId||uid("PRJ-JRN"),journal={
    ...(existingJournal||{}),id:journalIdNext,type:"journal",sourceType:"projectEvent",sourceId:projectCode+"--"+eventId,
    projectCode,date:dateValue,description:"أثر محاسبي لمشروع "+projectCode+" — "+event.actionName,
    reference:event.referenceNo||eventId,currency:"EGP",lines,status:"pending_review",
    createdAt:existingJournal&&existingJournal.createdAt||now,createdBy:existingJournal&&existingJournal.createdBy||claims.sub,
    createdByName:existingJournal&&existingJournal.createdByName||txt(profile.fullName||profile.username||profile.email,120)
   };
   const validation=validateJournal(journal,chart,centers);journalErrors=[...new Set([...journalErrors,...validation.errors])];
   journal.balance=validation.balance;journal.errors=journalErrors;journal.status="pending_review";journal.title="حدث مشروع مؤثر — "+event.actionName;
   journalId=journal.id;event.accountingDocumentId=journalId;event.accountingJournalId=journalId;event.accountingErrors=journalErrors;
   rootUpdates["financial/costCenters/"+projectCode]=centerUpdates["costCenters/"+projectCode]||null;
   if(centerUpdates["costCenters/"+projectCode]===undefined)delete rootUpdates["financial/costCenters/"+projectCode];
   rootUpdates["financial/documents/"+journalId]=journal;
   rootUpdates["financial/reviewQueue/"+journalId]=reviewRecord(journal);
   rootUpdates["financial/audit/"+uid("AUD")]={action:existingJournal?"update_project_event_journal":"submit_project_event_journal",documentId:journalId,sourceId:journal.sourceId,uid:claims.sub,createdAt:now};
  }else if(existingJournal){
   rootUpdates["financial/documents/"+existingJournal.id+"/status"]="cancelled";
   rootUpdates["financial/documents/"+existingJournal.id+"/cancelledAt"]=now;
   rootUpdates["financial/reviewQueue/"+existingJournal.id]=null;
   rootUpdates["financial/audit/"+uid("AUD")]={action:"cancel_project_event_journal_after_nonfinancial_edit",documentId:existingJournal.id,sourceId:existingJournal.sourceId,uid:claims.sub,createdAt:now};
   event.accountingDocumentId=null;event.accountingJournalId=null;event.accountingErrors=[];
  }
  rootUpdates["projects/"+projectCode+"/events/"+eventId]=event;
  const lifecycleStatus={purchase_request:"طلب شراء",supplier_confirmation:"تأكيد المورد",goods_received:"استلام بضاعة",customer_delivery:"توريد للعميل",project_completed:"مكتمل",project_closed:"مغلق"};
  if(lifecycleStatus[actionCode])rootUpdates["projects/"+projectCode+"/status"]=lifecycleStatus[actionCode];
  if(!adminPatchRoot)throw new Error("خدمة الحفظ الموحد لأحداث المشروع والقيود المالية غير متاحة.");
  await adminPatchRoot(rootUpdates);
  return {success:true,id:eventId,event,accountingStatus:event.accountingStatus,accountingImpact:event.accountingImpact,journalId,errors:journalErrors};
 }
 if(action==="updateReviewJournal"){
  requireFinanceArea("review","edit");
  const docId=id(body.id),previous=await adminRead("documents/"+docId);
  if(!previous||previous.type!=="journal"||!["pending_review","needs_correction"].includes(previous.status))throw new Error("القيد غير متاح للتعديل داخل قائمة المراجعة.");
  if(!["projectEvent","cashCustody"].includes(previous.sourceType||"")&&previous.sourceType!=="manual")throw new Error("نوع القيد المصدر لا يسمح بتعديله من شاشة المراجعة.");
  const editable=body.journal&&typeof body.journal==="object"&&!Array.isArray(body.journal)?body.journal:{};
  const next={...previous};
  if(Object.prototype.hasOwnProperty.call(editable,"date"))next.date=date(editable.date);
  if(Object.prototype.hasOwnProperty.call(editable,"description"))next.description=txt(editable.description,500);
  if(Object.prototype.hasOwnProperty.call(editable,"reference"))next.reference=txt(editable.reference,120);
  next.currency="EGP";
  if(Array.isArray(body.lines))next.lines=body.lines.slice(0,100).map((line,index)=>{
   if(!line||typeof line!=="object"||Array.isArray(line))throw new Error("بيانات السطر "+(index+1)+" غير صحيحة.");
   const row={...(previous.lines&&previous.lines[index]||{}),...line};
   row.accountCode=txt(row.accountCode||"",32);row.description=txt(row.description||"",250);
   for(const key of ["debit","credit"])row[key]=row[key]===""||row[key]===undefined?0:num(row[key]||0);
   for(const key of ["costCenterId","projectCode","partyType","partyId","itemCode","warehouseCode"])if(row[key]!==undefined)row[key]=txt(row[key]||"",120);
   return row;
  });
  if(previous.projectCode)next.lines=next.lines.map(line=>({...line,projectCode:line.projectCode||previous.projectCode,costCenterId:line.costCenterId||previous.projectCode}));
  const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},validation=validateJournal(next,chart,centers);
  next.balance=validation.balance;next.errors=validation.errors;next.status="pending_review";next.updatedAt=now;next.updatedBy=claims.sub;
  const updates={};updates["documents/"+docId]=next;updates["reviewQueue/"+docId]=reviewRecord(next);
  updates["audit/"+uid("AUD")]={action:"update_review_journal",documentId:docId,sourceType:next.sourceType||"manual",errors:next.errors,uid:claims.sub,createdAt:now};
  await adminPatch(updates);
  return {success:true,id:docId,status:next.status,errors:next.errors,balance:next.balance};
 }
 if(action==="submitJournal"){
   const journalId=id(body.id||uid("DOC"));let previous=null,postedRecord=null;
   if(body.id){
    requireFinanceArea("journal","edit");
    previous=await adminRead("documents/"+journalId);
    postedRecord=await adminRead("journals/"+journalId);
    previous=previous||postedRecord;
    if(!previous||previous.type!=="journal")throw new Error("القيد المطلوب تعديله غير موجود.");
    if(previous.sourceType&&previous.sourceType!=="manual")throw new Error("هذا القيد مرتبط بمستند أصلي؛ يجب تعديل المستند المصدر حتى لا تختل أرصدته.");
   }else requireFinanceArea("journal","add");
   const journalDate=date(body.date),j={id:journalId,number:previous&&previous.number||journalNumberFor(journalDate,journalId),type:"journal",date:journalDate,description:txt(body.description,500),reference:txt(body.reference,120),currency:txt(body.currency||"EGP",3),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:previous&&previous.createdAt||now,createdBy:previous&&previous.createdBy||claims.sub,createdByName:previous&&previous.createdByName||txt(profile.fullName||profile.username||profile.email,120)};
   if(j.currency!=="EGP")throw new Error("القيود متعددة العملات وأسعار الصرف غير مفعّلة بعد. استخدم الجنيه المصري حتى لا تختلط أرصدة العملات في القوائم.");
   const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},v=validateJournal(j,chart,centers);
   if(previous&&previous.status==="posted"){
    if(v.errors.length)throw new Error(v.errors.join("؛ "));
    j.status="posted";j.approvedAt=previous.approvedAt||now;j.approvedBy=previous.approvedBy||claims.sub;j.postedAt=now;j.updatedAt=now;j.updatedBy=claims.sub;
    const updates=journalMaintenanceUpdates(previous,j);updates["documents/"+journalId]=j;updates["reviewQueue/"+journalId]=null;
    updates["audit/"+uid("AUD")]={action:"edit_posted_manual_journal",documentId:journalId,uid:claims.sub,createdAt:now};
    await adminPatch(updates);return {success:true,id:journalId,status:"posted",errors:[],balance:v.balance};
   }
   j.errors=v.errors;j.balance=v.balance;j.status=v.errors.length?"needs_correction":"pending_review";
   const updates={};updates["documents/"+journalId]=j;updates["reviewQueue/"+journalId]=v.errors.length?null:reviewRecord(j);
   updates["audit/"+uid("AUD")]={action:previous?"edit_journal":"submit_journal",documentId:journalId,status:j.status,uid:claims.sub,createdAt:now};
   await adminPatch(updates);return {success:true,id:journalId,status:j.status,errors:v.errors,balance:v.balance};
  }
  if(action==="submitCashCustodyJournal"){
   requirePermission(profile,"cashCustody", "add");
   const result=await submitCashCustodyJournalRecord(body.ownerUid||claims.sub,body.transactionId);
   return result;
  }
  if(action==="syncCashCustodyJournals"){
   requirePermission(profile,"cashCustody","view");
   const ownerUid=id(body.ownerUid||claims.sub);
   if(ownerUid!==claims.sub&&!hasPermission(profile,"cashCustody","viewOthers"))throw new Error("ليس لديك صلاحية مزامنة عهدة مستخدم آخر.");
   const transactions=Array.isArray(body.transactions)?body.transactions.slice(0,100):[];
   const results=[];
   for(const transaction of transactions){
    if(!transaction||!transaction.id)continue;
    try{results.push(await submitCashCustodyJournalRecord(ownerUid,transaction.id));}
    catch(error){results.push({success:false,id:String(transaction.id),error:String(error.message||error)});}
   }
   return {success:true,results,created:results.filter(x=>x.success&&!x.existing&&!x.skipped&&!x.alreadyPosted).length,failed:results.filter(x=>!x.success).length};
  }
  if(action==="cancelJournal"){
   requireFinanceArea("journal","edit");
   const journalId=id(body.id),document=await adminRead("documents/"+journalId),posted=await adminRead("journals/"+journalId),target=document||posted;
   if(!target||target.type!=="journal")throw new Error("قيد اليومية المطلوب إلغاؤه غير موجود.");
   if(target.status==="posted"||posted&&posted.status==="posted")throw new Error("القيد مرحّل بالفعل. استخدم قيدًا عكسيًا بدل الإلغاء.");
   if(!["draft","pending_review","needs_correction"].includes(target.status))throw new Error("القيد ليس في حالة تسمح بالإلغاء.");
   const updates={};
   updates["documents/"+journalId+"/status"]="cancelled";
   updates["documents/"+journalId+"/cancelledAt"]=now;
   updates["documents/"+journalId+"/cancelledBy"]=claims.sub;
   updates["documents/"+journalId+"/cancellationReason"]=txt(body.reason||"إلغاء القيد بطلب المستخدم",500);
   updates["reviewQueue/"+journalId]=null;
   updates["audit/"+uid("AUD")]={action:"cancel_journal",documentId:journalId,sourceType:target.sourceType||"manual",uid:claims.sub,createdAt:now};
   if(target.sourceType==="projectEvent"&&target.sourceId&&adminPatchRootAt){
    const separator=String(target.sourceId).lastIndexOf("--");
    if(separator>0){
     const projectCode=target.sourceId.slice(0,separator),eventId=target.sourceId.slice(separator+2);
     await adminPatchRootAt("projects/"+id(projectCode)+"/events/"+id(eventId),{accountingStatus:"cancelled",accountingImpact:false,accountingCancelledAt:now,accountingCancelledBy:claims.sub});
    }
   }else if(target.sourceType==="cashCustody"&&target.sourceId&&adminPatchRootAt){
    const separator=String(target.sourceId).indexOf("--");
    if(separator>0){
     const ownerUid=id(target.sourceId.slice(0,separator)),transactionId=id(target.sourceId.slice(separator+2));
     await adminPatchRootAt("cashCustodies/"+ownerUid+"/transactions/"+transactionId,{financialReviewStatus:"cancelled",financialReviewCancelledAt:now,financialReviewCancelledBy:claims.sub});
    }
   }
   await adminPatch(updates);return {success:true,id:journalId,status:"cancelled"};
  }
  if(action==="reverseJournal"){
   requireFinanceArea("journal","add");
   const originalId=id(body.id),original=await adminRead("journals/"+originalId);
   if(!original||original.type!=="journal"||original.status!=="posted")throw new Error("لا يمكن إنشاء قيد عكسي إلا لقيد مرحّل.");
   if(original.reversalJournalId||original.reversedByJournalId)throw new Error("تم إنشاء قيد عكسي لهذا القيد من قبل.");
   const reversalId=uid("REV-JRN"),reversalDate=date(body.date||new Date().toISOString().slice(0,10));
   const lines=(original.lines||[]).map(line=>({...line,debit:Number(line.credit||0),credit:Number(line.debit||0),description:txt(line.description||original.description||"",250)+" — عكس"}));
   const journal={id:reversalId,type:"journal",date:reversalDate,description:txt(body.description||("قيد عكسي للقيد "+originalId+" — "+(original.description||"")),500),reference:txt(body.reference||original.reference||originalId,120),currency:original.currency||"EGP",lines,sourceType:"manual",reversalOf:originalId,createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120)};
   if(journal.currency!=="EGP")throw new Error("القيود متعددة العملات وأسعار الصرف غير مفعّلة بعد.");
   const chart=(await adminRead("chartOfAccounts"))||{},centers=(await adminRead("costCenters"))||{},validation=validateJournal(journal,chart,centers);
   if(validation.errors.length)throw new Error("تعذر تكوين القيد العكسي: "+validation.errors.join("؛ "));
   journal.status="pending_review";journal.balance=validation.balance;journal.errors=[];
   const updates={};updates["documents/"+reversalId]=journal;updates["reviewQueue/"+reversalId]=reviewRecord(journal);
   updates["journals/"+originalId+"/reversalJournalId"]=reversalId;
   updates["journals/"+originalId+"/reversalRequestedAt"]=now;
   updates["audit/"+uid("AUD")]={action:"create_reversing_journal",documentId:reversalId,reversalOf:originalId,uid:claims.sub,createdAt:now};
   await adminPatch(updates);
   return {success:true,id:reversalId,status:"pending_review",reversalOf:originalId,errors:[]};
  }
  if(action==="deleteJournal"){
   requireFinanceArea("journal","delete");
   const journalId=id(body.id),document=await adminRead("documents/"+journalId),posted=await adminRead("journals/"+journalId),target=posted||document;
   if(!target||target.type!=="journal")throw new Error("قيد اليومية المطلوب حذفه غير موجود.");
   if(target.sourceType&&target.sourceType!=="manual")throw new Error("لا يمكن حذف قيد ناتج عن فاتورة أو سند؛ صحح المستند المصدر حتى لا تختل حركة المخزون والأرصدة.");
   const updates={};updates["documents/"+journalId]=null;updates["reviewQueue/"+journalId]=null;updates["journals/"+journalId]=null;
   if(target.status==="posted"||posted){
    const period=month(target.date);updates["periods/"+period+"/entries/"+journalId]=null;
    (target.lines||[]).forEach((line,index)=>{const suffix=journalId+"_"+(index+1),account=String(line.accountCode||"");if(account)updates["ledger/"+id(account)+"/"+period+"/"+suffix]=null;if(line.partyType&&line.partyId)updates["partyLedger/"+id(line.partyType)+"/"+id(line.partyId)+"/"+period+"/"+suffix]=null;if(line.costCenterId)updates["costLedger/"+id(line.costCenterId)+"/"+period+"/"+suffix]=null;});
   }
   updates["audit/"+uid("AUD")]={action:"delete_manual_journal",documentId:journalId,previousStatus:target.status||"",uid:claims.sub,createdAt:now};
   await adminPatch(updates);return {success:true,id:journalId,deleted:true};
  }
  if(action==="saveInvoiceDraft"){
  const direction=body.type;
  if(!["purchase","sales"].includes(direction))throw new Error("حدد نوع الفاتورة أولاً: مشتريات أو مبيعات.");
  const draftId=id(body.id||uid("INV")),previous=body.id?await adminRead("documents/"+draftId):null;
  requireFinanceArea("invoices",previous?"edit":"add");
  if(previous&&(!(previous.type==="invoice"&&["draft","needs_correction","returned_to_creator"].includes(previous.status))))throw new Error("لا يمكن تعديل هذه الفاتورة في حالتها الحالية. يجب أن تكون مسودة أو معادة للتصحيح.");
  const inv={...body,id:draftId,type:"invoice",invoiceType:direction,date:txt(body.date||"",10),number:txt(body.number||"",120),partyId:txt(body.partyId||"",120),partyName:txt(body.partyName||"",180),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:previous&&previous.createdAt||now,createdBy:previous&&previous.createdBy||claims.sub,createdByName:previous&&previous.createdByName||txt(profile.fullName||profile.username||profile.email,120),status:"draft"};
  inv.taxCode=direction==="purchase"?"VAT-IN-14":"VAT-OUT-14";inv.taxType=direction==="purchase"?"vat_input":"vat_output";inv.taxRate=14;inv.otherTaxes=normalizeInvoiceOtherTaxes(body.otherTaxes);
  if(previous&&previous.returnedTaskId)inv.returnedTaskId=previous.returnedTaskId;
  if(previous&&previous.attachments)inv.attachments=previous.attachments;
   for(const field of ["assignmentId","assignmentSenderUid","assignmentChain","lastAssignedTo"])if(previous&&previous[field]!==undefined)inv[field]=previous[field];
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
  requireFinanceArea("assignments","add");
  const invoiceId=id(body.invoiceId),invoice=await adminRead("documents/"+invoiceId);
  if(!invoice||invoice.type!=="invoice")throw new Error("الفاتورة المطلوب تحويلها غير موجودة.");
  if(invoice.createdBy!==claims.sub&&invoice.lastAssignedTo!==claims.sub&&profile.role!=="admin")throw new Error("لا يمكنك تحويل فاتورة لا تقع في عهدتك.");
  if(!["draft","needs_correction","returned_to_creator"].includes(invoice.status))throw new Error("لا يمكن تحويل الفاتورة في حالتها الحالية.");
  const assigneeUid=id(body.assigneeUid),assignee=adminReadRoot?await adminReadRoot("users/"+assigneeUid):null;
  if(!assignee||!["active","نشط","مفعل","enabled"].includes(String(assignee.status||"").toLowerCase()))throw new Error("المستخدم المحدد غير نشط أو غير موجود.");
  if(assigneeUid===claims.sub)throw new Error("اختر مستخدمًا آخر لاستكمال الفاتورة.");
  const instruction=txt(body.instruction||"مراجعة تصنيف البنود وتحديد الأكواد المخزنية أو حسابات المصروفات",700);
  const taskId=uid("FIN-TASK"),assignmentId=uid("ASN"),createdByName=txt(profile.fullName||profile.username||profile.email,120),assigneeName=txt(assignee.fullName||assignee.username||assignee.email||assigneeUid,120);
  const assignment={id:assignmentId,invoiceId,assigneeUid,assigneeName,createdBy:claims.sub,createdByName,instruction,status:"open",taskId,createdAt:now,invoiceNumber:invoice.number||"",invoiceType:invoice.invoiceType||"purchase",partyName:invoice.partyName||"",date:invoice.date||"",rootAssignmentId:invoice.assignmentChain&&invoice.assignmentChain[0]&&invoice.assignmentChain[0].assignmentId||assignmentId,parentAssignmentId:invoice.assignmentId||"",rootSenderUid:invoice.createdBy||claims.sub};
  const task={id:taskId,title:"استكمال تصنيف فاتورة "+(invoice.number||invoiceId),description:instruction,status:"open",createdAt:now,createdBy:claims.sub,createdByName,kind:"financialAssignment",financialAssignmentId:assignmentId,sourceInvoiceId:invoiceId,assigneeUid};
  const financialUpdates={};
  financialUpdates["documents/"+invoiceId+"/status"]="assigned";
  financialUpdates["documents/"+invoiceId+"/assignedTo"]=assigneeUid;
  financialUpdates["documents/"+invoiceId+"/assignmentId"]=assignmentId;
  financialUpdates["documents/"+invoiceId+"/assignedAt"]=now;
   financialUpdates["documents/"+invoiceId+"/assignmentSenderUid"]=claims.sub;
   financialUpdates["documents/"+invoiceId+"/assignmentChain"]=[...(invoice.assignmentChain||[]),{assignmentId,fromUid:claims.sub,fromName:createdByName,toUid:assigneeUid,toName:assigneeName,at:now,instruction}];
  financialUpdates["reviewQueue/"+invoiceId]=null;
  financialUpdates["assignments/"+assigneeUid+"/"+assignmentId]=assignment;
  financialUpdates["sentAssignments/"+claims.sub+"/"+assignmentId]={...assignment};
  financialUpdates["audit/"+uid("AUD")]={action:"assign_invoice",documentId:invoiceId,assignmentId,assigneeUid,uid:claims.sub,createdAt:now};
  const notification={id:assignmentId,type:"financialAssignment",recipientUid:assigneeUid,assignmentId,invoiceId,senderUid:claims.sub,senderName:createdByName,title:"فاتورة محولة إليك",description:instruction,createdAt:now,read:false};
  let taskSaved=false,notificationSaved=false;
  try{
   await patchExternalBranch("tasks",{[assigneeUid+"/"+taskId]:task});taskSaved=true;
   await patchExternalBranch("cashCustodyNotifications",{[assigneeUid+"/"+assignmentId]:notification});notificationSaved=true;
   await adminPatch(financialUpdates);
  }catch(error){
   const rollbackErrors=[];
   if(notificationSaved)try{await removeExternalBranch("cashCustodyNotifications",[assigneeUid+"/"+assignmentId]);}catch(rollbackError){rollbackErrors.push(String(rollbackError.message||rollbackError));}
   if(taskSaved)try{await removeExternalBranch("tasks",[assigneeUid+"/"+taskId]);}catch(rollbackError){rollbackErrors.push(String(rollbackError.message||rollbackError));}
   if(rollbackErrors.length)throw new Error("تعذر إكمال تحويل الفاتورة، وفشل التراجع عن بعض سجلات المهمة/الإشعار: "+rollbackErrors.join("؛ ")+". السبب الأصلي: "+String(error.message||error));
   throw error;
  }
  return {success:true,id:invoiceId,assignmentId,taskId,status:"assigned",pushNotification:{recipientUid:assigneeUid,eventType:"financialAssignment",eventId:assignmentId,content:{title:"فاتورة محولة إليك",body:"مطلوب: "+instruction}}};
 }
 if(action==="completeInvoiceAssignment"){
   requireFinanceArea("assignments","edit");
   const assignmentId=id(body.assignmentId),assignment=await adminRead("assignments/"+claims.sub+"/"+assignmentId);
   if(!assignment||assignment.assigneeUid!==claims.sub||assignment.status!=="open")throw new Error("المهمة غير موجودة أو تم إغلاقها بالفعل.");
   const invoice=await adminRead("documents/"+id(assignment.invoiceId));
   if(!invoice||invoice.status!=="assigned"||invoice.assignedTo!==claims.sub||invoice.assignmentId!==assignmentId)throw new Error("الفاتورة لم تعد في عهدة هذا المستخدم.");
   const chart=(await adminRead("chartOfAccounts"))||{},items=(await adminRead("items"))||{},groups=(await adminRead("itemGroups"))||{},taxCodes=(await adminRead("taxCodes"))||{};
   const editable=body.invoice&&typeof body.invoice==="object"&&!Array.isArray(body.invoice)?body.invoice:{};
   const savedInvoice={...invoice};
   for(const key of ["invoiceType","date","number","partyId","partyName","partyTaxNumber","currency","taxCode","taxType","projectCode"])if(Object.prototype.hasOwnProperty.call(editable,key))savedInvoice[key]=txt(editable[key]||"",key==="partyName"?180:key==="partyTaxNumber"?32:key==="number"?120:key==="date"?10:key==="currency"?3:120);
   for(const key of ["taxRate","taxAmount","discount"])if(Object.prototype.hasOwnProperty.call(editable,key))savedInvoice[key]=editable[key]===""?"":num(editable[key]||0);
   savedInvoice.taxCode=savedInvoice.invoiceType==="sales"?"VAT-OUT-14":"VAT-IN-14";savedInvoice.taxType=savedInvoice.invoiceType==="sales"?"vat_output":"vat_input";savedInvoice.taxRate=14;
   if(Object.prototype.hasOwnProperty.call(editable,"otherTaxes"))savedInvoice.otherTaxes=normalizeInvoiceOtherTaxes(editable.otherTaxes);
   const sourceLines=Array.isArray(body.lines)?body.lines.slice(0,100):(invoice.lines||[]);
   const nextLines=sourceLines.map((source,index)=>{
    if(!source||typeof source!=="object"||Array.isArray(source))throw new Error("بيانات البند "+(index+1)+" غير صحيحة.");
    const line={...(invoice.lines&&invoice.lines[index]||{}),...source};
    for(const key of ["description","kind","unit","itemCode","groupCode","warehouseCode","itemType","accountCode","incomeAccountCode","costCenterId"])if(line[key]!==undefined)line[key]=txt(line[key]||"",key==="description"?250:120);
    for(const key of ["quantity","unitPrice","discount"])if(line[key]!==undefined&&line[key]!==""&&line[key]!==null)line[key]=num(line[key]);
    if(line.kind==="stock"&&line.itemCode&&items[line.itemCode]){
     const item=items[line.itemCode];line.groupCode=line.groupCode||item.groupCode||"";line.itemType=item.itemType||line.itemType||"stock";
    }
    return line;
   });
   savedInvoice.lines=nextLines;
   const nowCompleted=Date.now(),ownerUid=assignment.createdBy,rootSenderUid=assignment.rootSenderUid||invoice.createdBy,rootAssignmentId=assignment.rootAssignmentId||assignmentId,decision=body.decision==="submit_for_review"?"submit_for_review":"return_to_creator";
   let totals=savedInvoice.totals||{net:0,tax:0,total:Number(savedInvoice.total||0)};
   try{totals=invoiceTotals(savedInvoice);savedInvoice.totals=totals;savedInvoice.netTotal=totals.net;savedInvoice.total=totals.total;}
   catch(error){savedInvoice.errors=(savedInvoice.errors||[]).concat([String(error.message||error)]);}
   const reviewErrors=invoiceReviewErrors(savedInvoice,taxCodes,chart,items);
   savedInvoice.errors=reviewErrors;savedInvoice.updatedAt=nowCompleted;savedInvoice.assignedTo=null;
   const financialUpdates={},taskUpdates={},notificationUpdates={};
   if(assignment.taskId){taskUpdates[claims.sub+"/"+assignment.taskId+"/status"]="completed";taskUpdates[claims.sub+"/"+assignment.taskId+"/completedAt"]=nowCompleted;}
   let ownerTaskId="",reviewers=[],pushNotifications=[];
   if(decision==="return_to_creator"){
    ownerTaskId=uid("FIN-TASK");savedInvoice.status="returned_to_creator";savedInvoice.lastAssignedTo=ownerUid;savedInvoice.returnedTaskId=ownerTaskId;
    const actorName=txt(profile.fullName||profile.username||profile.email,120);
    const returnedTask={id:ownerTaskId,title:"استكمال ومراجعة فاتورة "+(savedInvoice.number||savedInvoice.id),description:"عاد المستند من "+actorName+" لاستكمال البيانات قبل إرساله للمراجعة.",status:"open",createdAt:nowCompleted,createdBy:claims.sub,createdByName:actorName,kind:"financialAssignmentReturned",financialAssignmentId:assignmentId,sourceInvoiceId:invoice.id,assigneeUid:ownerUid};
    taskUpdates[ownerUid+"/"+ownerTaskId]=returnedTask;
    notificationUpdates[ownerUid+"/"+ownerTaskId]={id:ownerTaskId,type:"financialAssignmentReturned",recipientUid:ownerUid,assignmentId,invoiceId:invoice.id,senderUid:claims.sub,senderName:actorName,title:"عاد المستند لاستكماله",description:"الفاتورة "+(savedInvoice.number||invoice.id)+" عادت إليك ويمكنك مراجعتها أو تحويلها لمستخدم آخر أو إرسالها للمراجعة.",createdAt:nowCompleted,read:false};
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/status"]="returned_to_creator";
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/completedAt"]=nowCompleted;
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/decision"]="returned_to_sender";
    pushNotifications.push({recipientUid:ownerUid,eventType:"financialAssignmentReturned",eventId:invoice.id,content:{title:"عاد المستند لاستكماله",body:"الفاتورة "+(savedInvoice.number||invoice.id)+" عادت إليك."}});
   }else{
    const fingerprint=savedInvoice.partyId&&savedInvoice.number&&savedInvoice.date?await sha([savedInvoice.invoiceType,savedInvoice.partyId,savedInvoice.number,savedInvoice.date,Number(totals.total||0).toFixed(2)].join("|").toLowerCase()):"";
    const duplicate=fingerprint?await adminRead("documentFingerprints/"+fingerprint):null;
    savedInvoice.fingerprint=fingerprint;savedInvoice.duplicateOf=duplicate&&duplicate.documentId!==invoice.id?duplicate.documentId:"";
    savedInvoice.warnings=savedInvoice.duplicateOf?["مستند مشابه مسجل سابقًا: "+savedInvoice.duplicateOf]:[];
    savedInvoice.status=savedInvoice.duplicateOf?"duplicate_review":"pending_review";
    savedInvoice.submittedForReviewAt=nowCompleted;savedInvoice.submittedForReviewBy=claims.sub;
    savedInvoice.lastAssignedTo=null;savedInvoice.returnedTaskId=null;
    const allUsers=adminReadRoot?(await adminReadRoot("users"))||{}:{};
    reviewers=Object.entries(allUsers).filter(([reviewerUid,user])=>user&&reviewerUid!==claims.sub&&["active","نشط","مفعل","enabled"].includes(String(user.status||"").toLowerCase())&&hasPermission(user,"financial_review","view")&&hasPermission(user,"financial_review","approve")).map(([reviewerUid,user])=>({uid:reviewerUid,user}));
    for(const reviewer of reviewers){
     const notificationId=uid("FIN-REV"),notification={id:notificationId,type:"financialReviewRequired",recipientUid:reviewer.uid,assignmentId,invoiceId:invoice.id,senderUid:claims.sub,senderName:txt(profile.fullName||profile.username||profile.email,120),title:"فاتورة جديدة بانتظار المراجعة",description:"الفاتورة "+(savedInvoice.number||invoice.id)+" — "+(savedInvoice.partyName||"")+" — مطلوب استكمال البيانات والمراجعة.",createdAt:nowCompleted,read:false};
     notificationUpdates[reviewer.uid+"/"+notificationId]=notification;
     pushNotifications.push({recipientUid:reviewer.uid,eventType:"financialReviewRequired",eventId:invoice.id,dispatchPrefix:"finance:review:"+invoice.id,content:{title:notification.title,body:notification.description}});
    }
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/status"]="sent_for_review";
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/completedAt"]=nowCompleted;
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/completedBy"]=claims.sub;
    financialUpdates["sentAssignments/"+ownerUid+"/"+assignmentId+"/decision"]="submit_for_review";
    if(rootSenderUid&&rootSenderUid!==ownerUid){financialUpdates["sentAssignments/"+rootSenderUid+"/"+rootAssignmentId+"/status"]="sent_for_review";financialUpdates["sentAssignments/"+rootSenderUid+"/"+rootAssignmentId+"/decision"]="submit_for_review";financialUpdates["sentAssignments/"+rootSenderUid+"/"+rootAssignmentId+"/completedAt"]=nowCompleted;}
    financialUpdates["reviewQueue/"+invoice.id]=reviewRecord(savedInvoice);
   }
   financialUpdates["documents/"+invoice.id]=savedInvoice;
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/status"]="completed";
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/completedAt"]=nowCompleted;
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/completedBy"]=claims.sub;
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/decision"]=decision;
   financialUpdates["audit/"+uid("AUD")]={action:decision==="submit_for_review"?"complete_assignment_submit_for_review":"complete_invoice_assignment",documentId:invoice.id,assignmentId,uid:claims.sub,createdAt:nowCompleted};
   if(decision!=="submit_for_review")financialUpdates["reviewQueue/"+invoice.id]=null;
   let tasksSaved=false,notificationsSaved=false;
   try{
    if(Object.keys(taskUpdates).length){await patchExternalBranch("tasks",taskUpdates);tasksSaved=true;}
    if(Object.keys(notificationUpdates).length){await patchExternalBranch("cashCustodyNotifications",notificationUpdates);notificationsSaved=true;}
    await adminPatch(financialUpdates);
   }catch(error){
    const rollbackErrors=[];
    if(notificationsSaved)try{await removeExternalBranch("cashCustodyNotifications",Object.keys(notificationUpdates));}catch(rollbackError){rollbackErrors.push(String(rollbackError.message||rollbackError));}
    if(tasksSaved){const rollback={};if(assignment.taskId)rollback[claims.sub+"/"+assignment.taskId+"/status"]="open";if(ownerTaskId)rollback[ownerUid+"/"+ownerTaskId]=null;try{await patchExternalBranch("tasks",rollback);}catch(rollbackError){rollbackErrors.push(String(rollbackError.message||rollbackError));}}
    if(rollbackErrors.length)throw new Error("تعذر إكمال الإجراء، وفشل التراجع عن بعض المهام أو الإشعارات: "+rollbackErrors.join("؛ ")+". السبب الأصلي: "+String(error.message||error));
    throw error;
   }
   if(decision==="submit_for_review")return {success:true,id:invoice.id,assignmentId,status:savedInvoice.status,errors:reviewErrors,reviewersNotified:reviewers.length,pushNotifications};
   return {success:true,id:invoice.id,assignmentId,status:"returned_to_creator",pushNotifications};
  }
if(action==="forwardInvoiceAssignment"){
   requireFinanceArea("assignments","edit");
   const assignmentId=id(body.assignmentId),assignment=await adminRead("assignments/"+claims.sub+"/"+assignmentId);
   if(!assignment||assignment.assigneeUid!==claims.sub||assignment.status!=="open")throw new Error("المهمة غير موجودة أو تم إغلاقها بالفعل.");
   const invoice=await adminRead("documents/"+id(assignment.invoiceId));
   if(!invoice||invoice.type!=="invoice"||invoice.status!=="assigned"||invoice.assignedTo!==claims.sub||invoice.assignmentId!==assignmentId)throw new Error("الفاتورة لم تعد في عهدتك للتحويل.");
   const nextUid=id(body.nextAssigneeUid),nextUser=adminReadRoot?await adminReadRoot("users/"+nextUid):null;
   if(nextUid===claims.sub||nextUid===assignment.createdBy)throw new Error("اختر مستخدمًا آخر غير حسابك وغير المستخدم الذي أحال إليك الفاتورة.");
   if(!nextUser||!["active","نشط","مفعل","enabled"].includes(String(nextUser.status||"").toLowerCase()))throw new Error("المستخدم الجديد غير موجود أو غير نشط.");
   const nextName=txt(nextUser.fullName||nextUser.username||nextUser.email||nextUid,120),instruction=txt(body.instruction||"استكمال ومراجعة بيانات الفاتورة",700),nowForward=Date.now(),nextId=uid("ASN"),nextTaskId=uid("FIN-TASK");
   const header=body.invoice&&typeof body.invoice==="object"&&!Array.isArray(body.invoice)?body.invoice:{};
   const saved={...invoice};
   for(const key of ["invoiceType","date","number","partyId","partyName","partyTaxNumber","currency","taxCode","taxType","projectCode"])if(Object.prototype.hasOwnProperty.call(header,key))saved[key]=txt(header[key]||"",key==="partyName"?180:key==="partyTaxNumber"?32:key==="number"?120:key==="date"?10:key==="currency"?3:120);
   for(const key of ["taxRate","taxAmount","discount"])if(Object.prototype.hasOwnProperty.call(header,key))saved[key]=header[key]===""?"":num(header[key]||0);
   saved.taxCode=saved.invoiceType==="sales"?"VAT-OUT-14":"VAT-IN-14";saved.taxType=saved.invoiceType==="sales"?"vat_output":"vat_input";saved.taxRate=14;
   if(Object.prototype.hasOwnProperty.call(header,"otherTaxes"))saved.otherTaxes=normalizeInvoiceOtherTaxes(header.otherTaxes);
   const sourceLines=Array.isArray(body.lines)?body.lines.slice(0,100):(invoice.lines||[]);
   saved.lines=sourceLines.map((line,index)=>{if(!line||typeof line!=="object"||Array.isArray(line))throw new Error("بيانات البند "+(index+1)+" غير صحيحة.");return {...(invoice.lines&&invoice.lines[index]||{}),...line};});
   const item={id:nextId,invoiceId:invoice.id,assigneeUid:nextUid,assigneeName:nextName,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120),instruction,status:"open",taskId:nextTaskId,createdAt:nowForward,invoiceNumber:saved.number||"",invoiceType:saved.invoiceType||"purchase",partyName:saved.partyName||"",date:saved.date||"",rootAssignmentId:assignment.rootAssignmentId||assignment.id,parentAssignmentId:assignment.id,rootSenderUid:assignment.rootSenderUid||invoice.createdBy};
   const task={id:nextTaskId,title:"فاتورة محولة إليك: "+(saved.number||invoice.id),description:instruction,status:"open",createdAt:nowForward,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120),kind:"financialAssignment",financialAssignmentId:nextId,sourceInvoiceId:invoice.id,assigneeUid:nextUid};
   const notification={id:nextId,type:"financialAssignment",recipientUid:nextUid,assignmentId:nextId,invoiceId:invoice.id,senderUid:claims.sub,senderName:txt(profile.fullName||profile.username||profile.email,120),title:"فاتورة محولة إليك",description:instruction,createdAt:nowForward,read:false};
   saved.assignmentChain=(saved.assignmentChain||[]).concat([{assignmentId:nextId,fromUid:claims.sub,fromName:txt(profile.fullName||profile.username||profile.email,120),toUid:nextUid,toName:nextName,at:nowForward,instruction}]);
   saved.assignmentId=nextId;saved.assignmentSenderUid=claims.sub;saved.assignedTo=nextUid;saved.assignedAt=nowForward;saved.assignmentInstruction=instruction;saved.status="assigned";saved.updatedAt=nowForward;
   const financialUpdates={};
   financialUpdates["documents/"+invoice.id]=saved;
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/status"]="forwarded";
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/completedAt"]=nowForward;
   financialUpdates["assignments/"+claims.sub+"/"+assignmentId+"/decision"]="reassigned";
   financialUpdates["sentAssignments/"+claims.sub+"/"+assignmentId]={...assignment,status:"forwarded",forwardedToUid:nextUid,forwardedToName:nextName,completedAt:nowForward,decision:"reassigned"};
   financialUpdates["assignments/"+nextUid+"/"+nextId]=item;
   financialUpdates["sentAssignments/"+claims.sub+"/"+nextId]={...item};
   const rootUid=assignment.rootSenderUid||invoice.createdBy,rootAssignmentId=assignment.rootAssignmentId||assignmentId;
   if(rootUid&&rootUid!==claims.sub){
    financialUpdates["sentAssignments/"+rootUid+"/"+rootAssignmentId+"/status"]="forwarded";
    financialUpdates["sentAssignments/"+rootUid+"/"+rootAssignmentId+"/forwardedToUid"]=nextUid;
    financialUpdates["sentAssignments/"+rootUid+"/"+rootAssignmentId+"/forwardedToName"]=nextName;
    financialUpdates["sentAssignments/"+rootUid+"/"+rootAssignmentId+"/latestAssignmentId"]=nextId;
   }
   financialUpdates["audit/"+uid("AUD")]={action:"forward_invoice_assignment",documentId:invoice.id,fromAssignmentId:assignmentId,toAssignmentId:nextId,fromUid:claims.sub,toUid:nextUid,uid:claims.sub,createdAt:nowForward};
   const taskUpdates={};if(assignment.taskId){taskUpdates[claims.sub+"/"+assignment.taskId+"/status"]="completed";taskUpdates[claims.sub+"/"+assignment.taskId+"/completedAt"]=nowForward;}taskUpdates[nextUid+"/"+nextTaskId]=task;
   const notificationUpdates={[nextUid+"/"+nextId]:notification};
   let tasksSaved=false,notificationsSaved=false;
   try{
    await patchExternalBranch("tasks",taskUpdates);tasksSaved=true;
    await patchExternalBranch("cashCustodyNotifications",notificationUpdates);notificationsSaved=true;
    await adminPatch(financialUpdates);
   }catch(error){
    const rollback=[];
    if(notificationsSaved)try{await removeExternalBranch("cashCustodyNotifications",[nextUid+"/"+nextId]);}catch(e){rollback.push(String(e.message||e));}
    if(tasksSaved)try{await patchExternalBranch("tasks",{[claims.sub+"/"+assignment.taskId+"/status"]:"open",[nextUid+"/"+nextTaskId]:null});}catch(e){rollback.push(String(e.message||e));}
    if(rollback.length)throw new Error("تعذر إتمام إعادة التحويل، وفشل التراجع عن بعض المهام أو الإشعارات: "+rollback.join("؛ ")+". السبب الأصلي: "+String(error.message||error));
    throw error;
   }
   return {success:true,id:invoice.id,assignmentId,nextAssignmentId:nextId,status:"assigned",pushNotification:{recipientUid:nextUid,eventType:"financialAssignment",eventId:nextId,content:{title:"فاتورة محولة إليك",body:instruction}}};
  }
  if(action==="deleteInvoice"){
   const docId=id(body.id),previous=await adminRead("documents/"+docId);
   if(!previous||previous.type!=="invoice")throw new Error("الفاتورة المطلوب حذفها غير موجودة.");
   if(previous.status==="posted"||previous.journalId)throw new Error("لا يمكن حذف فاتورة مُرحّلة محاسبيًا. استخدم قيدًا عكسيًا بعد المراجعة.");
   let activeAssignment=null,assignedRecipient=false;
   if(previous.status==="assigned"){
    if(previous.assignedTo!==claims.sub)throw new Error("لا يمكن حذف فاتورة محوّلة إلا من المستخدم الموجود في عهدته حاليًا.");
    requireFinanceArea("assignments","edit");
    activeAssignment=previous.assignmentId?await adminRead("assignments/"+claims.sub+"/"+id(previous.assignmentId)):null;
    if(!activeAssignment||activeAssignment.status!=="open")throw new Error("مهمة التحويل لم تعد مفتوحة؛ لا يمكن إلغاء هذه الفاتورة.");
    assignedRecipient=true;
   }else requireFinanceArea("invoices","delete");
   const allowed=["draft","needs_correction","returned_to_creator","pending_review","duplicate_review","rejected","assigned"];
   if(!allowed.includes(previous.status))throw new Error("لا يمكن حذف الفاتورة في حالتها الحالية.");
   const nextStatus=["pending_review","duplicate_review","assigned"].includes(previous.status)?"cancelled":"deleted",updates={};
   updates["documents/"+docId+"/status"]=nextStatus;
   updates["documents/"+docId+"/deletedAt"]=now;
   updates["documents/"+docId+"/deletedBy"]=claims.sub;
   updates["documents/"+docId+"/deleteReason"]=txt(body.reason||(assignedRecipient?"إلغاء من المستخدم المحال إليه":"حذف/إلغاء بطلب المستخدم"),300);
   updates["reviewQueue/"+docId]=null;
   if(assignedRecipient){
    const assignmentId=id(previous.assignmentId);
    updates["assignments/"+claims.sub+"/"+assignmentId+"/status"]="cancelled";
    updates["assignments/"+claims.sub+"/"+assignmentId+"/completedAt"]=now;
    updates["assignments/"+claims.sub+"/"+assignmentId+"/decision"]="cancelled_by_assignee";
    const senderUid=id(activeAssignment.createdBy||previous.assignmentSenderUid||previous.createdBy);
    updates["sentAssignments/"+senderUid+"/"+assignmentId+"/status"]="cancelled";
    updates["sentAssignments/"+senderUid+"/"+assignmentId+"/decision"]="cancelled_by_assignee";
    if(activeAssignment.taskId)await patchExternalBranch("tasks",{[claims.sub+"/"+id(activeAssignment.taskId)+"/status"]:"completed",[claims.sub+"/"+id(activeAssignment.taskId)+"/completedAt"]:now});
   }
   if(previous.fingerprint){
    const fingerprint=await adminRead("documentFingerprints/"+previous.fingerprint);
    if(fingerprint&&fingerprint.documentId===docId)updates["documentFingerprints/"+previous.fingerprint]=null;
   }
   updates["audit/"+uid("AUD")]={action:nextStatus==="cancelled"?"cancel_invoice":"delete_invoice",documentId:docId,previousStatus:previous.status,uid:claims.sub,createdAt:now};
   await adminPatch(updates);
   return {success:true,id:docId,deleted:nextStatus==="deleted",status:nextStatus,assignmentCancelled:assignedRecipient};
  }
  if(action==="submitInvoice"){
   if(!["purchase","sales"].includes(body.type))throw new Error("حدد هل الفاتورة مشتريات من مورد أم مبيعات لعميل.");
   const inv={...body,id:id(body.id||uid("INV")),type:"invoice",invoiceType:body.type,date:txt(body.date||"",10),number:txt(body.number||"",120),partyId:txt(body.partyId||"",120),partyName:txt(body.partyName||"",180),currency:txt(body.currency||"EGP",3),lines:Array.isArray(body.lines)?body.lines.slice(0,100):[],createdAt:now,createdBy:claims.sub,createdByName:txt(profile.fullName||profile.username||profile.email,120)},errors=[];
   let previous=null;
   if(body.id){
    previous=await adminRead("documents/"+inv.id);requireFinanceArea("invoices","edit");
    if(!previous||previous.type!=="invoice"||!["needs_correction","draft","returned_to_creator"].includes(previous.status))throw new Error("لا يمكن تعديل هذه الفاتورة: يجب أن تكون مسودة أو معادة للتصحيح وغير معتمدة.");
    inv.createdAt=previous.createdAt||inv.createdAt;inv.createdBy=previous.createdBy||inv.createdBy;inv.createdByName=previous.createdByName||inv.createdByName||"";
    for(const field of ["attachments","attachmentUploadStatus","attachmentFileName","attachmentUploadError","returnedTaskId","assignmentId","assignmentSenderUid","assignmentChain","lastAssignedTo"])if(previous[field]!==undefined)inv[field]=previous[field];
   }else requireFinanceArea("invoices","add");
   const standardVatCode=inv.invoiceType==="purchase"?"VAT-IN-14":"VAT-OUT-14",standardVatType=inv.invoiceType==="purchase"?"vat_input":"vat_output";
   const standardVat=await adminRead("taxCodes/"+standardVatCode);
   inv.taxCode=standardVatCode;inv.taxType=standardVatType;inv.taxRate=14;inv.otherTaxes=normalizeInvoiceOtherTaxes(body.otherTaxes);
   if(!standardVat||standardVat.active===false||standardVat.taxType!==standardVatType||Math.abs(Number(standardVat.rate||0)-14)>0.01)errors.push("كود ضريبة القيمة المضافة الأساسي 14% غير موجود أو غير نشط أو غير مطابق لنوع الفاتورة.");
   else if(standardVat.effectiveFrom&&inv.date&&inv.date<String(standardVat.effectiveFrom))errors.push("كود ضريبة القيمة المضافة الأساسي غير سارٍ بتاريخ الفاتورة.");
   if(!inv.number)errors.push("رقم الفاتورة مطلوب");
   if(!/^\d{4}-\d{2}-\d{2}$/.test(inv.date)||!Number.isFinite(Date.parse(inv.date+"T00:00:00Z")))errors.push("تاريخ الفاتورة مطلوب أو غير صحيح.");
   if(inv.currency!=="EGP")errors.push("لا يمكن اعتماد فاتورة بعملة أجنبية قبل تفعيل أسعار الصرف وإعادة تقييم أرصدة العملات.");
   if(!inv.partyId)errors.push("اختيار العميل أو المورد مطلوب");
   else{
    const expectedPartyType=inv.invoiceType==="purchase"?"vendor":"customer",masterParty=await adminRead("parties/"+id(inv.partyId));
    const legacyParty=adminReadRoot?await adminReadRoot((expectedPartyType==="vendor"?"vendors/":"clients/")+id(inv.partyId)):null,oppositeParty=adminReadRoot?await adminReadRoot((expectedPartyType==="vendor"?"clients/":"vendors/")+id(inv.partyId)):null;
    const party=masterParty&&masterParty.partyType===expectedPartyType?masterParty:legacyParty;
    if(oppositeParty&&!legacyParty)errors.push("نوع الطرف المحدد لا يتوافق مع نوع الفاتورة.");
    else if(!party)errors.push("المورد أو العميل غير مسجل في البيانات الأساسية بالنوع الصحيح.");
    else{inv.partyName=txt(party.name||party.companyName||party.legalName||party.supplierName||party.vendorName||party.customerName||party.clientName||inv.partyName,180);inv.partyTaxNumber=party.taxNumber||party.taxRegistrationNumber||party.registrationNumber||party.registrationNo||party.vatNumber||party.taxId||inv.partyTaxNumber||"";}
   }
   const invoiceChart=(await adminRead("chartOfAccounts"))||{},invoiceItems=(await adminRead("items"))||{};
   inv.lines.forEach((line,index)=>{
    if(!txt(line.description,250))errors.push("وصف البند "+(index+1)+" مطلوب");
    if(!(Number(line.quantity)>0))errors.push("الكمية غير صحيحة في البند "+(index+1));
    if(!["stock","service"].includes(line.kind))errors.push("حدد طبيعة البند "+(index+1)+" هل هو مخزني أم مصروف/خدمة");
    if(line.kind==="stock"&&(!line.itemCode||!invoiceItems[line.itemCode]||invoiceItems[line.itemCode].active===false))errors.push("حدد الصنف المخزني الصحيح في البند "+(index+1));
    if(line.kind==="service"){const expected=inv.invoiceType==="purchase"?"expense":"revenue",code=txt(inv.invoiceType==="purchase"?(line.accountCode||""):(line.incomeAccountCode||""),32),account=invoiceChart[code];if(!account||account.isGroup||account.active===false||account.type!==expected)errors.push("حدد حساب "+(expected==="expense"?"مصروف صحيح":"إيراد صحيح")+" للبند "+(index+1));}
   });
   let totals={net:0,tax:0,total:0};try{totals=invoiceTotals(inv);}catch(error){errors.push(String(error.message||error));}
   const fingerprint=inv.partyId&&inv.number&&inv.date&&/^\d{4}-\d{2}-\d{2}$/.test(inv.date)?await sha([inv.invoiceType,inv.partyId,inv.number,inv.date,Number(totals.total||0).toFixed(2)].join("|").toLowerCase()):"";
   const duplicate=fingerprint?await adminRead("documentFingerprints/"+fingerprint):null;
   inv.totals=totals;inv.netTotal=totals.net;inv.total=totals.total;inv.errors=[...new Set(errors)];inv.fingerprint=fingerprint;
   inv.duplicateOf=duplicate&&duplicate.documentId!==inv.id?duplicate.documentId:"";
   inv.warnings=inv.duplicateOf?["مستند مشابه مسجل سابقًا: "+inv.duplicateOf]:[];
   inv.status=inv.duplicateOf?"duplicate_review":"pending_review";
   const updates={};updates["documents/"+inv.id]=inv;updates["reviewQueue/"+inv.id]=reviewRecord(inv);
   updates["audit/"+uid("AUD")]={action:"submit_invoice",documentId:inv.id,status:inv.status,errors:inv.errors,uid:claims.sub,createdAt:now};
   const originalSender=previous&&(previous.assignmentSenderUid||previous.createdBy)||claims.sub;
   if(previous&&previous.assignmentId){
    updates["sentAssignments/"+id(originalSender)+"/"+id(previous.assignmentId)+"/status"]="sent_for_review";
    updates["sentAssignments/"+id(originalSender)+"/"+id(previous.assignmentId)+"/resubmittedAt"]=now;
    updates["sentAssignments/"+id(originalSender)+"/"+id(previous.assignmentId)+"/decision"]="creator_resubmitted";
   }
   await adminPatch(updates);
   let reviewPushNotifications=[],reviewersNotified=0;
   try{
    const allUsers=adminReadRoot?(await adminReadRoot("users"))||{}:{},notificationUpdates={};
    const reviewers=Object.entries(allUsers).filter(([reviewerUid,user])=>user&&reviewerUid!==claims.sub&&["active","نشط","مفعل","enabled"].includes(String(user.status||"").toLowerCase())&&hasPermission(user,"financial_review","view")&&hasPermission(user,"financial_review","approve"));
    for(const [reviewerUid,user] of reviewers){
     const notificationId=uid("FIN-REV"),notification={id:notificationId,type:"financialReviewRequired",recipientUid:reviewerUid,assignmentId:previous&&previous.assignmentId||"",invoiceId:inv.id,senderUid:claims.sub,senderName:txt(profile.fullName||profile.username||profile.email,120),title:"فاتورة جديدة بانتظار المراجعة",description:"الفاتورة "+(inv.number||inv.id)+" — "+(inv.partyName||"")+(inv.errors.length?" — تحتاج إلى استكمال بيانات":" — مطلوب المراجعة والاعتماد."),createdAt:now,read:false};
     notificationUpdates[reviewerUid+"/"+notificationId]=notification;reviewPushNotifications.push({recipientUid:reviewerUid,eventType:"financialReviewRequired",eventId:inv.id,dispatchPrefix:"finance:review:"+inv.id,content:{title:notification.title,body:notification.description}});
    }
    if(Object.keys(notificationUpdates).length)await patchExternalBranch("cashCustodyNotifications",notificationUpdates);reviewersNotified=reviewers.length;
   }catch(notificationError){console.error("Invoice entered review queue, but reviewer notifications could not be saved:",String(notificationError&&notificationError.message||notificationError));reviewPushNotifications=[];}
   if(previous&&previous.returnedTaskId){try{const taskId=id(previous.returnedTaskId),taskUpdates={};taskUpdates[claims.sub+"/"+taskId+"/status"]="completed";taskUpdates[claims.sub+"/"+taskId+"/completedAt"]=now;taskUpdates[claims.sub+"/"+taskId+"/completedBy"]=claims.sub;await patchExternalBranch("tasks",taskUpdates);}catch(taskError){console.error("Invoice was submitted to review, but its return-task could not be closed:",String(taskError&&taskError.message||taskError));}}
   return {success:true,id:inv.id,status:inv.status,errors:inv.errors,warnings:inv.warnings,totals,reviewersNotified,pushNotifications:reviewPushNotifications};
  }
if(action==="submitCash"){
  requireFinanceArea("cash","add");
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
  requireFinanceArea("bank","add");const importId=id(body.id||uid("BANK")),rows=Array.isArray(body.rows)?body.rows.slice(0,500):[];if(!rows.length)throw new Error("ملف البنك لا يحتوي على حركات");const u={},duplicates=[];let count=0;
  const bankCode=id(body.bankAccountCode||"1120"),bankAccount=await adminRead("chartOfAccounts/"+bankCode);
  if(!bankAccount||bankAccount.isGroup||bankAccount.active===false||bankAccount.type!=="asset")throw new Error("اختر حساب بنك نشطًا من حسابات الأصول قبل استيراد الكشف.");
  for(const row of rows){const d=date(row.date),amount=num(row.amount);if(!amount)continue;const fingerprint=await sha([txt(body.bankAccountCode||"1120",32),d,amount.toFixed(2),txt(row.reference,100),txt(row.description,500).toLowerCase().replace(/\s+/g," ")].join("|")),prev=await adminRead("bankFingerprints/"+fingerprint),docId=uid("BNK"),doc={id:docId,type:"bankLine",importId,date:d,amount,description:txt(row.description,500),reference:txt(row.reference,100),direction:row.direction==="in"?"in":"out",bankAccountCode:txt(body.bankAccountCode||"1120",32),fingerprint,status:prev?"duplicate_review":"pending_review",warnings:prev?["تكرار محتمل لحركة "+prev.documentId]:[],duplicateOf:prev&&prev.documentId||"",createdAt:now,createdBy:claims.sub};if(prev)duplicates.push(docId);else u["bankFingerprints/"+fingerprint]={documentId:docId,importId,createdAt:now};u["documents/"+docId]=doc;u["reviewQueue/"+docId]=reviewRecord(doc);count++;}
  u["bankImports/"+importId]={id:importId,bankAccountCode:body.bankAccountCode||"1120",fileName:txt(body.fileName,180),rowCount:count,duplicateCount:duplicates.length,createdAt:now,createdBy:claims.sub};u["audit/"+uid("AUD")]={action:"bank_import",importId,rowCount:count,duplicates:duplicates.length,uid:claims.sub,createdAt:now};await adminPatch(u);return {success:true,importId,rows:count,duplicates:duplicates.length};
 }
 if(action==="addAttachment"){
  const documentId=id(body.documentId),document=await adminRead("documents/"+documentId),attachment=body.attachment||{},attachmentId=id(attachment.id);
  if(!document)throw new Error("الفاتورة أو المستند غير موجود.");
  const activeAssignment=document.status==="assigned"&&document.assignedTo===claims.sub&&document.assignmentId&&await adminRead("assignments/"+claims.sub+"/"+id(document.assignmentId));
  const reviewEditor=["pending_review","duplicate_review"].includes(document.status)&&hasFinanceArea("review","edit");
  if(activeAssignment)requireFinanceArea("assignments","edit");
  else if(reviewEditor)requireFinanceArea("review","edit");
  else{requireFinanceArea("invoices",document.createdBy===claims.sub?"add":"edit");if(document.createdBy!==claims.sub&&profile.role!=="admin"&&!hasFinanceArea("invoices","edit"))throw new Error("ليس لديك صلاحية ربط المرفقات بهذا المستند.");}
  const metadata={id:attachmentId,fileName:txt(attachment.fileName||attachment.name,240),mimeType:txt(attachment.mimeType||attachment.contentType,120),size:num(attachment.size||attachment.fileSize||0),createdAt:now,uploadedBy:claims.sub};
  const updates={};updates["documents/"+documentId+"/attachments/"+attachmentId]=metadata;updates["audit/"+uid("AUD")]={action:"attach_financial_document",documentId,attachmentId,uid:claims.sub,createdAt:now};
  await adminPatch(updates);return {success:true,attachment:metadata};
 }
 if(action==="setAttachmentUploadStatus"){
  const documentId=id(body.documentId),document=await adminRead("documents/"+documentId);
  if(!document||document.type!=="invoice")throw new Error("الفاتورة غير موجودة لتحديث حالة المرفق.");
  const activeAssignment=document.status==="assigned"&&document.assignedTo===claims.sub&&document.assignmentId&&await adminRead("assignments/"+claims.sub+"/"+id(document.assignmentId));
  const reviewEditor=["pending_review","duplicate_review"].includes(document.status)&&hasFinanceArea("review","edit");
  if(activeAssignment)requireFinanceArea("assignments","edit");
  else if(reviewEditor)requireFinanceArea("review","edit");
  else{requireFinanceArea("invoices",document.createdBy===claims.sub?"add":"edit");if(document.createdBy!==claims.sub&&profile.role!=="admin"&&!hasFinanceArea("invoices","edit"))throw new Error("ليس لديك صلاحية تحديث مرفقات هذه الفاتورة.");}
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
  requireFinanceArea("bank","edit");
  const docId=id(body.id),doc=await adminRead("documents/"+docId);
  if(!doc||doc.type!=="bankLine"||!["pending_review","duplicate_review"].includes(doc.status))throw new Error("حركة البنك غير متاحة للتعديل");
  const offset=id(body.offsetAccountCode),account=await adminRead("chartOfAccounts/"+offset);
  if(!account||account.isGroup||account.active===false)throw new Error("اختر حسابًا تحليليًا فعالًا");
  const updates={};updates["documents/"+docId+"/offsetAccountCode"]=offset;updates["reviewQueue/"+docId+"/offsetAccountCode"]=offset;
  updates["audit/"+uid("AUD")]={action:"set_bank_offset",documentId:docId,accountCode:offset,uid:claims.sub,createdAt:now};
  await adminPatch(updates);return {success:true};
 }
 if(action==="updateReviewInvoice"){
   requireFinanceArea("review","edit");
   const docId=id(body.id),previous=await adminRead("documents/"+docId);
   if(!previous||previous.type!=="invoice"||!["pending_review","duplicate_review"].includes(previous.status))throw new Error("الفاتورة لم تعد متاحة للتعديل داخل المراجعة.");
   const editable=body.invoice&&typeof body.invoice==="object"&&!Array.isArray(body.invoice)?body.invoice:{},next={...previous};
   const allowed=["invoiceType","date","number","partyId","partyName","partyTaxNumber","currency","taxCode","taxType","taxRate","taxAmount","discount","projectCode"];
   for(const key of allowed)if(Object.prototype.hasOwnProperty.call(editable,key)){if(["taxRate","taxAmount","discount"].includes(key))next[key]=editable[key]===""?"":num(editable[key]||0);else next[key]=txt(editable[key]||"",key==="partyName"?180:key==="partyTaxNumber"?32:key==="number"?120:key==="date"?10:key==="currency"?3:120);}
   if(!["purchase","sales"].includes(next.invoiceType))throw new Error("نوع الفاتورة غير صحيح.");
   if(Array.isArray(body.lines))next.lines=body.lines.slice(0,100).map((line,index)=>{if(!line||typeof line!=="object"||Array.isArray(line))throw new Error("بيانات البند "+(index+1)+" غير صحيحة.");const row={...(previous.lines&&previous.lines[index]||{}),...line};row.description=txt(row.description||"",250);row.kind=txt(row.kind||"",16);for(const key of ["quantity","unitPrice","discount"])if(row[key]!==undefined&&row[key]!==""&&row[key]!==null)row[key]=num(row[key]);for(const key of ["itemCode","groupCode","warehouseCode","accountCode","incomeAccountCode","costCenterId","unit","itemType"])if(row[key]!==undefined)row[key]=txt(row[key]||"",120);return row;});
   const taxCodes=(await adminRead("taxCodes"))||{},chart=(await adminRead("chartOfAccounts"))||{},items=(await adminRead("items"))||{};
   const standardVatCode=next.invoiceType==="purchase"?"VAT-IN-14":"VAT-OUT-14",standardVatType=next.invoiceType==="purchase"?"vat_input":"vat_output",standardVat=taxCodes[standardVatCode];
   next.taxCode=standardVatCode;next.taxType=standardVatType;next.taxRate=14;
   if(Object.prototype.hasOwnProperty.call(editable,"otherTaxes"))next.otherTaxes=normalizeInvoiceOtherTaxes(editable.otherTaxes);
   let totals={net:0,tax:0,total:0};try{totals=invoiceTotals(next);next.totals=totals;next.netTotal=totals.net;next.total=totals.total;}catch(error){next.errors=[String(error.message||error)];}
   next.errors=invoiceReviewErrors(next,taxCodes,chart,items);
   const fingerprint=next.partyId&&next.number&&next.date?await sha([next.invoiceType,next.partyId,next.number,next.date,Number(totals.total||0).toFixed(2)].join("|").toLowerCase()):"";
   const duplicate=fingerprint?await adminRead("documentFingerprints/"+fingerprint):null;
   next.fingerprint=fingerprint;next.duplicateOf=duplicate&&duplicate.documentId!==docId?duplicate.documentId:"";next.warnings=next.duplicateOf?["مستند مشابه مسجل سابقًا: "+next.duplicateOf]:[];
   next.updatedAt=now;next.status=next.duplicateOf?"duplicate_review":"pending_review";
   const updates={};updates["documents/"+docId]=next;updates["reviewQueue/"+docId]=reviewRecord(next);updates["audit/"+uid("AUD")]={action:"update_review_invoice",documentId:docId,uid:claims.sub,errors:next.errors,createdAt:now};
   await adminPatch(updates);return {success:true,id:docId,status:next.status,errors:next.errors,totals};
  }
  if(action==="review"){
  requireFinanceArea("review","approve");
  const docId=id(body.id),decision=txt(body.decision,20),doc=await adminRead("documents/"+docId);if(!doc)throw new Error("مستند المراجعة غير موجود");
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
  if(decision==="reject"||decision==="return"){
   const status=decision==="reject"?"rejected":"needs_correction",u={};let sourceRootUpdate=null;
   u["documents/"+docId+"/status"]=status;u["documents/"+docId+"/reviewReason"]=txt(body.reason,1000);u["documents/"+docId+"/reviewedBy"]=claims.sub;u["documents/"+docId+"/reviewedAt"]=now;u["reviewQueue/"+docId]=null;
   u["audit/"+uid("AUD")]={action:status,documentId:docId,uid:claims.sub,createdAt:now};
   if(doc.type==="journal"&&doc.sourceType==="projectEvent"&&doc.sourceId&&adminPatchRootAt){
    const separator=String(doc.sourceId).lastIndexOf("--");
    if(separator>0)sourceRootUpdate={path:"projects/"+id(doc.sourceId.slice(0,separator))+"/events/"+id(doc.sourceId.slice(separator+2)),value:{accountingStatus:status,accountingReviewReason:txt(body.reason,1000),accountingReviewedAt:now,accountingReviewedBy:claims.sub}};
   }else if(doc.type==="journal"&&doc.sourceType==="cashCustody"&&doc.sourceId&&adminPatchRootAt){
    const separator=String(doc.sourceId).indexOf("--");
    if(separator>0)sourceRootUpdate={path:"cashCustodies/"+id(doc.sourceId.slice(0,separator))+"/transactions/"+id(doc.sourceId.slice(separator+2)),value:{financialReviewStatus:status,financialReviewReason:txt(body.reason,1000),financialReviewedAt:now,financialReviewedBy:claims.sub}};
   }else if(doc.type==="journal"&&doc.sourceType==="cashCustodyTransfer"&&doc.sourceId&&adminPatchRootAt){
    const parts=String(doc.sourceId).split("--"),ownerUid=id(parts[0]),transactionId=id(parts[1]),transferId=id(parts[2]);
    if(!ownerUid||!transactionId||!transferId)throw new Error("مرجع تحويل العهدة غير صالح.");
    const sourcePath="cashCustodies/"+ownerUid+"/transactions/"+transactionId;
    const source=adminReadRoot?await adminReadRoot(sourcePath):null,transfer=source&&source.cashCustodyTransfer||{};
    if(!source||transfer.pendingJournalId!==docId||transfer.transferId!==transferId)throw new Error("طلب التحويل لا يطابق الحركة الأصلية.");
    sourceRootUpdate={path:sourcePath,value:{
     "cashCustodyTransfer/pending":false,"cashCustodyTransfer/pendingJournalId":null,
     "cashCustodyTransfer/lastReviewStatus":status,"cashCustodyTransfer/lastReviewReason":txt(body.reason,1000),
     ["cashCustodyTransferHistory/"+transferId+"/status"]:status,
     ["cashCustodyTransferHistory/"+transferId+"/reviewedAt"]:now,
     ["cashCustodyTransferHistory/"+transferId+"/reviewedBy"]:claims.sub,
     ["cashCustodyTransferHistory/"+transferId+"/reviewReason"]:txt(body.reason,1000)
    }};
    const mirrorId=id(doc.custodyMirrorId),destinationOwnerUid=id(doc.destinationOwnerUid);
    if(mirrorId&&destinationOwnerUid)await adminPatchRootAt("cashCustodies/"+destinationOwnerUid+"/transactions/"+mirrorId,{status:"rejected",financialReviewStatus:status,financialReviewReason:txt(body.reason,1000)});
   }else if(doc.type==="journal"&&doc.sourceType==="cashCustodyTransfer"&&doc.sourceId&&adminPatchRootAt){
    const parts=String(doc.sourceId).split("--"),ownerUid=id(parts[0]),transactionId=id(parts[1]),transferId=id(parts[2]);
    if(!ownerUid||!transactionId||!transferId)throw new Error("مرجع تحويل العهدة غير صالح.");
    const sourcePath="cashCustodies/"+ownerUid+"/transactions/"+transactionId;
    const source=adminReadRoot?await adminReadRoot(sourcePath):null,transfer=source&&source.cashCustodyTransfer||{};
    if(!source||transfer.pending!==true||transfer.pendingJournalId!==j.id||transfer.transferId!==transferId||transfer.destinationOwnerUid!==doc.destinationOwnerUid)throw new Error("حالة حركة العهدة لا تطابق طلب التحويل. لم يتم تغيير الأرصدة.");
    sourceRootUpdate={path:sourcePath,value:{
     "cashCustodyTransfer/active":true,"cashCustodyTransfer/pending":false,"cashCustodyTransfer/pendingJournalId":null,
     "cashCustodyTransfer/lastJournalId":j.id,"cashCustodyTransfer/lastReviewStatus":"posted",
     ["cashCustodyTransferHistory/"+transferId+"/status"]:"posted",
     ["cashCustodyTransferHistory/"+transferId+"/approvedAt"]:now,
     ["cashCustodyTransferHistory/"+transferId+"/approvedBy"]:claims.sub
    }};
    const mirrorId=id(doc.custodyMirrorId),destinationOwnerUid=id(doc.destinationOwnerUid);
    if(mirrorId&&destinationOwnerUid)secondaryRootUpdate={path:"cashCustodies/"+destinationOwnerUid+"/transactions/"+mirrorId,value:{status:"approved",financialReviewStatus:"posted",financialJournalId:j.id,financialReviewedAt:now,financialReviewedBy:claims.sub,cashCustodyTransfer:{active:true,pending:false,sourceOwnerUid:ownerUid,sourceTransactionId:transactionId,transferId,journalId:j.id}}};
  }else if(doc.type==="journal"&&doc.sourceType==="partnerCurrentAccountTransfer"&&doc.sourceId&&adminPatchRootAt){
    const sourceId=String(doc.sourceId),first=sourceId.indexOf("--"),last=sourceId.lastIndexOf("--");
    if(first<=0||last<=first+2)throw new Error("مرجع تحويل جاري الشريك غير صالح.");
    const ownerUid=id(sourceId.slice(0,first)),transactionId=id(sourceId.slice(first+2,last)),transferId=id(sourceId.slice(last+2));
    sourceRootUpdate={path:"cashCustodies/"+ownerUid+"/transactions/"+transactionId,value:{
     "partnerCurrentAccountTransfer/pending":false,
     "partnerCurrentAccountTransfer/pendingJournalId":null,
     "partnerCurrentAccountTransfer/pendingTransferId":null,
     "partnerCurrentAccountTransfer/pendingDirection":null,
     "partnerCurrentAccountTransfer/lastReviewStatus":status,
     "partnerCurrentAccountTransfer/lastReviewReason":txt(body.reason,1000),
     ["partnerCurrentAccountTransferHistory/"+transferId+"/status"]:status,
     ["partnerCurrentAccountTransferHistory/"+transferId+"/reviewedAt"]:now,
     ["partnerCurrentAccountTransferHistory/"+transferId+"/reviewedBy"]:claims.sub,
     ["partnerCurrentAccountTransferHistory/"+transferId+"/reviewReason"]:txt(body.reason,1000)
    }};
   }
   await adminPatch(u);
   if(sourceRootUpdate)await adminPatchRootAt(sourceRootUpdate.path,sourceRootUpdate.value);
   return {success:true,status};
  }
  if(decision!=="approve"&&decision!=="approveDuplicate")throw new Error("قرار المراجعة غير صحيح");const updates={};let j,sourceRootUpdate=null,secondaryRootUpdate=null;
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
    rootUpdates["financial/documents/"+docId+"/journalNumber"]=j.number;
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
    const inv=doc,items=(await adminRead("items"))||{},centers=(await adminRead("costCenters"))||{},chart=(await adminRead("chartOfAccounts"))||{},taxCodes=(await adminRead("taxCodes"))||{},purchase=inv.invoiceType==="purchase";
    const validationErrors=invoiceReviewErrors(inv,taxCodes,chart,items);
    if(validationErrors.length)throw new Error("لا يمكن اعتماد الفاتورة قبل استكمالها: "+validationErrors.join("؛ "));
    const tot=invoiceTotals(inv),partyId=id(inv.partyId),lines=[];
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
   if(purchase&&tot.vat)lines.push({accountCode:"1410",debit:tot.vat,credit:0,description:"ضريبة مدخلات 14%",taxCode:inv.taxCode||"VAT-IN-14",taxType:inv.taxType||"vat_input"});
   if(!purchase&&tot.vat)lines.push({accountCode:"2110",debit:0,credit:tot.vat,description:"ضريبة مخرجات 14%",taxCode:inv.taxCode||"VAT-OUT-14",taxType:inv.taxType||"vat_output"});
   normalizeInvoiceOtherTaxes(inv.otherTaxes).forEach((tax,index)=>{
    const fixed=tax.amount!==""&&tax.amount!==null&&tax.amount!==undefined,amount=rnd(fixed?num(tax.amount):tot.net*num(tax.rate||0)/100);
    if(!amount)return;
    lines.push(purchase
     ?{accountCode:tax.accountCode,debit:amount,credit:0,description:tax.description||("ضريبة/رسم إضافي "+(index+1)),taxCode:tax.taxCode||"",taxType:"other"}
     :{accountCode:tax.accountCode,debit:0,credit:amount,description:tax.description||("ضريبة/رسم إضافي "+(index+1)),taxCode:tax.taxCode||"",taxType:"other"});
   });
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
  if(j){if(!j.number)j.number=journalNumberFor(j.date,j.id);updates["documents/"+docId+"/journalNumber"]=j.number;if(String(j.id)===String(docId))updates["documents/"+docId+"/number"]=j.number;}
  updates["documents/"+docId+"/status"]="posted";updates["documents/"+docId+"/journalId"]=j.id;updates["documents/"+docId+"/approvedAt"]=now;updates["documents/"+docId+"/approvedBy"]=claims.sub;updates["documents/"+docId+"/postedAt"]=now;updates["reviewQueue/"+docId]=null;
  updates["audit/"+uid("AUD")]={action:"approve_and_post",documentId:docId,journalId:j.id,uid:claims.sub,createdAt:now};
  if(doc.type==="journal"&&doc.reversalOf)updates["journals/"+id(doc.reversalOf)+"/reversedByJournalId"]=j.id;
  if(doc.type==="journal"&&doc.sourceType==="projectEvent"&&doc.sourceId&&adminPatchRootAt){
   const separator=String(doc.sourceId).lastIndexOf("--");
   if(separator>0)sourceRootUpdate={path:"projects/"+id(doc.sourceId.slice(0,separator))+"/events/"+id(doc.sourceId.slice(separator+2)),value:{accountingStatus:"posted",accountingImpact:true,accountingJournalId:j.id,accountingApprovedAt:now,accountingApprovedBy:claims.sub,accountingErrors:null}};
  }else if(doc.type==="journal"&&doc.sourceType==="cashCustody"&&doc.sourceId&&adminPatchRootAt){
   const separator=String(doc.sourceId).indexOf("--");
   if(separator>0){
    const ownerUid=id(doc.sourceId.slice(0,separator)),transactionId=id(doc.sourceId.slice(separator+2)),custody=adminReadRoot?await adminReadRoot("cashCustodies/"+ownerUid+"/transactions/"+transactionId):null;
    const custodyUpdates={financialReviewStatus:"posted",financialJournalId:j.id,financialReviewedAt:now,financialReviewedBy:claims.sub};
    if(custody){
     custodyUpdates.status="approved";
     if(custody.linkedOwnerUid&&custody.linkedTransactionId)await adminPatchRootAt("cashCustodies/"+id(custody.linkedOwnerUid)+"/transactions/"+id(custody.linkedTransactionId),{status:"approved",financialReviewStatus:"posted",financialJournalId:j.id,financialReviewedAt:now,financialReviewedBy:claims.sub});
    }
    sourceRootUpdate={path:"cashCustodies/"+ownerUid+"/transactions/"+transactionId,value:custodyUpdates};
   }
  }else if(doc.type==="journal"&&doc.sourceType==="partnerCurrentAccountTransfer"&&doc.sourceId&&adminPatchRootAt){
    const sourceId=String(doc.sourceId),first=sourceId.indexOf("--"),last=sourceId.lastIndexOf("--");
    if(first<=0||last<=first+2)throw new Error("مرجع تحويل جاري الشريك غير صالح.");
    const ownerUid=id(sourceId.slice(0,first)),transactionId=id(sourceId.slice(first+2,last)),transferId=id(sourceId.slice(last+2));
    const custody=adminReadRoot?await adminReadRoot("cashCustodies/"+ownerUid+"/transactions/"+transactionId):null;
    const transfer=custody&&custody.partnerCurrentAccountTransfer||{};
    if(!custody||transfer.pending!==true||transfer.pendingJournalId!==j.id||transfer.pendingTransferId!==transferId||transfer.pendingDirection!==doc.transferDirection)throw new Error("حالة حركة العهدة لا تطابق طلب تحويل جاري الشريك. لم يتم تغيير رصيدها.");
    const active=doc.transferDirection==="toCurrent";
    sourceRootUpdate={path:"cashCustodies/"+ownerUid+"/transactions/"+transactionId,value:{
     "partnerCurrentAccountTransfer/active":active,
     "partnerCurrentAccountTransfer/pending":false,
     "partnerCurrentAccountTransfer/pendingJournalId":null,
     "partnerCurrentAccountTransfer/pendingTransferId":null,
     "partnerCurrentAccountTransfer/pendingDirection":null,
     "partnerCurrentAccountTransfer/lastJournalId":j.id,
     "partnerCurrentAccountTransfer/lastDirection":doc.transferDirection,
     "partnerCurrentAccountTransfer/lastReviewStatus":"posted",
     "partnerCurrentAccountTransfer/lastReviewReason":null,
     "partnerCurrentAccountTransfer/updatedAt":now,
     "partnerCurrentAccountTransfer/updatedBy":claims.sub,
     ["partnerCurrentAccountTransferHistory/"+transferId+"/status"]:"posted",
     ["partnerCurrentAccountTransferHistory/"+transferId+"/approvedAt"]:now,
     ["partnerCurrentAccountTransferHistory/"+transferId+"/approvedBy"]:claims.sub,
     "partnerCurrentAccountTransferActive":active,
     "partnerCurrentAccountLastJournalId":j.id
    }};
   }
  await adminPatch(updates);
  if(sourceRootUpdate)await adminPatchRootAt(sourceRootUpdate.path,sourceRootUpdate.value);
  if(secondaryRootUpdate)await adminPatchRootAt(secondaryRootUpdate.path,secondaryRootUpdate.value);
  return {success:true,status:"posted",journalId:j.id};
 }
 if(action==="returnToReview"){requireFinanceArea("review","edit");throw new Error("إعادة الإرسال المباشر غير مسموح بها لأنها تتجاوز التحقق المحاسبي. أعد حفظ القيد أو الفاتورة من الشاشة المخصصة ليُعاد احتساب الأخطاء والتحقق من البيانات قبل دخول قائمة المراجعة.");}
 throw new Error("Unknown financial action.");
}
