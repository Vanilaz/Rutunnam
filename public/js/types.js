// Shared JSDoc types for the browser modules (checked by `npm run typecheck`).

/**
 * A water-level station as returned by /api/water.
 * @typedef {Object} Station
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {string} name
 * @property {string} [province]
 * @property {string} [river]
 * @property {number | null} level  Metres above mean sea level, or null when unknown.
 * @property {number | null} [bank]  Lowest bank level, m MSL.
 * @property {number | null} [storagePercent]  Level as % of channel depth, computed by ThaiWater.
 * @property {number | null} [criticalLevel]  m MSL.
 * @property {string | null} measuredAt  ISO timestamp from the source, or null.
 * @property {string} [sourceUrl]
 */

/**
 * @typedef {Object} Camera
 * @property {string} id
 * @property {string} name
 * @property {string} area
 * @property {number} lat
 * @property {number} lng
 * @property {string} url
 * @property {string} [image]  Snapshot URL for cameras with a live preview.
 * @property {number} [refreshMs]
 * @property {string} [source]
 * @property {string} [note]
 * @property {boolean} [directory]  True for "camera centre" pins that only link out.
 */

/**
 * A flooded-road report from /api/road-flood.
 * @typedef {Object} RoadFlood
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {string} name
 * @property {string} [province]
 * @property {number | null} depthCm  Null when the source does not state a unit.
 * @property {string | null} reportedAt
 */

/**
 * A traffic camera from /api/traffic-cameras (iTIC / Longdo feed).
 * @typedef {Object} TrafficCamera
 * @property {string} id
 * @property {string} name
 * @property {string} [org]
 * @property {number} lat
 * @property {number} lng
 * @property {string | null} image  HTTPS still image.
 * @property {string | null} hls  HTTPS HLS playlist for live video.
 */

/**
 * Anything the camera viewer can show.
 * @typedef {{ id: string, name: string, meta: string, lat: number, lng: number, image: string | null, hls: string | null, refreshMs: number, sourceUrl: string, sourceLabel: string }} ViewerCamera
 */

/** @typedef {"overflow" | "high" | "normal" | "belowBank" | "low" | "unknown" | "stale"} RiskStatus */
/** @typedef {{ status: RiskStatus, percent: number | null, margin: number | null }} StationRisk  margin = level - bank (m); positive means over the bank. */

/**
 * What /api/config says this deployment can show.
 * @typedef {Object} LayerConfig
 * @property {{ available: boolean, period?: string, wmsUrl?: string }} flood
 * @property {{ available: boolean, tileUrl?: string, attribution?: string }} traffic
 * @property {{ available: boolean, url?: string }} roadFlood
 */

/** @typedef {[number, number]} LatLngTuple */
/** @typedef {{ lat: number, lng: number }} Home */
/** @typedef {{ station: Station, distance: number }} StationDistance */
/** @typedef {"water" | "risk" | "flood" | "camera" | "road"} Tab */

export {};
