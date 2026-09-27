const SOURCE_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return value.th || value.en || value.name || "";
  return "";
}

function validTime(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowsFromPayload(payload) {
  const candidates = [payload?.data, payload?.result?.data, payload?.result, payload?.waterlevel, payload];
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

function normalizeStation(row) {
  const station = row.station || row.tele_station || {};
  const rawLat = row.station_lat ?? row.tele_station_lat ?? row.latitude ?? row.lat ?? station.station_lat ?? station.lat;
  const rawLng = row.station_long ?? row.station_lon ?? row.tele_station_long ?? row.longitude ?? row.lng ?? row.lon ?? station.station_long ?? station.lng;
  const lat = number(rawLat);
  const lng = number(rawLng);
  if (lat === null || lng === null || lat < 5 || lat > 21 || lng < 97 || lng > 106) return null;
  const id = String(row.tele_station_id ?? row.station_id ?? row.station_code ?? station.id ?? `${lat},${lng}`);
  const level = number(row.waterlevel_msl ?? row.waterlevel_m ?? row.waterlevel ?? row.level);
  const bank = number(row.bank_msl ?? row.bank_level_msl ?? row.bank_level);
  const date = validTime(row.waterlevel_datetime ?? row.waterlevel_date ?? row.waterlevel_time ?? row.datetime ?? row.measure_time ?? row.updated_at);
  return {
    id, lat, lng,
    name: text(row.tele_station_name) || text(row.station_name) || text(station.station_name) || `สถานี ${id}`,
    province: text(row.province_name) || text(row.province) || text(row.geocode?.province_name),
    river: text(row.river_name) || text(row.river),
    level, bank, measuredAt: date,
    sourceUrl: "https://www.thaiwater.net/"
  };
}

function normalizePayload(payload) {
  const rows = rowsFromPayload(payload);
  const stations = rows.map(normalizeStation).filter(Boolean);
  if (!rows.length || !stations.length) throw new Error("ไม่พบข้อมูลสถานีที่มีพิกัดในรูปแบบที่รองรับ");
  return stations;
}

module.exports = { SOURCE_URL, normalizePayload, normalizeStation, rowsFromPayload };
