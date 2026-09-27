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
 * @property {number | null} bank  Lowest bank level, m MSL.
 * @property {number | null} storagePercent  Water level as % of channel depth (ThaiWater's own calculation).
 * @property {number | null} criticalLevel  Critical level, m MSL, when the agency publishes one.
 * @property {string | null} measuredAt
 * @property {string} sourceUrl
 */
/** @typedef {Record<string, any>} Row A raw, loosely-shaped ThaiWater record. */

const { number, text, validTime, inThailand, rowsFrom, isRecord } = require("./parse");

const SOURCE_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";

/** @param {any} payload @returns {unknown[]} */
function rowsFromPayload(payload) {
  return rowsFrom(payload, ["waterlevel_data", "waterlevel", "tele_waterlevel", "station", "stations"]);
}

/** @param {unknown} input @returns {Station | null} */
function normalizeStation(input) {
  const row = /** @type {Row | null} */ (input);
  if (!isRecord(row)) return null;
  const station = isRecord(row.station) ? row.station : isRecord(row.tele_station) ? row.tele_station : {};
  const rawLat = row.station_lat ?? row.tele_station_lat ?? row.latitude ?? row.lat ?? station.tele_station_lat ?? station.station_lat ?? station.lat;
  const rawLng = row.station_long ?? row.station_lon ?? row.tele_station_long ?? row.longitude ?? row.lng ?? row.lon ?? station.tele_station_long ?? station.station_long ?? station.lng;
  const lat = number(rawLat);
  const lng = number(rawLng);
  if (lat === null || lng === null || !inThailand(lat, lng)) return null;
  const id = String(row.tele_station_id ?? row.station_id ?? row.station_code ?? station.id ?? row.id ?? `${lat},${lng}`);
  const level = number(row.waterlevel_msl ?? row.waterlevel_m ?? row.waterlevel ?? row.level);
  const bank = number(row.bank_msl ?? row.bank_level_msl ?? row.bank_level ?? row.min_bank ?? station.min_bank);
  const storagePercent = number(row.storage_percent ?? row.waterlevel_percent);
  const criticalLevel = number(row.critical_level_msl ?? station.critical_level_msl);
  const date = validTime(row.waterlevel_datetime ?? row.waterlevel_date ?? row.waterlevel_time ?? row.datetime ?? row.measure_time ?? row.updated_at);
  return {
    id, lat, lng,
    name: text(row.tele_station_name) || text(row.station_name) || text(station.tele_station_name) || text(station.station_name) || `สถานี ${id}`,
    province: text(row.province_name) || text(row.province) || text(row.geocode?.province_name),
    river: text(row.river_name) || text(row.river),
    level, bank, storagePercent, criticalLevel, measuredAt: date,
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

module.exports = { SOURCE_URL, normalizePayload, normalizeStation, rowsFromPayload };
