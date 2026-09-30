// Keep off-screen infrastructure out of Leaflet's DOM. Create a marker only
// when it enters the viewport or a list item asks to focus on it.
/**
 * @template {{ id: string, lat: number, lng: number }} T
 * @param {L.Map} map
 * @param {(item: T) => L.Marker} makeMarker
 * @param {(item: T, zoom: number) => boolean} showAtZoom
 */
export function createViewportMarkers(map, makeMarker, showAtZoom = () => true) {
  const group = L.layerGroup();
  /** @type {Map<string, T>} */
  let items = new Map();
  /** @type {Map<string, L.Marker>} */
  const markers = new Map();
  /** A marker a list item asked for stays while the map flies to it. @type {string | null} */
  let focusedId = null;
  let scheduled = false;

  /** @param {string} id @param {L.Marker} marker */
  const keep = (id, marker) => id === focusedId || marker.isPopupOpen();

  function sync() {
    scheduled = false;
    if (!map.hasLayer(group)) return;
    const bounds = map.getBounds().pad(0.35);
    const zoom = map.getZoom();
    for (const [id, marker] of markers) {
      const item = items.get(id);
      if (!item || (!keep(id, marker) && (!showAtZoom(item, zoom) || !bounds.contains([item.lat, item.lng])))) {
        group.removeLayer(marker);
        markers.delete(id);
      }
    }
    for (const [id, item] of items) {
      if (!markers.has(id) && showAtZoom(item, zoom) && bounds.contains([item.lat, item.lng])) {
        const marker = makeMarker(item);
        marker.addTo(group);
        markers.set(id, marker);
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  map.on("moveend", schedule);
  return {
    /** @param {T[]} next */
    update(next) {
      group.clearLayers();
      markers.clear();
      focusedId = null;
      items = new Map(next.map((item) => [item.id, item]));
      schedule();
    },
    /** @param {boolean} visible */
    setVisible(visible) {
      if (visible) { group.addTo(map); schedule(); }
      else { map.removeLayer(group); group.clearLayers(); markers.clear(); focusedId = null; }
    },
    /** @param {string} id */
    markerFor(id) {
      const item = items.get(id);
      if (!item) return undefined;
      focusedId = id;
      let marker = markers.get(id);
      if (!marker) {
        marker = makeMarker(item);
        marker.addTo(group);
        markers.set(id, marker);
      }
      return marker;
    }
  };
}
