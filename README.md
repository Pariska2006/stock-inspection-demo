# Stock Inspection — Dark Navy

LINE LIFF stock inspection app สำหรับตรวจสต็อกผ่านมือถือ พร้อม Dashboard, QR, ผลตรวจบางเกณฑ์ และรายงาน A4

**สถานะ: พร้อมตรวจรับด้วย Mock และเตรียมทดสอบ integration ใน sandbox — ยังไม่ผ่านการรับรอง production**

ค่าเริ่มต้นใน `config.js` เป็น **MOCK**: ใช้ข้อมูลจำลองในหน่วยความจำ ไม่มีการเรียก LINE, n8n, Microsoft Lists, Power Automate หรือ OneDrive จริง และแสดงแถบ DEMO ทุกหน้า การรีเฟรชเริ่ม fixture ใหม่ ไม่ได้บันทึกลงฐานข้อมูลบริษัท

## เปิดใช้งานและทดสอบ

ต้องมี Node.js 24, Python 3 และ Chromium (หรือ browser ที่ Playwright ติดตั้ง)

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm start
```

เปิด `http://127.0.0.1:4173` ไม่เปิดไฟล์ด้วย `file://` กล้องต้องใช้ HTTPS หรือ localhost

```sh
npm run check
npm test
npm run test:browser
npm run test:a11y
```

ตัวทดสอบ browser เปิด local server เองเมื่อจำเป็น ใช้ `/usr/bin/chromium` ถ้ามี หรือ Playwright Chromium; กำหนด `CHROMIUM_PATH` ได้ ผลลัพธ์, screenshots และ PDF อยู่ใน `test-results/` ซึ่งไม่รวมใน git

ดู [ผล QA ที่รันจริง](docs/QA-RESULTS.md), [Audit](docs/AUDIT.md), [Manual checklist](docs/MANUAL-TESTING.md), [Design system](docs/DESIGN-SYSTEM.md) และ [Integration contract/blockers](docs/INTEGRATION.md)

## เส้นทางใช้งาน

1. หน้าแรกดู Total Jobs / รถที่บันทึก / OK / NG / Pending ค้นหาและกรอง Claim Category, Product, Model แล้วเลือกงานหรืองานติดดาว
2. หน้างานอ่านวิธีตรวจและรูปตัวอย่างระดับ Job เริ่มเพิ่มผลตรวจ หรือกด “ตรวจต่อ” ที่ Serial เดิม
3. พิมพ์ Serial หรือ Scan QR → ตรวจเลขที่อ่านได้ → กดใช้ Serial → เลือก OK/NG เฉพาะข้อที่ตรวจแล้ว (NA ใช้ล้างผล) → บันทึก
4. บันทึกอย่างน้อยหนึ่งเกณฑ์ได้ ข้อที่ไม่ตรวจส่ง `NA`; พบ NG เพียงข้อเดียวแสดง NG พร้อมจำนวนข้อที่ยังค้าง
5. กล้อง QR ไม่จัดเก็บภาพ หลักฐาน Serial เป็นช่องแนบรูปต่างหาก ใน Mock ยังไม่เปิดอัปโหลดและไม่อ้างว่าจัดเก็บสำเร็จ
6. Reports กรองตามงาน/เดือนที่ตรวจรายคัน → Preview → “พิมพ์ / บันทึก PDF” → เลือก Save as PDF ใน browser ใช้ A4; PDF จาก backend มีป้ายกำกับว่าทั้งงาน ไม่ตามตัวกรองเดือน

`Total = OK + NG + Pending` เป็นกลุ่มไม่ซ้ำกัน: Pending คือไม่มี NG และตรวจไม่ครบ; จำนวน **ตรวจไม่ครบ** นับรถ NG ที่ยังค้างด้วย ห้ามจบงานขณะที่ยังมีรายการตรวจไม่ครบ เป้าหมายงานเป็นข้อมูลประกอบ ไม่แต่งผลตรวจเพื่อให้ครบเป้าหมาย

Serial ซ้ำตรวจแบบไม่แยกตัวพิมพ์เล็กใหญ่ **ภายใน Job เดียวกัน** ตามพฤติกรรมเดิม ขอบเขตนี้ต้องให้ธุรกิจรับรอง และ backend ต้อง enforce uniqueness แบบ atomic ก่อนเปิด write จริง

## Deployment

งานนี้อยู่บน branch `feature/stock-inspection-dark-navy-redesign`; review ผ่าน Pull Request ก่อน merge ไม่มีการเปลี่ยน Pages settings หรือ production โดยงานนี้

- Static app ไม่มี build step: publish `index.html`, `config.js`, `assets/` รวม fonts, logo และ `assets/vendor/jsQR.js`
- GitHub Pages ที่ใช้ project path ทำงานได้เพราะ assets ใช้ relative paths
- คง `config.js` เป็น Mock สำหรับ staging/demo deployment
- `config.example.js` เป็นตัวอย่างและ **ไม่ได้ถูกโหลด** สำหรับ live read-only ให้ตั้ง LIFF ID และ approved read URLs ใน `config.js`, เปลี่ยน `mode` เป็น `live`, คงสอง write flags เป็น `false`
- LINE Developers: กำหนด LIFF endpoint ให้ตรง URL HTTPS ที่ deploy และเปิด scope `openid`, `profile` ตามนโยบายบริษัท ทดสอบ external browser และ LINE in-app แยกกัน
- ตั้งค่า gateway CORS ให้เฉพาะ Pages origin ที่อนุมัติ ตรวจ LINE ID token และสิทธิ์ผู้ใช้ **บน server ทุกคำขอ**
- งาน register / update / create / finish / upload ต้องผ่าน Power Automate หรือ gateway ที่บริษัทอนุมัติ ไม่มี Microsoft write จาก n8n ห้ามเพิ่ม Graph permissions หรือฝัง token เพื่อทำให้ผ่าน
- เปิด `writesEnabled` และ `integrationVerified` หลังผ่าน sandbox checklist เท่านั้น flags เป็น rollout controls ไม่ใช่ระบบ authorization
- ห้ามใส่ secrets, bearer tokens, Microsoft tokens หรือ Power Automate URL ที่มี `sig` ใน public config
- CI `.github/workflows/qa.yml` ใช้ mock เท่านั้นและไม่ deploy

กลับเวอร์ชันก่อนหน้าได้ด้วย revert PR หลัง review; ไม่ต้องเปลี่ยน schema อัตโนมัติ ไม่มี migration หรือ workflow ที่เขียน Microsoft ใน repository นี้

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | App shell, navigation, dialogs |
| `assets/styles.css` / `fonts.css` | Dark Navy tokens, responsive layouts, Thai font, print |
| `assets/domain.js` | ผลตรวจ, ยอดรวม, field mapping, QR format, วันที่ |
| `assets/app.js` | LIFF gates, journeys, adapters, drafts, read-back confirmation |
| `assets/mock.js` | Fixtures และ isolated in-memory adapter |
| `assets/scanner.js` | กล้อง, lifecycle, BarcodeDetector/jsQR, ยืนยัน Serial |
| `assets/vendor/` | jsQR 1.4.0 และ Apache-2.0 license สำหรับใช้งาน offline |
| `tests/` | Domain, mock, browser, accessibility และ decoder tests |

ชื่อ endpoint และ flow ในระบบเดิมเป็นเพียงหลักฐานจาก frontend ไม่ใช่หลักฐานว่าสิทธิ์หรือ workflow หลังบ้านถูกต้อง โปรดอ่าน integration blockers ก่อนเชื่อมข้อมูลจริง

## การเก็บข้อมูลร่างและคำขอที่ยังไม่ยืนยัน

ร่างข้อความอยู่ใน `localStorage` แยกตาม mode, LINE user, Job และรายการตรวจ กู้คืนได้หลังปิด/เปิดแท็บใน browser profile เดิมภายใน 8 ชั่วโมง เมื่อเข้าแอปอีกครั้งจะล้างร่างที่หมดอายุ รูปภาพที่เลือกยังไม่เก็บข้ามหน้าและต้องเลือกใหม่ การเปลี่ยนเกณฑ์/ข้อมูลต้นฉบับจะป้องกันการนำร่างเดิมมาใช้ผิดรายการ

Operation journal อยู่ใน `localStorage` จน read-back ยืนยันผล เพื่อคงการล็อกคำขอที่ไม่ทราบผลหลังปิดแท็บ ไม่มี ID/access tokens ใน storage ถ้า browser ปิด storage จะไม่เริ่ม write ที่บันทึก journal ไม่ได้ การล้าง browser data ทำให้ร่างและ journal หาย จึงต้องมี server idempotency/uniqueness ตาม contract เสมอ
