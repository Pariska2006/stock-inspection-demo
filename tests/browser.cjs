const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const base='http://127.0.0.1:4173';
const results=[];
let browser, server;
async function pageFor(options={}) {
 const context=await browser.newContext({viewport:{width:390,height:844},...options});
 const page=await context.newPage(); page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);
 const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort()}return route.continue()});
 await page.goto(base);await page.waitForFunction(()=>app.loaded);
 return {page,context,errors,external};
}
async function test(name,run){let state;try{state=await pageFor();await run(state);assert.deepEqual(state.errors,[],'browser runtime errors');assert.deepEqual(state.external,[],'mock attempted external network');results.push({name,status:'PASS'});console.log('PASS',name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL',name,e.message);if(state)await state.page.screenshot({path:'test-results/fail-'+results.length+'.png',fullPage:true})}finally{await state?.context.close()}}
async function openInspection(page,id='DEMO-L-001'){await page.evaluate(id=>{selectJob(id);app.editRecord='';navigate('inspection')},id);if(await page.locator('#insModel').count()&&!await page.inputValue('#insModel'))await page.fill('#insModel',id==='DEMO-L-001'?'L5018SP-CF':'RX1800');}
async function saved(page){await page.waitForFunction(()=>app.page==='jobdetail'&&!app.busy,{},{timeout:10000})}
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 try{await fetch(base)}catch{server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<30;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),args:['--no-sandbox']});
 await test('dashboard, independent filters, pinning, NG counts',async({page})=>{
  assert.deepEqual(await page.locator('#homeStats .stat strong').allTextContents(),['5','2','1','2','0']);
  await page.selectOption('#homeProduct','L');assert.equal(await page.locator('#homeJobs [data-job]').count(),2);
  await page.selectOption('#homeClaim','Hotline');assert.equal(await page.locator('#homeJobs [data-job]').count(),0);
  await page.selectOption('#homeProduct','M');assert.equal(await page.locator('#homeJobs [data-job]').count(),1);
  await page.selectOption('#homeModel','L5018SP-CF');assert.equal(await page.locator('#homeJobs [data-job]').count(),0);
  await page.evaluate(()=>{app.group='';app.claimFilter='';app.modelFilter='';renderHome()});
  await page.locator('#homeJobs [data-star-job="DEMO-L-001"]').click();assert.equal(await page.locator('#recentJobs [data-job]').count(),1);
  await page.locator('#recentJobs [data-job]').click();
  assert.equal(await page.locator('[data-record-filter="NG"] span').innerText(),'1');
  await page.locator('[data-record-filter="NG"]').click();assert.match(await page.locator('#detailContent').innerText(),/KBULLCDCHPTD10006/);
  assert.equal(await page.locator('[data-action="finish-job"]').isDisabled(),true);
 });
 await test('partial NG save, double submit, continue, totals and latest-first',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','TEST-NEW-001');await page.locator('[data-result-slot="1"][data-result-value="NG"]').click();
  await page.evaluate(()=>{document.getElementById('inspectionForm').requestSubmit();document.getElementById('inspectionForm').requestSubmit()});await saved(page);
  assert.equal(await page.evaluate(()=>findJob().records.filter(r=>r.serial==='TEST-NEW-001').length),1);
  assert.equal(await page.evaluate(()=>findJob().records.find(r=>r.serial==='TEST-NEW-001').result2),'');
  assert.match(await page.locator('#detailContent .record').first().innerText(),/TEST-NEW-001/);
  assert.match(await page.locator('#detailContent .record').first().innerText(),/NG/);
  await page.locator('#detailContent .record').first().locator('[data-edit-record]').click();
  await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();await page.locator('[data-result-slot="2"][data-result-value="OK"]').click();
  await page.click('#formSubmit');await saved(page);
  assert.equal(await page.evaluate(()=>findJob().records.length),5);
  assert.equal(await page.evaluate(()=>vehicleInspection(findJob(),findJob().records.find(r=>r.serial==='TEST-NEW-001')).status),'OK');
 });
 await test('duplicate serial blocked before sending',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','DEMO-L001');await page.click('#formSubmit');assert.match(await page.locator('#formMessage').innerText(),/มีเลขตัวรถ/);
  await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();await page.click('#formSubmit');assert.match(await page.locator('#formMessage').innerText(),/มีเลขตัวรถ/);
  assert.equal(await page.evaluate(()=>app.pending.size),0);
 });
 await test('one criterion save and no-criteria setup',async({page})=>{
  await openInspection(page,'DEMO-B-003');await page.fill('#insSerial','TEST-B-001');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();await page.click('#formSubmit');await saved(page);
  assert.equal(await page.evaluate(()=>vehicleInspection(findJob(),findJob().records[0]).complete),true);
  await openInspection(page,'DEMO-RX-005');assert.equal(await page.locator('#inspectionSetupForm').count(),1);
  await page.fill('#jfCriteria1','ทดสอบเกณฑ์');await page.click('#formSubmit');await page.waitForSelector('#inspectionForm');assert.equal(await page.locator('[data-result-slot="1"]').count(),4);
 });
 await test('create job, edit job, target and finish workflow',async({page})=>{
  await page.locator('#home [data-action="create-job"]').click();await page.fill('#jfProblem','ทดสอบงานใหม่');await page.selectOption('#jfCategory','Quick Report');await page.selectOption('#jfClaimType','L');await page.fill('#jfModel','L5018');await page.fill('#jfMethod','ตรวจด้วยสายตา');await page.fill('#jfCriteria1','ไม่มีรอยรั่ว');await page.fill('#jfTarget','1');await page.click('#formSubmit');await page.click('#confirmButton');await saved(page);
  assert.equal(await page.evaluate(()=>findJob().targetUnits),1);
  await page.click('[data-action="edit-job"]');await page.fill('#jfProblem','ชื่อที่แก้ไข');await page.fill('#jfTarget','2');await page.click('#formSubmit');await saved(page);assert.equal(await page.evaluate(()=>findJob().title),'ชื่อที่แก้ไข');
  await page.click('[data-action="inspect-job"]');await page.fill('#insSerial','TEST-CREATE');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();await page.click('#formSubmit');await saved(page);
  await page.click('[data-action="finish-job"]');await page.click('#confirmButton');await page.waitForFunction(()=>findJob().status==='completed'&&!app.busy);
 });
 await test('draft survives reload; Pending reset; no tokens stored',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','DRAFT-123');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();await page.locator('[data-result-slot="1"][data-result-value="Pending"]').click();assert.equal(await page.inputValue('#insR1'),'');
  await page.locator('#inspectionNotes summary').click();await page.fill('#insRemarks','ข้อความร่าง');await page.reload();await page.waitForFunction(()=>app.loaded);await openInspection(page);assert.equal(await page.inputValue('#insSerial'),'DRAFT-123');assert.equal(await page.inputValue('#insRemarks'),'ข้อความร่าง');
  assert.equal(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}).includes('idToken')),false);
 });
 await test('unknown save result locks repeat submissions across reload',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','TIMEOUT-123');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();
  await page.evaluate(()=>{const original=mockAdapter.request;mockAdapter.request=(action,values)=>{if(action==='saveInspection')throw Error('offline');return original(action,values)}});
  await page.click('#formSubmit');await page.waitForFunction(()=>!app.busy&&app.pending.size===1);assert.equal(await page.locator('#formSubmit').isDisabled(),true);assert.equal(await page.locator('[data-action="allow-retry"]').count(),0);
  await page.reload();await page.waitForFunction(()=>app.loaded);await openInspection(page);assert.equal(await page.locator('#formSubmit').isDisabled(),true);assert.match(await page.locator('#formPending').innerText(),/ตรวจสอบผล/);
 });
 await test('network error, timeout and partial data block writes without erasing form',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','RETAIN-123');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();
  await page.evaluate(()=>{app.partial=true});await page.click('#formSubmit');assert.match(await page.locator('#formMessage').innerText(),/ข้อมูลไม่ครบ/);assert.equal(await page.inputValue('#insSerial'),'RETAIN-123');
  const error=await page.evaluate(async()=>{const original=window.fetch;window.fetch=(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));try{await fetchJson('/slow',{},20)}catch(e){return e.message}finally{window.fetch=original}});assert.match(error,/นานเกินไป/);
  await page.evaluate(()=>{app.partial=false;app.jobsLive=false});await page.click('#formSubmit');assert.match(await page.locator('#formMessage').innerText(),/โหลดข้อมูล/);
 });
 await test('concurrent inspection edit is rejected',async({page})=>{
  await page.evaluate(()=>{selectJob('DEMO-L-001');app.editRecord='201';navigate('inspection')});await page.locator('#inspectionNotes summary').click();await page.fill('#insRemarks','local edit');
  await page.evaluate(()=>{const original=mockAdapter.request;mockAdapter.request=(action,values)=>{const result=original(action,values);if(action==='jobs')result.jobs.find(j=>j.id==='DEMO-L-001').records.find(r=>r.id==='201').note='other edit';return result}});
  await page.click('#formSubmit');await page.waitForFunction(()=>!app.busy);assert.match(await page.locator('#formMessage').innerText(),/เปลี่ยนแปลง/);assert.equal(await page.evaluate(()=>app.pending.size),0);
 });
 await test('camera permission denial, invalid QR, confirm-before-use, stopped tracks',async({page})=>{
  await openInspection(page);await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'))});await page.click('[data-action="scan-qr"]');await page.waitForFunction(()=>document.getElementById('qrStatus').textContent.includes('ไม่ได้รับอนุญาต'));await page.click('#qrCancel');
  await page.evaluate(()=>{
   window.cameraStops=0;window.qrValue='SN=QR-123|MODEL=L';
   navigator.mediaDevices.getUserMedia=async()=>{const stream=new MediaStream();stream.getTracks=()=>[{stop(){window.cameraStops++}}];return stream};
   HTMLMediaElement.prototype.play=async function(){};Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get(){return 3}});
   window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code']}async detect(){return [{rawValue:window.qrValue}]}};
  });
  await page.click('[data-action="scan-qr"]');await page.waitForFunction(()=>!document.getElementById('qrUse').disabled);assert.equal(await page.inputValue('#insSerial'),'');assert.equal(await page.inputValue('#qrCandidate'),'QR-123');await page.click('#qrUse');assert.equal(await page.inputValue('#insSerial'),'QR-123');assert.ok(await page.evaluate(()=>cameraStops>0));assert.equal(await page.evaluate(()=>app.pending.size),0);
  await page.evaluate(()=>window.qrValue='not a valid QR');await page.click('[data-action="scan-qr"]');await page.waitForFunction(()=>document.getElementById('qrStatus').textContent.includes('ไม่ถูกต้อง'));assert.equal(await page.locator('#qrUse').isDisabled(),true);await page.click('#qrCancel');
 });
 await test('photo missing, authenticated-link failure and upload remains unconfirmed',async({page})=>{
  await page.evaluate(()=>{selectJob('DEMO-L-001')});assert.match(await page.locator('#detailContent').innerText(),/ยังไม่มีรูปตัวอย่าง/);
  await page.route('**/private-image',route=>route.fulfill({status:403,contentType:'text/plain',body:'Sign in'}));
  await page.evaluate(()=>{findJob().okPictureUrl=location.origin+'/private-image';const original=safeLink;safeLink=value=>String(value || '').startsWith(location.origin)?value:original(value);renderDetail()});
  await page.waitForFunction(()=>document.querySelector('#detailContent').textContent.includes('ลงชื่อเข้าใช้ Microsoft'));
  await page.click('[data-action="inspect-job"]');await page.locator('#optionalPhotos summary').click();await page.setInputFiles('#choose1',{name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await page.fill('#insSerial','PHOTO-123');await page.fill('#insModel','L5018SP-CF');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();await page.click('#formSubmit');await saved(page);assert.equal(await page.evaluate(()=>app.transfers.at(-1).state),'Failed');assert.equal(await page.evaluate(()=>findJob().records.filter(r=>r.serial==='PHOTO-123').length),1);assert.equal(await page.evaluate(()=>app.pending.size),0);
 });
 await test('monthly report totals, preview escaping and A4 PDF',async({page})=>{
  await page.evaluate(()=>navigate('reports'));assert.deepEqual(await page.locator('#reportStats .stat strong').allTextContents(),['5','2','1','2','0']);await page.selectOption('#reportJob','DEMO-L-001');assert.deepEqual(await page.locator('#reportStats .stat strong').allTextContents(),['4','1','1','2','0']);
  const month=await page.locator('#reportMonth option').nth(1).getAttribute('value');await page.selectOption('#reportMonth',month);
  await page.evaluate(()=>{findJob('DEMO-L-001').records[0].note='<img src=x onerror=alert(1)>'});await page.click('[data-action="preview-report"]');assert.equal(await page.locator('#previewContent img[src="x"]').count(),0);assert.match(await page.locator('#previewContent').innerText(),/NG/);await page.emulateMedia({media:'print'});await page.pdf({path:'test-results/report-a4.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});assert.ok(fs.statSync('test-results/report-a4.pdf').size>10000);
 });
 await test('responsive screens at 320, 375, 390, 428, 768, 1440; focus and tap size',async({page})=>{
  const widths=[320,375,390,428,768,1440];
  for(const width of widths){await page.setViewportSize({width,height:900});
   for(const screen of ['home','jobs','choose','overview','monthdetail','jobdetail','inspection','jobform','recorddetail','reports','reportpreview','profile']){
    await page.evaluate(screen=>{app.selected='DEMO-L-001';app.viewRecord='202';app.editJob=true;app.editRecord='';app.month=dateValue(new Date()).slice(0,7);navigate(screen)},screen);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${screen} horizontal overflow at ${width}`);
    if([390,1440].includes(width))await page.screenshot({path:`test-results/${screen}-${width}.jpg`,type:'jpeg',quality:65,fullPage:true});
   }
  }
  await page.setViewportSize({width:320,height:700});await page.evaluate(()=>navigate('home'));await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  const sizes=await page.locator('.bottom .nav-btn').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().height));assert.ok(sizes.every(h=>h>=44));
 });

 await test('lost acknowledgement reconciles using client request ID without resending',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','LOST-ACK-123');await page.locator('[data-result-slot="1"][data-result-value="NG"]').click();
  await page.evaluate(()=>{const original=mockAdapter.request;window.saveRequests=0;mockAdapter.request=(action,values)=>{const result=original(action,values);if(action==='saveInspection'){window.saveRequests++;throw Error('response lost')}return result}});
  await page.click('#formSubmit');await page.waitForFunction(()=>!app.busy&&app.pending.size===1);await page.locator('[data-action="check-save"]').click();await saved(page);assert.equal(await page.evaluate(()=>saveRequests),1);assert.equal(await page.evaluate(()=>app.pending.size),0);assert.equal(await page.evaluate(()=>findJob().records.filter(r=>r.serial==='LOST-ACK-123').length),1);
 });
 await test('missing Serial and invalid date remain visible; incomplete NG included in summary',async({page})=>{
  await page.evaluate(()=>{const j=normalizeJob({id:'MISSING',status:'progress',records:[{id:'7',sharePointItemId:'7',checkedAt:'2026-02-30'}],result1Criteria:'A'});app.jobs.push(j);app.reportJob='MISSING';navigate('reportpreview')});
  assert.match(await page.locator('#previewContent').innerText(),/ไม่ระบุ Serial/);assert.equal(await page.evaluate(()=>dateValue('2026-02-30')),'');assert.equal(await page.evaluate(()=>StockDomain.summary([findJob('MISSING')]).total),1);
  await page.evaluate(()=>{app.reportJob='DEMO-L-001';renderReportPreview()});assert.match(await page.locator('#previewContent').innerText(),/ยังไม่ครบ 3 คัน/);
 });
 await test('draft is not applied to changed inspection criteria',async({page})=>{
  await openInspection(page);await page.fill('#insSerial','STALE-DRAFT');await page.locator('[data-result-slot="1"][data-result-value="OK"]').click();
  await page.evaluate(()=>{navigate('jobdetail');findJob().result1Criteria='เกณฑ์ใหม่';navigate('inspection')});assert.equal(await page.inputValue('#insR1'),'');assert.match(await page.locator('#formMessage').innerText(),/ต้นฉบับเปลี่ยน/);
 });
 await test('camera cancellation stops late-arriving media stream',async({page})=>{
  await openInspection(page);await page.evaluate(()=>{window.lateStop=0;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.deliverCamera=()=>{const media=new MediaStream();media.getTracks=()=>[{stop(){window.lateStop++}}];resolve(media)}})});await page.click('[data-action="scan-qr"]');await page.click('#qrCancel');await page.evaluate(()=>deliverCamera());await page.waitForFunction(()=>lateStop===1);assert.equal(await page.locator('#qrDialog').isVisible(),false);
 });

 await test('draft survives closing and reopening the tab',async(state)=>{
  await openInspection(state.page);await state.page.fill('#insSerial','REOPEN-123');await state.page.locator('[data-result-slot="1"][data-result-value="NG"]').click();
  const previous=state.page;state.page=await state.context.newPage();await previous.close();state.page.on('pageerror',error=>state.errors.push(error.message));
  await state.page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await state.page.goto(base);await state.page.waitForFunction(()=>app.loaded);await openInspection(state.page);assert.equal(await state.page.inputValue('#insSerial'),'REOPEN-123');assert.equal(await state.page.inputValue('#insR1'),'NG');
 });
 await test('registration double submit sends one request and stays pending',async({page})=>{
  await page.evaluate(()=>{window.registrationCount=0;const original=mockAdapter.request;mockAdapter.request=(action,values)=>{if(action==='register')registrationCount++;return original(action,values)};gate('gateRegister')});
  await page.fill('#gateFullName','ผู้ทดสอบ');await page.fill('#gateNickName','ทดสอบ');await page.evaluate(()=>{document.getElementById('gateRegisterForm').requestSubmit();document.getElementById('gateRegisterForm').requestSubmit()});await page.waitForSelector('#gatePending');assert.equal(await page.evaluate(()=>registrationCount),1);assert.equal(await page.locator('#appMain').isVisible(),false);
 });
 // Live adapter authentication is isolated using fake endpoints and stubbed LIFF, never production.
 for(const state of ['approved','pending','blocked','unregistered','expired']){
  await test('authentication '+state+' using isolated LIFF/API fixtures',async({page})=>{
   await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:`window.STOCK_CONFIG={mode:'live',liffId:'fixture',usersReadUrl:'https://fixture.invalid/users',jobsReadUrl:'https://fixture.invalid/jobs',writesEnabled:false}` }));
   await page.route('https://fixture.invalid/**',route=>{const action=JSON.parse(route.request().postData()).action;const body=action==='jobs'?{status:'OK',jobs:[],source:'STK_Inspections'}:state==='unregistered'?{status:'NOT_REGISTERED',registered:false}:{registered:true,accessStatus:state};return route.fulfill({status:state==='expired'?401:200,contentType:'application/json',body:JSON.stringify(body)})});
   await page.addInitScript(()=>window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> 'fixture-token-never-stored',getProfile:async()=>({userId:'fixture-user',displayName:'Fixture'})});
   await page.reload();
   if(state==='approved'){await page.waitForFunction(()=>app.loaded);assert.equal(await page.locator('#appMain').isVisible(),true);assert.match(await page.locator('#environmentBanner').innerText(),/อ่านอย่างเดียว/)}
   else {const gate={pending:'gatePending',blocked:'gateBlocked',unregistered:'gateRegister',expired:'gateLogin'}[state];await page.waitForSelector('#'+gate);assert.equal(await page.locator('#appMain').isVisible(),false)}
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('fixture-token')),false);
  });
 }
 await browser.close();server?.kill();fs.writeFileSync('test-results/browser-results.json',JSON.stringify(results,null,2));console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} browser scenarios PASS`);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);server?.kill();process.exitCode=1});
