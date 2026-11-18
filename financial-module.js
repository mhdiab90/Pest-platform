(function(){
'use strict';
const h=React.createElement;
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
const today=()=>new Date().toISOString().slice(0,10);
const rows=o=>o?Object.entries(o).map(([key,v])=>Object.assign({id:v&&v.id||key,code:v&&v.code||key},v||{})):[];
const id=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now());
const n=v=>Number(v)||0;
const fmt=v=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
const dl=(name,txt)=>{const b=new Blob([txt],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);};
function FinanceModule(props){
 const {db,currentUser,rtl=true,workerBase,userDirectory=[]}=props;
 const t=(ar,en)=>rtl?ar:en,base=workerBase||window.location.origin;
 const [tab,setTab]=React.useState('overview'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
 const [master,setMaster]=React.useState({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},settings:{},inventory:{balances:{}}});
 const [documents,setDocuments]=React.useState([]),[review,setReview]=React.useState([]),[periodJournals,setPeriodJournals]=React.useState([]),[balanceJournals,setBalanceJournals]=React.useState([]),[accountingStartMonth,setAccountingStartMonth]=React.useState('');
 const [clients,setClients]=React.useState([]),[vendors,setVendors]=React.useState([]),[projects,setProjects]=React.useState([]);
 const [period,setPeriod]=React.useState({from:today().slice(0,7),to:today().slice(0,7)}),[report,setReport]=React.useState('trial');
 const [assignmentItems,setAssignmentItems]=React.useState([]),[selectedAssignmentId,setSelectedAssignmentId]=React.useState(''),[assignmentLines,setAssignmentLines]=React.useState([]),[assignmentBusy,setAssignmentBusy]=React.useState(false),[assignmentInstruction,setAssignmentInstruction]=React.useState('مراجعة تصنيف البنود وتحديد الأكواد المخزنية أو حسابات المصروفات'),[assignmentUserUid,setAssignmentUserUid]=React.useState('');
 const [selected,setSelected]=React.useState(null),[offset,setOffset]=React.useState('6100');
 const [quickAddType,setQuickAddType]=React.useState(''),[quickAddTarget,setQuickAddTarget]=React.useState(null),[quickAddParent,setQuickAddParent]=React.useState(null),[quickAddForm,setQuickAddForm]=React.useState({code:'',name:'',type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',warehouseCode:'default',projectCode:'',taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'customer',phone:'',taxNumber:'',email:'',address:''});
 const [masterForm,setMasterForm]=React.useState({kind:'chartOfAccounts',code:'',name:'',type:'asset',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',projectCode:'',warehouseCode:'default',taxType:'vat',rate:'0',effectiveFrom:today()});
 const [journal,setJournal]=React.useState({id:'',date:today(),description:'',reference:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});
 const [invoice,setInvoice]=React.useState({id:'',type:'purchase',date:today(),number:'',partyId:'',partyName:'',partyTaxNumber:'',currency:'EGP',taxCode:'VAT-IN-14',taxRate:'14',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
 const [invoiceTypeManuallySelected,setInvoiceTypeManuallySelected]=React.useState(false);
 const [invoiceFile,setInvoiceFile]=React.useState(null),[invoicePartySearch,setInvoicePartySearch]=React.useState(''),[cashPartySearch,setCashPartySearch]=React.useState(''),[statementPartySearch,setStatementPartySearch]=React.useState(''),[ocrSuggestions,setOcrSuggestions]=React.useState({party:null,items:[]}),[cash,setCash]=React.useState({movementType:'customer_receipt',date:today(),amount:'',description:'',reference:'',partyType:'customer',partyId:'',partyName:'',employeeUid:'',employeeName:'',cashAccountCode:'1110',bankAccountCode:'1120',offsetAccountCode:'6100',projectCode:'',currency:'EGP'});
 const [cashHistorySearch,setCashHistorySearch]=React.useState(''),[masterViewKind,setMasterViewKind]=React.useState('customers');
 const [bankFile,setBankFile]=React.useState(null),[bankRows,setBankRows]=React.useState([]),[bankAccount,setBankAccount]=React.useState('1120');
 const [search,setSearch]=React.useState(''),[masterPartySearch,setMasterPartySearch]=React.useState('');
 const [masterImportKind,setMasterImportKind]=React.useState('customers'),[masterImportRows,setMasterImportRows]=React.useState([]),[masterImportName,setMasterImportName]=React.useState('');
 const [partyStatement,setPartyStatement]=React.useState({type:'customer',id:''}),[partyRows,setPartyRows]=React.useState([]);
 const api=async(path,method,body)=>{
  const auth=window.PEST_FIREBASE_AUTH&&window.PEST_FIREBASE_AUTH.currentUser;
  if(!auth)throw new Error(t('جلسة الدخول انتهت. أعد تسجيل الدخول.','Your session expired. Sign in again.'));
  const token=await auth.getIdToken();
  const response=await fetch(base+'/finance'+(path||''),{method:method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||('HTTP '+response.status));
  return data;
 };
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
 const refresh=async()=>{
  setBusy(true);setError('');
  try{
   const b=await api('?resource=bootstrap');
   const [r,d]=await Promise.all([api('?resource=review'),api('?resource=documents')]);
   setMaster(Object.assign({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},settings:{},inventory:{balances:{}}},b));
   setAccountingStartMonth(b.settings&&b.settings.accountingStartMonth||'');
   setReview(rows(r.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
   setDocuments(rows(d.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const refreshAssignments=async()=>{
  try{
   const result=await api('?resource=assignments');
   const list=rows(result.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt));
   setAssignmentItems(list);
   const pendingId=window.PEST_PENDING_FINANCE_ASSIGNMENT_ID;
   if(pendingId){
    const match=list.find(x=>x.id===pendingId);
    if(match){setSelectedAssignmentId(match.id);setAssignmentLines((match.invoice&&match.invoice.lines||[]).map(x=>Object.assign({},x)));}
    window.PEST_PENDING_FINANCE_ASSIGNMENT_ID='';
   }
  }catch(e){setError(e.message||String(e));}
 };
 React.useEffect(()=>{if(tab==='assignments')refreshAssignments();},[tab]);
 React.useEffect(()=>{
  const openPendingRoute=async()=>{
   const assignmentId=window.PEST_PENDING_FINANCE_ASSIGNMENT_ID;
   if(assignmentId){setTab("assignments");await refreshAssignments();return;}
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
  if(window.PEST_PENDING_FINANCE_ASSIGNMENT_ID||window.PEST_PENDING_FINANCE_INVOICE_ID)void openPendingRoute();
  return()=>window.removeEventListener("pest-finance-route",listener);
 },[]);

 React.useEffect(()=>{
  const pending=window.PEST_PENDING_FINANCE_ASSIGNMENT_ID;
  if(pending){setSelectedAssignmentId(pending);setTab('assignments');}
 },[]);
 const invoicePayload=()=>{
  const party=parties.find(x=>String(x.code||x.id)===String(invoice.partyId));
  return Object.assign({},invoice,{partyName:party?partyName(party):invoice.partyName,partyTaxNumber:party?partyTaxNumber(party):invoice.partyTaxNumber,lines:invoice.lines.map(x=>Object.assign({},x,{quantity:n(x.quantity),unitPrice:n(x.unitPrice),discount:n(x.discount)}))});
 };
 const saveInvoiceDraftRecord=async()=>{
  const payload=invoicePayload();
  const result=await api('', 'POST',Object.assign({action:'saveInvoiceDraft'},payload));
  if(invoiceFile){
   const uploadResult=await upload(invoiceFile,result.id),attachment=uploadResult.attachment||uploadResult;
   await api('', 'POST',{action:'addAttachment',documentId:result.id,attachment});
   setInvoiceFile(null);
  }
  setInvoice(old=>Object.assign({},old,{id:result.id}));
  await refresh();
  return result;
 };
 const saveInvoiceDraft=async()=>{
  setBusy(true);setError('');
  try{
   const result=await saveInvoiceDraftRecord();
   setNotice('تم حفظ الفاتورة كمسودة غير مرحلة. يمكنك استكمالها أو تحويلها لمستخدم آخر.');
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const assignInvoiceToUser=async()=>{
  if(!assignmentUserUid){setError('اختر المستخدم الذي سيستكمل الفاتورة.');return;}
  setBusy(true);setError('');
  try{
   const draft=await saveInvoiceDraftRecord();
   const result=await api('', 'POST',{action:'assignInvoice',invoiceId:draft.id,assigneeUid:assignmentUserUid,instruction:assignmentInstruction});
   setNotice('تم حفظ المسودة وتحويلها للمستخدم المختار، وستصل إليه في المهام والتنبيهات.');
   setInvoice(o=>Object.assign({},o,{id:draft.id}));
   await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const openAssignment=assignment=>{
  setSelectedAssignmentId(assignment.id);
  setAssignmentLines((assignment.invoice&&assignment.invoice.lines||[]).map(x=>Object.assign({},x)));
 };
 const completeAssignment=async()=>{
  const assignment=assignmentItems.find(x=>x.id===selectedAssignmentId);
  if(!assignment)return;
  setAssignmentBusy(true);setError('');
  try{
   const purchase=assignment&&assignment.invoice&&assignment.invoice.invoiceType==='purchase';
   const lines=assignmentLines.map((line,index)=>({index,kind:line.kind,itemCode:line.itemCode||'',groupCode:line.groupCode||'',warehouseCode:line.warehouseCode||'default',accountCode:purchase?(line.accountCode||''):(line.incomeAccountCode||''),itemType:line.itemType||'stock'}));
   const result=await api('', 'POST',{action:'completeInvoiceAssignment',assignmentId:assignment.id,lines});
   setNotice('تم استكمال التصنيف وإرجاع المسودة إلى المستخدم الأصلي للمراجعة والإرسال.');
   setSelectedAssignmentId('');setAssignmentLines([]);
   await refreshAssignments();await refresh();
  }catch(e){setError(e.message||String(e));}
  finally{setAssignmentBusy(false);}
 };
 const loadPeriod=async()=>{
  setBusy(true);
  try{
   const d=await api('?resource=periods&from='+encodeURIComponent(period.from)+'&to='+encodeURIComponent(period.to));
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
 React.useEffect(()=>{if(['overview','reports','tax','centers'].includes(tab))loadPeriod();},[tab,period.from,period.to]);
 const loadParty=async()=>{
  if(!partyStatement.id){setError('اختر العميل أو المورد أولاً.');return;}
  setBusy(true);setError('');
  try{
   const result=await api('?resource=party&type='+encodeURIComponent(partyStatement.type)+'&id='+encodeURIComponent(partyStatement.id));
   const entries=[];
   Object.values(result.entries||{}).forEach(function(periodRows){Object.values(periodRows||{}).forEach(function(entry){entries.push(entry);});});
   entries.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.journalId||'').localeCompare(String(b.journalId||''));});
   setPartyRows(entries);
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const accounts=rows(master.chartOfAccounts).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
 const posting=accounts.filter(a=>!a.isGroup&&a.active!==false);
 const centers=rows(master.costCenters),items=rows(master.items);
 const financialParties=rows(master.parties);
 const mergePartyRows=(base,type)=>{const map=new Map((base||[]).map(p=>[String(p.code||p.id),p]));financialParties.filter(p=>p.partyType===type).forEach(p=>map.set(String(p.code||p.id),p));return Array.from(map.values()).filter(p=>p&&p.code||p&&p.id);};
 const allClients=mergePartyRows(clients,'customer'),allVendors=mergePartyRows(vendors,'vendor');
 const parties=invoice.type==='purchase'?allVendors:allClients;
 const partyTaxNumber=p=>p.taxNumber||p.taxRegistrationNumber||p.registrationNumber||p.registrationNo||p.vatNumber||p.taxId||'';
 const vatTypeForInvoice=type=>type==='purchase'?'vat_input':'vat_output';
 const defaultVatCodeForInvoice=type=>type==='purchase'?'VAT-IN-14':'VAT-OUT-14';
 const findVatCode=(type,rate)=>rows(master.taxCodes).find(x=>x.taxType===vatTypeForInvoice(type)&&Number(x.rate)===Number(rate))||rows(master.taxCodes).find(x=>x.code===defaultVatCodeForInvoice(type))||null;
 const partyName=p=>p.name||p.companyName||p.legalName||p.supplierName||p.vendorName||p.customerName||p.clientName||p.title||p.code||p.id;
 const nextCode=(prefix,list)=>{const used=new Set((list||[]).map(x=>String(x.code||x.id||'')));let i=1,code='';do{code=prefix+'-'+String(i++).padStart(3,'0');}while(used.has(code));return code;};
 const normalizeMatch=v=>String(v||'').toLowerCase().replace(/[\s\-_.،,]+/g,'').trim();

 const updateJ=(i,k,v)=>setJournal(o=>Object.assign({},o,{lines:o.lines.map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const updateI=(i,k,v)=>setInvoice(o=>Object.assign({},o,{lines:o.lines.map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const jDebit=journal.lines.reduce((s,x)=>s+n(x.debit),0),jCredit=journal.lines.reduce((s,x)=>s+n(x.credit),0);
 const net=invoice.lines.reduce((s,x)=>s+n(x.quantity)*n(x.unitPrice)-n(x.discount),0)-n(invoice.discount);
 const tax=invoice.taxAmount!==''?n(invoice.taxAmount):net*n(invoice.taxRate)/100,total=net+tax;
 const flattenJournals=list=>list.flatMap(j=>(j.lines||[]).map(l=>Object.assign({},l,{date:j.date,journalId:j.id,sourceType:j.sourceType||'manual',sourceId:j.sourceId||'',description:l.description||j.description||'',reference:j.reference||''})));
 const flat=flattenJournals(periodJournals),balanceFlat=flattenJournals(balanceJournals);
 const balances=flat.reduce((o,l)=>{const a=o[l.accountCode]||(o[l.accountCode]={debit:0,credit:0});a.debit+=n(l.debit);a.credit+=n(l.credit);return o;},{});
 const balanceBalances=balanceFlat.reduce((o,l)=>{const a=o[l.accountCode]||(o[l.accountCode]={debit:0,credit:0});a.debit+=n(l.debit);a.credit+=n(l.credit);return o;},{});
 const trial=accounts.map(a=>({account:a,amount:balances[a.code]||{debit:0,credit:0}})).filter(x=>x.amount.debit||x.amount.credit);
 const balanceTrial=accounts.map(a=>{
  const total=balanceBalances[a.code]||{debit:0,credit:0},activity=balances[a.code]||{debit:0,credit:0};
  const openingNet=(n(total.debit)-n(total.credit))-(n(activity.debit)-n(activity.credit)),endingNet=n(total.debit)-n(total.credit);
  return {account:a,amount:total,activity,opening:{debit:Math.max(openingNet,0),credit:Math.max(-openingNet,0)},ending:{debit:Math.max(endingNet,0),credit:Math.max(-endingNet,0)}};
 }).filter(x=>x.amount.debit||x.amount.credit||x.activity.debit||x.activity.credit);
 const sumFrom=(list,type)=>list.filter(x=>x.account.type===type).reduce((sum,x)=>sum+(type==='revenue'?x.amount.credit-x.amount.debit:x.amount.debit-x.amount.credit),0);
 const revenue=sumFrom(trial,'revenue'),expenses=sumFrom(trial,'expense');
 const costOfSales=trial.filter(x=>x.account.type==='expense'&&(x.account.parentCode==='5'||x.account.statementGroup==='cogs')).reduce((sum,x)=>sum+x.amount.debit-x.amount.credit,0);
 const grossProfit=revenue-costOfSales,operatingExpenses=expenses-costOfSales,profit=grossProfit-operatingExpenses;
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
 const status=s=>({pending_review:'بانتظار المراجعة',needs_correction:'يحتاج تصحيح',duplicate_review:'تكرار محتمل',posted:'مُرحّل',rejected:'مرفوض'}[s]||s||'—');
 const button=(label,fn,kind,disabled)=>h('button',{type:'button',onClick:fn,disabled:!!disabled,className:'rounded-xl px-3 py-2 text-sm font-bold border '+(kind==='primary'?'bg-blue-700 text-white border-blue-700':kind==='success'?'bg-emerald-600 text-white border-emerald-600':kind==='danger'?'bg-rose-50 text-rose-700 border-rose-200':'bg-white text-slate-700 border-slate-200')},label);
 const field=(label,value,onChange,type,extra)=>h('label',{className:'block text-sm font-bold text-slate-700'},label,h('input',Object.assign({type:type||'text',value:value==null?'':value,onChange:e=>onChange(e.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white',step:'any'},extra||{})));
 const select=(label,value,onChange,options)=>h('label',{className:'block text-sm font-bold text-slate-700'},label,h('select',{value:value||'',onChange:e=>onChange(e.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'},options.map(x=>h('option',{key:x.value,value:x.value},x.label))));
 const openQuickAdd=(kind,onCreated,defaults)=>{if(quickAddType)setQuickAddParent({type:quickAddType,form:quickAddForm,target:quickAddTarget});else setQuickAddParent(null);setQuickAddType(kind);setQuickAddTarget(()=>onCreated||null);setQuickAddForm(Object.assign({code:'',name:'',type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',groupType:'other',itemType:'stock',version:'',warehouseCode:'default',projectCode:'',taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'customer',phone:'',taxNumber:'',email:'',address:''},defaults||{}));};
 const selectWithAdd=(label,value,onChange,options,kind,defaults)=>select(label,value,function(next){if(next==='__quick_add__'){openQuickAdd(kind,onChange,defaults);}else onChange(next);},(options||[]).concat([{value:'__quick_add__',label:'＋ إضافة كود جديد'}]));
 const partyPicker=(label,list,value,onChange,query,setQuery,partyType)=>{
  const term=normalizeMatch(query),matches=(list||[]).filter(p=>!term||normalizeMatch([p.code,partyName(p),p.phone,p.mobile,partyTaxNumber(p)].join(' ')).includes(term)).slice(0,8);
  const selected=(list||[]).find(p=>String(p.code||p.id)===String(value||''));
  return h('div',{className:'block text-sm font-bold text-slate-700 min-w-0'},label,
   h('input',{type:'search',value:query||'',onChange:e=>setQuery(e.target.value),placeholder:'ابحث بالاسم أو الكود أو رقم التسجيل الضريبي',className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'}),
   selected?h('div',{className:'mt-1 text-xs text-emerald-700'},'المحدد: '+partyName(selected)+' ('+(selected.code||selected.id)+')'):null,
   h('div',{className:'mt-1 max-h-36 overflow-auto rounded-lg border bg-white'},matches.length?matches.map(p=>h('button',{key:String(p.code||p.id),type:'button',onClick:()=>{onChange(p);setQuery(partyName(p));},className:'block w-full text-start px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0'},h('b',null,p.code||p.id),' — ',partyName(p),partyTaxNumber(p)?h('small',{className:'block text-slate-500'},'رقم ضريبي: '+partyTaxNumber(p)):null)):h('div',{className:'p-2 text-xs text-slate-500'},'لا توجد نتيجة مطابقة')),
   h('button',{type:'button',onClick:()=>openQuickAdd('parties',(code,createdItem)=>{const p=Object.assign({code,name:query,partyType},createdItem||{});onChange(p);setQuery(partyName(p));},{code:nextCode(partyType==='vendor'?'VND':'CUS',list),name:String(query||'').replace(/\s*\([^)]*\)\s*$/,''),partyType}),className:'mt-2 text-xs font-bold text-blue-700 underline'},'＋ تكويد '+(partyType==='vendor'?'مورد':'عميل')+' جديد')
  );
 };
 const saveQuickAdd=async()=>{
  if(!quickAddType)return;
  setBusy(true);setError('');
  try{
   const f=quickAddForm,kind=quickAddType;
   const item=kind==='parties'?{code:f.code,name:f.name,partyType:f.partyType,phone:f.phone,taxNumber:f.taxNumber,email:f.email,address:f.address}:{code:f.code,name:f.name,type:f.type,nature:f.nature,parentCode:f.parentCode,isGroup:f.isGroup,subledgerType:f.subledgerType,unit:f.unit,groupCode:f.groupCode,groupType:f.groupType,itemType:f.itemType,version:f.version,warehouseCode:f.warehouseCode,projectCode:f.projectCode,taxType:f.taxType,rate:n(f.rate),effectiveFrom:f.effectiveFrom,accountCode:kind==='bankAccounts'?(f.accountCode||f.code):undefined};
   if(kind==='parties'&&(!String(f.code||'').trim()||!String(f.name||'').trim()))throw new Error('أدخل كود واسم المورد/العميل أولاً.');
   const result=await api('', 'POST',{action:'saveMaster',kind,item});
   if(!result||result.success!==true||!result.item)throw new Error('لم يؤكد النظام حفظ سجل المورد/العميل. لم يتم إغلاق شاشة الإضافة.');
   const parent=quickAddParent,target=quickAddTarget;
   await refresh();
   setError('');
   setNotice(kind==='parties'
    ?(result.linkedExisting?'تم ربط المورد/العميل بالسجل الرئيسي بنجاح.':'تمت إضافة '+(f.partyType==='vendor'?'المورد':'العميل')+' بنجاح إلى البيانات الأساسية.')
    :'تمت إضافة الكود بنجاح.');
   if(parent){
    setQuickAddType(parent.type);setQuickAddForm(parent.form);setQuickAddTarget(()=>parent.target||null);
    if(target&&result.item)target(result.item.code,result.item);
    setQuickAddParent(null);
   }else{
    setQuickAddType('');
    if(target&&result.item)target(result.item.code,result.item);
    setQuickAddTarget(null);setQuickAddParent(null);
   }
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const area=(label,value,onChange)=>h('label',{className:'block text-sm font-bold'},label,h('textarea',{value,onChange:e=>onChange(e.target.value),rows:2,className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal'}));
 const panel=(title,sub,child)=>h('section',{className:'rounded-2xl border bg-white p-4 shadow-sm min-w-0'},h('div',{className:'mb-3'},h('h3',{className:'font-bold text-lg'},title),sub?h('p',{className:'text-xs text-slate-500'},sub):null),child);
 const metric=(label,value)=>h('div',{className:'rounded-xl border bg-white p-3'},h('div',{className:'text-xs text-slate-500'},label),h('strong',{className:'text-xl block mt-1'},value));
 const table=(headers,data)=>h('div',{className:'overflow-auto border rounded-xl'},h('table',{className:'w-full text-sm text-right'},h('thead',{className:'bg-slate-100'},h('tr',null,headers.map(x=>h('th',{key:x,className:'p-3 whitespace-nowrap'},x)))),h('tbody',null,data.length?data:h('tr',null,h('td',{colSpan:headers.length,className:'p-4 text-center text-slate-400'},'لا توجد بيانات')))));
 const noticeElement=error?h('div',{className:'rounded-xl bg-rose-50 text-rose-800 border border-rose-200 p-3 text-sm'},error):notice?h('div',{className:'rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 text-sm'},notice):null;
 const saveMaster=async()=>{
  setBusy(true);setError('');try{
   const f=masterForm,item={code:f.code,name:f.name,type:f.type,nature:f.nature,parentCode:f.parentCode,isGroup:f.isGroup,subledgerType:f.subledgerType,unit:f.unit,groupCode:f.groupCode,version:f.version,projectCode:f.projectCode,warehouseCode:f.warehouseCode,taxType:f.taxType,rate:n(f.rate),effectiveFrom:f.effectiveFrom};
   await api('', 'POST',{action:'saveMaster',kind:f.kind,item});setNotice('تم حفظ الكود');setMasterForm(o=>Object.assign({},o,{code:'',name:''}));await refresh();
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 };
 const submitJournal=async()=>{
  setBusy(true);setError('');try{const payload=Object.assign({},journal);const result=await api('', 'POST',Object.assign({action:'submitJournal'},payload));setNotice(result.status==='pending_review'?'تم إرسال القيد إلى المراجعة':'تم حفظ القيد مع أخطاء: '+(result.errors||[]).join('، '));if(result.status==='pending_review')setJournal({id:'',date:today(),description:'',reference:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});else setJournal(o=>Object.assign({},o,{id:result.id}));await refresh();}catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 };
 const submitInvoice=async()=>{
  setBusy(true);setError('');
  try{
   const payload=invoicePayload();
   const result=await api('', 'POST',Object.assign({action:'submitInvoice'},payload));
   let attachmentError='';
   if(invoiceFile){
    try{const uploadResult=await upload(invoiceFile,result.id);const attachment=uploadResult.attachment||uploadResult;await api('', 'POST',{action:'addAttachment',documentId:result.id,attachment});}
    catch(e){attachmentError=e.message||String(e);}
   }
   if(result.status==='pending_review')setNotice('تم حفظ الفاتورة وإرسالها للمراجعة. سيتم إنشاء وترحيل القيد بعد الاعتماد.');
   else setNotice('الفاتورة محفوظة وتحتاج تصحيح: '+(result.errors||[]).join('، '));
   if(result.status==='pending_review'){
    const resetTaxCode=findVatCode(invoice.type,14);
    setInvoice({id:'',type:invoice.type,date:today(),number:'',partyId:'',partyName:'',partyTaxNumber:'',currency:'EGP',taxCode:resetTaxCode?resetTaxCode.code:defaultVatCodeForInvoice(invoice.type),taxRate:resetTaxCode?String(resetTaxCode.rate):'14',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
    setInvoiceTypeManuallySelected(false);
     setInvoiceFile(null);setInvoicePartySearch('');setOcrSuggestions({party:null,items:[]});
   }else setInvoice(o=>Object.assign({},o,{id:result.id}));
   await refresh();
   if(attachmentError)setError('تم حفظ بيانات الفاتورة، لكن تعذر رفع الصورة أو ربطها: '+attachmentError);
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
   const pageResults=[];let totalPdfPages=0,pagesRead=0;
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
    taxCode:(findVatCode(nextType,x.taxRate==null?old.taxRate:x.taxRate)||{}).code||defaultVatCodeForInvoice(nextType),
    taxRate:x.taxRate==null?old.taxRate:String(x.taxRate),
    taxAmount:x.taxAmount==null?old.taxAmount:String(x.taxAmount),discount:x.discount==null?old.discount:String(x.discount),
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
 const reviewAction=async(decision)=>{
  if(!selected)return;setBusy(true);setError('');
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
  if(!masterImportRows.length){setError('اختر ملفًا صالحًا وراجع بياناته أولاً.');return;}
  setBusy(true);setError('');
  try{
   const result=await api('', 'POST',{action:'importMasters',kind:config.kind,partyType:config.partyType,rows:masterImportRows});
   setNotice('تم استيراد '+result.count+' سجل إلى '+config.label+'. وتم ربط العملاء والموردين بسجلات البرنامج الرئيسية.');
   setMasterImportRows([]);setMasterImportName('');await refresh();
  }catch(error){setError(error.message||String(error));}
  finally{setBusy(false);}
 };
 const editDoc=doc=>{
  setSelected(null);
  if(doc.type==='journal'){setJournal({id:doc.id,date:doc.date,description:doc.description||'',reference:doc.reference||'',currency:doc.currency||'EGP',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setTab('journal');}
  else if(doc.type==='invoice'){setInvoice({id:doc.id,type:doc.invoiceType||(doc.type==='purchase'?'purchase':'sales'),date:doc.date,number:doc.number,partyId:doc.partyId,partyName:doc.partyName,partyTaxNumber:doc.partyTaxNumber||'',currency:doc.currency||'EGP',taxCode:doc.taxCode||'',taxRate:String(doc.taxRate==null?'':doc.taxRate),taxAmount:doc.taxAmount==null?'':String(doc.taxAmount),discount:String(doc.discount||''),projectCode:doc.projectCode||'',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setInvoiceTypeManuallySelected(true);setTab('invoices');}
 };
 const nav=[
 ['overview','ملخص مالي'],['journal','القيود اليومية'],['review','المراجعة والاعتماد'],['invoices','فواتير العملاء والموردين'],['assignments','الإجراءات المحولة إليّ'],['partyStatements','كشوف الأطراف والعاملين'],['masters','البيانات الأساسية والاستيراد'],['accounts','دليل الحسابات'],['centers','مراكز التكلفة'],['inventory','المخزون والأكواد'],['cash','الخزينة والتحصيل والسداد'],['bank','كشوف البنوك'],['tax','الضرائب'],['reports','القوائم المالية']
 ];
 const renderOverview=()=>h('div',{className:'space-y-4'},
  h('div',{className:'grid grid-cols-2 xl:grid-cols-4 gap-3'},metric('إجمالي المدين',fmt(trial.reduce((s,x)=>s+x.amount.debit,0))+' ج.م'),metric('إجمالي الدائن',fmt(trial.reduce((s,x)=>s+x.amount.credit,0))+' ج.م'),metric('صافي الربح / الخسارة',fmt(profit)+' ج.م'),metric('بانتظار المراجعة',String(review.length))),
  h('div',{className:'flex flex-wrap gap-2 items-end'},field('من شهر',period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),field('إلى شهر',period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),button('تحديث التقارير',loadPeriod,'primary')),
  panel('الأداء المالي','يعتمد الملخص على القيود المرحّلة بالفترة المحددة.',h('div',{className:'grid md:grid-cols-4 gap-3'},metric('الإيرادات',fmt(revenue)+' ج.م'),metric('المصروفات',fmt(expenses)+' ج.م'),metric('الأصول',fmt(assets)+' ج.م'),metric('الالتزامات',fmt(liabilities)+' ج.م'))),
  panel('المستندات الأخيرة','',table(['المستند','النوع','التاريخ','الحالة'],documents.slice(0,12).map(x=>h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.title||x.number||x.id),h('td',{className:'p-2'},x.type),h('td',{className:'p-2'},x.date||'—'),h('td',{className:'p-2'},status(x.status))))))
 );
 const renderJournal = function() {
  const lineCards = journal.lines.map(function(line,index) {
   const analyticType=line.partyType||((accounts.find(a=>a.code===line.accountCode)||{}).subledgerType)||'customer';
   const analyticList=analyticType==='vendor'?allVendors:allClients;
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl bg-slate-50 p-3 border'},
    h('div',{className:'md:col-span-3'},selectWithAdd('الحساب',line.accountCode,function(v){updateJ(index,'accountCode',v);},posting.map(function(a){return {value:a.code,label:a.code+' — '+a.name};}),'chartOfAccounts')),
    h('div',{className:'md:col-span-2'},field('البيان',line.description,function(v){updateJ(index,'description',v);})),
    h('div',{className:'md:col-span-1'},field('مدين',line.debit,function(v){updateJ(index,'debit',v);},'number')),
    h('div',{className:'md:col-span-1'},field('دائن',line.credit,function(v){updateJ(index,'credit',v);},'number')),
    h('div',{className:'md:col-span-2'},selectWithAdd('مركز التكلفة',line.costCenterId,function(v){updateJ(index,'costCenterId',v);},[{value:'',label:'بدون'}].concat(centers.map(function(x){return {value:x.code,label:x.code+' — '+x.name};})),'costCenters')),
    h('div',{className:'md:col-span-2'},selectWithAdd('الطرف التحليلي',line.partyId||'',function(v){updateJ(index,'partyType',analyticType);updateJ(index,'partyId',v);},[{value:'',label:'بدون'}].concat(analyticList.map(function(x){return {value:x.code||x.id,label:(analyticType==='vendor'?'مورد ':'عميل ')+partyName(x)+' ('+(x.code||x.id)+')'};})),'parties',{partyType:analyticType,code:nextCode(analyticType==='vendor'?'VND':'CUS',analyticList)})),
    h('div',{className:'md:col-span-1 flex items-end'},button('حذف',function(){setJournal(function(old){return Object.assign({},old,{lines:old.lines.filter(function(x,j){return j!==index;})});});},'danger'))
   );
  });
  const addLine = button('إضافة سطر',function(){setJournal(function(old){return Object.assign({},old,{lines:old.lines.concat([{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}])});});});
  const linesPanel = panel('سطور القيد','يجب أن يتساوى المدين والدائن.',h('div',{className:'space-y-3'},...lineCards,addLine));
  const headerPanel = panel('بيانات القيد','قيد مزدوج. لا يتم ترحيله قبل مراجعة مستخدم مخوّل.',h('div',{className:'grid md:grid-cols-3 gap-3'},
   field('التاريخ',journal.date,function(v){setJournal(function(old){return Object.assign({},old,{date:v});});},'date'),
   field('المرجع',journal.reference,function(v){setJournal(function(old){return Object.assign({},old,{reference:v});});}),
   field('البيان',journal.description,function(v){setJournal(function(old){return Object.assign({},old,{description:v});});})
  ));
  const totalsPanel = h('div',{className:'flex flex-wrap gap-4 items-center p-3 bg-white border rounded-xl'},
   h('b',null,'المدين: '+fmt(jDebit)),h('b',null,'الدائن: '+fmt(jCredit)),
   h('b',{className:Math.abs(jDebit-jCredit)<0.01?'text-emerald-700':'text-rose-700'},'الفرق: '+fmt(jDebit-jCredit)),
   button('حفظ وإرسال للمراجعة',submitJournal,'primary',busy)
  );
  const draftRows = documents.filter(function(x){return x.type==='journal'&&['needs_correction','draft'].includes(x.status);}).map(function(x){
   return h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.id),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.description),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2'},button('تعديل',function(){editDoc(x);},'muted')));
  });
  const draftsPanel = panel('المسودات والتصحيحات','يمكن فتح المستندات التي أعيدت للتصحيح وتعديلها ثم إعادة إرسالها.',table(['رقم','التاريخ','الوصف','الحالة','إجراء'],draftRows));
  return h('div',{className:'space-y-4'},headerPanel,linesPanel,totalsPanel,draftsPanel);
 };
 const renderInvoices = function() {
  const headFields = h('div',{className:'grid md:grid-cols-3 gap-3'},
   select('نوع الفاتورة',invoice.type,function(v){setInvoiceTypeManuallySelected(true);const taxCode=findVatCode(v,14);setInvoice(function(old){return Object.assign({},old,{type:v,partyId:'',partyName:'',partyTaxNumber:'',taxCode:taxCode?taxCode.code:defaultVatCodeForInvoice(v),taxRate:taxCode?String(taxCode.rate):'14',taxAmount:''});});},[{value:'purchase',label:'مشتريات / مورد'},{value:'sales',label:'مبيعات / عميل'}]),
   field('رقم الفاتورة',invoice.number,function(v){setInvoice(function(old){return Object.assign({},old,{number:v});});}),
   field('التاريخ',invoice.date,function(v){setInvoice(function(old){return Object.assign({},old,{date:v});});},'date'),
   partyPicker(invoice.type==='purchase'?'المورد':'العميل',parties,invoice.partyId,function(p){setInvoice(old=>Object.assign({},old,{partyId:p.code||p.id,partyName:partyName(p),partyTaxNumber:partyTaxNumber(p)}));},invoicePartySearch,setInvoicePartySearch,invoice.type==='purchase'?'vendor':'customer'),
   select('المشروع المرتبط',invoice.projectCode,function(v){setInvoice(function(old){return Object.assign({},old,{projectCode:v});});},[{value:'',label:'بدون مشروع'}].concat(projects.map(function(p){return {value:p.code||p.id,label:(p.name||p.code)+' ('+(p.code||p.id)+')'};}))),
   selectWithAdd('كود ضريبة القيمة المضافة',invoice.taxCode||'',function(v,item){const selected=item||rows(master.taxCodes).find(x=>x.code===v);setInvoice(old=>Object.assign({},old,{taxCode:v,taxRate:selected?String(selected.rate):'',taxAmount:''}));},[{value:'',label:'بدون كود — أدخل النسبة يدويًا'}].concat(rows(master.taxCodes).filter(x=>x.taxType===vatTypeForInvoice(invoice.type)&&x.active!==false).map(x=>({value:x.code,label:x.code+' — '+x.name+' ('+x.rate+'%)'}))),'taxCodes',{code:defaultVatCodeForInvoice(invoice.type),taxType:vatTypeForInvoice(invoice.type),rate:14,effectiveFrom:'2017-07-01'}),
   field('نسبة الضريبة %',invoice.taxRate,function(v){setInvoice(function(old){return Object.assign({},old,{taxCode:'',taxRate:v,taxAmount:''});});},'number'),
   field('الضريبة (قيمة ثابتة اختيارية)',invoice.taxAmount,function(v){setInvoice(function(old){return Object.assign({},old,{taxAmount:v});});},'number'),
   field('خصم الفاتورة',invoice.discount,function(v){setInvoice(function(old){return Object.assign({},old,{discount:v});});},'number'),
   h('div',{className:'md:col-span-3 flex flex-wrap items-end gap-3 p-3 border rounded-xl bg-blue-50/50'},
    h('label',{className:'block text-sm font-bold flex-1 min-w-[220px]'},'صورة / PDF الفاتورة',h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',onChange:function(e){const file=e.target.files&&e.target.files[0]||null;setInvoiceFile(file);setOcrSuggestions({party:null,items:[]});setNotice('');setError('');},className:'block mt-1 w-full text-sm'}),invoiceFile?h('small',{className:'block mt-1 text-slate-600 font-normal'},invoiceFile.name,invoiceFile.type==='application/pdf'?' — سيتم تحليل صفحات PDF وإرفاق الملف الأصلي':' — جاهز للقراءة'):null),
    button(busy?'جارٍ قراءة الفاتورة...':'قراءة الصورة / PDF وملء الحقول',()=>readImage(invoiceFile),'primary',busy||!invoiceFile)
   )
  );
  const invoiceHead = panel('بيانات الفاتورة','صورة الفاتورة تساعد في استخراج البيانات. راجعها بنفسك قبل الإرسال للمراجعة.',headFields);
  const invoiceRows = invoice.lines.map(function(line,index) {
   const itemOptions=[{value:'',label:'اختر الصنف'}].concat(items.map(function(x){return {value:x.code,label:x.code+' — '+x.name+' '+(x.version||'')};}));
   const expectedAccountType=invoice.type==='purchase'?'expense':'revenue';
   const accountOptions=posting.filter(function(a){return a.type===expectedAccountType;}).map(function(a){return {value:a.code,label:a.code+' — '+a.name};});
   const centerOptions=[{value:'',label:'بدون'}].concat(centers.map(function(x){return {value:x.code,label:x.code+' — '+x.name};}));
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
  if(ocrSuggestions.party)suggestionCards.push(h('div',{className:'flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-amber-50'},h('div',null,h('b',null,'طرف غير مسجل: '+ocrSuggestions.party.name),h('p',{className:'text-xs text-slate-600'},'الكود المقترح '+ocrSuggestions.party.code+' — لن يتم حفظه إلا بعد موافقتك')),button('تكويد الطرف واختياره',()=>openQuickAdd('parties',code=>{setInvoice(old=>Object.assign({},old,{partyId:code,partyName:ocrSuggestions.party.name}));setInvoicePartySearch(ocrSuggestions.party.name);setOcrSuggestions(old=>Object.assign({},old,{party:null}));},{code:ocrSuggestions.party.code,name:ocrSuggestions.party.name,partyType:ocrSuggestions.party.partyType,taxNumber:ocrSuggestions.party.taxNumber}), 'primary')));
  ocrSuggestions.items.forEach(function(item){
   suggestionCards.push(h('div',{key:'suggest-'+item.index,className:'flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-amber-50'},h('div',null,h('b',null,'صنف غير مسجل: '+item.name),h('p',{className:'text-xs text-slate-600'},'الكود المقترح '+item.code+' — يمكنك أيضًا اختيار خدمة/مصروف بدلًا من الصنف المخزني')),button('تكويد الصنف واختياره',()=>openQuickAdd('items',code=>{setInvoice(old=>Object.assign({},old,{lines:old.lines.map((line,index)=>index===item.index?Object.assign({},line,{itemCode:code}):line)}));setOcrSuggestions(old=>Object.assign({},old,{items:old.items.filter(x=>x.index!==item.index)}));},{code:item.code,name:item.name,unit:'قطعة',warehouseCode:'default'}),'primary')));
  });
  const suggestionsPanel=suggestionCards.length?panel('اقتراحات التكويد بعد قراءة الفاتورة','هذه اقتراحات فقط. لا يتم إنشاء عميل أو مورد أو صنف إلا بعد ضغط المستخدم على زر التكويد.',h('div',{className:'space-y-2'},...suggestionCards)):null;
  const previewRows=[];
  invoice.lines.forEach(function(line){
   const amount=Math.max(0,n(line.quantity)*n(line.unitPrice)-n(line.discount));
   const accountCode=invoice.type==='purchase'?(line.kind==='stock'?'1300':line.accountCode||'6100'):(line.kind==='stock'?'4100':line.incomeAccountCode||'4200');
   const account=accounts.find(a=>a.code===accountCode);
   previewRows.push(h('tr',{key:'line-'+previewRows.length,className:'border-t'},h('td',{className:'p-2'},accountCode+' — '+(account&&account.name||'الحساب')),h('td',{className:'p-2'},line.description||'—'),h('td',{className:'p-2'},fmt(invoice.type==='purchase'?amount:0)),h('td',{className:'p-2'},fmt(invoice.type==='sales'?amount:0))));
  });
  if(invoice.type==='purchase'&&tax)previewRows.push(h('tr',{key:'tax',className:'border-t'},h('td',{className:'p-2'},'1410 — ضريبة مدخلات'),h('td',{className:'p-2'},'ضريبة الفاتورة'),h('td',{className:'p-2'},fmt(tax)),h('td',{className:'p-2'},fmt(0))));
  if(invoice.type==='sales'&&tax)previewRows.push(h('tr',{key:'tax',className:'border-t'},h('td',{className:'p-2'},'2110 — ضريبة مخرجات'),h('td',{className:'p-2'},'ضريبة الفاتورة'),h('td',{className:'p-2'},fmt(0)),h('td',{className:'p-2'},fmt(tax))));
  previewRows.push(h('tr',{key:'party',className:'border-t font-bold bg-slate-50'},h('td',{className:'p-2'},invoice.type==='purchase'?'281 — الموردون':'1210 — العملاء'),h('td',{className:'p-2'},invoice.partyName||'الطرف المختار'),h('td',{className:'p-2'},fmt(invoice.type==='sales'?total:0)),h('td',{className:'p-2'},fmt(invoice.type==='purchase'?total:0))));
  const journalPreview=panel('المقترح المحاسبي قبل الحفظ','معاينة مبدئية للقيد. تكلفة المبيعات وصرف المخزون تُحسب من متوسط التكلفة عند اعتماد فاتورة البيع.',table(['الحساب','البيان','مدين','دائن'],previewRows));
  const activeEmployees=(userDirectory||[]).filter(u=>u.uid&&u.uid!==currentUser.uid&&["active","نشط","مفعل","enabled"].includes(String(u.status||"").toLowerCase()));
  const delegationPanel=panel('تحويل المسودة لمستخدم آخر','عند نقص تصنيف مخزني أو بيانات، احفظ الفاتورة كمسودة وحوّلها لموظف مختص. ستعود إليك بعد استكمال المطلوب لتراجعها وترسلها للمراجعة.',h('div',{className:'grid md:grid-cols-3 gap-3'},
   select('المستخدم المسؤول عن الاستكمال',assignmentUserUid,v=>setAssignmentUserUid(v),[{value:'',label:'اختر المستخدم'},...activeEmployees.map(u=>({value:u.uid,label:(u.fullName||u.username||u.email)+' — '+(u.jobTitle||'')}))]),
   h('div',{className:'md:col-span-2'},field('المطلوب منه',assignmentInstruction,setAssignmentInstruction)),
   button('حفظ كمسودة فقط',saveInvoiceDraft,'muted',busy),
   button('حفظ المسودة وتحويلها',assignInvoiceToUser,'primary',busy||!assignmentUserUid)
  ));
  const totalsBox = h('div',{className:'flex flex-wrap items-center gap-4 p-3 bg-white border rounded-xl'},h('b',null,'الصافي: '+fmt(net)),h('b',null,'الضريبة: '+fmt(tax)),h('b',null,'الإجمالي: '+fmt(total)),button('إرسال للمراجعة',submitInvoice,'primary',busy));
  const correctionRows=documents.filter(function(x){return x.type==='invoice'&&['needs_correction','draft','returned_to_creator'].includes(x.status);}).map(function(x){
   return h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.number||x.id),h('td',{className:'p-2'},x.partyName),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2'},button('تعديل',function(){editDoc(x);},'muted')));
  });
  const correctionPanel = panel('فواتير تحتاج تصحيح','',table(['الفاتورة','الطرف','التاريخ','الحالة','إجراء'],correctionRows));
  return h('div',{className:'space-y-4'},invoiceHead,suggestionsPanel,invoiceLines,journalPreview,totalsBox,delegationPanel,correctionPanel);
 };
 const renderMaster=kind=>{
  const opts=[['chartOfAccounts','حساب عام'],['costCenters','مركز تكلفة'],['itemGroups','مجموعة أصناف'],['items','صنف مخزني / إصدار'],['warehouses','مخزن'],['bankAccounts','حساب بنك'],['taxCodes','كود ضريبي']];
  let data=kind==='accounts'?accounts:kind==='centers'?centers:items;
  return h('div',{className:'space-y-4'},
   panel(kind==='accounts'?'دليل الحسابات':kind==='centers'?'مراكز التكلفة':'الأصناف والمجموعات','أنشئ كودًا من نفس الشاشة. الحسابات التجميعية لا تقبل الترحيل.',h('div',{className:'grid md:grid-cols-3 gap-3'},
    select('نوع التكويد',masterForm.kind,v=>setMasterForm(o=>Object.assign({},o,{kind:v})),opts.map(x=>({value:x[0],label:x[1]}))),
    field('الكود',masterForm.code,v=>setMasterForm(o=>Object.assign({},o,{code:v}))),
    field('الاسم',masterForm.name,v=>setMasterForm(o=>Object.assign({},o,{name:v}))),
    masterForm.kind==='chartOfAccounts'?select('نوع الحساب',masterForm.type,v=>setMasterForm(o=>Object.assign({},o,{type:v})),[{value:'asset',label:'أصول'},{value:'liability',label:'التزامات'},{value:'equity',label:'حقوق ملكية'},{value:'revenue',label:'إيرادات'},{value:'expense',label:'مصروفات'}]):null,
    masterForm.kind==='chartOfAccounts'?select('الطبيعة',masterForm.nature,v=>setMasterForm(o=>Object.assign({},o,{nature:v})),[{value:'debit',label:'مدين'},{value:'credit',label:'دائن'}]):null,
    masterForm.kind==='chartOfAccounts'?select('الحساب الأب',masterForm.parentCode,v=>setMasterForm(o=>Object.assign({},o,{parentCode:v})),[{value:'',label:'بدون'},...accounts.filter(a=>a.isGroup).map(a=>({value:a.code,label:a.code+' — '+a.name}))]):null,
    masterForm.kind==='chartOfAccounts'?select('تحليل الطرف',masterForm.subledgerType,v=>setMasterForm(o=>Object.assign({},o,{subledgerType:v})),[{value:'',label:'بدون'},{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'}]):null,
    masterForm.kind==='items'?field('الوحدة',masterForm.unit,v=>setMasterForm(o=>Object.assign({},o,{unit:v}))):null,
    masterForm.kind==='items'?selectWithAdd('مجموعة الصنف',masterForm.groupCode,v=>setMasterForm(o=>Object.assign({},o,{groupCode:v})),[{value:'',label:'بدون مجموعة'},...rows(master.itemGroups).map(x=>({value:x.code,label:x.code+' — '+x.name}))],'itemGroups'):null,
    masterForm.kind==='items'?field('Version / الإصدار',masterForm.version,v=>setMasterForm(o=>Object.assign({},o,{version:v}))):null,
    masterForm.kind==='costCenters'?select('المشروع المرتبط',masterForm.projectCode,v=>setMasterForm(o=>Object.assign({},o,{projectCode:v})),[{value:'',label:'بدون'},...projects.map(p=>({value:p.code||p.id,label:p.name||p.code}))]):null,
    masterForm.kind==='taxCodes'?select('نوع الضريبة',masterForm.taxType,v=>setMasterForm(o=>Object.assign({},o,{taxType:v})),[{value:'vat_input',label:'قيمة مضافة مدخلات'},{value:'vat_output',label:'قيمة مضافة مخرجات'},{value:'withholding',label:'خصم/استقطاع'},{value:'addition',label:'إضافة'}]):null,
    masterForm.kind==='taxCodes'?field('النسبة %',masterForm.rate,v=>setMasterForm(o=>Object.assign({},o,{rate:v})),'number'):null,
    masterForm.kind==='taxCodes'?field('بداية السريان',masterForm.effectiveFrom,v=>setMasterForm(o=>Object.assign({},o,{effectiveFrom:v})),'date'):null,
    masterForm.kind==='chartOfAccounts'?h('label',{className:'inline-flex items-center gap-2'},h('input',{type:'checkbox',checked:masterForm.isGroup,onChange:e=>setMasterForm(o=>Object.assign({},o,{isGroup:e.target.checked}))}),'حساب تجميعي'):null,
    button('حفظ الكود',saveMaster,'primary',busy)
   )),
   panel(kind==='accounts'?'قائمة الحسابات':kind==='centers'?'قائمة مراكز التكلفة':'قائمة الأصناف', '',table(['الكود','الاسم','تفاصيل'],data.filter(x=>!search||[x.code,x.name,x.version,x.groupCode].join(' ').toLowerCase().includes(search.toLowerCase())).map(x=>h('tr',{key:x.code,className:'border-t'},h('td',{className:'p-2'},x.code),h('td',{className:'p-2'},x.name),h('td',{className:'p-2'},kind==='accounts'?(x.isGroup?'تجميعي':x.type+' / '+x.nature):kind==='centers'?(x.projectCode||'—'):[x.groupCode,x.version].filter(Boolean).join(' / '))))))
  );
 };
 const renderAssignments=()=>{
  const selectedAssignment=assignmentItems.find(item=>item.id===selectedAssignmentId);
  const inbox=panel('الإجراءات المحولة إليّ','تظهر هنا الفواتير المحولة لهذا المستخدم فقط. بعد استكمال الأكواد والتصنيف تعود المسودة إلى صاحبها.',h('div',{className:'space-y-2'},assignmentItems.length?assignmentItems.map(item=>h('div',{key:item.id,className:'border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3'},h('div',{className:'min-w-0'},h('b',{className:'block'},'فاتورة '+(item.invoiceNumber||item.invoice&&item.invoice.number||'بدون رقم')),h('p',{className:'text-xs text-slate-600'},(item.invoiceType==='purchase'?'مورد: ':'عميل: ')+(item.partyName||item.invoice&&item.invoice.partyName||'')+' · '+(item.date||item.invoice&&item.invoice.date||'')),h('p',{className:'text-xs text-slate-500 mt-1'},item.instruction||'')),button(selectedAssignmentId===item.id?'مفتوحة':'فتح الإجراء',()=>openAssignment(item),selectedAssignmentId===item.id?'primary':'muted'))):h('p',{className:'text-sm text-slate-500'},'لا توجد إجراءات مفتوحة محولة إليك.')));
  if(!selectedAssignment)return h('div',{className:'space-y-4'},inbox);
  const inv=selectedAssignment.invoice||{},purchase=inv.invoiceType==='purchase';
  const lineCards=assignmentLines.map((line,index)=>{
   const itemOptions=[{value:'',label:'اختر الصنف المخزني'},...items.map(item=>({value:item.code,label:item.code+' — '+item.name+' '+(item.version||'')}))];
   const groupOptions=[{value:'',label:'بدون مجموعة'},...rows(master.itemGroups).map(group=>({value:group.code,label:group.code+' — '+group.name}))];
   const expenseType=purchase?'expense':'revenue';
   const accountOptions=posting.filter(account=>account.type===expenseType).map(account=>({value:account.code,label:account.code+' — '+account.name}));
   const change=(key,value)=>setAssignmentLines(old=>old.map((x,i)=>i===index?Object.assign({},x,{[key]:value}):x));
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-slate-50 p-3'},
    h('div',{className:'md:col-span-3'},field('وصف البند',line.description||'',value=>change('description',value))),
    h('div',{className:'md:col-span-2'},select('تصنيف البند',line.kind||'',value=>change('kind',value),[{value:'',label:'حدد تصنيف البند'},{value:'stock',label:'بضاعة / مخزون'},{value:'service',label:'مصروف / خدمة'}])),
    line.kind==='service'
     ?h('div',{className:'md:col-span-4'},selectWithAdd('حساب '+(purchase?'المصروف':'الإيراد'),purchase?(line.accountCode||''):(line.incomeAccountCode||''),value=>change(purchase?'accountCode':'incomeAccountCode',value),accountOptions,'chartOfAccounts',{type:expenseType,nature:purchase?'debit':'credit',parentCode:purchase?'6':'4'}))
     :h('div',{className:'md:col-span-3'},selectWithAdd('كود الصنف',line.itemCode||'',value=>change('itemCode',value),itemOptions,'items',{code:nextCode('ITM',items),name:line.description||'',itemType:'stock',unit:line.unit||'قطعة',warehouseCode:'default'})),
    line.kind==='stock'?h('div',{className:'md:col-span-3'},selectWithAdd('مجموعة الصنف',line.groupCode||'',value=>change('groupCode',value),groupOptions,'itemGroups',{code:nextCode('GRP',rows(master.itemGroups)),name:line.description||'',groupType:'other'})):null,
    line.kind==='stock'?h('div',{className:'md:col-span-2'},select('نوع الصنف',line.itemType||'stock',value=>change('itemType',value),[{value:'stock',label:'مخزون عام'},{value:'raw_material',label:'خامة'},{value:'finished_good',label:'منتج تام'},{value:'spare_part',label:'قطعة غيار'},{value:'consumable',label:'مستهلك'},{value:'office_supply',label:'مكتبي'}])):null,
    h('div',{className:'md:col-span-2'},h('span',{className:'text-xs text-slate-500 block'},'الكمية × السعر'),h('b',{className:'text-sm'},fmt(n(line.quantity)*n(line.unitPrice))))
   );
  });
  const detail=panel('استكمال فاتورة '+(inv.number||selectedAssignment.invoiceId||''),(purchase?'فاتورة مشتريات من مورد: ':'فاتورة مبيعات لعميل: ')+(inv.partyName||'')+' · '+(selectedAssignment.instruction||''),h('div',{className:'space-y-3'},h('div',{className:'grid md:grid-cols-3 gap-3'},metric('التاريخ',inv.date||'—'),metric('الإجمالي',fmt(inv.total||0)+' ج.م'),metric('عدد البنود',String(assignmentLines.length))),...lineCards,h('div',{className:'flex flex-wrap items-center gap-2'},button('إرجاع المسودة لصاحبها بعد الاستكمال',completeAssignment,'success',assignmentBusy||assignmentLines.length===0),button('إغلاق التفاصيل',()=>setSelectedAssignmentId(''),'muted'))));
  return h('div',{className:'space-y-4'},inbox,detail);
 };
  const renderPartyStatements = function() {
  const staff=(userDirectory||[]).filter(u=>u.uid).map(u=>Object.assign({},u,{id:u.uid,code:u.uid,name:u.fullName||u.username||u.email||u.uid}));
  const staffType=["employeeCustody","employeeAdvance"].includes(partyStatement.type);
  const list=partyStatement.type==="customer"?allClients:partyStatement.type==="vendor"?allVendors:staff;
  const employee=staffType;
  let running=0;
  const displayRows=partyRows.map(function(line,index){
   const movement=partyStatement.type==="vendor"?n(line.credit)-n(line.debit):n(line.debit)-n(line.credit);
   running+=movement;
   return h("tr",{key:(line.journalId||"entry")+"-"+index,className:"border-t"},
    h("td",{className:"p-2"},line.date||"—"),h("td",{className:"p-2"},line.reference||"—"),h("td",{className:"p-2"},line.journalId||"—"),h("td",{className:"p-2"},line.description||"—"),h("td",{className:"p-2"},fmt(line.debit)),h("td",{className:"p-2"},fmt(line.credit)),h("td",{className:"p-2 font-bold"},fmt(running))
   );
  });
  const selectedParty=list.find(p=>String(p.code||p.id)===String(partyStatement.id));
  const typeLabel={customer:"عميل",vendor:"مورد",employeeCustody:"عهدة موظف",employeeAdvance:"سلفة موظف"}[partyStatement.type];
  return panel("كشف حساب تفصيلي — "+typeLabel,employee?"حركة الموظف مرتبطة بالحساب الرقابي "+(partyStatement.type==="employeeCustody"?"1220 — العهد لدى العاملين":"1230 — السلف لدى العاملين")+".":"الحركة مستخرجة من الأستاذ الفرعي ومرتبطة بالحساب الرقابي.",h("div",{className:"space-y-3"},
   h("div",{className:"grid md:grid-cols-3 gap-3"},
    select("نوع كشف الحساب",partyStatement.type,function(v){setPartyStatement({type:v,id:""});setPartyRows([]);setStatementPartySearch("");},[{value:"customer",label:"العملاء"},{value:"vendor",label:"الموردون"},{value:"employeeCustody",label:"العهد الشخصية للموظفين"},{value:"employeeAdvance",label:"السلف الشخصية للموظفين"}]),
    employee?partyPicker("الموظف",list,partyStatement.id,p=>setPartyStatement(old=>Object.assign({},old,{id:p.uid||p.code||p.id})),statementPartySearch,setStatementPartySearch,"customer"):partyPicker(partyStatement.type==="vendor"?"المورد":"العميل",list,partyStatement.id,p=>setPartyStatement(old=>Object.assign({},old,{id:p.code||p.id})),statementPartySearch,setStatementPartySearch,partyStatement.type),
    button("عرض كشف الحساب",loadParty,"primary",busy)
   ),
   selectedParty?metric(employee?"الموظف":typeLabel,partyName(selectedParty)):null,
   table(["التاريخ","المرجع","رقم القيد","البيان","مدين","دائن","الرصيد"],displayRows),
   h("div",{className:"text-sm font-bold text-slate-800"},"الرصيد الختامي "+(partyStatement.type==="vendor"?"الدائن":"المدين")+": "+fmt(running)+" ج.م")
  ));
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
 const renderReview=()=>panel('قائمة المراجعة والاعتماد','أي مستخدم يدخل المستندات. المراجع فقط يعتمدها أو يعيدها أو يرفضها.',selected?h('div',{className:'space-y-3'},
   h('div',{className:'flex items-center justify-between'},h('strong',null,selected.title||selected.number||selected.id),button('إغلاق',()=>setSelected(null))),
   h('p',{className:'text-sm'},'النوع: '+selected.type+' · التاريخ: '+selected.date+' · الحالة: '+status(selected.status)),
   h('p',{className:'text-sm'},'القيمة: '+fmt(selected.total||selected.amount||0)),
   (selected.errors||[]).length?h('ul',{className:'list-disc pr-5 text-rose-700'},selected.errors.map((x,i)=>h('li',{key:i},x))):null,
   (selected.warnings||[]).length?h('ul',{className:'list-disc pr-5 text-amber-700'},selected.warnings.map((x,i)=>h('li',{key:i},x))):null,
   Object.keys(selected.attachments||{}).length?panel('مرفقات المستند','الملفات محفوظة في مساحة المرفقات المالية المرتبطة بالفاتورة.',table(['اسم الملف','النوع','الحجم','الإجراء'],Object.values(selected.attachments||{}).map(function(attachment){return h('tr',{key:attachment.id,className:'border-t'},h('td',{className:'p-2'},attachment.fileName||'—'),h('td',{className:'p-2'},attachment.mimeType||'—'),h('td',{className:'p-2'},fmt((Number(attachment.size)||0)/1024)+' KB'),h('td',{className:'p-2'},button('تحميل المرفق',function(){downloadFinancialAttachment(selected.id,attachment);},'muted')));}))) : null,
   selected.type==='bankLine'?select('الحساب المقابل',offset,v=>setOffset(v),posting.map(a=>({value:a.code,label:a.code+' — '+a.name}))):null,
   selected.type==='bankLine'?button('حفظ الحساب المقابل',async()=>{try{await api('', 'POST',{action:'setBankOffset',id:selected.id,offsetAccountCode:offset});setNotice('تم حفظ الحساب المقابل');}catch(e){setError(e.message);}}):null,
   h('div',{className:'flex flex-wrap gap-2'},button('اعتماد وترحيل',()=>reviewAction(selected.status==='duplicate_review'?'approveDuplicate':'approve'),'success',busy),button('إعادة للتصحيح',()=>reviewAction('return'),'muted',busy),button('رفض',()=>reviewAction('reject'),'danger',busy))
  ):table(['المستند','النوع','التاريخ','الطرف','المبلغ','الحالة','مراجعة'],review.map(x=>h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.title||x.id),h('td',{className:'p-2'},x.type),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.partyName||'—'),h('td',{className:'p-2'},fmt(x.total||x.amount||0)),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2'},button('فتح',()=>{setSelected(documents.find(d=>d.id===x.id)||x);setOffset('6100');}))))));
 const renderCash=()=>{
  const movementLabels={customer_receipt:"تحصيل من عميل",supplier_payment:"سداد إلى مورد",other_receipt:"استلام نقدية / إيراد آخر",other_payment:"مصروف / مدفوعات أخرى",cash_to_bank:"إيداع نقدية بالبنك",bank_to_cash:"سحب نقدية من البنك",employee_custody:"تسليم عهدة لموظف",employee_custody_return:"استرداد عهدة من موظف",employee_advance:"صرف سلفة لموظف",employee_advance_recovery:"تحصيل سلفة من موظف"};
  const movement=cash.movementType;
  const activeEmployees=(userDirectory||[]).filter(u=>u.uid&&u.uid!==currentUser.uid&&["active","نشط","مفعل","enabled"].includes(String(u.status||"").toLowerCase()));
  const accountOptions=posting.map(a=>({value:a.code,label:a.code+" — "+a.name}));
  const bankOptions=[{value:"1120",label:"1120 — البنوك"}].concat(rows(master.bankAccounts).map(x=>({value:x.accountCode||x.code,label:(x.accountCode||x.code)+" — "+x.name})));
  const isParty=movement==="customer_receipt"||movement==="supplier_payment",isEmployee=movement.startsWith("employee_"),isOther=movement==="other_receipt"||movement==="other_payment",isTransfer=movement==="cash_to_bank"||movement==="bank_to_cash",isCustody=movement==="employee_custody"||movement==="employee_custody_return",isAdvance=movement==="employee_advance"||movement==="employee_advance_recovery";
  const counterparty=movement==="customer_receipt"?partyPicker("العميل",allClients,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id,partyName:partyName(p)})),cashPartySearch,setCashPartySearch,"customer"):movement==="supplier_payment"?partyPicker("المورد",allVendors,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id,partyName:partyName(p)})),cashPartySearch,setCashPartySearch,"vendor"):null;
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
    select("مركز التكلفة / المشروع",cash.projectCode,v=>setCash(o=>Object.assign({},o,{projectCode:v})),[{value:"",label:"بدون مركز تكلفة"},...centers.map(x=>({value:x.code,label:x.code+" — "+x.name}))]),
    field("مرجع / رقم مستند",cash.reference,v=>setCash(o=>Object.assign({},o,{reference:v}))),
    h("div",{className:"md:col-span-3"},area("البيان والتفاصيل",cash.description,v=>setCash(o=>Object.assign({},o,{description:v})))),
    isCustody?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"التسليم ينشئ حركة مقابلة في عهدة الموظف الشخصية، والاسترداد يخفض رصيد العهدة تلقائيًا بعد الاعتماد."):null,
    isAdvance?h("p",{className:"md:col-span-3 text-xs text-blue-700 bg-blue-50 p-2 rounded"},"السلفة تسجل على حساب السلف للموظف بصورة مستقلة عن العهدة، والتحصيل يخفض رصيد السلفة بعد الاعتماد."):null,
    button(busy?"جارٍ الحفظ...":"حفظ وإرسال إلى المراجعة",submitCash,"primary",busy||!cash.amount||!cash.description.trim()||(isParty&&!cash.partyId)||(isEmployee&&!cash.employeeUid)||(isOther&&!cash.offsetAccountCode)||(isTransfer&&!cash.bankAccountCode))
   )),
   panel("كشف حركات الخزينة","كل التسجيلات ظاهرة هنا ويمكن البحث فيها، سواء كانت معلقة أو معتمدة أو مرفوضة.",h("div",{className:"space-y-3"},field("بحث برقم المستند أو الطرف أو الموظف أو البيان",cashHistorySearch,setCashHistorySearch),table(["التاريخ","نوع الحركة","الطرف / البيان","المرجع","المبلغ","الحالة","الإجراء"],historyRows)))
  );
 };
 const renderBank=()=>panel('استيراد كشف حساب البنك','Excel أو CSV. المكررات تعرض للمراجع بدل ترحيلها تلقائيًا.',h('div',{className:'space-y-3'},
  selectWithAdd('حساب البنك',bankAccount,v=>setBankAccount(v),[{value:'1120',label:'1120 — البنوك'},...rows(master.bankAccounts).map(x=>({value:x.accountCode||x.code,label:x.code+' — '+x.name}))],'bankAccounts',{code:bankAccount,accountCode:bankAccount}),
  h('label',{className:'block text-sm font-bold'},'ملف كشف الحساب',h('input',{type:'file',accept:'.xlsx,.xls,.csv',className:'block mt-1',onChange:e=>e.target.files&&e.target.files[0]&&parseBank(e.target.files[0])})),
  bankRows.length?table(['التاريخ','الوصف','المرجع','المبلغ','النوع'],bankRows.map((x,i)=>h('tr',{key:i},h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.description),h('td',{className:'p-2'},x.reference),h('td',{className:'p-2'},fmt(x.amount)),h('td',{className:'p-2'},x.direction==='in'?'وارد':'صادر')))):null,
  button('إرسال الحركات إلى المراجعة',sendBank,'primary',busy||!bankRows.length)
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
  let title="البيانات الأساسية";
  let headers=["الكود","الاسم","التفاصيل"];
  let visibleRows=[];
  let quickKind=masterViewKind;
  let quickDefaults={};
  if(masterViewKind==="customers"||masterViewKind==="suppliers"){
   title=masterViewKind==="suppliers"?"دليل الموردين":"دليل العملاء";
   headers=["الكود","الاسم","الهاتف","رقم التسجيل الضريبي","البريد الإلكتروني","العنوان"];
   visibleRows=partyList.filter(matches).map(p=>h("tr",{key:p.code||p.id,className:"border-t"},
    h("td",{className:"p-2 font-bold"},p.code||p.id),
    h("td",{className:"p-2"},partyName(p)),
    h("td",{className:"p-2"},p.phone||p.mobile||"—"),
    h("td",{className:"p-2"},taxNo(p)),
    h("td",{className:"p-2"},p.email||"—"),
    h("td",{className:"p-2"},p.address||"—")
   ));
   quickKind="parties";
   quickDefaults={code:nextCode(partyType==="vendor"?"VND":"CUS",partyList),partyType};
  }else if(masterViewKind==="items"){
   title="الأصناف المخزنية";
   headers=["الكود","الاسم","التصنيف","المجموعة","الإصدار","الوحدة","المخزن"];
   visibleRows=items.filter(matches).map(x=>h("tr",{key:x.code,className:"border-t"},
    h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),
    h("td",{className:"p-2"},({stock:"بضاعة",raw_material:"خامة",finished_good:"منتج تام",spare_part:"قطع غيار",consumable:"مستهلكات",office_supply:"مستلزمات مكتبية"}[x.itemType]||x.itemType||"—")),
    h("td",{className:"p-2"},x.groupCode||"—"),h("td",{className:"p-2"},x.version||"—"),h("td",{className:"p-2"},x.unit||"—"),h("td",{className:"p-2"},x.warehouseCode||"default")
   ));
   quickKind="items";quickDefaults={code:nextCode("ITM",items),itemType:"stock"};
  }else if(masterViewKind==="itemGroups"){
   title="مجموعات الأصناف";headers=["الكود","اسم المجموعة","نوع المجموعة"];
   visibleRows=rows(master.itemGroups).filter(matches).map(x=>h("tr",{key:x.code,className:"border-t"},
    h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),
    h("td",{className:"p-2"},({raw_material:"خامات",finished_good:"منتجات تامة",spare_part:"قطع غيار",consumable:"مستهلكات",office_supply:"مستلزمات مكتبية",packaging:"تعبئة وتغليف",other:"أخرى"}[x.groupType]||x.groupType||"—"))
   ));
   quickKind="itemGroups";quickDefaults={code:nextCode("GRP",rows(master.itemGroups)),groupType:"other"};
  }else{
   const data=masterViewKind==="chartOfAccounts"?accounts:masterViewKind==="costCenters"?centers:rows(master[masterViewKind]);
   title=({chartOfAccounts:"دليل الحسابات",costCenters:"مراكز التكلفة",warehouses:"المخازن",bankAccounts:"حسابات البنوك",taxCodes:"الأكواد الضريبية"})[masterViewKind]||"البيانات الأساسية";
   visibleRows=data.filter(matches).map(x=>h("tr",{key:x.code,className:"border-t"},
    h("td",{className:"p-2 font-bold"},x.code),h("td",{className:"p-2"},x.name),
    h("td",{className:"p-2"},masterViewKind==="chartOfAccounts"?(x.isGroup?"حساب تجميعي":x.type+" / "+x.nature):masterViewKind==="costCenters"?(x.projectCode||"—"):masterViewKind==="taxCodes"?(x.taxType||"")+" / "+(x.rate||0)+"%":masterViewKind==="bankAccounts"?(x.accountCode||x.code):"—")
   ));
   const prefixes={chartOfAccounts:"ACC",costCenters:"CC",warehouses:"WH",bankAccounts:"BANK",taxCodes:"TAX"};
   quickDefaults={code:nextCode(prefixes[masterViewKind]||"NEW",data)};
  }
  const addButton=button("＋ إضافة "+title.replace("دليل ",""),()=>openQuickAdd(quickKind,null,quickDefaults),"primary");
  const listPanel=panel(title,"استخدم البحث لعرض السجلات المطلوبة. القائمة داخل مساحة تمرير ثابتة.",h("div",{className:"space-y-3"},
   h("div",{className:"flex flex-wrap items-center gap-2"},addButton,field("بحث بالكود أو الاسم أو البيانات",masterPartySearch,setMasterPartySearch)),
   scroll(table(headers,visibleRows))
  ));
  return h("div",{className:"space-y-4"},
   importPanel,
   panel("أنواع البيانات الأساسية","اختر نوع التكويد لعرض السجلات الخاصة به فقط.",h("div",{className:"flex flex-wrap gap-2"},tabs.map(([key,label])=>button(label,()=>{setMasterViewKind(key);setMasterPartySearch("");},masterViewKind===key?"primary":"muted")))),
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
   summaries.length?h('div',{className:'space-y-2'},...summaries.map(g=>{const due=g.outputTax-g.inputTax;return h('section',{key:g.currency,className:'grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border rounded-xl bg-white'},metric('العملة',g.currency),metric('ضريبة مدخلات المشتريات',fmt(g.inputTax)),metric('ضريبة مخرجات المبيعات',fmt(g.outputTax)),metric('صافي الوعاء (مبيعات - مشتريات)',fmt(g.salesBase-g.purchasesBase)),metric(due>=0?'ضريبة مستحقة مبدئيًا':'رصيد ضريبي دائن مبدئيًا',fmt(Math.abs(due))+' '+(due>=0?'مستحق':'رصيد'));});})):h('div',{className:'p-4 rounded-xl border text-center text-slate-500'},'لا توجد فواتير معتمدة في الفترة المحددة.'),
   panel('فواتير المشتريات — ضريبة المدخلات','يتم عرض اسم المورد ورقمه الضريبي والوعاء والضريبة والإجمالي وكود الضريبة.',h('div',{className:'space-y-2'},button('تصدير فواتير المشتريات CSV',()=>exportInvoices(purchaseInvoices,'vat-purchases.csv'),'muted'),table(headers,formatRows(purchaseInvoices)))),
   panel('فواتير المبيعات — ضريبة المخرجات','يتم عرض اسم العميل ورقمه الضريبي والوعاء والضريبة والإجمالي وكود الضريبة.',h('div',{className:'space-y-2'},button('تصدير فواتير المبيعات CSV',()=>exportInvoices(salesInvoices,'vat-sales.csv'),'muted'),table(headers,formatRows(salesInvoices)))),
   panel('الأكواد الضريبية المستخدمة','افصل أكواد مدخلات المشتريات عن أكواد مخرجات المبيعات. النسبة الافتراضية العامة 14%، ويمكن إضافة أكواد أخرى للنسب والمعاملات الخاصة.',table(['الكود','اسم الضريبة','النوع','النسبة','بداية السريان'],rows(master.taxCodes).map(x=>h('tr',{key:x.code},h('td',{className:'p-2'},x.code),h('td',{className:'p-2'},x.name),h('td',{className:'p-2'},x.taxType),h('td',{className:'p-2'},x.rate+'%'),h('td',{className:'p-2'},x.effectiveFrom||'—'))))),
   h('p',{className:'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3'},'تنبيه محاسبي: صافي المخرجات ناقص المدخلات هو مؤشر ضريبة الفترة من الفواتير المرحلة فقط. لا يشمل أرصدة الفترات السابقة أو الخصم والتحصيل تحت حساب الضريبة أو التسويات أو المعاملات الخاصة؛ راجع الإقرار الرسمي والمستندات قبل السداد.')
  ));
 };
 const incomeStatementRows=[
  ...trial.filter(x=>x.account.type==='revenue').map(x=>h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code+' — '+x.account.name),h('td',{className:'p-2'},fmt(x.amount.credit-x.amount.debit)))),
  h('tr',{key:'revenue-total',className:'font-bold'},h('td',{className:'p-2'},'إجمالي الإيرادات'),h('td',{className:'p-2'},fmt(revenue))),
  ...trial.filter(x=>x.account.type==='expense'&&(x.account.parentCode==='5'||x.account.statementGroup==='cogs')).map(x=>h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code+' — '+x.account.name),h('td',{className:'p-2'},fmt(x.amount.debit-x.amount.credit)))),
  h('tr',{key:'gross-profit',className:'font-bold'},h('td',{className:'p-2'},'مجمل الربح'),h('td',{className:'p-2'},fmt(grossProfit))),
  ...trial.filter(x=>x.account.type==='expense'&&x.account.parentCode!=='5'&&x.account.statementGroup!=='cogs').map(x=>h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code+' — '+x.account.name),h('td',{className:'p-2'},fmt(x.amount.debit-x.amount.credit)))),
  h('tr',{key:'operating-expenses',className:'font-bold'},h('td',{className:'p-2'},'إجمالي المصروفات الأخرى'),h('td',{className:'p-2'},fmt(operatingExpenses))),
  h('tr',{key:'net',className:'font-bold bg-slate-50'},h('td',{className:'p-2'},'صافي الربح / الخسارة'),h('td',{className:'p-2'},fmt(profit)))
 ];
 const renderReports=()=>panel('القوائم والتقارير المالية','ميزان المراجعة والمركز المالي تراكميان حتى نهاية الفترة من بداية الدفاتر، وقائمة الدخل والتدفقات لحركة الفترة المختارة. يلزم قيد افتتاحي للأرصدة السابقة.',h('div',{className:'space-y-3'},
  h('div',{className:'grid md:grid-cols-4 gap-3'},field('من شهر',period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),field('إلى شهر',period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),select('التقرير',report,v=>setReport(v),[{value:'trial',label:'ميزان المراجعة'},{value:'income',label:'قائمة الدخل'},{value:'balance',label:'المركز المالي'},{value:'cashflow',label:'قائمة التدفقات النقدية (مبسطة)'},{value:'ledger',label:'دفتر الأستاذ'}]),button('تحديث',loadPeriod,'primary')),
  report==='trial'?h('div',{className:'space-y-2'},table(['الحساب','الاسم','افتتاحي مدين','افتتاحي دائن','حركة مدين','حركة دائن','ختامي مدين','ختامي دائن'],balanceTrial.map(x=>h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code),h('td',{className:'p-2'},x.account.name),h('td',{className:'p-2'},fmt(x.opening.debit)),h('td',{className:'p-2'},fmt(x.opening.credit)),h('td',{className:'p-2'},fmt(x.activity.debit)),h('td',{className:'p-2'},fmt(x.activity.credit)),h('td',{className:'p-2 font-bold'},fmt(x.ending.debit)),h('td',{className:'p-2 font-bold'},fmt(x.ending.credit)))),h('div',{className:'flex flex-wrap justify-end gap-4 text-sm font-bold border rounded-lg p-3'},h('span',null,'إجمالي الختامي المدين: '+fmt(balanceTrial.reduce((s,x)=>s+x.ending.debit,0))),h('span',null,'إجمالي الختامي الدائن: '+fmt(balanceTrial.reduce((s,x)=>s+x.ending.credit,0))))):null,
  report==='income'?panel('قائمة الدخل','تعرض الإيرادات وتكلفة المبيعات ومجمل الربح ومصروفات الفترة المختارة.',table(['البند','القيمة'],incomeStatementRows)):null,
  report==='balance'?h('div',{className:'space-y-2'},table(['البند','القيمة'],[['إجمالي الأصول',assets],['إجمالي الالتزامات',liabilities],['حقوق الملكية قبل نتيجة الأرباح',equity-accumulatedProfit],['الأرباح المتراكمة منذ بداية الدفاتر',accumulatedProfit],['إجمالي حقوق الملكية',equity],['إجمالي الالتزامات وحقوق الملكية',liabilities+equity],['فرق التوازن (يجب أن يساوي صفرًا)',assets-liabilities-equity]].map((x,i)=>h('tr',{key:i,className:i===6?'font-bold':''},h('td',{className:'p-2'},x[0]),h('td',{className:'p-2'},fmt(x[1]))))),h('p',{className:'text-xs text-slate-500'},'المركز المالي يعرض الأرصدة المتراكمة منذ بداية الدفاتر المحاسبية '+(accountingStartMonth||'')+' وحتى '+period.to+'. يجب إدخال قيد افتتاحي معتمد للأرصدة السابقة لبداية الدفاتر.')):null,
  report==='cashflow'?h('div',{className:'space-y-3'},panel('قائمة التدفقات النقدية المبسطة','تستند إلى الحركات النقدية والبنكية المرحلة بالفترة المحددة. التحويلات بين النقدية والبنوك مستبعدة لتجنب ازدواج احتسابها.',table(['النشاط','تدفقات داخلة','تدفقات خارجة','صافي التدفق'],[
   ['الأنشطة التشغيلية',cashFlowSummary.operatingIn,cashFlowSummary.operatingOut,cashFlowSummary.operatingIn-cashFlowSummary.operatingOut],
   ['الأنشطة الاستثمارية',cashFlowSummary.investingIn,cashFlowSummary.investingOut,cashFlowSummary.investingIn-cashFlowSummary.investingOut],
   ['الأنشطة التمويلية',cashFlowSummary.financingIn,cashFlowSummary.financingOut,cashFlowSummary.financingIn-cashFlowSummary.financingOut],
   ['حركات غير مصنفة — راجع الحساب المقابل',cashFlowSummary.unclassifiedIn,cashFlowSummary.unclassifiedOut,cashFlowSummary.unclassified],
   ['الإجمالي',cashFlowSummary.operatingIn+cashFlowSummary.investingIn+cashFlowSummary.financingIn+cashFlowSummary.unclassifiedIn,cashFlowSummary.operatingOut+cashFlowSummary.investingOut+cashFlowSummary.financingOut+cashFlowSummary.unclassifiedOut,cashFlowSummary.netChange]
  ].map((x,i)=>h('tr',{key:i,className:i===3?'font-bold':''},h('td',{className:'p-2'},x[0]),h('td',{className:'p-2'},fmt(x[1])),h('td',{className:'p-2'},fmt(x[2])),h('td',{className:'p-2'},fmt(x[3])))))),panel('مطابقة النقدية والبنوك','الرصيد الافتتاحي + صافي التدفقات = الرصيد الختامي الدفتري.',table(['البيان','القيمة'],[['الرصيد الافتتاحي في بداية الفترة',cashFlowSummary.openingCash],['صافي التغير خلال الفترة',cashFlowSummary.netChange],['الرصيد الختامي المتوقع',cashFlowSummary.closingCash],['الرصيد الختامي بدفتر الأستاذ',cashAccounts.reduce((sum,x)=>sum+x.amount.debit-x.amount.credit,0)],['حركات غير مصنفة تحتاج مراجعة',cashFlowSummary.unclassified]].map((x,i)=>h('tr',{key:i,className:i===4?'text-amber-700':''},h('td',{className:'p-2'},x[0]),h('td',{className:'p-2 font-bold'},fmt(x[1])))))),null):null,
  report==='ledger'?h('div',null,field('بحث في الحساب أو البيان',search,setSearch),table(['التاريخ','القيد','الحساب','البيان','مدين','دائن','مركز التكلفة'],flat.filter(x=>!search||[x.accountCode,x.description,x.journalId].join(' ').toLowerCase().includes(search.toLowerCase())).map((x,i)=>h('tr',{key:i},h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.journalId),h('td',{className:'p-2'},x.accountCode),h('td',{className:'p-2'},x.description),h('td',{className:'p-2'},fmt(x.debit)),h('td',{className:'p-2'},fmt(x.credit)),h('td',{className:'p-2'},x.costCenterId||'—'))))):null,
  button('تصدير ميزان المراجعة CSV',()=>dl('financial-trial-balance.csv',[['Code','Account','Opening Debit','Opening Credit','Period Debit','Period Credit','Closing Debit','Closing Credit'],...balanceTrial.map(x=>[x.account.code,x.account.name,x.opening.debit,x.opening.credit,x.activity.debit,x.activity.credit,x.ending.debit,x.ending.credit])].map(x=>x.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\n')))
 ));
 const renderQuickAdd = function() {
  if(!quickAddType)return null;
  const change=function(key,value){setQuickAddForm(function(old){return Object.assign({},old,{[key]:value});});};
  const typeLabels={chartOfAccounts:'حساب جديد',costCenters:'مركز تكلفة جديد',items:'صنف مخزني جديد',itemGroups:'مجموعة أصناف جديدة',warehouses:'مخزن جديد',bankAccounts:'حساب بنك جديد',taxCodes:'كود ضريبي جديد',parties:'عميل / مورد جديد'};
  const fields=[
   field('الكود',quickAddForm.code,function(v){change('code',v);}),
   field('الاسم',quickAddForm.name,function(v){change('name',v);})
  ];
  if(quickAddType==='chartOfAccounts'){
   fields.push(select('نوع الحساب',quickAddForm.type,function(v){change('type',v);},[{value:'asset',label:'أصول'},{value:'liability',label:'التزامات'},{value:'equity',label:'حقوق ملكية'},{value:'revenue',label:'إيرادات'},{value:'expense',label:'مصروفات'}]));
   fields.push(select('الطبيعة',quickAddForm.nature,function(v){change('nature',v);},[{value:'debit',label:'مدين'},{value:'credit',label:'دائن'}]));
   fields.push(select('الحساب الأب',quickAddForm.parentCode,function(v){change('parentCode',v);},[{value:'',label:'بدون'}].concat(accounts.filter(function(x){return x.isGroup;}).map(function(x){return {value:x.code,label:x.code+' — '+x.name};}))));
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
   fields.push(select('نوع الطرف',quickAddForm.partyType,function(v){change('partyType',v);},[{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'}]));
   fields.push(field('رقم التسجيل الضريبي',quickAddForm.taxNumber,function(v){change('taxNumber',v);}));
   fields.push(field('رقم الهاتف',quickAddForm.phone,function(v){change('phone',v);}));
   fields.push(field('البريد الإلكتروني',quickAddForm.email,function(v){change('email',v);},'email'));
   fields.push(field('العنوان',quickAddForm.address,function(v){change('address',v);}));
  }
  return h('div',{className:'fixed inset-0 z-[100] bg-slate-950/50 flex items-center justify-center p-3',onClick:function(){setQuickAddType('');setQuickAddTarget(null);}},
   h('section',{className:'bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-auto',onClick:function(e){e.stopPropagation();}},
    h('div',{className:'flex items-center justify-between gap-3 mb-4'},h('h3',{className:'font-bold text-lg'},typeLabels[quickAddType]||'إضافة كود'),button('إغلاق',function(){setQuickAddType('');setQuickAddTarget(null);},'muted')),
    h('div',{className:'grid md:grid-cols-2 gap-3'},...fields),
    h('div',{className:'flex justify-end gap-2 mt-4'},button('إلغاء',function(){setQuickAddType('');setQuickAddTarget(null);},'muted'),button('حفظ الكود',saveQuickAdd,'primary',busy))
   )
  );
 };
 let content=null;
 if(tab==='overview')content=renderOverview();
 if(tab==='journal')content=renderJournal();
 if(tab==='review')content=renderReview();
 if(tab==='invoices')content=renderInvoices();
 if(tab==='assignments')content=renderAssignments();
 if(tab==='assignments')content=renderAssignments();
 if(tab==='partyStatements')content=renderPartyStatements();
 if(tab==='masters')content=renderMasters();
 if(tab==='accounts')content=renderMaster('accounts');
 if(tab==='centers')content=h('div',{className:'space-y-4'},renderMaster('centers'),renderCostCenterAnalysis());
 if(tab==='inventory')content=renderInventory();
 if(tab==='cash')content=renderCash();
 if(tab==='bank')content=renderBank();
 if(tab==='tax')content=renderTax();
 if(tab==='reports')content=renderReports();
 return h('div',{className:'p-3 md:p-5 space-y-3',dir:rtl?'rtl':'ltr'},
  h('header',{className:'flex flex-wrap items-center justify-between gap-3'},h('div',null,h('h2',{className:'text-2xl font-extrabold'},'النظام المالي والمحاسبي'),h('p',{className:'text-xs text-slate-500'},'دفتر أستاذ مستقل — لا ترحيل قبل المراجعة والاعتماد')),button(busy?'جارٍ التحديث':'تحديث البيانات',refresh,'muted',busy)),
  h('nav',{className:'flex flex-wrap gap-2'},nav.map(x=>button(x[1],()=>{setTab(x[0]);setNotice('');setError('');},tab===x[0]?'primary':'muted'))),
  noticeElement,content,renderQuickAdd(),busy?h('p',{className:'text-xs text-slate-500'},'جارٍ تحميل البيانات...'):null,
  h('p',{className:'text-xs text-slate-400'},'الأرصدة القديمة في متابعة المشروعات والعهد لا تُنقل تلقائيًا إلى الحسابات. يلزم إعداد واعتماد الأرصدة الافتتاحية.'))
}
window.PEST_FINANCE_MODULE=FinanceModule;
})();