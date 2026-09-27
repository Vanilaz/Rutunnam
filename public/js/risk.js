// Classifies stations by how close the water is to the bank. Pure, so it is unit-tested in Node.
import { STORAGE_CLASSES } from "./config.js";
import { isFresh } from "./utils.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").RiskStatus} RiskStatus */
/** @typedef {import("./types.js").StationRisk} StationRisk */

/** @type {Readonly<Record<RiskStatus, { label: string, color: string, rank: number }>>} */
export const RISK_STYLES = Object.freeze({
  overflow: { label: "ล้นตลิ่ง", color: "#d6334a", rank: 0 },
  high: { label: "น้ำมาก ใกล้ตลิ่ง", color: "#f08c2b", rank: 1 },
  normal: { label: "ปกติ", color: "#0d9e9a", rank: 2 },
  belowBank: { label: "ต่ำกว่าตลิ่ง", color: "#0d9e9a", rank: 3 },
  low: { label: "น้ำน้อย", color: "#4f8fd6", rank: 4 },
  unknown: { label: "ไม่มีเกณฑ์ตลิ่ง", color: "#9aa9b4", rank: 5 },
  stale: { label: "ข้อมูลเก่า", color: "#b7c2ca", rank: 6 }
});

/** @param {unknown} n @returns {n is number} */
const isNumber = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Uses ThaiWater's own storage_percent when present; otherwise only says whether the level
 * is above the published bank level. Never guesses a threshold, and never flags stale readings.
 * @param {Station} station
 * @param {number} [now]
 * @returns {StationRisk}
 */
export function stationRisk(station, now = Date.now()) {
  const { level, bank, storagePercent } = station;
  const margin = isNumber(level) && isNumber(bank) ? level - bank : null;
  const percent = isNumber(storagePercent) ? storagePercent : null;
  if (!isNumber(level) || !isFresh(station, now)) return { status: "stale", percent, margin };
  if (percent !== null) {
    const status = percent > STORAGE_CLASSES.overflowAbove ? "overflow"
      : percent > STORAGE_CLASSES.highAbove ? "high"
        : percent <= STORAGE_CLASSES.lowAtOrBelow ? "low" : "normal";
    return { status, percent, margin };
  }
  if (margin !== null) return { status: margin > 0 ? "overflow" : "belowBank", percent, margin };
  return { status: "unknown", percent, margin };
}

/** @param {StationRisk} risk */
export const isAtRisk = (risk) => risk.status === "overflow" || risk.status === "high";

/** "+0.35 ม." / "−1.20 ม." relative to the bank. @param {number} margin */
export const formatMargin = (margin) => `${margin > 0 ? "+" : "−"}${Math.abs(margin).toFixed(2)} ม.`;

/**
 * Stations that are over or near the bank, worst first.
 * @param {Station[]} stations
 * @param {number} [now]
 * @returns {{ station: Station, risk: StationRisk }[]}
 */
export function riskyStations(stations, now = Date.now()) {
  return stations
    .map((station) => ({ station, risk: stationRisk(station, now) }))
    .filter(({ risk }) => isAtRisk(risk))
    .sort((a, b) => RISK_STYLES[a.risk.status].rank - RISK_STYLES[b.risk.status].rank
      || (b.risk.percent ?? -Infinity) - (a.risk.percent ?? -Infinity)
      || (b.risk.margin ?? -Infinity) - (a.risk.margin ?? -Infinity));
}
