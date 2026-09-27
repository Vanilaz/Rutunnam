const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePayload } = require("../lib/water");
const { normalizeRoadFloods } = require("../lib/road-flood");
const { buildGetMap } = require("../lib/wms");
const { publicConfig } = require("../lib/layers");
const floodWms = require("../api/flood-wms");
const roadFlood = require("../api/road-flood");

function mockResponse() {
  const out = { headers: {}, statusCode: 0, body: undefined };
  out.res = {
    setHeader(key, value) { out.headers[key] = value; },
    status(code) { out.statusCode = code; return this; },
    json(value) { out.body = value; return this; },
    send(value) { out.body = value; return this; }
  };
  return out;
}

async function withEnv(vars, fn) {
  const saved = {};
  for (const key of Object.keys(vars)) { saved[key] = process.env[key]; if (vars[key] === undefined) delete process.env[key]; else process.env[key] = vars[key]; }
  try { await fn(); } finally { for (const key of Object.keys(saved)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}

async function withFetch(fake, fn) {
  const previous = global.fetch;
  const previousError = console.error;
  const logs = [];
  global.fetch = fake;
  console.error = (line) => logs.push(String(line));
  try { await fn(logs); } finally { global.fetch = previous; console.error = previousError; }
}

test("station parser keeps ThaiWater's bank, storage percent and critical level", () => {
  const [station] = normalizePayload({ waterlevel_data: { data: [{
    waterlevel_msl: "3.40", storage_percent: "104.5", waterlevel_datetime: "2026-09-27 06:50",
    station: { id: 1, tele_station_lat: 14, tele_station_long: 100.5, min_bank: "3.1", critical_level_msl: 3.3 }
  }] } });
  assert.equal(station.bank, 3.1);
  assert.equal(station.storagePercent, 104.5);
  assert.equal(station.criticalLevel, 3.3);
});

test("road flood parser only states depth when the unit is known", () => {
  const { reports, recognizedRows } = normalizeRoadFloods({ data: [
    { id: 1, lat: 13.75, long: 100.5, road_name: "ถ.ทดสอบ", flood_level_cm: "25", datetime: "2026-09-27 08:00" },
    { id: 2, lat: 13.76, long: 100.51, road_name: "ถ.ไม่รู้หน่วย", flood_level: "25" },
    { id: 3, lat: 13.77, long: 100.52, road_name: "ถ.แห้ง", depth_cm: 0 },
    { id: 4, latitude: 13.78, longitude: 100.53, water_depth_m: "0.15" },
    { id: 5, lat: 0, lng: 0 }
  ] });
  assert.equal(recognizedRows, 4);
  assert.deepEqual(reports.map((r) => [r.id, r.depthCm]), [["1", 25], ["2", null], ["4", 15]]);
  assert.equal(reports[0].reportedAt, "2026-09-27T01:00:00.000Z");
});

test("road flood API flags an unreadable schema instead of claiming no flooding", async () => {
  const out = mockResponse();
  await withFetch(async () => ({ ok: true, json: async () => ({ data: [{ foo: 1 }, { bar: 2 }] }) }), async (logs) => {
    await roadFlood({ method: "GET" }, out.res);
    assert.ok(logs.some((line) => line.includes("road_flood_unrecognized")));
  });
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.status, "unsupported-format");
  assert.deepEqual(out.body.reports, []);
});

test("WMS builder accepts Leaflet tiles and rejects anything else", () => {
  const leaflet = new Map(Object.entries({ srs: "EPSG:3857", bbox: "11131949.08,1565430.34,11271098.44,1721973.37", width: "512", height: "512", layers: "evil" }));
  const ok = buildGetMap(leaflet);
  assert.equal(ok.ok, true);
  assert.equal(ok.query.get("LAYERS"), "flood");
  assert.equal(buildGetMap(new Map([...leaflet, ["srs", "EPSG:32647"]])).ok, false);
  assert.equal(buildGetMap(new Map([...leaflet, ["width", "5000"]])).ok, false);
  assert.equal(buildGetMap(new Map([...leaflet, ["bbox", "1,2,0,3"]])).ok, false);
  assert.equal(buildGetMap(new Map([...leaflet, ["bbox", "1,2,x,3"]])).ok, false);
});

test("public config never leaks the GISTDA key and hides layers without keys", async () => {
  await withEnv({ GISTDA_API_KEY: "secret-gistda", TOMTOM_API_KEY: undefined, TRAFFIC_TILE_URL: undefined }, async () => {
    const config = publicConfig(process.env);
    assert.equal(config.flood.available, true);
    assert.equal(config.traffic.available, false);
    assert.ok(!JSON.stringify(config).includes("secret-gistda"));
  });
  await withEnv({ GISTDA_API_KEY: undefined, TOMTOM_API_KEY: "tt key" }, async () => {
    const config = publicConfig(process.env);
    assert.equal(config.flood.available, false);
    assert.match(config.traffic.tileUrl, /^https:\/\/api\.tomtom\.com\/traffic\/map\/4\/tile\/flow\/relative0\/\{z\}\/\{x\}\/\{y\}\.png\?key=tt%20key/);
  });
});

test("flood WMS proxy returns 503 without a key", async () => {
  await withEnv({ GISTDA_API_KEY: undefined }, async () => {
    const out = mockResponse();
    await floodWms({ method: "GET", query: {} }, out.res);
    assert.equal(out.statusCode, 503);
  });
});

test("flood WMS proxy forwards a valid tile with the key and caches it", async () => {
  await withEnv({ GISTDA_API_KEY: "k123" }, async () => {
    const out = mockResponse();
    let calledUrl, calledHeaders;
    const png = Buffer.from([137, 80, 78, 71]);
    await withFetch(async (url, init) => {
      calledUrl = String(url); calledHeaders = init.headers;
      return { ok: true, status: 200, headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => png };
    }, async () => {
      await floodWms({ method: "GET", query: { srs: "EPSG:3857", bbox: "1,2,3,4", width: "512", height: "512" } }, out.res);
    });
    assert.equal(out.statusCode, 200);
    assert.ok(calledUrl.startsWith("https://api-gateway.gistda.or.th/api/2.0/resources/maps/flood/7days/wms?"));
    assert.equal(calledHeaders["API-Key"], "k123");
    assert.equal(out.headers["Content-Type"], "image/png");
    assert.match(out.headers["Cache-Control"], /s-maxage=3600/);
    assert.deepEqual(out.body, png);
  });
});

test("flood WMS proxy treats an XML error with HTTP 200 as a failure and redacts the key", async () => {
  await withEnv({ GISTDA_API_KEY: "k123" }, async () => {
    const out = mockResponse();
    await withFetch(async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/vnd.ogc.se_xml" }), text: async () => "<ServiceException>bad key k123</ServiceException>" }), async (logs) => {
      await floodWms({ method: "GET", query: { srs: "EPSG:3857", bbox: "1,2,3,4", width: "256", height: "256" } }, out.res);
      assert.ok(logs.some((line) => line.includes("flood_wms_failed")));
      assert.ok(!logs.join("").includes("k123"));
    });
    assert.equal(out.statusCode, 502);
  });
});

test("traffic camera feed keeps only cameras that can show a picture", () => {
  const { normalizeTrafficCameras } = require("../lib/traffic-cameras");
  const { cameras, upstreamRows } = normalizeTrafficCameras([
    { camid: "A1", title: " แยก  ทดสอบ ", organization: "กทม.", latitude: "13.75", longitude: "100.5", imgurl: "https://example.go.th/cam/a1.jpg" },
    { camid: "DOH-PER-3-006-out", title: "ทล.1", latitude: 14.1, longitude: 100.6, imgurl: "https://x/X.X.X.X/img.jpg", hls_url: "https://camera1.iticfoundation.org/hls/phase3/per_3_006_out.stream/playlist.m3u8" },
    { camid: "B2", latitude: 13.7, longitude: 100.5, imgurl: "http://insecure.example/b2.jpg" },
    { camid: "C3", latitude: 13.7, longitude: 100.5, hls_url: "https://unknown-host.example/live.m3u8" },
    { camid: "D4", latitude: 13.7, longitude: 100.5, imgurl: "https://cam.example/CAMPK01.jpg" },
    { camid: "E5", latitude: 40, longitude: 100.5, imgurl: "https://cam.example/e5.jpg" },
    { camid: "A1", latitude: 13.75, longitude: 100.5, imgurl: "https://example.go.th/cam/dup.jpg" },
    null
  ]);
  assert.equal(upstreamRows, 8);
  assert.deepEqual(cameras.map((c) => c.id), ["itic-A1", "itic-DOH-PER-3-006-out"]);
  assert.equal(cameras[0].name, "แยก ทดสอบ");
  assert.equal(cameras[1].image, null);
  assert.match(cameras[1].hls, /^https:\/\/camera1\.iticfoundation\.org\//);
});

test("traffic camera API serves the last good list when the feed is down", async () => {
  const handler = require("../api/traffic-cameras");
  const good = mockResponse();
  await withFetch(async () => ({ ok: true, json: async () => [{ camid: "A1", latitude: 13.75, longitude: 100.5, imgurl: "https://example.go.th/a1.jpg" }] }), async () => {
    await handler({ method: "GET" }, good.res);
  });
  assert.equal(good.body.cameras.length, 1);
  const down = mockResponse();
  await withFetch(async () => ({ ok: false, status: 500 }), async () => { await handler({ method: "GET" }, down.res); });
  assert.equal(down.statusCode, 200);
  assert.equal(down.body.stale, true);
  assert.equal(down.body.cameras.length, 1);
});

test("public config reports the build version so stale clients can reload", () => {
  const { version } = require("../package.json");
  assert.equal(publicConfig({}).version, version);
});
