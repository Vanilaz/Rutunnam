// Leaflet map bootstrap and shared camera-movement helpers.
import { DEFAULT_ZOOM } from "../config.js";

export function createMap(containerId, center) {
  if (!window.L) return null;
  const map = L.map(containerId, { zoomControl: false, preferCanvas: true }).setView(center, DEFAULT_ZOOM);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // Hide the floating search/badge while a popup is open so the popup is never covered.
  const panel = map.getContainer().closest(".map-panel");
  map.on("popupopen", () => panel?.classList.add("showing-popup"));
  map.on("popupclose", () => panel?.classList.remove("showing-popup"));
  return map;
}

let pendingFocus = null;
// Open the popup only once flyTo has finished; opening it mid-flight makes autoPan fight the animation.
export function focusOnMap(map, latlng, zoom, marker) {
  if (!map) return;
  if (pendingFocus) map.off("moveend", pendingFocus);
  pendingFocus = () => {
    pendingFocus = null;
    if (marker && map.hasLayer(marker)) marker.openPopup();
  };
  map.once("moveend", pendingFocus);
  map.flyTo(latlng, zoom);
}
