const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const QRCode=require('qrcode');
const {spawn}=require('node:child_process');
let server;
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 try{await fetch('http://127.0.0.1:4173')}catch{server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:4173');break}catch{await new Promise(r=>setTimeout(r,100))}}}
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4173')?route.continue():route.abort());
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>app.loaded);
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const results=[];
 for(const screen of ['home','jobs','choose','overview','jobdetail','inspection','jobform','recorddetail','reports','reportpreview','profile']){
  await page.evaluate(screen=>{app.selected='DEMO-L-001';app.viewRecord='202';app.editJob=true;app.editRecord='';navigate(screen)},screen);
  const result=await page.evaluate(()=>axe.run(document.getElementById('appMain'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  results.push({screen,status:violations.length?'FAIL':'PASS',violations});console.log(screen,JSON.stringify(violations));
 }
 // Exercise the bundled fallback decoder against an actual generated QR raster.
 const dataUrl=await QRCode.toDataURL('SN=FALLBACK-QR-123|MODEL=L5018',{width:400,margin:4});
 const decoded=await page.evaluate(async dataUrl=>{const img=new Image();img.src=dataUrl;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const frame=ctx.getImageData(0,0,canvas.width,canvas.height);const qr=jsQR(frame.data,canvas.width,canvas.height);return StockDomain.parseQR(qr.data)},dataUrl);
 assert.equal(decoded,'FALLBACK-QR-123');console.log('PASS jsQR fallback raster decode');
 fs.writeFileSync('test-results/accessibility-results.json',JSON.stringify({screens:results,qrFallback:'PASS'},null,2));
 await browser.close();server?.kill();if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);server?.kill();process.exitCode=1});
