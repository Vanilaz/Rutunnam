// "Home" and "my location" pins.

/** @param {"home" | "you"} kind */
const pinIcon = (kind) => L.divIcon({ className: "", html: `<div class="map-pin ${kind}" style="width:19px;height:19px"></div>`, iconSize: [19, 19], iconAnchor: [9, 9] });

/** @param {L.Map} map */
export function createLocationLayer(map) {
  const homeIcon = pinIcon("home");
  const youIcon = pinIcon("you");
  /** @type {L.Marker | null} */
  let homeMarker = null;
  /** @type {L.Marker | null} */
  let youMarker = null;

  /**
   * Create, move or remove a pin so it matches `latlng`.
   * @param {L.Marker | null} marker
   * @param {L.LatLngTuple | null} latlng
   * @param {L.DivIcon} icon
   * @param {number} zIndexOffset
   * @param {string} popup
   * @returns {L.Marker | null}
   */
  function place(marker, latlng, icon, zIndexOffset, popup) {
    if (!latlng) { if (marker) map.removeLayer(marker); return null; }
    if (marker) return marker.setLatLng(latlng);
    return L.marker(latlng, { icon, zIndexOffset }).bindPopup(popup).addTo(map);
  }

  return {
    /** @param {{ home: import("../types.js").Home | null, you: import("../types.js").LatLngTuple | null }} where */
    update({ home, you }) {
      homeMarker = place(homeMarker, home ? [home.lat, home.lng] : null, homeIcon, 1000, "<strong>บ้านของฉัน</strong><br><small>หมุดที่บันทึกไว้ในเครื่องนี้</small>");
      youMarker = place(youMarker, you, youIcon, 900, "<strong>ตำแหน่งฉัน</strong><br><small>พิกัดโดยประมาณจากอุปกรณ์</small>");
    }
  };
}
