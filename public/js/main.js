// Composition root: owns app state and wires modules to the DOM.
import { CAMERA_SOURCES, DEFAULT_ZOOM, FOCUS_ZOOM, GEOLOCATION_OPTIONS, LOCATE_ZOOM, MOBILE_BREAKPOINT_PX, NEARBY_RADIUS_KM, NEAREST_STATION_LIMIT, RANGSIT, RISK_LIST_LIMIT, STATION_REFRESH_MS } from "./config.js";
import { fetchLayerConfig, fetchRoadFloods, fetchStations, NO_OPTIONAL_LAYERS } from "./api.js";
import { isLayerWanted, loadCachedStations, loadHome, saveCachedStations, saveHome, saveLayerPref } from "./storage.js";
import { age, distanceKm, formatCount, nearestStations, searchStations, withinKm } from "./utils.js";
import { riskyStations } from "./risk.js";
import { cameraTabHtml, floodTabHtml, riskTabHtml, roadTabHtml, waterTabHtml } from "./templates.js";
import { createMap, focusOnMap } from "./map/map.js";
import { createBasemap } from "./map/basemap.js";
import { createStationsLayer } from "./map/stations-layer.js";
import { createCamerasLayer } from "./map/cameras-layer.js";
import { createLocationLayer } from "./map/location-layer.js";
import { createFloodLayer } from "./map/flood-layer.js";
import { createTrafficLayer } from "./map/traffic-layer.js";
import { createRoadFloodLayer } from "./map/road-flood-layer.js";
import { startClock } from "./ui/clock.js";
import { byId, required } from "./ui/dom.js";
import { createStatusView } from "./ui/status.js";
import { createListPanel } from "./ui/list-panel.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").RoadFlood} RoadFlood */
/** @typedef {import("./types.js").Tab} Tab */
/** @typedef {import("./types.js").LatLngTuple} LatLngTuple */
/** @typedef {import("./types.js").LayerConfig} LayerConfig */

/** @type {ReadonlyArray<Tab>} */
const TABS = ["water", "risk", "flood", "camera", "road"];
/** @param {string | undefined} value @returns {value is Tab} */
const isTab = (value) => TABS.includes(/** @type {Tab} */ (value));
const CAMERA_TAB_HTML = cameraTabHtml(CAMERA_SOURCES);

const ui = {
  mapPanel: required(".map-panel"),
  insights: required(".insights"),
  toggleWater: byId("toggle-water", HTMLInputElement),
  toggleRiskOnly: byId("toggle-risk-only", HTMLInputElement),
  toggleFlood: byId("toggle-flood", HTMLInputElement),
  toggleRoadFlood: byId("toggle-road-flood", HTMLInputElement),
  toggleTraffic: byId("toggle-traffic", HTMLInputElement),
  toggleCamera: byId("toggle-camera", HTMLInputElement),
  mapStyle: byId("map-style", HTMLSelectElement),
  locationMessage: byId("location-message"),
  searchMessage: byId("search-message"),
  stationQuery: byId("station-query", HTMLInputElement),
  locate: byId("locate", HTMLButtonElement),
  riskCount: byId("risk-count"),
  floodNote: byId("flood-layer-note"),
  roadNote: byId("road-flood-note"),
  trafficNote: byId("traffic-note")
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
  placingHome: false,
  /** @type {LayerConfig} */
  config: NO_OPTIONAL_LAYERS,
  /** @type {RoadFlood[] | null} null until the first successful load */
  roadFloods: null,
  /** @type {string | null} */
  roadFetchedAt: null,
  /** @type {string | null} */
  roadError: null,
  roadUnsupported: false,
  roadLoading: false,
  floodError: false
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
const roadFloodLayer = map && createRoadFloodLayer(map);
/** @type {ReturnType<typeof createFloodLayer> | null} */
let floodLayer = null;
/** @type {ReturnType<typeof createTrafficLayer> | null} */
let trafficLayer = null;
const status = createStatusView();

// ---- Tab content
function riskView() {
  const from = center();
  const risky = riskyStations(state.stations);
  const nearbyRisky = risky.filter(({ station }) => withinKm(from, NEARBY_RADIUS_KM, station));
  return {
    items: risky.slice(0, RISK_LIST_LIMIT).map(({ station, risk }) => ({ station, risk, distance: distanceKm(from, [station.lat, station.lng]) })),
    total: risky.length,
    nearby: {
      overflow: nearbyRisky.filter(({ risk }) => risk.status === "overflow").length,
      high: nearbyRisky.filter(({ risk }) => risk.status === "high").length,
      roads: state.roadFloods ? state.roadFloods.filter((report) => withinKm(from, NEARBY_RADIUS_KM, report)).length : null
    },
    hasStations: state.stations.length > 0,
    riskOnly: ui.toggleRiskOnly.checked
  };
}

function floodView() {
  const from = center();
  return {
    floodAvailable: state.config.flood.available,
    floodOn: ui.toggleFlood.checked,
    floodPeriod: state.config.flood.period,
    floodError: state.floodError,
    roads: state.roadFloods
      ? state.roadFloods.map((report) => ({ report, distance: distanceKm(from, [report.lat, report.lng]) })).sort((a, b) => a.distance - b.distance)
      : null,
    roadError: state.roadError,
    roadUnsupported: state.roadUnsupported
  };
}

/** @returns {string} */
function tabHtml() {
  switch (state.tab) {
    case "risk": return riskTabHtml(riskView());
    case "flood": return floodTabHtml(floodView());
    case "camera": return CAMERA_TAB_HTML;
    case "road": return roadTabHtml({ trafficAvailable: state.config.traffic.available, trafficOn: ui.toggleTraffic.checked, roadFloodCount: state.roadFloods?.length ?? null });
    default: return waterTabHtml({
      nearest: nearestStations(state.stations, center(), NEAREST_STATION_LIMIT),
      hasStations: state.stations.length > 0,
      error: state.error,
      fetchedAt: state.fetchedAt
    });
  }
}

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
    setToggle(ui.toggleCamera, true);
    focusOnMap(map, [camera.lat, camera.lng], FOCUS_ZOOM, camerasLayer.markerFor(camera.id));
    scrollToMap();
  },
  onRoad(id) {
    const report = state.roadFloods?.find((item) => item.id === id);
    if (!report || !map || !roadFloodLayer) return;
    setToggle(ui.toggleRoadFlood, true);
    focusOnMap(map, [report.lat, report.lng], FOCUS_ZOOM, roadFloodLayer.markerFor(report.id));
    scrollToMap();
  },
  onAction(action) {
    if (action === "retry") loadStations();
    else if (action === "toggle-traffic") { setToggle(ui.toggleTraffic, !ui.toggleTraffic.checked); saveLayerPref("traffic", ui.toggleTraffic.checked); }
    else if (action === "toggle-flood") { setToggle(ui.toggleFlood, !ui.toggleFlood.checked); saveLayerPref("flood", ui.toggleFlood.checked); }
    else if (action === "toggle-risk-only") setToggle(ui.toggleRiskOnly, !ui.toggleRiskOnly.checked);
  }
});

const renderList = () => listPanel.render(tabHtml());

/**
 * Change a layer checkbox from code and run its normal change handler.
 * @param {HTMLInputElement} input @param {boolean} checked
 */
function setToggle(input, checked) {
  if (input.disabled || input.checked === checked) return;
  input.checked = checked;
  input.dispatchEvent(new Event("change"));
}

/** @param {Station} station @param {number} zoom */
function showStation(station, zoom) {
  if (!map || !stationsLayer) return;
  setToggle(ui.toggleWater, true);
  // A normal station is hidden while "risk only" is on; show everything so the popup can open.
  if (!stationsLayer.isAtRisk(station.id)) setToggle(ui.toggleRiskOnly, false);
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

function renderRiskCount() {
  if (!state.stations.length) return;
  const risky = riskyStations(state.stations);
  const overflow = risky.filter(({ risk }) => risk.status === "overflow").length;
  ui.riskCount.textContent = `ล้นตลิ่ง ${formatCount(overflow)} · ใกล้ตลิ่ง ${formatCount(risky.length - overflow)} สถานี`;
}

/**
 * Enable or disable an optional layer's switch based on /api/config.
 * @param {HTMLInputElement} input @param {HTMLElement} note @param {boolean} available @param {string} readyText @param {string} missingText
 */
function setLayerAvailability(input, note, available, readyText, missingText) {
  input.disabled = !available;
  input.closest(".layer-row")?.classList.toggle("is-disabled", !available);
  note.textContent = available ? readyText : missingText;
  if (!available) input.checked = false;
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
    renderRiskCount();
    renderList();
  }
}

async function loadRoadFloods() {
  if (state.roadLoading || !ui.toggleRoadFlood.checked) return;
  state.roadLoading = true;
  try {
    const data = await fetchRoadFloods();
    Object.assign(state, { roadFloods: data.reports, roadFetchedAt: data.fetchedAt, roadError: null, roadUnsupported: data.unsupported });
    roadFloodLayer?.update(data.reports);
    ui.roadNote.textContent = data.unsupported ? "ThaiWater · รูปแบบข้อมูลยังไม่รองรับ" : `ThaiWater · ${formatCount(data.reports.length)} จุดรายงาน`;
  } catch (error) {
    state.roadError = error instanceof Error && error.message ? error.message : "โหลดรายงานถนนน้ำท่วมไม่ได้";
    ui.roadNote.textContent = "ThaiWater · โหลดไม่ได้";
  } finally {
    state.roadLoading = false;
    renderList();
  }
}

async function loadLayerConfig() {
  state.config = await fetchLayerConfig();
  const { flood, traffic } = state.config;
  setLayerAvailability(ui.toggleFlood, ui.floodNote, flood.available, "GISTDA · ภาพดาวเทียมล่าสุด", "ยังไม่ได้ตั้งค่า GISTDA API key");
  setLayerAvailability(ui.toggleTraffic, ui.trafficNote, traffic.available, "สีตามความเร็วรถ · อัปเดตทุก 2 นาที", "ยังไม่ได้ตั้งค่า API key ข้อมูลจราจร");
  if (map && flood.available && flood.wmsUrl) {
    floodLayer = createFloodLayer(map, { wmsUrl: flood.wmsUrl, onError: () => { state.floodError = true; ui.floodNote.textContent = "GISTDA · โหลดภาพไม่ได้"; renderList(); } });
    // Flood extent and traffic start on when available, unless this viewer switched them off before.
    if (isLayerWanted("flood")) setToggle(ui.toggleFlood, true);
  }
  if (map && traffic.available && traffic.tileUrl) {
    trafficLayer = createTrafficLayer(map, { tileUrl: traffic.tileUrl, attribution: traffic.attribution, onError: () => { ui.trafficNote.textContent = "โหลดข้อมูลจราจรไม่ได้"; } });
    if (isLayerWanted("traffic")) setToggle(ui.toggleTraffic, true);
  }
  renderList();
}

// ---- Event wiring
byId("refresh").addEventListener("click", () => { loadStations(); loadRoadFloods(); });
byId("map-retry").addEventListener("click", () => location.reload());
ui.mapStyle.addEventListener("change", () => basemap?.setStyle(ui.mapStyle.value));
byId("recenter").addEventListener("click", () => map?.flyTo(RANGSIT, DEFAULT_ZOOM));
ui.toggleWater.addEventListener("change", () => stationsLayer?.setVisible(ui.toggleWater.checked));
ui.toggleRiskOnly.addEventListener("change", () => {
  if (ui.toggleRiskOnly.checked) setToggle(ui.toggleWater, true);
  stationsLayer?.setRiskOnly(ui.toggleRiskOnly.checked);
  renderList();
});
ui.toggleFlood.addEventListener("change", () => { floodLayer?.setVisible(ui.toggleFlood.checked); renderList(); });
ui.toggleTraffic.addEventListener("change", () => { trafficLayer?.setVisible(ui.toggleTraffic.checked); renderList(); });
// Remember only choices the viewer made by hand; code-driven toggles (setToggle) do not count.
ui.toggleFlood.addEventListener("input", () => saveLayerPref("flood", ui.toggleFlood.checked));
ui.toggleTraffic.addEventListener("input", () => saveLayerPref("traffic", ui.toggleTraffic.checked));
ui.toggleRoadFlood.addEventListener("change", () => {
  roadFloodLayer?.setVisible(ui.toggleRoadFlood.checked);
  if (ui.toggleRoadFlood.checked && age(state.roadFetchedAt) >= STATION_REFRESH_MS) loadRoadFloods();
});
ui.toggleCamera.addEventListener("change", () => { camerasLayer?.setVisible(ui.toggleCamera.checked); if (ui.toggleCamera.checked) setTab("camera"); });
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

/** Turn on the layers a section is about, then open it. @param {Tab} tab */
function showSection(tab) {
  if (tab === "camera") { setToggle(ui.toggleCamera, true); if (camerasLayer) map?.fitBounds(camerasLayer.bounds(), { padding: [36, 36], maxZoom: 10 }); }
  if (tab === "water") setToggle(ui.toggleWater, true);
  if (tab === "risk") setToggle(ui.toggleWater, true);
  if (tab === "flood") { setToggle(ui.toggleFlood, true); setToggle(ui.toggleRoadFlood, true); }
  if (tab === "road") setToggle(ui.toggleTraffic, true);
  openSection(tab);
}

document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
  const choice = button instanceof HTMLElement ? button.dataset.quick : undefined;
  if (isTab(choice)) showSection(choice);
}));

document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item === button));
  const choice = button instanceof HTMLElement ? button.dataset.nav : undefined;
  if (choice === "locate") { ui.locate.click(); scrollToMap(); }
  else if (choice === "map") scrollToMap();
  else if (isTab(choice)) showSection(choice);
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
  renderRiskCount();
}
roadFloodLayer?.setVisible(ui.toggleRoadFlood.checked);
renderList();
loadStations();
loadRoadFloods();
loadLayerConfig();
basemap?.setStyle(ui.mapStyle.value);
setInterval(() => { if (!document.hidden) { loadStations(); loadRoadFloods(); } }, STATION_REFRESH_MS);
// Background tabs skip the interval, so catch up as soon as the page is visible again.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || age(state.fetchedAt) < STATION_REFRESH_MS) return;
  loadStations();
  loadRoadFloods();
});
