# System audit and fixes

ตรวจ source ทั้งหมดของ `Pariska2006/stock-inspection-demo` ที่ commit `010e36d9a0235f6ba58ff539f2dd7a2b4c5208ef` ก่อนแก้ไข Repository เดิมมีเพียง `index.html` (2,748 lines, รวม font/logo แบบ embedded) ไม่มี AGENTS.md, test suite, deployment guide, n8n exports หรือ Power Automate definitions

## Findings

| ID / ระดับ | หลักฐานใน source เดิม | ผลกระทบ | การแก้ไข / สถานะ |
|---|---|---|---|
| A01 High | `vehicleInspection` เลือก pending ก่อน `effectiveResult` เมื่อ checked < total | รถ partial NG หายจาก NG summary | แยก `status` และ `complete`; NG ชนะเสมอ, Pending ไม่ซ้ำ NG; ทุกหน้ารวม counts จาก domain rules — FIXED |
| A02 High | `trackWrite` สร้าง pending หลังรับ HTTP acknowledgement เท่านั้น; มี `allow-retry` | timeout หลัง server รับข้อมูลเปิดทางให้ส่งซ้ำ | ลง operation journal ก่อนส่ง, stable clientRequestId, read-back confirmation, ไม่มี blind resend — FIXED ฝั่ง client; server idempotency ยัง BLOCKED |
| A03 High | duplicate check ของรายการใหม่ใช้ข้อมูล cache; latest read ทำเฉพาะ edit | ข้อมูลเก่าทำให้บันทึก Serial ซ้ำ | อ่านล่าสุดทั้ง create/edit และตรวจ duplicate/criteria; backend atomic uniqueness ยังต้องรับรอง — CLIENT FIXED |
| A04 High | `effectiveResult` รวม stale overall NG แม้ผลรายข้อถูกแก้เป็น OK | ผลรวมหลังแก้ไขยัง NG | ใช้ผลรายข้อก่อน aggregate; aggregate fallback เมื่อไม่มีผลรายข้อ — FIXED |
| A05 Medium | ไม่มีกลไกร่าง/`beforeunload` | ข้อความที่กรอกสูญหายเมื่อออก/refresh | เก็บร่างตามบัญชี/งาน/รายการ, ตรวจ source baseline ก่อน restore, เตือนออกหน้า; ไม่เก็บ file blobs หรือ tokens — FIXED ตามข้อจำกัด browser |
| A06 Medium | `photoSlots`/`referencePictures` อ่าน camelCase เท่านั้น | PascalCase Lists URLs ไม่แสดง | map `OKPictureURL`, `NGPictureURL`, `PhotoURL1` และ hyperlink object — FIXED |
| A07 Medium | image error handler ซ่อนภาพเงียบ ๆ | ผู้ใช้ไม่ทราบว่าไม่มีภาพหรือขาดสิทธิ์ | แสดงข้อความ missing URL / Microsoft sign-in; คงลิงก์แบบ authenticated — FIXED |
| A08 Medium | เลือกรูปใหม่เรียก `removePhoto` ทำให้ URL เก่าว่างก่อน upload | ผลตรวจอาจสูญเสียภาพเดิมเมื่อ upload ล้มเหลว | คง confirmed URL ระหว่าง replacement จน backend ผูกภาพใหม่ — FIXED |
| A09 Medium | missing Serial ถูกกรองทิ้งตั้งแต่ normalize | รายงาน total ต่ำลงโดยไม่แจ้งข้อมูลขาด | คงแถวที่ข้อมูลขาด แสดง `— (ไม่ระบุ Serial)`; ไม่มี fabricated identifier ใน payload — FIXED |
| A10 Medium | วันที่เดิมใช้ `new Date` โดยไม่ตรวจ calendar overflow | 30 ก.พ. อาจกลายเป็นเดือนมี.ค. | strict date validation; reject future inspection dates, invalid imported ISO date แสดง `—` — FIXED |
| A11 Medium | 401/403 เป็น network error ทั่วไป | session หมดอายุยังเห็น app state เดิม | ซ่อน app, ปิดการเขียน, login/blocked gate; ไม่บันทึก token — FIXED |
| A12 Medium | title งานเดิม readonly, target ไม่มี form | แก้ไขรายละเอียดสำคัญไม่ได้ | เพิ่ม title/target editor, validation และ read-back; backend field support ต้องทดสอบ — CLIENT FIXED |
| A13 Medium | แก้ criteria ของงานที่มีผลแล้วได้ | ผลเดิมถูกแปลตามเกณฑ์ใหม่ | ป้องกัน criteria changes หลังมี records, ตรวจ stale job/record ก่อน save — FIXED ฝั่ง client |
| A14 Medium | ทุก endpoint ถูกฝังเป็น production n8n URL; comment ระบุ STK_10 upload Incoming | ไม่ยืนยันว่า obey read-only M365 restriction | เปลี่ยน default เป็น explicit isolated mock; แยก read/registration/write/photo gateway config, live writes disabled — MITIGATED; workflows NOT AUDITED |
| A15 Feature | ไม่มี QR scanner / local PDF export / model filter; รายงานเฉพาะ closed jobs | journey ไม่ครบตามข้อกำหนด | scanner module + local decoder, confirm step, independent filters, job/month preview + A4 print/PDF — IMPLEMENTED |
| A16 UX | หลายชุด CSS overrides สีสว่าง/เขียว/ม่วง, dashboard totals อยู่คนละหน้า | hierarchy ไม่ชัดและดูแลยาก | external design system ใหม่, mobile cards/nav, shared tokens, all requested viewport tests — IMPLEMENTED |

ไม่พบ bearer token, Microsoft secret หรือ signed Power Automate URL ใน source เดิมที่ตรวจ พบ LIFF ID และ webhook URLs ซึ่งเป็น config สาธารณะ ไม่ใช่หลักฐานว่าระบบหลังบ้านปลอดภัย

## Integration boundary

ตรวจได้จริงเฉพาะ frontend และ simulated contracts ไม่มีสิทธิ์หรือ definitions สำหรับ STK_04/07/08/10, STK_06/09, STK_Users/STK_Jobs/STK_Inspections, OneDrive `Stock_Inspection_Images` จึง **NOT TESTED** สำหรับการทำงานจริงเหล่านั้น ไม่ได้เรียก production webhooks, เปลี่ยน Graph permission, เพิ่ม token หรือเปิด anonymous sharing

Frontend controls ไม่ป้องกันผู้โจมตีที่เรียก API ตรง จำเป็นต้อง verify token, role, item/job relationship, uniqueness, idempotency, stale-write versions และ authorization ที่ gateway/Power Automate ตาม [integration contract](INTEGRATION.md)

## Review decisions

รักษา legacy note header `[Stock Inspection]`, action names, NA payload, รายการตรวจสูงสุดสี่เกณฑ์ และ existing overall fallback เพื่อให้ปรับ backend ได้เป็นขั้นตอน เปลี่ยน default runtime เป็น mock อย่างตั้งใจ: branch นี้ห้ามนำไปแทน production แล้วคาดว่าจะเชื่อมข้อมูลจริงอัตโนมัติ

ไม่มีการสร้าง migration, tenant permission, flow activation หรือ deletion capability ใหม่ Delete inspection ยังคงปิดไว้ เพราะ contract และ authorization ยังไม่ได้รับรอง
