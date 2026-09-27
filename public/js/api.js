import { CONFIG_API_URL, FETCH_TIMEOUT_MS, ROAD_FLOOD_API_URL, TRAFFIC_CAMERAS_API_URL, WATER_API_URL } from "./config.js";
import { validRoadFloods, validStations, validTrafficCameras } from "./utils.js";

/** @typedef {{ stations: import("./types.js").Station[], fetchedAt: string, warning: string | null }} StationFeed */
/** @typedef {import("./types.js").LayerConfig} LayerConfig */

/**
 * GET a same-origin JSON endpoint with a timeout.
 * Throws an Error whose message is Thai and safe to show to users.
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    let data = null;
    try { data = await response.json(); } catch (_) { /* The platform can answer with an HTML error page. */ }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("แหล่งข้อมูลตอบช้าเกินไป กรุณาลองใหม่");
    if (error instanceof TypeError) throw new Error("เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<StationFeed>} */
export async function fetchStations() {
  const { ok, status, data } = await getJson(WATER_API_URL);
  const stations = validStations(data?.stations);
  if (!ok || !stations.length) throw new Error(data?.error || `แหล่งข้อมูลไม่พร้อมใช้งาน (HTTP ${status})`);
  // `warning` is set when the server answered from its last good copy because ThaiWater is down.
  return { stations, fetchedAt: data.fetchedAt || new Date().toISOString(), warning: data.stale ? (data.warning || "ต้นทางขัดข้อง") : null };
}

/** @type {LayerConfig} */
export const NO_OPTIONAL_LAYERS = Object.freeze({ flood: { available: false }, traffic: { available: false }, roadFlood: { available: false } });

/**
 * Which optional layers the deployment has keys for. Falls back to "none" rather than failing the app.
 * @returns {Promise<LayerConfig>}
 */
export async function fetchLayerConfig() {
  try {
    const { ok, data } = await getJson(CONFIG_API_URL);
    if (!ok || !data || typeof data !== "object") return NO_OPTIONAL_LAYERS;
    const tileUrl = typeof data.traffic?.tileUrl === "string" && data.traffic.tileUrl.startsWith("https://") ? data.traffic.tileUrl : undefined;
    return {
      flood: { available: data.flood?.available === true, period: data.flood?.period, wmsUrl: data.flood?.wmsUrl },
      traffic: { available: data.traffic?.available === true && Boolean(tileUrl), tileUrl, attribution: data.traffic?.attribution },
      roadFlood: { available: data.roadFlood?.available === true, url: data.roadFlood?.url }
    };
  } catch (_) {
    return NO_OPTIONAL_LAYERS;
  }
}

/**
 * @returns {Promise<{ reports: import("./types.js").RoadFlood[], fetchedAt: string, unsupported: boolean }>}
 */
export async function fetchRoadFloods() {
  const { ok, status, data } = await getJson(ROAD_FLOOD_API_URL);
  if (!ok) throw new Error(data?.error || `รายงานถนนน้ำท่วมไม่พร้อมใช้งาน (HTTP ${status})`);
  return { reports: validRoadFloods(data?.reports), fetchedAt: data?.fetchedAt || new Date().toISOString(), unsupported: data?.status === "unsupported-format" };
}

/** @returns {Promise<import("./types.js").TrafficCamera[]>} */
export async function fetchTrafficCameras() {
  const { ok, status, data } = await getJson(TRAFFIC_CAMERAS_API_URL);
  if (!ok) throw new Error(data?.error || `รายชื่อกล้องจราจรไม่พร้อมใช้งาน (HTTP ${status})`);
  return validTrafficCameras(data?.cameras);
}
