// Live traffic-flow tiles (TomTom by default), drawn over the basemap.
import { OVERLAY_TILE_PANE } from "./map.js";

const TRAFFIC_MAX_ZOOM = 20;
const TRAFFIC_REFRESH_MS = 2 * 60 * 1000;

/**
 * @param {L.Map} map
 * @param {{ tileUrl: string, attribution?: string, onError: () => void }} options
 */
export function createTrafficLayer(map, { tileUrl, attribution, onError }) {
  const layer = L.tileLayer(tileUrl, { maxZoom: TRAFFIC_MAX_ZOOM, pane: OVERLAY_TILE_PANE, attribution: attribution ?? "" });
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  let reported = false;
  layer.on("tileerror", () => { if (!reported) { reported = true; onError(); } });
  return {
    /** @param {boolean} visible */
    setVisible(visible) {
      if (timer) { clearInterval(timer); timer = null; }
      if (!visible) { map.removeLayer(layer); return; }
      layer.addTo(map);
      // Traffic changes minute to minute; re-request tiles while the layer is shown.
      timer = setInterval(() => { if (!document.hidden) layer.redraw(); }, TRAFFIC_REFRESH_MS);
    }
  };
}
