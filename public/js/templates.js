// HTML string builders. Every dynamic value goes through escapeHtml.
import { DEFAULT_CAMERA_REFRESH_MS, THAIWATER_URL } from "./config.js";
import { escapeHtml as esc, fmtTime, isFresh, levelText } from "./utils.js";

const STALE_NOTE = " · ข้อมูลเก่า/ไม่ทราบเวลา";
// Only http(s) links are rendered; anything else (e.g. "javascript:") falls back to the data source.
const safeUrl = (href) => /^https?:\/\//i.test(String(href ?? "")) ? href : THAIWATER_URL;
const external = (href, label, className = "link-button") => `<a${className ? ` class="${className}"` : ""} href="${esc(safeUrl(href))}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const infoCard = (title, body, link) => `<div class="info-card"><strong>${title}</strong><p>${body}</p>${link}</div>`;

export function stationPopupHtml(s) {
  return `<strong>${esc(s.name)}</strong><br><small>${esc(s.province || "สถานีตรวจวัด")}</small><br>ระดับน้ำ ${levelText(s)} ม. รทก.<br><small>ตรวจวัด: ${esc(fmtTime(s.measuredAt))}${isFresh(s) ? "" : STALE_NOTE}</small><br>${external(s.sourceUrl || THAIWATER_URL, "ดูที่มา ↗", "")}`;
}

export function cameraPopupHtml(camera) {
  const refreshNote = camera.refreshMs
    ? "ภาพตัวอย่างต้นทางอัปเดตราวทุก 2 นาที · หมุดเป็นพิกัดพื้นที่โดยประมาณ"
    : `ภาพจากต้นทางอัปเดตทุก ${DEFAULT_CAMERA_REFRESH_MS / 1000} วินาทีเมื่อเปิดดู`;
  const preview = camera.image
    ? `<div class="camera-preview"><img alt="ภาพกล้อง ${esc(camera.name)}"><span class="camera-error" hidden>ภาพจากต้นทางไม่พร้อมใช้งาน</span></div><small>${refreshNote}</small>`
    : `<p>${esc(camera.note)}<br><small>หมุดนี้แทนพื้นที่ของศูนย์กล้อง ไม่ใช่พิกัดกล้องรายตัว</small></p>`;
  const kind = camera.directory ? "ศูนย์กล้อง" : esc(camera.source || "กล้องดูระดับน้ำ กทม.");
  return `<div class="camera-popup"><strong>${esc(camera.name)}</strong><small>${esc(camera.area)} · ${kind}</small>${preview}${external(camera.url, "เปิดเว็บไซต์ต้นทาง ↗", "")}</div>`;
}

export const ROAD_TAB_HTML = `<div class="content-heading"><strong>ตรวจเส้นทางก่อนออกเดินทาง</strong></div><p class="subtle">ข้อมูลจราจรกับระดับน้ำไม่สามารถยืนยันว่ารถแต่ละคันผ่านได้ ตรวจประกาศปิดถนนและสภาพหน้างานก่อนเดินทาง</p>`
  + infoCard("ทางหลวง · จุดที่สัญจรผ่านไม่ได้", "กรมทางหลวงรายงานสายทางที่ได้รับผลกระทบจากน้ำท่วม พร้อมจุดที่ผ่านไม่ได้", external("https://hdms.doh.go.th/", "ตรวจแผนที่ภัยพิบัติทางหลวง ↗"))
  + infoCard("กทม. · น้ำท่วมถนน", "ดูจุดวัดระดับน้ำท่วมถนนและเวลาอัปเดตของ กทม.", external("https://floodbangkok.bangkok.go.th/road-flood", "ตรวจถนนน้ำท่วม กทม. ↗"))
  + infoCard("สภาพจราจรทางหลวง", "ภาพกล้องและการจราจรจากกรมทางหลวง", external("https://highwaytraffic.go.th/", "ดูจราจร ↗"))
  + `<p class="subtle">สายด่วนกรมทางหลวง 1586 สำหรับสอบถามสภาพเส้นทางตลอด 24 ชั่วโมง</p>`;

export const FLOOD_TAB_HTML = `<div class="empty"><svg viewBox="0 0 24 24"><path d="m12 3 10 18H2zM12 9v5m0 3h.01"/></svg><strong>ขอบเขตน้ำท่วมต้องตรวจจากต้นทาง</strong><p>แผนที่นี้ยังไม่ได้รับชั้นข้อมูลพื้นที่ท่วมที่เชื่อมต่อได้โดยตรง จึงไม่วาดพื้นที่สมมติบนแผนที่</p></div>`
  + infoCard("GISTDA · แผนที่น้ำท่วมจากดาวเทียม", "ดูขอบเขตที่ตรวจพบ พร้อมวันที่ของภาพแต่ละชุด ภาพดาวเทียมอาจไม่ใช่สภาพ ณ นาทีนี้", external("https://disaster.gistda.or.th/flood", "เปิดแผนที่ GISTDA ↗"))
  + infoCard("กทม. · น้ำท่วมถนน", "จุดตรวจวัดระดับน้ำบนถนนในเขตกรุงเทพมหานคร", external("https://floodbangkok.bangkok.go.th/road-flood", "เปิดข้อมูล กทม. ↗"));

export function cameraTabHtml(cameras) {
  const images = cameras.filter((c) => !c.directory);
  const directories = cameras.filter((c) => c.directory);
  const bmaCount = images.filter((c) => !c.source).length;
  const cards = cameras.map((camera) => infoCard(
    esc(camera.name),
    `${esc(camera.area)} · ${camera.directory ? esc(camera.note) : `ภาพจาก${esc(camera.source || "กล้อง กทม.")}`}`,
    camera.directory
      ? external(camera.url, "เปิดศูนย์กล้อง ↗")
      : `<button class="link-button camera-open" data-camera="${esc(camera.id)}" type="button">ดูภาพบนแผนที่</button>`
  )).join("");
  return `<div class="content-heading"><strong>กล้องดูระดับน้ำ</strong><span>${images.length} กล้อง · ${directories.length} ศูนย์</span></div><p class="subtle">กล้อง กทม. ${bmaCount} จุด และกล้องระดับน้ำสะพานแดงของเทศบาลนครรังสิต กดเพื่อดูภาพบนแผนที่</p>${cards}<p class="subtle">ภาพเป็นชุด JPEG ที่ต้นทางอัปเดตเป็นระยะ ไม่ใช่วิดีโอสตรีม หากภาพไม่ขึ้นให้เปิดเว็บไซต์ต้นทาง</p>`;
}

function stationCardHtml({ station: s, distance }) {
  return `<button type="button" class="station-card" data-station="${esc(s.id)}"><span class="row"><strong>${esc(s.name)}</strong><span class="distance">${distance.toFixed(1)} km</span></span><span class="meta">${esc(s.province || s.river || "ข้อมูลสถานี")}</span><span class="value">${levelText(s)} <small>เมตร รทก.</small></span><span class="time">ตรวจวัด ${esc(fmtTime(s.measuredAt))}${isFresh(s) ? "" : STALE_NOTE}</span></button>`;
}

export function waterTabHtml({ nearest, hasStations, error, fetchedAt }) {
  if (!hasStations && error) return `<div class="empty"><strong>ยังโหลดสถานีไม่ได้</strong><p>${esc(error)}</p><button class="link-button" data-action="retry" type="button">ลองโหลดอีกครั้ง</button></div>`;
  if (!hasStations) return `<div class="empty"><strong>กำลังโหลดสถานี</strong><p>รอสักครู่เพื่อแสดงข้อมูลตรวจวัดล่าสุด</p></div>`;
  const warning = error ? `<div class="cache-warning">ข้อมูลใหม่ยังไม่พร้อม · แสดงข้อมูลที่ดึง ${esc(fmtTime(fetchedAt))}</div>` : "";
  return `${warning}<div class="content-heading"><strong>สถานีใกล้จุดศูนย์กลาง</strong><span>${nearest.length} สถานี</span></div>${nearest.map(stationCardHtml).join("")}<p class="subtle">ระดับน้ำอ้างอิงระดับทะเลปานกลาง (รทก.) ไม่ใช่ความลึกน้ำบนถนน และยังไม่ใช้สรุปว่าล้นตลิ่งจนกว่าจะมีเกณฑ์รายสถานี</p>`;
}
