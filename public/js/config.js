// Static configuration shared by every module. No DOM access here.
/** @typedef {import("./types.js").Camera} Camera */

/** @type {import("./types.js").LatLngTuple} */
export const RANGSIT = [13.986, 100.616];
export const DEFAULT_ZOOM = 11;
export const FOCUS_ZOOM = 13;
export const LOCATE_ZOOM = 12;

export const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
export const STATION_REFRESH_MS = 2 * MINUTE_MS;
export const FETCH_TIMEOUT_MS = 25 * 1000; // Longer than the 20 s upstream timeout in /api/water.
export const CACHE_MAX_AGE_MS = 24 * HOUR_MS;
export const STALE_READING_MS = 6 * HOUR_MS;
export const DEFAULT_CAMERA_REFRESH_MS = 10 * 1000;
export const NEAREST_STATION_LIMIT = 8;
export const NEARBY_RADIUS_KM = 10;
export const RISK_LIST_LIMIT = 30;
export const MAX_PULSE_MARKERS = 150; // DOM markers for overflowing stations; the rest stay on canvas.
export const LABEL_MIN_ZOOM = 10;

// ThaiWater's own water-level classes, as % of channel depth (storage_percent).
// Mirrors the legend on thaiwater.net; adjust here if the agency changes it.
export const STORAGE_CLASSES = Object.freeze({ overflowAbove: 100, highAbove: 70, lowAtOrBelow: 30 });
export const MOBILE_BREAKPOINT_PX = 721;
export const GEOLOCATION_OPTIONS = Object.freeze({ enableHighAccuracy: true, timeout: 12 * 1000, maximumAge: MINUTE_MS });

export const STORAGE_KEYS = Object.freeze({ waterCache: "rutan-water-cache", home: "rutan-home", layers: "rutan-layers" });
export const WATER_API_URL = "/api/water";
export const CONFIG_API_URL = "/api/config";
export const ROAD_FLOOD_API_URL = "/api/road-flood";
export const TRAFFIC_CAMERAS_API_URL = "/api/traffic-cameras";
export const TRAFFIC_CAMERA_PAGE_SIZE = 12;
export const THUMBNAIL_REFRESH_MS = 60 * 1000;
export const TRAFFIC_CAMERA_REFRESH_MS = 15 * 1000;
export const TRAFFIC_CAMERA_SOURCE = Object.freeze({ url: "https://traffic.longdo.com/", label: "iTIC · Longdo Traffic" });

// hls.js plays live HLS video in browsers without native support (Chrome/Firefox desktop).
// Pinned and SRI-checked against the npm tarball; loaded only when a video is opened.
export const HLS_JS_ASSET = Object.freeze({ src: "https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js", integrity: "sha384-cciJ0zi8d1uMKC2zJd7jvPY4HQt7W4ByUI/FlMkltvBi31aW61rcpVBhpmW8/NwX" });
export const THAIWATER_URL = "https://www.thaiwater.net/";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const VECTOR_ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

// MapLibre (~800 kB) is loaded on demand so it never delays the station data.
// Versions are pinned and verified with SRI hashes taken from the npm tarballs.
export const MAPLIBRE_ASSETS = Object.freeze({
  stylesheet: { href: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css", integrity: "sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK" },
  scripts: [
    { src: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js", integrity: "sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp" },
    { src: "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js", integrity: "sha384-tXYNKOHx4T02jMP7YYCtBxPIv1B5gaA5mcVPBzqMp6d7VzWzxJgI2aWF/nJLrQdS" }
  ]
});

// BMA DDS publishes six coordinates. Rangsit cameras use approximate area pins.
/** @type {ReadonlyArray<Readonly<Camera>>} */
export const CAMERA_SOURCES = Object.freeze([
  { id: "dds1", name: "บางเขนใหม่", area: "คลอง · กรุงเทพมหานคร", lat: 13.8712025, lng: 100.6009522, url: "https://dds.bangkok.go.th/cctv1.php", image: "https://dds.bangkok.go.th/cctv-image/cctv1.jpg" },
  { id: "dds2", name: "สะพานพระปิ่นเกล้า", area: "แม่น้ำเจ้าพระยา", lat: 13.7638088, lng: 100.4880244, url: "https://dds.bangkok.go.th/cctv2.php", image: "https://dds.bangkok.go.th/cctv-image/cctv2.jpg" },
  { id: "dds3", name: "บางนา", area: "คลอง · กรุงเทพมหานคร", lat: 13.66605, lng: 100.5814148, url: "https://dds.bangkok.go.th/cctv3.php", image: "https://dds.bangkok.go.th/cctv-image/cctv3.jpg" },
  { id: "dds4", name: "คลองสวนแดน 1", area: "คลอง · นครปฐม", lat: 13.8504178, lng: 100.2143995, url: "https://dds.bangkok.go.th/cctv4.php", image: "https://dds.bangkok.go.th/cctv-image/cctv4.jpg" },
  { id: "dds5", name: "คลองชักพระ", area: "คลอง · กรุงเทพมหานคร", lat: 13.7626065, lng: 100.4419398, url: "https://dds.bangkok.go.th/cctv5.php", image: "https://dds.bangkok.go.th/cctv-image/cctv5.jpg" },
  { id: "dds6", name: "คลองทวีวัฒนา", area: "คลอง · กรุงเทพมหานคร", lat: 13.7471152, lng: 100.3203025, url: "https://dds.bangkok.go.th/cctv6.php", image: "https://dds.bangkok.go.th/cctv-image/cctv6.jpg" },
  { id: "rangsit-water", name: "ท่าน้ำสะพานแดง · ระดับน้ำรังสิต", area: "คลองรังสิตประยูรศักดิ์ · พิกัดพื้นที่โดยประมาณ", lat: 13.986, lng: 100.616, url: "https://rangsitcity.go.th/cctvrangsitcity/", image: "https://www.ipcamlive.com/player/snapshot.php?alias=6ab688b9f0f7d", refreshMs: 2 * MINUTE_MS, source: "เทศบาลนครรังสิต" },
  { id: "rangsit", name: "กล้องจราจรเทศบาลนครรังสิต", area: "รังสิต ปทุมธานี", lat: 13.982, lng: 100.621, url: "https://rangsitcity.go.th/cctvrangsitcity/", note: "มีกล้องจราจรหลายจุดบนเว็บไซต์เทศบาล ลิงก์บางกล้องเป็น HTTP จึงเปิดภาพตรงบนเว็บ HTTPS ไม่ได้", directory: true },
  { id: "rid", name: "ศูนย์กล้องลุ่มน้ำเจ้าพระยา", area: "ลุ่มน้ำเจ้าพระยา", lat: 14.35, lng: 100.45, url: "https://wmsc.rid.go.th/cctv2/", note: "เว็บไซต์กรมชลประทานระบุว่ารองรับ Firefox", directory: true }
].map((camera) => Object.freeze(camera)));
