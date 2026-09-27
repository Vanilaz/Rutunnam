import { FETCH_TIMEOUT_MS, WATER_API_URL } from "./config.js";
import { validStations } from "./utils.js";

/** @typedef {{ stations: import("./types.js").Station[], fetchedAt: string, warning: string | null }} StationFeed */

/**
 * Fetch the station feed. Throws an Error whose message is Thai and safe to show to users.
 * @returns {Promise<StationFeed>}
 */
export async function fetchStations() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(WATER_API_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
    let data = null;
    try { data = await response.json(); } catch (_) { /* The platform can answer with an HTML error page. */ }
    const stations = validStations(data?.stations);
    if (!response.ok || !stations.length) throw new Error(data?.error || `แหล่งข้อมูลไม่พร้อมใช้งาน (HTTP ${response.status})`);
    // `warning` is set when the server answered from its last good copy because ThaiWater is down.
    return { stations, fetchedAt: data.fetchedAt || new Date().toISOString(), warning: data.stale ? (data.warning || "ต้นทางขัดข้อง") : null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("แหล่งข้อมูลตอบช้าเกินไป กรุณาลองใหม่");
    if (error instanceof TypeError) throw new Error("เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
