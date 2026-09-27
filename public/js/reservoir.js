// Classifies reservoirs by storage using the Royal Irrigation Department's classes. Pure, unit-tested.
import { DAM_CLASSES, DAM_STALE_MS } from "./config.js";

/** @typedef {import("./types.js").Dam} Dam */
/** @typedef {import("./types.js").DamStatus} DamStatus */

/** @type {Readonly<Record<DamStatus, { label: string, color: string, rank: number }>>} */
export const DAM_STYLES = Object.freeze({
  over: { label: "เกินความจุ", color: "#d6334a", rank: 0 },
  high: { label: "น้ำมาก", color: "#f08c2b", rank: 1 },
  normal: { label: "ปกติ", color: "#0d9e9a", rank: 2 },
  low: { label: "น้ำน้อย", color: "#4f8fd6", rank: 3 },
  critical: { label: "น้ำน้อยวิกฤต", color: "#8a5bd6", rank: 4 },
  unknown: { label: "ไม่มีข้อมูลปริมาณ", color: "#9aa9b4", rank: 5 },
  stale: { label: "ข้อมูลเก่า", color: "#b7c2ca", rank: 6 }
});

/** Midnight in Thailand for a YYYY-MM-DD reporting day. @param {string} day */
const dayStart = (day) => Date.parse(`${day}T00:00:00+07:00`);

/**
 * @param {Dam} dam
 * @param {number} [now]
 * @returns {DamStatus}
 */
export function damStatus(dam, now = Date.now()) {
  if (!dam.date || now - dayStart(dam.date) > DAM_STALE_MS) return "stale";
  const { percent } = dam;
  if (percent === null) return "unknown";
  if (percent > DAM_CLASSES.overAbove) return "over";
  if (percent > DAM_CLASSES.highAbove) return "high";
  if (percent <= DAM_CLASSES.criticalAtOrBelow) return "critical";
  if (percent <= DAM_CLASSES.lowAtOrBelow) return "low";
  return "normal";
}

/**
 * Large reservoirs first, then the fullest.
 * @param {Dam[]} dams
 * @param {number} [now]
 */
export function rankDams(dams, now = Date.now()) {
  return dams
    .map((dam) => ({ dam, status: damStatus(dam, now) }))
    .sort((a, b) => (a.dam.size === b.dam.size ? 0 : a.dam.size === "large" ? -1 : 1)
      || DAM_STYLES[a.status].rank - DAM_STYLES[b.status].rank
      || (b.dam.percent ?? -Infinity) - (a.dam.percent ?? -Infinity));
}

/** Level difference across a gate, intake minus release (m). @param {{ upstream: number | null, downstream: number | null }} gate */
export const gateDifference = ({ upstream, downstream }) => upstream !== null && downstream !== null ? upstream - downstream : null;
