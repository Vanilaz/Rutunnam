// Water-level stations drawn on Leaflet's canvas renderer (fast for 800+ points).
import { stationPopupHtml } from "../templates.js";

/** @typedef {import("../types.js").Station} Station */

/** @type {L.CircleMarkerOptions} */
const MARKER_STYLE = Object.freeze({ radius: 6, color: "#fff", weight: 2, fillColor: "#0d9e9a", fillOpacity: 1 });

/** @param {L.Map} map */
export function createStationsLayer(map) {
  const group = L.layerGroup().addTo(map);
  /** @type {Map<string, L.CircleMarker>} */
  const markers = new Map();
  /** @type {Map<string, Station>} Latest data per id; popups read from here when opened. */
  const latest = new Map();

  /**
   * Reuse markers across refreshes instead of rebuilding ~800 of them every two minutes.
   * @param {Station[]} stations
   */
  function update(stations) {
    latest.clear();
    for (const station of stations) {
      latest.set(station.id, station);
      const existing = markers.get(station.id);
      if (existing) {
        const { lat, lng } = existing.getLatLng();
        if (lat !== station.lat || lng !== station.lng) existing.setLatLng([station.lat, station.lng]);
        if (existing.isPopupOpen()) existing.getPopup()?.update();
        continue;
      }
      const id = station.id;
      const marker = L.circleMarker([station.lat, station.lng], MARKER_STYLE);
      // Popup HTML is built lazily on open instead of up front for every station.
      marker.bindPopup(() => { const current = latest.get(id); return current ? stationPopupHtml(current) : ""; });
      group.addLayer(marker);
      markers.set(id, marker);
    }
    for (const [id, marker] of markers) {
      if (!latest.has(id)) { group.removeLayer(marker); markers.delete(id); }
    }
  }

  return {
    update,
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    isVisible: () => map.hasLayer(group),
    /** @param {string} id */
    markerFor: (id) => markers.get(id)
  };
}
