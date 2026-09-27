// HTML string builders. Every dynamic value goes through escapeHtml.
import { DEFAULT_CAMERA_REFRESH_MS, NEARBY_RADIUS_KM, THAIWATER_URL } from "./config.js";
import { formatMargin, RISK_STYLES, stationRisk } from "./risk.js";
import { DAM_STYLES, gateDifference } from "./reservoir.js";
import { escapeHtml as esc, fmtTime, isFresh, levelText } from "./utils.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").Camera} Camera */
/** @typedef {import("./types.js").StationDistance} StationDistance */
/** @typedef {import("./types.js").StationRisk} StationRisk */
/** @typedef {import("./types.js").RoadFlood} RoadFlood */
/** @typedef {import("./types.js").LayerConfig} LayerConfig */
/** @typedef {import("./types.js").WaterGate} WaterGate */
/** @typedef {import("./types.js").Dam} Dam */
/** @typedef {import("./types.js").DamStatus} DamStatus */

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
    : camera.hls
      ? `<div class="camera-preview"><video class="water-live-video" controls muted autoplay playsinline aria-label="ภาพสด ${esc(camera.name)}"></video><span class="camera-error" hidden>วิดีโอไม่พร้อมใช้งาน เปิดเว็บไซต์ต้นทางเพื่อตรวจสอบ</span></div><small>ภาพสดจากเทศบาลนครนนทบุรี · เริ่มเล่นเมื่อเปิดหมุด</small>`
    : `<p>${esc(camera.note)}<br><small>หมุดนี้แทนพื้นที่ของศูนย์กล้อง ไม่ใช่พิกัดกล้องรายตัว</small></p>`;
  const kind = camera.directory ? "ศูนย์กล้อง" : esc(camera.source || "กล้องดูระดับน้ำ กทม.");
  return `<div class="camera-popup"><strong>${esc(camera.name)}</strong><small>${esc(camera.area)} · ${kind}</small>${preview}${camera.hls ? '<button class="link-button camera-fullscreen" type="button">ขยายภาพสด</button>' : ""}${external(camera.url, "เปิดเว็บไซต์ต้นทาง ↗", "")}</div>`;
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
 *   nearby: { overflow: number, high: number, roads: number | null }, hasStations: boolean, riskOnly: boolean, nearest?: StationDistance[],
 *   error?: string | null, fetchedAt?: string | null }} view
 */
export function riskTabHtml({ items, total, nearby, hasStations, riskOnly, nearest = [], error = null, fetchedAt = null }) {
  // On phones this tab replaces the water-level tab, so it carries the same error and cache states.
  if (!hasStations) return waterTabHtml({ nearest: [], hasStations, error, fetchedAt });
  const warning = error ? `<div class="cache-warning">ข้อมูลใหม่ยังไม่พร้อม · แสดงข้อมูลที่ดึง ${esc(fmtTime(fetchedAt))}</div>` : "";
  const summary = `${warning}<div class="nearby-summary" aria-label="สรุปรอบจุดศูนย์กลาง ${NEARBY_RADIUS_KM} กม."><div><strong class="risk-text-overflow">${nearby.overflow}</strong><span>ล้นตลิ่ง</span></div><div><strong class="risk-text-high">${nearby.high}</strong><span>ใกล้ตลิ่ง</span></div><div><strong>${nearby.roads ?? "—"}</strong><span>ถนนน้ำท่วม</span></div></div><p class="subtle">ในรัศมี ${NEARBY_RADIUS_KM} กม. จากจุดศูนย์กลาง (บ้าน/ตำแหน่งฉัน/รังสิต)</p>`;
  const toggle = `<button class="link-button" data-action="toggle-risk-only" type="button">${riskOnly ? "แสดงทุกสถานีบนแผนที่" : "แสดงเฉพาะจุดเสี่ยงบนแผนที่"}</button>`;
  const nearestHtml = nearest.length ? `<div class="content-heading"><strong>สถานีวัดน้ำใกล้คุณ</strong><span>${nearest.length} สถานี</span></div>${nearest.map(stationCardHtml).join("")}` : "";
  if (!items.length) return `${summary}<div class="empty"><strong>ยังไม่พบสถานีที่น้ำล้นหรือใกล้ตลิ่ง</strong><p>ประเมินจากข้อมูลล่าสุดของ ThaiWater ที่มีเวลาตรวจวัดไม่เกิน 6 ชั่วโมง</p></div>${nearestHtml}`;
  const list = items.map(({ station: s, risk, distance }) => `<button type="button" class="station-card risk-card risk-edge-${risk.status}" data-station="${esc(s.id)}"><span class="row"><strong>${esc(s.name)}</strong><span class="distance">${distance.toFixed(1)} km</span></span><span class="meta">${esc(s.province || s.river || "ข้อมูลสถานี")}</span><span class="row">${riskBadge(risk)}<span class="value">${levelText(s)} <small>ม. รทก.</small></span></span><span class="time">${bankLine(risk)} · ${esc(fmtTime(s.measuredAt))}</span></button>`).join("");
  const more = total > items.length ? `<p class="subtle">แสดง ${items.length} จาก ${total} สถานี เรียงจากเสี่ยงมากไปน้อย</p>` : "";
  return `${summary}<div class="content-heading"><strong>จุดที่น้ำล้นหรือใกล้ตลิ่งทั่วประเทศ</strong><span>${total} สถานี</span></div>${toggle}${list}${more}${nearestHtml}<p class="subtle">เกณฑ์: ใช้ % ความจุลำน้ำที่ ThaiWater คำนวณ (เกิน 100% = ล้นตลิ่ง, เกิน 70% = น้ำมาก) หรือเทียบระดับน้ำกับระดับตลิ่งต่ำสุดที่เผยแพร่ ตำแหน่งบนแผนที่คือจุดตั้งสถานี ไม่ใช่แนวตลิ่งทั้งเส้น</p>`;
}

/**
 * A thumbnail card; the image URL goes in data-thumb and is loaded (with cache-busting) by the page.
 * @param {{ key: string, name: string, caption: string, image: string | null, video: boolean }} card
 */
function cameraCardHtml({ key, name, caption, image, video }) {
  const thumb = image
    ? `<span class="cam-thumb"><img data-thumb="${esc(image)}" alt=""></span>`
    : `<span class="cam-thumb cam-video" aria-hidden="true">▶</span>`;
  const badge = image ? `<span class="cam-badge">กำลังโหลด</span>` : `<span class="cam-badge is-live">วิดีโอสด</span>`;
  return `<button type="button" class="cam-card" data-viewer="${esc(key)}" aria-label="ดูกล้อง ${esc(name)}">${thumb}${badge}${video && image ? `<span class="cam-play" aria-hidden="true">▶</span>` : ""}<span class="cam-caption"><strong>${esc(name)}</strong><small>${esc(caption)}</small></span></button>`;
}

/**
 * @param {{ water: { camera: Readonly<Camera>, distance: number }[], directories: ReadonlyArray<Readonly<Camera>>,
 *   traffic: { camera: import("./types.js").TrafficCamera, distance: number }[] | null, trafficTotal: number,
 *   trafficError: string | null, hasMore: boolean, provinces?: string[], selectedProvince?: string, provinceTotal?: number, filteredTotal?: number }} view
 */
export function cameraTabHtml({ water, directories, traffic, trafficTotal, trafficError, hasMore, provinces = [], selectedProvince = "", provinceTotal = 0, filteredTotal = trafficTotal }) {
  const waterCards = water.map(({ camera, distance }) => cameraCardHtml({ key: `water:${camera.id}`, name: camera.name, caption: `${camera.source || "กทม."} · ${distance.toFixed(1)} km`, image: camera.image ?? null, video: Boolean(camera.hls) })).join("");
  let trafficHtml;
  if (trafficError) trafficHtml = `<div class="cache-warning">${esc(trafficError)}</div>`;
  else if (traffic === null) trafficHtml = `<p class="subtle">กำลังโหลดรายชื่อกล้องจราจร...</p>`;
  else if (!traffic.length) trafficHtml = `<p class="subtle">ยังไม่มีกล้องจราจรที่ส่งภาพได้จากฟีดต้นทาง</p>`;
  else trafficHtml = `<div class="cam-grid">${traffic.map(({ camera, distance }) => cameraCardHtml({ key: `traffic:${camera.id}`, name: camera.name, caption: `${camera.org || "กล้องจราจร"} · ${distance.toFixed(1)} km`, image: camera.image, video: Boolean(camera.hls) })).join("")}</div>`
    + (hasMore ? `<button type="button" class="link-button more-button" data-action="more-traffic-cameras">แสดงกล้องเพิ่ม</button>` : "");
  const links = directories.map((camera) => infoCard(esc(camera.name), `${esc(camera.area)} · ${esc(camera.note)}`, external(camera.url, "เปิดศูนย์กล้อง ↗"))).join("");
  const options = provinces.map((province) => `<option value="${esc(province)}"${selectedProvince === province ? " selected" : ""}>${esc(province)}</option>`).join("");
  return `<div class="camera-intro"><span class="section-kicker">CCTV EXPLORER</span><h3>มองเห็นสถานการณ์จริง</h3><p>เลือกกล้องดูน้ำหรือกล้องถนน เปิดภาพและดูตำแหน่งได้ทันที</p><div class="camera-stat"><strong>${water.length}</strong><span>กล้องดูน้ำ</span><strong>${trafficTotal}</strong><span>กล้องถนน · ${provinceTotal || "หลาย"} จังหวัด</span></div></div>`
    + `<div class="content-heading"><strong>กล้องดูระดับน้ำ</strong><span>${water.length} กล้อง</span></div><div class="cam-grid">${waterCards}</div>`
    + `<div class="content-heading"><strong>กล้องบนถนน</strong><span>${selectedProvince ? `${filteredTotal} กล้อง` : `${trafficTotal} กล้องทั่วประเทศ`}</span></div>`
    + `<label class="camera-filter-label" for="camera-province">เลือกจังหวัด</label><select id="camera-province" class="camera-province"><option value="">ทุกจังหวัดที่มีข้อมูล</option>${options}</select><p class="camera-coverage">${selectedProvince ? `กำลังดูกล้องใน${esc(selectedProvince)}` : `ฟีดเผยแพร่ภาพจาก ${provinceTotal || "หลาย"} จังหวัด`} · รายการกล้องเปลี่ยนตามต้นทาง</p>${trafficHtml}`
    + `<p class="subtle">กล้องถนนจาก iTIC / Longdo ภาพบางตัวอาจไม่พร้อม ข้อมูลที่ไม่มีสัญญาณจะแสดงสถานะชัดเจน</p>`
    + `<div class="content-heading"><strong>ศูนย์กล้องท้องถิ่นและหน่วยงานน้ำ</strong></div>${links}`;
}

/**
 * Red/orange strip under the header, e.g. "ใกล้คุณ: ล้นตลิ่ง · คลองเปรมประชากร".
 * @param {{ station: Station, risk: StationRisk, distance: number } | null} nearest
 * @returns {{ html: string, level: "overflow" | "high" } | null}
 */
export function alertBannerHtml(nearest) {
  if (!nearest) return null;
  const level = nearest.risk.status === "overflow" ? "overflow" : "high";
  const label = level === "overflow" ? "ล้นตลิ่ง" : "น้ำใกล้ตลิ่ง";
  const margin = nearest.risk.margin !== null && nearest.risk.margin > 0 ? ` (${formatMargin(nearest.risk.margin)})` : "";
  return { level, html: `<strong>ใกล้คุณ: ${label}</strong> · ${esc(nearest.station.name)}${margin} <small>${nearest.distance.toFixed(1)} km</small>` };
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

/** @param {number | null} n @param {number} [digits] */
const metres = (n, digits = 2) => n === null ? "—" : n.toFixed(digits);
/** Million m³: 2 decimals below 10, 1 below 100, whole numbers above. @param {number | null} n */
const volume = (n) => n === null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
/** "+0.93" / "−0.84" with a class for colour. @param {number | null} diff */
const diffHtml = (diff) => diff === null ? `<span class="gate-diff">—</span>` : `<span class="gate-diff ${diff > 0 ? "is-up" : "is-down"}">${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}</span>`;
/** @param {string | null} day YYYY-MM-DD */
const dayText = (day) => day ? fmtTime(`${day}T12:00:00+07:00`).replace(/\s*\d{2}:\d{2}$/, "") : "ไม่ทราบวันที่";

/** @param {WaterGate} g */
function gateExtras(g) {
  const parts = [];
  if (g.gatesOpen !== null) parts.push(`เปิดบาน ${g.gatesOpen}`);
  if (g.pumpsOn !== null) parts.push(`เครื่องสูบทำงาน ${g.pumpsOn}`);
  return parts.join(" · ");
}

/** @param {WaterGate} g */
export function waterGatePopupHtml(g) {
  const extras = gateExtras(g);
  return `<strong>${esc(g.name)}</strong><br><small>${esc([g.province, g.agency].filter(Boolean).join(" · ") || "ประตูระบายน้ำ")}</small><br>น้ำด้านรับ ${metres(g.upstream)} ม. · ด้านระบาย ${metres(g.downstream)} ม.<br>ต่างระดับ ${diffHtml(gateDifference(g))} ม.${extras ? `<br><small>${esc(extras)}</small>` : ""}<br><small>ตรวจวัด: ${esc(fmtTime(g.measuredAt))}${isFresh(g) ? "" : STALE_NOTE}</small><br>${external(THAIWATER_URL, "ดูที่มา ↗", "")}`;
}

/** @param {Dam} d @param {DamStatus} status */
export function damPopupHtml(d, status) {
  const pct = d.percent !== null ? `${d.percent.toFixed(0)}% ของความจุปกติ` : "ไม่มีข้อมูลปริมาณน้ำ";
  return `<strong>${esc(d.name)}</strong><br><small>${d.size === "large" ? "เขื่อน/อ่างขนาดใหญ่" : "อ่างขนาดกลาง"}${d.province ? ` · ${esc(d.province)}` : ""}</small><br><span class="dam-badge" style="--dam-color:${DAM_STYLES[status].color}">${DAM_STYLES[status].label}</span> ${pct}<br>ปริมาณน้ำ ${volume(d.storage)} / ${volume(d.normalStorage)} ล้าน ลบ.ม.<br>ไหลเข้า ${volume(d.inflow)} · ระบาย ${volume(d.released)} ล้าน ลบ.ม./วัน<br><small>ข้อมูลวันที่ ${esc(dayText(d.date))}</small><br>${external(THAIWATER_URL, "ดูที่มา ↗", "")}`;
}

/**
 * @param {{ gates: { gate: WaterGate, distance: number }[] | null, gateTotal: number, gateError: string | null, gateUnsupported: boolean,
 *   dams: { dam: Dam, status: DamStatus, distance: number }[] | null, damTotal: number, damCounts: { over: number, high: number },
 *   damError: string | null, damUnsupported: boolean }} view
 */
export function gatesTabHtml({ gates, gateTotal, gateError, gateUnsupported, dams, damTotal, damCounts, damError, damUnsupported }) {
  /** @param {string} what */
  const unreadable = (what) => `<div class="cache-warning">ต้นทางเปลี่ยนรูปแบบข้อมูล${what} แอปยังอ่านไม่ได้ (ไม่ได้แปลว่าไม่มีข้อมูล)</div>`;
  let gateHtml;
  if (gateError) gateHtml = `<div class="cache-warning">${esc(gateError)}</div>`;
  else if (gateUnsupported) gateHtml = unreadable("ประตูระบายน้ำ");
  else if (gates === null) gateHtml = `<p class="subtle">กำลังโหลดข้อมูลประตูระบายน้ำ...</p>`;
  else if (!gates.length) gateHtml = `<p class="subtle">ไม่มีข้อมูลประตูระบายน้ำจากต้นทางในขณะนี้</p>`;
  else gateHtml = gates.map(({ gate: g, distance }) => `<button type="button" class="station-card gate-card" data-gate="${esc(g.id)}"><span class="row"><strong>${esc(g.name)}</strong><span class="gate-value">${diffHtml(gateDifference(g))}<small>ต่างระดับ</small></span></span><span class="row meta"><span>น้ำด้านรับ <b>${metres(g.upstream)}</b> ม.</span><span>ด้านระบาย <b>${metres(g.downstream)}</b> ม.</span></span><span class="row time"><span>${esc(g.agency || g.province || "")}${gateExtras(g) ? ` · ${esc(gateExtras(g))}` : ""}</span><span>${distance.toFixed(1)} km · ${esc(fmtTime(g.measuredAt))}</span></span></button>`).join("");

  let damHtml;
  if (damError) damHtml = `<div class="cache-warning">${esc(damError)}</div>`;
  else if (damUnsupported) damHtml = unreadable("เขื่อน");
  else if (dams === null) damHtml = `<p class="subtle">กำลังโหลดข้อมูลเขื่อน...</p>`;
  else if (!dams.length) damHtml = `<p class="subtle">ไม่มีข้อมูลเขื่อนจากต้นทางในขณะนี้</p>`;
  else damHtml = dams.map(({ dam: d, status, distance }) => {
    const pct = d.percent !== null ? Math.max(0, Math.min(d.percent, 120)) : 0;
    return `<button type="button" class="station-card dam-card" data-dam="${esc(d.id)}" style="--dam-color:${DAM_STYLES[status].color}"><span class="row"><strong>${esc(d.name)}</strong><span class="dam-badge">${DAM_STYLES[status].label}</span></span><span class="meta">${d.size === "large" ? "ขนาดใหญ่" : "ขนาดกลาง"}${d.province ? ` · ${esc(d.province)}` : ""} · ${distance.toFixed(0)} km</span><span class="dam-bar" aria-hidden="true"><i style="width:${(pct / 1.2).toFixed(1)}%"></i></span><span class="row"><span class="value">${d.percent !== null ? `${d.percent.toFixed(0)}<small>%</small>` : "—"}</span><span class="dam-flow">ไหลเข้า ${volume(d.inflow)} · ระบาย <b>${volume(d.released)}</b><small>ล้าน ลบ.ม./วัน</small></span></span><span class="time">ปริมาณน้ำ ${volume(d.storage)} / ${volume(d.normalStorage)} ล้าน ลบ.ม. · ${esc(dayText(d.date))}</span></button>`;
  }).join("");

  const damSummary = dams && dams.length ? `<div class="nearby-summary"><div><strong class="risk-text-overflow">${damCounts.over}</strong><span>เกินความจุ</span></div><div><strong class="risk-text-high">${damCounts.high}</strong><span>น้ำมาก (&gt;80%)</span></div><div><strong>${damTotal}</strong><span>เขื่อน/อ่างทั้งหมด</span></div></div>` : "";
  return `<div class="content-heading"><strong>ประตูระบายน้ำ / สถานีสูบน้ำใกล้คุณ</strong><span>${gateTotal ? `${gateTotal} แห่ง` : ""}</span></div>${gateHtml}<p class="subtle">ระดับน้ำเป็นเมตร รทก. ต่างระดับ = ด้านรับ − ด้านระบาย ค่าบวกแปลว่าน้ำฝั่งรับสูงกว่า</p>`
    + `<div class="content-heading"><strong>เขื่อนและอ่างเก็บน้ำ</strong><span>เรียงขนาดใหญ่ก่อน</span></div>${damSummary}${damHtml}`
    + `<p class="subtle">% คิดจากความจุปกติ ใช้เกณฑ์กรมชลประทาน: เกิน 100% เกินความจุ, เกิน 80% น้ำมาก, ไม่เกิน 50% น้ำน้อย, ไม่เกิน 30% น้ำน้อยวิกฤต ข้อมูลรายงานวันละครั้ง ปริมาณน้ำไหลเข้า/ระบายเป็นล้าน ลบ.ม. ต่อวัน</p>`;
}
