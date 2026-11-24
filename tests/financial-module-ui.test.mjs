import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
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

test("financial tables align RTL amounts below matching headers", () => {
  assert.match(source, /className:'pest-finance-workspace p-2 md:p-3 space-y-2'/);
  assert.match(source, /\.pest-finance-workspace\[dir="rtl"\] table\{direction:rtl!important;text-align:right!important;\}/);
  assert.match(source, /table td\[class~="text-end"\]\{direction:ltr!important;text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums;\}/);
  assert.match(source, /className:'p-3 whitespace-nowrap text-right align-middle'/);
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
  assert.match(source, /searchablePicker\('الطرف التحليلي/);
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
  assert.doesNotMatch(source,/else if\(type==="financingParty"\)\{[\s\S]*?activeVendors|else if\(type==="financingParty"\)\{[\s\S]*?partnerCurrentAccounts/);
  assert.match(source,/openQuickAdd\("financingParties",onChange,\{name:extractFinancingPartyName\(description\)\}\)/);
  assert.match(source,/financingParty:'جهة تمويل \/ دائن'/);
  assert.match(source,/\['partnerCurrentAccount','financingParty'\]\.includes\(account\.subledgerType\)/);
});

test("review page exposes a precision accounting audit with actionable findings", () => {
  assert.match(source,/const runIntegrityAudit=async\(\)=>/);
  assert.match(source,/Math\.abs\(difference\)>0\.000001/);
  assert.match(source,/Math\.abs\(debitDiff\)>0\.00005/);
  assert.match(source,/button\(integrityAuditBusy\?'جارٍ الفحص\.\.\.'\s*:\s*'فحص',runIntegrityAudit/);
  assert.match(source,/تقرير الفحص الذكي/);
  assert.match(source,/توجيه الضريبة/);
  assert.match(source,/جهة التمويل/);
});

test("VAT movement and settlement detail is displayed inside statements but excluded from profit", () => {
  assert.match(source,/tax_payment:"سداد ضريبة/);
  assert.match(source,/vat_refund:"استرداد قيمة مضافة/);
  assert.match(source,/موقف الضرائب — إيضاح مستقل داخل القوائم/);
  assert.match(source,/incomeTaxLines=periodJournals\.flatMap/);
  assert.match(source,/incomeVatClosing/);
  assert.match(source,/لا تُضاف هذه المبالغ إلى الإيرادات أو المصروفات ولا تؤثر على صافي الربح/);
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
  assert.match(indexHtml,/\.app-report-toolbar\{position:static;top:auto;/);
  assert.match(indexHtml,/\.app-report-toolbar\{margin:0 0 9px;padding:7px 8px;gap:7px;top:auto\}/);
  assert.match(indexHtml,/--report-toolbar-offset':'0px'/);
});


test("account 2150 remains analytical in the browser while Worker migration is pending", () => {
  assert.match(source, /const accounts=rows\(master\.chartOfAccounts\)\.map\(account=>String\(account\.code\)==="2150"/);
  assert.match(source, /subledgerType:"financingParty",isControl:true,isGroup:false/);
  assert.match(source, /const missingAnalytic=\(journal\.lines\|\|\[\]\)\.map/);
  assert.match(source, /account\.subledgerType&&!String\(item\.line\.partyId\|\|""\)\.trim\(\)/);
  assert.match(source, /const financingParties=Array\.from\(new Map/);
  assert.match(source, /type==="financingParty"\)\{\s*\/\/ Client-side compatibility while older Worker deployments are being upgraded/);
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
  assert.match(picker, /onFocus:\(\)=>\{setJournalPickerOpen/);
  assert.match(picker, /setJournalPickerSearch\(old=>Object\.assign\(\{\},old,\{\[searchKey\]:''\}\)\)/);
  assert.match(picker, /if\(e\.key==='Escape'\)setJournalPickerOpen/);
});

test("current screen report toolbar stays in normal document flow", () => {
  assert.match(indexHtml, /\.app-report-toolbar\{position:static!important;top:auto!important;inset:auto!important;z-index:auto!important;transform:none!important;/);
});
