// Leaflet map bootstrap and shared camera-movement helpers.
import { DEFAULT_ZOOM, LABEL_MIN_ZOOM } from "../config.js";

export const OVERLAY_TILE_PANE = "overlayTiles";
const OVERLAY_TILE_Z_INDEX = 350; // Between Leaflet's tilePane (200) and overlayPane (400).

/**
 * @param {string} containerId
 * @param {import("../types.js").LatLngTuple} center
 * @returns {L.Map | null} null when Leaflet failed to load from the CDN.
 */
export function createMap(containerId, center) {
  if (typeof window.L === "undefined") return null;
  const map = L.map(containerId, { zoomControl: false, preferCanvas: true }).setView(center, DEFAULT_ZOOM);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // Flood-extent and traffic tiles sit above the basemap (incl. the MapLibre canvas) but below markers.
  const overlayTiles = map.createPane(OVERLAY_TILE_PANE);
  overlayTiles.style.zIndex = String(OVERLAY_TILE_Z_INDEX);
  overlayTiles.style.pointerEvents = "none";
  // Lets CSS show station labels only when zoomed in far enough to read them.
  const container = map.getContainer();
  const syncZoomClass = () => container.classList.toggle("show-labels", map.getZoom() >= LABEL_MIN_ZOOM);
  map.on("zoomend", syncZoomClass);
  syncZoomClass();
  // Hide the floating search/badge while a popup is open so the popup is never covered.
  const panel = map.getContainer().closest(".map-panel");
  map.on("popupopen", () => panel?.classList.add("showing-popup"));
  map.on("popupclose", () => panel?.classList.remove("showing-popup"));
  return map;
}

/** @type {(() => void) | null} */
let pendingFocus = null;

/**
 * Fly to a point and open the marker's popup once the animation ends;
 * opening it mid-flight makes autoPan fight the fly animation.
 * @param {L.Map | null} map
 * @param {L.LatLngExpression} latlng
 * @param {number} zoom
 * @param {L.Layer} [marker]
 */
export function focusOnMap(map, latlng, zoom, marker) {
  if (!map) return;
  if (pendingFocus) map.off("moveend", pendingFocus);
  const handler = () => {
    pendingFocus = null;
    if (marker && map.hasLayer(marker)) marker.openPopup();
  };
  pendingFocus = handler;
  map.once("moveend", handler);
  map.flyTo(latlng, zoom);
}
