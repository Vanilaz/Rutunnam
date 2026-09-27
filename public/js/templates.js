// HTML string builders. Every dynamic value goes through escapeHtml.
import { DEFAULT_CAMERA_REFRESH_MS, NEARBY_RADIUS_KM, THAIWATER_URL } from "./config.js";
import { formatMargin, RISK_STYLES, stationRisk } from "./risk.js";
import { escapeHtml as esc, fmtTime, isFresh, levelText } from "./utils.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").Camera} Camera */
/** @typedef {import("./types.js").StationDistance} StationDistance */
/** @typedef {import("./types.js").StationRisk} StationRisk */
/** @typedef {import("./types.js").RoadFlood} RoadFlood */
/** @typedef {import("./types.js").LayerConfig} LayerConfig */

const STALE_NOTE = " · ข้อมูลเก่า/ไม่ทราบเวลา";
// Only http(s) links are rendered; anything else (e.g. "javascript:") falls back to the data source.
/** @param {unknown} href @returns {string} */
const safeUrl = (href) => typeof href === "string" && /^https?:\/\//i.test(href) ? href : THAIWATER_URL;
/** @param {unknown} href @param {string} label @param {string} [className] */
const external = (href, label, className = "link-button") => `<a${className ? ` class="${className}"` : ""} href="${esc(safeUrl(href))}" target="_blank" rel="noopener noreferrer">${label}</a>`;
/** Arguments are trusted HTML; escape before passing. @param {string} title @param {string} body @param {string} link */
const infoCard = (title, body, link) => `<div class="info-card"><strong>${title}</strong><p>${body}</p>${link}</div>`;

/** @param {StationRisk} risk */
const riskBadge = (risk) => `<span class="risk-badge risk-${risk.status}">${RISK_STYLES[risk.status].label}</span>`;

/** One line describing water vs bank, e.g. "104% ของตลิ่ง · สูงกว่าตลิ่ง +0.35 ม.". @param {StationRisk} risk */
function bankLine(risk) {
  const parts = [];
  if (risk.percent !== null) parts.push(`${Math.round(risk.percent)}% ของความจุลำน้ำ`);
  if (risk.margin !== null) parts.push(`${risk.margin > 0 ? "สูงกว่า" : "ต่ำกว่า"}ตลิ่ง ${formatMargin(risk.margin)}`);
  return parts.length ? parts.join(" · ") : "ไม่มีข้อมูลระดับตลิ่งของสถานีนี้";
}

/** @param {Station} s @param {StationRisk} [risk] */
export function stationPopupHtml(s, risk = stationRisk(s)) {
  const bank = Number.isFinite(s.bank) ? `<br><small>ตลิ่งต่ำสุด ${Number(s.bank).toFixed(2)} ม. รทก.</small>` : "";
  return `<strong>${esc(s.name)}</strong><br><small>${esc(s.province || "สถานีตรวจวัด")}</small><br>${riskBadge(risk)}<br>ระดับน้ำ ${levelText(s)} ม. รทก.${bank}<br><small>${bankLine(risk)}</small><br><small>ตรวจวัด: ${esc(fmtTime(s.measuredAt))}${isFresh(s) ? "" : STALE_NOTE}</small><br>${external(s.sourceUrl || THAIWATER_URL, "ดูที่มา ↗", "")}`;
}

/** @param {RoadFlood} r */
const depthText = (r) => r.depthCm !== null ? `น้ำลึกประมาณ ${r.depthCm} ซม.` : "ต้นทางไม่ระบุหน่วยความลึก";

/** @param {RoadFlood} r */
export function roadFloodPopupHtml(r) {
  return `<strong>${esc(r.name)}</strong><br><small>${esc(r.province || "ถนนน้ำท่วม")}</small><br>${depthText(r)}<br><small>รายงาน: ${esc(fmtTime(r.reportedAt))}</small><br>${external(THAIWATER_URL, "ดูที่มา ThaiWater ↗", "")}`;
}

/** @param {Readonly<Camera>} camera */
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

const ROAD_LINKS = infoCard("ทางหลวง · จุดที่สัญจรผ่านไม่ได้", "กรมทางหลวงรายงานสายทางที่ได้รับผลกระทบจากน้ำท่วม พร้อมจุดที่ผ่านไม่ได้", external("https://hdms.doh.go.th/", "ตรวจแผนที่ภัยพิบัติทางหลวง ↗"))
  + infoCard("กทม. · น้ำท่วมถนน", "ดูจุดวัดระดับน้ำท่วมถนนและเวลาอัปเดตของ กทม.", external("https://floodbangkok.bangkok.go.th/road-flood", "ตรวจถนนน้ำท่วม กทม. ↗"))
  + infoCard("สภาพจราจรทางหลวง", "ภาพกล้องและการจราจรจากกรมทางหลวง", external("https://highwaytraffic.go.th/", "ดูจราจร ↗"))
  + `<p class="subtle">สายด่วนกรมทางหลวง 1586 สำหรับสอบถามสภาพเส้นทางตลอด 24 ชั่วโมง</p>`;

const TRAFFIC_LEGEND = `<div class="legend-row"><span class="swatch" style="background:#35b24a"></span>คล่องตัว<span class="swatch" style="background:#f5c342"></span>ชะลอ<span class="swatch" style="background:#e9542f"></span>ติดขัด<span class="swatch" style="background:#8b1a1a"></span>หยุดนิ่ง</div>`;

/** @param {{ trafficAvailable: boolean, trafficOn: boolean, roadFloodCount: number | null }} view */
export function roadTabHtml({ trafficAvailable, trafficOn, roadFloodCount }) {
  const traffic = trafficAvailable
    ? `<div class="info-card"><strong>การจราจรสด</strong><p>สีบนถนนเทียบความเร็วปัจจุบันกับความเร็วปกติของถนนเส้นนั้น อัปเดตทุก 2 นาทีเมื่อเปิดชั้นข้อมูล</p>${TRAFFIC_LEGEND}<button class="link-button" data-action="toggle-traffic" type="button">${trafficOn ? "ซ่อนการจราจร" : "แสดงการจราจรบนแผนที่"}</button></div>`
    : `<div class="info-card"><strong>การจราจรสด</strong><p>ยังไม่ได้ตั้งค่า API key ของผู้ให้บริการข้อมูลจราจร (TOMTOM_API_KEY) บนเซิร์ฟเวอร์</p></div>`;
  const roads = roadFloodCount === null ? "" : `<p class="subtle">ถนนน้ำท่วมที่ ThaiWater รายงานตอนนี้: ${roadFloodCount} จุด (ดูในแท็บน้ำท่วม)</p>`;
  return `<div class="content-heading"><strong>ตรวจเส้นทางก่อนออกเดินทาง</strong></div><p class="subtle">ข้อมูลจราจรกับระดับน้ำไม่สามารถยืนยันว่ารถแต่ละคันผ่านได้ ตรวจประกาศปิดถนนและสภาพหน้างานก่อนเดินทาง</p>${traffic}${roads}${ROAD_LINKS}`;
}

const FLOOD_LINKS = infoCard("GISTDA · แผนที่น้ำท่วมจากดาวเทียม", "ดูขอบเขตที่ตรวจพบ พร้อมวันที่ของภาพแต่ละชุด ภาพดาวเทียมอาจไม่ใช่สภาพ ณ นาทีนี้", external("https://disaster.gistda.or.th/flood", "เปิดแผนที่ GISTDA ↗"))
  + infoCard("กทม. · น้ำท่วมถนน", "จุดตรวจวัดระดับน้ำบนถนนในเขตกรุงเทพมหานคร", external("https://floodbangkok.bangkok.go.th/road-flood", "เปิดข้อมูล กทม. ↗"));

/** @type {Record<string, string>} */
const FLOOD_PERIOD_TEXT = { "1day": "1 วัน", "3days": "3 วัน", "7days": "7 วัน" };

/**
 * @param {{ floodAvailable: boolean, floodOn: boolean, floodPeriod?: string, floodError: boolean,
 *   roads: { report: RoadFlood, distance: number }[] | null, roadError: string | null, roadUnsupported: boolean }} view
 */
export function floodTabHtml({ floodAvailable, floodOn, floodPeriod, floodError, roads, roadError, roadUnsupported }) {
  const period = FLOOD_PERIOD_TEXT[floodPeriod ?? ""] ?? "ล่าสุด";
  const satellite = !floodAvailable
    ? `<div class="empty"><strong>ยังไม่เปิดชั้นพื้นที่น้ำท่วมจากดาวเทียม</strong><p>ต้องตั้งค่า GISTDA_API_KEY บนเซิร์ฟเวอร์ก่อน ระหว่างนี้ตรวจจากเว็บไซต์ GISTDA ได้</p></div>`
    : floodError
      ? `<div class="cache-warning">โหลดภาพพื้นที่น้ำท่วมจาก GISTDA ไม่ได้ในขณะนี้ ลองใหม่ภายหลัง หรือเปิดเว็บไซต์ GISTDA</div>`
      : `<div class="info-card"><strong>พื้นที่น้ำท่วมจากดาวเทียม (${period})</strong><p>สีฟ้าบนแผนที่คือพื้นที่ที่ดาวเทียมเรดาร์ตรวจพบน้ำท่วมในช่วง ${period} ล่าสุด ข้อมูลช้ากว่าเหตุการณ์จริงประมาณ 1–3 วัน และอาจไม่ครอบคลุมน้ำท่วมขังระยะสั้น</p><div class="legend-row"><span class="swatch" style="background:#2f6fe0;opacity:.7"></span>พื้นที่ตรวจพบน้ำท่วม</div><button class="link-button" data-action="toggle-flood" type="button">${floodOn ? "ซ่อนพื้นที่น้ำท่วม" : "แสดงพื้นที่น้ำท่วมบนแผนที่"}</button></div>`;
  let roadHtml;
  if (roadError) roadHtml = `<div class="cache-warning">${esc(roadError)}</div>`;
  else if (roadUnsupported) roadHtml = `<div class="cache-warning">ต้นทางเปลี่ยนรูปแบบข้อมูลถนนน้ำท่วม แอปยังอ่านไม่ได้ จึงไม่ได้แสดงบนแผนที่ (ไม่ได้แปลว่าไม่มีน้ำท่วม)</div>`;
  else if (roads === null) roadHtml = `<p class="subtle">กำลังโหลดรายงานถนนน้ำท่วม...</p>`;
  else if (!roads.length) roadHtml = `<p class="subtle">ThaiWater ไม่มีรายงานถนนน้ำท่วมในขณะนี้</p>`;
  else roadHtml = `<div class="content-heading"><strong>ถนนน้ำท่วมที่รายงาน</strong><span>${roads.length} จุด</span></div>` + roads.map(({ report, distance }) => `<button type="button" class="station-card" data-road="${esc(report.id)}"><span class="row"><strong>${esc(report.name)}</strong><span class="distance">${distance.toFixed(1)} km</span></span><span class="meta">${esc(report.province || "ถนนน้ำท่วม")} · ${depthText(report)}</span><span class="time">รายงาน ${esc(fmtTime(report.reportedAt))}</span></button>`).join("");
  return `${satellite}${roadHtml}${FLOOD_LINKS}`;
}

/**
 * @param {{ items: { station: Station, risk: StationRisk, distance: number }[], total: number,
 *   nearby: { overflow: number, high: number, roads: number | null }, hasStations: boolean, riskOnly: boolean }} view
 */
export function riskTabHtml({ items, total, nearby, hasStations, riskOnly }) {
  if (!hasStations) return `<div class="empty"><strong>กำลังโหลดสถานี</strong><p>รอสักครู่เพื่อประเมินจุดเสี่ยงจากข้อมูลตรวจวัดล่าสุด</p></div>`;
  const summary = `<div class="nearby-summary" aria-label="สรุปรอบจุดศูนย์กลาง ${NEARBY_RADIUS_KM} กม."><div><strong class="risk-text-overflow">${nearby.overflow}</strong><span>ล้นตลิ่ง</span></div><div><strong class="risk-text-high">${nearby.high}</strong><span>ใกล้ตลิ่ง</span></div><div><strong>${nearby.roads ?? "—"}</strong><span>ถนนน้ำท่วม</span></div></div><p class="subtle">ในรัศมี ${NEARBY_RADIUS_KM} กม. จากจุดศูนย์กลาง (บ้าน/ตำแหน่งฉัน/รังสิต)</p>`;
  const toggle = `<button class="link-button" data-action="toggle-risk-only" type="button">${riskOnly ? "แสดงทุกสถานีบนแผนที่" : "แสดงเฉพาะจุดเสี่ยงบนแผนที่"}</button>`;
  if (!items.length) return `${summary}<div class="empty"><strong>ยังไม่พบสถานีที่น้ำล้นหรือใกล้ตลิ่ง</strong><p>ประเมินจากข้อมูลล่าสุดของ ThaiWater ที่มีเวลาตรวจวัดไม่เกิน 6 ชั่วโมง</p></div>`;
  const list = items.map(({ station: s, risk, distance }) => `<button type="button" class="station-card risk-card risk-edge-${risk.status}" data-station="${esc(s.id)}"><span class="row"><strong>${esc(s.name)}</strong><span class="distance">${distance.toFixed(1)} km</span></span><span class="meta">${esc(s.province || s.river || "ข้อมูลสถานี")}</span><span class="row">${riskBadge(risk)}<span class="value">${levelText(s)} <small>ม. รทก.</small></span></span><span class="time">${bankLine(risk)} · ${esc(fmtTime(s.measuredAt))}</span></button>`).join("");
  const more = total > items.length ? `<p class="subtle">แสดง ${items.length} จาก ${total} สถานี เรียงจากเสี่ยงมากไปน้อย</p>` : "";
  return `${summary}<div class="content-heading"><strong>จุดที่น้ำล้นหรือใกล้ตลิ่งทั่วประเทศ</strong><span>${total} สถานี</span></div>${toggle}${list}${more}<p class="subtle">เกณฑ์: ใช้ % ความจุลำน้ำที่ ThaiWater คำนวณ (เกิน 100% = ล้นตลิ่ง, เกิน 70% = น้ำมาก) หรือเทียบระดับน้ำกับระดับตลิ่งต่ำสุดที่เผยแพร่ ตำแหน่งบนแผนที่คือจุดตั้งสถานี ไม่ใช่แนวตลิ่งทั้งเส้น</p>`;
}

/** @param {ReadonlyArray<Readonly<Camera>>} cameras */
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

/** @param {StationDistance} item */
function stationCardHtml({ station: s, distance }) {
  return `<button type="button" class="station-card" data-station="${esc(s.id)}"><span class="row"><strong>${esc(s.name)}</strong><span class="distance">${distance.toFixed(1)} km</span></span><span class="meta">${esc(s.province || s.river || "ข้อมูลสถานี")}</span><span class="value">${levelText(s)} <small>เมตร รทก.</small></span><span class="time">ตรวจวัด ${esc(fmtTime(s.measuredAt))}${isFresh(s) ? "" : STALE_NOTE}</span></button>`;
}

/**
 * @param {{ nearest: StationDistance[], hasStations: boolean, error: string | null, fetchedAt: string | null }} view
 */
export function waterTabHtml({ nearest, hasStations, error, fetchedAt }) {
  if (!hasStations && error) return `<div class="empty"><strong>ยังโหลดสถานีไม่ได้</strong><p>${esc(error)}</p><button class="link-button" data-action="retry" type="button">ลองโหลดอีกครั้ง</button></div>`;
  if (!hasStations) return `<div class="empty"><strong>กำลังโหลดสถานี</strong><p>รอสักครู่เพื่อแสดงข้อมูลตรวจวัดล่าสุด</p></div>`;
  const warning = error ? `<div class="cache-warning">ข้อมูลใหม่ยังไม่พร้อม · แสดงข้อมูลที่ดึง ${esc(fmtTime(fetchedAt))}</div>` : "";
  return `${warning}<div class="content-heading"><strong>สถานีใกล้จุดศูนย์กลาง</strong><span>${nearest.length} สถานี</span></div>${nearest.map(stationCardHtml).join("")}<p class="subtle">ระดับน้ำอ้างอิงระดับทะเลปานกลาง (รทก.) ไม่ใช่ความลึกน้ำบนถนน และยังไม่ใช้สรุปว่าล้นตลิ่งจนกว่าจะมีเกณฑ์รายสถานี</p>`;
}
