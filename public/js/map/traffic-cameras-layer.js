// Nationwide traffic cameras (iTIC / Longdo feed). Popups link to the camera viewer.
import { escapeHtml as esc } from "../utils.js";

/** @typedef {import("../types.js").TrafficCamera} TrafficCamera */

const CAMERA_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="15" height="12" rx="2"/><path d="m18 10 4-2v8l-4-2"/></svg>';

/**
 * @param {L.Map} map
 * @param {{ onOpen: (camera: TrafficCamera) => void }} handlers
 */
export function createTrafficCamerasLayer(map, { onOpen }) {
  const icon = L.divIcon({ className: "", html: `<div class="traffic-cam-pin">${CAMERA_SVG}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  const group = L.layerGroup();
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  return {
    /** @param {TrafficCamera[]} cameras */
    update(cameras) {
      group.clearLayers();
      markers.clear();
      for (const camera of cameras) {
        const kind = camera.hls ? "วิดีโอสด" : "ภาพนิ่งอัปเดตเป็นระยะ";
        const marker = L.marker([camera.lat, camera.lng], { icon, zIndexOffset: 200, title: camera.name })
          .bindPopup(`<div class="camera-popup"><strong>${esc(camera.name)}</strong><small>${esc(camera.org || "กล้องจราจร")} · ${kind}</small><button type="button" class="link-button" data-open-traffic-camera>ดูกล้อง</button></div>`)
          .addTo(group);
        marker.on("popupopen", (event) => {
          event.popup.getElement()?.querySelector("[data-open-traffic-camera]")?.addEventListener("click", () => onOpen(camera), { once: true });
        });
        markers.set(camera.id, marker);
      }
    },
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    /** @param {string} id */
    markerFor: (id) => markers.get(id)
  };
}
