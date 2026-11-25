(function(){
'use strict';

const COMPANY_TAX_REGISTRATION_NUMBER='589845268';
const normalizeTaxRegistrationNumber=value=>String(value||'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g,'');
const detectEtaInvoiceDirection=extracted=>{
 const issuerIsCompany=normalizeTaxRegistrationNumber(extracted&&extracted.issuerTaxNumber)===COMPANY_TAX_REGISTRATION_NUMBER;
 const recipientIsCompany=normalizeTaxRegistrationNumber(extracted&&extracted.recipientTaxNumber)===COMPANY_TAX_REGISTRATION_NUMBER;
 return issuerIsCompany===recipientIsCompany?'':issuerIsCompany?'sales':'purchase';
};
const parseEtaPartyBlock=block=>{
 const source=String(block||''),name=source.match(/Taxpayer\s+Name\s*:\s*([\s\S]*?)(?=\s+Registration\s+Number\s*:)/i),tax=source.match(/Registration\s+Number\s*:\s*#?\s*([0-9]{6,15})/i);
 return {name:String(name&&name[1]||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim(),taxNumber:normalizeTaxRegistrationNumber(tax&&tax[1])};
};
const parseEtaInvoiceParties=value=>{
 const source=String(value||''),issuerMarker=/Issuer\s*\(\s*From\s*\)/i.exec(source),recipientMarker=/Recipients?\s*\(\s*To\s*\)/i.exec(source);
 if(!issuerMarker||!recipientMarker||recipientMarker.index<=issuerMarker.index)return {};
 const rest=source.slice(recipientMarker.index+recipientMarker[0].length),itemMarker=/Code\s+Name/i.exec(rest);
 const issuer=parseEtaPartyBlock(source.slice(issuerMarker.index+issuerMarker[0].length,recipientMarker.index));
 const recipient=parseEtaPartyBlock(itemMarker?rest.slice(0,itemMarker.index):rest);
 return {issuerName:issuer.name,issuerTaxNumber:issuer.taxNumber,recipientName:recipient.name,recipientTaxNumber:recipient.taxNumber};
};
const parseInternalInvoiceNumber=value=>{
 const source=String(value||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
 const marker=/\bInternal\s*id\s*[:：]\s*/i.exec(source);
 if(!marker)return '';
 let candidate=source.slice(marker.index+marker[0].length).split(/\r?\n/,1)[0];
 const nextField=/\s+(?=(?:Document\s+Type(?:\s+Version)?|Date\s+Time\s+Issued|Issue\s+Date(?:\s+Time)?|Invoice\s+Date|Issuer\s*\(\s*From\s*\)|Recipients?\s*\(\s*To\s*\)|Seller\b|Buyer\b|Internal\s*id\s*[:：]|Total\s+(?:Sales\s+)?Amount|Taxable\s+Items|Items\s+Count|Payment\s+Method|Signature\b|QR\s+Code)(?:\s|[:：]|$))/i.exec(candidate);
 if(nextField)candidate=candidate.slice(0,nextField.index);
  const valueMatch=/^\s*[:：#-]*\s*([0-9٠-٩۰-۹]+)/.exec(candidate);
  return valueMatch?valueMatch[1].replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))):'';
};
const today=()=>new Date().toISOString().slice(0,10);
const openingBalanceDefaultDate=value=>{
 const match=/^(\d{4})-(\d{2})$/.exec(String(value||''));
 const date=match?new Date(Date.UTC(Number(match[1]),Number(match[2])-1,0)):new Date(Date.now()-86400000);
 return date.toISOString().slice(0,10);
};
const rows=o=>o?Object.entries(o).map(([key,v])=>Object.assign({id:v&&v.id||key,code:v&&v.code||key},v||{})):[];
const id=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now());
const n=v=>Number(v)||0;
const fmt=v=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
const journalSourceLabel=record=>{const sourceType=record&&record.openingBalance?'openingBalance':String(record&&record.sourceType||'manual');return ({openingBalance:'الأرصدة الافتتاحية',invoice:'فاتورة',cash:'الخزينة',bankLine:'البنك',projectEvent:'حدث مشروع',cashCustody:'عهدة شخصية',cashCustodyTransfer:'تحويل عهدة',partnerCurrentAccountTransfer:'تحويل جاري شريك',partnerCurrentAccountExpenseCorrection:'تصحيح جاري شريك',journalRevision:'تعديل معتمد لقيد',legacyImport:'استيراد أرشيف القيود',manual:'يدوي'}[sourceType]||sourceType||'يدوي');};
const dl=(name,txt)=>{const b=new Blob([txt],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);};
function FinanceModule(props){
 const {db,currentUser,rtl:rtlProp,language,workerBase,userDirectory=[],can:permissionCheck}=props;
 const rtl=language?language==="ar":rtlProp!==false;
 const t=(ar,en)=>rtl?ar:en,base=workerBase||window.location.origin;

 const financeEnglishLabels=Object.freeze({
  "النظام المالي والمحاسبي":"Financial & Accounting System",
  "دفتر أستاذ مستقل — لا ترحيل قبل المراجعة والاعتماد":"Separate General Ledger — No Posting Before Review & Approval",
  "ملخص مالي":"Financial Overview","القيود اليومية":"Journal Entries","الأرصدة الافتتاحية":"Opening Balances","المراجعة والاعتماد":"Review & Approval",
  "فواتير العملاء والموردين":"Customer & Supplier Invoices","الإجراءات المحولة إليّ":"Tasks Assigned to Me",
  "كشوف الأطراف والعاملين":"Party & Employee Statements","البيانات الأساسية والاستيراد":"Master Data & Import","دليل الأكواد والبيانات الأساسية":"Master Codes & Master Data",
  "دليل الحسابات":"Chart of Accounts","مراكز التكلفة":"Cost Centers","المخزون والأكواد":"Inventory & Item Codes","حركة وأرصدة المخزون":"Inventory Balances & Movements",
  "الخزينة والتحصيل والسداد":"Cash & Receipts / Payments","كشوف البنوك":"Bank Statements","الضرائب":"Taxes",
  "القوائم المالية":"Financial Statements","القوائم والتقارير المالية":"Financial Statements & Reports",
  "إجمالي المدين":"Total Debit","إجمالي الدائن":"Total Credit","إجمالي الكمية":"Total Quantity",
  "صافي الربح / الخسارة":"Net Profit / Loss","بانتظار المراجعة":"Pending Review",
  "من شهر":"From Month","إلى شهر":"To Month","تحديث التقارير":"Refresh Reports","الأداء المالي":"Financial Performance",
  "يعتمد الملخص على القيود المرحّلة بالفترة المحددة.":"The summary is based on posted journal entries for the selected period.",
  "الإيرادات":"Revenue","المصروفات":"Expenses","الأصول":"Assets","أصول":"Assets","الالتزامات":"Liabilities",
  "المستندات الأخيرة":"Recent Documents","المستند":"Document","النوع":"Type","التاريخ":"Date","الحالة":"Status",
  "الحساب":"Account","البيان":"Description","مدين":"Debit","دائن":"Credit","مركز التكلفة":"Cost Center",
  "الطرف التحليلي":"Analytical Party","الطرف":"Party","حذف":"Delete","إضافة سطر":"Add Line",
  "سطور القيد":"Journal Entry Lines","يجب أن يتساوى المدين والدائن.":"Total debits must equal total credits.",
  "بيانات القيد":"Journal Entry Details","قيد مزدوج. لا يتم ترحيله قبل مراجعة مستخدم مخوّل.":"Double-entry journal. It will not be posted before review by an authorized user.",
  "المرجع":"Reference","المدين":"Debit","الدائن":"Credit","الفرق":"Difference",
  "حفظ وإرسال للمراجعة":"Save & Submit for Review","حفظ وإرسال إلى المراجعة":"Save & Submit for Review",
  "سجل القيود اليومية الموحد":"Unified Journal Register","رقم القيد":"Journal Entry No.","المصدر":"Source",
  "فتح القيد":"Open Journal Entry","تفاصيل القيد":"Journal Entry Details","إغلاق":"Close",
  "إضافة سطر":"Add Line","حفظ التعديلات":"Save Changes","إنشاء قيد عكسي":"Create Reversing Entry",
  "إلغاء القيد":"Cancel Journal Entry","حذف القيد":"Delete Journal Entry","فاتورة":"Invoice",
  "الخزينة":"Cash","البنك":"Bank","حدث مشروع":"Project Event","عهدة شخصية":"Employee Custody","يدوي":"Manual",
  "نوع الفاتورة":"Invoice Type","مشتريات / مورد":"Purchase / Supplier","مبيعات / عميل":"Sales / Customer",
  "مشتريات":"Purchases","مبيعات":"Sales","العملة":"Currency","EGP — جنيه مصري":"EGP — Egyptian Pound",
  "EGP — الجنيه المصري":"EGP — Egyptian Pound","جنيه مصري EGP":"Egyptian Pound (EGP)",
  "الجنيه المصري":"Egyptian Pound",

  "قطعة":"Piece","تاريخ":"Date","بيان":"Description","الوصف":"Description","مرجع":"Reference","كود":"Code",
  "تليفون":"Phone","موبايل":"Mobile","التسجيل الضريبي":"Tax Registration","البريد الالكتروني":"Email",
  "تصنيف مخزني":"Inventory Classification","كود المجموعة":"Group Code","الإصدار":"Version","الاصدار":"Version",
  "كود الحساب":"Account Code","نوع":"Type","كود الحساب الأب":"Parent Account Code","تجميعي":"Group / Control",
  "كود المشروع":"Project Code","المشروع":"Project","تاريخ السريان":"Effective Date","بضاعة":"Goods",
  "مواد خام":"Raw Materials","مدخلات":"Input","مخرجات":"Output","اختر الصنف":"Select Item",
  "وصف البند":"Line Description","طبيعة البند":"Line Type","حساب المصروف":"Expense Account",
  "حساب الإيراد":"Revenue Account","الخصم":"Discount","إضافة بند":"Add Line",
  "تصنيف بنود الفاتورة":"Invoice Line Classification","تكويد الطرف واختياره":"Create and Select Party",
  "تكويد الصنف واختياره":"Create and Select Item","اقتراحات التكويد بعد قراءة الفاتورة":"Coding Suggestions from Invoice",
  "حساب المخزون / المبيعات المرتبط بالصنف":"Inventory / Sales Account Linked to Item",
  "خدمة / مصروف أو إيراد":"Service / Expense or Revenue","1410 — ضريبة مدخلات":"1410 — Input VAT",
  "2110 — ضريبة مخرجات":"2110 — Output VAT","ضريبة قيمة مضافة أساسية 14%":"Standard VAT 14%",
  "حساب الضريبة":"Tax Account","ضريبة/رسم إضافي":"Additional Tax / Fee",
  "المقترح المحاسبي قبل الحفظ":"Accounting Preview Before Saving","الحساب / التعديل":"Account / Adjustment",
  "تحويل المسودة لمستخدم آخر":"Assign Draft to Another User","المطلوب منه":"Assigned To",
  "حفظ كمسودة فقط":"Save as Draft Only","حفظ المسودة وتحويلها":"Save Draft & Assign",
  "الضرائب الأخرى:":"Other Taxes:","مسح / إلغاء الفاتورة":"Clear / Cancel Invoice",
  "تعديل واستكمال":"Edit & Complete","حساب عام":"General Account","صنف مخزني / إصدار":"Inventory Item / Version",
  "نوع التكويد":"Coding Type","بدون رقم":"No Number","مفتوحة":"Open","عاد إليك":"Returned to You",
  "عند المستخدم المستكمل":"With Assigned User","مكتمل":"Completed","المستخدم: ":"User: ",
  "طرف غير نشط":"Inactive Party","تاريخ الفاتورة":"Invoice Date","اسم الطرف":"Party Name",
  "الرقم الضريبي للطرف":"Party Tax Number","كود ضريبة القيمة المضافة الثابت":"Fixed VAT Code",
  "قيمة ضريبة القيمة المضافة (اختياري)":"VAT Amount (Optional)","اختر الصنف المخزني":"Select Inventory Item",
  "المصروف":"Expense","الإيراد":"Revenue","مرفقات الفاتورة":"Invoice Attachments",
  "المرفق الأصلي لم يكتمل رفعه: ":"The original attachment upload is incomplete: ",
  "المسار السابق للفاتورة.":"Previous invoice routing path.",
  "فاتورة مشتريات من مورد: ":"Purchase Invoice from Supplier: ","فاتورة مبيعات لعميل: ":"Sales Invoice to Customer: ",
  "عدد البنود":"Number of Lines","كشف حساب تفصيلي — ":"Detailed Account Statement — ",
  "حركة الموظف مرتبطة بالحساب الرقابي ":"Employee transaction linked to control account ",
  "1220 — العهد لدى العاملين":"1220 — Employee Custody","1230 — السلف لدى العاملين":"1230 — Employee Advances",
  "الأصول المتداولة":"Current Assets","الالتزامات المتداولة":"Current Liabilities",
  "دفعات مقدمة للموردين":"Supplier Advances","ضريبة القيمة المضافة - مدخلات":"Input VAT",
  "ضريبة القيمة المضافة - مخرجات":"Output VAT","دفعات مقدمة من العملاء":"Customer Advances",
  "ضرائب الخصم والإضافة المستحقة":"Withholding and Addition Tax Payable",
  "رأس المال والأرصدة الافتتاحية":"Capital & Opening Balances","إيرادات المبيعات":"Sales Revenue",
  "إيرادات الخدمات":"Service Revenue","تكلفة المبيعات":"Cost of Sales",
  "تكلفة البضاعة المباعة":"Cost of Goods Sold","مصروفات تشغيلية عامة":"General Operating Expenses",
  "مصروفات إدارية وعمومية":"General & Administrative Expenses","مصروفات نقل وشحن":"Freight & Transportation Expenses",
  "عمولات ومصاريف بنكية":"Bank Fees & Commissions","الأصناف والمجموعات":"Items & Groups",
  "نوع البيانات الأساسية":"Master Data Type","المستخدم التالي":"Next User",
  "المستخدم المسؤول عن الاستكمال":"User Responsible for Completion","الطرف / البيان":"Party / Description",
  "الطرف / التعديل":"Party / Adjustment","الحساب / البيان":"Account / Description",
  "الرقم":"Number","المبلغ":"Amount","الملاحظة":"Note","الحالة الحالية":"Current Status",
  "قيمة الضريبة":"Tax Amount","قيمة ضريبة القيمة المضافة":"VAT Amount","الوعاء الضريبي":"Taxable Base",
  "النسبة الافتراضية":"Default Rate","الصافي":"Net Amount","صافي المصروف":"Net Expense",
  "قيمة ثابتة":"Fixed Amount","قيمة ثابتة (اختياري)":"Fixed Amount (Optional)",
  "المرفق يحتاج إعادة رفع":"Attachment Requires Re-upload","المرفق لم يتم رفعه بعد":"Attachment Not Uploaded Yet",
  "الملفات محفوظة في مساحة المرفقات المالية المرتبطة بالفاتورة.":"Files are stored in the financial attachments area linked to the invoice.",
  "تم رفع المرفق وربطه بالفاتورة بنجاح.":"Attachment uploaded and linked to the invoice successfully.",
  "لا توجد تحويلات صادرة حتى الآن.":"No outgoing assignments yet.",
  "تأكيد حذف القيد ":"Confirm deletion of journal entry ",
  "تأكيد حذف/إلغاء الفاتورة ":"Confirm invoice deletion/cancellation ",
  "اختر صورة أو ملف PDF للفاتورة أولاً.":"Select an invoice image or PDF file first.",
  "الصيغ المدعومة للقراءة: PDF وJPG وPNG وWebP.":"Supported formats: PDF, JPG, PNG, and WebP.",
  "مكتبة Excel غير متاحة.":"Excel library is unavailable.",
  "لم يتم التعرف على حركات صحيحة من ملف البنك.":"No valid transactions were recognized in the bank file.",
  "حد الائتمان":"Credit Limit","الدولة":"Country","المدينة":"City","ملاحظات":"Notes",
  "كود العميل":"Customer Code","كود المورد":"Supplier Code","اسم العميل":"Customer Name","اسم المورد":"Supplier Name",
  "العميل / المورد":"Customer / Supplier","نوع كشف الحساب":"Statement Type",
  "طرف غير مسجل: ":"Unregistered party: ","صنف غير مسجل: ":"Unregistered item: ",
  "تم حفظ القيد مع أخطاء: ":"Journal entry saved with errors: ","تم إنشاء القيد العكسي ":"Reversing entry created: ",
  "تم حذف القيد وتحديث سجلات الأستاذ والفترة.":"Journal entry deleted and ledger / period records updated.",
  "تم إلغاء القيد وإزالته من قائمة المراجعة.":"Journal entry cancelled and removed from the review queue.",
  "تم الاعتماد والترحيل":"Approved and posted","تمت المراجعة والاعتماد":"Reviewed and approved",
  "تم تحديث المستند":"Document updated","تم إرسال القيد إلى المراجعة":"Journal entry submitted for review",
  "تم حفظ الحساب المقابل":"Offset account saved","تم حفظ الكود":"Code saved",
  "لا توجد فواتير معتمدة في الفترة المحددة.":"No approved invoices in the selected period.",
  "الرقم الضريبي":"Tax Number","رقم التسجيل الضريبي":"Tax Registration Number",
  "الخصم / الاستقطاع":"Withholding Tax","دفعات مقدمة":"Advance Payments",
  "العملة":"Currency","تاريخ السريان":"Effective Date","الملاحظات":"Notes",
  "رقم الفاتورة":"Invoice Number","المورد":"Supplier","العميل":"Customer",
  "المشروع المرتبط":"Related Project","بدون مشروع":"No Project","بدون":"None","بدون طرف":"No Party",
  "بدون كود ضريبي":"No Tax Code","بدون مجموعة":"No Group","بدون مركز تكلفة":"No Cost Center",
  "بدون مركز تكلفة (اختياري)":"No Cost Center (Optional)","كود ضريبة القيمة المضافة (ثابت 14%)":"VAT Code (Fixed 14%)",
  "نسبة الكود الثابت":"Fixed Code Rate","الضريبة (قيمة ثابتة اختيارية)":"Tax Amount (Optional Fixed Value)",
  "خصم الفاتورة":"Invoice Discount","صورة / PDF الفاتورة":"Invoice Image / PDF",
  "قراءة الصورة / PDF وملء الحقول":"Read Image / PDF and Fill Fields","مسح الفاتورة":"Clear Invoice",
  "بيانات الفاتورة":"Invoice Details","وصف الضريبة / الرسم":"Tax / Fee Description","النسبة %":"Rate %",
  "القيمة الثابتة (اختياري)":"Fixed Amount (Optional)","الحساب المحاسبي":"GL Account",
  "حذف الضريبة":"Delete Tax","ضرائب ورسوم أخرى (اختياري)":"Additional Taxes & Fees (Optional)",
  "إضافة ضريبة / رسم آخر":"Add Another Tax / Fee","الكمية":"Quantity","السعر":"Price","الإجمالي":"Total",
  "الصنف":"Item","كود الصنف":"Item Code","اسم الصنف":"Item Name","تصنيف البند":"Line Classification",
  "حدد تصنيف البند":"Select Line Classification","بضاعة / مخزون":"Goods / Inventory",
  "بضاعة / صنف يدخل المخزون":"Goods / Inventory Item","مصروف / خدمة":"Expense / Service",
  "مصروف أو خدمة لا تدخل المخزون":"Expense or Service (Non-Inventory)",
  "نوع الصنف":"Item Type","مخزون عام":"General Inventory","خامة":"Raw Material","منتج تام":"Finished Good",
  "قطع غيار":"Spare Parts","مستهلك":"Consumable","مستهلكات":"Consumables","مستهلكات تشغيل":"Operating Consumables",
  "مستلزمات مكتبية":"Office Supplies","الوحدة":"Unit","وحدة القياس":"Unit of Measure","المجموعة":"Group",
  "مجموعة الصنف":"Item Group","الإصدار / Version":"Version","كود المخزن":"Warehouse Code",
  "المخزن":"Warehouse","المخزن الافتراضي":"Default Warehouse","الحساب المحاسبي المرتبط":"Linked GL Account",
  "الحساب المقابل":"Offset Account","حفظ الحساب المقابل":"Save Offset Account","تصنيف الصنف":"Item Classification",
  "تصنيف المجموعة":"Group Classification","نوع المجموعة":"Group Type","تعبئة وتغليف":"Packaging",
  "أخرى":"Other","مواد تعبئة وتغليف":"Packaging Materials","خامات":"Raw Materials","منتجات تامة":"Finished Goods",
  "مجموعة أصناف":"Item Group","مجموعة أصناف جديدة":"New Item Group","صنف مخزني جديد":"New Inventory Item",
  "حساب جديد":"New Account","مركز تكلفة جديد":"New Cost Center","مخزن جديد":"New Warehouse",
  "حساب بنك جديد":"New Bank Account","كود ضريبي جديد":"New Tax Code","عميل / مورد جديد":"New Customer / Supplier",
  "نوع الحساب":"Account Type","طبيعة الحساب":"Account Nature","الطبيعة":"Nature","الحساب الأب":"Parent Account",
  "الحساب الاب":"Parent Account","حساب تجميعي":"Control / Group Account","تحليل الطرف":"Subledger Type",
  "أصول":"Assets","التزامات":"Liabilities","حقوق ملكية":"Equity","إيرادات":"Revenue","مصروفات":"Expenses",
  "مدين":"Debit","دائن":"Credit","بدون":"None","عميل":"Customer","مورد":"Supplier",
  "المشروع المرتبط":"Related Project","قيمة مضافة مدخلات":"Input VAT","قيمة مضافة مخرجات":"Output VAT",
  "خصم/استقطاع":"Withholding Tax","إضافة":"Addition","نوع الضريبة":"Tax Type","بداية السريان":"Effective From",
  "النسبة":"Rate","الحسابات":"Accounts","الحسابات التجميعية لا تقبل الترحيل.":"Group accounts cannot be posted.",
  "البيانات الأساسية":"Master Data","استيراد البيانات والأكواد":"Import Master Data & Codes",
  "اختر نوع السجل، نزّل النموذج، املأ البيانات ثم ارفع الملف. راجع المعاينة قبل تنفيذ الاستيراد.":"Select a record type, download the template, fill it in, then upload the file. Review the preview before importing.",
  "نوع البيانات":"Data Type","تنزيل نموذج ":"Download Template ","رفع ملف Excel أو CSV":"Upload Excel or CSV File",
  "معاينة أول 12 صفًا":"Preview First 12 Rows","لن يتم الحفظ قبل الضغط على تنفيذ الاستيراد.":"Nothing will be saved until you click Import.",
  "عدد السجلات: ":"Records: ","تنفيذ الاستيراد":"Import Data","إلغاء الملف":"Remove File",
  "العملاء":"Customers","الموردون":"Suppliers","الأصناف المخزنية":"Inventory Items","مجموعات الأصناف":"Item Groups",
  "دليل الموردين":"Supplier Directory","دليل العملاء":"Customer Directory","المخازن":"Warehouses",
  "حسابات البنوك":"Bank Accounts","الأكواد الضريبية":"Tax Codes","الكود":"Code","الاسم":"Name",
  "اسم المجموعة":"Group Name","التفاصيل":"Details","تحديد":"Select","تحديد كل الظاهر":"Select All Visible",
  "الهاتف":"Phone","رقم الهاتف":"Phone Number","رقم الموبايل":"Mobile Number","هاتف بديل":"Alternative Phone",
  "رقم التسجيل الضريبي":"Tax Registration Number","الرقم الضريبي":"Tax Number","البريد الإلكتروني":"Email",
  "بريد إلكتروني بديل":"Alternative Email","العنوان":"Address","الإجراءات":"Actions","الإجراء":"Action",
  "السجل نشط / متاح للاستخدام":"Record Active / Available","موقوف":"Inactive","نشط":"Active","مفعل":"Enabled",
  "ملاحظات":"Notes","اسم مسؤول التواصل":"Contact Person","الوظيفة / الصفة":"Job Title / Role",
  "السجل التجاري":"Commercial Registration","واتساب":"WhatsApp","الموقع الإلكتروني":"Website","المدينة":"City",
  "الدولة":"Country","الرمز البريدي":"Postal Code","شروط السداد":"Payment Terms","حد الائتمان":"Credit Limit",
  "اسم البنك":"Bank Name","رقم الحساب البنكي":"Bank Account Number","رقم الحساب":"Account Number",
  "اسم الحساب":"Account Name","حفظ واختيار الطرف":"Save & Select Party","حفظ الكود":"Save Code",
  "اقتراح الكود التالي حسب النمط":"Suggest Next Code","اقتراح الكود التالي":"Suggest Next Code",
  "بيانات مورد جديد":"New Supplier Details","بيانات عميل جديد":"New Customer Details",
  "نوع الطرف":"Party Type","إغلاق التفاصيل":"Close Details","إلغاء":"Cancel","إضافة كود":"Add Code",
  "＋ إضافة كود جديد":"＋ Add New Code","＋ إضافة ":"＋ Add ","＋ تكويد ":"＋ Create Code for ",
  "ابحث بالاسم أو الكود أو رقم التسجيل الضريبي":"Search by name, code, or tax registration number",
  "بحث بالكود أو الاسم أو البيانات":"Search by code, name, or details",
  "بحث برقم المستند أو الطرف أو الموظف أو البيان":"Search by document number, party, employee, or description",
  "بحث في الحساب أو البيان":"Search account or description","المحدد:":"Selected:",
  "المستندات الأخيرة":"Recent Documents","قائمة الحسابات":"Accounts List","قائمة مراكز التكلفة":"Cost Centers List",
  "قائمة الأصناف":"Items List","ملخص مالي":"Financial Summary","تحديث البيانات":"Refresh Data",
  "جارٍ التحديث":"Updating","جارٍ الحفظ...":"Saving...","جارٍ تحميل البيانات...":"Loading data...",
  "جارٍ قراءة الفاتورة...":"Reading invoice...","جارٍ فتح ملف PDF وتحليل صفحاته...":"Opening and analyzing PDF pages...",
  "جارٍ قراءة صورة الفاتورة...":"Reading invoice image...","جارٍ تحليل صفحة ":"Analyzing page ",
  "مكتبة Excel غير متاحة":"Excel library is unavailable","مكتبة PDF لم تكتمل.":"PDF library did not finish loading.",
  "لا توجد بيانات":"No data available","لا توجد مرفقات مسجلة على الفاتورة.":"No attachments are registered for this invoice.",
  "لا توجد مهام مالية محولة إليك.":"No financial tasks have been assigned to you.",
  "لا توجد تحويلات صادرة حتى الآن.":"No outgoing assignments yet.","فتح":"Open","فتح للمراجعة":"Open for Review",
  "فتح المسودة":"Open Draft","فتح المهمة واتخاذ القرار":"Open Task & Decide","إرسال للمراجعة والاعتماد":"Submit for Review & Approval",
  "أُرسل للمراجعة والاعتماد":"Submitted for Review & Approval","إرسال الحركات إلى المراجعة":"Submit Transactions for Review",
  "اعتماد وترحيل":"Approve & Post","إعادة للتصحيح":"Return for Correction","رفض":"Reject",
  "رفض المستند":"Reject Document","إلغاء الفاتورة":"Cancel Invoice","إلغاء الملف":"Remove File",
  "تحويل لمستخدم آخر":"Assign to Another User","تحويل للمستخدم التالي":"Assign to Next User",
  "المستخدم التالي":"Next User","اختر المستخدم التالي الذي سيتولى الفاتورة.":"Select the next user responsible for the invoice.",
  "اختر المستخدم الداخلي":"Select an Internal User","اختر مستخدمًا نشطًا":"Select an Active User",
  "المستخدم المستكمل":"Assigned User","تعليمات للمستخدم التالي":"Instructions for Next User",
  "استكمال وتصحيح بيانات الفاتورة":"Complete and Correct Invoice Details","استكمال فاتورة ":"Complete Invoice ",
  "تحويلاتي الصادرة":"My Outgoing Assignments","سجل التحويلات":"Assignment History",
  "سجل القيود اليومية الموحد":"Unified Journal Register","قائمة المراجعة والاعتماد":"Review & Approval Queue",
  "فواتير تحتاج تصحيح":"Invoices Requiring Correction","مسودة لم تُرسل للمراجعة بعد":"Draft — Not Submitted for Review",
  "تكرار محتمل":"Possible Duplicate","مكرر محتمل":"Possible Duplicate","يحتاج تصحيح":"Needs Correction",
  "مُرحّل":"Posted","مرفوض":"Rejected","مراجعة":"Review","يدوي":"Manual",
  "سندات الخزينة والبنوك":"Cash & Bank Vouchers","كشف حركات الخزينة":"Cash Transactions Statement",
  "الخزينة والتحصيل والسداد":"Cash, Receipts & Payments","حركة خزينة":"Cash Transaction",
  "نوع الحركة":"Transaction Type","إيداع":"Deposit","سحب":"Withdrawal","تحصيل من عميل":"Customer Receipt",
  "سداد إلى مورد":"Supplier Payment","استرداد عهدة من موظف":"Employee Custody Recovery",
  "تسليم عهدة لموظف":"Employee Custody Advance","صرف سلفة لموظف":"Employee Advance Payment",
  "تحصيل سلفة من موظف":"Employee Advance Recovery","استلام نقدية / إيراد آخر":"Other Receipt",
  "مصروف / مدفوعات أخرى":"Other Expense / Payment","إيداع نقدية بالبنك":"Cash Deposit to Bank",
  "سحب نقدية من البنك":"Cash Withdrawal from Bank","الموظف":"Employee",
  "الموظف المستلم / المسدد":"Receiving / Paying Employee","اختر المستخدم":"Select User",
  "حساب النقدية":"Cash Account","حساب البنك":"Bank Account","مركز التكلفة / المشروع":"Cost Center / Project",
  "كشف حركات الخزينة":"Cash Transactions","بحث برقم المستند أو الطرف أو الموظف أو البيان":"Search by document, party, employee, or description",
  "كشف حساب البنك":"Bank Statement","استيراد كشف حساب البنك":"Import Bank Statement",
  "Excel أو CSV. المكررات تعرض للمراجع بدل ترحيلها تلقائيًا.":"Excel or CSV. Duplicates are sent to the reviewer instead of being posted automatically.",
  "ملف كشف الحساب":"Statement File","وارد":"Incoming","صادر":"Outgoing",
  "سندات الخزينة والبنوك":"Cash & Bank Transactions","كشوف البنوك":"Bank Statements",
  "المراجعة والاعتماد":"Review & Approval","قائمة المراجعة والاعتماد":"Review & Approval Queue",
  "الضرائب":"Taxes","إقرار ومراجعة ضريبة القيمة المضافة":"VAT Return & Review",
  "الكشف التفصيلي للفواتير المعتمدة والمرحّلة فقط. لا تدخل الفواتير المعلقة أو المسودات في صافي الضريبة المستحق.":"Detailed report of approved and posted invoices only. Pending invoices and drafts are excluded from net tax due.",
  "ضريبة مدخلات المشتريات":"Purchase Input VAT","ضريبة مخرجات المبيعات":"Sales Output VAT",
  "صافي الوعاء (مبيعات - مشتريات)":"Net Tax Base (Sales - Purchases)",
  "ضريبة مستحقة مبدئيًا":"Preliminary Tax Payable","رصيد ضريبي دائن مبدئيًا":"Preliminary Tax Credit",
  "مستحق":"Payable","رصيد":"Balance","الفواتير المعتمدة:":"Approved Invoices:","فواتير لم تدخل الحساب:":"Invoices Not Yet Posted:",
  "فواتير المشتريات — ضريبة المدخلات":"Purchase Invoices — Input VAT",
  "فواتير المبيعات — ضريبة المخرجات":"Sales Invoices — Output VAT",
  "تصدير فواتير المشتريات CSV":"Export Purchase Invoices CSV","تصدير فواتير المبيعات CSV":"Export Sales Invoices CSV",
  "الأكواد الضريبية المستخدمة":"Tax Codes Used","اسم الضريبة":"Tax Name","بداية السريان":"Effective Date",
  "تحليل الحسابات":"Account Analysis","اختر أي حساب من دليل الحسابات لعرض رصيده حتى نهاية الشهر المحدد، ثم تحليل مصادر هذا الرصيد. التوزيع يُبنى على القيود المرحلة فقط، وتظهر الحركات غير المرتبطة بطرف أو مركز تكلفة تحت تصنيف واضح.":"Choose any chart-of-accounts entry to view its balance through the selected month and analyze its sources. Distribution uses posted journals only; items without a party or cost center are shown in a separate category.",
  "اختر الحساب المحاسبي":"Select GL Account","اختر الحساب":"Choose an account","تحديث التحليل":"Refresh Analysis",
  "إجمالي المدين منذ بداية الدفاتر":"Debits Since Books Opened","إجمالي الدائن منذ بداية الدفاتر":"Credits Since Books Opened","حركة الفترة — مدين":"Period Debits","حركة الفترة — دائن":"Period Credits",
  "توزيع الرصيد حسب الطرف أو مركز التكلفة أو الحساب المقابل":"Balance Distribution by Party, Cost Center, or Offset Account","بحث في التوزيع":"Search Distribution","الطرف / مصدر الرصيد":"Party / Balance Source",
  "إجمالي مدين":"Total Debits","إجمالي دائن":"Total Credits","صافي الرصيد":"Net Balance","عدد الحركات":"Movement Count",
  "رصيد الحساب من الأستاذ":"GL Account Balance","إجمالي صافي التوزيع":"Total Net Distribution","فرق المطابقة":"Reconciliation Difference",
  "العودة إلى توزيع الحساب":"Back to Account Distribution","مسار التحليل":"Analysis Path",
  "لا توجد حركات مرحلة لهذا الحساب حتى تاريخ التقرير.":"No posted movements for this account through the report date.","لا توجد حركات أو رصيد لهذا الحساب ضمن القيود المرحلة.":"No posted movements or balance for this account.","اختر حسابًا لعرض رصيده وتحليله.":"Choose an account to view its balance and analysis.","لا توجد حركات لهذا التصنيف.":"No movements in this category.",
  "التقرير":"Report","ميزان المراجعة":"Trial Balance","قائمة الدخل":"Income Statement","المركز المالي":"Balance Sheet",
  "قائمة التدفقات النقدية (مبسطة)":"Cash Flow Statement (Simplified)","دفتر الأستاذ":"General Ledger",
  "الحساب":"Account","افتتاحي مدين":"Opening Debit","افتتاحي دائن":"Opening Credit",
  "حركة مدين":"Period Debit","حركة دائن":"Period Credit","ختامي مدين":"Closing Debit","ختامي دائن":"Closing Credit",
  "البند":"Item","القيمة":"Amount","إجمالي الإيرادات":"Total Revenue","مجمل الربح":"Gross Profit",
  "إجمالي المصروفات الأخرى":"Total Other Expenses","إجمالي الأصول":"Total Assets","إجمالي الالتزامات":"Total Liabilities",
  "حقوق الملكية قبل نتيجة الأرباح":"Equity Before Current Profit","الأرباح المتراكمة منذ بداية الدفاتر":"Accumulated Profits Since Inception",
  "إجمالي حقوق الملكية":"Total Equity","إجمالي الالتزامات وحقوق الملكية":"Total Liabilities & Equity",
  "فرق التوازن (يجب أن يساوي صفرًا)":"Balance Difference (Must Be Zero)",
  "الأنشطة التشغيلية":"Operating Activities","الأنشطة الاستثمارية":"Investing Activities","الأنشطة التمويلية":"Financing Activities",
  "تدفقات داخلة":"Cash Inflows","تدفقات خارجة":"Cash Outflows","صافي التدفق":"Net Cash Flow",
  "مطابقة النقدية والبنوك":"Cash & Bank Reconciliation","الرصيد الافتتاحي في بداية الفترة":"Opening Balance at Period Start",
  "صافي التغير خلال الفترة":"Net Change During Period","الرصيد الختامي المتوقع":"Expected Closing Balance",
  "الرصيد الختامي بدفتر الأستاذ":"General Ledger Closing Balance","حركات غير مصنفة تحتاج مراجعة":"Unclassified Transactions Requiring Review",
  "تصدير ميزان المراجعة CSV":"Export Trial Balance CSV","تحديث":"Refresh",
  "الملخص المالي":"Financial Summary","يعتمد الملخص على القيود المرحّلة بالفترة المحددة.":"The summary is based on posted entries for the selected period.",
  "المصدر:":"Source:","الحالة:":"Status:","رقم ضريبي:":"Tax No.:","المرجع السابق للفاتورة.":"Previous invoice route.",
  "لا توجد فواتير معتمدة في الفترة المحددة.":"No approved invoices in the selected period.",
  "لا يوجد سبب محفوظ؛ افتح الفاتورة وراجع بياناتها":"No saved reason. Open the invoice and review its details.",
  "السجل مرتبط ببيانات سابقة؛ تم إيقاف استخدامه مع الاحتفاظ بالحركات والتقارير:":"This record is linked to historical data and has been deactivated; transactions and reports were retained:",
  "السجل غير المستخدم":"Unused record","تم حذف السجل غير المستخدم بنجاح.":"Unused record deleted successfully.",
  "تم حفظ التعديلات على السجل بنجاح.":"Record changes saved successfully.","تم حفظ الكود":"Code saved",
  "تعديل":"Edit","حذف":"Delete","حفظ":"Save","حفظ التعديلات":"Save Changes",
  "مبلغ":"Amount","التفاصيل":"Details","تفاصيل":"Details","البيان والتفاصيل":"Description & Details",
  "الفاتورة":"Invoice","الرصيد":"Balance","النشاط":"Activity","القيد":"Journal Entry",

  "إجراء":"Action","المبلغ":"Amount","المرجع":"Reference","النوع":"Type","الحجم":"Size","اسم الملف":"File Name",
  "الملف":"File","المرفق":"Attachment","المرفقات":"Attachments","تحميل":"Download","تحميل المرفق":"Download Attachment",
  "إضافة مرفق للفاتورة":"Add Invoice Attachment","إضافة أو إعادة رفع مرفق":"Add or Re-upload Attachment",
  "اختيار صورة أو ملف وإرفاقه":"Choose Image or File to Attach",
  "المرفقات الأصلية تنتقل مع الفاتورة بين المستخدمين.":"Original attachments move with the invoice between users.",
  "الملفات محفوظة في مساحة المرفقات المالية المرتبطة بالفاتورة.":"Files are stored in the financial attachments area linked to the invoice.",
  "تعذر تحميل المرفق.":"Unable to download attachment.","تعذر حفظ المرفق":"Unable to save attachment",
  "جلسة الدخول انتهت. أعد تسجيل الدخول.":"Your session has expired. Please sign in again.",
  "لا توجد بيانات":"No data available","الملف لا يحتوي على بيانات.":"The file contains no data.",
  "ملاحظات":"Notes","ملاحظة":"Note","الحساب المحاسبي المرتبط":"Linked GL Account",

  "Version / الإصدار":"Version","كود العميل / المورد":"Customer / Supplier Code",
  "اسم العميل / المورد":"Customer / Supplier Name","نسبة الضريبة %":"Tax Rate %",
  "قيمة الضريبة الثابتة":"Fixed Tax Amount","كود ضريبة القيمة المضافة":"VAT Code",
  "نوع البند":"Line Type","إضافة بند للفاتورة":"Add Invoice Line",
  "حفظ تصحيحات المراجع":"Save Reviewer Corrections",
  "تحليل المصروفات الفعلية حسب مركز التكلفة":"Actual Expense Analysis by Cost Center",
  "مرفقات المستند":"Document Attachments","تفاصيل الأصناف والإصدارات":"Item & Version Details",
  "قائمة التدفقات النقدية المبسطة":"Simplified Cash Flow Statement",

  "الطرف المختار":"Selected Party","نوع كشف الحساب":"Statement Type","عرض كشف الحساب":"View Statement",
  "كشوف الأطراف والعاملين":"Party & Employee Statements","العهد الشخصية للموظفين":"Employee Custody Accounts",
  "السلف الشخصية للموظفين":"Employee Advance Accounts","الرصيد الختامي":"Closing Balance",
  "دليل الحسابات":"Chart of Accounts","البيانات الأساسية والاستيراد":"Master Data & Import","دليل الأكواد والبيانات الأساسية":"Master Codes & Master Data",
  "استيراد البيانات والأكواد":"Import Data & Codes","الأداء المالي":"Financial Performance",
  "الحد الأقصى 500 سجل في الملف الواحد.":"Maximum 500 records per file.",
  "من":"From","إلى":"To","نعم":"Yes","لا":"No","نشط":"Active","مفعل":"Enabled","موقوف":"Inactive",
  "قيد عكسي للقيد:":"Reversal of Entry:","تفاصيل القيد:":"Journal Entry Details:",
  "الإجراءات المحولة إليّ":"Tasks Assigned to Me","المهام المحولة إليّ":"Tasks Assigned to Me",
  "تحويلات صادرة":"Outgoing Assignments","فتح للمراجعة":"Open for Review",
  "المستخدم التالي":"Next User","المستخدم المسؤول عن الاستكمال":"User Responsible for Completion",
  "استكمال ومراجعة بيانات الفاتورة":"Complete and Review Invoice Details",
  "إرسال للمراجعة والاعتماد":"Submit for Review & Approval",
  "إعادة الملف للمرسل المباشر":"Return to Previous Sender",
  "إلغاء من المستخدم المحال إليه":"Cancel by Assigned User",
  "تحديث القائمة الآن":"Refresh List Now","تحديث التقارير":"Refresh Reports",
  "اختر العميل أو المورد أولاً.":"Select a customer or supplier first.",
  "لا توجد تحويلات صادرة حتى الآن.":"There are no outgoing assignments yet.",
  "لا توجد مهام مالية محولة إليك.":"There are no financial tasks assigned to you.",
  "المبالغ من القيود المرحلة بالفترة المحددة فقط.":"Amounts include only entries posted in the selected period.",
  "يعتمد الملخص على القيود المرحّلة بالفترة المحددة.":"The summary is based on posted entries for the selected period.",
  "قيمة الرصيد":"Balance Amount","متوسط التكلفة":"Average Cost","متوسط تكلفة المجموعة":"Group Average Cost",
  "إجمالي المخزون حسب المجموعة والمخزن":"Total Inventory by Group and Warehouse",
  "الرصيد والتكلفة محفوظان على مستوى كود الصنف والإصدار والمخزن.":"Balances and costs are stored by item code, version, and warehouse.",
  "الحركة مستخرجة من الأستاذ الفرعي ومرتبطة بالحساب الرقابي.":"This transaction is derived from the subledger and linked to its control account.",
  "العهد الشخصية للموظفين":"Employee Custody Accounts","سلفة موظف":"Employee Advance",
  "عهدة شخصية":"Employee Custody","عهدة موظف":"Employee Custody",
  "التسليم ينشئ حركة مقابلة في عهدة الموظف الشخصية، والاسترداد يخفض رصيد العهدة تلقائيًا بعد الاعتماد.":"Issuing custody creates a matching entry in the employee custody account. Recovery reduces the custody balance after approval.",
  "السلفة تسجل على حساب السلف للموظف بصورة مستقلة عن العهدة، والتحصيل يخفض رصيد السلفة بعد الاعتماد.":"Employee advances are recorded separately from custody. Collection reduces the advance balance after approval.",
  "سجّل أي حركة نقدية أو بنكية. العهد والسلف تُربط بحساب الموظف التحليلي وتنعكس في كشف العهد الشخصية، ولا يتم ترحيل الأرصدة قبل الاعتماد.":"Record any cash or bank transaction. Custody and advances are linked to the employee subledger and appear in the employee statement. Balances are not posted before approval.",
  "سجل القيود اليومية الموحد":"Unified Journal Register",
  "يعرض القيود اليدوية والقيود المرحّلة الناتجة عن فواتير العملاء والموردين والخزينة والبنوك، إضافة إلى قيود أحداث المشروعات والعهد. اضغط أي صف لفتح تفاصيله. التعديل المباشر متاح للقيود اليدوية ومسودات أحداث المشروع والعهد داخل المراجعة، والقيود المرحّلة من المصادر الأخرى تُعالج من المستند الأصلي أو بقيد عكسي.":"Shows manual journal entries and posted entries generated from customer and supplier invoices, cash and bank transactions, project events, and custody transactions. Select a row to open its details. Manual entries and project/custody drafts can be edited during review; posted entries from other sources must be corrected in the source document or through a reversing entry.",
  "بعد الاستكمال يمكنك إرجاع الملف للمرسل المباشر، أو إرساله للمراجعة حتى لو بقيت بعض النواقص. المراجع يستكملها قبل الاعتماد.":"After completion, you can return the file to the previous sender or submit it for review even if some information is still missing. The reviewer must complete the missing information before approval.",
  "يمكن للمستلم الحالي تحويل الملف مباشرة إلى موظف آخر دون إرجاعه للمرسل الأصلي.":"The current recipient can assign the file directly to another employee without returning it to the original sender.",
  "هذه اقتراحات فقط. لا يتم إنشاء عميل أو مورد أو صنف إلا بعد ضغط المستخدم على زر التكويد.":"These are suggestions only. A customer, supplier, or item is not created until the user clicks the Create Code button.",
  "يجب أن يتساوى المدين والدائن.":"Total debits must equal total credits.",
  "تعذر تجهيز صفحة PDF للتحليل.":"Unable to prepare the PDF page for analysis.",
  "تعذر تحميل قارئ PDF. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.":"Unable to load the PDF reader. Check your internet connection and try again.",
  "تعذرت قراءة ملف الفاتورة.":"Unable to read the invoice file.",
  "تعذرت قراءة الفاتورة آليًا: ":"Unable to read the invoice automatically: ",
  "ويمكنك استكمال البيانات يدويًا.":"You can complete the details manually.",
  "يجب تحديد نوع الحساب وطبيعته في كل صف.":"Account type and nature must be specified in every row.",
  "يجب تحديد نوع الضريبة في كل صف.":"Tax type must be specified in every row.",
  "كود واسم المورد/العميل مطلوبان.":"Supplier/customer code and name are required.",
  "حدد نوع الطرف عميل أو مورد.":"Select whether the party is a customer or supplier.",
  "يجب إدخال الكود والاسم.":"Code and name are required.",
  "سبب عدم ظهورها في المراجعة":"Reason it is not shown in Review",
  "نواقص الفاتورة المطلوب استكمالها":"Invoice Information to Complete",
  "هذه النواقص لا تمنع إعادة التحويل أو إرسال الملف للمراجعة، لكنها تمنع الاعتماد النهائي حتى تصحيحها.":"These missing details do not prevent reassignment or submission for review, but final approval is blocked until they are corrected.",
  "يمكن أن تحتوي الفاتورة الواحدة على بضاعة تدخل المخزون ومصروفات أو خدمات. حدّد طبيعة كل بند بشكل مستقل، ثم اختر حساب المصروف المناسب.":"An invoice can contain inventory goods, expenses, or services. Classify each line separately, then select the appropriate expense account.",
  "يمكن للمراجع تعديل بيانات الرأس وكود الضريبة والبنود ثم حفظ التصحيحات قبل الاعتماد.":"The reviewer can edit header details, tax code, and lines, then save corrections before approval.",
  "تُحسب النسبة على صافي الفاتورة عند ترك القيمة الثابتة فارغة. اختر حسابًا محاسبيًا لكل ضريبة أو رسم إضافي حتى يظهر منفصلًا في القيد.":"The rate is calculated on the invoice net amount when the fixed amount is left blank. Select a GL account for each additional tax or fee so it appears separately in the journal entry.",
  "صورة الفاتورة تساعد في استخراج البيانات. كود القيمة المضافة الأساسي ثابت 14%، ويمكن إضافة ضرائب أخرى عند الحاجة.":"The invoice image helps extract details. The default VAT code is fixed at 14%; additional taxes can be added when required.",
  "الكشف التفصيلي للفواتير المعتمدة والمرحّلة فقط. لا تدخل الفواتير المعلقة أو المسودات في صافي الضريبة المستحق.":"Detailed report of approved and posted invoices only. Pending invoices and drafts are excluded from net tax payable.",
  "تعتمد الأرصدة القديمة في متابعة المشروعات والعهد لا تُنقل تلقائيًا إلى الحسابات. يلزم إعداد واعتماد الأرصدة الافتتاحية.":"Legacy balances in project follow-up and custody are not transferred automatically to accounting. Opening balances must be prepared and approved.",
  "الأرصدة القديمة في متابعة المشروعات والعهد لا تُنقل تلقائيًا إلى الحسابات. يلزم إعداد واعتماد الأرصدة الافتتاحية.":"Legacy balances in project follow-up and custody are not transferred automatically to accounting. Opening balances must be prepared and approved.",
  "بحث برقم المستند أو الطرف أو الموظف أو البيان":"Search by document number, party, employee, or description",
  "المدين:":"Debit:","الدائن:":"Credit:","الفرق:":"Difference:",
  "التاريخ:":"Date:","الحالة:":"Status:","المصدر:":"Source:",
  "الإجمالي:":"Total:","الصافي:":"Net:","القيمة:":"Amount:",
  "حساب ":"Account ","كود ":"Code ","اسم ":"Name ","رقم ضريبي: ":"Tax No.: ",
  "عميل: ":"Customer: ","مورد: ":"Supplier: ","المحدد: ":"Selected: ",
  "الصف ":"Row ","الملف: ":"File: ","من ":"From ","إلى ":"To ",
  " ج.م":" EGP","ج.م":"EGP"
 });
 const financeDynamicPrefixes=[
  ["حركات ","Transactions: "],["الرصيد حتى ","Balance through "],["عدد الحركات: ","Movement count: "],["مسار التحليل","Analysis path"],
  ["تفاصيل القيد: ","Journal Entry Details: "],["قيد عكسي للقيد: ","Reversal of Entry: "],
  ["المدين: ","Debit: "],["الدائن: ","Credit: "],["الفرق: ","Difference: "],
  ["المصدر: ","Source: "],["الحالة: ","Status: "],["رقم ضريبي: ","Tax No.: "],
  ["الصف ","Row "],["المحدد: ","Selected: "],["الملف: ","File: "],["حساب ","Account "],
  ["كود ","Code "],["اسم ","Name "],["عميل: ","Customer: "],["مورد: ","Supplier: "],
  ["جارٍ تحليل صفحة ","Analyzing PDF page "],["تعذرت قراءة الفاتورة آليًا: ","Unable to read the invoice automatically: "],
  ["تم حذف ","Deleted "],["تم حفظ ","Saved "],["تمت إضافة ","Added "],["تم إدخال ","Imported "],["فاتورة ","Invoice "],["مورد ","Supplier "],["عميل ","Customer "],["تاريخ ","Date "],["كود ","Code "],
  ["تم التعرف على ","Recognized "],["تمت قراءة ","Read "],["عدد السجلات: ","Records: "],
  ["تنزيل نموذج ","Download Template "],["اكتمل الدمج في ","Import completed in "],
  ["السجل مرتبط ببيانات سابقة؛ تم إيقاف استخدامه مع الاحتفاظ بالحركات والتقارير: ","Record deactivated because it has historical links; transactions and reports were retained: "]
 ];
 const translateFinanceText=value=>{
  if(rtl||typeof value!=="string")return value;
  if(Object.prototype.hasOwnProperty.call(financeEnglishLabels,value))return financeEnglishLabels[value];
  for(const [ar,en] of financeDynamicPrefixes)if(value.startsWith(ar))return en+value.slice(ar.length);
  if(value.endsWith(" ج.م"))return value.slice(0,-4)+" EGP";
  return value;
 };
 const h=(type,attributes,...children)=>{
  let nextAttributes=attributes;
  if(attributes&&typeof attributes==="object"){
   nextAttributes=Object.assign({},attributes);
   ["placeholder","title","aria-label"].forEach(key=>{
    if(typeof nextAttributes[key]==="string")nextAttributes[key]=translateFinanceText(nextAttributes[key]);
   });
  }
  const translateChild=value=>Array.isArray(value)?value.map(translateChild):typeof value==="string"?translateFinanceText(value):value;
  return React.createElement(type,nextAttributes,...children.map(translateChild));
 };

 const financeTabAreas={legacyImport:"journal",inventoryMovements:'inventory',overview:"overview",journal:"journal",openingBalances:"journal",review:"review",invoices:"invoices",assignments:"assignments",partyStatements:"partyStatements",partnerCurrent:"partyStatements",masters:"masters",accounts:"accounts",centers:"centers",inventory:"inventory",cash:"cash",bank:"bank",tax:"tax",reports:"reports",accountAnalysis:"reports",accountReview:"reports"};
 const financeMasterAreas={parties:"masters",financingParties:"masters",securityDepositParties:"masters",employeeAdvances:"masters",employeeCustodies:"masters",chartOfAccounts:"accounts",costCenters:"centers",items:"inventory",itemGroups:"inventory",warehouses:"inventory",bankAccounts:"bank",taxCodes:"tax"};
 const canFinance=(area,action="view")=>{
  if(currentUser&&currentUser.role==="admin")return true;
  if(typeof permissionCheck==="function")return permissionCheck("financial_"+area,action);
  const permissions=currentUser&&currentUser.permissions||{},specific=permissions["financial_"+area];
  if(specific&&typeof specific==="object")return specific[action]===true;
  const hasScoped=Object.keys(financeTabAreas).some(key=>permissions["financial_"+key]&&typeof permissions["financial_"+key]==="object");
  return !hasScoped&&Boolean(permissions.financial&&permissions.financial[action]===true);
 };
 const financeAreaForMaster=kind=>financeMasterAreas[kind]||"masters";
 const masterDirectoryOnly=props.masterDirectoryOnly===true;
 React.useEffect(()=>{if(masterDirectoryOnly){if(tab!=="masters")masterReturnTabRef.current=tab;if(tab!=="masters")setTab("masters");}else if(tab==="masters")setTab(masterReturnTabRef.current||"overview");},[masterDirectoryOnly]);
 const [tab,setTab]=React.useState(masterDirectoryOnly?"masters":"overview"),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
 const masterReturnTabRef=React.useRef("overview");
 const [master,setMaster]=React.useState({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},financingParties:{},securityDepositParties:{},employeeAdvances:{},employeeCustodies:{},settings:{},inventory:{balances:{}}});
 const [inventoryMovements,setInventoryMovements]=React.useState([]),[inventoryMovementModal,setInventoryMovementModal]=React.useState(null);
 const [documents,setDocuments]=React.useState([]),[journalRecords,setJournalRecords]=React.useState([]),[review,setReview]=React.useState([]),[periodJournals,setPeriodJournals]=React.useState([]),[balanceJournals,setBalanceJournals]=React.useState([]),[accountingStartMonth,setAccountingStartMonth]=React.useState('');
 const [legacyImportDocumentsLoading,setLegacyImportDocumentsLoading]=React.useState(false),[legacyImportDocumentsLoaded,setLegacyImportDocumentsLoaded]=React.useState(false);
 const legacyImportDocumentsRequestRef=React.useRef(0);
 const [journalModal,setJournalModal]=React.useState(null),[journalModalDraft,setJournalModalDraft]=React.useState(null);
 const [clients,setClients]=React.useState([]),[vendors,setVendors]=React.useState([]),[projects,setProjects]=React.useState([]);
 const [period,setPeriod]=React.useState({from:today().slice(0,7),to:today().slice(0,7)}),[report,setReport]=React.useState('trial');
 const [assignmentItems,setAssignmentItems]=React.useState([]),[sentAssignmentItems,setSentAssignmentItems]=React.useState([]),[selectedAssignmentId,setSelectedAssignmentId]=React.useState(''),[assignmentLines,setAssignmentLines]=React.useState([]),[assignmentHeader,setAssignmentHeader]=React.useState({}),[assignmentBusy,setAssignmentBusy]=React.useState(false),[assignmentInstruction,setAssignmentInstruction]=React.useState('مراجعة تصنيف البنود وتحديد الأكواد المخزنية أو حسابات المصروفات'),[assignmentUserUid,setAssignmentUserUid]=React.useState(''),[forwardUserUid,setForwardUserUid]=React.useState(''),[forwardInstruction,setForwardInstruction]=React.useState('استكمال ومراجعة بيانات الفاتورة'),[selectedAssignmentSource,setSelectedAssignmentSource]=React.useState('received'),[assignmentEditInstruction,setAssignmentEditInstruction]=React.useState('');
 const [selected,setSelected]=React.useState(null),[offset,setOffset]=React.useState('6100');
 const [integrityAudit,setIntegrityAudit]=React.useState(null),[integrityAuditBusy,setIntegrityAuditBusy]=React.useState(false),[integrityFindingSelected,setIntegrityFindingSelected]=React.useState('');
 const [invoiceDecisionDoc,setInvoiceDecisionDoc]=React.useState(null);
 const [quickAddType,setQuickAddType]=React.useState(''),[quickAddTarget,setQuickAddTarget]=React.useState(null),[quickAddParent,setQuickAddParent]=React.useState(null),[quickAddOriginalCode,setQuickAddOriginalCode]=React.useState(''),[quickAddForm,setQuickAddForm]=React.useState({code:'',name:'',active:true,type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',warehouseCode:'default',projectCode:'',taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'customer',phone:'',taxNumber:'',email:'',address:''});
 const [masterForm,setMasterForm]=React.useState({kind:'chartOfAccounts',code:'',name:'',type:'asset',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',projectCode:'',warehouseCode:'default',taxType:'vat',rate:'0',effectiveFrom:today()});
 const [journal,setJournal]=React.useState({id:'',date:today(),description:'',reference:'',checkNumber:'',invoiceNumber:'',documentNumber:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});
 const [journalFiles,setJournalFiles]=React.useState([]);
 const [invoice,setInvoice]=React.useState({id:'',type:'purchase',date:today(),number:'',partyId:'',partyName:'',partyTaxNumber:'',currency:'EGP',taxCode:'VAT-IN-14',taxRate:'14',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
 const [invoiceTypeManuallySelected,setInvoiceTypeManuallySelected]=React.useState(false);
 const [invoiceFile,setInvoiceFile]=React.useState(null),[invoicePartySearch,setInvoicePartySearch]=React.useState(''),[cashPartySearch,setCashPartySearch]=React.useState(''),[statementPartySearch,setStatementPartySearch]=React.useState(''),[ocrSuggestions,setOcrSuggestions]=React.useState({party:null,items:[]}),[cash,setCash]=React.useState({movementType:'customer_receipt',date:today(),amount:'',description:'',reference:'',partyType:'customer',partyId:'',partyName:'',employeeUid:'',employeeName:'',cashAccountCode:'1110',bankAccountCode:'1120',offsetAccountCode:'6100',taxAccountCode:'2110',projectCode:'',currency:'EGP'});
 const [cashHistorySearch,setCashHistorySearch]=React.useState(''),[masterViewKind,setMasterViewKind]=React.useState('chartOfAccounts');
 const [bankFile,setBankFile]=React.useState(null),[bankRows,setBankRows]=React.useState([]),[bankAccount,setBankAccount]=React.useState('1120');
 const [search,setSearch]=React.useState(''),[masterPartySearch,setMasterPartySearch]=React.useState(''),[screenTableSearch,setScreenTableSearch]=React.useState('');
 const [screenAccountFilter,setScreenAccountFilter]=React.useState(''),[screenCostCenterFilter,setScreenCostCenterFilter]=React.useState('');
 const [masterImportKind,setMasterImportKind]=React.useState('customers'),[masterImportRows,setMasterImportRows]=React.useState([]),[masterImportName,setMasterImportName]=React.useState('');
 const [legacyImportPackage,setLegacyImportPackage]=React.useState(null),[legacyImportFileName,setLegacyImportFileName]=React.useState(""),[legacyImportProgress,setLegacyImportProgress]=React.useState(null);
 const [selectedMasterCodes,setSelectedMasterCodes]=React.useState([]);
 const [partyStatement,setPartyStatement]=React.useState({type:'account',id:''}),[partyRows,setPartyRows]=React.useState([]);
 const [partnerCurrentAccounts,setPartnerCurrentAccounts]=React.useState([]),[partnerCurrentSelectedUid,setPartnerCurrentSelectedUid]=React.useState(''),[partnerCurrentSearch,setPartnerCurrentSearch]=React.useState(''),[partnerCurrentAttachmentView,setPartnerCurrentAttachmentView]=React.useState(null);
 const [accountDetailCode,setAccountDetailCode]=React.useState(''),[statementJournalId,setStatementJournalId]=React.useState('');
 const [collapsedPanels,setCollapsedPanels]=React.useState({});
 const [journalPickerSearch,setJournalPickerSearch]=React.useState({}),[journalPickerOpen,setJournalPickerOpen]=React.useState({}),[journalPickerAnchor,setJournalPickerAnchor]=React.useState({});
 const financePickerFallbackPosition=()=>({left:8,top:8,width:'min(320px, calc(100vw - 16px))',maxHeight:224});
 const financePickerPosition=element=>{if(!element||typeof element.getBoundingClientRect!=='function'||element.isConnected===false)return financePickerFallbackPosition();const rect=element.getBoundingClientRect();if(!rect)return financePickerFallbackPosition();const vw=window.innerWidth||320,vh=window.innerHeight||480,width=Math.max(120,Math.min(rect.width||280,vw-16)),spaceBelow=Math.max(0,vh-rect.bottom-8),spaceAbove=Math.max(0,rect.top-8),openBelow=spaceBelow>=spaceAbove,available=openBelow?spaceBelow:spaceAbove,maxHeight=Math.max(56,Math.min(280,available||56)),left=Math.max(8,Math.min(rect.left,vw-width-8)),anchor={left,width,maxHeight};if(openBelow)anchor.top=Math.max(8,Math.min(rect.bottom+4,vh-maxHeight-8));else anchor.bottom=Math.max(8,vh-rect.top+4);return anchor;};
 React.useEffect(()=>{if(!Object.values(journalPickerOpen).some(Boolean))return;const reposition=()=>{const roots=Array.from(document.querySelectorAll('[data-finance-picker-root]')),positions={};roots.forEach(root=>{const key=root.getAttribute('data-finance-picker-key');if(!key||!journalPickerOpen[key])return;const input=root.querySelector('input');if(input&&input.isConnected!==false&&typeof input.getBoundingClientRect==='function')positions[key]=financePickerPosition(input);});if(Object.keys(positions).length)setJournalPickerAnchor(old=>Object.assign({},old,positions));};reposition();window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);const viewport=window.visualViewport;if(viewport){viewport.addEventListener('resize',reposition);viewport.addEventListener('scroll',reposition);}return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);if(viewport){viewport.removeEventListener('resize',reposition);viewport.removeEventListener('scroll',reposition);}};},[journalPickerOpen]);
 const [openingBalanceDate,setOpeningBalanceDate]=React.useState(''),[openingBalanceValues,setOpeningBalanceValues]=React.useState({}),[openingBalanceDetails,setOpeningBalanceDetails]=React.useState({}),[openingDetailAccount,setOpeningDetailAccount]=React.useState(''),[openingAccountSearch,setOpeningAccountSearch]=React.useState('');
 React.useEffect(()=>{
  const closeFinancePickers=event=>{
   const owner=event.target&&event.target.closest?event.target.closest('[data-finance-picker-root],[data-finance-picker-menu]'):null;
   const keepKey=owner&&owner.getAttribute('data-finance-picker-key')||'';
   setJournalPickerOpen(previous=>{
    if(keepKey&&previous[keepKey])return previous;
    if(!Object.values(previous).some(Boolean))return previous;
    return {};
   });
  };
  document.addEventListener('pointerdown',closeFinancePickers,true);
  return ()=>document.removeEventListener('pointerdown',closeFinancePickers,true);
 },[]);
 const [accountAnalysisCode,setAccountAnalysisCode]=React.useState(''),[accountAnalysisGroupKey,setAccountAnalysisGroupKey]=React.useState(''),[accountAnalysisSearch,setAccountAnalysisSearch]=React.useState('');
 const [accountReviewDecisions,setAccountReviewDecisions]=React.useState({}),[accountReviewSelectedCode,setAccountReviewSelectedCode]=React.useState(''),[accountReviewSelectedParty,setAccountReviewSelectedParty]=React.useState(''),[accountReviewSelectedPartyType,setAccountReviewSelectedPartyType]=React.useState(''),[accountReviewSearch,setAccountReviewSearch]=React.useState(''),[accountReviewFilter,setAccountReviewFilter]=React.useState('all'),[accountReviewNote,setAccountReviewNote]=React.useState('');
 const [accountReviewFindingDecisions,setAccountReviewFindingDecisions]=React.useState({}),[accountReviewFindingFilter,setAccountReviewFindingFilter]=React.useState('open'),[accountReviewSelectedFinding,setAccountReviewSelectedFinding]=React.useState(''),[accountReviewFindingNote,setAccountReviewFindingNote]=React.useState('');
 const [statementAttachmentIndex,setStatementAttachmentIndex]=React.useState({});
 const [statementAttachmentList,setStatementAttachmentList]=React.useState(null),[statementAttachmentPreview,setStatementAttachmentPreview]=React.useState(null);
 const statementAttachmentCacheRef=React.useRef(new Set());
 React.useEffect(()=>{
  if(typeof props.onAttachmentScreenChange!=="function")return;
  if(props.activeHostTab!=="financial"&&props.activeHostTab!=="master")return;
  const area=financeTabAreas[tab]||"reports";
  const moduleArea=area==="overview"?"reports":area;
  const moduleId="financial_"+moduleArea;
  const parts=[tab];
  if(tab==="masters")parts.push(masterViewKind);
  if(tab==="partnerCurrent")parts.push(partnerCurrentSelectedUid||"all");
  if(tab==="reports")parts.push(report);
  if(tab==="partyStatements")parts.push(partyStatement.type,partyStatement.id||"all");
  if(tab==="accountAnalysis")parts.push(accountAnalysisCode||"all");
  if(tab==="accountReview")parts.push(accountReviewSelectedCode||"all",accountReviewSelectedPartyType||"all",accountReviewSelectedParty||"all");
  const screenKey=parts.map(value=>String(value||"all").replace(/[^a-zA-Z0-9_-]+/g,"_").slice(0,24)).join("_").slice(0,96);
  const screenLabels={
   overview:t("ملخص النظام المالي","Financial overview"),
   journal:t("القيود اليومية","Journal entries"),
   review:t("مراجعة القيود","Journal review"),
   invoices:t("الفواتير والمستندات","Invoices and documents"),
   assignments:t("مهام المراجعة","Review assignments"),
   partyStatements:t("كشوف الحسابات","Party statements"),
   masters:t("دليل الأكواد والبيانات الأساسية","Master data"),
   accounts:t("دليل الحسابات","Chart of accounts"),
   centers:t("مراكز التكلفة","Cost centers"),
   inventory:t("المخزون","Inventory"),
   cash:t("الخزينة","Cash"),
   bank:t("البنوك","Banks"),
   tax:t("الضرائب","Taxes"),
   reports:t("القوائم المالية والتقارير","Financial statements and reports")
  };
  let label=tab==="partnerCurrent"?t("جاري الشركاء","Partner current accounts"):screenLabels[area]||screenLabels.reports;
  if(tab==="accountAnalysis")label=t("تحليل الحسابات","Account analysis");
  if(tab==="accountReview")label=t("مراجعة الحسابات","Account review");
  props.onAttachmentScreenChange({entityType:"screen",entityId:moduleId+"--"+screenKey,label});
 },[props.activeHostTab,props.masterDirectoryOnly,tab,masterViewKind,partnerCurrentSelectedUid,report,partyStatement.type,partyStatement.id,accountAnalysisCode,accountReviewSelectedCode,accountReviewSelectedPartyType,accountReviewSelectedParty]);
 const api=async(path,method,body)=>{
  const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;
  if(!auth)throw new Error(t('جلسة الدخول انتهت. أعد تسجيل الدخول.','Your session expired. Sign in again.'));
  let token='';
  try{token=await auth.getIdToken();}
  catch(error){throw new Error(t('تعذر تحديث جلسة الدخول إلى Firebase. تحقق من الاتصال ثم سجّل الدخول مرة أخرى.','Could not refresh the Firebase session. Check the connection and sign in again.')+' ('+String(error&&error.message||error)+')');}
  const endpoint=String(base||'')+'/finance'+(path||'');
  const headers={Authorization:'Bearer '+token,Accept:'application/json'};
  const options={method:method||'GET',headers,cache:'no-store'};
  if(body!==undefined){headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  let response;
  try{response=await fetch(endpoint,options);}
  catch(error){
   let host=String(base||'');
   try{host=new URL(endpoint,window.location.href).origin;}catch(_){}
   throw new Error(t('تعذر الاتصال بخادم الحسابات ('+host+'). لم تصل استجابة من الخدمة. قد يكون السبب انقطاع الاتصال أو مشكلة CORS أو عدم استجابة Cloudflare Worker. لا تكرر اعتماد القيد قبل التحقق من حالته.','Could not reach the financial API ('+host+'). No response was received. Check connectivity, CORS and the Cloudflare Worker. Do not repeat journal approval until its current status is verified.')+' ['+String(error&&error.message||error)+']');
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||('HTTP '+response.status));
  return data;
 };
  const statementAttachmentKey=reference=>String(reference.entityType)+":"+String(reference.entityId);
 const statementAttachmentReferences=record=>{
  const refs=[],sourceType=String(record&&record.sourceType||""),sourceId=String(record&&record.sourceId||"");
  if(["cashCustody","partnerCurrentAccountTransfer","cashCustodyTransfer"].includes(sourceType)){
   const parts=sourceId.split("--");if(parts.length>=2&&parts[0]&&parts[1])refs.push({entityType:"cashCustody",entityId:parts.slice(0,2).join("--")});
  }else if(sourceType==="projectEvent"&&sourceId)refs.push({entityType:"projectEvent",entityId:sourceId});
  else if(sourceId)refs.push({entityType:"financial",entityId:sourceId});
  const journalDocumentId=record&&(record.journalId||(record.type==="journal"?record.id:""));
  if(journalDocumentId)refs.push({entityType:"financial",entityId:String(journalDocumentId)});
  return Array.from(new Map(refs.map(reference=>[statementAttachmentKey(reference),reference])).values());
 };
 const loadStatementAttachmentReferences=async references=>{
  const unique=new Map();(references||[]).forEach(reference=>{if(reference&&reference.entityType&&reference.entityId)unique.set(statementAttachmentKey(reference),{entityType:String(reference.entityType),entityId:String(reference.entityId)});});
  const missing=Array.from(unique.entries()).filter(([key])=>!statementAttachmentCacheRef.current.has(key));
  for(let offset=0;offset<missing.length;offset+=150){
   const chunk=missing.slice(offset,offset+150),chunkRefs=chunk.map(([,reference])=>reference);chunk.forEach(([key])=>statementAttachmentCacheRef.current.add(key));
   try{
    const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;if(!auth)throw new Error("جلسة الدخول انتهت. أعد تسجيل الدخول.");
    const token=await auth.getIdToken(),response=await fetch(base+"/attachments/lookup",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({references:chunkRefs})});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"تعذر فحص مرفقات كشف الحساب.");
    const found=new Map((Array.isArray(data.items)?data.items:[]).map(item=>[statementAttachmentKey(item),Array.isArray(item.attachments)?item.attachments:[]]));
    setStatementAttachmentIndex(previous=>{
     const updates={};
     chunk.forEach(([key])=>{
      const combined=[...(found.get(key)||[]),...(Array.isArray(previous[key])?previous[key]:[])];
      updates[key]=Array.from(new Map(combined.map(item=>[String(item.id),item])).values()).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
     });
     return Object.assign({},previous,updates);
    });
   }catch(error){chunk.forEach(([key])=>statementAttachmentCacheRef.current.delete(key));setError(error.message||String(error));return;}
  }
 };
 const loadStatementAttachments=records=>loadStatementAttachmentReferences((records||[]).flatMap(statementAttachmentReferences));
 const statementAttachmentsForReferences=references=>{
  const found=new Map();(references||[]).forEach(reference=>{const key=statementAttachmentKey(reference);(statementAttachmentIndex[key]||[]).forEach(attachment=>found.set(key+":"+attachment.id,Object.assign({},attachment,{entityType:reference.entityType,entityId:reference.entityId})));});return Array.from(found.values());
 };
 const openStatementAttachmentFile=async attachment=>{
  if(typeof props.onOpenAttachment==="function"){
   setStatementAttachmentList(null);
   props.onOpenAttachment(attachment,()=>deleteStatementAttachment(attachment,invoiceDocumentIdForAttachment(attachment)));
   return;
  }
  setBusy(true);setError('');
  try{
   const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;if(!auth)throw new Error("جلسة الدخول انتهت. أعد تسجيل الدخول.");
   const token=await auth.getIdToken(),url=base+"/attachments/file?entityType="+encodeURIComponent(attachment.entityType)+"&entityId="+encodeURIComponent(attachment.entityId)+"&id="+encodeURIComponent(attachment.id);
   const response=await fetch(url,{headers:{Authorization:"Bearer "+token}});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"تعذر فتح المرفق.");}
   const blob=await response.blob(),mime=String(attachment.mimeType||blob.type||"").toLowerCase();
   if(mime.includes("spreadsheet")||mime==="application/vnd.ms-excel"){
    if(window.XLSX){const workbook=window.XLSX.read(await blob.arrayBuffer(),{type:"array"}),sheet=workbook.Sheets[workbook.SheetNames[0]],rows=sheet?window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",blankrows:false}).slice(0,250).map(row=>row.slice(0,24)):[];setStatementAttachmentPreview({kind:"table",fileName:attachment.fileName,rows,attachment,entityType:attachment.entityType,entityId:attachment.entityId});}
    else{const objectUrl=URL.createObjectURL(blob),link=document.createElement("a");link.href=objectUrl;link.download=attachment.fileName||"attachment";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);}
   }else if(mime==="text/plain"||mime==="text/csv")setStatementAttachmentPreview({kind:"text",fileName:attachment.fileName,text:(await blob.text()).slice(0,500000),attachment,entityType:attachment.entityType,entityId:attachment.entityId});
   else if(["application/pdf","image/jpeg","image/png","image/webp"].includes(mime))setStatementAttachmentPreview(previous=>{if(previous&&previous.url)URL.revokeObjectURL(previous.url);return {kind:"media",fileName:attachment.fileName,mimeType:mime,url:URL.createObjectURL(blob),attachment,entityType:attachment.entityType,entityId:attachment.entityId};});
   else{const objectUrl=URL.createObjectURL(blob),link=document.createElement("a");link.href=objectUrl;link.download=attachment.fileName||"attachment";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);setNotice("هذا النوع من الملفات لا يدعم المعاينة داخل النظام؛ بدأ تنزيل الملف.");}
   setStatementAttachmentList(null);
  }catch(error){setError(error.message||String(error));}finally{setBusy(false);}
 };
 const canAppPermission=(area,action="view")=>{
  if(currentUser&&currentUser.role==="admin")return true;
  if(typeof permissionCheck==="function")return permissionCheck(area,action);
  const permissions=currentUser&&currentUser.permissions||{},specific=permissions[area];
  return Boolean(specific&&typeof specific==="object"&&specific[action]===true);
 };
 const canDeleteStatementAttachment=(attachment,assignedContext=false)=>{
  if(currentUser&&currentUser.role==="admin")return true;
  const type=String(attachment&&attachment.entityType||"");
  if(type==="financial"){
   const record=[...(documents||[]),...(journalRecords||[]),...(review||[]),...(selected?[selected]:[])].find(item=>item&&String(item.id)===String(attachment.entityId));
   if(attachment.ownerUid&&attachment.ownerUid!==(currentUser&&currentUser.uid)&&!canAppPermission("attachments","delete"))return false;
   if(assignedContext&&canFinance("assignments","edit"))return true;
   if(record&&record.status==="assigned"&&record.assignedTo===(currentUser&&currentUser.uid))return canFinance("assignments","edit");
   if(record&&["pending_review","duplicate_review","needs_correction"].includes(record.status)&&canFinance("review","edit"))return true;
   if(record&&record.type==="journal")return canFinance("journal","delete")||canFinance("journal","edit")||canFinance("financial","delete")||canFinance("financial","edit");
   return canFinance("invoices","delete")||canFinance("invoices","edit")||(record&&record.createdBy===(currentUser&&currentUser.uid)&&canFinance("invoices","add"))||canFinance("financial","delete")||canFinance("financial","edit");
  }
  if(!canAppPermission("attachments","delete"))return false;
  if(type==="cashCustody"||type==="cashCustodyDraft")return canAppPermission("cashCustody","delete")||canAppPermission("cashCustody","edit")||(type==="cashCustodyDraft"&&canAppPermission("cashCustody","add"));
  if(type==="projectEvent")return canAppPermission("projects","delete")||canAppPermission("projects","edit");
  return false;
 };
 const invoiceDocumentIdForAttachment=attachment=>{
  const records=[...(documents||[]),...(review||[]),...(selected?[selected]:[])];
  const record=records.find(item=>item&&item.type==="invoice"&&String(item.id)===String(attachment&&attachment.entityId));
  return record&&record.id||"";
 };
 const deleteStatementAttachment=async(attachment,invoiceDocumentId="",assignedContext=false)=>{
  if(!attachment||!attachment.id||!attachment.entityType||!attachment.entityId)return false;
  if(!canDeleteStatementAttachment(attachment,assignedContext)){setError("ليس لديك صلاحية حذف هذا المرفق.");return false;}
  if(!window.confirm("هل تريد حذف المرفق "+String(attachment.fileName||"")+" نهائيًا من النظام وGoogle Drive؟"))return false;
  setBusy(true);setError("");
  const documentId=invoiceDocumentId||(attachment.entityType==="financial"?invoiceDocumentIdForAttachment(attachment):"");
  let metadataRemoved=false;
  try{
   if(documentId){
    const metadataResult=await api("","POST",{action:"deleteAttachment",documentId,attachmentId:attachment.id});
    metadataRemoved=!metadataResult.alreadyUnlinked;
   }
   try{
    const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;if(!auth)throw new Error("جلسة الدخول انتهت. أعد تسجيل الدخول.");
    const token=await auth.getIdToken(),response=await fetch(base+"/attachments",{method:"DELETE",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({entityType:attachment.entityType,entityId:attachment.entityId,id:attachment.id})});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"تعذر حذف المرفق.");
   }catch(workerError){
    if(metadataRemoved)await api("","POST",{action:"addAttachment",documentId,attachment}).catch(()=>null);
    throw workerError;
   }
   const key=statementAttachmentKey(attachment);
   statementAttachmentCacheRef.current.add(key);
   setStatementAttachmentIndex(previous=>Object.assign({},previous,{[key]:(previous[key]||[]).filter(item=>String(item.id)!==String(attachment.id))}));
   setStatementAttachmentList(previous=>previous?Object.assign({},previous,{attachments:(previous.attachments||[]).filter(item=>String(item.id)!==String(attachment.id))}):previous);
   setPartnerCurrentAttachmentView(previous=>previous&&String(previous.ownerUid+"--"+previous.transaction.id)===String(attachment.entityId)?Object.assign({},previous,{attachments:(previous.attachments||[]).filter(item=>String(item.id)!==String(attachment.id))}):previous);
   setSelected(previous=>previous&&String(previous.id)===String(documentId||attachment.entityId)?Object.assign({},previous,{attachments:Object.fromEntries(Object.entries(previous.attachments||{}).filter(([id])=>String(id)!==String(attachment.id)))}):previous);
   setStatementAttachmentPreview(previous=>{if(previous&&previous.attachment&&String(previous.attachment.id)===String(attachment.id)){if(previous.url)URL.revokeObjectURL(previous.url);return null;}return previous;});
   await refresh();
   setNotice("تم حذف المرفق نهائيًا من النظام وGoogle Drive.");
   return true;
  }catch(error){setError(error.message||String(error));return false;}
  finally{setBusy(false);}
 };
 const statementAttachmentActionForReferences=references=>{
  const validReferences=Array.from(references||[]).filter(reference=>reference&&reference.entityType&&reference.entityId);
  const attachments=statementAttachmentsForReferences(validReferences);
  const manageableReferences=typeof props.onManageRecordAttachments==="function"?validReferences:[];
  if(!attachments.length&&!manageableReferences.length)return null;
  return h("span",{className:"inline-flex flex-wrap items-center gap-1"},
   attachments.length?h("button",{type:"button",title:attachments.map(item=>item.fileName).join("، "),className:"inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 whitespace-nowrap",onClick:event=>{event.stopPropagation();if(attachments.length===1)void openStatementAttachmentFile(attachments[0]);else setStatementAttachmentList({title:"مرفقات البيان",attachments});}},"📎 "+(attachments.length===1?"مرفق":String(attachments.length)+" مرفقات")):null,
   ...manageableReferences.map((reference,index)=>h("button",{key:reference.entityType+":"+reference.entityId,type:"button",title:reference.entityType==="cashCustody"?"إضافة أو إدارة مرفقات حركة العهدة":"إضافة أو إدارة مرفقات المستند الأصلي",className:"inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 whitespace-nowrap",onClick:event=>{event.stopPropagation();const label=reference.entityType==="cashCustody"?t("مرفقات حركة العهدة","Cash custody attachments"):reference.entityType==="financial"?t("مرفقات المستند أو القيد","Source document or journal attachments"):t("مرفقات البيان الأصلي","Source record attachments");props.onManageRecordAttachments(reference.entityType,reference.entityId,label,attachment=>deleteStatementAttachment(attachment,invoiceDocumentIdForAttachment(attachment)));}},"＋ "+t("إدارة","Manage")))
  );
 };
 const statementAttachmentAction=record=>statementAttachmentActionForReferences(statementAttachmentReferences(record));
 const closeStatementAttachmentPreview=()=>setStatementAttachmentPreview(previous=>{if(previous&&previous.url)URL.revokeObjectURL(previous.url);return null;});
 const downloadFinancialAttachment=async(documentId,attachment)=>{
  setBusy(true);setError('');
  try{
   const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;
   if(!auth)throw new Error('جلسة الدخول انتهت. أعد تسجيل الدخول.');
   const token=await auth.getIdToken();
   const url=base+'/attachments/file?entityType=financial&entityId='+encodeURIComponent(documentId)+'&id='+encodeURIComponent(attachment.id);
   const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'تعذر تحميل المرفق.');}
   const blob=await response.blob(),objectUrl=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=objectUrl;link.download=attachment.fileName||'invoice-attachment';document.body.appendChild(link);link.click();link.remove();
   setTimeout(function(){URL.revokeObjectURL(objectUrl);},60000);
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const upload=async(file,entityId)=>{
  const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser,token=await auth.getIdToken();
  const response=await fetch(base+'/attachments/upload',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':file.type||'application/octet-stream','X-Attachment-Entity-Type':'financial','X-Attachment-Entity-Id':entityId,'X-Attachment-File-Name':encodeURIComponent(file.name)},body:file});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'تعذر حفظ المرفق');return data;
 };
 const appendStatementAttachment=(entityId,rawAttachment)=>{
  const id=String(entityId||''),attachment=Object.assign({},rawAttachment||{},{entityType:'financial',entityId:id});
  if(!id||!attachment.id)return;
  const key=statementAttachmentKey({entityType:'financial',entityId:id});
  statementAttachmentCacheRef.current.add(key);
  setStatementAttachmentIndex(previous=>{
   const current=Array.isArray(previous[key])?previous[key]:[];
   const next=current.filter(item=>String(item.id)!==String(attachment.id));
   next.push(attachment);
   next.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
   return Object.assign({},previous,{[key]:next});
  });
 };
 const uploadJournalAttachments=async(files,record,options)=>{
  const selectedFiles=Array.from(files||[]).filter(file=>file&&file.name),entityId=String(record&&record.id||'');
  const keepBusy=Boolean(options&&options.keepBusy),quiet=Boolean(options&&options.quiet);
  if(!selectedFiles.length)return {uploaded:0,failures:[]};
  if(!entityId){const message='تعذر تحديد رقم القيد لربط المرفق.';if(!quiet)setError(message);return {uploaded:0,failures:[message]};}
  const pending=['pending_review','duplicate_review','needs_correction'].includes(String(record.status||''));
  const permitted=pending?(canFinance('review','edit')||canFinance('journal','add')||canFinance('journal','edit')):(canFinance('journal','add')||canFinance('journal','edit'));
  if(!permitted){const message=pending?'إضافة مرفق لقيد المراجعة تتطلب صلاحية المراجعة أو إضافة/تعديل القيود.':'إضافة مرفق لقيد مرحّل تتطلب صلاحية إضافة أو تعديل القيود.';if(!quiet)setError(message);return {uploaded:0,failures:selectedFiles.map(file=>(file.name||'ملف')+': '+message)};}
  if(!keepBusy)setBusy(true);
  if(!quiet)setError('');
  let uploaded=0;const failures=[];
  try{
   for(const file of selectedFiles){
    try{
     const result=await upload(file,entityId),attachment=result.attachment||result;
     if(!attachment.id)throw new Error('لم تُرجع خدمة المرفقات معرّف الملف بعد الرفع.');
     appendStatementAttachment(entityId,attachment);uploaded++;
    }catch(error){failures.push((file.name||'ملف')+': '+(error.message||String(error)));}
   }
   if(uploaded&&!quiet)setNotice('تم رفع '+uploaded+' مرفق وربطها بالقيد بنجاح. تم الاحتفاظ بكل المرفقات السابقة.');
   if(failures.length&&!quiet)setError('تعذر رفع بعض المرفقات: '+failures.join(' · '));
   return {uploaded,failures};
  }finally{if(!keepBusy)setBusy(false);}
 };
 const journalAttachmentUploadControl=record=>{
  if(!record||record.type!=='journal')return null;
  const pending=['pending_review','duplicate_review','needs_correction'].includes(String(record.status||''));
  const permitted=pending?(canFinance('review','edit')||canFinance('journal','add')||canFinance('journal','edit')):(canFinance('journal','add')||canFinance('journal','edit'));
  if(!permitted)return null;
  return h('label',{className:'inline-flex items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 cursor-pointer hover:bg-blue-100'},'＋ إضافة مرفق للقيد',h('input',{type:'file',multiple:true,accept:'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',disabled:busy,className:'hidden',onChange:event=>{const files=event.target.files;if(files&&files.length)void uploadJournalAttachments(files,record);event.target.value='';}}));
 };
 const saveInvoiceAttachment=async(file,documentId)=>{
  const uploadResult=await upload(file,documentId),attachment=uploadResult.attachment||uploadResult;
  await api('', 'POST',{action:'addAttachment',documentId,attachment});
  await api('', 'POST',{action:'setAttachmentUploadStatus',documentId,status:'uploaded'});
  return attachment;
 };
 const retryInvoiceAttachment=async(file,documentId)=>{
  setBusy(true);setError('');
  try{
   const attachment=await saveInvoiceAttachment(file,documentId);
   setSelected(old=>old&&old.id===documentId?Object.assign({},old,{attachmentUploadStatus:'',attachmentUploadError:'',attachments:Object.assign({},old.attachments||{},{[attachment.id]:attachment})}):old);
   setNotice('تم رفع المرفق وربطه بالفاتورة بنجاح.');
   await refresh();
   setSelected(old=>old&&old.id===documentId?Object.assign({},old,{attachmentUploadStatus:'',attachmentUploadError:'',attachments:Object.assign({},old.attachments||{},{[attachment.id]:attachment})}):old);
  }catch(e){
   const message=e.message||String(e);
   await api('', 'POST',{action:'setAttachmentUploadStatus',documentId,status:'pending',fileName:file&&file.name||'',error:message}).catch(()=>null);
   setSelected(old=>old&&old.id===documentId?Object.assign({},old,{attachmentUploadStatus:'pending',attachmentFileName:file&&file.name||old.attachmentFileName||'',attachmentUploadError:message}):old);
   setError('الفاتورة ما زالت موجودة في قائمة المراجعة، لكن تعذر رفع المرفق: '+message);
  }finally{setBusy(false);}
 };
 const refresh=async(options)=>{
  const initialOnly=Boolean(options&&options.initialOnly),silent=Boolean(options&&options.silent),keepBusy=Boolean(options&&options.keepBusy);
  if(!keepBusy)setBusy(true);
  if(!silent)setError('');
  try{
   const b=await api('?resource=bootstrap');
   const [r,d,j]=await Promise.all([
    !initialOnly&&canFinance('review','view')?api('?resource=review'):Promise.resolve({items:{}}),
    !initialOnly&&(['invoices','journal','cash','bank'].some(area=>canFinance(area,'view'))||((tab==='accountReview'||tab==='review')&&canFinance('reports','view')))?api('?resource=documents'):Promise.resolve({items:{}}),
    !initialOnly&&(canFinance('journal','view')||((tab==='accountReview'||tab==='review')&&canFinance('reports','view')))?api('?resource=journals').catch(()=>({items:{}})):Promise.resolve({items:{}})
   ]);
   setMaster(previous=>Object.assign({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},financingParties:{},securityDepositParties:{},employeeAdvances:{},employeeCustodies:{},settings:{},inventory:{balances:{},movements:{}}},previous,b,{inventory:Object.assign({},previous.inventory||{},{balances:previous.inventory&&previous.inventory.balances||{},movements:previous.inventory&&previous.inventory.movements||{}})}));
   const partyRows=rows(b.parties||{});
   setClients(partyRows.filter(item=>item.partyType==='customer'));
   setVendors(partyRows.filter(item=>item.partyType==='vendor'));
   const configuredStartMonth=b.settings&&b.settings.accountingStartMonth||'';
   setAccountingStartMonth(configuredStartMonth);
   setOpeningBalanceDate(previous=>previous||openingBalanceDefaultDate(configuredStartMonth));
   if(!initialOnly){
    setReview(rows(r.items).filter(item=>['pending_review','duplicate_review'].includes(item.status)).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
    setDocuments(rows(d.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
    setJournalRecords(rows(j.items).sort((a,b)=>n(b.postedAt||b.createdAt)-n(a.postedAt||a.createdAt)));
   }
   if((tab==='inventory'||tab==='inventoryMovements'||(tab==='reports'&&report==='balance'))&&canFinance('inventory','view'))await loadInventoryMovements();
   return true;
  }catch(e){if(!silent)setError(e.message||String(e));return false;}
  finally{if(!keepBusy)setBusy(false);}
 };
  const loadLegacyImportDocuments=async()=>{
  const request=++legacyImportDocumentsRequestRef.current;
  setLegacyImportDocumentsLoading(true);
  setLegacyImportDocumentsLoaded(false);
  try{
   const result=await api('?resource=documents');
   if(request!==legacyImportDocumentsRequestRef.current)return null;
   const list=rows(result.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt));
   setDocuments(list);
   setLegacyImportDocumentsLoaded(true);
   return list;
  }catch(error){
   if(request===legacyImportDocumentsRequestRef.current){
    setLegacyImportDocumentsLoaded(false);
    setError(error.message||String(error));
   }
   return null;
  }finally{
   if(request===legacyImportDocumentsRequestRef.current)setLegacyImportDocumentsLoading(false);
  }
 };
 React.useEffect(()=>{
  if(tab!=='legacyImport'||!currentUser||currentUser.role!=='admin')return;
  let active=true;
  const sync=()=>{if(active&&(!document||document.visibilityState!=='hidden'))void loadLegacyImportDocuments();};
  void loadLegacyImportDocuments();
  const onVisibility=()=>{if(document.visibilityState==='visible')sync();};
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   active=false;
   legacyImportDocumentsRequestRef.current+=1;
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[tab,currentUser&&currentUser.uid]);
 const loadInventoryMovements=async()=>{
  try{
   const result=await api('?resource=inventory');
   const inventory=result&&result.items&&typeof result.items==='object'?result.items:{};
   setMaster(previous=>Object.assign({},previous,{inventory:Object.assign({},previous.inventory||{},{...inventory,balances:inventory.balances||previous.inventory&&previous.inventory.balances||{},movements:inventory.movements||{}})}));
   const source=inventory.movements||{};
   const list=Object.entries(source).filter(([,movement])=>movement&&typeof movement==='object').map(([key,movement])=>Object.assign({id:movement.id||key},movement));
   list.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||n(b.createdAt)-n(a.createdAt));
   setInventoryMovements(list);
  }catch(error){setError(error.message||String(error));}
 };
 React.useEffect(()=>{if((tab==='inventory'||tab==='inventoryMovements'||(tab==='reports'&&report==='balance'))&&canFinance('inventory','view'))void loadInventoryMovements();},[tab,report,currentUser&&currentUser.uid]);
 const refreshReviewQueue=async(silent)=>{
  try{
   const result=await api('?resource=review');
   const list=rows(result.items).filter(item=>['pending_review','duplicate_review'].includes(item.status)).sort((a,b)=>n(b.createdAt)-n(a.createdAt));
   setReview(list);
   return list;
  }catch(error){if(!silent)setError(error.message||String(error));return null;}
 };
 const runIntegrityAudit=async()=>{
  if(!canFinance("journal","view")){setError("يلزم صلاحية عرض القيود لتشغيل الفحص الشامل.");return;}
  setIntegrityAuditBusy(true);setError("");setNotice("");
  try{
   const periodQuery="?resource=periods&from="+encodeURIComponent(period.from)+"&to="+encodeURIComponent(period.to);
   const [journalResult,documentResult,periodResult,decisionResult]=await Promise.all([
    api("?resource=journals"),
    api("?resource=documents"),
    api(periodQuery).catch(()=>null),
    canFinance('reports','view')?api("?resource=accountReviewFindingDecisions").catch(()=>({items:{}})):Promise.resolve({items:{}})
   ]);
   const posted=rows(journalResult.items).filter(item=>item&&item.status==="posted");
   const refreshedDocuments=rows(documentResult.items);
   const collectPostedPeriodEntries=source=>Object.values(source||{}).flatMap(monthEntries=>Object.values(monthEntries||{})).filter(item=>item&&item.status==="posted");
   const auditPeriodJournals=periodResult?collectPostedPeriodEntries(periodResult.entries):periodJournals;
   const auditBalanceJournals=periodResult?collectPostedPeriodEntries(periodResult.balanceEntries||periodResult.entries):balanceJournals;
   const auditBalanceFlat=flattenJournals(auditBalanceJournals);
   if(periodResult){setPeriodJournals(auditPeriodJournals);setBalanceJournals(auditBalanceJournals);}
   setJournalRecords(posted.slice().sort((a,b)=>n(b.postedAt||b.createdAt)-n(a.postedAt||a.createdAt)));
   setDocuments(refreshedDocuments);
   const journalMap=new Map();
   [...posted,...refreshedDocuments.filter(item=>item&&item.type==="journal"),...review.filter(item=>item&&item.type==="journal")].forEach(item=>{if(item&&item.id)journalMap.set(String(item.id),item);});
   const sourceMap=new Map(refreshedDocuments.map(item=>[String(item.id),item]));
   const accountMap=new Map(accounts.map(item=>[String(item.code),item]));
   const financierMap=new Map(registeredFinancingParties.filter(item=>item&&item.active!==false).map(item=>[String(item.code||item.id),item]));
   const vendorMap=new Map(allVendors.map(item=>[String(item.code||item.id),item]));
   const customerMap=new Map(allClients.map(item=>[String(item.code||item.id),item]));
   const taxCodes=rows(master.taxCodes),centersMap=new Map(centers.map(item=>[String(item.code),item]));
   const findings=[];
   const pushFinding=(severity,category,reason,details={})=>{
    const suggestedChanges=[];
    if(details.lineNo&&details.expectedAccountCode&&String(details.accountCode||"")!==String(details.expectedAccountCode)){
     suggestedChanges.push({lineNo:Number(details.lineNo),key:"accountCode",value:String(details.expectedAccountCode),currentValue:String(details.accountCode||"")});
    }
    if(details.lineNo&&details.expectedPartyId&&details.expectedPartyType){
     suggestedChanges.push({lineNo:Number(details.lineNo),key:"party",value:String(details.expectedPartyId),partyType:String(details.expectedPartyType),currentValue:String(details.partyId||"")});
    }
    const recommendation=suggestedChanges.length?{
     changes:suggestedChanges,
     summary:suggestedChanges.map(change=>change.key==="accountCode"?"تغيير حساب السطر "+change.lineNo+" من "+(change.currentValue||"بدون حساب")+" إلى "+change.value:"ربط الطرف التحليلي في السطر "+change.lineNo+" بالكود "+change.value+" ("+analyticPartyLabel(change.partyType)+")").join("؛ ")
    }:
    category==="جهة تمويل غير مسجلة"&&details.statedFinancierName?{
     changes:[],
     createFinancierName:String(details.statedFinancierName),
     summary:"إضافة جهة تمويل مستقلة باسم «"+String(details.statedFinancierName)+"» إلى دليل جهات التمويل ثم اختيارها على حساب 2150. لا يتم استخدام مورد بديل."
    }:
    category==="تصنيف الحساب الرئيسي"&&details.expectedAccountType?{
     changes:[],
     accountMaster:{code:String(details.accountCode||''),type:String(details.expectedAccountType),nature:String(details.expectedAccountNature||''),subledgerType:String(details.expectedSubledgerType||''),isGroup:false,active:true},
     summary:"تعديل إعدادات الحساب "+String(details.accountCode||'')+" في دليل الحسابات لتتوافق مع طبيعته: النوع "+String(details.expectedAccountType)+"، الطبيعة "+String(details.expectedAccountNature||'غير محددة')+(details.expectedSubledgerType?"، الأستاذ المساعد "+analyticPartyLabel(details.expectedSubledgerType):"")+"."
    }:{
     changes:[],
     summary:"يلزم فحص مستند المصدر أو دليل الحسابات قبل تحديد التعديل؛ لم تتوافر بيانات كافية لاقتراح تغيير آلي آمن."
    };
    findings.push({id:[severity,category,details.journalId||"",details.lineNo||"",details.accountCode||"",findings.length].join("|"),severity,category,reason,recommendation,...details});
   };
   const requiredTypeForAccount=(account,line)=>account&&(account.subledgerType||({"1210":"customer","1240":"vendor","1220":"employeeCustody","1230":"employeeAdvance","2130":"customer","281":"vendor","2150":"financingParty","3201":"partnerCurrentAccount","3202":"partnerCurrentAccount"}[String(account.code)]))||"";
   for(const journal of journalMap.values()){
    if(!journal||!Array.isArray(journal.lines))continue;
    const isPosted=journal.status==="posted",lines=journal.lines;
    if(lines.length<2)pushFinding("error","سلامة القيد","القيد يحتوي على أقل من سطرين.",{journalId:journal.id,journalNumber:journal.number,status:journal.status});
    let debit=0,credit=0;
    lines.forEach((line,index)=>{
     const lineNo=index+1,code=String(line.accountCode||""),account=accountMap.get(code),d=Number(line.debit||0),c=Number(line.credit||0);
     debit+=Number.isFinite(d)?d:0;credit+=Number.isFinite(c)?c:0;
     const base={journalId:journal.id,journalNumber:journal.number,status:journal.status,lineNo,accountCode:code,amount:Number.isFinite(d)&&Number.isFinite(c)?Math.max(Math.abs(d),Math.abs(c)):0};
     if(!account)pushFinding("error","توجيه الحساب","السطر "+lineNo+" موجه إلى كود حساب غير موجود في دليل الحسابات: "+(code||"بدون كود")+".",base);
     else if(account.active===false||account.isGroup)pushFinding("error","قابلية الترحيل","السطر "+lineNo+" يستخدم حسابًا "+(account.active===false?"موقوفًا":"تجميعيًا لا يقبل الترحيل")+".",base);
     if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0||((d>0)===(c>0)))pushFinding("error","صحة سطر القيد","السطر "+lineNo+" يجب أن يحتوي مبلغًا صالحًا في جانب واحد فقط (مدين أو دائن) دون قيم سالبة.",base);
     if(line.costCenterId&&!centersMap.has(String(line.costCenterId)))pushFinding("error","مركز التكلفة","مركز التكلفة "+line.costCenterId+" غير موجود بدليل مراكز التكلفة.",base);
     const requiredType=requiredTypeForAccount(account,line);
     if(requiredType){
      if(!line.partyId)pushFinding("error","الطرف التحليلي","الحساب "+code+" يتطلب طرفًا تحليليًا من نوع "+analyticPartyLabel(requiredType)+" ولم يتم اختياره.",{...base,expectedPartyType:requiredType});
      else if(line.partyType&&String(line.partyType)!==requiredType)pushFinding("error","نوع الطرف التحليلي","الحساب "+code+" يتطلب "+analyticPartyLabel(requiredType)+" بينما القيد مخزن على نوع "+analyticPartyLabel(String(line.partyType))+".",{...base,partyId:String(line.partyId),expectedPartyType:requiredType,actualPartyType:String(line.partyType)});
      if(requiredType==="financingParty"){
       const statedFinancierName=extractFinancingPartyName([line.description,journal.description,journal.reference].join(" "));
       const matchedFinancier=statedFinancierName?matchFinancingPartyFromText(statedFinancierName):null;
       if(line.partyId&&!financierMap.has(String(line.partyId))){
        const isVendor=vendorMap.has(String(line.partyId));
        pushFinding("error","جهة التمويل",isVendor?"تم ربط حساب التمويل 2150 بمورد ("+partyName(vendorMap.get(String(line.partyId)))+")، والمورد ليس جهة تمويل. أنشئ جهة تمويل مستقلة ثم أعد ربط القيد.":"جهة التمويل "+line.partyId+" غير مسجلة في دليل جهات التمويل المستقل.",{...base,partyId:String(line.partyId),expectedPartyType:"financingParty"});
       }
       if(statedFinancierName&&!matchedFinancier){
        pushFinding("error","جهة تمويل غير مسجلة","بيان القيد يذكر الممول («"+statedFinancierName+"») لكنه غير موجود في دليل جهات التمويل؛ أضف الممول إلى الدليل المستقل ثم اربط القيد به.",{...base,partyId:String(line.partyId||""),statedFinancierName,expectedPartyType:"financingParty"});
       }else if(statedFinancierName&&matchedFinancier&&!line.partyId){
        pushFinding("error","غياب الطرف التحليلي للممول","الممول المذكور في البيان («"+statedFinancierName+"») موجود في دليل جهات التمويل بالكود "+String(matchedFinancier.code||matchedFinancier.id)+"، لكن سطر 2150 لا يحمل هذا الطرف التحليلي.",{...base,statedFinancierName,expectedPartyId:String(matchedFinancier.code||matchedFinancier.id),expectedPartyType:"financingParty"});
       }else if(statedFinancierName&&matchedFinancier&&String(matchedFinancier.code||matchedFinancier.id)!==String(line.partyId||"")){
        pushFinding("error","اختلاف الممول مع البيان","بيان القيد يذكر الممول («"+statedFinancierName+"») وكوده "+String(matchedFinancier.code||matchedFinancier.id)+"، بينما حساب 2150 مربوط بالممول الآخر ذي الكود "+String(line.partyId||"بدون كود")+"؛ صحح الطرف التحليلي ليتطابق مع البيان.",{...base,partyId:String(line.partyId||""),statedFinancierName,expectedPartyId:String(matchedFinancier.code||matchedFinancier.id),expectedPartyType:"financingParty"});
       }
      }
      if(line.partyId&&requiredType==="vendor"&&!vendorMap.has(String(line.partyId)))pushFinding("error","تحليل المورد","كود الطرف "+line.partyId+" غير موجود في دليل الموردين.",{...base,partyId:String(line.partyId),expectedPartyType:"vendor"});
      if(line.partyId&&requiredType==="customer"&&!customerMap.has(String(line.partyId)))pushFinding("error","تحليل العميل","كود الطرف "+line.partyId+" غير موجود في دليل العملاء.",{...base,partyId:String(line.partyId),expectedPartyType:"customer"});
     }
     if(line.taxCode){
      const taxCode=taxCodes.find(item=>String(item.code)===String(line.taxCode));
      if(!taxCode)pushFinding("warning","كود الضريبة","السطر مرتبط بكود ضريبي غير موجود: "+line.taxCode+".",{...base,taxCode:String(line.taxCode)});
      else{
       const expectedAccount=taxCode.taxType==="vat_input"?"1410":taxCode.taxType==="vat_output"?"2110":["withholding","addition"].includes(taxCode.taxType)?"2120":"";
       if(expectedAccount&&code!==expectedAccount)pushFinding("error","توجيه الضريبة","الكود الضريبي "+taxCode.code+" نوعه "+taxCode.taxType+" ويجب أن يوجّه إلى الحساب "+expectedAccount+" وليس "+code+".",{...base,taxCode:taxCode.code,expectedAccountCode:expectedAccount});
       const configured=String(taxCode.accountCode||taxCode.glAccountCode||taxCode.accountingAccountCode||"");
       if(configured&&expectedAccount&&configured!==expectedAccount)pushFinding("error","إعدادات الأكواد الضريبية","الكود "+taxCode.code+" مربوط في الإعدادات بالحساب "+configured+" بينما الحساب المعتمد لهذا النوع هو "+expectedAccount+".",{...base,taxCode:taxCode.code,expectedAccountCode:expectedAccount,actualAccountCode:configured});
      }
     }
     const taxType=String(line.taxType||"");
     const expectedTaxAccount=taxType==="vat_input"?"1410":taxType==="vat_output"?"2110":["withholding","addition","withholding_addition"].includes(taxType)?"2120":"";
     if(expectedTaxAccount&&code!==expectedTaxAccount)pushFinding("error","توجيه الضريبة","نوع الضريبة "+taxType+" موجه إلى الحساب "+code+" بدلًا من الحساب الصحيح "+expectedTaxAccount+".",{...base,expectedAccountCode:expectedTaxAccount});
    });
    const difference=debit-credit;
    if(Math.abs(Math.round(difference*100))>0)pushFinding("error","عدم اتزان القيد","إجمالي المدين "+debit.toFixed(4)+" مقابل إجمالي الدائن "+credit.toFixed(4)+"، والفرق "+difference.toFixed(4)+" جنيه.",{journalId:journal.id,journalNumber:journal.number,status:journal.status,difference,amount:Math.abs(difference)});
    const source=sourceMap.get(String(journal.sourceId||""));
    if(source&&source.type==="invoice"){
     const purchase=source.invoiceType==="purchase",controlCode=purchase?"281":"1210",controlType=purchase?"vendor":"customer";
     const controlLine=lines.find(line=>String(line.accountCode)===controlCode);
     if(!controlLine)pushFinding("error","منطق ترحيل الفاتورة","فاتورة "+(purchase?"المشتريات":"المبيعات")+" مرتبطة بالقيد "+(journal.number||journal.id)+" دون توجيه حساب "+controlCode+" للطرف "+(source.partyName||source.partyId||"المسجل في الفاتورة")+".",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:controlCode});
     else if(source.partyId&&String(controlLine.partyId||"")!==String(source.partyId))pushFinding("error","ربط مستند بالطرف","كود الطرف في الفاتورة ("+source.partyId+") لا يطابق كود الطرف في حساب "+controlCode+" بالقيد ("+(controlLine.partyId||"فارغ")+").",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:controlCode,partyId:String(controlLine.partyId||"")});
     const taxAmount=Number(source.totals&&source.totals.vat!=null?source.totals.vat:source.taxAmount||0);
     const taxCode=purchase?"1410":"2110",vatSide=purchase?"debit":"credit";
     const actualVatAmount=lines.filter(line=>String(line.accountCode)===taxCode).reduce((sum,line)=>sum+Number(line[vatSide]||0),0);
     if(Math.abs(Math.round((actualVatAmount-taxAmount)*100))>0)pushFinding("error","مطابقة قيمة ضريبة الفاتورة","ضريبة الفاتورة المصدر "+taxAmount.toFixed(2)+" جنيه، بينما الحركة على الحساب "+taxCode+" في القيد "+actualVatAmount.toFixed(2)+" جنيه؛ الفرق "+(actualVatAmount-taxAmount).toFixed(2)+" جنيه.",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:taxCode,amount:Math.abs(actualVatAmount-taxAmount)});
     const expectedWithholding=(Array.isArray(source.otherTaxes)?source.otherTaxes:[]).filter(tax=>String(tax.accountCode||"")==="2120").reduce((sum,tax)=>{
      const fixed=tax.amount!==""&&tax.amount!==null&&tax.amount!==undefined;
      return sum+(fixed?Number(tax.amount||0):Number(source.totals&&source.totals.net||source.total||0)*Number(tax.rate||0)/100);
     },0);
     const withholdingSide=purchase?"debit":"credit";
     const withholdingLines=lines.filter(line=>String(line.accountCode)==="2120");
     const actualWithholding=withholdingLines.reduce((sum,line)=>sum+Number(line[withholdingSide]||0),0);
     if(expectedWithholding>0.005&&Math.abs(Math.round((actualWithholding-expectedWithholding)*100))>0)pushFinding("error","مطابقة ضريبة الخصم والإضافة","المستند يحدد ضريبة/خصمًا على حساب 2120 بقيمة "+expectedWithholding.toFixed(2)+" جنيه، بينما القيد سجل "+actualWithholding.toFixed(2)+" جنيه؛ الفرق "+(actualWithholding-expectedWithholding).toFixed(2)+" جنيه.",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:"2120",amount:Math.abs(actualWithholding-expectedWithholding)});
     withholdingLines.forEach((line,index)=>{
      if(!expectedWithholding&&!line.taxCode&&!line.taxType)return;
      const expectedType=controlType,expectedId=String(source.partyId||"");
      if(!line.partyId||String(line.partyId)!==expectedId||String(line.partyType||"")!==expectedType)pushFinding("error","اختلاف طرف ضريبة الخصم","سطر ضريبة الخصم/الإضافة على 2120 يجب أن يحمل نفس "+(purchase?"المورد":"العميل")+" الموجود بالفاتورة ("+expectedType+" / "+expectedId+")، بينما السطر يحمل ("+String(line.partyType||"بدون نوع") +" / "+String(line.partyId||"بدون كود")+").",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,lineNo:lines.indexOf(line)+1,accountCode:"2120",partyId:String(line.partyId||""),expectedPartyType:expectedType});
     });
    }
    if(source&&source.type==="cash"){
     const movement=String(source.movementType||"");
     if(movement==="supplier_payment"&&!lines.some(line=>String(line.accountCode)==="281"&&String(line.partyId||"")===String(source.partyId||"")))pushFinding("error","توجيه سداد المورد","سند سداد المورد لا يحتوي على حساب المورد 281 مرتبطًا بنفس كود المورد في السند.",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:"281",partyId:String(source.partyId||"")});
     if(movement==="customer_receipt"&&!lines.some(line=>String(line.accountCode)==="1210"&&String(line.partyId||"")===String(source.partyId||"")))pushFinding("error","توجيه تحصيل العميل","سند تحصيل العميل لا يحتوي على حساب العملاء 1210 مرتبطًا بنفس كود العميل في السند.",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:"1210",partyId:String(source.partyId||"")});
     if(movement==="tax_payment"){
      const taxAccount=String(source.taxAccountCode||"2110"),taxDebit=lines.filter(line=>String(line.accountCode)===taxAccount).reduce((sum,line)=>sum+Number(line.debit||0),0);
      const cashCredit=lines.filter(line=>String(line.accountCode)===String(source.cashAccountCode||"1110")).reduce((sum,line)=>sum+Number(line.credit||0),0);
      if(!lines.some(line=>String(line.accountCode)===taxAccount))pushFinding("error","سداد الضريبة","سند السداد لا يتضمن حساب الالتزام الضريبي المحدد ("+taxAccount+").",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:taxAccount});
      if(Math.abs(Math.round((taxDebit-Number(source.amount||0))*100))>0||Math.abs(Math.round((cashCredit-Number(source.amount||0))*100))>0)pushFinding("error","مطابقة مبلغ السداد الضريبي","قيمة سند السداد "+Number(source.amount||0).toFixed(2)+" جنيه، بينما المدين على "+taxAccount+" = "+taxDebit.toFixed(2)+" والدائن على حساب الخزينة/البنك = "+cashCredit.toFixed(2)+".",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:taxAccount,amount:Math.max(Math.abs(taxDebit-Number(source.amount||0)),Math.abs(cashCredit-Number(source.amount||0)))});
     }
     if(movement==="vat_refund"){
      const vatCredit=lines.filter(line=>String(line.accountCode)==="1410").reduce((sum,line)=>sum+Number(line.credit||0),0),cashDebit=lines.filter(line=>String(line.accountCode)===String(source.cashAccountCode||"1110")).reduce((sum,line)=>sum+Number(line.debit||0),0);
      if(Math.abs(Math.round((vatCredit-Number(source.amount||0))*100))>0||Math.abs(Math.round((cashDebit-Number(source.amount||0))*100))>0)pushFinding("error","مطابقة استرداد القيمة المضافة","قيمة الاسترداد "+Number(source.amount||0).toFixed(2)+" جنيه، بينما تخفيض حساب 1410 = "+vatCredit.toFixed(2)+" والمدين على الخزينة/البنك = "+cashDebit.toFixed(2)+".",{journalId:journal.id,journalNumber:journal.number,documentId:source.id,accountCode:"1410",amount:Math.max(Math.abs(vatCredit-Number(source.amount||0)),Math.abs(cashDebit-Number(source.amount||0)))});
     }
    }
    const controlParties=Array.from(new Map(lines.filter(line=>["vendor","customer"].includes(String(line.partyType||""))&&line.partyId).map(line=>[String(line.partyType)+"|"+String(line.partyId),{type:String(line.partyType),id:String(line.partyId)}])).values());
    const expectedWithholdingParty=source&&source.type==="invoice"&&source.partyId
     ?{type:source.invoiceType==="purchase"?"vendor":"customer",id:String(source.partyId)}
     :controlParties.length===1?controlParties[0]:null;
    lines.forEach((line,index)=>{
     if(String(line.accountCode)!=="2120")return;
     const taxCode=taxCodes.find(item=>String(item.code)===String(line.taxCode));
     const isWithholding=String(line.taxType||"")==="withholding"||String(line.taxType||"")==="addition"||Boolean(taxCode&&["withholding","addition"].includes(String(taxCode.taxType)))||/خصم|استقطاع|اضافة|إضافة|withhold|addition/i.test(String(line.description||""));
     if(!isWithholding)return;
     const details={journalId:journal.id,journalNumber:journal.number,status:journal.status,lineNo:index+1,accountCode:"2120",partyId:String(line.partyId||"")};
     if(!line.partyId||!["vendor","customer"].includes(String(line.partyType||"")))pushFinding("error","تحليل ضريبة الخصم والإضافة","سطر الخصم/الإضافة على 2120 لا يحمل موردًا أو عميلًا تحليليًا؛ يجب ربطه بالطرف الذي نشأت عنه الضريبة.",details);
     else{
      const withholdingPartyType=String(line.partyType||"");
      const counterpartAccountCode=withholdingPartyType==="vendor"?"281":withholdingPartyType==="customer"?"1210":"";
      const counterpartPartyIds=new Set(lines.filter(candidate=>counterpartAccountCode&&String(candidate.accountCode)===counterpartAccountCode&&String(candidate.partyType||"")===withholdingPartyType&&String(candidate.partyId||"").trim()).map(candidate=>String(candidate.partyId)));
      const inferredCounterpart=counterpartPartyIds.size===1?{type:withholdingPartyType,id:Array.from(counterpartPartyIds)[0]}:null;
      const expectedPartyForLine=expectedWithholdingParty||inferredCounterpart||(counterpartPartyIds.size===0&&controlParties.length===1?controlParties[0]:null);
      if(expectedPartyForLine&&(withholdingPartyType!==expectedPartyForLine.type||String(line.partyId)!==expectedPartyForLine.id)){
       const expectedAccount=withholdingPartyType==="vendor"?"حساب المورد 281":withholdingPartyType==="customer"?"حساب العميل 1210":"الحساب الرقابي";
       pushFinding("error","اختلاف طرف ضريبة الخصم","سطر ضريبة الخصم/الإضافة على 2120 يجب أن يرتبط بنفس الطرف الموجود في "+expectedAccount+" ("+expectedPartyForLine.type+" / "+expectedPartyForLine.id+")، بينما سطر الضريبة مرتبط بـ ("+withholdingPartyType+" / "+String(line.partyId)+").",{...details,expectedPartyType:expectedPartyForLine.type,expectedPartyId:expectedPartyForLine.id,expectedAccountCode:counterpartAccountCode||undefined});
      }else if(counterpartPartyIds.size>1&&!counterpartPartyIds.has(String(line.partyId))){
       pushFinding("error","اختلاف طرف ضريبة الخصم","كود الطرف في سطر 2120 ("+withholdingPartyType+" / "+line.partyId+") غير موجود ضمن أطراف الحساب المقابل "+counterpartAccountCode+" في نفس القيد ("+Array.from(counterpartPartyIds).join("، ")+").",{...details,expectedAccountCode:counterpartAccountCode,expectedPartyIds:Array.from(counterpartPartyIds)});
      }else if(counterpartPartyIds.size>1){
       pushFinding("warning","تعدد أطراف القيد الضريبي","سطر 2120 يطابق أحد أطراف الحساب المقابل "+counterpartAccountCode+"، لكن القيد يحتوي أكثر من طرف تحليلي؛ راجع توزيع ضريبة الخصم على كل مورد/عميل.",{...details,expectedAccountCode:counterpartAccountCode,expectedPartyIds:Array.from(counterpartPartyIds)});
      }else if(!expectedPartyForLine){
       pushFinding("warning","تعذر تحديد طرف ضريبة الخصم","يوجد سطر على 2120 لكن لا يوجد حساب مورد 281 أو عميل 1210 بطرف تحليلي واضح لمقارنة كود الطرف به.",details);
      }
     }

    });
    if(!isPosted&&journal.status==="needs_correction")pushFinding("warning","قيد يحتاج تصحيحًا","هذا القيد أعيد للتصحيح ولم يُعتمد بعد.",{journalId:journal.id,journalNumber:journal.number,status:journal.status});
   }
   // Reconcile the period ledger index against the canonical posted journals to the same cut-off.
   const ledgerDates=auditBalanceFlat.map(line=>String(line.date||"")).filter(Boolean).sort();
   const earliestCanonicalDate=posted.map(journal=>String(journal.date||"")).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort()[0]||"";
   const lowerBound=accountingStartMonth?accountingStartMonth+"-01":earliestCanonicalDate||ledgerDates[0]||"0000-00-00";
   const upperBound=(period.to||today().slice(0,7))+"-31";
   const canonicalScopeJournals=posted.filter(journal=>String(journal.date||"")>=lowerBound&&String(journal.date||"")<=upperBound);
   const canonicalScopeLines=canonicalScopeJournals.flatMap(journal=>(journal.lines||[]).filter(line=>String(line.accountCode||"")));
   const indexedScopeLines=auditBalanceFlat.filter(line=>String(line.date||"")>=lowerBound&&String(line.date||"")<=upperBound);
   if(canonicalScopeLines.length&&!indexedScopeLines.length){
    const missingIndexAmount=canonicalScopeLines.reduce((sum,line)=>sum+Math.max(Number(line.debit||0),Number(line.credit||0)),0);
    const firstMissing=canonicalScopeJournals[0];
    pushFinding("error","غياب فهرس دفتر الأستاذ","يوجد "+canonicalScopeJournals.length+" قيدًا مرحّلًا يحتوي على "+canonicalScopeLines.length+" سطرًا محاسبيًا ضمن الفترة، لكن فهرس الأستاذ العام لا يحتوي على أي حركة. يرجى مراجعة عملية الترحيل وإعادة بناء فهرس الأستاذ قبل الاعتماد على الأرصدة والتقارير.",{journalId:firstMissing&&firstMissing.id,journalNumber:firstMissing&&firstMissing.number,amount:missingIndexAmount});
   }else if(indexedScopeLines.length&&!ledgerDates.length){
    pushFinding("error","تاريخ فهرس دفتر الأستاذ","توجد حركات في فهرس الأستاذ لكن تواريخها غير صالحة أو غير متاحة؛ تعذرت مطابقتها مع القيود ضمن الفترة المحددة.",{amount:indexedScopeLines.reduce((sum,line)=>sum+Math.max(Number(line.debit||0),Number(line.credit||0)),0)});
   }
   if(ledgerDates.length){
    const canonicalTotals={},derivedTotals={};
    canonicalScopeJournals.forEach(journal=>(journal.lines||[]).forEach(line=>{const code=String(line.accountCode||""),sum=canonicalTotals[code]||(canonicalTotals[code]={debit:0,credit:0});sum.debit+=Number(line.debit||0);sum.credit+=Number(line.credit||0);}));
    indexedScopeLines.forEach(line=>{const code=String(line.accountCode||""),sum=derivedTotals[code]||(derivedTotals[code]={debit:0,credit:0});sum.debit+=Number(line.debit||0);sum.credit+=Number(line.credit||0);});
    const accountCodes=new Set([...Object.keys(canonicalTotals),...Object.keys(derivedTotals)]);
    accountCodes.forEach(code=>{
     const a=canonicalTotals[code]||{debit:0,credit:0},b=derivedTotals[code]||{debit:0,credit:0},debitDiff=a.debit-b.debit,creditDiff=a.credit-b.credit;
     if(Math.abs(Math.round(debitDiff*100))>0||Math.abs(Math.round(creditDiff*100))>0)pushFinding("error","مطابقة دفتر الأستاذ","حساب "+code+" به فرق بين القيود المرحّلة وفهرس أرصدة الأستاذ: فرق المدين "+debitDiff.toFixed(4)+" وفرق الدائن "+creditDiff.toFixed(4)+" جنيه.",{accountCode:code,debitDifference:debitDiff,creditDifference:creditDiff,amount:Math.max(Math.abs(debitDiff),Math.abs(creditDiff))});
    });
   }
const ledgerDebit=auditBalanceFlat.reduce((sum,line)=>sum+Number(line.debit||0),0),ledgerCredit=auditBalanceFlat.reduce((sum,line)=>sum+Number(line.credit||0),0),ledgerDifference=ledgerDebit-ledgerCredit;
   if(Math.abs(Math.round(ledgerDifference*100))>0)pushFinding("error","اتزان ميزان المراجعة","إجمالي المدين "+ledgerDebit.toFixed(4)+" مقابل الدائن "+ledgerCredit.toFixed(4)+"، والفرق "+ledgerDifference.toFixed(4)+" جنيه.",{difference:ledgerDifference,amount:Math.abs(ledgerDifference)});
   const accountRules=[
    {code:"1410",type:"asset",nature:"debit",label:"ضريبة القيمة المضافة - مدخلات"},
    {code:"2110",type:"liability",nature:"credit",label:"ضريبة القيمة المضافة - مخرجات"},
    {code:"2120",type:"liability",nature:"credit",label:"ضرائب الخصم والإضافة المستحقة"},
    {code:"2150",type:"liability",nature:"credit",subledgerType:"financingParty",label:"تمويل وقروض من الشركاء والغير"},
    {code:"281",type:"liability",nature:"credit",subledgerType:"vendor",label:"الموردون"},
    {code:"1210",type:"asset",nature:"debit",subledgerType:"customer",label:"العملاء"}
   ];
   accountRules.forEach(rule=>{
    const account=accountMap.get(rule.code);
    if(!account){pushFinding("error","إعداد دليل الحسابات","الحساب الرئيسي "+rule.code+" — "+rule.label+" غير موجود بدليل الحسابات.",{accountCode:rule.code});return;}
    const issues=[];
    if(String(account.type||"")!==rule.type)issues.push("نوع الحساب "+String(account.type||"غير محدد")+" بدلًا من "+rule.type);
    if(String(account.nature||"")!==rule.nature)issues.push("طبيعة الحساب "+String(account.nature||"غير محددة")+" بدلًا من "+rule.nature);
    if(rule.subledgerType&&String(account.subledgerType||"")!==rule.subledgerType)issues.push("نوع الأستاذ المساعد "+String(account.subledgerType||"غير محدد")+" بدلًا من "+rule.subledgerType);
    if(account.isGroup)issues.push("الحساب تجميعي ولا يقبل الترحيل المباشر");
    if(account.active===false)issues.push("الحساب موقوف");
    if(issues.length)pushFinding("error","تصنيف الحساب الرئيسي","الحساب "+rule.code+" — "+rule.label+": "+issues.join("؛ ")+".",{accountCode:rule.code,expectedAccountType:rule.type,expectedAccountNature:rule.nature,expectedSubledgerType:rule.subledgerType||"",expectedIsGroup:false,expectedActive:true});
   });
   accounts.filter(account=>account.subledgerType&&!account.isGroup).forEach(account=>{
    const code=String(account.code),glLines=auditBalanceFlat.filter(line=>String(line.accountCode)===code);
    const subLines=glLines.filter(line=>String(line.partyType||"")===String(account.subledgerType)&&String(line.partyId||""));
    const glDebit=glLines.reduce((sum,line)=>sum+Number(line.debit||0),0),glCredit=glLines.reduce((sum,line)=>sum+Number(line.credit||0),0);
    const subDebit=subLines.reduce((sum,line)=>sum+Number(line.debit||0),0),subCredit=subLines.reduce((sum,line)=>sum+Number(line.credit||0),0);
    const debitDifference=Math.round((glDebit-subDebit)*100)/100,creditDifference=Math.round((glCredit-subCredit)*100)/100;
    if(Math.abs(debitDifference)>=0.01||Math.abs(creditDifference)>=0.01)pushFinding("error","مطابقة الأستاذ العام مع الأستاذ المساعد","الحساب "+code+" — "+account.name+": فرق المدين "+debitDifference.toFixed(2)+" جنيه وفرق الدائن "+creditDifference.toFixed(2)+" جنيه. السبب المحتمل: سطر بلا طرف تحليلي أو طرف بنوع/كود غير صحيح.",{accountCode:code,debitDifference,creditDifference,amount:Math.max(Math.abs(debitDifference),Math.abs(creditDifference))});
   });
   const savedAuditDecisions=new Map(rows(decisionResult&&decisionResult.items).map(item=>[String(item.findingId||''),item]));
   const uniqueFindings=Array.from(new Map(findings.map(item=>[item.id,item])).values()).map(finding=>{
    const saved=savedAuditDecisions.get(auditDecisionKey(finding));
    return saved?Object.assign({},finding,{reviewDecision:saved.status,reviewDecisionNote:saved.notes||''}):finding;
   });
   setIntegrityAudit({createdAt:Date.now(),period:{...period},journalCount:journalMap.size,postedCount:posted.length,findings:uniqueFindings,errors:uniqueFindings.filter(item=>item.severity==="error").length,warnings:uniqueFindings.filter(item=>item.severity==="warning").length});
   setNotice("اكتمل الفحص الذكي: "+uniqueFindings.length+" ملاحظة، منها "+uniqueFindings.filter(item=>item.severity==="error").length+" أخطاء و"+uniqueFindings.filter(item=>item.severity==="warning").length+" تنبيهات.");
  }catch(error){setError(error.message||String(error));}
  finally{setIntegrityAuditBusy(false);}
 };
 const runUnifiedReview=async()=>{
  setError('');setNotice('');
  try{
   await refresh();
   if(canFinance('reports','view'))await loadPeriod();
   await runIntegrityAudit();
  }catch(error){setError(error.message||String(error));}
 };
 const openReviewItem=async item=>{
  setSelected(documents.find(doc=>doc.id===item.id)||item);
  setOffset(item.offsetAccountCode||'6100');
  try{
   const result=await api('?resource=document&id='+encodeURIComponent(item.id));
   if(result.item){
    const detailed=Object.assign({},result.item,result.sourceDetails?{sourceDetails:result.sourceDetails}:{});
    setSelected(detailed);
    setDocuments(old=>{
     const index=old.findIndex(doc=>doc.id===result.item.id);
     if(index<0)return [...old,detailed];
     const next=old.slice();next[index]=detailed;return next;
    });
   }
  }catch(error){setError(error.message||String(error));}
 };
 const auditDecisionKey=finding=>{
  let hash=2166136261;
  for(const character of String(finding&&finding.id||'')){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return 'AUD_'+(hash>>>0).toString(36);
 };
 const saveIntegrityFindingKeepDecision=async finding=>{
  if(!finding||!canFinance('reports','edit')){setError('ليس لديك صلاحية تسجيل قرار المراجع.');return;}
  setBusy(true);setError('');
  const journal=[...journalRecords,...documents].find(item=>String(item.id)===String(finding.journalId||''))||{};
  const postedJournal=journal.status==='posted'?String(finding.journalId||''):'';
  const accountExists=accounts.some(item=>String(item.code)===String(finding.accountCode||''));
  const notes='قرار المراجع: الإبقاء على الوضع الحالي دون تعديل. '+String(finding.reason||'');
  try{
   await api('', 'POST',{action:'saveAccountReviewFindingDecision',findingId:auditDecisionKey(finding),period:String(period.to||''),journalId:postedJournal,accountCode:accountExists?String(finding.accountCode):'',status:'accepted_risk',notes});
   setIntegrityAudit(old=>old?Object.assign({},old,{findings:old.findings.map(row=>row.id===finding.id?Object.assign({},row,{reviewDecision:'accepted_risk',reviewDecisionNote:notes}):row)}):old);
   setNotice('تم تسجيل قرار الإبقاء على الوضع الحالي مع توثيق السبب.');
   setIntegrityFindingSelected('');
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const openIntegrityFindingEditor=async(finding,applyRecommendation)=>{
  if(!finding||!finding.journalId){setError('هذه النتيجة لا ترتبط بقيد مباشر. افتح الحساب أو المستند المصدر لمراجعة المعالجة.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const response=await api('?resource=document&id='+encodeURIComponent(finding.journalId));
   let doc=response.item||[...documents,...journalRecords].find(row=>String(row.id)===String(finding.journalId));
   if(!doc)throw new Error('تعذر تحميل القيد المرتبط بنتيجة الفحص.');
   if(doc.status==='posted'){
    if(doc.sourceType&&doc.sourceType!=='manual')throw new Error('هذا القيد مولّد من مستند مصدر. يجب تعديل الفاتورة أو السند أو حركة المصدر، وليس القيد مباشرة.');
    if(!canFinance('journal','edit')||!canFinance('review','edit'))throw new Error('تعديل القيد المرحّل يتطلب صلاحية تعديل القيود والمراجعة.');
    const revision=await api('', 'POST',{action:'createJournalRevision',id:doc.id,mode:'edit'});
    doc=revision.item||(await api('?resource=document&id='+encodeURIComponent(revision.id))).item;
    if(!doc)throw new Error('تم إنشاء طلب تعديل القيد ولكن تعذر تحميل نسخته للمراجعة.');
   }else if(!['pending_review','needs_correction'].includes(String(doc.status||''))){
    throw new Error('حالة القيد الحالية لا تسمح بفتحه في محرر المراجعة.');
   }
   setTab('review');setSelected(doc);setIntegrityFindingSelected('');
   openJournalModal(doc);
   if(applyRecommendation&&finding.recommendation&&Array.isArray(finding.recommendation.changes)&&finding.recommendation.changes.length){
    const changes=finding.recommendation.changes;
    setJournalModalDraft(old=>{
     if(!old)return old;
     const nextLines=(old.lines||[]).map((line,index)=>{
      const patch=changes.filter(change=>Number(change.lineNo)===index+1);
      if(!patch.length)return line;
      const updated=Object.assign({},line);
      patch.forEach(change=>{
       if(change.key==='accountCode'){
        updated.accountCode=String(change.value);
        const targetAccount=posting.find(item=>String(item.code)===String(change.value));
        const targetType=String(targetAccount&&targetAccount.subledgerType||'');
        if(targetType&&String(updated.partyType||'')!==targetType){updated.partyType=targetType;updated.partyId='';}
       }
       if(change.key==='party'){updated.partyType=String(change.partyType);updated.partyId=String(change.value);}
      });
      return updated;
     });
     return Object.assign({},old,{lines:nextLines});
    });
    setNotice('تم تحميل الاقتراح داخل نسخة القيد القابلة للتعديل. راجع التغييرات ثم احفظ نسخة المراجعة؛ لن يتغير القيد المرحّل قبل اعتمادها.');
   }else{
    setNotice('تم فتح القيد في محرر المراجعة. يمكنك تعديل البيانات يدويًا ثم حفظ نسخة المراجعة.');
   }
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const refreshAssignments=async()=>{
  try{
   const result=await api('?resource=assignments');
   const list=rows(result.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt));
   setAssignmentItems(list);
   setSentAssignmentItems(rows(result.sentItems).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
   const pendingId=window.PEST_PENDING_FINANCE_ASSIGNMENT_ID;
   if(pendingId){
    const match=list.find(x=>x.id===pendingId);
    if(match){setSelectedAssignmentId(match.id);setAssignmentLines((match.invoice&&match.invoice.lines||[]).map(x=>Object.assign({},x)));setAssignmentHeader(Object.assign({},match.invoice||{}));}
    window.PEST_PENDING_FINANCE_ASSIGNMENT_ID='';
   }
  }catch(e){setError(e.message||String(e));}
 };
 React.useEffect(()=>{if(tab==='assignments'&&canFinance("assignments","view"))refreshAssignments();},[tab,currentUser&&currentUser.uid]);
 React.useEffect(()=>{
  const openPendingRoute=async()=>{
   const assignmentId=window.PEST_PENDING_FINANCE_ASSIGNMENT_ID;
   if(assignmentId){setTab("assignments");await refreshAssignments();return;}
   const reviewId=window.PEST_PENDING_FINANCE_REVIEW_ID;
   if(reviewId){
    setTab("review");
    try{
     const list=await refreshReviewQueue(true);
     const match=(list||[]).find(item=>item.id===reviewId);
     if(match)await openReviewItem(match);
     else setError("لم يتم العثور على الفاتورة في قائمة المراجعة. حدّث القائمة أو تحقق من صلاحية المراجعة.");
    }catch(error){setError(error.message||String(error));}
    window.PEST_PENDING_FINANCE_REVIEW_ID="";
    return;
   }
   const invoiceId=window.PEST_PENDING_FINANCE_INVOICE_ID;
   if(invoiceId){
    setTab("invoices");
    try{
     const result=await api("?resource=documents"),list=rows(result.items);
     setDocuments(list.sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
     const invoiceDoc=list.find(x=>x.id===invoiceId&&x.type==="invoice");
     if(invoiceDoc){editDoc(invoiceDoc);setNotice("تم فتح مسودة الفاتورة العائدة من المستخدم المستكمل. راجعها ثم أرسلها للمراجعة.");}
     window.PEST_PENDING_FINANCE_INVOICE_ID="";
    }catch(error){setError(error.message||String(error));}
   }
  };
  const listener=()=>{void openPendingRoute();};
  window.addEventListener("pest-finance-route",listener);
  if(window.PEST_PENDING_FINANCE_ASSIGNMENT_ID||window.PEST_PENDING_FINANCE_INVOICE_ID||window.PEST_PENDING_FINANCE_REVIEW_ID)void openPendingRoute();
  return()=>window.removeEventListener("pest-finance-route",listener);
 },[]);

 React.useEffect(()=>{
  const pending=window.PEST_PENDING_FINANCE_ASSIGNMENT_ID;
  if(pending){setSelectedAssignmentId(pending);setTab('assignments');}
 },[]);
 const invoicePayload=()=>{
  const party=parties.find(x=>String(x.code||x.id)===String(invoice.partyId));
  return Object.assign({},invoice,{taxCode:defaultVatCodeForInvoice(invoice.type),taxType:vatTypeForInvoice(invoice.type),taxRate:14,otherTaxes:(invoice.otherTaxes||[]).map(x=>Object.assign({},x,{rate:x.rate===''?'':n(x.rate),amount:x.amount===''?'':n(x.amount)})),partyName:party?partyName(party):invoice.partyName,partyTaxNumber:party?partyTaxNumber(party):invoice.partyTaxNumber,lines:invoice.lines.map(x=>Object.assign({},x,{quantity:n(x.quantity),unitPrice:n(x.unitPrice),discount:n(x.discount)}))});
 };
 const saveInvoiceDraftRecord=async()=>{
  if(!canFinance("invoices",invoice.id?"edit":"add"))throw new Error("ليس لديك صلاحية حفظ أو تعديل مسودة الفاتورة.");
  const payload=invoicePayload();
  const result=await api('', 'POST',Object.assign({action:'saveInvoiceDraft'},payload));
  setInvoice(old=>Object.assign({},old,{id:result.id}));
  let attachmentError='';
  if(invoiceFile){
   try{
    await saveInvoiceAttachment(invoiceFile,result.id);
    setInvoiceFile(null);
   }catch(error){
    attachmentError=error.message||String(error);
    await api('', 'POST',{action:'setAttachmentUploadStatus',documentId:result.id,status:'pending',fileName:invoiceFile.name||'',error:attachmentError}).catch(()=>null);
   }
  }
  await refresh();
  return Object.assign({},result,{attachmentError});
 };
 const saveInvoiceDraft=async()=>{
  setBusy(true);setError('');
  try{
   const result=await saveInvoiceDraftRecord();
   setNotice(result.attachmentError
    ?'تم حفظ المسودة. تعذر رفع المرفق حاليًا، لكن بيانات الفاتورة محفوظة ويمكنك إعادة رفع الملف لاحقًا من المرفقات.'
    :'تم حفظ الفاتورة كمسودة غير مرحلة. يمكنك استكمالها أو تحويلها لمستخدم آخر.');
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const deleteInvoiceRecord=async doc=>{
  if(!doc||!doc.id)return;
  if(!canFinance('invoices','delete')){setError('ليس لديك صلاحية حذف أو إلغاء الفواتير.');return;}
  if(doc.status==='posted'||doc.journalId){setError('الفاتورة مرتبطة بقيد مرحّل؛ افتح القيد من شاشة القيود اليومية لاستخدام حذف القيد ومصدره أو إنشاء قيد عكسي.');return;}
  if(!window.confirm('تأكيد حذف/إلغاء الفاتورة '+(doc.number||doc.id)+'؟ سيتم إغلاق مهمة الاستكمال إن كانت الفاتورة محوّلة، مع الاحتفاظ بسجل التدقيق.'))return;
  setBusy(true);setError('');
  try{
   const result=await api('','POST',{action:'deleteInvoice',id:doc.id,reason:'حذف بطلب المستخدم من شاشة الفواتير'});
   if(invoice.id===doc.id){setInvoice(blankInvoice(invoice.type));setInvoiceFile(null);setInvoicePartySearch('');setOcrSuggestions({party:null,items:[]});}
   setSelected(null);setInvoiceDecisionDoc(null);
   setNotice(result.status==='cancelled'?'تم إلغاء الفاتورة وإزالتها من قائمة المراجعة مع الاحتفاظ بسجلها.':'تم حذف المسودة من قائمة الفواتير مع الاحتفاظ بأثر العملية في سجل النظام.');
   await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const clearInvoiceEntry=()=>{
  if(invoice.id){void deleteInvoiceRecord({id:invoice.id,number:invoice.number,status:'draft'});return;}
  if(!window.confirm('مسح بيانات الفاتورة الحالية والملف المرفق من شاشة الإدخال؟'))return;
  setInvoice(blankInvoice(invoice.type));setInvoiceFile(null);setInvoicePartySearch('');setOcrSuggestions({party:null,items:[]});setNotice('تم مسح بيانات الفاتورة والملف المرفق من شاشة الإدخال.');
 };
 const assignInvoiceToUser=async()=>{
  if(!canFinance("assignments","add")){setError("ليس لديك صلاحية تحويل الإجراءات لمستخدم آخر.");return;}
  if(!assignmentUserUid){setError('اختر المستخدم الذي سيستكمل الفاتورة.');return;}
  setBusy(true);setError('');
  try{
   const draft=await saveInvoiceDraftRecord();
   const result=await api('', 'POST',{action:'assignInvoice',invoiceId:draft.id,assigneeUid:assignmentUserUid,instruction:assignmentInstruction});
   setNotice(draft.attachmentError
    ?'تم حفظ المسودة وتحويلها للمستخدم المختار بنجاح. المرفق لم يُرفع بعد؛ يمكن إعادة رفعه لاحقًا من الفاتورة.'
    :'تم حفظ المسودة وتحويلها للمستخدم المختار، وستصل إليه في المهام والتنبيهات.');
   setInvoice(o=>Object.assign({},o,{id:draft.id}));
   await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const openAssignment=(assignment,source="received")=>{
  setSelectedAssignmentId(assignment.id);
  setSelectedAssignmentSource(source);
  setAssignmentLines((assignment.invoice&&assignment.invoice.lines||[]).map(x=>Object.assign({},x)));
  setAssignmentHeader(Object.assign({},assignment.invoice||{}));
  setAssignmentEditInstruction(assignment.instruction||"");
  setForwardUserUid('');setForwardInstruction(assignment.instruction||'استكمال ومراجعة بيانات الفاتورة');
 };
 const manageAssignment=async(mode,source,target)=>{
  const selectedRow=target||(source==="sent"?sentAssignmentItems:assignmentItems).find(item=>item.id===selectedAssignmentId);
  if(!selectedRow)return;
  if(!canFinance("assignments","edit")){setError("ليس لديك صلاحية إدارة الإجراءات المحولة.");return;}
  if(mode==="delete"){
   const message=source==="sent"
    ?"سيتم إلغاء التحويل الحالي من قائمتك. ستظل الفاتورة محفوظة دون حذف بياناتها أو مرفقاتها، ويمكنك استكمالها أو إعادة تحويلها."
    :"سيتم إرجاع الفاتورة لصاحب التحويل وإزالتها من مهامك. لن يتم حذف الفاتورة أو مرفقاتها.";
   if(!window.confirm(message+"\nهل تريد المتابعة؟"))return;
  }
  setAssignmentBusy(true);setError("");
  try{
   await api("","POST",{action:"manageInvoiceAssignment",mode,scope:source==="sent"?"sent":"received",assignmentId:selectedRow.id,reason:mode==="delete"?"إزالة الإجراء من قائمة المستخدم":""});
   setNotice(mode==="archive"?"تمت أرشفة الإجراء مع الاحتفاظ بسجل التحويل.":mode==="restore"?"تمت إعادة الإجراء من الأرشيف إلى القائمة.":"تمت إزالة الإجراء من قائمتك مع الاحتفاظ بالفاتورة وسجل التحويل.");
   if(selectedAssignmentId===selectedRow.id){setSelectedAssignmentId("");setAssignmentLines([]);setAssignmentHeader({});}
   await refreshAssignments();await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setAssignmentBusy(false);}
 };
 const saveAssignmentChanges=async()=>{
  const source=selectedAssignmentSource,assignment=(source==="sent"?sentAssignmentItems:assignmentItems).find(item=>item.id===selectedAssignmentId);
  if(!assignment)return;
  if(!canFinance("assignments","edit")){setError("ليس لديك صلاحية تعديل الإجراء المحول.");return;}
  setAssignmentBusy(true);setError("");
  try{
   const lines=assignmentLines.map(line=>Object.assign({},line,{quantity:line.quantity===""?"":n(line.quantity),unitPrice:line.unitPrice===""?"":n(line.unitPrice),discount:line.discount===""?"":n(line.discount)}));
   await api("","POST",{action:"manageInvoiceAssignment",mode:"update",scope:source==="sent"?"sent":"received",assignmentId:assignment.id,instruction:assignmentEditInstruction,invoice:assignmentHeader,lines});
   setNotice("تم حفظ تعديلات الإجراء والفاتورة دون إغلاق التحويل أو تغيير المستخدم المسؤول.");
   await refreshAssignments();await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setAssignmentBusy(false);}
 };
 const completeAssignment=async(decision="return_to_creator")=>{
  if(!canFinance("assignments","edit")){setError("ليس لديك صلاحية استكمال الإجراء واتخاذ القرار.");return;}
  const assignment=assignmentItems.find(x=>x.id===selectedAssignmentId);if(!assignment)return;
  setAssignmentBusy(true);setError('');
  try{
   const lines=assignmentLines.map(line=>Object.assign({},line,{quantity:line.quantity===''?'':n(line.quantity),unitPrice:line.unitPrice===''?'':n(line.unitPrice),discount:line.discount===''?'':n(line.discount)}));
   await api('', 'POST',{action:'completeInvoiceAssignment',assignmentId:assignment.id,invoice:assignmentHeader,lines,decision});
   setNotice(decision==="submit_for_review"?'تم إرسال الفاتورة إلى قائمة المراجعة حتى لو كانت بها نواقص. ستظهر الأخطاء للمراجع لاستكمالها قبل الاعتماد.':'تم إرجاع الملف إلى صاحب التحويل ليستكمل أو يعيد تحويله لمستخدم آخر.');
   setSelectedAssignmentId('');setAssignmentLines([]);setAssignmentHeader({});
   await refreshAssignments();await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setAssignmentBusy(false);}
 };
 const forwardAssignment=async()=>{
  if(!canFinance("assignments","edit")){setError("ليس لديك صلاحية إعادة تحويل الإجراء.");return;}
  if(!forwardUserUid){setError("اختر المستخدم التالي الذي سيتولى الفاتورة.");return;}
  const source=selectedAssignmentSource,assignment=(source==="sent"?sentAssignmentItems:assignmentItems).find(x=>x.id===selectedAssignmentId);if(!assignment)return;
  setAssignmentBusy(true);setError('');
  try{
   const lines=assignmentLines.map(line=>Object.assign({},line,{quantity:line.quantity===''?'':n(line.quantity),unitPrice:line.unitPrice===''?'':n(line.unitPrice),discount:line.discount===''?'':n(line.discount)}));
   if(source==="sent"){
    await api('', 'POST',{action:'manageInvoiceAssignment',mode:'reassign',scope:'sent',assignmentId:assignment.id,nextAssigneeUid:forwardUserUid,instruction:forwardInstruction,invoice:assignmentHeader,lines});
   }else{
    await api('', 'POST',{action:'forwardInvoiceAssignment',assignmentId:assignment.id,nextAssigneeUid:forwardUserUid,instruction:forwardInstruction,invoice:assignmentHeader,lines});
   }
   setNotice("تم إعادة تحويل الفاتورة للمستخدم التالي بنجاح، مع الاحتفاظ بالمرفقات وسجل التحويلات السابقة.");
   setSelectedAssignmentId('');setAssignmentLines([]);setAssignmentHeader({});
   await refreshAssignments();await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setAssignmentBusy(false);}
 };
 const cancelAssignedInvoice=async()=>{
  const assignment=assignmentItems.find(x=>x.id===selectedAssignmentId);
  if(!assignment)return;
  await manageAssignment("delete","received",assignment);
 };
 const loadPeriod=async(options)=>{
  const silent=Boolean(options&&options.silent),keepBusy=Boolean(options&&options.keepBusy);
  if(!keepBusy)setBusy(true);
  try{
   const [d,partnerData]=await Promise.all([
    api('?resource=periods&from='+encodeURIComponent(period.from)+'&to='+encodeURIComponent(period.to)),
    canFinance('partyStatements','view')?api('?resource=partnerCurrentAccounts').catch(()=>null):Promise.resolve(null)
   ]);
   if(partnerData&&Array.isArray(partnerData.items))setPartnerCurrentAccounts(partnerData.items);
   const selected=[],cumulative=[];
   Object.entries(d.entries||{}).forEach(([m,entries])=>Object.values(entries||{}).forEach(j=>{if(j&&j.status==='posted')selected.push(j);}));
   Object.entries(d.balanceEntries||d.entries||{}).forEach(([m,entries])=>Object.values(entries||{}).forEach(j=>{if(j&&j.status==='posted')cumulative.push(j);}));
   setPeriodJournals(selected);setBalanceJournals(cumulative);
   if(d.accountingStartMonth)setAccountingStartMonth(d.accountingStartMonth);
   return true;
  }
  catch(e){if(!silent)setError(e.message||String(e));return false;}
  finally{if(!keepBusy)setBusy(false);}
 };
  React.useEffect(()=>{void refresh({initialOnly:true});if(db){db.ref('projects').once('value').then(snapshot=>setProjects(rows(snapshot.val()))).catch(e=>console.warn(e));}},[]);
 React.useEffect(()=>{
  if(tab!=='review'||!canFinance("review","view"))return;
  let active=true,loading=false;
  const sync=async()=>{
   if(!active||loading||(typeof document!=='undefined'&&document.visibilityState==='hidden'))return;
   loading=true;
   try{
    const result=await api('?resource=review');
    if(!active)return;
    const list=rows(result.items).filter(item=>['pending_review','duplicate_review'].includes(item.status)).sort((a,b)=>n(b.createdAt)-n(a.createdAt));
    setReview(old=>old.length===list.length&&old.every((item,index)=>{
     const next=list[index];
     return next&&item.id===next.id&&item.status===next.status&&item.createdAt===next.createdAt&&item.total===next.total&&item.title===next.title&&item.number===next.number&&item.attachmentUploadStatus===next.attachmentUploadStatus;
    })?old:list);
    setSelected(old=>old&&!list.some(item=>item.id===old.id)?null:old);
   }catch(error){if(active)setError(error.message||String(error));}
   finally{loading=false;}
  };
  void sync();
  const timer=window.setInterval(sync,60000);
  const onVisibility=()=>{if(document.visibilityState==='visible')void sync();};
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
 },[tab,currentUser&&currentUser.uid,period.to]);
 React.useEffect(()=>{
  if(tab!=='journal'||!canFinance('journal','view'))return;
  let active=true;
  setBusy(true);setError('');
  Promise.all([api('?resource=documents'),api('?resource=journals')]).then(([documentResult,journalResult])=>{
   if(!active)return;
   setDocuments(rows(documentResult.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
   setJournalRecords(rows(journalResult.items).sort((a,b)=>n(b.postedAt||b.createdAt)-n(a.postedAt||a.createdAt)));
  }).catch(error=>{if(active)setError(error.message||String(error));}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[tab,currentUser&&currentUser.uid]);
 React.useEffect(()=>{if((['overview','reports','accountAnalysis','accountReview','partyStatements','tax','centers'].includes(tab)&&canFinance(financeTabAreas[tab],"view"))||(tab==='review'&&canFinance('reports','view')))loadPeriod();},[tab,period.from,period.to,currentUser&&currentUser.uid]);
 React.useEffect(()=>{
  if(!['review','accountReview'].includes(tab)||!canFinance('reports','view'))return;
  let active=true;
  Promise.all([api('?resource=accountReviews'),api('?resource=accountReviewFindingDecisions')]).then(([accountsResult,findingsResult])=>{
   if(!active)return;
   setAccountReviewDecisions(accountsResult.items&&typeof accountsResult.items==='object'?accountsResult.items:{});
   const savedFindingRows=Object.values(findingsResult.items&&typeof findingsResult.items==='object'?findingsResult.items:{}).filter(item=>item&&item.findingId&&String(item.period||'')===String(period.to||''));
   setAccountReviewFindingDecisions(Object.fromEntries(savedFindingRows.map(item=>[String(item.findingId),item])));
  }).catch(error=>{if(active)setError(error.message||String(error));});
  void refresh().catch(error=>{if(active)setError(error.message||String(error));});
  return()=>{active=false;};
 },[tab,currentUser&&currentUser.uid]);
 const loadParty=async()=>{
  if(!partyStatement.id){setError('اختر الطرف التحليلي أولاً.');return;}
  setBusy(true);setError('');
  try{
   let entries=[];
   const result=await api('?resource=party&type='+encodeURIComponent(partyStatement.type)+'&id='+encodeURIComponent(partyStatement.id));
   Object.values(result.entries||{}).forEach(function(periodRows){Object.values(periodRows||{}).forEach(function(entry){entries.push(entry);});});
   entries.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''));});
   setPartyRows(entries);
   void loadStatementAttachments(entries);
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const accounts=rows(master.chartOfAccounts).map(account=>String(account.code)==="2150"
  ?Object.assign({},account,{subledgerType:"financingParty",isControl:true})
  :account).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
 const loadPartnerCurrentAccounts=async(silent=false)=>{
 if(!silent)setBusy(true);setError('');
 try{
  const result=await api('?resource=partnerCurrentAccounts'),list=Array.isArray(result.items)?result.items:[];
  setPartnerCurrentAccounts(list);
  const refs=[];
  list.forEach(account=>{
   (account.entries||[]).forEach(entry=>refs.push(...statementAttachmentReferences(entry)));
   (account.transactions||[]).forEach(transaction=>{
    if(account.uid&&transaction.id)refs.push({entityType:'cashCustody',entityId:account.uid+'--'+transaction.id});
   });
  });
  void loadStatementAttachmentReferences(refs);
  if(!list.some(item=>item.uid===partnerCurrentSelectedUid&&item.linked)){
   const first=list.find(item=>item.linked);
   setPartnerCurrentSelectedUid(first&&first.uid||'');
  }
  return list;
 }catch(error){setError(error.message||String(error));return [];}
 finally{if(!silent)setBusy(false);}
};
const downloadPartnerCustodyAttachment=async(account,transaction,attachment)=>{
 const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;if(!auth)throw new Error('جلسة الدخول انتهت. أعد تسجيل الدخول.');
 const token=await auth.getIdToken(),entityId=account.uid+'--'+transaction.id;
 const response=await fetch(base+'/attachments/file?entityType=cashCustody&entityId='+encodeURIComponent(entityId)+'&id='+encodeURIComponent(attachment.id),{headers:{Authorization:'Bearer '+token}});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'تعذر تحميل المرفق.');}
 const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),link=document.createElement('a');link.href=objectUrl;link.download=attachment.fileName||'custody-attachment';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
};
const openPartnerCustodyAttachments=async(account,transaction)=>{
 setBusy(true);setError('');
 try{const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;if(!auth)throw new Error('جلسة الدخول انتهت. أعد تسجيل الدخول.');const token=await auth.getIdToken(),entityId=account.uid+'--'+transaction.id;const response=await fetch(base+'/attachments?entityType=cashCustody&entityId='+encodeURIComponent(entityId),{headers:{Authorization:'Bearer '+token}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'تعذر تحميل مرفقات الحركة.');setPartnerCurrentAttachmentView({ownerUid:account.uid,transaction,attachments:Array.isArray(data.attachments)?data.attachments:[]});}
 catch(error){setError(error.message||String(error));}finally{setBusy(false);}
};
const repairPartnerCurrentExpenseTransfers=async(account)=>{
 if(!currentUser||currentUser.role!=='admin'){setError('تصحيح حركات جاري الشركاء متاح لمدير النظام فقط.');return;}
 const eligible=(account.transactions||[]).filter(transaction=>{
  const marker=transaction.partnerCurrentAccountTransfer||{};
  return transaction.type==='expense'&&marker.active===true&&marker.transferTreatment!=='personalWithdrawal'&&marker.expenseCorrectionStatus!=='posted'&&!marker.expenseCorrectionPendingJournalId;
 });
 if(!eligible.length){setNotice('لا توجد حركات مصروفات قديمة محولة إلى الجاري وتحتاج إلى تصحيح.');return;}
 if(!window.confirm('سيتم فحص '+eligible.length+' حركة مصروف قديمة محولة إلى جاري الشريك. الحركات المطابقة فقط ستنشئ قيود تصحيح مستقلة بانتظار المراجعة؛ لن يتم تعديل القيود أو الأرصدة قبل الاعتماد. متابعة؟'))return;
 setBusy(true);setError('');setNotice('');
 try{
  const result=await api('','POST',{action:'repairPartnerCurrentAccountExpenseTransfers',ownerUid:account.uid});
  setNotice('تم إرسال '+(result.submitted||0)+' قيد تصحيح للمراجعة، وتجاوز '+(result.skipped||0)+' حركة، مع '+(result.failed||0)+' حالة تعذر فحصها. راجع القيود الجديدة في قائمة المراجعة قبل اعتمادها.');
  await loadPartnerCurrentAccounts(true);await refresh();
 }catch(error){setError(error.message||String(error));}
 finally{setBusy(false);}
};
const transferPartnerCustodyMovement=async(account,transaction)=>{
 if(!currentUser||currentUser.role!=='admin'){setError('تحويلات جاري الشركاء متاحة لمدير النظام فقط.');return;}
 if(transaction.partnerCurrentAccountTransfer&&transaction.partnerCurrentAccountTransfer.pending===true){setError('طلب هذه الحركة ما زال في انتظار المراجعة.');return;}
 if(!window.confirm('تأكيد إرسال طلب إعادة الحركة '+(transaction.reference||transaction.id)+' من جاري الشريك إلى العهدة الشخصية للمراجعة؟ سيبقى الرصيد كما هو حتى اعتماد القيد.'))return;
 setBusy(true);setError('');setNotice('');
 try{const result=await api('','POST',{action:'transferPartnerCurrentAccount',ownerUid:account.uid,transactionId:transaction.id,direction:'toCustody'});setNotice('تم إرسال طلب إعادة الحركة إلى العهدة للمراجعة. لن يتغير الرصيد إلا بعد الاعتماد. رقم القيد: '+(result.journalNumber||result.journalId)+'.');setPartnerCurrentAttachmentView(null);await loadPartnerCurrentAccounts(true);await refresh();}
 catch(error){setError(error.message||String(error));}finally{setBusy(false);}
};
React.useEffect(()=>{if(tab==='partnerCurrent'&&canFinance('partyStatements','view'))void loadPartnerCurrentAccounts();if(tab==='openingBalances'&&posting.some(account=>['partnerCurrentAccount','financingParty'].includes(account.subledgerType)))void loadPartnerCurrentAccounts(true);},[tab,currentUser&&currentUser.uid]);
const posting=accounts.filter(a=>!a.isGroup&&a.active!==false);
 const centers=rows(master.costCenters),activeCenters=centers.filter(x=>x.active!==false);
 const screenAccountFilterOptions=[{value:'',label:t('كل الحسابات','All accounts')}].concat(accounts.filter(account=>account&&account.code).map(account=>({value:String(account.code),label:String(account.code)+' — '+String(account.name||'')})));
 const screenCostCenterFilterOptions=[{value:'',label:t('كل مراكز التكلفة','All cost centers')}].concat(centers.filter(center=>center&&(center.code||center.id)).map(center=>({value:String(center.code||center.id),label:String(center.code||center.id)+' — '+String(center.name||'')})));
 React.useEffect(()=>{
  const lookups={
   accounts:accounts.filter(account=>account&&account.code).map(account=>({code:String(account.code),name:String(account.name||"")})),
   costCenters:centers.filter(center=>center&&(center.code||center.id)).map(center=>({code:String(center.code||center.id),name:String(center.name||"")}))
  };
  window.PEST_FINANCE_FILTER_LOOKUPS=lookups;
  return ()=>{if(window.PEST_FINANCE_FILTER_LOOKUPS===lookups)delete window.PEST_FINANCE_FILTER_LOOKUPS;};
 },[master.chartOfAccounts,master.costCenters]);
 const items=rows(master.items),activeItems=items.filter(x=>x.active!==false);
 const financialParties=rows(master.parties),registeredFinancingParties=rows(master.financingParties),registeredSecurityDepositParties=rows(master.securityDepositParties);
 const mergePartyRows=(base,type)=>{const map=new Map((base||[]).map(p=>[String(p.code||p.id),p]));financialParties.filter(p=>p.partyType===type).forEach(p=>map.set(String(p.code||p.id),p));return Array.from(map.values()).filter(p=>p&&(p.code||p.id));};
 const allClients=mergePartyRows(clients,'customer'),allVendors=mergePartyRows(vendors,'vendor');
 const activeClients=allClients.filter(p=>p.active!==false),activeVendors=allVendors.filter(p=>p.active!==false);
 const parties=invoice.type==='purchase'?activeVendors:activeClients;
 const partyTaxNumber=p=>p.taxNumber||p.taxRegistrationNumber||p.registrationNumber||p.registrationNo||p.vatNumber||p.taxId||'';
 const vatTypeForInvoice=type=>type==='purchase'?'vat_input':'vat_output';
 const defaultVatCodeForInvoice=type=>type==='purchase'?'VAT-IN-14':'VAT-OUT-14';
 const findVatCode=(type,rate,effectiveDate)=>{
  const eligible=rows(master.taxCodes).filter(x=>x.taxType===vatTypeForInvoice(type)&&x.active!==false&&(!x.effectiveFrom||!effectiveDate||String(x.effectiveFrom)<=String(effectiveDate)));
  if(rate!==undefined&&rate!==null&&String(rate)!=='')return eligible.find(x=>Number(x.rate)===Number(rate))||null;
  return eligible.find(x=>x.code===defaultVatCodeForInvoice(type))||null;
 };
 const blankInvoice=type=>({id:'',type:type||'purchase',date:today(),number:'',partyId:'',partyName:'',partyTaxNumber:'',currency:'EGP',taxCode:defaultVatCodeForInvoice(type||'purchase'),taxType:vatTypeForInvoice(type||'purchase'),taxRate:'14',taxAmount:'',otherTaxes:[],discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
 const partyName=p=>p.name||p.companyName||p.legalName||p.supplierName||p.vendorName||p.customerName||p.clientName||p.title||p.code||p.id;
 const nextCode=(prefix,list,options)=>{
  const engine=window.PEST_CODE_INTELLIGENCE;
  if(engine&&typeof engine.suggestNext==='function')return engine.suggestNext(Object.assign({records:list||[],fallbackPrefix:prefix,minDigits:3},options||{})).code;
  const used=new Set((list||[]).map(x=>String(x.code||x.id||'')));let i=1,code='';do{code=prefix+'-'+String(i++).padStart(3,'0');}while(used.has(code));return code;
 };
 const getCodeSuggestion=(kind,form)=>{
  const value=form||{};
  let records=[],fallbackPrefix='NEW',options={minDigits:3};
  if(kind==='parties'){
   const vendor=value.partyType==='vendor';
   records=vendor?allVendors:allClients;fallbackPrefix=vendor?'VND':'CUS';
  }else if(kind==='financingParties'){
   records=registeredFinancingParties;fallbackPrefix='FIN';
  }else if(kind==='securityDepositParties'){records=registeredSecurityDepositParties;fallbackPrefix='DEP';}
  else if(kind==='employeeAdvances'){records=rows(master.employeeAdvances);fallbackPrefix='ADV';}
  else if(kind==='employeeCustodies'){records=rows(master.employeeCustodies);fallbackPrefix='CST';}
  else if(kind==='items'){
   records=items;fallbackPrefix=value.groupCode||'ITM';
   if(value.groupCode)Object.assign(options,{groupBy:'groupCode',groupValue:value.groupCode});
  }else if(kind==='itemGroups'){records=rows(master.itemGroups);fallbackPrefix='GRP';}
  else if(kind==='chartOfAccounts'){
   records=accounts;fallbackPrefix=value.parentCode||'ACC';
   Object.assign(options,{groupBy:'parentCode',groupValue:value.parentCode||'',separator:!value.parentCode,minDigits:value.parentCode?2:3});
  }else if(kind==='costCenters'){
   records=centers;fallbackPrefix=value.projectCode?String(value.projectCode)+'-CC':'CC';
   Object.assign(options,{groupBy:'projectCode',groupValue:value.projectCode||''});
  }else if(kind==='warehouses'){records=rows(master.warehouses);fallbackPrefix='WH';}
  else if(kind==='bankAccounts'){records=rows(master.bankAccounts);fallbackPrefix='BANK';}
  else if(kind==='taxCodes'){records=rows(master.taxCodes);fallbackPrefix='TAX';}
  const engine=window.PEST_CODE_INTELLIGENCE;
  return engine&&typeof engine.suggestNext==='function'
   ?engine.suggestNext(Object.assign({records,fallbackPrefix},options))
   :{code:nextCode(fallbackPrefix,records),pattern:fallbackPrefix+'-###',source:'fallback',matchedCount:0};
 };
 const codeHint=result=>window.PEST_CODE_INTELLIGENCE&&result?window.PEST_CODE_INTELLIGENCE.hint(result,true):'يمكنك تعديل الكود يدويًا أو طلب اقتراح جديد.';

 const normalizeMatch=v=>String(v||'').toLowerCase().replace(/[\s\-_.،,]+/g,'').trim();

 const updateJ=(i,k,v)=>setJournal(old=>Object.assign({},old,{lines:old.lines.map((line,j)=>{if(j!==i)return line;const next=Object.assign({},line,{[k]:v}),account=posting.find(item=>String(item.code)===String(next.accountCode)),type=analyticTypeForAccount(account,next);if(k==="description"&&type==="financingParty"){const match=matchFinancingPartyFromText([v,old.description,old.reference].join(" "));Object.assign(next,{partyType:"financingParty",partyId:match?String(match.code||match.id):""});}return next;})}));
 const matchFinancingPartyFromText=value=>{
  const haystack=normalizeMatch(value);if(!haystack)return null;
  return registeredFinancingParties.find(item=>item&&item.active!==false&&normalizeMatch(partyName(item)).length>=3&&haystack.includes(normalizeMatch(partyName(item))))||null;
 };
 const updateJournalLineAccount=(index,accountCode)=>setJournal(old=>Object.assign({},old,{lines:old.lines.map((line,i)=>{if(i!==index)return line;const currentAccount=posting.find(item=>String(item.code)===String(line.accountCode)),nextAccount=posting.find(item=>String(item.code)===String(accountCode)),currentType=analyticTypeForAccount(currentAccount,line),nextType=analyticTypeForAccount(nextAccount,{}),keepParty=Boolean(nextType&&currentType===nextType&&line.partyId),matched=nextType==="financingParty"?matchFinancingPartyFromText([line.description,old.description,old.reference].join(" ")):null;return Object.assign({},line,{accountCode,partyType:nextType,partyId:matched?String(matched.code||matched.id):keepParty?line.partyId:""});})}));
 const updateI=(i,k,v)=>setInvoice(o=>Object.assign({},o,{lines:o.lines.map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const updateInvoiceOtherTax=(i,k,v)=>setInvoice(o=>Object.assign({},o,{otherTaxes:(o.otherTaxes||[]).map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const jDebit=journal.lines.reduce((s,x)=>s+n(x.debit),0),jCredit=journal.lines.reduce((s,x)=>s+n(x.credit),0);
 const net=invoice.lines.reduce((s,x)=>s+n(x.quantity)*n(x.unitPrice)-n(x.discount),0)-n(invoice.discount);
 const primaryVat=invoice.taxAmount!==''?n(invoice.taxAmount):net*14/100;
 const otherTaxTotal=(invoice.otherTaxes||[]).reduce((sum,row)=>sum+(row.amount!==''&&row.amount!==null&&row.amount!==undefined?n(row.amount):net*n(row.rate)/100),0);
 const tax=primaryVat+otherTaxTotal,total=net+tax;
 const flattenJournals=list=>list.flatMap(j=>(j.lines||[]).map((l,index)=>Object.assign({},l,{date:j.date,journalId:j.id,journalNumber:j.number||j.journalNumber||j.id,lineNo:index+1,sourceType:j.sourceType||'manual',sourceId:j.sourceId||'',transferTreatment:j.transferTreatment||'',journalDescription:j.description||'',description:l.description||j.description||'',reference:j.reference||''})));
 const flat=flattenJournals(periodJournals),balanceFlat=flattenJournals(balanceJournals);
 const balances=flat.reduce((o,l)=>{const a=o[l.accountCode]||(o[l.accountCode]={debit:0,credit:0});a.debit+=n(l.debit);a.credit+=n(l.credit);return o;},{});
 const balanceBalances=balanceFlat.reduce((o,l)=>{const a=o[l.accountCode]||(o[l.accountCode]={debit:0,credit:0});a.debit+=n(l.debit);a.credit+=n(l.credit);return o;},{});
 const trial=accounts.map(a=>({account:a,amount:balances[a.code]||{debit:0,credit:0}})).filter(x=>x.amount.debit||x.amount.credit);
 const balanceTrial=accounts.map(a=>{
  const total=balanceBalances[a.code]||{debit:0,credit:0},activity=balances[a.code]||{debit:0,credit:0};
  const openingNet=(n(total.debit)-n(total.credit))-(n(activity.debit)-n(activity.credit)),endingNet=n(total.debit)-n(total.credit);
  return {account:a,amount:total,activity,opening:{debit:Math.max(openingNet,0),credit:Math.max(-openingNet,0)},ending:{debit:Math.max(endingNet,0),credit:Math.max(-endingNet,0)}};
 }).filter(x=>x.amount.debit||x.amount.credit||x.activity.debit||x.activity.credit);
 const unmappedBalanceRows=Object.entries(balanceBalances).filter(([code,amount])=>!accounts.some(account=>String(account.code)===String(code))&&(n(amount&&amount.debit)||n(amount&&amount.credit))).map(([code,amount])=>({code,debit:n(amount.debit),credit:n(amount.credit),net:n(amount.debit)-n(amount.credit)}));
 const ledgerBalanceDebit=balanceFlat.reduce((sum,line)=>sum+n(line.debit),0);
 const ledgerBalanceCredit=balanceFlat.reduce((sum,line)=>sum+n(line.credit),0);
 const ledgerBalanceDifference=ledgerBalanceDebit-ledgerBalanceCredit;
 const accountIsInBranch=(account,branchCode)=>{
  if(String(account.code)===String(branchCode))return true;
  let parent=String(account.parentCode||''),guard=0;
  while(parent&&guard++<20){
   if(parent===String(branchCode))return true;
   const parentAccount=accounts.find(item=>String(item.code)===parent);
   parent=parentAccount?String(parentAccount.parentCode||''):'';
  }
  return false;
 };
 const sumFrom=(list,type)=>list.filter(x=>x.account.type===type).reduce((sum,x)=>sum+(type==='revenue'?x.amount.credit-x.amount.debit:x.amount.debit-x.amount.credit),0);
 const isCostOfSalesAccount=account=>Boolean(account&&account.type==='expense'&&(accountIsInBranch(account,'5')||account.statementGroup==='cogs'));
 const expenseStatementGroup=account=>{
  const value=String(account&&account.statementGroup||'').toLowerCase();
  if(['operating','administrative','finance'].includes(value))return value;
  const legacyDefaults={'6100':'operating','6200':'administrative','6300':'operating','6400':'finance'};
  return legacyDefaults[String(account&&account.code||'')]||'unclassified';
 };
 const revenue=sumFrom(trial,'revenue'),expenses=sumFrom(trial,'expense');
 const costOfSales=trial.filter(x=>isCostOfSalesAccount(x.account)).reduce((sum,x)=>sum+x.amount.debit-x.amount.credit,0);
 const otherExpenseForGroup=group=>trial.filter(x=>x.account.type==='expense'&&!isCostOfSalesAccount(x.account)&&expenseStatementGroup(x.account)===group).reduce((sum,x)=>sum+x.amount.debit-x.amount.credit,0);
 const operatingExpenses=otherExpenseForGroup('operating');
 const administrativeExpenses=otherExpenseForGroup('administrative');
 const financeExpenses=otherExpenseForGroup('finance');
 const unclassifiedExpenses=otherExpenseForGroup('unclassified');
 const otherExpenses=expenses-costOfSales;
 const expenseCategoryDifference=otherExpenses-operatingExpenses-administrativeExpenses-financeExpenses-unclassifiedExpenses;
 const grossProfit=revenue-costOfSales,profit=grossProfit-otherExpenses;
 const cumulativeRevenue=sumFrom(balanceTrial,'revenue'),cumulativeExpenses=sumFrom(balanceTrial,'expense'),accumulatedProfit=cumulativeRevenue-cumulativeExpenses;
 const vatInputBalance=balanceTrial.find(row=>String(row.account.code)==="1410");
 const vatOutputBalance=balanceTrial.find(row=>String(row.account.code)==="2110");
 const vatNetPosition=(vatInputBalance?n(vatInputBalance.amount.debit)-n(vatInputBalance.amount.credit):0)+(vatOutputBalance?n(vatOutputBalance.amount.debit)-n(vatOutputBalance.amount.credit):0);
 const vatNetReceivable=Math.max(0,vatNetPosition),vatNetPayable=Math.max(0,-vatNetPosition);
 const assets=sumFrom(balanceTrial.filter(row=>String(row.account.code)!=="1410"),'asset')+vatNetReceivable;
 const liabilities=balanceTrial.filter(x=>x.account.type==='liability'&&String(x.account.code)!=="2110").reduce((sum,x)=>sum+x.amount.credit-x.amount.debit,0)+vatNetPayable;
 const equity=balanceTrial.filter(x=>x.account.type==='equity').reduce((sum,x)=>sum+x.amount.credit-x.amount.debit,0)+accumulatedProfit;
 const cashCodeSet=new Set(['1110','1120',...rows(master.bankAccounts).map(x=>String(x.accountCode||x.code||''))]);
 const cashAccounts=balanceTrial.filter(x=>cashCodeSet.has(String(x.account.code))||x.account.isCash);
 const cashFlowSummary=(()=>{
  const accountByCode=new Map(accounts.map(a=>[String(a.code),a]));
  const cashCodes=new Set([...cashCodeSet,...cashAccounts.filter(x=>x.account.isCash).map(x=>String(x.account.code))]);
  let openingCash=0,operatingIn=0,operatingOut=0,investingIn=0,investingOut=0,financingIn=0,financingOut=0,unclassifiedIn=0,unclassifiedOut=0;
  balanceFlat.filter(line=>String(line.date||'')<String(period.from||'')+'-01'&&cashCodes.has(String(line.accountCode))).forEach(line=>{openingCash+=n(line.debit)-n(line.credit);});
  const cashDocuments=new Map(documents.filter(d=>d&&d.type==='cash').map(d=>[String(d.id),d]));
  const periodSourceDocuments=new Map(documents.filter(d=>d&&d.type==='bankLine').map(d=>[String(d.id),d]));
  periodJournals.forEach(journal=>{
   const cashLines=(journal.lines||[]).filter(line=>cashCodes.has(String(line.accountCode)));
   if(!cashLines.length)return;
   const doc=journal.sourceType==='cash'?cashDocuments.get(String(journal.sourceId)):journal.sourceType==='bankLine'?periodSourceDocuments.get(String(journal.sourceId)):null;
   if(doc&&['cash_to_bank','bank_to_cash'].includes(doc.movementType))return;
   cashLines.forEach(cashLine=>{
    const flow=n(cashLine.debit)-n(cashLine.credit);
    if(Math.abs(flow)<0.005)return;
    let category='';
    const movement=doc&&doc.movementType;
    if(movement&&['customer_receipt','supplier_payment','other_receipt','other_payment','employee_custody','employee_custody_return','employee_advance','employee_advance_recovery'].includes(movement))category='operating';
    else{
     const counterparts=(journal.lines||[]).filter(line=>!cashCodes.has(String(line.accountCode))&&Math.abs(n(line.debit))+Math.abs(n(line.credit))>0);
     if(!counterparts.length){if(flow>=0)unclassifiedIn+=flow;else unclassifiedOut+=Math.abs(flow);return;}
     const main=counterparts[0],account=accountByCode.get(String(main.accountCode));
     const code=String(main.accountCode||'');
     if(['1210','281','1300','1410','2110','1220','1230'].includes(code)||account&&['expense','revenue'].includes(account.type))category='operating';
     else if(account&&['liability','equity'].includes(account.type))category='financing';
     else if(account&&account.type==='asset')category='investing';
    }
    if(category==='operating'){if(flow>=0)operatingIn+=flow;else operatingOut+=Math.abs(flow);}
    else if(category==='investing'){if(flow>=0)investingIn+=flow;else investingOut+=Math.abs(flow);}
    else if(category==='financing'){if(flow>=0)financingIn+=flow;else financingOut+=Math.abs(flow);}
    else if(flow>=0)unclassifiedIn+=flow;else unclassifiedOut+=Math.abs(flow);
   });
  });
  const unclassified=unclassifiedIn-unclassifiedOut;
  const netChange=operatingIn-operatingOut+investingIn-investingOut+financingIn-financingOut+unclassified;
  return {openingCash,operatingIn,operatingOut,investingIn,investingOut,financingIn,financingOut,unclassified,unclassifiedIn,unclassifiedOut,netChange,closingCash:openingCash+netChange};
 })();
 const status=s=>({
  pending_review:t('بانتظار المراجعة','Pending Review'),
  needs_correction:t('يحتاج تصحيح','Needs Correction'),
  duplicate_review:t('تكرار محتمل','Potential Duplicate'),
  posted:t('مُرحّل','Posted'),rejected:t('مرفوض','Rejected'),
  assigned:t('محول لمستخدم','Assigned'),draft:t('مسودة','Draft'),
  deleted:t('محذوف','Deleted'),cancelled:t('ملغي','Cancelled'),
  returned_to_creator:t('معاد للمنشئ','Returned to Creator'),
  pending:t('معلق','Pending'),approved:t('معتمد','Approved'),
  open:t('مفتوح','Open'),completed:t('مكتمل','Completed')
 }[s]||s||'—');
 const documentType=s=>({
  invoice:t('فاتورة','Invoice'),journal:t('قيد يومية','Journal Entry'),
  cash:t('حركة خزينة','Cash Transaction'),bankLine:t('حركة بنك','Bank Transaction')
 }[s]||s||'—');
 const moneyLabel=value=>fmt(value)+(rtl?' ج.م':' EGP');
 const button=(label,fn,kind,disabled)=>h('button',{type:'button',onClick:fn,disabled:!!disabled,className:'rounded-xl px-3 py-2 text-sm font-bold border '+(kind==='primary'?'bg-blue-700 text-white border-blue-700':kind==='success'?'bg-emerald-600 text-white border-emerald-600':kind==='danger'?'bg-rose-50 text-rose-700 border-rose-200':'bg-white text-slate-700 border-slate-200')},label);
 const field=(label,value,onChange,type,extra)=>h('label',{className:'block text-sm font-bold text-slate-700'},label,h('input',Object.assign({type:type||'text',value:value==null?'':value,onChange:e=>onChange(e.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white',step:'any'},extra||{})));
 const select=(label,value,onChange,options,searchKey)=>searchablePicker(label,value,onChange,options,searchKey||'finance-select-'+normalizeMatch(label)+'-'+(options||[]).map(item=>String(item.value)).join('_'));
 const searchablePicker=(label,value,onChange,options,searchKey)=>{
  const list=Array.isArray(options)?options:[],selected=list.find(item=>String(item.value)===String(value||'')),hasQuery=Object.prototype.hasOwnProperty.call(journalPickerSearch,searchKey);
  const opened=Boolean(journalPickerOpen[searchKey]),query=opened?(hasQuery?String(journalPickerSearch[searchKey]||''):''):String(selected&&selected.label||'');
  const needle=normalizeMatch(query),addItem=list.find(item=>String(item.value)==='__quick_add__');
  const filteredMatches=list.filter(item=>String(item.value)!=='__quick_add__'&&(!needle||normalizeMatch(item.label).includes(needle)));
  const selectedCurrent=selected&&String(selected.value)!==''?selected:null;
  const ordinaryMatches=(selectedCurrent?[selectedCurrent]:[]).concat(filteredMatches.filter(item=>!selectedCurrent||String(item.value)!==String(selectedCurrent.value))).slice(0,addItem?9:10);
  const matches=addItem?ordinaryMatches.concat([addItem]):ordinaryMatches;
  const choose=item=>{onChange(item.value);setJournalPickerSearch(old=>Object.assign({},old,{[searchKey]:String(item.label||'')}));setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:false}));};
  const menu=opened?h('div',{className:'overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-2xl','data-finance-picker-menu':'true','data-finance-picker-key':String(searchKey||''),style:Object.assign({position:'fixed',zIndex:10000},journalPickerAnchor[searchKey]||{left:8,top:8,width:'min(320px, calc(100vw - 16px))',maxHeight:224})},matches.length?matches.map((item,index)=>h('button',{key:String(item.value)+'-'+index,type:'button',onMouseDown:e=>e.preventDefault(),onClick:()=>choose(item),className:'block w-full border-b border-slate-100 px-3 py-2 text-start text-xs font-normal last:border-0 '+(String(item.value)===String(value||'')?'bg-blue-50 text-blue-900':'hover:bg-blue-50')},h('span',{className:'flex items-center justify-between gap-2'},h('span',{className:'font-bold'},String(item.label||'')),String(item.value)===String(value||'')?h('span',{className:'shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800'},'الاختيار الحالي'):null))):h('div',{className:'p-3 text-xs font-normal text-slate-500'},'لا توجد نتائج مطابقة')):null;
  return h('div',{className:'relative min-w-0 text-sm font-bold text-slate-700','data-finance-picker-root':'true','data-finance-picker-key':String(searchKey||'')},label,
   h('input',{type:'search',value:query,onFocus:e=>{const target=e.currentTarget||e.target;setJournalPickerAnchor(old=>Object.assign({},old,{[searchKey]:financePickerPosition(target)}));setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:true}));setJournalPickerSearch(old=>Object.assign({},old,{[searchKey]:''}));},onChange:e=>{setJournalPickerSearch(old=>Object.assign({},old,{[searchKey]:e.target.value}));setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:true}));},onKeyDown:e=>{if(e.key==='Escape')setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:false}));else if(e.key==='Enter'&&matches.length){e.preventDefault();choose(matches[0]);}},placeholder:'ابحث بالاسم أو الكود...',autoComplete:'off','aria-autocomplete':'list',className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'}),
   menu&&(typeof ReactDOM!=='undefined'&&ReactDOM.createPortal?ReactDOM.createPortal(menu,document.body):menu)
  );
 };
 const searchablePickerWithAdd=(label,value,onChange,options,kind,searchKey,defaults)=>searchablePicker(label,value,next=>{
  if(next==='__quick_add__')openQuickAdd(kind,onChange,defaults);
  else onChange(next);
 },(options||[]).concat([{value:'__quick_add__',label:'＋ إضافة كود جديد'}]),searchKey);
 const extractFinancingPartyName=value=>{
  const raw=String(value||"").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").trim();
  if(!raw)return "";
  const patterns=[
   /(?:اسم\s+(?:جهة\s+)?التمويل|جهة\s+التمويل|اسم\s+المموّل|اسم\s+الممول|المموّل|الممول|الجهة\s+الممولة|جهة\s+ممولة)\s*[:：\-]?\s*(?:من\s+)?([^،,;؛\n\|]+)/i,
   /(?:تمويل|قرض|سلفة)\s+(?:(?:وارد|مستلم|مستلمة|مقدم|مقدمة)\s+)?من\s+([^،,;؛\n\|]+)/i,
   /من\s+(?:السيد|الأستاذ|الاستاذ|شركة|شركه|بنك|مصرف)\s+([^،,;؛\n\|]+)/i
  ];
  for(const pattern of patterns){
   const match=raw.match(pattern);
   if(!match||!match[1])continue;
   const name=String(match[1]).replace(/^(?:السيد|الأستاذ|الاستاذ)\s+/,"").replace(/\s+(?:بموجب|بمقتضى|رقم|عقد|بتاريخ|تاريخ|دفعة|الدفعة|مرجع|حساب|بقيمة)\b[\s\S]*$/i,"").replace(/[.؛،,]+$/,"").trim();
   if(name.length>=2&&!/^(?:بنكي|شخصي|تمويل|قرض|سلفة)$/i.test(name))return name.slice(0,180);
  }
  return "";
 };
 const analyticPickerWithAdd=(label,type,value,onChange,options,searchKey,description)=>{
  if(type==="employeeAdvance"||type==="employeeCustody"){
   const kind=type==="employeeAdvance"?"employeeAdvances":"employeeCustodies",labelText=type==="employeeAdvance"?"السلفة":"العهدة";
   return searchablePicker(label,value,next=>{if(next==="__quick_add__"){openQuickAdd(kind,(code,record)=>{if(record)onChange(String(record.employeeUid||record.code||code||""));},{});return;}onChange(next);},(options||[]).concat([{value:"__quick_add__",label:"＋ إضافة كود "+labelText+" جديد"}]),searchKey);
  }
  if(type==="financingParty")return searchablePicker(label,value,next=>{
   if(next==="__quick_add__"){openQuickAdd("financingParties",onChange,{name:extractFinancingPartyName(description)});return;}
   onChange(next);
  },(options||[]).concat([{value:"__quick_add__",label:"＋ إضافة جهة تمويل جديدة"}]),searchKey);
  if(type==="securityDepositParty")return searchablePicker(label,value,next=>{
   if(next==="__quick_add__"){openQuickAdd("securityDepositParties",onChange,{});return;}
   onChange(next);
  },(options||[]).concat([{value:"__quick_add__",label:"＋ إضافة جهة تأمينات مستردة جديدة"}]),searchKey);
  const partyKind=type==="customer"?"customer":type==="vendor"?"vendor":"";
  if(!partyKind)return searchablePicker(label,value,onChange,options,searchKey);
  const addLabel=partyKind==="vendor"?"＋ إضافة مورد":"＋ إضافة عميل";
  return searchablePicker(label,value,next=>{
   if(next==="__quick_add__"){openQuickAdd("parties",onChange,{partyType:partyKind});return;}
   onChange(next);
  },(options||[]).concat([{value:"__quick_add__",label:addLabel}]),searchKey);
 };
 const openQuickAdd=(kind,onCreated,defaults,originalCode)=>{
  if(!canFinance(financeAreaForMaster(kind),originalCode?"edit":"add")){setError("ليس لديك صلاحية إضافة أو تعديل هذا النوع من البيانات.");return;}
  if(quickAddType)setQuickAddParent({type:quickAddType,form:quickAddForm,target:quickAddTarget,originalCode:quickAddOriginalCode});else setQuickAddParent(null);
  setQuickAddType(kind);setQuickAddTarget(()=>onCreated||null);setQuickAddOriginalCode(String(originalCode||''));
  const next=Object.assign({
   code:'',name:'',active:true,companyName:'',englishName:'',employeeUid:'',type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',
   unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',warehouseCode:'default',projectCode:'',
   taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'',phone:'',mobile:'',alternatePhone:'',
   taxNumber:'',taxRegistrationNumber:'',commercialRegister:'',contactPerson:'',contactTitle:'',email:'',
   alternateEmail:'',whatsapp:'',website:'',city:'',country:'',postalCode:'',paymentTerms:'',
   creditLimit:'',currency:'EGP',bankName:'',bankAccount:'',iban:'',address:'',notes:''
  },defaults||{});
  if(!next.code)next.code=getCodeSuggestion(kind,next).code;
  if(kind==='parties'){
   const supplied=String(next.partyType||'').toLowerCase();
   next.partyType=['vendor','supplier'].includes(supplied)?'vendor':
    ['customer','client'].includes(supplied)?'customer':
    (invoice.type==='purchase'?'vendor':'customer');
   next.currency=next.currency||'EGP';
  }
  setQuickAddForm(next);
};
 const openPartyMaster=(onCreated,defaults)=>{
  if(!canFinance("masters","add")){setError("ليس لديك صلاحية إضافة عميل أو مورد من البيانات الأساسية.");return;}
  if(typeof props.onOpenPartyMaster==='function'){
   const source=Object.assign({},defaults||{});
   props.onOpenPartyMaster({partyType:source.partyType,defaults:source,onSaved:async record=>{
    setBusy(true);setError('');
    try{
     const partyType=(record.partyType==='vendor'||record.type==='vendor')?'vendor':'customer';
     const code=String(record.code||'').trim(),name=String(record.name||record.companyName||'').trim();
     if(!code||!name)throw new Error('كود واسم المورد/العميل مطلوبان.');
     const item=Object.assign({},record,{code,name,companyName:name,partyType,taxNumber:record.taxNumber||record.taxRegistrationNumber||'',taxRegistrationNumber:record.taxRegistrationNumber||record.taxNumber||''});
     delete item.type;
     const result=await api('', 'POST',{action:'saveMaster',kind:'parties',item});
     if(!result||result.success!==true||!result.item)throw new Error('تعذر ربط الطرف بسجل الحسابات.');
     const latest=await api('?resource=bootstrap'),persisted=latest&&latest.parties&&latest.parties[code];
     if(!persisted||persisted.partyType!==partyType||String(persisted.name||persisted.companyName||'').trim()!==name)throw new Error('تم حفظ الطرف في البيانات الرئيسية، لكن لم يظهر في سجل الحسابات بعد إعادة القراءة. لم يتم اختياره في الفاتورة.');
     const saved=Object.assign({},persisted,result.item);
     setMaster(old=>Object.assign({},old,latest,{parties:Object.assign({},old.parties||{},latest.parties||{})}));
     const refreshedPartyRows=rows(latest.parties||{});
     setClients(refreshedPartyRows.filter(item=>item.partyType==='customer'));
     setVendors(refreshedPartyRows.filter(item=>item.partyType==='vendor'));
     if(typeof onCreated==='function')onCreated(code,saved);
     setNotice('تم حفظ '+(partyType==='vendor'?'المورد':'العميل')+' بنجاح واختياره في الفاتورة.');
     setError('');return saved;
    }catch(error){setError(error.message||String(error));throw error;}
    finally{setBusy(false);}
   }});
  }else openQuickAdd('parties',onCreated,defaults);
 };
 const selectWithAdd=(label,value,onChange,options,kind,defaults,searchKey)=>select(label,value,function(next){if(next==='__quick_add__'){openQuickAdd(kind,onChange,defaults);}else onChange(next);},(options||[]).concat([{value:'__quick_add__',label:'＋ إضافة كود جديد'}]),searchKey);
 const partyPicker=(label,list,value,onChange,query,setQuery,partyType,showResults=true)=>{
  const term=normalizeMatch(query),selected=(list||[]).find(p=>String(p.code||p.id)===String(value||''));
  const findExactParty=raw=>{
   const needle=normalizeMatch(raw);
   if(!needle)return null;
   return (list||[]).find(p=>[p.code,partyName(p),partyTaxNumber(p)].some(candidate=>normalizeMatch(candidate)===needle))||null;
  };
  const updateSearch=raw=>{
   setQuery(raw);
   const exact=findExactParty(raw);
   if(exact){onChange(exact);setQuery(partyName(exact));}
  };
  return h('div',{className:'block text-sm font-bold text-slate-700 min-w-0'},label,
   h('input',{type:'search',value:query||'',onChange:e=>updateSearch(e.target.value),onBlur:e=>{
    const exact=findExactParty(e.target.value);
   if(exact){onChange(exact);setQuery(partyName(exact));}
   else if(value){const prior=(list||[]).find(p=>String(p.code||p.id)===String(value));if(prior)setQuery(partyName(prior));}
   },onKeyDown:e=>{
    if(e.key==='Enter'&&!showResults){e.preventDefault();const exact=findExactParty(e.currentTarget.value);if(exact){onChange(exact);setQuery(partyName(exact));}}
   },placeholder:'ابحث بالاسم أو الكود أو رقم التسجيل الضريبي',className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'}),
   showResults&&selected?h('div',{className:'mt-1 text-xs text-emerald-700'},'المحدد: '+partyName(selected)+' ('+(selected.code||selected.id)+')'):null,
   showResults&&term?h('div',{className:'mt-1 max-h-36 overflow-auto rounded-lg border bg-white'},(list||[]).filter(p=>normalizeMatch([p.code,partyName(p),p.phone,p.mobile,partyTaxNumber(p)].join(' ')).includes(term)).slice(0,8).map(p=>h('button',{key:String(p.code||p.id),type:'button',onClick:()=>{onChange(p);setQuery(partyName(p));},className:'block w-full text-start px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0'},h('b',null,p.code||p.id),' — ',partyName(p),partyTaxNumber(p)?h('small',{className:'block text-slate-500'},'رقم ضريبي: '+partyTaxNumber(p)):null))):null,
   showResults?h('button',{type:'button',onClick:()=>{
    const defaults={code:nextCode(partyType==='vendor'?'VND':'CUS',list),name:String(query||'').replace(/\s*\([^)]*\)\s*$/,''),partyType};
    openPartyMaster((code,createdItem)=>{const p=Object.assign({code,name:query,partyType},createdItem||{});onChange(p);setQuery(partyName(p));},defaults);
   },className:'mt-2 text-xs font-bold text-blue-700 underline'},'＋ تكويد '+(partyType==='vendor'?'مورد':'عميل')+' جديد'):null
  );
 };
 React.useEffect(()=>{
  const request=props.externalPartyRequest;
  if(!masterDirectoryOnly||!request||!request.requestKey)return;
  const partyType=request.partyType==="vendor"?"vendor":"customer";
  const defaults=Object.assign({},request.defaults||{},{partyType});
  openQuickAdd("parties",(code,record)=>{
   const saved=Object.assign({},record||{},{code:String(code||record&&record.code||""),partyType,type:partyType});
   Promise.resolve(typeof request.onSaved==="function"?request.onSaved(saved):undefined)
    .then(()=>{if(typeof props.onPartyMasterRequestComplete==="function")props.onPartyMasterRequestComplete();})
    .catch(error=>setError(error&&error.message||String(error)));
  },defaults);
 },[masterDirectoryOnly,props.externalPartyRequest&&props.externalPartyRequest.requestKey]);
 const saveQuickAdd=async()=>{
  if(!quickAddType||busy)return;
  const requiredAction=quickAddOriginalCode?"edit":"add";
  if(!canFinance(financeAreaForMaster(quickAddType),requiredAction)){setError("ليس لديك صلاحية "+(requiredAction==="edit"?"تعديل":"إضافة")+" هذا النوع من البيانات.");return;}
  setBusy(true);setError('');setNotice('');
  try{
   const f=quickAddForm,kind=quickAddType;
   const item=kind==='parties'?{
    code:String(f.code||'').trim(),name:String(f.name||'').trim(),companyName:String(f.name||'').trim(),active:f.active!==false,
    partyType:f.partyType,phone:f.phone,mobile:f.mobile,alternatePhone:f.alternatePhone,
    taxNumber:f.taxNumber||f.taxRegistrationNumber,taxRegistrationNumber:f.taxNumber||f.taxRegistrationNumber,
    commercialRegister:f.commercialRegister,contactPerson:f.contactPerson,contactTitle:f.contactTitle,
    email:f.email,alternateEmail:f.alternateEmail,whatsapp:f.whatsapp,website:f.website,
    city:f.city,country:f.country,postalCode:f.postalCode,paymentTerms:f.paymentTerms,
    creditLimit:f.creditLimit===''?undefined:n(f.creditLimit),currency:f.currency||'EGP',
    bankName:f.bankName,bankAccount:f.bankAccount,iban:f.iban,address:f.address,notes:f.notes
   }:{
    code:f.code,name:f.name,active:f.active!==false,type:f.type,nature:f.nature,parentCode:f.parentCode,isGroup:f.isGroup,
    subledgerType:f.subledgerType,unit:f.unit,groupCode:f.groupCode,groupType:f.groupType,itemType:f.itemType,
    version:f.version,warehouseCode:f.warehouseCode,projectCode:f.projectCode,taxType:f.taxType,
    rate:n(f.rate),effectiveFrom:f.effectiveFrom,reference:f.reference||"",taxNumber:f.taxNumber||"",notes:f.notes||"",employeeUid:f.employeeUid||"",
    accountCode:kind==='bankAccounts'?(f.accountCode||f.code):undefined
   };
   if(kind==='parties'&&(!item.code||!item.name))throw new Error('أدخل كود واسم المورد/العميل أولاً.');
   if(kind==='parties'&&!['customer','vendor'].includes(item.partyType))throw new Error('حدد نوع الطرف عميل أو مورد.');
   if(kind==='employeeAdvances'||kind==='employeeCustodies'){
    item.code=String(item.code||'').trim().replace(/[.#$\/\[\]]/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'');
    item.name=String(item.name||'').trim();
    if(!item.code)throw new Error('أدخل كودًا صالحًا للسلفة أو العهدة.');
    if(!item.name)throw new Error('اسم السلفة أو العهدة مطلوب.');
   }
   const originalCode=quickAddOriginalCode;
   const result=await api('', 'POST',{action:'saveMaster',kind,item,...(originalCode?{originalCode}:{})});
   if(!result||result.success!==true||!result.item)throw new Error('لم يؤكد الخادم حفظ البيانات. لم يتم إغلاق شاشة الإضافة.');
   let savedItem=result.item;
   if(kind==='parties'){
    const latest=await api('?resource=bootstrap');
    const persisted=latest&&latest.parties&&latest.parties[item.code];
    if(!persisted||String(persisted.code||item.code)!==item.code||persisted.partyType!==item.partyType){
     throw new Error('تم إرسال طلب الحفظ لكن المورد/العميل لم يظهر عند إعادة قراءة البيانات. لم يتم إغلاق الشاشة؛ حاول مرة أخرى أو أرسل رسالة الخطأ للدعم.');
    }
    if(String(persisted.name||persisted.companyName||'').trim()!==item.name){
     throw new Error('تم العثور على كود الطرف لكن الاسم المسترجع لا يطابق البيانات المدخلة. لم يتم إغلاق الشاشة.');
    }
    savedItem=Object.assign({},persisted,result.item);
    setMaster(old=>Object.assign({},old,latest,{parties:Object.assign({},old.parties||{},latest.parties||{})}));
    const refreshedPartyRows=rows(latest.parties||{});
    setClients(refreshedPartyRows.filter(item=>item.partyType==='customer'));
    setVendors(refreshedPartyRows.filter(item=>item.partyType==='vendor'));
   }else if(kind==='securityDepositParties'){
    const latest=await api('?resource=bootstrap');
    const persisted=latest&&latest.securityDepositParties&&latest.securityDepositParties[item.code];
    if(!persisted||String(persisted.code||item.code)!==item.code||persisted.active===false){
     throw new Error('تم إرسال طلب الحفظ لكن جهة التأمينات المستردة لم تظهر في الدليل بعد إعادة القراءة. لم يتم اختيارها في القيد.');
    }
    if(String(persisted.name||'').trim()!==String(item.name||'').trim()){
     throw new Error('اسم جهة التأمينات المستردة المسترجع لا يطابق البيانات المدخلة. لم يتم اختيارها في القيد.');
    }
    savedItem=Object.assign({},persisted,result.item);
    setMaster(old=>Object.assign({},old,latest,{securityDepositParties:Object.assign({},old.securityDepositParties||{},latest.securityDepositParties||{})}));
   }else{
    await refresh();
   }
   const parent=quickAddParent,target=quickAddTarget;
   setError('');
   setNotice(originalCode?'تم حفظ التعديلات على السجل بنجاح.':kind==='parties'
    ?(result.linkedExisting?'تم ربط المورد/العميل بالسجل الرئيسي بنجاح.':'تمت إضافة '+(f.partyType==='vendor'?'المورد':'العميل')+' بنجاح.')
    :'تمت إضافة '+(kind==='securityDepositParties'?'جهة التأمينات المستردة':'الكود')+' بنجاح.');
   if(parent){
    setQuickAddType(parent.type);setQuickAddForm(parent.form);setQuickAddTarget(()=>parent.target||null);setQuickAddOriginalCode(parent.originalCode||'');
    if(target&&savedItem)target(savedItem.code,savedItem);
    setQuickAddParent(null);
   }else{
    setQuickAddType('');setQuickAddOriginalCode('');
    if(target&&savedItem)target(savedItem.code,savedItem);
    setQuickAddTarget(null);setQuickAddParent(null);
   }
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const area=(label,value,onChange)=>h('label',{className:'block text-sm font-bold'},label,h('textarea',{value,onChange:e=>onChange(e.target.value),rows:2,className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal'}));
 const canExportFinancialReport=()=>Boolean(currentUser&&currentUser.role==="admin")||["reports","overview","partyStatements","journal","inventory","tax"].some(area=>canFinance(area,"export"));
 let forceExpandAllFinancialPanels=false;
 const exportSectionContent=(sourceNode,format)=>{
  if(!sourceNode)return;
  const title=String(sourceNode.getAttribute("data-pest-export-title")||"تقرير مالي");
  const clean=sourceNode.cloneNode(true);
  clean.querySelectorAll("[data-pest-export-actions]").forEach(node=>node.remove());
  clean.querySelectorAll("button").forEach(node=>node.replaceWith(document.createTextNode(String(node.innerText||node.textContent||"").trim())));
  clean.querySelectorAll("input,select,textarea").forEach(node=>node.remove());
  const tables=Array.from(clean.querySelectorAll("table"));
  const safeName=value=>String(value||"Financial_Report").replaceAll("/","_").replaceAll(":","_").replaceAll(" ","_").slice(0,70)||"Financial_Report";
  if(format==="excel"){
   const Excel=window.XLSX;
   if(!Excel||!Excel.utils||!Excel.utils.book_new||!Excel.utils.aoa_to_sheet||!Excel.writeFile){setError("مكتبة Excel غير متاحة. حدّث الصفحة ثم حاول مرة أخرى.");return;}
   try{
    const workbook=Excel.utils.book_new();
    workbook.Props={Title:title,Subject:"Pest Platform financial report",Author:currentUser&&(currentUser.fullName||currentUser.username||currentUser.email)||"Pest Platform",CreatedDate:new Date()};
    const datasets=tables.length?tables:[null],sheetNameCounts=new Map();
    datasets.forEach((tableNode,index)=>{
     const rows=[];
     if(tableNode){
      Array.from(tableNode.querySelectorAll("tr")).forEach(row=>{
       const cells=Array.from(row.querySelectorAll("th,td")).map(cell=>String(cell.innerText||cell.textContent||"").replaceAll(String.fromCharCode(10)," ").replaceAll(String.fromCharCode(13)," ").trim());;
       if(cells.length)rows.push(cells);
      });
     }else{
      const lines=String(clean.innerText||clean.textContent||"").split(String.fromCharCode(10)).map(line=>line.trim()).filter(Boolean);
      rows.push([title],...lines.map(line=>[line]));
     }
     const aoa=[[title],[rtl?"تاريخ التصدير":"Exported at",new Date().toLocaleString(rtl?"ar-EG-u-nu-latn":"en-US")],[],...rows];
          const sheet=Excel.utils.aoa_to_sheet(aoa);
     const columnCount=Math.max(1,...aoa.map(row=>row.length)),lastColumn=columnCount-1;
     const cellAt=(row,column)=>Excel.utils.encode_cell({r:row,c:column});
     const columnWidth=column=>Math.min(46,Math.max(12,...aoa.map(row=>String(row[column]===undefined?"":row[column]).length+2)));
     sheet["!views"]=[{RTL:Boolean(rtl),state:"frozen",ySplit:tableNode?4:2,topLeftCell:tableNode?"A5":"A3"}];
     sheet["!cols"]=Array.from({length:columnCount},(_,column)=>({wch:columnWidth(column)}));
     sheet["!rows"]=[{hpt:30},{hpt:20},{hpt:8},{hpt:25}];
     sheet["!merges"]=[{s:{r:0,c:0},e:{r:0,c:lastColumn}}];
     const styleRow=(row,style)=>{for(let column=0;column<columnCount;column++){const address=cellAt(row,column);if(sheet[address])sheet[address].s=style;}};
     styleRow(0,{fill:{patternType:"solid",fgColor:{rgb:"17365D"}},font:{name:"Arial",sz:16,bold:true,color:{rgb:"FFFFFF"}},alignment:{horizontal:"center",vertical:"center"}});
     styleRow(1,{fill:{patternType:"solid",fgColor:{rgb:"EAF0F6"}},font:{name:"Arial",sz:10,color:{rgb:"475569"}},alignment:{horizontal:rtl?"right":"left",vertical:"center"}});
     const bottomBorder={style:"thin",color:{rgb:"D7E0EA"}};
     if(tableNode){
      styleRow(3,{fill:{patternType:"solid",fgColor:{rgb:"1F4E78"}},font:{name:"Arial",sz:10,bold:true,color:{rgb:"FFFFFF"}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{bottom:{style:"medium",color:{rgb:"17365D"}}}});
      for(let rowIndex=4;rowIndex<aoa.length;rowIndex++){
       for(let column=0;column<columnCount;column++){
        const address=cellAt(rowIndex,column);
        if(sheet[address])sheet[address].s={font:{name:"Arial",sz:10,color:{rgb:"1F2937"}},fill:{patternType:"solid",fgColor:{rgb:rowIndex%2===0?"F3F6FA":"FFFFFF"}},alignment:{horizontal:rtl?"right":"left",vertical:"center",wrapText:true},border:{bottom:bottomBorder}};
       }
      }
      if(aoa.length>4)sheet["!autofilter"]={ref:"A4:"+cellAt(aoa.length-1,lastColumn)};
     }
     sheet["!pageSetup"]={orientation:"landscape",fitToWidth:1,fitToHeight:0};
     sheet["!margins"]={left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2};
const panelNode=tableNode&&tableNode.closest("section[data-pest-export-scope='panel']");
     const panelTitle=panelNode&&panelNode.getAttribute("data-pest-export-title")||tableNode&&tableNode.getAttribute("data-pest-export-title")||title;
     const cleanSheetBase=String(panelTitle||"بيانات التقرير").replace(/[\\/?*:[\]]/g," ").trim().slice(0,25)||"Report";
     const sheetSuffix=sheetNameCounts.get(cleanSheetBase)||0;sheetNameCounts.set(cleanSheetBase,sheetSuffix+1);
     const sheetName=(cleanSheetBase+(sheetSuffix?" "+(sheetSuffix+1):"")).slice(0,31);
     Excel.utils.book_append_sheet(workbook,sheet,sheetName);
    });
    Excel.writeFile(workbook,safeName(title)+"_"+new Date().toISOString().slice(0,10)+".xlsx");
    setNotice("تم تصدير "+title+" إلى Excel بنجاح.");
   }catch(error){setError("تعذر تصدير Excel: "+String(error.message||error));}
   return;
  }
  const printWindow=window.open("","_blank");
  if(!printWindow){setError("المتصفح منع فتح نافذة PDF. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.");return;}
  const html='<!doctype html><html lang="'+(rtl?"ar":"en")+'" dir="'+(rtl?"rtl":"ltr")+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#1f2937;direction:'+(rtl?"rtl":"ltr")+';font-size:10pt;margin:0}h1{font-size:18pt;color:#17365d;border-bottom:2px solid #17365d;padding-bottom:8px;margin:0 0 12px}.report-meta{font-size:8pt;color:#64748b;margin-bottom:14px}section{break-inside:auto}.overflow-auto{overflow:visible!important;max-height:none!important}table{width:100%;border-collapse:collapse;direction:'+(rtl?"rtl":"ltr")+';font-size:9pt;margin:8px 0 16px}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:6px;text-align:right;vertical-align:top}th{background:#eaf0f6;font-weight:800}.pest-finance-export-tools{display:none!important}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><h1>'+title.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</h1><div class="report-meta">'+(rtl?"تاريخ التصدير: ":"Exported at: ")+new Date().toLocaleString(rtl?"ar-EG-u-nu-latn":"en-US")+'</div>'+clean.innerHTML+'</body></html>';
  printWindow.document.open();printWindow.document.write(html);printWindow.document.close();
  const startPrint=async()=>{try{if(printWindow.document.fonts&&printWindow.document.fonts.ready)await printWindow.document.fonts.ready;printWindow.focus();window.setTimeout(()=>{try{printWindow.print();}catch(error){setError("تعذرت طباعة التقرير PDF: "+String(error.message||error));}},160);}catch(error){printWindow.focus();printWindow.print();}};
  if(printWindow.document.readyState==="complete")void startPrint();else printWindow.addEventListener("load",()=>void startPrint(),{once:true});
 };
 const exportToolbar=(target,title)=>h("div",{"data-pest-export-actions":"true",className:"pest-finance-export-tools print:hidden flex flex-wrap items-center gap-1 shrink-0"},
  h("button",{type:"button",title:"تصدير الجزء المحدد إلى Excel",onClick:event=>{const node=event.currentTarget.closest("[data-pest-export-scope]");exportSectionContent(node,"excel");},className:"rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"},"Excel"),
  h("button",{type:"button",title:"تصدير الجزء المحدد إلى PDF",onClick:event=>{const node=event.currentTarget.closest("[data-pest-export-scope]");exportSectionContent(node,"pdf");},className:"rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100"},"PDF")
 );
 const panel=(title,sub,child)=>{
  const panelKey=String(tab)+'::'+String(title),collapsed=forceExpandAllFinancialPanels?false:(collapsedPanels[panelKey]===undefined?true:Boolean(collapsedPanels[panelKey]));
  return h('section',{key:panelKey,'data-pest-export-scope':'panel','data-pest-export-title':String(title),className:'rounded-2xl border bg-white p-4 shadow-sm min-w-0'},
   h('div',{className:'mb-2 flex w-full flex-col gap-2'},
    !collapsed&&canExportFinancialReport()?h('div',{className:'flex justify-end'},exportToolbar(null,title)):null,
    h('button',{type:'button','data-pest-export-actions':'true','aria-expanded':!collapsed,'aria-label':(collapsed?'إظهار القسم: ':'إخفاء القسم: ')+String(title),onClick:()=>setCollapsedPanels(previous=>Object.assign({},previous,{[panelKey]:!collapsed})),className:'w-full min-h-11 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-start text-xs font-bold text-slate-700 hover:bg-slate-100'},
     h('span',{className:'min-w-0 flex-1'},h('span',{className:'block font-bold text-sm'},title),sub?h('span',{className:'block text-xs font-normal text-slate-500 mt-1 leading-5'},sub):null),
     h('span',{className:'shrink-0 inline-flex items-center gap-2'},h('span',null,collapsed?t('إظهار القسم','Show section'):t('إخفاء القسم','Hide section')),h('span',{className:'text-base leading-none'},collapsed?'⌄':'⌃'))
    )
   ),
   collapsed?null:h('div',{className:'mt-3 min-w-0'},child)
  );
 };
 const metric=(label,value)=>h('div',{className:'rounded-xl border bg-white p-3'},h('div',{className:'text-xs text-slate-500'},label),h('strong',{className:'text-xl block mt-1'},value));
 const screenSearchText=node=>{
  if(node===null||node===undefined||typeof node==='boolean')return '';
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(Array.isArray(node))return node.map(screenSearchText).join(' ');
  if(React.isValidElement(node))return screenSearchText(node.props&&node.props.children);
  return '';
 };
 const tableFieldText=(row,headers,kind)=>{
  const cells=Array.isArray(row&&row.props&&row.props.children)?row.props.children:[row&&row.props?row.props.children:null];
  const labels=(headers||[]).map(value=>String(screenSearchText(value)||'').toLowerCase());
  const indices=new Set();
  labels.forEach((label,index)=>{
   const accountColumn=kind==='account'&&(label.includes('حساب')||label.includes('account'));
   const centerColumn=kind==='costCenter'&&(label.includes('مركز التكلفة')||label.includes('مركز تكلفة')||label.includes('cost center')||label.includes('المشروع')||label.includes('project'));
   if(accountColumn||centerColumn)indices.add(index);
  });
  if(kind==='account'){
   Array.from(indices).forEach(index=>{
    if(index>0&&/(كود|code)/.test(labels[index-1]))indices.add(index-1);
    if(index+1<labels.length&&/(كود|code)/.test(labels[index+1]))indices.add(index+1);
   });
  }
  if(!indices.size)return '';
  return Array.from(indices).map(index=>screenSearchText(cells[index])).join(' ');
 };
 const table=(headers,data,scrollStyle)=>{
  const query=normalizeMatch(screenTableSearch||'');
  const accountOption=screenAccountFilterOptions.find(item=>String(item.value)===String(screenAccountFilter||''))||null;
  const centerOption=screenCostCenterFilterOptions.find(item=>String(item.value)===String(screenCostCenterFilter||''))||null;
  const source=Array.isArray(data)?data:[];
  const filtered=source.filter(row=>{
   const rowText=normalizeMatch(screenSearchText(row));
   if(query&&!rowText.includes(query))return false;
   if(accountOption&&accountOption.value){
    const accountText=normalizeMatch(tableFieldText(row,headers,'account'));
    const accountNeedles=[accountOption.value,accountOption.label.split(' — ').slice(1).join(' — ')].map(normalizeMatch).filter(Boolean);
    if(!accountNeedles.some(needle=>accountText.includes(needle)))return false;
   }
   if(centerOption&&centerOption.value){
    const centerText=normalizeMatch(tableFieldText(row,headers,'costCenter'));
    const centerNeedles=[centerOption.value,centerOption.label.split(' — ').slice(1).join(' — ')].map(normalizeMatch).filter(Boolean);
    if(!centerNeedles.some(needle=>centerText.includes(needle)))return false;
   }
   return true;
  });
  const exportTitle=Array.isArray(headers)?headers.slice(0,3).join(" - "):"جدول التقرير";
  const tableScrollStyle=Object.assign({
   maxHeight:'min(62vh, 620px)',
   overflowY:'auto',
   overflowX:'auto',
   overscrollBehavior:'contain',
   scrollbarGutter:'stable'
  },scrollStyle||{});
  return h('div',{'data-pest-export-scope':'table','data-pest-export-title':exportTitle,className:'min-w-0'},
   canExportFinancialReport()?h('div',{className:'flex justify-end mb-1'},exportToolbar(null,exportTitle)):null,
   h('div',{role:'region','aria-label':'جدول '+exportTitle+' — مساحة تمرير مستقلة',tabIndex:0,className:'overflow-auto border rounded-xl max-w-full',style:tableScrollStyle},
    h('table',{dir:rtl?'rtl':'ltr',className:'w-full text-sm text-right'},
     h('thead',{className:'bg-slate-100'},h('tr',null,headers.map(x=>h('th',{key:x,className:'sticky top-0 z-10 bg-slate-100 p-3 whitespace-nowrap text-right align-middle'},x)))),
     h('tbody',null,filtered.length?filtered:h('tr',null,h('td',{colSpan:headers.length,className:'p-4 text-center text-slate-400'},query?'لا توجد نتائج مطابقة للبحث':'لا توجد بيانات')))
    )
   )
  );
 };
 const noticeElement=error?h('div',{className:'rounded-xl bg-rose-50 text-rose-800 border border-rose-200 p-3 text-sm'},error):notice?h('div',{className:'rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 text-sm'},notice):null;
 const saveMaster=async()=>{
  if(!canFinance(masterForm.kind==="chartOfAccounts"?"accounts":financeAreaForMaster(masterForm.kind),masterForm.code&&masterForm.originalCode?"edit":"add")&&!canFinance(masterForm.kind==="chartOfAccounts"?"accounts":financeAreaForMaster(masterForm.kind),"add")){setError("ليس لديك صلاحية إضافة هذا الكود.");return;}
  setBusy(true);setError('');try{
   const f=masterForm,item={code:f.code,name:f.name,type:f.type,nature:f.nature,parentCode:f.parentCode,isGroup:f.isGroup,subledgerType:f.subledgerType,unit:f.unit,groupCode:f.groupCode,version:f.version,projectCode:f.projectCode,warehouseCode:f.warehouseCode,taxType:f.taxType,rate:n(f.rate),effectiveFrom:f.effectiveFrom};
   await api('', 'POST',{action:'saveMaster',kind:f.kind,item});setNotice('تم حفظ الكود');setMasterForm(o=>Object.assign({},o,{code:'',name:''}));await refresh();
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 };
 const activeAnalyticUsers=(userDirectory||[]).filter(user=>user&&user.uid&&["active","نشط","مفعل","enabled"].includes(String(user.status||"").toLowerCase()));
 const analyticTypeForAccount=(account,line)=>{
  const configured=String(account&&account.subledgerType||"").trim();
  if(configured)return configured;
  const normalizedName=String(account&&account.name||"").normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/[ةه]/g,"ه").replace(/ى/g,"ي").replace(/[^ء-ي]/g,"");
  if(normalizedName.includes("تاميناتمسترده")&&normalizedName.includes("الغير"))return "securityDepositParty";
  return String(line&&line.partyType||"").trim();
};
const analyticPartyLabel=type=>({customer:"العميل",vendor:"المورد",employeeCustody:"الموظف صاحب العهدة",employeeAdvance:"الموظف صاحب السلفة",partnerCurrentAccount:"الشريك",financingParty:"جهة التمويل / الدائن",securityDepositParty:"جهة التأمينات المستردة"}[type]||"الطرف التحليلي");
 const analyticPartyOptions=(type,accountCode,currentPartyId)=>{
  let records=[];
  if(type==="customer")records=activeClients.map(item=>({value:String(item.code||item.id),label:partyName(item)+" ("+(item.code||item.id)+")"}));
  else if(type==="vendor")records=activeVendors.map(item=>({value:String(item.code||item.id),label:partyName(item)+" ("+(item.code||item.id)+")"}));
  else if(type==="employeeCustody"||type==="employeeAdvance"){
   const registry=type==="employeeCustody"?rows(master.employeeCustodies):rows(master.employeeAdvances);
   records=registry.filter(item=>item&&item.active!==false).map(item=>({value:String(item.employeeUid||item.code),label:String(item.code||"")+" — "+String(item.name||item.employeeName||"")+(item.employeeUid?"":" — غير مربوط بمستخدم")}));
  }
  else if(type==="partnerCurrentAccount"){
   records=(partnerCurrentAccounts||[]).filter(item=>item&&item.uid&&(!item.accountCode||String(item.accountCode)===String(accountCode))).map(item=>({value:String(item.uid),label:(item.partnerName||item.name||item.username||item.uid)+" ("+item.uid+")"}));
   const partnerIdentity=String(accountCode)==="3202"?user=>String(user.email||"").toLowerCase()==="thabetrabea@gmail.com"||String(user.username||"").toLowerCase()==="thabetrabea":String(accountCode)==="3201"?user=>String(user.username||"").toLowerCase()==="haitham ibrahim mahmoud":()=>false;
   activeAnalyticUsers.filter(partnerIdentity).forEach(user=>records.push({value:String(user.uid),label:(user.fullName||user.username||user.email||user.uid)+" ("+user.uid+")"}));
  }else if(type==="financingParty"){
   records=registeredFinancingParties.filter(item=>item&&item.active!==false).map(item=>({value:String(item.code||item.id),label:"جهة تمويل: "+partyName(item)+" ("+(item.code||item.id)+")"}));
  }else if(type==="securityDepositParty"){
   records=registeredSecurityDepositParties.filter(item=>item&&item.active!==false).map(item=>({value:String(item.code||item.id),label:"جهة تأمينات: "+partyName(item)+" ("+(item.code||item.id)+")"}));
  }
  const unique=[],seen=new Set();
  records.forEach(item=>{if(item.value&&!seen.has(String(item.value))){seen.add(String(item.value));unique.push(item);}});
  if(currentPartyId&&!seen.has(String(currentPartyId))){const employee=["employeeCustody","employeeAdvance"].includes(type)?(userDirectory||[]).find(user=>String(user.uid)===String(currentPartyId)):null;unique.unshift({value:String(currentPartyId),label:employee?"موظف محفوظ حاليًا دون كود — "+String(employee.fullName||employee.username||employee.email||currentPartyId)+" ("+currentPartyId+")":"الطرف المسجل حاليًا ("+currentPartyId+") — تحقق من بياناته"});}
  return [{value:"",label:"اختر "+analyticPartyLabel(type)},...unique];
 };
 const openingAnalyticOptions=(type,accountCode,currentPartyId)=>{
  let records=[];
  if(type==="customer")records=allClients.map(item=>({value:String(item.code||item.id),label:partyName(item)+" ("+(item.code||item.id)+")"}));
  else if(type==="vendor")records=allVendors.map(item=>({value:String(item.code||item.id),label:partyName(item)+" ("+(item.code||item.id)+")"}));
  else if(type==="employeeCustody"||type==="employeeAdvance"){
   const registry=type==="employeeCustody"?rows(master.employeeCustodies):rows(master.employeeAdvances);
   records=registry.filter(item=>item).map(item=>({value:String(item.employeeUid||item.code),label:String(item.code||"")+" — "+String(item.name||item.employeeName||"")+(item.employeeUid?"":" — غير مربوط بمستخدم")+(item.active===false?" — غير نشط":"")}));
  }
  else if(type==="partnerCurrentAccount"){
   records=(partnerCurrentAccounts||[]).filter(item=>item&&item.uid&&(!item.accountCode||String(item.accountCode)===String(accountCode))).map(item=>({value:String(item.uid),label:(item.partnerName||item.name||item.username||item.uid)+" ("+item.uid+")"}));
   const partnerIdentity=String(accountCode)==="3202"?user=>String(user.email||"").toLowerCase()==="thabetrabea@gmail.com"||String(user.username||"").toLowerCase()==="thabetrabea":String(accountCode)==="3201"?user=>String(user.username||"").toLowerCase()==="haitham ibrahim mahmoud":()=>false;
   (userDirectory||[]).filter(user=>user&&user.uid&&partnerIdentity(user)).forEach(user=>records.push({value:String(user.uid),label:(user.fullName||user.username||user.email||user.uid)+" ("+user.uid+")"}));
  }else if(type==="financingParty"){
   records=registeredFinancingParties.map(item=>({value:String(item.code||item.id),label:"جهة تمويل: "+partyName(item)+" ("+(item.code||item.id)+")"+(item.active===false?" — غير نشط":"")}));
  }else if(type==="securityDepositParty"){
   records=registeredSecurityDepositParties.map(item=>({value:String(item.code||item.id),label:"جهة تأمينات: "+partyName(item)+" ("+(item.code||item.id)+")"+(item.active===false?" — غير نشط":"")}));
  }
  const unique=[],seen=new Set();
  records.forEach(item=>{if(item.value&&!seen.has(String(item.value))){seen.add(String(item.value));unique.push(item);}});
  if(currentPartyId&&!seen.has(String(currentPartyId))){const employee=["employeeCustody","employeeAdvance"].includes(type)?(userDirectory||[]).find(user=>String(user.uid)===String(currentPartyId)):null;unique.unshift({value:String(currentPartyId),label:employee?"موظف محفوظ حاليًا دون كود — "+String(employee.fullName||employee.username||employee.email||currentPartyId)+" ("+currentPartyId+")":"طرف محفوظ حاليًا ("+currentPartyId+") — تحقق من بياناته"});}
  return [{value:"",label:"اختر "+analyticPartyLabel(type)},...unique];
};
 const openJournalModal=doc=>{
  const normalizedLines=(doc.lines||[]).map(line=>{
   const account=posting.find(item=>String(item.code)===String(line.accountCode));
   const analyticType=analyticTypeForAccount(account,line);
   if(analyticType==="financingParty"){
    const saved=registeredFinancingParties.find(item=>String(item.code||item.id)===String(line.partyId||""));
    const matched=matchFinancingPartyFromText([line.description,doc.description,doc.reference].join(" "))||saved;
    return Object.assign({},line,{partyType:"financingParty",partyId:matched?String(matched.code||matched.id):""});
   }
   return Object.assign({},line,{partyType:analyticType,partyId:line.partyId||""});
  });
  setJournalModal(Object.assign({},doc));
  setJournalModalDraft({id:doc.id,sourceId:doc.sourceId||"",journalId:doc.journalId||"",type:doc.type||"journal",number:doc.number||doc.journalNumber||'',date:doc.date||today(),description:doc.description||"",reference:doc.reference||"",checkNumber:doc.checkNumber||"",invoiceNumber:doc.invoiceNumber||"",documentNumber:doc.documentNumber||"",currency:doc.currency||"EGP",sourceType:doc.sourceType||"manual",openingBalance:doc.openingBalance===true,inventoryMovementChange:doc.inventoryMovementChange||null,projectCode:doc.projectCode||"",reversalOf:doc.reversalOf||"",revisionOf:doc.revisionOf||"",revisionNotes:doc.revisionNotes||"",reviewReason:doc.reviewReason||doc.reason||"",errors:Array.isArray(doc.errors)?doc.errors.slice():[],warnings:Array.isArray(doc.warnings)?doc.warnings.slice():[],acknowledgeSourceWarnings:Boolean(doc.sourceWarningsAcknowledgedAt),pendingRevisionId:doc.pendingRevisionId||"",revisedByJournalId:doc.revisedByJournalId||"",reversalJournalId:doc.reversalJournalId||"",reversedByJournalId:doc.reversedByJournalId||"",status:doc.status||"posted",lines:normalizedLines});
 };
 const updateJournalModalLine=(index,key,value)=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).map((line,i)=>{if(i!==index)return line;const next=Object.assign({},line,{[key]:value}),account=posting.find(item=>String(item.code)===String(next.accountCode)),type=analyticTypeForAccount(account,next);if(key==="description"&&type==="financingParty"){const match=matchFinancingPartyFromText([value,old.description,old.reference].join(" "));Object.assign(next,{partyType:"financingParty",partyId:match?String(match.code||match.id):""});}return next;})}));
 const updateJournalModalAccount=(index,accountCode)=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).map((line,i)=>{if(i!==index)return line;const currentAccount=posting.find(item=>String(item.code)===String(line.accountCode)),nextAccount=posting.find(item=>String(item.code)===String(accountCode)),currentType=analyticTypeForAccount(currentAccount,line),nextType=analyticTypeForAccount(nextAccount,{}),keepParty=Boolean(nextType&&currentType===nextType&&line.partyId),matched=nextType==="financingParty"?matchFinancingPartyFromText([line.description,old.description,old.reference].join(" ")):null;return Object.assign({},line,{accountCode,partyType:nextType,partyId:matched?String(matched.code||matched.id):keepParty?line.partyId:""});})}));
 const saveJournalModal=async()=>{
  if(!journalModalDraft)return;
  const draft=journalModalDraft;
  const pendingReview=draft.type==="journal"&&["pending_review","needs_correction"].includes(draft.status);
  const openedFromReview=tab==="review"&&pendingReview;
  const archiveCorrection=draft.sourceType==="legacyImport";
  if(!pendingReview){setError("القيد المرحّل لا يُعدّل مباشرة. استخدم «تعديل القيد» لإنشاء نسخة مراجعة مرتبطة بالأصل.");return;}
  if(!canFinance("review","edit")){setError("ليس لديك صلاحية تعديل القيود داخل المراجعة.");return;}
  const missingAnalytic=(draft.lines||[]).map((line,index)=>({line,index,account:posting.find(item=>String(item.code)===String(line.accountCode))})).map(item=>Object.assign({},item,{analyticType:analyticTypeForAccount(item.account,item.line)})).find(item=>item.analyticType&&!String(item.line.partyId||"").trim());
  if(missingAnalytic){setError("السطر "+(missingAnalytic.index+1)+": الحساب "+missingAnalytic.account.code+" — "+missingAnalytic.account.name+" يتطلب اختيار "+analyticPartyLabel(missingAnalytic.analyticType)+". اختر الطرف من قائمة الطرف التحليلي قبل الحفظ.");return;}
  setBusy(true);setError("");
  try{
   const result=await api("","POST",{action:"updateReviewJournal",id:draft.id,acknowledgeSourceWarnings:draft.acknowledgeSourceWarnings===true,journal:{date:draft.date,description:draft.description,reference:draft.reference,checkNumber:draft.checkNumber||"",invoiceNumber:draft.invoiceNumber||"",documentNumber:draft.documentNumber||"",revisionNotes:draft.revisionNotes||""},lines:draft.lines});
   const archiveMoved=archiveCorrection&&result.status==="pending_review";
   const archiveStillNeedsCorrection=archiveCorrection&&result.status==="needs_correction";
   const operationNotice=result.status==="posted"?"تم تصحيح القيد وترحيله بنجاح وتحديث الأستاذ والفترات.":archiveMoved?"تم تصحيح قيد الأرشيف ونقله إلى قائمة المراجعة والاعتماد؛ لن يعود إلى قائمة الاستكمال.":archiveStillNeedsCorrection?"ما زالت هناك أسباب تصحيح: "+(result.errors||[]).join("، "):"تم حفظ التعديلات. حالة القيد الحالية: "+status(result.status||"pending_review")+".";
   setNotice(operationNotice);
   setJournalModal(null);setJournalModalDraft(null);
   let screenRefreshOk=true;
   try{
    if(!await refresh({silent:true,keepBusy:true}))screenRefreshOk=false;
    if(result.status==="posted"){
     setTab("journal");
    }else if(archiveMoved||result.status==="pending_review"&&openedFromReview){
     setTab("review");
     const queue=await refreshReviewQueue(true);
     if(queue){
      const queued=queue.find(row=>String(row.id)===String(draft.id));
      await openReviewItem(queued||{id:draft.id});
     }else screenRefreshOk=false;
    }else if(archiveStillNeedsCorrection){
     setTab("legacyImport");
    }else if(result.status==="needs_correction"){
     setTab("journal");
     const detail=await api("?resource=document&id="+encodeURIComponent(draft.id));
     if(detail.item)openJournalModal(detail.item);
    }
    if(!await loadPeriod({silent:true,keepBusy:true}))screenRefreshOk=false;
   }catch(refreshError){
    screenRefreshOk=false;
    console.warn("Journal edit succeeded, but refreshing the displayed data failed:",String(refreshError&&refreshError.message||refreshError));
   }
   if(!screenRefreshOk)setNotice(operationNotice+" تم حفظ التعديلات على الخادم، لكن تعذر تحديث بعض بيانات الشاشة بعد الحفظ. لا تكرر العملية؛ اضغط «تحديث البيانات» بعد عودة الاتصال.");
  }catch(error){
   let recovered=false;
   if(/تعذر الاتصال بخادم الحسابات|Could not reach the financial API/i.test(String(error&&error.message||error))){
    try{
     const verification=await api("?resource=document&id="+encodeURIComponent(draft.id));
     const current=verification&&verification.item;
     const previousUpdatedAt=Number(draft.updatedAt||draft.createdAt||0),currentUpdatedAt=Number(current&&current.updatedAt||0);
     if(current&&String(current.id||"")===String(draft.id)&&currentUpdatedAt>previousUpdatedAt){
      const recoveredNotice="تم التحقق من الخادم: تم حفظ تعديل القيد بالفعل. الحالة الحالية: "+status(current.status||"غير محددة")+". لا تعِد الحفظ مرة أخرى.";
      setJournalModal(null);setJournalModalDraft(null);
      setTab(current.status==="posted"?"journal":archiveCorrection&&current.status==="needs_correction"?"legacyImport":openedFromReview?"review":"journal");
      setNotice(recoveredNotice);
      let refreshed=await refresh({silent:true,keepBusy:true});
      if(!await loadPeriod({silent:true,keepBusy:true}))refreshed=false;
      if(!refreshed)setNotice(recoveredNotice+" تعذر تحديث الشاشة؛ استخدم «تحديث البيانات» بعد عودة الاتصال.");
      recovered=true;
     }
    }catch(verificationError){console.warn("Could not verify journal edit after a transport failure:",String(verificationError&&verificationError.message||verificationError));}
   }
   if(!recovered)setError(error.message||String(error));
  }
  finally{setBusy(false);}
 };
  const renderReviewJournalEditor=()=>{
  if(tab!=="review"||!journalModal||!journalModalDraft)return null;
  const draft=journalModalDraft,editable=draft.type==="journal"&&["pending_review","needs_correction"].includes(draft.status)&&canFinance("review","edit")&&!draft.inventoryMovementChange;
  const lines=Array.isArray(draft.lines)?draft.lines:[];
  const debit=lines.reduce((sum,line)=>sum+n(line.debit),0),credit=lines.reduce((sum,line)=>sum+n(line.credit),0),difference=debit-credit;
  const editLine=(index,key,value)=>updateJournalModalLine(index,key,value);
  const headerField=(label,value,onChange,type)=>h("label",{className:"block min-w-0 text-[11px] font-semibold leading-tight text-slate-600"},
   h("span",{className:"block truncate"},label),
   h("input",{type:type||"text",value:value==null?"":value,onChange:event=>onChange(event.target.value),disabled:!editable,step:"any",className:"mt-0.5 h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-800 focus:border-blue-500 focus:outline-none"})
  );
  const lineCards=lines.map((line,index)=>{
   const account=posting.find(item=>String(item.code)===String(line.accountCode)),analyticType=analyticTypeForAccount(account,line),analyticOptions=analyticType?analyticPartyOptions(analyticType,line.accountCode,line.partyId):[];
   return h("div",{key:index,className:"grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-slate-50 p-3"},
    h("div",{className:"md:col-span-3 min-w-0"},selectWithAdd("كود / اسم الحساب",line.accountCode||"",value=>{
     const selectedAccount=posting.find(item=>String(item.code)===String(value));
     const currentLine=(journalModalDraft.lines||[])[index]||{},currentAccount=posting.find(item=>String(item.code)===String(currentLine.accountCode));
     const currentType=analyticTypeForAccount(currentAccount,currentLine),nextType=analyticTypeForAccount(selectedAccount,{});
     const keepParty=Boolean(nextType&&currentType===nextType&&currentLine.partyId);
     setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).map((row,i)=>i===index?Object.assign({},row,{accountCode:value,partyType:nextType,partyId:keepParty?row.partyId||"":""}):row)}));
    },posting.map(item=>({value:item.code,label:item.code+" — "+item.name})),"chartOfAccounts",undefined,"review-journal-"+String(draft.id)+"-line-"+index+"-account")),
    h("div",{className:"md:col-span-2"},field("البيان",line.description||"",value=>editLine(index,"description",value))),
    h("div",{className:"md:col-span-1 pest-resizable-number"},field("مدين",line.debit??"",value=>editLine(index,"debit",value),"number")),
    h("div",{className:"md:col-span-1 pest-resizable-number"},field("دائن",line.credit??"",value=>editLine(index,"credit",value),"number")),
    h("div",{className:"md:col-span-1"},selectWithAdd("مركز التكلفة",line.costCenterId||"",value=>editLine(index,"costCenterId",value),[{value:"",label:"بدون مركز تكلفة"}].concat(activeCenters.map(item=>({value:item.code,label:item.code+" — "+item.name}))),"costCenters",undefined,"review-journal-"+String(draft.id)+"-line-"+index+"-center")),
    h("div",{className:"md:col-span-2"},analyticType?analyticPickerWithAdd("الطرف التحليلي — "+analyticPartyLabel(analyticType),analyticType,line.partyId||"",value=>{editLine(index,"partyId",value);editLine(index,"partyType",analyticType);},analyticOptions,"review-journal-"+String(draft.id)+"-line-"+index+"-party",[line.description,draft.description,draft.reference].join(" ")):h("div",{className:"rounded-lg border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-500"},"هذا الحساب لا يتطلب طرفًا تحليليًا")),
    h("div",{className:"md:col-span-1"},field("كود المشروع",line.projectCode||"",value=>editLine(index,"projectCode",value))),
    h("div",{className:"md:col-span-1 flex items-end"},button("حذف السطر",()=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).filter((row,i)=>i!==index)})),"danger",!editable))
   );
  });
  return h("div",{className:"fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3",onClick:()=>{if(!busy){setJournalModal(null);setJournalModalDraft(null);}}},
   h("section",{className:"w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-2xl bg-white p-4 md:p-6 shadow-2xl space-y-4",onClick:event=>event.stopPropagation()},
    h("div",{className:"flex flex-wrap items-center justify-between gap-3"},
     h("div",null,h("h3",{className:"font-extrabold text-xl"},"تعديل قيد المراجعة: "+(draft.number||draft.id)),h("p",{className:"text-xs text-slate-500 mt-1"},"يمكن تعديل الحساب والبيان والمدين والدائن ومركز التكلفة والطرف وإضافة أو حذف سطور.")),
     button("إغلاق",()=>{setJournalModal(null);setJournalModalDraft(null);},"muted",busy)
    ),
    panel("بيانات رأس القيد","يمكن تعديل التاريخ والمرجع وأرقام الشيك والفاتورة والمستند والبيان قبل الاعتماد.",h("div",{className:"grid grid-cols-3 gap-x-2 gap-y-1.5 min-w-0"},
     headerField("تاريخ القيد",draft.date||"",value=>setJournalModalDraft(old=>Object.assign({},old,{date:value})),"date"),
     headerField("المرجع",draft.reference||"",value=>setJournalModalDraft(old=>Object.assign({},old,{reference:value}))),
     headerField("رقم الشيك",draft.checkNumber||"",value=>setJournalModalDraft(old=>Object.assign({},old,{checkNumber:value}))),
     headerField("رقم الفاتورة",draft.invoiceNumber||"",value=>setJournalModalDraft(old=>Object.assign({},old,{invoiceNumber:value}))),
     headerField("رقم المستند",draft.documentNumber||"",value=>setJournalModalDraft(old=>Object.assign({},old,{documentNumber:value}))),
     headerField("بيان القيد",draft.description||"",value=>setJournalModalDraft(old=>Object.assign({},old,{description:value})))
    )),
    h("div",{className:"flex flex-wrap gap-2 text-xs"},
     h("span",{className:"rounded-full bg-slate-100 px-3 py-1"},"المصدر: "+(draft.sourceType||"manual")),
     h("span",{className:"rounded-full bg-amber-50 text-amber-800 px-3 py-1"},"الحالة: "+status(draft.status)),
     h("span",{className:"rounded-full bg-indigo-50 text-indigo-800 px-3 py-1"},"العملة: EGP")
    ),
    draft.status==="needs_correction"||draft.reviewReason||(draft.errors||[]).length?h("div",{className:"rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 space-y-1"},h("strong",null,"أسباب حاجة القيد إلى التصحيح"),draft.reviewReason?h("p",null,draft.reviewReason):null,(draft.errors||[]).length?h("ul",{className:"list-disc pr-5"},(draft.errors||[]).map((reason,index)=>h("li",{key:index},reason))):null):null,
    (draft.warnings||[]).length?h("div",{className:"rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"},h("strong",null,"ملاحظات الفحص"),h("ul",{className:"list-disc pr-5"},draft.warnings.map((reason,index)=>h("li",{key:index},reason)))):null,
    draft.sourceType==="journalRevision"?h("label",{className:"block text-sm font-bold"},"ملاحظات التعديل / سبب إرجاع القيد",h("textarea",{value:draft.revisionNotes||"",onChange:event=>setJournalModalDraft(old=>Object.assign({},old,{revisionNotes:event.target.value})),rows:3,disabled:!editable,className:"mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal"})):null,
    draft.sourceType==="legacyImport"&&(draft.warnings||[]).length?h("div",{className:"rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2"},h("b",{className:"text-amber-900"},"ملاحظات المصدر التي يجب مراجعتها قبل الاعتماد"),h("ul",{className:"list-disc pr-5 text-sm text-amber-900"},(draft.warnings||[]).map((warning,index)=>h("li",{key:index},warning))),h("label",{className:"flex items-start gap-2 text-sm font-bold text-amber-950"},h("input",{type:"checkbox",checked:Boolean(draft.acknowledgeSourceWarnings||draft.sourceWarningsAcknowledgedAt),disabled:!editable,onChange:event=>setJournalModalDraft(old=>Object.assign({},old,{acknowledgeSourceWarnings:event.target.checked}))}),"أؤكد أنني راجعت ملاحظات هذا القيد وصححت تصنيفه أو تحققت من صحته، ويمكن إرساله للمراجعة والاعتماد.")):null,
    h("div",{className:"rounded-xl border border-indigo-100 overflow-hidden"},
     h("div",{className:"flex flex-wrap items-center justify-between gap-2 bg-indigo-50 p-3"},
      h("b",null,"سطور القيد المحاسبي"),
      button("إضافة سطر جديد",()=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).concat([{accountCode:"6100",description:"",debit:0,credit:0,costCenterId:draft.projectCode||"",projectCode:draft.projectCode||"",partyType:"",partyId:""}])})),"primary",!editable||lines.length>=(draft.sourceType==="legacyImport"?500:draft.openingBalance?2000:100))
     ),
     h("div",{className:"space-y-2 p-3"},lineCards.length?lineCards:h("p",{className:"text-sm text-rose-700"},"القيد لا يحتوي على سطور. أضف سطرين على الأقل.")),
     h("div",{className:"grid grid-cols-1 sm:grid-cols-3 gap-2 border-t bg-slate-50 p-3 text-sm"},
      h("b",null,"إجمالي المدين: "+fmt(debit)),
      h("b",null,"إجمالي الدائن: "+fmt(credit)),
      h("b",{className:Math.abs(difference)<0.01?"text-emerald-700":"text-rose-700"},"الفرق: "+fmt(difference))
     )
    ),
    h("p",{className:"rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"},"التعديل لا يرحّل القيد ولا يغيّر أي رصيد. سيظل القيد في قائمة المراجعة، ولن يظهر أثره في الأستاذ أو القوائم إلا بعد اعتماده بنجاح وبعد اجتياز التحقق المحاسبي."),
    h("div",{className:"flex flex-wrap justify-end gap-2"},
     button("إلغاء",()=>{setJournalModal(null);setJournalModalDraft(null);},"muted",busy),
     button(draft.status==="needs_correction"&&(!draft.sourceType||draft.sourceType==="manual")?"حفظ التصحيح وترحيل القيد":"حفظ التعديلات وإبقاء القيد للمراجعة",saveJournalModal,"primary",busy||!editable)
    )
   )
  );
 };
 const startJournalRevision=async(doc,mode)=>{
  if(!doc||!canFinance("journal","edit")||!canFinance("review","edit")){setError("تعديل القيود المرحلة يتطلب صلاحية تعديل اليومية وصلاحية تعديل المراجعة.");return;}
  const sourceType=doc.sourceType||"manual";
  if(sourceType!=="manual"){setError("هذا القيد مرتبط بمستند مصدر. يجب تعديل الفاتورة أو السند أو حركة العهدة الأصلية حتى لا تختل أرصدة المخزون والأطراف.");return;}
  if(doc.pendingRevisionId||doc.revisedByJournalId||doc.reversalJournalId||doc.reversedByJournalId){setError("هذا القيد لديه تعديل معلّق أو تعديل/عكس سابق؛ راجع القيد المرتبط قبل إنشاء طلب جديد.");return;}
  const actionLabel=mode==="return"?"إرجاع القيد للمراجعة":"تعديل القيد";
  if(!window.confirm(actionLabel+" "+(doc.number||doc.id)+"؟ سيتم إنشاء نسخة مراجعة مستقلة مرتبطة بالقيد الأصلي. سيظل القيد الأصلي وأثره في الأستاذ كما هما حتى اعتماد التعديل."))return;
  setStatementJournalId('');
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api("","POST",{action:"createJournalRevision",id:doc.id,mode});
   await refresh();await loadPeriod();
   if(mode==="edit"){
    setNotice("تم فتح نسخة تعديل القيد وإرسالها لمسار المراجعة. عدّل الحسابات والقيم وأضف الملاحظات ثم احفظها.");
    setTab('journal');
    openJournalModal(result.item);
   }else{
    setJournalModal(null);setJournalModalDraft(null);setTab("review");
    const queue=await refreshReviewQueue(true);
    await openReviewItem((queue||[]).find(item=>item.id===result.id)||{id:result.id});
    setNotice("تم إرجاع القيد إلى قائمة المراجعة كنسخة مرتبطة بالأصل. يمكن للمراجع تعديلها أو إعادتها للتصحيح أو اعتمادها.");
   }
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const reverseJournal=async doc=>{
  if(!doc||!canFinance("journal","add")){setError("ليس لديك صلاحية إنشاء قيد عكسي.");return;}
  if(!window.confirm("إنشاء قيد عكسي للقيد "+(doc.id||"")+"؟ سيُرسل القيد العكسي للمراجعة، ولن يتغير القيد الأصلي قبل الاعتماد."))return;
  setStatementJournalId('');
  setBusy(true);setError("");
  try{
   const result=await api("","POST",{action:"reverseJournal",id:doc.id});
   setNotice("تم إنشاء القيد العكسي "+result.id+" وإرساله للمراجعة.");
   setJournalModal(null);setJournalModalDraft(null);await refresh();setTab(canFinance("review","view")?"review":"journal");
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const cancelJournal=async doc=>{
  if(!doc||!canFinance("journal","edit")){setError("ليس لديك صلاحية إلغاء القيد.");return;}
  if(!window.confirm("إلغاء القيد "+(doc.id||"")+"؟ سيُزال من قائمة المراجعة مع الاحتفاظ بسجل الإلغاء."))return;
  setStatementJournalId('');
  setBusy(true);setError("");
  try{
   await api("","POST",{action:"cancelJournal",id:doc.id,reason:"إلغاء من شاشة القيود اليومية"});
   setNotice("تم إلغاء القيد وإزالته من قائمة المراجعة.");
   setJournalModal(null);setJournalModalDraft(null);await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
const unpostJournalDocument=async(doc)=>{
   if(!doc||!canFinance("journal","delete")||!canFinance("review","edit")){setError("فك الترحيل يتطلب صلاحية حذف القيود وصلاحية تعديل المراجعة.");return;}
   const related=[...(journalRecords||[]),...(documents||[])].filter(item=>item&&item.type==="journal"&&(
    String(item.id||"")===String(doc.id||"")||
    String(item.reversalOf||"")===String(doc.id||"")||
    String(item.revisionOf||"")===String(doc.id||"")||
    [item.reversalJournalId,item.reversedByJournalId,item.pendingRevisionId,item.revisedByJournalId].some(value=>String(value||"")===String(doc.id||""))
   ));
   const sourceType=String(doc.sourceType||"manual");
   const linkedText=related.length>1?" سيتم فك ترحيل "+related.length+" قيود مرتبطة.":"";
   const invoiceText=sourceType==="invoice"?" وستعود الفاتورة المصدر إلى قائمة المراجعة بعد إزالة القيد القديم وأثره المحاسبي والمخزني.":"";
   const note=sourceType==="invoice"?"أي قيد عكسي مرتبط بالفاتورة سيُلغى مع عملية فك الترحيل، ويعاد إنشاء المعالجة بعد مراجعة الفاتورة واعتمادها من جديد.":"ستعود القيود اليدوية والقيود العكسية/التعديلات المرتبطة إلى قائمة المراجعة.";
   if(!window.confirm("فك ترحيل القيد "+(doc.number||doc.id)+"؟"+linkedText+invoiceText+"\n"+note+"\nسيتم إزالة الأثر من الأستاذ العام وكشوف الأطراف ومراكز التكلفة والفترات مع الاحتفاظ بسجل التدقيق. لن يتم حذف المستند نهائيًا."))return;
   setStatementJournalId('');
   setBusy(true);setError('');setNotice('');
   try{
    const result=await api('', 'POST',{action:'unpostJournal',id:doc.id,reason:"فك الترحيل من سجل القيود اليومية وإعادة المستند إلى المراجعة"});
    setJournalModal(null);setJournalModalDraft(null);
    await refresh();await loadPeriod();
    if(result.primaryReviewId&&canFinance("review","view")){
     setTab("review");
     const queue=await refreshReviewQueue(true);
     const item=(queue||[]).find(row=>String(row.id)===String(result.primaryReviewId));
     if(item)await openReviewItem(item);else await openReviewItem({id:result.primaryReviewId});
     setNotice("تم فك ترحيل المجموعة المحاسبية وإعادة "+(result.returnedInvoiceIds&&result.returnedInvoiceIds.length?"الفاتورة":"القيد")+" إلى قائمة المراجعة. راجع المستند ثم اعتمده لإعادة الترحيل.");
    }else{
     setTab("journal");
     setNotice("تم فك ترحيل "+(result.unpostedIds||[]).length+" قيد/قيود وإزالة أثرها من الأستاذ وإعادتها لمسار المراجعة.");
    }
    if(Array.isArray(result.warnings)&&result.warnings.length)setNotice((result.warnings||[]).join(" · "));
   }catch(error){setError(error.message||String(error));}
   finally{setBusy(false);}
  };
  const deleteJournalDocument=async(doc)=>{
   if(!canFinance("journal","delete")){setError("ليس لديك صلاحية حذف القيود اليومية.");return;}
   const posted=doc.status==="posted"||journalRecords.some(item=>String(item.id)===String(doc.id)&&item.status==="posted");
   const sourceType=doc.sourceType||"manual",sourceId=String(doc.sourceId||"");
   const sourceInvoice=sourceType==="invoice"?documents.find(item=>String(item.id)===sourceId&&item.type==="invoice"):null;
   const debit=(doc.lines||[]).reduce((sum,line)=>sum+n(line.debit),0),credit=(doc.lines||[]).reduce((sum,line)=>sum+n(line.credit),0);
   const accountLines=(doc.lines||[]).map(line=>String(line.accountCode||"")+" — "+((accounts.find(item=>String(item.code)===String(line.accountCode))||{}).name||"")).filter(Boolean).join("، ");
   const effect=[
    "تأكيد حذف القيد نهائيًا؟",
    "رقم القيد: "+String(doc.number||doc.id||"—")+" | التاريخ: "+String(doc.date||"—"),
    "المصدر: "+journalSourceLabel(doc)+(sourceId?" ("+sourceId+")":""),
    "إجمالي المدين: "+fmt(debit)+" ج.م | إجمالي الدائن: "+fmt(credit)+" ج.م",
    "الحسابات المتأثرة: "+(accountLines||"غير محدد"),
    "سيتم حذف القيد من دفتر الأستاذ والفترة وكشوف الأطراف ومراكز التكلفة، مع الاحتفاظ بنسخة منه في سجل التدقيق."
   ];
   const linkedRefs=[doc.reversalJournalId,doc.reversedByJournalId,doc.revisedByJournalId,doc.pendingRevisionId,doc.reversalOf,doc.revisionOf].filter(Boolean).map(String);
   const knownJournals=[...(journalRecords||[]),...(documents||[])],linkedRecords=new Map();
   knownJournals.forEach(item=>{
    if(!item||!item.id||String(item.id)===String(doc.id))return;
    const itemId=String(item.id);
    if(linkedRefs.includes(itemId)||String(item.reversalOf||"")===String(doc.id)||String(item.revisionOf||"")===String(doc.id))linkedRecords.set(itemId,item);
   });
   if(linkedRecords.size){
    const linkedText=[...linkedRecords.values()].map(item=>String(item.number||item.id)+" ("+(item.status||"غير محدد")+")").join("، ");
    effect.push("سيتم حذف القيد الأصلي وكل القيود المرتبطة به، بما فيها قيد العكس أو التعديل، وإزالة آثارها المحاسبية وطلبات مراجعتها: "+linkedText+".");
   }else if(linkedRefs.length){
    effect.push("هذا القيد مرتبط بقيد أصلي أو عكسي/تعديل؛ سيبحث النظام عن السجلات المرتبطة ويحذفها ضمن نفس العملية.");
   }
   if(sourceType==="legacyImport"&&!posted)effect.push("سيتم مسح القيد المستورد من أرشيف القيود وقائمة المراجعة نهائيًا، مع الاحتفاظ بنسخة كاملة منه في سجل التدقيق.");
   if(sourceType!=="manual"&&posted)effect.push("سيتم إلغاء الأثر المحاسبي للمستند المصدر مباشرة، ولن يتم إنشاء قيد عكسي بانتظار المراجعة.");
   if(sourceType==="invoice"&&posted){
    const stockLines=(sourceInvoice&&sourceInvoice.lines||[]).filter(line=>line&&line.kind==="stock");
    effect.push("الفاتورة المصدر: "+String(sourceInvoice&&sourceInvoice.number||sourceId)+" — سيتم تعليمها كملغاة محاسبيًا وإلغاء حركات المخزون المرتبطة بها.");
    if(stockLines.length)effect.push("عدد بنود المخزون: "+stockLines.length+" — سيتم تعديل كميات وقيم الأصناف في المخازن. إذا كانت هناك مبيعات أو صرف لاحق، قد يظهر رصيد سالب ويجب مراجعة التسوية المخزنية.");
    effect.push("لن يمنع وجود حركات مخزنية لاحقة تنفيذ الحذف بعد تأكيدك؛ سيُسجل أثر هذه الحركات في سجل التدقيق.");
   }
   if(!window.confirm(effect.join("\n")))return;
   setBusy(true);setError('');
   try{
    const result=await api('', 'POST',{action:'deleteJournal',id:doc.id,reason:"حذف مباشر بعد إظهار الأثر المحاسبي"});
    const warningText=Array.isArray(result.inventoryWarnings)&&result.inventoryWarnings.length?" تنبيه المخزون: "+result.inventoryWarnings.join(" | "):"";
    const deletionNotice=(result.deleted?"تم مسح القيد وكل القيود المرتبطة به ("+(result.deletedIds||[doc.id]).length+" قيد/قيود). تم تحديث الأستاذ والفترات وحفظ نسخة تدقيقية.":"تعذر تأكيد حذف القيد.")+(result.sourceCancelled?" تم إلغاء المستند المصدر محاسبيًا.":"")+warningText;
    setNotice(deletionNotice);
    setJournalModal(null);setJournalModalDraft(null);setSelected(null);
    let screenRefreshOk=true;
    if(!await refresh({silent:true,keepBusy:true}))screenRefreshOk=false;
    if(!await loadPeriod({silent:true,keepBusy:true}))screenRefreshOk=false;
    if(!screenRefreshOk)setNotice(deletionNotice+" تم الحذف على الخادم، لكن تعذر تحديث بعض بيانات الشاشة. اضغط تحديث البيانات بعد عودة الاتصال.");
   }
   catch(e){setError(e.message||String(e));}
   finally{setBusy(false);}
  };
const submitJournal=async()=>{
  if(!canFinance("journal",journal.id?"edit":"add")){setError("ليس لديك صلاحية حفظ أو تعديل القيود اليومية.");return;}
  const missingAnalytic=(journal.lines||[]).map((line,index)=>({line,index,account:posting.find(account=>String(account.code)===String(line.accountCode))})).find(item=>item.account&&item.account.subledgerType&&!String(item.line.partyId||"").trim());
  if(missingAnalytic){setError("السطر "+(missingAnalytic.index+1)+": الحساب "+missingAnalytic.account.code+" — "+missingAnalytic.account.name+" يتطلب اختيار "+analyticPartyLabel(missingAnalytic.analyticType)+". اختر الطرف التحليلي قبل الحفظ.");return;}
  setBusy(true);setError('');
  try{
   const payload=Object.assign({},journal),selectedFiles=journalFiles.slice();
   const result=await api('', 'POST',Object.assign({action:'submitJournal'},payload));
   let attachmentResult={uploaded:0,failures:[]};
   if(selectedFiles.length){
    if(result.id)attachmentResult=await uploadJournalAttachments(selectedFiles,{id:result.id,type:'journal',status:result.status},{keepBusy:true,quiet:true});
    else attachmentResult={uploaded:0,failures:selectedFiles.map(file=>(file.name||'ملف')+': لم يرجع الخادم رقم القيد لربط المرفق.')};
   }
   const saveMessage=result.status==='pending_review'?'تم إرسال القيد إلى المراجعة':'تم حفظ القيد مع أخطاء: '+(result.errors||[]).join('، ');
   const attachmentMessage=attachmentResult.uploaded?' تم رفع '+attachmentResult.uploaded+' مرفق وربطها بالقيد بنجاح.':'';
   setNotice(saveMessage+attachmentMessage);
   if(result.status==='pending_review')setJournal({id:'',date:today(),description:'',reference:'',checkNumber:'',invoiceNumber:'',documentNumber:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});
   else setJournal(old=>Object.assign({},old,{id:result.id}));
   setJournalFiles([]);
   await refresh();
   if(attachmentResult.failures.length)setError('تم حفظ القيد، لكن تعذر رفع بعض المرفقات: '+attachmentResult.failures.join(' · ')+'. افتح القيد من قائمته واستخدم «إضافة مرفق للقيد» لإعادة رفع الملفات المتبقية.');
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const submitInvoice=async()=>{
  if(!canFinance("invoices",invoice.id?"edit":"add")){setError("ليس لديك صلاحية إرسال أو تعديل الفواتير.");return;}
  setBusy(true);setError('');
  try{
   const payload=invoicePayload();
   const result=await api('', 'POST',Object.assign({action:'submitInvoice'},payload));
   const queued=['pending_review','duplicate_review'].includes(result.status);
   let attachmentError='',savedAttachment=null;
   if(result.id&&invoiceFile){
    try{
     savedAttachment=await saveInvoiceAttachment(invoiceFile,result.id);
     setInvoiceFile(null);
    }catch(e){
     attachmentError=e.message||String(e);
     await api('', 'POST',{action:'setAttachmentUploadStatus',documentId:result.id,status:'pending',fileName:invoiceFile.name||'',error:attachmentError}).catch(()=>null);
    }
   }
   if(queued){
    setInvoice(blankInvoice(invoice.type));
    setInvoiceTypeManuallySelected(false);
    setInvoiceFile(null);setInvoicePartySearch('');setOcrSuggestions({party:null,items:[]});
    setTab(canFinance("review","view")?'review':'invoices');
    setSelected(Object.assign({},payload,{id:result.id,type:'invoice',invoiceType:payload.type,status:result.status,total:result.totals&&result.totals.total||0,createdAt:Date.now(),attachments:savedAttachment?{[savedAttachment.id]:savedAttachment}:{},attachmentUploadStatus:attachmentError?'pending':'',attachmentFileName:attachmentError&&invoiceFile?invoiceFile.name:'',attachmentUploadError:attachmentError}));
    setNotice(attachmentError
     ?'تم حفظ الفاتورة وإدراجها في قائمة المراجعة بنجاح. تعذر رفع المرفق حاليًا؛ افتح الفاتورة من المراجعة واختر إعادة رفع المرفق.'
     :'تم حفظ الفاتورة وإرسالها للمراجعة. سيتم إنشاء وترحيل القيد بعد الاعتماد.');
   }else{
    setInvoice(o=>Object.assign({},o,{id:result.id}));
    setNotice('الفاتورة محفوظة وتحتاج تصحيح: '+(result.errors||[]).join('، ')+(attachmentError?' · تعذر رفع المرفق: '+attachmentError:'')+'. لم تدخل قائمة المراجعة؛ استكمل الأخطاء ثم أرسلها مرة أخرى.');
   }
   await refresh();
   if(queued&&canFinance("review","view")){
    setTab('review');
    setSelected(old=>old&&old.id===result.id?Object.assign({},old,{attachmentUploadStatus:attachmentError?'pending':'',attachmentFileName:attachmentError&&invoiceFile?invoiceFile.name:'',attachmentUploadError:attachmentError,attachments:savedAttachment?Object.assign({},old.attachments||{},{[savedAttachment.id]:savedAttachment}):old.attachments||{}}):old);
   }
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const loadInvoicePdfJs=async()=>{
  if(window.pdfjsLib)return window.pdfjsLib;
  if(!window.__pestInvoicePdfJsPromise){
   window.__pestInvoicePdfJsPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async=true;
    script.onload=()=>window.pdfjsLib?resolve(window.pdfjsLib):reject(new Error('مكتبة PDF لم تكتمل.'));
    script.onerror=()=>reject(new Error('تعذر تحميل قارئ PDF. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.'));
    document.head.appendChild(script);
   });
  }
  return window.__pestInvoicePdfJsPromise;
 };
 const readInvoiceFileAsDataUrl=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('تعذرت قراءة ملف الفاتورة.'));reader.readAsDataURL(file);
 });
 const readImage=async file=>{
  const selectedFile=file||invoiceFile;
  if(!selectedFile){setError('اختر صورة أو ملف PDF للفاتورة أولاً.');return;}
  const isPdf=selectedFile.type==='application/pdf'||/\.pdf$/i.test(selectedFile.name||'');
  const isImage=['image/jpeg','image/png','image/webp'].includes(String(selectedFile.type||'').toLowerCase());
  if(!isPdf&&!isImage){setError('الصيغ المدعومة للقراءة: PDF وJPG وPNG وWebP.');return;}
  setBusy(true);setError('');setNotice(isPdf?'جارٍ فتح ملف PDF وتحليل صفحاته...':'جارٍ قراءة صورة الفاتورة...');
  try{
   const expenseAccounts=posting.filter(account=>account.type==='expense').map(account=>({code:account.code,name:account.name}));
   const pageResults=[],pdfPageTexts=[];let totalPdfPages=0,pagesRead=0;
   if(isPdf){
    const pdfjs=await loadInvoicePdfJs();
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await selectedFile.arrayBuffer())}).promise;
    if(!pdf.numPages)throw new Error('ملف PDF لا يحتوي على صفحات.');
    totalPdfPages=pdf.numPages;
    const pagesToRead=Math.min(pdf.numPages,12);pagesRead=pagesToRead;
    for(let pageNumber=1;pageNumber<=pagesToRead;pageNumber++){
     setNotice('جارٍ تحليل صفحة '+pageNumber+' من '+pagesToRead+'...');
     const page=await pdf.getPage(pageNumber);
     const textContent=await page.getTextContent();
     const pageText=(textContent.items||[]).map(item=>item.str||'').filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
     pdfPageTexts.push(pageText);
     let result;
     if(pageText.length>=100){
      result=await api('', 'POST',{action:'ocrText',text:pageText,pageNumber,totalPages:pdf.numPages,expenseAccounts});
     }else{
      const baseViewport=page.getViewport({scale:1});
      const scale=Math.min(2.25,1500/Math.max(baseViewport.width,baseViewport.height));
      const viewport=page.getViewport({scale:Math.max(1,scale)});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d',{alpha:false});
      if(!context)throw new Error('تعذر تجهيز صفحة PDF للتحليل.');
      await page.render({canvasContext:context,viewport}).promise;
      const image=canvas.toDataURL('image/jpeg',0.86);
      canvas.width=0;canvas.height=0;
      result=await api('', 'POST',{action:'ocr',image,pageNumber,totalPages:pdf.numPages,expenseAccounts});
     }
     pageResults.push(Object.assign({},result.extracted||{},parseEtaInvoiceParties(pageText)));
    }
   }else{
    const image=await readInvoiceFileAsDataUrl(selectedFile);
    const result=await api('', 'POST',{action:'ocr',image,pageNumber:1,totalPages:1,expenseAccounts});
    pageResults.push(result.extracted||{});
   }
   const x={items:[]};
   ['type','number','date','partyName','taxNumber','issuerName','issuerTaxNumber','recipientName','recipientTaxNumber','currency','netTotal','taxRate','taxAmount','total','discount'].forEach(key=>{
    pageResults.forEach(page=>{if(page&&page[key]!==undefined&&page[key]!==null&&page[key]!=='')x[key]=page[key];});
   });
   pageResults.forEach(page=>{if(Array.isArray(page&&page.items))x.items.push(...page.items);});
   const internalInvoiceNumber=pdfPageTexts.map(parseInternalInvoiceNumber).find(Boolean);
   if(internalInvoiceNumber)x.number=internalInvoiceNumber;
   const modelDirection=x.type==='sales'?'sales':x.type==='purchase'?'purchase':'';
   const detectedDirection=detectEtaInvoiceDirection(x);
   const nextType=invoiceTypeManuallySelected?invoice.type:(detectedDirection||invoice.type);
   const directionMismatch=Boolean(detectedDirection&&detectedDirection!==nextType);
   const targetPartyType=nextType==='purchase'?'vendor':'customer',partyList=targetPartyType==='vendor'?allVendors:allClients;
   const identifiedPartyDirection=detectedDirection||modelDirection;
   const extractedParty=String((identifiedPartyDirection==='purchase'?x.issuerName:identifiedPartyDirection==='sales'?x.recipientName:'')||x.partyName||'').trim();
   const taxNumber=String((identifiedPartyDirection==='purchase'?x.issuerTaxNumber:identifiedPartyDirection==='sales'?x.recipientTaxNumber:'')||x.taxNumber||'').trim();
   const partyTax=p=>normalizeTaxRegistrationNumber(p.taxNumber||p.taxRegistrationNumber||p.registrationNumber||p.registrationNo||p.vatNumber||p.taxId||'');
   const matchedParty=directionMismatch?null:(partyList.find(p=>taxNumber&&partyTax(p)===normalizeTaxRegistrationNumber(taxNumber))||partyList.find(p=>normalizeMatch(partyName(p))===normalizeMatch(extractedParty)));
   const unmatchedItems=[];
   const extractedLines=Array.isArray(x.items)?x.items.map((line,index)=>{
    const description=String(line.description||'').trim();
    const service=line.kind==='service'||line.suggestedKind==='service';
    const suggestedExpense=posting.find(account=>account.type==='expense'&&String(account.code)===String(line.suggestedExpenseCode||line.expenseAccountCode||''));
    const matchedItem=!service&&items.find(item=>normalizeMatch(item.code)===normalizeMatch(line.itemCode)||normalizeMatch(item.name)===normalizeMatch(description));
    if(description&&!service&&!matchedItem)unmatchedItems.push({index,name:description,code:nextCode('ITM',items)});
    return {description,kind:service?'service':'stock',itemCode:matchedItem?matchedItem.code:'',quantity:String(line.quantity||1),unit:line.unit||'قطعة',unitPrice:String(line.unitPrice==null?'':line.unitPrice),discount:String(line.discount||''),accountCode:suggestedExpense?suggestedExpense.code:'6100',incomeAccountCode:'4200',costCenterId:'',warehouseCode:'default'};
   }):[];
   setInvoice(old=>Object.assign({},old,{
    type:nextType,number:x.number||old.number,date:x.date||old.date,partyId:matchedParty?(matchedParty.code||matchedParty.id):'',
    partyName:extractedParty||old.partyName,partyTaxNumber:matchedParty?partyTaxNumber(matchedParty):taxNumber||old.partyTaxNumber,currency:x.currency||old.currency,
    taxCode:defaultVatCodeForInvoice(nextType),taxType:vatTypeForInvoice(nextType),
    taxRate:'14',
    taxAmount:x.taxAmount==null?'':String(x.taxAmount),discount:x.discount==null?old.discount:String(x.discount),
    lines:extractedLines.length?extractedLines:old.lines
   }));
   setInvoicePartySearch(extractedParty);
   setOcrSuggestions({party:extractedParty&&!matchedParty&&!directionMismatch?{name:extractedParty,taxNumber,partyType:targetPartyType,code:nextCode(targetPartyType==='vendor'?'VND':'CUS',partyList)}:null,items:unmatchedItems});
   const pageSummary=isPdf?'اكتملت قراءة '+pagesRead+' من '+totalPdfPages+' صفحة PDF.':'اكتملت قراءة صورة الفاتورة.';
   const detectedLabel=detectedDirection==='purchase'?'فاتورة مشتريات لصالح الشركة':detectedDirection==='sales'?'فاتورة مبيعات صادرة من الشركة':'';
   const directionNotice=detectedDirection
    ?' تم التعرف على '+detectedLabel+' لأن الرقم الضريبي للشركة '+COMPANY_TAX_REGISTRATION_NUMBER+' ظهر في خانة '+(detectedDirection==='purchase'?'Recipients (To) / المستلم':'Issuer (From) / المُصدر')+'.'+(invoiceTypeManuallySelected&&directionMismatch?' لكن تم الإبقاء على اختيارك اليدوي وعدم تغييره.':invoiceTypeManuallySelected?' تم الالتزام باختيارك اليدوي.':' وتم ضبط نوع الفاتورة تلقائيًا.')
    :(modelDirection&&modelDirection!==nextType?' تنبيه: اقتراح النموذج اختلف عن نوع الفاتورة المختار؛ تم الالتزام باختيارك اليدوي.':'');
   setNotice(pageSummary+directionNotice+' راجع بيانات الطرف والبنود والحسابات قبل الإرسال.'+(isPdf?' تم الاحتفاظ بملف PDF الأصلي لربطه بالفاتورة.':'')+(isPdf&&totalPdfPages>pagesRead?' تنبيه: تم تحليل أول 12 صفحة فقط؛ راجع الصفحات المتبقية يدويًا.':''));
  }catch(e){setError('تعذرت قراءة الفاتورة آليًا: '+(e.message||String(e))+' ويمكنك استكمال البيانات يدويًا.');}
  finally{setBusy(false);}
 };
 const saveReviewInvoice=async()=>{
  if(!selected||selected.type!=="invoice"||!canFinance("review","edit")){setError("ليس لديك صلاحية تعديل بيانات الفاتورة أثناء المراجعة.");return;}
  setBusy(true);setError('');
  try{
   const payload={invoiceType:selected.invoiceType,date:selected.date,number:selected.number,partyId:selected.partyId,partyName:selected.partyName,partyTaxNumber:selected.partyTaxNumber,currency:selected.currency,taxCode:defaultVatCodeForInvoice(selected.invoiceType),taxType:vatTypeForInvoice(selected.invoiceType),taxRate:14,taxAmount:selected.taxAmount,otherTaxes:selected.otherTaxes||[],discount:selected.discount,projectCode:selected.projectCode};
   const result=await api('', 'POST',{action:'updateReviewInvoice',id:selected.id,invoice:payload,lines:selected.lines||[]});
   setNotice((result.errors||[]).length?'تم حفظ تصحيحات الفاتورة. ما زالت هناك نواقص ظاهرة للمراجعة قبل الاعتماد.':'تم حفظ التصحيحات وأصبحت الفاتورة جاهزة للاعتماد.');
   await refreshReviewQueue(true);
   await openReviewItem({id:selected.id});
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const reviewAction=async(decision)=>{
  if(!selected)return;
  if(decision==="approve"||decision==="approveDuplicate"||decision==="reject"){
   if(!canFinance("review","approve")){setError("ليس لديك صلاحية اعتماد أو رفض مستندات المراجعة.");return;}
  }else if(!canFinance("review","edit")){setError("ليس لديك صلاحية إعادة المستند للتصحيح.");return;}
  const documentId=selected.id;
  setBusy(true);setError('');
  try{
   const r=await api('', 'POST',{action:'review',id:documentId,decision,reason:decision==='approve'?'تمت المراجعة والاعتماد':decision==='return'?'إعادة للتصحيح':'رفض المستند',allowDuplicate:decision==='approveDuplicate'});
   const operationNotice=r.status==='posted'?'تم الاعتماد والترحيل': 'تم تحديث المستند';
   setNotice(operationNotice);
   setSelected(null);
   let screenRefreshOk=true;
   try{
    if(!await refresh({silent:true,keepBusy:true}))screenRefreshOk=false;
    if(!await loadPeriod({silent:true,keepBusy:true}))screenRefreshOk=false;
   }catch(refreshError){
    screenRefreshOk=false;
    console.warn("Journal review decision succeeded, but refreshing the displayed data failed:",String(refreshError&&refreshError.message||refreshError));
   }
   if(!screenRefreshOk)setNotice(operationNotice+" تم تنفيذ القرار وحفظه على الخادم، لكن تعذر تحديث بعض بيانات الشاشة. لا تكرر الاعتماد؛ اضغط «تحديث البيانات» بعد عودة الاتصال.");
  }catch(error){
   let recovered=false;
   if(/تعذر الاتصال بخادم الحسابات|Could not reach the financial API/i.test(String(error&&error.message||error))){
    try{
     const verification=await api("?resource=document&id="+encodeURIComponent(documentId));
     const current=verification&&verification.item;
     const expectedStatus=decision==="approve"||decision==="approveDuplicate"?"posted":decision==="reject"?"rejected":decision==="return"?"needs_correction":"";
     if(current&&expectedStatus&&current.status===expectedStatus){
      const recoveredNotice=expectedStatus==="posted"?"تم التحقق من الخادم: تم اعتماد وترحيل القيد بالفعل. لا تكرر الاعتماد.":"تم التحقق من الخادم: تم تنفيذ قرار المراجعة بالفعل. لا تكرر الإجراء.";
      setSelected(null);
      setNotice(recoveredNotice);
      let refreshed=await refresh({silent:true,keepBusy:true});
      if(!await loadPeriod({silent:true,keepBusy:true}))refreshed=false;
      if(!refreshed)setNotice(recoveredNotice+" تعذر تحديث الشاشة؛ استخدم «تحديث البيانات» بعد عودة الاتصال.");
      recovered=true;
     }
    }catch(verificationError){console.warn("Could not verify journal review decision after a transport failure:",String(verificationError&&verificationError.message||verificationError));}
   }
   if(!recovered)setError(error.message||String(error));
  }finally{setBusy(false);}
 };
  const submitCash=async()=>{
  setBusy(true);setError('');
  try{const r=await api('', 'POST',Object.assign({action:'submitCash'},cash,{amount:n(cash.amount)}));setNotice('تم تسجيل الحركة وإرسالها للمراجعة. لا تؤثر على الأرصدة قبل الاعتماد.');setCash(o=>Object.assign({},o,{amount:'',description:'',reference:''}));await refresh();}
  catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 };
 const parseBank = async function(file) {
  setBankFile(file);
  setBankRows([]);
  setError('');
  try {
   if (!window.XLSX) throw new Error('مكتبة Excel غير متاحة');
   const workbook = window.XLSX.read(await file.arrayBuffer(), {type:'array', cellDates:true});
   const sheet = workbook.Sheets[workbook.SheetNames[0]];
   const raw = window.XLSX.utils.sheet_to_json(sheet, {defval:''});
   const parsed = raw.map(function(row) {
    const keys = Object.keys(row);
    const get = function(terms) {
     const key = keys.find(function(name) {
      return terms.some(function(term) { return String(name).toLowerCase().includes(term); });
     });
     return key ? row[key] : '';
    };
    let transactionDate = get(['date','تاريخ']);
    if (transactionDate instanceof Date) transactionDate = transactionDate.toISOString().slice(0,10);
    else if (typeof transactionDate === 'number') transactionDate = new Date(Math.round((transactionDate - 25569) * 86400 * 1000)).toISOString().slice(0,10);
    else transactionDate = String(transactionDate || '').slice(0,10);
    const debit = n(get(['debit','مدين','withdrawal','سحب']));
    const credit = n(get(['credit','دائن','deposit','إيداع']));
    const amount = n(get(['amount','مبلغ','value','القيمة'])) || debit || credit;
    const direction = (credit > 0 || (amount > 0 && debit === 0)) ? 'in' : 'out';
    return {date:transactionDate, description:String(get(['description','details','narration','بيان','الوصف']) || ''), reference:String(get(['reference','ref','مرجع']) || ''), amount:amount, direction:direction};
   }).filter(function(item) { return item.date && item.amount > 0; });
   setBankRows(parsed);
   if (!parsed.length) setError('لم يتم التعرف على حركات صحيحة من ملف البنك.');
  } catch (error) { setError(error.message || String(error)); }
 };
 const sendBank=async()=>{
  if(!canFinance("bank","add")){setError("ليس لديك صلاحية استيراد كشوف البنوك.");return;}
  setBusy(true);setError('');
  try{const r=await api('', 'POST',{action:'submitBankImport',bankAccountCode:bankAccount,fileName:bankFile&&bankFile.name,rows:bankRows});setNotice('تم إدخال '+r.rows+' حركة بنكية للمراجعة، منها '+r.duplicates+' تكرارات محتملة.');setBankRows([]);setBankFile(null);await refresh();}
  catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 };
 const masterImportConfig={
  customers:{label:'العملاء',kind:'parties',partyType:'customer',columns:['code','name','phone','taxNumber','email','address']},
  securityDepositParties:{label:'جهات التأمينات المستردة',kind:'securityDepositParties',columns:['code','name','reference','taxNumber','notes']},
  employeeAdvances:{label:'أكواد السلف',kind:'employeeAdvances',columns:['code','name','employeeUid']},
  employeeCustodies:{label:'أكواد العهد',kind:'employeeCustodies',columns:['code','name','employeeUid']},
  suppliers:{label:'الموردون',kind:'parties',partyType:'vendor',columns:['code','name','phone','taxNumber','email','address']},
  itemGroups:{label:'مجموعات الأصناف',kind:'itemGroups',columns:['code','name','groupType']},
  items:{label:'الأصناف المخزنية',kind:'items',columns:['code','name','itemType','unit','groupCode','version','warehouseCode']},
  chartOfAccounts:{label:'دليل الحسابات',kind:'chartOfAccounts',columns:['code','name','type','nature','parentCode','isGroup']},
  costCenters:{label:'مراكز التكلفة',kind:'costCenters',columns:['code','name','projectCode']},
  warehouses:{label:'المخازن',kind:'warehouses',columns:['code','name']},
  bankAccounts:{label:'حسابات البنوك',kind:'bankAccounts',columns:['code','name','accountCode']},
  taxCodes:{label:'الأكواد الضريبية',kind:'taxCodes',columns:['code','name','taxType','rate','effectiveFrom']}
 };
 const downloadMasterTemplate=()=>{
  const config=masterImportConfig[masterImportKind],csv='\uFEFF'+config.columns.join(',')+'\r\n';
  dl('Pest-'+masterImportKind+'-template.csv',csv);
 };
 const parseMasterImport=async file=>{
  if(!file)return;
  setBusy(true);setError('');setMasterImportRows([]);setMasterImportName(file.name);
  try{
   if(!window.XLSX)throw new Error('مكتبة Excel غير متاحة.');
   const workbook=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
   const sheet=workbook.Sheets[workbook.SheetNames[0]];
   const raw=window.XLSX.utils.sheet_to_json(sheet,{defval:''});
   if(!raw.length)throw new Error('الملف لا يحتوي على بيانات.');
   const aliases={
    code:['code','الكود','كود','كود العميل','كود المورد','كود الصنف','رقم الحساب'],
    name:['name','الاسم','اسم','اسم العميل','اسم المورد','اسم الصنف','اسم الحساب'],
    phone:['phone','mobile','الهاتف','تليفون','موبايل','رقم الهاتف'],
    taxNumber:['taxnumber','taxno','الرقم الضريبي','رقم التسجيل الضريبي','التسجيل الضريبي'],
    reference:['reference','رقم مرجعي','المرجع','رقم العقد','رقم الإيصال','رقم المستند'],
    notes:['notes','ملاحظات','بيان إضافي'],
    email:['email','البريد الالكتروني','البريد الإلكتروني'],
    address:['address','العنوان'],
    itemType:['itemtype','تصنيف الصنف','نوع الصنف','تصنيف مخزني'],
    groupType:['grouptype','نوع المجموعة','تصنيف المجموعة'],
    unit:['unit','الوحدة','وحدة القياس'],
    groupCode:['groupcode','كود المجموعة','المجموعة'],
    version:['version','الإصدار','الاصدار'],
    warehouseCode:['warehousecode','كود المخزن','المخزن'],
    accountCode:['accountcode','كود الحساب','الحساب المحاسبي'],
    type:['type','نوع الحساب','نوع'],
    nature:['nature','طبيعة الحساب','الطبيعة'],
    parentCode:['parentcode','الحساب الأب','الحساب الاب','كود الحساب الأب'],
    isGroup:['isgroup','حساب تجميعي','تجميعي'],
    projectCode:['projectcode','كود المشروع','المشروع'],
    taxType:['taxtype','نوع الضريبة'],
    rate:['rate','النسبة','النسبة %'],
    effectiveFrom:['effectivefrom','بداية السريان','تاريخ السريان'],
    employeeUid:['employeeuid','كود الموظف','معرف الموظف','معرّف الموظف','الموظف المرتبط']
   };
   const normalizeHeader=v=>String(v||'').toLowerCase().replace(/[\s_-]+/g,'').trim();
   const rowsOut=raw.map((row,index)=>{
    const keys=Object.keys(row),out={};
    Object.keys(aliases).forEach(fieldName=>{
     const wanted=aliases[fieldName].map(normalizeHeader);
     const key=keys.find(k=>wanted.includes(normalizeHeader(k)));
     if(key!==undefined)out[fieldName]=row[key];
    });
    Object.keys(out).forEach(fieldName=>{if(out[fieldName] instanceof Date)out[fieldName]=out[fieldName].toISOString().slice(0,10);});
    if(out.isGroup!==undefined)out.isGroup=out.isGroup===true||['true','1','yes','نعم'].includes(String(out.isGroup).toLowerCase());
    if(out.type==='أصول')out.type='asset';if(out.type==='التزامات')out.type='liability';if(out.type==='حقوق ملكية')out.type='equity';if(out.type==='إيرادات')out.type='revenue';if(out.type==='مصروفات')out.type='expense';
    if(out.nature==='مدين')out.nature='debit';if(out.nature==='دائن')out.nature='credit';
    if(out.itemType==='بضاعة'||out.itemType==='مخزون عام')out.itemType='stock';
    if(out.itemType==='خامة'||out.itemType==='مواد خام')out.itemType='raw_material';
    if(out.itemType==='منتج تام'||out.itemType==='منتجات تامة')out.itemType='finished_good';
    if(out.itemType==='قطع غيار')out.itemType='spare_part';
    if(out.itemType==='مستهلكات'||out.itemType==='مستهلكات تشغيل')out.itemType='consumable';
    if(out.itemType==='مستلزمات مكتبية')out.itemType='office_supply';
    if(out.groupType==='خامات'||out.groupType==='مواد خام')out.groupType='raw_material';
    if(out.groupType==='منتجات تامة'||out.groupType==='منتج تام')out.groupType='finished_good';
    if(out.groupType==='قطع غيار')out.groupType='spare_part';
    if(out.groupType==='مستهلكات')out.groupType='consumable';
    if(out.groupType==='مستلزمات مكتبية')out.groupType='office_supply';
    if(out.groupType==='تعبئة وتغليف')out.groupType='packaging';
    if(out.groupType==='أخرى')out.groupType='other';
    if(masterImportKind==='items'&&!out.itemType)out.itemType='stock';
    if(masterImportKind==='itemGroups'&&!out.groupType)out.groupType='other';
    if(out.taxType==='قيمة مضافة مدخلات')out.taxType='vat_input';if(out.taxType==='قيمة مضافة مخرجات')out.taxType='vat_output';if(out.taxType==='خصم/استقطاع')out.taxType='withholding';if(out.taxType==='إضافة')out.taxType='addition';
    return out;
   }).filter(row=>row.code||row.name);
   if(!rowsOut.length)throw new Error('لم يتم التعرف على أعمدة الكود والاسم. استخدم النموذج المرفق.');
   if(rowsOut.length>500)throw new Error('الحد الأقصى 500 سجل في الملف الواحد.');
   const invalid=rowsOut.findIndex(row=>!String(row.code||'').trim()||!String(row.name||'').trim());
   if(invalid>=0)throw new Error('الصف '+(invalid+2)+': يجب إدخال الكود والاسم.');
   if(masterImportKind==='chartOfAccounts'&&rowsOut.some(row=>!row.type||!row.nature))throw new Error('يجب تحديد نوع الحساب وطبيعته في كل صف.');
   if(masterImportKind==='taxCodes'&&rowsOut.some(row=>!row.taxType))throw new Error('يجب تحديد نوع الضريبة في كل صف.');
   if(masterImportKind==='items'&&rowsOut.some(row=>!['stock','consumable','spare_part','finished_good','raw_material','office_supply'].includes(row.itemType)))throw new Error('حدد تصنيف كل صنف مخزني من النموذج.');
   if(masterImportKind==='itemGroups'&&rowsOut.some(row=>!['raw_material','finished_good','spare_part','consumable','office_supply','packaging','other'].includes(row.groupType)))throw new Error('حدد نوع كل مجموعة أصناف من النموذج.');
   setMasterImportRows(rowsOut);
   setNotice('تمت قراءة '+rowsOut.length+' سجل. راجع المعاينة ثم اضغط تنفيذ الاستيراد.');
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const submitMasterImport=async()=>{
  const config=masterImportConfig[masterImportKind];
  if(!config||!canFinance(financeAreaForMaster(config.kind),"add")){setError("ليس لديك صلاحية استيراد هذا النوع من البيانات.");return;}
  if(!masterImportRows.length){setError('اختر ملفًا صالحًا وراجع بياناته أولاً.');return;}
  setBusy(true);setError('');
  try{
   const result=await api('', 'POST',{action:'importMasters',kind:config.kind,partyType:config.partyType,rows:masterImportRows});
   setNotice('اكتمل الدمج في '+config.label+': '+(result.created||0)+' سجل جديد، '+(result.updated||0)+' سجل محدث، '+(result.unchanged||0)+' دون تغيير. لم يتم حذف أي سجل من خارج الملف.');
   setMasterImportRows([]);setMasterImportName('');await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const editDoc=doc=>{
  setSelected(null);
  if(doc.type==='journal'){setJournal({id:doc.id,date:doc.date,description:doc.description||'',reference:doc.reference||'',currency:doc.currency||'EGP',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setTab('journal');}
  else if(doc.type==='invoice'){const type=doc.invoiceType||'purchase';setInvoice({id:doc.id,type,date:doc.date,number:doc.number,partyId:doc.partyId,partyName:doc.partyName,partyTaxNumber:doc.partyTaxNumber||'',currency:doc.currency||'EGP',taxCode:defaultVatCodeForInvoice(type),taxType:vatTypeForInvoice(type),taxRate:'14',taxAmount:doc.taxAmount==null?'':String(doc.taxAmount),otherTaxes:(doc.otherTaxes||[]).map(x=>Object.assign({},x)),discount:String(doc.discount||''),projectCode:doc.projectCode||'',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setInvoicePartySearch(doc.partyName||doc.partyId||'');setInvoiceTypeManuallySelected(true);setTab('invoices');}
 };
 const openInvoiceDiagnostic=async diagnostic=>{
   const doc=diagnostic&&diagnostic.doc||diagnostic;
   if(!doc||!doc.id)return;
   setInvoiceDecisionDoc(null);
   const state=String(doc.status||'');
   if(diagnostic&&diagnostic.posted&&diagnostic.journal){
    setSelected(null);setTab('journal');setStatementJournalId('');openJournalModal(diagnostic.journal);return;
   }
   if(['pending_review','duplicate_review'].includes(state)){
    setTab('review');await openReviewItem(doc);return;
   }
   if(state==='assigned'){
    if(String(doc.assignedTo||'')===String(currentUser&&currentUser.uid||'')){
     window.PEST_PENDING_FINANCE_ASSIGNMENT_ID=String(doc.assignmentId||'');
     setTab('assignments');await refreshAssignments();
    }else{
     setInvoiceDecisionDoc(doc);setTab('invoices');
    }
    return;
   }
   if(state==='posted'&&doc.journalId){
    try{
     const result=await api('?resource=document&id='+encodeURIComponent(doc.journalId));
     if(result.item){setSelected(null);setTab('journal');openJournalModal(result.item);return;}
    }catch(error){setError(error.message||String(error));return;}
    setError('الفاتورة مرحّلة لكن القيد المرتبط بها غير متاح للعرض. راجع رقم القيد من شاشة القيود اليومية.');return;
   }
   if(['draft','needs_correction','returned_to_creator'].includes(state)){editDoc(doc);return;}
   setInvoiceDecisionDoc(doc);setTab('invoices');
  };
  const nav=[
 ['overview','ملخص مالي','Financial Summary'],['journal','القيود اليومية','Journal Entries'],['openingBalances','الأرصدة الافتتاحية','Opening Balances'],['review','المراجعة والفحص والاعتماد','Review, Audit & Approval'],['invoices','فواتير العملاء والموردين','Customer & Supplier Invoices'],['assignments','الإجراءات المحولة إليّ','Tasks Assigned to Me'],['partyStatements','كشوف الحسابات والأطراف','Account & Party Statements'],['partnerCurrent','جاري الشركاء',"Partners' Current Accounts"],['masters','دليل الأكواد والبيانات الأساسية','Master Codes & Master Data'],['inventory','حركة وأرصدة المخزون','Inventory Balances & Movements'],['inventoryMovements','حركة المخزن','Inventory Movements'],['cash','الخزينة والتحصيل والسداد','Cash, Receipts & Payments'],['bank','كشوف البنوك','Bank Statements'],['tax','الضرائب','Taxes'],['accountAnalysis','تحليل الحسابات','Account Analysis'],['reports','القوائم المالية','Financial Statements'],['legacyImport','استيراد أرشيف القيود','Legacy Journal Archive Import']
 ];
 const canViewMasterDirectory=()=>["masters","accounts","centers","inventory","bank","tax"].some(area=>canFinance(area,"view"));
 const visibleNav=masterDirectoryOnly?[]:nav.filter(item=>item[0]!=="masters"&&(item[0]==="legacyImport"?(currentUser&&currentUser.role==="admin"):canFinance(financeTabAreas[item[0]],"view")));
 React.useEffect(()=>{
  const area=financeTabAreas[tab],allowed=tab==="masters"?canViewMasterDirectory():!area||canFinance(area,"view");
  if(!allowed){
   const first=nav.find(item=>item[0]!=="masters"&&canFinance(financeTabAreas[item[0]],"view"));
   if(first&&first[0]!==tab)setTab(first[0]);
  }
 },[tab,currentUser&&currentUser.uid]);
 const renderOverview=()=>h('div',{className:'space-y-4'},
  h('div',{className:'grid grid-cols-2 xl:grid-cols-4 gap-3'},
   metric(t('إجمالي المدين','Total Debit'),moneyLabel(trial.reduce((s,x)=>s+x.amount.debit,0))),
   metric(t('إجمالي الدائن','Total Credit'),moneyLabel(trial.reduce((s,x)=>s+x.amount.credit,0))),
   metric(t('صافي الربح / الخسارة','Net Profit / Loss'),moneyLabel(profit)),
   metric(t('بانتظار المراجعة','Pending Review'),String(review.length))
  ),
  h('div',{className:'flex flex-wrap gap-2 items-end'},
   field(t('من شهر','From Month'),period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),
   field(t('إلى شهر','To Month'),period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),
   button(t('تحديث التقارير','Refresh Reports'),loadPeriod,'primary')
  ),
  panel(t('الأداء المالي','Financial Performance'),t('يعتمد الملخص على القيود المرحّلة بالفترة المحددة.','This summary is based on journal entries posted during the selected period.'),
   h('div',{className:'grid md:grid-cols-4 gap-3'},
    metric(t('الإيرادات','Revenue'),moneyLabel(revenue)),
    metric(t('المصروفات','Expenses'),moneyLabel(expenses)),
    metric(t('الأصول','Assets'),moneyLabel(assets)),
    metric(t('الالتزامات','Liabilities'),moneyLabel(liabilities))
   )
  ),
  panel(t('المستندات الأخيرة','Recent Documents'),'',
   table([t('المستند','Document'),t('النوع','Type'),t('التاريخ','Date'),t('الحالة','Status')],documents.slice(0,12).map(x=>h('tr',{key:x.id,className:'border-t'},
    h('td',{className:'p-2'},x.title||x.number||x.id),
    h('td',{className:'p-2'},documentType(x.type)),
    h('td',{className:'p-2'},x.date||'—'),
    h('td',{className:'p-2'},status(x.status))
   )))
  )
 );
const renderJournal = function() {
  const lineCards = journal.lines.map(function(line,index) {
   const account=posting.find(a=>String(a.code)===String(line.accountCode))||{};
   const analyticType=analyticTypeForAccount(account,line);
   const pickerKey="journal-entry-"+String(line.id||index);
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl bg-slate-50 p-2 border'},
    h('div',{className:'md:col-span-3 min-w-0 flex items-end gap-2'},
     h('span',{className:'shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-extrabold text-slate-600'},'السطر '+(index+1)),
     h('div',{className:'min-w-0 flex-1'},searchablePickerWithAdd('الحساب',line.accountCode,function(v){updateJournalLineAccount(index,v);},posting.map(function(a){return {value:a.code,label:a.code+' — '+a.name};}),'chartOfAccounts',pickerKey+'-account'))
    ),
    h('div',{className:'md:col-span-2'},field('البيان',line.description,function(v){updateJ(index,'description',v);})),
    h('div',{className:'md:col-span-1 pest-resizable-number'},field('مدين',line.debit,function(v){updateJ(index,'debit',v);},'number')),
    h('div',{className:'md:col-span-1 pest-resizable-number'},field('دائن',line.credit,function(v){updateJ(index,'credit',v);},'number')),
    h('div',{className:'md:col-span-2'},searchablePickerWithAdd('مركز التكلفة',line.costCenterId,function(v){updateJ(index,'costCenterId',v);},[{value:'',label:'بدون مركز تكلفة'}].concat(activeCenters.map(function(x){return {value:x.code,label:x.code+' — '+x.name};})),'costCenters',pickerKey+'-center')),
    h('div',{className:'md:col-span-2'},analyticType?analyticPickerWithAdd('الطرف التحليلي — '+analyticPartyLabel(analyticType),analyticType,line.partyId||'',function(v){updateJ(index,'partyType',analyticType);updateJ(index,'partyId',v);},analyticPartyOptions(analyticType,line.accountCode,line.partyId),pickerKey+'-party',[line.description,journal.description,journal.reference].join(' ')):h('div',{className:'rounded-lg border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-500'},'هذا الحساب لا يتطلب طرفًا تحليليًا')),
    h('div',{className:'md:col-span-1 flex items-end'},button('حذف',function(){setJournal(function(old){return Object.assign({},old,{lines:old.lines.filter(function(x,j){return j!==index;})});});},'danger',journal.lines.length<=2))
   );
  });
  const addLine = button('＋ إضافة سطر جديد',function(){setJournal(function(old){return Object.assign({},old,{lines:old.lines.concat([{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}])});});});
  const linesPanel = panel('سطور القيد','',h('div',{className:'space-y-2'},...lineCards,addLine));
  const headerPanel = panel('بيانات رأس القيد','رقم الشيك أو الفاتورة أو المستند بيانات اختيارية بحسب طبيعة العملية.',h('div',{className:'grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-2 items-end'},
   h('div',{className:'md:col-span-2'},field('التاريخ',journal.date,function(v){setJournal(function(old){return Object.assign({},old,{date:v});});},'date')),
   h('div',{className:'md:col-span-2'},field('المرجع',journal.reference,function(v){setJournal(function(old){return Object.assign({},old,{reference:v});});})),
   h('div',{className:'md:col-span-2'},field('رقم الشيك',journal.checkNumber||'',function(v){setJournal(function(old){return Object.assign({},old,{checkNumber:v});});})),
   h('div',{className:'md:col-span-2'},field('رقم الفاتورة',journal.invoiceNumber||'',function(v){setJournal(function(old){return Object.assign({},old,{invoiceNumber:v});});})),
   h('div',{className:'md:col-span-2'},field('رقم المستند',journal.documentNumber||'',function(v){setJournal(function(old){return Object.assign({},old,{documentNumber:v});});})),
   h('div',{className:'md:col-span-12'},field('البيان',journal.description,function(v){setJournal(function(old){const description=v,lines=old.lines.map(line=>{const account=posting.find(item=>String(item.code)===String(line.accountCode)),type=analyticTypeForAccount(account,line);if(type!=='financingParty')return line;const match=matchFinancingPartyFromText([line.description,description,old.reference].join(' '));return Object.assign({},line,{partyType:'financingParty',partyId:match?String(match.code||match.id):''});});return Object.assign({},old,{description,lines});});}))
  ));
  const totalsPanel = h('div',{className:'flex flex-wrap gap-4 items-center p-3 bg-white border rounded-xl'},
   h('b',null,'المدين: '+fmt(jDebit)),h('b',null,'الدائن: '+fmt(jCredit)),
   h('b',{className:Math.abs(jDebit-jCredit)<0.01?'text-emerald-700':'text-rose-700'},'الفرق: '+fmt(jDebit-jCredit)),
   button('حفظ وإرسال للمراجعة',submitJournal,'primary',busy||!canFinance("journal",journal.id?"edit":"add"))
  );
  const journalAttachmentsPanel=panel('مرفقات القيد','اختر ملفًا واحدًا أو عدة ملفات. سيتم رفعها وربطها برقم القيد تلقائيًا بعد الحفظ.',h('div',{className:'space-y-3'},
   h('label',{className:'inline-flex items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 cursor-pointer hover:bg-blue-100'},'＋ اختيار مرفقات القيد',
    h('input',{type:'file',multiple:true,accept:'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',disabled:busy,className:'hidden',onChange:event=>{const files=Array.from(event.target.files||[]),accepted=files.filter(file=>file.size<=20*1024*1024),tooLarge=files.length-accepted.length;if(accepted.length)setJournalFiles(previous=>previous.concat(accepted));if(tooLarge)setError('تم تجاهل '+tooLarge+' ملف/ملفات لأن الحد الأقصى لحجم الملف الواحد 20 MB.');event.target.value='';}})),
   journalFiles.length?h('div',{className:'space-y-2'},h('p',{className:'text-xs font-bold text-slate-600'},'عدد الملفات المختارة: '+journalFiles.length),...journalFiles.map((file,index)=>h('div',{key:String(file.name)+'-'+index,className:'flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-xs'},h('span',{className:'min-w-0 break-all'},file.name),button('إزالة',()=>setJournalFiles(previous=>previous.filter((_,i)=>i!==index)),'danger',busy)))):h('p',{className:'text-xs text-slate-500'},'لم يتم اختيار أي مرفقات بعد.'),
   h('p',{className:'text-xs text-slate-500'},'الحد الأقصى 20 MB لكل ملف. الأنواع المدعومة: PDF وJPG وPNG وWebP وDOC وDOCX وXLS وXLSX وCSV وTXT.')
  ));
   const journalMap=new Map();
   documents.filter(function(x){return x.type==='journal';}).forEach(x=>journalMap.set(String(x.id),x));
   journalRecords.forEach(x=>journalMap.set(String(x.id),x));
   const allJournalRows=Array.from(journalMap.values()).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||n(b.postedAt||b.createdAt)-n(a.postedAt||a.createdAt));
   const draftRows=allJournalRows.map(function(x){
    const manual=!(x.sourceType&&x.sourceType!=='manual'),posted=x.status==='posted'||journalRecords.some(j=>j.id===x.id&&j.status==='posted');
    const debit=(x.lines||[]).reduce((sum,line)=>sum+n(line.debit),0),credit=(x.lines||[]).reduce((sum,line)=>sum+n(line.credit),0);
    return h('tr',{key:x.id,className:'border-t hover:bg-slate-50 cursor-pointer',onClick:()=>openJournalModal(x)},
     h('td',{className:'p-2 font-bold'},x.number||x.journalNumber||x.id),
     h('td',{className:'p-2'},x.date||'—'),
     h('td',{className:'p-2 min-w-[220px]'},h('div',{className:'flex flex-wrap items-center gap-2'},h('span',null,x.description||'—'),statementAttachmentAction(x))),
     h('td',{className:'p-2'},journalSourceLabel(x)),
     h('td',{className:'p-2'},(()=>{const rowStatus=posted?'posted':x.status,success=rowStatus==='posted',cancelled=['cancelled','deleted'].includes(String(rowStatus||''));return h('span',{className:'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold '+(success?'border-emerald-200 bg-emerald-50 text-emerald-700':cancelled?'border-rose-200 bg-rose-50 text-rose-700':'border-slate-200 bg-slate-50 text-slate-600')},h('span',{className:'h-2 w-2 rounded-full '+(success?'bg-emerald-500':cancelled?'bg-rose-500':'bg-slate-400')}),status(rowStatus));})()),
     h('td',{className:'p-2 text-end'},fmt(debit)),
     h('td',{className:'p-2 text-end'},fmt(credit)),
     h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-1'},button('فتح القيد',()=>openJournalModal(x),'muted'),posted&&canFinance('journal','delete')&&canFinance('review','edit')?h('button',{type:'button',disabled:busy,onClick:event=>{event.stopPropagation();void unpostJournalDocument(x);},className:'rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50'},'فك الترحيل'):null))
    );
   });
   const draftsPanel=panel('سجل القيود اليومية الموحد','يعرض القيود اليدوية والقيود المرحّلة الناتجة عن فواتير العملاء والموردين والخزينة والبنوك، إضافة إلى قيود أحداث المشروعات والعهد. اضغط أي صف لفتح تفاصيله. التعديل المباشر متاح للقيود اليدوية ومسودات أحداث المشروع والعهد داخل المراجعة، والقيود المرحّلة من المصادر الأخرى تُعالج من المستند الأصلي أو بقيد عكسي.',table(['رقم القيد','التاريخ','البيان','المصدر','الحالة','مدين','دائن','إجراء'],draftRows,{maxHeight:'min(58dvh, 560px)',minHeight:'180px',overflowY:'auto',overscrollBehavior:'auto',overscrollBehaviorY:'auto',scrollbarGutter:'stable'}));
   const modal=journalModal&&journalModalDraft?(()=>{
    const draft=journalModalDraft,manual=!draft.sourceType||draft.sourceType==='manual',posted=draft.status==='posted'||journalRecords.some(x=>x.id===draft.id&&x.status==='posted'),reviewEditable=draft.type==='journal'&&['pending_review','needs_correction'].includes(draft.status)&&!draft.inventoryMovementChange;
    const editable=reviewEditable,modalDebit=(draft.lines||[]).reduce((sum,line)=>sum+n(line.debit),0),modalCredit=(draft.lines||[]).reduce((sum,line)=>sum+n(line.credit),0);
    const modalLines=(draft.lines||[]).map((line,index)=>{
     const account=accounts.find(x=>String(x.code)===String(line.accountCode))||{},analyticType=analyticTypeForAccount(account,line);
     return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-lg border bg-slate-50 p-2'},
      h('div',{className:'md:col-span-3'},editable?selectWithAdd('الحساب',line.accountCode||'',v=>updateJournalModalAccount(index,v),posting.map(x=>({value:x.code,label:x.code+' — '+x.name})),'chartOfAccounts',null,'journal-modal-'+String(draft.id)+'-line-'+index+'-account'):field('الحساب',(line.accountCode||'')+' — '+(account.name||''),()=>{},undefined,{disabled:true})),
      h('div',{className:'md:col-span-2'},field('البيان',line.description||'',v=>updateJournalModalLine(index,'description',v),undefined,editable?undefined:{disabled:true})),
      h('div',{className:'md:col-span-1 pest-resizable-number'},field('مدين',line.debit??'',v=>updateJournalModalLine(index,'debit',v),'number',editable?undefined:{disabled:true})),
      h('div',{className:'md:col-span-1 pest-resizable-number'},field('دائن',line.credit??'',v=>updateJournalModalLine(index,'credit',v),'number',editable?undefined:{disabled:true})),
      h('div',{className:'md:col-span-2'},editable?selectWithAdd('مركز التكلفة',line.costCenterId||'',v=>updateJournalModalLine(index,'costCenterId',v),[{value:'',label:'بدون مركز تكلفة'}].concat(activeCenters.map(x=>({value:x.code,label:x.code+' — '+x.name}))),'costCenters',null,'journal-modal-'+String(draft.id)+'-line-'+index+'-center'):field('مركز التكلفة',line.costCenterId||'بدون',()=>{},undefined,{disabled:true})),
      h('div',{className:'md:col-span-2'},editable&&analyticType?analyticPickerWithAdd('الطرف التحليلي — '+analyticPartyLabel(analyticType),analyticType,line.partyId||'',v=>{setJournalModalDraft(old=>Object.assign({},old,{lines:old.lines.map((x,i)=>i===index?Object.assign({},x,{partyType:analyticType,partyId:v}):x)}));},analyticPartyOptions(analyticType,line.accountCode,line.partyId),'journal-modal-'+String(draft.id)+'-line-'+index+'-party',[line.description,draft.description,draft.reference].join(' ')):field('الطرف التحليلي',analyticType?(line.partyId||'لم يتم اختيار طرف'):'غير مطلوب لهذا الحساب',()=>{},undefined,{disabled:true})),
      h('div',{className:'md:col-span-1 flex items-end'},button('حذف',()=>setJournalModalDraft(old=>Object.assign({},old,{lines:old.lines.filter((x,i)=>i!==index)})),'danger',!editable))
     );
    });
    return h('div',{className:'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3',onClick:()=>{setJournalModal(null);setJournalModalDraft(null);}},
     h('div',{className:'w-full max-w-6xl max-h-[92vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl space-y-3',onClick:e=>e.stopPropagation()},
      h('div',{className:'flex flex-wrap items-center justify-between gap-2'},h('h3',{className:'font-bold text-lg'},'تفاصيل القيد: '+(draft.number||draft.id)),button('إغلاق',()=>{setJournalModal(null);setJournalModalDraft(null);},'muted')),
      panel('بيانات رأس القيد','رقم الشيك والفاتورة والمستند بيانات اختيارية ويمكن تعديلها مع رأس القيد أثناء المراجعة.',h('div',{className:'grid md:grid-cols-3 gap-2'},
       field('التاريخ',draft.date||'',v=>setJournalModalDraft(old=>Object.assign({},old,{date:v})),'date',editable?undefined:{disabled:true}),
       field('المرجع',draft.reference||'',v=>setJournalModalDraft(old=>Object.assign({},old,{reference:v})),undefined,editable?undefined:{disabled:true}),
       field('رقم الشيك',draft.checkNumber||'',v=>setJournalModalDraft(old=>Object.assign({},old,{checkNumber:v})),undefined,editable?undefined:{disabled:true}),
       field('رقم الفاتورة',draft.invoiceNumber||'',v=>setJournalModalDraft(old=>Object.assign({},old,{invoiceNumber:v})),undefined,editable?undefined:{disabled:true}),
       field('رقم المستند',draft.documentNumber||'',v=>setJournalModalDraft(old=>Object.assign({},old,{documentNumber:v})),undefined,editable?undefined:{disabled:true}),
       h('div',{className:'md:col-span-3'},field('البيان',draft.description||'',v=>setJournalModalDraft(old=>Object.assign({},old,{description:v})),undefined,editable?undefined:{disabled:true}))
      )),
      h('div',{className:'flex flex-wrap items-center gap-3 text-sm'},h('b',null,'المصدر: '+journalSourceLabel(draft)),h('b',null,'الحالة: '+status(draft.status)),draft.reversalOf?h('b',null,'قيد عكسي للقيد: '+draft.reversalOf):null,draft.revisionOf?h('b',null,'تعديل للقيد الأصلي: '+draft.revisionOf):null,statementAttachmentAction(draft),journalAttachmentUploadControl(draft)),
      draft.status==='needs_correction'||draft.reviewReason||(draft.errors||[]).length?h('div',{className:'rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 space-y-1'},h('strong',null,'أسباب حاجة القيد إلى التصحيح'),draft.reviewReason?h('p',null,draft.reviewReason):null,(draft.errors||[]).length?h('ul',{className:'list-disc pr-5'},(draft.errors||[]).map((reason,index)=>h('li',{key:index},reason))):null):null,
      (draft.warnings||[]).length?h('div',{className:'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'},h('strong',null,'ملاحظات الفحص'),h('ul',{className:'list-disc pr-5'},draft.warnings.map((reason,index)=>h('li',{key:index},reason)))):null,
      draft.sourceType==='journalRevision'?h('label',{className:'block text-sm font-bold'},'ملاحظات التعديل / سبب إعادة القيد للمراجعة',h('textarea',{value:draft.revisionNotes||'',onChange:e=>setJournalModalDraft(old=>Object.assign({},old,{revisionNotes:e.target.value})),rows:3,disabled:!editable,className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'})):null,
      h('div',{className:'space-y-2'},...modalLines,editable?button('إضافة سطر',()=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).concat([{accountCode:'6100',description:'',debit:0,credit:0,costCenterId:'',partyType:'',partyId:''}])})),'muted'):null),
      h('div',{className:'flex flex-wrap gap-4 rounded-lg border p-3'},h('b',null,'المدين: '+fmt(modalDebit)),h('b',null,'الدائن: '+fmt(modalCredit)),h('b',{className:Math.abs(modalDebit-modalCredit)<0.01?'text-emerald-700':'text-rose-700'},'الفرق: '+fmt(modalDebit-modalCredit))),
      h('div',{className:'flex flex-wrap gap-2'},
       editable?button(draft.status==='needs_correction'&&manual?'حفظ التصحيح وترحيل القيد':'حفظ وإرسال التعديلات للمراجعة',saveJournalModal,'primary',busy):null,
       posted&&canFinance('journal','edit')?button('تعديل القيد',()=>void startJournalRevision(draft,'edit'),'primary',busy||!manual||!canFinance('review','edit')||!!draft.pendingRevisionId||!!draft.revisedByJournalId||!!draft.reversalJournalId||!!draft.reversedByJournalId):null,
       posted&&canFinance('journal','edit')?button('إرجاع للمراجعة',()=>void startJournalRevision(draft,'return'),'muted',busy||!manual||!canFinance('review','edit')||!!draft.pendingRevisionId||!!draft.revisedByJournalId||!!draft.reversalJournalId||!!draft.reversedByJournalId):null,
       posted&&!manual&&draft.sourceType==='invoice'?h('p',{className:'w-full text-xs text-amber-800'},'هذا قيد فاتورة مرحّل؛ يمكنك إنشاء قيد عكسي للمراجعة أو حذف القيد ومصدره. التعديل المباشر يتم بإلغاء القيد ثم إصدار فاتورة صحيحة جديدة.'):null,
        posted&&!manual&&draft.sourceType!=='invoice'?h('p',{className:'w-full text-xs text-amber-700'},'هذا القيد ناتج عن مستند مصدر؛ تتم معالجة التعديل من المستند الأصلي للحفاظ على الأرصدة الفرعية والمخزون.'):null,
       posted&&(manual||draft.sourceType==='invoice')&&canFinance('journal','add')?button('إنشاء قيد عكسي',()=>void reverseJournal(draft),'success',busy||!!draft.reversalJournalId||!!draft.pendingRevisionId||!!draft.revisedByJournalId||!!draft.reversedByJournalId):null,
       !posted?button('إلغاء القيد',()=>void cancelJournal(draft),'muted',busy||!canFinance('journal','edit')):null,
       canFinance('journal','delete')?button(posted&&!manual?'حذف القيد ومصدره':'حذف القيد',()=>void deleteJournalDocument(draft),'danger',busy):null
      )
     )
    );
   })():null;
  return h('div',{className:'space-y-4'},headerPanel,linesPanel,journalAttachmentsPanel,totalsPanel,draftsPanel,modal);
 };
 const renderInvoices = function() {
  const headFields = h('div',{className:'grid md:grid-cols-3 gap-3'},
   select('نوع الفاتورة',invoice.type,function(v){setInvoiceTypeManuallySelected(true);setInvoicePartySearch('');setInvoice(function(old){return Object.assign({},old,{type:v,partyId:'',partyName:'',partyTaxNumber:'',taxCode:defaultVatCodeForInvoice(v),taxType:vatTypeForInvoice(v),taxRate:'14',taxAmount:''});});},[{value:'purchase',label:'مشتريات / مورد'},{value:'sales',label:'مبيعات / عميل'}]),
   select('العملة',invoice.currency||'EGP',function(v){setInvoice(old=>Object.assign({},old,{currency:v}));},[{value:'EGP',label:'EGP — جنيه مصري'}].concat(invoice.currency&&invoice.currency!=='EGP'?[{value:invoice.currency,label:invoice.currency+' — موقوف حتى تفعيل أسعار الصرف'}]:[])),
   field('رقم الفاتورة',invoice.number,function(v){setInvoice(function(old){return Object.assign({},old,{number:v});});}),
   field('التاريخ',invoice.date,function(v){setInvoice(function(old){return Object.assign({},old,{date:v});});},'date'),
   partyPicker(invoice.type==='purchase'?'المورد':'العميل',parties,invoice.partyId,function(p){setInvoice(old=>Object.assign({},old,{partyId:p.code||p.id||'',partyName:partyName(p)||'',partyTaxNumber:partyTaxNumber(p)||''}));},invoicePartySearch,setInvoicePartySearch,invoice.type==='purchase'?'vendor':'customer',false),
   select('المشروع المرتبط',invoice.projectCode,function(v){setInvoice(function(old){return Object.assign({},old,{projectCode:v});});},[{value:'',label:'بدون مشروع'}].concat(projects.filter(p=>p.active!==false).map(function(p){return {value:p.code||p.id,label:(p.name||p.code)+' ('+(p.code||p.id)+')'};}))),
   select('كود ضريبة القيمة المضافة (ثابت 14%)',defaultVatCodeForInvoice(invoice.type),function(){},[{value:defaultVatCodeForInvoice(invoice.type),label:(invoice.type==='purchase'?'مدخلات':'مخرجات')+' — السعر العام 14%'}]),
   h('div',{className:'rounded-lg border bg-slate-50 p-2 text-sm flex flex-col justify-center'},h('span',{className:'text-xs text-slate-500'},'نسبة الكود الثابت'),h('strong',null,'14%')),
   field('الضريبة (قيمة ثابتة اختيارية)',invoice.taxAmount,function(v){setInvoice(function(old){return Object.assign({},old,{taxAmount:v});});},'number'),
   field('خصم الفاتورة',invoice.discount,function(v){setInvoice(function(old){return Object.assign({},old,{discount:v});});},'number'),
   h('div',{className:'md:col-span-3 flex flex-wrap items-end gap-3 p-3 border rounded-xl bg-blue-50/50'},
    h('label',{className:'block text-sm font-bold flex-1 min-w-[220px]'},'صورة / PDF الفاتورة',h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',onChange:function(e){const file=e.target.files&&e.target.files[0]||null;setInvoiceFile(file);setOcrSuggestions({party:null,items:[]});setNotice('');setError('');},className:'block mt-1 w-full text-sm'}),invoiceFile?h('small',{className:'block mt-1 text-slate-600 font-normal'},invoiceFile.name,invoiceFile.type==='application/pdf'?' — سيتم تحليل صفحات PDF وإرفاق الملف الأصلي':' — جاهز للقراءة'):null),
    button(busy?'جارٍ قراءة الفاتورة...':'قراءة الصورة / PDF وملء الحقول',()=>readImage(invoiceFile),'primary',busy||!invoiceFile),
    button('مسح الفاتورة',clearInvoiceEntry,'danger',busy||!!invoice.id&&!canFinance('invoices','delete'))
   )
  );
  const invoiceHead = panel('بيانات الفاتورة','صورة الفاتورة تساعد في استخراج البيانات. كود القيمة المضافة الأساسي ثابت 14%، ويمكن إضافة ضرائب أخرى عند الحاجة.',headFields);
  const otherTaxRows=(invoice.otherTaxes||[]).map(function(tax,index){
   return h('div',{key:'other-tax-'+index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-slate-50 p-3'},
    h('div',{className:'md:col-span-3'},field('وصف الضريبة / الرسم',tax.description||'',v=>updateInvoiceOtherTax(index,'description',v))),
    h('div',{className:'md:col-span-2'},field('النسبة %',tax.rate==null?'':tax.rate,v=>updateInvoiceOtherTax(index,'rate',v),'number')),
    h('div',{className:'md:col-span-2'},field('القيمة الثابتة (اختياري)',tax.amount==null?'':tax.amount,v=>updateInvoiceOtherTax(index,'amount',v),'number')),
    h('div',{className:'md:col-span-3'},selectWithAdd('الحساب المحاسبي',tax.accountCode||'',v=>updateInvoiceOtherTax(index,'accountCode',v),posting.map(a=>({value:a.code,label:a.code+' — '+a.name})),'chartOfAccounts')),
    h('div',{className:'md:col-span-2 flex items-end'},button('حذف الضريبة',()=>setInvoice(old=>Object.assign({},old,{otherTaxes:(old.otherTaxes||[]).filter((x,j)=>j!==index)})),'danger'))
   );
  });
  const otherTaxesPanel=panel('ضرائب ورسوم أخرى (اختياري)','تُحسب النسبة على صافي الفاتورة عند ترك القيمة الثابتة فارغة. اختر حسابًا محاسبيًا لكل ضريبة أو رسم إضافي حتى يظهر منفصلًا في القيد.',h('div',{className:'space-y-2'},...otherTaxRows,button('إضافة ضريبة / رسم آخر',()=>setInvoice(old=>Object.assign({},old,{otherTaxes:(old.otherTaxes||[]).concat([{description:'',taxCode:'',rate:'',amount:'',accountCode:''}])})),'muted')));
  const invoiceRows = invoice.lines.map(function(line,index) {
   const itemOptions=[{value:'',label:'اختر الصنف'}].concat(activeItems.map(function(x){return {value:x.code,label:x.code+' — '+x.name+' '+(x.version||'')};}));
   const expectedAccountType=invoice.type==='purchase'?'expense':'revenue';
   const accountOptions=posting.filter(function(a){return a.type===expectedAccountType;}).map(function(a){return {value:a.code,label:a.code+' — '+a.name};});
   const centerOptions=[{value:'',label:'بدون'}].concat(activeCenters.map(function(x){return {value:x.code,label:x.code+' — '+x.name};}));
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 p-3 border bg-slate-50 rounded-xl'},
    h('div',{className:'md:col-span-3'},field('وصف البند',line.description,function(v){updateI(index,'description',v);})),
    h('div',{className:'md:col-span-2'},select('طبيعة البند',line.kind,function(v){updateI(index,'kind',v);},[{value:'stock',label:'بضاعة / صنف يدخل المخزون'},{value:'service',label:'مصروف أو خدمة لا تدخل المخزون'}])),
    h('div',{className:'md:col-span-2'},line.kind==='stock'?selectWithAdd('كود الصنف',line.itemCode,function(v){updateI(index,'itemCode',v);},itemOptions,'items'):selectWithAdd(invoice.type==='purchase'?'حساب المصروف':'حساب الإيراد',invoice.type==='purchase'?line.accountCode:line.incomeAccountCode,function(v){updateI(index,invoice.type==='purchase'?'accountCode':'incomeAccountCode',v);},accountOptions,'chartOfAccounts',{type:invoice.type==='purchase'?'expense':'revenue',nature:invoice.type==='purchase'?'debit':'credit',parentCode:invoice.type==='purchase'?'6':'4'})),
    h('div',{className:'md:col-span-1'},field('الكمية',line.quantity,function(v){updateI(index,'quantity',v);},'number')),
    h('div',{className:'md:col-span-1'},field('السعر',line.unitPrice,function(v){updateI(index,'unitPrice',v);},'number')),
    h('div',{className:'md:col-span-1'},field('الخصم',line.discount,function(v){updateI(index,'discount',v);},'number')),
    h('div',{className:'md:col-span-1'},selectWithAdd('مركز التكلفة',line.costCenterId,function(v){updateI(index,'costCenterId',v);},centerOptions,'costCenters')),
    h('div',{className:'md:col-span-1 flex items-end'},button('حذف',function(){setInvoice(function(old){return Object.assign({},old,{lines:old.lines.filter(function(x,j){return j!==index;})});});},'danger'))
   );
  });
  const addInvoiceLine = button('إضافة بند',function(){setInvoice(function(old){return Object.assign({},old,{lines:old.lines.concat([{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}])});});});
  const invoiceLines = panel('تصنيف بنود الفاتورة','يمكن أن تحتوي الفاتورة الواحدة على بضاعة تدخل المخزون ومصروفات أو خدمات. حدّد طبيعة كل بند بشكل مستقل، ثم اختر حساب المصروف المناسب.',h('div',{className:'space-y-3'},...invoiceRows,addInvoiceLine));
  const suggestionCards=[];
  if(ocrSuggestions.party)suggestionCards.push(h('div',{className:'flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-amber-50'},h('div',null,h('b',null,'طرف غير مسجل: '+ocrSuggestions.party.name),h('p',{className:'text-xs text-slate-600'},'الكود المقترح '+ocrSuggestions.party.code+' — لن يتم حفظه إلا بعد موافقتك')),button('تكويد الطرف واختياره',()=>{
   const suggested=ocrSuggestions.party;
   openPartyMaster((code,createdItem)=>{
    const saved=createdItem||suggested;
    setInvoice(old=>Object.assign({},old,{partyId:code,partyName:partyName(saved),partyTaxNumber:partyTaxNumber(saved)}));
    setInvoicePartySearch(partyName(saved));
    setOcrSuggestions(old=>Object.assign({},old,{party:null}));
   },{code:suggested.code,name:suggested.name,partyType:suggested.partyType,taxNumber:suggested.taxNumber});
  },'primary')));
  ocrSuggestions.items.forEach(function(item){
   suggestionCards.push(h('div',{key:'suggest-'+item.index,className:'flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-amber-50'},h('div',null,h('b',null,'صنف غير مسجل: '+item.name),h('p',{className:'text-xs text-slate-600'},'الكود المقترح '+item.code+' — يمكنك أيضًا اختيار خدمة/مصروف بدلًا من الصنف المخزني')),button('تكويد الصنف واختياره',()=>openQuickAdd('items',code=>{setInvoice(old=>Object.assign({},old,{lines:old.lines.map((line,index)=>index===item.index?Object.assign({},line,{itemCode:code}):line)}));setOcrSuggestions(old=>Object.assign({},old,{items:old.items.filter(x=>x.index!==item.index)}));},{code:item.code,name:item.name,unit:'قطعة',warehouseCode:'default'}),'primary')));
  });
  const suggestionsPanel=suggestionCards.length?panel('اقتراحات التكويد بعد قراءة الفاتورة','هذه اقتراحات فقط. لا يتم إنشاء عميل أو مورد أو صنف إلا بعد ضغط المستخدم على زر التكويد.',h('div',{className:'space-y-2'},...suggestionCards)):null;
  const previewRows=[];
  const previewCenterOptions=[{value:'',label:'بدون مركز تكلفة (اختياري)'}].concat(activeCenters.map(x=>({value:x.code,label:x.code+' — '+x.name})));
  invoice.lines.forEach(function(line,index){
   const amount=Math.max(0,n(line.quantity)*n(line.unitPrice)-n(line.discount));
   const accountCode=invoice.type==='purchase'?(line.kind==='stock'?'1300':line.accountCode||'6100'):(line.kind==='stock'?'4100':line.incomeAccountCode||'4200');
   const account=accounts.find(a=>a.code===accountCode);
   const accountControl=line.kind==='stock'?h('div',{className:'space-y-1'},h('span',{className:'block font-semibold'},accountCode+' — '+(account&&account.name||'حساب المخزون / المبيعات المرتبط بالصنف')),select('تصنيف البند',line.kind||'stock',v=>updateI(index,'kind',v),[{value:'stock',label:'بضاعة / مخزون'},{value:'service',label:'خدمة / مصروف أو إيراد'}])):h('div',{className:'space-y-1'},selectWithAdd('الحساب',accountCode,v=>updateI(index,invoice.type==='purchase'?'accountCode':'incomeAccountCode',v),posting.filter(a=>a.type===(invoice.type==='purchase'?'expense':'revenue')).map(a=>({value:a.code,label:a.code+' — '+a.name})),'chartOfAccounts'),select('تصنيف البند',line.kind||'service',v=>updateI(index,'kind',v),[{value:'stock',label:'بضاعة / مخزون'},{value:'service',label:'خدمة / مصروف أو إيراد'}]));
   const centerControl=selectWithAdd('مركز التكلفة',line.costCenterId||'',v=>updateI(index,'costCenterId',v),previewCenterOptions,'costCenters');
   previewRows.push(h('tr',{key:'line-'+index,className:'border-t'},h('td',{className:'p-2 min-w-[190px]'},accountControl),h('td',{className:'p-2 min-w-[190px]'},field('البيان',line.description||'',v=>updateI(index,'description',v))),h('td',{className:'p-2 min-w-[160px]'},centerControl),h('td',{className:'p-2'},fmt(invoice.type==='purchase'?amount:0)),h('td',{className:'p-2'},fmt(invoice.type==='sales'?amount:0))));
  });
  if(primaryVat)previewRows.push(h('tr',{key:'vat',className:'border-t'},h('td',{className:'p-2'},invoice.type==='purchase'?'1410 — ضريبة مدخلات':'2110 — ضريبة مخرجات'),h('td',{className:'p-2'},'ضريبة قيمة مضافة أساسية 14%'),h('td',{className:'p-2'},'—'),h('td',{className:'p-2'},fmt(invoice.type==='purchase'?primaryVat:0)),h('td',{className:'p-2'},fmt(invoice.type==='sales'?primaryVat:0))));
  (invoice.otherTaxes||[]).forEach(function(extra,index){
   const fixed=extra.amount!==''&&extra.amount!==null&&extra.amount!==undefined,amount=fixed?n(extra.amount):net*n(extra.rate)/100;
   if(!amount&&!extra.description&&!extra.accountCode)return;
   const account=accounts.find(a=>a.code===extra.accountCode);
   const accountControl=selectWithAdd('حساب الضريبة',extra.accountCode||'',v=>updateInvoiceOtherTax(index,'accountCode',v),posting.map(a=>({value:a.code,label:a.code+' — '+a.name})),'chartOfAccounts');
   previewRows.push(h('tr',{key:'extra-tax-'+index,className:'border-t'},h('td',{className:'p-2 min-w-[190px]'},accountControl),h('td',{className:'p-2'},extra.description||'ضريبة/رسم إضافي'),h('td',{className:'p-2'},'—'),h('td',{className:'p-2'},fmt(invoice.type==='purchase'?amount:0)),h('td',{className:'p-2'},fmt(invoice.type==='sales'?amount:0))));
  });
  previewRows.push(h('tr',{key:'party',className:'border-t font-bold bg-slate-50'},h('td',{className:'p-2'},invoice.type==='purchase'?'281 — الموردون':'1210 — العملاء'),h('td',{className:'p-2'},invoice.partyName||'الطرف المختار'),h('td',{className:'p-2'},'—'),h('td',{className:'p-2'},fmt(invoice.type==='sales'?total:0)),h('td',{className:'p-2'},fmt(invoice.type==='purchase'?total:0))));
  const journalPreview=panel('المقترح المحاسبي قبل الحفظ','يمكنك تعديل حساب بند الخدمة ومركز التكلفة مباشرة من المقترح. مراكز التكلفة اختيارية، أما حسابات المخزون ومراقبة الطرف والضريبة الأساسية فتظل مرتبطة بإعدادات النظام.',table(['الحساب / التعديل','البيان','مركز التكلفة','مدين','دائن'],previewRows));
  const activeEmployees=(userDirectory||[]).filter(u=>u.uid&&u.uid!==currentUser.uid&&["active","نشط","مفعل","enabled"].includes(String(u.status||"").toLowerCase()));
  const delegationPanel=panel('تحويل المسودة لمستخدم آخر','عند نقص تصنيف مخزني أو بيانات، احفظ الفاتورة كمسودة وحوّلها لموظف مختص. ستعود إليك بعد استكمال المطلوب لتراجعها وترسلها للمراجعة.',h('div',{className:'grid md:grid-cols-3 gap-3'},
   select('المستخدم المسؤول عن الاستكمال',assignmentUserUid,v=>setAssignmentUserUid(v),[{value:'',label:'اختر المستخدم'},...activeEmployees.map(u=>({value:u.uid,label:(u.fullName||u.username||u.email)+' — '+(u.jobTitle||'')}))]),
   h('div',{className:'md:col-span-2'},field('المطلوب منه',assignmentInstruction,setAssignmentInstruction)),
   button('حفظ كمسودة فقط',saveInvoiceDraft,'muted',busy||!canFinance("invoices",invoice.id?"edit":"add")),
   button('حفظ المسودة وتحويلها',assignInvoiceToUser,'primary',busy||!assignmentUserUid||!canFinance("assignments","add")||!canFinance("invoices",invoice.id?"edit":"add"))
  ));
  const totalsBox = h('div',{className:'flex flex-wrap items-center gap-3 p-3 bg-white border rounded-xl'},h('b',null,'الصافي: '+fmt(net)),h('b',null,'ضريبة القيمة المضافة 14%: '+fmt(primaryVat)),h('b',null,'الضرائب الأخرى: '+fmt(otherTaxTotal)),h('b',null,'الإجمالي: '+fmt(total)),button('حفظ وإرسال للمراجعة',submitInvoice,'primary',busy||!canFinance("invoices",invoice.id?"edit":"add")),button('مسح / إلغاء الفاتورة',clearInvoiceEntry,'danger',busy||!!invoice.id&&!canFinance("invoices","delete")));
  const decisionPanel=invoiceDecisionDoc?panel('قرار الفاتورة المحوّلة أو غير المكتملة','الفاتورة '+(invoiceDecisionDoc.number||invoiceDecisionDoc.id)+' — '+(invoiceDecisionDoc.partyName||'')+' · '+status(invoiceDecisionDoc.status),h('div',{className:'flex flex-wrap items-center gap-2'},
    h('p',{className:'text-sm text-slate-600'},'يمكن إلغاء الفاتورة وإغلاق مهمة الاستكمال من هنا. أما الاعتماد والترحيل فيتم من قائمة المراجعة، والقيد المرحّل من شاشة القيود اليومية.'),
    canFinance('invoices','delete')?button('إلغاء الفاتورة وإغلاق التحويل',()=>void deleteInvoiceRecord(invoiceDecisionDoc),'danger',busy):null,
    button('إخفاء التفاصيل',()=>setInvoiceDecisionDoc(null),'muted')
   )):null;
   const correctionRows=documents.filter(function(x){return x.type==='invoice'&&['needs_correction','draft','returned_to_creator'].includes(x.status);}).map(function(x){
   const reason=[...(x.errors||[]),x.reviewReason||''].filter(Boolean).join(' · ');
   return h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.number||x.id),h('td',{className:'p-2'},x.partyName),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2 text-xs text-rose-700 min-w-[180px]'},reason||(x.status==='draft'?'مسودة لم تُرسل للمراجعة بعد':'لا يوجد سبب محفوظ؛ افتح الفاتورة وراجع بياناتها')),h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-1'},button('تعديل واستكمال',function(){editDoc(x);},'muted',!canFinance("invoices","edit")),button('حذف',function(){void deleteInvoiceRecord(x);},'danger',!canFinance("invoices","delete")))));
  });
  const correctionPanel = panel('فواتير تحتاج تصحيح','هذه الفواتير لم تدخل قائمة الاعتماد بعد، أو أعادها المراجع للتصحيح. راجع السبب واستكملها ثم أرسلها للمراجعة.',table(['الفاتورة','الطرف','التاريخ','الحالة','سبب عدم ظهورها في المراجعة','إجراء'],correctionRows));
  return h('div',{className:'space-y-4'},invoiceDecisionDoc?decisionPanel:null,invoiceHead,otherTaxesPanel,suggestionsPanel,invoiceLines,journalPreview,totalsBox,delegationPanel,correctionPanel);
 };
 const renderMaster=kind=>{
  const currentFormCodeSuggestion=getCodeSuggestion(masterForm.kind,masterForm);
  const opts=[['chartOfAccounts','حساب عام'],['costCenters','مركز تكلفة'],['itemGroups','مجموعة أصناف'],['items','صنف مخزني / إصدار'],['warehouses','مخزن'],['bankAccounts','حساب بنك'],['taxCodes','كود ضريبي']];
  let data=kind==='accounts'?accounts:kind==='centers'?centers:items;
  return h('div',{className:'space-y-4'},
   panel(kind==='accounts'?'دليل الحسابات':kind==='centers'?'مراكز التكلفة':'الأصناف والمجموعات','أنشئ كودًا من نفس الشاشة. الحسابات التجميعية لا تقبل الترحيل.',h('div',{className:'grid md:grid-cols-3 gap-3'},
    select('نوع التكويد',masterForm.kind,v=>setMasterForm(o=>Object.assign({},o,{kind:v})),opts.map(x=>({value:x[0],label:x[1]}))),
    h('div',{className:'space-y-1'},field('الكود',masterForm.code,v=>setMasterForm(o=>Object.assign({},o,{code:v}))),h('div',{className:'flex flex-wrap items-center gap-2'},button('اقتراح الكود التالي',()=>setMasterForm(old=>Object.assign({},old,{code:getCodeSuggestion(old.kind,old).code})),'muted',busy)),h('small',{className:'block text-[11px] text-slate-500'},codeHint(currentFormCodeSuggestion))),
    field('الاسم',masterForm.name,v=>setMasterForm(o=>Object.assign({},o,{name:v}))),
    masterForm.kind==='chartOfAccounts'?select('نوع الحساب',masterForm.type,v=>setMasterForm(o=>Object.assign({},o,{type:v})),[{value:'asset',label:'أصول'},{value:'liability',label:'التزامات'},{value:'equity',label:'حقوق ملكية'},{value:'revenue',label:'إيرادات'},{value:'expense',label:'مصروفات'}]):null,
    masterForm.kind==='chartOfAccounts'?select('الطبيعة',masterForm.nature,v=>setMasterForm(o=>Object.assign({},o,{nature:v})),[{value:'debit',label:'مدين'},{value:'credit',label:'دائن'}]):null,
    masterForm.kind==='chartOfAccounts'?selectWithAdd('الحساب الأب',masterForm.parentCode,v=>setMasterForm(o=>Object.assign({},o,{parentCode:v})),[{value:'',label:'بدون'},...accounts.filter(a=>a.isGroup).map(a=>({value:a.code,label:a.code+' — '+a.name}))],'chartOfAccounts',{type:masterForm.type,nature:masterForm.nature,parentCode:masterForm.parentCode||'',isGroup:true},'master-chart-parent'):null,
    masterForm.kind==='chartOfAccounts'?select('تحليل الطرف',masterForm.subledgerType,v=>setMasterForm(o=>Object.assign({},o,{subledgerType:v})),[{value:'',label:'بدون'},{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'},{value:'employeeCustody',label:'موظف صاحب عهدة'},{value:'employeeAdvance',label:'موظف صاحب سلفة'},{value:'partnerCurrentAccount',label:'شريك — جاري الشركاء'},{value:'financingParty',label:'جهة تمويل / دائن'}]):null,
    masterForm.kind==='items'?field('الوحدة',masterForm.unit,v=>setMasterForm(o=>Object.assign({},o,{unit:v}))):null,
    masterForm.kind==='items'?selectWithAdd('مجموعة الصنف',masterForm.groupCode,v=>setMasterForm(o=>Object.assign({},o,{groupCode:v})),[{value:'',label:'بدون مجموعة'},...rows(master.itemGroups).map(x=>({value:x.code,label:x.code+' — '+x.name}))],'itemGroups'):null,
    masterForm.kind==='items'?field('Version / الإصدار',masterForm.version,v=>setMasterForm(o=>Object.assign({},o,{version:v}))):null,
    masterForm.kind==='costCenters'?select('المشروع المرتبط',masterForm.projectCode,v=>setMasterForm(o=>Object.assign({},o,{projectCode:v})),[{value:'',label:'بدون'},...projects.map(p=>({value:p.code||p.id,label:p.name||p.code}))]):null,
    masterForm.kind==='taxCodes'?select('نوع الضريبة',masterForm.taxType,v=>setMasterForm(o=>Object.assign({},o,{taxType:v})),[{value:'vat_input',label:'قيمة مضافة مدخلات'},{value:'vat_output',label:'قيمة مضافة مخرجات'},{value:'withholding',label:'خصم/استقطاع'},{value:'addition',label:'إضافة'}]):null,
    masterForm.kind==='taxCodes'?field('النسبة %',masterForm.rate,v=>setMasterForm(o=>Object.assign({},o,{rate:v})),'number'):null,
    masterForm.kind==='taxCodes'?field('بداية السريان',masterForm.effectiveFrom,v=>setMasterForm(o=>Object.assign({},o,{effectiveFrom:v})),'date'):null,
    masterForm.kind==='chartOfAccounts'?h('label',{className:'inline-flex items-center gap-2'},h('input',{type:'checkbox',checked:masterForm.isGroup,onChange:e=>setMasterForm(o=>Object.assign({},o,{isGroup:e.target.checked}))}),'حساب تجميعي'):null,
    button('حفظ الكود',saveMaster,'primary',busy||!canFinance(masterForm.kind==="chartOfAccounts"?"accounts":financeAreaForMaster(masterForm.kind),"add"))
   )),
   panel(kind==='accounts'?'قائمة الحسابات':kind==='centers'?'قائمة مراكز التكلفة':'قائمة الأصناف', '',table(['الكود','الاسم','تفاصيل'],data.filter(x=>!search||[x.code,x.name,x.version,x.groupCode].join(' ').toLowerCase().includes(search.toLowerCase())).map(x=>h('tr',{key:x.code,className:'border-t'},h('td',{className:'p-2'},x.code),h('td',{className:'p-2'},x.name),h('td',{className:'p-2'},kind==='accounts'?(x.isGroup?'تجميعي':x.type+' / '+x.nature):kind==='centers'?(x.projectCode||'—'):[x.groupCode,x.version].filter(Boolean).join(' / '))))))
  );
 };
 const renderAssignments=()=>{
  const selectedReceived=assignmentItems.find(item=>item.id===selectedAssignmentId);
  const selectedSent=sentAssignmentItems.find(item=>item.id===selectedAssignmentId);
  const selectedAssignment=selectedAssignmentSource==="sent"?(selectedSent||selectedReceived):(selectedReceived||selectedSent);
  const receivedActive=assignmentItems.filter(item=>!item.archivedAt);
  const receivedArchived=assignmentItems.filter(item=>Boolean(item.archivedAt));
  const sentActive=sentAssignmentItems.filter(item=>!item.archivedAt);
  const sentArchived=sentAssignmentItems.filter(item=>Boolean(item.archivedAt));
  const assignmentTitle=item=>'فاتورة '+(item.invoiceNumber||item.invoice&&item.invoice.number||item.invoiceId||'بدون رقم');
  const assignmentSub=item=>(item.invoiceType==='purchase'?'مورد: ':'عميل: ')+(item.partyName||item.invoice&&item.invoice.partyName||'')+' · '+(item.date||item.invoice&&item.invoice.date||'');
  const inbox=panel('المهام المحولة إليّ','يمكنك تعديل الفاتورة وتعليماتها، أو إعادة تحويلها، أو إرجاعها لصاحب التحويل، أو أرشفتها دون حذف الفاتورة.',h('div',{className:'space-y-2'},receivedActive.length?receivedActive.map(item=>h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3'},
   h('div',{className:'min-w-0'},h('b',{className:'block'},assignmentTitle(item)),h('p',{className:'text-xs text-slate-600'},assignmentSub(item)),h('p',{className:'text-xs text-slate-500 mt-1'},item.instruction||'')),
   h('div',{className:'flex flex-wrap gap-1'},
    button(selectedAssignmentId===item.id&&selectedAssignmentSource==='received'?'مفتوحة':'تعديل / فتح',()=>openAssignment(item,'received'),selectedAssignmentId===item.id&&selectedAssignmentSource==='received'?'primary':'muted'),
    button('أرشفة',()=>manageAssignment('archive','received',item),'muted',assignmentBusy),
    button('حذف / إرجاع',()=>manageAssignment('delete','received',item),'danger',assignmentBusy)
   )
  )):h('p',{className:'text-sm text-slate-500'},'لا توجد مهام مالية محولة إليك.')));
  const sentOutbox=panel('تحويلاتي الصادرة','تابع كل إجراء قمت بتحويله، وعدّل بياناته أو تعليماته، وأعد تحويله لمستخدم آخر أو احذفه من قائمتك أو أرشفه.',h('div',{className:'space-y-2'},sentActive.length?sentActive.map(item=>{
   const state=item.status==='returned_to_creator'?'عاد إليك':item.status==='sent_for_review'?'أُرسل للمراجعة والاعتماد':item.status==='open'?'عند المستخدم المستكمل':item.status==='completed'?'مكتمل':item.status==='forwarded'?'أعيد تحويله':item.status==='cancelled'?'ملغى':item.status||'—';
   const canManage=item.status==='open'||item.status==='returned_to_creator'||item.invoice&&['assigned','returned_to_creator','draft'].includes(item.invoice.status);
   return h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3'},
    h('div',{className:'min-w-0'},h('b',{className:'block'},assignmentTitle(item)),
     h('p',{className:'text-xs text-slate-600'},assignmentSub(item)),
     h('p',{className:'text-xs text-slate-500 mt-1'},'المستخدم: '+(item.assigneeName||'—')+' · الحالة: '+state)),
    h('div',{className:'flex flex-wrap gap-1'},
     button(selectedAssignmentId===item.id&&selectedAssignmentSource==='sent'?'مفتوحة':'تعديل',()=>openAssignment(item,'sent'),selectedAssignmentId===item.id&&selectedAssignmentSource==='sent'?'primary':'muted',!canManage),
     button('إعادة تحويل',()=>openAssignment(item,'sent'),'muted',!canManage||assignmentBusy),
     button('حذف',()=>manageAssignment('delete','sent',item),'danger',assignmentBusy),
     button('أرشفة',()=>manageAssignment('archive','sent',item),'muted',assignmentBusy)
    )
   );
  }):h('p',{className:'text-sm text-slate-500'},'لا توجد تحويلات صادرة حتى الآن.')));
  const archivedInbox=panel('أرشيف المهام الواردة','الإجراءات التي أرشفتها من المهام المحولة إليك. يمكنك إعادتها للقائمة وفتحها مرة أخرى.',h('div',{className:'space-y-2'},receivedArchived.length?receivedArchived.map(item=>h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2'},h('div',{className:'min-w-0'},h('b',{className:'block'},assignmentTitle(item)),h('p',{className:'text-xs text-slate-600'},assignmentSub(item)),h('p',{className:'text-xs text-slate-500'},item.instruction||'')),h('div',{className:'flex gap-1'},button('فتح',()=>openAssignment(item,'received'),'muted'),button('إلغاء الأرشفة',()=>manageAssignment('restore','received',item),'primary',assignmentBusy)))):h('p',{className:'text-sm text-slate-500'},'الأرشيف الوارد فارغ.')));
  const archivedSent=panel('أرشيف التحويلات الصادرة','التحويلات التي أرشفتها من قائمتك الصادرة. يمكنك إعادتها إلى القائمة متى احتجت.',h('div',{className:'space-y-2'},sentArchived.length?sentArchived.map(item=>h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2'},h('div',{className:'min-w-0'},h('b',{className:'block'},assignmentTitle(item)),h('p',{className:'text-xs text-slate-600'},assignmentSub(item)),h('p',{className:'text-xs text-slate-500'},'المستخدم: '+(item.assigneeName||'—')+' · '+(item.status||'—'))),h('div',{className:'flex gap-1'},button('فتح',()=>openAssignment(item,'sent'),'muted'),button('إلغاء الأرشفة',()=>manageAssignment('restore','sent',item),'primary',assignmentBusy)))):h('p',{className:'text-sm text-slate-500'},'أرشيف التحويلات الصادرة فارغ.')));
  if(!selectedAssignment)return h('div',{className:'space-y-4'},inbox,sentOutbox,archivedInbox,archivedSent);
  const inv=assignmentHeader||selectedAssignment.invoice||{},purchase=inv.invoiceType==='purchase';
  const setHeader=(key,value)=>setAssignmentHeader(old=>Object.assign({},old,{[key]:value}));
  // Prevent a circular handoff: do not offer the active assignee or the direct sender as the next recipient.
  const activeForwardUsers=(userDirectory||[]).filter(user=>user.uid&&user.uid!==currentUser.uid&&user.uid!==selectedAssignment.createdBy&&["active","نشط","مفعل","enabled"].includes(String(user.status||"").toLowerCase()));
  const partyOptions=(purchase?activeVendors:activeClients).filter(p=>p.active!==false).map(p=>({value:p.code||p.id,label:(p.code||p.id)+" — "+partyName(p)}));
  if(inv.partyId&&!partyOptions.some(p=>p.value===inv.partyId))partyOptions.unshift({value:inv.partyId,label:inv.partyId+" — "+(inv.partyName||"طرف غير نشط")});
  const taxType=purchase?"vat_input":"vat_output";
  const taxOptions=[{value:"",label:"بدون كود ضريبي"}].concat(rows(master.taxCodes).filter(t=>t.taxType===taxType&&t.active!==false).map(t=>({value:t.code,label:t.code+" — "+t.name+" ("+t.rate+"%)"})));
  if(inv.taxCode&&!taxOptions.some(t=>t.value===inv.taxCode))taxOptions.push({value:inv.taxCode,label:inv.taxCode+" — كود غير صالح"});
  const currencyOptions=[{value:"EGP",label:"EGP — الجنيه المصري"}];if(inv.currency&&inv.currency!=="EGP")currencyOptions.push({value:inv.currency,label:inv.currency+" — غير مفعلة محاسبيًا"});
  const projectOptions=[{value:"",label:"بدون مشروع"}].concat(projects.filter(p=>p.active!==false).map(p=>({value:p.code||p.id,label:(p.code||p.id)+" — "+(p.name||p.code)})));
  const invoiceHead=panel("بيانات الفاتورة","يمكن تعديل بيانات الرأس وكود الضريبة والطرف والتاريخ قبل إرجاع الفاتورة أو تحويلها أو إرسالها للمراجعة.",h("div",{className:"grid md:grid-cols-3 gap-3"},
   select("نوع الفاتورة",inv.invoiceType||"purchase",v=>{setHeader("invoiceType",v);setHeader("taxCode","");setHeader("taxType",v==="purchase"?"vat_input":"vat_output");},[{value:"purchase",label:"مشتريات / مورد"},{value:"sales",label:"مبيعات / عميل"}]),
   field("رقم الفاتورة",inv.number||"",v=>setHeader("number",v)),
   field("تاريخ الفاتورة",inv.date||"",v=>setHeader("date",v),"date"),
   select(purchase?"المورد":"العميل",inv.partyId||"",v=>{const party=(purchase?activeVendors:activeClients).find(p=>(p.code||p.id)===v);setAssignmentHeader(old=>Object.assign({},old,{partyId:v,partyName:party?partyName(party):old.partyName||"",partyTaxNumber:party?partyTaxNumber(party):old.partyTaxNumber||""}));},partyOptions),
   field("اسم الطرف",inv.partyName||"",v=>setHeader("partyName",v)),
   field("الرقم الضريبي للطرف",inv.partyTaxNumber||"",v=>setHeader("partyTaxNumber",v)),
   select("العملة",inv.currency||"EGP",v=>setHeader("currency",v),currencyOptions),
   h("div",{className:"rounded-lg border bg-slate-50 p-2 flex flex-col justify-center"},h("span",{className:"text-xs text-slate-500"},"كود ضريبة القيمة المضافة الثابت"),h("strong",null,(purchase?"مدخلات":"مخرجات")+" — السعر العام 14%")),
   field("قيمة ضريبة القيمة المضافة (اختياري)",inv.taxAmount==null?"":String(inv.taxAmount),v=>setHeader("taxAmount",v),"number"),
   field("خصم الفاتورة",inv.discount==null?"":String(inv.discount),v=>setHeader("discount",v),"number"),
   select("المشروع المرتبط",inv.projectCode||"",v=>setHeader("projectCode",v),projectOptions)
  ));
  const lineCards=assignmentLines.map((line,index)=>{
   const itemOptions=[{value:"",label:"اختر الصنف المخزني"}].concat(activeItems.map(item=>({value:item.code,label:item.code+" — "+item.name+" "+(item.version||"")})));
   if(line.itemCode&&!itemOptions.some(item=>item.value===line.itemCode))itemOptions.push({value:line.itemCode,label:line.itemCode+" — كود يحتاج مراجعة"});
   const groupOptions=[{value:"",label:"بدون مجموعة"}].concat(rows(master.itemGroups).filter(group=>group.active!==false).map(group=>({value:group.code,label:group.code+" — "+group.name})));
   const expenseType=purchase?"expense":"revenue",accountOptions=posting.filter(account=>account.type===expenseType).map(account=>({value:account.code,label:account.code+" — "+account.name})),currentAccount=purchase?line.accountCode:line.incomeAccountCode;
   if(currentAccount&&!accountOptions.some(account=>account.value===currentAccount))accountOptions.push({value:currentAccount,label:currentAccount+" — حساب يحتاج مراجعة"});
   const centerOptions=[{value:"",label:"بدون مركز تكلفة"}].concat(activeCenters.map(center=>({value:center.code,label:center.code+" — "+center.name})));
   const warehouseOptions=[{value:"default",label:"المخزن الافتراضي"}].concat(rows(master.warehouses).filter(warehouse=>warehouse.active!==false).map(warehouse=>({value:warehouse.code,label:warehouse.code+" — "+warehouse.name})));
   const change=(key,value)=>setAssignmentLines(old=>old.map((x,i)=>i===index?Object.assign({},x,{[key]:value}):x));
   return h("div",{key:index,className:"grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-slate-50 p-3"},
    h("div",{className:"md:col-span-3"},field("وصف البند",line.description||"",value=>change("description",value))),
    h("div",{className:"md:col-span-2"},select("تصنيف البند",line.kind||"",value=>change("kind",value),[{value:"",label:"حدد تصنيف البند"},{value:"stock",label:"بضاعة / مخزون"},{value:"service",label:"مصروف / خدمة"}])),
    line.kind==="service"?h("div",{className:"md:col-span-3"},selectWithAdd("حساب "+(purchase?"المصروف":"الإيراد"),currentAccount||"",value=>change(purchase?"accountCode":"incomeAccountCode",value),accountOptions,"chartOfAccounts",{type:expenseType,nature:purchase?"debit":"credit",parentCode:purchase?"6":"4"})):h("div",{className:"md:col-span-3"},selectWithAdd("كود الصنف",line.itemCode||"",value=>change("itemCode",value),itemOptions,"items",{code:nextCode("ITM",items,{groupBy:"groupCode",groupValue:line.groupCode||""}),name:line.description||"",groupCode:line.groupCode||"",itemType:"stock",unit:line.unit||"قطعة",warehouseCode:"default"})),
    line.kind==="stock"?h("div",{className:"md:col-span-2"},selectWithAdd("مجموعة الصنف",line.groupCode||"",value=>change("groupCode",value),groupOptions,"itemGroups",{code:nextCode("GRP",rows(master.itemGroups)),name:line.description||"",groupType:"other"})):null,
    line.kind==="stock"?h("div",{className:"md:col-span-2"},select("نوع الصنف",line.itemType||"stock",value=>change("itemType",value),[{value:"stock",label:"مخزون عام"},{value:"raw_material",label:"خامة"},{value:"finished_good",label:"منتج تام"},{value:"spare_part",label:"قطعة غيار"},{value:"consumable",label:"مستهلك"},{value:"office_supply",label:"مكتبي"}])):null,
    h("div",{className:"md:col-span-1"},field("الكمية",line.quantity==null?"":String(line.quantity),value=>change("quantity",value),"number")),
    h("div",{className:"md:col-span-1"},field("السعر",line.unitPrice==null?"":String(line.unitPrice),value=>change("unitPrice",value),"number")),
    h("div",{className:"md:col-span-1"},field("خصم",line.discount==null?"":String(line.discount),value=>change("discount",value),"number")),
    h("div",{className:"md:col-span-2"},select("مركز التكلفة",line.costCenterId||"",value=>change("costCenterId",value),centerOptions)),
    line.kind==="stock"?h("div",{className:"md:col-span-2"},select("المخزن",line.warehouseCode||"default",value=>change("warehouseCode",value),warehouseOptions)):null,
    h("div",{className:"md:col-span-1"},button("حذف البند",()=>setAssignmentLines(old=>old.filter((x,i)=>i!==index)),"danger"))
   );
  });
  const addLine=button("إضافة بند",()=>setAssignmentLines(old=>old.concat([{description:"",kind:"",itemCode:"",quantity:"",unitPrice:"",discount:"",accountCode:"",incomeAccountCode:"",costCenterId:"",warehouseCode:"default"}])));
  const attachmentRows=Object.values(inv.attachments||{});
  const attachmentsPanel=panel("مرفقات الفاتورة",inv.attachmentUploadStatus==="pending"?"المرفق الأصلي لم يكتمل رفعه: "+(inv.attachmentUploadError||inv.attachmentFileName||"")+" — يمكنك إعادة رفعه من هنا.":"المرفقات الأصلية تنتقل مع الفاتورة بين المستخدمين.",h("div",{className:"space-y-2"},
   attachmentRows.length?table(["اسم الملف","النوع","الحجم","الإجراء"],attachmentRows.map(attachment=>h("tr",{key:attachment.id,className:"border-t"},h("td",{className:"p-2"},attachment.fileName||"—"),h("td",{className:"p-2"},attachment.mimeType||"—"),h("td",{className:"p-2"},fmt((Number(attachment.size)||0)/1024)+" KB"),h("td",{className:"p-2"},h("div",{className:"flex flex-wrap gap-1"},button("تحميل",()=>downloadFinancialAttachment(selectedAssignment.invoiceId,attachment),"muted"),canDeleteStatementAttachment({entityType:"financial",entityId:selectedAssignment.invoiceId},true)?button("حذف",()=>void deleteStatementAttachment(Object.assign({},attachment,{entityType:"financial",entityId:selectedAssignment.invoiceId}),selectedAssignment.invoiceId,true),"danger",assignmentBusy):null))))):h("p",{className:"text-sm text-slate-500"},"لا توجد مرفقات مسجلة على الفاتورة."),
   h("label",{className:"inline-flex flex-col gap-1 rounded-lg border border-dashed p-3 text-sm font-bold cursor-pointer"},"إضافة أو إعادة رفع مرفق",h("input",{type:"file",accept:"image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt",disabled:assignmentBusy,className:"text-xs font-normal",onChange:e=>{const file=e.target.files&&e.target.files[0];if(file)void retryInvoiceAttachment(file,selectedAssignment.invoiceId).then(()=>refreshAssignments());e.target.value="";}}))
  ));
  const errorsPanel=(inv.errors||[]).length?panel("نواقص الفاتورة المطلوب استكمالها","هذه النواقص لا تمنع إعادة التحويل أو إرسال الملف للمراجعة، لكنها تمنع الاعتماد النهائي حتى تصحيحها.",h("ul",{className:"list-disc pr-5 text-sm text-rose-700"},(inv.errors||[]).map((error,index)=>h("li",{key:index},error)))):null;
  const chainPanel=(inv.assignmentChain||[]).length?panel("سجل التحويلات","المسار السابق للفاتورة.",h("div",{className:"space-y-1 text-sm"},(inv.assignmentChain||[]).map((step,index)=>h("p",{key:index},(index+1)+". "+(step.fromName||step.fromUid)+" ← "+(step.toName||step.toUid)+" · "+new Date(step.at||0).toLocaleString("ar-EG"))))):null;
  const forwardPanel=panel("تحويل لمستخدم آخر","يمكن للمستلم الحالي تحويل الملف مباشرة إلى موظف آخر دون إرجاعه للمرسل الأصلي.",h("div",{className:"grid md:grid-cols-3 gap-2"},select("المستخدم التالي",forwardUserUid,setForwardUserUid,[{value:"",label:"اختر مستخدمًا نشطًا"},...activeForwardUsers.map(user=>({value:user.uid,label:(user.fullName||user.username||user.email)+" — "+(user.jobTitle||"")}))]),field("تعليمات للمستخدم التالي",forwardInstruction,setForwardInstruction),button("تحويل للمستخدم التالي",forwardAssignment,"primary",assignmentBusy||!forwardUserUid||!canFinance("assignments","edit"))));
  const senderView=selectedAssignmentSource==="sent";
  const detail=panel((senderView?"إدارة التحويل الصادر — ":"استكمال الإجراء المحول — ")+(inv.number||selectedAssignment.invoiceId||""),(purchase?"فاتورة مشتريات من مورد: ":"فاتورة مبيعات لعميل: ")+(inv.partyName||"")+" · "+(assignmentEditInstruction||selectedAssignment.instruction||""),h("div",{className:"space-y-3"},
   h("div",{className:"grid md:grid-cols-3 gap-3"},metric("التاريخ",inv.date||"—"),metric("الإجمالي",fmt(inv.total||0)+" ج.م"),metric("عدد البنود",String(assignmentLines.length))),
   field("تعليمات الإجراء / المطلوب تنفيذه",assignmentEditInstruction,setAssignmentEditInstruction),
   invoiceHead,errorsPanel,chainPanel,...lineCards,addLine,attachmentsPanel,forwardPanel,
   senderView?null:h("div",{className:"rounded-lg border bg-slate-50 p-3 text-sm text-slate-600"},"يمكنك حفظ التعديلات ثم إكمال الإجراء أو إرجاعه لصاحب التحويل. لن يتم حذف الفاتورة أو مرفقاتها عند إزالة الإجراء من قائمتك."),
   h("div",{className:"flex flex-wrap items-center gap-2"},
    button("حفظ التعديلات",saveAssignmentChanges,"primary",assignmentBusy||!canFinance("assignments","edit")),
    senderView?button("حذف التحويل",()=>manageAssignment("delete","sent",selectedAssignment),"danger",assignmentBusy||!canFinance("assignments","edit")):button("إعادة الملف للمرسل المباشر",()=>completeAssignment("return_to_creator"),"muted",assignmentBusy||!canFinance("assignments","edit")),
    senderView?button("أرشفة التحويل",()=>manageAssignment("archive","sent",selectedAssignment),"muted",assignmentBusy):button("إرسال للمراجعة والاعتماد",()=>completeAssignment("submit_for_review"),"success",assignmentBusy||!canFinance("assignments","edit")),
    senderView?null:button("حذف / إرجاع الإجراء",cancelAssignedInvoice,"danger",assignmentBusy||!canFinance("assignments","edit")),
    !senderView?button("أرشفة المهمة",()=>manageAssignment("archive","received",selectedAssignment),"muted",assignmentBusy):null,
    button("إغلاق التفاصيل",()=>setSelectedAssignmentId(""),"muted")
   )
  ));
  return h("div",{className:"space-y-4"},inbox,sentOutbox,archivedInbox,archivedSent,detail);
 };
  const renderPartyStatements = function() {
  const employeeType=["employeeCustody","employeeAdvance"].includes(partyStatement.type);
  const employeeRegistry=partyStatement.type==="employeeCustody"?rows(master.employeeCustodies):partyStatement.type==="employeeAdvance"?rows(master.employeeAdvances):[];
  const staff=employeeType?employeeRegistry.map(item=>{
   const user=(userDirectory||[]).find(record=>String(record.uid||"")===String(item.employeeUid||""));
   const partyId=String(item.employeeUid||item.code||"");
   return Object.assign({},user||{},item,{id:partyId,uid:partyId,code:item.code||partyId,name:item.name||item.employeeName||(user&&(user.fullName||user.username||user.email))||partyId});
  }):(userDirectory||[]).filter(u=>u.uid).map(u=>Object.assign({},u,{id:u.uid,code:u.uid,name:u.fullName||u.username||u.email||u.uid}));
  const financingParties=registeredFinancingParties.map(item=>Object.assign({},item,{id:item.code||item.id,code:item.code||item.id,name:partyName(item)}));
  const securityDepositParties=registeredSecurityDepositParties.map(item=>Object.assign({},item,{id:item.code||item.id,code:item.code||item.id,name:partyName(item)}));
  const partyType=["customer","vendor","employeeCustody","employeeAdvance","financingParty","securityDepositParty"].includes(partyStatement.type);
  const entityList=partyStatement.type==="account"?accounts:
   partyStatement.type==="costCenter"?centers:
   partyStatement.type==="vendor"?allVendors:
   partyStatement.type==="customer"?allClients:
   partyStatement.type==="financingParty"?financingParties:
   partyStatement.type==="securityDepositParty"?securityDepositParties:staff;
  const entityCode=item=>String(item&&(employeeType?(item.uid||item.employeeUid||item.code||item.id):(item.code||item.uid||item.id))||"");
  const entityName=item=>partyStatement.type==="account"||partyStatement.type==="costCenter"
   ?String(item&&item.name||entityCode(item))
   :partyStatement.type==="financingParty"||partyStatement.type==="securityDepositParty"
    ?String(item&&(item.partnerName||item.name||item.companyName||item.fullName||item.username||item.email)||entityCode(item))
    :partyName(item||{});
  const searchableText=item=>normalizeMatch(Object.entries(item||{}).filter(([,value])=>
   value===null||value===undefined?false:["string","number","boolean"].includes(typeof value)
  ).map(([key,value])=>key+" "+String(value)).join(" "));
  const searchTerm=normalizeMatch(statementPartySearch);
  const searchResults=searchTerm?entityList.filter(item=>searchableText(item).includes(searchTerm)).slice(0,12):[];
  const selectedEntity=entityList.find(item=>entityCode(item)===String(partyStatement.id||""));
  const selectedAccountData=partyStatement.type==="account"&&partyStatement.id
   ?statementAccountByCode.get(String(partyStatement.id)):null;
  const accountCodes=selectedAccountData?selectedAccountData.codes:[String(partyStatement.id||"")];
  const allStatementRows=partyStatement.type==="account"
   ?(selectedAccountData?balanceFlat.filter(line=>accountCodes.includes(String(line.accountCode))):[])
   :partyStatement.type==="costCenter"
    ?balanceFlat.filter(line=>String(line.costCenterId||"")===String(partyStatement.id||"")||String(line.projectCode||"")===String(partyStatement.id||""))
    :partyType?partyRows:[];
  const orderedRows=allStatementRows.slice().sort((a,b)=>
   String(a.date||"").localeCompare(String(b.date||""))||
   String(a.journalId||"").localeCompare(String(b.journalId||""))||
   n(a.lineNo)-n(b.lineNo)
  );
  const inPeriod=line=>{
   const month=String(line.date||"").slice(0,7);
   return month&&month>=(period.from||"0000-00")&&month<=(period.to||"9999-99");
  };
  const openingRows=orderedRows.filter(line=>String(line.date||"").slice(0,7)<(period.from||"0000-00"));
  const movementRows=orderedRows.filter(inPeriod);
  const selectedAccount=selectedAccountData&&selectedAccountData.account;
  const normalSide=partyStatement.type==="vendor"||partyStatement.type==="financingParty"?"credit":
   partyStatement.type==="customer"||employeeType?"debit":
   partyStatement.type==="account"
    ?(selectedAccount&&(selectedAccount.nature==="credit"||["liability","equity","revenue"].includes(selectedAccount.type))?"credit":"debit")
    :"debit";
  const rawOpening=openingRows.reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
  let running=normalSide==="credit"?-rawOpening:rawOpening;
  const openingBalance=running;
  const totalDebit=movementRows.reduce((sum,line)=>sum+n(line.debit),0);
  const totalCredit=movementRows.reduce((sum,line)=>sum+n(line.credit),0);
  const labelBalance=value=>{
   const side=value>=0?normalSide:(normalSide==="debit"?"credit":"debit");
   return fmt(Math.abs(value))+" "+(side==="debit"?"مدين":"دائن");
  };
  const movementTableRows=movementRows.map((line,index)=>{
   const movement=normalSide==="credit"?n(line.credit)-n(line.debit):n(line.debit)-n(line.credit);
   running+=movement;
   const account=accounts.find(item=>String(item.code)===String(line.accountCode));
   const center=centers.find(item=>String(item.code)===String(line.costCenterId));
   const journal=statementJournalMap.get(String(line.journalId||""));
   const journalLabel=line.journalNumber||journal&&(journal.number||journal.journalNumber)||line.journalId||"—";
   const partyLabel=line.partyName||((line.partyType==="vendor"?allVendors:line.partyType==="customer"?allClients:line.partyType==="financingParty"?financingParties:line.partyType==="securityDepositParty"?securityDepositParties:staff)
    .find(item=>String(item.uid||item.employeeUid||item.code||item.id)===String(line.partyId||""))||{}).name||line.partyId||"";
   return h("tr",{key:String(line.journalId||"row")+"-"+String(line.lineNo||index)+"-"+index,className:"border-t hover:bg-blue-50"},
    h("td",{className:"p-2 whitespace-nowrap"},line.date||"—"),
    h("td",{className:"p-2"},line.reference||line.invoiceNumber||"—"),
    h("td",{className:"p-2"},line.journalId?h("button",{type:"button",className:"font-bold text-blue-700 underline whitespace-nowrap",onClick:()=>openStatementJournal(line.journalId)},journalLabel):"—"),
    h("td",{className:"p-2 min-w-[150px]"},line.accountCode?String(line.accountCode)+" — "+(account&&account.name||"حساب غير موجود"):"—"),
    h("td",{className:"p-2 min-w-[240px]"},h("div",{className:"flex flex-wrap items-center gap-2"},h("span",{className:"whitespace-pre-wrap"},line.description||line.journalDescription||"—"),statementAttachmentAction(line))),
    h("td",{className:"p-2 min-w-[140px]"},[partyLabel,center&&center.name||line.costCenterId||line.projectCode].filter(Boolean).join(" / ")||"—"),
    h("td",{className:"p-2 text-end"},fmt(line.debit)),
    h("td",{className:"p-2 text-end"},fmt(line.credit)),
    h("td",{className:"p-2 text-end font-bold whitespace-nowrap"},labelBalance(running))
   );
  });
  const statementTitle=partyStatement.type==="account"?"كشف حساب أستاذ عام":
   partyStatement.type==="costCenter"?"كشف حساب مركز تكلفة":
   ({customer:"كشف حساب عميل",vendor:"كشف حساب مورد",employeeCustody:"كشف حساب عهدة موظف",employeeAdvance:"كشف حساب سلفة موظف",securityDepositParty:"كشف حساب تأمينات مستردة لدى الغير"}[partyStatement.type]||"كشف حساب");
  const entitySummary=selectedEntity
   ?(partyStatement.type==="account"||partyStatement.type==="costCenter"
      ?entityCode(selectedEntity)+" — "+entityName(selectedEntity)
      :entityName(selectedEntity)+" ("+entityCode(selectedEntity)+")")
   :"لم يتم اختيار حساب أو طرف";
  const executeStatement=async()=>{
   if(!partyStatement.id){setError("اختر الحساب أو مركز التكلفة أو الطرف أولاً.");return;}
   setError("");setNotice("");
   if(partyType){await loadParty();return;}
   void loadStatementAttachments(movementRows);
   setNotice("تم تجهيز كشف الحساب من القيود المرحلة للفترة المحددة.");
  };
  const typeOptions=[
   {value:"account",label:"حساب من دليل الحسابات"},
   {value:"costCenter",label:"مركز تكلفة"},
   {value:"vendor",label:"مورد"},
   {value:"customer",label:"عميل"},
   {value:"employeeCustody",label:"عهدة موظف"},
   {value:"employeeAdvance",label:"سلفة موظف"},
   {value:"financingParty",label:"جهة تمويل / دائن (حساب 2150)"},
   {value:"securityDepositParty",label:"تأمينات مستردة لدى الغير"}
  ];
  const pickerLabel=partyStatement.type==="account"?"ابحث عن الحساب بالاسم أو الرقم أو أي بيان":
   partyStatement.type==="costCenter"?"ابحث عن مركز التكلفة بالكود أو الاسم أو المشروع":
   partyStatement.type==="vendor"?"ابحث عن المورد بالاسم أو الكود أو الرقم الضريبي":
   partyStatement.type==="customer"?"ابحث عن العميل بالاسم أو الكود أو الرقم الضريبي":
   partyStatement.type==="financingParty"?"ابحث عن جهة التمويل أو الشريك أو الدائن":
   partyStatement.type==="securityDepositParty"?"ابحث عن جهة التأمينات المستردة بالاسم أو الكود":
   "ابحث عن الموظف بالاسم أو رقم المستخدم";
  return h("div",{className:"space-y-4"},
   panel(statementTitle,"كشف موحد يعرض الرصيد الافتتاحي وحركة الفترة والرصيد الختامي، مع إمكانية فتح القيد والمرفقات المرتبطة بكل حركة.",h("div",{className:"space-y-3"},
    h("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-3 items-end"},
     select("نوع كشف الحساب",partyStatement.type,function(value){setPartyStatement({type:value,id:""});setPartyRows([]);setStatementPartySearch("");setNotice("");},typeOptions),
     h("label",{className:"block min-w-0 text-sm font-bold text-slate-700 md:col-span-2"},pickerLabel,
      h("input",{type:"search",value:statementPartySearch||"",onChange:event=>{const value=event.target.value;setStatementPartySearch(value);if(selectedEntity&&normalizeMatch(value)!==normalizeMatch(entityName(selectedEntity)))setPartyStatement(old=>Object.assign({},old,{id:""}));},placeholder:"اكتب الاسم أو الكود أو الرقم أو أي معلومة",className:"mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white"}),
      selectedEntity?h("div",{className:"mt-1 text-xs text-emerald-700"}, "المحدد: "+entitySummary):null,
      searchTerm&&!selectedEntity?h("div",{className:"mt-1 max-h-44 overflow-auto rounded-lg border bg-white shadow-sm"},searchResults.length?searchResults.map(item=>h("button",{key:entityCode(item),type:"button",onClick:()=>{setPartyStatement(old=>Object.assign({},old,{id:entityCode(item)}));setStatementPartySearch(entityName(item));setPartyRows([]);setError("");},className:"block w-full text-start px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0"},h("b",null,entityCode(item))," — ",entityName(item),h("small",{className:"block text-slate-500"},Object.entries(item||{}).filter(([,value])=>["string","number"].includes(typeof value)&&String(value)).slice(0,4).map(([key,value])=>key+": "+value).join(" · ")))):h("div",{className:"p-3 text-xs text-slate-500"},"لا توجد نتائج مطابقة.")):null
     ),
     button("عرض كشف الحساب",executeStatement,"primary",busy||!partyStatement.id)
    ),
    h("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-3 items-end"},
     field("من شهر",period.from,value=>setPeriod(old=>Object.assign({},old,{from:value})),"month"),
     field("إلى شهر",period.to,value=>setPeriod(old=>Object.assign({},old,{to:value})),"month"),
     button("تحديث كشف الحساب",executeStatement,"muted",busy||!partyStatement.id),
     h("div",{className:"text-xs text-slate-500 pb-2"}, "بداية الدفاتر: "+(accountingStartMonth||"غير محددة")+" · العملة: جنيه مصري")
    ),
    selectedEntity?metric("الحساب / الطرف",entitySummary):null,
    selectedEntity?h("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-2"},
     metric("الرصيد الافتتاحي",labelBalance(openingBalance)),
     metric("إجمالي المدين",fmt(totalDebit)),
     metric("إجمالي الدائن",fmt(totalCredit)),
     metric("الرصيد الختامي",labelBalance(running))
    ):null,
    selectedEntity?table(["التاريخ","المرجع","رقم القيد","الحساب","البيان والمرفقات","الطرف / مركز التكلفة","مدين","دائن","الرصيد"],movementTableRows):h("div",{className:"rounded-lg border border-dashed p-6 text-center text-sm text-slate-500"},"اختر نوع الكشف وابحث عن الحساب أو الطرف لعرض التفاصيل."),
    selectedEntity&&!movementRows.length?h("div",{className:"rounded-lg bg-slate-50 p-3 text-sm text-slate-500"},"لا توجد حركات خلال الفترة المحددة. الرصيد الافتتاحي يظهر بالأعلى إذا كانت هناك حركات سابقة."):null,
    selectedEntity?statementJournalModal:null
   ))
  );
 };
const renderPartnerCurrent=()=>{
 const selected=partnerCurrentAccounts.find(item=>item.uid===partnerCurrentSelectedUid);
 const partnerBalance=selected?(selected.entries||[]).reduce((sum,line)=>sum+n(line.credit)-n(line.debit),0):0;
 const totalDebit=selected?(selected.entries||[]).reduce((sum,line)=>sum+n(line.debit),0):0,totalCredit=selected?(selected.entries||[]).reduce((sum,line)=>sum+n(line.credit),0):0;
 const movements=(selected&&selected.transactions||[]).filter(item=>!partnerCurrentSearch||[item.date,item.description,item.reference,item.projectCode,item.type,item.id].join(' ').toLowerCase().includes(partnerCurrentSearch.toLowerCase()));
 const legacyExpenseCorrectionCount=selected?(selected.transactions||[]).filter(transaction=>transaction.type==='expense'&&transaction.partnerCurrentAccountTransfer&&transaction.partnerCurrentAccountTransfer.active===true&&transaction.partnerCurrentAccountTransfer.transferTreatment!=='personalWithdrawal'&&transaction.partnerCurrentAccountTransfer.expenseCorrectionStatus!=='posted'&&!transaction.partnerCurrentAccountTransfer.expenseCorrectionPendingJournalId).length:0;
 let running=0;
 const statementRows=(selected&&selected.entries||[]).map((line,index)=>{running+=n(line.credit)-n(line.debit);return h('tr',{key:(line.journalId||'entry')+'-'+index,className:'border-t'},h('td',{className:'p-2 whitespace-nowrap'},line.date||'—'),h('td',{className:'p-2'},line.journalNumber||line.journalId||'—'),h('td',{className:'p-2 min-w-56'},h('div',{className:'flex flex-wrap items-center gap-2'},h('span',null,line.description||'—'),statementAttachmentAction(line))),h('td',{className:'p-2'},line.reference||'—'),h('td',{className:'p-2 text-end'},fmt(line.debit)),h('td',{className:'p-2 text-end'},fmt(line.credit)),h('td',{className:'p-2 text-end font-bold'},fmt(running)));});
 const movementRows=movements.map(transaction=>{const marker=transaction.partnerCurrentAccountTransfer||{},incoming=['receipt','topup','refund','opening_balance','adjustment_in','transfer_in'].includes(transaction.type);return h('tr',{key:transaction.id,className:'border-t align-top'},h('td',{className:'p-2 whitespace-nowrap'},transaction.date||'—'),h('td',{className:'p-2'},incoming?'وارد':'منصرف'),h('td',{className:'p-2 min-w-56'},h('div',{className:'flex flex-wrap items-center gap-2'},h('span',null,transaction.description||'—'),statementAttachmentActionForReferences([{entityType:'cashCustody',entityId:selected.uid+'--'+transaction.id}]))),h('td',{className:'p-2'},transaction.reference||'—'),h('td',{className:'p-2 text-end font-bold'},fmt(transaction.amount)+' '+(transaction.currency||'EGP')),h('td',{className:'p-2'},transaction.projectCode||'—'),h('td',{className:'p-2'},marker.lastJournalId||marker.transferJournalId||'—'),h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-2'},currentUser&&currentUser.role==='admin'?button(marker.pending?'بانتظار المراجعة':'إرسال إعادة إلى العهدة للمراجعة',()=>transferPartnerCustodyMovement(selected,transaction),'primary',busy||marker.pending):null)));});
 return h('div',{className:'space-y-4'},
  h('div',{className:'grid md:grid-cols-2 gap-3'},...partnerCurrentAccounts.map(account=>{const balance=(account.entries||[]).reduce((sum,line)=>sum+n(line.credit)-n(line.debit),0);return h('button',{type:'button',onClick:()=>{setPartnerCurrentSelectedUid(account.uid||'');setPartnerCurrentAttachmentView(null);},className:'text-start rounded-xl border p-4 '+(account.uid===partnerCurrentSelectedUid?'border-blue-500 bg-blue-50':'bg-white')},h('div',{className:'flex items-start justify-between gap-2'},h('div',null,h('div',{className:'font-bold'},account.partnerName),h('div',{className:'text-xs text-slate-500 mt-1'},account.accountCode+' — '+account.accountName)),h('span',{className:'text-xs rounded-full px-2 py-1 '+(account.linked&&account.active?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800')},account.linked?(account.active?'مرتبط بالمستخدم':'المستخدم غير نشط'):'لم يتم العثور على المستخدم')),h('div',{className:'text-2xl font-extrabold mt-3'},fmt(balance)+' ج.م'),h('div',{className:'text-xs text-slate-500 mt-1'},'عدد الحركات: '+(account.transactions||[]).length));})),
  selected?panel('حساب '+selected.partnerName,'الحساب التحليلي '+selected.accountCode+' مرتبط بالمستخدم '+selected.username+'. حركات العهدة التي تم تحويلها تظهر هنا دون تكرار، ويظل ملف المرفقات مربوطًا بنفس سجل الحركة الأصلي.',h('div',{className:'space-y-3'},h('div',{className:'grid grid-cols-2 xl:grid-cols-4 gap-3'},metric('الحساب المحاسبي',selected.accountCode),metric('إجمالي المدين',fmt(totalDebit)+' ج.م'),metric('إجمالي الدائن',fmt(totalCredit)+' ج.م'),metric('الرصيد الدائن / (المدين)',fmt(Math.abs(partnerBalance))+(partnerBalance>=0?' دائن':' مدين')+' ج.م')),h('div',{className:'flex flex-wrap gap-2 items-center'},field('بحث في حركات الجاري',partnerCurrentSearch,setPartnerCurrentSearch),button('تحديث الحسابات',()=>loadPartnerCurrentAccounts(),'muted',busy),currentUser&&currentUser.role==='admin'?button('تصحيح المصروفات السابقة ('+legacyExpenseCorrectionCount+')',()=>repairPartnerCurrentExpenseTransfers(selected),'primary',busy||legacyExpenseCorrectionCount===0):null),legacyExpenseCorrectionCount?h('p',{className:'text-xs text-amber-700'},'يوجد '+legacyExpenseCorrectionCount+' حركة مصروف قديمة محولة إلى الجاري. سيتم إنشاء قيود تصحيح منفصلة للمطابقة فقط، وتبقى بانتظار اعتماد المراجع قبل تغير الأرصدة والقوائم.'):null,h('h4',{className:'font-bold'},'حركات العهدة المحولة إلى الجاري'),table(['التاريخ','الاتجاه','البيان','المرجع','المبلغ','المشروع','رقم قيد التحويل','الإجراءات'],movementRows),movements.length?null:h('p',{className:'text-sm text-slate-500 p-3 text-center'},'لا توجد حركات محولة إلى جاري هذا الشريك.'),h('h4',{className:'font-bold pt-3'},'كشف الحساب المحاسبي التفصيلي'),table(['التاريخ','رقم القيد','البيان','المرجع','مدين','دائن','الرصيد'],statementRows),h('div',{className:'text-sm font-bold text-slate-800'},'الرصيد الختامي: '+fmt(Math.abs(running))+(running>=0?' دائن':' مدين')+' ج.م'))):panel('جاري الشركاء','اختر حساب أحد الشريكين لعرض حركاته وكشف حسابه.',h('p',{className:'text-sm text-slate-500'},partnerCurrentAccounts.length?'لا يوجد مستخدم مرتبط بالحسابات حتى الآن. تحقق من اسم المستخدم في إدارة المستخدمين.':'تعذر العثور على حسابات الجاري. حدّث الشاشة بعد تهيئة دليل الحسابات.')),
  partnerCurrentAttachmentView?panel('مرفقات الحركة الأصلية','المرفقات باقية على سجل العهدة نفسه ولم يتم نقل الملفات أو إنشاء نسخ منها.',
   h('div',{className:'space-y-2'},
    h('div',{className:'text-sm font-bold'},partnerCurrentAttachmentView.transaction.description||partnerCurrentAttachmentView.transaction.id),
    partnerCurrentAttachmentView.attachments.length
     ?table(['اسم الملف','النوع','الحجم','الإجراء'],partnerCurrentAttachmentView.attachments.map(item=>{
       const entityId=partnerCurrentAttachmentView.ownerUid+'--'+partnerCurrentAttachmentView.transaction.id;
       const reference=Object.assign({},item,{entityType:'cashCustody',entityId});
       return h('tr',{key:item.id,className:'border-t'},
        h('td',{className:'p-2'},item.fileName||'—'),
        h('td',{className:'p-2'},item.mimeType||'—'),
        h('td',{className:'p-2'},fmt((Number(item.size)||0)/1024)+' KB'),
        h('td',{className:'p-2'},
         h('div',{className:'flex flex-wrap gap-1'},
          button('عرض',()=>void openStatementAttachmentFile(reference),'muted',busy),
          button('تحميل',()=>downloadPartnerCustodyAttachment({uid:partnerCurrentAttachmentView.ownerUid},partnerCurrentAttachmentView.transaction,item),'muted',busy),
          canDeleteStatementAttachment(reference)?button('حذف',()=>void deleteStatementAttachment(reference),'danger',busy):null
         )
        )
       );
      }))
     :h('p',{className:'text-sm text-slate-500'},'لا توجد مرفقات مرتبطة بهذه الحركة.')
   )
  ):null
 );
};
const renderCostCenterAnalysis = function() {
  const rowsByCenter=centers.map(function(center){
   const values=flat.filter(function(line){
    if(line.costCenterId!==center.code)return false;
    const account=accounts.find(function(item){return item.code===line.accountCode;});
    return account&&account.type==='expense';
   }).reduce(function(sum,line){sum.debit+=n(line.debit);sum.credit+=n(line.credit);return sum;},{debit:0,credit:0});
   return h('tr',{key:center.code,className:'border-t'},
    h('td',{className:'p-2'},center.code+' — '+center.name),
    h('td',{className:'p-2'},center.projectCode||'—'),
    h('td',{className:'p-2'},fmt(values.debit)),
    h('td',{className:'p-2'},fmt(values.credit)),
    h('td',{className:'p-2 font-bold'},fmt(values.debit-values.credit))
   );
  });
  return panel('تحليل المصروفات الفعلية حسب مركز التكلفة','المبالغ من القيود المرحلة بالفترة المحددة فقط.',table(['مركز التكلفة','المشروع','إجمالي المدين','إجمالي الدائن','صافي المصروف'],rowsByCenter));
 };
 const reviewDetailItem=(label,value)=>h('div',{className:'min-w-0 rounded-lg border bg-white p-3'},h('div',{className:'text-xs font-semibold text-slate-500 mb-1'},label),h('div',{className:'text-sm font-bold text-slate-900 break-words'},value===undefined||value===null||value===''?'—':String(value)));
 const reviewAccountLabel=code=>{
  const account=accounts.find(item=>String(item.code)===String(code));
  return (code||'—')+(account?' — '+account.name:'');
 };
 const reviewCenterLabel=code=>{
  if(!code)return '—';
  const center=centers.find(item=>String(item.code)===String(code));
  return code+(center?' — '+(center.name||''):'');
 };
 const reviewPartyLabel=line=>{
  if(!line.partyId)return '—';
  if(line.partyType==='employeeCustody'||line.partyType==='employeeAdvance'){const registry=line.partyType==='employeeCustody'?rows(master.employeeCustodies):rows(master.employeeAdvances),record=registry.find(item=>String(item.employeeUid||item.code||'')===String(line.partyId||''));return record?String(record.code||'')+' — '+String(record.name||record.employeeName||record.employeeUid||''):(selected&&selected.sourceDetails&&selected.sourceDetails.employeeName||line.partyId);}
  const account=accounts.find(item=>String(item.code)===String(line.accountCode));
  const analyticType=analyticTypeForAccount(account,line);
  if(analyticType==='financingParty'){
   const financier=registeredFinancingParties.find(item=>String(item.code||item.id)===String(line.partyId));
   return financier?'جهة تمويل: '+partyName(financier)+' ('+line.partyId+')':'جهة تمويل غير مسجلة: '+line.partyId;
  }
  const party=financialParties.concat(allClients,allVendors).find(item=>String(item.code||item.id)===String(line.partyId));
  return (party?partyName(party):line.partyId)+' ('+line.partyId+')';
 };
 const renderReviewJournalDetails=()=>{
  const lines=Array.isArray(selected.lines)?selected.lines:[];
  const totals=lines.reduce((sum,line)=>({debit:sum.debit+n(line.debit),credit:sum.credit+n(line.credit)}),{debit:0,credit:0});
  const difference=totals.debit-totals.credit,balanced=Math.abs(difference)<0.01,source=selected.sourceDetails||{};
  const sourcePanel=source.kind==='cashCustody'?panel(t('بيانات حركة العهدة الأصلية','Original Custody Transaction'),t('بيانات الحركة التي تم إنشاء القيد المحاسبي منها.','Source movement used to create this accounting journal.'),
   h('div',{className:'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2'},
    reviewDetailItem(t('الموظف صاحب العهدة','Custody Employee'),source.employeeName),
    reviewDetailItem(t('معرّف الموظف','Employee ID'),source.employeeUid),
    reviewDetailItem(t('نوع الدفتر','Book Scope'),source.bookScope==='company'?t('دفتر الشركة','Company Book'):t('دفتر شخصي','Personal Book')),
    reviewDetailItem(t('نوع الحركة','Movement Type'),({receipt:t('استلام','Receipt'),topup:t('تعزيز عهدة','Custody Top-up'),refund:t('استرداد','Refund'),opening_balance:t('رصيد افتتاحي','Opening Balance'),adjustment_in:t('تسوية واردة','Incoming Adjustment'),transfer_in:t('تحويل وارد','Transfer In'),return:t('رد عهدة','Custody Return'),transfer_out:t('تحويل صادر','Transfer Out'),expense:t('مصروف عهدة','Custody Expense')}[source.movementType]||source.movementType||'—')),
    reviewDetailItem(t('تاريخ الحركة','Movement Date'),source.date),
    reviewDetailItem(t('المبلغ الأصلي','Original Amount'),moneyLabel(source.amount)),
    reviewDetailItem(t('العملة','Currency'),source.currency),
    reviewDetailItem(t('المرجع','Reference'),source.reference),
    reviewDetailItem(t('المشروع','Project'),source.projectName||source.projectCode),
    reviewDetailItem(t('حالة حركة العهدة','Custody Movement Status'),status(source.status)),
    reviewDetailItem(t('الطرف المقابل','Counterparty'),source.counterpartyName),
    reviewDetailItem(t('كود الطرف المقابل','Counterparty Code'),source.counterpartyCode),
    h('div',{className:'col-span-full rounded-lg bg-slate-50 border p-3'},h('div',{className:'text-xs text-slate-500 mb-1'},t('وصف الحركة','Movement Description')),h('div',{className:'text-sm font-semibold whitespace-pre-wrap'},source.description||'—'))
   )
  ):null;
  return h('div',{className:'space-y-3'},
   panel(t('بيانات رأس القيد','Journal Header'),t('راجع تاريخ القيد ووصفه ومرجعه ومصدره قبل اتخاذ قرار الاعتماد.','Review the journal date, description, reference and source before approval.'),
    h('div',{className:'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2'},
     reviewDetailItem(t('رقم القيد','Journal Entry No.'),selected.id),
     reviewDetailItem(t('تاريخ القيد','Journal Date'),selected.date),
     reviewDetailItem(t('المرجع','Reference'),selected.reference),
     reviewDetailItem(t('رقم الشيك','Check Number'),selected.checkNumber||'—'),
     reviewDetailItem(t('رقم الفاتورة','Invoice Number'),selected.invoiceNumber||'—'),
     reviewDetailItem(t('رقم المستند','Document Number'),selected.documentNumber||'—'),
     reviewDetailItem(t('العملة','Currency'),selected.currency||'EGP'),
     reviewDetailItem(t('مصدر القيد','Journal Source'),selected.sourceType==='legacyImport'?t('استيراد أرشيف القيود','Legacy Journal Import'):selected.sourceType==='cashCustody'?t('عهدة موظف','Employee Custody'):selected.sourceType==='projectEvent'?t('حدث مشروع','Project Event'):t('قيد يدوي','Manual Journal')),
     reviewDetailItem(t('أنشأه','Created By'),selected.createdByName||selected.createdBy),
     reviewDetailItem(t('تاريخ الإنشاء','Created At'),selected.createdAt?new Date(Number(selected.createdAt)).toLocaleString(rtl?'ar-EG':'en-GB'):'—'),
     reviewDetailItem(t('كود المشروع','Project Code'),selected.projectCode),
     h('div',{className:'col-span-full rounded-lg bg-slate-50 border p-3'},h('div',{className:'text-xs text-slate-500 mb-1'},t('شرح القيد','Journal Description')),h('div',{className:'text-sm font-semibold whitespace-pre-wrap'},selected.description||'—'))
    )
   ),
   sourcePanel,
   panel(t('سطور القيد المحاسبي','Accounting Journal Lines'),t('هذا هو القيد الذي سيتم ترحيله إلى دفتر الأستاذ عند الاعتماد. كل سطر يوضح الحساب والبيان والطرف ومركز التكلفة والمدين والدائن.','This is the exact journal that will be posted to the General Ledger upon approval. Each row shows the account, description, party, cost center, debit and credit.'),
    h('div',{className:'space-y-3'},
     table([t('م','No.'),t('الحساب','Account'),t('البيان','Description'),t('الطرف التحليلي','Analytical Party'),t('مركز التكلفة','Cost Center'),t('المشروع','Project'),t('الصنف','Item'),t('الكمية','Quantity'),t('مدين','Debit'),t('دائن','Credit')],lines.map((line,index)=>{
      const item=items.find(x=>String(x.code)===String(line.itemCode)),projectCode=line.projectCode||selected.projectCode;
      return h('tr',{key:index,className:'border-t align-top '+(canFinance('review','edit')&&['pending_review','needs_correction'].includes(selected.status)?'cursor-pointer hover:bg-indigo-50':''),
        onClick:()=>{if(canFinance('review','edit')&&['pending_review','needs_correction'].includes(selected.status))openJournalModal(selected);},
        title:canFinance('review','edit')?'اضغط على السطر لتعديل الحساب أو البيان أو القيمة':''
       },
       h('td',{className:'p-2'},String(index+1)),
       h('td',{className:'p-2 min-w-44'},reviewAccountLabel(line.accountCode)),
       h('td',{className:'p-2 min-w-48 whitespace-pre-wrap'},line.description||selected.description||'—'),
       h('td',{className:'p-2 min-w-36'},reviewPartyLabel(line)),
       h('td',{className:'p-2 min-w-40'},reviewCenterLabel(line.costCenterId)),
       h('td',{className:'p-2'},projectCode||'—'),
       h('td',{className:'p-2 min-w-32'},line.itemCode?(item?item.name+' ('+line.itemCode+')':line.itemCode):'—'),
       h('td',{className:'p-2'},line.quantity==null||line.quantity===''?'—':String(line.quantity)+(line.unit?' '+line.unit:'')),
       h('td',{className:'p-2 text-end font-semibold tabular-nums whitespace-nowrap'},moneyLabel(line.debit)),
       h('td',{className:'p-2 text-end font-semibold tabular-nums whitespace-nowrap'},moneyLabel(line.credit))
      );
     })),
     h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
      metric(t('إجمالي المدين','Total Debit'),moneyLabel(totals.debit)),
      metric(t('إجمالي الدائن','Total Credit'),moneyLabel(totals.credit)),
      metric(t('الفرق','Difference'),moneyLabel(difference)),
      h('div',{className:'rounded-xl border p-3 '+(balanced?'border-emerald-200 bg-emerald-50':'border-rose-300 bg-rose-50')},
       h('div',{className:'text-xs font-semibold text-slate-600'},t('نتيجة توازن القيد','Journal Balance')),
       h('div',{className:'text-base font-extrabold '+(balanced?'text-emerald-700':'text-rose-700')},balanced?t('متوازن','Balanced'):t('غير متوازن','Out of Balance'))
      )
     )
    )
   )
  );
 };
const renderIntegrityFindingModal=()=>{
 const finding=integrityAudit&&integrityAudit.findings.find(item=>item.id===integrityFindingSelected);
 if(!finding)return null;
 const related=[...journalRecords,...documents].find(item=>String(item.id)===String(finding.journalId||''))||{};
 const selectedLine=(related.lines||[])[Math.max(0,Number(finding.lineNo||1)-1)]||{};
 const recommendation=finding.recommendation||{changes:[],summary:'لا توجد توصية آلية آمنة لهذه النتيجة.'};
 const currentMasterAccount=accounts.find(item=>String(item.code)===String(finding.accountCode||''))||{};
 const masterAccountRows=recommendation.accountMaster?[ 
  ['نوع الحساب',String(currentMasterAccount.type||'غير محدد'),recommendation.accountMaster.type],
  ['طبيعة الحساب',String(currentMasterAccount.nature||'غير محددة'),recommendation.accountMaster.nature],
  ['الأستاذ المساعد',String(currentMasterAccount.subledgerType||'غير محدد'),recommendation.accountMaster.subledgerType||'بدون'],
  ['حساب تجميعي',currentMasterAccount.isGroup?'نعم':'لا','لا'],
  ['حالة الحساب',currentMasterAccount.active===false?'موقوف':'نشط','نشط']
 ].map((row,index)=>h('tr',{key:'master-'+index,className:'border-t'},row.map((value,column)=>h('td',{key:column,className:'p-2'},value)))):[];
 const changeRows=(recommendation.changes||[]).map(change=>{
  const current=change.key==='accountCode'?String(selectedLine.accountCode||'—'):change.key==='party'?String(selectedLine.partyId||'—')+' ('+String(selectedLine.partyType||'بدون نوع')+')':'—';
  const proposed=change.key==='accountCode'?String(change.value):change.key==='party'?String(change.value)+' ('+analyticPartyLabel(change.partyType)+')':'—';
  return h('tr',{key:String(change.lineNo)+'-'+change.key,className:'border-t'},
   h('td',{className:'p-2'},'السطر '+change.lineNo),
   h('td',{className:'p-2'},change.key==='accountCode'?'الحساب':'الطرف التحليلي'),
   h('td',{className:'p-2 font-semibold'},current),
   h('td',{className:'p-2 font-bold text-blue-700'},proposed)
  );
 });
 return h('div',{className:'fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/70 p-3',onClick:()=>setIntegrityFindingSelected('')},
  h('section',{className:'w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl space-y-3',onClick:event=>event.stopPropagation()},
   h('div',{className:'flex items-center justify-between gap-3'},h('h3',{className:'text-lg font-extrabold'},'تفاصيل نتيجة الفحص — '+finding.category),button('إغلاق',()=>setIntegrityFindingSelected(''),'muted')),
   h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
    metric('رقم القيد',String(finding.journalNumber||finding.journalId||'—')),
    metric('رقم السطر',String(finding.lineNo||'—')),
    metric('الحساب',String(finding.accountCode||'—')),
    metric('الخطورة',finding.severity==='error'?'خطأ':'تنبيه')
   ),
   h('div',{className:'rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-1'},h('b',{className:'text-sm text-rose-900'},'الوضع القائم / سبب المشكلة'),h('p',{className:'text-sm text-rose-900 leading-6'},finding.reason)),
   h('div',{className:'rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-1'},h('b',{className:'text-sm text-blue-900'},'المعالجة المقترحة'),h('p',{className:'text-sm text-blue-900 leading-6'},recommendation.summary||'يلزم فحص يدوي قبل التعديل.')),
   changeRows.length?table(['السطر','الحقل','القيمة الحالية','القيمة المقترحة'],changeRows):null,
   masterAccountRows.length?table(['إعداد الحساب','القيمة الحالية','القيمة المقترحة'],masterAccountRows):null,
   recommendation.accountMaster?button('فتح بطاقة الحساب لتصحيح الإعدادات',()=>openQuickAdd('chartOfAccounts',()=>{void refresh();}, {code:recommendation.accountMaster.code,type:recommendation.accountMaster.type,nature:recommendation.accountMaster.nature,subledgerType:recommendation.accountMaster.subledgerType,isGroup:recommendation.accountMaster.isGroup,active:recommendation.accountMaster.active},recommendation.accountMaster.code),'primary',busy||!canFinance('accounts','edit')):null,
   recommendation.createFinancierName?h('div',{className:'rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm'},'جهة التمويل المقترح تكويدها: ',h('b',null,recommendation.createFinancierName),' — يتم إنشاؤها من قائمة الطرف التحليلي داخل محرر القيد كجهة تمويل مستقلة، وليس كمورد.'):null,
   h('p',{className:'text-xs text-slate-500'},'لا يتم تعديل السجلات أو الأرصدة من شاشة النتائج. قبول الاقتراح يفتح نسخة مراجعة مستقلة للقيد المرحّل أو محرر القيد المعلّق، ويظل الترحيل خاضعًا لاعتماد المراجع والتحقق المحاسبي.'),
   h('div',{className:'flex flex-wrap gap-2 justify-end'},
    button('إلغاء دون تغيير',()=>setIntegrityFindingSelected(''),'muted'),
    button('الإبقاء كما هو وتوثيق القرار',()=>void saveIntegrityFindingKeepDecision(finding),'muted',busy||!canFinance('reports','edit')),
    button('تعديل يدوي دون تطبيق الاقتراح',()=>void openIntegrityFindingEditor(finding,false),'muted',busy||!finding.journalId),
    button('قبول الاقتراح وفتح المعالجة',()=>void openIntegrityFindingEditor(finding,true),'primary',busy||!finding.journalId||!recommendation.changes||!recommendation.changes.length)
   )
  )
 );
};
const renderIntegrityAuditPanel=()=>{
 if(!integrityAudit)return null;
 const rows=integrityAudit.findings.map(finding=>{
  const action=button('التفاصيل / القرار',()=>setIntegrityFindingSelected(finding.id),'muted');
  return h('tr',{key:finding.id,className:'border-t align-top'},
   h('td',{className:'p-2'},finding.severity==='error'?h('span',{className:'font-bold text-rose-700'},'خطأ'):h('span',{className:'font-bold text-amber-700'},'تنبيه')),
   h('td',{className:'p-2'},finding.category),
   h('td',{className:'p-2'},[finding.journalNumber||finding.journalId,finding.lineNo?'سطر '+finding.lineNo:'',finding.accountCode?'حساب '+finding.accountCode:''].filter(Boolean).join(' / ')||'—'),
   h('td',{className:'p-2 min-w-[300px]'},finding.reason),
   h('td',{className:'p-2 min-w-[260px] text-xs'},finding.recommendation&&finding.recommendation.summary||'يلزم فحص يدوي قبل التعديل.'),
   h('td',{className:'p-2 text-xs'},finding.reviewDecision==='accepted_risk'?'تم الإبقاء كما هو':finding.reviewDecision||'لم يُتخذ قرار'),
   h('td',{className:'p-2'},action)
  );
 });
 return panel(
  'تقرير الفحص الذكي — '+new Date(integrityAudit.createdAt).toLocaleString('ar-EG-u-nu-latn'),
  'تم فحص '+integrityAudit.journalCount+' قيدًا ('+integrityAudit.postedCount+' مرحّل) للفترة حتى '+(integrityAudit.period.to||'—')+'. تظهر المشكلة وسببها والتوصية، ولا ينفذ أي تعديل قبل قرار المستخدم.',
  h('div',{className:'space-y-3'},
   h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
    metric('أخطاء واجبة المعالجة',String(integrityAudit.errors)),
    metric('تنبيهات',String(integrityAudit.warnings)),
    metric('إجمالي النتائج',String(integrityAudit.findings.length)),
    metric('حالة الفحص',integrityAudit.errors?'توجد أخطاء':'لا توجد أخطاء')
   ),
   table(['الخطورة','نوع الفحص','القيد / السطر / الحساب','سبب المشكلة','المعالجة المقترحة','قرار المراجع','الإجراء'],rows),
   renderIntegrityFindingModal()
  )
 );
};
const renderReview=()=>panel('مركز المراجعة والفحص والاعتماد','شاشة موحدة تجمع مراجعة المستندات والقيود، فحص سلامة الأستاذ العام والمساعد، تحليل الحسابات والأطراف، التوصيات وقرارات المراجع.',h('div',{className:'space-y-3'},
  h('div',{className:'flex flex-wrap items-center justify-between gap-2'},h('strong',null,'مستندات بانتظار القرار: '+review.length),h('div',{className:'flex flex-wrap gap-2'},button(integrityAuditBusy?'جارٍ الفحص...':'تشغيل الفحص الموحد',runUnifiedReview,'primary',integrityAuditBusy||!canFinance("journal","view")),button('تحديث القائمة الآن',()=>refreshReviewQueue(false),'muted'))),

  panel('قواعد الفحص المطبقة','هذه الضوابط تعمل ضمن الفحص الموحد، ويظهر سبب كل مخالفة والمعالجة المقترحة في تقرير النتائج.',   h('div',{className:'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2'},
    ...[
     {title:'سلامة القيد والتوازن',description:'وجود سطرين على الأقل، وصحة المبالغ، وعدم وجود قيم سالبة أو تحميل المدين والدائن في السطر نفسه، ومطابقة إجمالي الطرفين حتى مستوى القرش.'},
     {title:'صحة الحساب والتوجيه',description:'التأكد من وجود الحساب في الدليل، وأنه نشط ويقبل الترحيل وليس حسابًا تجميعيًا، وأن كل سطر موجّه إلى كود صحيح.'},
     {title:'الأطراف التحليلية',description:'التأكد من إلزامية الطرف التحليلي وصحة نوعه وكوده، ومطابقة العملاء والموردين وجهات التمويل مع سجلاتها المستقلة.'},
     {title:'جهات التمويل',description:'حساب 2150 يرتبط بدليل جهات التمويل المستقل فقط، ولا يقبل كود مورد. تتم مطابقة اسم الممول الوارد في بيان القيد مع سجل الممول.'},
     {title:'مراكز التكلفة',description:'التحقق من أن مركز التكلفة المرتبط بكل سطر موجود في دليل مراكز التكلفة.'},
     {title:'توجيه الضرائب',description:'قيمة مضافة مدخلات إلى 1410، ومخرجات إلى 2110، وخصم/إضافة إلى 2120، مع مراجعة توافق نوع الكود الضريبي مع حسابه المحاسبي.'},
     {title:'الفواتير وربط الأطراف',description:'مطابقة حساب المورد 281 أو العميل 1210 مع طرف الفاتورة المصدر، والتأكد من عدم سقوط حساب الرقابة أو تغيير كود الطرف.'},
     {title:'ضريبة الخصم والإضافة',description:'مقارنة الطرف التحليلي على 2120 بالطرف المقابل في حساب المورد 281 أو العملاء 1210، وإظهار اختلاف الكود والسبب.'},
     {title:'السداد والتحصيل',description:'فحص توجيه مدفوعات الموردين وتحصيلات العملاء، ومطابقة سداد الضرائب واسترداد القيمة المضافة مع مبالغ المستند والحسابات المقابلة.'},
     {title:'مطابقة الأستاذ المساعد',description:'مقارنة حركة كل حساب رقابي بإجمالي الأطراف التحليلية التابعة له، وإظهار فروق المدين والدائن حتى 0.01 جنيه.'},
     {title:'دفتر الأستاذ وميزان المراجعة',description:'مطابقة القيود المرحّلة مع فهرس الأستاذ حسب الحساب والفترة، واكتشاف الفهرس المفقود أو غير المؤرخ، وفحص اتزان إجمالي ميزان المراجعة.'},
     {title:'إعدادات الحسابات الرئيسية',description:'مراجعة نوع الحساب وطبيعته وربطه بالأستاذ المساعد للحسابات 1410 و2110 و2120 و2150 و281 و1210، مع التنبيه للقيود المعادة للتصحيح.'}
    ].map((rule,index)=>h('div',{key:index,className:'rounded-lg border border-slate-200 bg-white p-3 min-w-0'},
     h('div',{className:'text-xs font-extrabold text-slate-800 mb-1'},String(index+1)+'. '+rule.title),
     h('p',{className:'text-xs leading-6 text-slate-600'},rule.description)
    ))
   )),
  renderIntegrityAuditPanel(),
  canFinance('reports','view')?renderAccountReview():null,
  selected?h('div',{className:'space-y-3'},
   h('div',{className:'flex items-center justify-between'},h('strong',null,selected.type==='journal'&&selected.number?'رقم القيد: '+selected.number+(selected.title&&selected.title!=='قيد رقم '+selected.number?' — '+selected.title:''):selected.title||selected.number||selected.id),button('إغلاق',()=>setSelected(null))),
   h('p',{className:'text-sm'},t('النوع: ','Type: ')+(selected.type==='invoice'?(selected.invoiceType==='purchase'?t('فاتورة مشتريات','Purchase Invoice'):t('فاتورة مبيعات','Sales Invoice')):documentType(selected.type))+' · '+t('التاريخ: ','Date: ')+(selected.date||'—')+' · '+t('الحالة: ','Status: ')+status(selected.status)),
   h('p',{className:'text-sm font-bold'},t('قيمة القيد / المستند: ','Journal / Document Amount: ')+moneyLabel(selected.total||selected.amount||(selected.type==='journal'?(selected.lines||[]).reduce((sum,line)=>sum+n(line.debit),0):0))),
   selected.type==='journal'?renderReviewJournalDetails():null,
   selected.type==='journal'?h('div',{className:'flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3'},h('b',{className:'text-sm'},'مرفقات القيد'),statementAttachmentAction(selected)||h('span',{className:'text-xs text-slate-500'},'لا توجد مرفقات مرتبطة بهذا القيد'),journalAttachmentUploadControl(selected)):null,
    selected.type==='journal'&&canFinance('review','edit')&&['pending_review','needs_correction'].includes(selected.status)?button('تعديل القيد',()=>openJournalModal(selected),'primary',busy):null,
    (selected.reviewReason||'')?h('p',{className:'rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900'},'ملاحظة المراجعة السابقة: '+selected.reviewReason):null,
   (selected.errors||[]).length?h('ul',{className:'list-disc pr-5 text-rose-700'},selected.errors.map((x,i)=>h('li',{key:i},x))):null,
   (selected.warnings||[]).length?h('ul',{className:'list-disc pr-5 text-amber-700'},selected.warnings.map((x,i)=>h('li',{key:i},x))):null,
    selected.type==='invoice'&&canFinance("review","edit")?panel('استكمال وتصحيح بيانات الفاتورة','يمكن للمراجع تعديل بيانات الرأس وكود الضريبة والبنود ثم حفظ التصحيحات قبل الاعتماد.',h('div',{className:'space-y-3'},
     h('div',{className:'grid md:grid-cols-3 gap-2'},
      field('رقم الفاتورة',selected.number||'',v=>setSelected(old=>Object.assign({},old,{number:v}))),
      field('تاريخ الفاتورة',selected.date||'',v=>setSelected(old=>Object.assign({},old,{date:v})),'date'),
      select('نوع الفاتورة',selected.invoiceType||'purchase',v=>setSelected(old=>Object.assign({},old,{invoiceType:v,taxCode:'',taxType:v==='purchase'?'vat_input':'vat_output'})),[{value:'purchase',label:'مشتريات'},{value:'sales',label:'مبيعات'}]),
      field('كود العميل / المورد',selected.partyId||'',v=>setSelected(old=>Object.assign({},old,{partyId:v}))),
      field('اسم العميل / المورد',selected.partyName||'',v=>setSelected(old=>Object.assign({},old,{partyName:v}))),
      field('الرقم الضريبي للطرف',selected.partyTaxNumber||'',v=>setSelected(old=>Object.assign({},old,{partyTaxNumber:v}))),
      select('العملة',selected.currency||'EGP',v=>setSelected(old=>Object.assign({},old,{currency:v})),[{value:'EGP',label:'EGP — الجنيه المصري'}]),
      select('كود ضريبة القيمة المضافة',selected.taxCode||'',v=>{const tax=rows(master.taxCodes).find(x=>x.code===v);setSelected(old=>Object.assign({},old,{taxCode:v,taxType:tax?tax.taxType:(old.invoiceType==='purchase'?'vat_input':'vat_output'),taxRate:tax?String(tax.rate):old.taxRate||''}));},[{value:'',label:'بدون كود ضريبي'}].concat(rows(master.taxCodes).filter(x=>x.taxType===(selected.invoiceType==='purchase'?'vat_input':'vat_output')&&x.active!==false).map(x=>({value:x.code,label:x.code+' — '+x.name+' ('+x.rate+'%)'})))),
      field('نسبة الضريبة %',selected.taxRate==null?'':String(selected.taxRate),v=>setSelected(old=>Object.assign({},old,{taxRate:v})),'number'),
      field('قيمة الضريبة الثابتة',selected.taxAmount==null?'':String(selected.taxAmount),v=>setSelected(old=>Object.assign({},old,{taxAmount:v})),'number'),
      field('خصم الفاتورة',selected.discount==null?'':String(selected.discount),v=>setSelected(old=>Object.assign({},old,{discount:v})),'number'),
      field('كود المشروع',selected.projectCode||'',v=>setSelected(old=>Object.assign({},old,{projectCode:v})))
     ),
     h('div',{className:'space-y-2'},(selected.lines||[]).map((line,index)=>{
      const setLine=(key,value)=>setSelected(old=>Object.assign({},old,{lines:(old.lines||[]).map((x,i)=>i===index?Object.assign({},x,{[key]:value}):x)}));
      return h('div',{key:index,className:'grid md:grid-cols-12 gap-2 rounded-lg border p-2 bg-slate-50'},
       h('div',{className:'md:col-span-3'},field('وصف البند',line.description||'',v=>setLine('description',v))),
       h('div',{className:'md:col-span-2'},select('نوع البند',line.kind||'',v=>setLine('kind',v),[{value:'',label:'غير محدد'},{value:'stock',label:'مخزني'},{value:'service',label:'مصروف / خدمة'}])),
       h('div',{className:'md:col-span-2'},line.kind==='stock'?field('كود الصنف',line.itemCode||'',v=>setLine('itemCode',v)):field(selected.invoiceType==='purchase'?'حساب المصروف':'حساب الإيراد',selected.invoiceType==='purchase'?(line.accountCode||''):(line.incomeAccountCode||''),v=>setLine(selected.invoiceType==='purchase'?'accountCode':'incomeAccountCode',v))),
       h('div',{className:'md:col-span-1'},field('الكمية',line.quantity==null?'':String(line.quantity),v=>setLine('quantity',v),'number')),
       h('div',{className:'md:col-span-1'},field('السعر',line.unitPrice==null?'':String(line.unitPrice),v=>setLine('unitPrice',v),'number')),
       h('div',{className:'md:col-span-1'},field('الخصم',line.discount==null?'':String(line.discount),v=>setLine('discount',v),'number')),
       h('div',{className:'md:col-span-2'},field('مركز التكلفة',line.costCenterId||'',v=>setLine('costCenterId',v)))
      );
     })),
     button('إضافة بند للفاتورة',()=>setSelected(old=>Object.assign({},old,{lines:(old.lines||[]).concat([{description:'',kind:'',quantity:'',unitPrice:'',discount:'',itemCode:'',accountCode:'',incomeAccountCode:'',costCenterId:'',warehouseCode:'default'}])})),'muted'),
     button('حفظ تصحيحات المراجع',saveReviewInvoice,'primary',busy)
    )):null,
   selected.type==='invoice'&&(canFinance("review","edit")||canFinance("invoices","edit")||(selected.createdBy===currentUser.uid&&canFinance("invoices","add")))?panel(selected.attachmentUploadStatus==='pending'?'المرفق لم يتم رفعه بعد':'إضافة مرفق للفاتورة',selected.attachmentUploadError||'يمكنك رفع صورة أو ملف الفاتورة وربطه بالمستند من هنا.',h('label',{className:'inline-flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-bold cursor-pointer'},'اختيار صورة أو ملف وإرفاقه',h('input',{type:'file',accept:'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',disabled:busy,className:'text-xs font-normal',onChange:e=>{const file=e.target.files&&e.target.files[0];if(file)void retryInvoiceAttachment(file,selected.id);e.target.value='';}}))):null,
   Object.keys(selected.attachments||{}).length?panel('مرفقات المستند','الملفات محفوظة في مساحة المرفقات المالية المرتبطة بالفاتورة.',table(['اسم الملف','النوع','الحجم','الإجراء'],Object.values(selected.attachments||{}).map(function(attachment){return h('tr',{key:attachment.id,className:'border-t'},h('td',{className:'p-2'},attachment.fileName||'—'),h('td',{className:'p-2'},attachment.mimeType||'—'),h('td',{className:'p-2'},fmt((Number(attachment.size)||0)/1024)+' KB'),h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-1'},button('تحميل المرفق',function(){downloadFinancialAttachment(selected.id,attachment);},'muted'),canDeleteStatementAttachment({entityType:'financial',entityId:selected.id})?button('حذف',()=>void deleteStatementAttachment(Object.assign({},attachment,{entityType:'financial',entityId:selected.id}),selected.id),'danger',busy):null)));}))) : null,
   selected.type==='bankLine'?selectWithAdd('الحساب المقابل',offset,v=>setOffset(v),posting.map(a=>({value:a.code,label:a.code+' — '+a.name})),'chartOfAccounts',{type:'expense',nature:'debit',parentCode:'6'},'review-bank-offset-'+String(selected.id)):null,
   selected.type==='bankLine'?canFinance("bank","edit")?button('حفظ الحساب المقابل',async()=>{try{await api('', 'POST',{action:'setBankOffset',id:selected.id,offsetAccountCode:offset});setNotice('تم حفظ الحساب المقابل');await refreshReviewQueue(true);}catch(e){setError(e.message);}}):null:null,
   h('div',{className:'flex flex-wrap gap-2'},
     canFinance("review","approve")?button('اعتماد وترحيل',()=>reviewAction(selected.status==='duplicate_review'?'approveDuplicate':'approve'),'success',busy):null,
     canFinance("review","edit")?button('إعادة للتصحيح',()=>reviewAction('return'),'muted',busy):null,
     canFinance("review","approve")?button('رفض',()=>reviewAction('reject'),'danger',busy):null,
     selected.type==='journal'&&canFinance("journal","delete")?button('مسح القيد',()=>void deleteJournalDocument(selected),'danger',busy):null,
     selected.type==='invoice'&&canFinance('invoices','delete')?button('حذف الفاتورة',()=>void deleteInvoiceRecord(selected),'danger',busy):null
    )
  ):table(['رقم المستند / القيد','البيان والمرجع','النوع','التاريخ','الطرف','المشروع','المبلغ','مقدم الطلب','الحالة','ملاحظات الفحص','المرفق','مراجعة'],review.map(x=>{
   const title=String(x.title||''),number=String(x.number||x.invoiceNumber||x.documentNumber||x.id||'—');
   const party=x.partyName||x.counterpartyName||x.supplierName||x.customerName||(Array.isArray(x.analyticParties)?x.analyticParties.join('، '):'')||'—';
   const project=x.projectName||x.projectCode||'—',amount=Number(x.total||x.amount||0),currency=x.currency||'EGP';
   const errors=Array.isArray(x.errors)?x.errors:[],warnings=Array.isArray(x.warnings)?x.warnings:[];
   const typeLabel=x.type==='journal'?'قيد يومية':x.type==='invoice'?(x.invoiceType==='purchase'?'فاتورة مشتريات':'فاتورة مبيعات'):x.type==='cash'?'الخزينة':x.type==='bank'?'البنوك':x.type||'—';
   return h('tr',{key:x.id,className:'border-t align-top'},
    h('td',{className:'p-2 min-w-[170px]'},h('div',{className:'font-bold text-slate-800'},number),title&&title!==number?h('div',{className:'text-[10px] text-slate-500 mt-1'},title):null),
    h('td',{className:'p-2 min-w-[210px]'},h('div',{className:'whitespace-normal font-medium'},x.description||title||'—'),x.reference?h('div',{className:'text-[10px] text-slate-500 mt-1'},'المرجع: '+x.reference):null,Number(x.lineCount||0)>0?h('div',{className:'text-[10px] text-slate-500 mt-1'},'عدد السطور: '+x.lineCount):null),
    h('td',{className:'p-2 whitespace-nowrap'},typeLabel),
    h('td',{className:'p-2 whitespace-nowrap'},x.date||'—'),
    h('td',{className:'p-2 min-w-[130px]'},party),
    h('td',{className:'p-2 whitespace-nowrap'},project),
    h('td',{className:'p-2 whitespace-nowrap text-end font-extrabold tabular-nums'},fmt(amount)+' '+currency),
    h('td',{className:'p-2 min-w-[110px]'},x.createdByName||'—'),
    h('td',{className:'p-2 whitespace-nowrap'},status(x.status)),
    h('td',{className:'p-2 min-w-[110px]'},errors.length?h('div',{className:'text-rose-700 font-bold'},'أخطاء: '+errors.length):null,warnings.length?h('div',{className:'text-amber-700 font-bold'},'تنبيهات: '+warnings.length):null,!errors.length&&!warnings.length?'—':null),
    h('td',{className:'p-2 min-w-[120px]'},x.attachmentUploadStatus==='pending'?'المرفق يحتاج إعادة رفع':x.attachmentFileName||'—'),
    h('td',{className:'p-2'},button('فتح',()=>{void openReviewItem(x);},'muted'))
   );
  })),
   renderReviewJournalEditor()
  ));
 const renderCash=()=>{
  const movementLabels={customer_receipt:"تحصيل من عميل",supplier_payment:"سداد إلى مورد",other_receipt:"استلام نقدية / إيراد آخر",other_payment:"مصروف / مدفوعات أخرى",tax_payment:"سداد ضريبة (قيمة مضافة / خصم وإضافة)",vat_refund:"استرداد قيمة مضافة",cash_to_bank:"إيداع نقدية بالبنك",bank_to_cash:"سحب نقدية من البنك",employee_custody:"تسليم عهدة لموظف",employee_custody_return:"استرداد عهدة من موظف",employee_advance:"صرف سلفة لموظف",employee_advance_recovery:"تحصيل سلفة من موظف"};
  const movement=cash.movementType;
  const activeEmployees=(userDirectory||[]).filter(u=>u.uid&&u.uid!==currentUser.uid&&["active","نشط","مفعل","enabled"].includes(String(u.status||"").toLowerCase()));
  const accountOptions=posting.map(a=>({value:a.code,label:a.code+" — "+a.name}));
  const bankOptions=[{value:"1120",label:"1120 — البنوك"}].concat(rows(master.bankAccounts).filter(x=>x.active!==false).map(x=>({value:x.accountCode||x.code,label:(x.accountCode||x.code)+" — "+x.name})));
  const isParty=movement==="customer_receipt"||movement==="supplier_payment",isEmployee=movement.startsWith("employee_"),isOther=movement==="other_receipt"||movement==="other_payment",isTransfer=movement==="cash_to_bank"||movement==="bank_to_cash",isCustody=movement==="employee_custody"||movement==="employee_custody_return",isAdvance=movement==="employee_advance"||movement==="employee_advance_recovery",isTaxPayment=movement==="tax_payment",isVatRefund=movement==="vat_refund";
  const counterparty=movement==="customer_receipt"?partyPicker("العميل",activeClients,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id,partyName:partyName(p)})),cashPartySearch,setCashPartySearch,"customer"):movement==="supplier_payment"?partyPicker("المورد",activeVendors,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id,partyName:partyName(p)})),cashPartySearch,setCashPartySearch,"vendor"):null;
  const employeeSelect=isEmployee?select("الموظف المستلم / المسدد",cash.employeeUid,v=>{const user=activeEmployees.find(u=>u.uid===v);setCash(o=>Object.assign({},o,{employeeUid:v,employeeName:user&&(user.fullName||user.username||user.email)||""}));},[{value:"",label:"اختر المستخدم الداخلي"},...activeEmployees.map(u=>({value:u.uid,label:(u.fullName||u.username||u.email)+" — "+(u.jobTitle||"")}))]):null;
  const offsetType=movement==="other_receipt"?"revenue":"expense";
  const offsetSelect=isOther?selectWithAdd(offsetType==="revenue"?"حساب الإيراد المقابل":"حساب المصروف",cash.offsetAccountCode,v=>setCash(o=>Object.assign({},o,{offsetAccountCode:v})),accountOptions.filter(a=>{const x=accounts.find(z=>z.code===a.value);return x&&x.type===offsetType;}),"chartOfAccounts",{type:offsetType,nature:offsetType==="revenue"?"credit":"debit",parentCode:offsetType==="revenue"?"4":"6"}):null;
  const taxAccountSelect=isTaxPayment?select("حساب الضريبة المطلوب سداده",cash.taxAccountCode||"2110",v=>setCash(o=>Object.assign({},o,{taxAccountCode:v})),[{value:"2110",label:"2110 — ضريبة القيمة المضافة - مخرجات"},{value:"2120",label:"2120 — ضرائب الخصم والإضافة المستحقة"}]):null;
  const bankSelect=isTransfer?selectWithAdd("حساب البنك",cash.bankAccountCode,v=>setCash(o=>Object.assign({},o,{bankAccountCode:v})),bankOptions,"bankAccounts",{code:"BANK-NEW",name:"حساب بنك جديد",accountCode:"1120"}):null;
  const cashAccountSelect=selectWithAdd("حساب النقدية",cash.cashAccountCode,v=>setCash(o=>Object.assign({},o,{cashAccountCode:v})),posting.filter(a=>a.type==="asset"&&(a.code==="1110"||a.code==="1120"||a.isCash)).map(a=>({value:a.code,label:a.code+" — "+a.name})),"chartOfAccounts",{type:"asset",nature:"debit",parentCode:"11"});
  const history=documents.filter(x=>x.type==="cash"&&(!cashHistorySearch||[x.id,x.reference,x.description,x.partyName,x.employeeName,x.movementType,x.partyId,x.employeeUid].join(" ").toLowerCase().includes(cashHistorySearch.toLowerCase()))).sort((a,b)=>n(b.createdAt)-n(a.createdAt));
  const historyRows=history.map(x=>h("tr",{key:x.id,className:"border-t"},h("td",{className:"p-2"},x.date||"—"),h("td",{className:"p-2"},movementLabels[x.movementType]||x.movementType||"—"),h("td",{className:"p-2"},x.partyName||x.employeeName||x.description||"—"),h("td",{className:"p-2"},x.reference||"—"),h("td",{className:"p-2 font-bold"},fmt(x.amount)),h("td",{className:"p-2"},status(x.status)),h("td",{className:"p-2"},x.status==="pending_review"?button("فتح للمراجعة",()=>{setSelected(x);setTab("review");},"muted"):"—")));
  return h("div",{className:"space-y-4"},
   panel("سندات الخزينة والبنوك","سجّل أي حركة نقدية أو بنكية. العهد والسلف تُربط بحساب الموظف التحليلي وتنعكس في كشف العهد الشخصية، ولا يتم ترحيل الأرصدة قبل الاعتماد.",h("div",{className:"grid md:grid-cols-3 gap-3"},
    select("نوع الحركة",movement,v=>setCash(o=>Object.assign({},o,{movementType:v,partyId:"",partyName:"",employeeUid:"",employeeName:""})),Object.entries(movementLabels).map(([value,label])=>({value,label}))),
    field("التاريخ",cash.date,v=>setCash(o=>Object.assign({},o,{date:v})),"date"),
    field("المبلغ",cash.amount,v=>setCash(o=>Object.assign({},o,{amount:v})),"number"),
    select("العملة",cash.currency,v=>setCash(o=>Object.assign({},o,{currency:v})),["EGP"].map(x=>({value:x,label:x+' — الجنيه المصري'}))),
    h("p",{className:"md:col-span-3 text-xs text-amber-700"},"العملات الأجنبية غير مفعّلة محاسبيًا حتى تجهيز أسعار الصرف وفروق العملة؛ الحركات الحالية بالجنيه المصري فقط."),
    counterparty,employeeSelect,cashAccountSelect,bankSelect,offsetSelect,taxAccountSelect,
    select("مركز التكلفة / المشروع",cash.projectCode,v=>setCash(o=>Object.assign({},o,{projectCode:v})),[{value:"",label:"بدون مركز تكلفة"},...activeCenters.map(x=>({value:x.code,label:x.code+" — "+x.name}))]),
    field("مرجع / رقم مستند",cash.reference,v=>setCash(o=>Object.assign({},o,{reference:v}))),
    h("div",{className:"md:col-span-3"},area("البيان والتفاصيل",cash.description,v=>setCash(o=>Object.assign({},o,{description:v})))),
    isCustody?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"التسليم ينشئ حركة مقابلة في عهدة الموظف الشخصية، والاسترداد يخفض رصيد العهدة تلقائيًا بعد الاعتماد."):null,
    isAdvance?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"السلفة تسجل على حساب السلف للموظف بصورة مستقلة عن العهدة، والتحصيل يخفض رصيد السلفة بعد الاعتماد."):null,
    isTaxPayment?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"سداد 2110 يُخفض التزام ضريبة القيمة المضافة، وسداد 2120 يُخفض ضريبة الخصم والإضافة. القيد المقابل على الخزينة أو البنك، ولا يُسجل السداد كمصروف."):null,
    isVatRefund?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"استرداد ضريبة المدخلات يسجل مدينًا في الخزينة / البنك ودائنًا في 1410 — ضريبة القيمة المضافة مدخلات."):null,
    button(busy?"جارٍ الحفظ...":"حفظ وإرسال إلى المراجعة",submitCash,"primary",busy||!canFinance("cash","add")||!cash.amount||!cash.description.trim()||(isParty&&!cash.partyId)||(isEmployee&&!cash.employeeUid)||(isOther&&!cash.offsetAccountCode)||(isTransfer&&!cash.bankAccountCode)||(isTaxPayment&&!["2110","2120"].includes(String(cash.taxAccountCode||"2110"))))
   )),
   panel("كشف حركات الخزينة","كل التسجيلات ظاهرة هنا ويمكن البحث فيها، سواء كانت معلقة أو معتمدة أو مرفوضة.",h("div",{className:"space-y-3"},field("بحث برقم المستند أو الطرف أو الموظف أو البيان",cashHistorySearch,setCashHistorySearch),table(["التاريخ","نوع الحركة","الطرف / البيان","المرجع","المبلغ","الحالة","الإجراء"],historyRows)))
  );
 };
 const renderBank=()=>panel('استيراد كشف حساب البنك','Excel أو CSV. المكررات تعرض للمراجع بدل ترحيلها تلقائيًا.',h('div',{className:'space-y-3'},
  selectWithAdd('حساب البنك',bankAccount,v=>setBankAccount(v),[{value:'1120',label:'1120 — البنوك'},...rows(master.bankAccounts).map(x=>({value:x.accountCode||x.code,label:x.code+' — '+x.name}))],'bankAccounts',{code:bankAccount,accountCode:bankAccount}),
  h('label',{className:'block text-sm font-bold'},'ملف كشف الحساب',h('input',{type:'file',accept:'.xlsx,.xls,.csv',className:'block mt-1',onChange:e=>e.target.files&&e.target.files[0]&&parseBank(e.target.files[0])})),
  bankRows.length?table(['التاريخ','الوصف','المرجع','المبلغ','النوع'],bankRows.map((x,i)=>h('tr',{key:i},h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.description),h('td',{className:'p-2'},x.reference),h('td',{className:'p-2'},fmt(x.amount)),h('td',{className:'p-2'},x.direction==='in'?'وارد':'صادر')))):null,
  button('إرسال الحركات إلى المراجعة',sendBank,'primary',busy||!canFinance("bank","add")||!bankRows.length)
 ));
 const renderInventory = function() {
  const groupTotals={};
  const stockRows = items.map(function(item) {
   const warehouse=item.warehouseCode||'default';
   const balancesByWarehouse=master.inventory&&master.inventory.balances||{};
   const warehouseBalances=balancesByWarehouse[warehouse]||{};
   const stock=warehouseBalances[item.code]||{};
   const group=item.groupCode||'بدون مجموعة';
   const groupKey=group+'|'+warehouse;
   if(!groupTotals[groupKey])groupTotals[groupKey]={group:group,warehouse:warehouse,quantity:0,value:0};
   groupTotals[groupKey].quantity+=n(stock.quantity);
   groupTotals[groupKey].value+=n(stock.value);
   return h('tr',{key:item.code,className:'border-t'},
    h('td',{className:'p-2'},item.code),
    h('td',{className:'p-2'},item.name),
    h('td',{className:'p-2'},group),
    h('td',{className:'p-2'},item.version||'—'),
    h('td',{className:'p-2'},item.unit||'—'),
    h('td',{className:'p-2'},warehouse),
    h('td',{className:'p-2'},fmt(stock.quantity||0)),
    h('td',{className:'p-2'},fmt(stock.averageCost||0)),
    h('td',{className:'p-2'},fmt(stock.value||0))
   );
  });
  const groupRows=Object.values(groupTotals).map(function(group){
   const average=group.quantity>0?group.value/group.quantity:0;
   return h('tr',{key:group.group+'|'+group.warehouse,className:'border-t'},
    h('td',{className:'p-2'},group.group),
    h('td',{className:'p-2'},group.warehouse),
    h('td',{className:'p-2'},fmt(group.quantity)),
    h('td',{className:'p-2'},fmt(average)),
    h('td',{className:'p-2'},fmt(group.value))
   );
  });
  const groupPanel=panel('إجمالي المخزون حسب المجموعة والمخزن','يمكن فتح المجموعة لمشاهدة الإصدارات والأكواد التفصيلية.',table(['المجموعة','المخزن','إجمالي الكمية','متوسط تكلفة المجموعة','قيمة الرصيد'],groupRows));
  const detailsPanel=panel('تفاصيل الأصناف والإصدارات','الرصيد والتكلفة محفوظان على مستوى كود الصنف والإصدار والمخزن.',table(['الكود','الصنف','المجموعة','الإصدار','الوحدة','المخزن','الكمية','متوسط التكلفة','القيمة'],stockRows));
  return h('div',{className:'space-y-4'},groupPanel,detailsPanel);
 };
 const openInventoryMovementEditor=movement=>{
  setInventoryMovementModal({mode:"editMovement",movementId:movement.id,itemCode:movement.itemCode,warehouseCode:movement.warehouseCode||"default",
   date:movement.date||today(),kind:movement.kind==="sale"?"sale":"purchase",quantity:String(Math.abs(n(movement.quantity))),value:String(Math.abs(n(movement.value)))});
 };
 const openInventoryBalanceEditor=(itemCode,warehouseCode,stock)=>{
  setInventoryMovementModal({mode:"setBalance",itemCode,warehouseCode:warehouseCode||"default",date:today(),quantity:String(n(stock&&stock.quantity)),value:String(n(stock&&stock.value))});
 };
 const submitInventoryChange=async form=>{
  if(!form||busy)return;
  if(form.mode!=="deleteMovement"&&(!String(form.quantity??"").trim()||!String(form.value??"").trim())){setError("أدخل الكمية والقيمة قبل الحفظ.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api("","POST",{action:"changeInventoryMovement",mode:form.mode,movementId:form.movementId,itemCode:form.itemCode,
    warehouseCode:form.warehouseCode,date:form.date,kind:form.kind,quantity:form.quantity,value:form.value,
    description:form.mode==="setBalance"?"تسوية رصيد المخزون من شاشة المخزون":"تعديل حركة مخزون"});
   setInventoryMovementModal(null);
   if(result.pendingReview)setNotice("تم إرسال تسوية المخزون إلى المراجعة بقيد رقم "+(result.number||result.id)+". لن يتغير الرصيد إلا بعد الاعتماد.");
   else setNotice("تم تحديث حركة المخزون والرصيد بنجاح.");
   await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const deleteInventoryMovement=async movement=>{
  if(!movement||busy)return;
  if(!window.confirm("تأكيد حذف حركة المخزون للصنف "+movement.itemCode+" في المخزن "+(movement.warehouseCode||"default")+"؟ سيتم إعادة احتساب الرصيد، وإذا تغيرت قيمة حساب المخزون فسيُنشأ قيد تسوية للمراجعة."))return;
  await submitInventoryChange({mode:"deleteMovement",movementId:movement.id,itemCode:movement.itemCode,warehouseCode:movement.warehouseCode||"default"});
 };
 const clearInventoryBalance=async(itemCode,warehouseCode)=>{
  if(!window.confirm("سيتم تصفير كمية وقيمة الصنف "+itemCode+" في المخزن "+warehouseCode+". إذا تغيرت قيمة حساب المخزون فسيُنشأ قيد تسوية للمراجعة. هل تريد المتابعة؟"))return;
  await submitInventoryChange({mode:"setBalance",itemCode,warehouseCode,date:today(),quantity:"0",value:"0"});
 };
 const renderInventoryMovements=()=>{
  const activeMovements=inventoryMovements.filter(item=>!item.cancelledByJournalDeletion&&!item.cancelledByJournalUnpost&&!item.reversedByJournalId);
  const inbound=activeMovements.filter(item=>item.kind==="purchase"||n(item.quantity)>0);
  const outbound=activeMovements.filter(item=>item.kind==="sale"||n(item.quantity)<0);
  const inboundQty=inbound.reduce((sum,item)=>sum+Math.abs(n(item.quantity)),0);
  const outboundQty=outbound.reduce((sum,item)=>sum+Math.abs(n(item.quantity)),0);
  const netValue=activeMovements.reduce((sum,item)=>sum+n(item.value),0);
  const itemNames=new Map(items.map(item=>[String(item.code),item.name]));
  const movementRows=inventoryMovements.map(item=>{
   const inactive=Boolean(item.cancelledByJournalDeletion||item.cancelledByJournalUnpost||item.reversedByJournalId);
   const stateLabel=item.cancelledByJournalDeletion?"ملغي بحذف القيد":item.cancelledByJournalUnpost?"مفكوك الترحيل":item.reversedByJournalId?"معكوس":item.journalId?"مرتبط بقيد":"حركة غير مرتبطة بقيد";
   return h("tr",{key:item.id,className:"border-t hover:bg-slate-50"},
    h("td",{className:"p-2 whitespace-nowrap"},item.date||"—"),
    h("td",{className:"p-2"},item.kind==="purchase"?"إضافة / وارد":item.kind==="sale"?"صرف / صادر":item.kind==="adjustment"?"تسوية يدوية":item.kind||"حركة"),
    h("td",{className:"p-2"},item.itemCode||"—"),
    h("td",{className:"p-2"},itemNames.get(String(item.itemCode))||"صنف غير موجود بالدليل"),
    h("td",{className:"p-2"},item.warehouseCode||"—"),
    h("td",{className:"p-2 text-end"},fmt(item.quantity)),
    h("td",{className:"p-2 text-end"},fmt(item.unitCost)),
    h("td",{className:"p-2 text-end font-bold"},fmt(item.value)),
    h("td",{className:"p-2"},item.invoiceId||"—"),
    h("td",{className:"p-2"},item.journalId||"—"),
    h("td",{className:"p-2"},h("span",{className:"text-xs "+(inactive?"text-slate-400":"text-slate-600")},stateLabel)),
    h("td",{className:"p-2"},h("div",{className:"flex flex-wrap gap-1"},
     canFinance("inventory","edit")?button("تعديل",()=>openInventoryMovementEditor(item),"muted",busy||inactive):null,
     canFinance("inventory","delete")?button("حذف",()=>void deleteInventoryMovement(item),"danger",busy||(inactive&&!item.cancelledByJournalDeletion)):null
    ))
   );
  });
  const balanceRows=[],balanceTree=master.inventory&&master.inventory.balances||{};
  Object.entries(balanceTree).forEach(([warehouseCode,warehouseRows])=>Object.entries(warehouseRows||{}).forEach(([itemCode,stock])=>{
   if(!stock||Math.abs(n(stock.quantity))<0.005&&Math.abs(n(stock.value))<0.005)return;
   balanceRows.push(h("tr",{key:warehouseCode+"|"+itemCode,className:"border-t"},
    h("td",{className:"p-2"},itemCode),
    h("td",{className:"p-2"},itemNames.get(String(itemCode))||"صنف غير موجود بالدليل"),
    h("td",{className:"p-2"},warehouseCode),
    h("td",{className:"p-2 text-end"},fmt(stock.quantity)),
    h("td",{className:"p-2 text-end"},fmt(stock.averageCost)),
    h("td",{className:"p-2 text-end font-bold"},fmt(stock.value)),
    h("td",{className:"p-2"},h("div",{className:"flex flex-wrap gap-1"},
     canFinance("inventory","edit")?button("تعديل الرصيد",()=>openInventoryBalanceEditor(itemCode,warehouseCode,stock),"muted",busy):null,
     canFinance("inventory","edit")?button("تصفير الرصيد",()=>void clearInventoryBalance(itemCode,warehouseCode),"danger",busy):null
    ))
   ));
  }));
  const modal=inventoryMovementModal?h("div",{className:"fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-3",onClick:()=>setInventoryMovementModal(null)},
   h("section",{className:"w-full max-w-2xl rounded-2xl bg-white p-4 md:p-5 shadow-2xl space-y-3",onClick:event=>event.stopPropagation()},
    h("div",{className:"flex flex-wrap items-center justify-between gap-3"},
     h("h3",{className:"text-lg font-extrabold"},inventoryMovementModal.mode==="setBalance"?"تعديل رصيد المخزون":"تعديل حركة المخزون"),
     button("إغلاق",()=>setInventoryMovementModal(null),"muted")
    ),
    h("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-3"},
     field("كود الصنف",inventoryMovementModal.itemCode,()=>{},"text",{disabled:true}),
     field("المخزن",inventoryMovementModal.warehouseCode,()=>{},"text",{disabled:true}),
     inventoryMovementModal.mode==="setBalance"?null:field("تاريخ الحركة",inventoryMovementModal.date,value=>setInventoryMovementModal(old=>Object.assign({},old,{date:value})),"date"),
     inventoryMovementModal.mode==="setBalance"?null:select("نوع الحركة",inventoryMovementModal.kind,value=>setInventoryMovementModal(old=>Object.assign({},old,{kind:value})),[{value:"purchase",label:"إضافة / وارد"},{value:"sale",label:"صرف / صادر"}]),
     field(inventoryMovementModal.mode==="setBalance"?"الكمية النهائية":"الكمية",inventoryMovementModal.quantity,value=>setInventoryMovementModal(old=>Object.assign({},old,{quantity:value})),"number",{min:"0"}),
     field(inventoryMovementModal.mode==="setBalance"?"القيمة النهائية":"إجمالي قيمة الحركة",inventoryMovementModal.value,value=>setInventoryMovementModal(old=>Object.assign({},old,{value:value})),"number",{min:"0"})
    ),
    h("p",{className:"text-xs text-slate-500"},inventoryMovementModal.mode==="setBalance"?"أدخل الرصيد النهائي المطلوب. سيضيف النظام حركة تسوية بالفرق، ولن يمحو الحركات الأصلية.":"أدخل الكمية وإجمالي القيمة؛ تكلفة الوحدة تُحسب تلقائيًا. لا يمكن تعديل حركة مرتبطة بقيد مرحّل مباشرة."),
    h("div",{className:"flex justify-end gap-2"},
     button("إلغاء",()=>setInventoryMovementModal(null),"muted"),
     button(inventoryMovementModal.mode==="setBalance"?"حفظ تسوية الرصيد":"حفظ التعديل",()=>void submitInventoryChange(inventoryMovementModal),"primary",busy||!String(inventoryMovementModal.quantity||"").trim()||!String(inventoryMovementModal.value||"").trim())
    )
   )
  ):null;
  return h("div",{className:"space-y-4"},
   h("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-2"},
    metric("عدد حركات المخزن",String(activeMovements.length)),metric("كمية الوارد",fmt(inboundQty)),metric("كمية الصادر",fmt(outboundQty)),metric("صافي قيمة الحركات",fmt(netValue))
   ),
   h("div",{className:"flex flex-wrap gap-2"},button("تحديث حركات المخزن",loadInventoryMovements,"muted",busy)),
   panel("سجل حركة المخزن","يمكن تعديل أو حذف الحركة غير المرتبطة بقيد مرحّل. الحركة الملغاة بحذف القيد يمكن حذف سجلها نهائيًا دون إعادة التأثير على الرصيد، ولا يمكن تعديلها. إذا أثّر التعديل على قيمة المخزون، يُرسل قيد تسوية إلى المراجعة قبل تحديث الرصيد.",table(["التاريخ","نوع الحركة","كود الصنف","اسم الصنف","المخزن","الكمية","تكلفة الوحدة","القيمة","رقم الفاتورة","رقم القيد","الحالة","إجراء"],movementRows)),
   panel("الأرصدة الحالية بالمخازن","يمكن تعديل الرصيد النهائي أو تصفيره حتى عندما لا توجد حركة أصلية. التغيير ذو الأثر المالي يُرسل إلى المراجعة أولًا.",table(["كود الصنف","الصنف","المخزن","الكمية","متوسط التكلفة","القيمة","تسوية"],balanceRows)),
   modal
  );
 };

 const masterPermissionModule=kind=>"financial_"+financeAreaForMaster(kind);
 const canMasterAction=(kind,action)=>canFinance(financeAreaForMaster(kind),action);
 const editMasterRecord=(kind,item)=>{
  if(!canMasterAction(kind,"edit"))return setError("ليس لديك صلاحية تعديل هذا النوع من البيانات.");
  openQuickAdd(kind,null,Object.assign({},item,{partyType:item.partyType||(kind==="parties"?(masterViewKind==="suppliers"?"vendor":"customer"):undefined)}),item.code||item.id||"");
 };
 const deleteMasterRecord=async(kind,item)=>{
  if(!canMasterAction(kind,"delete"))return setError("ليس لديك صلاحية حذف هذا النوع من البيانات.");
  if(!item||busy)return;
  const labels={chartOfAccounts:"الحساب",costCenters:"مركز التكلفة",items:"الصنف",itemGroups:"مجموعة الأصناف",warehouses:"المخزن",bankAccounts:"حساب البنك",taxCodes:"الكود الضريبي",parties:item.partyType==="vendor"?"المورد":"العميل"};
  if(!window.confirm("هل تريد حذف "+(labels[kind]||"السجل")+" "+(item.code||item.name||"")+"؟ إذا كان مرتبطًا بحركات أو أرصدة، سيوقف النظام استخدامه بدلًا من حذف تاريخه المحاسبي."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api("", "POST",{action:"deleteMaster",kind,code:item.code||item.id});
   if(result.deactivated)setNotice("السجل مرتبط ببيانات سابقة؛ تم إيقاف استخدامه مع الاحتفاظ بالحركات والتقارير: "+(result.references||[]).join("، "));
   else setNotice("تم حذف السجل غير المستخدم بنجاح.");
   await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const toggleMasterSelection=(code,checked)=>{
  const key=String(code||"");
  setSelectedMasterCodes(old=>checked?(old.includes(key)?old:old.concat([key])):old.filter(value=>value!==key));
 };
 const bulkDeleteMasterRecords=async(kind,records,partyType)=>{
  const codes=(records||[]).map(item=>String(item.code||item.id||"")).filter(Boolean);
  if(!codes.length)return;
  if(codes.length>50){setError("يمكن حذف 50 سجلًا كحد أقصى في العملية الواحدة. قسّم الاختيار إلى مجموعات أصغر.");return;}
  if(!window.confirm("تأكيد حذف "+codes.length+" سجل؟ السجلات المرتبطة بحركات أو مستندات لن تُحذف نهائيًا، وسيتم إيقافها مع الاحتفاظ بالتاريخ."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api("","POST",{action:"deleteMasters",kind,codes,partyType});
   setSelectedMasterCodes([]);
   const messages=["اكتمل الحذف المتعدد: "+result.deleted+" حُذف نهائيًا، "+result.deactivated+" تم إيقافه لوجود ارتباطات."];
   if(result.notFound)messages.push(result.notFound+" سجل لم يعد موجودًا.");
   if(result.failed)messages.push(result.failed+" سجل تعذر حذفه.");
   const failedRows=(result.results||[]).filter(item=>item.status==="failed");
   if(failedRows.length)messages.push(failedRows.slice(0,3).map(item=>item.code+": "+item.error).join(" | "));
   setNotice(messages.join(" "));
   await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const masterActions=(kind,item)=>h("div",{className:"flex items-center gap-2 whitespace-nowrap"},
  canMasterAction(kind,"edit")?button("تعديل",()=>editMasterRecord(kind,item),"muted",busy):null,
  canMasterAction(kind,"delete")?button("حذف",()=>deleteMasterRecord(kind,item),"danger",busy):null
 );

 const readLegacyImportFile=event=>{
  const file=event.target&&event.target.files&&event.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
   try{
    const parsed=JSON.parse(String(reader.result||""));
    if(parsed.packageVersion!=="pest-legacy-journals-v1"||!Array.isArray(parsed.journals)||!parsed.masters||!parsed.sourceSummary)throw new Error("ملف الحزمة غير معروف أو غير مكتمل.");
    const lines=parsed.journals.reduce((sum,item)=>sum+(Array.isArray(item.lines)?item.lines.length:0),0);
    if(lines!==Number(parsed.sourceSummary.lineCount)||parsed.journals.length!==Number(parsed.sourceSummary.importGroups))throw new Error("إجمالي القيود أو السطور لا يطابق ملخص الحزمة.");
    if(parsed.currency!=="EGP")throw new Error("الحزمة يجب أن تكون بالجنيه المصري.");
    setLegacyImportPackage(parsed);setLegacyImportFileName(file.name||"Pest_Legacy_Import_Package.json");setLegacyImportProgress(null);setError("");
   }catch(error){setLegacyImportPackage(null);setLegacyImportFileName("");setError(error.message||String(error));}
  };
  reader.onerror=()=>setError("تعذر قراءة ملف حزمة الاستيراد.");
  reader.readAsText(file,"UTF-8");
 };
 const importLegacyArchive=async()=>{
  if(!currentUser||currentUser.role!=="admin"){setError("استيراد الأرشيف متاح لمدير النظام فقط.");return;}
  if(!legacyImportPackage||!Array.isArray(legacyImportPackage.journals)||!legacyImportPackage.journals.length){setError("اختر ملف حزمة الأرشيف الصحيح أولاً.");return;}
  if(!window.confirm("سيتم إنشاء الحسابات الناقصة ثم حفظ جميع قيود الأرشيف كمسودات أو قيود بانتظار المراجعة. لن يتم ترحيل أي قيد تلقائيًا. القيود المتداخلة مع الفواتير والملاحظات غير المحسومة ستظل بحاجة إلى تصحيح. هل تبدأ النقل؟"))return;
  setBusy(true);setError("");setNotice("");setLegacyImportProgress({phase:"masters",done:0,total:legacyImportPackage.journals.length,created:0,skipped:0,lines:0,pendingReview:0,needsCorrection:0});
  try{
   const live=await api("?resource=bootstrap"),liveChart=live.chartOfAccounts||{};
   const sameMaster=(current,expected)=>Boolean(current&&String(current.name||"")===String(expected.name||"")&&String(current.type||"")===String(expected.type||"")&&String(current.nature||"")===String(expected.nature||"")&&String(current.parentCode||"")===String(expected.parentCode||"")&&Boolean(current.isGroup)===Boolean(expected.isGroup)&&String(current.subledgerType||"")===String(expected.subledgerType||""));
   const importChartRows=async rows=>{
    if(!rows.length)return;
    await api("","POST",{action:"importMasters",kind:"chartOfAccounts",rows});
   };
   const missingGroups=(legacyImportPackage.masters.chartGroups||[]).filter(row=>{
    const current=liveChart[String(row.code)];
    if(current&&!sameMaster(current,row))throw new Error("الكود "+row.code+" موجود في البرنامج باسم أو طبيعة مختلفة؛ تم إيقاف الاستيراد لحماية الدليل.");
    return !current;
   });
   await importChartRows(missingGroups);
   const afterGroups=await api("?resource=bootstrap"),chartAfterGroups=afterGroups.chartOfAccounts||{};
   const missingAccounts=(legacyImportPackage.masters.chartOfAccounts||[]).filter(row=>{
    const current=chartAfterGroups[String(row.code)];
    if(current&&!sameMaster(current,row))throw new Error("الكود "+row.code+" مستخدم حاليًا بحساب مختلف؛ لم يتم استبداله.");
    const parent=row.parentCode&&chartAfterGroups[String(row.parentCode)];
    if(row.parentCode&&(!parent||!parent.isGroup))throw new Error("الحساب الأب "+row.parentCode+" غير موجود أو ليس تجميعيًا للكود "+row.code+".");
    return !current;
   });
   await importChartRows(missingAccounts);
   const verified=await api("?resource=bootstrap"),verifiedChart=verified.chartOfAccounts||{};
   const requiredCodes=new Set(legacyImportPackage.journals.flatMap(item=>(item.lines||[]).map(line=>String(line.accountCode||""))));
   const missingCodes=[...requiredCodes].filter(code=>!verifiedChart[code]||verifiedChart[code].isGroup||verifiedChart[code].active===false);
   if(missingCodes.length)throw new Error("توقف النقل قبل القيود: الحسابات التالية غير مهيأة أو غير قابلة للترحيل: "+missingCodes.join("، "));
   setLegacyImportProgress({phase:"journals",done:0,total:legacyImportPackage.journals.length,created:0,skipped:0,lines:0,pendingReview:0,needsCorrection:0});
   let done=0,created=0,skipped=0,lines=0,pendingReview=0,needsCorrection=0,batch=[];
   const flush=async()=>{
    if(!batch.length)return;
    const result=await api("","POST",{action:"bulkImportJournals",batchId:"PEST-LEGACY-20261122-V1",journals:batch});
    if(!result.success)throw new Error("لم تنجح دفعة من استيراد القيود.");
    created+=Number(result.created||0);skipped+=Number(result.skipped||0);lines+=Number(result.totalLines||0);
    pendingReview+=Number(result.pendingReview||0);needsCorrection+=Number(result.needsCorrection||0);
    done+=batch.length;
    setLegacyImportProgress({phase:"journals",done,total:legacyImportPackage.journals.length,created,skipped,lines,pendingReview,needsCorrection});
    batch=[];
   };
   for(const item of legacyImportPackage.journals){
    const itemLines=(item.lines||[]).length;
    if(batch.length>=4||batch.reduce((sum,record)=>sum+(record.lines||[]).length,0)+itemLines>450)await flush();
    if(itemLines>450)throw new Error("القيد "+(item.sourceJournalNumber||item.id)+" يتجاوز حد الدفعة؛ لم يتم تقسيم سطوره.");
    batch.push(item);
   }
   await flush();
   await refresh();
   setLegacyImportProgress({phase:"complete",done:legacyImportPackage.journals.length,total:legacyImportPackage.journals.length,created,skipped,lines,pendingReview,needsCorrection});
   setNotice("اكتمل استيراد الأرشيف: "+created+" قيد جديد، "+skipped+" قيد تم تجاوزه لأنه مستورد سابقًا، "+lines+" سطرًا. بانتظار المراجعة: "+pendingReview+"، ومسودات تحتاج تصحيحًا: "+needsCorrection+". لم يتم ترحيل أي قيد تلقائيًا.");
  }catch(error){
   setError(error.message||String(error));
   setLegacyImportProgress(previous=>previous?Object.assign({},previous,{phase:"error",message:error.message||String(error)}):{phase:"error",message:error.message||String(error)});
  }finally{setBusy(false);}
 };
 const renderLegacyImport=()=>{
  const summary=legacyImportPackage&&legacyImportPackage.sourceSummary||{};
  const imported=documents.filter(item=>item&&item.sourceType==="legacyImport");
  const corrections=imported.filter(item=>item.status==="needs_correction");
  const waiting=imported.filter(item=>item.status==="pending_review");
  const correctionRows=corrections.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).map(item=>h("tr",{key:item.id,className:"border-t"},
   h("td",{className:"p-2 font-bold"},item.sourceJournalNumber||item.number||item.id),
   h("td",{className:"p-2"},item.date||"—"),
   h("td",{className:"p-2 text-end"},String((item.lines||[]).length)),
   h("td",{className:"p-2 text-rose-700 text-xs"},(item.errors||[]).concat(item.warnings||[]).concat(item.reviewReason?[item.reviewReason]:[]).slice(0,5).join(" · ")||"مراجعة مطلوبة"),
   h("td",{className:"p-2"},h("div",{className:"flex flex-wrap gap-1"},
    button("فتح واستكمال",()=>{setSelected(item);setTab("review");openJournalModal(item);},"muted",!canFinance("review","edit")),
    canFinance("journal","delete")?button("مسح القيد",()=>void deleteJournalDocument(item),"danger",busy):null
   ))
  ));
  return h("div",{className:"space-y-4"},
   panel("استيراد أرشيف القيود اليومية","ارفع ملف الحزمة الذي تم تجهيزه بعد مطابقة الإكسل مع نسخة قاعدة البيانات. هذه العملية تنشئ الحسابات ثم تحفظ القيود للمراجعة فقط؛ لا يتم ترحيل أي قيد.",h("div",{className:"space-y-3"},
    h("div",{className:"rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"},"تنبيه سلامة: لا يتم استبدال حساب موجود إذا اختلف اسمه أو طبيعته، ولا يتم ربط التحليل بعميل أو موظف غير معروف. تكرار تشغيل الحزمة آمن؛ القيود المستوردة سابقًا سيتم تجاوزها بالمعرّف المرجعي نفسه."),
    h("div",{className:"flex flex-wrap items-end gap-3"},
     h("label",{className:"block text-sm font-bold"},"ملف حزمة الاستيراد JSON",h("input",{type:"file",accept:".json,application/json",onChange:readLegacyImportFile,className:"block mt-1 w-full rounded-lg border p-2 font-normal bg-white"})),
     button("تنفيذ التكويد ورفع القيود",importLegacyArchive,"primary",busy||!legacyImportPackage||!currentUser||currentUser.role!=="admin"),
     button("تحديث السجلات المستوردة",()=>loadLegacyImportDocuments(),"muted",busy||legacyImportDocumentsLoading)
    ),
    legacyImportFileName?h("div",{className:"text-xs text-slate-500"},"الملف المحدد: "+legacyImportFileName):null,
    legacyImportPackage?h("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-3"},
     metric("عدد السطور",String(summary.lineCount||0)),
     metric("مجموعات القيود",String(summary.importGroups||0)),
     metric("إجمالي المدين",moneyLabel(summary.totalDebit)),
     metric("إجمالي الدائن",moneyLabel(summary.totalCredit)),
     metric("حسابات جديدة",String((legacyImportPackage.masters.chartGroups||[]).length+(legacyImportPackage.masters.chartOfAccounts||[]).length)),
     metric("قيود طويلة محفوظة كاملة",(summary.longGroups||[]).map(item=>item.sourceJournalNumber+": "+item.lineCount).join(" · ")||"—"),
     metric("تداخلات الفواتير",String(summary.existingInvoiceOverlaps||0)),
     metric("أسطر تحليل عميل ناقصة",String(summary.missingCustomerAnalyticRows||0))
    ):h("div",{className:"rounded-lg border border-dashed p-5 text-sm text-slate-500"},"لم يتم اختيار حزمة استيراد بعد."),
    legacyImportProgress?panel("حالة عملية النقل","",h("div",{className:"space-y-2 text-sm"},
     h("div",{className:"font-bold"},({masters:"إنشاء الحسابات",journals:"نقل القيود",complete:"اكتملت عملية النقل",error:"توقفت العملية"}[legacyImportProgress.phase]||"جارٍ الفحص")),
     h("div",null,"المجموعات المعالجة: "+(legacyImportProgress.done||0)+" / "+(legacyImportProgress.total||0)),
     h("div",null,"القيود الجديدة: "+(legacyImportProgress.created||0)+" · المتجاوزة: "+(legacyImportProgress.skipped||0)+" · السطور: "+(legacyImportProgress.lines||0)),
     h("div",null,"بانتظار المراجعة: "+(legacyImportProgress.pendingReview||0)+" · تحتاج تصحيحًا: "+(legacyImportProgress.needsCorrection||0)),
     legacyImportProgress.message?h("p",{className:"text-rose-700"},legacyImportProgress.message):null
    )):null
   )),
   panel("القيود المستوردة التي تحتاج استكمالًا","افتح القيد لتصحيح الحساب أو الطرف التحليلي أو تأكيد الملاحظات. لا يظهر أثرها في الأستاذ والقوائم قبل الاعتماد.",h("div",{className:"space-y-2"},
    h("div",{className:"flex flex-wrap gap-3 text-sm font-bold"},
     h("span",null,"كل القيود المستوردة: "+(legacyImportDocumentsLoaded?imported.length:"جارٍ التحميل...")),
     h("span",{className:"text-amber-700"},"تحتاج تصحيحًا: "+(legacyImportDocumentsLoaded?corrections.length:"—")),
     h("span",{className:"text-indigo-700"},"بانتظار المراجعة: "+(legacyImportDocumentsLoaded?waiting.length:"—"))
    ),
    corrections.length?table(["رقم المصدر","التاريخ","عدد السطور","ملاحظات الفحص","إجراء"],correctionRows):h("div",{className:"rounded-lg border border-dashed p-4 text-center text-sm text-slate-500"},legacyImportDocumentsLoaded?"لا توجد قيود تحتاج تصحيحًا.":legacyImportDocumentsLoading?"جارٍ تحميل القيود المستوردة...":"تعذر تحميل السجلات المستوردة؛ اضغط تحديث لإعادة المحاولة.")
   ))
  );
 };
 const renderMasters=()=>{
  const config=masterImportConfig[masterImportKind];
  const preview=masterImportRows.slice(0,12);
  const importRows=preview.map((row,index)=>h("tr",{key:index,className:"border-t"},config.columns.map(key=>h("td",{key,className:"p-2"},String(row[key]==null?"":row[key])))));
  const importPanel=panel("استيراد البيانات والأكواد","اختر نوع السجل، نزّل النموذج، املأ البيانات ثم ارفع الملف. راجع المعاينة قبل تنفيذ الاستيراد.",h("div",{className:"space-y-3"},
   h("div",{className:"grid md:grid-cols-3 gap-3 items-end"},
    select("نوع البيانات",masterImportKind,v=>{setMasterImportKind(v);setMasterImportRows([]);setMasterImportName("");},Object.keys(masterImportConfig).map(key=>({value:key,label:masterImportConfig[key].label}))),
    button("تنزيل نموذج "+config.label,downloadMasterTemplate,"muted"),
    h("label",{className:"block text-sm font-bold text-slate-700"},"رفع ملف Excel أو CSV",h("input",{type:"file",accept:".xlsx,.xls,.csv",onChange:e=>parseMasterImport(e.target.files&&e.target.files[0]),className:"block mt-1 w-full rounded-lg border p-2 font-normal bg-white"}))
   ),
   masterImportName?h("p",{className:"text-xs text-slate-600"},"الملف: "+masterImportName):null,
   masterImportRows.length?panel("معاينة أول 12 صفًا","لن يتم الحفظ قبل الضغط على تنفيذ الاستيراد.",h("div",{className:"max-h-64 overflow-y-auto"},table(config.columns,importRows))):null,
   masterImportRows.length?h("div",{className:"flex flex-wrap items-center gap-3"},h("b",{className:"text-sm"},"عدد السجلات: "+masterImportRows.length),button("تنفيذ الاستيراد",submitMasterImport,"primary",busy),button("إلغاء الملف",()=>{setMasterImportRows([]);setMasterImportName("");},"muted")):null
  ));
  const allTabs=[["chartOfAccounts","دليل الحسابات"],["costCenters","مراكز التكلفة"],["employeeAdvances","أكواد السلف"],["employeeCustodies","أكواد العهد"],["customers","العملاء"],["suppliers","الموردون"],["financingParties","جهات التمويل"],["securityDepositParties","جهات التأمينات المستردة"],["items","الأصناف المخزنية"],["itemGroups","مجموعات الأصناف"],["warehouses","المخازن"],["bankAccounts","حسابات البنوك"],["taxCodes","الأكواد الضريبية"]];
  const tabs=allTabs.filter(([key])=>canFinance(financeMasterAreas[key]||"masters","view"));
  const activeMasterViewKind=tabs.some(([key])=>key===masterViewKind)?masterViewKind:(tabs[0]&&tabs[0][0]||"chartOfAccounts");
  const partyType=activeMasterViewKind==="suppliers"?"vendor":"customer";
  const partyList=activeMasterViewKind==="suppliers"?allVendors:allClients;
  const taxNo=p=>p.taxNumber||p.taxRegistrationNumber||p.registrationNumber||p.registrationNo||p.vatNumber||p.taxId||"—";
  const searchTerm=normalizeMatch(masterPartySearch);
  const matches=row=>!searchTerm||normalizeMatch([row.code,row.name,row.companyName,row.legalName,row.phone,row.mobile,taxNo(row),row.type,row.parentCode,row.projectCode,row.taxType,row.itemType,row.groupCode,row.version].join(" ")).includes(searchTerm);
  const scroll=child=>h("div",{className:"max-h-[58vh] overflow-y-auto rounded-xl border bg-white"},child);
  let currentMasterItems=[];
  let visibleItems=[];
  const selectionCell=item=>h("td",{className:"p-2 text-center"},h("input",{type:"checkbox",checked:selectedMasterCodes.includes(String(item.code||item.id||"")),disabled:!canMasterAction(quickKind,"delete")||busy,onChange:event=>toggleMasterSelection(item.code||item.id,event.target.checked),"aria-label":"تحديد "+(item.code||item.id||"")}));
  let title="البيانات الأساسية";
  let headers=["الكود","الاسم","التفاصيل"];
  let visibleRows=[];
  let quickKind=activeMasterViewKind;
  let quickDefaults={};
  if(activeMasterViewKind==="customers"||activeMasterViewKind==="suppliers"){
   title=activeMasterViewKind==="suppliers"?"دليل الموردين":"دليل العملاء";
   headers=["تحديد","الكود","الاسم","الهاتف","رقم التسجيل الضريبي","البريد الإلكتروني","العنوان","الإجراءات"];
   currentMasterItems=partyList;
   visibleItems=currentMasterItems.filter(matches);
   visibleRows=visibleItems.map(p=>h("tr",{key:p.code||p.id,className:"border-t"},
    selectionCell(p),
    h("td",{className:"p-2 font-bold"},p.code||p.id),
    h("td",{className:"p-2"},partyName(p)),
    h("td",{className:"p-2"},p.phone||p.mobile||"—"),
    h("td",{className:"p-2"},taxNo(p)),
    h("td",{className:"p-2"},p.email||"—"),
    h("td",{className:"p-2"},p.address||"—"),
    h("td",{className:"p-2"},masterActions("parties",Object.assign({},p,{partyType:partyType})))
   ));
   quickKind="parties";
   quickDefaults={code:nextCode(partyType==="vendor"?"VND":"CUS",partyList),partyType};
  }else if(activeMasterViewKind==="financingParties"){
   title="دليل جهات التمويل";headers=["تحديد","الكود","اسم جهة التمويل","رقم التسجيل / المرجع","الحالة","الإجراءات"];
   currentMasterItems=registeredFinancingParties;visibleItems=currentMasterItems.filter(matches);
   visibleRows=visibleItems.map(x=>h("tr",{key:x.code||x.id,className:"border-t"},selectionCell(x),h("td",{className:"p-2 font-bold"},x.code||x.id),h("td",{className:"p-2"},partyName(x)),h("td",{className:"p-2"},x.reference||x.taxNumber||x.registrationNumber||"—"),h("td",{className:"p-2"},x.active===false?"موقوف":"نشط"),h("td",{className:"p-2"},masterActions("financingParties",x))));
   quickKind="financingParties";quickDefaults={code:nextCode("FIN",registeredFinancingParties)};
  }else if(activeMasterViewKind==="securityDepositParties"){
   title="دليل جهات التأمينات المستردة";headers=["تحديد","الكود","اسم الجهة","رقم مرجعي / تسجيل","الحالة","الإجراءات"];
   currentMasterItems=registeredSecurityDepositParties;visibleItems=currentMasterItems.filter(matches);
   visibleRows=visibleItems.map(x=>h("tr",{key:x.code||x.id,className:"border-t"},selectionCell(x),h("td",{className:"p-2 font-bold"},x.code||x.id),h("td",{className:"p-2"},partyName(x)),h("td",{className:"p-2"},x.reference||x.taxNumber||x.registrationNumber||"—"),h("td",{className:"p-2"},x.active===false?"موقوف":"نشط"),h("td",{className:"p-2"},masterActions("securityDepositParties",x))));
   quickKind="securityDepositParties";quickDefaults={code:nextCode("DEP",registeredSecurityDepositParties)};
  }else if(activeMasterViewKind==="items"){
   title="الأصناف المخزنية";
   headers=["تحديد","الكود","الاسم","التصنيف","المجموعة","الإصدار","الوحدة","المخزن","الإجراءات"];
   currentMasterItems=items;
   visibleItems=currentMasterItems.filter(matches);
   visibleRows=visibleItems.map(x=>h("tr",{key:x.code,className:"border-t"},
    selectionCell(x),
    h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),
    h("td",{className:"p-2"},({stock:"بضاعة",raw_material:"خامة",finished_good:"منتج تام",spare_part:"قطع غيار",consumable:"مستهلكات",office_supply:"مستلزمات مكتبية"}[x.itemType]||x.itemType||"—")),
    h("td",{className:"p-2"},x.groupCode||"—"),h("td",{className:"p-2"},x.version||"—"),h("td",{className:"p-2"},x.unit||"—"),h("td",{className:"p-2"},x.warehouseCode||"default"),h("td",{className:"p-2"},masterActions("items",x))
   ));
   quickKind="items";quickDefaults={code:nextCode("ITM",items),itemType:"stock"};
  }else if(activeMasterViewKind==="itemGroups"){
   title="مجموعات الأصناف";headers=["تحديد","الكود","اسم المجموعة","نوع المجموعة","الإجراءات"];
   currentMasterItems=rows(master.itemGroups);
   visibleItems=currentMasterItems.filter(matches);
   visibleRows=visibleItems.map(x=>h("tr",{key:x.code,className:"border-t"},
    selectionCell(x),
    h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),
    h("td",{className:"p-2"},({raw_material:"خامات",finished_good:"منتجات تامة",spare_part:"قطع غيار",consumable:"مستهلكات",office_supply:"مستلزمات مكتبية",packaging:"تعبئة وتغليف",other:"أخرى"}[x.groupType]||x.groupType||"—")),h("td",{className:"p-2"},masterActions("itemGroups",x))
   ));
   quickKind="itemGroups";quickDefaults={code:nextCode("GRP",rows(master.itemGroups)),groupType:"other"};
  }else{
   const data=activeMasterViewKind==="chartOfAccounts"?accounts:activeMasterViewKind==="costCenters"?centers:rows(master[activeMasterViewKind]);
   currentMasterItems=data;
   visibleItems=currentMasterItems.filter(matches);
   title=({chartOfAccounts:"دليل الحسابات",costCenters:"مراكز التكلفة",employeeAdvances:"دليل أكواد السلف",employeeCustodies:"دليل أكواد العهد",warehouses:"المخازن",bankAccounts:"حسابات البنوك",taxCodes:"الأكواد الضريبية"})[activeMasterViewKind]||"البيانات الأساسية";
   headers=["تحديد","الكود","الاسم","التفاصيل","الحالة","الإجراءات"];
   if(activeMasterViewKind==="employeeAdvances"||activeMasterViewKind==="employeeCustodies")headers=["تحديد","الكود","اسم الكود","الموظف المرتبط","الحالة","الإجراءات"];
   visibleRows=visibleItems.map(x=>{
    const employeeRecord=(activeMasterViewKind==="employeeAdvances"||activeMasterViewKind==="employeeCustodies")?(userDirectory||[]).find(user=>String(user.uid)===String(x.employeeUid||"")):null;
    const details=activeMasterViewKind==="chartOfAccounts"?(x.isGroup?"حساب تجميعي":x.type+" / "+x.nature):activeMasterViewKind==="costCenters"?(x.projectCode||"—"):activeMasterViewKind==="taxCodes"?(x.taxType||"")+" / "+(x.rate||0)+"%":activeMasterViewKind==="bankAccounts"?(x.accountCode||x.code):activeMasterViewKind==="employeeAdvances"||activeMasterViewKind==="employeeCustodies"?(employeeRecord&&(employeeRecord.fullName||employeeRecord.username||employeeRecord.email)||x.employeeName||(x.employeeUid?"—":"غير مربوط بمستخدم")):"—";
    return h("tr",{key:x.code,className:"border-t"},selectionCell(x),h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),h("td",{className:"p-2"},details),h("td",{className:"p-2"},x.active===false?"موقوف":"نشط"),h("td",{className:"p-2"},masterActions(activeMasterViewKind,x)));
   });
   const prefixes={chartOfAccounts:"ACC",costCenters:"CC",employeeAdvances:"ADV",employeeCustodies:"CST",warehouses:"WH",bankAccounts:"BANK",taxCodes:"TAX"};
   quickDefaults={code:nextCode(prefixes[activeMasterViewKind]||"NEW",data)};
  }
  const addButton=button("＋ إضافة "+title.replace("دليل ",""),()=>openQuickAdd(quickKind,null,quickDefaults),"primary",!canMasterAction(quickKind,"add"));
  const selectedVisible=visibleItems.map(item=>String(item.code||item.id||"")).filter(code=>selectedMasterCodes.includes(code));
  const allVisibleSelected=visibleItems.length>0&&selectedVisible.length===visibleItems.length;
  const selectedRecords=currentMasterItems.filter(item=>selectedMasterCodes.includes(String(item.code||item.id||"")));
  const listToolbar=h("div",{className:"flex flex-wrap items-center gap-2"},
   addButton,
   field("بحث بالكود أو الاسم أو البيانات",masterPartySearch,setMasterPartySearch),
   h("label",{className:"inline-flex items-center gap-2 text-xs font-semibold rounded-lg border px-3 py-2 bg-white"},h("input",{type:"checkbox",checked:allVisibleSelected,disabled:!visibleItems.length||!canMasterAction(quickKind,"delete")||busy,onChange:event=>{
    const visibleCodes=visibleItems.map(item=>String(item.code||item.id||"")).filter(Boolean);
    setSelectedMasterCodes(old=>event.target.checked?Array.from(new Set(old.concat(visibleCodes))):old.filter(code=>!visibleCodes.includes(code)));
   }}),"تحديد كل الظاهر"),
   canMasterAction(quickKind,"delete")?button("حذف المحدد ("+selectedRecords.length+")",()=>bulkDeleteMasterRecords(quickKind,selectedRecords,partyType),"danger",busy||!selectedRecords.length):null
  );
  const listPanel=panel(title,"استخدم البحث لتحديد السجلات المطلوبة. الحذف المتعدد يحافظ على السجلات المرتبطة بالمستندات والحركات.",h("div",{className:"space-y-3"},
   listToolbar,
   scroll(table(headers,visibleRows))
  ));
  return h("div",{className:"space-y-3"},
   panel("دليل الأكواد والبيانات الأساسية","اختر نوع البيانات من القائمة لعرض الأكواد المرتبطة به مباشرة.",h("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-2 items-end"},
    h("div",{className:"md:col-span-2"},select("نوع البيانات",activeMasterViewKind,value=>{setMasterViewKind(value);setMasterPartySearch("");setSelectedMasterCodes([]);},tabs.map(([key,label])=>({value:key,label})))),
    h("div",{className:"text-xs text-slate-500 pb-2"},"تظهر السجلات أسفل الاختيار مباشرة، ويمكنك الإضافة أو التعديل أو الحذف من القائمة نفسها.")
   )),
   listPanel,
   importPanel,
   activeMasterViewKind==="costCenters"?renderCostCenterAnalysis():null
  );
 };
 const renderTax=()=>{
  const inPeriod=documents.filter(doc=>doc&&doc.type==='invoice'&&String(doc.date||'')>=period.from+'-01'&&String(doc.date||'')<=period.to+'-31');
  const posted=inPeriod.filter(doc=>doc.status==='posted');
  const purchaseInvoices=posted.filter(doc=>doc.invoiceType==='purchase').sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.number||'').localeCompare(String(b.number||'')));
  const salesInvoices=posted.filter(doc=>doc.invoiceType==='sales').sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.number||'').localeCompare(String(b.number||'')));
  const amounts=doc=>{
   const tax=doc.totals&&doc.totals.tax!=null?Number(doc.totals.tax):doc.taxAmount!==undefined&&doc.taxAmount!==null&&String(doc.taxAmount).trim()!==''?n(doc.taxAmount):n(doc.totals&&doc.totals.net!=null?doc.totals.net:doc.total)*n(doc.taxRate)/100;
   const net=doc.totals&&doc.totals.net!=null?Number(doc.totals.net):Math.max(0,n(doc.total)-tax);
   const total=doc.totals&&doc.totals.total!=null?Number(doc.totals.total):n(doc.total||net+tax);
   return {net,tax,total};
  };
  const byCurrency={};
  posted.forEach(doc=>{
   const currency=String(doc.currency||'EGP').toUpperCase(),a=amounts(doc),g=byCurrency[currency]||(byCurrency[currency]={currency,purchasesBase:0,inputTax:0,salesBase:0,outputTax:0});
   if(doc.invoiceType==='purchase'){g.purchasesBase+=a.net;g.inputTax+=a.tax;}
   else if(doc.invoiceType==='sales'){g.salesBase+=a.net;g.outputTax+=a.tax;}
  });
  const summaries=Object.values(byCurrency).sort((a,b)=>a.currency.localeCompare(b.currency));
  const pendingCount=inPeriod.filter(doc=>doc.status!=='posted').length;
  const codeName=code=>{const found=rows(master.taxCodes).find(x=>x.code===code);return found?found.name:code||'—';};
  const partyTax=doc=>doc.partyTaxNumber||partyTaxNumber((allVendors.concat(allClients)).find(p=>String(p.code||p.id)===String(doc.partyId||''))||{})||'—';
  const formatRows=list=>list.map(doc=>{
   const a=amounts(doc);
   return h('tr',{key:doc.id,className:'border-t'},h('td',{className:'p-2'},doc.number||doc.id),h('td',{className:'p-2'},doc.date||'—'),h('td',{className:'p-2'},doc.partyName||'—'),h('td',{className:'p-2'},partyTax(doc)),h('td',{className:'p-2'},doc.taxCode||'—'),h('td',{className:'p-2'},codeName(doc.taxCode)),h('td',{className:'p-2'},fmt(doc.taxRate||0)+'%'),h('td',{className:'p-2'},fmt(a.net)),h('td',{className:'p-2 font-bold'},fmt(a.tax)),h('td',{className:'p-2'},fmt(a.total)),h('td',{className:'p-2'},doc.currency||'EGP'));
  });
  const headers=['رقم الفاتورة','التاريخ','المورد / العميل','الرقم الضريبي','كود الضريبة','اسم الكود','النسبة','الوعاء الضريبي','قيمة الضريبة','الإجمالي','العملة'];
  const csvCell=value=>'"'+String(value==null?'':value).replace(/"/g,'""')+'"';
  const exportInvoices=(list,name)=>{const content='\uFEFF'+[headers,...list.map(doc=>{const a=amounts(doc);return [doc.number||doc.id,doc.date,doc.partyName,partyTax(doc),doc.taxCode,codeName(doc.taxCode),doc.taxRate||0,a.net,a.tax,a.total,doc.currency||'EGP'];})].map(row=>row.map(csvCell).join(',')).join('\r\n');dl(name,content);};
  return panel('إقرار ومراجعة ضريبة القيمة المضافة','الكشف التفصيلي للفواتير المعتمدة والمرحّلة فقط. لا تدخل الفواتير المعلقة أو المسودات في صافي الضريبة المستحق.',h('div',{className:'space-y-4'},
   h('div',{className:'grid md:grid-cols-3 gap-3 items-end'},field('من شهر',period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),field('إلى شهر',period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),button('تحديث البيانات',async()=>{await refresh();await loadPeriod();},'primary',busy)),
   h('div',{className:'flex flex-wrap gap-2 text-xs'},h('b',null,'الفواتير المعتمدة: '+posted.length),h('b',null,'فواتير لم تدخل الحساب: '+pendingCount)),
   summaries.length
    ?h('div',{className:'space-y-2'},...summaries.map(g=>h('section',{key:g.currency,className:'grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border rounded-xl bg-white'},
      metric('العملة',g.currency),
      metric('ضريبة مدخلات المشتريات',fmt(g.inputTax)),
      metric('ضريبة مخرجات المبيعات',fmt(g.outputTax)),
      metric('صافي الوعاء (مبيعات - مشتريات)',fmt(g.salesBase-g.purchasesBase)),
      metric(g.outputTax>=g.inputTax?'ضريبة مستحقة مبدئيًا':'رصيد ضريبي دائن مبدئيًا',fmt(Math.abs(g.outputTax-g.inputTax))+' '+(g.outputTax>=g.inputTax?'مستحق':'رصيد'))
     )))
    :h('div',{className:'p-4 rounded-xl border text-center text-slate-500'},'لا توجد فواتير معتمدة في الفترة المحددة.'),
   panel('فواتير المشتريات — ضريبة المدخلات','يتم عرض اسم المورد ورقمه الضريبي والوعاء والضريبة والإجمالي وكود الضريبة.',h('div',{className:'space-y-2'},button('تصدير فواتير المشتريات CSV',()=>exportInvoices(purchaseInvoices,'vat-purchases.csv'),'muted'),table(headers,formatRows(purchaseInvoices)))),
   panel('فواتير المبيعات — ضريبة المخرجات','يتم عرض اسم العميل ورقمه الضريبي والوعاء والضريبة والإجمالي وكود الضريبة.',h('div',{className:'space-y-2'},button('تصدير فواتير المبيعات CSV',()=>exportInvoices(salesInvoices,'vat-sales.csv'),'muted'),table(headers,formatRows(salesInvoices)))),
   panel('الأكواد الضريبية المستخدمة','افصل أكواد مدخلات المشتريات عن أكواد مخرجات المبيعات. النسبة الافتراضية العامة 14%، ويمكن إضافة أكواد أخرى للنسب والمعاملات الخاصة.',table(['الكود','اسم الضريبة','النوع','النسبة','بداية السريان'],rows(master.taxCodes).map(x=>h('tr',{key:x.code},h('td',{className:'p-2'},x.code),h('td',{className:'p-2'},x.name),h('td',{className:'p-2'},x.taxType),h('td',{className:'p-2'},x.rate+'%'),h('td',{className:'p-2'},x.effectiveFrom||'—'))))),
   h('p',{className:'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3'},'تنبيه محاسبي: صافي المخرجات ناقص المدخلات هو مؤشر ضريبة الفترة من الفواتير المرحلة فقط. لا يشمل أرصدة الفترات السابقة أو الخصم والتحصيل تحت حساب الضريبة أو التسويات أو المعاملات الخاصة؛ راجع الإقرار الرسمي والمستندات قبل السداد.')
  ));
 };
 const accountChildren=new Map();
 accounts.forEach(account=>{const parent=String(account.parentCode||'');if(!parent)return;if(!accountChildren.has(parent))accountChildren.set(parent,[]);accountChildren.get(parent).push(String(account.code));});
 const descendantCodes=code=>{const result=[String(code)],seen=new Set(result),queue=[String(code)];while(queue.length){const parent=queue.shift();(accountChildren.get(parent)||[]).forEach(child=>{if(!seen.has(child)){seen.add(child);result.push(child);queue.push(child);}});}return result;};
 const sumAccountBalances=(source,codes)=>codes.reduce((sum,code)=>{const amount=source[code]||{};sum.debit+=n(amount.debit);sum.credit+=n(amount.credit);return sum;},{debit:0,credit:0});
 const statementAccountData=accounts.map(account=>{
  const codes=descendantCodes(account.code),amount=sumAccountBalances(balanceBalances,codes),activity=sumAccountBalances(balances,codes);
  const openingNet=(amount.debit-amount.credit)-(activity.debit-activity.credit),endingNet=amount.debit-amount.credit;
  return {account,codes,amount,activity,opening:{debit:Math.max(openingNet,0),credit:Math.max(-openingNet,0)},ending:{debit:Math.max(endingNet,0),credit:Math.max(-endingNet,0)}};
 });
 const statementAccountByCode=new Map(statementAccountData.map(row=>[String(row.account.code),row]));
 const accountDepth=account=>{let depth=0,parent=String(account.parentCode||''),guard=0;while(parent&&guard++<20){depth++;const parentAccount=accounts.find(x=>String(x.code)===parent);parent=parentAccount?String(parentAccount.parentCode||''):'';}return depth;};
 const accountInBranch=(account,branchCode)=>{let parent=String(account.parentCode||''),guard=0;if(String(account.code)===String(branchCode))return true;while(parent&&guard++<20){if(parent===String(branchCode))return true;const parentAccount=accounts.find(x=>String(x.code)===parent);parent=parentAccount?String(parentAccount.parentCode||''):'';}return false;};
 const statementJournalMap=new Map([...journalRecords,...balanceJournals,...periodJournals].filter(j=>j&&j.id).map(j=>[String(j.id),j]));
 const openStatementAccount=code=>{if(statementAccountByCode.has(String(code)))setAccountDetailCode(String(code));};
 const openStatementJournal=journalId=>{if(journalId&&statementJournalMap.has(String(journalId)))setStatementJournalId(String(journalId));};
 const accountDetailData=accountDetailCode?statementAccountByCode.get(String(accountDetailCode)):null;
 const accountDetailMovements=accountDetailData?flat.filter(line=>accountDetailData.codes.includes(String(line.accountCode))).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''))||n(a.lineNo)-n(b.lineNo)):[];
 let accountRunningNet=accountDetailData?accountDetailData.opening.debit-accountDetailData.opening.credit:0;
 const accountDetailMovementRows=accountDetailMovements.map(line=>{
  accountRunningNet+=n(line.debit)-n(line.credit);
  const account=accounts.find(item=>String(item.code)===String(line.accountCode));
  const costCenter=centers.find(item=>String(item.code)===String(line.costCenterId));
  const runningLabel=Math.abs(accountRunningNet)<0.005?'0.00':fmt(Math.abs(accountRunningNet))+(accountRunningNet>=0?' مدين':' دائن');
  return h('tr',{key:String(line.journalId)+'-'+String(line.lineNo),className:'border-t hover:bg-blue-50'},
   h('td',{className:'p-2 whitespace-nowrap'},line.date||'—'),
   h('td',{className:'p-2'},h('button',{type:'button',className:'font-bold text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId)),
   h('td',{className:'p-2'},line.accountCode+' — '+(account&&account.name||'')),
   h('td',{className:'p-2 min-w-[240px]'},h('div',{className:'flex flex-wrap items-center gap-2'},h('span',null,line.description||'—'),statementAttachmentAction(line))),
   h('td',{className:'p-2'},[line.partyId,costCenter&&costCenter.name||line.costCenterId||line.projectCode].filter(Boolean).join(' / ')||'—'),
   h('td',{className:'p-2 text-end'},fmt(line.debit)),
   h('td',{className:'p-2 text-end'},fmt(line.credit)),
   h('td',{className:'p-2 text-end font-bold'},runningLabel)
  );
 });
 React.useEffect(()=>{if(accountDetailCode&&accountDetailMovements.length)void loadStatementAttachments(accountDetailMovements);},[accountDetailCode,period.from,period.to]);
 const statementJournal=statementJournalId?statementJournalMap.get(String(statementJournalId)):null;
  React.useEffect(()=>{if(journalModalDraft)void loadStatementAttachments([journalModalDraft]);},[journalModalDraft&&journalModalDraft.id]);
  React.useEffect(()=>{if(statementJournal)void loadStatementAttachments([statementJournal]);},[statementJournalId]);
 React.useEffect(()=>{if(tab==='review'&&selected&&selected.type==='journal')void loadStatementAttachments([selected]);},[tab,selected&&selected.type,selected&&selected.id,selected&&selected.sourceId,selected&&selected.journalId]);
 React.useEffect(()=>{if(tab==='journal'&&(journalRecords.length||documents.length))void loadStatementAttachments(journalRecords.concat(documents.filter(document=>document&&document.type==='journal')));},[tab,journalRecords,documents]);
 const statementJournalLines=statementJournal?(statementJournal.lines||[]).map((line,index)=>{
  const account=accounts.find(item=>String(item.code)===String(line.accountCode));
  const center=centers.find(item=>String(item.code)===String(line.costCenterId));
  const party=[line.partyType,line.partyId].filter(Boolean).join(':');
  return h('tr',{key:index,className:'border-t hover:bg-slate-50'},
   h('td',{className:'p-2'},index+1),
   h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline font-bold text-right',onClick:()=>{setStatementJournalId('');openStatementAccount(line.accountCode);}},line.accountCode+' — '+(account&&account.name||'حساب غير موجود'))),
   h('td',{className:'p-2 min-w-[180px]'},line.description||statementJournal.description||'—'),
   h('td',{className:'p-2'},center&&center.name||line.costCenterId||'—'),
   h('td',{className:'p-2'},line.projectCode||'—'),
   h('td',{className:'p-2'},party||'—'),
   h('td',{className:'p-2 text-end'},fmt(line.debit)),
   h('td',{className:'p-2 text-end'},fmt(line.credit))
  );
 }):[];
 const statementJournalDebit=statementJournal?(statementJournal.lines||[]).reduce((sum,line)=>sum+n(line.debit),0):0;
 const statementJournalCredit=statementJournal?(statementJournal.lines||[]).reduce((sum,line)=>sum+n(line.credit),0):0;
 const statementJournalPosted=Boolean(statementJournal&&(statementJournal.status==='posted'||journalRecords.some(item=>String(item.id)===String(statementJournal.id)&&item.status==='posted')));
 const statementJournalManual=Boolean(statementJournal&&(!statementJournal.sourceType||statementJournal.sourceType==='manual'));
 const statementJournalReversible=Boolean(statementJournalManual||statementJournal&&statementJournal.sourceType==='invoice');
 const statementJournalHasLinkedAction=Boolean(statementJournal&&(statementJournal.pendingRevisionId||statementJournal.revisedByJournalId||statementJournal.reversalJournalId||statementJournal.reversedByJournalId));
 const accountDetailModal=accountDetailData?h('div',{className:'fixed inset-0 z-[125] bg-slate-950/60 flex items-center justify-center p-2 sm:p-4',onClick:()=>setAccountDetailCode('')},
  h('section',{className:'w-full max-w-7xl max-h-[94vh] overflow-auto rounded-2xl bg-white shadow-2xl',onClick:e=>e.stopPropagation()},
   h('header',{className:'sticky top-0 z-10 bg-slate-900 text-white p-4 rounded-t-2xl flex flex-wrap items-center justify-between gap-2'},
    h('div',null,h('div',{className:'text-xs text-slate-300'},'كشف حساب تفصيلي'),h('h3',{className:'text-lg font-extrabold'},accountDetailData.account.code+' — '+accountDetailData.account.name),h('p',{className:'text-xs text-slate-300 mt-1'},'الفترة: '+period.from+' إلى '+period.to+' · '+(accountDetailData.account.isGroup?'حساب تجميعي يشمل الحسابات التابعة':'حساب تفصيلي'))),
    h('button',{type:'button',className:'rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10',onClick:()=>setAccountDetailCode('')},'إغلاق')
   ),
   h('div',{className:'p-3 sm:p-4 space-y-3'},
    h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
     metric('الرصيد الافتتاحي مدين',fmt(accountDetailData.opening.debit)),
     metric('الرصيد الافتتاحي دائن',fmt(accountDetailData.opening.credit)),
     metric('حركة الفترة مدين',fmt(accountDetailData.activity.debit)),
     metric('حركة الفترة دائن',fmt(accountDetailData.activity.credit))
    ),
    h('div',{className:'grid grid-cols-2 md:grid-cols-3 gap-2'},
     metric('الرصيد الختامي مدين',fmt(accountDetailData.ending.debit)),
     metric('الرصيد الختامي دائن',fmt(accountDetailData.ending.credit)),
     metric('عدد الحركات',String(accountDetailMovements.length))
    ),
    h('p',{className:'text-xs text-slate-500'},'اضغط رقم القيد لعرض القيد بالكامل. الرصيد الجاري يبدأ من الرصيد الافتتاحي ثم يتغير مع كل حركة.'),
    h('div',{className:'overflow-auto border rounded-xl'},
     h('table',{className:'w-full min-w-[1050px] text-sm text-right'},
      h('thead',{className:'bg-slate-100'},h('tr',null,['التاريخ','رقم القيد','الحساب','البيان','الطرف / مركز التكلفة','مدين','دائن','الرصيد الجاري'].map(name=>h('th',{key:name,className:'p-2 whitespace-nowrap'},name)))),
      h('tbody',null,accountDetailMovementRows.length?accountDetailMovementRows:h('tr',null,h('td',{colSpan:8,className:'p-6 text-center text-slate-400'},'لا توجد حركات خلال الفترة المحددة.')))
     )
    )
   )
  )
 ):null;
 const statementJournalModal=statementJournal?h('div',{className:'fixed inset-0 z-[145] bg-slate-950/70 flex items-center justify-center p-2 sm:p-4',onClick:()=>setStatementJournalId('')},
  h('section',{className:'w-full max-w-6xl max-h-[94vh] overflow-auto rounded-2xl bg-white shadow-2xl',onClick:e=>e.stopPropagation()},
   h('header',{className:'sticky top-0 z-10 bg-blue-950 text-white p-4 rounded-t-2xl flex flex-wrap items-center justify-between gap-2'},
    h('div',null,h('div',{className:'text-xs text-blue-200'},'تفاصيل الحركة / القيد بالكامل'),h('h3',{className:'text-lg font-extrabold'},'قيد رقم '+(statementJournal.number||statementJournal.journalNumber||statementJournal.id)),h('p',{className:'text-xs text-blue-100 mt-1'},(statementJournal.date||'—')+' · '+(statementJournal.reference||'بدون مرجع')+' · '+journalSourceLabel(statementJournal))),
    h('button',{type:'button',className:'rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10',onClick:()=>setStatementJournalId('')},'إغلاق')
   ),
   h('div',{className:'p-3 sm:p-4 space-y-3'},
    h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
     metric('إجمالي المدين',fmt(statementJournalDebit)),
     metric('إجمالي الدائن',fmt(statementJournalCredit)),
     metric('الفرق',fmt(statementJournalDebit-statementJournalCredit)),
     metric('الحالة',status(statementJournal.status||'posted'))
    ),
    h('div',{className:'grid md:grid-cols-3 gap-2 text-sm'},
     h('div',{className:'rounded-lg border p-3'},h('span',{className:'text-xs text-slate-500 block'},'البيان'),h('b',null,statementJournal.description||'—')),
     h('div',{className:'rounded-lg border p-3'},h('span',{className:'text-xs text-slate-500 block'},'المصدر / المستند'),h('b',null,(statementJournal.sourceType||'manual')+' · '+(statementJournal.sourceId||'—'))),
     h('div',{className:'rounded-lg border p-3'},h('span',{className:'text-xs text-slate-500 block'},'الإنشاء / الاعتماد'),h('b',null,(statementJournal.createdByName||statementJournal.createdBy||'—')+' · '+(statementJournal.approvedBy||'—')))
    ),
     h('div',{className:'flex flex-wrap items-center gap-3 rounded-xl border bg-slate-50 p-3 text-sm'},h('b',null,'مرفقات الحركة / المستند'),statementAttachmentAction(statementJournal)||h('span',{className:'text-slate-500'},'لا توجد مرفقات مرتبطة بهذا القيد'),journalAttachmentUploadControl(statementJournal)),
    h('div',{className:'overflow-auto border rounded-xl'},
     h('table',{className:'w-full min-w-[950px] text-sm text-right'},
      h('thead',{className:'bg-slate-100'},h('tr',null,['م','الحساب (اضغط لفتح كشف الحساب)','البيان','مركز التكلفة','المشروع','الطرف التحليلي','مدين','دائن'].map(name=>h('th',{key:name,className:'p-2 whitespace-nowrap'},name)))),
      h('tbody',null,statementJournalLines.length?statementJournalLines:h('tr',null,h('td',{colSpan:8,className:'p-6 text-center text-slate-400'},'القيد لا يحتوي على بنود.')))
     )
    ),
    h('div',{className:'space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3'},
     h('div',{className:'font-bold text-sm'},'إجراءات القيد'),
     h('div',{className:'flex flex-wrap gap-2'},
      canFinance('journal','edit')?button('تعديل القيد',()=>void startJournalRevision(statementJournal,'edit'),'primary',busy||!statementJournalPosted||!statementJournalManual||statementJournalHasLinkedAction||!canFinance('review','edit')):null,
      canFinance('journal','edit')?button('إرجاع للمراجعة',()=>void startJournalRevision(statementJournal,'return'),'muted',busy||!statementJournalPosted||!statementJournalManual||statementJournalHasLinkedAction||!canFinance('review','edit')):null,
      canFinance('journal','edit')?button(statementJournalPosted?'إنشاء قيد عكسي للمراجعة':'إلغاء القيد',()=>statementJournalPosted?void reverseJournal(statementJournal):void cancelJournal(statementJournal),'danger',busy||statementJournalHasLinkedAction||(statementJournalPosted&&!statementJournalReversible)):null,
       canFinance('journal','delete')?button(statementJournalPosted&&!statementJournalManual?'حذف القيد ومصدره':'حذف القيد',()=>void deleteJournalDocument(statementJournal),'danger',busy):null
      ),
      statementJournalPosted&&!statementJournalManual&&statementJournal.sourceType==='invoice'?h('p',{className:'w-full text-xs text-amber-800'},'قيد الفاتورة المرحّل: يمكنك إنشاء قيد عكسي للمراجعة أو حذف القيد ومصدره. إذا كانت هناك حركات مخزنية لاحقة فقد يرفض اعتماد القيد العكسي، لكن الحذف متاح مع تسجيل أثر المخزون في سجل التدقيق.'):null,
      statementJournalPosted&&!statementJournalManual&&statementJournal.sourceType!=='invoice'?h('p',{className:'w-full text-xs text-amber-800'},'القيد مرتبط بمستند مصدر ('+String(statementJournal.sourceType||'غير محدد')+'). تتم معالجة تصحيحه من شاشة المصدر الأصلية.'):null,
      statementJournalPosted&&statementJournalManual&&statementJournalHasLinkedAction?h('p',{className:'w-full text-xs text-amber-800'},'هذا القيد مرتبط بطلب تعديل أو إلغاء أو قيد عكسي سابق؛ راجع القيد المرتبط قبل إنشاء إجراء جديد.'):null,
     !canFinance('journal','edit')?h('p',{className:'w-full text-xs text-slate-600'},'لا تتوفر لديك صلاحية تعديل أو إلغاء القيود.'):null
    ),
    h('div',{className:'flex flex-wrap justify-end gap-4 rounded-xl border bg-slate-50 p-3 text-sm font-bold'},
     h('span',null,'المدين: '+fmt(statementJournalDebit)),
     h('span',null,'الدائن: '+fmt(statementJournalCredit)),
     h('span',{className:Math.abs(statementJournalDebit-statementJournalCredit)>0.01?'text-rose-700':'text-emerald-700'},Math.abs(statementJournalDebit-statementJournalCredit)>0.01?'القيد غير متوازن':'القيد متوازن')
    )
   )
  )
 ):null;
 const statementRows=(predicate,valueMode)=>{
  return statementAccountData.filter(row=>{
   if(!predicate(row.account))return false;
   const amount=valueMode==='revenue'?row.activity.credit-row.activity.debit:valueMode==='expense'?row.activity.debit-row.activity.credit:valueMode==='creditBalance'?row.ending.credit-row.ending.debit:row.ending.debit-row.ending.credit;
   return Math.abs(amount)>0.004;
  }).map(row=>{
   const account=row.account,amount=valueMode==='revenue'?row.activity.credit-row.activity.debit:valueMode==='expense'?row.activity.debit-row.activity.credit:valueMode==='creditBalance'?row.ending.credit-row.ending.debit:row.ending.debit-row.ending.credit;
   const depth=accountDepth(account),group=Boolean(account.isGroup);
   return h('tr',{key:account.code,className:(group?'bg-slate-50 font-bold ':'')+'border-t hover:bg-blue-50'},
    h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 hover:text-blue-950 underline text-right',style:{paddingRight:(depth*14)+'px'},onClick:()=>openStatementAccount(account.code)},account.code+' — '+account.name+(group?' · تجميعي':''))),
    h('td',{className:'p-2 text-end '+(group?'font-extrabold':'font-semibold')},fmt(amount))
   );
  });
 };
 const statementRowsWithBalance=(predicate,side,includeZero=false)=>{
  return statementAccountData.filter(row=>predicate(row.account)&&(includeZero||row.amount.debit||row.amount.credit)).map(row=>{
   const account=row.account,depth=accountDepth(account),group=Boolean(account.isGroup),debit=row.ending.debit,credit=row.ending.credit,net=side==='credit'?credit-debit:debit-credit;
   return h('tr',{key:account.code,className:(group?'bg-slate-50 font-bold ':'')+'border-t hover:bg-blue-50'},
    h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 hover:text-blue-950 underline text-right',style:{paddingRight:(depth*14)+'px'},onClick:()=>openStatementAccount(account.code)},account.code+' — '+account.name+(group?' · تجميعي':''))),
    h('td',{className:'p-2 text-end'},fmt(debit)),
    h('td',{className:'p-2 text-end'},fmt(credit)),
    h('td',{className:'p-2 text-end font-bold'},fmt(Math.abs(net))+(Math.abs(net)>0.004?(net>=0?(side==='credit'?' دائن':' مدين'):(side==='credit'?' مدين':' دائن')):''))
   );
  });
 };
 const selectedDebit=periodJournals.reduce((sum,j)=>sum+(j.lines||[]).reduce((part,line)=>part+n(line.debit),0),0);
 const selectedCredit=periodJournals.reduce((sum,j)=>sum+(j.lines||[]).reduce((part,line)=>part+n(line.credit),0),0);
 const unbalancedJournalCount=periodJournals.filter(j=>Math.abs((j.lines||[]).reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0))>0.01).length;
 const trialBalanceRows=statementAccountData.filter(row=>row.amount.debit||row.amount.credit||row.activity.debit||row.activity.credit).map(row=>{
  const account=row.account,depth=accountDepth(account),group=Boolean(account.isGroup);
  return h('tr',{key:account.code,className:(group?'bg-slate-50 font-bold ':'')+'border-t hover:bg-blue-50'},
   h('td',{className:'p-2'},account.code),
   h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline text-right',style:{paddingRight:(depth*12)+'px'},onClick:()=>openStatementAccount(account.code)},account.name+(group?' · إجمالي المجموعة':''))),
   h('td',{className:'p-2 text-end'},fmt(row.opening.debit)),
   h('td',{className:'p-2 text-end'},fmt(row.opening.credit)),
   h('td',{className:'p-2 text-end'},fmt(row.activity.debit)),
   h('td',{className:'p-2 text-end'},fmt(row.activity.credit)),
   h('td',{className:'p-2 text-end font-bold'},fmt(row.ending.debit)),
   h('td',{className:'p-2 text-end font-bold'},fmt(row.ending.credit))
  );
 });
 const trialBalanceTotals=h('div',{className:'grid grid-cols-1 sm:grid-cols-3 gap-2'},
  metric('إجمالي الحركة المدينة',fmt(selectedDebit)),
  metric('إجمالي الحركة الدائنة',fmt(selectedCredit)),
  metric('فرق الحركة',fmt(selectedDebit-selectedCredit)),
  metric('الرصيد الختامي المدين',fmt(balanceTrial.reduce((sum,x)=>sum+x.ending.debit,0))),
  metric('الرصيد الختامي الدائن',fmt(balanceTrial.reduce((sum,x)=>sum+x.ending.credit,0))),
  metric('فرق ميزان المراجعة',fmt(balanceTrial.reduce((sum,x)=>sum+x.ending.debit-x.ending.credit,0)))
 );
 const trialIntegrityNote=h('div',{className:'rounded-xl border p-3 text-sm '+(Math.abs(selectedDebit-selectedCredit)>0.01||unbalancedJournalCount?'border-rose-200 bg-rose-50 text-rose-800':'border-emerald-200 bg-emerald-50 text-emerald-800')},
  h('b',null,unbalancedJournalCount?'توجد قيود غير متوازنة داخل الفترة':'فحص توازن القيود المرحّلة'),
  h('p',{className:'mt-1'},'عدد القيود المرحلة: '+periodJournals.length+' · القيود غير المتوازنة: '+unbalancedJournalCount+' · فرق إجمالي الحركة: '+fmt(selectedDebit-selectedCredit)+'.'),
  h('p',{className:'text-xs mt-1'},'يعرض التقرير القيود بحالة مرحّل فقط. هذا الفحص يختبر توازن القيود والفترة، ولا يستبدل المراجعة التفصيلية للمستندات ومطابقة الحسابات الفرعية.')
 );
 const incomeRevenueRows=statementRows(account=>account.type==='revenue'&&!account.isGroup,'revenue');
 const incomeCogsRows=statementRows(account=>isCostOfSalesAccount(account)&&!account.isGroup,'expense');
 const incomeOperatingExpenseRows=statementRows(account=>account.type==='expense'&&!account.isGroup&&!isCostOfSalesAccount(account)&&expenseStatementGroup(account)==='operating','expense');
 const incomeAdministrativeExpenseRows=statementRows(account=>account.type==='expense'&&!account.isGroup&&!isCostOfSalesAccount(account)&&expenseStatementGroup(account)==='administrative','expense');
 const incomeFinanceExpenseRows=statementRows(account=>account.type==='expense'&&!account.isGroup&&!isCostOfSalesAccount(account)&&expenseStatementGroup(account)==='finance','expense');
 const incomeUnclassifiedExpenseRows=statementRows(account=>account.type==='expense'&&!account.isGroup&&!isCostOfSalesAccount(account)&&expenseStatementGroup(account)==='unclassified','expense');
 const expenseSourceAudit=flat.filter(line=>{
  const account=accounts.find(item=>String(item.code)===String(line.accountCode));
  return account&&account.type==='expense'&&!isCostOfSalesAccount(account);
 });
 const expenseSourceTotal=expenseSourceAudit.reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const custodyExpenseTotal=expenseSourceAudit.filter(line=>line.sourceType==='cashCustody').reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const invoiceExpenseTotal=expenseSourceAudit.filter(line=>line.sourceType==='invoice').reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const voucherExpenseTotal=expenseSourceAudit.filter(line=>line.sourceType==='cash'||line.sourceType==='bankLine').reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const partnerCurrentCorrectionTotal=expenseSourceAudit.filter(line=>line.sourceType==='partnerCurrentAccountExpenseCorrection'||(line.sourceType==='partnerCurrentAccountTransfer'&&line.transferTreatment==='personalWithdrawal')).reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const manualExpenseTotal=expenseSourceAudit.filter(line=>!['cashCustody','invoice','cash','bankLine','partnerCurrentAccountExpenseCorrection'].includes(line.sourceType)&&!(line.sourceType==='partnerCurrentAccountTransfer'&&line.transferTreatment==='personalWithdrawal')).reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const expenseSourceRows=expenseSourceAudit.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''))).map((line,index)=>{
  const account=accounts.find(item=>String(item.code)===String(line.accountCode)),sourceDocument=documents.find(item=>String(item.id)===String(line.sourceId));
  let sourceLabel='مصدر غير محدد';
  if(line.sourceType==='cashCustody')sourceLabel='ترحيل تلقائي من العهدة الشخصية إلى الحساب 6100';
  else if(line.sourceType==='invoice')sourceLabel=(sourceDocument&&sourceDocument.invoiceType==='sales'?'فاتورة مبيعات':'فاتورة مشتريات')+' — '+(sourceDocument&&sourceDocument.number||line.reference||line.sourceId||'');
  else if(line.sourceType==='cash')sourceLabel='سند خزينة — '+(sourceDocument&&(sourceDocument.number||sourceDocument.reference)||line.reference||'');
  else if(line.sourceType==='bankLine')sourceLabel='حركة كشف بنك — '+(sourceDocument&&(sourceDocument.number||sourceDocument.reference)||line.reference||'');
  else if(line.sourceType==='partnerCurrentAccountExpenseCorrection')sourceLabel='قيد تصحيح سحب شخصي على جاري الشريك — عكس مصروف غير متعلق بنشاط الشركة';
  else if(line.sourceType==='partnerCurrentAccountTransfer'&&line.transferTreatment==='personalWithdrawal')sourceLabel='إعادة تصنيف سحب شخصي على جاري الشريك — لا يمثل مصروفًا للشركة';
  else if(line.sourceType==='manual')sourceLabel='قيد يومية يدوي';
  else if(line.sourceType==='projectEvent')sourceLabel='حدث مشروع';
  else if(line.sourceType)sourceLabel=String(line.sourceType);
  const amount=n(line.debit)-n(line.credit);
  return h('tr',{key:String(line.journalId)+'-'+String(line.lineNo||index),className:'border-t hover:bg-blue-50'},
   h('td',{className:'p-2 whitespace-nowrap'},line.date||'—'),
   h('td',{className:'p-2'},h('button',{type:'button',className:'font-bold text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId||'—')),
   h('td',{className:'p-2'},line.accountCode+' — '+(account&&account.name||'')),
   h('td',{className:'p-2 min-w-[180px]'},line.description||line.journalDescription||'—'),
   h('td',{className:'p-2 min-w-[190px]'},sourceLabel),
   h('td',{className:'p-2'},line.reference||'—'),
   h('td',{className:'p-2 text-end font-bold'},fmt(amount))
  );
 });
 const partnerCurrentCorrectionCounts=partnerCurrentAccounts.reduce((tot,account)=>{
  (account.transactions||[]).forEach(transaction=>{
   const marker=transaction.partnerCurrentAccountTransfer||{};
   if(transaction.type!=='expense'||marker.active!==true||marker.transferTreatment==='personalWithdrawal'||marker.expenseCorrectionStatus==='posted')return;
   if(marker.expenseCorrectionPendingJournalId||marker.expenseCorrectionStatus==='pending_review')tot.pending++;
   else tot.needed++;
  });
  return tot;
 },{needed:0,pending:0});
 const inventoryPurchaseAudit=flat.filter(line=>line.sourceType==='invoice'&&String(line.accountCode)==='1300'&&n(line.debit)>0&&n(line.credit)===0);
 const inventoryPurchaseTotal=inventoryPurchaseAudit.reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const inventoryPurchaseInvoiceCount=new Set(inventoryPurchaseAudit.map(line=>String(line.sourceId||'')).filter(Boolean)).size;
 const inventoryPurchaseRows=inventoryPurchaseAudit.map((line,index)=>{
  const sourceDocument=documents.find(item=>String(item.id)===String(line.sourceId));
  return h('tr',{key:String(line.journalId)+'-'+String(line.lineNo||index),className:'border-t'},
   h('td',{className:'p-2 whitespace-nowrap'},line.date||'—'),
   h('td',{className:'p-2'},h('button',{type:'button',className:'font-bold text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId||'—')),
   h('td',{className:'p-2'},sourceDocument&&sourceDocument.number||line.reference||line.sourceId||'—'),
   h('td',{className:'p-2'},(line.itemCode?line.itemCode+' — ':'')+(line.description||'بند مخزني')),
   h('td',{className:'p-2 text-end font-bold'},fmt(n(line.debit)-n(line.credit)))
  );
 });
 const expenseSourceDifference=otherExpenses-expenseSourceTotal;
 const vatNetBalanceSheetRow=vatNetReceivable>0.005
  ?h('tr',{key:'vat-net-asset',className:'border-t bg-slate-50 font-bold'},h('td',{className:'p-2'},'صافي ضريبة القيمة المضافة (مدخلات ومخرجات وسدادات)'),h('td',{className:'p-2 text-end'},fmt(vatNetReceivable)),h('td',{className:'p-2 text-end'},fmt(0)),h('td',{className:'p-2 text-end font-bold'},fmt(vatNetReceivable)+' مدين'))
  :null;
 const balanceAssetRows=statementRowsWithBalance(account=>account.type==='asset'&&!account.isGroup&&String(account.code)!=="1410",'debit',true).concat(vatNetBalanceSheetRow?[vatNetBalanceSheetRow]:[]);

 const inventoryStatementRows=(()=>{
  const balanceTree=master.inventory&&master.inventory.balances||{},names=new Map(items.map(item=>[String(item.code),item.name]));
  return Object.entries(balanceTree).flatMap(([warehouseCode,warehouseRows])=>Object.entries(warehouseRows||{})
   .filter(([,stock])=>stock&&(Math.abs(n(stock.quantity))>0.005||Math.abs(n(stock.value))>0.01))
   .map(([itemCode,stock])=>({warehouseCode,itemCode,name:names.get(String(itemCode))||"صنف غير موجود بالدليل",quantity:n(stock.quantity),averageCost:n(stock.averageCost),value:n(stock.value)})));
 })();
 const inventorySubledgerValue=inventoryStatementRows.reduce((sum,row)=>sum+row.value,0);
 const inventoryControlAccount=balanceTrial.find(row=>String(row.account.code)==="1300");
 const inventoryLedgerBalance=inventoryControlAccount?n(inventoryControlAccount.amount.debit)-n(inventoryControlAccount.amount.credit):0;
 const inventoryStatementDifference=inventorySubledgerValue-inventoryLedgerBalance;
 const inventoryStatementReconciliationPanel=()=>panel("مطابقة قيمة المخزون مع حساب الأستاذ 1300","تعرض أرصدة الكميات والقيم الفعلية من المخازن، وتقارنها برصيد حساب المخزون في الأستاذ العام. فرق المطابقة لا يُضم تلقائيًا إلى إجمالي الأصول حتى لا تُعرض قيمة مزدوجة أو غير معتمدة.",h("div",{className:"space-y-3"},
  h("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-2"},
   metric("قيمة المخزون في المخازن",fmt(inventorySubledgerValue)),metric("رصيد حساب 1300 في الأستاذ",fmt(inventoryLedgerBalance)),metric("فرق المطابقة",fmt(inventoryStatementDifference))
  ),
  Math.abs(inventoryStatementDifference)>0.01?h("div",{className:"rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"},"يوجد فرق بين رصيد حركة المخازن وحساب 1300. راجع حركة المخزن ونفّذ تعديلًا أو تصفيرًا، ثم اعتمد قيد التسوية من قائمة المراجعة حتى يظهر الرصيد بالقيمة الصحيحة في إجمالي الأصول."):h("div",{className:"rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"},"قيمة المخزون متطابقة مع حساب 1300."),
  table(["المخزن","كود الصنف","اسم الصنف","الكمية","متوسط التكلفة","القيمة"],inventoryStatementRows.map(row=>h("tr",{key:row.warehouseCode+"|"+row.itemCode,className:"border-t"},h("td",{className:"p-2"},row.warehouseCode),h("td",{className:"p-2"},row.itemCode),h("td",{className:"p-2"},row.name),h("td",{className:"p-2 text-end"},fmt(row.quantity)),h("td",{className:"p-2 text-end"},fmt(row.averageCost)),h("td",{className:"p-2 text-end font-bold"},fmt(row.value))))),
  button("فتح حركة المخزن لتصحيح الرصيد",()=>setTab("inventoryMovements"),"muted",!canFinance("inventory","view"))
 ));

 const vatNetLiabilitySheetRow=vatNetPayable>0.005
  ?h('tr',{key:'vat-net-liability',className:'border-t bg-slate-50 font-bold'},h('td',{className:'p-2'},'صافي ضريبة القيمة المضافة (مدخلات ومخرجات وسدادات)'),h('td',{className:'p-2 text-end'},fmt(0)),h('td',{className:'p-2 text-end'},fmt(vatNetPayable)),h('td',{className:'p-2 text-end font-bold'},fmt(vatNetPayable)+' دائن'))
  :null;
 const balanceLiabilityRows=statementRowsWithBalance(account=>account.type==='liability'&&!account.isGroup&&String(account.code)!=="2110",'credit',true).concat(vatNetLiabilitySheetRow?[vatNetLiabilitySheetRow]:[]);
 const balanceEquityRows=statementRowsWithBalance(account=>account.type==='equity'&&!account.isGroup,'credit',true);
 const incomeTaxSourceMap=new Map(documents.map(document=>[String(document.id),document]));
 const incomeTaxLines=periodJournals.flatMap(journal=>(journal.lines||[]).map((line,index)=>({journal,line,index,source:incomeTaxSourceMap.get(String(journal.sourceId||""))})).filter(item=>["1410","2110","2120"].includes(String(item.line.accountCode))));
 const incomeVatLineSummary=code=>incomeTaxLines.filter(item=>String(item.line.accountCode)===String(code)).reduce((sum,item)=>({debit:sum.debit+n(item.line.debit),credit:sum.credit+n(item.line.credit)}),{debit:0,credit:0});
 const incomeVatInputCurrent=incomeVatLineSummary("1410"),incomeVatOutputCurrent=incomeVatLineSummary("2110"),incomeWithholdingCurrent=incomeVatLineSummary("2120");
 const incomeVatTaxRows=incomeTaxLines.sort((a,b)=>String(a.journal.date||"").localeCompare(String(b.journal.date||""))||String(a.journal.number||a.journal.id).localeCompare(String(b.journal.number||b.journal.id))).map(item=>{
  const code=String(item.line.accountCode),movement=item.source&&item.source.movementType||"",description=item.line.description||item.journal.description||"",label=code==="1410"?(n(item.line.debit)>0?"ضريبة مدخلات":"رد / تسوية ضريبة مدخلات"):code==="2110"?(movement==="tax_payment"?"سداد قيمة مضافة":n(item.line.credit)>0?"ضريبة مخرجات":"تسوية / سداد قيمة مضافة"):movement==="tax_payment"?"سداد خصم وإضافة":"ضريبة خصم وإضافة";
  return h("tr",{key:String(item.journal.id)+"-"+item.index,className:"border-t hover:bg-blue-50"},h("td",{className:"p-2 whitespace-nowrap"},item.journal.date||"—"),h("td",{className:"p-2"},h("button",{type:"button",className:"font-bold text-blue-700 underline",onClick:()=>openStatementJournal(item.journal.id)},item.journal.number||item.journal.id)),h("td",{className:"p-2"},code+" — "+label),h("td",{className:"p-2"},item.source&&(item.source.number||item.source.reference)||item.journal.reference||"—"),h("td",{className:"p-2 min-w-[220px]"},description),h("td",{className:"p-2 text-end"},fmt(item.line.debit)),h("td",{className:"p-2 text-end"},fmt(item.line.credit)));
 });
 const incomeVatOpening=balanceFlat.filter(line=>String(line.date||"")<(period.from||"0000-00")+"-01"&&["1410","2110"].includes(String(line.accountCode))).reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const incomeVatClosing=balanceFlat.filter(line=>["1410","2110"].includes(String(line.accountCode))).reduce((sum,line)=>sum+n(line.debit)-n(line.credit),0);
 const incomeTaxMetric=(label,value,accountCode)=>h("button",{type:"button",className:"rounded-xl border bg-white p-3 text-start hover:border-blue-400 hover:bg-blue-50",onClick:()=>openStatementAccount(accountCode)},h("div",{className:"text-xs text-slate-500"},label),h("div",{className:"mt-1 text-base font-extrabold"},fmt(value)),h("div",{className:"mt-1 text-[10px] text-blue-700"},"فتح كشف الحساب "+accountCode));
 const incomeStatementContent=()=>h('div',{className:'space-y-3'},
  h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
   metric('إجمالي الإيرادات',fmt(revenue)),
   metric('تكلفة المبيعات',fmt(costOfSales)),
   metric('مجمل الربح',fmt(grossProfit)),
   metric('صافي الربح / الخسارة',fmt(profit))
  ),
  partnerCurrentCorrectionCounts.needed||partnerCurrentCorrectionCounts.pending?h('div',{className:'rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900'},
   h('div',{className:'font-bold'},'مراجعة سحوبات الشركاء قبل اعتماد نتيجة الفترة'),
   partnerCurrentCorrectionCounts.needed?h('p',{className:'mt-1'},'يوجد '+partnerCurrentCorrectionCounts.needed+' حركة مصروف قديمة محولة إلى جاري الشريك لم يُرحّل لها قيد تصحيح بعد. ستظل آثار هذه الحركات ضمن المصروفات حتى اعتماد التصحيح.'):null,
   partnerCurrentCorrectionCounts.pending?h('p',{className:'mt-1'},'يوجد '+partnerCurrentCorrectionCounts.pending+' قيد تصحيح بانتظار المراجعة والاعتماد. حدّث القوائم بعد ترحيله.'):null,
   button('فتح جاري الشركاء لمعالجة الحركات',()=>setTab('partnerCurrent'),'muted')
  ):null,
  panel("موقف الضرائب — إيضاح مستقل داخل قائمة الدخل","إيضاح رقابي مفصل لحركة الضريبة من القيود المرحلة. هذه الأرصدة ضريبية/ميزانية ولا تُضاف إلى الإيرادات أو المصروفات ولا تغيّر صافي الربح.",h("div",{className:"space-y-3"},
   h("div",{className:"grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2"},
    incomeTaxMetric("ضريبة مدخلات المشتريات — 1410",incomeVatInputCurrent.debit,"1410"),
    incomeTaxMetric("مردودات / تسويات المدخلات — 1410",incomeVatInputCurrent.credit,"1410"),
    incomeTaxMetric("ضريبة مخرجات المبيعات — 2110",incomeVatOutputCurrent.credit,"2110"),
    incomeTaxMetric("المسدد من القيمة المضافة — 2110",incomeVatOutputCurrent.debit,"2110"),
    incomeTaxMetric("ضريبة الخصم والإضافة المستحقة — 2120",incomeWithholdingCurrent.credit,"2120"),
    incomeTaxMetric("المسدّد من الخصم والإضافة — 2120",incomeWithholdingCurrent.debit,"2120"),
    incomeTaxMetric("صافي موقف القيمة المضافة — 1410/2110",incomeVatClosing,"1410")
   ),
   h("div",{className:"rounded-lg border bg-slate-50 p-3 text-sm space-y-1"},
    h("div",{className:"font-bold"},"رصيد بداية الفترة: "+fmt(incomeVatOpening)+(incomeVatOpening>=0?" مدين":" دائن")),
    h("div",null,"صافي حركة الفترة: "+fmt(incomeVatClosing-incomeVatOpening)),
    h("div",{className:"font-extrabold"},"رصيد الإقفال: "+fmt(Math.abs(incomeVatClosing))+(incomeVatClosing>=0?" مدين":" دائن"))
   ),
   h("p",{className:"text-xs text-slate-600"},"اضغط أي مؤشر لفتح كشف الحساب المرتبط. واضغط رقم القيد في الجدول لعرض مستند السداد أو الفاتورة والقيد بالكامل."),
   table(["التاريخ","رقم القيد","نوع الحركة / الحساب","المستند المرجعي","البيان","مدين","دائن"],incomeVatTaxRows.length?incomeVatTaxRows:[h("tr",{key:"no-tax"},h("td",{colSpan:7,className:"p-4 text-center text-slate-400"},"لا توجد حركات ضريبية مرحّلة في الفترة المحددة."))
   ])
  )),
  panel('فواتير مشتريات محمّلة على المخزون','بنود المشتريات المخزنية تُرحّل إلى حساب المخزون 1300 وتظهر ضمن الأصول، ولا تدخل المصروفات التشغيلية أو تكلفة المبيعات عند الشراء.',h('div',{className:'space-y-2'},
   h('div',{className:'grid grid-cols-2 gap-2'},metric('عدد فواتير الشراء المخزني',String(inventoryPurchaseInvoiceCount)),metric('إجمالي الإضافة للمخزون',fmt(inventoryPurchaseTotal))),
   table(['التاريخ','رقم القيد','رقم الفاتورة','الصنف / البيان','قيمة الإضافة للمخزون'],inventoryPurchaseRows)
  )),
  panel('الإيرادات','حسابات الإيرادات التفصيلية فقط. إجمالي المجموعة يظهر في المؤشر أعلى القائمة ولا يتكرر مع الحسابات التابعة.',table(['الحساب','إيرادات الفترة'],incomeRevenueRows)),
  panel('تكلفة المبيعات','حسابات تكلفة المبيعات التفصيلية فقط؛ لا تُخلط مع المصروفات التشغيلية.',table(['الحساب','تكلفة الفترة'],incomeCogsRows)),
  panel('المصروفات التشغيلية','الحسابات المصنفة تشغيليًا في دليل الحسابات فقط، دون عرض الحسابات التجميعية بجانب حساباتها التابعة.',h('div',{className:'space-y-2'},metric('إجمالي المصروفات التشغيلية',fmt(operatingExpenses)),table(['الحساب','مصروف الفترة'],incomeOperatingExpenseRows))),
  panel('المصروفات الإدارية والعمومية','مصروفات الإدارة والخدمات العمومية المصنفة في دليل الحسابات.',h('div',{className:'space-y-2'},metric('إجمالي المصروفات الإدارية',fmt(administrativeExpenses)),table(['الحساب','مصروف الفترة'],incomeAdministrativeExpenseRows))),
  panel('المصروفات التمويلية والبنكية','العمولات والمصاريف البنكية والتمويلية فقط.',h('div',{className:'space-y-2'},metric('إجمالي المصروفات التمويلية',fmt(financeExpenses)),table(['الحساب','مصروف الفترة'],incomeFinanceExpenseRows))),
  panel('مصروفات غير مصنفة','الحسابات التي لم يتم تحديد مجموعة قائمة الدخل لها في دليل الحسابات. لا يتم افتراض أنها تشغيلية؛ راجع تصنيف الحساب.',h('div',{className:'space-y-2'},metric('إجمالي غير المصنف',fmt(unclassifiedExpenses)),table(['الحساب','مصروف الفترة'],incomeUnclassifiedExpenseRows))),
  panel('مطابقة المصروفات مع القيود المصدرية','كل مبلغ مرتبط بسطر قيد مرحّل. حركة العهدة التي تم ترحيلها إلى 6100 لا تُعد تلقائيًا مصروف شركة إذا كانت سحبًا شخصيًا؛ تحويلها إلى جاري الشريك لا ينعكس على قائمة الدخل إلا بعد اعتماد قيد التصحيح. فواتير المشتريات المخزنية على 1300 معروضة في قسم مستقل ولا تدخل هذا الإجمالي. اضغط رقم القيد لمراجعة أطرافه.',h('div',{className:'space-y-3'},
   h('div',{className:'grid grid-cols-2 md:grid-cols-7 gap-2'},
    metric('مصروفات مرحّلة من العهد الشخصية',fmt(custodyExpenseTotal)),
    metric('مصروفات ناتجة عن الفواتير',fmt(invoiceExpenseTotal)),
    metric('مصروفات سندات الخزينة / البنك',fmt(voucherExpenseTotal)),
    metric('مصروفات بقيود أخرى',fmt(manualExpenseTotal)),
    metric('تخفيض مصروفات سحوبات الشركاء',fmt(Math.max(0,-partnerCurrentCorrectionTotal))),
    metric('سحوبات قديمة تحتاج تصحيح',String(partnerCurrentCorrectionCounts.needed)),
    metric('تصحيحات بانتظار الاعتماد',String(partnerCurrentCorrectionCounts.pending))
   ),
   h('div',{className:'rounded-lg border p-3 text-sm '+(Math.abs(expenseSourceDifference)>0.01||Math.abs(expenseCategoryDifference)>0.01?'border-rose-300 bg-rose-50':'border-emerald-300 bg-emerald-50')},
    h('div',{className:'font-bold'},'مطابقة إجمالي المصروفات غير تكلفة المبيعات'),
    h('div',null,'مصروفات قائمة الدخل: '+fmt(otherExpenses)+' ج.م'),
    h('div',null,'مجموع سطور المصروفات في القيود: '+fmt(expenseSourceTotal)+' ج.م'),
    h('div',{className:'font-extrabold mt-1'},'فرق المطابقة: '+fmt(expenseSourceDifference)+' ج.م'),
    h('div',{className:'mt-1 text-xs'},'فرق تصنيف مجموعات المصروفات: '+fmt(expenseCategoryDifference)+' ج.م')
   ),
   table(['التاريخ','رقم القيد','الحساب','البيان','مصدر الحركة','المرجع','صافي المصروف'],expenseSourceRows)
  )),
  panel('نتيجة الفترة','الإيرادات ناقص تكلفة المبيعات ثم جميع المصروفات التشغيلية والإدارية والتمويلية وغير المصنفة.',table(['البيان','القيمة'],[
   ['مجمل الربح',fmt(grossProfit)],
   ['مصروفات تشغيلية',fmt(operatingExpenses)],
   ['مصروفات إدارية وعمومية',fmt(administrativeExpenses)],
   ['مصروفات تمويلية',fmt(financeExpenses)],
   ['مصروفات غير مصنفة',fmt(unclassifiedExpenses)],
   ['إجمالي المصروفات الأخرى',fmt(otherExpenses)],
   ['صافي الربح / الخسارة',fmt(profit)]
  ]))
 ); 

 const invoicePostingReconciliationPanel=()=>{
  const invoiceDocuments=documents.filter(doc=>doc&&doc.type==="invoice"&&!["deleted","cancelled"].includes(String(doc.status||"")));
  const journalById=new Map(),journalBySource=new Map();
  [...journalRecords,...balanceJournals].forEach(journal=>{
   if(!journal||journal.status!=="posted")return;
   const journalId=String(journal.id||"");
   if(journalId)journalById.set(journalId,journal);
   if(journal.sourceType==="invoice"&&journal.sourceId)journalBySource.set(String(journal.sourceId),journal);
  });
  const balanceJournalIds=new Set(balanceJournals.map(journal=>String(journal&&journal.id||"")));
  const invoiceDiagnostics=invoiceDocuments.map(doc=>{
   const posted=String(doc.status||"")==="posted";
   const journal=(doc.journalId&&journalById.get(String(doc.journalId)))||journalBySource.get(String(doc.id||""))||null;
   const issues=[];
   if(posted){
    if(!journal||journal.status!=="posted"){
     issues.push("حالة الفاتورة مرحّلة لكن القيد المرحّل المرتبط بها غير موجود في سجلات القيود.");
    }else{
     const lines=Array.isArray(journal.lines)?journal.lines:[];
     const purchase=doc.invoiceType==="purchase";
     const hasLine=(code,side)=>lines.some(line=>String(line.accountCode)===code&&n(line[side])>0.005);
     const vatAmount=n(doc.totals&&doc.totals.vat!==undefined?doc.totals.vat:doc.taxAmount);
     if(purchase){
      const supplierLines=lines.filter(line=>String(line.accountCode)==="281"&&n(line.credit)>0.005);
      if(!supplierLines.length)issues.push("لا يوجد طرف دائن على حساب الموردين 281.");
      else if(doc.partyId&&!supplierLines.some(line=>String(line.partyId||"")===String(doc.partyId)))issues.push("قيد الموردين 281 لا يحمل كود المورد الصحيح في الأستاذ المساعد.");
      const stockLines=Array.isArray(doc.lines)?doc.lines.filter(line=>line&&line.kind==="stock"):[];
      const expectedStockValue=stockLines.reduce((sum,line)=>sum+Math.max(0,n(line.quantity)*n(line.unitPrice)-n(line.discount)),0);
      if(expectedStockValue>0.01&&!hasLine("1300","debit"))issues.push("الفاتورة بها أصناف مخزنية لكن القيد لا يثبت مدينًا على المخزون 1300.");
      if(vatAmount>0.01&&!hasLine("1410","debit"))issues.push("ضريبة المدخلات موجودة بالفاتورة لكن لا يوجد قيد على 1410.");
     }else if(doc.invoiceType==="sales"){
      const receivableLines=lines.filter(line=>String(line.accountCode)==="1210"&&n(line.debit)>0.005);
      if(!receivableLines.length)issues.push("لا يوجد طرف مدين على حساب العملاء 1210.");
      else if(doc.partyId&&!receivableLines.some(line=>String(line.partyId||"")===String(doc.partyId)))issues.push("قيد العملاء 1210 لا يحمل كود العميل الصحيح في الأستاذ المساعد.");
      if(vatAmount>0.01&&!hasLine("2110","credit"))issues.push("ضريبة المخرجات موجودة بالفاتورة لكن لا يوجد قيد على 2110.");
     }
    }
   }
   const total=n(doc.totals&&doc.totals.total!==undefined?doc.totals.total:doc.total);
   const statusLabel=({
    posted:"مرحّلة",pending_review:"بانتظار المراجعة",duplicate_review:"تكرار محتمل",
    needs_correction:"تحتاج تصحيح",returned_to_creator:"معادة للمنشئ",
    assigned:"محولة للاستكمال",draft:"مسودة",rejected:"مرفوضة",
    cancelled:"ملغاة",deleted:"محذوفة",reversed:"معكوسة محاسبيًا"
   })[String(doc.status||"")]||String(doc.status||"غير محددة");
   const outsideBalanceRange=Boolean(posted&&journal&&!balanceJournalIds.has(String(journal.id||"")));
   const observation=!posted
    ?"لا يوجد أثر محاسبي قبل الاعتماد والترحيل."
    :issues.length?issues.join("؛ ")
    :outsideBalanceRange?"القيد مرحّل، لكنه خارج النطاق التراكمي المعروض حاليًا."
    :"القيد وحساباته الأساسية سليمة.";
   return {doc,posted,journal,issues,total,statusLabel,outsideBalanceRange,observation};
  });
  const excludedStatuses=new Set(["rejected","cancelled","deleted","reversed"]);
  const unpostedInvoices=invoiceDiagnostics.filter(row=>!row.posted&&!excludedStatuses.has(String(row.doc.status||"")));
  const postedInvoices=invoiceDiagnostics.filter(row=>row.posted);
  const postingIssueRows=invoiceDiagnostics.filter(row=>row.posted&&row.issues.length>0);
  const outsideRangeCount=invoiceDiagnostics.filter(row=>row.outsideBalanceRange&&!row.issues.length).length;
  const unpostedInvoiceTotal=unpostedInvoices.reduce((sum,row)=>sum+row.total,0);
  const exceptionRows=invoiceDiagnostics.filter(row=>!row.posted||row.issues.length>0||row.outsideBalanceRange).slice(0,30).map((row,index)=>{
   const doc=row.doc;
   return h("tr",{key:doc.id||index,className:"border-t"},
    h("td",{className:"p-2 whitespace-nowrap"},doc.date||"—"),
    h("td",{className:"p-2 font-bold"},h("button",{type:"button",className:"text-blue-700 underline font-extrabold whitespace-nowrap",title:"فتح شاشة اتخاذ القرار لهذه الفاتورة",onClick:()=>void openInvoiceDiagnostic(row)},doc.number||doc.id||"فتح الفاتورة")),
    h("td",{className:"p-2"},doc.invoiceType==="purchase"?"مشتريات":"مبيعات"),
    h("td",{className:"p-2"},doc.partyName||doc.partyId||"—"),
    h("td",{className:"p-2 text-end"},fmt(row.total)),
    h("td",{className:"p-2"},row.statusLabel),
    h("td",{className:"p-2"},row.journal&&(row.journal.number||row.journal.id)||doc.journalId||"—"),
    h("td",{className:"p-2 min-w-[240px] text-xs"},row.observation)
   );
  });
  const note=invoiceDocuments.length===0
   ?"لم تصل فواتير إلى شاشة الفحص. تأكد من صلاحية عرض الفواتير ثم حدّث البيانات."
   :unpostedInvoices.length
    ?"توجد فواتير محفوظة لم تُرحّل بعد. هذه الفواتير لا تزيد المخزون ولا تثبت رصيد الموردين أو العملاء أو ضريبة القيمة المضافة قبل اعتمادها من شاشة المراجعة."
    :postingIssueRows.length
     ?"توجد فواتير حالتها مرحّلة لكن قيدها أو أحد حساباتها الأساسية لا يطابق الفاتورة؛ راجع التفاصيل قبل اعتماد القوائم."
     :"تم فحص حالات الفواتير والقيود المرتبطة بها. أي قيد خارج النطاق التراكمي الحالي لن يدخل في أرصدة هذه القائمة.";
  return panel("مطابقة الفواتير مع القيود والأرصدة","فحص حالة كل فاتورة وربطها بالقيد المرحّل، مع مراجعة حساب المخزون والموردين والعملاء وضريبة القيمة المضافة.",h("div",{className:"space-y-3"},
   h("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-2"},
    metric("إجمالي الفواتير",String(invoiceDocuments.length)),
    metric("فواتير غير مرحلة",String(unpostedInvoices.length)),
    metric("قيمة الفواتير غير المرحلة",fmt(unpostedInvoiceTotal)),
    metric("فواتير مرحّلة",String(postedInvoices.length))
   ),
   h("div",{className:"rounded-lg border p-3 text-sm "+(unpostedInvoices.length||postingIssueRows.length?"border-amber-300 bg-amber-50 text-amber-900":"border-slate-200 bg-slate-50 text-slate-700")},note),
   postingIssueRows.length?h("div",{className:"text-sm font-bold text-rose-700"},"فواتير مرحّلة بها خلل في الربط: "+postingIssueRows.length):null,
   outsideRangeCount?h("div",{className:"text-xs text-slate-600"},"فواتير مرحّلة خارج نطاق الأرصدة التراكمية الحالي: "+outsideRangeCount):null,
   exceptionRows.length
    ?table(["التاريخ","رقم الفاتورة","النوع","الطرف","الإجمالي","الحالة","رقم القيد","نتيجة الفحص"],exceptionRows)
    :h("div",{className:"rounded-lg border border-dashed p-3 text-sm text-slate-500"},"لا توجد فواتير غير مرحلة أو بها اختلافات في الربط."),
   h("div",{className:"text-xs text-slate-500"},"لا ينشئ هذا الفحص قيود تسوية تلقائية ولا يغير أي رصيد؛ وظيفته تحديد مصدر الفرق فقط.")
  ));
 };
 const controlSubledgerAuditRows=accounts.filter(account=>account.subledgerType&&!account.isGroup).map(account=>{
  const gl=balanceBalances[String(account.code)]||{debit:0,credit:0};
  const analytic=balanceFlat.filter(line=>String(line.accountCode)===String(account.code)&&String(line.partyType||"")===String(account.subledgerType)&&String(line.partyId||""));
  const subDebit=analytic.reduce((sum,line)=>sum+n(line.debit),0),subCredit=analytic.reduce((sum,line)=>sum+n(line.credit),0);
  return {account,glDebit:n(gl.debit),glCredit:n(gl.credit),subDebit,subCredit,debitDifference:n(gl.debit)-subDebit,creditDifference:n(gl.credit)-subCredit,count:analytic.length};
 });
 const controlSubledgerMismatchCount=controlSubledgerAuditRows.filter(row=>Math.abs(row.debitDifference)>0.01||Math.abs(row.creditDifference)>0.01).length;
 const controlSubledgerIntegrityPanel=()=>panel('مطابقة الحسابات الرقابية مع الأستاذ المساعد','يجب أن يساوي إجمالي حركة كل حساب رقابي مجموع حركات الأطراف التحليلية المسجلة عليه. الفرق يشير إلى قيد بلا طرف تحليلي أو إلى نقص في ترحيل الأستاذ المساعد.',h('div',{className:'space-y-2'},
  controlSubledgerMismatchCount?h('div',{className:'rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900'},'توجد '+controlSubledgerMismatchCount+' حسابات رقابية تحتاج إلى مراجعة. لا تعتمد أرصدة الموردين أو العملاء أو العاملين قبل فحص الفروق.'):h('div',{className:'rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800'},'حركة الحسابات الرقابية متطابقة مع مجموع الأطراف التحليلية المسجلة على القيود المرحلة.'),
  table(['كود الحساب','الحساب الرقابي','نوع الأستاذ المساعد','مدين الأستاذ العام','مدين الأطراف','فرق المدين','دائن الأستاذ العام','دائن الأطراف','فرق الدائن','عدد السطور'],controlSubledgerAuditRows.map(row=>h('tr',{key:row.account.code,className:'border-t'},
   h('td',{className:'p-2'},row.account.code),
   h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline font-semibold',onClick:()=>openStatementAccount(row.account.code)},row.account.name)),
   h('td',{className:'p-2'},row.account.subledgerType),
   h('td',{className:'p-2 text-end'},fmt(row.glDebit)),
   h('td',{className:'p-2 text-end'},fmt(row.subDebit)),
   h('td',{className:'p-2 text-end font-bold '+(Math.abs(row.debitDifference)>0.01?'text-rose-700':'')},fmt(row.debitDifference)),
   h('td',{className:'p-2 text-end'},fmt(row.glCredit)),
   h('td',{className:'p-2 text-end'},fmt(row.subCredit)),
   h('td',{className:'p-2 text-end font-bold '+(Math.abs(row.creditDifference)>0.01?'text-rose-700':'')},fmt(row.creditDifference)),
   h('td',{className:'p-2 text-center'},String(row.count))
  )))
 ));
const criticalAccountConfiguration=[
  {code:"1210",type:"asset",nature:"debit",subledgerType:"customer",label:"العملاء"},
  {code:"1240",type:"asset",nature:"debit",subledgerType:"vendor",label:"دفعات مقدمة للموردين"},
  {code:"1300",type:"asset",nature:"debit",label:"المخزون"},
  {code:"1410",type:"asset",nature:"debit",label:"ضريبة القيمة المضافة - مدخلات"},
  {code:"2110",type:"liability",nature:"credit",label:"ضريبة القيمة المضافة - مخرجات"},
  {code:"2120",type:"liability",nature:"credit",label:"ضرائب الخصم والإضافة المستحقة"},
  {code:"2150",type:"liability",nature:"credit",subledgerType:"financingParty",label:"تمويل وقروض من الشركاء والغير"},
  {code:"2130",type:"liability",nature:"credit",subledgerType:"customer",label:"دفعات مقدمة من العملاء"},
  {code:"281",type:"liability",nature:"credit",subledgerType:"vendor",label:"الموردون"}
 ];
 const criticalAccountAuditRows=criticalAccountConfiguration.map(expected=>{
  const actual=accounts.find(account=>String(account.code)===expected.code);
  const issues=[];
  if(!actual)issues.push("الحساب غير موجود");
  else{
   if(String(actual.type||"")!==expected.type)issues.push("نوع الحساب يجب أن يكون "+expected.type);
   if(String(actual.nature||"")!==expected.nature)issues.push("طبيعة الحساب يجب أن تكون "+expected.nature);
   if(expected.subledgerType&&String(actual.subledgerType||"")!==expected.subledgerType)issues.push("نوع الأستاذ المساعد يجب أن يكون "+expected.subledgerType);
   if(actual.isGroup)issues.push("الحساب لا يجوز أن يكون تجميعيًا");
  }
  return {expected,actual,issues,status:issues.length?"mismatch":"ok"};
 });
 const criticalAccountMismatchCount=criticalAccountAuditRows.filter(row=>row.status!=="ok").length;
 const criticalAccountIntegrityPanel=()=>panel("فحص تصنيف الحسابات الرئيسية","هذه الحسابات تؤثر مباشرة في ظهور أرصدة المخزون والضرائب والموردين والعملاء ضمن بنود القوائم. الفحص لا يغيّر دليل الحسابات تلقائيًا؛ بل يحدد الحسابات المفقودة أو ذات التصنيف غير الصحيح.",h("div",{className:"space-y-2"},
  criticalAccountMismatchCount
   ?h("div",{className:"rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"},"يوجد "+criticalAccountMismatchCount+" حسابات رئيسية تحتاج مراجعة قبل اعتماد القوائم المالية.")
   :h("div",{className:"rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"},"تصنيف الحسابات الرئيسية مطابق لطبيعة كل حساب."),
  table(["الكود","الحساب المتوقع","نوع القائمة","الطبيعة","الأستاذ المساعد المطلوب","الحساب الحالي","نتيجة الفحص"],criticalAccountAuditRows.map(row=>h("tr",{key:row.expected.code,className:"border-t"},
   h("td",{className:"p-2 font-bold"},row.expected.code),
   h("td",{className:"p-2"},row.expected.label),
   h("td",{className:"p-2"},row.expected.type),
   h("td",{className:"p-2"},row.expected.nature),
   h("td",{className:"p-2"},row.expected.subledgerType||"—"),
   h("td",{className:"p-2"},row.actual?String(row.actual.type||"—")+" / "+String(row.actual.nature||"—")+" / "+String(row.actual.subledgerType||"—"):"غير موجود"),
   h("td",{className:"p-2"},row.issues.length?h("span",{className:"font-bold text-rose-700"},row.issues.join("؛ ")):h("span",{className:"font-bold text-emerald-700"},"مطابق"))
  )))
 ));

  const balanceSheetContent=()=>h('div',{className:'space-y-3'},
  h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
   metric('إجمالي الأصول',fmt(assets)),
   metric('إجمالي الالتزامات',fmt(liabilities)),
   metric('إجمالي حقوق الملكية',fmt(equity)),
   metric('فرق ميزان المراجعة',fmt(ledgerBalanceDifference))
  ),
  Math.abs(ledgerBalanceDifference)>0.01?h('div',{className:'rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900'},'تحذير: إجمالي المدين لا يساوي إجمالي الدائن في الأستاذ. المدين '+fmt(ledgerBalanceDebit)+'، الدائن '+fmt(ledgerBalanceCredit)+'، والفرق '+fmt(ledgerBalanceDifference)+'. لا تعتمد القوائم قبل معالجة الفرق.'):h('div',{className:'rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900'},'إجمالي ميزان المراجعة متوازن.'),
  unmappedBalanceRows.length?panel('أرصدة غير مرتبطة بدليل الحسابات','هذه الأرصدة موجودة في الأستاذ ولكن كودها غير موجود بدليل الحسابات. يتم إظهارها منفصلة ولا يتم تجاهلها أو ضمها تلقائيًا إلى الأصول أو الالتزامات.',table(['كود الحساب','مدين','دائن','صافي مدين / (دائن)'],unmappedBalanceRows.map(row=>h('tr',{key:row.code,className:'border-t'},h('td',{className:'p-2 font-bold'},row.code),h('td',{className:'p-2 text-end'},fmt(row.debit)),h('td',{className:'p-2 text-end'},fmt(row.credit)),h('td',{className:'p-2 text-end font-bold'},fmt(row.net)))))):null,
  invoicePostingReconciliationPanel(),
  inventoryStatementReconciliationPanel(),
  panel('الأصول','الرصيد التراكمي حتى نهاية الفترة، ويشمل الحسابات التجميعية والحسابات التابعة. اضغط على الحساب لعرض كشف الحساب.',table(['الحساب','مدين','دائن','الرصيد الطبيعي'],balanceAssetRows)),
  panel('الالتزامات','الأرصدة الدائنة والمدينة لكل حساب التزام.',table(['الحساب','مدين','دائن','الرصيد الطبيعي'],balanceLiabilityRows)),
  panel('حقوق الملكية','تظهر نتيجة الأعمال المتراكمة بشكل مستقل ضمن حقوق الملكية.',h('div',{className:'space-y-2'},table(['الحساب','مدين','دائن','الرصيد الطبيعي'],balanceEquityRows),table(['البيان','القيمة'],[['الأرباح المتراكمة منذ بداية الدفاتر',fmt(accumulatedProfit)],['إجمالي حقوق الملكية',fmt(equity)]]))),
  h('div',{className:'rounded-xl border p-4 '+(Math.abs(assets-liabilities-equity)>0.01?'border-rose-300 bg-rose-50':'border-emerald-300 bg-emerald-50')},h('div',{className:'font-bold'},'مطابقة المركز المالي'),h('div',{className:'mt-1 text-sm'},'الأصول '+fmt(assets)+' = الالتزامات '+fmt(liabilities)+' + حقوق الملكية '+fmt(equity)),h('div',{className:'font-extrabold text-lg mt-1'},'فرق التوازن: '+fmt(assets-liabilities-equity)))
 );
  const cashFlowCategoryRows=[
  ['الأنشطة التشغيلية',cashFlowSummary.operatingIn,cashFlowSummary.operatingOut,cashFlowSummary.operatingIn-cashFlowSummary.operatingOut],
  ['الأنشطة الاستثمارية',cashFlowSummary.investingIn,cashFlowSummary.investingOut,cashFlowSummary.investingIn-cashFlowSummary.investingOut],
  ['الأنشطة التمويلية',cashFlowSummary.financingIn,cashFlowSummary.financingOut,cashFlowSummary.financingIn-cashFlowSummary.financingOut],
  ['حركات غير مصنفة — تتطلب مراجعة',cashFlowSummary.unclassifiedIn,cashFlowSummary.unclassifiedOut,cashFlowSummary.unclassified],
  ['الإجمالي',cashFlowSummary.operatingIn+cashFlowSummary.investingIn+cashFlowSummary.financingIn+cashFlowSummary.unclassifiedIn,cashFlowSummary.operatingOut+cashFlowSummary.investingOut+cashFlowSummary.financingOut+cashFlowSummary.unclassifiedOut,cashFlowSummary.netChange]
 ].map((row,index)=>h('tr',{key:index,className:index===4?'font-extrabold bg-slate-50':'border-t'},
  h('td',{className:'p-2'},row[0]),
  h('td',{className:'p-2 text-end'},fmt(row[1])),
  h('td',{className:'p-2 text-end'},fmt(row[2])),
  h('td',{className:'p-2 text-end font-bold'},fmt(row[3]))
 ));
 const cashFlowReconciliationRows=[
  ['الرصيد الافتتاحي في بداية الفترة',cashFlowSummary.openingCash],
  ['صافي التغير خلال الفترة',cashFlowSummary.netChange],
  ['الرصيد الختامي المتوقع',cashFlowSummary.closingCash],
  ['الرصيد الختامي بدفتر الأستاذ',cashAccounts.reduce((sum,row)=>sum+row.amount.debit-row.amount.credit,0)],
  ['حركات غير مصنفة تحتاج مراجعة',cashFlowSummary.unclassified]
 ].map((row,index)=>h('tr',{key:index,className:'border-t'},
  h('td',{className:'p-2'},row[0]),
  h('td',{className:'p-2 text-end font-bold'},fmt(row[1]))
 ));
 const cashMovementRows=flat.filter(line=>cashCodeSet.has(String(line.accountCode))).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map((line,index)=>{
  const account=accounts.find(item=>String(item.code)===String(line.accountCode));
  return h('tr',{key:String(line.journalId)+'-'+index,className:'border-t hover:bg-blue-50'},
   h('td',{className:'p-2'},line.date),
   h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline font-bold',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId)),
   h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline',onClick:()=>openStatementAccount(line.accountCode)},line.accountCode+' — '+(account&&account.name||''))),
   h('td',{className:'p-2'},line.description),
   h('td',{className:'p-2 text-end'},fmt(line.debit)),
   h('td',{className:'p-2 text-end'},fmt(line.credit))
  );
 });
 const cashflowContent=()=>h('div',{className:'space-y-3'},
  panel('ملخص التدفقات النقدية','مبني على الحركات النقدية والبنكية للقيود المرحلة بالفترة. التحويلات بين الخزينة والبنوك مستبعدة لمنع ازدواج احتساب النقدية.',table(['النشاط','تدفقات داخلة','تدفقات خارجة','صافي التدفق'],cashFlowCategoryRows)),
  panel('مطابقة النقدية والبنوك','الرصيد الافتتاحي + صافي الحركة = الرصيد الختامي وفق القيود المرحلة.',table(['البيان','القيمة'],cashFlowReconciliationRows)),
  panel('تفاصيل الحركات النقدية والبنكية','اضغط رقم القيد لعرض القيد بالكامل، ثم اضغط أي حساب داخله لفتح كشفه.',table(['التاريخ','رقم القيد','الحساب','البيان','مدين','دائن'],cashMovementRows))
 );
 const ledgerRows=flat.filter(line=>!search||[line.accountCode,line.description,line.journalId,line.journalNumber,line.reference].join(' ').toLowerCase().includes(search.toLowerCase())).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map((line,index)=>{
  const account=accounts.find(item=>String(item.code)===String(line.accountCode));
  return h('tr',{key:String(line.journalId)+'-'+index,className:'border-t hover:bg-blue-50'},
   h('td',{className:'p-2'},line.date),
   h('td',{className:'p-2'},h('button',{type:'button',className:'font-bold text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId)),
   h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline',onClick:()=>openStatementAccount(line.accountCode)},line.accountCode+' — '+(account&&account.name||''))),
   h('td',{className:'p-2'},line.description),
   h('td',{className:'p-2 text-end'},fmt(line.debit)),
   h('td',{className:'p-2 text-end'},fmt(line.credit)),
   h('td',{className:'p-2'},line.costCenterId||line.projectCode||'—')
  );
 });
 const ledgerContent=()=>h('div',{className:'space-y-2'},
  field('بحث في رقم القيد أو الحساب أو البيان',search,setSearch),
  table(['التاريخ','رقم القيد','الحساب','البيان','مدين','دائن','مركز التكلفة / المشروع'],ledgerRows)
 );
const fullStatementsExportNode=()=>{
  forceExpandAllFinancialPanels=true;
  const node=h('div',{'data-pest-export-scope':'all-statements','data-pest-export-title':'القوائم المالية كاملة','aria-hidden':'true',style:{position:'fixed',left:'-10000px',top:'0',width:'1600px',opacity:0,pointerEvents:'none',zIndex:-1}},
   h('div',{className:'p-3'},h('h2',{className:'text-xl font-extrabold'},'القوائم المالية كاملة'),h('p',{className:'text-xs'},'الفترة: '+period.from+' إلى '+period.to+' — عملة العرض: جنيه مصري')),
   h('section',{'data-pest-export-scope':'panel','data-pest-export-title':'ميزان المراجعة'},h('h3',{className:'font-bold'},'ميزان المراجعة'),trialIntegrityNote,table(['كود','الحساب','افتتاحي مدين','افتتاحي دائن','حركة مدين','حركة دائنة','ختامي مدين','ختامي دائن'],trialBalanceRows),trialBalanceTotals),
   incomeStatementContent(),
   balanceSheetContent(),
   cashflowContent()
  );
  forceExpandAllFinancialPanels=false;
  return node;
};
const renderReports=()=>panel('القوائم والتقارير المالية','تقارير تفصيلية من القيود المرحلة فقط. ميزان المراجعة والمركز المالي تراكميان حتى نهاية الفترة، وقائمة الدخل والتدفقات لحركة الفترة المحددة. اضغط أسماء الحسابات أو أرقام القيود للانتقال إلى التفاصيل.',h('div',{className:'space-y-3'},
  h('div',{className:'rounded-2xl border bg-slate-50 p-3 space-y-2'},
   h('div',{className:'flex flex-wrap justify-between items-center gap-2'},h('p',{className:'text-xs text-slate-500'},'عملة العرض: جنيه مصري · الفترة: '+period.from+' إلى '+period.to+' · بداية الدفاتر: '+(accountingStartMonth||'غير محددة')),button('تصدير جميع القوائم إلى ملف Excel واحد',()=>{const node=document.querySelector('[data-pest-export-scope="all-statements"]');exportSectionContent(node,'excel');},'success',!canExportFinancialReport())),
   h('div',{className:'grid md:grid-cols-4 gap-3'},field('من شهر',period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),field('إلى شهر',period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),select('القائمة المالية',report,v=>setReport(v),[{value:'trial',label:'ميزان المراجعة التفصيلي'},{value:'income',label:'قائمة الدخل التفصيلية'},{value:'balance',label:'قائمة المركز المالي التفصيلية'},{value:'cashflow',label:'قائمة التدفقات النقدية'},{value:'ledger',label:'دفتر الأستاذ العام'}]),button('تحديث البيانات',loadPeriod,'primary'))),
  trialBalanceTotals,
  fullStatementsExportNode(),
  report==='trial'?h('div',{className:'space-y-3'},panel('ميزان المراجعة — حسابات تفصيلية وتجميعية','الافتتاحي + حركة الفترة = الختامي. الأرصدة التجميعية تتضمن الأرصدة التابعة ولا تدخل مرتين في الإجماليات.',table(['كود','الحساب (اضغط لفتح الكشف)','افتتاحي مدين','افتتاحي دائن','حركة مدين','حركة دائن','ختامي مدين','ختامي دائن'],trialBalanceRows))):null,
  report==='income'?incomeStatementContent():null,
  report==='balance'?balanceSheetContent():null,
  report==='cashflow'?cashflowContent():null,
  report==='ledger'?ledgerContent():null,
  button('تصدير ميزان المراجعة CSV',()=>dl('financial-trial-balance.csv',[['Code','Account','Opening Debit','Opening Credit','Period Debit','Period Credit','Closing Debit','Closing Credit'],...balanceTrial.map(x=>[x.account.code,x.account.name,x.opening.debit,x.opening.credit,x.activity.debit,x.activity.credit,x.ending.debit,x.ending.credit])].map(row=>row.map(value=>'"'+String(value==null?'':value).replace(/"/g,'""')+'"').join(',')).join('\n'))),
  accountDetailModal,statementJournalModal
 ));

 const accountAnalysisLabelForParty=(type,partyId)=>{
  const key=String(partyId||'');
  if(type==='customer'){const party=allClients.find(item=>String(item.code||item.id)===key);return party?partyName(party):key;}
  if(type==='vendor'){const party=allVendors.find(item=>String(item.code||item.id)===key);return party?partyName(party):key;}
  if(type==='employeeCustody'||type==='employeeAdvance'){
   const user=(userDirectory||[]).find(item=>String(item.uid||'')===key);
   return user?(user.fullName||user.name||user.username||user.email||key):key;
  }
  if(type==='partnerCurrentAccount'){
   const partner=partnerCurrentAccounts.find(item=>String(item.uid||'')===key);
   if(partner)return partner.partnerName||partner.username||key;
   const user=(userDirectory||[]).find(item=>String(item.uid||'')===key);
   return user?(user.fullName||user.username||user.email||key):key;
  }
  if(type==='financingParty'){
   const vendor=allVendors.find(item=>String(item.code||item.id)===key);
   if(vendor)return partyName(vendor);
   const partner=partnerCurrentAccounts.find(item=>String(item.uid||'')===key);
   if(partner)return partner.partnerName||partner.username||key;
   const user=(userDirectory||[]).find(item=>String(item.uid||'')===key);
   return user?(user.fullName||user.username||user.email||key):key;
  }
  return key;
 };
 const accountAnalysisTypeLabel=type=>({customer:'عميل',vendor:'مورد',employeeCustody:'موظف صاحب عهدة',employeeAdvance:'موظف صاحب سلفة',partnerCurrentAccount:'شريك',financingParty:'جهة تمويل / دائن'}[type]||type||'طرف تحليلي');
 const accountAnalysisSourceLabel=type=>({manual:'قيد يدوي',purchaseInvoice:'فاتورة مشتريات',salesInvoice:'فاتورة مبيعات',cash:'حركة خزينة',bank:'حركة بنكية',bankImport:'استيراد كشف بنك',custody:'حركة عهدة',projectEvent:'حدث مشروع',inventory:'حركة مخزون'}[type]||type||'مصدر غير محدد');
 const accountAnalysisData=accountAnalysisCode?statementAccountByCode.get(String(accountAnalysisCode)):null;
 const accountAnalysisLines=accountAnalysisData?balanceFlat.filter(line=>accountAnalysisData.codes.includes(String(line.accountCode))).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''))||n(a.lineNo)-n(b.lineNo)):[];
 const accountAnalysisClassifyLine=line=>{
  const journal=statementJournalMap.get(String(line.journalId||'')),journalLines=journal&&Array.isArray(journal.lines)?journal.lines:[];
  const counterparts=journalLines.filter((row,index)=>index!==Number(line.lineNo||0)-1&&!accountAnalysisData.codes.includes(String(row.accountCode)));
  const unique=(values,keyOf)=>Array.from(new Map(values.filter(Boolean).map(value=>[keyOf(value),value])).values());
  if(line.partyType&&line.partyId){
   const type=String(line.partyType),id=String(line.partyId);
   return {key:'party|'+type+'|'+id,label:accountAnalysisLabelForParty(type,id),kind:accountAnalysisTypeLabel(type),code:id};
  }
  const counterpartParties=unique(counterparts.filter(row=>row.partyType&&row.partyId),row=>String(row.partyType)+'|'+String(row.partyId));
  if(counterpartParties.length===1){
   const party=counterpartParties[0],type=String(party.partyType),id=String(party.partyId);
   return {key:'party|'+type+'|'+id,label:accountAnalysisLabelForParty(type,id),kind:accountAnalysisTypeLabel(type),code:id};
  }
  if(counterpartParties.length>1)return {key:'multi-party|'+String(line.journalId||line.sourceId||line.reference||'unknown'),label:'القيد يضم أكثر من طرف تحليلي',kind:'أكثر من طرف',code:line.journalNumber||line.journalId||''};
  const directCenter=String(line.costCenterId||'');
  const counterpartCenters=unique(counterparts.filter(row=>row.costCenterId).map(row=>({code:String(row.costCenterId)})),row=>row.code);
  const centerCode=directCenter||(counterpartCenters.length===1?counterpartCenters[0].code:'');
  if(centerCode){const center=centers.find(item=>String(item.code)===centerCode);return {key:'center|'+centerCode,label:center?center.name+' ('+centerCode+')':centerCode,kind:'مركز تكلفة',code:centerCode};}
  if(counterpartCenters.length>1)return {key:'multi-center|'+String(line.journalId||'unknown'),label:'القيد يضم أكثر من مركز تكلفة',kind:'مراكز متعددة',code:line.journalNumber||line.journalId||''};
  const directProject=String(line.projectCode||'');
  const counterpartProjects=unique(counterparts.filter(row=>row.projectCode).map(row=>({code:String(row.projectCode)})),row=>row.code);
  const projectCode=directProject||(counterpartProjects.length===1?counterpartProjects[0].code:'');
  if(projectCode){const project=projects.find(item=>String(item.code||item.id)===projectCode);return {key:'project|'+projectCode,label:project?(project.name||project.code)+' ('+projectCode+')':projectCode,kind:'مشروع',code:projectCode};}
  if(counterpartProjects.length>1)return {key:'multi-project|'+String(line.journalId||'unknown'),label:'القيد يضم أكثر من مشروع',kind:'مشروعات متعددة',code:line.journalNumber||line.journalId||''};
  const counterpartCodes=Array.from(new Set(counterparts.map(row=>String(row.accountCode||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(counterpartCodes.length){
   const names=counterpartCodes.map(code=>{const account=accounts.find(item=>String(item.code)===code);return code+' — '+(account&&account.name||'حساب غير موجود');});
   return {key:'counter|'+counterpartCodes.join('|'),label:names.join(' + '),kind:'الحساب المقابل',code:counterpartCodes.join(', ')};
  }
  const reference=String(line.reference||'').trim();
  if(reference)return {key:'reference|'+reference,label:'مرجع '+reference,kind:'مرجع مستندي',code:reference};
  if(line.sourceId)return {key:'source|'+String(line.sourceType||'')+'|'+String(line.sourceId),label:accountAnalysisSourceLabel(line.sourceType)+' · '+String(line.sourceId),kind:'المصدر',code:String(line.sourceId)};
  if(line.description||line.journalDescription)return {key:'description|'+String(line.description||line.journalDescription),label:String(line.description||line.journalDescription),kind:'البيان',code:''};
  return {key:'unallocated',label:'غير محدد تحليليًا',kind:'بدون تحليل',code:''};
 };
 const accountAnalysisGroups=(()=>{
  const grouped=new Map();
  accountAnalysisLines.forEach(line=>{
   const dimension=accountAnalysisClassifyLine(line);
   if(!grouped.has(dimension.key))grouped.set(dimension.key,{...dimension,debit:0,credit:0,count:0,lastDate:''});
   const group=grouped.get(dimension.key);
   group.debit+=n(line.debit);group.credit+=n(line.credit);group.count++;
   if(String(line.date||'')>group.lastDate)group.lastDate=String(line.date||'');
  });
  return Array.from(grouped.values()).map(group=>({...group,net:group.debit-group.credit})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)||a.label.localeCompare(b.label,'ar'));
 })();
 const accountAnalysisSelectedGroup=accountAnalysisGroups.find(group=>group.key===accountAnalysisGroupKey)||null;
 const accountAnalysisDetailLines=accountAnalysisSelectedGroup?accountAnalysisLines.filter(line=>accountAnalysisClassifyLine(line).key===accountAnalysisGroupKey):[];
 const accountAnalysisTotalNet=accountAnalysisData?accountAnalysisData.ending.debit-accountAnalysisData.ending.credit:0;
 const accountAnalysisDistributedNet=accountAnalysisGroups.reduce((sum,group)=>sum+group.net,0);
 const accountAnalysisBalanceText=value=>Math.abs(value)<0.005?'0.00 ج.م':fmt(Math.abs(value))+(value>=0?' مدين':' دائن')+' ج.م';
 React.useEffect(()=>{
  if(tab==='accountAnalysis'&&accountAnalysisGroupKey&&accountAnalysisDetailLines.length)void loadStatementAttachments(accountAnalysisDetailLines);
 },[tab,accountAnalysisCode,accountAnalysisGroupKey,period.from,period.to]);
 const renderAccountAnalysis=()=>{
  const accountOptions=accounts.map(account=>({value:String(account.code),label:String(account.code)+' — '+account.name+(account.isGroup?' · تجميعي':'' )}));
  const filteredGroups=accountAnalysisGroups.filter(group=>!accountAnalysisSearch||[group.label,group.kind,group.code,group.key].join(' ').toLowerCase().includes(accountAnalysisSearch.toLowerCase()));
  let running=0;
  const detailRows=accountAnalysisDetailLines.map((line,index)=>{
   running+=n(line.debit)-n(line.credit);
   const account=accounts.find(item=>String(item.code)===String(line.accountCode));
   const center=centers.find(item=>String(item.code)===String(line.costCenterId));
   const runningText=accountAnalysisBalanceText(running);
   return h('tr',{key:String(line.journalId)+'-'+String(line.lineNo)+'-'+index,className:'border-t hover:bg-blue-50'},
    h('td',{className:'p-2 whitespace-nowrap'},line.date||'—'),
    h('td',{className:'p-2'},h('button',{type:'button',className:'font-bold text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId||'—')),
    h('td',{className:'p-2'},String(line.accountCode||'')+' — '+(account&&account.name||'حساب غير موجود')),
    h('td',{className:'p-2 min-w-[220px]'},h('div',{className:'flex flex-wrap items-center gap-2'},h('span',null,line.description||line.journalDescription||'—'),statementAttachmentAction(line))),
    h('td',{className:'p-2'},center?center.name:(line.costCenterId||line.projectCode||'—')),
    h('td',{className:'p-2 text-end'},fmt(line.debit)),
    h('td',{className:'p-2 text-end'},fmt(line.credit)),
    h('td',{className:'p-2 text-end font-bold'},runningText)
   );
  });
  const distributionRows=filteredGroups.map(group=>h('tr',{key:group.key,className:'border-t hover:bg-blue-50'},
   h('td',{className:'p-2 min-w-[220px]'},h('button',{type:'button',className:'text-blue-700 underline text-right font-semibold',onClick:()=>setAccountAnalysisGroupKey(group.key)},group.label),h('div',{className:'text-[11px] text-slate-500 mt-1'},group.kind+(group.code?' · '+group.code:''))),
   h('td',{className:'p-2 text-end'},fmt(group.debit)),
   h('td',{className:'p-2 text-end'},fmt(group.credit)),
   h('td',{className:'p-2 text-end font-bold'},accountAnalysisBalanceText(group.net)),
   h('td',{className:'p-2 text-center'},String(group.count))
  ));
  const totalDifference=accountAnalysisDistributedNet-accountAnalysisTotalNet;
  return panel('تحليل الحسابات','اختر أي حساب من دليل الحسابات لعرض رصيده حتى نهاية الشهر المحدد، ثم تحليل مصادر هذا الرصيد. التوزيع يُبنى على القيود المرحلة فقط، وتظهر الحركات غير المرتبطة بطرف أو مركز تكلفة تحت تصنيف واضح.',h('div',{className:'space-y-3'},
   h('div',{className:'grid md:grid-cols-4 gap-3 items-end'},
    selectWithAdd('الحساب المحاسبي',accountAnalysisCode,value=>{setAccountAnalysisCode(value);setAccountAnalysisGroupKey('');setAccountAnalysisSearch('');},[{value:'',label:'اختر الحساب'}].concat(accountOptions),'chartOfAccounts',{type:'asset',nature:'debit',parentCode:'1'},'account-analysis-account'),
    field('من شهر',period.from,value=>setPeriod(old=>Object.assign({},old,{from:value})),'month'),
    field('حتى شهر',period.to,value=>setPeriod(old=>Object.assign({},old,{to:value})),'month'),
    button('تحديث التحليل',loadPeriod,'primary',busy)
   ),
   accountAnalysisData?h('div',{className:'space-y-3'},
    h('div',{className:'rounded-xl border border-slate-200 bg-slate-50 p-3'},
     h('div',{className:'flex flex-wrap justify-between gap-2 items-center'},h('div',null,h('div',{className:'text-xs text-slate-500'},accountAnalysisData.account.code+' — '+accountAnalysisData.account.name),h('div',{className:'text-2xl font-extrabold mt-1'},accountAnalysisBalanceText(accountAnalysisTotalNet))),h('div',{className:'text-xs text-slate-500'},'الرصيد حتى '+period.to+(accountAnalysisData.account.isGroup?' · يشمل الحسابات التابعة':''))),
     h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2 mt-3'},
      metric('إجمالي المدين منذ بداية الدفاتر',fmt(accountAnalysisData.amount.debit)+' ج.م'),
      metric('إجمالي الدائن منذ بداية الدفاتر',fmt(accountAnalysisData.amount.credit)+' ج.م'),
      metric('حركة الفترة — مدين',fmt(accountAnalysisData.activity.debit)+' ج.م'),
      metric('حركة الفترة — دائن',fmt(accountAnalysisData.activity.credit)+' ج.م')
     )
    ),
    accountAnalysisSelectedGroup?h('div',{className:'flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 bg-white'},h('div',null,h('div',{className:'text-xs text-slate-500'},'مسار التحليل'),h('div',{className:'font-bold'},accountAnalysisData.account.code+' — '+accountAnalysisData.account.name+'  ←  '+accountAnalysisSelectedGroup.label)),button('العودة إلى توزيع الحساب',()=>setAccountAnalysisGroupKey(''),'muted')):null,
    !accountAnalysisSelectedGroup?h('div',{className:'space-y-2'},
     h('div',{className:'flex flex-wrap justify-between items-center gap-2'},h('h3',{className:'font-bold'},'توزيع الرصيد حسب الطرف أو مركز التكلفة أو الحساب المقابل'),field('بحث في التوزيع',accountAnalysisSearch,setAccountAnalysisSearch)),
     table(['الطرف / مصدر الرصيد','إجمالي مدين','إجمالي دائن','صافي الرصيد','عدد الحركات'],distributionRows),
     distributionRows.length?null:h('div',{className:'rounded-lg border p-4 text-sm text-slate-500 text-center'},'لا توجد حركات مرحلة لهذا الحساب حتى تاريخ التقرير.'),
     h('div',{className:'grid sm:grid-cols-3 gap-2'},
      metric('رصيد الحساب من الأستاذ',accountAnalysisBalanceText(accountAnalysisTotalNet)),
      metric('إجمالي صافي التوزيع',accountAnalysisBalanceText(accountAnalysisDistributedNet)),
      metric('فرق المطابقة',fmt(Math.abs(totalDifference))+' ج.م'+(Math.abs(totalDifference)<0.01?' · مطابق':' · يحتاج مراجعة'))
     )
    ):h('div',{className:'space-y-2'},
     h('div',{className:'flex flex-wrap justify-between gap-2 items-center'},h('div',null,h('h3',{className:'font-bold'},'حركات '+accountAnalysisSelectedGroup.label),h('p',{className:'text-xs text-slate-500'},'عدد الحركات: '+accountAnalysisDetailLines.length+' · من بداية الدفاتر حتى '+period.to)),button('العودة إلى توزيع الحساب',()=>setAccountAnalysisGroupKey(''),'muted')),
     h('div',{className:'grid grid-cols-2 md:grid-cols-3 gap-2'},metric('إجمالي مدين',fmt(accountAnalysisSelectedGroup.debit)+' ج.م'),metric('إجمالي دائن',fmt(accountAnalysisSelectedGroup.credit)+' ج.م'),metric('الرصيد',accountAnalysisBalanceText(accountAnalysisSelectedGroup.net))),
     table(['التاريخ','رقم القيد (اضغط للتفاصيل)','الحساب','البيان والمرفقات','مركز التكلفة / المشروع','مدين','دائن','الرصيد الجاري'],detailRows),
     detailRows.length?null:h('p',{className:'text-sm text-slate-500 text-center p-4'},'لا توجد حركات لهذا التصنيف.')
    )
   ):h('div',{className:'rounded-xl border p-4 text-sm text-slate-500 text-center'},accountAnalysisCode?'لا توجد حركات أو رصيد لهذا الحساب ضمن القيود المرحلة.':'اختر حسابًا لعرض رصيده وتحليله.'),
   accountDetailModal,statementJournalModal
  ));
 };

 const accountReviewDecisionFor=(accountCode,partyType,partyId)=>{
  const periodKey=String(period.to||'');
  return Object.values(accountReviewDecisions||{}).find(item=>item&&String(item.period||'')===periodKey&&String(item.accountCode||'')===String(accountCode||'')&&String(item.partyType||'')===String(partyType||'')&&String(item.partyId||'')===String(partyId||''))||null;
 };
 const saveAccountReviewMark=async(accountCode,partyType,partyId,decision)=>{
  if(!canFinance('reports','edit')){setError('ليس لديك صلاحية تسجيل قرارات المراجعة الشاملة.');return;}
  setBusy(true);setError('');
  try{
   const result=await api('','POST',{action:'saveAccountReviewDecision',accountCode:String(accountCode||''),period:String(period.to||''),partyType:partyType||'',partyId:partyId||'',status:decision,notes:accountReviewNote||''});
   if(result.item)setAccountReviewDecisions(old=>Object.assign({},old,{[result.item.id]:result.item}));
   setNotice('تم حفظ قرار المراجعة وملاحظاته للفترة '+period.to+'.');
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const accountReviewFindingId=(rule,journalId,lineNo)=>{
  const journalToken=String(journalId||'ACCOUNT').replace(/[^A-Za-z0-9_-]/g,'_').slice(-42);
  return ('F_'+String(rule||'RULE')+'_'+journalToken+'_'+String(lineNo||0)).slice(0,80);
 };
 const buildAccountReviewFindings=()=>{
  const findings=[],seen=new Set();
  const push=(rule,severity,title,reason,action,context)=>{
   const item=context||{},id=accountReviewFindingId(rule,item.journalId||item.accountCode||'GLOBAL',item.lineNo||0);
   if(seen.has(id))return;
   seen.add(id);
   findings.push({
    id,rule,severity,title,reason,action,
    journalId:String(item.journalId||''),journalNumber:String(item.journalNumber||item.journalId||''),
    date:String(item.date||period.to+'-01'),accountCode:String(item.accountCode||''),
    accountName:String(item.accountName||''),lineNo:Number(item.lineNo||0),amount:n(item.amount||0),
    partyType:String(item.partyType||''),partyId:String(item.partyId||''),category:String(item.category||'عام'),similarJournals:Array.isArray(item.similarJournals)?item.similarJournals.slice(0,8):[]
   });
  };
  const journalMap=new Map();
  [...(journalRecords||[]),...(periodJournals||[]),...(balanceJournals||[])].forEach(journal=>{
   if(journal&&journal.status==='posted'&&journal.id)journalMap.set(String(journal.id),journal);
  });
  const fromMonth=String(period.from||''),toMonth=String(period.to||'');
  const allPostedJournals=Array.from(journalMap.values()).filter(journal=>String(journal.date||'').slice(0,7)<=toMonth);
  const journals=allPostedJournals.filter(journal=>{
   const monthKey=String(journal.date||'').slice(0,7);
   return monthKey.length===7&&monthKey>=fromMonth&&monthKey<=toMonth;
  }).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id).localeCompare(String(b.id)));
  const accountMap=new Map(accounts.map(account=>[String(account.code),account]));
  const documentMap=new Map((documents||[]).filter(item=>item&&item.id).map(item=>[String(item.id),item]));
  const vendorIds=new Set((allVendors||[]).map(item=>String(item.code||item.id)));
  const customerIds=new Set((allClients||[]).map(item=>String(item.code||item.id)));
  const taxCodeRows=rows(master.taxCodes);
  const withholdingCodes=new Set(['2120']);
  taxCodeRows.filter(item=>String(item.taxType||'')==='withholding'&&item.accountCode).forEach(item=>withholdingCodes.add(String(item.accountCode)));
  accountMap.forEach((account,code)=>{
   if(/خصم|استقطاع|withholding|deducted at source/i.test(String(account.name||'')))withholdingCodes.add(code);
  });
  const invoiceById=new Map((documents||[]).filter(item=>item&&item.type==='invoice').map(item=>[String(item.id),item]));
   const findSimilarJournals=(sourceJournal,invoice)=>{
    const sourceLines=Array.isArray(sourceJournal&&sourceJournal.lines)?sourceJournal.lines:[],sourceAmount=sourceLines.reduce((sum,line)=>sum+n(line.debit),0),firstParty=sourceLines.find(line=>line.partyId),sourceParty=String(invoice&&invoice.partyId||firstParty&&firstParty.partyId||'');
    const sourceRefs=[sourceJournal&&sourceJournal.reference,sourceJournal&&sourceJournal.invoiceNumber,sourceJournal&&sourceJournal.documentNumber,invoice&&invoice.number,invoice&&invoice.invoiceNumber].map(normalizeMatch).filter(Boolean);
    return allPostedJournals.filter(candidate=>String(candidate.id)!==String(sourceJournal&&sourceJournal.id)).map(candidate=>{
     const candidateLines=Array.isArray(candidate.lines)?candidate.lines:[],candidateAmount=candidateLines.reduce((sum,line)=>sum+n(line.debit),0),candidateRefs=[candidate.reference,candidate.invoiceNumber,candidate.documentNumber,candidate.number].map(normalizeMatch).filter(Boolean),sameReference=sourceRefs.some(ref=>candidateRefs.includes(ref)),sameParty=Boolean(sourceParty&&candidateLines.some(line=>String(line.partyId||'')===sourceParty)),closeAmount=sourceAmount>0&&candidateAmount>0&&Math.abs(sourceAmount-candidateAmount)<=Math.max(1,sourceAmount*0.02);
     if(!sameReference&&!(sameParty&&closeAmount))return null;
     return {id:String(candidate.id),number:String(candidate.number||candidate.journalNumber||candidate.id),date:String(candidate.date||''),description:String(candidate.description||''),reference:String(candidate.reference||candidate.invoiceNumber||candidate.documentNumber||''),amount:candidateAmount,matchReason:sameReference?'مرجع مطابق':'نفس الطرف ومبلغ متقارب'};
    }).filter(Boolean).sort((a,b)=>Number(b.matchReason==='مرجع مطابق')-Number(a.matchReason==='مرجع مطابق')||Math.abs(a.amount-sourceAmount)-Math.abs(b.amount-sourceAmount)).slice(0,8);
   };
   const historicalAmounts=new Map();
  allPostedJournals.filter(journal=>String(journal.date||'').slice(0,7)<fromMonth).forEach(journal=>{
   (journal.lines||[]).forEach(line=>{
    const code=String(line.accountCode||''),amount=Math.max(n(line.debit),n(line.credit));
    if(!code||amount<=0.005)return;
    if(!historicalAmounts.has(code))historicalAmounts.set(code,[]);
    historicalAmounts.get(code).push(amount);
   });
  });
  const median=values=>{
   const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
   return sorted.length?(sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2):0;
  };
  const journalSignatures=new Map();
  journals.forEach(journal=>{
   const lines=Array.isArray(journal.lines)?journal.lines:[];
   const debit=lines.reduce((sum,line)=>sum+n(line.debit),0),credit=lines.reduce((sum,line)=>sum+n(line.credit),0);
   const journalBase={journalId:journal.id,journalNumber:journal.number||journal.id,date:journal.date};
   if(lines.length<2)push('JOURNAL_LINES','high','قيد مرحّل بعدد سطور غير كافٍ','القيد المرحّل يحتوي على أقل من سطرين؛ راجع اكتمال الطرف المدين والدائن وطبيعة العملية.','افتح القيد وتحقق من اكتمال الحسابات والأطراف والمستند المصدر.',journalBase);
   if(Math.abs(debit-credit)>0.01)push('JOURNAL_BALANCE','high','القيد المرحّل غير متوازن','إجمالي المدين '+fmt(debit)+' مقابل إجمالي الدائن '+fmt(credit)+'؛ الفرق '+fmt(debit-credit)+'.','أعد فحص القيم والحسابات والسطور المقابلة. لا تنشئ قيد تسوية قبل معرفة سبب الفرق.',Object.assign({amount:Math.abs(debit-credit)},journalBase));
   const sourceInvoice=journal.sourceType==='invoice'?invoiceById.get(String(journal.sourceId||'')):null;
   if(journal.sourceType==='invoice'&&!sourceInvoice)push('SOURCE_INVOICE_MISSING','high','قيد فاتورة دون فاتورة مصدر متاحة','القيد مسجل على أنه ناتج من فاتورة، لكن لم يتم العثور على مستند الفاتورة المرتبط به.','راجع رابط المستند المصدر وسجل الفاتورة قبل إقفال الفترة.',journalBase);
   if(sourceInvoice&&sourceInvoice.status!=='posted')push('SOURCE_INVOICE_STATUS','high','قيد مرحّل وفاتورته المصدر ليست مرحّلة','حالة الفاتورة المرتبطة '+String(sourceInvoice.status||'غير محددة')+' رغم وجود قيد مرحّل.','راجع تسلسل اعتماد الفاتورة والقيد وتأكد من عدم وجود ترحيل يتيم، وقارن القيود المشابهة قبل اتخاذ قرار الإلغاء أو التصحيح.',Object.assign({similarJournals:findSimilarJournals(journal,sourceInvoice),category:'تعارض مستند مصدر'},journalBase));
   const partyControlLines=lines.filter(line=>{
    const code=String(line.accountCode||''),account=accountMap.get(code);
    return ['vendor','customer'].includes(String(account&&account.subledgerType||''))||code==='281'||code==='1210';
   });
   const controlParties=Array.from(new Map(partyControlLines.filter(line=>line.partyId).map(line=>{
    const account=accountMap.get(String(line.accountCode||'')),code=String(line.accountCode||'');
    const inferredType=String(line.partyType||account&&account.subledgerType||(code==='281'?'vendor':code==='1210'?'customer':''));
    return [inferredType+'|'+String(line.partyId),{type:inferredType,id:String(line.partyId)}];
   })).values());
   const expectedParty=sourceInvoice&&sourceInvoice.partyId?{
    type:sourceInvoice.invoiceType==='purchase'?'vendor':sourceInvoice.invoiceType==='sales'?'customer':'',
    id:String(sourceInvoice.partyId)
   }:controlParties.length===1?controlParties[0]:null;
   if(sourceInvoice&&expectedParty&&expectedParty.type){
    const expectedControl=partyControlLines.filter(line=>{
     const account=accountMap.get(String(line.accountCode||''));
     return analyticTypeForAccount(account,line)===expectedParty.type;
    });
    if(!expectedControl.some(line=>String(line.partyId||'')===expectedParty.id)){
     push('INVOICE_PARTY_MISMATCH','high','الطرف التحليلي لا يطابق طرف الفاتورة','الفاتورة '+String(sourceInvoice.number||sourceInvoice.id)+' تخص '+(expectedParty.type==='vendor'?'المورد':'العميل')+' '+expectedParty.id+'، لكن سطر حساب الطرف في القيد لا يحمل نفس الكود التحليلي.','افتح القيد وتأكد من أن المورد/العميل في الأستاذ المساعد هو نفس الطرف في الفاتورة.',Object.assign({accountCode:expectedParty.type==='vendor'?'281':'1210',amount:n(sourceInvoice.totals&&sourceInvoice.totals.total||sourceInvoice.total||0)},journalBase));
    }
    const vatAmount=n(sourceInvoice.totals&&sourceInvoice.totals.vat!==undefined?sourceInvoice.totals.vat:sourceInvoice.taxAmount||0);
    const vatCode=expectedParty.type==='vendor'?'1410':'2110',vatSide=expectedParty.type==='vendor'?'debit':'credit';
    if(vatAmount>0.01&&!lines.some(line=>String(line.accountCode)===vatCode&&n(line[vatSide])>0.005)){
     push('INVOICE_VAT_ACCOUNT','medium','ضريبة الفاتورة غير ظاهرة في حساب الضريبة المتوقع','الفاتورة تحتوي على ضريبة قيمة مضافة بقيمة '+fmt(vatAmount)+'، لكن القيد لا يحتوي على حركة بالاتجاه المتوقع على حساب '+vatCode+'.','راجع كود الضريبة وحساب الضريبة وطبيعة الفاتورة ثم طابق القيد مع المستند.',Object.assign({accountCode:vatCode,amount:vatAmount},journalBase));
    }
    const wrongVatCode=expectedParty.type==='vendor'?'2110':'1410';
    if(lines.some(line=>String(line.accountCode)===wrongVatCode&&Math.max(n(line.debit),n(line.credit))>0.005)){
     push('VAT_ACCOUNT_DIRECTION','high','حساب ضريبة القيمة المضافة لا يتفق مع نوع الفاتورة','الفاتورة '+(expectedParty.type==='vendor'?'مشتريات':'مبيعات')+' لكن القيد يستخدم حساب ضريبة '+wrongVatCode+' المرتبط بالنوع الآخر.','راجع تصنيف الفاتورة وكود الضريبة وحساب المدخلات/المخرجات قبل اعتماد القيد.',Object.assign({accountCode:wrongVatCode},journalBase));
    }
    if(expectedParty.type==='vendor'){
     const stockLines=(sourceInvoice.lines||[]).filter(line=>line&&line.kind==='stock');
     const expectedStock=stockLines.reduce((sum,line)=>sum+Math.max(0,n(line.quantity)*n(line.unitPrice)-n(line.discount)),0);
     if(expectedStock>0.01&&!lines.some(line=>String(line.accountCode)==='1300'&&n(line.debit)>0.005)){
      push('INVOICE_STOCK_ACCOUNT','medium','أصناف مخزنية دون حركة مقابلة على المخزون','الفاتورة تحتوي على أصناف مخزنية بقيمة تقريبية '+fmt(expectedStock)+' لكن القيد لا يظهر مدينًا على حساب المخزون 1300.','راجع طبيعة بنود الفاتورة وحساب الصنف وحركة المخزون المرتبطة.',Object.assign({accountCode:'1300',amount:expectedStock},journalBase));
     }
    }
   }
   lines.forEach((line,index)=>{
    const lineNo=index+1,code=String(line.accountCode||''),account=accountMap.get(code),amount=Math.max(n(line.debit),n(line.credit));
    const ctx=Object.assign({accountCode:code,accountName:account&&account.name||'',lineNo,amount,partyType:line.partyType,partyId:line.partyId},journalBase);
    if(!account)push('ACCOUNT_NOT_FOUND','high','قيد يستخدم حسابًا غير موجود بدليل الحسابات','السطر '+lineNo+' يستخدم الكود '+(code||'بدون كود')+' غير الموجود بدليل الحسابات.','حدد الحساب الصحيح ثم راجع أثره على الأستاذ والقوائم.',ctx);
    else if(account.isGroup)push('POSTING_TO_GROUP','high','ترحيل مباشر على حساب تجميعي','السطر '+lineNo+' مرحّل على الحساب التجميعي '+code+' — '+account.name+'.','انقل الحركة إلى حساب تفصيلي قابل للترحيل، بعد مراجعة طبيعة العملية.',ctx);
    else if(account.active===false)push('INACTIVE_ACCOUNT','medium','استخدام حساب غير نشط','السطر '+lineNo+' يستخدم الحساب غير النشط '+code+' — '+account.name+'.','تحقق من سبب إيقاف الحساب ومن صحة استخدامه في هذه المعاملة.',ctx);
    const debit=n(line.debit),credit=n(line.credit);
    if(debit<0||credit<0||(debit>0.005&&credit>0.005)||(debit<=0.005&&credit<=0.005)){
     push('LINE_AMOUNT_LOGIC','high','قيمة السطر أو اتجاهه غير منطقي','السطر '+lineNo+' يجب أن يحمل قيمة موجبة في جانب واحد فقط؛ المدين '+fmt(debit)+' والدائن '+fmt(credit)+'.','راجع الإشارة والجانب المدين/الدائن، وتأكد من عدم تكرار القيمة في الجانبين.',ctx);
    }
    if(account&&account.subledgerType){
     const expectedType=String(account.subledgerType);
     if(!line.partyId)push('ANALYTIC_PARTY_MISSING','high','حساب رقابي بلا طرف تحليلي','الحساب '+code+' — '+account.name+' يتطلب طرفًا من نوع '+expectedType+' لكن السطر '+lineNo+' لا يحمل كود طرف.','حدد المورد/العميل/الموظف/الشريك الصحيح ثم طابق كشف الأستاذ المساعد مع الأستاذ العام.',ctx);
     else if(String(line.partyType||'')!==expectedType)push('ANALYTIC_TYPE_MISMATCH','high','نوع التحليل لا يطابق طبيعة الحساب','الحساب '+code+' يتطلب تحليل '+expectedType+' بينما القيد يحمل '+String(line.partyType||'بدون نوع تحليل')+'.','صحح نوع الطرف التحليلي إلى النوع المحدد في دليل الحسابات، وتحقق من كود الطرف.',ctx);
     else if(expectedType==='vendor'&&!vendorIds.has(String(line.partyId)))push('ANALYTIC_VENDOR_UNKNOWN','medium','كود المورد غير موجود في سجل الموردين','السطر '+lineNo+' يحمل كود المورد '+String(line.partyId)+' غير الموجود في بيانات الموردين الحالية.','راجع الكود التحليلي أو استكمل بيانات المورد قبل الإقفال.',ctx);
     else if(expectedType==='customer'&&!customerIds.has(String(line.partyId)))push('ANALYTIC_CUSTOMER_UNKNOWN','medium','كود العميل غير موجود في سجل العملاء','السطر '+lineNo+' يحمل كود العميل '+String(line.partyId)+' غير الموجود في بيانات العملاء الحالية.','راجع الكود التحليلي أو استكمل بيانات العميل قبل الإقفال.',ctx);
    }
    if(['vendor','customer'].includes(String(line.partyType||''))&&line.partyId){
     const known=line.partyType==='vendor'?vendorIds.has(String(line.partyId)):customerIds.has(String(line.partyId));
     if(!known)push('ORPHAN_ANALYTIC_PARTY','medium','حركة تحليلية مرتبطة بطرف غير موجود','السطر '+lineNo+' يحمل '+(line.partyType==='vendor'?'موردًا':'عميلًا')+' بالكود '+String(line.partyId)+' غير موجود في سجل الأطراف.','تحقق من كود الطرف وسجل الموردين/العملاء قبل اعتماد المطابقة.',ctx);
    }
    const previousAmounts=historicalAmounts.get(code)||[];
    if(account&&previousAmounts.length>=6&&amount>=100000&&amount>=median(previousAmounts)*10){
     push('UNUSUAL_ACCOUNT_AMOUNT','low','قيمة استثنائية مقارنة بالحركة السابقة','قيمة السطر '+fmt(amount)+' تزيد على عشرة أمثال الوسيط التاريخي للحساب '+code+' خلال الحركات السابقة المتاحة. قد تكون معاملة كبيرة صحيحة لكنها تحتاج مستندًا مؤيدًا.','قارن القيمة بالعقد/الفاتورة/أمر الشراء وبالحدود المعتمدة قبل إغلاق الفترة.',Object.assign({},ctx,{category:'تحليل القيم'}));
    }
   });
   const withholdingLines=lines.filter(line=>withholdingCodes.has(String(line.accountCode||'')));
   withholdingLines.forEach(line=>{
    const lineNo=lines.indexOf(line)+1,code=String(line.accountCode||''),account=accountMap.get(code);
    const ctx=Object.assign({accountCode:code,accountName:account&&account.name||'',lineNo,amount:Math.max(n(line.debit),n(line.credit)),partyType:line.partyType,partyId:line.partyId,category:'ضرائب وخصم'},journalBase);
    if(!line.partyId||!['vendor','customer'].includes(String(line.partyType||''))){
     push('WITHHOLDING_ANALYTIC_MISSING','high','ضريبة الخصم/الاستقطاع بلا تحليل للطرف','قيد الخصم/الاستقطاع على الحساب '+code+' لا يحمل كود المورد أو العميل الذي نشأت عنه الضريبة.','اربط سطر الخصم/الاستقطاع بنفس المورد أو العميل صاحب الفاتورة أو الحركة، ثم راجع كشف الطرفين.',ctx);
    }else if(expectedParty&&(String(line.partyType)!==expectedParty.type||String(line.partyId)!==expectedParty.id)){
     push('WITHHOLDING_PARTY_MISMATCH','high','تحليل ضريبة الخصم مختلف عن تحليل المورد/العميل','سطر الخصم/الاستقطاع يحمل '+line.partyType+' / '+line.partyId+' بينما الطرف المقابل في القيد أو الفاتورة هو '+expectedParty.type+' / '+expectedParty.id+'.','وحّد كود الطرف التحليلي لسطر الضريبة مع المورد/العميل الصحيح. افحص احتمال تسجيل الضريبة على طرف آخر بالخطأ.',ctx);
    }else if(!expectedParty){
     push('WITHHOLDING_COUNTERPART_UNCLEAR','medium','تعذر تحديد الطرف المقابل لضريبة الخصم','يوجد سطر خصم/استقطاع لكن لم يمكن تحديد مورد أو عميل واحد بوضوح داخل القيد لمقارنة التحليل.','راجع المستند المرجعي وحدد الطرف صاحب الخصم قبل إقفال الحساب.',ctx);
    }
   });
   if(sourceInvoice&&sourceInvoice.invoiceType==='purchase'&&withholdingLines.length){
    const total=n(sourceInvoice.totals&&sourceInvoice.totals.total!==undefined?sourceInvoice.totals.total:sourceInvoice.total||0);
    const payableAmount=partyControlLines.filter(line=>String(line.partyId||'')===String(sourceInvoice.partyId||'')).reduce((sum,line)=>sum+n(line.credit),0);
    const withholdingAmount=withholdingLines.reduce((sum,line)=>sum+n(line.credit)+n(line.debit),0);
    if(total>0.01&&payableAmount>0.01&&Math.abs(total-payableAmount-withholdingAmount)>1){
     push('WITHHOLDING_AMOUNT_RECON','medium','قيمة الفاتورة لا تتطابق مع صافي المورد والخصم','إجمالي الفاتورة '+fmt(total)+' مقابل صافي حساب المورد '+fmt(payableAmount)+' والخصم/الاستقطاع '+fmt(withholdingAmount)+'؛ الفرق '+fmt(total-payableAmount-withholdingAmount)+'.','طابق إجمالي الفاتورة مع صافي المورد والخصم والضريبة، وتحقق من عدم تكرار أو إسقاط مبلغ.',Object.assign({accountCode:'2120',amount:Math.abs(total-payableAmount-withholdingAmount),category:'ضرائب وخصم'},journalBase));
    }
   }
   const reference=normalizeMatch(journal.reference||journal.invoiceNumber||journal.documentNumber||'');
   if(reference){
    const signature=[String(journal.date||''),reference,lines.map(line=>[String(line.accountCode||''),n(line.debit).toFixed(2),n(line.credit).toFixed(2),String(line.partyType||''),String(line.partyId||'')].join(':')).sort().join('|')].join('~');
    if(!journalSignatures.has(signature))journalSignatures.set(signature,[]);
    journalSignatures.get(signature).push(journal);
   }
  });
  journalSignatures.forEach(group=>{
   if(group.length<2)return;
   group.slice(1).forEach(journal=>push('POSSIBLE_DUPLICATE','medium','قيد مكرر محتمل بنفس التاريخ والمرجع والقيم','تم العثور على '+group.length+' قيود لها نفس التاريخ والمرجع وتركيبة الحسابات والقيم. قد يكون تكرارًا غير مقصود أو قيدًا صحيحًا مكررًا بمستند تجميعي.','قارن المستندات والمرفقات وأرقام الفواتير قبل الإبقاء على القيد أو طلب عكسه.',{journalId:journal.id,journalNumber:journal.number||journal.id,date:journal.date,category:'تكرار'}));
  });
  const controlAccounts=accounts.filter(account=>account.subledgerType&&!account.isGroup);
  controlAccounts.forEach(account=>{
   const code=String(account.code),gl=balanceBalances[code]||{debit:0,credit:0};
   const analytic=balanceFlat.filter(line=>String(line.accountCode)===code&&String(line.partyType||'')===String(account.subledgerType)&&String(line.partyId||''));
   const subDebit=analytic.reduce((sum,line)=>sum+n(line.debit),0),subCredit=analytic.reduce((sum,line)=>sum+n(line.credit),0);
   const diffDebit=n(gl.debit)-subDebit,diffCredit=n(gl.credit)-subCredit;
   if(Math.abs(diffDebit)>0.01||Math.abs(diffCredit)>0.01){
    push('CONTROL_SUBLEDGER_MISMATCH','high','الأستاذ العام لا يطابق مجموع الأستاذ المساعد','الحساب '+code+' — '+account.name+'؛ فرق المدين '+fmt(diffDebit)+' وفرق الدائن '+fmt(diffCredit)+'. قد يكون هناك قيد بلا طرف تحليلي أو بنوع تحليل خاطئ.','افتح كشف الحساب وقارن القيود ذات الأكواد التحليلية الخاطئة أو الناقصة قبل إقفال رصيد الموردين/العملاء.',{accountCode:code,accountName:account.name,amount:Math.abs(diffDebit)+Math.abs(diffCredit),date:period.to+'-01',category:'مطابقة الأستاذ المساعد'});
   }
  });
  const debitTotal=balanceFlat.reduce((sum,line)=>sum+n(line.debit),0),creditTotal=balanceFlat.reduce((sum,line)=>sum+n(line.credit),0);
  if(Math.abs(debitTotal-creditTotal)>0.01){
   push('TRIAL_BALANCE_UNBALANCED','high','ميزان المراجعة التراكمي غير متوازن','إجمالي المدين '+fmt(debitTotal)+' مقابل إجمالي الدائن '+fmt(creditTotal)+'؛ الفرق '+fmt(debitTotal-creditTotal)+'.','ابدأ بفحص القيود ذات فروق المدين والدائن والحسابات غير الموجودة بدليل الحسابات.',{amount:Math.abs(debitTotal-creditTotal),date:period.to+'-01',category:'سلامة الأستاذ'});
  }
  accounts.filter(account=>!account.isGroup).forEach(account=>{
   const totals=balanceBalances[String(account.code)]||{debit:0,credit:0};
   const normalNet=['asset','expense'].includes(String(account.type||''))?n(totals.debit)-n(totals.credit):n(totals.credit)-n(totals.debit);
   if(normalNet<-0.01){
    push('OPPOSITE_NATURE_BALANCE','low','رصيد الحساب بعكس طبيعته المعتادة','الحساب '+account.code+' — '+account.name+' يظهر رصيدًا عكسيًا بقيمة '+fmt(Math.abs(normalNet))+'. قد يكون رصيدًا مقدمًا أو تسوية صحيحة، لكنه يستحق الفحص.','راجع كشف الحساب والمستندات؛ لا تعتبر الرصيد العكسي خطأً تلقائيًا قبل استبعاد الدفعات المقدمة والتسويات والعكوس.',{accountCode:account.code,accountName:account.name,amount:Math.abs(normalNet),date:period.to+'-01',category:'طبيعة الرصيد'});
   }
  });
  const severityRank={high:0,medium:1,low:2};
  return findings.sort((a,b)=>(severityRank[a.severity]??3)-(severityRank[b.severity]??3)||String(a.date).localeCompare(String(b.date))||String(a.journalNumber).localeCompare(String(b.journalNumber)));
 };
 const saveAccountReviewFindingDecision=async(finding,nextStatus)=>{
  if(!finding||!canFinance('reports','edit')){setError('ليس لديك صلاحية تسجيل قرارات المراجع الذكي.');return;}
  setBusy(true);setError('');
  try{
   const result=await api('','POST',{action:'saveAccountReviewFindingDecision',findingId:finding.id,period:String(period.to||''),journalId:finding.journalId||'',accountCode:finding.accountCode||'',status:nextStatus,notes:accountReviewFindingNote||''});
   if(result.item)setAccountReviewFindingDecisions(old=>Object.assign({},old,{[result.item.findingId]:result.item}));
   setNotice('تم حفظ قرار المراجع للملاحظة: '+finding.title+'.');
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const renderAccountReview=()=>{
  const rowsForAccounts=accounts.map(account=>{
   const codes=accounts.filter(item=>accountIsInBranch(item,account.code)).map(item=>String(item.code));
   const codeSet=new Set(codes),lines=balanceFlat.filter(line=>codeSet.has(String(line.accountCode)));
   const debit=lines.reduce((sum,line)=>sum+n(line.debit),0),credit=lines.reduce((sum,line)=>sum+n(line.credit),0);
   const balance=account.nature==='credit'?credit-debit:debit-credit;
   return {account,codes,lines,debit,credit,balance,decision:accountReviewDecisionFor(account.code,'','')};
  });
  const visibleRows=rowsForAccounts.filter(row=>{
   const query=normalizeMatch(accountReviewSearch);
   const textMatch=!query||normalizeMatch(String(row.account.code)+' '+String(row.account.name)).includes(query);
   const balanceMatch=accountReviewFilter==='all'||(accountReviewFilter==='nonzero'&&Math.abs(row.balance)>0.005)||(accountReviewFilter==='matched'&&row.decision&&row.decision.status==='matched')||(accountReviewFilter==='follow_up'&&row.decision&&row.decision.status!=='matched');
   return textMatch&&balanceMatch;
  });
  const selected=rowsForAccounts.find(row=>String(row.account.code)===String(accountReviewSelectedCode||''))||null;
  const smartFindings=buildAccountReviewFindings().map(finding=>Object.assign({},finding,{decision:accountReviewFindingDecisions[finding.id]||null,status:accountReviewFindingDecisions[finding.id]&&accountReviewFindingDecisions[finding.id].status||'open'}));
  const openFindings=smartFindings.filter(finding=>!['resolved','accepted_risk'].includes(finding.status));
  const highFindings=openFindings.filter(finding=>finding.severity==='high'),mediumFindings=openFindings.filter(finding=>finding.severity==='medium'),lowFindings=openFindings.filter(finding=>finding.severity==='low');
  const visibleFindings=smartFindings.filter(finding=>accountReviewFindingFilter==='all'||(accountReviewFindingFilter==='open'&&!['resolved','accepted_risk'].includes(finding.status))||(accountReviewFindingFilter==='high'&&finding.severity==='high'&&!['resolved','accepted_risk'].includes(finding.status))||(accountReviewFindingFilter==='medium'&&finding.severity==='medium'&&!['resolved','accepted_risk'].includes(finding.status))||(accountReviewFindingFilter==='follow_up'&&finding.status==='follow_up')||(accountReviewFindingFilter==='resolved'&&['resolved','accepted_risk'].includes(finding.status)));
  const selectedFinding=smartFindings.find(finding=>finding.id===accountReviewSelectedFinding)||null;
  const findingStatusLabel=value=>({open:'مفتوحة',follow_up:'قيد المتابعة',resolved:'تمت المعالجة',accepted_risk:'مقبولة مع توثيق'}[value]||'مفتوحة');
  const findingSeverityLabel=value=>({high:'عالية',medium:'متوسطة',low:'تنبيه'}[value]||'تنبيه');
  const findingRows=visibleFindings.map(finding=>h('tr',{key:finding.id,className:'border-t align-top cursor-pointer hover:bg-blue-50',onClick:()=>{setAccountReviewSelectedFinding(finding.id);setAccountReviewFindingNote(finding.decision&&finding.decision.notes||'');}},
   h('td',{className:'p-2 whitespace-nowrap'},h('span',{className:'font-bold '+(finding.severity==='high'?'text-rose-700':finding.severity==='medium'?'text-amber-700':'text-slate-600')},findingSeverityLabel(finding.severity))),
   h('td',{className:'p-2 whitespace-nowrap'},finding.date),
   h('td',{className:'p-2'},finding.title),
   h('td',{className:'p-2 whitespace-nowrap'},finding.journalId?h('button',{type:'button',className:'text-blue-700 underline font-bold',onClick:()=>openStatementJournal(finding.journalId)},finding.journalNumber):'—'),
   h('td',{className:'p-2'},finding.accountCode?(finding.accountCode+' — '+finding.accountName):'—'),
   h('td',{className:'p-2 min-w-[260px] text-xs'},finding.reason),
   h('td',{className:'p-2 min-w-[260px] text-xs'},finding.action),
   h('td',{className:'p-2 whitespace-nowrap'},findingStatusLabel(finding.status)),
   h('td',{className:'p-2'},button('تفاصيل / قرار',()=>{setAccountReviewSelectedFinding(finding.id);setAccountReviewFindingNote(finding.decision&&finding.decision.notes||'');},'muted'))
  ));
  const decisionLabel=value=>({matched:'تمت المطابقة',follow_up:'يحتاج متابعة',requires_adjustment:'تسوية / قيد تصحيح مطلوب'}[value]||'لم تتم المراجعة');
  const decisionTone=value=>value==='matched'?'text-emerald-700':value==='follow_up'||value==='requires_adjustment'?'text-amber-700':'text-slate-500';
  const displayParty=party=>String(party&&(party.name||party.companyName||party.partyName||party.code||party.id)||'طرف بدون اسم');
  const accountRows=visibleRows.map(row=>h('tr',{key:row.account.code,className:'border-t hover:bg-blue-50'},
   h('td',{className:'p-2 font-bold'},h('button',{type:'button',className:'text-blue-700 underline text-start',onClick:()=>{
    setAccountReviewSelectedCode(String(row.account.code));setAccountReviewSelectedParty('');setAccountReviewSelectedPartyType('');
    setAccountReviewNote(row.decision&&row.decision.notes||'');
   }},String(row.account.code)+' — '+row.account.name)),
   h('td',{className:'p-2'},row.account.type||'—'),
   h('td',{className:'p-2 text-end'},fmt(row.debit)),
   h('td',{className:'p-2 text-end'},fmt(row.credit)),
   h('td',{className:'p-2 text-end font-bold'},accountAnalysisBalanceText(row.balance)),
   h('td',{className:'p-2'},h('span',{className:'font-bold '+decisionTone(row.decision&&row.decision.status)},decisionLabel(row.decision&&row.decision.status)))
  ));
  const accountType=selected&&selected.account.subledgerType;
  const matchingPartyTypes=selected?Array.from(new Set(accounts.filter(item=>selected.codes.includes(String(item.code))&&['vendor','customer'].includes(String(item.subledgerType||''))).map(item=>String(item.subledgerType)))):[];
  const partyType=matchingPartyTypes.includes(accountType)?accountType:accountReviewSelectedPartyType&&matchingPartyTypes.includes(accountReviewSelectedPartyType)?accountReviewSelectedPartyType:matchingPartyTypes[0]||'';
  const partyAccounts=selected&&partyType?accounts.filter(item=>selected.codes.includes(String(item.code))&&item.subledgerType===partyType):[];
  const partyCodes=new Set(partyAccounts.map(item=>String(item.code)));
  const parties=partyType==='vendor'?allVendors:partyType==='customer'?allClients:[];
  const journalById=new Map();
  documents.filter(item=>item&&item.type==='journal').forEach(item=>journalById.set(String(item.id),item));
  journalRecords.forEach(item=>journalById.set(String(item.id),item));
  const partySummary=parties.map(party=>{
   const partyId=String(party.code||party.id||'');
   const lines=balanceFlat.filter(line=>partyCodes.has(String(line.accountCode))&&String(line.partyType||'')===partyType&&String(line.partyId||'')===partyId);
   const net=lines.reduce((sum,line)=>{
    const account=accounts.find(item=>String(item.code)===String(line.accountCode))||{};
    const normal=account.nature==='credit'?n(line.credit)-n(line.debit):n(line.debit)-n(line.credit);
    const expectedType=partyType==='vendor'?'liability':'asset';
    return sum+normal*(account.type===expectedType?1:-1);
   },0);
   const invoices=documents.filter(item=>item&&item.type==='invoice'&&item.status==='posted'&&String(item.invoiceType||'')===(partyType==='vendor'?'purchase':'sales')&&String(item.partyId||'')===partyId);
   return {party,partyId,lines,net,invoices,decision:accountReviewDecisionFor(selected.account.code,partyType,partyId)};
  }).filter(row=>Math.abs(row.net)>0.005||row.invoices.length||row.lines.length);
  const chosenParty=partySummary.find(row=>row.partyId===String(accountReviewSelectedParty||''))||null;
  const partyLines=chosenParty?chosenParty.lines.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''))||n(a.lineNo)-n(b.lineNo)):[];
  const invoiceNumberKey=invoice=>normalizeMatch(invoice.number||invoice.invoiceNumber||invoice.documentNumber||'');
  const lineMatchesInvoice=(line,invoice)=>{
   const header=journalById.get(String(line.journalId||''))||{};
   const refs=[line.reference,header.reference,header.invoiceNumber,header.documentNumber,header.number].map(normalizeMatch).filter(Boolean);
   const targets=[invoiceNumberKey(invoice),normalizeMatch(invoice.id||'')].filter(Boolean);
   return targets.some(target=>refs.includes(target));
  };
  const invoiceDetailRows=chosenParty?chosenParty.invoices.map(invoice=>{
   const total=n(invoice.totals&&invoice.totals.total!==undefined?invoice.totals.total:invoice.total||invoice.amount||0);
   const linkedPayments=partyLines.filter(line=>line.sourceType!=='invoice'&&lineMatchesInvoice(line,invoice));
   const paid=linkedPayments.reduce((sum,line)=>sum+Math.max(0,partyType==='vendor'?n(line.debit)-n(line.credit):n(line.credit)-n(line.debit)),0);
   const journalId=invoice.journalId||invoice.accountingJournalId||'';
   return h('tr',{key:invoice.id,className:'border-t'},
    h('td',{className:'p-2'},invoice.date||'—'),
    h('td',{className:'p-2 font-bold'},journalId?h('button',{type:'button',className:'text-blue-700 underline',onClick:()=>openStatementJournal(journalId)},invoice.number||invoice.id):String(invoice.number||invoice.id)),
    h('td',{className:'p-2 text-end'},fmt(total)),
    h('td',{className:'p-2 text-end'},fmt(paid)),
    h('td',{className:'p-2 text-end font-bold'},linkedPayments.length?fmt(Math.max(0,total-paid)):'غير محدد — يحتاج تخصيص'),
    h('td',{className:'p-2'},linkedPayments.length?'يوجد سداد/تسوية بمرجع مطابق':'لم يتم ربط سداد مباشر برقم الفاتورة')
   );
  }):[];
  const unmatchedPayments=chosenParty?partyLines.filter(line=>{
   if(line.sourceType==='invoice')return false;
   const amount=partyType==='vendor'?n(line.debit)-n(line.credit):n(line.credit)-n(line.debit);
   return amount>0.005&&!chosenParty.invoices.some(invoice=>lineMatchesInvoice(line,invoice));
  }):[];
  const movementRows=partyLines.map((line,index)=>{
   const header=journalById.get(String(line.journalId||''))||{};
   const account=accounts.find(item=>String(item.code)===String(line.accountCode))||{};
   return h('tr',{key:String(line.journalId)+'-'+String(line.lineNo)+'-'+index,className:'border-t'},
    h('td',{className:'p-2'},line.date||'—'),
    h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||header.number||line.journalId||'—')),
    h('td',{className:'p-2'},String(line.accountCode||'')+' — '+(account.name||'')),
    h('td',{className:'p-2'},line.description||line.journalDescription||'—'),
    h('td',{className:'p-2'},line.reference||header.reference||header.invoiceNumber||'—'),
    h('td',{className:'p-2 text-end'},fmt(line.debit)),
    h('td',{className:'p-2 text-end'},fmt(line.credit))
   );
  });
  const unmatchedRows=unmatchedPayments.map((line,index)=>{
   const header=journalById.get(String(line.journalId||''))||{};
   return h('tr',{key:String(line.journalId)+'-u-'+index,className:'border-t'},
    h('td',{className:'p-2'},line.date||'—'),
    h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||header.number||line.journalId||'—')),
    h('td',{className:'p-2'},line.reference||header.reference||'بدون مرجع فاتورة'),
    h('td',{className:'p-2 text-end font-bold'},fmt(Math.max(0,partyType==='vendor'?n(line.debit)-n(line.credit):n(line.credit)-n(line.debit)))),
    h('td',{className:'p-2 text-amber-700'},'دفعة غير مخصصة — تحقق من الطرف ورقم الفاتورة')
   );
  });
  const detailLines=selected?selected.lines.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''))||n(a.lineNo)-n(b.lineNo)):[];
  const generalRows=detailLines.map((line,index)=>{
   const account=accounts.find(item=>String(item.code)===String(line.accountCode))||{};
   return h('tr',{key:String(line.journalId)+'-'+String(line.lineNo)+'-'+index,className:'border-t'},
    h('td',{className:'p-2'},line.date||'—'),
    h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline',onClick:()=>openStatementJournal(line.journalId)},line.journalNumber||line.journalId||'—')),
    h('td',{className:'p-2'},String(line.accountCode||'')+' — '+(account.name||'')),
    h('td',{className:'p-2'},line.description||line.journalDescription||'—'),
    h('td',{className:'p-2 text-end'},fmt(line.debit)),
    h('td',{className:'p-2 text-end'},fmt(line.credit))
   );
  });
  return panel('تحليل الحسابات والأطراف ومطابقة الأرصدة','مراجعة إقفال حتى نهاية '+period.to+'، مبنية على الأستاذ العام والقيود المرحلة والفواتير المرحلة. الفواتير تُربط آليًا بالسداد عند تطابق رقم الفاتورة في مرجع القيد فقط؛ الحركات غير المرتبطة تظهر كدفعات غير مخصصة ولا تُعتبر سدادًا مؤكدًا.',h('div',{className:'space-y-3'},
   h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
    metric('عدد الحسابات',String(accounts.length)),
    metric('حسابات بأرصدة غير صفرية',String(rowsForAccounts.filter(row=>Math.abs(row.balance)>0.005).length)),
    metric('حسابات تمت مراجعتها',String(rowsForAccounts.filter(row=>row.decision&&row.decision.status==='matched').length)),
    metric('حسابات تحتاج متابعة',String(rowsForAccounts.filter(row=>row.decision&&row.decision.status!=='matched').length))
   ),
   panel('فاحص المراجع الذكي','يفحص القيود المرحلة بمنطق محاسبي قابل للتفسير: سلامة القيد، الحسابات، الأستاذ المساعد، تطابق المورد/العميل، ضريبة الخصم والاستقطاع، الفواتير والضريبة، التكرار، القيم الاستثنائية، وطبيعة الأرصدة. هذه تنبيهات للمراجع وليست أحكامًا آلية؛ لا يتم تعديل أو ترحيل أي قيد تلقائيًا.',h('div',{className:'space-y-3'},
    h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
     metric('ملاحظات مفتوحة',String(openFindings.length)),
     metric('مخاطر عالية',String(highFindings.length)),
     metric('ملاحظات متوسطة',String(mediumFindings.length)),
     metric('تنبيهات تستحق الفحص',String(lowFindings.length))
    ),
    h('div',{className:'flex flex-wrap items-center justify-between gap-2'},
     h('p',{className:'text-xs text-slate-500'},'نطاق الفحص: القيود المرحلة من '+period.from+' إلى '+period.to+'، والأرصدة التراكمية حتى '+period.to+'.'),
     select('تصفية الملاحظات',accountReviewFindingFilter,setAccountReviewFindingFilter,[{value:'open',label:'المفتوحة فقط'},{value:'high',label:'المخاطر العالية'},{value:'medium',label:'الملاحظات المتوسطة'},{value:'follow_up',label:'قيد المتابعة'},{value:'resolved',label:'المعالجة / المقبولة'},{value:'all',label:'كل الملاحظات'}])
    ),
    visibleFindings.length?table(['الخطورة','التاريخ','الملاحظة','رقم القيد','الحساب / السطر','سبب التنبيه','الإجراء المقترح','الحالة','إجراء'],findingRows):h('div',{className:'rounded-lg border border-dashed p-4 text-center text-sm text-slate-500'},'لا توجد ملاحظات مطابقة لهذا الفلتر في الفترة المحددة.'),
    selectedFinding?h('div',{className:'fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-3',onClick:()=>setAccountReviewSelectedFinding('')},h('section',{className:'w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl space-y-3',onClick:event=>event.stopPropagation()},
     h('div',{className:'flex flex-wrap justify-between gap-2 items-center'},h('strong',{className:'text-sm'},selectedFinding.title),button('إغلاق التفاصيل',()=>setAccountReviewSelectedFinding(''),'muted')),
     h('p',{className:'text-sm'},selectedFinding.reason),
     h('p',{className:'text-sm text-slate-700'},'الإجراء المقترح: '+selectedFinding.action),
     h('div',{className:'flex flex-wrap gap-2 text-xs'},h('span',null,'الخطورة: '+findingSeverityLabel(selectedFinding.severity)),h('span',null,'القيد: '+(selectedFinding.journalNumber||'—')),h('span',null,'الحساب: '+(selectedFinding.accountCode||'—'))),
     selectedFinding.journalId?button('فتح القيد واتخاذ إجراء',()=>openStatementJournal(selectedFinding.journalId),'primary'):selectedFinding.accountCode?button('فتح كشف الحساب',()=>openStatementAccount(selectedFinding.accountCode),'primary'):null,
      selectedFinding.similarJournals&&selectedFinding.similarJournals.length?h('div',{className:'rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2'},h('div',{className:'font-bold text-sm text-amber-900'},'قيود مشابهة للمقارنة ('+selectedFinding.similarJournals.length+')'),h('p',{className:'text-xs text-amber-800'},'اقتراحات للمقارنة حسب تطابق المرجع أو تقارب المبلغ والطرف؛ لا تعتبر إثباتًا على التكرار أو الخطأ.'),h('div',{className:'overflow-x-auto'},h('table',{className:'w-full text-xs'},h('thead',null,h('tr',null,['رقم القيد','التاريخ','المرجع','المبلغ','سبب التشابه','فتح'].map(label=>h('th',{key:label,className:'p-2 text-right'},label)))),h('tbody',null,selectedFinding.similarJournals.map(item=>h('tr',{key:item.id,className:'border-t'},h('td',{className:'p-2 font-bold'},item.number),h('td',{className:'p-2'},item.date||'—'),h('td',{className:'p-2'},item.reference||'—'),h('td',{className:'p-2 text-end'},fmt(item.amount)),h('td',{className:'p-2'},item.matchReason),h('td',{className:'p-2'},button('فتح',()=>openStatementJournal(item.id),'muted')))))))):h('p',{className:'text-xs text-slate-500'},'لم يتم العثور على قيد مشابه بدرجة كافية للمقارنة الآلية.'),
      field('ملاحظة المراجع والإجراء المتخذ',accountReviewFindingNote,setAccountReviewFindingNote),
     h('div',{className:'flex flex-wrap gap-2'},
      button('إعادة فتح',()=>void saveAccountReviewFindingDecision(selectedFinding,'open'),'muted',busy||!canFinance('reports','edit')),
      button('قيد المتابعة',()=>void saveAccountReviewFindingDecision(selectedFinding,'follow_up'),'primary',busy||!canFinance('reports','edit')),
      button('تمت المعالجة',()=>void saveAccountReviewFindingDecision(selectedFinding,'resolved'),'success',busy||!canFinance('reports','edit')),
      button('مقبولة مع توثيق',()=>void saveAccountReviewFindingDecision(selectedFinding,'accepted_risk'),'muted',busy||!canFinance('reports','edit'))
     ),
      h('div',{className:'flex justify-end'},button('إغلاق التفاصيل',()=>setAccountReviewSelectedFinding(''),'muted'))
     )
    ):null,
    h('p',{className:'text-xs text-slate-500'},'عند اختيار «تمت المعالجة»/ تُغلق متابعة الملاحظة فقط؛ يظل القيد الأصلي كما هو. التصحيح المحاسبي يتم من شاشة القيد المعتادة ثم يعاد فحص الفترة. «مقبولة مع توثيق» لا تعني أن البرنامج اعتبر المخالفة خطأً أو عدّل البيانات.')
   )),
   h('div',{className:'grid grid-cols-1 md:grid-cols-4 gap-2 items-end'},
    field('من شهر',period.from,value=>setPeriod(old=>Object.assign({},old,{from:value})),'month'),
    field('حتى شهر',period.to,value=>setPeriod(old=>Object.assign({},old,{to:value})),'month'),
    field('بحث الحساب',accountReviewSearch,setAccountReviewSearch),
    select('تصفية المراجعة',accountReviewFilter,setAccountReviewFilter,[{value:'all',label:'كل الحسابات'},{value:'nonzero',label:'أرصدة غير صفرية'},{value:'matched',label:'تمت مطابقتها'},{value:'follow_up',label:'تحتاج متابعة'}])
   ),
   h('div',{className:'flex flex-wrap gap-2 items-center'},button('تحديث الأرصدة',loadPeriod,'primary',busy),h('span',{className:'text-xs text-slate-500'},'جميع القيم بالجنيه المصري · الأرصدة تراكمية حتى '+period.to)),
   panel('قائمة الحسابات وحالة الإقفال','اضغط اسم الحساب لعرض تفاصيله وحركاته. الحسابات التجميعية تشمل الحسابات التابعة.',table(['الحساب','النوع','مدين','دائن','الرصيد الطبيعي','حالة المراجعة'],accountRows)),
   selected?h('div',{className:'space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3'},
    h('div',{className:'flex flex-wrap justify-between gap-2 items-center'},
     h('div',null,h('h3',{className:'font-extrabold'},'تفاصيل '+selected.account.code+' — '+selected.account.name),h('p',{className:'text-xs text-slate-500'},'الرصيد حتى '+period.to+' · '+(selected.account.isGroup?'يشمل الحسابات التابعة':'حساب تفصيلي'))),
     button('إغلاق التفاصيل',()=>{setAccountReviewSelectedCode('');setAccountReviewSelectedParty('');},'muted')
    ),
    h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
     metric('إجمالي المدين',fmt(selected.debit)),
     metric('إجمالي الدائن',fmt(selected.credit)),
     metric('الرصيد',accountAnalysisBalanceText(selected.balance)),
     metric('قرار المراجع',decisionLabel(selected.decision&&selected.decision.status))
    ),
    field('ملاحظات المراجع لهذا الحساب',accountReviewNote,setAccountReviewNote),
    h('div',{className:'flex flex-wrap gap-2'},
     button('تأكيد المطابقة',()=>void saveAccountReviewMark(selected.account.code,'','', 'matched'),'success',busy||!canFinance('reports','edit')),
     button('يحتاج متابعة',()=>void saveAccountReviewMark(selected.account.code,'','', 'follow_up'),'muted',busy||!canFinance('reports','edit')),
     button('يتطلب تسوية / قيد تصحيح',()=>void saveAccountReviewMark(selected.account.code,'','', 'requires_adjustment'),'danger',busy||!canFinance('reports','edit'))
    ),
    matchingPartyTypes.length?h('div',{className:'space-y-2'},
     matchingPartyTypes.length>1?select('نوع الطرف التحليلي',partyType,value=>{setAccountReviewSelectedPartyType(value);setAccountReviewSelectedParty('');},matchingPartyTypes.map(value=>({value,label:value==='vendor'?'الموردون':'العملاء'}))):null,
     panel(partyType==='vendor'?'الموردون — أرصدة واجبة السداد':'العملاء — أرصدة واجبة التحصيل','اختر الطرف لعرض فواتيره وحركاته والدفعات التي تحتاج إلى مطابقة.',table(['الطرف','إجمالي مدين','إجمالي دائن','الرصيد المطلوب','حالة المتابعة'],partySummary.map(row=>h('tr',{key:row.partyId,className:'border-t'},
      h('td',{className:'p-2'},h('button',{type:'button',className:'text-blue-700 underline font-bold',onClick:()=>{setAccountReviewSelectedParty(row.partyId);setAccountReviewSelectedPartyType(partyType);setAccountReviewNote(row.decision&&row.decision.notes||'');}},displayParty(row.party)+' ('+row.partyId+')')),
      h('td',{className:'p-2 text-end'},fmt(row.lines.reduce((sum,line)=>sum+n(line.debit),0))),
      h('td',{className:'p-2 text-end'},fmt(row.lines.reduce((sum,line)=>sum+n(line.credit),0))),
      h('td',{className:'p-2 text-end font-bold'},accountAnalysisBalanceText(row.net)),
      h('td',{className:'p-2'},h('span',{className:'font-bold '+decisionTone(row.decision&&row.decision.status)},decisionLabel(row.decision&&row.decision.status)))
     ))))
    ):null,
    chosenParty?h('div',{className:'space-y-3 rounded-xl border bg-white p-3'},
     h('div',{className:'flex flex-wrap justify-between gap-2'},h('h4',{className:'font-bold'},'متابعة '+(partyType==='vendor'?'المورد: ':'العميل: ')+displayParty(chosenParty.party)+' · '+chosenParty.partyId),h('strong',null,accountAnalysisBalanceText(chosenParty.net))),
     metric('إجمالي الفواتير المرحلة',fmt(chosenParty.invoices.reduce((sum,item)=>sum+n(item.totals&&item.totals.total!==undefined?item.totals.total:item.total||item.amount||0),0))),
     panel('الفواتير وما تم تخصيصه من سداد','يظهر المتبقي فقط عندما يتطابق مرجع السداد مع رقم الفاتورة. عند غياب المرجع يلزم تخصيص الدفعة يدويًا قبل تأكيد المتبقي.',table(['التاريخ','رقم الفاتورة / القيد','قيمة الفاتورة','سداد مرتبط بالمرجع','المتبقي حسب المرجع','نتيجة المطابقة'],invoiceDetailRows)),
     unmatchedRows.length?panel('دفعات وتسويات غير مخصصة','قد تكون دفعات صحيحة لم يكتب فيها رقم الفاتورة، أو سُجلت على طرف آخر بالخطأ. راجع الطرف والمرجع وافتح القيد قبل تسجيل قرار الإقفال.',table(['التاريخ','القيد','المرجع','القيمة','الإجراء المطلوب'],unmatchedRows)):null,
     panel('حركة حساب الطرف','كل الحركات المرحّلة على الحساب التحليلي للطرف المختار.',table(['التاريخ','رقم القيد','الحساب','البيان','المرجع','مدين','دائن'],movementRows)),
     field('ملاحظات المراجع للطرف',accountReviewNote,setAccountReviewNote),
     h('div',{className:'flex flex-wrap gap-2'},
      button('تأكيد مطابقة الطرف',()=>void saveAccountReviewMark(selected.account.code,partyType,chosenParty.partyId,'matched'),'success',busy||!canFinance('reports','edit')),
      button('الطرف يحتاج متابعة',()=>void saveAccountReviewMark(selected.account.code,partyType,chosenParty.partyId,'follow_up'),'muted',busy||!canFinance('reports','edit')),
      button('يتطلب تسوية',()=>void saveAccountReviewMark(selected.account.code,partyType,chosenParty.partyId,'requires_adjustment'),'danger',busy||!canFinance('reports','edit'))
     )
    ):null,
    !matchingPartyTypes.length?panel('حركة الحساب','راجع الحركات والأطراف المقابلة قبل إغلاق الحساب.',table(['التاريخ','رقم القيد','الحساب','البيان','مدين','دائن'],generalRows)):null
   ):h('div',{className:'rounded-lg border border-dashed p-4 text-center text-sm text-slate-500'},'اختر حسابًا من الجدول لبدء المراجعة التفصيلية.'),
   h('p',{className:'text-xs text-slate-500'},'تنبيه رقابي: اختلاف إجمالي الفواتير عن رصيد الأستاذ قد ينتج عن أرصدة افتتاحية أو دفعات مقدمة أو تسويات أو مدفوعات غير مخصصة؛ لا ينفذ النظام أي قيد أو تجميع تلقائيًا. سجل قرار المطابقة بعد فحص المستندات وكشف الطرف.')
  ));
 };

 const renderQuickAdd = function() {
  if(!quickAddType)return null;
  const change=function(key,value){setQuickAddForm(function(old){return Object.assign({},old,{[key]:value});});};
  const typeLabels={chartOfAccounts:'حساب جديد',costCenters:'مركز تكلفة جديد',items:'صنف مخزني جديد',itemGroups:'مجموعة أصناف جديدة',warehouses:'مخزن جديد',bankAccounts:'حساب بنك جديد',taxCodes:'كود ضريبي جديد',parties:'عميل / مورد جديد',financingParties:'جهة تمويل جديدة',securityDepositParties:'جهة تأمينات مستردة جديدة',employeeAdvances:'كود سلفة موظف جديد',employeeCustodies:'كود عهدة موظف جديد'};
  const fields=[
   field('الكود',quickAddForm.code,function(v){change('code',v);}),
   field('الاسم',quickAddForm.name,function(v){change('name',v);}),
   h('label',{className:'inline-flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2'},h('input',{type:'checkbox',checked:quickAddForm.active!==false,onChange:function(e){change('active',e.target.checked);}}),'السجل نشط / متاح للاستخدام')
  ];
  if(quickAddType==='chartOfAccounts'){
   fields.push(select('نوع الحساب',quickAddForm.type,function(v){change('type',v);},[{value:'asset',label:'أصول'},{value:'liability',label:'التزامات'},{value:'equity',label:'حقوق ملكية'},{value:'revenue',label:'إيرادات'},{value:'expense',label:'مصروفات'}]));
   fields.push(select('الطبيعة',quickAddForm.nature,function(v){change('nature',v);},[{value:'debit',label:'مدين'},{value:'credit',label:'دائن'}]));
   fields.push(selectWithAdd('الحساب الأب',quickAddForm.parentCode,function(v){change('parentCode',v);},[{value:'',label:'بدون'}].concat(accounts.filter(function(x){return x.isGroup;}).map(function(x){return {value:x.code,label:x.code+' — '+x.name};})),'chartOfAccounts',{type:quickAddForm.type,nature:quickAddForm.nature,parentCode:quickAddForm.parentCode||'',isGroup:true},'quick-chart-parent-'+String(quickAddForm.code||'')));
   fields.push(select('تحليل الطرف',quickAddForm.subledgerType||'',function(v){change('subledgerType',v);},[{value:'',label:'بدون'},{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'},{value:'employeeCustody',label:'موظف صاحب عهدة'},{value:'employeeAdvance',label:'موظف صاحب سلفة'},{value:'partnerCurrentAccount',label:'شريك — جاري الشركاء'},{value:'financingParty',label:'جهة تمويل / دائن — شريك أو جهة خارجية'}]));
   fields.push(h('label',{className:'inline-flex items-center gap-2 text-sm'},h('input',{type:'checkbox',checked:quickAddForm.isGroup,onChange:function(e){change('isGroup',e.target.checked);}}),'حساب تجميعي'));
  }
  if(quickAddType==='costCenters'){
   fields.push(select('المشروع المرتبط',quickAddForm.projectCode,function(v){change('projectCode',v);},[{value:'',label:'بدون مشروع'}].concat(projects.map(function(x){return {value:x.code||x.id,label:x.name||x.code};}))));
  }
  if(quickAddType==='items'){
   fields.push(select('تصنيف الصنف',quickAddForm.itemType,function(v){change('itemType',v);},[{value:'stock',label:'بضاعة / مخزون عام'},{value:'raw_material',label:'خامة'},{value:'finished_good',label:'منتج تام'},{value:'spare_part',label:'قطع غيار'},{value:'consumable',label:'مستهلكات تشغيل'},{value:'office_supply',label:'مستلزمات مكتبية'}]));
   fields.push(field('وحدة القياس',quickAddForm.unit,function(v){change('unit',v);}));
   fields.push(selectWithAdd('مجموعة الصنف',quickAddForm.groupCode,function(v){change('groupCode',v);},[{value:'',label:'بدون مجموعة'}].concat(rows(master.itemGroups).map(function(x){return {value:x.code,label:x.code+' — '+x.name};})),'itemGroups'));
   fields.push(field('الإصدار / Version',quickAddForm.version,function(v){change('version',v);}));
   fields.push(field('كود المخزن',quickAddForm.warehouseCode,function(v){change('warehouseCode',v);}));
  }
  if(quickAddType==='itemGroups'){
   fields.push(select('نوع المجموعة',quickAddForm.groupType,function(v){change('groupType',v);},[{value:'raw_material',label:'خامات'},{value:'finished_good',label:'منتجات تامة'},{value:'spare_part',label:'قطع غيار'},{value:'consumable',label:'مستهلكات'},{value:'office_supply',label:'مستلزمات مكتبية'},{value:'packaging',label:'مواد تعبئة وتغليف'},{value:'other',label:'أخرى'}]));
  }
  if(quickAddType==='taxCodes'){
   fields.push(select('نوع الضريبة',quickAddForm.taxType,function(v){change('taxType',v);},[{value:'vat_input',label:'قيمة مضافة مدخلات'},{value:'vat_output',label:'قيمة مضافة مخرجات'},{value:'withholding',label:'خصم/استقطاع'},{value:'addition',label:'إضافة'}]));
   fields.push(field('النسبة %',quickAddForm.rate,function(v){change('rate',v);},'number'));
   fields.push(field('بداية السريان',quickAddForm.effectiveFrom,function(v){change('effectiveFrom',v);},'date'));
  }
  if(quickAddType==='bankAccounts'){
   fields.push(selectWithAdd('الحساب المحاسبي المرتبط',quickAddForm.accountCode||'',function(v){change('accountCode',v);},posting.filter(function(a){return a.type==='asset';}).map(function(a){return {value:a.code,label:a.code+' — '+a.name};}),'chartOfAccounts',{type:'asset',nature:'debit',parentCode:'1'},'quick-bank-account-'+String(quickAddForm.code||'')));
  }
  if(quickAddType==='employeeAdvances'||quickAddType==='employeeCustodies'){
   const linkedUsers=(userDirectory||[]).filter(user=>user&&user.uid);
   fields.push(select('اسم المستخدم المرتبط (اختياري)',quickAddForm.employeeUid||'',function(v){const user=linkedUsers.find(item=>String(item.uid)===String(v));setQuickAddForm(old=>Object.assign({},old,{employeeUid:v,name:old.name&&old.name.trim()?old.name:String(user&&(user.fullName||user.username||user.email)||'')}));},[{value:'',label:'بدون ربط بمستخدم'}].concat(linkedUsers.map(user=>({value:String(user.uid),label:(user.fullName||user.username||user.email||'مستخدم')+(user.username&&String(user.username)!==String(user.fullName||'')?' — @'+user.username:'')}))),'quick-employee-'+quickAddType));
   fields.push(h('p',{className:'text-xs text-slate-500 sm:col-span-2 lg:col-span-3'},'ربط الكود باسم مستخدم اختياري؛ يمكن إنشاء كود مستقل بدون مستخدم أو ربطه بحساب النظام الآن أو لاحقًا ما دامت لا توجد حركات تمنع تغيير الربط.'));
  }
  if(quickAddType==='financingParties'){
   fields.push(field('رقم مرجعي / رقم مستند التمويل',quickAddForm.reference||'',function(v){change('reference',v);}));
   fields.push(field('رقم تعريف / تسجيل (اختياري)',quickAddForm.taxNumber||'',function(v){change('taxNumber',v);}));
   fields.push(h('label',{className:'block text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3'},'ملاحظات',h('textarea',{rows:2,value:quickAddForm.notes||'',onChange:function(e){change('notes',e.target.value);},className:'mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal bg-white'})));
  }
  if(quickAddType==='securityDepositParties'){
   fields.push(field('رقم مرجعي / رقم عقد أو إيصال',quickAddForm.reference||'',function(v){change('reference',v);}));
   fields.push(field('رقم تعريف / تسجيل (اختياري)',quickAddForm.taxNumber||'',function(v){change('taxNumber',v);}));
   fields.push(h('label',{className:'block text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3'},'ملاحظات',h('textarea',{rows:2,value:quickAddForm.notes||'',onChange:function(e){change('notes',e.target.value);},className:'mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal bg-white'})));
  }
  if(quickAddType==='parties'){
   fields[0]=field('كود '+(quickAddForm.partyType==='vendor'?'المورد':'العميل'),quickAddForm.code,function(v){change('code',v);});
   fields[1]=field('اسم '+(quickAddForm.partyType==='vendor'?'المورد':'العميل'),quickAddForm.name,function(v){change('name',v);});
   fields.push(select('نوع الطرف',quickAddForm.partyType,function(v){change('partyType',v);},[{value:'vendor',label:'مورد'},{value:'customer',label:'عميل'}]));
   const addPartyField=(label,key,type)=>fields.push(field(label,quickAddForm[key],function(v){change(key,v);},type||'text'));
   addPartyField('الرقم الضريبي','taxNumber');
   addPartyField('السجل التجاري','commercialRegister');
   addPartyField('اسم مسؤول التواصل','contactPerson');
   addPartyField('الوظيفة / الصفة','contactTitle');
   addPartyField('رقم الهاتف','phone');
   addPartyField('رقم الموبايل','mobile');
   addPartyField('هاتف بديل','alternatePhone');
   addPartyField('البريد الإلكتروني','email','email');
   addPartyField('بريد إلكتروني بديل','alternateEmail','email');
   addPartyField('واتساب','whatsapp');
   addPartyField('الموقع الإلكتروني','website');
   addPartyField('المدينة','city');
   addPartyField('الدولة','country');
   addPartyField('الرمز البريدي','postalCode');
   addPartyField('شروط السداد','paymentTerms');
   addPartyField('حد الائتمان','creditLimit','number');
   fields.push(select('العملة',quickAddForm.currency,function(v){change('currency',v);},[{value:'EGP',label:'جنيه مصري EGP'},{value:'USD',label:'دولار أمريكي USD'},{value:'EUR',label:'يورو EUR'},{value:'SAR',label:'ريال سعودي SAR'},{value:'AED',label:'درهم إماراتي AED'}]));
   addPartyField('اسم البنك','bankName');
   addPartyField('رقم الحساب البنكي','bankAccount');
   addPartyField('IBAN','iban');
   fields.push(h('label',{className:'block text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3'},'العنوان',h('textarea',{rows:2,value:quickAddForm.address||'',onChange:function(e){change('address',e.target.value);},className:'mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal bg-white'})));
   fields.push(h('label',{className:'block text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3'},'ملاحظات',h('textarea',{rows:2,value:quickAddForm.notes||'',onChange:function(e){change('notes',e.target.value);},className:'mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-normal bg-white'})));
  }
  const currentQuickCodeSuggestion=getCodeSuggestion(quickAddType,quickAddForm);
  fields[0]=h('div',{className:'space-y-1 min-w-0'},
   fields[0],
   h('div',{className:'flex flex-wrap items-center gap-2'},button('اقتراح الكود التالي حسب النمط',()=>change('code',getCodeSuggestion(quickAddType,quickAddForm).code),'muted',busy)),
   h('small',{className:'block text-[11px] text-slate-500 font-normal'},codeHint(currentQuickCodeSuggestion))
  );
  const isParty=quickAddType==='parties';
  const isFinancingParty=quickAddType==='financingParties';
  const closeQuickAdd=()=>{if(busy)return;setQuickAddType('');setQuickAddTarget(null);setQuickAddParent(null);setQuickAddOriginalCode('');if(masterDirectoryOnly&&props.externalPartyRequest&&typeof props.onPartyMasterRequestComplete==="function")props.onPartyMasterRequestComplete();};
  return h('div',{className:'fixed inset-0 z-[240] bg-slate-950/70 flex items-center justify-center p-2 sm:p-3',onClick:closeQuickAdd},
   h('section',{className:'bg-white rounded-xl shadow-2xl w-full '+(isParty?'max-w-5xl':'max-w-2xl')+' p-3 sm:p-4 max-h-[94vh] overflow-auto',onClick:function(e){e.stopPropagation();}},
    h('div',{className:'flex items-center justify-between gap-2 mb-2 sticky top-0 bg-white z-10 py-1'},h('h3',{className:'font-bold text-base'},isParty?(quickAddForm.partyType==='vendor'?'بيانات مورد جديد':'بيانات عميل جديد'):isFinancingParty?'بيانات جهة تمويل جديدة':(typeLabels[quickAddType]||'إضافة كود')),button('إغلاق',closeQuickAdd,'muted',busy)),
    h('div',{className:'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'},...fields),
    h('div',{className:'flex justify-end gap-2 mt-3 pt-2 border-t'},button('إلغاء',closeQuickAdd,'muted',busy),button(quickAddOriginalCode?'حفظ التعديلات':isParty?'حفظ واختيار الطرف':'حفظ الكود',saveQuickAdd,'primary',busy))
   )
  );
 };
 const statementAttachmentListModal=statementAttachmentList?h('div',{className:'fixed inset-0 z-[180] bg-slate-950/70 flex items-center justify-center p-2 sm:p-4',onClick:()=>setStatementAttachmentList(null)},
  h('section',{className:'w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-2xl',onClick:e=>e.stopPropagation()},
   h('header',{className:'sticky top-0 z-10 flex items-center justify-between gap-2 bg-slate-900 p-4 text-white'},h('h3',{className:'font-extrabold'},statementAttachmentList.title||'مرفقات الحركة'),h('button',{type:'button',className:'rounded-lg border border-white/30 px-3 py-2 text-sm',onClick:()=>setStatementAttachmentList(null)},'إغلاق')),
   table(['اسم الملف','النوع','الحجم','الإجراء'],statementAttachmentList.attachments.map(item=>h('tr',{key:item.entityType+'/'+item.entityId+'/'+item.id,className:'border-t'},h('td',{className:'p-2'},item.fileName||'—'),h('td',{className:'p-2'},item.mimeType||'—'),h('td',{className:'p-2'},fmt((Number(item.fileSize)||0)/1024)+' KB'),h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-1'},h('button',{type:'button',className:'rounded-lg border px-3 py-1 text-xs font-bold text-blue-700',onClick:()=>void openStatementAttachmentFile(item)},'فتح المرفق'),canDeleteStatementAttachment(item)?h('button',{type:'button',disabled:busy,className:'rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700',onClick:()=>void deleteStatementAttachment(item,invoiceDocumentIdForAttachment(item))},'حذف'):null)))))
  )):null;
 const statementAttachmentPreviewModal=statementAttachmentPreview?h('div',{className:'fixed inset-0 z-[190] bg-slate-950/80 flex items-center justify-center p-2 sm:p-4',onClick:closeStatementAttachmentPreview},
  h('section',{className:'flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',onClick:e=>e.stopPropagation()},
   h('header',{className:'flex shrink-0 items-center justify-between gap-2 bg-slate-900 p-3 text-white'},h('div',{className:'font-bold truncate'},statementAttachmentPreview.fileName||'معاينة المرفق'),h('div',{className:'flex gap-2'},statementAttachmentPreview.attachment&&canDeleteStatementAttachment(statementAttachmentPreview.attachment)?h('button',{type:'button',disabled:busy,className:'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700',onClick:async()=>{const item=statementAttachmentPreview.attachment,documentId=invoiceDocumentIdForAttachment(item),deleted=await deleteStatementAttachment(item,documentId);if(deleted)closeStatementAttachmentPreview();}},'حذف المرفق'):null,h('button',{type:'button',className:'rounded-lg border border-white/30 px-3 py-2 text-sm',onClick:closeStatementAttachmentPreview},'إغلاق'))),
   h('div',{className:'min-h-0 flex-1 overflow-auto bg-slate-100 p-2'},statementAttachmentPreview.kind==='media'?(statementAttachmentPreview.mimeType==='application/pdf'?h('iframe',{title:statementAttachmentPreview.fileName,src:statementAttachmentPreview.url,className:'h-full min-h-[70vh] w-full rounded-lg bg-white'}):h('img',{src:statementAttachmentPreview.url,alt:statementAttachmentPreview.fileName,className:'mx-auto max-h-full max-w-full object-contain'})):statementAttachmentPreview.kind==='text'?h('pre',{className:'whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm'},statementAttachmentPreview.text):statementAttachmentPreview.kind==='table'?table((statementAttachmentPreview.rows[0]||[]).map((_,index)=>String(index+1)),statementAttachmentPreview.rows.slice(1).map((row,index)=>h('tr',{key:index,className:'border-t'},row.map((cell,column)=>h('td',{key:column,className:'p-2'},String(cell)))))):null)
  )):null;
 const renderOpeningBalances=()=>{
  const openingAccount=posting.find(account=>String(account.code)==="3100"&&!account.isGroup);
  const openingRecord=[...journalRecords,...documents].find(record=>record&&(record.openingBalance===true||record.sourceType==="openingBalance")&&!["cancelled","deleted","rejected"].includes(String(record.status||"")));
  const openingAccounts=posting.filter(account=>String(account.code)!=="3100");
  const normalizedSearch=normalizeMatch(openingAccountSearch);
  const visibleAccounts=openingAccounts.filter(account=>!normalizedSearch||normalizeMatch([account.code,account.name,account.subledgerType||"",account.type||""].join(" ")).includes(normalizedSearch));
  const openingLines=[],openingErrors=[];
  let openingDebit=0,openingCredit=0;
  const amountOf=value=>{if(value===undefined||value===null||String(value).trim()==="")return 0;return Number(value);};
  openingAccounts.forEach(account=>{
   if(account.subledgerType){
    (openingBalanceDetails[account.code]||[]).forEach((detail,index)=>{
     const hasData=Boolean(String(detail.partyId||"").trim()||String(detail.amount||"").trim());
     if(!hasData)return;
     const amount=amountOf(detail.amount);
     if(!Number.isFinite(amount)||amount<=0){openingErrors.push("أدخل مبلغًا أكبر من صفر في حساب "+account.code+" — "+account.name+"، السطر "+(index+1)+".");return;}
     if(!String(detail.partyId||"").trim()){openingErrors.push("اختر الطرف التحليلي في حساب "+account.code+" — "+account.name+"، السطر "+(index+1)+".");return;}
     const side=detail.side==="credit"?"credit":"debit";
     const line={accountCode:account.code,description:"رصيد افتتاحي",debit:side==="debit"?amount:0,credit:side==="credit"?amount:0,partyType:account.subledgerType,partyId:String(detail.partyId)};
     openingLines.push(line);openingDebit+=line.debit;openingCredit+=line.credit;
    });
   }else{
    const value=openingBalanceValues[account.code]||{},debitText=String(value.debit??"").trim(),creditText=String(value.credit??"").trim();
    if(debitText!==""||creditText!==""){
     const debit=amountOf(value.debit),credit=amountOf(value.credit);
     if(!Number.isFinite(debit)||!Number.isFinite(credit)||debit<0||credit<0){openingErrors.push("راجع قيم المدين والدائن للحساب "+account.code+" — "+account.name+".");return;}
     if(debit>0&&credit>0){openingErrors.push("لا يجوز إدخال مدين ودائن معًا لنفس الحساب "+account.code+" — "+account.name+".");return;}
     if(debit>0||credit>0){const line={accountCode:account.code,description:"رصيد افتتاحي",debit,credit};openingLines.push(line);openingDebit+=debit;openingCredit+=credit;}
    }
   }
  });
  const difference=openingDebit-openingCredit,offsetDebit=difference< -0.005?Math.abs(difference):0,offsetCredit=difference>0.005?difference:0;
  const openingDateInvalid=Boolean(accountingStartMonth&&/^(\d{4})-(\d{2})$/.test(accountingStartMonth)&&openingBalanceDate>=accountingStartMonth+"-01");
  const updateOpeningDetail=(code,index,patch)=>setOpeningBalanceDetails(previous=>Object.assign({},previous,{[code]:(previous[code]||[]).map((row,rowIndex)=>rowIndex===index?Object.assign({},row,patch):row)}));
  const detailAccount=openingAccounts.find(account=>String(account.code)===String(openingDetailAccount));
  const detailModal=detailAccount?h("div",{className:"fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-3",onClick:()=>{setOpeningDetailAccount("");setJournalPickerOpen({});}},
   h("section",{className:"w-full max-w-5xl max-h-[92vh] overflow-auto rounded-2xl bg-white p-4 md:p-5 shadow-2xl space-y-3",onClick:event=>event.stopPropagation()},
    h("div",{className:"flex flex-wrap items-center justify-between gap-3"},
     h("div",null,h("h3",{className:"text-lg font-extrabold"},"تحليل الرصيد الافتتاحي: "+detailAccount.code+" — "+detailAccount.name),h("p",{className:"text-sm text-slate-500"},"أدخل رصيد كل "+analyticPartyLabel(detailAccount.subledgerType)+" بصورة مستقلة.")),
     button("إغلاق",()=>{setOpeningDetailAccount("");setJournalPickerOpen({});},"muted")
    ),
    h("div",{className:"space-y-2"},
     ...(openingBalanceDetails[detailAccount.code]||[]).map((detail,index)=>h("div",{key:detailAccount.code+"-"+index,className:"grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-xl border bg-slate-50 p-3"},
      h("div",{className:"md:col-span-6"},analyticPickerWithAdd("الطرف التحليلي",detailAccount.subledgerType,detail.partyId||"",value=>updateOpeningDetail(detailAccount.code,index,{partyId:value}),openingAnalyticOptions(detailAccount.subledgerType,detailAccount.code,detail.partyId),"opening-balance-"+detailAccount.code+"-"+index)),
      h("div",{className:"md:col-span-2"},select("طبيعة الرصيد",detail.side||detailAccount.nature||"debit",value=>updateOpeningDetail(detailAccount.code,index,{side:value}),[{value:"debit",label:"مدين"},{value:"credit",label:"دائن"}])),
      h("div",{className:"md:col-span-3"},field("المبلغ",detail.amount||"",value=>updateOpeningDetail(detailAccount.code,index,{amount:value}),"number",{min:"0"})),
      h("div",{className:"md:col-span-1 flex items-end"},button("حذف",()=>setOpeningBalanceDetails(previous=>Object.assign({},previous,{[detailAccount.code]:(previous[detailAccount.code]||[]).filter((row,rowIndex)=>rowIndex!==index)})),"danger"))
     ))
    ),
    h("div",{className:"flex flex-wrap items-center justify-between gap-2"},
     button("＋ إضافة طرف",()=>setOpeningBalanceDetails(previous=>Object.assign({},previous,{[detailAccount.code]:(previous[detailAccount.code]||[]).concat([{partyId:"",side:detailAccount.nature==="credit"?"credit":"debit",amount:""}])})),"primary"),
     h("div",{className:"text-sm font-bold text-slate-700"},"عدد الأطراف: "+(openingBalanceDetails[detailAccount.code]||[]).filter(row=>row.partyId||row.amount).length)
    )
   )
  ):null;
  const accountRows=visibleAccounts.map(account=>{
   const analytic=Boolean(account.subledgerType),values=openingBalanceValues[account.code]||{},details=openingBalanceDetails[account.code]||[];
   const accountDebit=analytic?details.reduce((sum,row)=>sum+(row.side==="credit"?0:Math.max(0,amountOf(row.amount)||0)),0):Math.max(0,amountOf(values.debit)||0);
   const accountCredit=analytic?details.reduce((sum,row)=>sum+(row.side==="credit"?Math.max(0,amountOf(row.amount)||0):0),0):Math.max(0,amountOf(values.credit)||0);
   return h("div",{key:account.code,className:"grid grid-cols-1 md:grid-cols-12 gap-3 items-end rounded-xl border border-slate-200 bg-white p-3"},
    h("div",{className:"md:col-span-4 min-w-0"},
     h("div",{className:"font-extrabold text-slate-800"},account.code+" — "+account.name),
     h("div",{className:"mt-1 flex flex-wrap gap-2 text-xs text-slate-500"},
      h("span",null,({asset:"أصول",liability:"التزامات",equity:"حقوق ملكية",revenue:"إيرادات",expense:"مصروفات"}[account.type]||account.type)),
      h("span",null,account.nature==="credit"?"طبيعته دائن":"طبيعته مدين"),
      analytic?h("span",{className:"font-bold text-indigo-700"},"تحليلي: "+analyticPartyLabel(account.subledgerType)):null
     )
    ),
    h("div",{className:"md:col-span-2"},
     analytic?button("تفاصيل الأطراف ("+details.filter(row=>row.partyId||row.amount).length+")",()=>setOpeningDetailAccount(account.code),"muted"):
      h("div",{className:"rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-500 text-center"},"رصيد مباشر")
    ),
    h("div",{className:"md:col-span-3"},
     analytic?h("div",{className:"rounded-lg border bg-slate-50 px-3 py-2"},h("div",{className:"text-xs text-slate-500"},"إجمالي المدين"),h("b",{className:"tabular-nums"},fmt(accountDebit))):
      field("مدين",values.debit||"",value=>setOpeningBalanceValues(previous=>Object.assign({},previous,{[account.code]:Object.assign({},previous[account.code]||{},{debit:value})})),"number",{min:"0"})
    ),
    h("div",{className:"md:col-span-3"},
     analytic?h("div",{className:"rounded-lg border bg-slate-50 px-3 py-2"},h("div",{className:"text-xs text-slate-500"},"إجمالي الدائن"),h("b",{className:"tabular-nums"},fmt(accountCredit))):
      field("دائن",values.credit||"",value=>setOpeningBalanceValues(previous=>Object.assign({},previous,{[account.code]:Object.assign({},previous[account.code]||{},{credit:value})})),"number",{min:"0"})
    )
   );
  });
  const submitOpeningBalance=async()=>{
   if(!canFinance("journal","add")){setError("ليس لديك صلاحية إنشاء قيد الأرصدة الافتتاحية.");return;}
   if(openingRecord){setError("يوجد قيد أرصدة افتتاحية مسجل بالفعل. افتحه من شاشة المراجعة أو القيود اليومية بدل إنشاء قيد مكرر.");return;}
   if(!openingBalanceDate||openingDateInvalid){setError("يجب أن يكون تاريخ الأرصدة الافتتاحية قبل أول يوم في الفترة المحاسبية ("+accountingStartMonth+"-01).");return;}
   if(openingErrors.length){setError(openingErrors[0]);return;}
   if(!openingLines.length){setError("أدخل رصيدًا واحدًا على الأقل قبل إنشاء القيد.");return;}
   if(openingLines.length>1999){setError("عدد تفاصيل الأرصدة تجاوز الحد المسموح. قسّم الإدخال إلى دفعات أصغر.");return;}
   if(!openingAccount){setError("حساب 3100 — رأس المال والأرصدة الافتتاحية غير موجود أو غير قابل للترحيل في دليل الحسابات.");return;}
   setBusy(true);setError("");
   try{
    const result=await api("","POST",{action:"submitOpeningBalances",date:openingBalanceDate,reference:"OPENING-"+openingBalanceDate,description:"قيد الأرصدة الافتتاحية حتى "+openingBalanceDate,lines:openingLines});
    setNotice("تم إنشاء قيد الأرصدة الافتتاحية رقم "+(result.number||result.id)+" وإرساله إلى المراجعة. لن تتغير الأرصدة إلا بعد الاعتماد والترحيل.");
    setOpeningDetailAccount("");setJournalPickerOpen({});
    await refresh();
   }catch(error){setError(error.message||String(error));}
   finally{setBusy(false);}
  };
  return h("div",{className:"space-y-4"},
   h("div",{className:"flex flex-wrap items-end justify-between gap-3"},
    h("div",null,h("h3",{className:"text-xl font-extrabold"},"الأرصدة الافتتاحية"),h("p",{className:"text-sm text-slate-500"},"أدخل أرصدة الحسابات مرة واحدة، مع توزيع الحسابات الرقابية على الأطراف المرتبطة بها.")),
    h("div",{className:"min-w-[230px]"},field("تاريخ الأرصدة الافتتاحية",openingBalanceDate,value=>setOpeningBalanceDate(value),"date"))
   ),
   h("div",{className:"rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"},
    "يجب أن يسبق تاريخ القيد أول يوم في الفترة المحاسبية. الحساب 3100 — رأس المال والأرصدة الافتتاحية — يُستخدم تلقائيًا لموازنة الفرق. الحسابات التحليلية لا تُقبل كإجمالي فقط؛ أدخل رصيد كل مورد أو عميل أو موظف على حدة. إذا كنت ستستورد قيود يناير كاملة، فلا تكرر حركة الفترة نفسها داخل الرصيد الافتتاحي."
   ),
   openingRecord?h("div",{className:"flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3"},
    h("div",null,h("b",{className:"text-indigo-900"},"يوجد قيد أرصدة افتتاحية بالفعل"),h("div",{className:"text-sm text-indigo-800"},"رقم القيد: "+(openingRecord.number||openingRecord.id)+" — التاريخ: "+(openingRecord.date||"—")+" — الحالة: "+status(openingRecord.status))),
    button("فتح القيد",()=>openJournalModal(openingRecord),"muted")
   ):null,
   h("div",{className:"grid grid-cols-1 sm:grid-cols-3 gap-3"},
    metric("إجمالي المدين",moneyLabel(openingDebit)),metric("إجمالي الدائن",moneyLabel(openingCredit)),metric("الفرق قبل الحساب الموازن",moneyLabel(difference))
   ),
   panel("أرصدة الحسابات","",h("div",{className:"space-y-3"},
    field("ابحث عن حساب بالاسم أو الكود",openingAccountSearch,setOpeningAccountSearch,"search"),
    h("div",{className:"max-h-[58vh] overflow-auto space-y-2 pr-1"},accountRows.length?accountRows:h("div",{className:"rounded-lg border border-dashed p-4 text-center text-sm text-slate-500"},"لا توجد حسابات مطابقة للبحث.")),
    h("div",{className:"rounded-xl border border-indigo-200 bg-indigo-50 p-3"},
     h("div",{className:"font-extrabold text-indigo-900"},"3100 — "+(openingAccount&&openingAccount.name||"رأس المال والأرصدة الافتتاحية")+" (حساب موازن تلقائي)"),
     h("div",{className:"mt-2 flex flex-wrap gap-4 text-sm font-bold text-indigo-900"},h("span",null,"مدين: "+fmt(offsetDebit)),h("span",null,"دائن: "+fmt(offsetCredit)))
    )
   )),
   openingErrors.length?h("div",{className:"rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"},openingErrors[0]):null,
   openingDateInvalid?h("div",{className:"rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"},"تاريخ القيد يجب أن يكون قبل "+accountingStartMonth+"-01."):null,
   h("div",{className:"flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3"},
    h("div",{className:"text-sm text-slate-600"},"عدد سطور الحسابات: "+openingLines.length+" — حساب الموازنة سيُضاف آليًا عند الحاجة."),
    button("إنشاء القيد وإرساله للمراجعة",submitOpeningBalance,"primary",busy||Boolean(openingRecord)||openingErrors.length>0||openingDateInvalid||!openingLines.length||!openingAccount||!canFinance("journal","add"))
   ),
   detailModal
  );
};

 let content=null;
 if(tab==='overview')content=renderOverview();
 if(tab==='journal')content=renderJournal();
 if(tab==='openingBalances')content=renderOpeningBalances();
 if(tab==='review')content=renderReview();
 if(tab==='invoices')content=renderInvoices();
 if(tab==='assignments')content=renderAssignments();
 if(tab==='assignments')content=renderAssignments();
 if(tab==='partyStatements')content=renderPartyStatements();
 if(tab==='partnerCurrent')content=renderPartnerCurrent();
 if(tab==='legacyImport')content=renderLegacyImport();
 if(tab==='masters')content=renderMasters();
 if(tab==='accounts')content=renderMaster('accounts');
 if(tab==='centers')content=h('div',{className:'space-y-4'},renderMaster('centers'),renderCostCenterAnalysis());
 if(tab==='inventory')content=renderInventory();
 if(tab==='inventoryMovements')content=renderInventoryMovements();
 if(tab==='cash')content=renderCash();
 if(tab==='bank')content=renderBank();
 if(tab==='tax')content=renderTax();
 if(tab==='reports')content=renderReports();
 if(tab==='accountAnalysis')content=renderAccountAnalysis();
 if(tab==='accountReview')content=renderReview();
 return h('div',{className:'pest-finance-workspace p-2 md:p-3 space-y-2',dir:rtl?'rtl':'ltr'},
  h('style',null,`
   .pest-finance-workspace[dir="rtl"] table{direction:rtl!important;text-align:right!important;}
   .pest-finance-workspace[dir="rtl"] table th:not(.text-center):not(.text-left),.pest-finance-workspace[dir="rtl"] table td:not(.text-center):not(.text-left){text-align:right!important;}
   .pest-finance-workspace[dir="rtl"] table th{vertical-align:middle;white-space:nowrap;}
   .pest-finance-workspace[dir="rtl"] table td[class~="text-end"]{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;}
   .pest-finance-workspace[dir="rtl"] table td[class~="text-center"]{text-align:center!important;}
   .pest-finance-workspace[dir="ltr"] table td[class~="text-end"]{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;}
   .pest-finance-workspace table th,.pest-finance-workspace table td{vertical-align:middle;}
   .pest-finance-workspace .pest-resizable-number{resize:horizontal;overflow:auto;min-width:118px;max-width:min(360px,85vw);width:100%;}
   .pest-finance-workspace .pest-resizable-number:focus-within{position:relative;z-index:12;}
  `),
  h('header',{className:'flex flex-wrap items-center justify-between gap-3'},h('div',null,h('h2',{className:'text-2xl font-extrabold'},masterDirectoryOnly?t('دليل الأكواد والبيانات الأساسية','Master Codes & Master Data'):t('النظام المالي والمحاسبي','Financial & Accounting System')),h('p',{className:'text-xs text-slate-500'},masterDirectoryOnly?t('مكان موحد لكل الأكواد والبيانات الأساسية وربطها بكل الحقول المستخدمة في النظام.','One directory for master codes used throughout the application.'):t('دفتر أستاذ مستقل — لا ترحيل قبل المراجعة والاعتماد','Separate General Ledger — No Posting Before Review & Approval'))),button(busy?t('جارٍ التحديث','Updating'):t('تحديث البيانات','Refresh Data'),refresh,'muted',busy)),
  h('nav',{className:'flex flex-wrap gap-2'},visibleNav.map(x=>button(rtl?x[1]:x[2],()=>{setTab(x[0]);setNotice('');setError('');setScreenTableSearch('');},tab===x[0]?'primary':'muted'))),
  h('div',{className:'grid grid-cols-1 md:grid-cols-4 gap-2 items-end'},field(t('بحث في بيانات الشاشة الحالية','Search current screen data'),screenTableSearch,setScreenTableSearch),searchablePicker(t('الحساب','Account'),screenAccountFilter,setScreenAccountFilter,screenAccountFilterOptions,'global-screen-account-filter'),searchablePicker(t('مركز التكلفة','Cost Center'),screenCostCenterFilter,setScreenCostCenterFilter,screenCostCenterFilterOptions,'global-screen-cost-center-filter'),button(t('مسح فلاتر الحساب ومركز التكلفة','Clear account and cost center filters'),()=>{setScreenAccountFilter('');setScreenCostCenterFilter('');},'muted')),
  noticeElement,content,renderQuickAdd(),statementAttachmentListModal,statementAttachmentPreviewModal,busy?h('p',{className:'text-xs text-slate-500'},'جارٍ تحميل البيانات...'):null,
  h('p',{className:'text-xs text-slate-400'},'الأرصدة القديمة في متابعة المشروعات والعهد لا تُنقل تلقائيًا إلى الحسابات. يلزم إعداد واعتماد الأرصدة الافتتاحية.'))
}
window.PEST_FINANCE_MODULE=FinanceModule;
 window.PEST_FINANCE_MODULE_VERSION="20261125-finance-value-filter-journal-attachments-v23";
})();