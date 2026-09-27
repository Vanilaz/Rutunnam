// Flooded-road reports as DOM pins (there are few of them, and they must stay clickable).
import { roadFloodPopupHtml } from "../templates.js";

/** @typedef {import("../types.js").RoadFlood} RoadFlood */

/** @param {L.Map} map */
export function createRoadFloodLayer(map) {
  // Created here, not at module load, so the app still starts when Leaflet failed to load.
  const icon = L.divIcon({ className: "", html: '<div class="road-flood-pin" aria-hidden="true">≈</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
  const group = L.layerGroup();
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  return {
    /** @param {RoadFlood[]} reports */
    update(reports) {
      group.clearLayers();
      markers.clear();
      for (const report of reports) {
        const marker = L.marker([report.lat, report.lng], { icon, zIndexOffset: 400, title: report.name })
          .bindPopup(roadFloodPopupHtml(report))
          .addTo(group);
        markers.set(report.id, marker);
      }
    },
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    /** @param {string} id */
    markerFor: (id) => markers.get(id)
  };
}
