/* Shared domain rules; no DOM, network, tokens, or storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockDomain = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const slots = [1, 2, 3, 4];
  const text = value => String(value ?? '').trim();
  const code = value => text(value).toUpperCase();
  const isChecked = value => ['OK', 'NG'].includes(code(value));
  const serialPattern = /^[A-Z0-9_.-]{3,65}$/;
  function inspection(job, record) {
    const criteria = slots.filter(n => text(job['result' + n + 'Criteria']) || isChecked(record['result' + n]));
    const checked = criteria.filter(n => isChecked(record['result' + n])).length;
    const complete = criteria.length > 0 && checked === criteria.length;
    const values = slots.map(n => code(record['result' + n]));
    // Individual criteria are authoritative; use legacy aggregate only when none exist.
    const ng = values.includes('NG') || (!checked && [record.result, record.overallResult].some(v => code(v) === 'NG'));
    return { status: ng ? 'NG' : complete ? 'OK' : 'pending', checked, total: criteria.length, complete };
  }
  function summary(jobs) {
    const counts = { total: 0, OK: 0, NG: 0, pending: 0, incomplete: 0, complete: 0 };
    for (const job of jobs) for (const record of job.records || []) {
      if (record.deleted === true || /^(true|1|yes|deleted)$/i.test(text(record.deleted))) continue;
      const result = inspection(job, record);
      counts.total++; counts[result.status]++;
      counts[result.complete ? 'complete' : 'incomplete']++;
    }
    return counts;
  }
  function parseQR(raw) {
    const input = text(raw);
    if (!input || input.length > 2048) throw Error('QR ไม่มีข้อมูลหรือยาวเกินกำหนด');
    let serial;
    if (input.startsWith('{')) {
      let data;
      try { data = JSON.parse(input); } catch { throw Error('QR JSON ไม่ถูกต้อง'); }
      if (!data || Array.isArray(data) || typeof data !== 'object') throw Error('รูปแบบ QR ไม่รองรับ');
      const keys = ['serial', 'serialNumber', 'SerialNumber', 'SN'].filter(k => Object.hasOwn(data, k));
      if (keys.length !== 1 || typeof data[keys[0]] !== 'string') throw Error('QR ต้องมี Serial เพียงค่าเดียว');
      serial = data[keys[0]];
    } else if (/[=;|\n]/.test(input)) {
      const parts = input.split(/[;|\n]/).map(v => v.trim());
      if (parts.some(v => !/^[A-Za-z][A-Za-z0-9_]*=[^=]+$/.test(v))) throw Error('รูปแบบข้อมูลหลายส่วนใน QR ไม่รองรับ');
      const pairs = parts.map(v => v.split('='));
      const matches = pairs.filter(([key]) => /^(serial|serialnumber|sn)$/i.test(key));
      if (matches.length !== 1) throw Error('QR ต้องมี Serial เพียงค่าเดียว');
      serial = matches[0][1];
    } else serial = input;
    serial = code(serial);
    if (!serialPattern.test(serial)) throw Error('Serial ใน QR ไม่ถูกต้อง ใช้ A–Z, 0–9, จุด, ขีด หรือขีดล่าง 3–65 ตัว');
    return serial;
  }
  function validDate(value, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && (!today || value <= today);
  }
  function urlValue(value) { return text(value && typeof value === 'object' ? value.Url || value.url : value); }
  function normalizeFields(source, kind) {
    const obj = { ...(source.fields || {}), ...source };
    const map = kind === 'job' ? {
      id: ['JobKey', 'JobID', 'Title'], sharePointItemId: ['ID', 'Id'], title: ['Problem', 'Title'],
      product: ['Product'], model: ['Model'], claimCategory: ['ClaimCategory'], status: ['Status', 'JobStatus'],
      targetUnits: ['TargetUnits'], notes: ['Notes'], checkingMethod: ['CheckingMethod'],
      okPictureUrl: ['OKPictureURL'], ngPictureUrl: ['NGPictureURL'], reportUrl: ['ReportURL']
    } : {
      id: ['ID', 'Id'], sharePointItemId: ['ID', 'Id'], serial: ['SerialNumber', 'Serial'],
      model: ['Model'], checkedAt: ['InspectionDate'], note: ['Remarks'], ngDetail: ['NGDetail'],
      photoUrl1: ['PhotoURL1'], overallResult: ['OverallResult'], inspector: ['Inspector'], lotNo: ['LotNo']
    };
    for (const [key, aliases] of Object.entries(map)) {
      if (obj[key] == null) obj[key] = aliases.map(alias => obj[alias]).find(v => v != null);
    }
    for (const n of slots) {
      const key = kind === 'job' ? 'result' + n + 'Criteria' : 'result' + n;
      obj[key] ??= obj[key[0].toUpperCase() + key.slice(1)];
    }
    for (const key of ['okPictureUrl', 'ngPictureUrl', 'photoUrl1', 'reportUrl']) if (obj[key] != null) obj[key] = urlValue(obj[key]);
    return obj;
  }
  return { inspection, summary, parseQR, validDate, normalizeFields, serialPattern };
});
