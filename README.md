# รู้ทันน้ำ · Flood Watch MVP

เว็บแอปติดตามสถานีวัดน้ำสำหรับมือถือและคอมพิวเตอร์ พร้อมตำแหน่ง GPS หมุดบ้าน ลิงก์แผนที่น้ำท่วม และกล้องสาธารณะจากหน่วยงานต้นทาง ออกแบบให้ลง **Vercel Hobby** โดยไม่ต้องมีฐานข้อมูลหรือแพ็กเกจ npm เพิ่มเติม

## เริ่มใช้งานในเครื่อง

ต้องใช้ Node.js 20 ขึ้นไป

```bash
npm ci
npm run dev
```

เปิด `http://localhost:3000`

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run typecheck` | ตรวจ type ทั้งโปรเจกต์ด้วย TypeScript (`checkJs` + JSDoc, strict) |
| `npm test` | unit test ของ parser, API และโมดูลหน้าเว็บ |
| `npm run test:e2e` | ทดสอบใน Chromium จริง (desktop + mobile) ด้วย Playwright; ครั้งแรกรัน `npx playwright install chromium` |
| `npm run build` | typecheck + ตรวจ import graph และ `modulepreload` (Vercel ใช้คำสั่งนี้) |
| `npm run check` | build + unit test ก่อน push |

GitHub Actions (`.github/workflows/ci.yml`) รันทุกข้อข้างบนบน Node 20/22 ทุก PR และทุก push เข้า `main` CSS ของ Leaflet 1.9.4 ให้บริการจาก `public/vendor` พร้อม BSD 2-Clause license; JavaScript และกระเบื้อง OpenStreetMap ยังต้องใช้อินเทอร์เน็ต

## โครงสร้างโค้ดฝั่งเว็บ

ใช้ ES modules ของเบราว์เซอร์โดยตรง ไม่มี bundler/build step (`npm run build` แค่ตรวจว่า import ทุกตัวมีไฟล์จริงและ `modulepreload` ใน `index.html` ครบ)

```
public/js/
  main.js            จุดประกอบ: state ของแอป + ผูก event กับ DOM
  config.js          ค่าคงที่ทั้งหมด (เวลา refresh, URL, รายการกล้อง, เวอร์ชัน MapLibre + SRI)
  utils.js           ฟังก์ชันบริสุทธิ์ (เวลา ระยะทาง ค้นหา ตรวจข้อมูล) — ทดสอบด้วย node ได้
  templates.js       สร้าง HTML ทุกส่วน โดย escape ค่าจากภายนอกทุกจุด
  api.js / storage.js  ดึง /api/water (มี timeout) และ localStorage
  map/               map.js, basemap.js (โหลด MapLibre แบบ lazy), stations-layer.js,
                     cameras-layer.js, location-layer.js
  ui/                clock.js, status.js, list-panel.js
```

MapLibre (~800 kB) โหลดหลังข้อมูลสถานีเริ่มดึงแล้ว จึงไม่หน่วงการแสดงสถานี หากเบราว์เซอร์ไม่มี WebGL หรือสไตล์ OpenFreeMap โหลดไม่ได้ แผนที่จะกลับไปใช้ OpenStreetMap แบบ raster อัตโนมัติ

## Deploy ไป Vercel

1. นำโฟลเดอร์นี้ขึ้น GitHub repository ของคุณ
2. ใน Vercel เลือก **Add New → Project → Import** repository
3. ตั้ง Framework Preset เป็น **Other**, Root Directory เป็นโฟลเดอร์นี้, Output Directory เป็น `public` และ Build Command เป็น `npm run build` (ถ้า type ผิด build จะล้มและไม่ deploy)
4. Deploy แล้วตรวจ `/api/water` และหน้าแรกบนโดเมน `vercel.app`

หากตั้งผ่าน CLI ให้ใช้ `vercel` จากโฟลเดอร์โครงการและเลือก Framework Preset `Other` กับ Output Directory `public` เช่นเดียวกัน

## แหล่งข้อมูลและความหมาย

- `/api/water` อ่านค่าล่าสุดจาก public endpoint ของ ThaiWater: `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` ตอบ JSON ที่มีสถานี พิกัด ค่าระดับน้ำ และเวลา **เมื่อ upstream ส่งมาและ parser รองรับ**. Cache ที่ CDN 60 วินาที; หน้าเว็บขอใหม่ทุก 2 นาทีเมื่อเปิดอยู่
- ค่าที่แสดงเป็นเมตรอ้างอิงระดับทะเลปานกลางเมื่อใช้ฟิลด์ `waterlevel_msl`; อย่านำไปเทียบความลึกน้ำบนถนน
- เวลา “ดึงข้อมูล” แยกจากเวลา “ตรวจวัด” หากไม่มีเวลา แอปจะแสดงว่าไม่ทราบเวลา หากเก่ากว่า 6 ชั่วโมง แอปจะแจ้งข้อมูลเก่า
- `/api/flood` ยังไม่สร้าง polygon ขึ้นเอง เพราะยังไม่ได้ยืนยันการเชื่อมต่อ GeoJSON/WMS ที่ใช้ได้จากฝั่ง server. แท็บน้ำท่วมเปิด GISTDA และระบบตรวจวัดถนนของ กทม. จากเว็บไซต์ต้นทาง
- หมุดกล้อง 6 จุดของสำนักการระบายน้ำ กทม. ใช้พิกัดและ URL ภาพที่หน่วยงานเผยแพร่ใน `https://dds.bangkok.go.th/cctv.php` กดหมุดดูภาพ JPEG ที่รีโหลดทุก 10 วินาทีขณะเปิด popup ภาพนี้ไม่ใช่วิดีโอ และความสดขึ้นกับต้นทาง หากภาพไม่ขึ้นมีลิงก์เปิดเว็บไซต์หน่วยงาน
- กล้องระดับน้ำท่าน้ำสะพานแดงของเทศบาลนครรังสิตแสดงภาพ snapshot ที่อัปเดตราวทุก 2 นาที หมุดเป็นพิกัดพื้นที่โดยประมาณ
- หมุดอีก 2 จุดเป็นทางเข้า **ศูนย์กล้องในพื้นที่** (รังสิตและกรมชลประทานลุ่มน้ำเจ้าพระยา) ติดป้ายชัดว่าไม่ใช่พิกัดติดตั้งกล้องรายตัว กล้องของกรมชลประทานแจ้งว่ารองรับ Firefox เท่านั้น
- สถานีวัดน้ำแสดงผ่าน Canvas ของ Leaflet เพื่อให้เลื่อนและซูมได้ลื่นกว่า 800+ DOM markers; ตอน refresh จะอัปเดต marker เดิมแทนการสร้างใหม่ และสร้าง popup เมื่อเปิดเท่านั้น ข้อมูลล่าสุดที่โหลดสำเร็จเก็บไว้ในอุปกรณ์ไม่เกิน 24 ชั่วโมง; เมื่อ API ขัดข้องจะแสดงข้อความว่าเป็นข้อมูลครั้งก่อนพร้อมเวลา
- หมุดบ้านอยู่ใน `localStorage` ของอุปกรณ์นั้น ไม่ส่งไปเซิร์ฟเวอร์; GPS ใช้หลังผู้ใช้กดอนุญาต

## Production

- **Security headers** (`vercel.json`): `X-Frame-Options: DENY`, `Permissions-Policy` (อนุญาตเฉพาะ geolocation), `nosniff`, `Referrer-Policy` และ CSP ในโหมด `Report-Only` ทดสอบแบบบังคับใช้กับ Chromium แล้ว แต่ยังไม่ได้ยืนยันกับ OpenFreeMap และกล้องจริง ให้เปิด DevTools บน production ถ้าไม่มี CSP violation ใน console จึงเปลี่ยน key เป็น `Content-Security-Policy`
- **ความทนทานของ API**: `/api/water` จำ feed ที่ดึงสำเร็จล่าสุดไว้ใน instance (ไม่เกิน 6 ชั่วโมง) ถ้า ThaiWater ล่มจะตอบข้อมูลนั้นพร้อม `stale: true` และหน้าเว็บจะแจ้งผู้ใช้ ความผิดพลาดของต้นทางถูก log เป็น JSON (`water_upstream_failed`) ดูได้ใน Vercel Runtime Logs
- **CDN**: MapLibre ล็อกเวอร์ชันและตรวจ SRI; Leaflet มาจาก cdnjs หากโหลดไม่ได้ หน้ายังแสดงรายการสถานีได้

## ขอบเขต MVP และขั้นต่อไป

การแสดงพื้นที่ท่วมบนแผนที่และกล้องรายตัวของหน่วยงานอื่นต้องเชื่อม feed ที่เผยแพร่พิกัดและภาพให้ครบก่อน โปรเจกต์นี้ไม่ตีความค่าระดับน้ำว่า “ล้นตลิ่ง” หากไม่มีเกณฑ์รายสถานีที่ยืนยันแล้ว การแจ้งเตือนขณะปิดแอปต้องมีบริการ push และงานตั้งเวลาเพิ่มเติม

ถ้า ThaiWater เปลี่ยนรูปแบบข้อมูล upstream ให้แก้ `lib/water.js` และทดสอบกับ payload จริงจาก `/api/water` บน Vercel โดยเก็บตัวอย่างที่ตัดข้อมูลส่วนบุคคลแล้วเป็น fixture ทดสอบ
