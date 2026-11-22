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
const rows=o=>o?Object.entries(o).map(([key,v])=>Object.assign({id:v&&v.id||key,code:v&&v.code||key},v||{})):[];
const id=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now());
const n=v=>Number(v)||0;
const fmt=v=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
const journalSourceLabel=record=>{const sourceType=String(record&&record.sourceType||'manual');return ({invoice:'فاتورة',cash:'الخزينة',bankLine:'البنك',projectEvent:'حدث مشروع',cashCustody:'عهدة شخصية',cashCustodyTransfer:'تحويل عهدة',partnerCurrentAccountTransfer:'تحويل جاري شريك',partnerCurrentAccountExpenseCorrection:'تصحيح جاري شريك',journalRevision:'تعديل معتمد لقيد',manual:'يدوي'}[sourceType]||sourceType||'يدوي');};
const dl=(name,txt)=>{const b=new Blob([txt],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);};
function FinanceModule(props){
 const {db,currentUser,rtl:rtlProp,language,workerBase,userDirectory=[],can:permissionCheck}=props;
 const rtl=language?language==="ar":rtlProp!==false;
 const t=(ar,en)=>rtl?ar:en,base=workerBase||window.location.origin;

 const financeEnglishLabels=Object.freeze({
  "النظام المالي والمحاسبي":"Financial & Accounting System",
  "دفتر أستاذ مستقل — لا ترحيل قبل المراجعة والاعتماد":"Separate General Ledger — No Posting Before Review & Approval",
  "ملخص مالي":"Financial Overview","القيود اليومية":"Journal Entries","المراجعة والاعتماد":"Review & Approval",
  "فواتير العملاء والموردين":"Customer & Supplier Invoices","الإجراءات المحولة إليّ":"Tasks Assigned to Me",
  "كشوف الأطراف والعاملين":"Party & Employee Statements","البيانات الأساسية والاستيراد":"Master Data & Import",
  "دليل الحسابات":"Chart of Accounts","مراكز التكلفة":"Cost Centers","المخزون والأكواد":"Inventory & Item Codes",
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
  "دليل الحسابات":"Chart of Accounts","البيانات الأساسية والاستيراد":"Master Data & Import",
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

 const financeTabAreas={inventoryMovements:'inventory',overview:"overview",journal:"journal",review:"review",invoices:"invoices",assignments:"assignments",partyStatements:"partyStatements",partnerCurrent:"partyStatements",masters:"masters",accounts:"accounts",centers:"centers",inventory:"inventory",cash:"cash",bank:"bank",tax:"tax",reports:"reports",accountAnalysis:"reports"};
 const financeMasterAreas={parties:"masters",chartOfAccounts:"accounts",costCenters:"centers",items:"inventory",itemGroups:"inventory",warehouses:"inventory",bankAccounts:"bank",taxCodes:"tax"};
 const canFinance=(area,action="view")=>{
  if(currentUser&&currentUser.role==="admin")return true;
  if(typeof permissionCheck==="function")return permissionCheck("financial_"+area,action);
  const permissions=currentUser&&currentUser.permissions||{},specific=permissions["financial_"+area];
  if(specific&&typeof specific==="object")return specific[action]===true;
  const hasScoped=Object.keys(financeTabAreas).some(key=>permissions["financial_"+key]&&typeof permissions["financial_"+key]==="object");
  return !hasScoped&&Boolean(permissions.financial&&permissions.financial[action]===true);
 };
 const financeAreaForMaster=kind=>financeMasterAreas[kind]||"masters";
 const [tab,setTab]=React.useState('overview'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
 const [master,setMaster]=React.useState({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},settings:{},inventory:{balances:{}}});
 const [inventoryMovements,setInventoryMovements]=React.useState([]);
 const [documents,setDocuments]=React.useState([]),[journalRecords,setJournalRecords]=React.useState([]),[review,setReview]=React.useState([]),[periodJournals,setPeriodJournals]=React.useState([]),[balanceJournals,setBalanceJournals]=React.useState([]),[accountingStartMonth,setAccountingStartMonth]=React.useState('');
 const [journalModal,setJournalModal]=React.useState(null),[journalModalDraft,setJournalModalDraft]=React.useState(null);
 const [clients,setClients]=React.useState([]),[vendors,setVendors]=React.useState([]),[projects,setProjects]=React.useState([]);
 const [period,setPeriod]=React.useState({from:today().slice(0,7),to:today().slice(0,7)}),[report,setReport]=React.useState('trial');
 const [assignmentItems,setAssignmentItems]=React.useState([]),[sentAssignmentItems,setSentAssignmentItems]=React.useState([]),[selectedAssignmentId,setSelectedAssignmentId]=React.useState(''),[assignmentLines,setAssignmentLines]=React.useState([]),[assignmentHeader,setAssignmentHeader]=React.useState({}),[assignmentBusy,setAssignmentBusy]=React.useState(false),[assignmentInstruction,setAssignmentInstruction]=React.useState('مراجعة تصنيف البنود وتحديد الأكواد المخزنية أو حسابات المصروفات'),[assignmentUserUid,setAssignmentUserUid]=React.useState(''),[forwardUserUid,setForwardUserUid]=React.useState(''),[forwardInstruction,setForwardInstruction]=React.useState('استكمال ومراجعة بيانات الفاتورة');
 const [selected,setSelected]=React.useState(null),[offset,setOffset]=React.useState('6100');
 const [invoiceDecisionDoc,setInvoiceDecisionDoc]=React.useState(null);
 const [quickAddType,setQuickAddType]=React.useState(''),[quickAddTarget,setQuickAddTarget]=React.useState(null),[quickAddParent,setQuickAddParent]=React.useState(null),[quickAddOriginalCode,setQuickAddOriginalCode]=React.useState(''),[quickAddForm,setQuickAddForm]=React.useState({code:'',name:'',active:true,type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',warehouseCode:'default',projectCode:'',taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'customer',phone:'',taxNumber:'',email:'',address:''});
 const [masterForm,setMasterForm]=React.useState({kind:'chartOfAccounts',code:'',name:'',type:'asset',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',projectCode:'',warehouseCode:'default',taxType:'vat',rate:'0',effectiveFrom:today()});
 const [journal,setJournal]=React.useState({id:'',date:today(),description:'',reference:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});
 const [invoice,setInvoice]=React.useState({id:'',type:'purchase',date:today(),number:'',partyId:'',partyName:'',partyTaxNumber:'',currency:'EGP',taxCode:'VAT-IN-14',taxRate:'14',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
 const [invoiceTypeManuallySelected,setInvoiceTypeManuallySelected]=React.useState(false);
 const [invoiceFile,setInvoiceFile]=React.useState(null),[invoicePartySearch,setInvoicePartySearch]=React.useState(''),[cashPartySearch,setCashPartySearch]=React.useState(''),[statementPartySearch,setStatementPartySearch]=React.useState(''),[ocrSuggestions,setOcrSuggestions]=React.useState({party:null,items:[]}),[cash,setCash]=React.useState({movementType:'customer_receipt',date:today(),amount:'',description:'',reference:'',partyType:'customer',partyId:'',partyName:'',employeeUid:'',employeeName:'',cashAccountCode:'1110',bankAccountCode:'1120',offsetAccountCode:'6100',projectCode:'',currency:'EGP'});
 const [cashHistorySearch,setCashHistorySearch]=React.useState(''),[masterViewKind,setMasterViewKind]=React.useState('customers');
 const [bankFile,setBankFile]=React.useState(null),[bankRows,setBankRows]=React.useState([]),[bankAccount,setBankAccount]=React.useState('1120');
 const [search,setSearch]=React.useState(''),[masterPartySearch,setMasterPartySearch]=React.useState(''),[screenTableSearch,setScreenTableSearch]=React.useState('');
 const [masterImportKind,setMasterImportKind]=React.useState('customers'),[masterImportRows,setMasterImportRows]=React.useState([]),[masterImportName,setMasterImportName]=React.useState('');
 const [selectedMasterCodes,setSelectedMasterCodes]=React.useState([]);
 const [partyStatement,setPartyStatement]=React.useState({type:'account',id:''}),[partyRows,setPartyRows]=React.useState([]);
 const [partnerCurrentAccounts,setPartnerCurrentAccounts]=React.useState([]),[partnerCurrentSelectedUid,setPartnerCurrentSelectedUid]=React.useState(''),[partnerCurrentSearch,setPartnerCurrentSearch]=React.useState(''),[partnerCurrentAttachmentView,setPartnerCurrentAttachmentView]=React.useState(null);
 const [accountDetailCode,setAccountDetailCode]=React.useState(''),[statementJournalId,setStatementJournalId]=React.useState('');
 const [collapsedPanels,setCollapsedPanels]=React.useState({});
 const [journalPickerSearch,setJournalPickerSearch]=React.useState({}),[journalPickerOpen,setJournalPickerOpen]=React.useState({});
 const [accountAnalysisCode,setAccountAnalysisCode]=React.useState(''),[accountAnalysisGroupKey,setAccountAnalysisGroupKey]=React.useState(''),[accountAnalysisSearch,setAccountAnalysisSearch]=React.useState('');
 const [statementAttachmentIndex,setStatementAttachmentIndex]=React.useState({});
 const [statementAttachmentList,setStatementAttachmentList]=React.useState(null),[statementAttachmentPreview,setStatementAttachmentPreview]=React.useState(null);
 const statementAttachmentCacheRef=React.useRef(new Set());
 const api=async(path,method,body)=>{
  const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;
  if(!auth)throw new Error(t('جلسة الدخول انتهت. أعد تسجيل الدخول.','Your session expired. Sign in again.'));
  const token=await auth.getIdToken();
  const response=await fetch(base+'/finance'+(path||''),{method:method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
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
    const updates={};chunk.forEach(([key])=>{updates[key]=found.get(key)||[];});setStatementAttachmentIndex(previous=>Object.assign({},previous,updates));
   }catch(error){chunk.forEach(([key])=>statementAttachmentCacheRef.current.delete(key));setError(error.message||String(error));return;}
  }
 };
 const loadStatementAttachments=records=>loadStatementAttachmentReferences((records||[]).flatMap(statementAttachmentReferences));
 const statementAttachmentsForReferences=references=>{
  const found=new Map();(references||[]).forEach(reference=>{const key=statementAttachmentKey(reference);(statementAttachmentIndex[key]||[]).forEach(attachment=>found.set(key+":"+attachment.id,Object.assign({},attachment,{entityType:reference.entityType,entityId:reference.entityId})));});return Array.from(found.values());
 };
 const openStatementAttachmentFile=async attachment=>{
  setBusy(true);setError('');
  try{
   const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;if(!auth)throw new Error("جلسة الدخول انتهت. أعد تسجيل الدخول.");
   const token=await auth.getIdToken(),url=base+"/attachments/file?entityType="+encodeURIComponent(attachment.entityType)+"&entityId="+encodeURIComponent(attachment.entityId)+"&id="+encodeURIComponent(attachment.id);
   const response=await fetch(url,{headers:{Authorization:"Bearer "+token}});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"تعذر فتح المرفق.");}
   const blob=await response.blob(),mime=String(attachment.mimeType||blob.type||"").toLowerCase();
   if(mime.includes("spreadsheet")||mime==="application/vnd.ms-excel"){
    if(window.XLSX){const workbook=window.XLSX.read(await blob.arrayBuffer(),{type:"array"}),sheet=workbook.Sheets[workbook.SheetNames[0]],rows=sheet?window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",blankrows:false}).slice(0,250).map(row=>row.slice(0,24)):[];setStatementAttachmentPreview({kind:"table",fileName:attachment.fileName,rows});}
    else{const objectUrl=URL.createObjectURL(blob),link=document.createElement("a");link.href=objectUrl;link.download=attachment.fileName||"attachment";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);}
   }else if(mime==="text/plain"||mime==="text/csv")setStatementAttachmentPreview({kind:"text",fileName:attachment.fileName,text:(await blob.text()).slice(0,500000)});
   else if(["application/pdf","image/jpeg","image/png","image/webp"].includes(mime))setStatementAttachmentPreview(previous=>{if(previous&&previous.url)URL.revokeObjectURL(previous.url);return {kind:"media",fileName:attachment.fileName,mimeType:mime,url:URL.createObjectURL(blob)};});
   else{const objectUrl=URL.createObjectURL(blob),link=document.createElement("a");link.href=objectUrl;link.download=attachment.fileName||"attachment";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);setNotice("هذا النوع من الملفات لا يدعم المعاينة داخل النظام؛ بدأ تنزيل الملف.");}
   setStatementAttachmentList(null);
  }catch(error){setError(error.message||String(error));}finally{setBusy(false);}
 };
 const statementAttachmentActionForReferences=references=>{
  const attachments=statementAttachmentsForReferences(references);if(!attachments.length)return null;
  return h("button",{type:"button",title:attachments.map(item=>item.fileName).join("، "),className:"inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 whitespace-nowrap",onClick:event=>{event.stopPropagation();if(attachments.length===1)void openStatementAttachmentFile(attachments[0]);else setStatementAttachmentList({title:"مرفقات الحركة",attachments});}},"📎 "+(attachments.length===1?"مرفق":String(attachments.length)+" مرفقات"));
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
 const refresh=async()=>{
  setBusy(true);setError('');
  try{
   const b=await api('?resource=bootstrap');
   const [r,d,j]=await Promise.all([
    canFinance('review','view')?api('?resource=review'):Promise.resolve({items:{}}),
    ['invoices','journal','cash','bank'].some(area=>canFinance(area,'view'))?api('?resource=documents'):Promise.resolve({items:{}}),
    canFinance('journal','view')?api('?resource=journals'):Promise.resolve({items:{}})
   ]);
   setMaster(previous=>Object.assign({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},settings:{},inventory:{balances:{},movements:{}}},previous,b,{inventory:Object.assign({},previous.inventory||{},{balances:previous.inventory&&previous.inventory.balances||{},movements:previous.inventory&&previous.inventory.movements||{}})}));
   const partyRows=rows(b.parties||{});
   setClients(partyRows.filter(item=>item.partyType==='customer'));
   setVendors(partyRows.filter(item=>item.partyType==='vendor'));
   setAccountingStartMonth(b.settings&&b.settings.accountingStartMonth||'');
   setReview(rows(r.items).filter(item=>['pending_review','duplicate_review'].includes(item.status)).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
   setDocuments(rows(d.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
   setJournalRecords(rows(j.items).sort((a,b)=>n(b.postedAt||b.createdAt)-n(a.postedAt||a.createdAt)));
   if((tab==='inventory'||tab==='inventoryMovements'||(tab==='reports'&&report==='balance'))&&canFinance('inventory','view'))await loadInventoryMovements();
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
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
 const openAssignment=assignment=>{
  setSelectedAssignmentId(assignment.id);
  setAssignmentLines((assignment.invoice&&assignment.invoice.lines||[]).map(x=>Object.assign({},x)));
  setAssignmentHeader(Object.assign({},assignment.invoice||{}));
  setForwardUserUid('');setForwardInstruction('استكمال ومراجعة بيانات الفاتورة');
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
  const assignment=assignmentItems.find(x=>x.id===selectedAssignmentId);if(!assignment)return;
  setAssignmentBusy(true);setError('');
  try{
   const lines=assignmentLines.map(line=>Object.assign({},line,{quantity:line.quantity===''?'':n(line.quantity),unitPrice:line.unitPrice===''?'':n(line.unitPrice),discount:line.discount===''?'':n(line.discount)}));
   await api('', 'POST',{action:'forwardInvoiceAssignment',assignmentId:assignment.id,nextAssigneeUid:forwardUserUid,instruction:forwardInstruction,invoice:assignmentHeader,lines});
   setNotice("تم تحويل الفاتورة للمستخدم التالي بنجاح، مع الاحتفاظ بالمرفقات وسجل التحويلات السابقة.");
   setSelectedAssignmentId('');setAssignmentLines([]);setAssignmentHeader({});
   await refreshAssignments();await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setAssignmentBusy(false);}
 };
 const cancelAssignedInvoice=async()=>{
  if(!canFinance("assignments","edit")){setError("ليس لديك صلاحية إلغاء المستند المحول.");return;}
  const assignment=assignmentItems.find(x=>x.id===selectedAssignmentId);
  if(!assignment)return;
  if(!window.confirm("إلغاء الفاتورة المحولة إليك؟ ستُغلق المهمة وتُزال الفاتورة من المراجعة، مع الاحتفاظ بالمرفقات وسجل التحويل."))return;
  setAssignmentBusy(true);setError("");
  try{
   await api("","POST",{action:"deleteInvoice",id:assignment.invoiceId,reason:"إلغاء من المستخدم المحال إليه"});
   setNotice("تم إلغاء الفاتورة المحولة وإغلاق المهمة. تم الاحتفاظ بالمرفقات وسجل التحويل.");
   setSelectedAssignmentId("");setAssignmentLines([]);setAssignmentHeader({});
   await refreshAssignments();await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setAssignmentBusy(false);}
 };
 const loadPeriod=async()=>{
  setBusy(true);
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
  }
  catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 React.useEffect(()=>{refresh();if(db){Promise.all([db.ref('clients').once('value'),db.ref('vendors').once('value'),db.ref('projects').once('value')]).then(a=>{setClients(rows(a[0].val()));setVendors(rows(a[1].val()));setProjects(rows(a[2].val()));}).catch(e=>console.warn(e));}},[]);
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
    setReview(list);
    setSelected(old=>old&&!list.some(item=>item.id===old.id)?null:old);
   }catch(error){if(active)setError(error.message||String(error));}
   finally{loading=false;}
  };
  void sync();
  const timer=window.setInterval(sync,15000);
  const onVisibility=()=>{if(document.visibilityState==='visible')void sync();};
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
 },[tab,currentUser&&currentUser.uid]);
 React.useEffect(()=>{if(['overview','reports','accountAnalysis','partyStatements','tax','centers'].includes(tab)&&canFinance(financeTabAreas[tab],"view"))loadPeriod();},[tab,period.from,period.to,currentUser&&currentUser.uid]);
 const loadParty=async()=>{
  if(!partyStatement.id){setError('اختر العميل أو المورد أولاً.');return;}
  setBusy(true);setError('');
  try{
   const result=await api('?resource=party&type='+encodeURIComponent(partyStatement.type)+'&id='+encodeURIComponent(partyStatement.id));
   const entries=[];
   Object.values(result.entries||{}).forEach(function(periodRows){Object.values(periodRows||{}).forEach(function(entry){entries.push(entry);});});
   entries.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''));});
   setPartyRows(entries);
   void loadStatementAttachments(entries);
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const accounts=rows(master.chartOfAccounts).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
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
React.useEffect(()=>{if(tab==='partnerCurrent'&&canFinance('partyStatements','view'))void loadPartnerCurrentAccounts();},[tab,currentUser&&currentUser.uid]);
const posting=accounts.filter(a=>!a.isGroup&&a.active!==false);
 const centers=rows(master.costCenters),activeCenters=centers.filter(x=>x.active!==false);
 const items=rows(master.items),activeItems=items.filter(x=>x.active!==false);
 const financialParties=rows(master.parties);
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
  }else if(kind==='items'){
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

 const updateJ=(i,k,v)=>setJournal(o=>Object.assign({},o,{lines:o.lines.map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const updateJournalLineAccount=(index,accountCode)=>setJournal(old=>Object.assign({},old,{lines:old.lines.map((line,i)=>{if(i!==index)return line;const currentAccount=posting.find(item=>String(item.code)===String(line.accountCode)),nextAccount=posting.find(item=>String(item.code)===String(accountCode)),currentType=currentAccount&&currentAccount.subledgerType||line.partyType||"",nextType=nextAccount&&nextAccount.subledgerType||"",keepParty=Boolean(nextType&&currentType===nextType&&line.partyId);return Object.assign({},line,{accountCode,partyType:nextType,partyId:keepParty?line.partyId:""});})}));
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
 const assets=sumFrom(balanceTrial,'asset'),liabilities=balanceTrial.filter(x=>x.account.type==='liability').reduce((sum,x)=>sum+x.amount.credit-x.amount.debit,0);
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
 const select=(label,value,onChange,options)=>h('label',{className:'block text-sm font-bold text-slate-700'},label,h('select',{value:value||'',onChange:e=>onChange(e.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'},options.map(x=>h('option',{key:x.value,value:x.value},x.label))));
 const searchablePicker=(label,value,onChange,options,searchKey)=>{
  const list=Array.isArray(options)?options:[];
  const selected=list.find(item=>String(item.value)===String(value||'')),hasQuery=Object.prototype.hasOwnProperty.call(journalPickerSearch,searchKey);
  const query=hasQuery?String(journalPickerSearch[searchKey]||''):String(selected&&selected.label||'');
  const opened=Boolean(journalPickerOpen[searchKey]),needle=normalizeMatch(query);
  const matches=list.filter(item=>!needle||normalizeMatch(item.label).includes(needle)).slice(0,10);
  const choose=item=>{
   onChange(item.value);
   setJournalPickerSearch(old=>Object.assign({},old,{[searchKey]:String(item.label||'')}));
   setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:false}));
  };
  return h('div',{className:'relative min-w-0 text-sm font-bold text-slate-700'},label,
   h('input',{type:'search',value:query,onFocus:()=>{setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:true}));setJournalPickerSearch(old=>Object.assign({},old,{[searchKey]:''}));},onChange:e=>{setJournalPickerSearch(old=>Object.assign({},old,{[searchKey]:e.target.value}));setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:true}));},onKeyDown:e=>{if(e.key==='Escape')setJournalPickerOpen(old=>Object.assign({},old,{[searchKey]:false}));else if(e.key==='Enter'&&matches.length){e.preventDefault();choose(matches[0]);}},placeholder:'ابحث بالاسم أو الكود...',autoComplete:'off','aria-autocomplete':'list',className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'}),
   opened?h('div',{className:'absolute z-[80] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl'},matches.length?matches.map((item,index)=>h('button',{key:String(item.value)+'-'+index,type:'button',onMouseDown:e=>e.preventDefault(),onClick:()=>choose(item),className:'block w-full border-b border-slate-100 px-3 py-2 text-start text-xs font-normal hover:bg-blue-50 last:border-0'},h('span',{className:'font-bold'},String(item.label||'')))):h('div',{className:'p-3 text-xs font-normal text-slate-500'},'لا توجد نتائج مطابقة')):null
  );
 };
 const searchablePickerWithAdd=(label,value,onChange,options,kind,searchKey,defaults)=>searchablePicker(label,value,next=>{
  if(next==='__quick_add__')openQuickAdd(kind,onChange,defaults);
  else onChange(next);
 },(options||[]).concat([{value:'__quick_add__',label:'＋ إضافة كود جديد'}]),searchKey);
 const openQuickAdd=(kind,onCreated,defaults,originalCode)=>{
  if(!canFinance(financeAreaForMaster(kind),originalCode?"edit":"add")){setError("ليس لديك صلاحية إضافة أو تعديل هذا النوع من البيانات.");return;}
  if(quickAddType)setQuickAddParent({type:quickAddType,form:quickAddForm,target:quickAddTarget,originalCode:quickAddOriginalCode});else setQuickAddParent(null);
  setQuickAddType(kind);setQuickAddTarget(()=>onCreated||null);setQuickAddOriginalCode(String(originalCode||''));
  const next=Object.assign({
   code:'',name:'',active:true,companyName:'',englishName:'',type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',
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
 const selectWithAdd=(label,value,onChange,options,kind,defaults)=>select(label,value,function(next){if(next==='__quick_add__'){openQuickAdd(kind,onChange,defaults);}else onChange(next);},(options||[]).concat([{value:'__quick_add__',label:'＋ إضافة كود جديد'}]));
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
   else if(value)onChange({});
  };
  return h('div',{className:'block text-sm font-bold text-slate-700 min-w-0'},label,
   h('input',{type:'search',value:query||'',onChange:e=>updateSearch(e.target.value),onBlur:e=>{
    if(!showResults){const exact=findExactParty(e.target.value);if(exact){onChange(exact);setQuery(partyName(exact));}}
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
    rate:n(f.rate),effectiveFrom:f.effectiveFrom,
    accountCode:kind==='bankAccounts'?(f.accountCode||f.code):undefined
   };
   if(kind==='parties'&&(!item.code||!item.name))throw new Error('أدخل كود واسم المورد/العميل أولاً.');
   if(kind==='parties'&&!['customer','vendor'].includes(item.partyType))throw new Error('حدد نوع الطرف عميل أو مورد.');
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
   }else{
    await refresh();
   }
   const parent=quickAddParent,target=quickAddTarget;
   setError('');
   setNotice(originalCode?'تم حفظ التعديلات على السجل بنجاح.':kind==='parties'
    ?(result.linkedExisting?'تم ربط المورد/العميل بالسجل الرئيسي بنجاح.':'تمت إضافة '+(f.partyType==='vendor'?'المورد':'العميل')+' بنجاح.')
    :'تمت إضافة الكود بنجاح.');
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
  const panelKey=String(tab)+'::'+String(title),collapsed=forceExpandAllFinancialPanels?false:Boolean(collapsedPanels[panelKey]);
  return h('section',{key:panelKey,'data-pest-export-scope':'panel','data-pest-export-title':String(title),className:'rounded-2xl border bg-white p-4 shadow-sm min-w-0'},
   h('div',{className:'mb-2 flex flex-wrap items-start justify-between gap-2'},
    h('div',{className:'min-w-0 flex-1'},h('h3',{className:'font-bold text-lg'},title),sub?h('p',{className:'text-xs text-slate-500 mt-1'},sub):null),
    h('div',{className:'flex flex-wrap items-center gap-2'},!collapsed&&canExportFinancialReport()?exportToolbar(null,title):null,
     h('button',{type:'button','data-pest-export-actions':'true','aria-expanded':!collapsed,'aria-label':(collapsed?'إظهار القسم: ':'إخفاء القسم: ')+String(title),onClick:()=>setCollapsedPanels(previous=>Object.assign({},previous,{[panelKey]:!previous[panelKey]})),className:'shrink-0 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100'},
      h('span',null,collapsed?t('إظهار القسم','Show section'):t('إخفاء القسم','Hide section')),
      h('span',{className:'text-base leading-none'},collapsed?'⌄':'⌃')
     )
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
 const table=(headers,data,scrollStyle)=>{
  const query=String(screenTableSearch||'').trim().toLowerCase();
  const source=Array.isArray(data)?data:[];
  const filtered=query?source.filter(row=>screenSearchText(row).toLowerCase().includes(query)):source;
  const exportTitle=Array.isArray(headers)?headers.slice(0,3).join(" - "):"جدول التقرير";
  return h('div',{'data-pest-export-scope':'table','data-pest-export-title':exportTitle,className:'min-w-0'},
   canExportFinancialReport()?h('div',{className:'flex justify-end mb-1'},exportToolbar(null,exportTitle)):null,
   h('div',{className:'overflow-auto border rounded-xl',style:scrollStyle||undefined},
    h('table',{dir:rtl?'rtl':'ltr',className:'w-full text-sm text-right'},
     h('thead',{className:'bg-slate-100'},h('tr',null,headers.map(x=>h('th',{key:x,className:'p-3 whitespace-nowrap text-right align-middle'},x)))),
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
 const analyticPartyLabel=type=>({customer:"العميل",vendor:"المورد",employeeCustody:"الموظف صاحب العهدة",employeeAdvance:"الموظف صاحب السلفة",partnerCurrentAccount:"الشريك"}[type]||"الطرف التحليلي");
 const analyticPartyOptions=(type,accountCode,currentPartyId)=>{
  let records=[];
  if(type==="customer")records=activeClients.map(item=>({value:String(item.code||item.id),label:partyName(item)+" ("+(item.code||item.id)+")"}));
  else if(type==="vendor")records=activeVendors.map(item=>({value:String(item.code||item.id),label:partyName(item)+" ("+(item.code||item.id)+")"}));
  else if(type==="employeeCustody"||type==="employeeAdvance")records=activeAnalyticUsers.map(user=>({value:String(user.uid),label:(user.fullName||user.username||user.email||user.uid)+" ("+user.uid+")"}));
  else if(type==="partnerCurrentAccount"){
   records=(partnerCurrentAccounts||[]).filter(item=>item&&item.uid&&(!item.accountCode||String(item.accountCode)===String(accountCode))).map(item=>({value:String(item.uid),label:(item.partnerName||item.name||item.username||item.uid)+" ("+item.uid+")"}));
   const partnerIdentity=String(accountCode)==="3202"?user=>String(user.email||"").toLowerCase()==="thabetrabea@gmail.com"||String(user.username||"").toLowerCase()==="thabetrabea":String(accountCode)==="3201"?user=>String(user.username||"").toLowerCase()==="haitham ibrahim mahmoud":()=>false;
   activeAnalyticUsers.filter(partnerIdentity).forEach(user=>records.push({value:String(user.uid),label:(user.fullName||user.username||user.email||user.uid)+" ("+user.uid+")"}));
  }
  const unique=[],seen=new Set();
  records.forEach(item=>{if(item.value&&!seen.has(String(item.value))){seen.add(String(item.value));unique.push(item);}});
  if(currentPartyId&&!seen.has(String(currentPartyId)))unique.unshift({value:String(currentPartyId),label:"الطرف المسجل حاليًا ("+currentPartyId+") — تحقق من بياناته"});
  return [{value:"",label:"اختر "+analyticPartyLabel(type)},...unique];
 };
 const openJournalModal=doc=>{
  const normalizedLines=(doc.lines||[]).map(line=>{
   const account=posting.find(item=>String(item.code)===String(line.accountCode));
   return Object.assign({},line,{partyType:line.partyType||account&&account.subledgerType||"",partyId:line.partyId||""});
  });
  setJournalModal(Object.assign({},doc));
  setJournalModalDraft({id:doc.id,sourceId:doc.sourceId||"",journalId:doc.journalId||"",type:doc.type||"journal",number:doc.number||doc.journalNumber||'',date:doc.date||today(),description:doc.description||"",reference:doc.reference||"",currency:doc.currency||"EGP",sourceType:doc.sourceType||"manual",projectCode:doc.projectCode||"",reversalOf:doc.reversalOf||"",revisionOf:doc.revisionOf||"",revisionNotes:doc.revisionNotes||"",pendingRevisionId:doc.pendingRevisionId||"",revisedByJournalId:doc.revisedByJournalId||"",reversalJournalId:doc.reversalJournalId||"",reversedByJournalId:doc.reversedByJournalId||"",status:doc.status||"posted",lines:normalizedLines});
 };
 const updateJournalModalLine=(index,key,value)=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).map((line,i)=>i===index?Object.assign({},line,{[key]:value}):line)}));
 const updateJournalModalAccount=(index,accountCode)=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).map((line,i)=>{if(i!==index)return line;const currentAccount=posting.find(item=>String(item.code)===String(line.accountCode)),nextAccount=posting.find(item=>String(item.code)===String(accountCode)),currentType=currentAccount&&currentAccount.subledgerType||line.partyType||"",nextType=nextAccount&&nextAccount.subledgerType||"",keepParty=Boolean(nextType&&currentType===nextType&&line.partyId);return Object.assign({},line,{accountCode,partyType:nextType,partyId:keepParty?line.partyId:""});})}));
 const saveJournalModal=async()=>{
  if(!journalModalDraft)return;
  const draft=journalModalDraft;
  const pendingReview=draft.type==="journal"&&["pending_review","needs_correction"].includes(draft.status);
  const openedFromReview=tab==="review"&&pendingReview;
  if(!pendingReview){setError("القيد المرحّل لا يُعدّل مباشرة. استخدم «تعديل القيد» لإنشاء نسخة مراجعة مرتبطة بالأصل.");return;}
  if(!canFinance("review","edit")){setError("ليس لديك صلاحية تعديل القيود داخل المراجعة.");return;}
  const missingAnalytic=(draft.lines||[]).map((line,index)=>({line,index,account:posting.find(item=>String(item.code)===String(line.accountCode))})).find(item=>item.account&&item.account.subledgerType&&!String(item.line.partyId||"").trim());
  if(missingAnalytic){setError("السطر "+(missingAnalytic.index+1)+": الحساب "+missingAnalytic.account.code+" — "+missingAnalytic.account.name+" يتطلب اختيار "+analyticPartyLabel(missingAnalytic.account.subledgerType)+". اختر الطرف من قائمة الطرف التحليلي قبل الحفظ.");return;}
  setBusy(true);setError("");
  try{
   const result=await api("","POST",{action:"updateReviewJournal",id:draft.id,journal:{date:draft.date,description:draft.description,reference:draft.reference,revisionNotes:draft.revisionNotes||""},lines:draft.lines});
   setNotice((result.errors||[]).length?"تم حفظ التعديلات وما زالت هناك أخطاء يجب تصحيحها قبل الاعتماد.":"تم حفظ التعديلات وإبقاء القيد في مسار المراجعة دون تغيير الأرصدة.");
   setJournalModal(null);setJournalModalDraft(null);
   if(openedFromReview){await refreshReviewQueue(true);await openReviewItem({id:draft.id});}
   else await refresh();
   await loadPeriod();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const renderReviewJournalEditor=()=>{
  if(tab!=="review"||!journalModal||!journalModalDraft)return null;
  const draft=journalModalDraft,editable=draft.type==="journal"&&["pending_review","needs_correction"].includes(draft.status)&&canFinance("review","edit");
  const lines=Array.isArray(draft.lines)?draft.lines:[];
  const debit=lines.reduce((sum,line)=>sum+n(line.debit),0),credit=lines.reduce((sum,line)=>sum+n(line.credit),0),difference=debit-credit;
  const editLine=(index,key,value)=>updateJournalModalLine(index,key,value);
  const lineCards=lines.map((line,index)=>{
   const account=posting.find(item=>String(item.code)===String(line.accountCode)),analyticType=account&&account.subledgerType||line.partyType||"",analyticOptions=analyticType?analyticPartyOptions(analyticType,line.accountCode,line.partyId):[];
   return h("div",{key:index,className:"grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-slate-50 p-3"},
    h("div",{className:"md:col-span-2"},selectWithAdd("كود / اسم الحساب",line.accountCode||"",value=>{
     const selectedAccount=posting.find(item=>String(item.code)===String(value));
     const currentLine=(journalModalDraft.lines||[])[index]||{},currentAccount=posting.find(item=>String(item.code)===String(currentLine.accountCode));
     const currentType=currentAccount&&currentAccount.subledgerType||currentLine.partyType||"",nextType=selectedAccount&&selectedAccount.subledgerType||"";
     const keepParty=Boolean(nextType&&currentType===nextType&&currentLine.partyId);
     setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).map((row,i)=>i===index?Object.assign({},row,{accountCode:value,partyType:nextType,partyId:keepParty?row.partyId||"":""}):row)}));
    },posting.map(item=>({value:item.code,label:item.code+" — "+item.name})))),
    h("div",{className:"md:col-span-2"},field("البيان",line.description||"",value=>editLine(index,"description",value))),
    h("div",{className:"md:col-span-1"},field("مدين",line.debit??"",value=>editLine(index,"debit",value),"number")),
    h("div",{className:"md:col-span-1"},field("دائن",line.credit??"",value=>editLine(index,"credit",value),"number")),
    h("div",{className:"md:col-span-1"},selectWithAdd("مركز التكلفة",line.costCenterId||"",value=>editLine(index,"costCenterId",value),[{value:"",label:"بدون مركز تكلفة"}].concat(activeCenters.map(item=>({value:item.code,label:item.code+" — "+item.name}))))),
    h("div",{className:"md:col-span-2"},analyticType?select("الطرف التحليلي — "+analyticPartyLabel(analyticType),line.partyId||"",value=>{editLine(index,"partyId",value);editLine(index,"partyType",analyticType);},analyticOptions):h("div",{className:"rounded-lg border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-500"},"هذا الحساب لا يتطلب طرفًا تحليليًا")),
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
    h("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-3"},
     field("تاريخ القيد",draft.date||"",value=>setJournalModalDraft(old=>Object.assign({},old,{date:value})),"date"),
     field("المرجع",draft.reference||"",value=>setJournalModalDraft(old=>Object.assign({},old,{reference:value}))),
     field("بيان القيد",draft.description||"",value=>setJournalModalDraft(old=>Object.assign({},old,{description:value})))
    ),
    h("div",{className:"flex flex-wrap gap-2 text-xs"},
     h("span",{className:"rounded-full bg-slate-100 px-3 py-1"},"المصدر: "+(draft.sourceType||"manual")),
     h("span",{className:"rounded-full bg-amber-50 text-amber-800 px-3 py-1"},"الحالة: "+status(draft.status)),
     h("span",{className:"rounded-full bg-indigo-50 text-indigo-800 px-3 py-1"},"العملة: EGP")
    ),
    draft.sourceType==="journalRevision"?h("label",{className:"block text-sm font-bold"},"ملاحظات التعديل / سبب إرجاع القيد",h("textarea",{value:draft.revisionNotes||"",onChange:event=>setJournalModalDraft(old=>Object.assign({},old,{revisionNotes:event.target.value})),rows:3,disabled:!editable,className:"mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal"})):null,
    h("div",{className:"rounded-xl border border-indigo-100 overflow-hidden"},
     h("div",{className:"flex flex-wrap items-center justify-between gap-2 bg-indigo-50 p-3"},
      h("b",null,"سطور القيد المحاسبي"),
      button("إضافة سطر جديد",()=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).concat([{accountCode:"6100",description:"",debit:0,credit:0,costCenterId:draft.projectCode||"",projectCode:draft.projectCode||"",partyType:"",partyId:""}])})),"primary",!editable||lines.length>=100)
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
     button("حفظ التعديلات وإبقاء القيد للمراجعة",saveJournalModal,"primary",busy||!editable)
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
    setNotice((result.deleted?"تم حذف القيد وكل القيود المرتبطة به ("+(result.deletedIds||[doc.id]).length+" قيد/قيود) وتحديث الأستاذ والفترات.":"")+(result.sourceCancelled?" تم إلغاء المستند المصدر محاسبيًا.":"")+warningText);
    setJournalModal(null);setJournalModalDraft(null);await refresh();await loadPeriod();
   }
   catch(e){setError(e.message||String(e));}
   finally{setBusy(false);}
  };
const submitJournal=async()=>{
  if(!canFinance("journal",journal.id?"edit":"add")){setError("ليس لديك صلاحية حفظ أو تعديل القيود اليومية.");return;}
  setBusy(true);setError('');try{const payload=Object.assign({},journal);const result=await api('', 'POST',Object.assign({action:'submitJournal'},payload));setNotice(result.status==='pending_review'?'تم إرسال القيد إلى المراجعة':'تم حفظ القيد مع أخطاء: '+(result.errors||[]).join('، '));if(result.status==='pending_review')setJournal({id:'',date:today(),description:'',reference:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});else setJournal(o=>Object.assign({},o,{id:result.id}));await refresh();}catch(e){setError(e.message||String(e));}finally{setBusy(false);}
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
  setBusy(true);setError('');
  try{const r=await api('', 'POST',{action:'review',id:selected.id,decision,reason:decision==='approve'?'تمت المراجعة والاعتماد':decision==='return'?'إعادة للتصحيح':'رفض المستند',allowDuplicate:decision==='approveDuplicate'});setNotice(r.status==='posted'?'تم الاعتماد والترحيل': 'تم تحديث المستند');setSelected(null);await refresh();await loadPeriod();}
  catch(e){setError(e.message||String(e));}finally{setBusy(false);}
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
    effectiveFrom:['effectivefrom','بداية السريان','تاريخ السريان']
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
 ['overview','ملخص مالي','Financial Summary'],['journal','القيود اليومية','Journal Entries'],['review','المراجعة والاعتماد','Review & Approval'],['invoices','فواتير العملاء والموردين','Customer & Supplier Invoices'],['assignments','الإجراءات المحولة إليّ','Tasks Assigned to Me'],['partyStatements','كشوف الحسابات والأطراف','Account & Party Statements'],['partnerCurrent','جاري الشركاء',"Partners' Current Accounts"],['masters','البيانات الأساسية والاستيراد','Master Data & Import'],['accounts','دليل الحسابات','Chart of Accounts'],['centers','مراكز التكلفة','Cost Centers'],['inventory','المخزون والأكواد','Inventory & Item Codes'],['inventoryMovements','حركة المخزن','Inventory Movements'],['cash','الخزينة والتحصيل والسداد','Cash, Receipts & Payments'],['bank','كشوف البنوك','Bank Statements'],['tax','الضرائب','Taxes'],['accountAnalysis','تحليل الحسابات','Account Analysis'],['reports','القوائم المالية','Financial Statements']
 ];
 const visibleNav=nav.filter(item=>canFinance(financeTabAreas[item[0]],"view"));
 React.useEffect(()=>{
  const area=financeTabAreas[tab];
  if(area&&!canFinance(area,"view")){
   const first=nav.find(item=>canFinance(financeTabAreas[item[0]],"view"));
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
   const analyticType=account.subledgerType||line.partyType||'';
   const pickerKey="journal-entry-"+String(line.id||index);
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl bg-slate-50 p-3 border'},
    h('div',{className:'md:col-span-12 text-xs font-extrabold text-slate-500'},'السطر '+(index+1)),
    h('div',{className:'md:col-span-3'},searchablePickerWithAdd('الحساب',line.accountCode,function(v){updateJournalLineAccount(index,v);},posting.map(function(a){return {value:a.code,label:a.code+' — '+a.name};}),'chartOfAccounts',pickerKey+'-account')),
    h('div',{className:'md:col-span-2'},field('البيان',line.description,function(v){updateJ(index,'description',v);})),
    h('div',{className:'md:col-span-1'},field('مدين',line.debit,function(v){updateJ(index,'debit',v);},'number')),
    h('div',{className:'md:col-span-1'},field('دائن',line.credit,function(v){updateJ(index,'credit',v);},'number')),
    h('div',{className:'md:col-span-2'},searchablePickerWithAdd('مركز التكلفة',line.costCenterId,function(v){updateJ(index,'costCenterId',v);},[{value:'',label:'بدون مركز تكلفة'}].concat(activeCenters.map(function(x){return {value:x.code,label:x.code+' — '+x.name};})),'costCenters',pickerKey+'-center')),
    h('div',{className:'md:col-span-2'},analyticType?searchablePicker('الطرف التحليلي — '+analyticPartyLabel(analyticType),line.partyId||'',function(v){updateJ(index,'partyType',analyticType);updateJ(index,'partyId',v);},analyticPartyOptions(analyticType,line.accountCode,line.partyId),pickerKey+'-party'):h('div',{className:'rounded-lg border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-500'},'هذا الحساب لا يتطلب طرفًا تحليليًا')),
    h('div',{className:'md:col-span-1 flex items-end'},button('حذف',function(){setJournal(function(old){return Object.assign({},old,{lines:old.lines.filter(function(x,j){return j!==index;})});});},'danger',journal.lines.length<=2))
   );
  });
  const addLine = button('＋ إضافة سطر جديد',function(){setJournal(function(old){return Object.assign({},old,{lines:old.lines.concat([{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}])});});});
  const linesPanel = panel('سطور القيد','يجب أن يتساوى المدين والدائن.',h('div',{className:'space-y-3'},...lineCards,addLine));
  const headerPanel = panel('بيانات القيد','قيد مزدوج. لا يتم ترحيله قبل مراجعة مستخدم مخوّل.',h('div',{className:'grid md:grid-cols-3 gap-3'},
   field('التاريخ',journal.date,function(v){setJournal(function(old){return Object.assign({},old,{date:v});});},'date'),
   field('المرجع',journal.reference,function(v){setJournal(function(old){return Object.assign({},old,{reference:v});});}),
   field('البيان',journal.description,function(v){setJournal(function(old){return Object.assign({},old,{description:v});});})
  ));
  const totalsPanel = h('div',{className:'flex flex-wrap gap-4 items-center p-3 bg-white border rounded-xl'},
   h('b',null,'المدين: '+fmt(jDebit)),h('b',null,'الدائن: '+fmt(jCredit)),
   h('b',{className:Math.abs(jDebit-jCredit)<0.01?'text-emerald-700':'text-rose-700'},'الفرق: '+fmt(jDebit-jCredit)),
   button('حفظ وإرسال للمراجعة',submitJournal,'primary',busy||!canFinance("journal",journal.id?"edit":"add"))
  );
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
     h('td',{className:'p-2'},status(posted?'posted':x.status)),
     h('td',{className:'p-2 text-end'},fmt(debit)),
     h('td',{className:'p-2 text-end'},fmt(credit)),
     h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-1'},button('فتح القيد',()=>openJournalModal(x),'muted'),posted&&canFinance('journal','delete')&&canFinance('review','edit')?h('button',{type:'button',disabled:busy,onClick:event=>{event.stopPropagation();void unpostJournalDocument(x);},className:'rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50'},'فك الترحيل'):null))
    );
   });
   const draftsPanel=panel('سجل القيود اليومية الموحد','يعرض القيود اليدوية والقيود المرحّلة الناتجة عن فواتير العملاء والموردين والخزينة والبنوك، إضافة إلى قيود أحداث المشروعات والعهد. اضغط أي صف لفتح تفاصيله. التعديل المباشر متاح للقيود اليدوية ومسودات أحداث المشروع والعهد داخل المراجعة، والقيود المرحّلة من المصادر الأخرى تُعالج من المستند الأصلي أو بقيد عكسي.',table(['رقم القيد','التاريخ','البيان','المصدر','الحالة','مدين','دائن','إجراء'],draftRows,{maxHeight:'min(58dvh, 560px)',minHeight:'180px',overflowY:'auto',overscrollBehavior:'auto',overscrollBehaviorY:'auto',scrollbarGutter:'stable'}));
   const modal=journalModal&&journalModalDraft?(()=>{
    const draft=journalModalDraft,manual=!draft.sourceType||draft.sourceType==='manual',posted=draft.status==='posted'||journalRecords.some(x=>x.id===draft.id&&x.status==='posted'),reviewEditable=draft.type==='journal'&&['pending_review','needs_correction'].includes(draft.status);
    const editable=reviewEditable,modalDebit=(draft.lines||[]).reduce((sum,line)=>sum+n(line.debit),0),modalCredit=(draft.lines||[]).reduce((sum,line)=>sum+n(line.credit),0);
    const modalLines=(draft.lines||[]).map((line,index)=>{
     const account=accounts.find(x=>String(x.code)===String(line.accountCode))||{},analyticType=account.subledgerType||line.partyType||'';
     return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-lg border bg-slate-50 p-2'},
      h('div',{className:'md:col-span-3'},editable?selectWithAdd('الحساب',line.accountCode||'',v=>updateJournalModalAccount(index,v),posting.map(x=>({value:x.code,label:x.code+' — '+x.name})),'chartOfAccounts'):field('الحساب',(line.accountCode||'')+' — '+(account.name||''),()=>{},undefined,{disabled:true})),
      h('div',{className:'md:col-span-2'},field('البيان',line.description||'',v=>updateJournalModalLine(index,'description',v),undefined,editable?undefined:{disabled:true})),
      h('div',{className:'md:col-span-1'},field('مدين',line.debit??'',v=>updateJournalModalLine(index,'debit',v),'number',editable?undefined:{disabled:true})),
      h('div',{className:'md:col-span-1'},field('دائن',line.credit??'',v=>updateJournalModalLine(index,'credit',v),'number',editable?undefined:{disabled:true})),
      h('div',{className:'md:col-span-2'},editable?selectWithAdd('مركز التكلفة',line.costCenterId||'',v=>updateJournalModalLine(index,'costCenterId',v),[{value:'',label:'بدون مركز تكلفة'}].concat(activeCenters.map(x=>({value:x.code,label:x.code+' — '+x.name}))),'costCenters'):field('مركز التكلفة',line.costCenterId||'بدون',()=>{},undefined,{disabled:true})),
      h('div',{className:'md:col-span-2'},editable&&analyticType?select('الطرف التحليلي — '+analyticPartyLabel(analyticType),line.partyId||'',v=>{setJournalModalDraft(old=>Object.assign({},old,{lines:old.lines.map((x,i)=>i===index?Object.assign({},x,{partyType:analyticType,partyId:v}):x)}));},analyticPartyOptions(analyticType,line.accountCode,line.partyId)):field('الطرف التحليلي',analyticType?(line.partyId||'لم يتم اختيار طرف'):'غير مطلوب لهذا الحساب',()=>{},undefined,{disabled:true})),
      h('div',{className:'md:col-span-1 flex items-end'},button('حذف',()=>setJournalModalDraft(old=>Object.assign({},old,{lines:old.lines.filter((x,i)=>i!==index)})),'danger',!editable))
     );
    });
    return h('div',{className:'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3',onClick:()=>{setJournalModal(null);setJournalModalDraft(null);}},
     h('div',{className:'w-full max-w-6xl max-h-[92vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl space-y-3',onClick:e=>e.stopPropagation()},
      h('div',{className:'flex flex-wrap items-center justify-between gap-2'},h('h3',{className:'font-bold text-lg'},'تفاصيل القيد: '+(draft.number||draft.id)),button('إغلاق',()=>{setJournalModal(null);setJournalModalDraft(null);},'muted')),
      h('div',{className:'grid md:grid-cols-3 gap-2'},
       field('التاريخ',draft.date||'',v=>setJournalModalDraft(old=>Object.assign({},old,{date:v})),'date',editable?undefined:{disabled:true}),
       field('المرجع',draft.reference||'',v=>setJournalModalDraft(old=>Object.assign({},old,{reference:v})),undefined,editable?undefined:{disabled:true}),
       field('البيان',draft.description||'',v=>setJournalModalDraft(old=>Object.assign({},old,{description:v})),undefined,editable?undefined:{disabled:true})
      ),
      h('div',{className:'flex flex-wrap items-center gap-3 text-sm'},h('b',null,'المصدر: '+journalSourceLabel(draft)),h('b',null,'الحالة: '+status(draft.status)),draft.reversalOf?h('b',null,'قيد عكسي للقيد: '+draft.reversalOf):null,draft.revisionOf?h('b',null,'تعديل للقيد الأصلي: '+draft.revisionOf):null,statementAttachmentAction(draft)),
      draft.sourceType==='journalRevision'?h('label',{className:'block text-sm font-bold'},'ملاحظات التعديل / سبب إعادة القيد للمراجعة',h('textarea',{value:draft.revisionNotes||'',onChange:e=>setJournalModalDraft(old=>Object.assign({},old,{revisionNotes:e.target.value})),rows:3,disabled:!editable,className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'})):null,
      h('div',{className:'space-y-2'},...modalLines,editable?button('إضافة سطر',()=>setJournalModalDraft(old=>Object.assign({},old,{lines:(old.lines||[]).concat([{accountCode:'6100',description:'',debit:0,credit:0,costCenterId:'',partyType:'',partyId:''}])})),'muted'):null),
      h('div',{className:'flex flex-wrap gap-4 rounded-lg border p-3'},h('b',null,'المدين: '+fmt(modalDebit)),h('b',null,'الدائن: '+fmt(modalCredit)),h('b',{className:Math.abs(modalDebit-modalCredit)<0.01?'text-emerald-700':'text-rose-700'},'الفرق: '+fmt(modalDebit-modalCredit))),
      h('div',{className:'flex flex-wrap gap-2'},
       editable?button('حفظ وإرسال التعديلات للمراجعة',saveJournalModal,'primary',busy):null,
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
  return h('div',{className:'space-y-4'},headerPanel,linesPanel,totalsPanel,draftsPanel,modal);
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
    masterForm.kind==='chartOfAccounts'?select('الحساب الأب',masterForm.parentCode,v=>setMasterForm(o=>Object.assign({},o,{parentCode:v})),[{value:'',label:'بدون'},...accounts.filter(a=>a.isGroup).map(a=>({value:a.code,label:a.code+' — '+a.name}))]):null,
    masterForm.kind==='chartOfAccounts'?select('تحليل الطرف',masterForm.subledgerType,v=>setMasterForm(o=>Object.assign({},o,{subledgerType:v})),[{value:'',label:'بدون'},{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'},{value:'employeeCustody',label:'موظف صاحب عهدة'},{value:'employeeAdvance',label:'موظف صاحب سلفة'},{value:'partnerCurrentAccount',label:'شريك — جاري الشركاء'}]):null,
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
  const selectedAssignment=assignmentItems.find(item=>item.id===selectedAssignmentId);
  const inbox=panel('المهام المحولة إليّ','تظهر هنا الفواتير التي حوّلها إليك مستخدم آخر، ويمكنك فتحها من هذه الشاشة أو من شاشة المهام الرئيسية.',h('div',{className:'space-y-2'},assignmentItems.length?assignmentItems.map(item=>h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3'},h('div',{className:'min-w-0'},h('b',{className:'block'},'فاتورة '+(item.invoiceNumber||item.invoice&&item.invoice.number||'بدون رقم')),h('p',{className:'text-xs text-slate-600'},(item.invoiceType==='purchase'?'مورد: ':'عميل: ')+(item.partyName||item.invoice&&item.invoice.partyName||'')+' · '+(item.date||item.invoice&&item.invoice.date||'')),h('p',{className:'text-xs text-slate-500 mt-1'},item.instruction||'')),button(selectedAssignmentId===item.id?'مفتوحة':'فتح المهمة واتخاذ القرار',()=>openAssignment(item),selectedAssignmentId===item.id?'primary':'muted'))):h('p',{className:'text-sm text-slate-500'},'لا توجد مهام مالية محولة إليك.')));
  const sentOutbox=panel('تحويلاتي الصادرة','متابعة كل فاتورة قمت بتحويلها: عند المستكمل، عادت إليك، أو أُرسلت للمراجعة والاعتماد.',h('div',{className:'space-y-2'},sentAssignmentItems.length?sentAssignmentItems.map(item=>{
   const state=item.status==='returned_to_creator'?'عاد إليك':item.status==='sent_for_review'?'أُرسل للمراجعة والاعتماد':item.status==='open'?'عند المستخدم المستكمل':item.status==='completed'?'مكتمل':item.status||'—';
   const canOpenReturned=item.status==='returned_to_creator'&&item.invoice;
   return h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3'},
    h('div',{className:'min-w-0'},h('b',{className:'block'},'فاتورة '+(item.invoice&&item.invoice.number||item.invoiceNumber||item.invoiceId||'بدون رقم')),
     h('p',{className:'text-xs text-slate-600'},(item.invoiceType==='purchase'?'مورد: ':'عميل: ')+(item.invoice&&item.invoice.partyName||item.partyName||'')+' · '+(item.date||item.invoice&&item.invoice.date||'')),
     h('p',{className:'text-xs text-slate-500 mt-1'},'المستخدم: '+(item.assigneeName||'—')+' · الحالة: '+state)),
    canOpenReturned?button('فتح المسودة',()=>{window.PEST_PENDING_FINANCE_INVOICE_ID=item.invoiceId;window.dispatchEvent(new Event('pest-finance-route'));setTab('invoices');},'muted'):null
   );
  }):h('p',{className:'text-sm text-slate-500'},'لا توجد تحويلات صادرة حتى الآن.')));
  if(!selectedAssignment)return h('div',{className:'space-y-4'},inbox,sentOutbox);
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
   attachmentRows.length?table(["اسم الملف","النوع","الحجم","تحميل"],attachmentRows.map(attachment=>h("tr",{key:attachment.id,className:"border-t"},h("td",{className:"p-2"},attachment.fileName||"—"),h("td",{className:"p-2"},attachment.mimeType||"—"),h("td",{className:"p-2"},fmt((Number(attachment.size)||0)/1024)+" KB"),h("td",{className:"p-2"},button("تحميل",()=>downloadFinancialAttachment(selectedAssignment.invoiceId,attachment),"muted"))))):h("p",{className:"text-sm text-slate-500"},"لا توجد مرفقات مسجلة على الفاتورة."),
   h("label",{className:"inline-flex flex-col gap-1 rounded-lg border border-dashed p-3 text-sm font-bold cursor-pointer"},"إضافة أو إعادة رفع مرفق",h("input",{type:"file",accept:"image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt",disabled:assignmentBusy,className:"text-xs font-normal",onChange:e=>{const file=e.target.files&&e.target.files[0];if(file)void retryInvoiceAttachment(file,selectedAssignment.invoiceId).then(()=>refreshAssignments());e.target.value="";}}))
  ));
  const errorsPanel=(inv.errors||[]).length?panel("نواقص الفاتورة المطلوب استكمالها","هذه النواقص لا تمنع إعادة التحويل أو إرسال الملف للمراجعة، لكنها تمنع الاعتماد النهائي حتى تصحيحها.",h("ul",{className:"list-disc pr-5 text-sm text-rose-700"},(inv.errors||[]).map((error,index)=>h("li",{key:index},error)))):null;
  const chainPanel=(inv.assignmentChain||[]).length?panel("سجل التحويلات","المسار السابق للفاتورة.",h("div",{className:"space-y-1 text-sm"},(inv.assignmentChain||[]).map((step,index)=>h("p",{key:index},(index+1)+". "+(step.fromName||step.fromUid)+" ← "+(step.toName||step.toUid)+" · "+new Date(step.at||0).toLocaleString("ar-EG"))))):null;
  const forwardPanel=panel("تحويل لمستخدم آخر","يمكن للمستلم الحالي تحويل الملف مباشرة إلى موظف آخر دون إرجاعه للمرسل الأصلي.",h("div",{className:"grid md:grid-cols-3 gap-2"},select("المستخدم التالي",forwardUserUid,setForwardUserUid,[{value:"",label:"اختر مستخدمًا نشطًا"},...activeForwardUsers.map(user=>({value:user.uid,label:(user.fullName||user.username||user.email)+" — "+(user.jobTitle||"")}))]),field("تعليمات للمستخدم التالي",forwardInstruction,setForwardInstruction),button("تحويل للمستخدم التالي",forwardAssignment,"primary",assignmentBusy||!forwardUserUid||!canFinance("assignments","edit"))));
  const detail=panel("استكمال فاتورة "+(inv.number||selectedAssignment.invoiceId||""),(purchase?"فاتورة مشتريات من مورد: ":"فاتورة مبيعات لعميل: ")+(inv.partyName||"")+" · "+(selectedAssignment.instruction||""),h("div",{className:"space-y-3"},
   h("div",{className:"grid md:grid-cols-3 gap-3"},metric("التاريخ",inv.date||"—"),metric("الإجمالي",fmt(inv.total||0)+" ج.م"),metric("عدد البنود",String(assignmentLines.length))),
   invoiceHead,errorsPanel,chainPanel,...lineCards,addLine,attachmentsPanel,forwardPanel,
   h("div",{className:"rounded-lg border bg-slate-50 p-3 text-sm text-slate-600"},"بعد الاستكمال يمكنك إرجاع الملف للمرسل المباشر، أو إرساله للمراجعة حتى لو بقيت بعض النواقص. المراجع يستكملها قبل الاعتماد."),
   h("div",{className:"flex flex-wrap items-center gap-2"},
    button("إعادة الملف للمرسل المباشر",()=>completeAssignment("return_to_creator"),"muted",assignmentBusy||!canFinance("assignments","edit")),
    button("إرسال للمراجعة والاعتماد",()=>completeAssignment("submit_for_review"),"success",assignmentBusy||!canFinance("assignments","edit")),
    button("إلغاء الفاتورة",cancelAssignedInvoice,"danger",assignmentBusy||!canFinance("assignments","edit")),
    button("إغلاق التفاصيل",()=>setSelectedAssignmentId(""),"muted")
   )
  ));
  return h("div",{className:"space-y-4"},inbox,sentOutbox,detail);
 };
  const renderPartyStatements = function() {
  const staff=(userDirectory||[]).filter(u=>u.uid).map(u=>Object.assign({},u,{id:u.uid,code:u.uid,name:u.fullName||u.username||u.email||u.uid}));
  const employeeType=["employeeCustody","employeeAdvance"].includes(partyStatement.type);
  const partyType=["customer","vendor","employeeCustody","employeeAdvance"].includes(partyStatement.type);
  const entityList=partyStatement.type==="account"?accounts:
   partyStatement.type==="costCenter"?centers:
   partyStatement.type==="vendor"?allVendors:
   partyStatement.type==="customer"?allClients:staff;
  const entityCode=item=>String(item&&(item.code||item.uid||item.id)||"");
  const entityName=item=>partyStatement.type==="account"||partyStatement.type==="costCenter"
   ?String(item&&item.name||entityCode(item))
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
  const normalSide=partyStatement.type==="vendor"?"credit":
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
   const partyLabel=line.partyName||((line.partyType==="vendor"?allVendors:line.partyType==="customer"?allClients:staff)
    .find(item=>String(item.code||item.uid||item.id)===String(line.partyId||""))||{}).name||line.partyId||"";
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
   ({customer:"كشف حساب عميل",vendor:"كشف حساب مورد",employeeCustody:"كشف حساب عهدة موظف",employeeAdvance:"كشف حساب سلفة موظف"}[partyStatement.type]||"كشف حساب");
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
   {value:"employeeAdvance",label:"سلفة موظف"}
  ];
  const pickerLabel=partyStatement.type==="account"?"ابحث عن الحساب بالاسم أو الرقم أو أي بيان":
   partyStatement.type==="costCenter"?"ابحث عن مركز التكلفة بالكود أو الاسم أو المشروع":
   partyStatement.type==="vendor"?"ابحث عن المورد بالاسم أو الكود أو الرقم الضريبي":
   partyStatement.type==="customer"?"ابحث عن العميل بالاسم أو الكود أو الرقم الضريبي":
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
  partnerCurrentAttachmentView?panel('مرفقات الحركة الأصلية','المرفقات باقية على سجل العهدة نفسه ولم يتم نقل الملفات أو إنشاء نسخ منها.',h('div',{className:'space-y-2'},h('div',{className:'text-sm font-bold'},partnerCurrentAttachmentView.transaction.description||partnerCurrentAttachmentView.transaction.id),partnerCurrentAttachmentView.attachments.length?table(['اسم الملف','النوع','الحجم','تحميل'],partnerCurrentAttachmentView.attachments.map(item=>h('tr',{key:item.id,className:'border-t'},h('td',{className:'p-2'},item.fileName||'—'),h('td',{className:'p-2'},item.mimeType||'—'),h('td',{className:'p-2'},fmt((Number(item.size)||0)/1024)+' KB'),h('td',{className:'p-2'},button('تحميل',()=>downloadPartnerCustodyAttachment({uid:partnerCurrentAttachmentView.ownerUid},partnerCurrentAttachmentView.transaction,item),'muted',busy))))):h('p',{className:'text-sm text-slate-500'},'لا توجد مرفقات مرتبطة بهذه الحركة.'))):null
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
  if(line.partyType==='employeeCustody'||line.partyType==='employeeAdvance')return selected&&selected.sourceDetails&&selected.sourceDetails.employeeName||line.partyId;
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
     reviewDetailItem(t('العملة','Currency'),selected.currency||'EGP'),
     reviewDetailItem(t('مصدر القيد','Journal Source'),selected.sourceType==='cashCustody'?t('عهدة موظف','Employee Custody'):selected.sourceType==='projectEvent'?t('حدث مشروع','Project Event'):t('قيد يدوي','Manual Journal')),
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
const renderReview=()=>panel('قائمة المراجعة والاعتماد','تتحدّث القائمة تلقائيًا عند فتح التبويب وكل 15 ثانية أثناء عرضه. أي مستخدم مخوّل يرى المستندات؛ المراجع فقط يعتمدها أو يعيدها أو يرفضها.',h('div',{className:'space-y-3'},
  h('div',{className:'flex flex-wrap items-center justify-between gap-2'},h('strong',null,'مستندات بانتظار القرار: '+review.length),button('تحديث القائمة الآن',()=>refreshReviewQueue(false),'muted')),
  selected?h('div',{className:'space-y-3'},
   h('div',{className:'flex items-center justify-between'},h('strong',null,selected.type==='journal'&&selected.number?'رقم القيد: '+selected.number+(selected.title&&selected.title!=='قيد رقم '+selected.number?' — '+selected.title:''):selected.title||selected.number||selected.id),button('إغلاق',()=>setSelected(null))),
   h('p',{className:'text-sm'},t('النوع: ','Type: ')+(selected.type==='invoice'?(selected.invoiceType==='purchase'?t('فاتورة مشتريات','Purchase Invoice'):t('فاتورة مبيعات','Sales Invoice')):documentType(selected.type))+' · '+t('التاريخ: ','Date: ')+(selected.date||'—')+' · '+t('الحالة: ','Status: ')+status(selected.status)),
   h('p',{className:'text-sm font-bold'},t('قيمة القيد / المستند: ','Journal / Document Amount: ')+moneyLabel(selected.total||selected.amount||(selected.type==='journal'?(selected.lines||[]).reduce((sum,line)=>sum+n(line.debit),0):0))),
   selected.type==='journal'?renderReviewJournalDetails():null,
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
   Object.keys(selected.attachments||{}).length?panel('مرفقات المستند','الملفات محفوظة في مساحة المرفقات المالية المرتبطة بالفاتورة.',table(['اسم الملف','النوع','الحجم','الإجراء'],Object.values(selected.attachments||{}).map(function(attachment){return h('tr',{key:attachment.id,className:'border-t'},h('td',{className:'p-2'},attachment.fileName||'—'),h('td',{className:'p-2'},attachment.mimeType||'—'),h('td',{className:'p-2'},fmt((Number(attachment.size)||0)/1024)+' KB'),h('td',{className:'p-2'},button('تحميل المرفق',function(){downloadFinancialAttachment(selected.id,attachment);},'muted')));}))) : null,
   selected.type==='bankLine'?select('الحساب المقابل',offset,v=>setOffset(v),posting.map(a=>({value:a.code,label:a.code+' — '+a.name}))):null,
   selected.type==='bankLine'?canFinance("bank","edit")?button('حفظ الحساب المقابل',async()=>{try{await api('', 'POST',{action:'setBankOffset',id:selected.id,offsetAccountCode:offset});setNotice('تم حفظ الحساب المقابل');await refreshReviewQueue(true);}catch(e){setError(e.message);}}):null:null,
   h('div',{className:'flex flex-wrap gap-2'},
     canFinance("review","approve")?button('اعتماد وترحيل',()=>reviewAction(selected.status==='duplicate_review'?'approveDuplicate':'approve'),'success',busy):null,
     canFinance("review","edit")?button('إعادة للتصحيح',()=>reviewAction('return'),'muted',busy):null,
     canFinance("review","approve")?button('رفض',()=>reviewAction('reject'),'danger',busy):null,
     selected.type==='invoice'&&canFinance('invoices','delete')?button('حذف الفاتورة',()=>void deleteInvoiceRecord(selected),'danger',busy):null
    )
  ):table(['المستند','النوع','التاريخ','الطرف','المبلغ','الحالة','المرفق','مراجعة'],review.map(x=>h('tr',{key:x.id,className:'border-t'},
   h('td',{className:'p-2'},x.title||x.id),
   h('td',{className:'p-2'},x.type==='invoice'?(x.invoiceType==='purchase'?'مشتريات':'مبيعات'):x.type==='cash'?'الخزينة':x.type),
   h('td',{className:'p-2'},x.date||'—'),
   h('td',{className:'p-2'},x.partyName||'—'),
   h('td',{className:'p-2'},fmt(x.total||x.amount||0)),
   h('td',{className:'p-2'},status(x.status)),
   h('td',{className:'p-2'},x.attachmentUploadStatus==='pending'?'المرفق يحتاج إعادة رفع':x.attachmentFileName||'—'),
   h('td',{className:'p-2'},button('فتح',()=>{void openReviewItem(x);},'muted'))
  ))),
   renderReviewJournalEditor()
  ));
 const renderCash=()=>{
  const movementLabels={customer_receipt:"تحصيل من عميل",supplier_payment:"سداد إلى مورد",other_receipt:"استلام نقدية / إيراد آخر",other_payment:"مصروف / مدفوعات أخرى",cash_to_bank:"إيداع نقدية بالبنك",bank_to_cash:"سحب نقدية من البنك",employee_custody:"تسليم عهدة لموظف",employee_custody_return:"استرداد عهدة من موظف",employee_advance:"صرف سلفة لموظف",employee_advance_recovery:"تحصيل سلفة من موظف"};
  const movement=cash.movementType;
  const activeEmployees=(userDirectory||[]).filter(u=>u.uid&&u.uid!==currentUser.uid&&["active","نشط","مفعل","enabled"].includes(String(u.status||"").toLowerCase()));
  const accountOptions=posting.map(a=>({value:a.code,label:a.code+" — "+a.name}));
  const bankOptions=[{value:"1120",label:"1120 — البنوك"}].concat(rows(master.bankAccounts).filter(x=>x.active!==false).map(x=>({value:x.accountCode||x.code,label:(x.accountCode||x.code)+" — "+x.name})));
  const isParty=movement==="customer_receipt"||movement==="supplier_payment",isEmployee=movement.startsWith("employee_"),isOther=movement==="other_receipt"||movement==="other_payment",isTransfer=movement==="cash_to_bank"||movement==="bank_to_cash",isCustody=movement==="employee_custody"||movement==="employee_custody_return",isAdvance=movement==="employee_advance"||movement==="employee_advance_recovery";
  const counterparty=movement==="customer_receipt"?partyPicker("العميل",activeClients,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id,partyName:partyName(p)})),cashPartySearch,setCashPartySearch,"customer"):movement==="supplier_payment"?partyPicker("المورد",activeVendors,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id,partyName:partyName(p)})),cashPartySearch,setCashPartySearch,"vendor"):null;
  const employeeSelect=isEmployee?select("الموظف المستلم / المسدد",cash.employeeUid,v=>{const user=activeEmployees.find(u=>u.uid===v);setCash(o=>Object.assign({},o,{employeeUid:v,employeeName:user&&(user.fullName||user.username||user.email)||""}));},[{value:"",label:"اختر المستخدم الداخلي"},...activeEmployees.map(u=>({value:u.uid,label:(u.fullName||u.username||u.email)+" — "+(u.jobTitle||"")}))]):null;
  const offsetType=movement==="other_receipt"?"revenue":"expense";
  const offsetSelect=isOther?selectWithAdd(offsetType==="revenue"?"حساب الإيراد المقابل":"حساب المصروف",cash.offsetAccountCode,v=>setCash(o=>Object.assign({},o,{offsetAccountCode:v})),accountOptions.filter(a=>{const x=accounts.find(z=>z.code===a.value);return x&&x.type===offsetType;}),"chartOfAccounts",{type:offsetType,nature:offsetType==="revenue"?"credit":"debit",parentCode:offsetType==="revenue"?"4":"6"}):null;
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
    counterparty,employeeSelect,cashAccountSelect,bankSelect,offsetSelect,
    select("مركز التكلفة / المشروع",cash.projectCode,v=>setCash(o=>Object.assign({},o,{projectCode:v})),[{value:"",label:"بدون مركز تكلفة"},...activeCenters.map(x=>({value:x.code,label:x.code+" — "+x.name}))]),
    field("مرجع / رقم مستند",cash.reference,v=>setCash(o=>Object.assign({},o,{reference:v}))),
    h("div",{className:"md:col-span-3"},area("البيان والتفاصيل",cash.description,v=>setCash(o=>Object.assign({},o,{description:v})))),
    isCustody?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"التسليم ينشئ حركة مقابلة في عهدة الموظف الشخصية، والاسترداد يخفض رصيد العهدة تلقائيًا بعد الاعتماد."):null,
    isAdvance?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"السلفة تسجل على حساب السلف للموظف بصورة مستقلة عن العهدة، والتحصيل يخفض رصيد السلفة بعد الاعتماد."):null,
    button(busy?"جارٍ الحفظ...":"حفظ وإرسال إلى المراجعة",submitCash,"primary",busy||!canFinance("cash","add")||!cash.amount||!cash.description.trim()||(isParty&&!cash.partyId)||(isEmployee&&!cash.employeeUid)||(isOther&&!cash.offsetAccountCode)||(isTransfer&&!cash.bankAccountCode))
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
 const renderInventoryMovements=()=>{
  const inbound=inventoryMovements.filter(item=>item.kind==='purchase'||n(item.quantity)>0);
  const outbound=inventoryMovements.filter(item=>item.kind==='sale'||n(item.quantity)<0);
  const inboundQty=inbound.reduce((sum,item)=>sum+Math.abs(n(item.quantity)),0);
  const outboundQty=outbound.reduce((sum,item)=>sum+Math.abs(n(item.quantity)),0);
  const netValue=inventoryMovements.reduce((sum,item)=>sum+n(item.value),0);
  const itemNames=new Map(items.map(item=>[String(item.code),item.name]));
  const movementRows=inventoryMovements.map(item=>h('tr',{key:item.id,className:'border-t hover:bg-slate-50'},
   h('td',{className:'p-2 whitespace-nowrap'},item.date||'—'),
   h('td',{className:'p-2'},item.kind==='purchase'?'إضافة / وارد':item.kind==='sale'?'صرف / صادر':item.kind||'حركة'),
   h('td',{className:'p-2'},item.itemCode||'—'),
   h('td',{className:'p-2'},itemNames.get(String(item.itemCode))||'صنف غير موجود بالدليل'),
   h('td',{className:'p-2'},item.warehouseCode||'—'),
   h('td',{className:'p-2 text-end'},fmt(item.quantity)),
   h('td',{className:'p-2 text-end'},fmt(item.unitCost)),
   h('td',{className:'p-2 text-end font-bold'},fmt(item.value)),
   h('td',{className:'p-2'},item.invoiceId||'—'),
   h('td',{className:'p-2'},item.journalId||'—')
  ));
  return h('div',{className:'space-y-4'},
   h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2'},
    metric('عدد حركات المخزن',String(inventoryMovements.length)),
    metric('كمية الوارد',fmt(inboundQty)),
    metric('كمية الصادر',fmt(outboundQty)),
    metric('صافي قيمة الحركات',fmt(netValue))
   ),
   h('div',{className:'flex flex-wrap gap-2'},button('تحديث حركات المخزن',loadInventoryMovements,'muted',busy)),
   panel('سجل حركة المخزن','عرض مستقل لكل حركات الإضافة والصرف المرتبطة بالفواتير مع الصنف والمخزن والكمية والتكلفة والقيمة.',table(['التاريخ','نوع الحركة','كود الصنف','اسم الصنف','المخزن','الكمية','تكلفة الوحدة','القيمة','رقم الفاتورة','رقم القيد'],movementRows))
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
  const tabs=[["customers","العملاء"],["suppliers","الموردون"],["items","الأصناف المخزنية"],["itemGroups","مجموعات الأصناف"],["chartOfAccounts","دليل الحسابات"],["costCenters","مراكز التكلفة"],["warehouses","المخازن"],["bankAccounts","حسابات البنوك"],["taxCodes","الأكواد الضريبية"]];
  const partyType=masterViewKind==="suppliers"?"vendor":"customer";
  const partyList=masterViewKind==="suppliers"?allVendors:allClients;
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
  let quickKind=masterViewKind;
  let quickDefaults={};
  if(masterViewKind==="customers"||masterViewKind==="suppliers"){
   title=masterViewKind==="suppliers"?"دليل الموردين":"دليل العملاء";
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
  }else if(masterViewKind==="items"){
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
  }else if(masterViewKind==="itemGroups"){
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
   const data=masterViewKind==="chartOfAccounts"?accounts:masterViewKind==="costCenters"?centers:rows(master[masterViewKind]);
   currentMasterItems=data;
   visibleItems=currentMasterItems.filter(matches);
   title=({chartOfAccounts:"دليل الحسابات",costCenters:"مراكز التكلفة",warehouses:"المخازن",bankAccounts:"حسابات البنوك",taxCodes:"الأكواد الضريبية"})[masterViewKind]||"البيانات الأساسية";
   headers=["تحديد","الكود","الاسم","التفاصيل","الحالة","الإجراءات"];
   visibleRows=visibleItems.map(x=>h("tr",{key:x.code,className:"border-t"},
    selectionCell(x),
    h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),
    h("td",{className:"p-2"},masterViewKind==="chartOfAccounts"?(x.isGroup?"حساب تجميعي":x.type+" / "+x.nature):masterViewKind==="costCenters"?(x.projectCode||"—"):masterViewKind==="taxCodes"?(x.taxType||"")+" / "+(x.rate||0)+"%":masterViewKind==="bankAccounts"?(x.accountCode||x.code):"—"),
    h("td",{className:"p-2"},x.active===false?"موقوف":"نشط"),h("td",{className:"p-2"},masterActions(masterViewKind,x))
   ));
   const prefixes={chartOfAccounts:"ACC",costCenters:"CC",warehouses:"WH",bankAccounts:"BANK",taxCodes:"TAX"};
   quickDefaults={code:nextCode(prefixes[masterViewKind]||"NEW",data)};
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
  return h("div",{className:"space-y-4"},
   importPanel,
   panel("أنواع البيانات الأساسية","اختر نوع التكويد لعرض السجلات الخاصة به فقط.",h("div",{className:"flex flex-wrap gap-2"},tabs.map(([key,label])=>button(label,()=>{setMasterViewKind(key);setMasterPartySearch("");setSelectedMasterCodes([]);},masterViewKind===key?"primary":"muted")))),
   listPanel
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
     h('div',{className:'flex flex-wrap items-center gap-3 rounded-xl border bg-slate-50 p-3 text-sm'},h('b',null,'مرفقات الحركة / المستند'),statementAttachmentAction(statementJournal)||h('span',{className:'text-slate-500'},'لا توجد مرفقات مرتبطة بهذا القيد')),
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
 const balanceAssetRows=statementRowsWithBalance(account=>account.type==='asset'&&!account.isGroup,'debit',true);
 const balanceLiabilityRows=statementRowsWithBalance(account=>account.type==='liability'&&!account.isGroup,'credit',true);
 const balanceEquityRows=statementRowsWithBalance(account=>account.type==='equity'&&!account.isGroup,'credit',true);
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
  fullStatementsExportNode(),
  criticalAccountIntegrityPanel(),
  controlSubledgerIntegrityPanel(),
  report==='trial'?h('div',{className:'space-y-3'},trialIntegrityNote,panel('ميزان المراجعة — حسابات تفصيلية وتجميعية','الافتتاحي + حركة الفترة = الختامي. الأرصدة التجميعية تتضمن الأرصدة التابعة ولا تدخل مرتين في الإجماليات.',table(['كود','الحساب (اضغط لفتح الكشف)','افتتاحي مدين','افتتاحي دائن','حركة مدين','حركة دائن','ختامي مدين','ختامي دائن'],trialBalanceRows)),trialBalanceTotals):null,
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
  return key;
 };
 const accountAnalysisTypeLabel=type=>({customer:'عميل',vendor:'مورد',employeeCustody:'موظف صاحب عهدة',employeeAdvance:'موظف صاحب سلفة',partnerCurrentAccount:'شريك'}[type]||type||'طرف تحليلي');
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
    select('الحساب المحاسبي',accountAnalysisCode,value=>{setAccountAnalysisCode(value);setAccountAnalysisGroupKey('');setAccountAnalysisSearch('');},[{value:'',label:'اختر الحساب'}].concat(accountOptions)),
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

 const renderQuickAdd = function() {
  if(!quickAddType)return null;
  const change=function(key,value){setQuickAddForm(function(old){return Object.assign({},old,{[key]:value});});};
  const typeLabels={chartOfAccounts:'حساب جديد',costCenters:'مركز تكلفة جديد',items:'صنف مخزني جديد',itemGroups:'مجموعة أصناف جديدة',warehouses:'مخزن جديد',bankAccounts:'حساب بنك جديد',taxCodes:'كود ضريبي جديد',parties:'عميل / مورد جديد'};
  const fields=[
   field('الكود',quickAddForm.code,function(v){change('code',v);}),
   field('الاسم',quickAddForm.name,function(v){change('name',v);}),
   h('label',{className:'inline-flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2'},h('input',{type:'checkbox',checked:quickAddForm.active!==false,onChange:function(e){change('active',e.target.checked);}}),'السجل نشط / متاح للاستخدام')
  ];
  if(quickAddType==='chartOfAccounts'){
   fields.push(select('نوع الحساب',quickAddForm.type,function(v){change('type',v);},[{value:'asset',label:'أصول'},{value:'liability',label:'التزامات'},{value:'equity',label:'حقوق ملكية'},{value:'revenue',label:'إيرادات'},{value:'expense',label:'مصروفات'}]));
   fields.push(select('الطبيعة',quickAddForm.nature,function(v){change('nature',v);},[{value:'debit',label:'مدين'},{value:'credit',label:'دائن'}]));
   fields.push(select('الحساب الأب',quickAddForm.parentCode,function(v){change('parentCode',v);},[{value:'',label:'بدون'}].concat(accounts.filter(function(x){return x.isGroup;}).map(function(x){return {value:x.code,label:x.code+' — '+x.name};}))));
   fields.push(select('تحليل الطرف',quickAddForm.subledgerType||'',function(v){change('subledgerType',v);},[{value:'',label:'بدون'},{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'},{value:'employeeCustody',label:'موظف صاحب عهدة'},{value:'employeeAdvance',label:'موظف صاحب سلفة'},{value:'partnerCurrentAccount',label:'شريك — جاري الشركاء'}]));
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
   fields.push(select('الحساب المحاسبي المرتبط',quickAddForm.accountCode||'',function(v){change('accountCode',v);},posting.filter(function(a){return a.type==='asset';}).map(function(a){return {value:a.code,label:a.code+' — '+a.name};})));
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
  const closeQuickAdd=()=>{if(busy)return;setQuickAddType('');setQuickAddTarget(null);setQuickAddParent(null);setQuickAddOriginalCode('');};
  return h('div',{className:'fixed inset-0 z-[100] bg-slate-950/50 flex items-center justify-center p-2 sm:p-3',onClick:closeQuickAdd},
   h('section',{className:'bg-white rounded-xl shadow-2xl w-full '+(isParty?'max-w-5xl':'max-w-2xl')+' p-3 sm:p-4 max-h-[94vh] overflow-auto',onClick:function(e){e.stopPropagation();}},
    h('div',{className:'flex items-center justify-between gap-2 mb-2 sticky top-0 bg-white z-10 py-1'},h('h3',{className:'font-bold text-base'},isParty?(quickAddForm.partyType==='vendor'?'بيانات مورد جديد':'بيانات عميل جديد'):(typeLabels[quickAddType]||'إضافة كود')),button('إغلاق',closeQuickAdd,'muted',busy)),
    h('div',{className:'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'},...fields),
    h('div',{className:'flex justify-end gap-2 mt-3 pt-2 border-t'},button('إلغاء',closeQuickAdd,'muted',busy),button(quickAddOriginalCode?'حفظ التعديلات':isParty?'حفظ واختيار الطرف':'حفظ الكود',saveQuickAdd,'primary',busy))
   )
  );
 };
 const statementAttachmentListModal=statementAttachmentList?h('div',{className:'fixed inset-0 z-[180] bg-slate-950/70 flex items-center justify-center p-2 sm:p-4',onClick:()=>setStatementAttachmentList(null)},
  h('section',{className:'w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-2xl',onClick:e=>e.stopPropagation()},
   h('header',{className:'sticky top-0 z-10 flex items-center justify-between gap-2 bg-slate-900 p-4 text-white'},h('h3',{className:'font-extrabold'},statementAttachmentList.title||'مرفقات الحركة'),h('button',{type:'button',className:'rounded-lg border border-white/30 px-3 py-2 text-sm',onClick:()=>setStatementAttachmentList(null)},'إغلاق')),
   table(['اسم الملف','النوع','الحجم','فتح'],statementAttachmentList.attachments.map(item=>h('tr',{key:item.entityType+'/'+item.entityId+'/'+item.id,className:'border-t'},h('td',{className:'p-2'},item.fileName||'—'),h('td',{className:'p-2'},item.mimeType||'—'),h('td',{className:'p-2'},fmt((Number(item.fileSize)||0)/1024)+' KB'),h('td',{className:'p-2'},h('button',{type:'button',className:'rounded-lg border px-3 py-1 text-xs font-bold text-blue-700',onClick:()=>void openStatementAttachmentFile(item)},'فتح المرفق')))))
  )):null;
 const statementAttachmentPreviewModal=statementAttachmentPreview?h('div',{className:'fixed inset-0 z-[190] bg-slate-950/80 flex items-center justify-center p-2 sm:p-4',onClick:closeStatementAttachmentPreview},
  h('section',{className:'flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',onClick:e=>e.stopPropagation()},
   h('header',{className:'flex shrink-0 items-center justify-between gap-2 bg-slate-900 p-3 text-white'},h('div',{className:'font-bold truncate'},statementAttachmentPreview.fileName||'معاينة المرفق'),h('button',{type:'button',className:'rounded-lg border border-white/30 px-3 py-2 text-sm',onClick:closeStatementAttachmentPreview},'إغلاق')),
   h('div',{className:'min-h-0 flex-1 overflow-auto bg-slate-100 p-2'},statementAttachmentPreview.kind==='media'?(statementAttachmentPreview.mimeType==='application/pdf'?h('iframe',{title:statementAttachmentPreview.fileName,src:statementAttachmentPreview.url,className:'h-full min-h-[70vh] w-full rounded-lg bg-white'}):h('img',{src:statementAttachmentPreview.url,alt:statementAttachmentPreview.fileName,className:'mx-auto max-h-full max-w-full object-contain'})):statementAttachmentPreview.kind==='text'?h('pre',{className:'whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm'},statementAttachmentPreview.text):statementAttachmentPreview.kind==='table'?table((statementAttachmentPreview.rows[0]||[]).map((_,index)=>String(index+1)),statementAttachmentPreview.rows.slice(1).map((row,index)=>h('tr',{key:index,className:'border-t'},row.map((cell,column)=>h('td',{key:column,className:'p-2'},String(cell)))))):null)
  )):null;
 let content=null;
 if(tab==='overview')content=renderOverview();
 if(tab==='journal')content=renderJournal();
 if(tab==='review')content=renderReview();
 if(tab==='invoices')content=renderInvoices();
 if(tab==='assignments')content=renderAssignments();
 if(tab==='assignments')content=renderAssignments();
 if(tab==='partyStatements')content=renderPartyStatements();
 if(tab==='partnerCurrent')content=renderPartnerCurrent();
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
 return h('div',{className:'pest-finance-workspace p-2 md:p-3 space-y-2',dir:rtl?'rtl':'ltr'},
  h('style',null,`
   .pest-finance-workspace[dir="rtl"] table{direction:rtl!important;text-align:right!important;}
   .pest-finance-workspace[dir="rtl"] table th:not(.text-center):not(.text-left),.pest-finance-workspace[dir="rtl"] table td:not(.text-center):not(.text-left){text-align:right!important;}
   .pest-finance-workspace[dir="rtl"] table th{vertical-align:middle;white-space:nowrap;}
   .pest-finance-workspace[dir="rtl"] table td[class~="text-end"]{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;}
   .pest-finance-workspace[dir="rtl"] table td[class~="text-center"]{text-align:center!important;}
   .pest-finance-workspace[dir="ltr"] table td[class~="text-end"]{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;}
   .pest-finance-workspace table th,.pest-finance-workspace table td{vertical-align:middle;}
  `),
  h('header',{className:'flex flex-wrap items-center justify-between gap-3'},h('div',null,h('h2',{className:'text-2xl font-extrabold'},t('النظام المالي والمحاسبي','Financial & Accounting System')),h('p',{className:'text-xs text-slate-500'},t('دفتر أستاذ مستقل — لا ترحيل قبل المراجعة والاعتماد','Separate General Ledger — No Posting Before Review & Approval'))),button(busy?t('جارٍ التحديث','Updating'):t('تحديث البيانات','Refresh Data'),refresh,'muted',busy)),
  h('nav',{className:'flex flex-wrap gap-2'},visibleNav.map(x=>button(rtl?x[1]:x[2],()=>{setTab(x[0]);setNotice('');setError('');setScreenTableSearch('');},tab===x[0]?'primary':'muted'))),
  field(t('بحث في بيانات الشاشة الحالية','Search current screen data'),screenTableSearch,setScreenTableSearch),
  noticeElement,content,renderQuickAdd(),statementAttachmentListModal,statementAttachmentPreviewModal,busy?h('p',{className:'text-xs text-slate-500'},'جارٍ تحميل البيانات...'):null,
  h('p',{className:'text-xs text-slate-400'},'الأرصدة القديمة في متابعة المشروعات والعهد لا تُنقل تلقائيًا إلى الحسابات. يلزم إعداد واعتماد الأرصدة الافتتاحية.'))
}
window.PEST_FINANCE_MODULE=FinanceModule;
 window.PEST_FINANCE_MODULE_VERSION="20261122-financial-accounting-reset-actions-v1";
})();