/* Explicit demo service: versioned mutations and audit fixtures, never Microsoft I/O. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./domain.js'));else root.StockMock=factory(root.StockDomain)})(globalThis,function(D){
 'use strict';const copy=v=>structuredClone(v);
 const capabilities={inspectionV2:true,atomicVersions:true,requestStatus:true,auditHistory:true,photoReadback:false};
 function fixtures(){
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const record=(id,serial,result1,result2)=>({schemaVersion:2,version:1,id:String(id),sharePointItemId:String(id),serial,product:'L',model:'L5018SP-CF',checkedAt:date,result1,result2,location:'พื้นที่ทดสอบ',inspector:'ผู้ตรวจตัวอย่าง',note:'',ngDetail:'',photoUrl1:'',auditHistory:[]});
  const base={schemaVersion:2,version:1,product:'L',model:'L5018SP-CF',affectedProducts:['L','M'],affectedModels:['L5018SP-CF','M6040'],claimCategory:'Quick Report',status:'progress',checkingMethod:'จอดบนพื้นราบ ดับเครื่อง แล้วตรวจข้อต่อและสายไฮดรอลิกด้วยสายตา',result1Criteria:'ไม่มีรอยรั่วบริเวณข้อต่อ',result2Criteria:'สายไฮดรอลิกไม่มีรอยแตกร้าว',targetUnits:12,startedAt:date,updated:date,notes:'ข้อมูลจำลองสำหรับทดสอบเท่านั้น'};
  return [
   {...base,id:'DEMO-L-001',sharePointItemId:'101',title:'ตรวจสอบชุดไฮดรอลิก',records:[record(204,'DEMO-L004','',''),{...record(203,'DEMO-L003','OK',''),product:'M',model:'M6040'},record(202,'KBULLCDCHPTD10006','NG',''),record(201,'DEMO-L001','OK','OK')]},
   {...base,id:'DEMO-M-002',sharePointItemId:'102',title:'ตรวจจุดยึดฝาครอบเครื่องยนต์',product:'M',model:'M6040',affectedProducts:['M'],affectedModels:['M6040'],claimCategory:'Hotline',status:'new',targetUnits:8,records:[]},
   {...base,id:'DEMO-B-003',sharePointItemId:'103',title:'ตรวจไฟสัญญาณและระบบไฟฟ้า',product:'B',model:'B2440',affectedProducts:['B'],affectedModels:['B2440'],result2Criteria:'',records:[]},
   {...base,id:'DEMO-L-004',sharePointItemId:'104',title:'ตรวจสภาพก่อนส่งมอบ',status:'completed',records:[record(205,'DEMO-DONE01','OK','NA')]},
   {...base,id:'DEMO-RX-005',sharePointItemId:'105',title:'งานรอกำหนดเกณฑ์ตรวจ',product:'RX',model:'RX1800',affectedProducts:['RX'],affectedModels:['RX1800'],result1Criteria:'',result2Criteria:'',records:[]}
  ];
 }
 function create(initial=fixtures()){
  const jobs=copy(initial),requests=new Map();let sequence=500;
  const member={registered:true,accessStatus:'approved',fullName:'ผู้ตรวจตัวอย่าง',nickname:'ทีมตรวจสต็อก',role:'Inspector',userId:'mock-inspector'};
  function request(action,values={}){
   if(action==='status')return copy(member);
   if(action==='register')return {status:'REGISTRATION_SUBMITTED'};
   if(action==='jobs')return copy({status:'OK',source:'MOCK:STK_Inspections',partial:false,jobs,capabilities,modelMasterSource:'DEMO fixture (ไม่ใช่ Master บริษัท)',modelMaster:[{product:'L',model:'L5018SP-CF'},{product:'M',model:'M6040'},{product:'B',model:'B2440'},{product:'RX',model:'RX1800'}]});
   if(action==='requestStatus')return copy(requests.get(values.clientRequestId)||{status:'UNKNOWN'});
   const payload=values.payload||{},requestId=values.clientRequestId;
   if(!requestId)throw Error('clientRequestId required');
   if(requests.has(requestId))return copy(requests.get(requestId));
   let job=jobs.find(j=>j.id===payload.jobKey);
   const reject=message=>{const result={status:'WRITE_REJECTED',requestId,message};requests.set(requestId,result);return copy(result)};
   if(action!=='createJob'&&!job)return reject('ไม่พบงานจำลอง');
   if(job&&(payload.itemId!==Number(job.sharePointItemId)||String(payload.expectedJobVersion)!==String(job.version)))return reject('ข้อมูล Job เปลี่ยนแล้ว กรุณาโหลดล่าสุด');
   const now=new Date().toISOString();
   if(action==='createJob'){
    job={...payload,schemaVersion:2,version:1,id:'DEMO-'+requestId,sharePointItemId:String(++sequence),title:payload.problem,product:payload.claimType,status:'new',records:[]};jobs.push(job);
   }else if(action==='updateJob'){
    if(!['new','progress'].includes(job.status))return reject('งานปิดแล้ว');
    if(job.records.length&&D.slots.some(n=>String(job['result'+n+'Criteria']||'')!==String(payload['result'+n+'Criteria']||'')))return reject('แก้เกณฑ์ที่มีผลตรวจแล้วไม่ได้');
    Object.assign(job,payload);job.version++;
   }else if(action==='selectJob'){
    if(job.status!=='new'||!D.criteria(job).length)return reject('สถานะหรือเกณฑ์งานไม่พร้อม');job.status='progress';job.version++;
   }else if(action==='saveInspection'){
    if(job.status!=='progress')return reject('งานปิดแล้ว');
    const existing=job.records.find(r=>Number(r.sharePointItemId)===payload.recordItemId);
    if(payload.recordItemId&&!existing)return reject('ไม่พบรายการเดิม');
    if(existing&&String(payload.expectedVersion)!==String(existing.version))return reject('Version ขัดแย้ง');
    if(!existing&&job.records.some(r=>!r.deleted&&r.serial.toUpperCase()===payload.serial.toUpperCase()))return reject('Serial ซ้ำภายในงาน');
    if(!D.serialPattern.test(payload.serial)||!D.validDate(payload.inspectionDate))return reject('ข้อมูลรถไม่ถูกต้อง');
    if(!D.list(job.affectedProducts?.length?job.affectedProducts:[job.product]).includes(payload.product))return reject('Product ไม่อยู่ในขอบเขตงาน');
    if(!D.list(job.affectedModels?.length?job.affectedModels:[job.model]).includes(payload.model)&&!payload.manualModelConfirmed)return reject('ต้องยืนยันรุ่นที่ไม่อยู่ในรายการ');
    const cs=D.criteria(job), before=existing?copy(existing):null;
    if(!Array.isArray(payload.changes)||payload.changes.some(c=>!cs.some(x=>x.id===c.criterionId)||!['','OK','NG','NA'].includes(c.result)))return reject('ผลรายเกณฑ์ไม่ถูกต้อง');
    const criteria=cs.map(c=>{const old=D.criterionValue(existing||{},c),change=payload.changes.find(x=>x.criterionId===c.id);return change?{...old,...change,updatedAt:now,inspector:member.fullName}:old});
    const id=existing?.id||String(++sequence),saved={...(existing||{}),schemaVersion:2,id,sharePointItemId:id,version:(existing?.version||0)+1,serial:payload.serial,product:payload.product,model:payload.model,location:payload.location,checkedAt:payload.inspectionDate,lotNo:payload.lotNo,note:payload.remarks,ngDetail:payload.ngDetail,photoUrl1:payload.photoUrl1||'',criterionResults:criteria,inspector:member.fullName,updatedAt:now,clientRequestId:requestId};
    for(const c of cs)saved['result'+c.slot]=criteria.find(x=>x.criterionId===c.id).result;
    const aggregate=D.inspection(job,saved);saved.overallResult=aggregate.overallResult;saved.isComplete=aggregate.isComplete;
    saved.auditHistory=[...(existing?.auditHistory||[]),{requestId,at:now,actor:member.fullName,version:saved.version,changes:copy(payload.changes),before,after:{product:saved.product,model:saved.model,location:saved.location,checkedAt:saved.checkedAt,note:saved.note,criterionResults:copy(criteria)}}];
    // Avoid recursively embedding history inside history.
    if(saved.auditHistory.at(-1).before)delete saved.auditHistory.at(-1).before.auditHistory;
    if(existing)Object.assign(existing,saved);else job.records.push(saved);
   }else if(action==='finishJob'){
    if(!job.records.length||D.summary([job]).incomplete)return reject('ยังตรวจไม่ครบ');job.status='completed';job.version++;
   }else return reject('Mock action ไม่รองรับ');
   job.updated=now;job.clientRequestId=requestId;
   const response={status:'WRITE_REQUEST_ACCEPTED',requestId,mock:true};requests.set(requestId,response);return copy(response);
  }
  return {request};
 }
 return {create,fixtures};
});
