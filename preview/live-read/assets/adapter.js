/* Auth transport supplied by app. Pagination/retries are read-only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockAdapter=api})(globalThis,function(){
 'use strict';
 async function readPages(read){
  let cursor='',pages=0,partial=false,first;const seen=new Set(),jobs=new Map();
  do{
   if(seen.has(cursor)||++pages>100)throw Error('Pagination ไม่สมบูรณ์ กรุณาตรวจบริการอ่านข้อมูล');seen.add(cursor);
   let page;
   for(let attempt=0;attempt<2;attempt++){try{page=await read(cursor);break}catch(error){if(error.auth||attempt)throw error}}
   if(page.status!=='OK'||!Array.isArray(page.jobs))throw Error('อ่านรายการงานไม่สำเร็จ');first??=page;partial ||= !!page.partial;
   for(const job of page.jobs){const id=String(job?.id||job?.JobKey||'');if(!id){partial=true;continue}const old=jobs.get(id);
    if(!old){jobs.set(id,structuredClone(job));continue}
    if(String(old.version)!==String(job.version))throw Error('ข้อมูลเปลี่ยนระหว่างอ่านหลายหน้า กรุณารีเฟรช');
    const records=new Map((old.records||[]).map((r,i)=>[String(r.id||r.sharePointItemId||'missing-'+i),r]));
    for(const r of job.records||[]){const k=String(r.id||r.sharePointItemId||'');if(!k){partial=true;continue}if(records.has(k)&&JSON.stringify(records.get(k))!==JSON.stringify(r))throw Error('ผลตรวจซ้ำไม่ตรงกันระหว่างหน้า');records.set(k,r)}old.records=[...records.values()];
   }
   cursor=typeof page.nextCursor==='string'?page.nextCursor:'';
   if(page.nextLink&&!cursor)throw Error('บริการอ่านต้องส่ง cursor ที่ได้รับอนุญาต ไม่ใช่ URL ภายนอก');
  }while(cursor);
  return {...first,jobs:[...jobs.values()],partial,nextCursor:null};
 }
 function canWrite(capabilities){return capabilities?.inspectionV2===true&&capabilities?.atomicVersions===true&&capabilities?.requestStatus===true&&capabilities?.auditHistory===true}
 function photoConfirmed(entry,job){const record=entry.slot==='1'?(job.records||[]).find(r=>Number(r.sharePointItemId)===entry.itemId):job;const key=entry.slot==='1'?'photoUrl1':entry.slot==='ok'?'okPictureUrl':entry.slot==='ng'?'ngPictureUrl':'methodPictureUrl';return !!record&&record[key+'RequestId']===entry.requestId&&/^https:\/\//.test(record[key]||'')?record[key]:''}
 return {readPages,canWrite,photoConfirmed};
});
