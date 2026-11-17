> Historical Dark Navy baseline. Current behavior and integration contract: [White Minimal upgrade](WHITE-MINIMAL.md).

# Manual acceptance checklist

บันทึกสถานะ **PASS / FAIL / NOT TESTED**, browser/device, tester, เวลา, fixture หรือ sandbox Job ID และหลักฐานต่อกรณี ห้ามเปลี่ยนสถานะเป็น PASS ถ้ายังไม่ได้ทำจริง ห้ามสร้าง test records ใน production Lists

รายการด้านล่างเริ่มต้น **NOT TESTED ด้วยคนบนอุปกรณ์จริง**; automated evidence แยกอยู่ใน [QA results](QA-RESULTS.md)

| เส้นทาง | ขั้นตอนและผลที่ต้องได้ | สถานะ |
|---|---|---|
| First LINE launch | เปิด LIFF จาก LINE, login สำเร็จ, approved เข้าระบบได้ | NOT TESTED |
| New user | ลงทะเบียนครั้งเดียว, รออนุมัติ; ไม่ได้เป็น approved เพียงเพราะส่งคำขอ | NOT TESTED |
| Next login/session | กลับเข้าแอป, token หมดอายุ, เปลี่ยนบัญชี, denied user ไม่เห็นงาน | NOT TESTED |
| Authorization | เรียก sandbox API ด้วยผู้ใช้ผิด role/job; server ปฏิเสธ | NOT TESTED |
| Jobs | ค้นหา Claim/Product/Model แยกและรวม; clear filters; no-result; ปัก/เอาดาวออก; สถานะงานถูกต้อง | NOT TESTED |
| Job create/edit | title, target, checking method, ≥1 criterion; mapping business job key กับ positive Lists ID; read-back ตรงทุก field | NOT TESTED |
| No criteria | เพิ่มเกณฑ์ก่อนเปิด inspection; ห้ามนับไม่มีเกณฑ์ว่าตรวจครบ | NOT TESTED |
| Single criterion | OK/NG บันทึกและดูรายงานตรงกัน | NOT TESTED |
| Partial / NA | ตรวจบางข้อแล้วบันทึก, ข้อที่ไม่ตรวจเป็น NA, กลับมาตรวจต่อได้ | NOT TESTED |
| Partial NG | NG หนึ่งข้อและข้ออื่น NA → NG, จำนวนตรวจไม่ครบเพิ่ม, finish ปิดไม่ได้ | NOT TESTED |
| Edit record | เปลี่ยน NG→OK, stale overall ไม่ชนะรายข้อ, จำนวนแถวไม่เพิ่ม | NOT TESTED |
| Duplicate/concurrency | Serial เดิมต่างตัวพิมพ์ในงานเดียวถูกปฏิเสธ; สองอุปกรณ์กดพร้อมกันได้เพียงหนึ่งแถว; ETag conflict | NOT TESTED |
| Double submit | กดหลายครั้งก่อน/ระหว่างบันทึก; มี request เดียว | NOT TESTED |
| Ambiguous save | ตัดอินเทอร์เน็ตหลังส่ง, รอคำขอ, reload/reopen, ตรวจผลด้วย request ID โดยไม่ส่งซ้ำ | NOT TESTED |
| Draft | พิมพ์, ออกหน้า/refresh/reopen, restore เฉพาะบัญชี/งานเดิม; changed criteria ไม่ดึงร่างเก่ามาใช้; รูปต้องเลือกใหม่ | NOT TESTED |
| QR | plain Serial, JSON, key=value แบบที่รับรอง; QR ผิดแบบถูกปฏิเสธ; แสดงเลขให้ยืนยัน, ไม่มี auto-save | NOT TESTED |
| Camera | denied, no device, occupied camera, scan timeout, repeated QR, close ระหว่างรอสิทธิ์, background stops tracks | NOT TESTED |
| Evidence | QR ไม่กลายเป็นหลักฐาน; ถ่าย/เลือก Serial photo แยก; Job OK/NG photo อยู่ระดับ Job | NOT TESTED |
| Protected photos | empty URL, wrong URL, Microsoft login required; ไม่มี anonymous link ใหม่; read-back URL ก่อนแสดง confirmed | NOT TESTED |
| Upload failure | ใหญ่เกิน 15 MB/ไฟล์เสีย/timeout; ไม่แสดง success; replacement ไม่ล้าง URL เก่าก่อนยืนยัน | NOT TESTED |
| Reports | Total=OK+NG+Pending; incomplete รวม partial NG; รายเดือนอิง inspection date Bangkok; unknown dates/Serial แสดงขาด | NOT TESTED |
| PDF | Preview และ A4 PDF รายงาน/เดือนตรงกับ sandbox Lists, ข้อความไทยครบ, page breaks/header ไม่ทับ, ไม่มีเมนูใน PDF | NOT TESTED |
| Layout | 320/375/390/428/768/1440, portrait/landscape, ไม่มี horizontal scroll; dialog/forms/footer/safe-area/keyboard ไม่บัง control ที่ใช้ | NOT TESTED |
| Accessibility | keyboard-only, visible focus, TalkBack/VoiceOver, text zoom 200%, contrast และ status ไม่ใช้สีอย่างเดียว | NOT TESTED |
| System outage | n8n/Lists/PA unavailable, partial pages, slow read: clear loading/error, stale label, ไม่มี blind write retry | NOT TESTED |

## Fixtures ที่มีให้

- `DEMO-L-001`: 2 criteria; complete OK, partial NG, partial OK, empty results; 4 rows รวม OK=1, NG=1, Pending=2, incomplete=3
- `DEMO-M-002`: NEW job, product M, Hotline
- `DEMO-B-003`: one criterion, zero records
- `DEMO-L-004`: completed job, one complete OK, ไม่มี backend PDF URL
- `DEMO-RX-005`: ไม่มี criteria, ใช้ทดสอบ setup

ทุกชื่อ/Serial เป็นข้อมูลจำลอง บริการ Mock ไม่รับ upload และไม่ใช้ Microsoft token
