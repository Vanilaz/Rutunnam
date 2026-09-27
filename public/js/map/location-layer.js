// "Home" and "my location" pins.
const pinIcon = (kind) => L.divIcon({ className: "", html: `<div class="map-pin ${kind}" style="width:19px;height:19px"></div>`, iconSize: [19, 19], iconAnchor: [9, 9] });

export function createLocationLayer(map) {
  const homeIcon = pinIcon("home");
  const youIcon = pinIcon("you");
  let homeMarker = null;
  let youMarker = null;

  function place(marker, latlng, icon, zIndexOffset, popup) {
    if (!latlng) { if (marker) map.removeLayer(marker); return null; }
    if (marker) return marker.setLatLng(latlng);
    return L.marker(latlng, { icon, zIndexOffset }).bindPopup(popup).addTo(map);
  }

  return {
    update({ home, you }) {
      homeMarker = place(homeMarker, home && [home.lat, home.lng], homeIcon, 1000, "<strong>บ้านของฉัน</strong><br><small>หมุดที่บันทึกไว้ในเครื่องนี้</small>");
      youMarker = place(youMarker, you, youIcon, 900, "<strong>ตำแหน่งฉัน</strong><br><small>พิกัดโดยประมาณจากอุปกรณ์</small>");
    }
  };
}
