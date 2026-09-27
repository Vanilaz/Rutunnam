// Raster OpenStreetMap base layer with an optional MapLibre vector style on top.
import { MAPLIBRE_ASSETS, OSM_ATTRIBUTION, OSM_TILE_URL, VECTOR_ATTRIBUTION, VECTOR_STYLE_URL } from "../config.js";

/** @type {boolean | null} */
let webglSupport = null;
function supportsWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    webglSupport = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch (_) { webglSupport = false; }
  return webglSupport;
}

/** @param {{ src: string, integrity: string }} asset @returns {Promise<void>} */
function loadScript({ src, integrity }) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    Object.assign(script, { src, integrity, crossOrigin: "anonymous", async: false });
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error(`โหลด ${src} ไม่ได้`)); };
    document.head.append(script);
  });
}

/** @param {{ href: string, integrity: string }} asset */
function loadStylesheet({ href, integrity }) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href, integrity, crossOrigin: "anonymous" });
  document.head.append(link);
}

const mapLibreReady = () => Boolean(window.maplibregl) && typeof L.maplibreGL === "function";

/** @type {Promise<void> | null} */
let mapLibreLoader = null;
/** @returns {Promise<void>} */
function loadMapLibre() {
  if (mapLibreReady()) return Promise.resolve();
  mapLibreLoader ??= (async () => {
    loadStylesheet(MAPLIBRE_ASSETS.stylesheet);
    for (const asset of MAPLIBRE_ASSETS.scripts) await loadScript(asset);
    if (!mapLibreReady()) throw new Error("MapLibre ไม่พร้อมใช้งาน");
  })().catch((error) => { mapLibreLoader = null; throw error; }); // Allow a retry after a network failure.
  return mapLibreLoader;
}

/**
 * If MapLibre throws inside onAdd the plugin has no GL map, and its own onRemove would throw as well.
 * @param {L.Map} map
 * @param {import("leaflet").MaplibreGLLayer | null} layer
 */
function discardVectorLayer(map, layer) {
  if (!layer) return;
  if (!layer.getMaplibreMap()) {
    layer.onRemove = function () {
      const container = layer.getContainer();
      if (container) L.DomUtil.remove(container);
      return this;
    };
  }
  try { map.removeLayer(layer); } catch (_) { /* Layer was never fully attached. */ }
}

/**
 * @param {L.Map} map
 * @param {{ onFallback?: () => void }} [options] called when the vector style cannot be used.
 */
export function createBasemap(map, { onFallback } = {}) {
  const raster = L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
  /** @type {import("leaflet").MaplibreGLLayer | null} */
  let vector = null;
  let request = 0; // Invalidates async work when the user switches style again.

  const showRaster = () => { if (!map.hasLayer(raster)) raster.addTo(map); };
  const removeVector = () => { discardVectorLayer(map, vector); vector = null; };
  function fallback() {
    request += 1;
    removeVector();
    showRaster();
    onFallback?.();
  }

  function attachVector() {
    /** @type {import("leaflet").MaplibreGLLayer | null} */
    let layer = null;
    try {
      layer = L.maplibreGL({ style: VECTOR_STYLE_URL, attributionControl: { customAttribution: VECTOR_ATTRIBUTION } });
      layer.addTo(map);
    } catch (_) { discardVectorLayer(map, layer); fallback(); return; }
    const gl = layer.getMaplibreMap();
    if (!gl) { discardVectorLayer(map, layer); fallback(); return; }
    const attached = layer;
    vector = attached;
    let rendered = false;
    gl.once("load", () => {
      rendered = true;
      if (vector === attached && map.hasLayer(raster)) map.removeLayer(raster);
    });
    // A tile error after the first render is harmless; only a style that never renders needs the raster fallback.
    // Defer so the GL map is not removed while it is still dispatching this event.
    gl.on("error", () => { if (!rendered && vector === attached) setTimeout(() => { if (vector === attached) fallback(); }, 0); });
  }

  /** @param {string} style "vector" or "classic" */
  async function setStyle(style) {
    const current = ++request;
    if (style !== "vector") { removeVector(); showRaster(); return; }
    if (vector) return;
    showRaster(); // Keep the raster map visible until the vector style has rendered.
    if (!supportsWebGL()) { fallback(); return; }
    try { await loadMapLibre(); } catch (_) { if (current === request) fallback(); return; }
    if (current === request && !vector) attachVector();
  }

  return { setStyle };
}
