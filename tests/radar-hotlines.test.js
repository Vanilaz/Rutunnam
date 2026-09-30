const test = require("node:test");
const assert = require("node:assert/strict");

const INDEX = {
  version: "2.0",
  generated: 1790000000,
  host: "https://tilecache.rainviewer.com",
  radar: { past: [{ time: 1789999400, path: "/v2/radar/1789999400" }, { time: 1790000000, path: "/v2/radar/1790000000" }], nowcast: [] }
};

test("the newest radar frame becomes a tile URL; anything unexpected gives no URL", async () => {
  const { latestRadarFrame } = await import("../public/js/radar.js");
  assert.deepEqual(latestRadarFrame(INDEX), {
    tileUrl: "https://tilecache.rainviewer.com/v2/radar/1790000000/256/{z}/{x}/{y}/2/1_1.png",
    time: 1790000000 * 1000
  });
  assert.equal(latestRadarFrame(null), null);
  assert.equal(latestRadarFrame({ ...INDEX, host: "http://tilecache.rainviewer.com" }), null, "plain HTTP tiles would be blocked on HTTPS");
  assert.equal(latestRadarFrame({ ...INDEX, host: "not a url" }), null);
  assert.equal(latestRadarFrame({ ...INDEX, radar: { past: [] } }), null);
  assert.equal(latestRadarFrame({ ...INDEX, radar: { past: [{ time: 1, path: "/x/../../evil?q=1" }] } }), null, "paths with query strings are rejected");
  assert.equal(latestRadarFrame({ ...INDEX, radar: { past: [{ time: "soon", path: "/v2/radar/1" }] } }), null);
});

test("hotlines are tap-to-call links with life-safety numbers marked", async () => {
  const { emergencyHtml, riskTabHtml, floodTabHtml } = await import("../public/js/templates.js");
  const { EMERGENCY_CONTACTS } = await import("../public/js/config.js");
  const html = emergencyHtml();
  for (const { number } of EMERGENCY_CONTACTS) assert.ok(html.includes(`href="tel:${number}"`), number);
  assert.match(html, /class="hotline is-urgent" href="tel:1784"/);
  assert.match(html, /class="hotline" href="tel:1460"/);
  assert.equal(new Set(EMERGENCY_CONTACTS.map((c) => c.number)).size, EMERGENCY_CONTACTS.length, "no duplicate numbers");
  // Reachable from the warning page even when the water feed is down, and from the flood page.
  assert.match(riskTabHtml({ items: [], total: 0, nearby: { overflow: 0, high: 0, roads: null }, hasStations: false, riskOnly: false, error: "ล่ม" }), /tel:1784/);
  assert.match(floodTabHtml({ floodAvailable: false, floodOn: false, floodError: false, roads: [], roadError: null, roadUnsupported: false }), /tel:1669/);
});

test("the radar card says when the picture is from, and when it is old or failed", async () => {
  const { radarCardHtml } = await import("../public/js/templates.js");
  const now = Date.parse("2026-09-30T12:00:00Z");
  assert.match(radarCardHtml({ on: true, time: null, error: null, now }), /กำลังโหลดภาพเรดาร์/);
  const fresh = radarCardHtml({ on: true, time: now - 5 * 60 * 1000, error: null, now });
  assert.match(fresh, /ภาพเรดาร์เวลา/);
  assert.ok(!fresh.includes("เก่ากว่า"));
  assert.match(radarCardHtml({ on: true, time: now - 45 * 60 * 1000, error: null, now }), /ข้อมูลเก่ากว่า 30 นาที/);
  assert.match(radarCardHtml({ on: true, time: null, error: "โหลดเรดาร์ฝนไม่ได้ในขณะนี้", now }), /cache-warning/);
  assert.match(radarCardHtml({ on: false, time: null, error: null, now }), /แสดงเรดาร์ฝนบนแผนที่/);
});
