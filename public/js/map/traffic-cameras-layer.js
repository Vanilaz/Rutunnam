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
  /** @type {ReturnType<typeof setInterval> | null} */
  let refreshTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let loadTimeout = null;
  const stopRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer);
    if (loadTimeout) clearTimeout(loadTimeout);
    refreshTimer = null;
    loadTimeout = null;
  };
  map.on("popupclose", stopRefresh);
  return {
    /** @param {TrafficCamera[]} cameras */
    update(cameras) {
      stopRefresh();
      group.clearLayers();
      markers.clear();
      for (const camera of cameras) {
        const kind = camera.hls ? "วิดีโอสด" : "ภาพนิ่งอัปเดตเป็นระยะ";
        const marker = L.marker([camera.lat, camera.lng], { icon, zIndexOffset: 200, title: camera.name })
          .bindPopup(`<div class="camera-popup"><strong>${esc(camera.name)}</strong><small>${esc(camera.org || "กล้องจราจร")} · ${kind}</small>${camera.image ? '<img class="camera-popup-image" alt="ภาพจากกล้อง" loading="lazy"><small class="camera-popup-status">กำลังโหลดภาพ...</small>' : '<small>แตะปุ่มเพื่อดูวิดีโอสด</small>'}<button type="button" class="link-button" data-open-traffic-camera>ดูภาพเต็มจอ</button></div>`, { minWidth: 250, maxWidth: 300 })
          .addTo(group);
        marker.on("popupopen", (event) => {
          stopRefresh();
          const element = event.popup.getElement();
          element?.querySelector("[data-open-traffic-camera]")?.addEventListener("click", () => onOpen(camera), { once: true });
          const img = element?.querySelector(".camera-popup-image");
          const status = element?.querySelector(".camera-popup-status");
          if (img instanceof HTMLImageElement && camera.image) {
            img.onload = () => {
              if (loadTimeout) clearTimeout(loadTimeout);
              img.style.display = "block";
              if (status) status.textContent = "ภาพล่าสุดจากกล้อง";
            };
            img.onerror = () => {
              if (loadTimeout) clearTimeout(loadTimeout);
              if (status) status.textContent = "กล้องไม่ส่งภาพในขณะนี้";
              img.style.display = "none";
            };
            const refresh = () => {
              if (document.hidden || !camera.image) return;
              if (loadTimeout) clearTimeout(loadTimeout);
              loadTimeout = setTimeout(() => { if (!img.complete || !img.naturalWidth) { img.style.display = "none"; if (status) status.textContent = "กล้องไม่ตอบสนอง ลองดูภาพเต็มจอ"; } }, 10000);
              img.src = `${camera.image}${camera.image.includes("?") ? "&" : "?"}t=${Date.now()}`;
            };
            refresh();
            refreshTimer = setInterval(refresh, 30000);
          }
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
