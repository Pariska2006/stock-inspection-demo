'use strict';
const CONFIG = window.STOCK_CONFIG || {};
const MOCK = CONFIG.mode === 'mock';
const mockAdapter = MOCK ? StockMock.create() : null;
const LIFF_ID = CONFIG.liffId;
const API_URL = CONFIG.usersReadUrl;
const JOBS_API_URL = CONFIG.jobsReadUrl;
const WRITE_API_URL = CONFIG.writeGatewayUrl;
const PHOTO_UPLOAD_API_URL = MOCK ? '' : CONFIG.photoGatewayUrl;
const registrationAllowed = () => MOCK || (CONFIG.mode === 'live' && CONFIG.writesEnabled === true && CONFIG.integrationVerified === true);
const liveWritesAllowed = () => MOCK || (CONFIG.mode === 'live' && CONFIG.writesEnabled === true && CONFIG.integrationVerified === true && StockAdapter.canWrite(app.capabilities));
let registering = false;
let sessionEpoch = 0;
const DOMAIN = StockDomain;
const isDecided = value => DOMAIN.decided(value);
const selectedProducts = job => DOMAIN.list(job?.affectedProducts?.length ? job.affectedProducts : [job?.product]);
const selectedModels = job => DOMAIN.list(job?.affectedModels?.length ? job.affectedModels : [job?.model]);

const $ = id => document.getElementById(id);
const text = value => String(value ?? '').trim();
const val = id => text($(id)?.value);
const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);
const icon = name => `<svg class="ico sm" aria-hidden="true"><use href="#ic-${name}"></use></svg>`;
const KNOWN_CLAIM_TYPES = ['Quick Report', 'Hotline', 'Yard claim'];
const GROUPS = ['M', 'MU', 'L', 'B', 'RX', 'FGL'];
const SLOTS = StockDomain.slots;
const PHOTOS = [1]; // One serial-number evidence photo per inspected vehicle
// Enable only when both write and read flows support inspection deletion.
const ENABLE_DELETE_INSPECTION = false;
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const STATUS = {
  unknown: 'ไม่ทราบสถานะ', new: 'รอเริ่มตรวจ', progress: 'กำลังดำเนินการ', completed: 'รอรายงาน',
  'waiting-report': 'รอรายงาน', 'report-ready': 'เสร็จสมบูรณ์', closed: 'เสร็จสมบูรณ์'
};
const TITLES = {
  reportpreview: 'Report Preview', home: 'Stock Inspection', choose: 'เลือกงานตรวจ', jobs: 'งานตรวจ', overview: 'Monthly Overview', monthdetail: 'Monthly Overview', reports: 'Reports',
  profile: 'Profile', recorddetail: 'ผลตรวจรายคัน', jobdetail: 'รายละเอียดงาน', jobform: 'จัดการงานตรวจ', inspection: 'ผลตรวจรายคัน'
};
const GATES = ['gateLoading', 'gateLogin', 'gateRegister', 'gatePending', 'gateBlocked', 'gateError'];
const TIME_ZONE = 'Asia/Bangkok';
const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const thaiDate = new Intl.DateTimeFormat('th-TH', {
  timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric'
});

function dateValue(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !StockDomain.validDate(value.slice(0, 10))) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(ymdFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const app = {
  capabilities: {}, modelMaster: [], modelMasterSource: '', transfers: [], reportKind: 'job', reportSerial: '', vehicleGroup: true,
  ready: false, initializing: false, deleteEnabled: false, member: null, line: null, nickname: '', jobs: [], page: 'home',
  group: '', claimFilter: '', modelFilter: '', jobState: '', claimTypes: KNOWN_CLAIM_TYPES, products: GROUPS, search: '', selected: '', editJob: false, editRecord: '', viewRecord: '',
  stars: new Set(),
  jobsLoading: false, jobsLive: false, recordRead: false, loaded: false, loadError: '', partial: false,
  yearsVisible: 1, jobsLoadedAt: '', month: '', monthFilter: 'all',
  reportMonth: '', reportJob: '', reportFilter: 'all', recordFilter: 'all', detailOrigin: 'jobs', detailMessage: null,
  inspectionBaseline: '', busy: false, pending: new Map(), photos: new Map(), uploadDraft: '', dirty: false
};

function safeLink(value) {
  const raw = text(value);
  if (!/^https:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    return url.hostname && !url.username && !url.password ? raw : '';
  } catch {
    return '';
  }
}

function gate(which, message = '', error = false) {
  $('accessGate').hidden = false;
  $('appMain').hidden = true;
  GATES.forEach(id => $(id).hidden = id !== which);
  $('gateMessage').textContent = message;
  $('gateMessage').className = 'gate-state' + (error ? ' error' : '');
}

async function fetchJson(url, options, timeout = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(error => {
      if (error.name === 'AbortError') throw error;
      return null;
    });
    if (response.status === 401 || response.status === 403) {
      app.jobsLive = false;
      app.member = null;
      gate(response.status === 401 ? 'gateLogin' : 'gateBlocked', 'สิทธิ์ใช้งานหมดอายุหรือถูกระงับ กรุณาตรวจสอบบัญชีใหม่', true);
      const error = Error('สิทธิ์ใช้งานหมดอายุหรือถูกระงับ');
      error.auth = true;
      throw error;
    }
    if (!response.ok) throw Error('เชื่อมต่อไม่สำเร็จ (HTTP ' + response.status + ')');
    if (!data) throw Error('ระบบตอบกลับในรูปแบบที่อ่านไม่ได้');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw Error('การเชื่อมต่อใช้เวลานานเกินไป');
    if (error instanceof TypeError) throw Error('เครือข่ายไม่พร้อม กรุณาตรวจสอบอินเทอร์เน็ต');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function idToken() {
  const token = app.ready && window.liff?.isLoggedIn() && liff.getIDToken();
  if (!token) throw Error('กรุณาเข้าสู่ระบบ LINE ใหม่');
  return token;
}

async function post(url, action, values = {}, timeout) {
  const read = ['status', 'jobs', 'requestStatus', 'modelMaster'].includes(action);
  if (!read && !(action==='register'?registrationAllowed():liveWritesAllowed())) throw Error('ยังไม่เปิดการบันทึกข้อมูลจริง รอทดสอบการเชื่อมต่อที่ได้รับอนุญาต');
  if (MOCK) { await delay(120); return mockAdapter.request(action, values); }
  if (!safeLink(url)) throw Error('ยังไม่ตั้งค่าบริการที่ได้รับอนุญาต');
  return fetchJson(url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...values, action, idToken: idToken() })
  }, timeout);
}

async function checkAccess() {
  if (app.busy) return;
  if (!app.ready) return init();
  if (!MOCK && !liff.isLoggedIn()) {
    resetSession();
    return gate('gateLogin');
  }
  gate('gateLoading', 'กำลังตรวจสอบบัญชี');
  try {
    const data = await post(API_URL, 'status');
    if (data.registered && text(data.accessStatus).toLowerCase() === 'approved') {
      openApp(data);
      return;
    }
    resetSession();
    if (data.registered) return gate(text(data.accessStatus).toLowerCase() === 'pending' ? 'gatePending' : 'gateBlocked');
    if (data.status === 'NOT_REGISTERED') {
      $('gateRegisterButton').disabled = !registrationAllowed();
      return gate('gateRegister', registrationAllowed() ? '' : 'ยังไม่เปิดระบบลงทะเบียนจริง');
    }
    throw Error(data.message || 'ตรวจสอบสิทธิ์ไม่สำเร็จ');
  } catch (error) {
    if (error.auth) return;
    gate('gateError', error.message, true);
  }
}

function loginLine() {
  if (MOCK) return checkAccess();
  if (!app.ready) return init();
  if (liff.isLoggedIn()) return checkAccess();
  liff.login({ redirectUri: location.origin + location.pathname });
}

function resetSession() {
  sessionEpoch++;
  StockQR.stop();
  clearPhotoDraft();
  Object.assign(app, {
    member: null, jobs: [], jobsLive: false, loaded: false, recordRead: false, partial: false, loadError: '',
    selected: '', editJob: false, editRecord: '', deleteEnabled: false, inspectionBaseline: '', jobsLoading: false,
    detailMessage: null, dirty: false, busy: false, group: '', claimFilter: '', search: '', stars: new Set(),
    claimTypes: KNOWN_CLAIM_TYPES, products: GROUPS, month: '', monthFilter: 'all', yearsVisible: 1, jobsLoadedAt: ''
  });
  app.pending.clear();
}

async function logoutLine() {
  if (app.busy) return;
  if (!await confirmAction('ยืนยันการออกจากระบบ', 'ต้องการออกจากระบบตรวจสต็อกบนอุปกรณ์นี้หรือไม่', 'ออกจากระบบ', 'danger')) return;
  if (!MOCK && app.ready && liff.isLoggedIn()) liff.logout();
  resetSession();
  app.line = null;
  $('gateAvatar').hidden = true;
  $('gateAvatar').removeAttribute('src');
  $('gateDisplayName').textContent = 'สมาชิก LINE';
  gate('gateLogin', 'ออกจากระบบแล้ว');
}

async function register(event) {
  event.preventDefault();
  if (registering) return;
  if (!registrationAllowed()) return gate('gateRegister', 'ยังไม่เปิดระบบลงทะเบียนจริง', true);
  const fullName = val('gateFullName'), nickname = val('gateNickName');
  if (!fullName || !nickname) {
    gate('gateRegister', 'กรุณากรอกชื่อและชื่อเล่น', true);
    return;
  }
  registering = true;
  $('gateRegisterButton').disabled = true;
  try {
    const data = await post(CONFIG.registrationWriteUrl, 'register', { fullName, nickname });
    if (['REGISTRATION_SUBMITTED', 'REGISTRATION_REQUEST_ACCEPTED'].includes(data.status)) {
      $('gateRegisterForm').reset();
      gate('gatePending', 'ส่งคำขอแล้ว');
    } else if (data.registered) await checkAccess();
    else throw Error(data.message || 'ส่งคำขอไม่สำเร็จ');
  } catch (error) {
    gate('gateRegister', error.message, true);
  } finally {
    registering = false;
    $('gateRegisterButton').disabled = false;
  }
}

function renameProfile(nickname) {
  const display = text(nickname) || text(app.member?.nickname) || text(app.line?.displayName) || 'สมาชิก';
  app.nickname = display;
  for (const id of ['topName', 'profileName', 'greetingName']) $(id).textContent = display;
  for (const id of ['topAvatarFallback', 'profileFallback', 'greetingAvatarFallback']) $(id).textContent = Array.from(display)[0];
  $('memberFullName').textContent = app.member?.displayName || app.member?.fullName || display;
}

function setAvatar(imageId, fallbackId, url) {
  const img = $(imageId);
  img.hidden = !url;
  if (fallbackId) $(fallbackId).hidden = !!url;
  if (url) img.src = url;
  else img.removeAttribute('src');
}

function openApp(member) {
  app.member = member;
  app.stars = readStars();
  restorePending();
  restoreTransfers();
  purgeExpiredDrafts();
  app.jobsLoading = false;
  $('accessGate').hidden = true;
  $('appMain').hidden = false;
  renameProfile(member.nickname);
  $('memberRole').textContent = member.role || 'Inspector';
  const avatar = safeLink(app.line?.pictureUrl);
  setAvatar('topAvatar', 'topAvatarFallback', avatar);
  setAvatar('greetingAvatar', 'greetingAvatarFallback', avatar);
  setAvatar('profileAvatar', 'profileFallback', avatar);
  navigate('home');
  loadJobs();
}

function normalStatus(value) {
  const status = text(value).toLowerCase().replace(/[\s_]+/g, '-');
  if (['in-progress', 'selected', 'รอดำเนินการ', 'กำลังดำเนินการ', 'กำลังตรวจ'].includes(status)) return 'progress';
  if (status === 'รอเริ่มตรวจ') return 'new';
  return Object.hasOwn(STATUS, status) ? status : 'unknown';
}

function photoSlots(record) {
  const urls = PHOTOS.map(slot => safeLink(record['photoUrl' + slot]));
  const photos = Array.isArray(record.photos) ? record.photos : [];
  for (const [index, photo] of photos.entries()) {
    const inferred = text(photo?.label || photo?.name).match(/([1-3])\s*$/)?.[1];
    const slot = Number(photo?.slot || inferred || index + 1);
    if (PHOTOS.includes(slot)) urls[slot - 1] ||= safeLink(photo?.url || photo);
  }
  return urls;
}

function normalizeJob(job) {
  job = StockDomain.normalizeFields(job, 'job');
  const metadata = decodeJobNotes(job.notes);
  const rawClaim = text(job.claimType);
  const sourceProduct = text(job.product || job.sourceSheet).replace(/^Claim[-_]/i, '').toUpperCase();
  const legacyProduct = rawClaim.replace(/^Claim[-_]/i, '').toUpperCase();
  const claimAsProduct = GROUPS.includes(legacyProduct);
  const records = (Array.isArray(job.records) ? job.records : [])
    .filter(Boolean).map(record => StockDomain.normalizeFields(record, 'record'))
    .map((record, index) => ({
      ...record, ...Object.fromEntries(DOMAIN.criteria(job, record).map(c => ['result'+c.slot, DOMAIN.result(record,c)])), id: text(record.id || record.sharePointItemId || record.serial || 'missing-record-' + index),
      serial: text(record.serial), checkedAt: record.checkedAt || record.inspectionDate,
      note: record.note ?? record.remarks ?? '',
      deleted: record.deleted === true || /^(true|1|yes|deleted)$/i.test(text(record.deleted)),
      photoSlots: photoSlots(record)
    }));
  const mappedStatus = normalStatus(job.status);
  const status = mappedStatus === 'new' && normalStatus(job.jobStatusRaw) === 'progress' ? 'progress' : mappedStatus;
  const url = safeLink(job.reportUrl);
  const reportState = url && isWaiting(status) ? 'report-ready' :
    !url && status === 'report-ready' ? 'waiting-report' : status;
  return {
    ...job, id: text(job.id), sharePointItemId: text(job.sharePointItemId),
    title: text(job.title || job.problem) || 'งานตรวจสต็อก',
    ...metadata,
    startedBy: text(job.startedBy || job.selectedBy) || metadata.startedBy,
    startedAt: dateValue(job.startedAt) || metadata.startedAt,
    product: sourceProduct || (claimAsProduct ? legacyProduct : ''),
    claimCategory: claimCategory(job.claimCategory || job.claimReportType || metadata.claimCategory || (!claimAsProduct ? rawClaim : '')),
    model: text(job.model), affectedModels: job.affectedModels?.length ? job.affectedModels : DOMAIN.list([job.model]),
    affectedProducts: job.affectedProducts?.length ? job.affectedProducts : DOMAIN.list([sourceProduct || legacyProduct]), status: reportState, records
  };
}

function sortJobs(a, b) {
  const groupOrder = key => GROUPS.includes(key) ? GROUPS.indexOf(key) : GROUPS.length;
  return groupOrder(a.product) - groupOrder(b.product) || text(b.updated).localeCompare(text(a.updated));
}

async function readJobs(timeout) {
  const data = await StockAdapter.readPages(cursor => post(JOBS_API_URL, 'jobs', { cursor }, timeout));
  return data;
}

function applyJobs(data) {
  app.capabilities = data.capabilities || {};
  app.modelMaster = Array.isArray(data.modelMaster) ? data.modelMaster.filter(row => row && text(row.product) && text(row.model)).map(row => ({product:text(row.product),model:text(row.model)})) : [];
  app.modelMasterSource = text(data.modelMasterSource);
  const normalized = data.jobs.filter(Boolean).map(normalizeJob);
  app.jobs = normalized.filter(job => job.id).sort(sortJobs);
  const listChoices = data.choices?.claimCategory ?? data.choices?.claimType ?? data.claimCategories;
  const categories = Array.isArray(listChoices) ? listChoices.map(claimCategory).filter(Boolean) : [];
  app.claimTypes = [...new Set([...KNOWN_CLAIM_TYPES, ...categories, ...app.jobs.map(job => job.claimCategory)].filter(Boolean))];
  const suppliedProducts = data.choices?.product;
  const products = Array.isArray(suppliedProducts) ? suppliedProducts.map(choice =>
    text(choice?.value || choice?.label || choice).toUpperCase()).filter(Boolean) : [];
  app.products = [...new Set(products.length ? products :
    [...GROUPS, ...app.jobs.map(job => job.product).filter(Boolean)])];
  const systemDate = dateValue(data.systemCreatedAt);
  $('systemDateRow').hidden = !systemDate;
  $('systemDate').textContent = systemDate ? niceDate(systemDate) : '';
  app.jobsLive = true;
  app.loaded = true;
  app.jobsLoadedAt = new Date().toISOString();
  app.partial = !!data.partial || normalized.length !== app.jobs.length || data.jobs.some(job => !job) || normalized.some(job => (job.criteria || []).length > SLOTS.length || new Set((job.criteria || []).map(c => c.id)).size !== (job.criteria || []).length || new Set((job.criteria||[]).map(c=>c.slot)).size !== (job.criteria||[]).length || (job.criteria||[]).some(c=>!SLOTS.includes(c.slot)||!c.label));
  app.deleteEnabled = ENABLE_DELETE_INSPECTION && data.capabilities?.deleteInspection === true;
  app.recordRead = /STK_Inspections/i.test(text(data.source)) || app.jobs.some(job => job.records.length > 0);
  app.loadError = '';
  if (text(data.memberNickname)) renameProfile(data.memberNickname);
  renderCurrent();
}

async function loadJobs() {
  if (!app.member || app.jobsLoading || app.busy) return;
  const member = app.member, epoch = sessionEpoch;
  app.jobsLoading = true;
  app.loadError = '';
  showReadState();
  try {
    const data = await readJobs();
    if (member === app.member && epoch === sessionEpoch) applyJobs(data);
  } catch (error) {
    if (member === app.member && epoch === sessionEpoch) {
      app.loadError = error.message;
      app.jobsLive = false;
      renderCurrent();
    }
  } finally {
    if (member === app.member && epoch === sessionEpoch) {
      app.jobsLoading = false;
      renderCurrent();
    }
  }
}

function showReadState() {
  if (isForm(app.page) && $('formRefresh')) $('formRefresh').hidden = app.jobsLive || app.jobsLoading || app.busy;
  const message = app.jobsLoading ? 'กำลังโหลดรายการงาน…' : app.loadError
    ? (app.loaded ? 'รีเฟรชไม่สำเร็จ กำลังแสดงข้อมูลล่าสุดที่เคยโหลด' : 'โหลดรายการงานไม่สำเร็จ')
    : app.partial ? 'ข้อมูลที่โหลดมาอาจยังไม่ครบ' : '';
  for (const id of ['homeLiveBanner', 'jobsLiveBanner', 'chooseLiveBanner', 'overviewLiveBanner', 'reportsLiveBanner']) {
    const el = $(id);
    el.hidden = !message;
    el.className = 'notice' + (app.loadError ? ' error' : app.partial ? ' warning' : '');
    el.firstElementChild.textContent = message;
    el.lastElementChild.hidden = !app.loadError;
  }
  for (const button of document.querySelectorAll('[data-action="refresh-jobs"]')) {
    button.disabled = app.jobsLoading || app.busy;
  }
}

const findJob = (key = app.selected) => app.jobs.find(job => job.id === key);
const liveRecords = job => job.records.filter(record => !record.deleted);
const isWaiting = status => ['completed', 'waiting-report'].includes(status);
const isDone = status => ['report-ready', 'closed'].includes(status);
const finished = job => isWaiting(job.status) || isDone(job.status);
const resultCode = value => text(value).toUpperCase();
const checkedResult = isDecided;

function effectiveResult(record) {
  const results = SLOTS.map(slot => resultCode(record['result' + slot]));
  if (results.includes('NG')) return 'NG';
  if (results.includes('OK')) return 'OK';
  return ['NG', 'OK'].find(code => [record.result, record.overallResult].some(value => resultCode(value) === code)) || '';
}

const statusBadge = status => `<span class="status ${html(status)}">${html(STATUS[status])}</span>`;
const resultBadge = result => ['OK', 'NG', 'NA'].includes(result)
  ? `<span class="result-tag ${result.toLowerCase()}">${result}</span>` : '<span class="result-tag">ยังไม่มีผล</span>';
const numberText = value => app.loaded ? value : '—';
const blank = message => !app.loaded && !app.loadError ? '<div class="skeleton" role="status" aria-label="กำลังโหลดข้อมูล"></div>' : `<p class="empty">${html(app.loaded ? message :
  app.loadError ? 'แตะลองอีกครั้งเพื่อโหลดข้อมูล' : 'กำลังโหลดข้อมูล…')}</p>`;
const niceDate = value => dateValue(value) ? thaiDate.format(new Date(value)) : '—';
const groupLabel = job => [selectedProducts(job).join(', '), selectedModels(job).join(', ')].filter(Boolean).join(' · ');
const claimNumber = job => text(job.docNo2 || job.id);
const reportLink = job => safeLink(job.reportUrl);

function setPressed(container, field, value) {
  for (const button of container.querySelectorAll('[data-' + field + ']')) {
    const active = button.getAttribute('data-' + field) === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function activeJobs() {
  return app.jobs.filter(job => job.status === 'progress');
}

function memberName() {
  return text(app.member?.fullName || app.member?.displayName || app.nickname);
}

function starKey() {
  const member = app.member;
  return 'stock-stars:' + CONFIG.mode + ':' + text(app.line?.userId || member?.userId || member?.id || memberName());
}

function readStars() {
  try {
    const stored = JSON.parse(localStorage.getItem(starKey()) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function toggleStar(id) {
  if (findJob(id)?.status !== 'progress') return;
  if (app.stars.has(id)) app.stars.delete(id);
  else app.stars.add(id);
  try { localStorage.setItem(starKey(), JSON.stringify([...app.stars])); } catch { /* Session still works. */ }
  renderCurrent();
}

function starButton(job) {
  const starred = app.stars.has(job.id);
  const label = (starred ? 'เอาดาวออกจาก ' : 'ติดดาว ') + job.title;
  return `<button class="icon-btn star-button" type="button" data-star-job="${html(job.id)}"
    aria-label="${html(label)}" title="${html(label)}" aria-pressed="${starred}">${icon('star')}</button>`;
}

function jobCard(job) {
  const active = job.status === 'progress';
  const records = liveRecords(job);
  const pending = records.filter(record => !vehicleInspection(job, record).complete).length;
  const count = records.length - pending;
  const target = Number(job.targetUnits);
  const progress = target > 0 ? count + ' / ' + target : String(count);
  return `<article class="job-entry${active ? ' active-work' : ''}${app.stars.has(job.id) && active ? ' starred' : ''}">
    <button class="job-tile" type="button" data-job="${html(job.id)}">
      <span class="tile-top"><span class="tile-model">${html(groupLabel(job))}</span>${active ? '' : statusBadge(job.status)}</span>
      <span class="tile-title">${html(job.title)}</span>
      <span class="tile-desc">${html([job.claimCategory, claimNumber(job)].filter(Boolean).join(' · '))}</span>
      ${active ? `<span class="tile-meta"><span>ตรวจแล้ว <strong>${progress}</strong> คัน</span>
        ${pending ? `<span class="pending-count">รอตรวจต่อ ${pending} คัน</span>` : ''}</span>` : ''}
    </button>${active ? starButton(job) : ''}</article>`;
}

function orderedActiveJobs() {
  return activeJobs().sort((a, b) => Number(app.stars.has(b.id)) - Number(app.stars.has(a.id)) ||
    text(b.updated).localeCompare(text(a.updated)));
}

function filterJobs(jobs) {
  const query = app.search.toLowerCase().trim();
  return jobs.filter(job => (!app.group || selectedProducts(job).includes(app.group)) &&
    (!app.claimFilter || job.claimCategory === app.claimFilter) && (!app.modelFilter || selectedModels(job).includes(app.modelFilter)) &&
    (!app.jobState || job.status === app.jobState) &&
    [job.title, job.id, groupLabel(job), job.docNo2, job.detail, job.claimCategory, ...liveRecords(job).map(record => record.serial)].join(' ').toLowerCase().includes(query));
}
function syncSearch(prefix) {
  const source = app.jobs;
  choiceOptions(prefix + 'Claim', 'ทั้งหมด', app.claimTypes, app.claimFilter);
  choiceOptions(prefix + 'Product', 'ทั้งหมด', app.products, app.group);
  choiceOptions(prefix + 'Model', 'ทั้งหมด', [...new Set(source.flatMap(selectedModels))].sort(), app.modelFilter);
  $(prefix + 'Search').value = app.search;
}
function unitStats(jobs, includeJobs = false) {
  const counts = DOMAIN.summary(jobs);
  return (includeJobs ? stat('งานทั้งหมด', jobs.length, 'list') : '') + stat('รถในรายการ', counts.total, 'truck') +
    stat('OK', counts.OK, 'check', 'teal') + stat('NG', counts.NG, 'alert', 'negative') +
    stat('Pending', counts.pending, 'clock', 'orange') + stat('NA', counts.NA, 'minus', 'neutral');
}

function renderHome() {
  const jobs = orderedActiveJobs();
  const pinned = jobs.filter(job => app.stars.has(job.id));
  const units = DOMAIN.summary(app.jobs), done = app.jobs.filter(finished).length;
  $('homeJobStats').innerHTML = stat('งานทั้งหมด', app.jobs.length, 'list') + stat('เสร็จแล้ว', done, 'check') + stat('งานค้าง', app.jobs.length - done, 'clock');
  $('pendingBanner').hidden = !app.pending.size;
  $('openJobsLabel').textContent = 'ดูงานทั้งหมด' + (app.loaded ? ' (' + app.jobs.length + ')' : '');
  $('recentJobs').innerHTML = pinned.length ? pinned.map(jobCard).join('') : blank('แตะดาวที่งานกำลังตรวจเพื่อปักไว้ตรงนี้');
  syncSearch('home');
  const shown = filterJobs(app.jobs).sort((a,b) => Number(b.status === 'progress') - Number(a.status === 'progress') || text(b.updated).localeCompare(text(a.updated))).slice(0, 6);
  $('homeJobs').innerHTML = shown.length ? shown.map(jobCard).join('') : blank('ไม่พบงานที่ตรงกับตัวกรอง');
  const key = dateValue(new Date()).slice(0, 7), buckets = jobsByMonth();
  $('homeMonth').innerHTML = monthCard(key, buckets.get(key) || [], true);
}
function renderJobs() {
  syncSearch('jobs');
  $('jobsState').value = app.jobState;
  const jobs = filterJobs(app.jobs);
  $('jobResultCount').textContent = app.loaded ? `${jobs.length} จาก ${app.jobs.length} งาน` : '';
  $('jobGrid').innerHTML = jobs.length ? jobs.map(jobCard).join('') : blank('ไม่พบงานที่ตรงกับตัวกรอง');
}

function claimCategory(value) {
  const raw = text(value?.value || value?.label || value);
  if (!raw || GROUPS.includes(raw.toUpperCase()) || /^other$|^อื่น\s*ๆ$/i.test(raw)) return '';
  if (/^quick report$/i.test(raw)) return 'Quick Report';
  if (/^hotline(?: report)?$/i.test(raw)) return 'Hotline';
  return raw;
}

function choiceOptions(id, allLabel, choices, selected) {
  const select = $(id);
  select.innerHTML = `<option value="">${allLabel}</option>` +
    choices.map(value => `<option value="${html(value)}">${html(value)}</option>`).join('');
  select.value = choices.includes(selected) ? selected : '';
  return select.value;
}

function renderChoose() {
  const jobs = app.jobs.filter(job => job.status === 'new');
  const products = [...new Set([...app.products, ...jobs.map(job => job.product).filter(Boolean)])];
  app.group = choiceOptions('modelFilter', 'ทั้งหมด', products, app.group);
  app.claimFilter = choiceOptions('claimFilter', 'ทั้งหมด', app.claimTypes, app.claimFilter);
  if ($('jobSearch').value !== app.search) $('jobSearch').value = app.search;
  choiceOptions('chooseModel', 'ทั้งหมด', [...new Set(jobs.flatMap(selectedModels))], app.modelFilter);
  const query = app.search.trim().toLowerCase();
  const filtered = jobs.filter(job => (!app.modelFilter || selectedModels(job).includes(app.modelFilter)) && (!app.group || selectedProducts(job).includes(app.group)) &&
    (!app.claimFilter || job.claimCategory === app.claimFilter) &&
    [job.title, job.id, groupLabel(job), job.docNo2, job.detail, job.claimCategory, ...liveRecords(job).map(record => record.serial)].join(' ').toLowerCase().includes(query));
  $('chooseCount').textContent = app.loaded ? `${filtered.length} งานรอเริ่มตรวจ` : '';
  $('chooseGrid').innerHTML = filtered.length ? filtered.map(jobCard).join('') : blank('ไม่พบงานรอเริ่มตรวจที่ตรงกับตัวกรอง');
}

const stat = (label, value, symbol, color = '') => `<article class="stat ${color}">
  <span class="stat-top">${icon(symbol)} ${label}</span><strong>${numberText(value)}</strong></article>`;

function openedDate(job) {
  return dateValue(job.startedAt) || dateValue(job.selectedAt) || dateValue(job.openedAt) ||
    liveRecords(job).map(record => dateValue(record.checkedAt)).filter(Boolean).sort()[0] || '';
}

function jobsByMonth() {
  const buckets = new Map();
  for (const job of app.jobs) {
    if (job.status !== 'progress' && !finished(job)) continue;
    const key = openedDate(job).slice(0, 7) || 'undated';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(job);
  }
  return buckets;
}

function monthName(key) {
  return key === 'undated' ? 'ไม่ระบุเดือนเริ่มตรวจ' : MONTHS[Number(key.slice(5, 7)) - 1];
}

function monthMetrics(jobs) {
  const done = jobs.filter(finished).length;
  return { done, open: jobs.length - done, total: jobs.length, percent: jobs.length ? Math.round(done / jobs.length * 100) : 0 };
}

function monthProgress(metrics) {
  return `<span class="month-progress" role="progressbar" aria-label="งานสำเร็จ" aria-valuenow="${metrics.percent}" aria-valuemin="0" aria-valuemax="100">
    <span style="width:${metrics.percent}%"></span></span>`;
}

function renderSystemOverview() {
  const total = app.jobs.length;
  const done = app.jobs.filter(finished).length;
  const active = activeJobs().length;
  const waiting = app.jobs.filter(job => job.status === 'new').length;
  const percent = total ? Math.round(done / total * 100) : 0;
  const updated = app.jobsLoadedAt ? new Intl.DateTimeFormat('th-TH', {
    timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(app.jobsLoadedAt)) : '';
  const stats = [
    ['งานทั้งหมด', total, 'clipboard', 'blue'],
    ['รอเริ่มตรวจ', waiting, 'clock', 'amber'],
    ['กำลังดำเนินการ', active, 'list', 'violet'],
    ['สำเร็จ', done, 'check', 'green']
  ];
  $('systemOverview').innerHTML = `<section class="system-overview">
    <div class="overview-heading"><h2>${icon('clipboard')} ${app.partial ? 'สรุปงานที่โหลดได้' : 'สรุปงานทั้งระบบ'}</h2>
      ${updated ? `<time datetime="${app.jobsLoadedAt}">โหลดล่าสุด ${html(updated)}</time>` : ''}</div>
    <div class="system-stats">${stats.map(([label, value, symbol, color]) => `<div class="system-stat ${color}">
      <span>${icon(symbol)} ${label}</span><strong>${numberText(value)}</strong>
    </div>`).join('')}</div>
    ${app.loaded && total ? `<div class="system-completion"><span>สำเร็จ <strong>${percent}%</strong></span>
      ${monthProgress({percent})}</div>` : ''}
  </section>`;
}

function monthCard(key, jobs, isCurrent = false) {
  const metrics = monthMetrics(jobs);
  return `<button class="month-card ${metrics.total && !metrics.open ? 'complete' : ''}${isCurrent ? ' current-month' : ''}"
      data-month="${key}" type="button"${isCurrent ? ' aria-current="date"' : ''}>
    <span class="month-head"><strong>${monthName(key)}</strong>${icon('arrow')}</span>
    ${isCurrent ? '<span class="month-current-label">เดือนนี้</span>' : ''}
    ${metrics.total ? `<span class="month-rate"><strong>${metrics.percent}%</strong><span>สำเร็จ</span></span>
      ${monthProgress(metrics)}
      <span class="month-foot"><span>ทั้งหมด ${metrics.total} งาน</span><span>สำเร็จ ${metrics.done} งาน</span></span>` :
      '<span class="muted month-empty">ยังไม่มีงาน</span>'}
  </button>`;
}

function renderOverview() {
  renderSystemOverview();
  if (!app.loaded) {
    $('monthGrid').innerHTML = blank('');
    $('olderMonths').hidden = true;
    return;
  }
  const buckets = jobsByMonth();
  const currentMonth = dateValue(new Date()).slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const recordedYears = [...buckets.keys()].filter(key => key !== 'undated').map(key => key.slice(0, 4));
  const years = [currentYear, ...[...new Set(recordedYears)].filter(year => year !== currentYear).sort().reverse()];
  $('olderMonths').hidden = years.length <= app.yearsVisible;
  $('monthGrid').innerHTML = years.slice(0, app.yearsVisible).map(year => {
    const cards = MONTHS.map((_, index) => {
      const key = year + '-' + String(index + 1).padStart(2, '0');
      return monthCard(key, buckets.get(key) || [], key === currentMonth);
    });
    return `<section class="month-section">
      <div class="month-section-heading"><h2>${icon('calendar')} ${Number(year) + 543}</h2>
        <span>ตามเดือนที่เริ่มงานตรวจ</span></div>
      <div class="month-grid">${cards.join('')}</div>
    </section>`;
  }).join('') + (buckets.has('undated') ? `<div class="month-grid month-section">${monthCard('undated', buckets.get('undated'))}</div>` : '');
}

function renderMonthDetail() {
  const jobs = jobsByMonth().get(app.month) || [];
  const metrics = monthMetrics(jobs);
  const shown = jobs.filter(job => app.monthFilter === 'all' || (app.monthFilter === 'done' ? finished(job) : job.status === 'progress'));
  const label = monthName(app.month) + (app.month === 'undated' ? '' : ' ' + (Number(app.month.slice(0, 4)) + 543));
  $('monthContent').innerHTML = `<div class="page-head"><h1 tabindex="-1">${label}</h1></div>
    <section class="panel month-summary">
      <div class="month-rate"><strong>${metrics.percent}%</strong><span>สำเร็จ</span></div>${monthProgress(metrics)}
      <div class="month-foot"><span>ทั้งหมด ${metrics.total} งาน</span><span>สำเร็จ ${metrics.done} งาน</span><span>กำลังตรวจ ${metrics.open} งาน</span></div>
    </section>
    <div class="filters" aria-label="สถานะงาน">${[['all', 'ทั้งหมด'], ['open', 'กำลังดำเนินการ'], ['done', 'สำเร็จ']].map(([key, text]) =>
      `<button class="filter-chip ${app.monthFilter === key ? 'active' : ''}" type="button" data-month-filter="${key}" aria-pressed="${app.monthFilter === key}">${text}</button>`).join('')}</div>
    <div class="job-grid">${shown.length ? shown.map(jobCard).join('') : blank('ไม่มีงานในรายการนี้')}</div>`;
}

function reportJobs() {
  return app.jobs.filter(job => (!app.reportJob || job.id === app.reportJob));
}
function scopedReportJobs() {
  return reportJobs().map(job => ({ ...job, records: liveRecords(job).filter(record => (app.reportKind !== 'serial' || !app.reportSerial || record.serial === app.reportSerial) && (!app.reportMonth ||
    (app.reportMonth === 'undated' ? !dateValue(record.checkedAt) : dateValue(record.checkedAt).slice(0, 7) === app.reportMonth))) }));
}
function renderReports() {
  $('reportKind').value = app.reportKind;
  choiceOptions('reportSerial', 'ทั้งหมด', [...new Set(reportJobs().flatMap(job => liveRecords(job).map(record => record.serial)).filter(Boolean))], app.reportSerial);
  choiceOptions('reportJob', 'ทั้งหมด', app.jobs.map(job => job.id), app.reportJob);
  const months = [...new Set(app.jobs.flatMap(job => liveRecords(job).map(record => dateValue(record.checkedAt).slice(0, 7) || 'undated')))].sort().reverse();
  choiceOptions('reportMonth', 'ทั้งหมด', months, app.reportMonth);
  const jobs = scopedReportJobs();
  setPressed($('reportFilters'), 'report-filter', app.reportFilter);
  const filtered = jobs.filter(job => (!app.reportMonth || job.records.length) &&
    (app.reportFilter === 'ready' ? reportLink(job) : app.reportFilter === 'waiting' ? finished(job) && !reportLink(job) : true));
  $('reportList').innerHTML = filtered.length ? filtered.map(job => {
    const url = reportLink(job), counts = StockDomain.summary([job]);
    return `<article class="report-row"><span class="report-icon">${icon('file')}</span><div><h3>${html(job.title)}</h3>
      <p>${html(groupLabel(job))} · ${html(claimNumber(job))}</p><p>${counts.total} คัน · OK ${counts.OK} · NG ${counts.NG} · Pending ${counts.pending} · NA ${counts.NA}</p></div>
      <div class="report-actions"><button class="btn secondary sm" type="button" data-preview-job="${html(job.id)}">Preview</button>
      ${url ? `<a class="btn ghost sm" href="${html(url)}" target="_blank" rel="noopener noreferrer">${icon('download')} PDF จากระบบ (ทั้งงาน)</a>` : ''}</div></article>`;
  }).join('') : blank('ไม่มีข้อมูลตามตัวกรอง');
}
function renderReportPreview(){
 let jobs=scopedReportJobs();
 if(app.reportKind==='serial'&&!app.reportSerial){$('previewContent').innerHTML='<div class="page-head"><h1 tabindex="-1">รายงานราย Serial</h1></div><p class="empty">เลือก Serial ในหน้ารายงานก่อนสร้างรายงานรายคัน</p>';return}
 if(app.reportKind==='monthly'&&app.reportMonth)jobs=jobs.filter(job=>job.records.length||openedDate(job).slice(0,7)===app.reportMonth);
 if(app.reportKind==='serial')jobs=jobs.filter(job=>job.records.length);
 const counts=DOMAIN.summary(jobs),created=new Intl.DateTimeFormat('th-TH',{timeZone:TIME_ZONE,dateStyle:'medium',timeStyle:'short'}).format(new Date());
 const title=app.reportKind==='serial'?'รายงานราย Serial':app.reportKind==='monthly'?'รายงานรายเดือน':'รายงาน Claim Job';
 const reportStatus=!counts.total?'Draft':counts.incomplete?'In Progress':app.reportKind==='serial'||jobs.every(finished)?'Completed':'In Progress';
 const reportRows=job=>[...job.records].sort((a,b)=>text(b.checkedAt).localeCompare(text(a.checkedAt))).map(record=>{
  const result=vehicleInspection(job,record);
  return `<tr><td data-label="PIN / Model"><strong>${html(record.serial||'— (ไม่ระบุ Serial)')}</strong><br>${html(record.product||'—')} · ${html(record.model||'—')}</td>
   <td data-label="วันที่ / สถานที่ / ผู้ตรวจ">${niceDate(record.checkedAt)}<br>${html(record.location||'—')}<br>${html(record.inspector||'—')}</td>
   <td data-label="ผล / ความครบถ้วน">${vehicleBadge(result)}<br>${vehicleProgress(result)}</td>
   <td data-label="ผลรายเกณฑ์">${DOMAIN.criteria(job,record).map(c=>{const d=DOMAIN.criterionValue(record,c);return `<p>${html(c.label)}: <strong>${html(d.result||'Pending')}</strong>${d.note?'<br>'+html(d.note):''}${d.ngDetail?'<br>NG: '+html(d.ngDetail):''}<br><small>${niceDate(d.updatedAt)} · ${html(d.inspector||'—')}</small></p>`}).join('')||'—'}<p>หมายเหตุ: ${html(record.note||'—')}</p></td></tr>`;
 }).join('');
 const modelGroups=new Map();for(const job of jobs)for(const record of job.records){const key=[record.product||'—',record.model||'—'].join(' · ');if(!modelGroups.has(key))modelGroups.set(key,[]);modelGroups.get(key).push({...job,records:[record]})}
 const monthly=app.reportKind==='monthly'?`<section class="panel"><h2>สรุป Product / Model</h2><p class="hint">${jobs.length} งาน · งานค้าง ${jobs.filter(j=>!finished(j)).length} · ลงผลแล้ว ${counts.inspected} คัน</p>${[...modelGroups].map(([model,rows])=>{const c=DOMAIN.summary(rows);return `<div class="criterion-result"><strong>${html(model)}</strong><span>${c.total} คัน · OK ${c.OK} / NG ${c.NG} / Pending ${c.pending} / NA ${c.NA}</span></div>`}).join('')||'<p class="empty">ไม่มีผลตรวจในเดือนนี้</p>'}</section>`:'';
 $('previewContent').innerHTML=`<header class="report-heading"><img class="kubota-logo" src="assets/kubota.png" alt="Kubota"><div><p class="eyebrow">STOCK INSPECTION</p><h1 tabindex="-1">${title}</h1></div><span class="status">${reportStatus}</span></header>
  <div class="page-head"><p>${MOCK?'MOCK REPORT · ข้อมูลจำลอง ไม่ใช่ข้อมูลบริษัท':'รายงานจากข้อมูลที่อ่านยืนยันแล้ว'} · ${html(app.reportMonth||'ทั้งหมด')}</p><button class="btn primary no-print" type="button" data-action="print-report">${icon('download')} พิมพ์ / บันทึก PDF</button></div>
  <p class="hint">สร้างรายงาน ${html(created)} (Asia/Bangkok) · อ่านข้อมูลล่าสุด ${niceDate(app.jobsLoadedAt)}</p>
  ${!app.jobsLive||app.partial?'<div class="notice warning">Draft · ข้อมูลไม่ครบหรืออาจไม่ใช่ข้อมูลล่าสุด</div>':''}
  <div class="stats report-metrics">${unitStats(jobs)}</div><p class="hint">Total = OK + NG + Pending + NA · ตรวจครบ ${counts.complete} คัน / ยังไม่ครบ ${counts.incomplete} คัน · — หมายถึงไม่มีข้อมูล</p>${monthly}
  ${jobs.map(job=>`<section class="panel print-job"><div class="panel-head"><h2>${html(job.title)}</h2>${statusBadge(job.status)}</div>
   <p>${html(job.id)} · ${html(job.claimCategory||'—')}</p><p class="muted">${html(groupLabel(job))} · เป้าหมาย ${job.targetUnits==null?'—':html(job.targetUnits)} คัน · ในรายงาน ${job.records.length} คัน</p>
   ${job.detail?`<p>${html(job.detail)}</p>`:''}<p>วิธีตรวจ: ${html(job.checkingMethod||'—')}</p>
   ${app.reportKind!=='monthly'?referencePictures(job):''}
   ${app.reportKind==='serial'?job.records.map(record=>`<section class="serial-report"><h3>${html(record.serial)}</h3><p>${html(record.product||'—')} · ${html(record.model||'—')} · ${niceDate(record.checkedAt)} · ${html(record.location||'—')} · ${html(record.inspector||'—')}</p>${vehicleBadge(vehicleInspection(job,record))} ${vehicleProgress(vehicleInspection(job,record))}${recordEvidence(job,record)}${auditHistoryMarkup(job,record)}</section>`).join(''):
    `<div class="report-table-wrap"><table class="report-table"><thead><tr><th>PIN / Product / Model</th><th>วันที่ / สถานที่ / ผู้ตรวจ</th><th>ผล / ความครบถ้วน</th><th>ผลรายเกณฑ์</th></tr></thead><tbody>${reportRows(job)||'<tr><td colspan="4">ไม่มีผลตรวจในช่วงนี้</td></tr>'}</tbody></table></div>`}</section>`).join('')}`;
}


const jobScope = job => 'job:' + job.id;
const manualScope = 'manual-job';
const criteriaSlots = job => DOMAIN.criteria(job).map(c => c.slot);

const pendingControls = scope => app.pending.has(scope) ? `<div class="section-actions">
  <button class="btn secondary" type="button" data-action="check-save">${icon('refresh')} ตรวจสอบผลบันทึก</button>
</div>` : '';

function recordPictures(record) {
  const images = record.photoSlots.slice(0, 1).map(url => url ? `<a class="evidence-photo" href="${html(url)}" target="_blank" rel="noopener noreferrer">
    <img src="${html(url)}" alt="รูป Serial Number" data-reference-photo loading="lazy">
    <small>เปิดรูป Serial Number</small></a>` : '').join('');
  return images ? `<div class="evidence-grid">${images}</div>` : '<p class="hint">ยังไม่มีรูป Serial Number ที่ยืนยันแล้ว</p>';
}

function legacyNgCriteria(record) {
  const lines = text(record?.ngDetail).split(/\r?\n/);
  const entries = lines.map(line => line.match(/^Result ([1-4]) · (.+)$/));
  return entries.every(match => match && resultCode(record['result' + match[1]]) === 'NG')
    ? new Map(entries.map(match => [Number(match[1]), match[2]])) : new Map();
}

function criterionLabel(job, slot, oldNames) {
  return DOMAIN.criteria(job).find(c => c.slot === slot)?.label || oldNames?.get(slot) || 'เกณฑ์ข้อ ' + slot + ' (ไม่ระบุชื่อ)';
}
function recordCriteria(job, record) { return DOMAIN.criteria(job, record).map(c => c.slot); }
function resultDetail(job, record, slot) { return DOMAIN.criterionValue(record, DOMAIN.criteria(job,record).find(c => c.slot === slot) || {id:'C'+slot,slot}); }


function vehicleInspection(job, record) {
  return StockDomain.inspection(job, record);
}

function vehicleBadge(inspection) {
  return inspection.status === 'pending' ? `<span class="result-tag pending">${icon('clock')} รอตรวจต่อ</span>` :
    resultBadge(inspection.status);
}

function vehicleProgress(inspection) {
  const { checked, total, complete } = inspection;
  return complete ? `<span class="record-progress complete">${icon('check')} ตรวจครบ ${checked}/${total} ข้อ</span>` :
    `<span class="record-progress pending-count">${icon('clock')} ตรวจแล้ว ${checked}/${total} ข้อ · รอตรวจต่อ</span>`;
}

function recordLine(job, record, editable) {
  const inspection = vehicleInspection(job, record);
  const meta = [record.product || job.product, record.model || job.model, record.lotNo && 'Lot ' + record.lotNo, niceDate(record.checkedAt),
    record.inspector || record.checkedBy].filter(Boolean).join(' · ');
  return `<article class="record">
    <div class="record-main"><div class="vehicle-identity">${vehicleBadge(inspection)}<h3>${html(record.serial || '— (ไม่ระบุ Serial)')}</h3></div>
      <p>${html(meta)}</p>${vehicleProgress(inspection)}</div>
    <div class="record-tail">
      <button class="small-action" type="button" data-view-record="${html(record.id)}">ดูรายละเอียด</button>
      ${editable ? `<button class="small-action${!inspection.complete ? ' continue-inspection' : ''}" type="button" data-edit-record="${html(record.id)}">${!inspection.complete ? 'ตรวจต่อ' : 'แก้ไข'}</button>
        ${app.deleteEnabled && record.sharePointItemId ? `<button class="small-action danger" type="button" data-delete-record="${html(record.id)}">ลบ</button>` : ''}` : ''}
    </div></article>`;
}

function referencePictures(job) {
  const pictures = [['OK', job.okPictureUrl], ['NG', job.ngPictureUrl], ['วิธีตรวจ', job.methodPictureUrl]].map(([label, value]) => {
    const url = safeLink(value);
    return url ? `<a class="reference-photo ${label.toLowerCase()}" href="${html(url)}" target="_blank" rel="noopener noreferrer">
      <span>${label === 'วิธีตรวจ' ? label : 'ตัวอย่าง ' + label}</span><img src="${html(url)}" alt="" data-reference-photo loading="lazy">
      <small>เปิดรูป ${icon('arrow')}</small></a>` : `<div class="reference-photo"><span>${label === 'วิธีตรวจ' ? label : 'ตัวอย่าง ' + label}</span><p class="hint">ยังไม่มีรูปตัวอย่าง</p></div>`;
  }).join('');
  return pictures ? `<div class="reference-grid">${pictures}</div>` : '';
}

function renderRecordDetail() {
  const job = findJob();
  const record = job && liveRecords(job).find(item => item.id === app.viewRecord);
  const root = $('recordContent');
  if (!record) {
    root.innerHTML = '<p class="empty">ไม่พบผลตรวจรายการนี้</p>';
    return;
  }
  const inspection = vehicleInspection(job, record);
  root.innerHTML = `<section class="panel">
    <div class="page-head"><div><div class="vehicle-identity">${vehicleBadge(inspection)}<h1 tabindex="-1">${html(record.serial || '— (ไม่ระบุ Serial)')}</h1></div>
    <p>${html(job.title)}</p></div></div>
    ${vehicleProgress(inspection)}<div class="section-actions"><button type="button" class="btn secondary" data-serial-report="${html(record.serial)}">${icon('file')} รายงานรายคัน</button></div>
    <div class="detail-info">
      <div class="info"><small>Product</small><span>${html(record.product || job.product || '—')}</span></div>
      <div class="info"><small>Model</small><span>${html(record.model || job.model || '—')}</span></div>
      <div class="info"><small>ผู้ตรวจ</small><span>${html(record.inspector || record.checkedBy || '—')}</span></div>
      <div class="info"><small>วันที่ตรวจ</small><span>${html(niceDate(record.checkedAt))}</span></div>
      <div class="info"><small>สถานที่ตรวจ</small><span>${html(record.location || '—')}</span></div>
      ${record.lotNo ? `<div class="info"><small>Lot No.</small><span>${html(record.lotNo)}</span></div>` : ''}
    </div>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>ผลตามเกณฑ์</h2></div>
    ${recordEvidence(job, record)}
  </section>${auditHistoryMarkup(job, record)}`;
}

function recordEvidence(job,record){
 const results=DOMAIN.criteria(job,record).map(c=>{
  const detail=DOMAIN.criterionValue(record,c);
  return `<article class="criterion-evidence"><div class="criterion-result"><span>${html(c.label)}</span>${detail.result?resultBadge(detail.result):'<span class="result-tag pending">Pending</span>'}</div>
   ${detail.note?`<p class="record-note">${html(detail.note)}</p>`:''}${detail.ngDetail?`<p class="record-note ng-note">NG: ${html(detail.ngDetail)}</p>`:''}
   <small class="hint">แก้ล่าสุด ${niceDate(detail.updatedAt)} · ผู้ตรวจ ${html(detail.inspector||'—')}</small></article>`;
 }).join('');
 return `${Number(record.schemaVersion)!==2?'<p class="notice warning">ข้อมูลรุ่นเดิม: NA อาจหมายถึงยังไม่ตรวจ จึงแสดงเป็น Pending จนกว่าจะตรวจยืนยัน</p>':''}${results||'<p class="hint">ไม่มีผลรายเกณฑ์</p>'}
 ${record.note?`<div class="record-extra"><h3>หมายเหตุรวม</h3><p class="record-note">${html(record.note)}</p></div>`:''}
 ${record.ngDetail?`<div class="record-extra"><h3>สรุป NG</h3><p class="record-note">${html(record.ngDetail)}</p></div>`:''}
 <div class="record-extra"><h3>รูป Label / PIN</h3>${recordPictures(record)}</div>`;
}
function auditHistoryMarkup(job,record){
 const history=Array.isArray(record.auditHistory)?record.auditHistory:[];
 return `<details class="panel audit-history"><summary>ประวัติการแก้ไข (${history.length})</summary>${MOCK?'<p class="hint">ประวัติจำลอง ไม่ใช่ audit ของบริษัท</p>':''}${history.length?[...history].reverse().map(entry=>`<article class="audit-entry"><h3>${html(entry.actor||'—')} · ${niceDate(entry.at)}</h3><small class="hint">Version ${html(entry.version)} · Request ${html(entry.requestId)}</small>${(entry.changes||[]).map(change=>`<p>${html(DOMAIN.criteria(job,record).find(c=>c.id===change.criterionId)?.label||change.criterionId)}: ${html(change.result||'Pending')}${change.note?' · '+html(change.note):''}${change.ngDetail?' · NG: '+html(change.ngDetail):''}</p>`).join('')}</article>`).join(''):'<p class="hint">ยังไม่มีประวัติจากบริการอ่านข้อมูล</p>'}</details>`;
}
function groupedVehicles(job,records,active,completed){
 const groups=new Map();for(const record of records){const key=[record.product||'—',record.model||'—'].join(' · ');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record)}
 return [...groups.entries()].map(([model,rows])=>`<section class="vehicle-model-group"><h3>${icon('truck')} ${html(model)} <span class="pill">${rows.length} คัน</span></h3>${rows.map(record=>completed?reportRecord(job,record):recordLine(job,record,active)).join('')}</section>`).join('');
}


function reportRecord(job, record) {
  const inspection = vehicleInspection(job, record);
  const meta = [record.product || job.product, record.model || job.model, record.lotNo && 'Lot ' + record.lotNo,
    niceDate(record.checkedAt), record.inspector || record.checkedBy].filter(Boolean).join(' · ');
  return `<details class="report-record">
    <summary><span class="vehicle-identity">${vehicleBadge(inspection)}<strong>${html(record.serial || '— (ไม่ระบุ Serial)')}</strong></span><span class="report-vehicle-meta">${html(meta)}</span></summary>
    <div class="report-evidence">${recordEvidence(job, record)}</div>
  </details>`;
}

function reportSummary(job, records) {
  const counts = records.reduce((total, record) => {
    const { status } = vehicleInspection(job, record);
    if (status) total[status]++;
    return total;
  }, { OK: 0, NG: 0, pending: 0, NA: 0 });
  const unknown = records.length - counts.OK - counts.NG - counts.pending - counts.NA;
  const incomplete = StockDomain.summary([{ ...job, records }]).incomplete;
  const criteria = [...new Set(records.flatMap(record => recordCriteria(job, record)))].sort();
  return `<section class="panel report-summary">
    <div class="panel-head"><h2>Inspection Summary</h2></div>
    <div class="stats four">${unitStats([{...job, records}])}</div>
    ${incomplete ? `<p class="hint">มี ${incomplete} คันที่ตรวจไม่ครบ (รวมคันที่พบ NG)</p>` : ''}
    ${unknown ? `<p class="hint">มี ${unknown} คันที่ยังไม่มีข้อมูลผลตรวจ</p>` : ''}
    ${criteria.map(slot => {
      const results = records.map(record => resultCode(record['result' + slot]));
      return `<div class="criterion-result"><span>${html(criterionLabel(job, slot))}</span>
        <span class="criterion-count"><span class="result-tag ok">OK ${results.filter(result => result === 'OK').length}</span>
        <span class="result-tag ng">NG ${results.filter(result => result === 'NG').length}</span></span></div>`;
    }).join('')}
  </section>`;
}

function renderDetail() {
  const job = findJob();
  const root = $('detailContent');
  if (!job) {
    root.innerHTML = '<p class="empty">ไม่พบงานนี้ กรุณาย้อนกลับเพื่อเลือกงานอีกครั้ง</p>';
    return;
  }
  const records = liveRecords(job);
  const active = job.status === 'progress';
  const completed = finished(job);
  const criteria = criteriaSlots(job);
  const counts = { all: records.length, OK: 0, NG: 0, pending: 0, NA: 0 };
  const filtered = records.filter(record => {
    const { status } = vehicleInspection(job, record);
    if (status) counts[status]++;
    return app.recordFilter === 'all' || status === app.recordFilter;
  }).sort((a, b) => text(b.checkedAt).localeCompare(text(a.checkedAt)) ||
    (Number(b.sharePointItemId) || 0) - (Number(a.sharePointItemId) || 0));
  const filters = [['all', 'ทั้งหมด'], ['OK', 'OK'], ['NG', 'NG'], ['NA', 'NA']];
  if (active || counts.pending || app.recordFilter === 'pending') filters.push(['pending', 'รอตรวจต่อ']);
  const url = reportLink(job);
  const target = Number(job.targetUnits);
  const incomplete = records.filter(record => !vehicleInspection(job, record).complete).length;
  const isNew = job.status === 'new';
  const action = isNew ? `<button class="btn primary" type="button" data-action="select-job">${icon('check')} ตั้งค่าก่อนเริ่มตรวจ</button>` :
    active ? `<button class="btn primary" type="button" data-action="inspect-job">${icon('plus')} เพิ่มการตรวจ</button>` :
    url ? `<a class="btn primary" href="${html(url)}" target="_blank" rel="noopener noreferrer">${icon('download')} ดาวน์โหลด PDF</a>` : '';
  root.innerHTML = `<section class="panel job-detail-head">
    ${completed ? '<p class="report-caption">Report Preview</p>' : ''}
    <div class="detail-kicker"><span>${html(claimNumber(job))}</span>${statusBadge(job.status)}${active ? starButton(job) : ''}</div>
    <div class="job-title-row"><h1 tabindex="-1">${html(job.title)}</h1>
      ${active ? `<button class="btn ghost sm edit-job-button" type="button" data-action="edit-job">${icon('edit')} แก้รายละเอียดงาน</button>` : ''}
    </div>
    ${active ? `<div class="detail-actions start-inspection">${action}</div>` : ''}
    <div class="stats four">${unitStats([job])}</div><p class="hint">ตรวจครบ ${records.length - incomplete}${target > 0 ? ' / ' + target : ''} คัน · รอตรวจต่อ ${incomplete} คัน</p>
    ${job.detail && text(job.detail) !== job.title ? `<p class="detail-desc">${html(job.detail)}</p>` : ''}
    <div class="detail-info">
      <div class="info"><small>ClaimType</small><span>${html(job.claimCategory || '—')}</span></div>
      <div class="info"><small>Product · Model</small><span>${html(groupLabel(job) || '—')}</span></div>
      ${job.inspectionLocation ? `<div class="info"><small>จุดตรวจ</small><span>${html(job.inspectionLocation)}</span></div>` : ''}
      ${completed && openedDate(job) ? `<div class="info"><small>Start Date</small><span>${niceDate(openedDate(job))}</span></div>` : ''}
      ${completed && dateValue(job.closedAt) ? `<div class="info"><small>Completion Date</small><span>${niceDate(job.closedAt)}</span></div>` : ''}
    </div>
    ${referencePictures(job)}
    ${job.checkingMethod || criteria.length || active ? `<details open class="details-toggle job-criteria">
      <summary>วิธีและเกณฑ์ตรวจ</summary>
      ${job.checkingMethod ? `<p class="inspection-intro">${html(job.checkingMethod)}</p>` : ''}
      ${criteria.length ? `<ul>${criteria.map(slot => `<li>${html(criterionLabel(job, slot))}</li>`).join('')}</ul>` :
        '<p class="hint">ยังไม่มีเกณฑ์ตรวจ</p>'}
    </details>` : ''}
    ${job.notes ? `<details class="details-toggle"><summary>หมายเหตุงาน</summary><p class="detail-desc">${html(job.notes)}</p></details>` : ''}
    ${action && !active ? `<div class="detail-actions">${action}</div>` : ''}
  </section>
  ${detailNotice(job)}${transferMarkup(job)}
  ${completed && !url ? '<div class="notice warning">รอไฟล์ PDF · เปิดดูผลในแอปได้</div>' : ''}
  <button type="button" class="btn secondary" data-preview-job="${html(job.id)}">${icon('file')} ดูรายงานงานนี้</button>
  ${isNew ? '' : `<section class="panel">
    <div class="panel-head"><div><h2>รถที่บันทึกผล</h2><span class="muted">${records.length} คัน${target > 0 ? ' จาก ' + target : ''}</span></div>
      ${active && !app.loadError ? `<button class="btn ghost sm" type="button" data-action="refresh-jobs">${icon('refresh')} รีเฟรช</button>` : ''}</div>
    ${!app.recordRead ? '<p class="hint">ยังไม่มีข้อมูลรายการตรวจรายคันจากฐานข้อมูล</p>' : ''}
    <div class="filters vehicle-filters" role="group" aria-label="กรองผลตรวจรถ">
      ${filters.map(([value, label]) =>
        `<button class="filter-chip ${app.recordFilter === value ? 'active' : ''}" type="button" data-record-filter="${value}" aria-pressed="${app.recordFilter === value}">
          ${label} <span>${counts[value]}</span></button>`).join('')}
    </div>
    ${filtered.length ? groupedVehicles(job, filtered, active, completed) :
      `<p class="empty">${records.length ? 'ไม่มีรถในผลตรวจที่เลือก' : 'ยังไม่มีรถที่บันทึกผลตรวจ'}</p>`}
  </section>`}
  ${active ? `<div class="finish-actions">
    ${!records.length ? '<p class="hint">บันทึกผลอย่างน้อย 1 คันเพื่อจบการตรวจ</p>' : ''}
    ${incomplete ? `<p class="hint">ตรวจรถที่ค้างอีก ${incomplete} คันให้ครบก่อนจบงาน</p>` : ''}
    <button class="btn finish" type="button" data-action="finish-job" ${records.length && !incomplete ? '' : 'disabled'}>${icon('check')} จบการตรวจ</button>
  </div>` : ''}`;
}

function detailNotice(job) {
  const status = app.detailMessage?.jobId === job.id ? app.detailMessage : null;
  const waiting = app.pending.has(jobScope(job));
  const message = status?.text || (waiting ? 'รับคำขอแล้ว กำลังรอยืนยันผลบันทึก' :
    app.loadError ? 'ข้อมูลหน้านี้อาจไม่ใช่ข้อมูลล่าสุด' : '');
  const variant = status?.kind || (waiting || app.loadError ? 'warning' : '');
  return `<div id="detailMessage" class="notice ${variant}" role="status"${message ? '' : ' hidden'}>${html(message)}</div>
    ${app.loadError ? '<button class="btn secondary" type="button" data-action="refresh-jobs">โหลดข้อมูลอีกครั้ง</button>' : ''}
    ${pendingControls(jobScope(job))}`;
}

const field = (id, label, value = '', options = {}) => `<div class="field">
  <label for="${id}">${html(label)}${options.required ? ' *' : ''}</label>
  <input class="control" id="${id}" type="${options.type || 'text'}" ${options.required ? 'required' : ''}
    ${options.readOnly ? 'readonly' : ''}
    ${options.serial ? 'autocapitalize="characters" spellcheck="false" autocomplete="off"' : ''}
    maxlength="${options.max || 700}" value="${html(value)}" placeholder="${html(options.placeholder || '')}">
</div>`;
const area = (id, label, value = '', { max = 1200, rows = 2, required = false } = {}) => `<div class="field"><label for="${id}">${html(label)}</label>
  <textarea class="control" id="${id}" ${required ? 'required' : ''} maxlength="${max}" rows="${rows}">${html(value)}</textarea></div>`;

function formFoot(label, scope) {
  return `<div class="form-foot">
    <div id="formMessage" class="saving-indicator" role="status" aria-live="polite"></div>
    <div id="formPending">${pendingControls(scope)}</div>
    <div id="formRefresh" hidden><button class="btn secondary" type="button" data-action="refresh-jobs">โหลดข้อมูลอีกครั้ง</button></div>
    <button class="btn ghost" type="button" data-action="back">ย้อนกลับ</button>
    <button class="btn ghost" type="button" data-action="discard-draft">ล้างร่าง</button>
    <button class="btn primary" type="submit" id="formSubmit">${html(label)}</button>
  </div>`;
}

function criteriaEditor(job) {
  const shown = slot => slot === 1 || !!text(job?.['result' + slot + 'Criteria']);
  return `<div class="section-title"><h2>เกณฑ์ตรวจ</h2><small class="hint">อย่างน้อย 1 เกณฑ์ สูงสุด 20</small></div>
    <div class="criteria-editor" id="criteriaEditor">${SLOTS.map(slot => `<div data-criteria-row ${shown(slot) ? '' : 'hidden'}>
      ${field('jfCriteria' + slot, 'เกณฑ์ข้อ ' + slot, job?.['result' + slot + 'Criteria'], {
        placeholder: 'เช่น ไม่มีน้ำมันรั่วบริเวณจุดต่อ'
      })}</div>`).join('')}</div>
    <div><button class="btn secondary sm" type="button" data-action="add-criteria" ${SLOTS.every(shown) ? 'hidden' : ''}>
      ${icon('plus')} เพิ่มเกณฑ์</button></div>`;
}

function renderJobForm() {
  const job = app.editJob ? findJob() : null;
  if (app.editJob && !job) {
    navigate('jobdetail');
    return;
  }
  const manual = !job, starting = manual || job.status === 'new';
  const products = [...new Set([...app.products, job?.product].filter(Boolean))];
  const categories = [...new Set([...app.claimTypes, job?.claimCategory].filter(Boolean))];
  const scope = manual ? manualScope : jobScope(job);
  $('jobFormContent').innerHTML = `<div class="page-head"><div><h1 tabindex="-1">${manual ? 'สร้างงานตรวจ' : starting ? 'ตั้งค่าก่อนเริ่มตรวจ' : 'แก้รายละเอียดงาน'}</h1>
    ${job ? `<p>${html(claimNumber(job))}</p>` : ''}</div></div>
    <form class="panel wide-form" id="jobForm">
      <fieldset class="form-layout" id="formFields">
        ${field('jfProblem', 'ชื่อปัญหา', job?.title, { required: true, max: 240 })}
        <div class="two-col">
          ${manual ? `<div class="field"><label for="jfCategory">ClaimType *</label>
            <select class="control" id="jfCategory" required><option value="">เลือกประเภทเคลม</option>
              ${categories.map(category => `<option value="${html(category)}">${html(category)}</option>`).join('')}</select></div>` :
            field('jfCategory', 'ClaimType', job.claimCategory || '—', { readOnly: true })}
          <div class="field"><label for="jfClaimType">Product${manual ? ' *' : ''}</label>
            <select class="control" id="jfClaimType" ${manual ? 'required' : 'disabled'}><option value="">เลือก Product</option>
              ${products.map(product => `<option value="${html(product)}" ${job?.product === product ? 'selected' : ''}>${html(product)}</option>`).join('')}</select></div>
        </div>
        ${field('jfModel', 'Model เริ่มต้น', job ? inspectionModel(job) : '', { placeholder: 'เช่น L5018SP-CF', required: manual, max: 70 })}
        ${area('jfModels', 'รุ่นที่เกี่ยวข้อง (คั่นด้วย comma หรือขึ้นบรรทัดใหม่)', selectedModels(job).join(', '), {max:2000})}
        <fieldset class="scope-products product-options"><legend>Product เพิ่มเติมในงานนี้</legend>${GROUPS.map(product => `<label><input type="checkbox" name="affectedProduct" value="${product}" ${selectedProducts(job).includes(product) ? 'checked' : ''}> ${product}</label>`).join('')}</fieldset>
        ${job ? `<p class="hint">เลือก Product และ Model แยกได้ในผลตรวจแต่ละคัน</p>` : ''}
        ${job?.detail && text(job.detail) !== job.title ? `<div class="method-box"><h3>รายละเอียดปัญหา</h3><p>${html(job.detail)}</p></div>` : ''}
        <div class="section-title"><h2>รูปตัวอย่าง</h2><span class="hint">ไม่บังคับ</span></div>
        <div class="two-col">
          <div class="reference-field ok">${photoInput('ok', job?.okPictureUrl, 'OK Reference')}</div>
          <div class="reference-field ng">${photoInput('ng', job?.ngPictureUrl, 'NG Reference')}</div>
          <div class="reference-field">${photoInput('method', job?.methodPictureUrl, 'รูปอธิบายวิธีตรวจ')}</div>
        </div>
        ${photoConnectionHint()}
        ${field('jfTarget', 'จำนวนเป้าหมาย (คัน)', job?.targetUnits ?? '', { type: 'number', max: 7 })}
        ${field('jfLocation', 'จุดตรวจ', job?.inspectionLocation)}
        ${area('jfMethod', 'Checking Method *', job?.checkingMethod, { required: true, max: 700, rows: 4 })}
        ${criteriaEditor(job)}
        ${area('jfNotes', 'หมายเหตุงาน', job?.notes, { max: 700 })}
      </fieldset>
      ${formFoot(manual ? 'สร้างงานและเริ่มตรวจ' : starting ? 'บันทึกและเริ่มตรวจ' : 'บันทึกรายละเอียดงาน', scope)}
    </form>`;
  syncFormControls();
}

function photoInput(slot, value, label) {
  const url = safeLink(value);
  return `<div class="camera-slot">
    <strong>${label}</strong>
    <input id="photoValue${slot}" type="hidden" value="${html(url)}">
    <div class="camera-preview" id="cameraPreview${slot}">${url
      ? `<img src="${html(url)}" alt="${label}" data-reference-photo>` : 'ยังไม่เลือกรูป'}</div>
    <div class="camera-controls">
      <button class="btn secondary sm" type="button" data-pick-file="capture${slot}">${icon('camera')} ถ่ายรูป</button>
      <input hidden id="capture${slot}" type="file" accept="image/*" capture="environment" data-photo-slot="${slot}">
      <button class="btn ghost sm" type="button" data-pick-file="choose${slot}">เลือกจากอัลบั้ม</button>
      <input hidden id="choose${slot}" type="file" accept="image/*" data-photo-slot="${slot}">
      <button class="btn ghost sm danger" type="button" data-photo-remove="${slot}" ${url ? '' : 'hidden'}>ลบรูป</button>
    </div>
    <p class="camera-state" id="cameraState${slot}" role="status">${url ? 'มีรูปที่บันทึกแล้ว' : ''}</p>
  </div>`;
}

function photoConnectionHint() {
  return PHOTO_UPLOAD_API_URL ? '<p class="hint">รูปจะส่งหลังบันทึกรายการสำเร็จ รีเฟรชเพื่อตรวจสอบรูปที่จัดเก็บแล้ว</p>' : '<p class="hint">ยังไม่เชื่อมระบบอัปโหลดรูปภาพ</p>';
}

function renderInspectionSetup(job) {
  $('inspectionContent').innerHTML = `<div class="page-head"><div><h1 tabindex="-1">เพิ่มการตรวจ</h1>
    <p>${html(job.title)}</p></div></div>
    <form class="panel wide-form" id="inspectionSetupForm">
      <fieldset class="form-layout" id="formFields">
        <p class="hint">งานนี้ยังไม่มีเกณฑ์ตรวจ กรอกชื่อเกณฑ์ครั้งเดียวเพื่อใช้ตรวจรถทุกคันในงานนี้</p>
        ${criteriaEditor(job)}
      </fieldset>
      ${formFoot('บันทึกเกณฑ์และไปตรวจรถ', jobScope(job))}
    </form>`;
  syncFormControls();
}

function modelChoices(job, product) {
  return DOMAIN.list([...app.modelMaster.filter(row => row.product === product).map(row => row.model), ...selectedModels(job).filter(model => !app.modelMaster.some(row => row.model === model) || app.modelMaster.some(row => row.model === model && row.product === product))]);
}
function renderInspection() {
  const job=findJob(),record=job&&liveRecords(job).find(r=>r.id===app.editRecord);
  if(!job||job.status!=='progress'||app.editRecord&&!record)return navigate('jobdetail');
  const criteria=DOMAIN.criteria(job,record||{});
  if(!criteria.length)return renderInspectionSetup(job);
  app.inspectionBaseline=record?inspectionSnapshot(job,record):'';
  const products=selectedProducts(job),product=record?.product||products[0]||job.product;
  const model=record?.model||(selectedModels(job).length===1?selectedModels(job)[0]:'');
  $('inspectionContent').innerHTML=`<div class="page-head"><div><p class="eyebrow">VEHICLE INSPECTION</p><h1 tabindex="-1">${record?'ตรวจต่อ / แก้ไขผล':'เพิ่มการตรวจ'}</h1><p>${html(job.title)}</p></div></div>
  <form class="panel wide-form" id="inspectionForm" data-record-slots="${criteria.map(c=>c.slot).join(' ')}"><fieldset class="form-layout" id="formFields">
    ${record?'':`<button type="button" class="btn secondary scan-button" data-action="scan-qr">${icon('qr')} สแกน PIN / Serial</button>`}
    <div class="two-col">
      ${field('insSerial','PIN / Serial Number',record?.serial,{required:true,readOnly:!!record,serial:true,max:65,placeholder:'เช่น KBULLCDCHPTD10006'})}
      <div class="field"><label for="insProduct">Product *</label><select id="insProduct" class="control" required>${products.map(p=>`<option value="${html(p)}" ${p===product?'selected':''}>${html(p)}</option>`).join('')}</select></div>
      <div class="field"><label for="insModel">Model *</label><input id="insModel" class="control" list="inspectionModels" required maxlength="70" value="${html(model)}" placeholder="ค้นหารุ่น หรือกรอกเอง" autocomplete="off"><datalist id="inspectionModels">${modelChoices(job,product).map(m=>`<option value="${html(m)}"></option>`).join('')}</datalist></div>
      ${field('insDate','วันที่ตรวจ',dateValue(record?.checkedAt)||dateValue(new Date()),{type:'date',required:true})}
    </div>
    <p class="hint">${html(app.modelMasterSource||'ยังไม่พบ Model Master · ตัวเลือกอ้างอิงจากขอบเขต Job')} · ไม่อนุมาน Model จาก PIN</p>
    <details class="optional-detail"><summary>สถานที่ / Lot</summary><div class="two-col optional-body">${field('insLocation','สถานที่ตรวจ',record?.location||job.inspectionLocation||'',{max:160})}${field('insLot','Lot No.',record?.lotNo,{max:100})}</div></details>
    <details class="inspection-method" open><summary>${icon('clipboard')} วิธีการตรวจ</summary><p>${html(job.checkingMethod||'ยังไม่ระบุวิธีตรวจ')}</p><details><summary>รูปอ้างอิงร่วมของงาน</summary>${referencePictures(job)}</details></details>
    <div class="inspection-title"><h2>ผลรายเกณฑ์</h2><small class="hint">${criteria.length} ข้อ</small></div>
    <p class="hint">ช่องว่าง = Pending · NA = ไม่เกี่ยวข้อง (ต้องเลือกเอง) · บันทึกแล้วกลับมาตรวจต่อได้</p>
    <div class="check-table">${criteria.map(c=>{
      const detail=DOMAIN.criterionValue(record||{},c),chosen=detail.result;
      return `<article class="check-row" data-state="${chosen.toLowerCase()||'pending'}"><div class="check-description" id="checkLabel${c.slot}">${html(c.label)}</div>
        <div class="check-choices" role="group" aria-labelledby="checkLabel${c.slot}">${['OK','NG','NA','Pending'].map(value=>`<button class="pick-result ${chosen===value||!chosen&&value==='Pending'?'selected '+value.toLowerCase():''}" type="button" data-result-slot="${c.slot}" data-result-value="${value}" aria-pressed="${chosen===value||!chosen&&value==='Pending'}">${value==='Pending'?'รอตรวจ':value}</button>`).join('')}</div>
        <input id="insR${c.slot}" type="hidden" value="${html(chosen)}">
        <details class="criterion-notes" ${detail.note||detail.ngDetail?'open':''}><summary>หมายเหตุ / รายละเอียด NG</summary><div class="optional-body">${area('insNote'+c.slot,'หมายเหตุเกณฑ์นี้',detail.note,{max:500})}${area('insNG'+c.slot,'รายละเอียด NG',detail.ngDetail,{max:500})}</div></details>
        ${detail.updatedAt?`<small class="hint">แก้ล่าสุด ${html(niceDate(detail.updatedAt))} · ${html(detail.inspector||'—')}</small>`:''}</article>`;
    }).join('')}</div>
    <div id="liveOverallResult" class="live-result" aria-live="polite"></div>
    <details class="optional-detail" id="inspectionNotes" ${record?.note?'open':''}><summary id="inspectionNotesLabel">หมายเหตุรวม</summary><div class="optional-body">${area('insRemarks','หมายเหตุรวม',record?.note)}</div></details>
    <details class="optional-detail" id="optionalPhotos" ${record?.photoSlots?.some(Boolean)?'open':''}><summary>รูป Label / PIN <span>ไม่บังคับ</span></summary><div class="optional-body">${photoConnectionHint()}${photoInput(1,record?.photoSlots?.[0],'รูป Label / PIN ของรถคันนี้')}</div></details>
    <p class="hint">ผู้ตรวจ ${html(memberName())}</p></fieldset>${formFoot('บันทึกผลตรวจ',jobScope(job))}</form>`;
  $('insProduct').addEventListener('change',()=>{const choices=modelChoices(job,val('insProduct'));$('inspectionModels').innerHTML=choices.map(m=>`<option value="${html(m)}"></option>`).join('');$('insModel').value='';app.dirty=true;persistDraft()});
  updateQuickResult();syncFormControls();
}
function formRecord() {
  const job=findJob();
  return {schemaVersion:2,criterionResults:DOMAIN.criteria(job).map(c=>({criterionId:c.id,result:val('insR'+c.slot),note:val('insNote'+c.slot),ngDetail:val('insNG'+c.slot)}))};
}
function refreshCriterionColors(){
 for(const row of document.querySelectorAll('.check-row')){
  const first=row.querySelector('[data-result-slot]');if(!first)continue;const value=val('insR'+first.dataset.resultSlot)||'Pending';row.dataset.state=value.toLowerCase();
  for(const button of row.querySelectorAll('[data-result-slot]')){const selected=button.dataset.resultValue===value;button.className='pick-result'+(selected?' selected '+value.toLowerCase():'');button.setAttribute('aria-pressed',String(selected))}
 }
}
function updateQuickResult(){
 if(!$('liveOverallResult'))return;
 const result=DOMAIN.inspection(findJob(),formRecord());
 $('liveOverallResult').className='live-result '+result.status.toLowerCase();
 $('liveOverallResult').innerHTML=`${vehicleBadge(result)} ${vehicleProgress(result)}`;
 refreshCriterionColors();
}


function renderCurrent() {
  const render = {
    home: renderHome, overview: renderOverview, monthdetail: renderMonthDetail, jobs: renderJobs, choose: renderChoose,
    reports: renderReports, reportpreview: renderReportPreview, jobdetail: renderDetail, recorddetail: renderRecordDetail
  }[app.page];
  render?.();
  showReadState();
}

const isForm = page => page === 'jobform' || page === 'inspection';
const detailPages = ['choose', 'jobdetail', 'jobform', 'inspection', 'recorddetail', 'monthdetail', 'reportpreview'];

function navigate(page, focus = false) {
  if (!app.member || !Object.hasOwn(TITLES, page)) return;
  StockQR.stop();
  app.page = page;
  $('jobFormContent').replaceChildren();
  $('inspectionContent').replaceChildren();
  app.inspectionBaseline = '';
  app.dirty = false;
  clearPhotoDraft();
  $('appMain').classList.toggle('form-page', isForm(page));
  $('backButton').hidden = !detailPages.includes(page);
  $('homeTitle').hidden = false;
  $('workspace').classList.toggle('home-page', page === 'home');
  for (const view of document.querySelectorAll('.view')) view.classList.toggle('active', view.id === page);
  const related = ['jobdetail', 'recorddetail'].includes(page);
  const current = page === 'inspection' ? 'inspection' : page === 'reportpreview' ? 'reports' : page === 'monthdetail' || related && app.detailOrigin === 'monthdetail' ? 'overview' :
    related && app.detailOrigin === 'reports' ? 'reports' : detailPages.includes(page) ? 'jobs' : page;
  for (const button of document.querySelectorAll('.nav-btn[data-nav]')) {
    button.classList.toggle('active', button.dataset.nav === current);
    if (button.dataset.nav === current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (page === 'jobform') renderJobForm();
  else if (page === 'inspection') renderInspection();
  else renderCurrent();
  if (isForm(page)) restoreDraft();
  window.scrollTo(0, 0);
  showReadState();
  if (focus) (page === 'home' ? $('topBrand') : $(page)).querySelector('h1')?.focus({ preventScroll: true });
}

function selectJob(key, origin = app.page) {
  if (!findJob(key)) return;
  if (app.selected !== key) app.detailMessage = null;
  Object.assign(app, { selected: key, editRecord: '', recordFilter: 'all', detailOrigin: origin });
  navigate('jobdetail', true);
}

function back() {
  if (app.page === 'reportpreview') navigate('reports', true);
  else if (app.page === 'monthdetail') navigate('overview', true);
  else if (app.page === 'choose') navigate(app.chooseOrigin, true);
  else if (app.page === 'jobdetail') navigate(app.detailOrigin, true);
  else if (['recorddetail', 'inspection'].includes(app.page) || app.editJob) navigate('jobdetail', true);
  else navigate(app.detailOrigin, true);
}

function currentScope() {
  if (app.page === 'jobform' && !app.editJob) return manualScope;
  const job = findJob();
  return job ? jobScope(job) : '';
}

function syncFormControls() {
  if (!isForm(app.page)) return;
  const pending = app.pending.has(currentScope());
  $('formFields').disabled = app.busy;
  $('formSubmit').disabled = app.busy || pending || !liveWritesAllowed();
  $('formSubmit').setAttribute('aria-busy', String(app.busy));
  $('formPending').innerHTML = pendingControls(currentScope());
  for (const button of $('formPending').querySelectorAll('button')) button.disabled = app.busy;
  if (pending && !$('formMessage').textContent) {
    showFeedback('มีคำขอที่รอยืนยันผลบันทึก', 'warning');
  }
}

function showFeedback(message, kind = '') {
  if (isForm(app.page)) {
    const output = $('formMessage');
    output.textContent = message;
    output.className = 'saving-indicator' + (kind ? ' ' + kind : '');
    return;
  }
  const job = findJob();
  if (job) {
    app.detailMessage = { jobId: job.id, text: message, kind };
    const output = $('detailMessage');
    if (output) {
      output.hidden = !message;
      output.textContent = message;
      output.className = 'notice' + (kind ? ' ' + kind : '');
    }
  }
}

function setBusy(busy) {
  app.busy = busy;
  $('workspace').classList.toggle('write-busy', busy);
  syncFormControls();
  showReadState();
}

function confirmAction(title, message, label = 'ยืนยัน', variant = '') {
  const dialog = $('confirmDialog');
  if (!dialog.showModal) return Promise.resolve(window.confirm(title + '\n\n' + message));
  if (dialog.open) return Promise.resolve(false);
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = message;
  $('confirmButton').textContent = label;
  $('confirmButton').classList.toggle('danger-confirm', variant === 'danger');
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

async function leaveForm() {
  if (!app.dirty || !isForm(app.page)) return true;
  persistDraft();
  return confirmAction('ออกจากหน้านี้', 'เก็บข้อความร่างไว้ในอุปกรณ์นี้แล้ว รูปที่ยังไม่ส่งต้องเลือกใหม่' , 'ออกจากหน้า');
}

async function withWrite(operation) {
  if (app.busy) return;
  if (!liveWritesAllowed()) return showFeedback('ยังไม่เปิดการบันทึกข้อมูลจริง', 'error');
  if (app.partial) return showFeedback('ข้อมูลไม่ครบ กรุณาโหลดข้อมูลครบก่อนบันทึก', 'error');
  if (app.jobsLoading || !app.jobsLive) {
    showFeedback('กรุณาโหลดข้อมูลให้สำเร็จก่อนบันทึก', 'error');
    return;
  }
  setBusy(true);
  try {
    await operation();
  } catch (error) {
    showFeedback(error.message || 'ส่งคำขอไม่สำเร็จ', 'error');
  } finally {
    releaseWrite();
  }
}

function releaseWrite() {
  setBusy(false);
  if (app.page === 'jobdetail') renderDetail();
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function confirmPending(scope, attempts = 7) {
  const pending = app.pending.get(scope);
  const epoch = sessionEpoch;
  if (!pending) return true;
  let newest;
  const deadline = Date.now() + 24000;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempts > 1) await delay(attempt ? 1900 : 650);
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    try {
      newest = await readJobs(Math.min(10000, remaining));
    } catch {
      continue;
    }
    if (epoch !== sessionEpoch || !app.member) return false;
    if (newest.partial) continue;
    const jobs = newest.jobs.filter(Boolean).map(normalizeJob);
    const match = jobs.find(job => pending.matches(job, newest));
    if (match) {
      app.pending.delete(scope);
      persistPending();
      clearSavedDraft(scope);
      applyJobs(newest);
      await pending.onSaved(match);
      return true;
    }
  }
  if (newest && app.member) applyJobs(newest);
  showFeedback(newest ? 'ยังไม่พบผลบันทึกที่ยืนยันได้ กรุณาตรวจสอบอีกครั้ง' : 'ยังยืนยันผลไม่ได้ กรุณาตรวจสอบอีกครั้งเมื่อเชื่อมต่อได้', 'warning');
  return false;
}

async function trackWrite(scope, action, payload, makeMatcher, onSaved) {
  if (app.pending.has(scope)) { showFeedback('คำขอก่อนหน้ายังไม่ยืนยัน กรุณาตรวจสอบผลก่อน', 'warning'); return false; }
  const descriptor = { scope, action, payload, clientRequestId: crypto.randomUUID(), response: null };
  const pending = { descriptor, matches: () => false, onSaved };
  app.pending.set(scope, pending);
  if (!persistPending()) {
    app.pending.delete(scope);
    throw Error('เก็บสถานะคำขอในอุปกรณ์ไม่ได้ กรุณาเปิด local storage ก่อนบันทึก');
  }
  showFeedback('กำลังส่งคำขอ…');
  let response;
  try {
    response = await post(WRITE_API_URL, action, { payload, clientRequestId: descriptor.clientRequestId });
  } catch {
    showFeedback('ยังยืนยันผลคำขอไม่ได้ เก็บสถานะไว้แล้ว ห้ามส่งซ้ำจนกว่าจะตรวจสอบผล', 'warning');
    return false;
  }
  if (response.status === 'WRITE_REJECTED') { app.pending.delete(scope); persistPending(); showFeedback(response.message || 'คำขอถูกปฏิเสธ กรุณาโหลดข้อมูลล่าสุด', 'error'); return false; }
  if (response.status !== 'WRITE_REQUEST_ACCEPTED') {
    showFeedback('ยังยืนยันผลคำขอไม่ได้ กรุณาตรวจสอบกับผู้ดูแล', 'warning');
    return false;
  }
  descriptor.response = { requestId: text(response.requestId), status: response.status };
  const matches = makeMatcher(response);
  pending.matches = job => operationIdentity(descriptor,job) && matches(job);
  persistPending();
  showFeedback('รับคำขอแล้ว กำลังตรวจสอบผลบันทึก…');
  return confirmPending(scope);
}

async function recheckSave() {
  const scope = currentScope();
  const pending = app.pending.get(scope);
  if (!pending || app.busy || app.jobsLoading) return;
  if (app.capabilities.requestStatus) {
    try {
      const status = await post(JOBS_API_URL, 'requestStatus', {clientRequestId:pending.descriptor.clientRequestId});
      if (status.status === 'WRITE_REJECTED') { app.pending.delete(scope); persistPending(); syncFormControls(); return showFeedback(status.message || 'ระบบยืนยันว่าไม่บันทึกคำขอนี้ กรุณาโหลดข้อมูลล่าสุด', 'error'); }
    } catch { /* Read-back below is still safe; never resend. */ }
  }
  if (!pending.descriptor.response) pending.matches = job => operationMatches(pending.descriptor, job);
  setBusy(true);
  try { await confirmPending(scope, 1); } finally { releaseWrite(); }
}

function jobData(job) {
  if (!job) return { jobKey: '', itemId: 0 };
  const itemId = Number(job.sharePointItemId);
  if (!job.id || !Number.isSafeInteger(itemId) || itemId < 1) throw Error('ไม่พบ Item ID ที่ใช้บันทึก กรุณาโหลดงานอีกครั้ง');
  return { jobKey: job.id, itemId, expectedJobVersion: job.version };
}
const validModel = /^[\p{L}\p{N} _./-]{1,70}$/u;
function inspectionModel(job) {
  return [job.defaultInspectionModel, job.model].find(model => validModel.test(text(model))) || '';
}

const serialPattern = /^[A-Z0-9_.-]{3,65}$/;
const jobFields = { inspectionLocation:'jfLocation', checkingMethod:'jfMethod', ...Object.fromEntries(SLOTS.map(slot => ['result'+slot+'Criteria', 'jfCriteria'+slot])), okPictureUrl:'photoValueok', ngPictureUrl:'photoValueng', methodPictureUrl:'photoValuemethod', notes:'jfNotes' };

function jobDetailsMatch(job, fields) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])])) : value;
  const normalize = value => Array.isArray(value) || value && typeof value === 'object' ? JSON.stringify(stable(value)) : text(value).replace(/\r\n/g, '\n');
  return Object.entries(fields).every(([key, value]) =>
    normalize(job[key === 'notes' ? 'storedNotes' : key]) === normalize(value));
}

function validationError(message, inputId) {
  showFeedback(message, 'error');
  const input = $(inputId);
  const details = input?.closest('details');
  if (details) details.open = true;
  input?.focus();
}

// The existing write endpoint stores the product in claimType and accepts up to 700 characters in Notes.
// Keep the extra job fields in a delimited header so older notes and existing Flows continue to work.
const notesHeader = '[Stock Inspection]';
function decodeJobNotes(value) {
  const storedNotes = text(value);
  const [header, ...rest] = storedNotes.replace(/\r\n/g, '\n').split('\n\n');
  if (!header.startsWith(notesHeader + '\n')) {
    return { storedNotes, notes: storedNotes, claimCategory: '', startedBy: '', startedAt: '', defaultInspectionModel: '' };
  }
  const lines = header.split('\n');
  const read = label => text(lines.find(line => line.startsWith(label))?.slice(label.length));
  return {
    storedNotes, notes: rest.join('\n\n'), claimCategory: read('ประเภทเคลม: '),
    startedBy: read('ผู้เริ่มตรวจ: '), startedAt: read('เริ่มตรวจเมื่อ: '), defaultInspectionModel: read('รุ่นเริ่มต้นสำหรับตรวจ: ')
  };
}

function encodeJobNotes({ notes, claimCategory, startedBy, startedAt, defaultInspectionModel }) {
  const fields = [
    ['ประเภทเคลม', claimCategory], ['ผู้เริ่มตรวจ', startedBy], ['เริ่มตรวจเมื่อ', startedAt],
    ['รุ่นเริ่มต้นสำหรับตรวจ', defaultInspectionModel]
  ].filter(([, value]) => text(value));
  if (!fields.length) return notes;
  const metadata = fields.map(([label, value]) => label + ': ' + text(value).replace(/[\r\n]+/g, ' '));
  return [notesHeader, ...metadata].join('\n') + (notes ? '\n\n' + notes : '');
}

async function finishJob() {
  const job = findJob();
  if (!job || job.status !== 'progress' || !liveRecords(job).length || app.pending.has(jobScope(job))) return;
  if (liveRecords(job).some(record => !vehicleInspection(job, record).complete)) {
    return showFeedback('ยังมีรถรอตรวจต่อ กรุณาตรวจให้ครบก่อนจบงาน', 'warning');
  }
  if (!await confirmAction('จบการตรวจ', 'งานจะย้ายไปหน้ารายงานและปิดการแก้ผลตรวจรายคัน', 'จบการตรวจ')) return;
  await withWrite(async () => {
    const { data, current } = await latestActiveJob(job);
    const records = liveRecords(current);
    applyJobs(data);
    if (!records.length || records.some(record => !vehicleInspection(current, record).complete)) {
      return showFeedback('กรุณาตรวจรถที่ค้างให้ครบก่อนจบงาน', 'warning');
    }
    await trackWrite(jobScope(job), 'finishJob', jobData(current),
      () => item => item.id === job.id && finished(item),
      () => {
        app.detailOrigin = 'reports';
        showFeedback('ปิดการตรวจแล้ว · รอรายงาน', 'success');
      });
  });
}

async function startSavedJob(job) {
  if (app.page !== 'jobdetail' || app.selected !== job.id) selectJob(job.id, 'jobs');
  app.detailOrigin = 'jobs';
  if (job.status === 'progress') {
    showFeedback('พร้อมบันทึกผลตรวจ', 'success');
    return;
  }
  if (job.status !== 'new') return;
  try {
    await trackWrite(jobScope(job), 'selectJob', jobData(job),
      () => current => current.id === job.id && current.status === 'progress',
      () => showFeedback('เริ่มงานแล้ว · พร้อมบันทึกผลตรวจ', 'success'));
  } catch {
    showFeedback('บันทึกวิธีและเกณฑ์ตรวจแล้ว กดตั้งค่าก่อนเริ่มตรวจเพื่อลองเริ่มงานอีกครั้ง', 'warning');
  }
}

async function submitJob(event) {
  event.preventDefault();
  const job = app.editJob ? findJob() : null;
  if (app.editJob && !job) return;
  const scope = job ? jobScope(job) : manualScope;
  if (app.busy || app.pending.has(scope) || job && finished(job)) return;
  if (!photosCanSave()) return;
  const starting = !job || job.status === 'new';
  const model = val('jfModel'), problem = val('jfProblem'), product = val('jfClaimType');
  const category = job ? job.claimCategory : val('jfCategory');
  if (!problem) return validationError('กรุณากรอกชื่อปัญหา', 'jfProblem');
  if (!job && !category) return validationError('กรุณาเลือกประเภทเคลม', 'jfCategory');
  if (!job && !app.products.includes(product)) return validationError('กรุณาเลือก Product', 'jfClaimType');
  if ((!job || model) && !validModel.test(model)) return validationError('กรุณาตรวจรูปแบบรุ่นรถ (สูงสุด 70 ตัวอักษร)', 'jfModel');
  if (!val('jfMethod')) return validationError('กรุณากรอกวิธีตรวจ', 'jfMethod');
  if (!SLOTS.some(slot => val('jfCriteria' + slot))) {
    return validationError('กรุณากรอกเกณฑ์ตรวจอย่างน้อย 1 ข้อ', 'jfCriteria1');
  }
  const targetRaw = val('jfTarget');
  const targetUnits = targetRaw === '' ? null : Number(targetRaw);
  if (targetUnits !== null && (!Number.isSafeInteger(targetUnits) || targetUnits < 0 || targetUnits > 9999999)) return validationError('เป้าหมายต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 9999999', 'jfTarget');
  const values = Object.fromEntries(Object.entries(jobFields).map(([key, id]) => [key, val(id)]));
  const notes = val('jfNotes');
  values.notes = encodeJobNotes({
    notes, claimCategory: category, startedBy: job?.startedBy || (starting ? memberName() : ''),
    startedAt: job?.startedAt || (starting ? dateValue(new Date()) : ''),
    defaultInspectionModel: job && model !== job.model ? model : ''
  });
  if (values.notes.length > 700) return validationError('หมายเหตุยาวเกินพื้นที่จัดเก็บ กรุณาย่อข้อความ', 'jfNotes');
  const affectedModels = DOMAIN.list([model, ...DOMAIN.list(val('jfModels'))]);
  if (affectedModels.some(model => !validModel.test(model))) return validationError('กรุณาตรวจรูปแบบรุ่นรถ', 'jfModels');
  const affectedProducts = DOMAIN.list([product, ...[...document.querySelectorAll('[name="affectedProduct"]:checked')].map(input => input.value)]);
  const criteria = SLOTS.filter(slot => text(values['result'+slot+'Criteria'])).map(slot => ({id:DOMAIN.criteria(job || {}).find(c => c.slot === slot)?.id || 'C'+slot,slot,label:values['result'+slot+'Criteria']}));
  Object.assign(values, { title: problem, targetUnits, affectedModels, affectedProducts, criteria, schemaVersion:2 });
  const payload = { ...jobData(job), ...values };
  const matchDetails = current => jobDetailsMatch(current, values);
  if (job && !app.photos.size && matchDetails(job)) {
    if (starting) await withWrite(() => startSavedJob(job));
    else showFeedback('ยังไม่มีรายละเอียดที่เปลี่ยนแปลง');
    return;
  }
  if (!job && !await confirmAction('สร้างงานตรวจ', problem + '\nรุ่น ' + model, 'สร้างและเริ่มตรวจ')) return;
  const photoFiles = selectedPhotoFiles();
  await withWrite(async () => {
    Object.assign(payload, values);
    if (job) {
      const latest = await readJobs();
      const currentRaw = latest.jobs.filter(Boolean).map(normalizeJob).find(item => item.id === job.id);
      if (!currentRaw || latest.partial) throw Error('ยังตรวจสอบข้อมูลงานล่าสุดไม่ได้');
      const currentJob = currentRaw;
      if (currentJob.status !== job.status || JSON.stringify([...Object.keys(jobFields), 'title', 'targetUnits', 'model'].map(key => currentJob[key])) !== JSON.stringify([...Object.keys(jobFields), 'title', 'targetUnits', 'model'].map(key => job[key]))) throw Error('รายละเอียดงานเปลี่ยนแล้ว กรุณาเปิดงานใหม่');
      if (liveRecords(currentJob).length && SLOTS.some(slot => text(values['result' + slot + 'Criteria']) !== text(currentJob['result' + slot + 'Criteria']))) throw Error('งานมีผลตรวจแล้ว ไม่สามารถเปลี่ยนเกณฑ์ที่ใช้แปลผลเดิมได้');
      await trackWrite(scope, 'updateJob', payload,
        () => current => current.id === job.id && matchDetails(current),
        async current => {
          if (app.page === 'jobform') navigate('jobdetail', true);
          if (photoFiles.length) await uploadSavedPhotos(photoFiles, current, '', current.sharePointItemId);
          else showFeedback('บันทึกรายละเอียดงานแล้ว', 'success');
          if (starting) await startSavedJob(current);
        });
      return;
    }
    Object.assign(payload, { model, problem, claimType: product, detail: notes });
    await trackWrite(scope, 'createJob', payload, response => current => {
      const request = text(response.requestId);
      return !!request && [current.id, current.importKey].some(key => text(key).endsWith(request)) && matchDetails(current);
    }, async current => {
      if (photoFiles.length) await uploadSavedPhotos(photoFiles, current, '', current.sharePointItemId);
      await startSavedJob(current);
    });
  });
}

async function submitInspectionSetup(event) {
  event.preventDefault();
  const job = findJob();
  if (!job || job.status !== 'progress' || app.busy || app.pending.has(jobScope(job))) return;
  if (criteriaSlots(job).length) return navigate('inspection', true);
  const criteria = Object.fromEntries(SLOTS.map(slot => ['result' + slot + 'Criteria', val('jfCriteria' + slot)]));
  if (!Object.values(criteria).some(Boolean)) return validationError('กรุณากรอกชื่อเกณฑ์ตรวจอย่างน้อย 1 ข้อ', 'jfCriteria1');
  const fields = Object.fromEntries(Object.keys(jobFields).map(key => [key, text(job[key])]));
  const details = { ...fields, ...criteria, schemaVersion:2, criteria: SLOTS.filter(slot => criteria['result'+slot+'Criteria']).map(slot => ({id:'C'+slot,slot,label:criteria['result'+slot+'Criteria']})), notes: text(job.storedNotes) };
  await withWrite(() => trackWrite(jobScope(job), 'updateJob', { ...jobData(job), ...details },
    () => current => current.id === job.id && jobDetailsMatch(current, details),
    current => {
      if (app.page === 'inspection' && app.selected === job.id) navigate('inspection', true);
      showFeedback(current.status === 'progress' ? 'บันทึกเกณฑ์แล้ว' : 'บันทึกเกณฑ์แล้ว สถานะงานมีการเปลี่ยนแปลง', 'success');
    }));
}

function formCriteria() {
  return text($('inspectionForm')?.dataset.recordSlots).split(' ').map(Number).filter(slot => SLOTS.includes(slot));
}

function ngCriteriaText(job, slots) {
  return slots.map(slot => criterionLabel(job, slot).slice(0, 260)).join('\n');
}

function inspectionNgDetail(job, results, existing) {
  const failed = SLOTS.filter(slot => results[slot - 1] === 'NG');
  if (!failed.length) return '';
  const sameFailedSlots = SLOTS.every(slot => failed.includes(slot) === (resultCode(existing?.['result' + slot]) === 'NG'));
  return sameFailedSlots && existing?.ngDetail ? text(existing.ngDetail) : ngCriteriaText(job, failed);
}

function recordMatches(record,payload){
 const job=findJob(payload.jobKey)||{criteria:payload.criteria||[]};
 const values=DOMAIN.criteria(job,record).every(c=>{
  const actual=DOMAIN.criterionValue(record,c),expected=payload.criterionResults?.find(x=>x.criterionId===c.id);
  return expected&&['result','note','ngDetail'].every(k=>text(actual[k])===text(expected[k]));
 });
 return (!payload.recordItemId||Number(record.sharePointItemId)===payload.recordItemId)&&record.serial.toUpperCase()===payload.serial&&
  record.product===payload.product&&text(record.model)===payload.model&&values&&
  text(record.location)===payload.location&&text(record.lotNo)===payload.lotNo&&dateValue(record.checkedAt)===payload.inspectionDate&&text(record.note)===payload.remarks&&
  text(record.ngDetail)===payload.ngDetail&&text(record.photoSlots?.[0])===payload.photoUrl1&&Number(record.schemaVersion)===2&&
  DOMAIN.inspection(job,record).overallResult===payload.overallResult&&DOMAIN.inspection(job,record).isComplete===payload.isComplete;
}
function inspectionSnapshot(job,record){return JSON.stringify([record.version,DOMAIN.criteria(job,record).map(c=>[c.label,DOMAIN.criterionValue(record,c)]),record.product,record.model,record.location,record.lotNo,record.checkedAt,record.note,record.ngDetail,record.photoSlots])}
async function latestActiveJob(job){
 const data=await readJobs();const current=data.jobs.filter(Boolean).map(normalizeJob).find(item=>item.id===job.id);
 if(!current||current.status!=='progress'){applyJobs(data);throw Error('งานนี้เปลี่ยนสถานะ กรุณาเปิดงานล่าสุด')}
 return {data,current};
}
async function submitInspection(event){
 event.preventDefault();const job=findJob();if(!job||job.status!=='progress'||app.busy||app.pending.has(jobScope(job)))return;
 const existing=liveRecords(job).find(r=>r.id===app.editRecord);if(app.editRecord&&!existing)return showFeedback('ไม่พบผลเดิม กรุณาเปิดรายการใหม่','error');
 const serial=val('insSerial').toUpperCase(),model=val('insModel'),product=val('insProduct'),recordItemId=Number(existing?.sharePointItemId||0);
 if(!serialPattern.test(serial))return validationError('PIN / Serial ใช้ A–Z, ตัวเลข จุด ขีด หรือขีดล่าง 3–65 ตัว','insSerial');
 if(existing&&(!Number.isSafeInteger(recordItemId)||recordItemId<1))return showFeedback('ไม่พบ Item ID เดิม','error');
 if(!validModel.test(model))return validationError('กรุณาระบุ Model ตามป้ายรถ','insModel');
 if(!selectedProducts(job).includes(product))return validationError('Product ไม่อยู่ในขอบเขตงาน','insProduct');
 if(!StockDomain.validDate(val('insDate'),dateValue(new Date())))return validationError('วันที่ไม่ถูกต้องหรืออยู่ในอนาคต','insDate');
 if(!existing&&liveRecords(job).some(r=>r.serial.toUpperCase()===serial))return validationError('มีเลขตัวรถนี้ในงานแล้ว เปิดรายการเดิมเพื่อตรวจต่อ','insSerial');
 const record=formRecord(),cs=DOMAIN.criteria(job);if(!cs.length)return showFeedback('ต้องมีเกณฑ์ตรวจอย่างน้อยหนึ่งข้อ','error');
 const ng=record.criterionResults.filter(c=>c.result==='NG');
 const aggregate=DOMAIN.inspection(job,record),changes=DOMAIN.changes(job,existing,record);
 const payload={...jobData(job),schemaVersion:2,recordItemId,serial,product,model,location:val('insLocation'),expectedVersion:existing?.version??null,
  criteria:cs,criterionResults:record.criterionResults,changes,overallResult:aggregate.overallResult,isComplete:aggregate.isComplete,
  lotNo:val('insLot'),inspectionDate:val('insDate'),remarks:val('insRemarks'),photoUrl1:val('photoValue1'),
  ngDetail:ng.map(r=>[cs.find(c=>c.id===r.criterionId)?.label,r.ngDetail].filter(Boolean).join(': ')).join('\n'),
  ...Object.fromEntries(cs.map(c=>['result'+c.slot,record.criterionResults.find(r=>r.criterionId===c.id).result]))};
 if(existing&&!app.photos.size&&recordMatches(existing,payload))return showFeedback('ยังไม่มีข้อมูลที่เปลี่ยนแปลง');
 if(!selectedModels(job).includes(model)){
  if(!await confirmAction('ยืนยัน Model นอกตัวเลือก',`Model ${model} ไม่อยู่ในรายการของงาน กรุณาตรวจป้ายรถและขอบเขตงานก่อนยืนยัน`,'ยืนยันรุ่นตามป้าย'))return;
  payload.manualModelConfirmed=true;
 }
 await withWrite(async()=>{
  const {data,current}=await latestActiveJob(job);if(data.partial)throw Error('ข้อมูลไม่ครบ ยังบันทึกไม่ได้');
  if(JSON.stringify(DOMAIN.criteria(current))!==JSON.stringify(cs))throw Error('เกณฑ์เปลี่ยนแล้ว กรุณาเปิดงานใหม่');
  if(!existing&&liveRecords(current).some(r=>r.serial.toUpperCase()===serial))return validationError('มีเลขตัวรถนี้ในงานแล้ว','insSerial');
  if(existing){const latest=liveRecords(current).find(r=>Number(r.sharePointItemId)===recordItemId);if(!latest||inspectionSnapshot(current,latest)!==app.inspectionBaseline){applyJobs(data);return showFeedback('รายการนี้มีการเปลี่ยนแปลง กรุณาเปิดผลล่าสุดก่อนบันทึก','error')}}
  payload.expectedJobVersion=current.version;
  const files=selectedPhotoFiles();
  await trackWrite(jobScope(job),'saveInspection',payload,()=>saved=>saved.id===job.id&&liveRecords(saved).some(r=>recordMatches(r,payload)),async saved=>{
   const savedRecord=liveRecords(saved).find(r=>r.serial.toUpperCase()===serial);
   app.editRecord='';app.recordFilter='all';navigate('jobdetail',true);
   showFeedback(`${MOCK?'บันทึกข้อมูลจำลอง':'ยืนยันผลบันทึกแล้ว'} · ${serial} · ${aggregate.overallResult} · ${aggregate.checked}/${aggregate.total} ข้อ`,'success');
   if(files.length)await uploadSavedPhotos(files,saved,serial,savedRecord.sharePointItemId);
  });
 });
}


async function deleteRecord(id) {
  const job = findJob();
  const record = job && liveRecords(job).find(item => item.id === id);
  if (!app.deleteEnabled || !record?.sharePointItemId || job.status !== 'progress' || app.pending.has(jobScope(job))) return;
  if (!await confirmAction('ลบผลตรวจ', 'นำผลตรวจ ' + record.serial + ' ออกจากยอดตรวจของงานนี้', 'ลบผลตรวจ')) return;
  await withWrite(() => trackWrite(jobScope(job), 'deleteInspection',
    { ...jobData(job), recordItemId: Number(record.sharePointItemId), serial: record.serial },
    () => (current, response) => !response.partial && current.id === job.id &&
      !liveRecords(current).some(item => item.sharePointItemId === record.sharePointItemId),
    () => showFeedback('ลบผลตรวจ ' + record.serial + ' แล้ว', 'success')));
}

// An approved gateway must delegate all file and Lists writes to Power Automate.
// Never treat upload acceptance as a persisted photo URL; the URL must be read back.
async function jpegBase64(file) {
  if (!file || !file.type.startsWith('image/')) throw Error('กรุณาเลือกรูปภาพ');
  if (file.size > 15 * 1024 * 1024) throw Error('รูปภาพต้องไม่เกิน 15 MB');
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(Error('ไม่สามารถเปิดไฟล์ภาพได้')); };
    img.src = blobUrl;
  });
  let maxEdge = 1400;
  for (let pass = 0; pass < 5; pass++) {
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('ไม่สามารถแปลงภาพได้');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', Math.max(.46, .78 - pass * .07));
    const base64 = dataUrl.split(',')[1];
    if (base64 && base64.length <= 2350000) return base64;
    maxEdge = Math.round(maxEdge * .72);
  }
  throw Error('รูปภาพมีขนาดใหญ่เกินไปหลังบีบอัด กรุณาเลือกรูปใหม่');
}

function selectedPhotoFiles() {
  return [...app.photos.entries()].map(([slot, draft]) => ({ slot, file: draft.file }));
}

function transferKey(){return 'stock-photo-v2:'+storageIdentity()}
function saveTransfers(){try{localStorage.setItem(transferKey(),JSON.stringify(app.transfers));return true}catch{return false}}
function transferMarkup(job){
 const items=app.transfers.filter(item=>item.jobId===job.id);
 return items.length?`<section class="panel"><h2>สถานะรูปภาพ</h2>${items.map(item=>`<div class="upload-state ${item.state.toLowerCase()}"><strong>${html(item.name)}</strong><span class="result-tag">${item.state}</span><p class="hint">${html(item.message)}</p>${item.state==='Pending'?`<button class="btn secondary sm" type="button" data-photo-check="${html(item.requestId)}">ตรวจสอบผลรูป</button>`:''}</div>`).join('')}</section>`:'';
}
async function checkPhotoTransfer(requestId){
 const entry=app.transfers.find(item=>item.requestId===requestId);if(!entry)return;
 try{const data=await readJobs();const job=data.jobs.filter(Boolean).map(normalizeJob).find(job=>job.id===entry.jobId);const url=job&&!data.partial&&StockAdapter.photoConfirmed(entry,job);
  if(url){entry.state='Uploaded';entry.message='อ่านยืนยันการจัดเก็บและผูกรูปกับรายการแล้ว';applyJobs(data)}
  else{entry.state='Pending';entry.message='ยังไม่พบรูปที่ตรงกับคำขอเดิม ไม่ส่งไฟล์ซ้ำ'}
 }catch{entry.state='Pending';entry.message='ยังอ่านผลไม่ได้ กรุณาตรวจสอบอีกครั้งเมื่อเชื่อมต่อได้'}
 saveTransfers();if(app.page==='jobdetail')renderDetail();
}
async function uploadPhoto(file,job,serial,slot,itemId){
 const photoType=String(slot)==='1'?'SERIAL':slot==='ok'?'JOB_OK':slot==='ng'?'JOB_NG':slot==='method'?'JOB_METHOD':'';
 const entry={jobId:job.id,itemId:Number(itemId),slot:String(slot),name:file.name,requestId:crypto.randomUUID(),state:'Pending',message:'กำลังเตรียมรูป'};
 const unresolved=app.transfers.find(t=>t.jobId===job.id&&t.itemId===entry.itemId&&t.slot===entry.slot&&t.state==='Pending');
 if(unresolved)return unresolved;
 app.transfers.push(entry);if(!saveTransfers()){entry.state='Failed';entry.message='เก็บ Request ID ไม่ได้ จึงยังไม่ส่งไฟล์';return entry}
 if(MOCK||!liveWritesAllowed()||!safeLink(PHOTO_UPLOAD_API_URL)||!app.capabilities.photoReadback){entry.state='Failed';entry.message=MOCK?'MOCK · ไม่ส่งหรือจัดเก็บไฟล์จริง ข้อมูลผลตรวจจำลองบันทึกแล้ว':'ยังไม่เปิดบริการรูปภาพที่ยืนยันผลได้';saveTransfers();return entry}
 let transmitted=false;
 try{
  if(!photoType||!Number.isSafeInteger(entry.itemId)||entry.itemId<1)throw Error('Item ID ของรูปไม่ถูกต้อง');
  const fileBase64=await jpegBase64(file);entry.message='Upload Pending · รอระบบยืนยัน';saveTransfers();transmitted=true;
  const response=await fetchJson(PHOTO_UPLOAD_API_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({photoType,itemId:entry.itemId,jobKey:job.id,serialNumber:serial,mimeType:'image/jpeg',fileBase64,requestId:entry.requestId,idToken:idToken()})},75000);
  if(response.status==='UPLOAD_REJECTED'){entry.state='Failed';entry.message='ระบบยืนยันว่าไม่จัดเก็บรูปนี้';saveTransfers();return entry}
  entry.message='ระบบรับคำขอแล้ว รอตรวจ URL ที่ผูกกับรายการ';saveTransfers();
  await checkPhotoTransfer(entry.requestId);
 }catch(error){entry.state=transmitted?'Pending':'Failed';entry.message=transmitted?'ยังไม่ทราบผลส่งไฟล์ ตรวจสอบ Request เดิมก่อนส่งซ้ำ':error.message;saveTransfers()}
 return entry;
}
async function uploadSavedPhotos(files,job,serial,itemId){
 for(const {slot,file}of files)await uploadPhoto(file,job,serial,slot,itemId);
 const failed=app.transfers.some(item=>item.jobId===job.id&&item.state==='Failed');
 showFeedback(failed?'บันทึกข้อมูลแล้ว แต่รูปภาพ Failed · รูปเดิมยังคงอยู่':'บันทึกข้อมูลแล้ว กรุณาตรวจสถานะรูปภาพ','warning');
 if(app.page==='jobdetail')renderDetail();
}
function photosCanSave(){return true}


function clearPhotoDraft() {
  for (const draft of app.photos.values()) URL.revokeObjectURL(draft.preview);
  app.photos.clear();
  app.uploadDraft = '';
}

function removePhoto(slot) {
  const draft = app.photos.get(slot);
  if (draft) URL.revokeObjectURL(draft.preview);
  app.photos.delete(slot);
  $('photoValue' + slot).value = '';
  $('cameraPreview' + slot).textContent = 'ยังไม่เลือกรูป';
  $('cameraState' + slot).textContent = '';
  document.querySelector(`[data-photo-remove="${slot}"]`).hidden = true;
  app.dirty = true;
}

function selectPhoto(input) {
  const file = input.files?.[0];
  const slot = input.dataset.photoSlot;
  input.value = '';
  if (!file || app.busy) return;
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
    $('cameraState' + slot).textContent = 'เลือกไฟล์รูปขนาดไม่เกิน 15 MB';
    return;
  }
  const savedUrl = val('photoValue' + slot);
  removePhoto(slot);
  $('photoValue' + slot).value = savedUrl; // Preserve confirmed image until replacement is linked.
  const preview = URL.createObjectURL(file);
  app.photos.set(slot, { file, preview });
  const img = new Image();
  img.src = preview;
  img.alt = 'ภาพตัวอย่างที่เลือก';
  $('cameraPreview' + slot).replaceChildren(img);
  $('cameraState' + slot).textContent = file.name;
  document.querySelector(`[data-photo-remove="${slot}"]`).hidden = false;
}

async function handleClick(event) {
  const button = event.target.closest('button');
  if (!button || !button.closest('#appMain') || button.disabled || app.busy) return;
  const { action, nav, job, starJob, month, monthFilter, viewRecord, reportFilter, recordFilter, resultSlot, resultValue,
    editRecord, deleteRecord: remove, pickFile, photoRemove } = button.dataset;
  if (button.dataset.serialReport) { app.reportKind='serial'; app.reportJob=app.selected; app.reportSerial=button.dataset.serialReport; app.reportMonth=''; navigate('reportpreview', true);
  } else if (button.dataset.photoCheck) { await checkPhotoTransfer(button.dataset.photoCheck);
  } else if (button.dataset.previewJob) {
    app.reportKind='job'; app.reportSerial='';
    app.reportJob = button.dataset.previewJob;
    navigate('reportpreview', true);
  } else if (nav) {
    if (await leaveForm()) {
      if (nav === 'inspection') {
        if (findJob()?.status === 'progress') { app.editRecord = ''; navigate('inspection', true); }
        else { app.jobState = 'progress'; navigate('jobs', true); }
      } else navigate(nav, true);
    }
  } else if (job) {
    selectJob(job);
  } else if (starJob) {
    toggleStar(starJob);
    [...document.querySelectorAll('[data-star-job]')].find(item => item.dataset.starJob === starJob)?.focus({ preventScroll: true });
  } else if (month) {
    Object.assign(app, { month, monthFilter: 'all' });
    navigate('monthdetail', true);
  } else if (monthFilter) {
    app.monthFilter = monthFilter;
    renderMonthDetail();
    document.querySelector('[data-month-filter="' + monthFilter + '"]')?.focus({ preventScroll: true });
  } else if (viewRecord) {
    app.viewRecord = viewRecord;
    navigate('recorddetail', true);
  } else if (reportFilter) {
    app.reportFilter = reportFilter;
    renderReports();
  } else if (recordFilter) {
    app.recordFilter = recordFilter;
    renderDetail();
    document.querySelector(`[data-record-filter="${recordFilter}"]`)?.focus({ preventScroll: true });
  } else if (resultSlot) {
    $('insR' + resultSlot).value = resultValue === 'Pending' ? '' : resultValue;
    for (const choice of document.querySelectorAll(`[data-result-slot="${resultSlot}"]`)) {
      const selected = choice.dataset.resultValue === resultValue;
      choice.classList.toggle('selected', selected);
      choice.classList.toggle('ok', selected && resultValue === 'OK');
      choice.classList.toggle('ng', selected && resultValue === 'NG');
      choice.classList.toggle('na', selected && resultValue === 'NA');
      choice.setAttribute('aria-pressed', String(selected));
    }
    button.closest('.check-row')?.setAttribute('data-state', resultValue.toLowerCase());
    app.dirty = true;
    updateQuickResult();
    persistDraft();
  } else if (editRecord) {
    app.editRecord = editRecord;
    navigate('inspection', true);
  } else if (remove) {
    await deleteRecord(remove);
  } else if (pickFile) {
    $(pickFile).click();
  } else if (photoRemove) {
    if (!val('photoValue'+photoRemove) || await confirmAction('นำรูปเดิมออก', 'การบันทึกครั้งถัดไปจะนำลิงก์รูปนี้ออกจากรายการ', 'นำออก')) removePhoto(photoRemove);
  } else if (action === 'scan-qr') {
    await StockQR.start();
  } else if (action === 'preview-report') {
    navigate('reportpreview', true);
  } else if (action === 'print-report') {
    window.print();
  } else if (action === 'discard-draft') {
    if (await confirmAction('ล้างร่าง', 'ลบข้อความร่างสำหรับแบบฟอร์มนี้เท่านั้น', 'ล้างร่าง')) {
      localStorage.removeItem(draftKey()); app.dirty = false;
      navigate(app.page, true);
    }
  } else if (action === 'back') {
    if (await leaveForm()) back();
  } else if (action === 'choose-job') {
    Object.assign(app, { chooseOrigin: app.page, group: '', claimFilter: '', modelFilter: '', jobState: '', search: '' });
    navigate('choose', true);
  } else if (action === 'create-job') {
    Object.assign(app, { editJob: false, selected: '', detailOrigin: app.page });
    navigate('jobform', true);
  } else if (action === 'edit-job') {
    app.editJob = true;
    navigate('jobform', true);
  } else if (action === 'inspect-job') {
    app.editRecord = '';
    navigate('inspection', true);
  } else if (action === 'select-job') {
    app.editJob = true;
    navigate('jobform', true);
  } else if (action === 'finish-job') {
    await finishJob();
  } else if (action === 'check-save') {
    await recheckSave();
  } else if (action === 'refresh-jobs') {
    await loadJobs();
  } else if (action === 'add-criteria') {
    const next = document.querySelector('#criteriaEditor [data-criteria-row][hidden]');
    if (next) {
      next.hidden = false;
      next.querySelector('input').focus();
    }
    button.hidden = !document.querySelector('#criteriaEditor [data-criteria-row][hidden]');
  } else if (action === 'older-months') {
    app.yearsVisible += 1;
    renderOverview();
  } else if (action === 'contact') {
    if (await leaveForm()) {
      navigate('profile', true);
      $('supportPanel').scrollIntoView({ block: 'center' });
    }
  }
}

document.addEventListener('click', handleClick);
document.addEventListener('error', event => {
  if (event.target.matches?.('img[data-reference-photo]')) {
    event.target.hidden = true;
    const note = document.createElement('span');
    note.className = 'hint';
    note.textContent = 'เปิดรูปไม่ได้ · ลิงก์อาจหมดอายุหรือต้องลงชื่อเข้าใช้ Microsoft';
    event.target.after(note);
  }
}, true);
document.addEventListener('submit', event => {
  const submit = { jobForm: submitJob, inspectionSetupForm: submitInspectionSetup, inspectionForm: submitInspection }[event.target.id];
  if (submit) submit(event).catch(error => showFeedback(error.message || 'บันทึกไม่ได้ กรุณาตรวจสอบข้อมูล', 'error'));
});
document.addEventListener('invalid', event => {
  const details = event.target.closest('#inspectionForm details');
  if (details) details.open = true;
}, true);
document.addEventListener('input', event => {
  if (event.target.closest('#formFields')) { app.dirty = true; persistDraft(); }
});
document.addEventListener('change', event => {
  if (event.target.matches('input[data-photo-slot]')) selectPhoto(event.target);
});
$('jobSearch').addEventListener('input', event => {
  app.search = event.target.value;
  renderChoose();
});
$('modelFilter').addEventListener('change', event => {
  app.group = event.target.value;
  renderChoose();
});
$('claimFilter').addEventListener('change', event => {
  app.claimFilter = event.target.value;
  renderChoose();
});
$('copyLineID').addEventListener('click', async () => {
  const lineId = $('supportLineId').textContent;
  try {
    await navigator.clipboard.writeText(lineId);
    $('copyLineID').textContent = 'คัดลอก LINE ID แล้ว';
  } catch {
    window.prompt('LINE ID', lineId);
  }
});

$('gateLoginButton').addEventListener('click', loginLine);
$('gateRegisterForm').addEventListener('submit', register);
for (const id of ['gateRefresh', 'gateBlockedRefresh', 'gateRetry', 'appRefresh']) {
  $(id).addEventListener('click', checkAccess);
}
for (const id of ['gateSwitchAccount', 'gatePendingLogout', 'gateBlockedLogout', 'gateErrorLogout', 'appLogout']) {
  $(id).addEventListener('click', logoutLine);
}
for (const [image, fallback] of [['topAvatar', 'topAvatarFallback'], ['profileAvatar', 'profileFallback'], ['greetingAvatar', 'greetingAvatarFallback']]) {
  $(image).addEventListener('error', () => setAvatar(image, fallback, ''));
}

async function init() {
  if (app.initializing) return;
  app.initializing = true;
  gate('gateLoading');
  try {
    $('environmentBanner').textContent = MOCK ? 'DEMO / MOCK · ข้อมูลจำลองในหน่วยความจำ · ไม่เชื่อม Microsoft 365 · รีเฟรชเพื่อเริ่มใหม่' : 'LIVE · ' + (liveWritesAllowed() ? 'เชื่อมบริการที่ตั้งค่าไว้' : 'อ่านอย่างเดียว · ยังไม่เปิดการบันทึกจริง');
    if (MOCK) {
      app.ready = true;
      app.line = { userId: 'mock-inspector', displayName: 'ผู้ตรวจตัวอย่าง' };
      return await checkAccess();
    }
    if (CONFIG.mode !== 'live' || !LIFF_ID || !safeLink(API_URL) || !safeLink(JOBS_API_URL)) throw Error('ยังไม่ตั้งค่า LINE LIFF และบริการอ่านข้อมูล');
    if (!window.liff) {

      await new Promise((resolve, reject) => {
        const sdk = document.createElement('script');
        const timer = setTimeout(() => { sdk.remove(); reject(Error('โหลด LINE LIFF ใช้เวลานานเกินไป')); }, 10000);
        sdk.onload = () => { clearTimeout(timer); resolve(); };
        sdk.onerror = () => { clearTimeout(timer); sdk.remove(); reject(Error('โหลด LINE LIFF ไม่สำเร็จ')); };
        sdk.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
        document.head.append(sdk);
      });
    }
    await liff.init({ liffId: LIFF_ID });
    app.ready = true;
    if (!liff.isLoggedIn()) return gate('gateLogin');
    try {
      app.line = await liff.getProfile();
      $('gateDisplayName').textContent = app.line.displayName || 'สมาชิก LINE';
      setAvatar('gateAvatar', '', safeLink(app.line.pictureUrl));
    } catch {
      app.line = null;
    }
    await checkAccess();
  } catch (error) {
    gate('gateError', error.message || 'เชื่อม LINE ไม่สำเร็จ', true);
  } finally {
    app.initializing = false;
  }
}
function storageIdentity() { return CONFIG.mode + ':' + text(app.line?.userId || app.member?.userId || app.member?.id); }
function journalKey() { return 'stock-pending-v2:' + storageIdentity(); }
function persistPending() {
  try { localStorage.setItem(journalKey(), JSON.stringify([...app.pending.values()].map(item => item.descriptor))); return true; }
  catch { return false; }
}
function operationIdentity(operation,job){return operation.action==='saveInspection' ? liveRecords(job).some(record=>record.clientRequestId===operation.clientRequestId&&recordMatches(record,operation.payload)) : job.clientRequestId===operation.clientRequestId;}
function operationMatches(operation, job) {
  if(!operationIdentity(operation,job))return false;
  const payload = operation.payload;
  if (!operation.response) {
    if (operation.action === 'createJob') return job.clientRequestId === operation.clientRequestId;
    if (operation.action === 'saveInspection') return job.id === payload.jobKey && liveRecords(job).some(record =>
      record.clientRequestId === operation.clientRequestId && recordMatches(record, payload, payload.overallResult));
    return job.id === payload.jobKey && job.clientRequestId === operation.clientRequestId && (operation.action === 'updateJob' ? jobDetailsMatch(job, Object.fromEntries(Object.entries(payload).filter(([key]) => !['jobKey','itemId','expectedJobVersion'].includes(key)))) : operation.action === 'finishJob' ? finished(job) : operation.action === 'selectJob' && job.status === 'progress');
  }
  if (operation.action === 'createJob') return text(job.id).endsWith(operation.response.requestId) &&
    jobDetailsMatch(job, Object.fromEntries(Object.keys(jobFields).map(key => [key, payload[key]])));
  if (job.id !== payload.jobKey) return false;
  if (operation.action === 'saveInspection') return liveRecords(job).some(record => recordMatches(record, payload,
    payload.overallResult));
  if (operation.action === 'updateJob') return jobDetailsMatch(job, Object.fromEntries(Object.entries(payload).filter(([key]) => !['jobKey','itemId','expectedJobVersion'].includes(key))));
  if (operation.action === 'selectJob') return job.status === 'progress';
  if (operation.action === 'finishJob') return finished(job);
  return false;
}
function restorePending() {
  try {
    const stored = JSON.parse(localStorage.getItem(journalKey()) || '[]');
    if (!Array.isArray(stored)) return;
    for (const descriptor of stored) {
      if (!descriptor.scope || !descriptor.action || !descriptor.payload || !descriptor.clientRequestId) continue;
      app.pending.set(descriptor.scope, { descriptor, matches: job => operationMatches(descriptor, job),
        onSaved: job => { selectJob(job.id); showFeedback('ตรวจสอบพบผลบันทึกแล้ว', 'success'); } });
    }
  } catch { /* Unusable journal is not evidence of a successful write. */ }
}
function purgeExpiredDrafts() {
  try {
    const prefix = 'stock-draft-v3:' + storageIdentity() + ':';
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix))) {
      try { if (JSON.parse(localStorage.getItem(key)).expires < Date.now()) localStorage.removeItem(key); }
      catch { localStorage.removeItem(key); }
    }
  } catch { /* Storage errors are reported when attempting to save a draft/write. */ }
}
function draftKey() { return 'stock-draft-v3:' + storageIdentity() + ':' + currentScope() + ':' + (app.editRecord || app.page); }
function draftSource() {
  const job = findJob();
  if (!job || app.page === 'jobform' && !app.editJob) return '';
  return JSON.stringify([job.status, job.title, job.targetUnits, inspectionModel(job),
    SLOTS.map(slot => text(job['result' + slot + 'Criteria'])),
    app.page === 'jobform' ? Object.keys(jobFields).map(key => job[key]) : null]);
}
function persistDraft() {
  if (!isForm(app.page) || !app.dirty || !$('formFields')) return;
  const values = {};
  for (const input of $('formFields').querySelectorAll('input[id],textarea[id],select[id]')) {
    if (input.type === 'file' || input.id.startsWith('photoValue')) continue;
    values[input.id] = input.value;
  }
  try { localStorage.setItem(draftKey(), JSON.stringify({ values, source:draftSource(), baseline:app.inspectionBaseline, expires:Date.now() + 8*60*60*1000 })); }
  catch { showFeedback('เก็บร่างไม่ได้ โปรดเปิดหน้านี้ไว้จนบันทึกเสร็จ', 'warning'); }
}
function restoreDraft() {
  try {
    const key = draftKey(), saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved) return;
    if (saved.expires < Date.now()) { localStorage.removeItem(key); return; }
    if (saved.source !== draftSource() || saved.baseline && saved.baseline !== app.inspectionBaseline) {
      showFeedback('มีร่างเก่าแต่ข้อมูลต้นฉบับเปลี่ยนแล้ว กรุณาตรวจสอบผลล่าสุด', 'warning'); return;
    }
    for (const [id, value] of Object.entries(saved.values || {})) {
      const input = $(id);
      if (input && !input.readOnly && !input.disabled && !input.id.startsWith('photoValue')) input.value = value;
    }
    for (const button of document.querySelectorAll('[data-result-slot]')) {
      const selected = val('insR' + button.dataset.resultSlot) === button.dataset.resultValue;
      button.classList.toggle('selected', selected);
      button.classList.toggle('ok', selected && button.dataset.resultValue === 'OK');
      button.classList.toggle('ng', selected && button.dataset.resultValue === 'NG');
      button.setAttribute('aria-pressed', String(selected));
    }
    app.dirty = true;
    if ($('liveOverallResult')) { refreshCriterionColors(); updateQuickResult(); }
    showFeedback('กู้ข้อความร่างจากอุปกรณ์นี้แล้ว · รูปภาพต้องเลือกใหม่', 'warning');
  } catch { /* Invalid local draft never changes server data. */ }
}
function clearSavedDraft(scope) {
  try {
    const prefix = 'stock-draft-v3:' + storageIdentity() + ':' + scope + ':';
    Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key));
  } catch { /* Saving remains successful when storage is unavailable. */ }
  app.dirty = false;
}
window.addEventListener('beforeunload', event => {
  if (app.dirty || app.busy || app.pending.size) { persistDraft(); event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', persistDraft);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistDraft(); });
for (const prefix of ['home', 'jobs']) {
  $(prefix + 'Search').addEventListener('input', event => { app.search = event.target.value; renderCurrent(); });
  for (const [suffix, field] of [['Claim','claimFilter'],['Product','group'],['Model','modelFilter']]) {
    $(prefix + suffix).addEventListener('change', event => { app[field] = event.target.value; renderCurrent(); });
  }
}
$('jobsState').addEventListener('change', event => { app.jobState = event.target.value; renderJobs(); });
$('chooseModel').addEventListener('change', event => { app.modelFilter = event.target.value; renderChoose(); });
for (const id of ['reportMonth', 'reportJob', 'reportKind', 'reportSerial']) $(id).addEventListener('change', event => { app[id] = event.target.value; if(id==='reportJob'||id==='reportKind') app.reportSerial=''; if(id==='reportKind'&&app.reportKind==='monthly')app.reportJob=''; renderReports(); });

document.addEventListener('DOMContentLoaded', init);

// Persist only upload metadata, not image bytes or authentication tokens.
function restoreTransfers(){try{const stored=JSON.parse(localStorage.getItem(transferKey())||'[]');app.transfers=Array.isArray(stored)?stored:[]}catch{app.transfers=[]}}
