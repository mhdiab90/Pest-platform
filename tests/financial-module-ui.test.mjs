import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../financial-module.js", import.meta.url), "utf8");

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
  assert.match(source, /controlSubledgerIntegrityPanel\(\)/);
  assert.match(source, /row\.account\.subledgerType/);
});


test("financial reports validate critical balance-sheet and tax control account classifications", () => {
  assert.match(source, /const criticalAccountConfiguration=\[/);
  assert.match(source, /\{code:"1300",type:"asset",nature:"debit",label:"المخزون"\}/);
  assert.match(source, /\{code:"1410",type:"asset",nature:"debit",label:"ضريبة القيمة المضافة - مدخلات"\}/);
  assert.match(source, /\{code:"2110",type:"liability",nature:"credit",label:"ضريبة القيمة المضافة - مخرجات"\}/);
  assert.match(source, /\{code:"281",type:"liability",nature:"credit",subledgerType:"vendor",label:"الموردون"\}/);
  assert.match(source, /const criticalAccountMismatchCount=/);
  assert.match(source, /criticalAccountIntegrityPanel\(\)/);
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
  assert.match(source, /md:col-span-8.*field\('البيان'/);
  assert.match(source, /'السطر '\+\(index\+1\)/);
  assert.match(source, /panel\('سطور القيد','',/);
  assert.doesNotMatch(source, /panel\('سطور القيد','يجب أن يتساوى المدين والدائن\.'/);
});

test("searchable financial dropdowns close when clicking outside their picker", () => {
  assert.match(source, /document\.addEventListener\('pointerdown',closeFinancePickers,true\)/);
  assert.match(source, /data-finance-picker-root':'true'/);
});

test("journal review editors expose and save check, invoice and document numbers in the header", () => {
  assert.match(source, /checkNumber:doc\.checkNumber\|\|""/);
  assert.match(source, /invoiceNumber:doc\.invoiceNumber\|\|""/);
  assert.match(source, /documentNumber:doc\.documentNumber\|\|""/);
  assert.match(source, /field\("رقم الشيك",draft\.checkNumber\|\|""/);
  assert.match(source, /field\("رقم الفاتورة",draft\.invoiceNumber\|\|""/);
  assert.match(source, /field\("رقم المستند",draft\.documentNumber\|\|""/);
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
