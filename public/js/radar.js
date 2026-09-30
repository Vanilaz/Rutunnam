// Parse the RainViewer frame index into the newest radar tile URL. No DOM, no Leaflet.
import { RAIN_RADAR } from "./config.js";

/** @typedef {{ tileUrl: string, time: number }} RadarFrame  time in ms since epoch */

const SAFE_PATH = /^\/[\w/.-]+$/;

/**
 * @param {unknown} payload  body of RAIN_RADAR.indexUrl
 * @returns {RadarFrame | null} null when the index has no usable frame (never a guessed URL)
 */
export function latestRadarFrame(payload) {
  if (!payload || typeof payload !== "object") return null;
  const { host, radar } = /** @type {{ host?: unknown, radar?: { past?: unknown } }} */ (payload);
  if (typeof host !== "string") return null;
  let origin;
  try {
    const url = new URL(host);
    if (url.protocol !== "https:") return null;
    origin = url.origin;
  } catch (_) {
    return null;
  }
  const past = Array.isArray(radar?.past) ? radar.past : [];
  const frames = past
    .filter((frame) => frame && typeof frame.path === "string" && SAFE_PATH.test(frame.path) && Number.isFinite(frame.time))
    .sort((a, b) => b.time - a.time);
  const newest = frames[0];
  if (!newest) return null;
  const { tileSize, colorScheme, smoothAndSnow } = RAIN_RADAR;
  return { tileUrl: `${origin}${newest.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smoothAndSnow}.png`, time: newest.time * 1000 };
}
