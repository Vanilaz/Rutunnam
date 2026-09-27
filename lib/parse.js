// @ts-check
// Defensive parsing helpers shared by the ThaiWater adapters. Upstream payloads are
// loosely typed, so every value is validated and unknown values become null, never 0.

// Rough bounding box of Thailand; rows outside it are treated as bad coordinates.
const THAILAND_BOUNDS = { minLat: 5, maxLat: 21, minLng: 97, maxLng: 106 };
const THAILAND_OFFSET = "+07:00";

/** @param {unknown} value @returns {number | null} */
function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Blank strings, booleans and objects must not coerce into a fake 0/1 reading.
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value @returns {string} */
function text(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = /** @type {Record<string, unknown>} */ (value);
    for (const key of ["th", "en", "name"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

/** @param {unknown} value @returns {string | null} ISO string in UTC */
function validTime(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  // ThaiWater's time without an offset is local Thailand time (UTC+07:00),
  // whether it uses a space ("2026-09-27 06:50") or ISO "T" separator.
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(trimmed);
  const normalized = match ? `${match[1]}T${match[2]}${THAILAND_OFFSET}` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** @param {number} lat @param {number} lng */
function inThailand(lat, lng) {
  return lat >= THAILAND_BOUNDS.minLat && lat <= THAILAND_BOUNDS.maxLat && lng >= THAILAND_BOUNDS.minLng && lng <= THAILAND_BOUNDS.maxLng;
}

/**
 * First array found at the usual ThaiWater envelope locations.
 * @param {any} payload
 * @param {string[]} keys extra keys to look for inside an envelope object
 * @returns {unknown[]}
 */
function rowsFrom(payload, keys) {
  const candidates = [...keys.map((key) => payload?.[key]?.data), payload?.data, payload?.result?.data, payload?.result, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      for (const key of [...keys, "data"]) {
        if (Array.isArray(candidate[key])) return candidate[key];
      }
    }
  }
  return [];
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

module.exports = { number, text, validTime, inThailand, rowsFrom, isRecord };
