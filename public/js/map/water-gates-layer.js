// Water gates / pumping stations as small DOM pins; popups built on open.
import { waterGatePopupHtml } from "../templates.js";

/** @typedef {import("../types.js").WaterGate} WaterGate */

/** @param {L.Map} map */
export function createWaterGatesLayer(map) {
  const icon = L.divIcon({ className: "", html: '<div class="gate-pin" aria-hidden="true">⇅</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  const group = L.layerGroup();
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  return {
    /** @param {WaterGate[]} gates */
    update(gates) {
      group.clearLayers();
      markers.clear();
      for (const gate of gates) {
        const marker = L.marker([gate.lat, gate.lng], { icon, zIndexOffset: 250, title: gate.name })
          .bindPopup(() => waterGatePopupHtml(gate))
          .addTo(group);
        markers.set(gate.id, marker);
      }
    },
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    /** @param {string} id */
    markerFor: (id) => markers.get(id)
  };
}
