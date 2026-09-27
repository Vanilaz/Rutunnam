// @ts-check
// Adapter for ThaiWater's flooded-road reports (public/flood_road).
// The exact upstream schema is not documented, so fields are matched from a list of
// likely names. Depth is only reported when the field name states its unit.
const { number, text, validTime, inThailand, rowsFrom, isRecord } = require("./parse");

const ROAD_FLOOD_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/flood_road";
const CM_PER_M = 100;

/**
 * @typedef {Object} RoadFlood
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {string} name
 * @property {string} province
 * @property {number | null} depthCm  Null when the source does not state a unit.
 * @property {string | null} reportedAt
 */

/** @param {Record<string, any>} row @param {string[]} keys */
const pick = (row, keys) => { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key]; return undefined; };

/** @param {Record<string, any>} row @returns {number | null} */
function depthCm(row) {
  for (const [key, value] of Object.entries(row)) {
    const n = number(value);
    if (n === null || n < 0) continue;
    if (/(depth|level|flood).*_cm$/i.test(key)) return n;
    if (/(depth|level|flood).*_m$/i.test(key) && !/msl/i.test(key)) return Math.round(n * CM_PER_M);
  }
  return null;
}

/** @param {unknown} input @returns {RoadFlood | null} */
function normalizeRoadFlood(input) {
  if (!isRecord(input)) return null;
  const station = isRecord(input.station) ? input.station : {};
  const row = { ...station, ...input };
  const lat = number(pick(row, ["lat", "latitude", "station_lat", "flood_road_lat", "road_lat"]));
  const lng = number(pick(row, ["lng", "lon", "long", "longitude", "station_long", "station_lon", "flood_road_long", "road_long"]));
  if (lat === null || lng === null || !inThailand(lat, lng)) return null;
  const id = String(pick(row, ["id", "flood_road_id", "station_id", "road_id"]) ?? `${lat},${lng}`);
  return {
    id, lat, lng,
    name: text(pick(row, ["road_name", "flood_road_name", "station_name", "name", "location"])) || "จุดรายงานถนนน้ำท่วม",
    province: text(pick(row, ["province_name", "province"])) || text(row.geocode?.province_name),
    depthCm: depthCm(row),
    reportedAt: validTime(pick(row, ["datetime", "flood_datetime", "flood_road_datetime", "report_datetime", "updated_at", "date"]))
  };
}

/**
 * @param {unknown} payload
 * @returns {{ reports: RoadFlood[], upstreamRows: number, recognizedRows: number }}
 *   recognizedRows lets callers tell "no flooding" apart from "schema we cannot read".
 */
function normalizeRoadFloods(payload) {
  const rows = rowsFrom(payload, ["flood_road", "flood_road_data"]);
  /** @type {Map<string, RoadFlood>} */
  const byId = new Map();
  let recognizedRows = 0;
  for (const report of rows.map(normalizeRoadFlood)) {
    if (!report) continue;
    recognizedRows += 1;
    // A sensor reading 0 cm is not a flooded road.
    if (report.depthCm !== 0) byId.set(report.id, report);
  }
  return { reports: [...byId.values()], upstreamRows: rows.length, recognizedRows };
}

module.exports = { ROAD_FLOOD_URL, normalizeRoadFloods, normalizeRoadFlood };
