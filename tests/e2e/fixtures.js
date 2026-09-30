// @ts-check
// Network fixtures for the browser tests. The app's own /api/water is always
// mocked; third-party tiles and camera images are stubbed so runs are deterministic.
const fs = require("node:fs");
const path = require("node:path");
const { test: base, expect } = require("@playwright/test");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// Camera frames must look like a real picture (the app rejects frames narrower than 64 px).
const FRAME = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#4a6b7c"/></svg>';
// A playlist header with no media: passes the availability probe, then hls.js fails fast on it.
const EMPTY_PLAYLIST = "#EXTM3U\n";
const STREAM_HOSTS = new Set(["camera1.iticfoundation.org", "stream.firsttech.co.th"]);
const MIN_STYLE = JSON.stringify({ version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#dde6ea" } }] });
const CORS = { "Access-Control-Allow-Origin": "*" };

// Optional offline mirror of the CDN files (used where the sandbox has no internet).
// In CI the real cdnjs/unpkg files are fetched, which also verifies the SRI hashes.
const MIRROR = process.env.E2E_CDN_MIRROR;
const MIRROR_FILES = {
  "cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js": "leaflet.min.js",
  "unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js": "maplibre-gl.js",
  "unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css": "maplibre-gl.css",
  "unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js": "leaflet-maplibre-gl.js",
  "cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js": "hls.min.js"
};

const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const WATER_GATES = [
  { id: "g-near", name: "ปตร.คลองรังสิต", province: "ปทุมธานี", agency: "ชป.", lat: 14.0, lng: 100.63, upstream: 3.72, downstream: 2.79, pumpsOn: 2, gatesOpen: 3, measuredAt: new Date().toISOString() },
  { id: "g-far", name: "ปตร.ทดสอบใต้", province: "สงขลา", agency: "สสน.", lat: 7.2, lng: 100.6, upstream: 1.1, downstream: 1.5, pumpsOn: null, gatesOpen: null, measuredAt: new Date().toISOString() }
];
const DAMS = () => [
  { id: "d-large", name: "เขื่อนทดสอบใหญ่", size: "large", province: "ชัยนาท", agency: "ชป.", lat: 15.2, lng: 100.1, storage: 1000, normalStorage: 960, percent: 104, inflow: 40, released: 35.5, date: today() },
  { id: "d-medium", name: "อ่างทดสอบกลาง", size: "medium", province: "สระบุรี", agency: "ชป.", lat: 14.5, lng: 101, storage: 20, normalStorage: 40, percent: 50, inflow: 1, released: 0.5, date: today() }
];

const CDN_HOSTS = new Set(["cdnjs.cloudflare.com", "unpkg.com", "cdn.jsdelivr.net"]);

const TRAFFIC_CAMERAS = [
  { id: "itic-near", name: "แยกรังสิต", org: "กรมทางหลวง", lat: 13.97, lng: 100.6, image: "https://cam.example.go.th/near.jpg", hls: null },
  { id: "itic-video", name: "ทล.1 ขาเข้า", org: "กรมทางหลวง", lat: 14.02, lng: 100.63, image: null, hls: "https://camera1.iticfoundation.org/hls/test.stream/playlist.m3u8" },
  { id: "itic-far", name: "เชียงใหม่ แยกทดสอบ", org: "เทศบาล", lat: 18.79, lng: 98.98, image: "https://cam.example.go.th/far.jpg", hls: null }
];

/** @param {number} count */
function makeStations(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `สถานีทดสอบ ${i + 1}`,
    province: i % 2 ? "ปทุมธานี" : "นนทบุรี",
    river: "",
    lat: 13.9 + i * 0.01,
    lng: 100.5 + i * 0.01,
    level: i === 3 ? null : Number((1 + i / 10).toFixed(2)),
    bank: null,
    // Station 11 is over the bank and station 12 is close to it; both are near Rangsit.
    storagePercent: i === 10 ? 112 : i === 11 ? 85 : 50,
    measuredAt: new Date().toISOString(),
    sourceUrl: "https://www.thaiwater.net/"
  }));
}

/**
 * @typedef {{ status: number, body: string, contentType?: string }} ApiReply
 * @typedef {{ api: (reply: ApiReply | (() => ApiReply)) => void, config: (reply: ApiReply) => void, roadFlood: (reply: ApiReply) => void, trafficCameras: (reply: ApiReply) => void, waterGates: (reply: ApiReply) => void, dams: (reply: ApiReply) => void,
 *   vectorStyle: (ok: boolean) => void, streams: (mode: "fail" | "hang") => void, radar: (ok: boolean) => void, pageErrors: string[], requests: string[] }} Net
 */

const FULL_CONFIG = {
  flood: { available: true, period: "7days", wmsUrl: "/api/flood-wms" },
  traffic: { available: true, tileUrl: "https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=test&tileSize=256", attribution: "Traffic © TomTom" },
  roadFlood: { available: true, url: "/api/road-flood" }
};
const ROAD_REPORTS = [
  { id: "r1", lat: 13.99, lng: 100.62, name: "ถ.พหลโยธิน ขาเข้า", province: "ปทุมธานี", depthCm: 25, reportedAt: new Date().toISOString() },
  { id: "r2", lat: 13.75, lng: 100.5, name: "ถ.ราชดำเนิน", province: "กรุงเทพมหานคร", depthCm: null, reportedAt: null }
];
/** @param {unknown} body @param {number} [status] @returns {ApiReply} */
const json = (body, status = 200) => ({ status, body: JSON.stringify(body) });

const okReply = (stations = makeStations(30), extra = {}) => ({ status: 200, body: JSON.stringify({ stations, fetchedAt: new Date().toISOString(), ...extra }) });

/**
 * @param {{ page: import("@playwright/test").Page }} args
 * @param {(net: Net) => Promise<void>} use
 */
async function netFixture({ page }, use) {
  /** @type {ApiReply | (() => ApiReply)} */
  let api = okReply();
  /** @type {ApiReply} */
  let config = json(FULL_CONFIG);
  /** @type {ApiReply} */
  let roadFlood = json({ reports: ROAD_REPORTS, status: "ok", fetchedAt: new Date().toISOString() });
  /** @type {ApiReply} */
  let trafficCameras = json({ cameras: TRAFFIC_CAMERAS, fetchedAt: new Date().toISOString() });
  /** @type {ApiReply} */
  let waterGates = json({ gates: WATER_GATES, status: "ok", fetchedAt: new Date().toISOString() });
  /** @type {ApiReply} */
  let dams = json({ dams: DAMS(), status: "ok", fetchedAt: new Date().toISOString() });
  /** @type {string[]} */
  const requests = [];
  let styleOk = false;
  /** "fail": players get an empty playlist. "hang": players never get an answer (still connecting). */
  let streamMode = /** @type {"fail" | "hang"} */ ("fail");
  /** @type {Set<string>} playlists already answered once (the availability probe) */
  const probed = new Set();
  const closed = new Promise((resolve) => page.once("close", resolve));
  let radarOk = true;
  /** @type {string[]} */
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|net::ERR_/.test(message.text())) pageErrors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const { host, pathname } = new URL(url);
    requests.push(url);
    if (pathname === "/api/water") {
      const reply = typeof api === "function" ? api() : api;
      return route.fulfill({ status: reply.status, body: reply.body, contentType: reply.contentType || "application/json" });
    }
    if (pathname === "/api/config") return route.fulfill({ status: config.status, body: config.body, contentType: "application/json" });
    if (pathname === "/api/water-gates") return route.fulfill({ status: waterGates.status, body: waterGates.body, contentType: "application/json" });
    if (pathname === "/api/dams") return route.fulfill({ status: dams.status, body: dams.body, contentType: "application/json" });
    if (pathname === "/api/traffic-cameras") return route.fulfill({ status: trafficCameras.status, body: trafficCameras.body, contentType: "application/json" });
    if (STREAM_HOSTS.has(host)) {
      if (!pathname.endsWith(".m3u8")) return route.abort();
      if (streamMode === "hang" && probed.has(url)) { await closed; return route.abort().catch(() => {}); }
      probed.add(url);
      return route.fulfill({ body: EMPTY_PLAYLIST, contentType: "application/vnd.apple.mpegurl", headers: CORS });
    }
    if (host === "api.rainviewer.com") {
      if (!radarOk) return route.fulfill({ status: 503, body: "down", headers: CORS });
      const time = Math.floor(Date.now() / 1000) - 300;
      return route.fulfill({ body: JSON.stringify({ version: "2.0", host: "https://tilecache.rainviewer.com", radar: { past: [{ time, path: `/v2/radar/${time}` }], nowcast: [] } }), contentType: "application/json", headers: CORS });
    }
    if (pathname === "/api/camera-snapshot") return route.fulfill({ body: FRAME, contentType: "image/svg+xml" });
    if (pathname === "/api/road-flood") return route.fulfill({ status: roadFlood.status, body: roadFlood.body, contentType: "application/json" });
    if (pathname === "/api/flood-wms") return route.fulfill({ body: PNG, contentType: "image/png" });
    if (host.startsWith("localhost")) return route.continue();
    const mirrored = MIRROR && MIRROR_FILES[/** @type {keyof typeof MIRROR_FILES} */ (`${host}${pathname}`)];
    if (mirrored) {
      return route.fulfill({ body: fs.readFileSync(path.join(/** @type {string} */ (MIRROR), mirrored)), contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript", headers: CORS });
    }
    // Pinned CDNs the page loads scripts/styles from (see MAPLIBRE_ASSETS and HLS_JS_ASSET).
    if (CDN_HOSTS.has(host)) return route.continue();
    if (host === "tiles.openfreemap.org" && pathname.startsWith("/styles/")) {
      return styleOk ? route.fulfill({ body: MIN_STYLE, contentType: "application/json", headers: CORS }) : route.abort();
    }
    if (route.request().resourceType() === "image") {
      // Map tiles stay tiny; anything else is a camera frame.
      const tile = /\/\d+\/\d+\/\d+(@2x)?\.png$/.test(pathname) || host.endsWith("tomtom.com");
      return tile ? route.fulfill({ body: PNG, contentType: "image/png", headers: CORS }) : route.fulfill({ body: FRAME, contentType: "image/svg+xml", headers: CORS });
    }
    return route.abort();
  });
  await use({
    api: (reply) => { api = reply; },
    config: (reply) => { config = reply; },
    roadFlood: (reply) => { roadFlood = reply; },
    trafficCameras: (reply) => { trafficCameras = reply; },
    waterGates: (reply) => { waterGates = reply; },
    dams: (reply) => { dams = reply; },
    requests,
    vectorStyle: (ok) => { styleOk = ok; },
    streams: (mode) => { streamMode = mode; },
    radar: (ok) => { radarOk = ok; },
    pageErrors
  });
}

/** Desktop uses the tab row; phones use the bottom menu, where the risk page also lists nearby stations. */
const isMobile = () => base.info().project.name === "mobile";

/** @param {import("@playwright/test").Page} page @param {"water" | "risk" | "flood" | "gates" | "camera" | "road"} tab */
async function openTab(page, tab) {
  if (isMobile()) await page.locator(`[data-nav="${tab === "water" ? "risk" : tab}"]`).click();
  else await page.locator(`.tab[data-tab="${tab}"]`).click();
}

/** Plain station cards (not risk cards) in whichever list shows nearby stations. @param {import("@playwright/test").Page} page */
const stationCards = (page) => page.locator("#tab-content .station-card[data-station]:not(.risk-card)");

/** The layer switches live in a drawer behind the filter button (bottom sheet on phones). @param {import("@playwright/test").Page} page */
async function openLayers(page) {
  if (!(await page.locator("#layer-sheet").isVisible())) await page.locator("#open-layers").click();
  await expect(page.locator("#layer-sheet")).toBeVisible();
}

// Every test gets the mocks (`auto`), even if it never touches `net`.
/** @type {import("@playwright/test").TestType<import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions & { net: Net }, import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions>} */
const test = base.extend({ net: [netFixture, { auto: true }] });

module.exports = { test, expect, okReply, makeStations, json, openTab, stationCards, openLayers, isMobile, TRAFFIC_CAMERAS };
