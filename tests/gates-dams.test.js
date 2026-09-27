const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWaterGates } = require("../lib/water-gates");
const { normalizeDams } = require("../lib/dams");

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
  const logs = [];
  global.fetch = fake;
  console.error = (line) => logs.push(String(line));
  try { await fn(logs); } finally { global.fetch = previous; console.error = previousError; }
}

const GATE = {
  station: { id: 55, tele_station_name: { th: "ปตร.หันตรา" }, tele_station_lat: "14.35", tele_station_long: "100.61" },
  watergate_in: "3.72", watergate_out: "2.79", pump_on: "2", floodgate_open: true,
  watergate_datetime: "2026-09-27 11:10",
  geocode: { province_name: { th: "พระนครศรีอยุธยา" } },
  agency: { agency_shortname: { th: "สสน." } }
};

test("water gate parser reads both sides of the gate and Thailand time", () => {
  const { items, upstreamRows } = normalizeWaterGates({ data: [GATE] });
  assert.equal(upstreamRows, 1);
  assert.deepEqual(items[0], {
    id: "55", name: "ปตร.หันตรา", province: "พระนครศรีอยุธยา", agency: "สสน.",
    lat: 14.35, lng: 100.61, upstream: 3.72, downstream: 2.79, pumpsOn: 2, gatesOpen: 1,
    measuredAt: "2026-09-27T04:10:00.000Z"
  });
});

test("water gate parser drops rows without levels or coordinates and keeps the newest per gate", () => {
  const { items } = normalizeWaterGates({ data: [
    { ...GATE, watergate_in: "", watergate_out: null },
    { ...GATE, station: { ...GATE.station, id: 2, tele_station_lat: null } },
    { ...GATE, watergate_in: "3.10", watergate_datetime: "2026-09-27 09:00" },
    null
  ] });
  assert.equal(items.length, 1);
  assert.equal(items[0].upstream, 3.1);
  assert.equal(normalizeWaterGates({ data: [GATE, { ...GATE, watergate_in: "9", watergate_datetime: "2026-09-27 06:00" }] }).items[0].upstream, 3.72);
});

const DAM = (id, extra = {}) => ({
  dam: { id, dam_name: { th: `เขื่อน ${id}` }, dam_lat: "15.2", dam_long: "100.1", normal_storage: "960" },
  dam_storage: "720", dam_inflow: "12.5", dam_released: "9.1", dam_date: "2026-09-27",
  geocode: { province_name: { th: "ชัยนาท" } }, agency: { agency_shortname: { th: "ชป." } },
  ...extra
});

test("dam parser keeps large and medium reservoirs and computes percent when missing", () => {
  const { items, upstreamRows } = normalizeDams({ data: {
    dam_daily: [DAM(1, { dam_storage_percent: "88.4" })],
    dam_medium: [DAM(2)],
    dam_small: [DAM(3)]
  } });
  assert.equal(upstreamRows, 2);
  const byId = Object.fromEntries(items.map((d) => [d.id, d]));
  assert.equal(byId["1"].size, "large");
  assert.equal(byId["1"].percent, 88.4);
  assert.equal(byId["2"].size, "medium");
  assert.equal(byId["2"].percent, 75);
  assert.equal(byId["2"].released, 9.1);
  assert.equal(byId["2"].date, "2026-09-27");
  assert.equal(byId["3"], undefined);
});

test("dam parser never invents a percentage", () => {
  const { items } = normalizeDams({ data: { dam_medium: [DAM(4, { dam_storage: "", dam: { id: 4, dam_lat: 15, dam_long: 100, normal_storage: 0 } })] } });
  assert.equal(items[0].storage, null);
  assert.equal(items[0].percent, null);
});

test("feed handler flags an unreadable schema and serves the last good copy when down", async () => {
  const handler = require("../api/water-gates");
  handler.resetCache();
  const unreadable = mockResponse();
  await withFetch(async () => ({ ok: true, json: async () => ({ data: [{ foo: 1 }] }) }), async (logs) => {
    await handler({ method: "GET" }, unreadable.res);
    assert.ok(logs.some((line) => line.includes("water_gates_unrecognized")));
  });
  assert.equal(unreadable.body.status, "unsupported-format");

  const good = mockResponse();
  await withFetch(async () => ({ ok: true, json: async () => ({ data: [GATE] }) }), async () => { await handler({ method: "GET" }, good.res); });
  assert.equal(good.body.gates.length, 1);
  assert.match(good.headers["Cache-Control"], /s-maxage=300/);

  const down = mockResponse();
  await withFetch(async () => ({ ok: false, status: 503 }), async () => { await handler({ method: "GET" }, down.res); });
  assert.equal(down.statusCode, 200);
  assert.equal(down.body.stale, true);
  assert.equal(down.body.gates.length, 1);

  const post = mockResponse();
  await handler({ method: "POST" }, post.res);
  assert.equal(post.statusCode, 405);
});

test("dam API returns 502 with a Thai message when there is no fallback", async () => {
  const handler = require("../api/dams");
  handler.resetCache();
  const out = mockResponse();
  await withFetch(async () => { throw new Error("offline"); }, async () => { await handler({ method: "GET" }, out.res); });
  assert.equal(out.statusCode, 502);
  assert.match(out.body.error, /เขื่อน/);
});
