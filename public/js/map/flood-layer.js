// GISTDA satellite flood extent, served as WMS tiles through /api/flood-wms (keeps the key server-side).
import { OVERLAY_TILE_PANE } from "./map.js";

const FLOOD_OPACITY = 0.7;
const FLOOD_TILE_PX = 512; // Fewer, larger tiles = fewer proxy calls.
const FLOOD_MIN_ZOOM = 6;

/**
 * @param {L.Map} map
 * @param {{ wmsUrl: string, onError: () => void }} options
 */
export function createFloodLayer(map, { wmsUrl, onError }) {
  const layer = L.tileLayer.wms(wmsUrl, {
    layers: "flood",
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    tileSize: FLOOD_TILE_PX,
    opacity: FLOOD_OPACITY,
    minZoom: FLOOD_MIN_ZOOM,
    pane: OVERLAY_TILE_PANE,
    attribution: 'พื้นที่น้ำท่วม &copy; <a href="https://disaster.gistda.or.th/flood" target="_blank" rel="noopener noreferrer">GISTDA</a>'
  });
  let reported = false;
  // Report once per session; a broken key or outage would otherwise fire for every tile.
  layer.on("tileerror", () => { if (!reported) { reported = true; onError(); } });
  return {
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) layer.addTo(map); else map.removeLayer(layer); }
  };
}
