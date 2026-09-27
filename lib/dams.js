// @ts-check
// Adapter for ThaiWater reservoir data (analyst/dam). The payload groups reservoirs by size
// (e.g. data.dam_medium); only large and medium reservoirs are kept to keep the map light.
const { number, text, inThailand, isRecord } = require("./parse");

const DAM_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/dam";
const PERCENT = 100;

/**
 * @typedef {"large" | "medium"} DamSize
 * @typedef {Object} Dam
 * @property {string} id
 * @property {string} name
 * @property {DamSize} size
 * @property {string} province
 * @property {string} agency
 * @property {number} lat
 * @property {number} lng
 * @property {number | null} storage  Current storage, million m³ (ล้าน ลบ.ม.).
 * @property {number | null} normalStorage  Normal (design) storage, million m³.
 * @property {number | null} percent  Storage as % of normal storage.
 * @property {number | null} inflow  Daily inflow, million m³.
 * @property {number | null} released  Daily release, million m³.
 * @property {string | null} date  Reporting day, YYYY-MM-DD (Thailand time).
 */

/** @param {string} key @returns {DamSize | null} */
function sizeOf(key) {
  if (/small/i.test(key)) return null;
  if (/medium/i.test(key)) return "medium";
  if (/large|daily|big/i.test(key)) return "large";
  return null;
}

/** @param {unknown} value @returns {string | null} */
function dayOf(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

/** @param {unknown} input @param {DamSize} size @returns {Dam | null} */
function normalizeDam(input, size) {
  if (!isRecord(input)) return null;
  const dam = isRecord(input.dam) ? input.dam : {};
  const lat = number(dam.dam_lat ?? input.dam_lat);
  const lng = number(dam.dam_long ?? dam.dam_lng ?? input.dam_long);
  if (lat === null || lng === null || !inThailand(lat, lng)) return null;
  const storage = number(input.dam_storage);
  const normalStorage = number(dam.normal_storage ?? input.normal_storage);
  const reported = number(input.dam_storage_percent);
  const percent = reported ?? (storage !== null && normalStorage !== null && normalStorage > 0 ? Number((storage / normalStorage * PERCENT).toFixed(2)) : null);
  const id = String(dam.id ?? input.dam_id ?? `${lat},${lng}`);
  const agency = isRecord(input.agency) ? text(input.agency.agency_shortname) || text(input.agency.agency_name) : "";
  return {
    id,
    name: text(dam.dam_name) || text(input.dam_name) || `อ่างเก็บน้ำ ${id}`,
    size,
    province: text(input.geocode?.province_name),
    agency,
    lat, lng, storage, normalStorage, percent,
    inflow: number(input.dam_inflow),
    released: number(input.dam_released),
    date: dayOf(input.dam_date)
  };
}

/** @param {unknown} payload @returns {{ items: Dam[], upstreamRows: number }} */
function normalizeDams(payload) {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  /** @type {Map<string, Dam>} */
  const byId = new Map();
  let upstreamRows = 0;
  for (const [key, rows] of Object.entries(data)) {
    const size = sizeOf(key);
    if (!size || !Array.isArray(rows)) continue;
    upstreamRows += rows.length;
    for (const row of rows) {
      const dam = normalizeDam(row, size);
      const current = dam && byId.get(dam.id);
      if (dam && (!current || (dam.date ?? "") > (current.date ?? ""))) byId.set(dam.id, dam);
    }
  }
  return { items: [...byId.values()], upstreamRows };
}

module.exports = { DAM_URL, normalizeDams, normalizeDam };
