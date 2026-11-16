(function(){
  'use strict';
  const h = React.createElement;
  const cx = (...parts) => parts.filter(Boolean).join(' ');
  const clean = value => String(value == null ? '' : value).trim();
  const asArray = value => Array.isArray(value) ? value : [];
  const rowsFrom = value => value ? Object.keys(value).map(key => Object.assign({id:key}, value[key] || {})) : [];
  const today = () => new Date().toISOString().slice(0,10);
  const dateMs = value => { const n=Date.parse(String(value||'')); return Number.isFinite(n)?n:0; };
  const norm = value => clean(value).toLowerCase().replace(/[\s\u064B-\u065F\u0640]+/g,'');
  const fmt = (value,currency) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value)||0)+' '+(currency||'EGP');
  const download = (name, content, mime) => {
    const blob=new Blob([content],{type:mime||'application/octet-stream'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  const stages = [
    ['preview','معاينة / استكشاف','Preview'],
    ['quotation','عرض سعر','Quotation'],
    ['installation','تركيب / تنفيذ','Installation'],
    ['maintenance','صيانة','Maintenance']
  ];
  const offerStates = [
    ['pending','قيد المتابعة','Pending / Follow-up'],
    ['purchased','تم الشراء','Purchased'],
    ['rejected','مرفوض','Rejected'],
    ['installed','تم التركيب','Installed']
  ];
  const rejectionReasons = [
    ['price','السعر أعلى من المنافس','Price higher than competitor'],
    ['timing','التوقيت غير مناسب','Timing not appropriate'],
    ['competitor','العميل اختار موردًا آخر','Client chose another supplier'],
    ['postponed','المشروع مؤجل','Project postponed'],
    ['no_need','لا توجد حاجة حالية','No current need'],
    ['payment','شروط السداد غير مناسبة','Payment terms'],
    ['other','أخرى','Other']
  ];
  const emptyCustomer = () => ({companyName:'',contactPerson:'',jobTitle:'',department:'',phone:'',email:'',sector:'',tags:'',stage:'preview',nextFollowUpDate:'',nextFollowUpTime:'',notes:'',pinned:false});
  const emptySupplier = () => ({companyName:'',contactPerson:'',category:'',tags:'',phone:'',email:'',notes:'',pinned:false});
  const emptyOffer = () => ({name:'',number:'',customerId:'',supplierIds:[],amount:'',currency:'EGP',date:today(),status:'pending',rejectionReason:'',notes:''});
  const button = (label,onClick,variant,disabled) => h('button',{type:'button',onClick: onClick,disabled:!!disabled,className:cx('rounded-lg px-3 py-2 text-sm font-bold border transition',variant==='primary'?'bg-blue-600 text-white border-blue-600 hover:bg-blue-700':variant==='danger'?'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100':variant==='success'?'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700':'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')},label);
  const input = (label,value,onChange,opts) => {
    const o=opts||{};
    return h('label',{className:cx('block text-xs font-bold text-slate-700',o.className)},
      h('span',{className:'block mb-1'},label),
      h('input',{type:o.type||'text',value:value==null?'':value,onChange:e=>onChange(e.target.value),placeholder:o.placeholder||'',required:!!o.required,min:o.min,max:o.max,step:o.step,className:'w-full min-w-0 border border-slate-200 rounded-lg p-2.5 text-sm font-normal bg-white',dir:o.dir||'auto'})
    );
  };
  const textarea = (label,value,onChange,opts) => h('label',{className:cx('block text-xs font-bold text-slate-700',opts&&opts.className)},
    h('span',{className:'block mb-1'},label),
    h('textarea',{rows:(opts&&opts.rows)||3,value:value||'',onChange:e=>onChange(e.target.value),className:'w-full border border-slate-200 rounded-lg p-2.5 text-sm font-normal bg-white',placeholder:opts&&opts.placeholder||''})
  );
  const select = (label,value,onChange,options,opts) => h('label',{className:cx('block text-xs font-bold text-slate-700',opts&&opts.className)},
    h('span',{className:'block mb-1'},label),
    h('select',{value:value==null?'':value,onChange:e=>onChange(e.target.value),className:'w-full border border-slate-200 rounded-lg p-2.5 text-sm font-normal bg-white'},
      options.map(item=>h('option',{key:item[0],value:item[0]},item[1]))
    )
  );
  const metric = (label,value,caption) => h('section',{className:'rounded-xl border border-slate-200 bg-white p-3 shadow-sm min-w-0'},
    h('div',{className:'text-xs text-slate-500'},label),
    h('strong',{className:'block text-2xl font-extrabold text-slate-900 mt-1',dir:'auto'},value),
    caption?h('div',{className:'text-[11px] text-slate-400 mt-1'},caption):null
  );

  function PestCrmModule(props){
    const db=props.db, user=props.currentUser, rtl=!!props.rtl, can=props.can||(()=>false);
    const uid=user&&user.uid||'';
    const isAdmin=user&&user.role==='admin';
    const t=(ar,en)=>rtl?ar:en;
    const [section,setSection]=React.useState('overview');
    const [customers,setCustomers]=React.useState([]);
    const [suppliers,setSuppliers]=React.useState([]);
    const [offers,setOffers]=React.useState([]);
    const [visits,setVisits]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [notice,setNotice]=React.useState('');
    const [search,setSearch]=React.useState('');
    const [stageFilter,setStageFilter]=React.useState('all');
    const [sectorFilter,setSectorFilter]=React.useState('all');
    const [followFilter,setFollowFilter]=React.useState('all');
    const [period,setPeriod]=React.useState('month');
    const [fromDate,setFromDate]=React.useState('');
    const [toDate,setToDate]=React.useState('');
    const [usdRate,setUsdRate]=React.useState('50');
    const [customerForm,setCustomerForm]=React.useState(emptyCustomer());
    const [editingCustomer,setEditingCustomer]=React.useState('');
    const [customerFormOpen,setCustomerFormOpen]=React.useState(false);
    const [supplierForm,setSupplierForm]=React.useState(emptySupplier());
    const [editingSupplier,setEditingSupplier]=React.useState('');
    const [supplierFormOpen,setSupplierFormOpen]=React.useState(false);
    const [offerForm,setOfferForm]=React.useState(emptyOffer());
    const [editingOffer,setEditingOffer]=React.useState('');
    const [offerFormOpen,setOfferFormOpen]=React.useState(false);
    const [selectedCustomer,setSelectedCustomer]=React.useState('');
    const [visitForm,setVisitForm]=React.useState({date:today(),time:'',notes:'',followUpDate:'',followUpTime:'',outcome:''});
    const [visitBusy,setVisitBusy]=React.useState(false);
    const [importBusy,setImportBusy]=React.useState(false);
    const [showAll,setShowAll]=React.useState(false);
    const [reportCurrency,setReportCurrency]=React.useState('EGP');

    const canAdd=can('pestCrm','add');
    const canEdit=can('pestCrm','edit');
    const canDelete=can('pestCrm','delete');
    const canExport=can('pestCrm','export');
    const canViewOthers=can('pestCrm','viewOthers')||isAdmin;
    const inScope=record=>canViewOthers||record.createdBy===uid||record.ownerUid===uid;
    const scopedCustomers=customers.filter(inScope);
    const scopedSuppliers=suppliers.filter(inScope);
    const scopedOffers=offers.filter(inScope);
    const scopedVisits=visits.filter(inScope);

    React.useEffect(()=>{
      if(!db||!uid){setLoading(false);setNotice(t('تعذر تحديد مستخدم قاعدة البيانات.','Could not identify the signed-in database user.'));return;}
      if(!can('pestCrm','view')){setLoading(false);setNotice(t('ليس لديك صلاحية عرض CRM. راجع مدير النظام.','You do not have CRM view permission. Contact your administrator.'));return;}
      const refs=[];
      const listen=(path,setter,mapper)=>{
        const ref=db.ref(path);
        const handler=snapshot=>setter(mapper?mapper(snapshot.val()):rowsFrom(snapshot.val()));
        ref.on('value',handler,error=>{
          console.error('PEST CRM listener '+path,error);
          setNotice(t('تعذر قراءة بيانات CRM. راجع صلاحيات قاعدة البيانات (Firebase Rules).','Could not read CRM data. Check the Firebase Database Rules.')+' '+String(error&&error.message||''));
        });
        refs.push(()=>ref.off('value',handler));
      };
      setLoading(true);
      listen('pestCrm/customers',setCustomers);
      listen('pestCrm/suppliers',setSuppliers);
      listen('pestCrm/offers',setOffers);
      listen('pestCrm/visits',setVisits,value=>{
        const output=[];
        Object.keys(value||{}).forEach(customerId=>Object.keys(value[customerId]||{}).forEach(id=>output.push(Object.assign({id,customerId},value[customerId][id]||{}))));
        return output;
      });
      const timer=setTimeout(()=>setLoading(false),650);
      return ()=>{clearTimeout(timer);refs.forEach(fn=>fn());};
    },[db,uid,can('pestCrm','view')]);

    React.useEffect(()=>{
      if(!window.PEST_NATIVE||typeof window.PEST_NATIVE.scheduleReminder!=='function')return;
      const now=Date.now();
      scopedCustomers.forEach(customer=>{
        const raw=(customer.nextFollowUpDate||'')+(customer.nextFollowUpTime?'T'+customer.nextFollowUpTime:'T09:00');
        const at=dateMs(raw);
        if(at>now&&at<now+31*86400000){
          const id=hashId('followup:'+customer.id);
          window.PEST_NATIVE.scheduleReminder({id:id,title:t('متابعة عميل: ','Customer follow-up: ')+(customer.companyName||''),body:customer.contactPerson||customer.phone||'',at:at}).catch(error=>console.warn('CRM notification:',error));
        }
      });
    },[customers]);

    function hashId(value){let hash=0;for(let i=0;i<value.length;i++)hash=((hash<<5)-hash+value.charCodeAt(i))|0;return Math.abs(hash%2000000000)+1;}
    function audit(action,entityType,entityId){
      const record={id:db.ref('pestCrm/auditLogs').push().key,uid:uid,userName:user.fullName||user.username||user.email||uid,action:action,entityType:entityType,entityId:entityId||'',createdAt:Date.now()};
      db.ref('pestCrm/auditLogs/'+record.id).set(record).catch(error=>console.warn('CRM audit log:',error));
      if(typeof props.addLog==='function')props.addLog('PEST CRM: '+action,user,{entityType:entityType,entityId:entityId||''});
    }
    function mayEdit(record){return canEdit&&(isAdmin||can('pestCrm','manage')||record.createdBy===uid||record.ownerUid===uid);}
    function mayDelete(record){return canDelete&&(isAdmin||can('pestCrm','manage')||record.createdBy===uid||record.ownerUid===uid);}
    async function writeRecord(path,form,old,idField){
      const now=Date.now();
      const record=Object.assign({},form,{id:old&&old.id||form.id,createdAt:old&&old.createdAt||now,createdBy:old&&old.createdBy||uid,createdByName:old&&old.createdByName||user.fullName||user.username||user.email||uid,updatedAt:now,updatedBy:uid});
      await db.ref(path+'/'+record.id).set(record);
      return record;
    }
    function startCustomerEdit(record){
      setEditingCustomer(record.id);
      setCustomerForm(Object.assign(emptyCustomer(),record,{tags:asArray(record.tags).join(', ')}));
      setCustomerFormOpen(true);setSection('customers');
    }
    function startSupplierEdit(record){
      setEditingSupplier(record.id);
      setSupplierForm(Object.assign(emptySupplier(),record,{tags:asArray(record.tags).join(', ')}));
      setSupplierFormOpen(true);setSection('suppliers');
    }
    function startOfferEdit(record){
      setEditingOffer(record.id);
      setOfferForm(Object.assign(emptyOffer(),record,{supplierIds:asArray(record.supplierIds)}));
      setOfferFormOpen(true);setSection('offers');
    }
    async function saveCustomer(event){
      event.preventDefault();
      if(!canAdd&&!editingCustomer){setNotice(t('لا تملك صلاحية الإضافة.','You do not have add permission.'));return;}
      const name=clean(customerForm.companyName);
      if(!name){setNotice(t('اسم الشركة مطلوب.','Company name is required.'));return;}
      const phone=clean(customerForm.phone).replace(/[^\d+]/g,'');
      const duplicate=scopedCustomers.find(item=>item.id!==editingCustomer&&((phone&&clean(item.phone).replace(/[^\d+]/g,'')===phone)||norm(item.companyName)===norm(name)));
      if(duplicate&&!window.confirm(t('يوجد سجل مشابه: ','A possible duplicate exists: ')+(duplicate.companyName||'')+t('. هل تريد الحفظ رغم ذلك؟',' . Save anyway?'))){return;}
      try{
        const id=editingCustomer||db.ref('pestCrm/customers').push().key;
        const form=Object.assign({},customerForm,{companyName:name,phone:phone,tags:clean(customerForm.tags).split(',').map(x=>x.trim()).filter(Boolean)});
        const record=await writeRecord('pestCrm/customers',form,customers.find(x=>x.id===editingCustomer),id);
        setCustomerForm(emptyCustomer());setEditingCustomer('');setCustomerFormOpen(false);setNotice(t('تم حفظ بيانات العميل.','Customer saved.'));
        audit(editingCustomer?'تعديل عميل':'إضافة عميل','customer',record.id);
      }catch(error){setNotice(t('فشل حفظ العميل: ','Could not save customer: ')+String(error&&error.message||error));}
    }
    async function saveSupplier(event){
      event.preventDefault();
      if(!canAdd&&!editingSupplier)return;
      if(!clean(supplierForm.companyName)){setNotice(t('اسم المورد مطلوب.','Supplier name is required.'));return;}
      try{
        const id=editingSupplier||db.ref('pestCrm/suppliers').push().key;
        const form=Object.assign({},supplierForm,{companyName:clean(supplierForm.companyName),tags:clean(supplierForm.tags).split(',').map(x=>x.trim()).filter(Boolean)});
        const record=await writeRecord('pestCrm/suppliers',form,suppliers.find(x=>x.id===editingSupplier),id);
        setSupplierForm(emptySupplier());setEditingSupplier('');setSupplierFormOpen(false);setNotice(t('تم حفظ بيانات المورد.','Supplier saved.'));
        audit(editingSupplier?'تعديل مورد':'إضافة مورد','supplier',record.id);
      }catch(error){setNotice(t('فشل حفظ المورد: ','Could not save supplier: ')+String(error&&error.message||error));}
    }
    async function saveOffer(event){
      event.preventDefault();
      if(!canAdd&&!editingOffer)return;
      if(!clean(offerForm.name)){setNotice(t('اسم العرض مطلوب.','Offer name is required.'));return;}
      try{
        const id=editingOffer||db.ref('pestCrm/offers').push().key;
        const form=Object.assign({},offerForm,{name:clean(offerForm.name),number:clean(offerForm.number),amount:Number(offerForm.amount)||0,supplierIds:asArray(offerForm.supplierIds),date:offerForm.date||today()});
        const record=await writeRecord('pestCrm/offers',form,offers.find(x=>x.id===editingOffer),id);
        setOfferForm(emptyOffer());setEditingOffer('');setOfferFormOpen(false);setNotice(t('تم حفظ العرض.','Offer saved.'));
        audit(editingOffer?'تعديل عرض':'إضافة عرض','offer',record.id);
      }catch(error){setNotice(t('فشل حفظ العرض: ','Could not save offer: ')+String(error&&error.message||error));}
    }
    async function deleteRecord(type,record){
      if(!mayDelete(record)){setNotice(t('لا تملك صلاحية حذف هذا السجل.','You cannot delete this record.'));return;}
      if(!window.confirm(t('تأكيد حذف السجل؟','Delete this record?')))return;
      try{
        const base='pestCrm/'+type+'/'+record.id;
        await db.ref(base).remove();audit('حذف '+type,type,record.id);setNotice(t('تم الحذف.','Deleted.'));
      }catch(error){setNotice(t('فشل الحذف: ','Delete failed: ')+String(error&&error.message||error));}
    }
    async function saveVisit(event){
      event.preventDefault();
      const customer=scopedCustomers.find(x=>x.id===selectedCustomer);
      if(!customer||!canAdd)return;
      setVisitBusy(true);
      try{
        const id=db.ref('pestCrm/visits/'+customer.id).push().key;
        const record={id:id,customerId:customer.id,visitDate:visitForm.date||today(),visitTime:visitForm.time||'',notes:clean(visitForm.notes),outcome:clean(visitForm.outcome),followUpDate:visitForm.followUpDate||'',followUpTime:visitForm.followUpTime||'',createdAt:Date.now(),createdBy:uid,createdByName:user.fullName||user.username||uid};
        await db.ref('pestCrm/visits/'+customer.id+'/'+id).set(record);
        const customerUpdate=Object.assign({},customer,{lastVisitDate:record.visitDate,updatedAt:Date.now(),updatedBy:uid});
        if(record.followUpDate){customerUpdate.nextFollowUpDate=record.followUpDate;customerUpdate.nextFollowUpTime=record.followUpTime;}
        await db.ref('pestCrm/customers/'+customer.id).update(customerUpdate);
        setVisitForm({date:today(),time:'',notes:'',followUpDate:'',followUpTime:'',outcome:''});
        setNotice(t('تم تسجيل الزيارة وتحديث موعد المتابعة.','Visit recorded and follow-up updated.'));
        audit('تسجيل زيارة','visit',id);
      }catch(error){setNotice(t('فشل تسجيل الزيارة: ','Could not save visit: ')+String(error&&error.message||error));}
      finally{setVisitBusy(false);}
    }
    function range(){
      const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1);
      if(period==='month')return [start.getTime(),now.getTime()];
      if(period==='3m'){const d=new Date(now);d.setMonth(d.getMonth()-3);return [d.getTime(),now.getTime()];}
      if(period==='6m'){const d=new Date(now);d.setMonth(d.getMonth()-6);return [d.getTime(),now.getTime()];}
      if(period==='year')return [new Date(now.getFullYear(),0,1).getTime(),now.getTime()];
      return [fromDate?dateMs(fromDate):0,toDate?dateMs(toDate+'T23:59:59'):now.getTime()];
    }
    const bounds=range();
    const inPeriod=value=>{const stamp=dateMs(value);return stamp>0&&stamp>=bounds[0]&&stamp<=bounds[1];};
    const toEgp=(amount,currency)=>String(currency||'EGP').toUpperCase()==='USD'?(Number(amount)||0)*(Number(usdRate)||0):(Number(amount)||0);
    const displayAmount=(amount,currency)=>reportCurrency==='EGP'?fmt(toEgp(amount,currency),'EGP'):fmt(amount,currency||'EGP');
    const sectors=Array.from(new Set(scopedCustomers.map(x=>clean(x.sector)).filter(Boolean))).sort();
    const filteredCustomers=scopedCustomers.filter(c=>{
      const hay=[c.companyName,c.contactPerson,c.phone,c.email,c.sector,asArray(c.tags).join(' ')].join(' ').toLowerCase();
      const stageOk=stageFilter==='all'||c.stage===stageFilter;
      const sectorOk=sectorFilter==='all'||c.sector===sectorFilter;
      const followOk=followFilter==='all'||(followFilter==='overdue'&&c.nextFollowUpDate&&c.nextFollowUpDate<today())||(followFilter==='today'&&c.nextFollowUpDate===today())||(followFilter==='missing'&&(!c.phone||!c.email||!c.sector))||(followFilter==='novisit'&&!c.lastVisitDate);
      return (!search||hay.includes(search.toLowerCase()))&&stageOk&&sectorOk&&followOk;
    }).sort((a,b)=>(Number(!!b.pinned)-Number(!!a.pinned))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    const filteredOffers=scopedOffers.filter(o=>!search||[o.name,o.number,o.status,o.rejectionReason,scopedCustomers.find(c=>c.id===o.customerId)?.companyName].join(' ').toLowerCase().includes(search.toLowerCase()));
    const periodVisits=scopedVisits.filter(v=>inPeriod(v.visitDate));
    const periodCustomers=scopedCustomers.filter(c=>inPeriod(c.createdAt));
    const periodOffers=scopedOffers.filter(o=>inPeriod(o.date));
    const converted=periodOffers.filter(o=>['purchased','installed'].includes(o.status));
    const rejected=periodOffers.filter(o=>o.status==='rejected');
    const pipeline=periodOffers.filter(o=>o.status==='pending');
    const totalValue=periodOffers.reduce((sum,o)=>sum+toEgp(o.amount,o.currency),0);
    const wonValue=converted.reduce((sum,o)=>sum+toEgp(o.amount,o.currency),0);
    const winRate=(converted.length+rejected.length)?(converted.length/(converted.length+rejected.length)*100):0;
    const staleOffers=scopedOffers.filter(o=>o.status==='pending'&&dateMs(o.date)>0&&Date.now()-dateMs(o.date)>14*86400000);
    const dueCustomers=scopedCustomers.filter(c=>c.nextFollowUpDate&&c.nextFollowUpDate<=today());
    const topCustomers=scopedCustomers.map(c=>({name:c.companyName||'—',value:scopedOffers.filter(o=>o.customerId===c.id&&['purchased','installed'].includes(o.status)).reduce((sum,o)=>sum+toEgp(o.amount,o.currency),0)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,5);
    const rejectionCounts=rejectionReasons.map(([id,ar,en])=>({id,label:t(ar,en),count:rejected.filter(o=>o.rejectionReason===id).length})).filter(x=>x.count>0);
    const salesPeople=Array.from(new Set(periodOffers.map(o=>o.createdByName||o.ownerName||o.createdBy||''))).filter(Boolean).map(name=>({name,count:periodOffers.filter(o=>(o.createdByName||o.ownerName||o.createdBy||'')===name).length,value:periodOffers.filter(o=>(o.createdByName||o.ownerName||o.createdBy||'')===name).reduce((sum,o)=>sum+toEgp(o.amount,o.currency),0)})).sort((a,b)=>b.value-a.value);

    async function exportWorkbook(){
      if(!window.XLSX){setNotice(t('مكتبة Excel غير متاحة.','Excel library is unavailable.'));return;}
      const book=window.XLSX.utils.book_new();
      const append=(name,items)=>{window.XLSX.utils.book_append_sheet(book,window.XLSX.utils.json_to_sheet(items),name);};
      append('Customers',scopedCustomers.map(c=>({ID:c.id,Company:c.companyName,Contact:c.contactPerson,Title:c.jobTitle,Department:c.department,Phone:c.phone,Email:c.email,Sector:c.sector,Tags:asArray(c.tags).join(', '),Stage:c.stage,LastVisit:c.lastVisitDate,NextFollowUp:c.nextFollowUpDate,Notes:c.notes,CreatedBy:c.createdByName})));
      append('Suppliers',scopedSuppliers.map(s=>({ID:s.id,Company:s.companyName,Contact:s.contactPerson,Category:s.category,Tags:asArray(s.tags).join(', '),Phone:s.phone,Email:s.email,Notes:s.notes})));
      append('Offers',scopedOffers.map(o=>({ID:o.id,Name:o.name,Number:o.number,Customer:scopedCustomers.find(c=>c.id===o.customerId)?.companyName||'',Suppliers:asArray(o.supplierIds).map(id=>scopedSuppliers.find(s=>s.id===id)?.companyName||id).join('; '),Amount:o.amount,Currency:o.currency,Date:o.date,Status:o.status,RejectionReason:o.rejectionReason,Notes:o.notes,SalesRep:o.createdByName})));
      append('Visits',scopedVisits.map(v=>({ID:v.id,Customer:scopedCustomers.find(c=>c.id===v.customerId)?.companyName||'',Date:v.visitDate,Time:v.visitTime,Outcome:v.outcome,Notes:v.notes,FollowUpDate:v.followUpDate,FollowUpTime:v.followUpTime,CreatedBy:v.createdByName})));
      window.XLSX.writeFile(book,'Pest-CRM-Export-'+today()+'.xlsx');
      audit('تصدير Excel','export','workbook');
    }
    function exportJson(){
      const backup={sourceSystem:'PestPlatform-CRM',schemaVersion:1,exportedAt:new Date().toISOString(),customers:scopedCustomers,suppliers:scopedSuppliers,offers:scopedOffers,visits:scopedVisits};
      download('Pest-CRM-Backup-'+today()+'.json',JSON.stringify(backup,null,2),'application/json');
      audit('نسخة احتياطية CRM','export','json');
    }
    async function restoreJson(file){
      if(!canAdd){setNotice(t('لا تملك صلاحية الاستيراد.','You do not have import permission.'));return;}
      setImportBusy(true);
      try{
        const backup=JSON.parse(await file.text());
        if(!backup||backup.sourceSystem!=='PestPlatform-CRM'||Number(backup.schemaVersion)!==1)throw new Error('Invalid CRM backup format.');
        let added=0;
        for(const collection of ['customers','suppliers','offers']){
          const existing=collection==='customers'?customers:collection==='suppliers'?suppliers:offers;
          for(const record of asArray(backup[collection])){
            if(record&&record.id&&!existing.some(x=>x.id===record.id)){
              const next=Object.assign({},record,{createdBy:uid,createdByName:user.fullName||user.username||uid,restoredFromBackup:true,updatedAt:Date.now(),updatedBy:uid});
              await db.ref('pestCrm/'+collection+'/'+record.id).set(next);added++;
            }
          }
        }
        for(const record of asArray(backup.visits)){
          if(record&&record.id&&!scopedVisits.some(x=>x.id===record.id)){
            const parent=record.customerId||'unlinked';
            await db.ref('pestCrm/visits/'+parent+'/'+record.id).set(Object.assign({},record,{createdBy:uid,restoredFromBackup:true}));added++;
          }
        }
        setNotice(t('اكتمل الدمج الآمن. السجلات الجديدة فقط: ','Safe merge complete. New records only: ')+added);
        audit('استعادة دمج آمن','import',file.name);
      }catch(error){setNotice(t('تعذر استيراد النسخة: ','Could not import backup: ')+String(error.message||error));}
      finally{setImportBusy(false);}
    }
    async function importExcel(file){
      if(!canAdd){setNotice(t('لا تملك صلاحية الاستيراد.','You do not have import permission.'));return;}
      if(!window.XLSX){setNotice(t('مكتبة Excel غير متاحة.','Excel library is unavailable.'));return;}
      setImportBusy(true);
      try{
        const book=window.XLSX.read(await file.arrayBuffer(),{type:'array'});
        let added=0;
        const readSheet=(names)=>{const name=book.SheetNames.find(n=>names.includes(n.toLowerCase()));return name?window.XLSX.utils.sheet_to_json(book.Sheets[name],{defval:''}):[];};
        const customersRows=readSheet(['customers','clients']);
        const supplierRows=readSheet(['suppliers','vendors']);
        const offersRows=readSheet(['offers','quotes']);
        for(const row of customersRows){
          const name=clean(row.Company||row.companyName||row.Name||row.name||row['اسم الشركة']||row['اسم العميل']);if(!name)continue;
          const id=db.ref('pestCrm/customers').push().key;
          await db.ref('pestCrm/customers/'+id).set({id:id,companyName:name,contactPerson:clean(row.Contact||row.contactPerson||row['الشخص المسؤول']),phone:clean(row.Phone||row.phone||row['الهاتف']),email:clean(row.Email||row.email),sector:clean(row.Sector||row.sector||row['القطاع']),stage:'preview',tags:[],createdAt:Date.now(),updatedAt:Date.now(),createdBy:uid,createdByName:user.fullName||user.username||uid,importedFrom:file.name});
          added++;
        }
        for(const row of supplierRows){
          const name=clean(row.Company||row.companyName||row.Name||row.name||row['اسم الشركة']||row['اسم المورد']);if(!name)continue;
          const id=db.ref('pestCrm/suppliers').push().key;
          await db.ref('pestCrm/suppliers/'+id).set({id:id,companyName:name,contactPerson:clean(row.Contact||row.contactPerson),category:clean(row.Category||row.category),phone:clean(row.Phone||row.phone),email:clean(row.Email||row.email),tags:[],createdAt:Date.now(),updatedAt:Date.now(),createdBy:uid,createdByName:user.fullName||user.username||uid,importedFrom:file.name});
          added++;
        }
        for(const row of offersRows){
          const name=clean(row.Offer||row.Name||row.name||row['اسم العرض']);if(!name)continue;
          const id=db.ref('pestCrm/offers').push().key;
          await db.ref('pestCrm/offers/'+id).set({id:id,name:name,number:clean(row.Number||row.number),amount:Number(row.Amount||row.amount||row['القيمة'])||0,currency:clean(row.Currency||row.currency)||'EGP',date:clean(row.Date||row.date)||today(),status:'pending',supplierIds:[],createdAt:Date.now(),updatedAt:Date.now(),createdBy:uid,createdByName:user.fullName||user.username||uid,importedFrom:file.name});
          added++;
        }
        setNotice(t('تم استيراد السجلات من أوراق Customers / Suppliers / Offers: ','Imported records from Customers / Suppliers / Offers: ')+added);
        audit('استيراد Excel','import',file.name);
      }catch(error){setNotice(t('فشل استيراد Excel: ','Excel import failed: ')+String(error.message||error));}
      finally{setImportBusy(false);}
    }

    const visibleCustomers=filteredCustomers;
    const customerVisits=scopedVisits.filter(v=>v.customerId===selectedCustomer).sort((a,b)=>dateMs(b.visitDate)-dateMs(a.visitDate));
    const selectedCustomerRecord=scopedCustomers.find(c=>c.id===selectedCustomer);
    const navItems=[['overview',t('لوحة المتابعة','Dashboard')],['customers',t('العملاء والزيارات','Customers & Visits')],['suppliers',t('الموردون','Suppliers')],['offers',t('عروض البيع','Sales Offers')],['reports',t('التحليلات والتقارير','Analytics & Reports')],['data',t('الاستيراد والتصدير','Import & Export')]];
    const statusLabel=value=>(offerStates.find(x=>x[0]===value)||[value,value,value])[rtl?1:2];
    const stageLabel=value=>(stages.find(x=>x[0]===value)||[value,value,value])[rtl?1:2];
    const htitle=h('div',{className:'flex flex-wrap justify-between items-start gap-3 mb-4'},
      h('div',null,h('h2',{className:'text-xl font-extrabold text-slate-900'},t('إدارة العملاء والمبيعات — PEST CRM','Customer & Sales Management — PEST CRM')),h('p',{className:'text-xs text-slate-500 mt-1'},t('مساحة CRM مستقلة داخل Pest Platform. لا يتم دمج سجلات العملاء أو الموردين الحالية تلقائيًا.','A separate CRM workspace inside Pest Platform. Existing customer and supplier records are not automatically merged.'))),
      h('span',{className:'rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1.5 text-xs font-bold'},t('بيانات مستقلة','Separate data area'))
    );
    const subnav=h('div',{className:'flex gap-2 overflow-x-auto pb-2 mb-4 no-print'},navItems.map(item=>button(item[1],()=>setSection(item[0]),section===item[0]?'primary':undefined)));
    const note=notice?h('div',{className:'mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900',role:'status'},notice):null;
    const periodControls=h('div',{className:'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 mb-4 no-print'},
      select(t('الفترة','Period'),period,setPeriod,[['month',t('الشهر الحالي','Current month')],['3m',t('آخر 3 أشهر','Last 3 months')],['6m',t('آخر 6 أشهر','Last 6 months')],['year',t('السنة الحالية','Current year')],['custom',t('فترة مخصصة','Custom range')]]),
      period==='custom'?input(t('من تاريخ','From'),fromDate,setFromDate,{type:'date'}):null,
      period==='custom'?input(t('إلى تاريخ','To'),toDate,setToDate,{type:'date'}):null,
      input(t('سعر الدولار مقابل الجنيه','USD to EGP rate'),usdRate,setUsdRate,{type:'number',min:'0',step:'0.01'}),
      select(t('عملة عرض التقارير','Report currency'),reportCurrency,setReportCurrency,[['EGP','EGP'],['USD','USD']])
    );
    const overview=h('div',{className:'space-y-4'},
      h('div',{className:'flex flex-wrap items-center justify-between gap-2'},h('h3',{className:'font-extrabold text-lg'},t('مؤشرات المبيعات والمتابعة','Sales & follow-up metrics')),button(t('تحديث البيانات','Refresh data'),()=>setNotice(t('يتم تحديث البيانات تلقائيًا عند كل تغيير.','Data refreshes automatically on every change.')))),
      periodControls,
      h('div',{className:'grid grid-cols-2 xl:grid-cols-4 gap-3'},
        metric(t('إجمالي العملاء','Total customers'),scopedCustomers.length),
        metric(t('عملاء جدد بالفترة','New customers in period'),periodCustomers.length),
        metric(t('زيارات بالفترة','Visits in period'),periodVisits.length),
        metric(t('العروض بالفترة','Offers in period'),periodOffers.length),
        metric(t('قيمة العروض','Offer value'),displayAmount(totalValue,'EGP')),
        metric(t('قيمة الصفقات المحولة','Converted deal value'),displayAmount(wonValue,'EGP')),
        metric(t('معدل الفوز','Win rate'),winRate.toFixed(1)+'%'),
        metric(t('عروض تحتاج متابعة','Stale offers'),staleOffers.length)
      ),
      h('div',{className:'grid grid-cols-1 xl:grid-cols-2 gap-3'},
        h('section',{className:'bg-white border rounded-xl p-4'},h('h4',{className:'font-bold mb-3'},t('متابعات العملاء المستحقة','Due customer follow-ups')),dueCustomers.length?dueCustomers.slice(0,8).map(c=>h('div',{key:c.id,className:'flex justify-between items-center gap-2 py-2 border-b last:border-0 text-sm'},h('button',{type:'button',className:'text-blue-700 font-bold text-start truncate',onClick:()=>{setSelectedCustomer(c.id);setSection('customers');}},c.companyName),h('span',{className:'text-xs text-rose-700 shrink-0'},c.nextFollowUpDate+(c.nextFollowUpTime?' '+c.nextFollowUpTime:'')))):h('p',{className:'text-sm text-slate-500'},t('لا توجد متابعات مستحقة.','No follow-ups are due.'))),
        h('section',{className:'bg-white border rounded-xl p-4'},h('h4',{className:'font-bold mb-3'},t('أعلى العملاء حسب الصفقات المحولة','Top customers by converted sales')),topCustomers.length?topCustomers.map((c,i)=>h('div',{key:c.name,className:'flex justify-between gap-3 py-2 border-b last:border-0 text-sm'},h('span',null,(i+1)+'. '+c.name),h('b',{dir:'ltr'},fmt(c.value,'EGP')))):h('p',{className:'text-sm text-slate-500'},t('لا توجد صفقات محولة في النطاق المحدد.','No converted deals in the selected range.')))
      ),
      h('div',{className:'grid grid-cols-1 xl:grid-cols-2 gap-3'},
        h('section',{className:'bg-white border rounded-xl p-4'},h('h4',{className:'font-bold mb-3'},t('تحليل أسباب رفض العروض','Offer rejection analysis')),rejectionCounts.length?rejectionCounts.map(row=>h('div',{key:row.id,className:'flex justify-between gap-3 py-2 border-b last:border-0 text-sm'},h('span',null,row.label),h('b',null,row.count))):h('p',{className:'text-sm text-slate-500'},t('لا توجد عروض مرفوضة.','No rejected offers.'))),
        h('section',{className:'bg-white border rounded-xl p-4'},h('h4',{className:'font-bold mb-3'},t('أداء مندوبي المبيعات','Sales representative performance')),salesPeople.length?salesPeople.map(row=>h('div',{key:row.name,className:'flex justify-between gap-3 py-2 border-b last:border-0 text-sm'},h('span',null,row.name+' · '+row.count),h('b',{dir:'ltr'},fmt(row.value,'EGP')))):h('p',{className:'text-sm text-slate-500'},t('لا توجد عروض بالفترة المحددة.','No offers in the selected period.')))
      )
    );
    const customerFormView=customerFormOpen?h('form',{onSubmit:saveCustomer,className:'bg-white border rounded-xl p-4 space-y-3 mb-4'},
      h('div',{className:'flex justify-between items-center'},h('h4',{className:'font-bold'},editingCustomer?t('تعديل عميل','Edit customer'):t('إضافة عميل جديد','Add customer')),button(t('إغلاق','Close'),()=>{setCustomerFormOpen(false);setEditingCustomer('');setCustomerForm(emptyCustomer());})),
      h('div',{className:'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'},
        input(t('اسم الشركة','Company name'),customerForm.companyName,v=>setCustomerForm(old=>({...old,companyName:v})),{required:true}),
        input(t('الشخص المسؤول','Contact person'),customerForm.contactPerson,v=>setCustomerForm(old=>({...old,contactPerson:v}))),
        input(t('المسمى الوظيفي','Job title'),customerForm.jobTitle,v=>setCustomerForm(old=>({...old,jobTitle:v}))),
        input(t('الإدارة / القسم','Department'),customerForm.department,v=>setCustomerForm(old=>({...old,department:v}))),
        input(t('الهاتف','Phone'),customerForm.phone,v=>setCustomerForm(old=>({...old,phone:v})),{type:'tel'}),
        input(t('البريد الإلكتروني','Email'),customerForm.email,v=>setCustomerForm(old=>({...old,email:v})),{type:'email'}),
        input(t('القطاع','Sector'),customerForm.sector,v=>setCustomerForm(old=>({...old,sector:v}))),
        input(t('وسوم (مفصولة بفاصلة)','Tags (comma separated)'),customerForm.tags,v=>setCustomerForm(old=>({...old,tags:v}))),
        select(t('مرحلة العميل','Customer stage'),customerForm.stage,v=>setCustomerForm(old=>({...old,stage:v})),stages.map(x=>[x[0],rtl?x[1]:x[2]])),
        input(t('موعد المتابعة','Next follow-up date'),customerForm.nextFollowUpDate,v=>setCustomerForm(old=>({...old,nextFollowUpDate:v})),{type:'date'}),
        input(t('وقت المتابعة','Follow-up time'),customerForm.nextFollowUpTime,v=>setCustomerForm(old=>({...old,nextFollowUpTime:v})),{type:'time'}),
        textarea(t('ملاحظات','Notes'),customerForm.notes,v=>setCustomerForm(old=>({...old,notes:v})),{className:'sm:col-span-2 xl:col-span-3'})
      ),
      h('label',{className:'inline-flex items-center gap-2 text-sm'},h('input',{type:'checkbox',checked:!!customerForm.pinned,onChange:e=>setCustomerForm(old=>({...old,pinned:e.target.checked}))}),t('تثبيت العميل في أعلى القائمة','Pin customer at top')),
      h('div',{className:'flex gap-2'},h('button',{type:'submit',disabled:!canAdd&&!editingCustomer,className:'rounded-lg bg-blue-600 text-white px-5 py-2.5 font-bold'},t('حفظ العميل','Save customer')),button(t('إلغاء','Cancel'),()=>{setCustomerFormOpen(false);setEditingCustomer('');setCustomerForm(emptyCustomer());}))
    ):null;
    const customerRows=visibleCustomers.map(c=>h('tr',{key:c.id,className:'border-b'},
      h('td',{className:'p-2'},h('button',{type:'button',className:'font-bold text-blue-700 text-start',onClick:()=>setSelectedCustomer(c.id)},(c.pinned?'★ ':'')+(c.companyName||'—'))),
      h('td',{className:'p-2'},c.contactPerson||'—'),
      h('td',{className:'p-2',dir:'ltr'},c.phone||'—'),
      h('td',{className:'p-2'},c.sector||'—'),
      h('td',{className:'p-2'},stageLabel(c.stage)),
      h('td',{className:'p-2'},c.nextFollowUpDate||'—'),
      h('td',{className:'p-2'},h('div',{className:'flex flex-wrap gap-1'},c.phone?h('button',{type:'button',className:'text-emerald-700 underline text-xs',onClick:()=>window.open('https://wa.me/'+c.phone.replace(/[^\d]/g,''),'_blank','noopener')},'WhatsApp'):null,mayEdit(c)?h('button',{type:'button',className:'text-blue-700 underline text-xs',onClick:()=>startCustomerEdit(c)},t('تعديل','Edit')):null,mayDelete(c)?h('button',{type:'button',className:'text-rose-700 underline text-xs',onClick:()=>deleteRecord('customers',c)},t('حذف','Delete')):null))
    ));
    const customerDetail=selectedCustomerRecord?h('section',{className:'bg-white border rounded-xl p-4 mt-4 space-y-3'},
      h('div',{className:'flex flex-wrap justify-between gap-2 items-start'},h('div',null,h('h4',{className:'font-extrabold text-lg'},selectedCustomerRecord.companyName),h('p',{className:'text-xs text-slate-500'},[selectedCustomerRecord.contactPerson,selectedCustomerRecord.phone,selectedCustomerRecord.email].filter(Boolean).join(' · '))),button(t('إغلاق التفاصيل','Close details'),()=>setSelectedCustomer(''))),
      h('div',{className:'grid grid-cols-2 md:grid-cols-4 gap-2 text-sm'},[['القطاع',selectedCustomerRecord.sector],['المرحلة',stageLabel(selectedCustomerRecord.stage)],['آخر زيارة',selectedCustomerRecord.lastVisitDate],['المتابعة القادمة',selectedCustomerRecord.nextFollowUpDate]].map((item,i)=>h('div',{key:i,className:'rounded-lg bg-slate-50 p-2'},h('small',{className:'block text-slate-500'},t(item[0],['Sector','Stage','Last visit','Next follow-up'][i])),h('b',null,item[1]||'—')))),
      h('div',{className:'flex justify-between items-center gap-2'},h('b',null,t('سجل الزيارات والمتابعة','Visit history & follow-ups')),mayEdit(selectedCustomerRecord)?button(t('تعديل بيانات العميل','Edit customer'),()=>startCustomerEdit(selectedCustomerRecord)):null),
      canAdd?h('form',{onSubmit:saveVisit,className:'rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-3'},
        h('b',{className:'text-sm'},t('تسجيل زيارة جديدة','Record a new visit')),
        h('div',{className:'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2'},
          input(t('تاريخ الزيارة','Visit date'),visitForm.date,v=>setVisitForm(o=>({...o,date:v})),{type:'date'}),
          input(t('وقت الزيارة','Visit time'),visitForm.time,v=>setVisitForm(o=>({...o,time:v})),{type:'time'}),
          input(t('موعد المتابعة','Next follow-up'),visitForm.followUpDate,v=>setVisitForm(o=>({...o,followUpDate:v})),{type:'date'}),
          input(t('وقت المتابعة','Follow-up time'),visitForm.followUpTime,v=>setVisitForm(o=>({...o,followUpTime:v})),{type:'time'}),
          input(t('نتيجة الزيارة','Visit outcome'),visitForm.outcome,v=>setVisitForm(o=>({...o,outcome:v}))),
          textarea(t('ملاحظات الزيارة','Visit notes'),visitForm.notes,v=>setVisitForm(o=>({...o,notes:v})),{className:'sm:col-span-2 xl:col-span-3'})
        ),
        h('button',{type:'submit',disabled:visitBusy,className:'rounded-lg bg-blue-600 text-white px-4 py-2 font-bold'},visitBusy?t('جارٍ الحفظ...','Saving...'):t('حفظ الزيارة','Save visit'))
      ):null,
      customerVisits.length?customerVisits.map(v=>h('article',{key:v.id,className:'border-b py-3 text-sm'},h('div',{className:'flex flex-wrap justify-between gap-2'},h('b',null,(v.visitDate||'')+(v.visitTime?' · '+v.visitTime:'')),v.followUpDate?h('span',{className:'text-xs text-blue-700'},t('متابعة: ','Follow-up: ')+v.followUpDate):null),v.outcome?h('p',{className:'font-semibold mt-1'},v.outcome):null,v.notes?h('p',{className:'text-slate-600 whitespace-pre-wrap mt-1'},v.notes):null,h('small',{className:'text-slate-400'},v.createdByName||''))):h('p',{className:'text-sm text-slate-500'},t('لا توجد زيارات مسجلة بعد.','No visits recorded yet.')),
      selectedCustomerRecord.notes?h('p',{className:'text-sm text-slate-600 whitespace-pre-wrap border-t pt-3'},selectedCustomerRecord.notes):null
    ):null;
    const customersView=h('div',null,
      h('div',{className:'flex flex-wrap justify-between gap-2 items-center mb-3'},h('h3',{className:'font-extrabold text-lg'},t('قاعدة بيانات العملاء','Customer database')),canAdd?button(t('إضافة عميل','Add customer'),()=>{setCustomerForm(emptyCustomer());setEditingCustomer('');setCustomerFormOpen(true);},'primary'):null),
      customerFormView,
      h('div',{className:'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-3'},
        input(t('بحث','Search'),search,setSearch),
        select(t('المرحلة','Stage'),stageFilter,setStageFilter,[['all',t('كل المراحل','All stages')],...stages.map(x=>[x[0],rtl?x[1]:x[2]])]),
        select(t('القطاع','Sector'),sectorFilter,setSectorFilter,[['all',t('كل القطاعات','All sectors')],...sectors.map(x=>[x,x])]),
        select(t('فلاتر المتابعة','Follow-up filters'),followFilter,setFollowFilter,[['all',t('كل العملاء','All customers')],['overdue',t('متابعة متأخرة','Overdue follow-up')],['today',t('متابعة اليوم','Due today')],['missing',t('بيانات ناقصة','Missing contact data')],['novisit',t('بدون زيارات','No visits')]])
      ),
      h('div',{className:'overflow-x-auto rounded-xl border bg-white'},h('table',{className:'w-full min-w-[850px] text-sm text-start'},h('thead',{className:'bg-slate-50'},h('tr',null,['الشركة','المسؤول','الهاتف','القطاع','المرحلة','موعد المتابعة','الإجراءات'].map((x,i)=>h('th',{key:i,className:'p-2 text-start'},t(x,['Company','Contact','Phone','Sector','Stage','Follow-up','Actions'][i]))))),h('tbody',null,customerRows))),
      visibleCustomers.length===0?h('p',{className:'text-sm text-slate-500 p-4 text-center'},t('لا توجد سجلات مطابقة.','No matching records.')):null,
      customerDetail
    );
    const supplierFormView=supplierFormOpen?h('form',{onSubmit:saveSupplier,className:'bg-white border rounded-xl p-4 space-y-3 mb-4'},
      h('div',{className:'flex justify-between items-center'},h('b',null,editingSupplier?t('تعديل مورد','Edit supplier'):t('إضافة مورد','Add supplier')),button(t('إغلاق','Close'),()=>{setSupplierFormOpen(false);setEditingSupplier('');setSupplierForm(emptySupplier());})),
      h('div',{className:'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'},
        input(t('اسم المورد / الشركة','Supplier / company name'),supplierForm.companyName,v=>setSupplierForm(o=>({...o,companyName:v})),{required:true}),
        input(t('الشخص المسؤول','Contact person'),supplierForm.contactPerson,v=>setSupplierForm(o=>({...o,contactPerson:v}))),
        input(t('نوع المنتج / الخدمة','Product / service category'),supplierForm.category,v=>setSupplierForm(o=>({...o,category:v}))),
        input(t('الوسوم','Tags'),supplierForm.tags,v=>setSupplierForm(o=>({...o,tags:v}))),
        input(t('الهاتف','Phone'),supplierForm.phone,v=>setSupplierForm(o=>({...o,phone:v})),{type:'tel'}),
        input(t('البريد الإلكتروني','Email'),supplierForm.email,v=>setSupplierForm(o=>({...o,email:v})),{type:'email'}),
        textarea(t('ملاحظات','Notes'),supplierForm.notes,v=>setSupplierForm(o=>({...o,notes:v})),{className:'sm:col-span-2'})
      ),
      h('button',{type:'submit',disabled:!canAdd&&!editingSupplier,className:'rounded-lg bg-blue-600 text-white px-5 py-2.5 font-bold'},t('حفظ المورد','Save supplier'))
    ):null;
    const suppliersView=h('div',null,
      h('div',{className:'flex justify-between items-center gap-2 mb-3'},h('h3',{className:'font-extrabold text-lg'},t('قاعدة بيانات الموردين','Supplier database')),canAdd?button(t('إضافة مورد','Add supplier'),()=>{setSupplierForm(emptySupplier());setEditingSupplier('');setSupplierFormOpen(true);},'primary'):null),
      supplierFormView,
      h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:t('بحث باسم المورد أو المسؤول أو النوع','Search supplier, contact or category'),className:'w-full border rounded-lg p-3 mb-3'}),
      h('div',{className:'overflow-x-auto rounded-xl border bg-white'},h('table',{className:'w-full min-w-[720px] text-sm'},h('thead',{className:'bg-slate-50'},h('tr',null,['المورد','المسؤول','النوع','الهاتف','البريد','الإجراءات'].map((x,i)=>h('th',{key:i,className:'p-2 text-start'},t(x,['Supplier','Contact','Type','Phone','Email','Actions'][i]))))),h('tbody',null,scopedSuppliers.filter(s=>!search||[s.companyName,s.contactPerson,s.category,s.phone,s.email].join(' ').toLowerCase().includes(search.toLowerCase())).map(s=>h('tr',{key:s.id,className:'border-b'},h('td',{className:'p-2 font-bold'},(s.pinned?'★ ':'')+s.companyName),h('td',{className:'p-2'},s.contactPerson||'—'),h('td',{className:'p-2'},s.category||'—'),h('td',{className:'p-2',dir:'ltr'},s.phone||'—'),h('td',{className:'p-2'},s.email||'—'),h('td',{className:'p-2'},h('div',{className:'flex gap-2'},mayEdit(s)?h('button',{type:'button',className:'text-blue-700 underline text-xs',onClick:()=>startSupplierEdit(s)},t('تعديل','Edit')):null,mayDelete(s)?h('button',{type:'button',className:'text-rose-700 underline text-xs',onClick:()=>deleteRecord('suppliers',s)},t('حذف','Delete')):null))))))),
      scopedSuppliers.length===0?h('p',{className:'text-sm text-slate-500 p-4'},t('لا يوجد موردون مسجلون.','No suppliers have been registered.')):null
    );
    const offerFormView=offerFormOpen?h('form',{onSubmit:saveOffer,className:'bg-white border rounded-xl p-4 space-y-3 mb-4'},
      h('div',{className:'flex justify-between items-center'},h('b',null,editingOffer?t('تعديل العرض','Edit offer'):t('إضافة عرض جديد','Add offer')),button(t('إغلاق','Close'),()=>{setOfferFormOpen(false);setEditingOffer('');setOfferForm(emptyOffer());})),
      h('div',{className:'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'},
        input(t('اسم العرض / الفرصة','Offer / opportunity name'),offerForm.name,v=>setOfferForm(o=>({...o,name:v})),{required:true}),
        input(t('رقم العرض','Offer number'),offerForm.number,v=>setOfferForm(o=>({...o,number:v}))),
        select(t('العميل','Customer'),offerForm.customerId,v=>setOfferForm(o=>({...o,customerId:v})),[['',t('غير مرتبط','Not linked')],...scopedCustomers.map(c=>[c.id,c.companyName])]),
        input(t('القيمة','Amount'),offerForm.amount,v=>setOfferForm(o=>({...o,amount:v})),{type:'number',min:'0',step:'0.01'}),
        select(t('العملة','Currency'),offerForm.currency,v=>setOfferForm(o=>({...o,currency:v})),[['EGP','EGP'],['USD','USD']]),
        input(t('تاريخ العرض','Offer date'),offerForm.date,v=>setOfferForm(o=>({...o,date:v})),{type:'date'}),
        select(t('الحالة','Status'),offerForm.status,v=>setOfferForm(o=>({...o,status:v})),offerStates.map(x=>[x[0],rtl?x[1]:x[2]])),
        offerForm.status==='rejected'?select(t('سبب الرفض','Rejection reason'),offerForm.rejectionReason,v=>setOfferForm(o=>({...o,rejectionReason:v})),[['',t('اختر السبب','Choose reason')],...rejectionReasons.map(x=>[x[0],rtl?x[1]:x[2]])]):null,
        textarea(t('ملاحظات','Notes'),offerForm.notes,v=>setOfferForm(o=>({...o,notes:v})),{className:'sm:col-span-2'})
      ),
      h('label',{className:'block text-xs font-bold'},t('الموردون المرتبطون','Linked suppliers'),h('select',{multiple:true,value:offerForm.supplierIds,onChange:e=>setOfferForm(o=>({...o,supplierIds:Array.from(e.target.selectedOptions).map(x=>x.value)})),className:'block w-full border rounded-lg p-2.5 mt-1 bg-white min-h-28 text-sm font-normal'},scopedSuppliers.map(s=>h('option',{key:s.id,value:s.id},s.companyName)))),
      h('button',{type:'submit',disabled:!canAdd&&!editingOffer,className:'rounded-lg bg-blue-600 text-white px-5 py-2.5 font-bold'},t('حفظ العرض','Save offer'))
    ):null;
    const offersView=h('div',null,
      h('div',{className:'flex justify-between items-center gap-2 mb-3'},h('h3',{className:'font-extrabold text-lg'},t('عروض البيع والفرص','Sales offers & opportunities')),canAdd?button(t('إضافة عرض','Add offer'),()=>{setOfferForm(emptyOffer());setEditingOffer('');setOfferFormOpen(true);},'primary'):null),
      offerFormView,
      h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:t('بحث في العروض','Search offers'),className:'w-full border rounded-lg p-3 mb-3'}),
      h('div',{className:'overflow-x-auto rounded-xl border bg-white'},h('table',{className:'w-full min-w-[950px] text-sm'},h('thead',{className:'bg-slate-50'},h('tr',null,['العرض','رقم العرض','العميل','الموردون','القيمة','التاريخ','الحالة','الإجراءات'].map((x,i)=>h('th',{key:i,className:'p-2 text-start'},t(x,['Offer','Offer no.','Customer','Suppliers','Amount','Date','Status','Actions'][i]))))),h('tbody',null,filteredOffers.map(o=>h('tr',{key:o.id,className:'border-b'},h('td',{className:'p-2 font-bold'},o.name),h('td',{className:'p-2'},o.number||'—'),h('td',{className:'p-2'},scopedCustomers.find(c=>c.id===o.customerId)?.companyName||'—'),h('td',{className:'p-2'},asArray(o.supplierIds).map(id=>scopedSuppliers.find(s=>s.id===id)?.companyName||id).join('، ')||'—'),h('td',{className:'p-2',dir:'ltr'},fmt(o.amount,o.currency)),h('td',{className:'p-2'},o.date||'—'),h('td',{className:'p-2'},statusLabel(o.status),o.status==='rejected'&&o.rejectionReason?h('small',{className:'block text-rose-600'},(rejectionReasons.find(r=>r[0]===o.rejectionReason)||[])[rtl?1:2]||''):null),h('td',{className:'p-2'},h('div',{className:'flex gap-2'},mayEdit(o)?h('button',{type:'button',className:'text-blue-700 underline text-xs',onClick:()=>startOfferEdit(o)},t('تعديل','Edit')):null,mayDelete(o)?h('button',{type:'button',className:'text-rose-700 underline text-xs',onClick:()=>deleteRecord('offers',o)},t('حذف','Delete')):null))))))),
      filteredOffers.length===0?h('p',{className:'text-sm text-slate-500 p-4'},t('لا توجد عروض مسجلة.','No offers have been registered.')):null
    );
    const reportsView=h('div',{className:'space-y-4'},
      h('div',{className:'flex flex-wrap justify-between items-center gap-2'},h('h3',{className:'font-extrabold text-lg'},t('تقارير أداء المبيعات','Sales performance reports')),button(t('طباعة / حفظ PDF','Print / Save PDF'),()=>window.print(),'primary')),
      periodControls,
      h('section',{className:'bg-white border rounded-xl p-4 space-y-3'},h('h4',{className:'font-bold'},t('مقارنة الأداء حسب القطاع','Sector performance comparison')),sectors.map(sector=>{
        const sectorCustomers=scopedCustomers.filter(c=>c.sector===sector);
        const sectorOffers=periodOffers.filter(o=>sectorCustomers.some(c=>c.id===o.customerId));
        const value=sectorOffers.reduce((sum,o)=>sum+toEgp(o.amount,o.currency),0);
        return h('div',{key:sector,className:'grid grid-cols-3 gap-2 border-b py-2 text-sm'},h('b',null,sector),h('span',null,t('عملاء: ','Customers: ')+sectorCustomers.length),h('span',{dir:'ltr',className:'text-end'},fmt(value,'EGP')));
      })),
      h('section',{className:'bg-white border rounded-xl p-4 space-y-2'},h('h4',{className:'font-bold'},t('تفاصيل مؤشرات الفترة','Selected period KPI details')),h('p',{className:'text-sm'},t('إجمالي الزيارات: ','Total visits: ')+periodVisits.length),h('p',{className:'text-sm'},t('العروض المفتوحة: ','Open offers: ')+pipeline.length),h('p',{className:'text-sm'},t('العروض المرفوضة: ','Rejected offers: ')+rejected.length),h('p',{className:'text-sm'},t('متوسط قيمة العرض: ','Average offer size: ')+fmt(periodOffers.length?totalValue/periodOffers.length:0,'EGP')),h('p',{className:'text-sm'},t('قيمة الصفقات المحولة: ','Converted sales value: ')+fmt(wonValue,'EGP'))),
      h('section',{className:'bg-white border rounded-xl p-4 space-y-2'},h('h4',{className:'font-bold'},t('قائمة المتابعات والعروض المتأخرة','Stale customers and offers')),dueCustomers.concat(staleOffers.map(o=>({id:o.id,companyName:o.name,nextFollowUpDate:o.date,kind:'offer'}))).slice(0,40).map(r=>h('p',{key:r.id,className:'text-sm border-b py-2'},(r.kind==='offer'?t('عرض: ','Offer: '):t('عميل: ','Customer: '))+(r.companyName||r.name)+' · '+(r.nextFollowUpDate||'—'))))
    );
    const dataView=h('div',{className:'space-y-4'},
      h('h3',{className:'font-extrabold text-lg'},t('النسخ الاحتياطي والاستيراد والتصدير','Backups, imports & exports')),
      h('div',{className:'rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900'},t('جميع عمليات الاستعادة هنا تعمل بنمط الدمج الآمن فقط: إضافة السجلات غير الموجودة دون حذف أو استبدال السجلات الحالية. لا يتم استيراد بيانات برنامج PEST القديم تلقائيًا في هذه المرحلة.','Restore operations use safe merge only: missing records are added without deleting or replacing existing records. The old PEST app data is not imported at this stage.')),
      h('section',{className:'grid grid-cols-1 md:grid-cols-2 gap-3'},
        h('article',{className:'bg-white border rounded-xl p-4 space-y-2'},h('h4',{className:'font-bold'},t('تصدير البيانات','Export data')),h('p',{className:'text-xs text-slate-500'},t('تصدير سجلات CRM الحالية إلى Excel أو JSON.','Export current CRM records to Excel or JSON.')),button(t('تصدير Excel','Export Excel'),exportWorkbook,'success',!canExport),button(t('نسخة احتياطية JSON','JSON backup'),exportJson,'',!canExport)),
        h('article',{className:'bg-white border rounded-xl p-4 space-y-3'},h('h4',{className:'font-bold'},t('استيراد ودمج','Import & merge')),h('p',{className:'text-xs text-slate-500'},t('يدعم ملف Excel بأوراق Customers / Suppliers / Offers أو نسخة JSON سابقة من هذا القسم.','Accepts an Excel workbook with Customers / Suppliers / Offers sheets or a previous JSON backup from this section.')),h('label',{className:'block text-sm font-bold'},t('استيراد Excel','Import Excel'),h('input',{type:'file',accept:'.xlsx,.xls',className:'block w-full mt-1 text-xs',disabled:importBusy||!canAdd,onChange:e=>{const f=e.target.files&&e.target.files[0];if(f)void importExcel(f);e.target.value='';}})),h('label',{className:'block text-sm font-bold'},t('دمج نسخة JSON (السجلات المفقودة فقط)','Merge JSON backup (missing records only)'),h('input',{type:'file',accept:'.json,application/json',className:'block w-full mt-1 text-xs',disabled:importBusy||!canAdd,onChange:e=>{const f=e.target.files&&e.target.files[0];if(f)void restoreJson(f);e.target.value='';}})),importBusy?h('p',{className:'text-xs text-blue-700'},t('جارٍ الاستيراد...','Importing...')):null)
      ),
      h('p',{className:'text-xs text-slate-500'},t('تأكد من أخذ نسخة احتياطية قبل الاستيراد. سجلات العملاء والموردين الموجودة في Pest Platform خارج هذا القسم ولا يتم تعديلها.','Take a backup before importing. Existing Pest Platform customers and vendors outside this section are never changed.'))
    );
    let body=section==='overview'?overview:section==='customers'?customersView:section==='suppliers'?suppliersView:section==='offers'?offersView:section==='reports'?reportsView:dataView;
    return h('div',{className:'max-w-[1500px] space-y-3',dir:rtl?'rtl':'ltr'},
      htitle,subnav,note,
      loading?h('div',{className:'bg-white rounded-xl border p-6 text-center text-sm text-slate-500'},t('جارٍ تحميل بيانات CRM...','Loading CRM data...')):body,
      h('div',{className:'text-[10px] text-slate-400 text-end pt-2'},t('مساحة مستقلة: pestCrm · لم يتم نقل بيانات PEST القديم أو ربط سجلاته تلقائيًا.','Separate namespace: pestCrm · No legacy PEST data has been migrated or linked automatically.'))
    );
  }
  window.PEST_CRM_MODULE=PestCrmModule;
})();