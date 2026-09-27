// Reservoirs: a pill showing storage % in the Royal Irrigation Department class colour.
import { damStatus, DAM_STYLES } from "../reservoir.js";
import { damPopupHtml } from "../templates.js";

/** @typedef {import("../types.js").Dam} Dam */

/** @param {Dam} dam @param {import("../types.js").DamStatus} status */
function damIcon(dam, status) {
  const label = dam.percent !== null && status !== "stale" ? `${Math.round(dam.percent)}%` : "–";
  const large = dam.size === "large";
  return L.divIcon({
    className: "",
    html: `<div class="dam-pin${large ? " is-large" : ""}" style="--dam-color:${DAM_STYLES[status].color}"><span aria-hidden="true">▼</span>${label}</div>`,
    iconSize: large ? [58, 24] : [48, 20],
    iconAnchor: large ? [29, 12] : [24, 10]
  });
}

/** @param {L.Map} map */
export function createDamsLayer(map) {
  const group = L.layerGroup();
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  return {
    /** @param {Dam[]} dams */
    update(dams) {
      const now = Date.now();
      group.clearLayers();
      markers.clear();
      for (const dam of dams) {
        const status = damStatus(dam, now);
        const marker = L.marker([dam.lat, dam.lng], { icon: damIcon(dam, status), zIndexOffset: dam.size === "large" ? 350 : 150, title: dam.name })
          .bindPopup(() => damPopupHtml(dam, damStatus(dam)))
          .addTo(group);
        markers.set(dam.id, marker);
      }
    },
    /** @param {boolean} visible */
    setVisible: (visible) => { if (visible) group.addTo(map); else map.removeLayer(group); },
    /** @param {string} id */
    markerFor: (id) => markers.get(id)
  };
}
