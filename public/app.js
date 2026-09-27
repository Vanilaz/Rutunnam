(() => {
  "use strict";
  const RANGSIT = [13.986, 100.616];
  const MINUTE_MS = 60 * 1000;
  const HOUR_MS = 60 * MINUTE_MS;
  const STATION_REFRESH_MS = 2 * MINUTE_MS;
  const FETCH_TIMEOUT_MS = 25 * 1000; // Longer than the 20 s upstream timeout in /api/water.
  const CACHE_MAX_AGE_MS = 24 * HOUR_MS;
  const STALE_READING_MS = 6 * HOUR_MS;
  const DEFAULT_CAMERA_REFRESH_MS = 10 * 1000;
  const MOBILE_BREAKPOINT_PX = 721;
  const WATER_CACHE_KEY = "rutan-water-cache";
  const HOME_KEY = "rutan-home";
  const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const VECTOR_ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  // BMA DDS publishes six coordinates. Rangsit camera uses an approximate area pin.
  const cameraSources = [
    { id: "dds1", name: "บางเขนใหม่", area: "คลอง · กรุงเทพมหานคร", lat: 13.8712025, lng: 100.6009522, url: "https://dds.bangkok.go.th/cctv1.php", image: "https://dds.bangkok.go.th/cctv-image/cctv1.jpg" },
    { id: "dds2", name: "สะพานพระปิ่นเกล้า", area: "แม่น้ำเจ้าพระยา", lat: 13.7638088, lng: 100.4880244, url: "https://dds.bangkok.go.th/cctv2.php", image: "https://dds.bangkok.go.th/cctv-image/cctv2.jpg" },
    { id: "dds3", name: "บางนา", area: "คลอง · กรุงเทพมหานคร", lat: 13.66605, lng: 100.5814148, url: "https://dds.bangkok.go.th/cctv3.php", image: "https://dds.bangkok.go.th/cctv-image/cctv3.jpg" },
    { id: "dds4", name: "คลองสวนแดน 1", area: "คลอง · นครปฐม", lat: 13.8504178, lng: 100.2143995, url: "https://dds.bangkok.go.th/cctv4.php", image: "https://dds.bangkok.go.th/cctv-image/cctv4.jpg" },
    { id: "dds5", name: "คลองชักพระ", area: "คลอง · กรุงเทพมหานคร", lat: 13.7626065, lng: 100.4419398, url: "https://dds.bangkok.go.th/cctv5.php", image: "https://dds.bangkok.go.th/cctv-image/cctv5.jpg" },
    { id: "dds6", name: "คลองทวีวัฒนา", area: "คลอง · กรุงเทพมหานคร", lat: 13.7471152, lng: 100.3203025, url: "https://dds.bangkok.go.th/cctv6.php", image: "https://dds.bangkok.go.th/cctv-image/cctv6.jpg" },
    { id: "rangsit-water", name: "ท่าน้ำสะพานแดง · ระดับน้ำรังสิต", area: "คลองรังสิตประยูรศักดิ์ · พิกัดพื้นที่โดยประมาณ", lat: 13.986, lng: 100.616, url: "https://rangsitcity.go.th/cctvrangsitcity/", image: "https://www.ipcamlive.com/player/snapshot.php?alias=6ab688b9f0f7d", refreshMs: 120000, source: "เทศบาลนครรังสิต" },
    { id: "rangsit", name: "กล้องจราจรเทศบาลนครรังสิต", area: "รังสิต ปทุมธานี", lat: 13.982, lng: 100.621, url: "https://rangsitcity.go.th/cctvrangsitcity/", note: "มีกล้องจราจรหลายจุดบนเว็บไซต์เทศบาล ลิงก์บางกล้องเป็น HTTP จึงเปิดภาพตรงบนเว็บ HTTPS ไม่ได้", directory: true },
    { id: "rid", name: "ศูนย์กล้องลุ่มน้ำเจ้าพระยา", area: "ลุ่มน้ำเจ้าพระยา", lat: 14.35, lng: 100.45, url: "https://wmsc.rid.go.th/cctv2/", note: "เว็บไซต์กรมชลประทานระบุว่ารองรับ Firefox", directory: true }
  ];
  const el = (id) => document.getElementById(id);
  const state = { map: null, baseLayer: null, vectorLayer: null, layer: null, cameraLayer: null, cameraMarkers: new Map(), cameraTimer: null, stationMarkers: new Map(), pendingFocus: null, stations: [], you: null, home: null, homeMarker: null, youMarker: null, fetchedAt: null, loading: false, tab: "water", placingHome: false, error: null };
  // Leaflet throws on NaN coordinates, so anything from storage or the network is checked first.
  const validStations = (list) => Array.isArray(list) ? list.filter((s) => s && typeof s === "object" && s.id !== undefined && Number.isFinite(s.lat) && Number.isFinite(s.lng)).map((s) => ({ ...s, id: String(s.id) })) : [];
  try {
    const cached = JSON.parse(localStorage.getItem(WATER_CACHE_KEY) || "null");
    const stations = validStations(cached?.stations);
    const cachedAge = Date.now() - new Date(cached?.fetchedAt).getTime();
    if (stations.length && cachedAge >= 0 && cachedAge < CACHE_MAX_AGE_MS) {
      state.stations = stations;
      state.fetchedAt = cached.fetchedAt;
    }
  } catch (_) { /* Cache is optional. */ }
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) state.home = { lat: saved.lat, lng: saved.lng };
  } catch (_) { /* Storage can be unavailable in private browsing. */ }

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const timeFormat = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtTime = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? timeFormat.format(date) : "ไม่มีเวลาตรวจวัด";
  };
  const distanceKm = (a, b) => {
    const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  const center = () => state.home ? [state.home.lat, state.home.lng] : state.you || RANGSIT;
  const age = (date) => {
    const time = date ? new Date(date).getTime() : NaN;
    return Number.isNaN(time) ? Infinity : Date.now() - time;
  };
  const isFresh = (s) => age(s.measuredAt) < STALE_READING_MS;
  const levelText = (s) => Number.isFinite(s.level) ? s.level.toFixed(2) : "—";
  const imageCameras = cameraSources.filter((camera) => !camera.directory);
  const cameraDirectories = cameraSources.filter((camera) => camera.directory);
  const scrollToMap = (block = "start") => document.querySelector(".map-panel").scrollIntoView({ behavior: "smooth", block });
  function setTab(tab) {
    const button = document.querySelector(`[data-tab="${tab}"]`);
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
  // Open a popup only once the fly animation ends; opening it mid-flight makes autoPan fight flyTo.
  function focusOnMap(latlng, zoom, marker) {
    if (!state.map) return;
    if (state.pendingFocus) state.map.off("moveend", state.pendingFocus);
    state.pendingFocus = () => {
      state.pendingFocus = null;
      if (marker && state.map.hasLayer(marker)) marker.openPopup();
    };
    state.map.once("moveend", state.pendingFocus);
    state.map.flyTo(latlng, zoom);
  }

  function tickClock() {
    const now = new Date();
    el("clock").textContent = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    el("today").textContent = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  }
  // Re-render right after each minute boundary so the clock never lags behind real time.
  (function scheduleClock() { tickClock(); setTimeout(scheduleClock, MINUTE_MS - (Date.now() % MINUTE_MS) + 50); })();

  function icon(kind) { return L.divIcon({ className: "", html: `<div class="map-pin ${kind}" style="width:${kind ? 19 : 15}px;height:${kind ? 19 : 15}px"></div>`, iconSize: kind ? [19, 19] : [15, 15], iconAnchor: kind ? [9, 9] : [7, 7] }); }
  function initMap() {
    if (!window.L) { el("map-fallback").hidden = false; return; }
    state.map = L.map("map", { zoomControl: false, preferCanvas: true }).setView(center(), 11);
    state.baseLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(state.map);
    setMapStyle(el("map-style").value);
    L.control.zoom({ position: "bottomright" }).addTo(state.map);
    state.layer = L.layerGroup().addTo(state.map);
    state.cameraLayer = L.layerGroup().addTo(state.map);
    state.map.on("popupopen", () => document.querySelector(".map-panel").classList.add("showing-popup"));
    state.map.on("popupclose", () => document.querySelector(".map-panel").classList.remove("showing-popup"));
    renderCameras();
    state.map.on("click", ({ latlng }) => {
      if (!state.placingHome) return;
      state.placingHome = false;
      state.home = { lat: latlng.lat, lng: latlng.lng };
      try { localStorage.setItem(HOME_KEY, JSON.stringify(state.home)); } catch (_) { /* Optional preference. */ }
      el("home-button-label").textContent = "ย้ายหมุดบ้าน";
      el("location-message").textContent = "บันทึกหมุดบ้านบนอุปกรณ์นี้แล้ว";
      updateLocation(); renderStations(); renderList();
    });
    if (state.home) { el("home-button-label").textContent = "ย้ายหมุดบ้าน"; updateLocation(); }
  }

  let webglSupport = null;
  function supportsWebGL() {
    if (webglSupport !== null) return webglSupport;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      webglSupport = Boolean(gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch (_) { webglSupport = false; }
    return webglSupport;
  }
  // maplibregl.supported() was removed in MapLibre v3+, so feature-detect WebGL ourselves.
  const canUseVectorMap = () => Boolean(window.maplibregl && window.L && L.maplibreGL) && supportsWebGL();

  function discardVectorLayer(layer) {
    if (!layer || !state.map) return;
    // When MapLibre throws inside onAdd the plugin has no GL map, and its own onRemove would throw too.
    if (!layer.getMaplibreMap()) layer.onRemove = function () { const container = this.getContainer(); if (container) L.DomUtil.remove(container); };
    try { state.map.removeLayer(layer); } catch (_) { /* Layer was never fully attached. */ }
  }

  function useClassicMap() {
    if (state.vectorLayer) { discardVectorLayer(state.vectorLayer); state.vectorLayer = null; }
    if (!state.map.hasLayer(state.baseLayer)) state.baseLayer.addTo(state.map);
    el("map-style").value = "classic";
  }

  function setMapStyle(style) {
    if (!state.map) return;
    if (style !== "vector" || !canUseVectorMap()) { useClassicMap(); return; }
    if (state.vectorLayer) return;
    // Keep the raster map underneath until the vector style has rendered.
    if (!state.map.hasLayer(state.baseLayer)) state.baseLayer.addTo(state.map);
    let vector = null;
    try {
      vector = L.maplibreGL({ style: VECTOR_STYLE_URL, attributionControl: { customAttribution: VECTOR_ATTRIBUTION } });
      vector.addTo(state.map);
    } catch (_) { discardVectorLayer(vector); useClassicMap(); return; }
    state.vectorLayer = vector;
    const gl = vector.getMaplibreMap();
    let rendered = false;
    gl.once("load", () => {
      rendered = true;
      if (state.vectorLayer === vector && state.map.hasLayer(state.baseLayer)) state.map.removeLayer(state.baseLayer);
    });
    // A tile error after the first render is harmless; only a style that never renders needs the raster fallback.
    // Defer the switch so the GL map is not removed while it is still dispatching this event.
    gl.on("error", () => { if (!rendered && state.vectorLayer === vector) setTimeout(() => { if (state.vectorLayer === vector) useClassicMap(); }, 0); });
  }

  function updateLocation() {
    if (!state.map) return;
    if (state.homeMarker) state.map.removeLayer(state.homeMarker);
    if (state.youMarker) state.map.removeLayer(state.youMarker);
    if (state.home) {
      state.homeMarker = L.marker([state.home.lat, state.home.lng], { icon: icon("home"), zIndexOffset: 1000 }).addTo(state.map).bindPopup("<strong>บ้านของฉัน</strong><br><small>หมุดที่บันทึกไว้ในเครื่องนี้</small>");
      el("area-title").textContent = "บ้านของฉัน";
      el("area-coords").textContent = `${state.home.lat.toFixed(4)}, ${state.home.lng.toFixed(4)}`;
    }
    if (state.you) state.youMarker = L.marker(state.you, { icon: icon("you"), zIndexOffset: 900 }).addTo(state.map).bindPopup("<strong>ตำแหน่งฉัน</strong><br><small>พิกัดโดยประมาณจากอุปกรณ์</small>");
    if (!state.home && state.you) { el("area-title").textContent = "ตำแหน่งปัจจุบัน"; el("area-coords").textContent = `${state.you[0].toFixed(4)}, ${state.you[1].toFixed(4)}`; }
  }

  function renderStations() {
    if (!state.layer || !state.map) return;
    state.layer.clearLayers();
    state.stationMarkers.clear();
    if (!el("toggle-water").checked) return;
    for (const s of state.stations) {
      const marker = L.circleMarker([s.lat, s.lng], { radius: 6, color: "#fff", weight: 2, fillColor: "#0d9e9a", fillOpacity: 1 });
      marker.bindPopup(`<strong>${escape(s.name)}</strong><br><small>${escape(s.province || "สถานีตรวจวัด")}</small><br>ระดับน้ำ ${levelText(s)} ม. รทก.<br><small>ตรวจวัด: ${escape(fmtTime(s.measuredAt))}${isFresh(s) ? "" : " · ข้อมูลเก่า/ไม่ทราบเวลา"}</small><br><a href="${escape(s.sourceUrl || "https://www.thaiwater.net/")}" target="_blank" rel="noopener noreferrer">ดูที่มา ↗</a>`);
      marker.addTo(state.layer);
      state.stationMarkers.set(s.id, marker);
    }
  }

  // Look markers up by station id; matching by coordinates opens the wrong popup when stations share a location.
  function showStation(s, zoom) {
    if (!s || !state.map) return;
    if (!el("toggle-water").checked) { el("toggle-water").checked = true; renderStations(); }
    focusOnMap([s.lat, s.lng], zoom, state.stationMarkers.get(s.id));
  }

  function renderCameras() {
    if (!state.cameraLayer) return;
    if (state.cameraTimer) { clearInterval(state.cameraTimer); state.cameraTimer = null; }
    state.cameraLayer.clearLayers();
    state.cameraMarkers.clear();
    if (!el("toggle-camera").checked) return;
    for (const camera of cameraSources) {
      const cameraIcon = L.divIcon({ className: "", html: `<div class="camera-pin${camera.directory ? " directory" : ""}"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="15" height="12" rx="2"/><path d="m18 10 4-2v8l-4-2"/></svg></div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
      const preview = camera.image ? `<div class="camera-preview"><img alt="ภาพกล้อง ${escape(camera.name)}" loading="lazy"><span class="camera-error" hidden>ภาพจากต้นทางไม่พร้อมใช้งาน</span></div><small>${camera.refreshMs ? "ภาพตัวอย่างต้นทางอัปเดตราวทุก 2 นาที · หมุดเป็นพิกัดพื้นที่โดยประมาณ" : `ภาพจากต้นทางอัปเดตทุก ${DEFAULT_CAMERA_REFRESH_MS / 1000} วินาทีเมื่อเปิดดู`}</small>` : `<p>${escape(camera.note)}<br><small>หมุดนี้แทนพื้นที่ของศูนย์กล้อง ไม่ใช่พิกัดกล้องรายตัว</small></p>`;
      const marker = L.marker([camera.lat, camera.lng], { icon: cameraIcon, zIndexOffset: 300 })
        .bindPopup(`<div class="camera-popup"><strong>${escape(camera.name)}</strong><small>${escape(camera.area)} · ${camera.directory ? "ศูนย์กล้อง" : escape(camera.source || "กล้องดูระดับน้ำ กทม.")}</small>${preview}<a href="${escape(camera.url)}" target="_blank" rel="noopener noreferrer">เปิดเว็บไซต์ต้นทาง ↗</a></div>`, { maxWidth: 340, minWidth: 260, offset: [0, 24], autoPanPaddingTopLeft: [25, 85], autoPanPaddingBottomRight: [25, 25] })
        .addTo(state.cameraLayer);
      state.cameraMarkers.set(camera.id, marker);
      if (camera.image) marker.on("popupopen", (event) => {
        const popup = event.popup.getElement();
        const img = popup?.querySelector(".camera-preview img");
        const error = popup?.querySelector(".camera-error");
        if (!img) return;
        img.onerror = () => { img.hidden = true; if (error) error.hidden = false; };
        img.onload = () => { img.hidden = false; if (error) error.hidden = true; };
        const refresh = () => { if (!document.hidden) img.src = `${camera.image}${camera.image.includes("?") ? "&" : "?"}t=${Date.now()}`; };
        refresh();
        if (state.cameraTimer) clearInterval(state.cameraTimer);
        state.cameraTimer = setInterval(refresh, camera.refreshMs || DEFAULT_CAMERA_REFRESH_MS);
      });
      marker.on("popupclose", () => { if (state.cameraTimer) clearInterval(state.cameraTimer); state.cameraTimer = null; });
    }
  }

  function renderList() {
    const content = el("tab-content");
    if (state.tab === "road") {
      content.innerHTML = `<div class="content-heading"><strong>ตรวจเส้นทางก่อนออกเดินทาง</strong></div><p class="subtle">ข้อมูลจราจรกับระดับน้ำไม่สามารถยืนยันว่ารถแต่ละคันผ่านได้ ตรวจประกาศปิดถนนและสภาพหน้างานก่อนเดินทาง</p><div class="info-card"><strong>ทางหลวง · จุดที่สัญจรผ่านไม่ได้</strong><p>กรมทางหลวงรายงานสายทางที่ได้รับผลกระทบจากน้ำท่วม พร้อมจุดที่ผ่านไม่ได้</p><a class="link-button" href="https://hdms.doh.go.th/" target="_blank" rel="noopener noreferrer">ตรวจแผนที่ภัยพิบัติทางหลวง ↗</a></div><div class="info-card"><strong>กทม. · น้ำท่วมถนน</strong><p>ดูจุดวัดระดับน้ำท่วมถนนและเวลาอัปเดตของ กทม.</p><a class="link-button" href="https://floodbangkok.bangkok.go.th/road-flood" target="_blank" rel="noopener noreferrer">ตรวจถนนน้ำท่วม กทม. ↗</a></div><div class="info-card"><strong>สภาพจราจรทางหลวง</strong><p>ภาพกล้องและการจราจรจากกรมทางหลวง</p><a class="link-button" href="https://highwaytraffic.go.th/" target="_blank" rel="noopener noreferrer">ดูจราจร ↗</a></div><p class="subtle">สายด่วนกรมทางหลวง 1586 สำหรับสอบถามสภาพเส้นทางตลอด 24 ชั่วโมง</p>`;
      return;
    }
    if (state.tab === "flood") {
      content.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24"><path d="m12 3 10 18H2zM12 9v5m0 3h.01"/></svg><strong>ขอบเขตน้ำท่วมต้องตรวจจากต้นทาง</strong><p>แผนที่นี้ยังไม่ได้รับชั้นข้อมูลพื้นที่ท่วมที่เชื่อมต่อได้โดยตรง จึงไม่วาดพื้นที่สมมติบนแผนที่</p></div><div class="info-card"><strong>GISTDA · แผนที่น้ำท่วมจากดาวเทียม</strong><p>ดูขอบเขตที่ตรวจพบ พร้อมวันที่ของภาพแต่ละชุด ภาพดาวเทียมอาจไม่ใช่สภาพ ณ นาทีนี้</p><a class="link-button" href="https://disaster.gistda.or.th/flood" target="_blank" rel="noopener noreferrer">เปิดแผนที่ GISTDA ↗</a></div><div class="info-card"><strong>กทม. · น้ำท่วมถนน</strong><p>จุดตรวจวัดระดับน้ำบนถนนในเขตกรุงเทพมหานคร</p><a class="link-button" href="https://floodbangkok.bangkok.go.th/road-flood" target="_blank" rel="noopener noreferrer">เปิดข้อมูล กทม. ↗</a></div>`;
      return;
    }
    if (state.tab === "camera") {
      content.innerHTML = `<div class="content-heading"><strong>กล้องดูระดับน้ำ</strong><span>${imageCameras.length} กล้อง · ${cameraDirectories.length} ศูนย์</span></div><p class="subtle">กล้อง กทม. ${imageCameras.filter((camera) => !camera.source).length} จุด และกล้องระดับน้ำสะพานแดงของเทศบาลนครรังสิต กดเพื่อดูภาพบนแผนที่</p>` + cameraSources.map((camera) => `<div class="info-card"><strong>${escape(camera.name)}</strong><p>${escape(camera.area)}${camera.directory ? ` · ${escape(camera.note)}` : ` · ภาพจาก${escape(camera.source || "กล้อง กทม.")}`}</p>${camera.directory ? `<a class="link-button" href="${escape(camera.url)}" target="_blank" rel="noopener noreferrer">เปิดศูนย์กล้อง ↗</a>` : `<button class="link-button camera-open" data-camera="${escape(camera.id)}" type="button">ดูภาพบนแผนที่</button>`}</div>`).join("") + `<p class="subtle">ภาพเป็นชุด JPEG ที่ต้นทางอัปเดตเป็นระยะ ไม่ใช่วิดีโอสตรีม หากภาพไม่ขึ้นให้เปิดเว็บไซต์ต้นทาง</p>`;
      content.querySelectorAll(".camera-open").forEach((button) => button.addEventListener("click", () => {
        const camera = cameraSources.find((item) => item.id === button.dataset.camera);
        if (!camera || !state.map) return;
        if (!el("toggle-camera").checked) { el("toggle-camera").checked = true; renderCameras(); }
        focusOnMap([camera.lat, camera.lng], 13, state.cameraMarkers.get(camera.id));
        scrollToMap();
      }));
      return;
    }
    if (state.error && !state.stations.length) { content.innerHTML = `<div class="empty"><strong>ยังโหลดสถานีไม่ได้</strong><p>${escape(state.error)}</p><button class="link-button" id="retry" type="button">ลองโหลดอีกครั้ง</button></div>`; el("retry").addEventListener("click", loadStations); return; }
    if (!state.stations.length) { content.innerHTML = `<div class="empty"><strong>กำลังโหลดสถานี</strong><p>รอสักครู่เพื่อแสดงข้อมูลตรวจวัดล่าสุด</p></div>`; return; }
    const nearest = [...state.stations].sort((a, b) => distanceKm(center(), [a.lat, a.lng]) - distanceKm(center(), [b.lat, b.lng])).slice(0, 8);
    content.innerHTML = (state.error ? `<div class="cache-warning">ข้อมูลใหม่ยังไม่พร้อม · แสดงข้อมูลที่ดึง ${escape(fmtTime(state.fetchedAt))}</div>` : "") + `<div class="content-heading"><strong>สถานีใกล้จุดศูนย์กลาง</strong><span>${nearest.length} สถานี</span></div>` + nearest.map((s) => `<button type="button" class="station-card" data-station="${escape(s.id)}"><span class="row"><strong>${escape(s.name)}</strong><span class="distance">${distanceKm(center(), [s.lat, s.lng]).toFixed(1)} km</span></span><span class="meta">${escape(s.province || s.river || "ข้อมูลสถานี")}</span><span class="value">${levelText(s)} <small>เมตร รทก.</small></span><span class="time">ตรวจวัด ${escape(fmtTime(s.measuredAt))}${isFresh(s) ? "" : " · ข้อมูลเก่า/ไม่ทราบเวลา"}</span></button>`).join("") + `<p class="subtle">ระดับน้ำอ้างอิงระดับทะเลปานกลาง (รทก.) ไม่ใช่ความลึกน้ำบนถนน และยังไม่ใช้สรุปว่าล้นตลิ่งจนกว่าจะมีเกณฑ์รายสถานี</p>`;
    content.querySelectorAll("[data-station]").forEach((button) => button.addEventListener("click", () => {
      const s = state.stations.find((item) => item.id === button.dataset.station);
      if (!s || !state.map) return;
      showStation(s, Math.max(state.map.getZoom(), 12));
      if (window.innerWidth < MOBILE_BREAKPOINT_PX) scrollToMap();
    }));
  }

  async function fetchStations() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/water", { signal: controller.signal, headers: { Accept: "application/json" } });
      let data = null;
      try { data = await response.json(); } catch (_) { /* The platform can answer with an HTML error page. */ }
      const stations = validStations(data?.stations);
      if (!response.ok || !stations.length) throw new Error(data?.error || `แหล่งข้อมูลไม่พร้อมใช้งาน (HTTP ${response.status})`);
      return { stations, fetchedAt: data.fetchedAt || new Date().toISOString() };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("แหล่งข้อมูลตอบช้าเกินไป กรุณาลองใหม่");
      if (error instanceof TypeError) throw new Error("เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ");
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function loadStations() {
    if (state.loading) return;
    state.loading = true; state.error = null;
    el("refresh").disabled = true;
    el("feed-state").textContent = "กำลังตรวจสอบข้อมูล";
    el("map-status").textContent = "กำลังโหลดสถานีวัดน้ำ";
    try {
      const data = await fetchStations();
      state.stations = data.stations; state.fetchedAt = data.fetchedAt;
      try { localStorage.setItem(WATER_CACHE_KEY, JSON.stringify({ stations: state.stations, fetchedAt: state.fetchedAt })); } catch (_) { /* Storage quota or private mode. */ }
      el("station-count").textContent = `${state.stations.length.toLocaleString("th-TH")} สถานีทั่วประเทศ`;
      el("feed-state").textContent = "เชื่อมต่อ ThaiWater แล้ว";
      el("feed-detail").textContent = `ดึงข้อมูล ${fmtTime(state.fetchedAt)} · แต่ละสถานีมีเวลาตรวจวัดต่างกัน`;
      el("map-status").textContent = `${state.stations.length.toLocaleString("th-TH")} สถานี · ดูเวลารายจุด`;
      el("last-fetch").textContent = `ดึง ${fmtTime(state.fetchedAt)}`;
      el("search-message").hidden = true;
    } catch (error) {
      state.error = error.message || "เชื่อมต่อไม่ได้";
      el("feed-state").textContent = state.stations.length ? "แสดงข้อมูลครั้งก่อน" : "เชื่อมต่อข้อมูลไม่ได้";
      el("feed-detail").textContent = state.stations.length ? `ข้อมูลที่ดึงเมื่อ ${fmtTime(state.fetchedAt)} · โปรดตรวจเวลารายสถานี` : "กดรีเฟรชเพื่อลองใหม่";
      el("map-status").textContent = state.stations.length ? "ข้อมูลครั้งก่อน · กดรีเฟรช" : "ไม่มีข้อมูลสถานีที่ยืนยันได้";
      if (!state.stations.length) el("station-count").textContent = "ไม่มีข้อมูล";
    } finally {
      state.loading = false; el("refresh").disabled = false;
      renderStations(); renderList();
    }
  }

  el("refresh").addEventListener("click", loadStations);
  el("map-style").addEventListener("change", (event) => setMapStyle(event.target.value));
  el("recenter").addEventListener("click", () => state.map?.flyTo(RANGSIT, 11));
  el("home-button").addEventListener("click", () => {
    if (!state.map) { el("location-message").textContent = "แผนที่ยังไม่พร้อมใช้งาน"; return; }
    state.placingHome = true;
    el("location-message").textContent = "แตะจุดบ้านของคุณบนแผนที่เพื่อบันทึก";
    scrollToMap("center");
  });
  el("locate").addEventListener("click", () => {
    if (!navigator.geolocation) { el("location-message").textContent = "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง"; return; }
    el("location-message").textContent = "กำลังขอตำแหน่งจากอุปกรณ์...";
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      state.you = [coords.latitude, coords.longitude];
      el("location-message").textContent = `ตำแหน่งโดยประมาณ · ความแม่นยำ ±${Math.round(coords.accuracy)} ม.`;
      updateLocation(); renderList(); state.map?.flyTo(state.you, 12);
    }, (error) => {
      el("location-message").textContent = error.code === error.PERMISSION_DENIED ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS หรือปักหมุดบ้านเอง" : "ระบุตำแหน่งไม่สำเร็จ ลองอีกครั้งในที่โล่ง หรือปักหมุดบ้านเอง";
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  el("toggle-water").addEventListener("change", renderStations);
  el("flood-sources").addEventListener("click", () => openSection("flood"));
  el("toggle-camera").addEventListener("change", () => { renderCameras(); if (el("toggle-camera").checked) document.querySelector('[data-tab="camera"]').click(); });
  el("map-locate").addEventListener("click", () => el("locate").click());
  document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.quick === "camera") { if (!el("toggle-camera").checked) { el("toggle-camera").checked = true; renderCameras(); } state.map?.fitBounds(L.latLngBounds(cameraSources.map((camera) => [camera.lat, camera.lng])), { padding: [36, 36], maxZoom: 10 }); }
    if (button.dataset.quick === "water" && !el("toggle-water").checked) { el("toggle-water").checked = true; renderStations(); }
    openSection(button.dataset.quick);
  }));
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item === button));
    const choice = button.dataset.nav;
    if (choice === "locate") { el("locate").click(); scrollToMap(); }
    else if (choice === "map") scrollToMap();
    else openSection(choice);
  }));
  el("station-search").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = el("station-query").value.trim().toLocaleLowerCase("th");
    const message = el("search-message");
    message.hidden = false;
    if (!query) { message.textContent = "พิมพ์ชื่อสถานีหรือจังหวัดก่อนค้นหา"; return; }
    if (!state.stations.length) { message.textContent = "ข้อมูลสถานียังไม่พร้อม ลองรีเฟรชอีกครั้ง"; return; }
    const matches = state.stations.filter((s) => `${s.name} ${s.province} ${s.river}`.toLocaleLowerCase("th").includes(query));
    if (!matches.length) { message.textContent = "ไม่พบสถานีในข้อมูลล่าสุด ลองชื่อจังหวัดหรือคำใกล้เคียง"; return; }
    matches.sort((a, b) => distanceKm(center(), [a.lat, a.lng]) - distanceKm(center(), [b.lat, b.lng]));
    const match = matches[0];
    setTab("water");
    showStation(match, 13);
    message.textContent = `พบ ${matches.length} สถานี · แสดง ${match.name} (${match.province || "ไม่ระบุจังหวัด"})`;
  });
  initMap();
  if (state.stations.length) {
    el("station-count").textContent = `${state.stations.length.toLocaleString("th-TH")} สถานี · ข้อมูลครั้งก่อน`;
    el("feed-state").textContent = "แสดงข้อมูลครั้งก่อน";
    el("feed-detail").textContent = `ดึงเมื่อ ${fmtTime(state.fetchedAt)} · กำลังตรวจสอบข้อมูลใหม่`;
    el("map-status").textContent = "ข้อมูลครั้งก่อน · กำลังอัปเดต";
    el("last-fetch").textContent = `ดึง ${fmtTime(state.fetchedAt)}`;
    renderStations();
  }
  renderList(); loadStations();
  setInterval(() => { if (!document.hidden) loadStations(); }, STATION_REFRESH_MS);
  // Background tabs skip the interval, so catch up as soon as the page is visible again.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && age(state.fetchedAt) >= STATION_REFRESH_MS) loadStations(); });
})();
