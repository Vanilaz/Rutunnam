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

## ตั้งค่า API key (Vercel → Project Settings → Environment Variables)

| ตัวแปร | ใช้ทำอะไร | ถ้าไม่ตั้ง |
|---|---|---|
| `GISTDA_API_KEY` | ชั้น "พื้นที่น้ำท่วม (ดาวเทียม)" ผ่าน `/api/flood-wms` key อยู่ฝั่ง server เท่านั้น | สวิตช์ถูกปิดใช้งานพร้อมคำอธิบาย |
| `GISTDA_FLOOD_PERIOD` | `1day`, `3days` หรือ `7days` (ค่าเริ่มต้น `7days`) | ใช้ 7 วัน |
| `TOMTOM_API_KEY` | ชั้น "การจราจร" (TomTom Traffic Flow tiles) | สวิตช์ถูกปิดใช้งาน |
| `TRAFFIC_TILE_URL` / `TRAFFIC_ATTRIBUTION` | ใช้ผู้ให้บริการจราจรอื่นแทน TomTom (URL ต้องเป็น https และมี `{z}` `{x}` `{y}`) | ใช้ TomTom |

**สำคัญ:** tile จราจรถูกโหลดจากเบราว์เซอร์โดยตรง key ของ TomTom จึงมองเห็นได้โดยธรรมชาติ ให้จำกัด key ให้ใช้ได้เฉพาะโดเมนของเว็บในหน้า TomTom Developer Portal ส่วน key ของ GISTDA ไม่ถูกส่งถึงเบราว์เซอร์ เพิ่ม/แก้ตัวแปรแล้วต้อง Redeploy

## แหล่งข้อมูลและความหมาย

- **จุดน้ำล้นตลิ่ง/ใกล้ตลิ่ง**: ใช้ `storage_percent` ที่ ThaiWater คำนวณเอง (เกิน 100% = ล้นตลิ่ง, เกิน 70% = น้ำมาก, ไม่เกิน 30% = น้ำน้อย ตามคำอธิบายสีบน thaiwater.net; ปรับได้ที่ `STORAGE_CLASSES` ใน `public/js/config.js`) ถ้าสถานีไม่มีค่านี้ จะเทียบระดับน้ำกับระดับตลิ่งต่ำสุด (`min_bank`) ที่หน่วยงานเผยแพร่ ถ้าไม่มีทั้งคู่จะแสดง "ไม่มีเกณฑ์ตลิ่ง" ค่าตรวจวัดที่เก่ากว่า 6 ชั่วโมงจะไม่ถูกจัดว่าล้นตลิ่ง จุดบนแผนที่คือที่ตั้งสถานี ไม่ใช่แนวตลิ่งทั้งเส้น
- **พื้นที่น้ำท่วม**: ภาพเรดาร์ดาวเทียมของ GISTDA (WMS) ช้ากว่าเหตุการณ์จริงประมาณ 1–3 วัน และอาจไม่เห็นน้ำท่วมขังระยะสั้น tile ถูก cache ที่ CDN 1 ชั่วโมง
- **ถนนน้ำท่วม**: `/api/road-flood` อ่าน `public/flood_road` ของ ThaiWater ความลึกแสดงเฉพาะเมื่อชื่อฟิลด์ระบุหน่วย (`_cm`/`_m`) ถ้าต้นทางเปลี่ยนรูปแบบจนอ่านไม่ได้ จะขึ้นคำเตือนแทนการบอกว่า "ไม่มีน้ำท่วม" และ log `road_flood_unrecognized`
- **การจราจร**: สีตามความเร็วปัจจุบันเทียบความเร็วปกติของถนน (TomTom `relative0`) รีเฟรชทุก 2 นาทีขณะเปิดชั้นข้อมูล

- `/api/water` อ่านค่าล่าสุดจาก public endpoint ของ ThaiWater: `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` ตอบ JSON ที่มีสถานี พิกัด ค่าระดับน้ำ และเวลา **เมื่อ upstream ส่งมาและ parser รองรับ**. Cache ที่ CDN 60 วินาที; หน้าเว็บขอใหม่ทุก 2 นาทีเมื่อเปิดอยู่
- ค่าที่แสดงเป็นเมตรอ้างอิงระดับทะเลปานกลางเมื่อใช้ฟิลด์ `waterlevel_msl`; อย่านำไปเทียบความลึกน้ำบนถนน
- เวลา “ดึงข้อมูล” แยกจากเวลา “ตรวจวัด” หากไม่มีเวลา แอปจะแสดงว่าไม่ทราบเวลา หากเก่ากว่า 6 ชั่วโมง แอปจะแจ้งข้อมูลเก่า
- หมุดกล้อง 6 จุดของสำนักการระบายน้ำ กทม. ใช้พิกัดและ URL ภาพที่หน่วยงานเผยแพร่ใน `https://dds.bangkok.go.th/cctv.php` กดหมุดดูภาพ JPEG ที่รีโหลดทุก 10 วินาทีขณะเปิด popup ภาพนี้ไม่ใช่วิดีโอ และความสดขึ้นกับต้นทาง หากภาพไม่ขึ้นมีลิงก์เปิดเว็บไซต์หน่วยงาน
- กล้องระดับน้ำท่าน้ำสะพานแดงของเทศบาลนครรังสิตแสดงภาพ snapshot ที่อัปเดตราวทุก 2 นาที หมุดเป็นพิกัดพื้นที่โดยประมาณ
- หมุดอีก 2 จุดเป็นทางเข้า **ศูนย์กล้องในพื้นที่** (รังสิตและกรมชลประทานลุ่มน้ำเจ้าพระยา) ติดป้ายชัดว่าไม่ใช่พิกัดติดตั้งกล้องรายตัว กล้องของกรมชลประทานแจ้งว่ารองรับ Firefox เท่านั้น
- สถานีวัดน้ำแสดงผ่าน Canvas ของ Leaflet เพื่อให้เลื่อนและซูมได้ลื่นกว่า 800+ DOM markers; ตอน refresh จะอัปเดต marker เดิมแทนการสร้างใหม่ และสร้าง popup เมื่อเปิดเท่านั้น ข้อมูลล่าสุดที่โหลดสำเร็จเก็บไว้ในอุปกรณ์ไม่เกิน 24 ชั่วโมง; เมื่อ API ขัดข้องจะแสดงข้อความว่าเป็นข้อมูลครั้งก่อนพร้อมเวลา
- หมุดบ้านอยู่ใน `localStorage` ของอุปกรณ์นั้น ไม่ส่งไปเซิร์ฟเวอร์; GPS ใช้หลังผู้ใช้กดอนุญาต

## Production

- **Security headers** (`vercel.json`): `X-Frame-Options: DENY`, `Permissions-Policy` (อนุญาตเฉพาะ geolocation), `nosniff`, `Referrer-Policy` และ CSP ในโหมด `Report-Only` ทดสอบแบบบังคับใช้กับ Chromium แล้ว แต่ยังไม่ได้ยืนยันกับ OpenFreeMap และกล้องจริง ให้เปิด DevTools บน production ถ้าไม่มี CSP violation ใน console จึงเปลี่ยน key เป็น `Content-Security-Policy`
- **ความทนทานของ API**: `/api/water` จำ feed ที่ดึงสำเร็จล่าสุดไว้ใน instance (ไม่เกิน 6 ชั่วโมง) ถ้า ThaiWater ล่มจะตอบข้อมูลนั้นพร้อม `stale: true` และหน้าเว็บจะแจ้งผู้ใช้ ความผิดพลาดของต้นทางถูก log เป็น JSON (`water_upstream_failed`) ดูได้ใน Vercel Runtime Logs
- **Security headers** อนุญาตรูปจาก `api.tomtom.com` แล้ว
- **CDN**: MapLibre ล็อกเวอร์ชันและตรวจ SRI; Leaflet มาจาก cdnjs หากโหลดไม่ได้ หน้ายังแสดงรายการสถานีได้

## ขอบเขต MVP และขั้นต่อไป

กล้องรายตัวของหน่วยงานอื่นต้องเชื่อม feed ที่เผยแพร่พิกัดและภาพให้ครบก่อน การแจ้งเตือนขณะปิดแอป (เช่น "สถานีใกล้บ้านล้นตลิ่ง") ต้องมีบริการ push และงานตั้งเวลาเพิ่มเติม

ถ้า ThaiWater เปลี่ยนรูปแบบข้อมูล upstream ให้แก้ `lib/water.js` และทดสอบกับ payload จริงจาก `/api/water` บน Vercel โดยเก็บตัวอย่างที่ตัดข้อมูลส่วนบุคคลแล้วเป็น fixture ทดสอบ
