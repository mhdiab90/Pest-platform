(function(){
'use strict';
const h=React.createElement;
const today=()=>new Date().toISOString().slice(0,10);
const rows=o=>o?Object.entries(o).map(([key,v])=>Object.assign({id:v&&v.id||key,code:v&&v.code||key},v||{})):[];
const id=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now());
const n=v=>Number(v)||0;
const fmt=v=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
const dl=(name,txt)=>{const b=new Blob([txt],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);};
function FinanceModule(props){
 const {db,currentUser,rtl=true,workerBase}=props;
 const t=(ar,en)=>rtl?ar:en,base=workerBase||window.location.origin;
 const [tab,setTab]=React.useState('overview'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
 const [master,setMaster]=React.useState({chartOfAccounts:{},costCenters:{},items:{},itemGroups:{},warehouses:{},bankAccounts:{},taxCodes:{},parties:{},settings:{},inventory:{balances:{}}});
 const [documents,setDocuments]=React.useState([]),[review,setReview]=React.useState([]),[periodJournals,setPeriodJournals]=React.useState([]);
 const [clients,setClients]=React.useState([]),[vendors,setVendors]=React.useState([]),[projects,setProjects]=React.useState([]);
 const [period,setPeriod]=React.useState({from:today().slice(0,7),to:today().slice(0,7)}),[report,setReport]=React.useState('trial');
 const [selected,setSelected]=React.useState(null),[offset,setOffset]=React.useState('6100');
 const [quickAddType,setQuickAddType]=React.useState(''),[quickAddTarget,setQuickAddTarget]=React.useState(null),[quickAddParent,setQuickAddParent]=React.useState(null),[quickAddForm,setQuickAddForm]=React.useState({code:'',name:'',type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',version:'',warehouseCode:'default',projectCode:'',taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'customer',phone:'',taxNumber:'',email:'',address:''});
 const [masterForm,setMasterForm]=React.useState({kind:'chartOfAccounts',code:'',name:'',type:'asset',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',version:'',projectCode:'',warehouseCode:'default',taxType:'vat',rate:'0',effectiveFrom:today()});
 const [journal,setJournal]=React.useState({id:'',date:today(),description:'',reference:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});
 const [invoice,setInvoice]=React.useState({id:'',type:'purchase',date:today(),number:'',partyId:'',partyName:'',currency:'EGP',taxRate:'',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
 const [invoiceFile,setInvoiceFile]=React.useState(null),[invoicePartySearch,setInvoicePartySearch]=React.useState(''),[cashPartySearch,setCashPartySearch]=React.useState(''),[statementPartySearch,setStatementPartySearch]=React.useState(''),[ocrSuggestions,setOcrSuggestions]=React.useState({party:null,items:[]}),[cash,setCash]=React.useState({direction:'in',date:today(),amount:'',description:'',reference:'',partyType:'customer',partyId:'',cashAccountCode:'1110',partyAccountCode:'1210'});
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
   setReview(rows(r.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
   setDocuments(rows(d.items).sort((a,b)=>n(b.createdAt)-n(a.createdAt)));
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const loadPeriod=async()=>{
  setBusy(true);
  try{const d=await api('?resource=periods&from='+encodeURIComponent(period.from)+'&to='+encodeURIComponent(period.to));const all=[];Object.entries(d.entries||{}).forEach(([m,entries])=>Object.values(entries||{}).forEach(j=>{if(j&&j.status==='posted')all.push(j);}));setPeriodJournals(all);}
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
 const partyName=p=>p.name||p.companyName||p.legalName||p.code||p.id;
 const nextCode=(prefix,list)=>{const used=new Set((list||[]).map(x=>String(x.code||x.id||'')));let i=1,code='';do{code=prefix+'-'+String(i++).padStart(3,'0');}while(used.has(code));return code;};
 const normalizeMatch=v=>String(v||'').toLowerCase().replace(/[\s\-_.،,]+/g,'').trim();

 const updateJ=(i,k,v)=>setJournal(o=>Object.assign({},o,{lines:o.lines.map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const updateI=(i,k,v)=>setInvoice(o=>Object.assign({},o,{lines:o.lines.map((x,j)=>j===i?Object.assign({},x,{[k]:v}):x)}));
 const jDebit=journal.lines.reduce((s,x)=>s+n(x.debit),0),jCredit=journal.lines.reduce((s,x)=>s+n(x.credit),0);
 const net=invoice.lines.reduce((s,x)=>s+n(x.quantity)*n(x.unitPrice)-n(x.discount),0)-n(invoice.discount);
 const tax=invoice.taxAmount!==''?n(invoice.taxAmount):net*n(invoice.taxRate)/100,total=net+tax;
 const flat=periodJournals.flatMap(j=>(j.lines||[]).map(l=>Object.assign({},l,{date:j.date,journalId:j.id,description:l.description||j.description||'',reference:j.reference||''})));
 const balances=flat.reduce((o,l)=>{const a=o[l.accountCode]||(o[l.accountCode]={debit:0,credit:0});a.debit+=n(l.debit);a.credit+=n(l.credit);return o;},{});
 const trial=accounts.map(a=>({account:a,amount:balances[a.code]||{debit:0,credit:0}})).filter(x=>x.amount.debit||x.amount.credit);
 const sumType=type=>trial.filter(x=>x.account.type===type).reduce((s,x)=>s+(type==='revenue'?x.amount.credit-x.amount.debit:x.amount.debit-x.amount.credit),0);
 const revenue=sumType('revenue'),expenses=sumType('expense'),profit=revenue-expenses,assets=sumType('asset'),liabilities=trial.filter(x=>x.account.type==='liability').reduce((s,x)=>s+x.amount.credit-x.amount.debit,0),equity=trial.filter(x=>x.account.type==='equity').reduce((s,x)=>s+x.amount.credit-x.amount.debit,0)+profit;
 const cashAccounts=trial.filter(x=>['1110','1120'].includes(x.account.code)||x.account.isCash);
 const status=s=>({pending_review:'بانتظار المراجعة',needs_correction:'يحتاج تصحيح',duplicate_review:'تكرار محتمل',posted:'مُرحّل',rejected:'مرفوض'}[s]||s||'—');
 const button=(label,fn,kind,disabled)=>h('button',{type:'button',onClick:fn,disabled:!!disabled,className:'rounded-xl px-3 py-2 text-sm font-bold border '+(kind==='primary'?'bg-blue-700 text-white border-blue-700':kind==='success'?'bg-emerald-600 text-white border-emerald-600':kind==='danger'?'bg-rose-50 text-rose-700 border-rose-200':'bg-white text-slate-700 border-slate-200')},label);
 const field=(label,value,onChange,type,extra)=>h('label',{className:'block text-sm font-bold text-slate-700'},label,h('input',Object.assign({type:type||'text',value:value==null?'':value,onChange:e=>onChange(e.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white',step:'any'},extra||{})));
 const select=(label,value,onChange,options)=>h('label',{className:'block text-sm font-bold text-slate-700'},label,h('select',{value:value||'',onChange:e=>onChange(e.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'},options.map(x=>h('option',{key:x.value,value:x.value},x.label))));
 const openQuickAdd=(kind,onCreated,defaults)=>{if(quickAddType)setQuickAddParent({type:quickAddType,form:quickAddForm,target:quickAddTarget});else setQuickAddParent(null);setQuickAddType(kind);setQuickAddTarget(()=>onCreated||null);setQuickAddForm(Object.assign({code:'',name:'',type:'expense',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',version:'',warehouseCode:'default',projectCode:'',taxType:'vat_output',rate:'0',effectiveFrom:today(),partyType:'customer',phone:'',taxNumber:'',email:'',address:''},defaults||{}));};
 const selectWithAdd=(label,value,onChange,options,kind,defaults)=>select(label,value,function(next){if(next==='__quick_add__'){openQuickAdd(kind,onChange,defaults);}else onChange(next);},(options||[]).concat([{value:'__quick_add__',label:'＋ إضافة كود جديد'}]));
 const partyPicker=(label,list,value,onChange,query,setQuery,partyType)=>{
  const term=normalizeMatch(query),matches=(list||[]).filter(p=>!term||normalizeMatch([p.code,p.name,p.companyName,p.legalName,p.phone,p.mobile,p.taxNumber].join(' ')).includes(term)).slice(0,8);
  const selected=(list||[]).find(p=>String(p.code||p.id)===String(value||''));
  return h('div',{className:'block text-sm font-bold text-slate-700 min-w-0'},label,
   h('input',{type:'search',value:query||'',onChange:e=>setQuery(e.target.value),placeholder:'ابحث بالاسم أو الكود أو رقم التسجيل الضريبي',className:'mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal bg-white'}),
   selected?h('div',{className:'mt-1 text-xs text-emerald-700'},'المحدد: '+partyName(selected)+' ('+(selected.code||selected.id)+')'):null,
   h('div',{className:'mt-1 max-h-36 overflow-auto rounded-lg border bg-white'},matches.length?matches.map(p=>h('button',{key:String(p.code||p.id),type:'button',onClick:()=>{onChange(p);setQuery(partyName(p)+' ('+(p.code||p.id)+')');},className:'block w-full text-start px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0'},h('b',null,p.code||p.id),' — ',partyName(p),p.taxNumber?h('small',{className:'block text-slate-500'},'رقم ضريبي: '+p.taxNumber):null)):h('div',{className:'p-2 text-xs text-slate-500'},'لا توجد نتيجة مطابقة')),
   h('button',{type:'button',onClick:()=>openQuickAdd('parties',code=>{const p={code,name:query,partyType};onChange(p);setQuery((query||'')+' ('+code+')');},{code:nextCode(partyType==='vendor'?'VND':'CUS',list),name:String(query||'').replace(/\s*\([^)]*\)\s*$/,''),partyType}),className:'mt-2 text-xs font-bold text-blue-700 underline'},'＋ تكويد '+(partyType==='vendor'?'مورد':'عميل')+' جديد')
  );
 };
 const saveQuickAdd=async()=>{
  if(!quickAddType)return;
  setBusy(true);setError('');
  try{
   const f=quickAddForm,kind=quickAddType;
   const item=kind==='parties'?{code:f.code,name:f.name,partyType:f.partyType,phone:f.phone,taxNumber:f.taxNumber,email:f.email,address:f.address}:{code:f.code,name:f.name,type:f.type,nature:f.nature,parentCode:f.parentCode,isGroup:f.isGroup,subledgerType:f.subledgerType,unit:f.unit,groupCode:f.groupCode,version:f.version,warehouseCode:f.warehouseCode,projectCode:f.projectCode,taxType:f.taxType,rate:n(f.rate),effectiveFrom:f.effectiveFrom};
   const result=await api('', 'POST',{action:'saveMaster',kind,item});
   setNotice(kind==='parties'?'تم تسجيل الطرف في سجل العملاء/الموردين.':'تم إضافة الكود بنجاح.');
   const parent=quickAddParent,target=quickAddTarget;
   await refresh();
   if(parent){
    setQuickAddType(parent.type);setQuickAddForm(parent.form);setQuickAddTarget(()=>parent.target||null);
    if(target&&result.item)target(result.item.code);
    setQuickAddParent(null);
   }else{
    setQuickAddType('');
    if(target&&result.item)target(result.item.code);
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
   const party=parties.find(x=>String(x.code||x.id)===String(invoice.partyId));
   const payload=Object.assign({},invoice,{partyName:party?partyName(party):invoice.partyName,lines:invoice.lines.map(x=>Object.assign({},x,{quantity:n(x.quantity),unitPrice:n(x.unitPrice),discount:n(x.discount)}))});
   const result=await api('', 'POST',Object.assign({action:'submitInvoice'},payload));
   let attachmentError='';
   if(invoiceFile){
    try{const uploadResult=await upload(invoiceFile,result.id);const attachment=uploadResult.attachment||uploadResult;await api('', 'POST',{action:'addAttachment',documentId:result.id,attachment});}
    catch(e){attachmentError=e.message||String(e);}
   }
   if(result.status==='pending_review')setNotice('تم حفظ الفاتورة وإرسالها للمراجعة. سيتم إنشاء وترحيل القيد بعد الاعتماد.');
   else setNotice('الفاتورة محفوظة وتحتاج تصحيح: '+(result.errors||[]).join('، '));
   if(result.status==='pending_review'){
    setInvoice({id:'',type:invoice.type,date:today(),number:'',partyId:'',partyName:'',currency:'EGP',taxRate:'',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
    setInvoiceFile(null);setInvoicePartySearch('');setOcrSuggestions({party:null,items:[]});
   }else setInvoice(o=>Object.assign({},o,{id:result.id}));
   await refresh();
   if(attachmentError)setError('تم حفظ بيانات الفاتورة، لكن تعذر رفع الصورة أو ربطها: '+attachmentError);
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 };
 const readImage=async file=>{
  const selectedFile=file||invoiceFile;
  if(!selectedFile) {setError('اختر صورة الفاتورة أولاً.');return;}
  if(!String(selectedFile.type||'').startsWith('image/')) {setError('القراءة الآلية متاحة لصور JPG وPNG وWebP. يمكن إرفاق PDF مع إدخال بياناته يدويًا.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(selectedFile);});
   const result=await api('', 'POST',{action:'ocr',image:data}),x=result.extracted||{};
   const nextType=x.type==='sales'?'sales':x.type==='purchase'?'purchase':invoice.type;
   const targetPartyType=nextType==='purchase'?'vendor':'customer',partyList=targetPartyType==='vendor'?allVendors:allClients;
   const extractedParty=String(x.partyName||'').trim(),taxNumber=String(x.taxNumber||'').trim();
   const matchedParty=partyList.find(p=>taxNumber&&String(p.taxNumber||'').trim()===taxNumber)||partyList.find(p=>normalizeMatch(partyName(p))===normalizeMatch(extractedParty));
   const unmatchedItems=[];
   const extractedLines=Array.isArray(x.items)?x.items.map((line,index)=>{
    const description=String(line.description||'').trim();
    const matchedItem=items.find(item=>normalizeMatch(item.code)===normalizeMatch(line.itemCode)||normalizeMatch(item.name)===normalizeMatch(description));
    if(description&&!matchedItem)unmatchedItems.push({index,name:description,code:nextCode('ITM',items)});
    return {description,kind:'stock',itemCode:matchedItem?matchedItem.code:'',quantity:String(line.quantity||1),unit:line.unit||'قطعة',unitPrice:String(line.unitPrice==null?'':line.unitPrice),discount:String(line.discount||''),accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'};
   }):[];
   setInvoice(old=>Object.assign({},old,{
    type:nextType,number:x.number||old.number,date:x.date||old.date,partyId:matchedParty?(matchedParty.code||matchedParty.id):'',
    partyName:extractedParty||old.partyName,currency:x.currency||old.currency,taxRate:x.taxRate==null?old.taxRate:String(x.taxRate),
    taxAmount:x.taxAmount==null?old.taxAmount:String(x.taxAmount),discount:x.discount==null?old.discount:String(x.discount),
    lines:extractedLines.length?extractedLines:old.lines
   }));
   setInvoicePartySearch(extractedParty);
   setOcrSuggestions({party:extractedParty&&!matchedParty?{name:extractedParty,taxNumber,partyType:targetPartyType,code:nextCode(targetPartyType==='vendor'?'VND':'CUS',partyList)}:null,items:unmatchedItems});
   setNotice('اكتملت القراءة الأولية. راجع التاريخ ورقم الفاتورة والمبالغ، واختر الأكواد الموجودة أو وافق على تكويد المقترحات قبل الحفظ.');
  }catch(e){setError('تعذرت قراءة الصورة آليًا: '+e.message+' ويمكنك استكمال البيانات يدويًا.');}
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
  itemGroups:{label:'مجموعات الأصناف',kind:'itemGroups',columns:['code','name']},
  items:{label:'الأصناف المخزنية',kind:'items',columns:['code','name','unit','groupCode','version','warehouseCode']},
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
    if(out.taxType==='قيمة مضافة مدخلات')out.taxType='vat_input';if(out.taxType==='قيمة مضافة مخرجات')out.taxType='vat_output';if(out.taxType==='خصم/استقطاع')out.taxType='withholding';if(out.taxType==='إضافة')out.taxType='addition';
    return out;
   }).filter(row=>row.code||row.name);
   if(!rowsOut.length)throw new Error('لم يتم التعرف على أعمدة الكود والاسم. استخدم النموذج المرفق.');
   if(rowsOut.length>500)throw new Error('الحد الأقصى 500 سجل في الملف الواحد.');
   const invalid=rowsOut.findIndex(row=>!String(row.code||'').trim()||!String(row.name||'').trim());
   if(invalid>=0)throw new Error('الصف '+(invalid+2)+': يجب إدخال الكود والاسم.');
   if(masterImportKind==='chartOfAccounts'&&rowsOut.some(row=>!row.type||!row.nature))throw new Error('يجب تحديد نوع الحساب وطبيعته في كل صف.');
   if(masterImportKind==='taxCodes'&&rowsOut.some(row=>!row.taxType))throw new Error('يجب تحديد نوع الضريبة في كل صف.');
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
  else if(doc.type==='invoice'){setInvoice({id:doc.id,type:doc.invoiceType||(doc.type==='purchase'?'purchase':'sales'),date:doc.date,number:doc.number,partyId:doc.partyId,partyName:doc.partyName,currency:doc.currency||'EGP',taxRate:String(doc.taxRate||''),taxAmount:doc.taxAmount==null?'':String(doc.taxAmount),discount:String(doc.discount||''),projectCode:doc.projectCode||'',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setTab('invoices');}
 };
 const nav=[
 ['overview','ملخص مالي'],['journal','القيود اليومية'],['review','المراجعة والاعتماد'],['invoices','فواتير العملاء والموردين'],['partyStatements','كشف حساب عميل / مورد'],['masters','البيانات الأساسية والاستيراد'],['accounts','دليل الحسابات'],['centers','مراكز التكلفة'],['inventory','المخزون والأكواد'],['cash','الخزينة والتحصيل والسداد'],['bank','كشوف البنوك'],['tax','الضرائب'],['reports','القوائم المالية']
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
   select('نوع الفاتورة',invoice.type,function(v){setInvoice(function(old){return Object.assign({},old,{type:v,partyId:'',partyName:''});});},[{value:'purchase',label:'مشتريات / مورد'},{value:'sales',label:'مبيعات / عميل'}]),
   field('رقم الفاتورة',invoice.number,function(v){setInvoice(function(old){return Object.assign({},old,{number:v});});}),
   field('التاريخ',invoice.date,function(v){setInvoice(function(old){return Object.assign({},old,{date:v});});},'date'),
   partyPicker(invoice.type==='purchase'?'المورد':'العميل',parties,invoice.partyId,function(p){setInvoice(old=>Object.assign({},old,{partyId:p.code||p.id,partyName:partyName(p)}));},invoicePartySearch,setInvoicePartySearch,invoice.type==='purchase'?'vendor':'customer'),
   select('المشروع المرتبط',invoice.projectCode,function(v){setInvoice(function(old){return Object.assign({},old,{projectCode:v});});},[{value:'',label:'بدون مشروع'}].concat(projects.map(function(p){return {value:p.code||p.id,label:(p.name||p.code)+' ('+(p.code||p.id)+')'};}))),
   field('نسبة الضريبة %',invoice.taxRate,function(v){setInvoice(function(old){return Object.assign({},old,{taxRate:v,taxAmount:''});});},'number'),
   field('الضريبة (قيمة ثابتة اختيارية)',invoice.taxAmount,function(v){setInvoice(function(old){return Object.assign({},old,{taxAmount:v});});},'number'),
   field('خصم الفاتورة',invoice.discount,function(v){setInvoice(function(old){return Object.assign({},old,{discount:v});});},'number'),
   h('div',{className:'md:col-span-3 flex flex-wrap items-end gap-3 p-3 border rounded-xl bg-blue-50/50'},
    h('label',{className:'block text-sm font-bold flex-1 min-w-[220px]'},'صورة / PDF الفاتورة',h('input',{type:'file',accept:'image/jpeg,image/png,image/webp,application/pdf',onChange:function(e){const file=e.target.files&&e.target.files[0]||null;setInvoiceFile(file);setOcrSuggestions({party:null,items:[]});setNotice('');setError('');},className:'block mt-1 w-full text-sm'}),invoiceFile?h('small',{className:'block mt-1 text-slate-600 font-normal'},invoiceFile.name,invoiceFile.type==='application/pdf'?' — PDF سيتم حفظه كمرفق ويحتاج إدخال البيانات يدويًا':''):null),
    button(busy?'جارٍ قراءة الفاتورة...':'رفع الصورة وقراءتها وملء الحقول',()=>readImage(invoiceFile),'primary',busy||!invoiceFile||!String(invoiceFile.type||'').startsWith('image/'))
   )
  );
  const invoiceHead = panel('بيانات الفاتورة','صورة الفاتورة تساعد في استخراج البيانات. راجعها بنفسك قبل الإرسال للمراجعة.',headFields);
  const invoiceRows = invoice.lines.map(function(line,index) {
   const itemOptions=[{value:'',label:'اختر الصنف'}].concat(items.map(function(x){return {value:x.code,label:x.code+' — '+x.name+' '+(x.version||'')};}));
   const accountOptions=posting.map(function(a){return {value:a.code,label:a.code+' — '+a.name};});
   const centerOptions=[{value:'',label:'بدون'}].concat(centers.map(function(x){return {value:x.code,label:x.code+' — '+x.name};}));
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 p-3 border bg-slate-50 rounded-xl'},
    h('div',{className:'md:col-span-3'},field('وصف البند',line.description,function(v){updateI(index,'description',v);})),
    h('div',{className:'md:col-span-2'},select('النوع',line.kind,function(v){updateI(index,'kind',v);},[{value:'stock',label:'صنف مخزني'},{value:'service',label:'خدمة / مصروف'}])),
    h('div',{className:'md:col-span-2'},line.kind==='stock'?selectWithAdd('كود الصنف',line.itemCode,function(v){updateI(index,'itemCode',v);},itemOptions,'items'):selectWithAdd('الحساب',line.accountCode,function(v){updateI(index,'accountCode',v);},accountOptions,'chartOfAccounts')),
    h('div',{className:'md:col-span-1'},field('الكمية',line.quantity,function(v){updateI(index,'quantity',v);},'number')),
    h('div',{className:'md:col-span-1'},field('السعر',line.unitPrice,function(v){updateI(index,'unitPrice',v);},'number')),
    h('div',{className:'md:col-span-1'},field('الخصم',line.discount,function(v){updateI(index,'discount',v);},'number')),
    h('div',{className:'md:col-span-1'},selectWithAdd('مركز التكلفة',line.costCenterId,function(v){updateI(index,'costCenterId',v);},centerOptions,'costCenters')),
    h('div',{className:'md:col-span-1 flex items-end'},button('حذف',function(){setInvoice(function(old){return Object.assign({},old,{lines:old.lines.filter(function(x,j){return j!==index;})});});},'danger'))
   );
  });
  const addInvoiceLine = button('إضافة بند',function(){setInvoice(function(old){return Object.assign({},old,{lines:old.lines.concat([{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}])});});});
  const invoiceLines = panel('بنود الفاتورة','اختر صنفًا موجودًا أو صنف البند كخدمة/مصروف.',h('div',{className:'space-y-3'},...invoiceRows,addInvoiceLine));
  const suggestionCards=[];
  if(ocrSuggestions.party)suggestionCards.push(h('div',{className:'flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-amber-50'},h('div',null,h('b',null,'طرف غير مسجل: '+ocrSuggestions.party.name),h('p',{className:'text-xs text-slate-600'},'الكود المقترح '+ocrSuggestions.party.code+' — لن يتم حفظه إلا بعد موافقتك')),button('تكويد الطرف واختياره',()=>openQuickAdd('parties',code=>{setInvoice(old=>Object.assign({},old,{partyId:code,partyName:ocrSuggestions.party.name}));setInvoicePartySearch(ocrSuggestions.party.name+' ('+code+')');setOcrSuggestions(old=>Object.assign({},old,{party:null}));},{code:ocrSuggestions.party.code,name:ocrSuggestions.party.name,partyType:ocrSuggestions.party.partyType,taxNumber:ocrSuggestions.party.taxNumber}), 'primary')));
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
  const totalsBox = h('div',{className:'flex flex-wrap items-center gap-4 p-3 bg-white border rounded-xl'},h('b',null,'الصافي: '+fmt(net)),h('b',null,'الضريبة: '+fmt(tax)),h('b',null,'الإجمالي: '+fmt(total)),button('حفظ وإرسال للمراجعة',submitInvoice,'primary',busy));
  const correctionRows=documents.filter(function(x){return x.type==='invoice'&&['needs_correction','draft'].includes(x.status);}).map(function(x){
   return h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.number||x.id),h('td',{className:'p-2'},x.partyName),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2'},button('تعديل',function(){editDoc(x);},'muted')));
  });
  const correctionPanel = panel('فواتير تحتاج تصحيح','',table(['الفاتورة','الطرف','التاريخ','الحالة','إجراء'],correctionRows));
  return h('div',{className:'space-y-4'},invoiceHead,suggestionsPanel,invoiceLines,journalPreview,totalsBox,correctionPanel);
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
 const renderPartyStatements = function() {
  const list=partyStatement.type==='customer'?allClients:allVendors;
  let running=0;
  const displayRows=partyRows.map(function(line,index){
   const movement=partyStatement.type==='vendor'?n(line.credit)-n(line.debit):n(line.debit)-n(line.credit);
   running+=movement;
   return h('tr',{key:(line.journalId||'entry')+'-'+index,className:'border-t'},
    h('td',{className:'p-2'},line.date||'—'),
    h('td',{className:'p-2'},line.reference||'—'),
    h('td',{className:'p-2'},line.journalId||'—'),
    h('td',{className:'p-2'},line.description||'—'),
    h('td',{className:'p-2'},fmt(line.debit)),
    h('td',{className:'p-2'},fmt(line.credit)),
    h('td',{className:'p-2 font-bold'},fmt(running))
   );
  });
  const selectedParty=list.find(function(p){return (p.code||p.id)===partyStatement.id;});
  return panel('كشف حساب العميل / المورد','الحركة مستخرجة من الأستاذ الفرعي ومربوطة بالحساب الرقابي.',h('div',{className:'space-y-3'},
   h('div',{className:'grid md:grid-cols-3 gap-3'},
    select('نوع الطرف',partyStatement.type,function(v){setPartyStatement({type:v,id:''});setPartyRows([]);},[{value:'customer',label:'عميل'},{value:'vendor',label:'مورد'}]),
    partyPicker('الطرف',list,partyStatement.id,function(p){setPartyStatement(old=>Object.assign({},old,{id:p.code||p.id}));},statementPartySearch,setStatementPartySearch,partyStatement.type==='vendor'?'vendor':'customer'),
    button('عرض كشف الحساب',loadParty,'primary',busy)
   ),
   selectedParty?metric('الطرف المحدد',partyName(selectedParty)):null,
   table(['التاريخ','المرجع','رقم القيد','البيان','مدين','دائن',partyStatement.type==='vendor'?'الرصيد الدائن':'الرصيد المدين'],displayRows),
   h('div',{className:'text-sm font-bold text-slate-800'},(partyStatement.type==='vendor'?'الرصيد الدائن الختامي: ':'الرصيد المدين الختامي: ')+fmt(running)+' ج.م')
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
 const renderCash=()=>panel('سند قبض أو صرف','يؤثر على حساب الطرف والخزينة/البنك فقط بعد الاعتماد.',h('div',{className:'grid md:grid-cols-3 gap-3'},
  select('نوع الحركة',cash.direction,v=>setCash(o=>Object.assign({},o,{direction:v,partyType:v==='in'?'customer':'vendor',partyAccountCode:v==='in'?'1210':'281',partyId:''})),[{value:'in',label:'تحصيل عميل'},{value:'out',label:'سداد مورد'}]),
  field('التاريخ',cash.date,v=>setCash(o=>Object.assign({},o,{date:v})),'date'),field('المبلغ',cash.amount,v=>setCash(o=>Object.assign({},o,{amount:v})),'number'),
  partyPicker('الطرف',cash.direction==='in'?allClients:allVendors,cash.partyId,p=>setCash(o=>Object.assign({},o,{partyId:p.code||p.id})),cashPartySearch,setCashPartySearch,cash.direction==='in'?'customer':'vendor'),
  selectWithAdd('الخزينة أو البنك',cash.cashAccountCode,v=>setCash(o=>Object.assign({},o,{cashAccountCode:v})),[{value:'1110',label:'1110 — الخزينة'},{value:'1120',label:'1120 — البنوك'},...posting.filter(a=>a.code!=='1210'&&a.code!=='281'&&a.code!=='1300').map(a=>({value:a.code,label:a.code+' — '+a.name}))],'chartOfAccounts',{type:'asset',nature:'debit',parentCode:'11'}),
  field('رقم مرجع / شيك',cash.reference,v=>setCash(o=>Object.assign({},o,{reference:v}))),area('البيان',cash.description,v=>setCash(o=>Object.assign({},o,{description:v}))),
  button('حفظ وإرسال للمراجعة',submitCash,'primary',busy)
 ));
 const renderBank=()=>panel('استيراد كشف حساب البنك','Excel أو CSV. المكررات تعرض للمراجع بدل ترحيلها تلقائيًا.',h('div',{className:'space-y-3'},
  selectWithAdd('حساب البنك',bankAccount,v=>setBankAccount(v),[{value:'1120',label:'1120 — البنوك'},...rows(master.bankAccounts).map(x=>({value:x.accountCode||x.code,label:x.code+' — '+x.name}))],'bankAccounts',{accountCode:bankAccount}),
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
  const partyRows=[...allClients.map(p=>Object.assign({},p,{partyType:'customer'})),...allVendors.map(p=>Object.assign({},p,{partyType:'vendor'}))];
  const visibleParties=partyRows.filter(p=>!masterPartySearch||normalizeMatch([p.code,p.name,p.phone,p.taxNumber,p.partyType].join(' ')).includes(normalizeMatch(masterPartySearch)));
  const partyPanel=panel('دليل العملاء والموردين','الدليل مرتبط بسجلات العملاء والموردين المستخدمة في إدارة المشروعات، ويعرض الكود والاسم وبيانات البحث.',h('div',{className:'space-y-3'},
   h('div',{className:'flex flex-wrap gap-2'},button('＋ عميل جديد',()=>openQuickAdd('parties',null,{code:nextCode('CUS',allClients),partyType:'customer'}),'primary'),button('＋ مورد جديد',()=>openQuickAdd('parties',null,{code:nextCode('VND',allVendors),partyType:'vendor'}),'primary')),
   field('بحث بالكود أو الاسم أو الهاتف أو الرقم الضريبي',masterPartySearch,setMasterPartySearch),
   table(['النوع','الكود','الاسم','الهاتف','الرقم الضريبي','البريد الإلكتروني'],visibleParties.map(p=>h('tr',{key:p.partyType+'-'+(p.code||p.id),className:'border-t'},h('td',{className:'p-2'},p.partyType==='vendor'?'مورد':'عميل'),h('td',{className:'p-2 font-bold'},p.code||p.id),h('td',{className:'p-2'},partyName(p)),h('td',{className:'p-2'},p.phone||p.mobile||'—'),h('td',{className:'p-2'},p.taxNumber||'—'),h('td',{className:'p-2'},p.email||'—'))))
  ));
  const config=masterImportConfig[masterImportKind];
  const preview=masterImportRows.slice(0,12);
  const importPanel=panel('استيراد البيانات والأكواد من نموذج Excel / CSV','نزّل النموذج أولاً، أضف بياناتك بنفس عناوين الأعمدة، ثم ارفع الملف لمراجعته قبل الحفظ. الحد الأقصى 500 سجل في العملية الواحدة.',h('div',{className:'space-y-3'},
   h('div',{className:'grid md:grid-cols-3 gap-3 items-end'},
    select('نوع البيانات',masterImportKind,v=>{setMasterImportKind(v);setMasterImportRows([]);setMasterImportName('');},Object.keys(masterImportConfig).map(key=>({value:key,label:masterImportConfig[key].label}))),
    button('تنزيل نموذج '+config.label,downloadMasterTemplate,'muted'),
    h('label',{className:'block text-sm font-bold text-slate-700'},'رفع ملف Excel أو CSV',h('input',{type:'file',accept:'.xlsx,.xls,.csv',onChange:e=>parseMasterImport(e.target.files&&e.target.files[0]),className:'block mt-1 w-full rounded-lg border p-2 font-normal bg-white'}))
   ),
   masterImportName?h('p',{className:'text-xs text-slate-600'},'الملف: '+masterImportName):null,
   masterImportRows.length?panel('معاينة أول 12 صفًا','لن يتم حفظ أي سجل قبل الضغط على تنفيذ الاستيراد.',table(config.columns.map(x=>x==='code'?'الكود':x==='name'?'الاسم':x),preview.map((row,index)=>h('tr',{key:index,className:'border-t'},config.columns.map((key,i)=>h('td',{key,className:'p-2'},String(row[key]==null?'':row[key]))))))):null,
   masterImportRows.length?h('div',{className:'flex flex-wrap items-center gap-3'},h('b',{className:'text-sm'},'عدد السجلات: '+masterImportRows.length),button('تنفيذ الاستيراد',submitMasterImport,'primary',busy),button('إلغاء الملف',()=>{setMasterImportRows([]);setMasterImportName('');},'muted')):null
  ));
  return h('div',{className:'space-y-4'},partyPanel,importPanel);
 };
 const renderTax=()=>panel('تقارير الضرائب','ملخص الحسابات الضريبية من القيود المرحلة. نسب الضرائب الفعلية حسب إعدادات الشركة والتشريعات.',h('div',{className:'space-y-3'},
  h('div',{className:'grid md:grid-cols-3 gap-3'},metric('ضريبة مدخلات',fmt((balances['1410']||{}).debit-(balances['1410']||{}).credit)+' ج.م'),metric('ضريبة مخرجات',fmt((balances['2110']||{}).credit-(balances['2110']||{}).debit)+' ج.م'),metric('صافي الضريبة',fmt(((balances['2110']||{}).credit-(balances['2110']||{}).debit)-((balances['1410']||{}).debit-(balances['1410']||{}).credit))+' ج.م')),
  table(['الكود','اسم الضريبة','النوع','النسبة','بداية السريان'],rows(master.taxCodes).map(x=>h('tr',{key:x.code},h('td',{className:'p-2'},x.code),h('td',{className:'p-2'},x.name),h('td',{className:'p-2'},x.taxType),h('td',{className:'p-2'},x.rate),h('td',{className:'p-2'},x.effectiveFrom))))
 ));
 const renderReports=()=>panel('القوائم والتقارير المالية','يتم استخراج الأرقام من دفتر الأستاذ المرحّل فقط. المركز المالي يحتاج أرصدة افتتاحية معتمدة.',h('div',{className:'space-y-3'},
  h('div',{className:'grid md:grid-cols-4 gap-3'},field('من شهر',period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),field('إلى شهر',period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),select('التقرير',report,v=>setReport(v),[{value:'trial',label:'ميزان المراجعة'},{value:'income',label:'قائمة الدخل'},{value:'balance',label:'المركز المالي'},{value:'cashflow',label:'التدفقات النقدية'},{value:'ledger',label:'دفتر الأستاذ'}]),button('تحديث',loadPeriod,'primary')),
  report==='trial'?table(['الحساب','الاسم','مدين','دائن','رصيد مدين','رصيد دائن'],trial.map(x=>{const v=x.amount.debit-x.amount.credit;return h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code),h('td',{className:'p-2'},x.account.name),h('td',{className:'p-2'},fmt(x.amount.debit)),h('td',{className:'p-2'},fmt(x.amount.credit)),h('td',{className:'p-2'},fmt(Math.max(v,0))),h('td',{className:'p-2'},fmt(Math.max(-v,0))));})):null,
  report==='income'?table(['البند','القيمة'],trial.filter(x=>['revenue','expense'].includes(x.account.type)).map(x=>h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code+' — '+x.account.name),h('td',{className:'p-2'},fmt(x.account.type==='revenue'?x.amount.credit-x.amount.debit:x.amount.debit-x.amount.credit)))).concat([h('tr',{key:'net',className:'font-bold bg-slate-50'},h('td',{className:'p-2'},'صافي الربح / الخسارة'),h('td',{className:'p-2'},fmt(profit)))])):null,
  report==='balance'?table(['البند','القيمة'],[['الأصول',assets],['الالتزامات',liabilities],['حقوق الملكية مع نتيجة الفترة',equity],['إجمالي الالتزامات وحقوق الملكية',liabilities+equity]].map((x,i)=>h('tr',{key:i},h('td',{className:'p-2'},x[0]),h('td',{className:'p-2'},fmt(x[1]))))):null,
  report==='cashflow'?table(['الحساب النقدي','مدين','دائن','صافي الحركة'],cashAccounts.map(x=>h('tr',{key:x.account.code},h('td',{className:'p-2'},x.account.code+' — '+x.account.name),h('td',{className:'p-2'},fmt(x.amount.debit)),h('td',{className:'p-2'},fmt(x.amount.credit)),h('td',{className:'p-2'},fmt(x.amount.debit-x.amount.credit))))):null,
  report==='ledger'?h('div',null,field('بحث في الحساب أو البيان',search,setSearch),table(['التاريخ','القيد','الحساب','البيان','مدين','دائن','مركز التكلفة'],flat.filter(x=>!search||[x.accountCode,x.description,x.journalId].join(' ').toLowerCase().includes(search.toLowerCase())).map((x,i)=>h('tr',{key:i},h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.journalId),h('td',{className:'p-2'},x.accountCode),h('td',{className:'p-2'},x.description),h('td',{className:'p-2'},fmt(x.debit)),h('td',{className:'p-2'},fmt(x.credit)),h('td',{className:'p-2'},x.costCenterId||'—'))))):null,
  button('تصدير ميزان المراجعة CSV',()=>dl('financial-trial-balance.csv',[['Code','Account','Debit','Credit'],...trial.map(x=>[x.account.code,x.account.name,x.amount.debit,x.amount.credit])].map(x=>x.join(',')).join('\n')))
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
   fields.push(field('وحدة القياس',quickAddForm.unit,function(v){change('unit',v);}));
   fields.push(selectWithAdd('مجموعة الصنف',quickAddForm.groupCode,function(v){change('groupCode',v);},[{value:'',label:'بدون مجموعة'}].concat(rows(master.itemGroups).map(function(x){return {value:x.code,label:x.code+' — '+x.name};})),'itemGroups'));
   fields.push(field('الإصدار / Version',quickAddForm.version,function(v){change('version',v);}));
   fields.push(field('كود المخزن',quickAddForm.warehouseCode,function(v){change('warehouseCode',v);}));
  }
  if(quickAddType==='taxCodes'){
   fields.push(select('نوع الضريبة',quickAddForm.taxType,function(v){change('taxType',v);},[{value:'vat_input',label:'قيمة مضافة مدخلات'},{value:'vat_output',label:'قيمة مضافة مخرجات'},{value:'withholding',label:'خصم/استقطاع'},{value:'addition',label:'إضافة'}]));
   fields.push(field('النسبة %',quickAddForm.rate,function(v){change('rate',v);},'number'));
   fields.push(field('بداية السريان',quickAddForm.effectiveFrom,function(v){change('effectiveFrom',v);},'date'));
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