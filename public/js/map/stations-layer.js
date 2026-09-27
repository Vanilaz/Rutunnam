// Water-level stations drawn on Leaflet's canvas renderer (fast for 800+ points),
// coloured by bank risk. Stations over the bank also get a pulsing DOM pin with a label.
import { MAX_PULSE_MARKERS } from "../config.js";
import { formatMargin, RISK_STYLES, stationRisk } from "../risk.js";
import { escapeHtml } from "../utils.js";
import { stationPopupHtml } from "../templates.js";

/** @typedef {import("../types.js").Station} Station */
/** @typedef {import("../types.js").RiskStatus} RiskStatus */

const BASE_RADIUS = 6;
const RISK_RADIUS = 8;

/** @param {RiskStatus} status @returns {L.CircleMarkerOptions} */
const markerStyle = (status) => ({
  radius: status === "overflow" || status === "high" ? RISK_RADIUS : BASE_RADIUS,
  color: "#fff",
  weight: 2,
  fillColor: RISK_STYLES[status].color,
  fillOpacity: status === "stale" ? 0.7 : 1
});

/** @param {string} label */
const pulseIcon = (label) => L.divIcon({
  className: "",
  html: `<div class="overflow-pin"><span class="overflow-ring"></span><span class="overflow-label">${escapeHtml(label)}</span></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

/** @param {L.Map} map */
export function createStationsLayer(map) {
  const group = L.layerGroup().addTo(map);
  const pulseGroup = L.layerGroup().addTo(map);
  /** @type {Map<string, L.CircleMarker>} */
  const markers = new Map();
  /** @type {Map<string, Station>} Latest data per id; popups read from here when opened. */
  const latest = new Map();
  /** @type {Map<string, RiskStatus>} */
  const statuses = new Map();
  let riskOnly = false;
  let visible = true;

  const openStation = (/** @type {string} */ id) => markers.get(id)?.openPopup();

  function applyVisibility() {
    const wanted = visible ? (riskOnly ? "risk" : "all") : "none";
    for (const [id, marker] of markers) {
      const status = statuses.get(id) ?? "unknown";
      const show = wanted === "all" || (wanted === "risk" && (status === "overflow" || status === "high"));
      if (show && !group.hasLayer(marker)) group.addLayer(marker);
      if (!show && group.hasLayer(marker)) group.removeLayer(marker);
    }
    if (visible && !map.hasLayer(pulseGroup)) pulseGroup.addTo(map);
    if (!visible && map.hasLayer(pulseGroup)) map.removeLayer(pulseGroup);
  }

  /**
   * Reuse markers across refreshes instead of rebuilding ~800 of them every two minutes.
   * @param {Station[]} stations
   */
  function update(stations) {
    const now = Date.now();
    latest.clear();
    pulseGroup.clearLayers();
    let pulses = 0;
    for (const station of stations) {
      const { id } = station;
      latest.set(id, station);
      const risk = stationRisk(station, now);
      let marker = markers.get(id);
      if (marker) {
        const { lat, lng } = marker.getLatLng();
        if (lat !== station.lat || lng !== station.lng) marker.setLatLng([station.lat, station.lng]);
        if (statuses.get(id) !== risk.status) marker.setStyle(markerStyle(risk.status));
        if (marker.isPopupOpen()) marker.getPopup()?.update();
      } else {
        marker = L.circleMarker([station.lat, station.lng], markerStyle(risk.status));
        // Popup HTML is built lazily on open instead of up front for every station.
        marker.bindPopup(() => { const current = latest.get(id); return current ? stationPopupHtml(current, stationRisk(current)) : ""; });
        markers.set(id, marker);
      }
      statuses.set(id, risk.status);
      if (risk.status === "overflow" && pulses < MAX_PULSE_MARKERS) {
        pulses += 1;
        const label = risk.margin !== null ? formatMargin(risk.margin) : "ล้นตลิ่ง";
        L.marker([station.lat, station.lng], { icon: pulseIcon(label), zIndexOffset: 500, keyboard: false, title: `${station.name} · ล้นตลิ่ง` })
          .on("click", () => openStation(id))
          .addTo(pulseGroup);
      }
    }
    for (const [id, marker] of markers) {
      if (!latest.has(id)) { group.removeLayer(marker); markers.delete(id); statuses.delete(id); }
    }
    applyVisibility();
  }

  return {
    update,
    /** @param {boolean} value */
    setVisible(value) { visible = value; applyVisibility(); },
    /** Show only stations over or near the bank. @param {boolean} value */
    setRiskOnly(value) { riskOnly = value; applyVisibility(); },
    isVisible: () => visible,
    /** @param {string} id */
    markerFor: (id) => markers.get(id),
    /** @param {string} id */
    isAtRisk: (id) => { const status = statuses.get(id); return status === "overflow" || status === "high"; }
  };
}

