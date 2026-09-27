// Water gates / pumping stations as small DOM pins; popups built on open.
import { waterGatePopupHtml } from "../templates.js";
import { createViewportMarkers } from "./viewport-markers.js";

/** @typedef {import("../types.js").WaterGate} WaterGate */

/** @param {L.Map} map */
export function createWaterGatesLayer(map) {
  const icon = L.divIcon({ className: "", html: '<div class="gate-pin" aria-hidden="true">⇅</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  return createViewportMarkers(map,
    /** @param {WaterGate} gate */
    (gate) => L.marker([gate.lat, gate.lng], { icon, zIndexOffset: 250, title: gate.name })
      .bindPopup(() => waterGatePopupHtml(gate)),
    // Dense gate pins only become useful at city scale.
    () => map.getZoom() >= 8);
}
