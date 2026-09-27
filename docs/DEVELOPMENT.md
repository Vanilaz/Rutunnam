# คู่มือนักพัฒนา

## หลักการ

- **ไม่มี bundler:** หน้าเว็บใช้ ES modules ของเบราว์เซอร์โดยตรง ส่วน `npm run build` แค่ตรวจ type, import graph และ `modulepreload`
- **ไม่มี framework และไม่มีฐานข้อมูล:** ใช้ Leaflet จาก CDN ส่วนฝั่ง server เป็น Vercel Functions แบบ CommonJS
- **ไม่แต่งข้อมูล:** ค่าที่ไม่รู้ให้เป็น `null` ไม่ใช่ 0 ข้อมูลเก่าต้องบอกว่าเก่า และข้อมูลที่อ่านไม่ได้ต้องบอกว่าอ่านไม่ได้ ไม่ใช่บอกว่า "ไม่มี"
- **Type ต้องผ่าน:** ทุกไฟล์ `.js` ถูกตรวจด้วย TypeScript (`checkJs`, `strict`) ผ่าน JSDoc
- **ค่าคงที่อยู่ที่เดียว:** ฝั่งเว็บใช้ `public/js/config.js` ฝั่ง server ใช้ `lib/*.js`

## โครงสร้าง

```
api/                         Vercel Functions (1 ไฟล์ = 1 endpoint) — ดู docs/API.md
  water.js                   สถานีวัดน้ำ + fallback ข้อมูลสำเร็จล่าสุด
  road-flood.js              ถนนน้ำท่วม
  traffic-cameras.js         กล้องจราจรทั่วประเทศ + fallback
  flood-wms.js               proxy GISTDA WMS (ซ่อน key)
  config.js                  ชั้นข้อมูลที่ deployment นี้เปิดได้
  flood.js                   endpoint เดิม (ข้อมูลอ้างอิงแบบคงที่)
lib/                         logic ฝั่ง server ที่ทดสอบได้
  parse.js                   แปลงตัวเลข/ข้อความ/เวลา/พิกัดแบบปลอดภัย (ใช้ร่วมกัน)
  water.js                   แปลง ThaiWater waterlevel_load
  road-flood.js              แปลง ThaiWater flood_road
  traffic-cameras.js         คัดกรองฟีดกล้อง iTIC / Longdo
  wms.js                     ตรวจพารามิเตอร์ WMS GetMap
  layers.js                  อ่าน env → config สาธารณะ, URL ของ GISTDA/TomTom
  http.js                    method guard, query params, log แบบ JSON
public/
  index.html                 โครงหน้า + modulepreload
  styles.css                 สไตล์ทั้งหมด (desktop + mobile app shell)
  js/
    main.js                  composition root: state, ผูก event, จัดลำดับการโหลด
    config.js                ค่าคงที่, รายการกล้องระดับน้ำ, เวอร์ชัน + SRI ของ CDN
    types.js                 JSDoc typedef ที่ใช้ร่วมกัน (ไม่ถูกโหลดตอนรันจริง)
    utils.js                 ฟังก์ชันบริสุทธิ์: เวลา ระยะทาง ค้นหา ตรวจข้อมูลจาก API
    risk.js                  จัดระดับความเสี่ยงล้นตลิ่ง
    templates.js             สร้าง HTML ทั้งหมด (escape ทุกค่าจากภายนอก, อนุญาตเฉพาะลิงก์ http/https)
    api.js                   เรียก /api/* พร้อม timeout และข้อความ error ภาษาไทย
    storage.js               localStorage (cache สถานี, หมุดบ้าน, การเปิด/ปิดชั้น)
    load.js                  โหลด script/stylesheet จาก CDN พร้อม SRI เมื่อต้องใช้
    map/                     map.js, basemap.js, stations-layer.js, cameras-layer.js,
                             traffic-cameras-layer.js, flood-layer.js, traffic-layer.js,
                             road-flood-layer.js, location-layer.js
    ui/                      dom.js, clock.js, status.js, list-panel.js, camera-viewer.js
  vendor/leaflet.min.css     CSS ของ Leaflet 1.9.4 (BSD-2-Clause)
scripts/check-build.js       ตรวจไฟล์จำเป็น, import graph, modulepreload
tests/*.test.js              unit test (node --test)
tests/e2e/                   Playwright: fixtures.js (mock เครือข่าย) + app.spec.js
types/globals.d.ts           type ของ global จาก CDN (plugin MapLibre-Leaflet)
```

**ลำดับการโหลดหน้าเว็บ**
1. Leaflet จาก cdnjs และ `main.js`
2. แสดงข้อมูลจาก cache ในเครื่อง (ถ้ามี)
3. ดึง `/api/water`, `/api/road-flood`, `/api/traffic-cameras` และ `/api/config` พร้อมกัน
4. โหลดแผนที่ MapLibre (lazy)
5. hls.js โหลดเฉพาะตอนผู้ใช้เปิดดูวิดีโอ

## การทดสอบ

| ชุด | คำสั่ง | ครอบคลุม |
|---|---|---|
| Unit | `npm test` | parser (ค่าว่าง, timezone, แถวเสีย, id ซ้ำ), API handlers (fallback, 405, proxy, redaction), risk rules, templates (escape, ไม่แต่งความลึก) |
| Browser | `npm run test:e2e` | ทุก flow บน desktop และ mobile (Pixel 7) ด้วย Chromium จริง |

Browser test mock เครือข่ายทั้งหมดใน `tests/e2e/fixtures.js`:
- `/api/*` ตอบด้วยข้อมูลทดสอบ
- tile และภาพกล้องตอบเป็น PNG ขนาด 1×1
- ใน test ที่ต้องการ ต้นทางวิดีโอจะถูกตัดการเชื่อมต่อ
- CDN (cdnjs, unpkg, jsdelivr) โหลดจริง จึงตรวจ SRI ของ MapLibre และ hls.js ไปด้วยทุกครั้งบน CI

Helper สำหรับเขียน test ที่ใช้ได้ทั้งสอง layout:
- `openTab(page, tab)`: desktop กดแท็บ ส่วนมือถือกดเมนูล่าง
- `stationCards(page)`
- `openLayers(page)`: มือถือเปิด sheet "ชั้นข้อมูล"

ถ้าเครื่องออก internet ไม่ได้ ให้วางไฟล์จาก npm tarball ไว้ในโฟลเดอร์หนึ่ง แล้วตั้ง `E2E_CDN_MIRROR=/path/to/dir`:
- `leaflet.min.js`
- `maplibre-gl.js` และ `maplibre-gl.css`
- `leaflet-maplibre-gl.js`
- `hls.min.js`

## เพิ่มหรือแก้

**เพิ่ม endpoint ใหม่**
1. เขียน parser ใน `lib/` โดยใช้ `lib/parse.js` แล้วเขียน unit test
2. สร้าง `api/<name>.js`:
   - เรียก `rejectUnsafeMethod` ก่อน
   - ใส่ timeout ให้ upstream
   - ตั้ง `Cache-Control` ให้เหมาะ
   - ใช้ `logEvent` เมื่อผิดพลาด
3. เพิ่ม path ใน `apiRoutes` ของ `dev-server.js`
4. อธิบายใน `docs/API.md`

**เพิ่มชั้นข้อมูลบนแผนที่**
1. สร้าง `public/js/map/<name>-layer.js` ที่คืน `{ update, setVisible, markerFor }` และสร้าง icon หรือ `L.*` ภายในฟังก์ชัน ไม่ใช่ตอนโหลดโมดูล เพื่อให้แอปยังทำงานได้แม้ Leaflet โหลดไม่สำเร็จ
2. เพิ่มสวิตช์ใน `index.html` แล้วผูก event ใน `main.js`
3. เพิ่ม `<link rel="modulepreload">` (ถ้าลืม `npm run build` จะแจ้ง)
4. เพิ่ม mock ใน `tests/e2e/fixtures.js` และเขียน test

**ถ้าต้นทางเปลี่ยนรูปแบบข้อมูล**
1. เก็บตัวอย่าง payload จริงที่ตัดข้อมูลส่วนบุคคลออกแล้ว มาเป็น fixture ใน unit test
2. แก้ parser ใน `lib/` แล้วรัน `npm run check`

**เปลี่ยนเวอร์ชัน library จาก CDN**
1. ดาวน์โหลด tarball จาก registry.npmjs.org
2. คำนวณ hash: `openssl dgst -sha384 -binary <file> | openssl base64 -A`
3. แก้ URL และ `integrity` ใน `public/js/config.js`
4. CI จะยืนยันว่า hash ตรงกับไฟล์บน CDN

## เกณฑ์ก่อน merge

- `npm run check` และ `npm run test:e2e` ผ่าน
- ทุก job บน CI เป็นสีเขียว
- ถ้าเพิ่ม endpoint หรือ environment variable ต้องอัปเดต `docs/API.md`, `README.md`, `.env.example` และ `CHANGELOG.md`
