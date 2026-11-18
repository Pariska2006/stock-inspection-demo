/* v2 domain: blank=Pending, explicit NA, independent completion. No I/O. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockDomain=api})(globalThis,function(){
 'use strict';
 const slots=Array.from({length:20},(_,i)=>i+1);
 const text=v=>String(v??'').trim(), code=v=>text(v).toUpperCase();
 const serialPattern=/^[A-Z0-9_.-]{3,65}$/;
 const decided=v=>['OK','NG'].includes(code(v));
 const json=(v,fallback)=>{if(typeof v!=='string')return v??fallback;try{return JSON.parse(v)}catch{return fallback}};
 const list=v=>[...new Set((Array.isArray(v)?v:typeof v==='string'?v.split(/[,;\n]/):[]).map(text).filter(Boolean))];
 function criteria(job,record={}){
  const defined=Array.isArray(job.criteria)?job.criteria:[];
  return slots.filter(n=>text(job['result'+n+'Criteria'])||defined.some(c=>c.slot===n)||decided(record['result'+n])).map(n=>({id:defined.find(c=>c.slot===n)?.id||'C'+n,slot:n,label:defined.find(c=>c.slot===n)?.label||text(job['result'+n+'Criteria'])||'เกณฑ์ข้อ '+n+' (ไม่ระบุชื่อ)'}));
 }
 function result(record,criterion){
  const item=(record.criterionResults||[]).find(r=>r.criterionId===criterion.id);
  const raw=code(item?.result??record['result'+criterion.slot]);
  // Old NA meant unchecked. Never silently migrate it to explicit not-applicable.
  // Old and new NA are shown as unfinished until rechecked.
  return decided(raw)?raw:'';
 }
 function inspection(job,record){
  const cs=criteria(job,record), values=cs.map(c=>result(record,c));
  const checked=values.filter(decided).length, complete=cs.length>0&&checked===cs.length;
  const ng=values.includes('NG')||(!checked&&code(record.overallResult||record.result)==='NG');
  const status=ng?'NG':!complete?'pending':'OK';
  return {status,overallResult:status==='pending'?'Pending':status,isComplete:complete,complete,checked,total:cs.length};
 }
 function summary(jobs){
  const counts={total:0,inspected:0,OK:0,NG:0,pending:0,NA:0,incomplete:0,complete:0};
  for(const job of jobs)for(const r of job.records||[]){if(r.deleted===true||/^(true|1|yes|deleted)$/i.test(text(r.deleted)))continue;const x=inspection(job,r);counts.total++;counts[x.status]++;if(x.checked)counts.inspected++;counts[x.complete?'complete':'incomplete']++}return counts;
 }
 function criterionValue(record,c){const value=(record.criterionResults||[]).find(r=>r.criterionId===c.id)||{};return {criterionId:c.id,result:result(record,c),note:text(value.note),ngDetail:text(value.ngDetail),updatedAt:value.updatedAt||'',inspector:text(value.inspector)}}
 function changes(job,before,after){return criteria(job,after).map(c=>{const a=criterionValue(before||{},c),b=criterionValue(after,c);return ['result','note','ngDetail'].some(k=>a[k]!==b[k])?{criterionId:c.id,result:b.result,note:b.note,ngDetail:b.ngDetail}:null}).filter(Boolean)}
 function parseLabel(raw){
  const input=text(raw);if(!input||input.length>4096)throw Error('QR ไม่มีข้อมูลหรือยาวเกินกำหนด');
  let pairs=[];
  if(input.startsWith('{')){let d;try{d=JSON.parse(input)}catch{throw Error('QR JSON ไม่ถูกต้อง')}if(!d||Array.isArray(d)||typeof d!=='object')throw Error('รูปแบบ QR ไม่รองรับ');pairs=Object.entries(d)}
  // Kubota factory QR labels use TAB-delimited prefixes such as PIN, MD, SN and WGN.
  else if(input.includes('\t')){
    const fields=input.split(/\t+/).map(part=>part.trim()).filter(Boolean);
    const labels=['PIN','WGN','MD','SN','EMC','ESN'];
    pairs=fields.map(part=>{
      const label=labels.find(prefix=>part.toUpperCase().startsWith(prefix));
      if(!label||part.length<=label.length)throw Error('QR ป้ายรถมีช่องข้อมูลที่ไม่รองรับ');
      return [label==='WGN'?'model':label,part.slice(label.length).trim()];
    });
    if(!pairs.some(([name])=>name==='PIN'))throw Error('QR นี้ไม่มี PIN กรุณาสแกน QR บนป้ายรถ');
  }
  else if(/[=:;|\n]/.test(input)){pairs=input.split(/[;|\n]/).filter(v=>v.trim()).map(v=>{const m=v.match(/^\s*([^=:]+?)\s*[:=]\s*(.+?)\s*$/);if(!m)throw Error('รูปแบบ QR หลายส่วนไม่รองรับ');return [m[1],m[2]]})}
  else {const serial=code(input);if(!serialPattern.test(serial))throw Error('Serial ใน QR ไม่ถูกต้อง');return {serial,pin:'',model:'',identifierType:'unlabelled',fields:[]}}
  const key=s=>text(s).toLowerCase().replace(/[\s_./-]/g,'');
  const matches=keys=>pairs.filter(([k])=>keys.includes(key(k)));
  const pins=matches(['pin','productidentificationnumber']), serials=matches(['serial','serialnumber','sn']), models=matches(['model']);
  if(pins.length>1||serials.length>1||models.length>1)throw Error('QR มีรหัสชนิดเดียวกันซ้ำหรือไม่ชัดเจน');
  const chosen=pins[0]||serials[0];
  if(!chosen||typeof chosen[1]!=='string')throw Error('ไม่พบ PIN หรือ Serial ที่ระบุชัดเจน ห้ามใช้ Engine S/N หรือ Material Number แทน');
  const serial=code(chosen[1]);if(!serialPattern.test(serial))throw Error('Serial ใน QR ไม่ถูกต้อง');
  const model=typeof models[0]?.[1]==='string'?text(models[0][1]):'';
  return {serial,pin:pins.length?serial:'',model,identifierType:pins.length?'PIN':'Serial',fields:pairs.map(([k,v])=>({label:text(k),value:typeof v==='string'?text(v):''}))};
 }
 const parseQR=raw=>parseLabel(raw).serial;
 function validDate(value,today){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&(!today||value<=today)}
 const urlValue=v=>text(v&&typeof v==='object'?v.Url||v.url:v);
 function normalizeFields(source,kind){
  const obj={...(source.fields||{}),...source};
  const map=kind==='job'?{id:['JobKey','JobID'],sharePointItemId:['ID','Id'],title:['Problem','Title'],product:['Product'],model:['Model'],claimCategory:['ClaimCategory'],status:['Status','JobStatus'],targetUnits:['TargetUnits'],notes:['Notes'],checkingMethod:['CheckingMethod'],okPictureUrl:['OKPictureURL'],ngPictureUrl:['NGPictureURL'],methodPictureUrl:['MethodPictureURL'],reportUrl:['ReportURL'],criteria:['CriteriaJSON'],affectedModels:['AffectedModels'],affectedProducts:['AffectedProducts']}:{id:['ID','Id'],sharePointItemId:['ID','Id'],serial:['PIN','SerialNumber','Serial'],product:['Product'],model:['Model'],checkedAt:['InspectionDate'],note:['Remarks'],ngDetail:['NGDetail'],photoUrl1:['PhotoURL1'],overallResult:['OverallResult'],inspector:['Inspector'],lotNo:['LotNo'],location:['Location'],criterionResults:['CriterionResultsJSON'],auditHistory:['AuditHistoryJSON'],schemaVersion:['SchemaVersion']};
  Object.assign(map,{version:['Version','@odata.etag'],clientRequestId:['ClientRequestID'],updatedAt:['Modified']});
  for(const [k,aliases]of Object.entries(map))if(obj[k]==null)obj[k]=aliases.map(a=>obj[a]).find(v=>v!=null);
  for(const n of slots){const k=kind==='job'?'result'+n+'Criteria':'result'+n;obj[k]??=obj[k[0].toUpperCase()+k.slice(1)]}
  for(const k of ['okPictureUrl','ngPictureUrl','methodPictureUrl','photoUrl1','reportUrl'])if(obj[k]!=null)obj[k]=urlValue(obj[k]);
  if(kind==='job'){
   obj.criteria=json(obj.criteria,[]);if(!Array.isArray(obj.criteria))obj.criteria=[];
   obj.criteria=obj.criteria.map((c,i)=>({id:text(c.id)||'C'+(i+1),label:text(c.label),slot:Number(c.slot)||i+1}));
   for(const c of obj.criteria)if(slots.includes(c.slot))obj['result'+c.slot+'Criteria']=c.label;
   obj.affectedProducts=list(json(obj.affectedProducts,obj.affectedProducts));obj.affectedModels=list(json(obj.affectedModels,obj.affectedModels));
  }else{
   obj.criterionResults=json(obj.criterionResults,[]);if(!Array.isArray(obj.criterionResults))obj.criterionResults=[];
   obj.auditHistory=json(obj.auditHistory,[]);if(!Array.isArray(obj.auditHistory))obj.auditHistory=[];
  }
  return obj;
 }
 return {slots,criteria,result,criterionValue,changes,inspection,summary,parseLabel,parseQR,validDate,normalizeFields,serialPattern,list,decided};
});
