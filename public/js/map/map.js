// Leaflet map bootstrap and shared camera-movement helpers.
import { DEFAULT_ZOOM } from "../config.js";

/**
 * @param {string} containerId
 * @param {import("../types.js").LatLngTuple} center
 * @returns {L.Map | null} null when Leaflet failed to load from the CDN.
 */
export function createMap(containerId, center) {
  if (typeof window.L === "undefined") return null;
  const map = L.map(containerId, { zoomControl: false, preferCanvas: true }).setView(center, DEFAULT_ZOOM);
  L.control.zoom({ position: "bottomright" }).addTo(map);
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
