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
 * @property {number | null} [bank]
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

/** @typedef {[number, number]} LatLngTuple */
/** @typedef {{ lat: number, lng: number }} Home */
/** @typedef {{ station: Station, distance: number }} StationDistance */
/** @typedef {"water" | "flood" | "camera" | "road"} Tab */

export {};
