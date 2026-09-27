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

test("camera tab renders a thumbnail card per camera and escapes names", async () => {
  const { cameraTabHtml } = await load("templates.js");
  const { CAMERA_SOURCES } = await load("config.js");
  const water = CAMERA_SOURCES.filter((c) => !c.directory).map((camera, i) => ({ camera, distance: i }));
  const directories = CAMERA_SOURCES.filter((c) => c.directory);
  const traffic = [
    { camera: { id: "itic-A", name: "<b>แยก</b>", org: "กทม.", lat: 13.7, lng: 100.5, image: "https://cam.example/a.jpg", hls: null }, distance: 1.25 },
    { camera: { id: "itic-B", name: "ทล.1", org: "", lat: 14, lng: 100.6, image: null, hls: "https://camera1.iticfoundation.org/b.m3u8" }, distance: 3 }
  ];
  const html = cameraTabHtml({ water, directories, traffic, trafficTotal: 150, trafficError: null, hasMore: true });
  assert.equal((html.match(/data-viewer="water:/g) || []).length, water.length);
  assert.equal((html.match(/data-viewer="traffic:/g) || []).length, 2);
  assert.ok(html.includes('data-thumb="https://cam.example/a.jpg"'));
  assert.ok(html.includes("150 กล้องทั่วประเทศ"));
  assert.ok(html.includes('data-action="more-traffic-cameras"'));
  assert.ok(!html.includes("<b>แยก</b>"));
  assert.match(cameraTabHtml({ water, directories, traffic: null, trafficTotal: 0, trafficError: "ล่ม", hasMore: false }), /ล่ม/);
});

test("alert banner names the nearest risky station", async () => {
  const { alertBannerHtml } = await load("templates.js");
  assert.equal(alertBannerHtml(null), null);
  const station = { id: "1", name: "คลองเปรมประชากร <x>", lat: 14, lng: 100.6, level: 1.78, bank: 1.29, measuredAt: null };
  const overflow = alertBannerHtml({ station, risk: { status: "overflow", percent: 138, margin: 0.49 }, distance: 2.04 });
  assert.equal(overflow.level, "overflow");
  assert.match(overflow.html, /ใกล้คุณ: ล้นตลิ่ง/);
  assert.match(overflow.html, /\+0\.49 ม\./);
  assert.ok(!overflow.html.includes("<x>"));
  assert.equal(alertBannerHtml({ station, risk: { status: "high", percent: 85, margin: null }, distance: 1 }).level, "high");
});

test("stationRisk follows ThaiWater's storage percent classes", async () => {
  const { stationRisk } = await load("risk.js");
  const now = Date.parse("2026-09-27T00:00:00Z");
  const fresh = new Date(now - HOUR_MS).toISOString();
  const at = (storagePercent, extra = {}) => stationRisk({ level: 2, bank: null, storagePercent, measuredAt: fresh, ...extra }, now).status;
  assert.equal(at(104.5), "overflow");
  assert.equal(at(100), "high");
  assert.equal(at(71), "high");
  assert.equal(at(70), "normal");
  assert.equal(at(30), "low");
});

test("stationRisk compares with the bank only when no percent is published", async () => {
  const { stationRisk, formatMargin } = await load("risk.js");
  const now = Date.parse("2026-09-27T00:00:00Z");
  const measuredAt = new Date(now - HOUR_MS).toISOString();
  const over = stationRisk({ level: 3.4, bank: 3.1, storagePercent: null, measuredAt }, now);
  assert.equal(over.status, "overflow");
  assert.equal(formatMargin(over.margin), "+0.30 ม.");
  assert.equal(stationRisk({ level: 2.0, bank: 3.1, storagePercent: null, measuredAt }, now).status, "belowBank");
  assert.equal(stationRisk({ level: 2.0, bank: null, storagePercent: null, measuredAt }, now).status, "unknown");
});

test("stale or missing readings are never flagged as overflowing", async () => {
  const { stationRisk } = await load("risk.js");
  const now = Date.parse("2026-09-27T00:00:00Z");
  assert.equal(stationRisk({ level: 5, bank: 3, storagePercent: 150, measuredAt: new Date(now - 7 * HOUR_MS).toISOString() }, now).status, "stale");
  assert.equal(stationRisk({ level: null, bank: 3, storagePercent: 150, measuredAt: new Date(now).toISOString() }, now).status, "stale");
});

test("riskyStations lists overflow first, then by severity", async () => {
  const { riskyStations } = await load("risk.js");
  const now = Date.parse("2026-09-27T00:00:00Z");
  const measuredAt = new Date(now - HOUR_MS).toISOString();
  const list = riskyStations([
    { id: "a", level: 1, storagePercent: 80, measuredAt },
    { id: "b", level: 1, storagePercent: 120, measuredAt },
    { id: "c", level: 1, storagePercent: 50, measuredAt },
    { id: "d", level: 1, storagePercent: 95, measuredAt },
    { id: "e", level: 1, storagePercent: 101, measuredAt }
  ], now);
  assert.deepEqual(list.map((item) => item.station.id), ["b", "e", "d", "a"]);
});

test("road flood popup never invents a depth", async () => {
  const { roadFloodPopupHtml } = await load("templates.js");
  assert.match(roadFloodPopupHtml({ id: "1", lat: 13.7, lng: 100.5, name: "ถ.ทดสอบ", depthCm: 25, reportedAt: null }), /น้ำลึกประมาณ 25 ซม\./);
  assert.match(roadFloodPopupHtml({ id: "2", lat: 13.7, lng: 100.5, name: "<b>x</b>", depthCm: null, reportedAt: null }), /ต้นทางไม่ระบุหน่วยความลึก/);
  assert.ok(!roadFloodPopupHtml({ id: "2", lat: 13.7, lng: 100.5, name: "<b>x</b>", depthCm: null, reportedAt: null }).includes("<b>x</b>"));
});

test("flood tab distinguishes unreadable data from no flooding", async () => {
  const { floodTabHtml } = await load("templates.js");
  const base = { floodAvailable: false, floodOn: false, floodError: false, roadError: null };
  assert.match(floodTabHtml({ ...base, roads: [], roadUnsupported: true }), /ไม่ได้แปลว่าไม่มีน้ำท่วม/);
  assert.match(floodTabHtml({ ...base, roads: [], roadUnsupported: false }), /ไม่มีรายงานถนนน้ำท่วม/);
  assert.match(floodTabHtml({ ...base, roads: null, roadUnsupported: false }), /GISTDA_API_KEY/);
});
