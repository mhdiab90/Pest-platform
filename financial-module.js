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
 const [masterForm,setMasterForm]=React.useState({kind:'chartOfAccounts',code:'',name:'',type:'asset',nature:'debit',parentCode:'',isGroup:false,subledgerType:'',unit:'قطعة',groupCode:'',version:'',projectCode:'',warehouseCode:'default',taxType:'vat',rate:'0',effectiveFrom:today()});
 const [journal,setJournal]=React.useState({id:'',date:today(),description:'',reference:'',currency:'EGP',lines:[{accountCode:'6100',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''},{accountCode:'1110',description:'',debit:'',credit:'',costCenterId:'',partyType:'',partyId:''}]});
 const [invoice,setInvoice]=React.useState({id:'',type:'purchase',date:today(),number:'',partyId:'',partyName:'',currency:'EGP',taxRate:'',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});
 const [invoiceFile,setInvoiceFile]=React.useState(null),[cash,setCash]=React.useState({direction:'in',date:today(),amount:'',description:'',reference:'',partyType:'customer',partyId:'',cashAccountCode:'1110',partyAccountCode:'1210'});
 const [bankFile,setBankFile]=React.useState(null),[bankRows,setBankRows]=React.useState([]),[bankAccount,setBankAccount]=React.useState('1120');
 const [search,setSearch]=React.useState('');
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
 const parties=invoice.type==='purchase'?vendors:clients;
 const partyName=p=>p.name||p.companyName||p.legalName||p.code||p.id;
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
  setBusy(true);setError('');try{
   const party=parties.find(x=>(x.code||x.id)===invoice.partyId);
   const payload=Object.assign({},invoice,{partyName:party?partyName(party):invoice.partyName,lines:invoice.lines.map(x=>Object.assign({},x,{quantity:n(x.quantity),unitPrice:n(x.unitPrice),discount:n(x.discount)}))});
   const result=await api('', 'POST',Object.assign({action:'submitInvoice'},payload));
   if(invoiceFile){try{const uploadResult=await upload(invoiceFile,result.id);const attachment=uploadResult.attachment||uploadResult;await api('', 'POST',{action:'addAttachment',documentId:result.id,attachment});}catch(e){setNotice('تم تسجيل الفاتورة لكن تعذر رفع المرفق أو ربطه: '+e.message);}}
   setNotice(result.status==='pending_review'?'تم إرسال الفاتورة للمراجعة':('الفاتورة محفوظة وتحتاج تعديل: '+(result.errors||[]).join('، ')));
   if(result.status==='pending_review'){setInvoice({id:'',type:invoice.type,date:today(),number:'',partyId:'',partyName:'',currency:'EGP',taxRate:'',taxAmount:'',discount:'',projectCode:'',lines:[{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}]});setInvoiceFile(null);}
   else setInvoice(o=>Object.assign({},o,{id:result.id}));
   await refresh();
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 };
 const readImage=async file=>{
  setInvoiceFile(file);if(!file||!file.type.startsWith('image/'))return;
  setBusy(true);setError('');
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});const r=await api('', 'POST',{action:'ocr',image:data});const x=r.extracted||{};setInvoice(o=>Object.assign({},o,{type:x.type==='sales'?'sales':o.type,number:x.number||o.number,date:x.date||o.date,partyName:x.partyName||o.partyName,taxAmount:x.taxAmount==null?o.taxAmount:String(x.taxAmount),lines:Array.isArray(x.items)&&x.items.length?x.items.map(y=>({description:y.description||'',kind:'stock',itemCode:'',quantity:String(y.quantity||1),unit:y.unit||'قطعة',unitPrice:String(y.unitPrice||''),discount:String(y.discount||''),accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'})):o.lines}));setNotice('تم استخراج بيانات مبدئية. راجع كل بند واربطه بكود مخزني أو اختره كخدمة.');}
  catch(e){setError('تعذرت قراءة الصورة آليًا: '+e.message+' ويمكنك استكمال البيانات يدويًا.');}finally{setBusy(false);}
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
 const editDoc=doc=>{
  setSelected(null);
  if(doc.type==='journal'){setJournal({id:doc.id,date:doc.date,description:doc.description||'',reference:doc.reference||'',currency:doc.currency||'EGP',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setTab('journal');}
  else if(doc.type==='invoice'){setInvoice({id:doc.id,type:doc.invoiceType||(doc.type==='purchase'?'purchase':'sales'),date:doc.date,number:doc.number,partyId:doc.partyId,partyName:doc.partyName,currency:doc.currency||'EGP',taxRate:String(doc.taxRate||''),taxAmount:doc.taxAmount==null?'':String(doc.taxAmount),discount:String(doc.discount||''),projectCode:doc.projectCode||'',lines:(doc.lines||[]).map(x=>Object.assign({},x))});setTab('invoices');}
 };
 const nav=[
 ['overview','ملخص مالي'],['journal','القيود اليومية'],['review','المراجعة والاعتماد'],['invoices','فواتير العملاء والموردين'],['partyStatements','كشف حساب عميل / مورد'],['accounts','دليل الحسابات'],['centers','مراكز التكلفة'],['inventory','المخزون والأكواد'],['cash','الخزينة والتحصيل والسداد'],['bank','كشوف البنوك'],['tax','الضرائب'],['reports','القوائم المالية']
 ];
 const renderOverview=()=>h('div',{className:'space-y-4'},
  h('div',{className:'grid grid-cols-2 xl:grid-cols-4 gap-3'},metric('إجمالي المدين',fmt(trial.reduce((s,x)=>s+x.amount.debit,0))+' ج.م'),metric('إجمالي الدائن',fmt(trial.reduce((s,x)=>s+x.amount.credit,0))+' ج.م'),metric('صافي الربح / الخسارة',fmt(profit)+' ج.م'),metric('بانتظار المراجعة',String(review.length))),
  h('div',{className:'flex flex-wrap gap-2 items-end'},field('من شهر',period.from,v=>setPeriod(o=>Object.assign({},o,{from:v})),'month'),field('إلى شهر',period.to,v=>setPeriod(o=>Object.assign({},o,{to:v})),'month'),button('تحديث التقارير',loadPeriod,'primary')),
  panel('الأداء المالي','يعتمد الملخص على القيود المرحّلة بالفترة المحددة.',h('div',{className:'grid md:grid-cols-4 gap-3'},metric('الإيرادات',fmt(revenue)+' ج.م'),metric('المصروفات',fmt(expenses)+' ج.م'),metric('الأصول',fmt(assets)+' ج.م'),metric('الالتزامات',fmt(liabilities)+' ج.م'))),
  panel('المستندات الأخيرة','',table(['المستند','النوع','التاريخ','الحالة'],documents.slice(0,12).map(x=>h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.title||x.number||x.id),h('td',{className:'p-2'},x.type),h('td',{className:'p-2'},x.date||'—'),h('td',{className:'p-2'},status(x.status))))))
 );
 const renderJournal = function() {
  const lineCards = journal.lines.map(function(line,index) {
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl bg-slate-50 p-3 border'},
    h('div',{className:'md:col-span-3'},select('الحساب',line.accountCode,function(v){updateJ(index,'accountCode',v);},posting.map(function(a){return {value:a.code,label:a.code+' — '+a.name};}))),
    h('div',{className:'md:col-span-2'},field('البيان',line.description,function(v){updateJ(index,'description',v);})),
    h('div',{className:'md:col-span-1'},field('مدين',line.debit,function(v){updateJ(index,'debit',v);},'number')),
    h('div',{className:'md:col-span-1'},field('دائن',line.credit,function(v){updateJ(index,'credit',v);},'number')),
    h('div',{className:'md:col-span-2'},select('مركز التكلفة',line.costCenterId,function(v){updateJ(index,'costCenterId',v);},[{value:'',label:'بدون'}].concat(centers.map(function(x){return {value:x.code,label:x.code+' — '+x.name};})))),
    h('div',{className:'md:col-span-2'},select('الطرف التحليلي',(line.partyType||'')+'|'+(line.partyId||''),function(v){const parts=v.split('|');updateJ(index,'partyType',parts[0]);updateJ(index,'partyId',parts[1]);},[{value:'|',label:'بدون'}].concat(clients.map(function(x){return {value:'customer|'+(x.code||x.id),label:'عميل '+partyName(x)};}),vendors.map(function(x){return {value:'vendor|'+(x.code||x.id),label:'مورد '+partyName(x)};})))),
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
   select(invoice.type==='purchase'?'المورد':'العميل',invoice.partyId,function(v){const p=parties.find(function(x){return (x.code||x.id)===v;});setInvoice(function(old){return Object.assign({},old,{partyId:v,partyName:p?partyName(p):''});});},[{value:'',label:'اختر الطرف'}].concat(parties.map(function(p){return {value:p.code||p.id,label:partyName(p)+' ('+(p.code||p.id)+')'};}))),
   select('المشروع المرتبط',invoice.projectCode,function(v){setInvoice(function(old){return Object.assign({},old,{projectCode:v});});},[{value:'',label:'بدون مشروع'}].concat(projects.map(function(p){return {value:p.code||p.id,label:(p.name||p.code)+' ('+(p.code||p.id)+')'};}))),
   field('نسبة الضريبة %',invoice.taxRate,function(v){setInvoice(function(old){return Object.assign({},old,{taxRate:v,taxAmount:''});});},'number'),
   field('الضريبة (قيمة ثابتة اختيارية)',invoice.taxAmount,function(v){setInvoice(function(old){return Object.assign({},old,{taxAmount:v});});},'number'),
   field('خصم الفاتورة',invoice.discount,function(v){setInvoice(function(old){return Object.assign({},old,{discount:v});});},'number'),
   h('label',{className:'block text-sm font-bold'},'صورة / PDF الفاتورة',h('input',{type:'file',accept:'image/*,application/pdf',onChange:function(e){const file=e.target.files&&e.target.files[0];if(file)readImage(file);},className:'block mt-1 text-sm'}))
  );
  const invoiceHead = panel('بيانات الفاتورة','صورة الفاتورة تساعد في استخراج البيانات. راجعها بنفسك قبل الإرسال للمراجعة.',headFields);
  const invoiceRows = invoice.lines.map(function(line,index) {
   const itemOptions=[{value:'',label:'اختر الصنف'}].concat(items.map(function(x){return {value:x.code,label:x.code+' — '+x.name+' '+(x.version||'')};}));
   const accountOptions=posting.map(function(a){return {value:a.code,label:a.code+' — '+a.name};});
   const centerOptions=[{value:'',label:'بدون'}].concat(centers.map(function(x){return {value:x.code,label:x.code+' — '+x.name};}));
   return h('div',{key:index,className:'grid grid-cols-1 md:grid-cols-12 gap-2 p-3 border bg-slate-50 rounded-xl'},
    h('div',{className:'md:col-span-3'},field('وصف البند',line.description,function(v){updateI(index,'description',v);})),
    h('div',{className:'md:col-span-2'},select('النوع',line.kind,function(v){updateI(index,'kind',v);},[{value:'stock',label:'صنف مخزني'},{value:'service',label:'خدمة / مصروف'}])),
    h('div',{className:'md:col-span-2'},line.kind==='stock'?select('كود الصنف',line.itemCode,function(v){updateI(index,'itemCode',v);},itemOptions):select('الحساب',line.accountCode,function(v){updateI(index,'accountCode',v);},accountOptions)),
    h('div',{className:'md:col-span-1'},field('الكمية',line.quantity,function(v){updateI(index,'quantity',v);},'number')),
    h('div',{className:'md:col-span-1'},field('السعر',line.unitPrice,function(v){updateI(index,'unitPrice',v);},'number')),
    h('div',{className:'md:col-span-1'},field('الخصم',line.discount,function(v){updateI(index,'discount',v);},'number')),
    h('div',{className:'md:col-span-1'},select('مركز التكلفة',line.costCenterId,function(v){updateI(index,'costCenterId',v);},centerOptions)),
    h('div',{className:'md:col-span-1 flex items-end'},button('حذف',function(){setInvoice(function(old){return Object.assign({},old,{lines:old.lines.filter(function(x,j){return j!==index;})});});},'danger'))
   );
  });
  const addInvoiceLine = button('إضافة بند',function(){setInvoice(function(old){return Object.assign({},old,{lines:old.lines.concat([{description:'',kind:'stock',itemCode:'',quantity:'1',unit:'قطعة',unitPrice:'',discount:'',accountCode:'6100',incomeAccountCode:'4100',costCenterId:'',warehouseCode:'default'}])});});});
  const invoiceLines = panel('بنود الفاتورة','اختر صنفًا موجودًا أو صنف البند كخدمة/مصروف.',h('div',{className:'space-y-3'},...invoiceRows,addInvoiceLine));
  const totalsBox = h('div',{className:'flex flex-wrap items-center gap-4 p-3 bg-white border rounded-xl'},h('b',null,'الصافي: '+fmt(net)),h('b',null,'الضريبة: '+fmt(tax)),h('b',null,'الإجمالي: '+fmt(total)),button('حفظ وإرسال للمراجعة',submitInvoice,'primary',busy));
  const correctionRows=documents.filter(function(x){return x.type==='invoice'&&['needs_correction','draft'].includes(x.status);}).map(function(x){
   return h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.number||x.id),h('td',{className:'p-2'},x.partyName),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2'},button('تعديل',function(){editDoc(x);},'muted')));
  });
  const correctionPanel = panel('فواتير تحتاج تصحيح','',table(['الفاتورة','الطرف','التاريخ','الحالة','إجراء'],correctionRows));
  return h('div',{className:'space-y-4'},invoiceHead,invoiceLines,totalsBox,correctionPanel);
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
    masterForm.kind==='items'?field('كود المجموعة',masterForm.groupCode,v=>setMasterForm(o=>Object.assign({},o,{groupCode:v}))):null,
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
  const list=partyStatement.type==='customer'?clients:vendors;
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
    select('الطرف',partyStatement.id,function(v){setPartyStatement(function(old){return Object.assign({},old,{id:v});});},[{value:'',label:'اختر الطرف'}].concat(list.map(function(p){return {value:p.code||p.id,label:partyName(p)+' ('+(p.code||p.id)+')'};}))),
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
   selected.type==='bankLine'?select('الحساب المقابل',offset,v=>setOffset(v),posting.map(a=>({value:a.code,label:a.code+' — '+a.name}))):null,
   selected.type==='bankLine'?button('حفظ الحساب المقابل',async()=>{try{await api('', 'POST',{action:'setBankOffset',id:selected.id,offsetAccountCode:offset});setNotice('تم حفظ الحساب المقابل');}catch(e){setError(e.message);}}):null,
   h('div',{className:'flex flex-wrap gap-2'},button('اعتماد وترحيل',()=>reviewAction(selected.status==='duplicate_review'?'approveDuplicate':'approve'),'success',busy),button('إعادة للتصحيح',()=>reviewAction('return'),'muted',busy),button('رفض',()=>reviewAction('reject'),'danger',busy))
  ):table(['المستند','النوع','التاريخ','الطرف','المبلغ','الحالة','مراجعة'],review.map(x=>h('tr',{key:x.id,className:'border-t'},h('td',{className:'p-2'},x.title||x.id),h('td',{className:'p-2'},x.type),h('td',{className:'p-2'},x.date),h('td',{className:'p-2'},x.partyName||'—'),h('td',{className:'p-2'},fmt(x.total||x.amount||0)),h('td',{className:'p-2'},status(x.status)),h('td',{className:'p-2'},button('فتح',()=>{setSelected(documents.find(d=>d.id===x.id)||x);setOffset('6100');}))))));
 const renderCash=()=>panel('سند قبض أو صرف','يؤثر على حساب الطرف والخزينة/البنك فقط بعد الاعتماد.',h('div',{className:'grid md:grid-cols-3 gap-3'},
  select('نوع الحركة',cash.direction,v=>setCash(o=>Object.assign({},o,{direction:v,partyType:v==='in'?'customer':'vendor',partyAccountCode:v==='in'?'1210':'281',partyId:''})),[{value:'in',label:'تحصيل عميل'},{value:'out',label:'سداد مورد'}]),
  field('التاريخ',cash.date,v=>setCash(o=>Object.assign({},o,{date:v})),'date'),field('المبلغ',cash.amount,v=>setCash(o=>Object.assign({},o,{amount:v})),'number'),
  select('الطرف',cash.partyId,v=>setCash(o=>Object.assign({},o,{partyId:v})),[{value:'',label:'اختر الطرف'},...(cash.direction==='in'?clients:vendors).map(p=>({value:p.code||p.id,label:partyName(p)}))]),
  select('الخزينة أو البنك',cash.cashAccountCode,v=>setCash(o=>Object.assign({},o,{cashAccountCode:v})),[{value:'1110',label:'1110 — الخزينة'},{value:'1120',label:'1120 — البنوك'},...posting.filter(a=>a.code!=='1210'&&a.code!=='281'&&a.code!=='1300').map(a=>({value:a.code,label:a.code+' — '+a.name}))]),
  field('رقم مرجع / شيك',cash.reference,v=>setCash(o=>Object.assign({},o,{reference:v}))),area('البيان',cash.description,v=>setCash(o=>Object.assign({},o,{description:v}))),
  button('حفظ وإرسال للمراجعة',submitCash,'primary',busy)
 ));
 const renderBank=()=>panel('استيراد كشف حساب البنك','Excel أو CSV. المكررات تعرض للمراجع بدل ترحيلها تلقائيًا.',h('div',{className:'space-y-3'},
  select('حساب البنك',bankAccount,v=>setBankAccount(v),[{value:'1120',label:'1120 — البنوك'},...rows(master.bankAccounts).map(x=>({value:x.accountCode||x.code,label:x.code+' — '+x.name}))]),
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
 let content=null;
 if(tab==='overview')content=renderOverview();
 if(tab==='journal')content=renderJournal();
 if(tab==='review')content=renderReview();
 if(tab==='invoices')content=renderInvoices();
 if(tab==='partyStatements')content=renderPartyStatements();
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
  noticeElement,content,busy?h('p',{className:'text-xs text-slate-500'},'جارٍ تحميل البيانات...'):null,
  h('p',{className:'text-xs text-slate-400'},'الأرصدة القديمة في متابعة المشروعات والعهد لا تُنقل تلقائيًا إلى الحسابات. يلزم إعداد واعتماد الأرصدة الافتتاحية.'))
}
window.PEST_FINANCE_MODULE=FinanceModule;
})();