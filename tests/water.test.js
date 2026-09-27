const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePayload } = require("../lib/water");
const handler = require("../api/water");

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
  const previous = global.fetch;
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
  } finally { global.fetch = previous; }
});
