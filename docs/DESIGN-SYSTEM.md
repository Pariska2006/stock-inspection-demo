# Dark Navy design system

ปรับเส้นทางใช้งานจากการเลือกเมนูหลายชั้นเป็น **ดูยอด → ค้นหา/กรอง → เปิดงาน → ตรวจรายคัน → ตรวจทานรายงาน**

## Tokens

| Token | Value | ใช้กับ |
|---|---|---|
| `--canvas` | `#0B1220` | พื้นหลัก |
| `--paper` | `#172338` | การ์ด |
| `--surface` | `#1E293B` | พื้นรองและ controls |
| `--primary` | `#3B82F6` | ปุ่มหลัก |
| `--accent` | `#60A5FA` | links, focus, active nav |
| `--ink` | `#F8FAFC` | ข้อความหลัก |
| `--muted` | `#94A3B8` | ข้อความรอง |
| `--line` | `#334155` | เส้นขอบ |
| `--ok` | `#34D399` | OK |
| `--red-ink` | `#FB7185` | NG / error |
| `--amber-ink` | `#FBBF24` | Pending / warning |

ไม่มี gradient สีสถานะประกอบด้วยข้อความหรือ icon เสมอ ปุ่มพื้น primary ใช้ข้อความเข้ม `#08111F` เพื่อให้ contrast เพียงพอ; hover ใช้พื้น `#2563EB` และข้อความขาว

## Layout และ components

- Dashboard: greeting แบบกระชับ, metric cards, primary actions, search + independent filters, pinned jobs, job cards, monthly progress
- Job detail: identity, summary, target/completion, Product/Model/Claim Category, OK/NG references, วิธีตรวจที่เปิดไว้อยู่แล้ว, action และ Serial records เรียงล่าสุดก่อน
- Inspection: QR อยู่ด้านบน, Serial/Model/Date, วิธีตรวจ, criterion cards พร้อม OK/NG/NA 48px, optional notes/evidence, sticky save footer
- Mobile navigation: Home / Jobs / Inspection / Reports, Profile เข้าผ่าน avatar, Monthly Overview ผ่านการ์ดหน้าแรก
- Desktop: sidebar + workspace จำกัดความกว้าง, ไม่ใช้สีแยกทุกเมนูโดยไม่มีความหมาย
- 4px spacing scale โดยทั่วไป: 8/12/16/20/24/28; card radius 10–12px, border 1px, shadow บาง
- Thai font จาก source เดิมเก็บในเครื่อง พร้อม license; icons เป็น SVG stroke, ไม่มี emoji
- Touch targets อย่างน้อย 44px; form controls 46px และ font 16px; focus outline 3px
- 840px เปลี่ยนจาก sidebar เป็น bottom nav; 550px ยุบ grid/ตาราง; safe-area ด้านล่างสำหรับ iOS
- Loading skeleton, empty/error states, read-only state, unknown save state, missing-photo/access hints
- Print: A4, พื้นขาว, ตารางแบ่งหน้าและหัวตารางซ้ำ, ซ่อน navigation/actions และ thumbnail bytes (เปิดหลักฐานจาก Preview ได้)

ทดสอบ overflow ใน 12 หน้าที่ 320, 375, 390, 428, 768, 1440px; accessibility automation เป็นเพียงส่วนหนึ่งของ QA และยังต้องทดสอบ VoiceOver/TalkBack และอุปกรณ์จริง

## ภาพหน้าจอจาก Mock ที่รันจริง

[Desktop dashboard](screenshots/home-desktop.png) · [Mobile dashboard](screenshots/home-mobile.png) · [Mobile inspection](screenshots/inspection-mobile.png)
