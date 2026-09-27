// @ts-check

/**
 * @typedef {Object} Station
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {string} name
 * @property {string} province
 * @property {string} river
 * @property {number | null} level
 * @property {number | null} bank
 * @property {string | null} measuredAt
 * @property {string} sourceUrl
 */
/** @typedef {Record<string, any>} Row A raw, loosely-shaped ThaiWater record. */

const SOURCE_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
// Rough bounding box of Thailand; rows outside it are treated as bad coordinates.
const THAILAND_BOUNDS = { minLat: 5, maxLat: 21, minLng: 97, maxLng: 106 };
const THAILAND_OFFSET = "+07:00";

/** @param {unknown} value @returns {number | null} */
function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Blank strings, booleans and objects must not coerce into a fake 0/1 reading.
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value @returns {string} */
function text(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = /** @type {Record<string, unknown>} */ (value);
    for (const key of ["th", "en", "name"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

/** @param {unknown} value @returns {string | null} ISO string in UTC */
function validTime(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  // ThaiWater's time without an offset is local Thailand time (UTC+07:00),
  // whether it uses a space ("2026-09-27 06:50") or ISO "T" separator.
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(trimmed);
  const normalized = match ? `${match[1]}T${match[2]}${THAILAND_OFFSET}` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** @param {any} payload @returns {unknown[]} */
function rowsFromPayload(payload) {
  const candidates = [payload?.waterlevel_data?.data, payload?.data, payload?.result?.data, payload?.result, payload?.waterlevel, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      for (const key of ["waterlevel", "waterlevel_data", "tele_waterlevel", "station", "stations", "data"]) {
        if (Array.isArray(candidate[key])) return candidate[key];
      }
    }
  }
  return [];
}

/** @param {number} lat @param {number} lng */
function inThailand(lat, lng) {
  return lat >= THAILAND_BOUNDS.minLat && lat <= THAILAND_BOUNDS.maxLat && lng >= THAILAND_BOUNDS.minLng && lng <= THAILAND_BOUNDS.maxLng;
}

/** @param {unknown} input @returns {Station | null} */
function normalizeStation(input) {
  const row = /** @type {Row | null} */ (input);
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const station = row.station && typeof row.station === "object" ? row.station
    : row.tele_station && typeof row.tele_station === "object" ? row.tele_station : {};
  const rawLat = row.station_lat ?? row.tele_station_lat ?? row.latitude ?? row.lat ?? station.tele_station_lat ?? station.station_lat ?? station.lat;
  const rawLng = row.station_long ?? row.station_lon ?? row.tele_station_long ?? row.longitude ?? row.lng ?? row.lon ?? station.tele_station_long ?? station.station_long ?? station.lng;
  const lat = number(rawLat);
  const lng = number(rawLng);
  if (lat === null || lng === null || !inThailand(lat, lng)) return null;
  const id = String(row.tele_station_id ?? row.station_id ?? row.station_code ?? station.id ?? row.id ?? `${lat},${lng}`);
  const level = number(row.waterlevel_msl ?? row.waterlevel_m ?? row.waterlevel ?? row.level);
  const bank = number(row.bank_msl ?? row.bank_level_msl ?? row.bank_level ?? station.min_bank);
  const date = validTime(row.waterlevel_datetime ?? row.waterlevel_date ?? row.waterlevel_time ?? row.datetime ?? row.measure_time ?? row.updated_at);
  return {
    id, lat, lng,
    name: text(row.tele_station_name) || text(row.station_name) || text(station.tele_station_name) || text(station.station_name) || `สถานี ${id}`,
    province: text(row.province_name) || text(row.province) || text(row.geocode?.province_name),
    river: text(row.river_name) || text(row.river),
    level, bank, measuredAt: date,
    sourceUrl: "https://www.thaiwater.net/"
  };
}

// Prefer the row that actually has a reading, then the most recent measurement.
/** @param {Station} candidate @param {Station} current */
function isBetterReading(candidate, current) {
  if ((candidate.level === null) !== (current.level === null)) return candidate.level !== null;
  const candidateTime = candidate.measuredAt ? Date.parse(candidate.measuredAt) : -Infinity;
  const currentTime = current.measuredAt ? Date.parse(current.measuredAt) : -Infinity;
  return candidateTime > currentTime;
}

/** @param {unknown} payload @returns {Station[]} */
function normalizePayload(payload) {
  const rows = rowsFromPayload(payload);
  // The client looks stations up by id, so each id must appear only once.
  /** @type {Map<string, Station>} */
  const byId = new Map();
  for (const station of rows.map(normalizeStation)) {
    if (!station) continue;
    const current = byId.get(station.id);
    if (!current || isBetterReading(station, current)) byId.set(station.id, station);
  }
  const stations = [...byId.values()];
  if (!stations.length) throw new Error("ไม่พบข้อมูลสถานีที่มีพิกัดในรูปแบบที่รองรับ");
  return stations;
}

module.exports = { SOURCE_URL, normalizePayload, normalizeStation, rowsFromPayload, validTime, number };
