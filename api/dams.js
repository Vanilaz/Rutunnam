// @ts-check
const { DAM_URL, normalizeDams } = require("../lib/dams");
const { createFeedHandler } = require("../lib/feed-endpoint");

// Reservoir data is reported daily and the upstream payload is large (1-4 MB), so cache longer.
module.exports = createFeedHandler({
  url: DAM_URL,
  key: "dams",
  normalize: normalizeDams,
  cacheControl: "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
  lastGoodMaxAgeMs: 2 * 24 * 60 * 60 * 1000,
  event: "dams",
  errorMessage: "ดึงข้อมูลเขื่อนและอ่างเก็บน้ำไม่ได้ในขณะนี้",
  source: { source: "ThaiWater · เขื่อนและอ่างเก็บน้ำ", sourceUrl: "https://www.thaiwater.net/" },
  timeoutMs: 20 * 1000
});
