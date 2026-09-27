const test = require("node:test");
const assert = require("node:assert/strict");

const load = (file) => import(`../public/js/${file}`);
const HOUR_MS = 60 * 60 * 1000;

test("validStations drops rows Leaflet cannot draw and normalizes ids", async () => {
  const { validStations } = await load("utils.js");
  const result = validStations([
    { id: 1, lat: 13.9, lng: 100.6, level: 2 },
    { id: 2, lat: "13.9", lng: 100.6 },
    { id: null, lat: 13.9, lng: 100.6 },
    null,
    { id: "x", lat: 14, lng: 100.5, level: "3" }
  ]);
  assert.deepEqual(result.map((s) => s.id), ["1", "x"]);
  assert.equal(result[1].level, null);
  assert.deepEqual(validStations("nope"), []);
});

test("time helpers never throw on missing or invalid dates", async () => {
  const { fmtTime, age, isFresh } = await load("utils.js");
  assert.equal(fmtTime(null), "ไม่มีเวลาตรวจวัด");
  assert.equal(fmtTime("garbage"), "ไม่มีเวลาตรวจวัด");
  assert.equal(age("garbage"), Infinity);
  const now = Date.parse("2026-09-27T00:00:00Z");
  assert.equal(isFresh({ measuredAt: new Date(now - HOUR_MS).toISOString() }, now), true);
  assert.equal(isFresh({ measuredAt: new Date(now - 7 * HOUR_MS).toISOString() }, now), false);
});

test("nearest and search order stations by distance from the centre", async () => {
  const { nearestStations, searchStations } = await load("utils.js");
  const stations = [
    { id: "far", name: "คลองไกล", province: "เชียงใหม่", lat: 18.79, lng: 98.98 },
    { id: "near", name: "คลองใกล้", province: "ปทุมธานี", lat: 13.99, lng: 100.62 },
    { id: "mid", name: "คลองกลาง", province: "อยุธยา", lat: 14.35, lng: 100.57 }
  ];
  const from = [13.986, 100.616];
  assert.deepEqual(nearestStations(stations, from, 2).map((item) => item.station.id), ["near", "mid"]);
  assert.deepEqual(searchStations(stations, "  คลอง ", from).map((s) => s.id), ["near", "mid", "far"]);
  assert.deepEqual(searchStations(stations, "อยุธยา", from).map((s) => s.id), ["mid"]);
  assert.deepEqual(searchStations(stations, "   ", from), []);
});

test("templates escape upstream text and link attributes", async () => {
  const { stationPopupHtml, waterTabHtml } = await load("templates.js");
  const evil = { id: '"><img src=x onerror=alert(1)>', name: "<script>x</script>", province: "ป", lat: 14, lng: 100, level: 1.234, measuredAt: null, sourceUrl: 'javascript:"x"' };
  const popup = stationPopupHtml(evil);
  assert.ok(!popup.includes("<script>"));
  assert.ok(popup.includes("1.23"));
  assert.ok(!popup.includes("javascript:"));
  assert.ok(popup.includes('href="https://www.thaiwater.net/"'));
  const list = waterTabHtml({ nearest: [{ station: evil, distance: 1.26 }], hasStations: true, error: null, fetchedAt: null });
  assert.ok(!list.includes("<img"));
  assert.ok(list.includes("1.3 km"));
});

test("water tab shows retry only when there is nothing cached to show", async () => {
  const { waterTabHtml } = await load("templates.js");
  assert.match(waterTabHtml({ nearest: [], hasStations: false, error: "ล่ม", fetchedAt: null }), /data-action="retry"/);
  assert.match(waterTabHtml({ nearest: [], hasStations: true, error: "ล่ม", fetchedAt: "2026-09-27T00:00:00Z" }), /cache-warning/);
});

test("camera tab counts are derived from the camera list", async () => {
  const { cameraTabHtml } = await load("templates.js");
  const { CAMERA_SOURCES } = await load("config.js");
  const html = cameraTabHtml(CAMERA_SOURCES);
  const images = CAMERA_SOURCES.filter((c) => !c.directory).length;
  const directories = CAMERA_SOURCES.length - images;
  assert.ok(html.includes(`${images} กล้อง · ${directories} ศูนย์`));
  assert.equal((html.match(/data-camera=/g) || []).length, images);
});
