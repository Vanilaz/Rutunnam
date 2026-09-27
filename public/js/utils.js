// Pure helpers: no DOM, no Leaflet, so they run under `node --test` as well.
import { STALE_READING_MS } from "./config.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").StationDistance} StationDistance */
/** @typedef {import("./types.js").LatLngTuple} LatLngTuple */

/** @type {Record<string, string>} */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** @param {unknown} value */
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const TIMEZONE = "Asia/Bangkok";
const shortTime = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const clockTime = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
export const longDate = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** @param {unknown} value */
const toTime = (value) => typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : NaN;

/** @param {unknown} value */
export function fmtTime(value) {
  const time = toTime(value);
  return Number.isNaN(time) ? "ไม่มีเวลาตรวจวัด" : shortTime.format(time);
}

/** @param {unknown} value @param {number} [now] */
export function age(value, now = Date.now()) {
  const time = toTime(value);
  return Number.isNaN(time) ? Infinity : now - time;
}

/** @param {Pick<Station, "measuredAt">} station @param {number} [now] */
export const isFresh = (station, now = Date.now()) => age(station.measuredAt, now) < STALE_READING_MS;
/** @param {Pick<Station, "level">} station */
export const levelText = ({ level }) => typeof level === "number" && Number.isFinite(level) ? level.toFixed(2) : "—";
/** @param {number} n */
export const formatCount = (n) => n.toLocaleString("th-TH");

const EARTH_DIAMETER_KM = 12742;
/** Great-circle distance. @param {LatLngTuple} a @param {LatLngTuple} b */
export function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return EARTH_DIAMETER_KM * Math.asin(Math.sqrt(h));
}

/** @param {unknown} n @returns {number | null} */
const finiteOrNull = (n) => typeof n === "number" && Number.isFinite(n) ? n : null;

/**
 * @param {unknown} list
 * @returns {import("./types.js").RoadFlood[]}
 */
export function validRoadFloods(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r === "object" && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => ({
      id: String(r.id ?? `${r.lat},${r.lng}`),
      lat: r.lat,
      lng: r.lng,
      name: typeof r.name === "string" && r.name ? r.name : "จุดรายงานถนนน้ำท่วม",
      province: typeof r.province === "string" ? r.province : "",
      depthCm: finiteOrNull(r.depthCm),
      reportedAt: typeof r.reportedAt === "string" ? r.reportedAt : null
    }));
}

/** @param {unknown} url @returns {string | null} */
const httpsOrNull = (url) => typeof url === "string" && url.startsWith("https://") ? url : null;

/**
 * @param {unknown} list
 * @returns {import("./types.js").TrafficCamera[]}
 */
export function validTrafficCameras(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c === "object" && typeof c.id === "string" && Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map((c) => ({
      id: c.id,
      name: typeof c.name === "string" && c.name ? c.name : "กล้องจราจร",
      org: typeof c.org === "string" ? c.org : "",
      lat: c.lat,
      lng: c.lng,
      image: httpsOrNull(c.image),
      hls: httpsOrNull(c.hls)
    }))
    .filter((c) => c.image || c.hls);
}

/** @param {unknown} value @returns {string | null} */
const stringOrNull = (value) => typeof value === "string" && value ? value : null;

/**
 * @param {unknown} list
 * @returns {import("./types.js").WaterGate[]}
 */
export function validWaterGates(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((g) => g && typeof g === "object" && g.id !== undefined && Number.isFinite(g.lat) && Number.isFinite(g.lng))
    .map((g) => ({
      id: String(g.id), name: typeof g.name === "string" && g.name ? g.name : "ประตูระบายน้ำ",
      province: typeof g.province === "string" ? g.province : "", agency: typeof g.agency === "string" ? g.agency : "",
      lat: g.lat, lng: g.lng, upstream: finiteOrNull(g.upstream), downstream: finiteOrNull(g.downstream),
      pumpsOn: finiteOrNull(g.pumpsOn), gatesOpen: finiteOrNull(g.gatesOpen), measuredAt: stringOrNull(g.measuredAt)
    }));
}

/**
 * @param {unknown} list
 * @returns {import("./types.js").Dam[]}
 */
export function validDams(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && typeof d === "object" && d.id !== undefined && Number.isFinite(d.lat) && Number.isFinite(d.lng))
    .map((d) => ({
      id: String(d.id), name: typeof d.name === "string" && d.name ? d.name : "อ่างเก็บน้ำ",
      size: d.size === "large" ? "large" : "medium",
      province: typeof d.province === "string" ? d.province : "", agency: typeof d.agency === "string" ? d.agency : "",
      lat: d.lat, lng: d.lng, storage: finiteOrNull(d.storage), normalStorage: finiteOrNull(d.normalStorage),
      percent: finiteOrNull(d.percent), inflow: finiteOrNull(d.inflow), released: finiteOrNull(d.released),
      date: typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null
    }));
}

const clockWithSeconds = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
/** "11:28:45", or "--:--" when unknown. @param {unknown} value */
export function fmtClock(value) {
  const time = toTime(value);
  return Number.isNaN(time) ? "--:--" : clockWithSeconds.format(time);
}

/** @param {LatLngTuple} from @param {number} radiusKm @param {{ lat: number, lng: number }} point */
export const withinKm = (from, radiusKm, point) => distanceKm(from, [point.lat, point.lng]) <= radiusKm;

// Leaflet throws on NaN coordinates, so anything from storage or the network is checked first.
/** @param {unknown} list @returns {Station[]} */
export function validStations(list) {
  if (!Array.isArray(list)) return [];
  /** @type {Station[]} */
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object" || s.id === undefined || s.id === null || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    out.push({
      ...s,
      id: String(s.id),
      name: typeof s.name === "string" ? s.name : `สถานี ${s.id}`,
      level: finiteOrNull(s.level),
      bank: finiteOrNull(s.bank),
      storagePercent: finiteOrNull(s.storagePercent),
      criticalLevel: finiteOrNull(s.criticalLevel),
      measuredAt: typeof s.measuredAt === "string" ? s.measuredAt : null
    });
  }
  return out;
}

// Distance is computed once per station instead of inside the sort comparator.
/** @param {Station[]} stations @param {LatLngTuple} from @returns {StationDistance[]} */
export function byDistance(stations, from) {
  return stations
    .map((station) => ({ station, distance: distanceKm(from, [station.lat, station.lng]) }))
    .sort((a, b) => a.distance - b.distance);
}

/** @param {Station[]} stations @param {LatLngTuple} from @param {number} limit */
export const nearestStations = (stations, from, limit) => byDistance(stations, from).slice(0, limit);

/** @param {Station[]} stations @param {string} rawQuery @param {LatLngTuple} from @returns {Station[]} */
export function searchStations(stations, rawQuery, from) {
  const query = rawQuery.trim().toLocaleLowerCase("th");
  if (!query) return [];
  const matches = stations.filter((s) => `${s.name} ${s.province ?? ""} ${s.river ?? ""}`.toLocaleLowerCase("th").includes(query));
  return byDistance(matches, from).map((item) => item.station);
}
