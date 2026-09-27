// CCTV pins. A single refresh timer runs only while a camera popup is open.
import { DEFAULT_CAMERA_REFRESH_MS, HLS_JS_ASSET } from "../config.js";
import { loadScript } from "../load.js";
import { cameraPopupHtml } from "../templates.js";

/** @typedef {Readonly<import("../types.js").Camera>} Camera */

const CAMERA_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="15" height="12" rx="2"/><path d="m18 10 4-2v8l-4-2"/></svg>';
/** @type {L.PopupOptions} */
const POPUP_OPTIONS = { maxWidth: 340, minWidth: 260, offset: [0, 24], autoPanPaddingTopLeft: [25, 85], autoPanPaddingBottomRight: [25, 25] };
/** @param {boolean} directory */
const cameraIcon = (directory) => L.divIcon({ className: "", html: `<div class="camera-pin${directory ? " directory" : ""}">${CAMERA_SVG}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });

/** @param {string} url */
const cacheBusted = (url) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

/**
 * @param {L.Map} map
 * @param {ReadonlyArray<Camera>} cameras
 * @param {{ onOpen?: (camera: Camera) => void }} [handlers]
 */
export function createCamerasLayer(map, cameras, { onOpen } = {}) {
  const group = L.layerGroup().addTo(map);
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  const icons = { image: cameraIcon(false), directory: cameraIcon(true) };
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  /** @type {{ destroy: () => void } | null} */
  let hlsPlayer = null;
  let videoSession = 0;

  const stopPreview = () => {
    videoSession++;
    if (timer) clearInterval(timer);
    timer = null;
    hlsPlayer?.destroy(); hlsPlayer = null;
  };

  /** @param {HTMLElement | undefined} popupElement @param {Camera} camera */
  async function startVideo(popupElement, camera) {
    stopPreview();
    const current = videoSession;
    const video = popupElement?.querySelector("video");
    const error = popupElement?.querySelector(".camera-error");
    if (!(video instanceof HTMLVideoElement) || !camera.hls) return;
    const failed = () => { if (videoSession === current && error instanceof HTMLElement) error.hidden = false; };
    video.onerror = failed;
    if (video.canPlayType("application/vnd.apple.mpegurl")) { video.src = camera.hls; video.play().catch(failed); return; }
    try { await loadScript(HLS_JS_ASSET); } catch (_) { failed(); return; }
    if (videoSession !== current) return;
    const Hls = /** @type {any} */ (window).Hls;
    if (!Hls?.isSupported()) { failed(); return; }
    const player = new Hls({ maxBufferLength: 10 });
    hlsPlayer = player;
    player.on(Hls.Events.ERROR, (/** @type {unknown} */ _event, /** @type {{ fatal?: boolean }} */ data) => { if (data.fatal) failed(); });
    player.loadSource(camera.hls);
    player.attachMedia(video);
  }

  /** @param {HTMLElement | undefined} popupElement @param {string} imageUrl @param {number} refreshMs */
  function startPreview(popupElement, imageUrl, refreshMs) {
    stopPreview();
    const img = popupElement?.querySelector("img");
    const error = popupElement?.querySelector(".camera-error");
    if (!(img instanceof HTMLImageElement)) return;
    img.onerror = () => { img.hidden = true; if (error instanceof HTMLElement) error.hidden = false; };
    img.onload = () => { img.hidden = false; if (error instanceof HTMLElement) error.hidden = true; };
    const refresh = () => { if (!document.hidden) img.src = cacheBusted(imageUrl); };
    refresh();
    timer = setInterval(refresh, refreshMs);
  }

  for (const camera of cameras) {
    const marker = L.marker([camera.lat, camera.lng], { icon: camera.directory ? icons.directory : icons.image, zIndexOffset: 300, title: camera.name, alt: camera.name })
      .bindPopup(cameraPopupHtml(camera), POPUP_OPTIONS)
      .addTo(group);
    const { image } = camera;
    if (image) marker.on("popupopen", (event) => startPreview(event.popup.getElement(), image, camera.refreshMs || DEFAULT_CAMERA_REFRESH_MS));
    if (camera.hls) marker.on("popupopen", (event) => {
      startVideo(event.popup.getElement(), camera);
      event.popup.getElement()?.querySelector(".camera-fullscreen")?.addEventListener("click", () => onOpen?.(camera));
    });
    marker.on("popupclose", stopPreview);
    markers.set(camera.id, marker);
  }

  return {
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    isVisible: () => map.hasLayer(group),
    /** @param {string} id */
    markerFor: (id) => markers.get(id),
    bounds: () => L.latLngBounds(cameras.map((camera) => /** @type {L.LatLngTuple} */ ([camera.lat, camera.lng])))
  };
}
