// CCTV pins. A single refresh timer runs only while a camera popup is open.
import { DEFAULT_CAMERA_REFRESH_MS } from "../config.js";
import { cameraPopupHtml } from "../templates.js";

const CAMERA_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="15" height="12" rx="2"/><path d="m18 10 4-2v8l-4-2"/></svg>';
const POPUP_OPTIONS = Object.freeze({ maxWidth: 340, minWidth: 260, offset: [0, 24], autoPanPaddingTopLeft: [25, 85], autoPanPaddingBottomRight: [25, 25] });
const cameraIcon = (directory) => L.divIcon({ className: "", html: `<div class="camera-pin${directory ? " directory" : ""}">${CAMERA_SVG}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });

const cacheBusted = (url) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

export function createCamerasLayer(map, cameras) {
  const group = L.layerGroup().addTo(map);
  const markers = new Map();
  const icons = { image: cameraIcon(false), directory: cameraIcon(true) };
  let timer = null;

  const stopPreview = () => { if (timer) clearInterval(timer); timer = null; };

  function startPreview(popupElement, camera) {
    stopPreview();
    const img = popupElement?.querySelector(".camera-preview img");
    const error = popupElement?.querySelector(".camera-error");
    if (!img) return;
    img.onerror = () => { img.hidden = true; if (error) error.hidden = false; };
    img.onload = () => { img.hidden = false; if (error) error.hidden = true; };
    const refresh = () => { if (!document.hidden) img.src = cacheBusted(camera.image); };
    refresh();
    timer = setInterval(refresh, camera.refreshMs || DEFAULT_CAMERA_REFRESH_MS);
  }

  for (const camera of cameras) {
    const marker = L.marker([camera.lat, camera.lng], { icon: camera.directory ? icons.directory : icons.image, zIndexOffset: 300, title: camera.name, alt: camera.name })
      .bindPopup(cameraPopupHtml(camera), POPUP_OPTIONS)
      .addTo(group);
    if (camera.image) marker.on("popupopen", (event) => startPreview(event.popup.getElement(), camera));
    marker.on("popupclose", stopPreview);
    markers.set(camera.id, marker);
  }

  return {
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    isVisible: () => map.hasLayer(group),
    markerFor: (id) => markers.get(id),
    bounds: () => L.latLngBounds(cameras.map((camera) => [camera.lat, camera.lng]))
  };
}
