const test = require("node:test");
const assert = require("node:assert/strict");

test("water trend compares distinct source observations and survives an unchanged poll", async () => {
  const { withWaterTrends } = await import("../public/js/water-trends.js");
  const first = { id: "a", level: 2.12, measuredAt: "2026-09-28T01:00:00Z" };
  const next = { ...first, level: 2.20, measuredAt: "2026-09-28T02:00:00Z" };
  const [up] = withWaterTrends([first], [next]);
  assert.equal(up.trendCm, 8);
  assert.equal(up.trendFrom, first.measuredAt);
  assert.equal(withWaterTrends([up], [next])[0].trendCm, 8);
  const [down] = withWaterTrends([up], [{ ...next, level: 2.17, measuredAt: "2026-09-28T03:00:00Z" }]);
  assert.equal(down.trendCm, -3);
  assert.equal(withWaterTrends([first], [{ ...first, level: 2.5, measuredAt: "2026-09-28T10:00:00Z" }])[0].trendCm, undefined);
  assert.equal(withWaterTrends([first], [{ ...first, level: null, measuredAt: "2026-09-28T02:00:00Z" }])[0].trendCm, undefined);
});
