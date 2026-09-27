// @ts-check
const { WATER_GATE_URL, normalizeWaterGates } = require("../lib/water-gates");
const { createFeedHandler } = require("../lib/feed-endpoint");

module.exports = createFeedHandler({
  url: WATER_GATE_URL,
  key: "gates",
  normalize: normalizeWaterGates,
  cacheControl: "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  lastGoodMaxAgeMs: 6 * 60 * 60 * 1000,
  event: "water_gates",
  errorMessage: "ดึงข้อมูลประตูระบายน้ำไม่ได้ในขณะนี้",
  source: { source: "ThaiWater · ประตูระบายน้ำ", sourceUrl: "https://www.thaiwater.net/" }
});
