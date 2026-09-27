const test = require("node:test");
const assert = require("node:assert/strict");

test("infrastructure markers are created only in view and focused pins remain reachable", async () => {
  const { createViewportMarkers } = await import("../public/js/map/viewport-markers.js");
  let bounds = [13, 15, 100, 102];
  let zoom = 11;
  const handlers = new Map();
  const attached = new Set();
  const originalL = global.L;
  const originalFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = (callback) => { callback(); return 1; };
  global.L = {
    layerGroup() {
      const layers = new Set();
      return {
        addTo() { attached.add(this); return this; },
        addLayer(marker) { layers.add(marker); },
        removeLayer(marker) { layers.delete(marker); },
        clearLayers() { layers.clear(); },
        hasLayer(marker) { return layers.has(marker); },
        count() { return layers.size; }
      };
    }
  };
  const map = {
    hasLayer: (group) => attached.has(group),
    removeLayer: (group) => attached.delete(group),
    getZoom: () => zoom,
    getBounds: () => ({ pad: () => ({ contains: ([lat, lng]) => lat >= bounds[0] && lat <= bounds[1] && lng >= bounds[2] && lng <= bounds[3] }) }),
    on: (event, handler) => handlers.set(event, handler)
  };
  let created = 0;
  const layer = createViewportMarkers(map, (item) => {
    created++;
    return { id: item.id, addTo(group) { group.addLayer(this); return this; } };
  }, (item, scale) => item.large || scale >= 8);
  try {
    layer.setVisible(true);
    layer.update([
      { id: "near", lat: 14, lng: 101 },
      { id: "far", lat: 18, lng: 99 },
      { id: "small", lat: 17, lng: 100 }
    ]);
    assert.equal(created, 1);
    assert.ok(layer.markerFor("near"));
    assert.equal(created, 1);
    bounds = [17, 19, 98, 101];
    zoom = 7;
    handlers.get("moveend")();
    assert.equal(created, 1, "small markers stay hidden at country scale");
    assert.equal(layer.markerFor("far").id, "far", "a list click can focus an off-screen item");
    zoom = 11;
    handlers.get("moveend")();
    assert.equal(created, 3, "moving into view creates only newly visible pins");
    layer.setVisible(false);
    assert.equal(attached.size, 0);
  } finally {
    global.L = originalL;
    global.requestAnimationFrame = originalFrame;
  }
});
