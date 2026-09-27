// Reservoirs: a pill showing storage % in the Royal Irrigation Department class colour.
import { damStatus, DAM_STYLES } from "../reservoir.js";
import { damPopupHtml } from "../templates.js";
import { createViewportMarkers } from "./viewport-markers.js";

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
  return createViewportMarkers(map,
    /** @param {Dam} dam */
    (dam) => L.marker([dam.lat, dam.lng], { icon: damIcon(dam, damStatus(dam)), zIndexOffset: dam.size === "large" ? 350 : 150, title: dam.name })
      .bindPopup(() => damPopupHtml(dam, damStatus(dam))),
    (dam, zoom) => dam.size === "large" || zoom >= 8);
}
