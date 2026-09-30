// Rain radar overlay: the newest RainViewer frame, re-checked every few minutes while shown.
import { FETCH_TIMEOUT_MS, RAIN_RADAR } from "../config.js";
import { latestRadarFrame } from "../radar.js";
import { OVERLAY_TILE_PANE } from "./map.js";

/** @typedef {import("../radar.js").RadarFrame} RadarFrame */

const FRAME_SWAP_TIMEOUT_MS = 15 * 1000;

/**
 * @param {L.Map} map
 * @param {{ onFrame: (frame: RadarFrame) => void, onError: (message: string) => void }} handlers
 */
export function createRadarLayer(map, { onFrame, onError }) {
  /** @type {L.TileLayer | null} */
  let layer = null;
  /** Every radar layer on the map, including an old frame waiting to be swapped out. @type {Set<L.TileLayer>} */
  const onMap = new Set();
  let currentUrl = "";
  let visible = false;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  async function refresh() {
    if (!visible || document.hidden) return;
    try {
      const response = await fetch(RAIN_RADAR.indexUrl, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const frame = latestRadarFrame(await response.json());
      if (!frame) throw new Error("no radar frame");
      if (!visible) return;
      if (frame.tileUrl !== currentUrl) {
        const next = L.tileLayer(frame.tileUrl, {
          pane: OVERLAY_TILE_PANE, opacity: RAIN_RADAR.opacity, maxNativeZoom: RAIN_RADAR.maxNativeZoom,
          tileSize: RAIN_RADAR.tileSize, attribution: RAIN_RADAR.attribution
        });
        next.addTo(map);
        onMap.add(next);
        // Swap only after the new frame is up (or given up on), so the radar never blinks off.
        const previous = layer;
        if (previous) {
          const drop = () => { clearTimeout(fallback); map.removeLayer(previous); onMap.delete(previous); };
          const fallback = setTimeout(drop, FRAME_SWAP_TIMEOUT_MS);
          next.once("load", drop);
        }
        layer = next;
        currentUrl = frame.tileUrl;
      }
      onFrame(frame);
    } catch (error) {
      console.warn("radar unavailable", error);
      onError("โหลดเรดาร์ฝนไม่ได้ในขณะนี้");
    }
  }

  return {
    /** @param {boolean} on */
    setVisible(on) {
      visible = on;
      if (timer) { clearInterval(timer); timer = null; }
      if (!on) {
        for (const shown of onMap) map.removeLayer(shown);
        onMap.clear();
        layer = null;
        currentUrl = "";
        return;
      }
      refresh();
      timer = setInterval(refresh, RAIN_RADAR.refreshMs);
    },
    refresh
  };
}
