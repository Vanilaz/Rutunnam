const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePayload } = require("../lib/water");
const handler = require("../api/water");

function mockResponse() {
  const out = { headers: {}, statusCode: 0, body: undefined };
  out.res = {
    setHeader(key, value) { out.headers[key] = value; },
    status(code) { out.statusCode = code; return this; },
    json(value) { out.body = value; return this; }
  };
  return out;
}

async function withFetch(fake, fn) {
  const previous = global.fetch;
  const previousError = console.error;
  global.fetch = fake;
  console.error = () => {};
  try { await fn(); } finally { global.fetch = previous; console.error = previousError; }
}

test("converts measured water levels with coordinates and source time", () => {
  const result = normalizePayload({ data: [{ tele_station_id: 12, tele_station_name: { th: "คลองทดสอบ" }, station_lat: "13.99", station_long: "100.61", waterlevel_msl: "2.45", waterlevel_datetime: "2026-09-26T23:00:00Z" }] });
  assert.equal(result[0].name, "คลองทดสอบ");
  assert.equal(result[0].level, 2.45);
  assert.equal(result[0].measuredAt, "2026-09-26T23:00:00.000Z");
});

test("parses current ThaiWater nested feed and its Thailand local time", () => {
  const result = normalizePayload({ waterlevel_data: { result: "OK", data: [{
    id: 77, waterlevel_datetime: "2026-09-27 06:50", waterlevel_msl: "2.45",
    station: { id: 123, tele_station_name: { th: "สะพานคลอง" }, tele_station_lat: 13.99, tele_station_long: 100.61, min_bank: 3.1 },
    geocode: { province_name: { th: "ปทุมธานี" } }
  }] } });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "สะพานคลอง");
  assert.equal(result[0].province, "ปทุมธานี");
  assert.equal(result[0].bank, 3.1);
  assert.equal(result[0].measuredAt, "2026-09-26T23:50:00.000Z");
});

test("rejects stations without usable coordinates, never invents a reading", () => {
  const result = normalizePayload({ data: [{ station_id: 1, lat: 13.9, lng: 100.6 }, { station_id: 2, lat: null, lng: null }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].level, null);
  assert.equal(result[0].measuredAt, null);
});

test("API exposes source failures without pretending a live reading exists", async () => {
  handler.resetCache();
  const previous = global.fetch;
  const previousError = console.error;
  console.error = () => {};
  global.fetch = async () => { throw new Error("offline"); };
  const headers = {};
  let statusCode, body;
  const res = {
    setHeader(key, value) { headers[key] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  try {
    await handler({ method: "GET" }, res);
    assert.equal(statusCode, 502);
    assert.deepEqual(body.stations, []);
    assert.equal(headers["Cache-Control"], "no-store");
  } finally { global.fetch = previous; console.error = previousError; }
});

test("blank or boolean readings stay unknown instead of becoming 0 or 1", () => {
  const result = normalizePayload({ data: [
    { station_id: 1, lat: 13.9, lng: 100.6, waterlevel_msl: "  " },
    { station_id: 2, lat: 13.8, lng: 100.5, waterlevel_msl: true },
    { station_id: 3, lat: " 13.7 ", lng: "100.4", waterlevel_msl: " 1.25 " }
  ] });
  assert.equal(result.find((s) => s.id === "1").level, null);
  assert.equal(result.find((s) => s.id === "2").level, null);
  assert.equal(result.find((s) => s.id === "3").level, 1.25);
  assert.equal(result.find((s) => s.id === "3").lat, 13.7);
});

test("treats ISO timestamps without an offset as Thailand local time", () => {
  const result = normalizePayload({ data: [
    { station_id: 1, lat: 13.9, lng: 100.6, waterlevel_datetime: "2026-09-27T06:50:00" },
    { station_id: 2, lat: 13.9, lng: 100.7, waterlevel_datetime: "2026-09-27 06:50:30" },
    { station_id: 3, lat: 13.9, lng: 100.8, waterlevel_datetime: "not a date" }
  ] });
  assert.equal(result[0].measuredAt, "2026-09-26T23:50:00.000Z");
  assert.equal(result[1].measuredAt, "2026-09-26T23:50:30.000Z");
  assert.equal(result[2].measuredAt, null);
});

test("skips malformed rows instead of failing the whole feed", () => {
  const result = normalizePayload({ data: [null, "x", [], 42, { station_id: 9, lat: 14, lng: 100.5, station: null }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "9");
});

test("keeps one entry per station id, preferring the latest reading", () => {
  const result = normalizePayload({ data: [
    { station_id: 5, lat: 14, lng: 100.5, waterlevel_msl: "1.0", waterlevel_datetime: "2026-09-27 05:00" },
    { station_id: 5, lat: 14, lng: 100.5, waterlevel_msl: "1.4", waterlevel_datetime: "2026-09-27 06:00" },
    { station_id: 5, lat: 14, lng: 100.5, waterlevel_msl: null, waterlevel_datetime: "2026-09-27 07:00" }
  ] });
  assert.equal(result.length, 1);
  assert.equal(result[0].level, 1.4);
});

test("API returns normalized stations with a fetch time on success", async () => {
  handler.resetCache();
  const previous = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ station_id: 1, lat: 13.9, lng: 100.6, waterlevel_msl: "2" }] }) });
  let statusCode, body;
  const res = { setHeader() {}, status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } };
  try {
    await handler({ method: "GET" }, res);
    assert.equal(statusCode, 200);
    assert.equal(body.stations.length, 1);
    assert.ok(!Number.isNaN(Date.parse(body.fetchedAt)));
  } finally { global.fetch = previous; }
});

test("API serves the last good feed, labelled stale, while ThaiWater is down", async () => {
  handler.resetCache();
  const good = async () => ({ ok: true, json: async () => ({ data: [{ station_id: 7, lat: 13.9, lng: 100.6, waterlevel_msl: "1.5" }] }) });
  await withFetch(good, async () => { await handler({ method: "GET" }, mockResponse().res); });
  const down = mockResponse();
  await withFetch(async () => ({ ok: false, status: 503 }), async () => { await handler({ method: "GET" }, down.res); });
  assert.equal(down.statusCode, 200);
  assert.equal(down.body.stale, true);
  assert.equal(down.body.stations[0].level, 1.5);
  assert.match(down.headers["Cache-Control"], /s-maxage=30/);
});

test("API rejects unsupported methods with an Allow header", async () => {
  const out = mockResponse();
  await handler({ method: "POST" }, out.res);
  assert.equal(out.statusCode, 405);
  assert.equal(out.headers.Allow, "GET, HEAD");
});
