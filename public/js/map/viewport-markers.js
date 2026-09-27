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
  let scheduled = false;

  function sync() {
    scheduled = false;
    if (!map.hasLayer(group)) return;
    const bounds = map.getBounds().pad(0.35);
    const zoom = map.getZoom();
    for (const [id, marker] of markers) {
      const item = items.get(id);
      if (!item || !showAtZoom(item, zoom) || !bounds.contains([item.lat, item.lng])) {
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
      items = new Map(next.map((item) => [item.id, item]));
      schedule();
    },
    /** @param {boolean} visible */
    setVisible(visible) {
      if (visible) { group.addTo(map); schedule(); }
      else { map.removeLayer(group); group.clearLayers(); markers.clear(); }
    },
    /** @param {string} id */
    markerFor(id) {
      const item = items.get(id);
      if (!item) return undefined;
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
