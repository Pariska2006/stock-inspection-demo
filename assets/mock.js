/* Isolated in-memory fixture adapter. Refresh resets fixtures; no production calls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domain.js'));
  else root.StockMock = factory(root.StockDomain);
})(typeof globalThis === 'object' ? globalThis : this, function (domain) {
  'use strict';
  const copy = value => structuredClone(value);
  function fixtures() {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    const record = (id, serial, result1, result2) => ({ id: String(id), sharePointItemId: String(id), serial, model: 'L5018', checkedAt: date, result1, result2, result3:'NA', result4:'NA', inspector: 'ผู้ตรวจตัวอย่าง', note: '', ngDetail: result1 === 'NG' ? 'ไม่มีรอยรั่วบริเวณข้อต่อ' : '', photoUrl1: '' });
    const base = { product:'L', model:'L5018', claimCategory:'Quick Report', status:'progress', checkingMethod:'ตรวจบริเวณข้อต่อและสายไฮดรอลิกด้วยสายตา หลังดับเครื่องยนต์และจอดบนพื้นราบ', result1Criteria:'ไม่มีรอยรั่วบริเวณข้อต่อ', result2Criteria:'สายไฮดรอลิกไม่มีรอยแตกร้าว', targetUnits:12, startedAt:date, updated:date, notes:'ข้อมูลจำลองสำหรับตรวจสอบหน้าจอเท่านั้น' };
    return [
      { ...base, id:'DEMO-L-001', sharePointItemId:'101', title:'ตรวจสอบชุดไฮดรอลิก', records:[record(204,'DEMO-L004','NA','NA'),record(203,'DEMO-L003','OK','NA'),record(202,'DEMO-L002','NG','NA'),record(201,'DEMO-L001','OK','OK')] },
      { ...base, id:'DEMO-M-002', sharePointItemId:'102', title:'ตรวจจุดยึดฝาครอบเครื่องยนต์', product:'M', model:'M6040', claimCategory:'Hotline', status:'new', targetUnits:8, records:[] },
      { ...base, id:'DEMO-B-003', sharePointItemId:'103', title:'ตรวจไฟสัญญาณและระบบไฟฟ้า', product:'B', model:'B2440', result1Criteria:'ไฟสัญญาณทำงาน', result2Criteria:'', records:[] },
      { ...base, id:'DEMO-L-004', sharePointItemId:'104', title:'ตรวจสภาพก่อนส่งมอบ', status:'completed', records:[record(205,'DEMO-DONE01','OK','OK')] },
      { ...base, id:'DEMO-RX-005', sharePointItemId:'105', title:'งานรอกำหนดเกณฑ์ตรวจ', product:'RX', model:'RX1800', result1Criteria:'', result2Criteria:'', records:[] }
    ];
  }
  function create(initial = fixtures()) {
    let jobs = copy(initial), sequence = 500;
    const requests = new Map();
    const member = { registered:true, accessStatus:'approved', fullName:'ผู้ตรวจตัวอย่าง', nickname:'ทีมตรวจสต็อก', role:'Inspector', userId:'mock-inspector' };
    function request(action, values = {}) {
      if (action === 'status') return copy(member);
      if (action === 'register') return { status:'REGISTRATION_SUBMITTED' };
      if (action === 'jobs') return copy({ status:'OK', source:'MOCK:STK_Inspections', partial:false, jobs });
      const payload = values.payload || {};
      const requestId = values.clientRequestId;
      if (!requestId) throw Error('Mock requires clientRequestId');
      if (requests.has(requestId)) return copy(requests.get(requestId));
      let job = jobs.find(item => item.id === payload.jobKey);
      if (action !== 'createJob' && !job) throw Error('ไม่พบงานจำลอง');
      if (job && payload.itemId !== Number(job.sharePointItemId)) throw Error('Job ID ไม่ตรงกัน');
      if (action === 'createJob') {
        job = { ...payload, id:'DEMO-' + requestId, sharePointItemId:String(++sequence), title:payload.problem, product:payload.claimType, status:'new', records:[], clientRequestId:requestId };
        jobs.push(job);
      } else if (action === 'updateJob') {
        if (!['new','progress'].includes(job.status)) throw Error('งานปิดแล้ว');
        Object.assign(job, payload);
      } else if (action === 'selectJob') {
        if (job.status !== 'new') throw Error('งานเริ่มแล้ว');
        job.status = 'progress';
      } else if (action === 'saveInspection') {
        if (job.status !== 'progress') throw Error('งานปิดแล้ว');
        const existing = job.records.find(record => Number(record.sharePointItemId) === payload.recordItemId);
        if (payload.recordItemId && !existing) throw Error('ไม่พบรายการเดิม');
        if (!existing && job.records.some(record => !record.deleted && record.serial.toUpperCase() === payload.serial.toUpperCase())) throw Error('Serial ซ้ำภายในงาน');
        const id = existing?.id || String(++sequence);
        const saved = { ...payload, id, sharePointItemId:id, checkedAt:payload.inspectionDate, note:payload.remarks, inspector:member.fullName, clientRequestId:requestId };
        if (existing) Object.assign(existing, saved);
        else job.records.push(saved);
      } else if (action === 'finishJob') {
        if (!job.records.length || domain.summary([job]).incomplete) throw Error('ยังมีรายการตรวจไม่ครบ');
        job.status = 'completed';
      } else throw Error('Mock action ไม่รองรับ');
      job.updated = new Date().toISOString();
      const response = { status:'WRITE_REQUEST_ACCEPTED', requestId, mock:true };
      requests.set(requestId, response);
      return copy(response);
    }
    return { request };
  }
  return { create, fixtures };
});
