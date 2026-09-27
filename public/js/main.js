// Composition root: owns app state and wires modules to the DOM.
import { APP_VERSION, THUMBNAIL_TIMEOUT_MS, CAMERA_SOURCES, DAM_LIST_LIMIT, DAM_REFRESH_MS, DEFAULT_CAMERA_REFRESH_MS, GATE_LIST_LIMIT, DEFAULT_ZOOM, FOCUS_ZOOM, GEOLOCATION_OPTIONS, LOCATE_ZOOM, MOBILE_BREAKPOINT_PX, NEARBY_RADIUS_KM, NEAREST_STATION_LIMIT, RANGSIT, RISK_LIST_LIMIT, STATION_REFRESH_MS, THUMBNAIL_REFRESH_MS, TRAFFIC_CAMERA_PAGE_SIZE, TRAFFIC_CAMERA_REFRESH_MS, TRAFFIC_CAMERA_SOURCE } from "./config.js";
import { fetchDams, fetchLayerConfig, fetchRoadFloods, fetchStations, fetchTrafficCameras, fetchWaterGates, NO_OPTIONAL_LAYERS } from "./api.js";
import { isLayerWanted, loadCachedStations, loadHome, saveCachedStations, saveHome, saveLayerPref } from "./storage.js";
import { age, distanceKm, fmtClock, formatCount, nearestStations, searchStations, withinKm } from "./utils.js";
import { riskyStations } from "./risk.js";
import { rankDams } from "./reservoir.js";
import { alertBannerHtml, cameraTabHtml, floodTabHtml, gatesTabHtml, riskTabHtml, roadTabHtml, waterTabHtml } from "./templates.js";
import { createMap, focusOnMap } from "./map/map.js";
import { createBasemap } from "./map/basemap.js";
import { createStationsLayer } from "./map/stations-layer.js";
import { createCamerasLayer } from "./map/cameras-layer.js";
import { createLocationLayer } from "./map/location-layer.js";
import { createFloodLayer } from "./map/flood-layer.js";
import { createTrafficLayer } from "./map/traffic-layer.js";
import { createRoadFloodLayer } from "./map/road-flood-layer.js";
import { createTrafficCamerasLayer } from "./map/traffic-cameras-layer.js";
import { createWaterGatesLayer } from "./map/water-gates-layer.js";
import { createDamsLayer } from "./map/dams-layer.js";
import { createCameraViewer } from "./ui/camera-viewer.js";
import { startClock } from "./ui/clock.js";
import { byId, required } from "./ui/dom.js";
import { createStatusView } from "./ui/status.js";
import { createListPanel } from "./ui/list-panel.js";

/** @typedef {import("./types.js").Station} Station */
/** @typedef {import("./types.js").RoadFlood} RoadFlood */
/** @typedef {import("./types.js").Tab} Tab */
/** @typedef {import("./types.js").LatLngTuple} LatLngTuple */
/** @typedef {import("./types.js").LayerConfig} LayerConfig */
/** @typedef {import("./types.js").TrafficCamera} TrafficCamera */
/** @typedef {import("./types.js").ViewerCamera} ViewerCamera */

/** @type {ReadonlyArray<Tab>} */
const TABS = ["water", "risk", "flood", "gates", "camera", "road"];
/** @param {string | undefined} value @returns {value is Tab} */
const isTab = (value) => TABS.includes(/** @type {Tab} */ (value));
const WATER_CAMERAS = CAMERA_SOURCES.filter((camera) => !camera.directory);
const CAMERA_DIRECTORIES = CAMERA_SOURCES.filter((camera) => camera.directory);
const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);

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
  trafficNote: byId("traffic-note"),
  toggleTrafficCameras: byId("toggle-traffic-cameras", HTMLInputElement),
  trafficCameraNote: byId("traffic-camera-note"),
  tabContent: byId("tab-content"),
  alertBanner: byId("alert-banner", HTMLButtonElement),
  updatedAt: byId("updated-at"),
  navRiskBadge: byId("nav-risk-badge"),
  layerSheet: byId("layer-sheet"),
  openLayers: byId("open-layers", HTMLButtonElement),
  toggleGates: byId("toggle-gates", HTMLInputElement),
  toggleDams: byId("toggle-dams", HTMLInputElement),
  gateNote: byId("gate-note"),
  damNote: byId("dam-note"),
  kpi: { overflow: byId("kpi-overflow"), high: byId("kpi-high"), roads: byId("kpi-roads"), cameras: byId("kpi-cameras") }
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
  floodError: false,
  /** @type {TrafficCamera[] | null} null until the first successful load */
  trafficCameras: null,
  /** @type {string | null} */
  trafficCameraError: null,
  trafficCameraLimit: TRAFFIC_CAMERA_PAGE_SIZE,
  /** @type {{ items: import("./types.js").WaterGate[] | null, error: string | null, unsupported: boolean }} */
  gates: { items: null, error: null, unsupported: false },
  /** @type {{ items: import("./types.js").Dam[] | null, error: string | null, unsupported: boolean }} */
  dams: { items: null, error: null, unsupported: false }
};
/** @returns {LatLngTuple} */
const center = () => state.home ? [state.home.lat, state.home.lng] : state.you || RANGSIT;
/**
 * On phones the map and the tab pages are separate screens; on larger screens they sit side by side.
 * @param {"map" | "panel"} view
 */
function setView(view) {
  document.body.dataset.view = view;
  if (view === "map") {
    map?.invalidateSize();
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item instanceof HTMLElement && item.dataset.nav === "map"));
  }
  else ui.tabContent.scrollTop = 0;
}

/** Bring the map into view before focusing something on it. @param {ScrollLogicalPosition} [block] */
function scrollToMap(block = "start") {
  closeLayerSheet();
  if (mobileQuery.matches) setView("map");
  else ui.mapPanel.scrollIntoView({ behavior: "smooth", block });
}

// ---- Map & layers (all optional: the lists still work if Leaflet failed to load)
const map = createMap("map", center());
if (!map) byId("map-fallback").hidden = false;
const basemap = map && createBasemap(map, { onFallback: () => { ui.mapStyle.value = "classic"; } });
const stationsLayer = map && createStationsLayer(map);
const camerasLayer = map && createCamerasLayer(map, CAMERA_SOURCES);
const locationLayer = map && createLocationLayer(map);
const roadFloodLayer = map && createRoadFloodLayer(map);
const waterGatesLayer = map && createWaterGatesLayer(map);
const damsLayer = map && createDamsLayer(map);
const trafficCamerasLayer = map && createTrafficCamerasLayer(map, { onOpen: (camera) => viewer.open(trafficViewerCamera(camera)) });
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
    riskOnly: ui.toggleRiskOnly.checked,
    nearest: nearestStations(state.stations, from, NEAREST_STATION_LIMIT),
    error: state.error,
    fetchedAt: state.fetchedAt
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

function cameraView() {
  const from = center();
  /** @param {{ lat: number, lng: number }} point */
  const km = (point) => distanceKm(from, [point.lat, point.lng]);
  const traffic = state.trafficCameras
    ? state.trafficCameras.map((camera) => ({ camera, distance: km(camera) })).sort((a, b) => a.distance - b.distance)
    : null;
  return {
    water: WATER_CAMERAS.map((camera) => ({ camera, distance: km(camera) })).sort((a, b) => a.distance - b.distance),
    directories: CAMERA_DIRECTORIES,
    traffic: traffic ? traffic.slice(0, state.trafficCameraLimit) : null,
    trafficTotal: state.trafficCameras?.length ?? 0,
    trafficError: state.trafficCameraError,
    hasMore: Boolean(traffic && traffic.length > state.trafficCameraLimit)
  };
}

/** @param {TrafficCamera} camera @returns {ViewerCamera} */
const trafficViewerCamera = (camera) => ({
  id: `traffic:${camera.id}`, name: camera.name, meta: `${camera.org || "กล้องจราจร"} · ${camera.hls ? "วิดีโอสด" : "ภาพนิ่งอัปเดตเป็นระยะ"}`,
  lat: camera.lat, lng: camera.lng, image: camera.image, hls: camera.hls, refreshMs: TRAFFIC_CAMERA_REFRESH_MS,
  sourceUrl: TRAFFIC_CAMERA_SOURCE.url, sourceLabel: TRAFFIC_CAMERA_SOURCE.label
});

/** @param {Readonly<import("./types.js").Camera>} camera @returns {ViewerCamera} */
const waterViewerCamera = (camera) => ({
  id: `water:${camera.id}`, name: camera.name, meta: `${camera.area} · ${camera.source || "สำนักการระบายน้ำ กทม."}`,
  lat: camera.lat, lng: camera.lng, image: camera.image ?? null, hls: null, refreshMs: camera.refreshMs || DEFAULT_CAMERA_REFRESH_MS,
  sourceUrl: camera.url, sourceLabel: camera.source || "สำนักการระบายน้ำ กทม."
});

/** @param {string} key "water:<id>" or "traffic:<id>" @returns {ViewerCamera | null} */
function viewerCameraFor(key) {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (kind === "water") { const camera = WATER_CAMERAS.find((item) => item.id === id); return camera ? waterViewerCamera(camera) : null; }
  const camera = state.trafficCameras?.find((item) => item.id === id);
  return camera ? trafficViewerCamera(camera) : null;
}

const viewer = createCameraViewer(byId("camera-viewer", HTMLDialogElement), {
  onShowOnMap(camera) {
    if (!map) return;
    const [kind, ...rest] = camera.id.split(":");
    const id = rest.join(":");
    const marker = kind === "water" ? camerasLayer?.markerFor(id) : trafficCamerasLayer?.markerFor(id);
    if (kind === "water") setToggle(ui.toggleCamera, true);
    else setToggle(ui.toggleTrafficCameras, true);
    scrollToMap();
    focusOnMap(map, [camera.lat, camera.lng], FOCUS_ZOOM, marker);
  }
});

/** Load (or reload) camera thumbnails in the camera tab; the cache-buster forces a fresh frame. */
function refreshThumbnails() {
  ui.tabContent.querySelectorAll("img[data-thumb]").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    const card = img.closest(".cam-card");
    const badge = card?.querySelector(".cam-badge");
    const base = img.dataset.thumb ?? "";
    /** @param {string} text @param {string} className */
    const setBadge = (text, className) => { if (badge) { badge.textContent = text; badge.className = `cam-badge ${className}`; } };
    // Some camera hosts never answer; do not leave "กำลังโหลด" up forever.
    const timeout = setTimeout(() => { if (!img.complete || !img.naturalWidth) setBadge("ไม่ตอบสนอง", "is-offline"); }, THUMBNAIL_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timeout); setBadge("สด", "is-live"); };
    img.onerror = () => { clearTimeout(timeout); setBadge("ไม่มีสัญญาณ", "is-offline"); };
    img.src = `${base}${base.includes("?") ? "&" : "?"}t=${Date.now()}`;
  });
}

function gatesView() {
  const from = center();
  /** @param {{ lat: number, lng: number }} point */
  const km = (point) => distanceKm(from, [point.lat, point.lng]);
  const gates = state.gates.items?.map((gate) => ({ gate, distance: km(gate) })).sort((a, b) => a.distance - b.distance) ?? null;
  const ranked = state.dams.items ? rankDams(state.dams.items) : null;
  return {
    gates: gates ? gates.slice(0, GATE_LIST_LIMIT) : null,
    gateTotal: state.gates.items?.length ?? 0,
    gateError: state.gates.error,
    gateUnsupported: state.gates.unsupported,
    dams: ranked ? ranked.slice(0, DAM_LIST_LIMIT).map(({ dam, status }) => ({ dam, status, distance: km(dam) })) : null,
    damTotal: ranked?.length ?? 0,
    damCounts: {
      over: ranked?.filter(({ status }) => status === "over").length ?? 0,
      high: ranked?.filter(({ status }) => status === "high").length ?? 0
    },
    damError: state.dams.error,
    damUnsupported: state.dams.unsupported
  };
}

/** @returns {string} */
function tabHtml() {
  switch (state.tab) {
    case "risk": return riskTabHtml(riskView());
    case "flood": return floodTabHtml(floodView());
    case "camera": return cameraTabHtml(cameraView());
    case "gates": return gatesTabHtml(gatesView());
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
    // Show the map first: flying on a hidden (zero-size) map lands in the wrong place.
    if (mobileQuery.matches) scrollToMap();
    showStation(station, Math.max(map.getZoom(), LOCATE_ZOOM));
  },
  onCamera(id) {
    const camera = CAMERA_SOURCES.find((item) => item.id === id);
    if (!camera || !map || !camerasLayer) return;
    setToggle(ui.toggleCamera, true);
    scrollToMap();
    focusOnMap(map, [camera.lat, camera.lng], FOCUS_ZOOM, camerasLayer.markerFor(camera.id));
  },
  onViewer(key) {
    const camera = viewerCameraFor(key);
    if (camera) viewer.open(camera);
  },
  onGate(id) {
    const gate = state.gates.items?.find((item) => item.id === id);
    if (!gate || !map) return;
    setToggle(ui.toggleGates, true);
    scrollToMap();
    focusOnMap(map, [gate.lat, gate.lng], FOCUS_ZOOM, waterGatesLayer?.markerFor(gate.id));
  },
  onDam(id) {
    const dam = state.dams.items?.find((item) => item.id === id);
    if (!dam || !map) return;
    setToggle(ui.toggleDams, true);
    scrollToMap();
    focusOnMap(map, [dam.lat, dam.lng], LOCATE_ZOOM, damsLayer?.markerFor(dam.id));
  },
  onRoad(id) {
    const report = state.roadFloods?.find((item) => item.id === id);
    if (!report || !map || !roadFloodLayer) return;
    setToggle(ui.toggleRoadFlood, true);
    scrollToMap();
    focusOnMap(map, [report.lat, report.lng], FOCUS_ZOOM, roadFloodLayer.markerFor(report.id));
  },
  onAction(action) {
    if (action === "retry") loadStations();
    else if (action === "toggle-traffic") { setToggle(ui.toggleTraffic, !ui.toggleTraffic.checked); saveLayerPref("traffic", ui.toggleTraffic.checked); }
    else if (action === "toggle-flood") { setToggle(ui.toggleFlood, !ui.toggleFlood.checked); saveLayerPref("flood", ui.toggleFlood.checked); }
    else if (action === "toggle-risk-only") setToggle(ui.toggleRiskOnly, !ui.toggleRiskOnly.checked);
    else if (action === "more-traffic-cameras") { state.trafficCameraLimit += TRAFFIC_CAMERA_PAGE_SIZE; renderList(); }
  }
});

function renderList() {
  try {
    if (listPanel.render(tabHtml()) && state.tab === "camera") refreshThumbnails();
  } catch (error) {
    // One bad record from an upstream feed must not freeze the whole app.
    console.error("render failed", state.tab, error);
    listPanel.render(`<div class="empty"><strong>แสดงข้อมูลส่วนนี้ไม่ได้</strong><p>ข้อมูลจากต้นทางมีรูปแบบที่ไม่คาดคิด ลองรีเฟรชหรือเปิดเมนูอื่น</p></div>`);
  }
  try { renderSummary(); } catch (error) { console.error("summary failed", error); }
}

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
  closeLayerSheet();
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item instanceof HTMLElement && item.dataset.nav === tab));
  // Switch screens before rendering, so navigation still works even if a section fails to render.
  if (mobileQuery.matches) setView("panel");
  setTab(tab);
  if (!mobileQuery.matches) ui.insights.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** @param {boolean} open */
function setLayerSheet(open) {
  ui.layerSheet.classList.toggle("is-open", open);
  ui.openLayers.setAttribute("aria-expanded", String(open));
}
const closeLayerSheet = () => setLayerSheet(false);

/** Banner, summary numbers, alert badge and "updated" time. Cheap enough to run on every render. */
function renderSummary() {
  const from = center();
  const risky = riskyStations(state.stations);
  const overflow = risky.filter(({ risk }) => risk.status === "overflow").length;
  const nearby = risky
    .map(({ station, risk }) => ({ station, risk, distance: distanceKm(from, [station.lat, station.lng]) }))
    .filter(({ distance }) => distance <= NEARBY_RADIUS_KM)
    .sort((a, b) => (a.risk.status === b.risk.status ? a.distance - b.distance : a.risk.status === "overflow" ? -1 : 1))[0] ?? null;
  const banner = alertBannerHtml(nearby);
  ui.alertBanner.hidden = !banner;
  if (banner) {
    ui.alertBanner.innerHTML = banner.html;
    ui.alertBanner.className = `alert-banner level-${banner.level}`;
    ui.alertBanner.dataset.station = nearby?.station.id ?? "";
  }
  const hasData = state.stations.length > 0;
  ui.kpi.overflow.textContent = hasData ? formatCount(overflow) : "–";
  ui.kpi.high.textContent = hasData ? formatCount(risky.length - overflow) : "–";
  ui.kpi.overflow.closest(".kpi")?.classList.toggle("is-alert", overflow > 0);
  ui.kpi.roads.textContent = state.roadFloods ? formatCount(state.roadFloods.length) : "–";
  ui.kpi.cameras.textContent = formatCount(WATER_CAMERAS.length + (state.trafficCameras?.length ?? 0));
  ui.navRiskBadge.hidden = overflow === 0;
  ui.navRiskBadge.textContent = overflow > 99 ? "99+" : String(overflow);
  ui.updatedAt.textContent = fmtClock(state.fetchedAt);
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

async function loadTrafficCameras() {
  try {
    state.trafficCameras = await fetchTrafficCameras();
    state.trafficCameraError = null;
    trafficCamerasLayer?.update(state.trafficCameras);
    ui.trafficCameraNote.textContent = `iTIC · ${formatCount(state.trafficCameras.length)} กล้อง`;
  } catch (error) {
    state.trafficCameraError = error instanceof Error && error.message ? error.message : "โหลดรายชื่อกล้องจราจรไม่ได้";
    ui.trafficCameraNote.textContent = "iTIC · โหลดไม่ได้";
  } finally {
    renderList();
  }
}

/**
 * Load one list feed into state, update its map layer and sidebar note.
 * @template T
 * @param {{ items: T[] | null, error: string | null, unsupported: boolean }} slot
 * @param {() => Promise<{ items: T[], unsupported: boolean }>} fetcher
 * @param {{ update: (items: T[]) => void } | null} layer
 * @param {HTMLElement} note
 * @param {string} unit e.g. "แห่ง"
 */
async function loadFeed(slot, fetcher, layer, note, unit) {
  try {
    const data = await fetcher();
    Object.assign(slot, { items: data.items, error: null, unsupported: data.unsupported });
    layer?.update(data.items);
    note.textContent = data.unsupported ? "ThaiWater · รูปแบบข้อมูลยังไม่รองรับ" : `ThaiWater · ${formatCount(data.items.length)} ${unit}`;
  } catch (error) {
    slot.error = error instanceof Error && error.message ? error.message : "โหลดข้อมูลไม่ได้";
    note.textContent = "ThaiWater · โหลดไม่ได้";
  } finally {
    renderList();
  }
}
const loadWaterGates = () => loadFeed(state.gates, fetchWaterGates, waterGatesLayer, ui.gateNote, "แห่ง");
const loadDams = () => loadFeed(state.dams, fetchDams, damsLayer, ui.damNote, "แห่ง");

const RELOAD_MARKER_KEY = "rutan-reloaded-for";

/**
 * Old cached JS with a newer deploy breaks features (e.g. new menu items do nothing).
 * Reload once per server version; the marker stops a reload loop if the cache still wins.
 * @param {string | undefined} serverVersion
 * @returns {boolean} true when a reload was started
 */
function reloadIfOutdated(serverVersion) {
  if (!serverVersion || serverVersion === APP_VERSION) return false;
  try {
    if (sessionStorage.getItem(RELOAD_MARKER_KEY) === serverVersion) return false;
    sessionStorage.setItem(RELOAD_MARKER_KEY, serverVersion);
  } catch (_) { return false; } // Without storage we cannot guard against a loop.
  location.reload();
  return true;
}

async function loadLayerConfig() {
  state.config = await fetchLayerConfig();
  if (reloadIfOutdated(state.config.version)) return;
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
ui.toggleCamera.addEventListener("change", () => camerasLayer?.setVisible(ui.toggleCamera.checked));
ui.toggleTrafficCameras.addEventListener("change", () => trafficCamerasLayer?.setVisible(ui.toggleTrafficCameras.checked));
ui.toggleGates.addEventListener("change", () => waterGatesLayer?.setVisible(ui.toggleGates.checked));
ui.toggleDams.addEventListener("change", () => damsLayer?.setVisible(ui.toggleDams.checked));
ui.openLayers.addEventListener("click", () => setLayerSheet(!ui.layerSheet.classList.contains("is-open")));
byId("close-layers").addEventListener("click", closeLayerSheet);
ui.alertBanner.addEventListener("click", () => {
  const station = state.stations.find((s) => s.id === ui.alertBanner.dataset.station);
  if (!station) return;
  scrollToMap();
  showStation(station, FOCUS_ZOOM);
});
document.querySelectorAll("[data-kpi]").forEach((button) => button.addEventListener("click", () => {
  const tab = button instanceof HTMLElement ? button.dataset.kpi : undefined;
  if (isTab(tab)) showSection(tab);
}));
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
  if (tab === "camera") setToggle(ui.toggleCamera, true);
  if (tab === "water") setToggle(ui.toggleWater, true);
  if (tab === "risk") setToggle(ui.toggleWater, true);
  if (tab === "flood") { setToggle(ui.toggleFlood, true); setToggle(ui.toggleRoadFlood, true); }
  if (tab === "road") setToggle(ui.toggleTraffic, true);
  if (tab === "gates") { setToggle(ui.toggleGates, true); setToggle(ui.toggleDams, true); }
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
  else if (choice === "map") { scrollToMap(); document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item === button)); }
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
trafficCamerasLayer?.setVisible(ui.toggleTrafficCameras.checked);
waterGatesLayer?.setVisible(ui.toggleGates.checked);
damsLayer?.setVisible(ui.toggleDams.checked);
setView("map");
renderList();
loadTrafficCameras();
loadWaterGates();
loadDams();
loadStations();
loadRoadFloods();
loadLayerConfig();
basemap?.setStyle(ui.mapStyle.value);
setInterval(() => { if (!document.hidden) { loadStations(); loadRoadFloods(); loadWaterGates(); } }, STATION_REFRESH_MS);
setInterval(() => { if (!document.hidden) loadDams(); }, DAM_REFRESH_MS);
setInterval(() => { if (!document.hidden && state.tab === "camera") refreshThumbnails(); }, THUMBNAIL_REFRESH_MS);
// Leaving the phone layout (rotate/resize) must not leave the map hidden.
mobileQuery.addEventListener("change", () => { if (!mobileQuery.matches) setView("map"); });
// Background tabs skip the interval, so catch up as soon as the page is visible again.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || age(state.fetchedAt) < STATION_REFRESH_MS) return;
  loadStations();
  loadRoadFloods();
});
