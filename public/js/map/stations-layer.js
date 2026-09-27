// Water-level stations drawn on Leaflet's canvas renderer (fast for 800+ points).
import { stationPopupHtml } from "../templates.js";

const MARKER_STYLE = Object.freeze({ radius: 6, color: "#fff", weight: 2, fillColor: "#0d9e9a", fillOpacity: 1 });

export function createStationsLayer(map) {
  const group = L.layerGroup().addTo(map);
  const markers = new Map();

  // Reuse markers across refreshes instead of rebuilding ~800 of them every two minutes.
  function update(stations) {
    const seen = new Set();
    for (const station of stations) {
      seen.add(station.id);
      const existing = markers.get(station.id);
      if (existing) {
        const { lat, lng } = existing.getLatLng();
        if (lat !== station.lat || lng !== station.lng) existing.setLatLng([station.lat, station.lng]);
        existing.station = station;
        if (existing.isPopupOpen()) existing.getPopup().update();
        continue;
      }
      const marker = L.circleMarker([station.lat, station.lng], MARKER_STYLE);
      marker.station = station;
      // Popup HTML is built lazily on open instead of up front for every station.
      marker.bindPopup((layer) => stationPopupHtml(layer.station));
      group.addLayer(marker);
      markers.set(station.id, marker);
    }
    for (const [id, marker] of markers) {
      if (!seen.has(id)) { group.removeLayer(marker); markers.delete(id); }
    }
  }

  return {
    update,
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    isVisible: () => map.hasLayer(group),
    markerFor: (id) => markers.get(id)
  };
}
