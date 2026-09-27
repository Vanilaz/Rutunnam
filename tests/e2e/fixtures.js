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
  "unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js": "leaflet-maplibre-gl.js"
};

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
    measuredAt: new Date().toISOString(),
    sourceUrl: "https://www.thaiwater.net/"
  }));
}

/**
 * @typedef {{ status: number, body: string, contentType?: string }} ApiReply
 * @typedef {{ api: (reply: ApiReply | (() => ApiReply)) => void, vectorStyle: (ok: boolean) => void, pageErrors: string[] }} Net
 */

const okReply = (stations = makeStations(30), extra = {}) => ({ status: 200, body: JSON.stringify({ stations, fetchedAt: new Date().toISOString(), ...extra }) });

/**
 * @param {{ page: import("@playwright/test").Page }} args
 * @param {(net: Net) => Promise<void>} use
 */
async function netFixture({ page }, use) {
  /** @type {ApiReply | (() => ApiReply)} */
  let api = okReply();
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
    if (pathname === "/api/water") {
      const reply = typeof api === "function" ? api() : api;
      return route.fulfill({ status: reply.status, body: reply.body, contentType: reply.contentType || "application/json" });
    }
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
    vectorStyle: (ok) => { styleOk = ok; },
    pageErrors
  });
}

// Every test gets the mocks (`auto`), even if it never touches `net`.
/** @type {import("@playwright/test").TestType<import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions & { net: Net }, import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions>} */
const test = base.extend({ net: [netFixture, { auto: true }] });

module.exports = { test, expect, okReply, makeStations };
