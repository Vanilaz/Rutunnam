// @ts-check
// Network fixtures for the browser tests. The app's own /api/water is always
// mocked; third-party tiles and camera images are stubbed so runs are deterministic.
const fs = require("node:fs");
const path = require("node:path");
const { test: base, expect } = require("@playwright/test");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
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

const TRAFFIC_CAMERAS = [
  { id: "itic-near", name: "แยกรังสิต", org: "กรมทางหลวง", lat: 13.99, lng: 100.62, image: "https://cam.example.go.th/near.jpg", hls: null },
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
 * @typedef {{ api: (reply: ApiReply | (() => ApiReply)) => void, config: (reply: ApiReply) => void, roadFlood: (reply: ApiReply) => void, trafficCameras: (reply: ApiReply) => void,
 *   vectorStyle: (ok: boolean) => void, pageErrors: string[], requests: string[] }} Net
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
  /** @type {string[]} */
  const requests = [];
  let styleOk = false;
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
    if (pathname === "/api/traffic-cameras") return route.fulfill({ status: trafficCameras.status, body: trafficCameras.body, contentType: "application/json" });
    if (host === "camera1.iticfoundation.org") return route.abort();
    if (pathname === "/api/road-flood") return route.fulfill({ status: roadFlood.status, body: roadFlood.body, contentType: "application/json" });
    if (pathname === "/api/flood-wms") return route.fulfill({ body: PNG, contentType: "image/png" });
    if (host.startsWith("localhost")) return route.continue();
    const mirrored = MIRROR && MIRROR_FILES[/** @type {keyof typeof MIRROR_FILES} */ (`${host}${pathname}`)];
    if (mirrored) {
      return route.fulfill({ body: fs.readFileSync(path.join(/** @type {string} */ (MIRROR), mirrored)), contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript", headers: CORS });
    }
    if (host === "cdnjs.cloudflare.com" || host === "unpkg.com") return route.continue();
    if (host === "tiles.openfreemap.org" && pathname.startsWith("/styles/")) {
      return styleOk ? route.fulfill({ body: MIN_STYLE, contentType: "application/json", headers: CORS }) : route.abort();
    }
    if (route.request().resourceType() === "image") return route.fulfill({ body: PNG, contentType: "image/png", headers: CORS });
    return route.abort();
  });
  await use({
    api: (reply) => { api = reply; },
    config: (reply) => { config = reply; },
    roadFlood: (reply) => { roadFlood = reply; },
    trafficCameras: (reply) => { trafficCameras = reply; },
    requests,
    vectorStyle: (ok) => { styleOk = ok; },
    pageErrors
  });
}

/** Desktop uses the tab row; phones use the bottom menu, where the risk page also lists nearby stations. */
const isMobile = () => base.info().project.name === "mobile";

/** @param {import("@playwright/test").Page} page @param {"water" | "risk" | "flood" | "camera" | "road"} tab */
async function openTab(page, tab) {
  if (isMobile()) await page.locator(`[data-nav="${tab === "water" ? "risk" : tab}"]`).click();
  else await page.locator(`.tab[data-tab="${tab}"]`).click();
}

/** Plain station cards (not risk cards) in whichever list shows nearby stations. @param {import("@playwright/test").Page} page */
const stationCards = (page) => page.locator("#tab-content .station-card[data-station]:not(.risk-card)");

/** On phones the layer switches live in a sheet behind the filter button. @param {import("@playwright/test").Page} page */
async function openLayers(page) {
  if (isMobile()) await page.locator("#open-layers").click();
}

// Every test gets the mocks (`auto`), even if it never touches `net`.
/** @type {import("@playwright/test").TestType<import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions & { net: Net }, import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions>} */
const test = base.extend({ net: [netFixture, { auto: true }] });

module.exports = { test, expect, okReply, makeStations, json, openTab, stationCards, openLayers, isMobile };
