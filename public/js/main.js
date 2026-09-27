// Composition root: owns app state and wires modules to the DOM.
import { CAMERA_SOURCES, DEFAULT_ZOOM, FOCUS_ZOOM, GEOLOCATION_OPTIONS, LOCATE_ZOOM, MOBILE_BREAKPOINT_PX, NEAREST_STATION_LIMIT, RANGSIT, STATION_REFRESH_MS } from "./config.js";
import { fetchStations } from "./api.js";
import { loadCachedStations, loadHome, saveCachedStations, saveHome } from "./storage.js";
import { age, nearestStations, searchStations } from "./utils.js";
import { createMap, focusOnMap } from "./map/map.js";
import { createBasemap } from "./map/basemap.js";
import { createStationsLayer } from "./map/stations-layer.js";
import { createCamerasLayer } from "./map/cameras-layer.js";
import { createLocationLayer } from "./map/location-layer.js";
import { startClock } from "./ui/clock.js";
import { byId, required } from "./ui/dom.js";
import { createStatusView } from "./ui/status.js";
import { createListPanel } from "./ui/list-panel.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").Tab} Tab */
/** @typedef {import("./types.js").LatLngTuple} LatLngTuple */

/** @type {ReadonlyArray<Tab>} */
const TABS = ["water", "flood", "camera", "road"];
/** @param {string | undefined} value @returns {value is Tab} */
const isTab = (value) => TABS.includes(/** @type {Tab} */ (value));

const ui = {
  mapPanel: required(".map-panel"),
  insights: required(".insights"),
  toggleWater: byId("toggle-water", HTMLInputElement),
  toggleCamera: byId("toggle-camera", HTMLInputElement),
  mapStyle: byId("map-style", HTMLSelectElement),
  locationMessage: byId("location-message"),
  searchMessage: byId("search-message"),
  stationQuery: byId("station-query", HTMLInputElement),
  locate: byId("locate", HTMLButtonElement)
};

const cached = loadCachedStations();
const state = {
  /** @type {Station[]} */
  stations: cached?.stations ?? [],
  /** @type {string | null} */
  fetchedAt: cached?.fetchedAt ?? null,
  /** @type {string | null} Latest load problem; cached stations may still be shown. */
  error: null,
  loading: false,
  /** @type {Tab} */
  tab: "water",
  home: loadHome(),
  /** @type {LatLngTuple | null} */
  you: null,
  placingHome: false
};
/** @returns {LatLngTuple} */
const center = () => state.home ? [state.home.lat, state.home.lng] : state.you || RANGSIT;
/** @param {ScrollLogicalPosition} [block] */
const scrollToMap = (block = "start") => ui.mapPanel.scrollIntoView({ behavior: "smooth", block });

// ---- Map & layers (all optional: the lists still work if Leaflet failed to load)
const map = createMap("map", center());
if (!map) byId("map-fallback").hidden = false;
const basemap = map && createBasemap(map, { onFallback: () => { ui.mapStyle.value = "classic"; } });
const stationsLayer = map && createStationsLayer(map);
const camerasLayer = map && createCamerasLayer(map, CAMERA_SOURCES);
const locationLayer = map && createLocationLayer(map);
const status = createStatusView();

const listPanel = createListPanel(byId("tab-content"), {
  onStation(id) {
    const station = state.stations.find((s) => s.id === id);
    if (!station || !map) return;
    showStation(station, Math.max(map.getZoom(), LOCATE_ZOOM));
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) scrollToMap();
  },
  onCamera(id) {
    const camera = CAMERA_SOURCES.find((item) => item.id === id);
    if (!camera || !map || !camerasLayer) return;
    setLayerVisible("camera", true);
    focusOnMap(map, [camera.lat, camera.lng], FOCUS_ZOOM, camerasLayer.markerFor(camera.id));
    scrollToMap();
  },
  onRetry: () => loadStations()
});

const renderList = () => listPanel.render(state.tab, () => ({
  nearest: nearestStations(state.stations, center(), NEAREST_STATION_LIMIT),
  hasStations: state.stations.length > 0,
  error: state.error,
  fetchedAt: state.fetchedAt
}));

/** @param {"water" | "camera"} kind @param {boolean} visible */
function setLayerVisible(kind, visible) {
  if (kind === "water") { ui.toggleWater.checked = visible; stationsLayer?.setVisible(visible); }
  else { ui.toggleCamera.checked = visible; camerasLayer?.setVisible(visible); }
}

/** @param {Station} station @param {number} zoom */
function showStation(station, zoom) {
  if (!map || !stationsLayer) return;
  setLayerVisible("water", true);
  focusOnMap(map, [station.lat, station.lng], zoom, stationsLayer.markerFor(station.id));
}

/** @param {Tab} tab */
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((item) => {
    const active = item instanceof HTMLElement && item.dataset.tab === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-quick]").forEach((item) => item.classList.toggle("selected", item instanceof HTMLElement && item.dataset.quick === tab));
  renderList();
}

/** @param {Tab} tab */
function openSection(tab) {
  setTab(tab);
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item instanceof HTMLElement && item.dataset.nav === tab));
  ui.insights.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLocation() {
  locationLayer?.update({ home: state.home, you: state.you });
  if (state.home) {
    byId("area-title").textContent = "บ้านของฉัน";
    byId("area-coords").textContent = `${state.home.lat.toFixed(4)}, ${state.home.lng.toFixed(4)}`;
    byId("home-button-label").textContent = "ย้ายหมุดบ้าน";
  } else if (state.you) {
    byId("area-title").textContent = "ตำแหน่งปัจจุบัน";
    byId("area-coords").textContent = `${state.you[0].toFixed(4)}, ${state.you[1].toFixed(4)}`;
  }
}

// ---- Data loading
async function loadStations() {
  if (state.loading) return;
  state.loading = true;
  status.loading();
  try {
    const data = await fetchStations();
    Object.assign(state, { stations: data.stations, fetchedAt: data.fetchedAt, error: data.warning });
    saveCachedStations(state.stations, data.fetchedAt);
    if (data.warning) status.failed(state.stations.length, state.fetchedAt);
    else status.loaded(state.stations.length, state.fetchedAt);
    ui.searchMessage.hidden = true;
  } catch (error) {
    state.error = error instanceof Error && error.message ? error.message : "เชื่อมต่อไม่ได้";
    status.failed(state.stations.length, state.fetchedAt);
  } finally {
    state.loading = false;
    status.done();
    stationsLayer?.update(state.stations);
    renderList();
  }
}

// ---- Event wiring
byId("refresh").addEventListener("click", () => loadStations());
byId("map-retry").addEventListener("click", () => location.reload());
ui.mapStyle.addEventListener("change", () => basemap?.setStyle(ui.mapStyle.value));
byId("recenter").addEventListener("click", () => map?.flyTo(RANGSIT, DEFAULT_ZOOM));
ui.toggleWater.addEventListener("change", () => stationsLayer?.setVisible(ui.toggleWater.checked));
ui.toggleCamera.addEventListener("change", () => { camerasLayer?.setVisible(ui.toggleCamera.checked); if (ui.toggleCamera.checked) setTab("camera"); });
byId("flood-sources").addEventListener("click", () => openSection("flood"));
byId("map-locate").addEventListener("click", () => ui.locate.click());
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  const tab = button instanceof HTMLElement ? button.dataset.tab : undefined;
  if (isTab(tab)) setTab(tab);
}));

byId("home-button").addEventListener("click", () => {
  if (!map) { ui.locationMessage.textContent = "แผนที่ยังไม่พร้อมใช้งาน"; return; }
  state.placingHome = true;
  ui.locationMessage.textContent = "แตะจุดบ้านของคุณบนแผนที่เพื่อบันทึก";
  scrollToMap("center");
});
map?.on("click", ({ latlng }) => {
  if (!state.placingHome) return;
  state.placingHome = false;
  state.home = { lat: latlng.lat, lng: latlng.lng };
  ui.locationMessage.textContent = saveHome(state.home) ? "บันทึกหมุดบ้านบนอุปกรณ์นี้แล้ว" : "ปักหมุดแล้ว แต่เบราว์เซอร์ไม่อนุญาตให้บันทึกถาวร";
  renderLocation(); renderList();
});

ui.locate.addEventListener("click", () => {
  if (!navigator.geolocation) { ui.locationMessage.textContent = "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง"; return; }
  ui.locationMessage.textContent = "กำลังขอตำแหน่งจากอุปกรณ์...";
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const you = /** @type {LatLngTuple} */ ([coords.latitude, coords.longitude]);
    state.you = you;
    ui.locationMessage.textContent = `ตำแหน่งโดยประมาณ · ความแม่นยำ ±${Math.round(coords.accuracy)} ม.`;
    renderLocation(); renderList();
    map?.flyTo(you, LOCATE_ZOOM);
  }, (error) => {
    ui.locationMessage.textContent = error.code === error.PERMISSION_DENIED
      ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS หรือปักหมุดบ้านเอง"
      : "ระบุตำแหน่งไม่สำเร็จ ลองอีกครั้งในที่โล่ง หรือปักหมุดบ้านเอง";
  }, GEOLOCATION_OPTIONS);
});

document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
  const choice = button instanceof HTMLElement ? button.dataset.quick : undefined;
  if (!isTab(choice)) return;
  if (choice === "camera") { setLayerVisible("camera", true); if (camerasLayer) map?.fitBounds(camerasLayer.bounds(), { padding: [36, 36], maxZoom: 10 }); }
  if (choice === "water") setLayerVisible("water", true);
  openSection(choice);
}));

document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item === button));
  const choice = button instanceof HTMLElement ? button.dataset.nav : undefined;
  if (choice === "locate") { ui.locate.click(); scrollToMap(); }
  else if (choice === "map") scrollToMap();
  else if (isTab(choice)) openSection(choice);
}));

byId("station-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = ui.searchMessage;
  const query = ui.stationQuery.value;
  message.hidden = false;
  if (!query.trim()) { message.textContent = "พิมพ์ชื่อสถานีหรือจังหวัดก่อนค้นหา"; return; }
  if (!state.stations.length) { message.textContent = "ข้อมูลสถานียังไม่พร้อม ลองรีเฟรชอีกครั้ง"; return; }
  const [match, ...rest] = searchStations(state.stations, query, center());
  if (!match) { message.textContent = "ไม่พบสถานีในข้อมูลล่าสุด ลองชื่อจังหวัดหรือคำใกล้เคียง"; return; }
  setTab("water");
  showStation(match, FOCUS_ZOOM);
  message.textContent = `พบ ${rest.length + 1} สถานี · แสดง ${match.name} (${match.province || "ไม่ระบุจังหวัด"})`;
});

// ---- Start-up: cached data first, then the network, then the (optional, heavy) vector basemap.
startClock(byId("clock"), byId("today"));
renderLocation();
if (state.stations.length) {
  status.cached(state.stations.length, state.fetchedAt);
  stationsLayer?.update(state.stations);
}
renderList();
loadStations();
basemap?.setStyle(ui.mapStyle.value);
setInterval(() => { if (!document.hidden) loadStations(); }, STATION_REFRESH_MS);
// Background tabs skip the interval, so catch up as soon as the page is visible again.
document.addEventListener("visibilitychange", () => { if (!document.hidden && age(state.fetchedAt) >= STATION_REFRESH_MS) loadStations(); });
