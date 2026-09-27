// Composition root: owns app state and wires modules to the DOM.
import { CAMERA_SOURCES, FOCUS_ZOOM, GEOLOCATION_OPTIONS, LOCATE_ZOOM, MOBILE_BREAKPOINT_PX, NEAREST_STATION_LIMIT, RANGSIT, DEFAULT_ZOOM, STATION_REFRESH_MS } from "./config.js";
import { fetchStations } from "./api.js";
import { loadCachedStations, loadHome, saveCachedStations, saveHome } from "./storage.js";
import { age, nearestStations, searchStations } from "./utils.js";
import { createMap, focusOnMap } from "./map/map.js";
import { createBasemap } from "./map/basemap.js";
import { createStationsLayer } from "./map/stations-layer.js";
import { createCamerasLayer } from "./map/cameras-layer.js";
import { createLocationLayer } from "./map/location-layer.js";
import { startClock } from "./ui/clock.js";
import { createStatusView } from "./ui/status.js";
import { createListPanel } from "./ui/list-panel.js";

const $ = (id) => document.getElementById(id);
const cached = loadCachedStations();
const state = {
  stations: cached?.stations ?? [],
  fetchedAt: cached?.fetchedAt ?? null,
  error: null,
  loading: false,
  tab: "water",
  home: loadHome(),
  you: null,
  placingHome: false
};
const center = () => state.home ? [state.home.lat, state.home.lng] : state.you || RANGSIT;
const scrollToMap = (block = "start") => document.querySelector(".map-panel").scrollIntoView({ behavior: "smooth", block });

// ---- Map & layers (all optional: the lists still work if Leaflet failed to load)
const map = createMap("map", center());
if (!map) $("map-fallback").hidden = false;
const basemap = map && createBasemap(map, { onFallback: () => { $("map-style").value = "classic"; } });
const stationsLayer = map && createStationsLayer(map);
const camerasLayer = map && createCamerasLayer(map, CAMERA_SOURCES);
const locationLayer = map && createLocationLayer(map);
const status = createStatusView($);

const listPanel = createListPanel($("tab-content"), {
  onStation(id) {
    const station = state.stations.find((s) => s.id === id);
    if (!station || !map) return;
    showStation(station, Math.max(map.getZoom(), LOCATE_ZOOM));
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) scrollToMap();
  },
  onCamera(id) {
    const camera = CAMERA_SOURCES.find((item) => item.id === id);
    if (!camera || !map) return;
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

function setLayerVisible(kind, visible) {
  const input = $(kind === "water" ? "toggle-water" : "toggle-camera");
  const layer = kind === "water" ? stationsLayer : camerasLayer;
  input.checked = visible;
  layer?.setVisible(visible);
}

function showStation(station, zoom) {
  if (!map) return;
  setLayerVisible("water", true);
  focusOnMap(map, [station.lat, station.lng], zoom, stationsLayer.markerFor(station.id));
}

function setTab(tab) {
  const button = document.querySelector(`.tab[data-tab="${tab}"]`);
  if (!button) return;
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); });
  document.querySelectorAll("[data-quick]").forEach((item) => item.classList.toggle("selected", item.dataset.quick === tab));
  renderList();
}

function openSection(tab) {
  setTab(tab);
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item.dataset.nav === tab));
  document.querySelector(".insights").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLocation() {
  locationLayer?.update({ home: state.home, you: state.you });
  if (state.home) {
    $("area-title").textContent = "บ้านของฉัน";
    $("area-coords").textContent = `${state.home.lat.toFixed(4)}, ${state.home.lng.toFixed(4)}`;
    $("home-button-label").textContent = "ย้ายหมุดบ้าน";
  } else if (state.you) {
    $("area-title").textContent = "ตำแหน่งปัจจุบัน";
    $("area-coords").textContent = `${state.you[0].toFixed(4)}, ${state.you[1].toFixed(4)}`;
  }
}

// ---- Data loading
async function loadStations() {
  if (state.loading) return;
  state.loading = true;
  status.loading();
  try {
    const data = await fetchStations();
    Object.assign(state, { stations: data.stations, fetchedAt: data.fetchedAt, error: null });
    saveCachedStations(state.stations, state.fetchedAt);
    status.loaded(state.stations.length, state.fetchedAt);
    $("search-message").hidden = true;
  } catch (error) {
    state.error = error.message || "เชื่อมต่อไม่ได้";
    status.failed(state.stations.length, state.fetchedAt);
  } finally {
    state.loading = false;
    status.done();
    stationsLayer?.update(state.stations);
    renderList();
  }
}

// ---- Event wiring
$("refresh").addEventListener("click", () => loadStations());
$("map-retry").addEventListener("click", () => location.reload());
$("map-style").addEventListener("change", (event) => basemap?.setStyle(event.target.value));
$("recenter").addEventListener("click", () => map?.flyTo(RANGSIT, DEFAULT_ZOOM));
$("toggle-water").addEventListener("change", (event) => stationsLayer?.setVisible(event.target.checked));
$("toggle-camera").addEventListener("change", (event) => { camerasLayer?.setVisible(event.target.checked); if (event.target.checked) setTab("camera"); });
$("flood-sources").addEventListener("click", () => openSection("flood"));
$("map-locate").addEventListener("click", () => $("locate").click());
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));

$("home-button").addEventListener("click", () => {
  if (!map) { $("location-message").textContent = "แผนที่ยังไม่พร้อมใช้งาน"; return; }
  state.placingHome = true;
  $("location-message").textContent = "แตะจุดบ้านของคุณบนแผนที่เพื่อบันทึก";
  scrollToMap("center");
});
map?.on("click", ({ latlng }) => {
  if (!state.placingHome) return;
  state.placingHome = false;
  state.home = { lat: latlng.lat, lng: latlng.lng };
  $("location-message").textContent = saveHome(state.home) ? "บันทึกหมุดบ้านบนอุปกรณ์นี้แล้ว" : "ปักหมุดแล้ว แต่เบราว์เซอร์ไม่อนุญาตให้บันทึกถาวร";
  renderLocation(); renderList();
});

$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { $("location-message").textContent = "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง"; return; }
  $("location-message").textContent = "กำลังขอตำแหน่งจากอุปกรณ์...";
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    state.you = [coords.latitude, coords.longitude];
    $("location-message").textContent = `ตำแหน่งโดยประมาณ · ความแม่นยำ ±${Math.round(coords.accuracy)} ม.`;
    renderLocation(); renderList();
    map?.flyTo(state.you, LOCATE_ZOOM);
  }, (error) => {
    $("location-message").textContent = error.code === error.PERMISSION_DENIED
      ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS หรือปักหมุดบ้านเอง"
      : "ระบุตำแหน่งไม่สำเร็จ ลองอีกครั้งในที่โล่ง หรือปักหมุดบ้านเอง";
  }, GEOLOCATION_OPTIONS);
});

document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
  const choice = button.dataset.quick;
  if (choice === "camera") { setLayerVisible("camera", true); map?.fitBounds(camerasLayer.bounds(), { padding: [36, 36], maxZoom: 10 }); }
  if (choice === "water") setLayerVisible("water", true);
  openSection(choice);
}));

document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item === button));
  const choice = button.dataset.nav;
  if (choice === "locate") { $("locate").click(); scrollToMap(); }
  else if (choice === "map") scrollToMap();
  else openSection(choice);
}));

$("station-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = $("search-message");
  const query = $("station-query").value;
  message.hidden = false;
  if (!query.trim()) { message.textContent = "พิมพ์ชื่อสถานีหรือจังหวัดก่อนค้นหา"; return; }
  if (!state.stations.length) { message.textContent = "ข้อมูลสถานียังไม่พร้อม ลองรีเฟรชอีกครั้ง"; return; }
  const matches = searchStations(state.stations, query, center());
  if (!matches.length) { message.textContent = "ไม่พบสถานีในข้อมูลล่าสุด ลองชื่อจังหวัดหรือคำใกล้เคียง"; return; }
  const [match] = matches;
  setTab("water");
  showStation(match, FOCUS_ZOOM);
  message.textContent = `พบ ${matches.length} สถานี · แสดง ${match.name} (${match.province || "ไม่ระบุจังหวัด"})`;
});

// ---- Start-up: data first, then the (optional, heavy) vector basemap.
startClock($("clock"), $("today"));
renderLocation();
if (state.stations.length) {
  status.cached(state.stations.length, state.fetchedAt);
  stationsLayer?.update(state.stations);
}
renderList();
loadStations();
basemap?.setStyle($("map-style").value);
setInterval(() => { if (!document.hidden) loadStations(); }, STATION_REFRESH_MS);
// Background tabs skip the interval, so catch up as soon as the page is visible again.
document.addEventListener("visibilitychange", () => { if (!document.hidden && age(state.fetchedAt) >= STATION_REFRESH_MS) loadStations(); });
