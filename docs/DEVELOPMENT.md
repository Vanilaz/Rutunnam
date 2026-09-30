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
  water-gates.js             ประตูระบายน้ำ (createFeedHandler)
  camera-snapshot.js         proxy ภาพกล้องรังสิต (allowlist id)
  dams.js                    เขื่อนและอ่างเก็บน้ำ (createFeedHandler)
  flood-wms.js               proxy GISTDA WMS (ซ่อน key)
  config.js                  ชั้นข้อมูลที่ deployment นี้เปิดได้
  flood.js                   endpoint เดิม (ข้อมูลอ้างอิงแบบคงที่)
lib/                         logic ฝั่ง server ที่ทดสอบได้
  parse.js                   แปลงตัวเลข/ข้อความ/เวลา/พิกัดแบบปลอดภัย (ใช้ร่วมกัน)
  water.js                   แปลง ThaiWater waterlevel_load
  road-flood.js              แปลง ThaiWater flood_road
  traffic-cameras.js         คัดกรองฟีดกล้อง iTIC / Longdo
  water-gates.js             แปลง ThaiWater watergate_load
  dams.js                    แปลง ThaiWater analyst/dam (เฉพาะขนาดใหญ่/กลาง)
  feed-endpoint.js           โครง handler มาตรฐาน: ดึงข้อมูล → แปลง → cache → ข้อมูลสำเร็จล่าสุด → รายงานรูปแบบที่อ่านไม่ได้
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
    radar.js                 แปลงดัชนี RainViewer เป็น URL tile เรดาร์ล่าสุด
    reservoir.js             จัดระดับเขื่อนตามเกณฑ์กรมชลประทาน, ต่างระดับประตูน้ำ
    templates.js             สร้าง HTML ทั้งหมด (escape ทุกค่าจากภายนอก, อนุญาตเฉพาะลิงก์ http/https)
    api.js                   เรียก /api/* พร้อม timeout และข้อความ error ภาษาไทย
    storage.js               localStorage (cache สถานี, หมุดบ้าน, การเปิด/ปิดชั้น)
    load.js                  โหลด script/stylesheet จาก CDN พร้อม SRI เมื่อต้องใช้
    map/                     map.js, basemap.js, stations-layer.js, cameras-layer.js,
                             traffic-cameras-layer.js, flood-layer.js, traffic-layer.js,
                             road-flood-layer.js, water-gates-layer.js, dams-layer.js, location-layer.js,
                             viewport-markers.js (สร้างหมุดเฉพาะในจอ), radar-layer.js
    camera-availability.js   ตรวจว่ากล้องส่งภาพ/สตรีมได้จริงก่อนขึ้นแผนที่
    water-trends.js          แนวโน้มขึ้น/ลงจากค่าตรวจวัดสองรอบ
    ui/                      dom.js, clock.js, status.js, list-panel.js, camera-viewer.js,
                             hls-player.js (ต่อ HLS: native หรือ hls.js), live-grid.js (วิดีโอสดในรายการ)
  vendor/leaflet.min.css     CSS ของ Leaflet 1.9.4 (BSD-2-Clause)
scripts/check-build.js       ตรวจไฟล์จำเป็น, import graph, modulepreload
tests/*.test.js              unit test (node --test)
tests/e2e/                   Playwright: fixtures.js (mock เครือข่าย) + app.spec.js
types/globals.d.ts           type ของ global จาก CDN (plugin MapLibre-Leaflet)
```

**ลำดับการโหลดหน้าเว็บ**
1. Leaflet จาก cdnjs และ `main.js`
2. แสดงข้อมูลจาก cache ในเครื่อง (ถ้ามี)
3. ดึง `/api/water`, `/api/road-flood`, `/api/traffic-cameras`, `/api/water-gates`, `/api/dams` และ `/api/config` พร้อมกัน
4. โหลดแผนที่ MapLibre (lazy)
5. hls.js โหลดเฉพาะตอนผู้ใช้เปิดดูวิดีโอ

## การทดสอบ

| ชุด | คำสั่ง | ครอบคลุม |
|---|---|---|
| Unit | `npm test` | parser (ค่าว่าง, timezone, แถวเสีย, id ซ้ำ), API handlers (fallback, 405, proxy, redaction), risk rules, templates (escape, ไม่แต่งความลึก) |
| Browser | `npm run test:e2e` | ทุก flow บน desktop และ mobile (Pixel 7) ด้วย Chromium จริง |

Browser test mock เครือข่ายทั้งหมดใน `tests/e2e/fixtures.js`:
- `/api/*` ตอบด้วยข้อมูลทดสอบ
- tile ตอบเป็น PNG 1×1 ส่วนภาพกล้องตอบเป็นภาพ 160×120 (แอปไม่รับภาพที่กว้างน้อยกว่า 64 px)
- playlist วิดีโอตอบเป็น `#EXTM3U` เปล่า จึงผ่านการตรวจแต่เล่นไม่ได้ ถ้าเรียก `net.streams("hang")` player จะค้างที่ "กำลังต่อ" ใช้นับจำนวนสตรีม
- CDN (cdnjs, unpkg, jsdelivr) โหลดจริง จึงตรวจ SRI ของ MapLibre และ hls.js ไปด้วยทุกครั้งบน CI

Helper สำหรับเขียน test ที่ใช้ได้ทั้งสอง layout:
- `openTab(page, tab)`: desktop กดแท็บ ส่วนมือถือกดเมนูล่าง
- `stationCards(page)`
- `openLayers(page)`: เปิด drawer "ชั้นข้อมูล" (ทั้ง desktop และมือถือ)

ถ้าเครื่องออก internet ไม่ได้ ให้วางไฟล์จาก npm tarball ไว้ในโฟลเดอร์หนึ่ง แล้วตั้ง `E2E_CDN_MIRROR=/path/to/dir`:
- `leaflet.min.js`
- `maplibre-gl.js` และ `maplibre-gl.css`
- `leaflet-maplibre-gl.js`
- `hls.min.js`

## เพิ่มหรือแก้

**เพิ่ม endpoint ใหม่**
1. เขียน parser ใน `lib/` โดยใช้ `lib/parse.js` แล้วเขียน unit test
2. สร้าง `api/<name>.js`:
   - ถ้าเป็นฟีดรายการเดียวจากต้นทาง ให้ใช้ `createFeedHandler` จาก `lib/feed-endpoint.js` ซึ่งจัดการ method guard, timeout, cache, ข้อมูลสำเร็จล่าสุด และสถานะ `unsupported-format` ให้แล้ว
   - ถ้าเขียนเอง: เรียก `rejectUnsafeMethod` ก่อน ใส่ timeout ให้ upstream ตั้ง `Cache-Control` ให้เหมาะ และใช้ `logEvent` เมื่อผิดพลาด
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

## ขึ้นเวอร์ชัน

ใช้คำสั่ง `npm version <x.y.z> --no-git-tag-version` แล้วเพิ่มหัวข้อใหม่ใน `CHANGELOG.md`

คำสั่งนี้เรียก `scripts/sync-version.js` ให้อัตโนมัติ ซึ่งจะ:
- แก้ `APP_VERSION` ใน `public/js/config.js`
- เปลี่ยน URL ของ JS และ CSS ทุกไฟล์ใน `index.html` เป็น `/v/<version>/…` (Vercel rewrite กลับไปที่ไฟล์จริง, `dev-server.js` ทำแบบเดียวกัน)

เมื่อ URL เปลี่ยนทุกเวอร์ชัน เบราว์เซอร์จะไม่มีทางใช้ JS เก่าที่ค้างใน cache คู่กับ HTML ใหม่ ถ้าเวอร์ชันไม่ตรงกันหรือมี URL ที่ไม่มีเลขเวอร์ชัน `npm run build` จะล้มพร้อมบอกคำสั่งแก้

ไฟล์ใต้ `/v/<version>/` ตั้ง `Cache-Control: immutable` (cache ได้ 1 ปี) ไฟล์ของเวอร์ชันหนึ่งจึงห้ามเปลี่ยนอีก:
- `asset-manifest.json` เก็บ hash ของ JS และ CSS ทุกไฟล์ของเวอร์ชันปัจจุบัน
- ถ้าแก้ไฟล์ใน `public/js/` หรือ `public/*.css` โดยไม่ขึ้นเวอร์ชัน `npm run build` จะล้มพร้อมบอกให้รัน `npm version patch --no-git-tag-version`

## เกณฑ์ก่อน merge

- `npm run check` และ `npm run test:e2e` ผ่าน
- ทุก job บน CI เป็นสีเขียว
- ถ้าเพิ่ม endpoint หรือ environment variable ต้องอัปเดต `docs/API.md`, `README.md`, `.env.example` และ `CHANGELOG.md`
