// Compare source observations, not API fetch times. A camera image is never a numeric reading.
/** @typedef {import('./types.js').Station} Station */

/** @param {Station[]} previous @param {Station[]} current @returns {Station[]} */
export function withWaterTrends(previous, current) {
  const old = new Map(previous.map((station) => [station.id, station]));
  return current.map((station) => {
    const before = old.get(station.id);
    if (!before) return station;
    const nowTime = Date.parse(station.measuredAt || "");
    const oldTime = Date.parse(before.measuredAt || "");
    if (Number.isFinite(nowTime) && nowTime === oldTime) {
      return { ...station, trendCm: before.trendCm ?? null, trendFrom: before.trendFrom ?? null };
    }
    const elapsed = nowTime - oldTime;
    if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 6 * 60 * 60 * 1000 ||
      !Number.isFinite(station.level) || !Number.isFinite(before.level)) return station;
    return { ...station, trendCm: Math.round((/** @type {number} */ (station.level) - /** @type {number} */ (before.level)) * 100), trendFrom: before.measuredAt };
  });
}
