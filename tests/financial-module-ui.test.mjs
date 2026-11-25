import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../financial-api.js", import.meta.url), "utf8");
const crmSource = readFileSync(new URL("../pest-crm-module.js", import.meta.url), "utf8");
const reportsSource = source.slice(source.indexOf("const renderReports=()=>"), source.indexOf("const accountAnalysisLabelForParty"));

test("account analysis drills from account balance to analytical source and posted journal lines", () => {
  assert.ok(source.includes('accountAnalysis:"reports"'));
  assert.ok(source.includes("['accountAnalysis','تحليل الحسابات','Account Analysis']"));
  assert.ok(source.includes("const accountAnalysisLines=accountAnalysisData?balanceFlat.filter"));
  assert.ok(source.includes("const counterparts=journalLines.filter"));
  assert.ok(source.includes("party|'+type+'|'+id"));
  assert.ok(source.includes("accountAnalysisDistributedNet-accountAnalysisTotalNet"));
  assert.ok(source.includes("onClick:()=>openStatementJournal(line.journalId)"));
  assert.ok(source.includes("statementAttachmentAction(line)"));
  assert.ok(source.includes("const renderAccountAnalysis=()=>{"));
  assert.ok(source.includes("if(tab==='accountAnalysis')content=renderAccountAnalysis()"));
});

test("finance module export version must match the version requested by the loader", () => {
  const requestedBuild = /const FINANCE_MODULE_BUILD='([^']+)'/.exec(indexHtml)?.[1];
  const exportedBuild = /window\.PEST_FINANCE_MODULE_VERSION="([^"]+)"/.exec(source)?.[1];
  assert.ok(requestedBuild, "finance loader build identifier must be present");
  assert.ok(exportedBuild, "finance module must export its build identifier");
  assert.equal(exportedBuild, requestedBuild, "loader and module build identifiers must match");
});

test("financial tables align RTL amounts below matching headers", () => {
  assert.match(source, /className:'pest-finance-workspace p-2 md:p-3 space-y-2'/);
  assert.match(source, /\.pest-finance-workspace\[dir="rtl"\] table\{direction:rtl!important;text-align:right!important;\}/);
  assert.match(source, /table td\[class~="text-end"\]\{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;\}/);
  assert.match(source, /className:'sticky top-0 z-10 bg-slate-100 p-3 whitespace-nowrap text-right align-middle'/);
  assert.match(source, /dir:rtl\?'rtl':'ltr',className:'w-full text-sm text-right'/);
});

test("all shared financial sections have individual collapse and expand buttons", () => {
  assert.match(source, /const \[collapsedPanels,setCollapsedPanels\]=React\.useState\(\{\}\)/);
  assert.match(source, /const panel=\(title,sub,child\)=>\{/);
  assert.match(source, /aria-expanded':!collapsed/);
  assert.match(source, /collapsedPanels\[panelKey\]===undefined\?true:Boolean\(collapsedPanels\[panelKey\]\)/);
  assert.match(source, /setCollapsedPanels\(previous=>Object\.assign\(\{\},previous,\{\[panelKey\]:!collapsed\}\)\)/);
  assert.match(source, /collapsed\?null:h\('div',\{className:'mt-3 min-w-0'\},child\)/);
  assert.match(source, /collapsed\?t\('إظهار القسم','Show section'\):t\('إخفاء القسم','Hide section'\)/);
});

test("unified statements support GL accounts, cost centers, vendors and customers with searchable selection and journal drill-through", () => {
  assert.match(source, /type:'account'/);
  assert.match(source, /value:"account",label:"حساب من دليل الحسابات"/);
  assert.match(source, /value:"costCenter",label:"مركز تكلفة"/);
  assert.match(source, /value:"vendor",label:"مورد"/);
  assert.match(source, /value:"customer",label:"عميل"/);
  assert.match(source, /ابحث عن الحساب بالاسم أو الرقم أو أي بيان/);
  assert.match(source, /normalizeMatch\(Object\.entries\(item\|\|\{\}\)/);
  assert.match(source, /openStatementJournal\(line\.journalId\)/);
  assert.match(source, /statementAttachmentAction\(line\)/);
  assert.match(source, /الرصيد الافتتاحي/);
  assert.match(source, /الرصيد الختامي/);
});

test("balance sheet retains invoice diagnostics and hides warehouse-to-GL reconciliation", () => {
  assert.match(source, /invoicePostingReconciliationPanel\(\)/);
  assert.doesNotMatch(source, /const inventoryReconciliationPanel=\(\)=>\{/);
  assert.doesNotMatch(source, /inventoryReconciliationPanel\(\)/);
});

test("invoice diagnostics link to status-appropriate decision screens", () => {
  assert.match(source, /onClick:\(\)=>void openInvoiceDiagnostic\(row\)/);
  assert.match(source, /const openInvoiceDiagnostic=async diagnostic=>\{/);
  assert.match(source, /setTab\('review'\);await openReviewItem\(doc\)/);
  assert.match(source, /setInvoiceDecisionDoc\(doc\);setTab\('invoices'\)/);
  assert.match(source, /openJournalModal\(diagnostic\.journal\)/);
});

test("financial Excel exports use a consistent formatted RTL report sheet", () => {
  assert.match(source, /fgColor:\{rgb:"17365D"\}/);
  assert.match(source, /fgColor:\{rgb:"1F4E78"\}/);
  assert.match(source, /sheet\["!autofilter"\]/);
  assert.match(source, /sheet\["!views"\]=\[\{RTL:Boolean\(rtl\),state:"frozen"/);
});

test("invoice-source journals support reversal and deletion from journal detail", () => {
  assert.match(source, /posted&&\(manual\|\|draft\.sourceType==='invoice'\)&&canFinance\('journal','add'\)/);
  assert.match(source, /statementJournalReversible=Boolean\(statementJournalManual\|\|statementJournal&&statementJournal\.sourceType==='invoice'\)/);
  assert.match(source, /حذف القيد ومصدره/);
});

test("application loader requests the exact financial module build declared by the module", () => {
  const appHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const version = source.match(/window\.PEST_FINANCE_MODULE_VERSION="([^"]+)"/);
  const expected = appHtml.match(/const FINANCE_MODULE_BUILD='([^']+)'/);
  assert.ok(version, "financial module must declare its build version");
  assert.ok(expected, "application shell must declare the required financial module version");
  assert.equal(expected[1], version[1], "application shell and financial module version must match");
});


test("financial reports compare control-account debit and credit movements to analytical subledger lines", () => {
  assert.match(source, /const controlSubledgerAuditRows=accounts\.filter\(account=>account\.subledgerType/);
  assert.match(source, /const controlSubledgerMismatchCount=controlSubledgerAuditRows\.filter/);
  assert.match(source, /مطابقة الحسابات الرقابية مع الأستاذ المساعد/);
  assert.doesNotMatch(reportsSource, /controlSubledgerIntegrityPanel\(\)/);
  assert.match(source, /row\.account\.subledgerType/);
});


test("financial reports validate critical balance-sheet and tax control account classifications", () => {
  assert.match(source, /const criticalAccountConfiguration=\[/);
  assert.match(source, /\{code:"1300",type:"asset",nature:"debit",label:"المخزون"\}/);
  assert.match(source, /\{code:"1410",type:"asset",nature:"debit",label:"ضريبة القيمة المضافة - مدخلات"\}/);
  assert.match(source, /\{code:"2110",type:"liability",nature:"credit",label:"ضريبة القيمة المضافة - مخرجات"\}/);
  assert.match(source, /\{code:"281",type:"liability",nature:"credit",subledgerType:"vendor",label:"الموردون"\}/);
  assert.match(source, /const criticalAccountMismatchCount=/);
  assert.match(source, /\{code:"2150",type:"liability",nature:"credit",subledgerType:"financingParty",label:"تمويل وقروض من الشركاء والغير"\}/);
  assert.doesNotMatch(reportsSource, /criticalAccountIntegrityPanel\(\)/);
});


test("inventory balances and movement rows are both loaded into financial module state", () => {
  assert.match(source, /setMaster\(previous=>Object\.assign\(\{\},previous,\{inventory:Object\.assign\(\{\},previous\.inventory\|\|\{\},\{\.\.\.inventory,balances:inventory\.balances\|\|previous\.inventory&&previous\.inventory\.balances\|\|\{\},movements:inventory\.movements\|\|\{\}\}\)\}\)\)/);
  assert.match(source, /tab==='inventory'\|\|tab==='inventoryMovements'\|\|\(tab==='reports'&&report==='balance'\)/);
  assert.match(source, /tab==='inventory'\|\|tab==='inventoryMovements'/);
});


test("balance sheet reconciles invoice statuses and posted journals against inventory, supplier and VAT control accounts", () => {
  assert.match(source, /const invoicePostingReconciliationPanel=\(\)=>\{/);
  assert.match(source, /const unpostedInvoiceTotal=/);
  assert.match(source, /حالة الفاتورة مرحّلة لكن القيد المرحّل المرتبط بها غير موجود/);
  assert.match(source, /لا يوجد طرف دائن على حساب الموردين 281/);
  assert.match(source, /لا يوجد قيد على 1410/);
  assert.match(source, /لا يوجد قيد على 2110/);
  assert.match(source, /invoicePostingReconciliationPanel\(\)/);
});


test("financial reports and individual tables have Excel and PDF export controls for partial-screen export", () => {
  assert.match(source, /const exportSectionContent=\(sourceNode,format\)=>\{/);
  assert.match(source, /data-pest-export-scope':'panel'/);
  assert.match(source, /data-pest-export-scope':'table'/);
  assert.match(source, /تصدير الجزء المحدد إلى Excel/);
  assert.match(source, /تصدير الجزء المحدد إلى PDF/);
  assert.match(source, /Excel\.utils\.book_append_sheet/);
  assert.match(source, /printWindow\.print\(\)/);
  assert.match(source, /تصدير جميع القوائم إلى ملف Excel واحد/);
  assert.match(source, /data-pest-export-scope':'all-statements'/);
  assert.match(source, /sheetNameCounts/);
  assert.match(source, /cleanSheetBase/);
});

test("daily journal rows show a permission-gated unpost button beside Open Journal", () => {
  assert.match(source, /button\('فتح القيد',\(\)=>openJournalModal\(x\),'muted'\)/);
  assert.match(source, /posted&&canFinance\('journal','delete'\)&&canFinance\('review','edit'\)/);
  assert.match(source, /void unpostJournalDocument\(x\)/);
  assert.match(source, /action:'unpostJournal'/);
  assert.match(source, /إعادة المستند إلى المراجعة/);
});

test("all journal rows expose delete or cancel-impact action, including source-generated posted entries", () => {
  assert.match(source, /button\(posted&&!manual\?'حذف القيد ومصدره':'حذف القيد',\(\)=>void deleteJournalDocument\(draft\)/);
  assert.match(source, /حذف القيد نهائيًا/);
  assert.match(source, /لن يمنع وجود حركات مخزنية لاحقة تنفيذ الحذف/);
  assert.doesNotMatch(source, /سيُنشأ قيد عكسي بانتظار المراجعة/);
  assert.match(source, /linkedRefs=/);
  assert.match(source, /سيتم حذف القيد الأصلي وكل القيود المرتبطة به/);

});


test("journal entry account, cost center and analytic party fields support typing to search, and journals can add extra lines", () => {
  assert.match(source, /const searchablePicker=/);
  assert.match(source, /ابحث بالاسم أو الكود/);
  assert.match(source, /searchablePickerWithAdd\('الحساب'/);
  assert.match(source, /searchablePickerWithAdd\('مركز التكلفة'/);
  assert.match(source, /analyticPickerWithAdd\('الطرف التحليلي — '/);
  assert.match(source, /＋ إضافة سطر جديد/);
  assert.match(source, /journal\.lines\.length<=2/);
});



test("opening balances screen supports account and analytical party balances with one reviewable journal", () => {
  assert.match(source, /\['openingBalances','الأرصدة الافتتاحية','Opening Balances'\]/);
  assert.match(source, /const renderOpeningBalances=\(\)=>\{/);
  assert.match(source, /openingAnalyticOptions\(detailAccount\.subledgerType/);
  assert.match(source, /partyType:account\.subledgerType,partyId:String\(detail\.partyId\)/);
  assert.match(source, /action:"submitOpeningBalances"/);
  assert.match(source, /حساب موازن تلقائي/);
  assert.match(source, /if\(tab==='openingBalances'\)content=renderOpeningBalances\(\)/);
});

test("journal entry form compacts details and places line labels beside the account selector", () => {
  assert.match(source, /md:col-span-12.*field\('البيان'/);
  assert.match(source, /'السطر '\+\(index\+1\)/);
  assert.match(source, /panel\('سطور القيد','',/);
  assert.doesNotMatch(source, /panel\('سطور القيد','يجب أن يتساوى المدين والدائن\.'/);
});

test("searchable financial dropdowns close when clicking outside their picker", () => {
  assert.match(source, /document\.addEventListener\('pointerdown',closeFinancePickers,true\)/);
  assert.match(source, /data-finance-picker-root':'true'/);
});

test("review journal header fits all six fields into two compact rows", () => {
  assert.match(source, /const headerField=\(label,value,onChange,type\)=>h\("label"/);
  assert.match(source, /grid grid-cols-3 gap-x-2 gap-y-1\.5 min-w-0/);
  assert.match(source, /h-8 w-full min-w-0 rounded-md border/);
  const headerBlock = source.slice(source.indexOf('panel("بيانات رأس القيد"'), source.indexOf('h("div",{className:"flex flex-wrap gap-2 text-xs"}', source.indexOf('panel("بيانات رأس القيد"')));
  assert.equal((headerBlock.match(/headerField\("/g)||[]).length, 6);
  assert.match(headerBlock, /headerField\("تاريخ القيد"/);
  assert.match(headerBlock, /headerField\("بيان القيد"/);
});

test("journal review editors expose and save check, invoice and document numbers in the header", () => {
  assert.match(source, /checkNumber:doc\.checkNumber\|\|""/);
  assert.match(source, /invoiceNumber:doc\.invoiceNumber\|\|""/);
  assert.match(source, /documentNumber:doc\.documentNumber\|\|""/);
  assert.match(source, /headerField\("رقم الشيك",draft\.checkNumber\|\|""/);
  assert.match(source, /headerField\("رقم الفاتورة",draft\.invoiceNumber\|\|""/);
  assert.match(source, /headerField\("رقم المستند",draft\.documentNumber\|\|""/);
  assert.match(source, /checkNumber:draft\.checkNumber\|\|""/);
  assert.match(source, /invoiceNumber:draft\.invoiceNumber\|\|""/);
  assert.match(source, /documentNumber:draft\.documentNumber\|\|""/);
  assert.match(source, /reviewDetailItem\(t\('رقم الشيك','Check Number'\),selected\.checkNumber\|\|'—'\)/);
});

test("journal attachments load in review, support multiple new files, and preserve existing files", () => {
  assert.match(source, /tab==='review'&&selected&&selected\.type==='journal'\)void loadStatementAttachments\(\[selected\]\)/);
  assert.match(source, /const appendStatementAttachment=\(entityId,rawAttachment\)=>/);
  assert.match(source, /const uploadJournalAttachments=async\(files,record\)=>/);
  assert.match(source, /multiple:true,accept:'image\/\*,\.pdf,\.doc,\.docx,\.xls,\.xlsx,\.csv,\.txt'/);
  assert.match(source, /setStatementAttachmentIndex\(previous=>\{/);
  assert.match(source, /const next=current\.filter\(item=>String\(item\.id\)!==String\(attachment\.id\)\)/);
  assert.match(source, /statementAttachmentAction\(selected\)/);
  assert.match(source, /journalAttachmentUploadControl\(selected\)/);
  assert.match(source, /journalAttachmentUploadControl\(draft\)/);
  assert.match(source, /journalAttachmentUploadControl\(statementJournal\)/);
  assert.match(source, /const combined=\[\.\.\.\(found\.get\(key\)\|\|\[\]\),\.\.\.\(Array\.isArray\(previous\[key\]\)\?previous\[key\]:\[\]\)\]/);
});

test("daily journal rows show green posted and red cancelled status badges", () => {
  assert.match(source, /border-emerald-200 bg-emerald-50 text-emerald-700/);
  assert.match(source, /border-rose-200 bg-rose-50 text-rose-700/);
});

test("inventory movement screen supports edit/delete, cancelled-row cleanup and direct stock balance correction", () => {
  assert.match(source, /const openInventoryMovementEditor=movement=>/);
  assert.match(source, /action:"changeInventoryMovement"/);
  assert.match(source, /button\("تعديل",\(\)=>openInventoryMovementEditor\(item\)/);
  assert.match(source, /button\("حذف",\(\)=>void deleteInventoryMovement\(item\)/);
  assert.match(source, /busy\|\|\(inactive&&!item\.cancelledByJournalDeletion\)/);
  assert.match(source, /button\("تعديل الرصيد"/);
  assert.match(source, /button\("تصفير الرصيد"/);
});

test("balance sheet displays warehouse inventory value and compares it with account 1300", () => {
  assert.match(source, /const inventoryStatementRows=/);
  assert.match(source, /const inventorySubledgerValue=/);
  assert.match(source, /const inventoryLedgerBalance=/);
  assert.match(source, /inventoryStatementReconciliationPanel\(\)/);
});

test("inventory movement adjustment journals remain read-only in review and journal details", () => {
  assert.match(source, /!draft\.inventoryMovementChange/);
  assert.match(source, /inventoryMovementChange:doc\.inventoryMovementChange\|\|null/);
});


test("financial attachments can be deleted from invoice, statement, and partner-custody views", () => {
  assert.match(source, /const canDeleteStatementAttachment=\(attachment,assignedContext=false\)=>/);
  assert.match(source, /const deleteStatementAttachment=async\(attachment,invoiceDocumentId="",assignedContext=false\)=>/);
  assert.match(source, /action:"deleteAttachment",documentId,attachmentId:attachment\.id/);
  assert.match(source, /deleteStatementAttachment\(item,invoiceDocumentIdForAttachment\(item\)\)/);
  assert.match(source, /deleteStatementAttachment\(Object\.assign\(\{\},attachment,\{entityType:'financial',entityId:selected\.id\}\),selected\.id\)/);
  assert.match(source, /const reference=Object\.assign\(\{\},item,\{entityType:'cashCustody',entityId\}\)/);
  assert.match(source, /canDeleteStatementAttachment\(reference\)/);
  assert.match(source, /canDeleteStatementAttachment\(statementAttachmentPreview\.attachment\)/);
});


test("review journal account pickers have independent search state and a wider account field", () => {
  assert.match(source, /const select=\(label,value,onChange,options,searchKey\)=>searchablePicker/);
  assert.match(source, /const selectWithAdd=\(label,value,onChange,options,kind,defaults,searchKey\)=>select/);
  assert.match(source, /review-journal-"\+String\(draft\.id\)\+"-line-"\+index\+"-account"/);
  assert.match(source, /review-journal-"\+String\(draft\.id\)\+"-line-"\+index\+"-center"/);
  assert.match(source, /journal-modal-'\+String\(draft\.id\)\+'-line-'\+index\+'-account'/);
  assert.match(source, /journal-modal-'\+String\(draft\.id\)\+'-line-'\+index\+'-center'/);
  assert.match(source, /className:"md:col-span-3 min-w-0"},selectWithAdd\("كود \/ اسم الحساب"/);
  assert.match(source, /map\(\(row,i\)=>i===index\?Object\.assign\(\{\},row,\{accountCode:value/);
});


test("transferred invoice actions support edit, reassignment, deletion and personal archives on both lists", () => {
  assert.match(source, /const manageAssignment=async\(mode,source,target\)=>/);
  assert.match(source, /const saveAssignmentChanges=async\(\)=>/);
  assert.match(source, /action:"manageInvoiceAssignment",mode:"update"/);
  assert.match(source, /mode:'reassign',scope:'sent'/);
  assert.match(source, /mode,scope:source==="sent"\?"sent":"received"/);
  assert.match(source, /const receivedArchived=assignmentItems\.filter\(item=>Boolean\(item\.archivedAt\)\)/);
  assert.match(source, /const sentArchived=sentAssignmentItems\.filter\(item=>Boolean\(item\.archivedAt\)\)/);
  assert.match(source, /أرشيف المهام الواردة/);
  assert.match(source, /أرشيف التحويلات الصادرة/);
  assert.match(source, /حذف \/ إرجاع/);
  assert.match(source, /حفظ التعديلات/);
});


test("financial report summary totals appear directly below report filters and duplicate diagnostics are hidden", () => {
  const filters=reportsSource.indexOf("field('من شهر'");
  const summary=reportsSource.indexOf("trialBalanceTotals");
  const exportNode=reportsSource.indexOf("fullStatementsExportNode()");
  assert.ok(filters>=0&&summary>filters&&exportNode>summary,"summary metrics must follow the period/list picker and precede the report body");
  assert.doesNotMatch(reportsSource,/criticalAccountIntegrityPanel\(\)/);
  assert.doesNotMatch(reportsSource,/controlSubledgerIntegrityPanel\(\)/);
  assert.doesNotMatch(reportsSource,/trialIntegrityNote/);
});

test("VAT input and output plus posted settlements are netted into a single asset or liability line", () => {
  assert.match(source,/const vatInputBalance=balanceTrial\.find\(row=>String\(row\.account\.code\)==="1410"\)/);
  assert.match(source,/const vatOutputBalance=balanceTrial\.find\(row=>String\(row\.account\.code\)==="2110"\)/);
  assert.match(source,/const vatNetPosition=/);
  assert.match(source,/sumFrom\(balanceTrial\.filter\(row=>String\(row\.account\.code\)!=="1410"\),'asset'\)\+vatNetReceivable/);
  assert.match(source,/String\(x\.account\.code\)!=="2110"/);
  assert.match(source,/صافي ضريبة القيمة المضافة \(مدخلات ومخرجات وسدادات\)/);
  assert.match(source,/const balanceAssetRows=statementRowsWithBalance\(account=>account\.type==='asset'&&!account\.isGroup&&String\(account\.code\)!=="1410"/);
  assert.match(source,/const balanceLiabilityRows=statementRowsWithBalance\(account=>account\.type==='liability'&&!account\.isGroup&&String\(account\.code\)!=="2110"/);
});

test("financing account 2150 uses an isolated financier registry rather than suppliers, partners or users", () => {
  assert.match(source,/financingParty:"جهة التمويل \/ الدائن"/);
  assert.match(source,/else if\(type==="financingParty"\)/);
  assert.match(source,/records=registeredFinancingParties\.filter\(item=>item&&item\.active!==false\)/);
  assert.doesNotMatch(source,/label:"جهة ممولة:|label:"شريك:|label:"مستخدم \/ ممول:/);
  assert.match(source,/openQuickAdd\("financingParties",onChange,\{name:extractFinancingPartyName\(description\)\}\)/);
  assert.match(source,/financingParty:'جهة تمويل \/ دائن'/);
  assert.match(source,/\['partnerCurrentAccount','financingParty'\]\.includes\(account\.subledgerType\)/);
});

test("review page exposes a precision accounting audit with actionable findings", () => {
  assert.match(source,/const runIntegrityAudit=async\(\)=>/);
  assert.match(source,/Math\.abs\(Math\.round\(difference\*100\)\)>0/);
  assert.match(source,/Math\.abs\(Math\.round\(debitDiff\*100\)\)>0/);
  assert.match(source,/مطابقة الأستاذ العام مع الأستاذ المساعد/);
  assert.match(source,/مطابقة مبلغ السداد الضريبي/);
  assert.match(source,/اختلاف طرف ضريبة الخصم/);
  assert.match(source,/button\(integrityAuditBusy\?'جارٍ الفحص\.\.\.'\s*:\s*'تشغيل الفحص الموحد',runUnifiedReview/);
  assert.match(source,/تقرير الفحص الذكي/);
  assert.match(source,/توجيه الضريبة/);
  assert.match(source,/جهة التمويل/);
});

test("review screen visibly lists the accounting audit rule catalog", () => {
  assert.match(source,/قواعد الفحص المطبقة/);
  assert.match(source,/سلامة القيد والتوازن/);
  assert.match(source,/جهات التمويل/);
  assert.match(source,/توجيه الضرائب/);
  assert.match(source,/مطابقة الأستاذ المساعد/);
  assert.match(source,/دفتر الأستاذ وميزان المراجعة/);
});

test("financing journal audit compares the lender named in the description with the selected financier", () => {
  assert.match(source,/const statedFinancierName=extractFinancingPartyName/);
  assert.match(source,/جهة تمويل غير مسجلة/);
  assert.match(source,/اختلاف الممول مع البيان/);
  assert.match(source,/expectedPartyId/);
});

test("manual withholding tax lines are checked against their matching supplier or customer control account", () => {
  assert.match(source,/const counterpartAccountCode=withholdingPartyType==="vendor"\?"281":withholdingPartyType==="customer"\?"1210":""/);
  assert.match(source,/اختلاف طرف ضريبة الخصم/);
  assert.match(source,/غياب فهرس دفتر الأستاذ/);
});

test("financier auto-matching extracts explicit lender names without inventing names from generic descriptions", () => {
  const start=source.indexOf("const extractFinancingPartyName=value=>");
  const end=source.indexOf("const analyticPickerWithAdd=",start);
  const extractor=source.slice(start,end);
  assert.ok(start>=0&&end>start,"financier name parser must be present");
  assert.match(extractor,/الممول/);
  assert.match(extractor,/تمويل/);
  assert.match(extractor,/قرض/);
  assert.match(extractor,/return ""/);
  assert.doesNotMatch(extractor,/match&&match/);
});

test("VAT movement and settlement detail is displayed inside statements but excluded from profit", () => {
  assert.match(source,/tax_payment:"سداد ضريبة/);
  assert.match(source,/vat_refund:"استرداد قيمة مضافة/);
  assert.match(source,/موقف الضرائب — إيضاح مستقل داخل قائمة الدخل/);
  assert.match(source,/incomeTaxLines=periodJournals\.flatMap/);
  assert.match(source,/incomeVatClosing/);
  assert.match(source,/لا تُضاف إلى الإيرادات أو المصروفات ولا تغيّر صافي الربح/);
});

test("all searchable account pickers support inline coding and canceling search preserves the current value", () => {
  assert.match(source,/needle=normalizeMatch\(query\),addItem=list\.find\(item=>String\(item\.value\)==='__quick_add__'\)/);
  assert.match(source,/const query=opened\?\(hasQuery\?String\(journalPickerSearch\[searchKey\]\|\|''\):''\):String\(selected&&selected\.label\|\|''\)/);
  assert.doesNotMatch(source,/else if\(value\)onChange\(\{\}\)/);
  assert.match(source,/selectWithAdd\('الحساب المحاسبي',accountAnalysisCode/);
  assert.match(source,/selectWithAdd\('الحساب المقابل',offset/);
  assert.match(source,/selectWithAdd\('الحساب المحاسبي المرتبط',quickAddForm\.accountCode/);
  assert.match(source,/selectWithAdd\('الحساب الأب',masterForm\.parentCode/);
  assert.match(source,/selectWithAdd\('الحساب الأب',quickAddForm\.parentCode/);
});

test("current-screen export toolbar scrolls normally and does not stick to the viewport", () => {
  assert.match(indexHtml,/\.app-report-toolbar\{position:static!important;top:auto!important;/);
  assert.match(indexHtml,/box-shadow:none!important/);
});


test("account 2150 remains analytical in the browser while Worker migration is pending", () => {
  assert.match(source, /const accounts=rows\(master\.chartOfAccounts\)\.map\(account=>String\(account\.code\)==="2150"/);
  assert.match(source, /subledgerType:"financingParty",isControl:true/);
  const accountMapping=source.slice(source.indexOf('const accounts=rows(master.chartOfAccounts)'),source.indexOf('const centers=',source.indexOf('const accounts=rows(master.chartOfAccounts)')));
  assert.doesNotMatch(accountMapping,/isGroup:false/);
  assert.match(source, /const missingAnalytic=\(journal\.lines\|\|\[\]\)\.map/);
  assert.match(source, /account\.subledgerType&&!String\(item\.line\.partyId\|\|""\)\.trim\(\)/);
  assert.match(source, /const financingParties=registeredFinancingParties\.map/);
  assert.match(source, /records=registeredFinancingParties\.filter\(item=>item&&item\.active!==false\)/);
  assert.match(source, /api\('\?resource=party&type='\+encodeURIComponent\(partyStatement\.type\)/);
  assert.match(source, /partyStatement\.type==="financingParty"/);
});

test("analytical party selectors support quick creation of customers and financing parties", () => {
  assert.match(source, /const analyticPickerWithAdd=/);
  assert.match(source, /openQuickAdd\("parties",onChange,\{partyType:partyKind\}\)/);
  assert.match(source, /analyticPickerWithAdd\('الطرف التحليلي — '\+analyticPartyLabel\(analyticType\)/);
  assert.match(source, /analyticPickerWithAdd\("الطرف التحليلي",detailAccount\.subledgerType/);
  assert.match(source, /editable&&analyticType\?analyticPickerWithAdd\(/);
});

test("opening or closing an analytical picker does not replace its existing value without a selection", () => {
  const picker=source.slice(source.indexOf("const searchablePicker="), source.indexOf("const searchablePickerWithAdd="));
  assert.match(picker, /const choose=item=>\{\s*onChange\(item\.value\)/);
  assert.match(picker, /onFocus:e=>\{const rect=e\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(picker, /setJournalPickerSearch\(old=>Object\.assign\(\{\},old,\{\[searchKey\]:''\}\)\)/);
  assert.match(picker, /if\(e\.key==='Escape'\)setJournalPickerOpen/);
});

test("employee advance and custody analytic selectors use coded master registries, not the user directory", () => {
  const options = source.slice(source.indexOf("const analyticPartyOptions="), source.indexOf("const openJournalModal="));
  assert.match(options, /registry=type==="employeeCustody"\?rows\(master\.employeeCustodies\):rows\(master\.employeeAdvances\)/);
  assert.doesNotMatch(options, /activeAnalyticUsers\.map\(user/);
  assert.match(source, /openQuickAdd\(kind,\(code,record\)=>\{if\(record\)onChange\(String\(record\.employeeUid\|\|record\.code\|\|code\|\|""\)\);\},\{\}\)/);
  assert.match(source, /value:"__quick_add__",label:"＋ إضافة كود "\+labelText\+" جديد"/);
  assert.match(source, /employeeUid:f\.employeeUid\|\|""/);
  assert.match(apiSource, /const masterCodeId=\(value,kind\)=>\{const raw=txt\(value,120\);/);
  assert.match(apiSource, /code=masterCodeId\(item\.code,kind\)/);
  assert.match(apiSource, /code=masterCodeId\(row\.code,kind\)/);
  assert.match(source, /أدخل كودًا صالحًا للسلفة أو العهدة/);
});

test("employee advance and custody codes are maintained in the central master directory", () => {
  assert.match(source, /employeeAdvances:"masters",employeeCustodies:"masters"/);
  assert.match(source, /\["employeeAdvances","أكواد السلف"\],\["employeeCustodies","أكواد العهد"\]/);
  assert.match(source, /employeeAdvances:\{label:'أكواد السلف',kind:'employeeAdvances',columns:\['code','name','employeeUid'\]\}/);
  assert.match(source, /employeeCustodies:\{label:'أكواد العهد',kind:'employeeCustodies',columns:\['code','name','employeeUid'\]\}/);
  assert.match(source, /const canViewMasterDirectory=/);
  assert.doesNotMatch(source, /\['accounts','دليل الحسابات','Chart of Accounts'\]/);
  assert.doesNotMatch(source, /\['centers','مراكز التكلفة','Cost Centers'\]/);
});

test("employee advance and custody registries are server-validated and protected by their historical ledger references", () => {
  assert.match(apiSource, /employeeAdvances:"masters",employeeCustodies:"masters"/);
  assert.match(apiSource, /const employeeUid=String\(item\.employeeUid\|\|""\)\.trim\(\)/);
  assert.match(apiSource, /يوجد كود نشط لهذا الموظف بالفعل/);
  assert.match(apiSource, /kind==="employeeAdvances"\|\|kind==="employeeCustodies"/);
  assert.ok(apiSource.includes('adminRead("partyLedger/"+subledgerType+"/"+id(analyticPartyId))'));
  assert.match(apiSource, /findMasterReferences\(ctx,kind,code\)/);
  assert.match(source, /employeeUid:\['employeeuid'/);
});

test("unified master directory retains cost center analysis and the same master records feed inline dropdown creation", () => {
  const masterView = source.slice(source.indexOf("const renderMasters="), source.indexOf("const renderTax="));
  assert.match(masterView, /activeMasterViewKind==="costCenters"\?renderCostCenterAnalysis\(\):null/);
  assert.match(source, /financeAreaForMaster\(kind\)/);
  assert.match(source, /const visibleNav=masterDirectoryOnly\?\[\]:nav\.filter\(item=>item\[0\]!==\"masters\"/);
  assert.match(apiSource, /for\(const k of \[[\s\S]*"employeeAdvances","employeeCustodies","settings"\]\)out\[k\]=\(await adminRead\(k\)\)\|\|\{\};/);
});

test("employee advance and custody codes can be saved and imported without linking a user", () => {
  const save = apiSource.slice(apiSource.indexOf('if(action==="saveMaster")'), apiSource.indexOf('if(action==="deleteMasters")'));
  const imported = apiSource.slice(apiSource.indexOf('if(action==="importMasters")'), apiSource.indexOf('if(action==="submitProjectEvent")'));
  assert.match(save, /const employeeUid=String\(item\.employeeUid\|\|""\)\.trim\(\)/);
  assert.match(save, /if\(employeeUid\)\{/);
  assert.match(save, /delete item\.employeeUid/);
  assert.doesNotMatch(save, /يجب ربط كود السلفة أو العهدة/);
  assert.match(imported, /const employeeUid=String\(row\.employeeUid\|\|""\)\.trim\(\)/);
  assert.match(imported, /if\(employeeUid\)\{/);
  assert.match(source, /اسم المستخدم المرتبط \(اختياري\)/);
  assert.match(source, /' — @'\+user\.username/);
  assert.match(source, /بدون ربط بمستخدم/);
  assert.match(source, /item\.employeeUid\|\|item\.code/);
});

test("unlinked employee advance and custody codes appear in their own analytical statements", () => {
  const statement = source.slice(source.indexOf("const renderPartyStatements = function()"), source.indexOf("const renderPartnerCurrent"));
  assert.match(statement, /employeeRegistry=partyStatement\.type==="employeeCustody"\?rows\(master\.employeeCustodies\):partyStatement\.type==="employeeAdvance"\?rows\(master\.employeeAdvances\):\[\]/);
  assert.match(statement, /const partyId=String\(item\.employeeUid\|\|item\.code\|\|""\)/);
  assert.match(statement, /employeeType\?\(item\.uid\|\|item\.employeeUid\|\|item\.code\|\|item\.id\)/);
  assert.match(source, /record=registry\.find\(item=>String\(item\.employeeUid\|\|item\.code\|\|''\)===String\(line\.partyId\|\|''\)\)/);
});

test("main searchable dropdown uses a body portal and viewport-aware fixed placement", () => {
  const picker = indexHtml.slice(indexHtml.indexOf("function PestSearchableSelect(props){"), indexHtml.indexOf("function App(){"));
  assert.match(picker, /ReactDOM\.createPortal\(menu,document\.body\)/);
  assert.match(picker, /position:'fixed'/);
  assert.match(picker, /spaceBelow/);
  assert.match(picker, /spaceAbove/);
  assert.match(picker, /window\.addEventListener\('scroll',reposition,true\)/);
  assert.match(picker, /viewport\.addEventListener\('resize',reposition\)/);
  assert.match(indexHtml, /\.app-workspace select\{-webkit-appearance:none!important/);
  assert.match(indexHtml, /PEST_CRM_MODULE_BUILD='20261124-crm-dropdown-portal-v2'/);
  assert.match(indexHtml, /pest-crm-module\.js\?v='\+PEST_CRM_MODULE_BUILD/);
});

test("CRM searchable dropdown uses a body portal and repositions instead of being clipped by nested panels", () => {
  const picker = crmSource.slice(crmSource.indexOf("function CrmSearchableSelect(props){"), crmSource.indexOf("const select = (label,value,onChange,options,opts)"));
  assert.match(picker, /ReactDOM\.createPortal\(menu,document\.body\)/);
  assert.match(picker, /position:'fixed'/);
  assert.match(picker, /spaceBelow/);
  assert.match(picker, /spaceAbove/);
  assert.match(picker, /window\.addEventListener\('scroll',reposition,true\)/);
  assert.match(picker, /data-crm-picker-menu/);
});

test("master directory flag is initialized before its first effect dependency array is evaluated", () => {
  const flag = source.indexOf("const masterDirectoryOnly=props.masterDirectoryOnly===true;");
  const effect = source.indexOf("React.useEffect(()=>{if(masterDirectoryOnly)");
  assert.ok(flag >= 0, "master directory flag must be initialized");
  assert.ok(effect >= 0, "master directory effect must be present");
  assert.ok(flag < effect, "masterDirectoryOnly must be declared before useEffect evaluates its dependency array");
});

test("master directory permissions allow master-data users to load and maintain all master code types", () => {
  assert.match(apiSource, /if\(!hasPermission\(profile,"financial","view"\)&&!hasPermission\(profile,"master","view"\)&&!hasPermission\(profile,"financial_masters","view"\)\)requirePermission\(profile,"financial","view"\)/);
  assert.match(apiSource, /const requireFinanceMaster=\(kind,action\)=>\{\s*if\(\["parties","financingParties","employeeAdvances","employeeCustodies"\]\.includes\(kind\)&&hasPermission\(profile,"master",action\)\)return true;/);
  assert.match(apiSource, /requireFinanceMaster\(kind,previous\?"edit":"add"\)/);
  assert.match(indexHtml, /tabId==='master'\?\(hasPermission\('master','view'\)\|\|hasPermission\('financial_masters','view'\)\)/);
});

test("master code list appears directly under the type selector before the import section", () => {
  const masterView = source.slice(source.indexOf("const renderMasters="), source.indexOf("const renderTax="));
  assert.match(masterView, /select\("نوع البيانات",activeMasterViewKind/);
  const rendered = masterView.slice(masterView.indexOf('return h("div",{className:"space-y-3"}'));
  assert.ok(rendered.indexOf('panel("دليل الأكواد والبيانات الأساسية"') < rendered.indexOf("listPanel,"));
  assert.ok(rendered.indexOf("listPanel,") < rendered.indexOf("importPanel,"));
  assert.doesNotMatch(masterView, /panel\("أنواع البيانات الأساسية"/);
});

test("the global master navigation opens the unified directory instead of the legacy customer/vendor page", () => {
  assert.match(indexHtml, /master:'دليل الأكواد والبيانات الأساسية'/);
  assert.match(indexHtml, /id:'master',label:rtl\?'دليل الأكواد والبيانات الأساسية':'Master Codes & Master Data',icon:'fa-database',tab:'master'/);
  assert.doesNotMatch(indexHtml, /id:'masterGroup'/);
  assert.match(indexHtml, /masterDirectoryOnly=\{tab==='master'\}/);
  assert.match(indexHtml, /can=\{\(module,action\)=>\{if\(tab==='master'&&module==='financial_masters'\)/);
  assert.match(indexHtml, /externalPartyRequest=\{financialPartyMasterRequest\}/);
  assert.match(indexHtml, /tab==='master'&&financialPartyReturn&&/);
  assert.match(indexHtml, /function openFinancialPartyMaster\(payload\)[\s\S]*setFinancialPartyMasterRequest/);
});

test("financial dropdowns open on the side with more visible space and keep the previous choice visible while searching", () => {
  const picker = source.slice(source.indexOf("const searchablePicker="), source.indexOf("const searchablePickerWithAdd="));
  assert.match(picker, /position:'fixed',zIndex:10000/);
  assert.match(picker, /const spaceBelow=Math\.max\(0,vh-rect\.bottom-8\)/);
  assert.match(picker, /const spaceAbove=Math\.max\(0,rect\.top-8\)/);
  assert.match(picker, /openBelow=spaceBelow>=spaceAbove/);
  assert.match(picker, /ReactDOM\.createPortal\(menu,document\.body\)/);
  assert.match(picker, /data-finance-picker-menu/);
  assert.match(source, /window\.addEventListener\('scroll',reposition,true\)/);
  assert.match(source, /if\(openBelow\)anchor\.top=/);
  assert.match(source, /else anchor\.bottom=/);
  assert.match(picker, /const selectedCurrent=selected&&String\(selected\.value\)!==''\?selected:null/);
  assert.match(picker, /filteredMatches\.filter\(item=>!selectedCurrent\|\|String\(item\.value\)!==String\(selectedCurrent\.value\)\)/);
  assert.match(picker, /'الاختيار الحالي'/);
});

test("current screen report toolbar stays in normal document flow", () => {
  assert.match(indexHtml, /\.app-report-toolbar\{position:static!important;top:auto!important;inset:auto!important;z-index:auto!important;transform:none!important;/);
});


test("financing-party analytics are resolved from the 2150 account and journal description, never borrowed from suppliers", () => {
  const openModal = source.slice(source.indexOf("const openJournalModal=doc=>{"), source.indexOf("const updateJournalModalLine="));
  const partyLabel = source.slice(source.indexOf("const reviewPartyLabel="), source.indexOf("const renderReviewJournalDetails="));
  assert.match(source, /String\(account\.code\)==="2150"[\s\S]*subledgerType:"financingParty"/);
  assert.match(openModal, /const analyticType=account&&account\.subledgerType\|\|line\.partyType\|\|""/);
  assert.match(openModal, /matchFinancingPartyFromText\(\[line\.description,doc\.description,doc\.reference\]\.join\(" "\)\)\|\|saved/);
  assert.match(openModal, /partyType:"financingParty",partyId:matched\?String\(matched\.code\|\|matched\.id\):""/);
  assert.match(partyLabel, /registeredFinancingParties\.find/);
  assert.match(source, /openQuickAdd\("financingParties",onChange,\{name:extractFinancingPartyName\(description\)\}\)/);
});

test("Review smart audit checks cents, analytical control balances, account mappings and withholding party codes", () => {
  const audit = source.slice(source.indexOf("const runIntegrityAudit=async()=>{"), source.indexOf("const openReviewItem=async"));
  assert.match(audit, /api\(periodQuery\)\.catch\(\(\)=>null\)/);
  assert.match(audit, /auditBalanceFlat=flattenJournals\(auditBalanceJournals\)/);
  assert.match(audit, /مطابقة الأستاذ العام مع الأستاذ المساعد/);
  assert.match(audit, /تصنيف الحساب الرئيسي/);
  assert.match(audit, /اختلاف طرف ضريبة الخصم/);
  assert.match(audit, /مطابقة قيمة ضريبة الفاتورة/);
  assert.match(audit, /مطابقة مبلغ السداد الضريبي/);
  assert.match(audit, /Math\.round\(difference\*100\)/);
  assert.match(source, /renderIntegrityAuditPanel\(\)/);
  assert.match(source, /button\(integrityAuditBusy\?'جارٍ الفحص\.\.\.'\s*:\s*'تشغيل الفحص الموحد',runUnifiedReview/);
});

test("withholding invoice journal lines inherit the same supplier/customer analytical code as their source invoice", () => {
  assert.match(apiSource, /const taxParty=String\(tax\.accountCode\)==="2120"\?\{partyType:purchase\?"vendor":"customer",partyId\}:\{\}/);
  assert.match(apiSource, /Object\.assign\(\{accountCode:tax\.accountCode,debit:amount,credit:0,[\s\S]*taxParty\)/);
  assert.match(apiSource, /Object\.assign\(\{accountCode:tax\.accountCode,debit:0,credit:amount,[\s\S]*taxParty\)/);
});

test("income statement tax disclosure separates VAT inputs, outputs, settlement, refunds and withholding with drill-through", () => {
  assert.match(source, /const incomeTaxMetric=\(label,value,accountCode\)=>h\("button"/);
  assert.match(source, /incomeTaxMetric\("ضريبة مدخلات المشتريات — 1410"/);
  assert.match(source, /incomeTaxMetric\("ضريبة مخرجات المبيعات — 2110"/);
  assert.match(source, /incomeTaxMetric\("المسدد من القيمة المضافة — 2110"/);
  assert.match(source, /incomeTaxMetric\("ضريبة الخصم والإضافة المستحقة — 2120"/);
  assert.match(source, /incomeTaxMetric\("المسدّد من الخصم والإضافة — 2120"/);
  assert.match(source, /onClick:\(\)=>openStatementAccount\(accountCode\)/);
  assert.match(source, /اضغط رقم القيد في الجدول لعرض مستند السداد أو الفاتورة والقيد بالكامل/);
});


test("review, approval and comprehensive account review share one workspace", () => {
  assert.match(source, /مركز المراجعة والفحص والاعتماد/);
  assert.match(source, /renderAccountReview\(\)/);
  assert.doesNotMatch(source, /\['accountReview','مراجعة شاملة','Comprehensive Review'\]/);
  assert.match(source, /\['review','المراجعة والفحص والاعتماد','Review, Audit & Approval'\]/);
  assert.match(source, /panel\('قواعد الفحص المطبقة'/);
});

test("audit findings present current state, recommendations and user-controlled decisions", () => {
  assert.match(source, /const renderIntegrityFindingModal=\(\)=>/);
  assert.match(source, /الوضع القائم \/ سبب المشكلة/);
  assert.match(source, /المعالجة المقترحة/);
  assert.match(source, /الإبقاء كما هو وتوثيق القرار/);
  assert.match(source, /قبول الاقتراح وفتح المعالجة/);
  assert.match(source, /تعديل يدوي دون تطبيق الاقتراح/);
  assert.match(source, /إلغاء دون تغيير/);
  assert.match(source, /createJournalRevision/);
});

test("review journal editor supports inline coding for analytical parties above the editor", () => {
  assert.match(source, /analyticPickerWithAdd\("الطرف التحليلي/);
  assert.match(source, /z-\[240\]/);
  assert.match(source, /w-full min-h-11 flex items-center justify-between/);
});


test("all financial report tables use independent bounded vertical and horizontal scrolling", () => {
  assert.match(source, /const table=\(headers,data,scrollStyle\)=>/);
  assert.match(source, /maxHeight:'min\(62vh, 620px\)'/);
  assert.match(source, /overflowY:'auto'/);
  assert.match(source, /overflowX:'auto'/);
  assert.match(source, /overscrollBehavior:'contain'/);
  assert.match(source, /scrollbarGutter:'stable'/);
  assert.match(source, /role:'region','aria-label':'جدول '\+exportTitle/);
  assert.match(source, /sticky top-0 z-10 bg-slate-100/);
  assert.match(source, /Object\.assign\(\{[\s\S]*\},scrollStyle\|\|\{\}\)/);
});

test("imported journals needing completion use the shared scrollable report table", () => {
  const start=source.indexOf("const renderLegacyImport=()=>{");
  const end=source.indexOf("const renderMasters",start);
  const archive=source.slice(start,end);
  assert.ok(start>=0&&end>start,"legacy import screen must exist");
  assert.match(archive, /panel\("القيود المستوردة التي تحتاج استكمالًا"/);
  assert.match(archive, /corrections\.length\?table\(/);
  assert.match(archive, /correctionRows/);
});

test("legacy imported journal completion list loads documents when its tab opens and avoids false zero counts", () => {
  assert.match(source, /const loadLegacyImportDocuments=async\(\)=>\{/);
  assert.match(source, /api\('\?resource=documents'\)/);
  assert.match(source, /if\(tab!=='legacyImport'\|\|!currentUser\|\|currentUser\.role!=='admin'\)return/);
  assert.match(source, /void loadLegacyImportDocuments\(\)/);
  const start=source.indexOf("const renderLegacyImport=()=>{");
  const end=source.indexOf("const renderMasters",start);
  const archive=source.slice(start,end);
  assert.match(archive, /loadLegacyImportDocuments/);
  assert.match(archive, /legacyImportDocumentsLoaded\?imported\.length:"جارٍ التحميل\.\.\."/);
  assert.match(archive, /legacyImportDocumentsLoading\?"جارٍ تحميل القيود المستوردة\.\.\."/);
});
