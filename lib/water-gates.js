// @ts-check
// Adapter for ThaiWater water gates / pumping stations (public/watergate_load).
// Levels on both sides of the gate are metres above mean sea level (ม.รทก.).
const { number, text, validTime, inThailand, rowsFrom, isRecord } = require("./parse");

const WATER_GATE_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/watergate_load";

/**
 * @typedef {Object} WaterGate
 * @property {string} id
 * @property {string} name
 * @property {string} province
 * @property {string} agency
 * @property {number} lat
 * @property {number} lng
 * @property {number | null} upstream  Level on the intake side (ด้านรับ), m MSL.
 * @property {number | null} downstream  Level on the release side (ด้านระบาย), m MSL.
 * @property {number | null} pumpsOn  Pumps running, when the station reports it.
 * @property {number | null} gatesOpen  Gate leaves open, when reported.
 * @property {string | null} measuredAt
 */

/** @param {Record<string, any>} row @param {string[]} keys */
const pick = (row, keys) => { for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key]; return undefined; };

/** Booleans count as 0/1 here: they mean "pump on/off", unlike water levels. @param {unknown} value */
function count(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  return number(value);
}

/** @param {unknown} input @returns {WaterGate | null} */
function normalizeWaterGate(input) {
  if (!isRecord(input)) return null;
  const station = isRecord(input.station) ? input.station : isRecord(input.tele_station) ? input.tele_station : {};
  const lat = number(pick(station, ["tele_station_lat", "station_lat", "lat"]) ?? pick(input, ["tele_station_lat", "station_lat", "lat", "latitude"]));
  const lng = number(pick(station, ["tele_station_long", "station_long", "lng", "lon"]) ?? pick(input, ["tele_station_long", "station_long", "lng", "lon", "longitude"]));
  if (lat === null || lng === null || !inThailand(lat, lng)) return null;
  const upstream = number(pick(input, ["watergate_in", "watergate_upstream", "water_in"]));
  const downstream = number(pick(input, ["watergate_out", "watergate_downstream", "water_out"]));
  if (upstream === null && downstream === null) return null;
  const id = String(pick(station, ["id"]) ?? pick(input, ["tele_station_id", "station_id", "id"]) ?? `${lat},${lng}`);
  const agency = isRecord(input.agency) ? text(input.agency.agency_shortname) || text(input.agency.agency_name) : text(input.agency_name);
  return {
    id,
    name: text(station.tele_station_name) || text(station.station_name) || text(input.tele_station_name) || text(input.station_name) || `ประตูระบายน้ำ ${id}`,
    province: text(input.geocode?.province_name) || text(input.province_name),
    agency,
    lat, lng, upstream, downstream,
    pumpsOn: count(pick(input, ["pump_on", "pumps_on"])),
    gatesOpen: count(pick(input, ["floodgate_open", "gate_open"])),
    measuredAt: validTime(pick(input, ["watergate_datetime", "datetime", "watergate_date", "updated_at"]))
  };
}

/** @param {WaterGate} a @param {WaterGate} b */
const newer = (a, b) => (a.measuredAt ? Date.parse(a.measuredAt) : -Infinity) > (b.measuredAt ? Date.parse(b.measuredAt) : -Infinity);

/** @param {unknown} payload @returns {{ items: WaterGate[], upstreamRows: number }} */
function normalizeWaterGates(payload) {
  const rows = rowsFrom(payload, ["watergate_data", "watergate"]);
  /** @type {Map<string, WaterGate>} */
  const byId = new Map();
  for (const gate of rows.map(normalizeWaterGate)) {
    if (!gate) continue;
    const current = byId.get(gate.id);
    if (!current || newer(gate, current)) byId.set(gate.id, gate);
  }
  return { items: [...byId.values()], upstreamRows: rows.length };
}

module.exports = { WATER_GATE_URL, normalizeWaterGates, normalizeWaterGate };
