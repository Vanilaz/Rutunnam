// @ts-check
// Nationwide traffic cameras from the public iTIC / Longdo Traffic camera feed.
// The feed mixes live cameras with placeholders and dead hosts, so only entries with a
// usable HTTPS still image or a known CORS-enabled HLS relay are kept.
const { number, inThailand, isRecord } = require("./parse");

const TRAFFIC_CAMERA_FEED_URL = "https://camera.longdo.com/feed/?command=json";
const COORDINATE_DECIMALS = 5;
// Still-image URLs seen in the feed that never return a real frame (placeholders,
// "camera not found" and "no signal" images, as reported by other projects in Sept 2026).
const DEAD_IMAGE_PATTERNS = [/X\.X\.X\.X/i, /YYYY/, /tempsus/i, /\/CAMPK/i, /61\.91\.182\.114/];
// HLS relays known to send CORS headers, which hls.js needs outside Safari.
const HLS_RELAY_HOSTS = new Set(["camera1.iticfoundation.org"]);

/**
 * @typedef {Object} TrafficCamera
 * @property {string} id
 * @property {string} name
 * @property {string} org
 * @property {number} lat
 * @property {number} lng
 * @property {string | null} image  HTTPS still image, refreshed by the client.
 * @property {string | null} hls  HTTPS HLS playlist for live video.
 */

/** @param {unknown} value @returns {URL | null} */
function httpsUrl(value) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try { return new URL(value); } catch (_) { return null; }
}

/** @param {unknown} value */
function stillImage(value) {
  const url = httpsUrl(value);
  return url && !DEAD_IMAGE_PATTERNS.some((pattern) => pattern.test(url.href)) ? url.href : null;
}

/** @param {unknown} value */
function hlsStream(value) {
  const url = httpsUrl(value);
  return url && HLS_RELAY_HOSTS.has(url.hostname) && /\.m3u8(\?|$)/i.test(url.pathname + url.search) ? url.href : null;
}

/** @param {number} n */
const round = (n) => Number(n.toFixed(COORDINATE_DECIMALS));

/** @param {unknown} value */
const cleanText = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/** @param {unknown} input @returns {TrafficCamera | null} */
function normalizeTrafficCamera(input) {
  if (!isRecord(input)) return null;
  const camid = cleanText(String(input.camid ?? input.id ?? ""));
  const lat = number(input.latitude ?? input.lat);
  const lng = number(input.longitude ?? input.lng ?? input.lon);
  if (!camid || lat === null || lng === null || !inThailand(lat, lng)) return null;
  const image = stillImage(input.imgurl);
  const hls = hlsStream(input.hls_url);
  if (!image && !hls) return null;
  return {
    id: `itic-${camid.replace(/[^\w.-]/g, "_")}`,
    name: cleanText(input.title) || camid,
    org: cleanText(input.organization),
    lat: round(lat),
    lng: round(lng),
    image,
    hls
  };
}

/** @param {unknown} payload @returns {{ cameras: TrafficCamera[], upstreamRows: number }} */
function normalizeTrafficCameras(payload) {
  const rows = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  /** @type {Map<string, TrafficCamera>} */
  const byId = new Map();
  for (const camera of rows.map(normalizeTrafficCamera)) {
    if (camera && !byId.has(camera.id)) byId.set(camera.id, camera);
  }
  return { cameras: [...byId.values()], upstreamRows: rows.length };
}

module.exports = { TRAFFIC_CAMERA_FEED_URL, normalizeTrafficCameras, normalizeTrafficCamera, HLS_RELAY_HOSTS };
