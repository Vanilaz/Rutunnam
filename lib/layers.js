// @ts-check
// Optional map layers that depend on third-party API keys (Vercel environment variables).

const { version: APP_VERSION } = require("../package.json");

const GISTDA_WMS_BASE = "https://api-gateway.gistda.or.th/api/2.0/resources/maps/flood";
const FLOOD_PERIODS = new Set(["1day", "3days", "7days"]);
const DEFAULT_FLOOD_PERIOD = "7days";
const TOMTOM_FLOW_STYLE = "relative0"; // Colour = current speed relative to free-flow speed.

/** @param {NodeJS.ProcessEnv} env */
function floodPeriod(env) {
  const period = env.GISTDA_FLOOD_PERIOD ?? DEFAULT_FLOOD_PERIOD;
  return FLOOD_PERIODS.has(period) ? period : DEFAULT_FLOOD_PERIOD;
}

/** @param {NodeJS.ProcessEnv} env */
const gistdaKey = (env) => env.GISTDA_API_KEY?.trim() || null;

/** @param {NodeJS.ProcessEnv} env @returns {string} */
const gistdaWmsUrl = (env) => `${GISTDA_WMS_BASE}/${floodPeriod(env)}/wms`;

/**
 * Traffic tiles are fetched by the browser directly, so the key is visible to users by design.
 * Restrict the TomTom key to your domain in the TomTom dashboard.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ tileUrl: string, attribution: string } | null}
 */
function trafficLayer(env) {
  const custom = env.TRAFFIC_TILE_URL?.trim();
  if (custom && /^https:\/\//.test(custom) && ["{z}", "{x}", "{y}"].every((token) => custom.includes(token))) {
    return { tileUrl: custom, attribution: env.TRAFFIC_ATTRIBUTION?.trim() || "Traffic data" };
  }
  const key = env.TOMTOM_API_KEY?.trim();
  if (!key) return null;
  return {
    tileUrl: `https://api.tomtom.com/traffic/map/4/tile/flow/${TOMTOM_FLOW_STYLE}/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}&tileSize=256`,
    attribution: 'Traffic &copy; <a href="https://www.tomtom.com/" target="_blank" rel="noopener noreferrer">TomTom</a>'
  };
}

/** @param {NodeJS.ProcessEnv} env */
function publicConfig(env) {
  return {
    flood: gistdaKey(env) ? { available: true, period: floodPeriod(env), wmsUrl: "/api/flood-wms" } : { available: false },
    traffic: trafficLayer(env) ? { available: true, ...trafficLayer(env) } : { available: false },
    roadFlood: { available: true, url: "/api/road-flood" },
    version: APP_VERSION
  };
}

module.exports = { publicConfig, gistdaKey, gistdaWmsUrl, trafficLayer, floodPeriod };
