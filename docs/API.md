# API reference

ทุก endpoint อยู่ใน `api/` (Vercel Functions, Node.js, CommonJS) รับเฉพาะ `GET` และ `HEAD` ถ้าเป็น method อื่นจะได้ `405` พร้อม header `Allow: GET, HEAD` error ทุกตัวเป็น JSON ที่มีข้อความภาษาไทยในฟิลด์ `error` ซึ่งแสดงให้ผู้ใช้เห็นได้โดยตรง

| Endpoint | ต้นทาง | CDN cache (success) | เมื่อต้นทางล่ม |
|---|---|---|---|
| `GET /api/water` | ThaiWater `waterlevel_load` | `s-maxage=60, stale-while-revalidate=60` | ใช้ข้อมูลสำเร็จล่าสุด ≤ 6 ชม. (`stale: true`) ถ้าไม่มีคืน `502` |
| `GET /api/road-flood` | ThaiWater `flood_road` | `s-maxage=120, stale-while-revalidate=300` | `502` |
| `GET /api/traffic-cameras` | iTIC / Longdo camera feed | `s-maxage=1800, stale-while-revalidate=86400` | ใช้ข้อมูลสำเร็จล่าสุด ≤ 24 ชม. (`stale: true`) ถ้าไม่มีคืน `502` |
| `GET /api/flood-wms` | GISTDA flood WMS | `s-maxage=3600, stale-while-revalidate=86400` | `502` (ไม่ cache) |
| `GET /api/config` | environment variables | `s-maxage=300` | – |
| `GET /api/flood` | – (ข้อมูลอ้างอิงแบบคงที่) | `s-maxage=300` | – |

"ข้อมูลสำเร็จล่าสุด" คือข้อมูลที่เก็บไว้ในหน่วยความจำของ function instance ที่ยังทำงานอยู่ ไม่ใช่ฐานข้อมูล จึงหายเมื่อ instance ถูก recycle

---

## `GET /api/water`

สถานีวัดระดับน้ำทั้งประเทศ

```json
{
  "stations": [
    {
      "id": "123",
      "lat": 13.99,
      "lng": 100.61,
      "name": "คลองเปรมประชากร หลักหก",
      "province": "ปทุมธานี",
      "river": "",
      "level": 1.78,
      "bank": 1.29,
      "storagePercent": 138,
      "criticalLevel": null,
      "measuredAt": "2026-09-27T04:10:00.000Z",
      "sourceUrl": "https://www.thaiwater.net/"
    }
  ],
  "fetchedAt": "2026-09-27T04:28:45.000Z",
  "source": "ThaiWater · คลังข้อมูลน้ำแห่งชาติ",
  "sourceUrl": "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load"
}
```

- `level`, `bank`, `criticalLevel` มีหน่วยเป็นเมตร รทก. และเป็น `null` เมื่อไม่ทราบค่า ค่าว่างหรือค่าที่ไม่ใช่ตัวเลขจะไม่ถูกแปลงเป็น 0
- `storagePercent` คือระดับน้ำคิดเป็น % ของความจุลำน้ำ ตามที่ ThaiWater คำนวณ
- `measuredAt` เป็น ISO 8601 (UTC) เวลาที่ต้นทางส่งมาโดยไม่มี timezone จะถูกตีความเป็นเวลาไทย (+07:00)
- แถวที่ไม่มีพิกัด หรือพิกัดอยู่นอกประเทศไทย จะถูกตัดทิ้ง ถ้ามี `id` ซ้ำ จะเก็บเฉพาะค่าที่วัดล่าสุด
- ตอนที่ต้นทางล่มแต่ยังมีข้อมูลชุดก่อน ผลลัพธ์จะเพิ่ม `"stale": true` และ `"warning"`
- log ที่เกี่ยวข้อง: `water_upstream_failed`

## `GET /api/road-flood`

รายงานถนนน้ำท่วม

```json
{
  "reports": [
    { "id": "r1", "lat": 13.99, "lng": 100.62, "name": "ถ.พหลโยธิน", "province": "ปทุมธานี", "depthCm": 25, "reportedAt": "2026-09-27T04:00:00.000Z" }
  ],
  "status": "ok",
  "fetchedAt": "2026-09-27T04:28:45.000Z",
  "source": "ThaiWater · ถนนน้ำท่วม",
  "sourceUrl": "https://www.thaiwater.net/"
}
```

- `depthCm` มีค่าเฉพาะเมื่อชื่อฟิลด์ของต้นทางระบุหน่วย (`*_cm` หรือ `*_m`) ถ้าไม่ระบุจะเป็น `null` จุดที่ความลึก 0 ซม. จะไม่ถูกนับเป็นถนนน้ำท่วม
- `status` เป็น `"unsupported-format"` เมื่อต้นทางส่งข้อมูลมา แต่อ่านรูปแบบไม่ได้เลยสักแถว หน้าเว็บจะขึ้นคำเตือนแทนการบอกว่า "ไม่มีน้ำท่วม" และบันทึก log `road_flood_unrecognized`

## `GET /api/traffic-cameras`

กล้องจราจรทั่วประเทศ

```json
{
  "cameras": [
    { "id": "itic-A1", "name": "แยกรังสิต", "org": "กรมทางหลวง", "lat": 13.99, "lng": 100.62, "image": "https://…/a1.jpg", "hls": null }
  ],
  "fetchedAt": "2026-09-27T04:28:45.000Z",
  "source": "iTIC · Longdo Traffic",
  "sourceUrl": "https://traffic.longdo.com/"
}
```

- `image` คือ URL ภาพนิ่ง HTTPS ส่วน `hls` คือ playlist วิดีโอสด เฉพาะจาก relay ที่เปิด CORS (`camera1.iticfoundation.org`) กล้องแต่ละตัวต้องมีอย่างน้อยหนึ่งอย่าง
- URL ที่เป็นค่าตัวอย่าง หรือเป็นกล้องที่รู้ว่าไม่มีสัญญาณ จะถูกตัดตาม `DEAD_IMAGE_PATTERNS` ใน `lib/traffic-cameras.js`
- log ที่เกี่ยวข้อง: `traffic_cameras_unrecognized`, `traffic_cameras_upstream_failed`

## `GET /api/flood-wms`

Proxy ของ GISTDA WMS `GetMap` สำหรับ Leaflet `L.tileLayer.wms` ต้องตั้ง `GISTDA_API_KEY` ก่อน

พารามิเตอร์ (ไม่สนตัวพิมพ์เล็ก/ใหญ่):

| พารามิเตอร์ | ค่าที่ยอมรับ |
|---|---|
| `srs` หรือ `crs` | `EPSG:3857`, `EPSG:4326` |
| `bbox` | ตัวเลข 4 ค่า `minX,minY,maxX,maxY` โดย min < max |
| `width`, `height` | จำนวนเต็ม 64–1024 |

พารามิเตอร์อื่น เช่น `layers` จะถูกละทิ้ง ระบบบังคับ `LAYERS=flood` และ `FORMAT=image/png` เสมอ proxy จึงใช้ดึงอย่างอื่นนอกจาก tile น้ำท่วมไม่ได้

| สถานะ | ความหมาย |
|---|---|
| `200` | `image/png` |
| `400` | พารามิเตอร์ไม่ถูกต้อง |
| `502` | ต้นทางล่ม หรือตอบ XML error (แม้จะเป็น HTTP 200) log `flood_wms_failed` โดยตัด key ออกแล้ว |
| `503` | ยังไม่ได้ตั้ง `GISTDA_API_KEY` |

## `GET /api/config`

บอกหน้าเว็บว่า deployment นี้มีชั้นข้อมูลเสริมอะไรบ้าง ไม่มี secret ฝั่ง server อยู่ในผลลัพธ์

```json
{
  "flood": { "available": true, "period": "7days", "wmsUrl": "/api/flood-wms" },
  "traffic": { "available": true, "tileUrl": "https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=…&tileSize=256", "attribution": "Traffic © TomTom" },
  "roadFlood": { "available": true, "url": "/api/road-flood" }
}
```

`traffic.tileUrl` มี key ของ TomTom อยู่ด้วย ซึ่งเป็นแบบนี้โดยตั้งใจ ดูหัวข้อ "Environment variables" ใน README

## `GET /api/flood`

endpoint เดิมที่ตอบข้อมูลอ้างอิงแบบคงที่ของ GISTDA (`features: []`, `status: "external-only"`) คงไว้เพื่อไม่ให้ client เก่าพัง ข้อมูลพื้นที่น้ำท่วมจริงให้ใช้ `/api/flood-wms`
