const test = require("node:test");
const assert = require("node:assert/strict");

const PLAYLIST = "https://camera1.iticfoundation.org/hls/a.stream/playlist.m3u8";

/** @param {number} status @param {string} body */
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, text: async () => body });

test("a live-only camera counts as available only when its playlist is a real HLS playlist", async () => {
  const { probePlaylist } = await import("../public/js/camera-availability.js");
  assert.equal(await probePlaylist(PLAYLIST, 1000, reply(200, "#EXTM3U\n#EXT-X-VERSION:3\n")), true);
  assert.equal(await probePlaylist(PLAYLIST, 1000, reply(200, "\n  #EXTM3U\n")), true, "leading whitespace is tolerated");
  assert.equal(await probePlaylist(PLAYLIST, 1000, reply(200, "<html>camera offline</html>")), false);
  assert.equal(await probePlaylist(PLAYLIST, 1000, reply(404, "#EXTM3U")), false);
  assert.equal(await probePlaylist(PLAYLIST, 1000, async () => { throw new TypeError("CORS"); }), false);
  assert.equal(await probePlaylist(null, 1000, reply(200, "#EXTM3U")), false);
});

test("the playlist is checked only when a camera has no working still frame", async () => {
  const { probeCamera } = await import("../public/js/camera-availability.js");
  const calls = [];
  const probes = (frameOk, playlistOk) => ({
    snapshot: async (url) => { calls.push(["frame", url]); return frameOk; },
    playlist: async (url) => { calls.push(["playlist", url]); return playlistOk; }
  });
  assert.equal(await probeCamera({ image: "https://x/a.jpg", hls: PLAYLIST }, 1000, probes(true, false)), true);
  assert.deepEqual(calls.map(([kind]) => kind), ["frame"], "a working frame is enough");
  calls.length = 0;
  assert.equal(await probeCamera({ image: null, hls: PLAYLIST }, 1000, probes(false, true)), true, "video-only cameras are kept");
  assert.deepEqual(calls.map(([kind]) => kind), ["frame", "playlist"]);
  assert.equal(await probeCamera({ image: "https://x/a.jpg", hls: null }, 1000, probes(false, true)), false);
});

test("live grid streams the first visible video cards and skips recently failed ones", async () => {
  const { pickStreams } = await import("../public/js/ui/live-grid.js");
  const cards = [
    { key: "a", hls: false }, { key: "b", hls: true }, { key: "c", hls: true },
    { key: "d", hls: true }, { key: "e", hls: true }, { key: "f", hls: true }
  ];
  assert.deepEqual(pickStreams(cards, 3, new Set()), ["b", "c", "d"]);
  assert.deepEqual(pickStreams(cards, 3, new Set(["c"])), ["b", "d", "e"], "a failed stream gives its slot away");
  assert.deepEqual(pickStreams(cards, 0, new Set()), [], "data saver: no autoplay");
  assert.deepEqual(pickStreams(cards, -1, new Set()), []);
});

test("still frames share one cache-buster per refresh period", async () => {
  const { frameUrl } = await import("../public/js/ui/live-grid.js");
  assert.equal(frameUrl("/api/camera-snapshot?id=151", 10000, 1_700_000_004_999), "/api/camera-snapshot?id=151&t=170000000");
  assert.equal(frameUrl("/api/camera-snapshot?id=151", 10000, 1_700_000_009_999), frameUrl("/api/camera-snapshot?id=151", 10000, 1_700_000_000_000),
    "viewers within one period hit the same (CDN-cacheable) URL");
  assert.notEqual(frameUrl("https://x/a.jpg", 5000, 0), frameUrl("https://x/a.jpg", 5000, 5000));
  assert.equal(frameUrl("https://x/a.jpg", 0, 42), "https://x/a.jpg?t=42", "a zero period cannot divide by zero");
});

test("camera cards carry the stream and refresh period for the live grid", async () => {
  const { cameraTabHtml } = await import("../public/js/templates.js");
  const traffic = [
    { camera: { id: "v", name: "ทล.1", org: "ทล.", lat: 14, lng: 100, image: null, hls: PLAYLIST }, distance: 1 },
    { camera: { id: "s", name: "แยก", org: "", lat: 14, lng: 100, image: "https://x/a.jpg", hls: null }, distance: 2 }
  ];
  const html = cameraTabHtml({ water: [], directories: [], traffic, trafficTotal: 2, trafficError: null, hasMore: false, liveLimit: 4 });
  assert.match(html, new RegExp(`data-viewer="traffic:v" data-hls="${PLAYLIST.replace(/[.?]/g, "\\$&")}" data-refresh="\\d+"`));
  assert.match(html, /data-viewer="traffic:s" data-refresh="5000"/);
  assert.ok(!/data-viewer="traffic:s" data-hls/.test(html), "a still-only camera has no stream");
  assert.match(html, /เล่นสดในรายการได้พร้อมกัน 4 จอ/);
  assert.match(cameraTabHtml({ water: [], directories: [], traffic, trafficTotal: 2, trafficError: null, hasMore: false, liveLimit: 0 }), /โหมดประหยัดข้อมูล/);
});

test("badges say what the viewer is looking at: live video, a timed frame, or a problem", async () => {
  const { badgeFor } = await import("../public/js/ui/live-grid.js");
  const at = Date.parse("2026-09-30T11:40:00Z"); // 18:40 in Bangkok
  const ok = { state: "ok", src: "x", at, due: 0, busy: false };
  const base = { hero: true, stream: null, frame: null, videoDown: false, hasVideo: true };
  assert.deepEqual(badgeFor({ ...base, stream: { playing: true, height: 432 } }), { text: "LIVE · 432p", className: "is-live" });
  assert.equal(badgeFor({ ...base, hero: false, stream: { playing: true, height: 432 } }).text, "LIVE", "tiles stay short");
  assert.equal(badgeFor({ ...base, stream: { playing: true, height: 0 } }).text, "LIVE", "unknown height is not shown as 0p");
  assert.equal(badgeFor({ ...base, stream: { playing: false, height: 0 }, frame: ok }).text, "ภาพเมื่อ 18:40 · กำลังต่อ…");
  assert.equal(badgeFor({ ...base, stream: { playing: false, height: 0 } }).text, "กำลังต่อ…");
  assert.equal(badgeFor({ ...base, frame: ok }).text, "ภาพเมื่อ 18:40");
  assert.equal(badgeFor({ ...base, hero: false, frame: ok }).text, "18:40");
  assert.equal(badgeFor({ ...base, videoDown: true }).text, "วิดีโอขัดข้อง");
  assert.equal(badgeFor({ ...base, frame: { ...ok, state: "offline" } }).className, "is-offline");
  assert.equal(badgeFor({ ...base, hero: false }), null, "an idle video tile shows only its ▶");
});

test("the camera list puts the nearest six in large live cards and groups the rest by distance", async () => {
  const { cameraTabHtml, HERO_CAMERA_COUNT } = await import("../public/js/templates.js");
  const at = (distance, i) => ({ camera: { id: `c${i}`, name: `กล้อง ${i}`, org: "ทล.", lat: 14, lng: 100, image: "https://x/a.jpg", hls: null }, distance });
  const traffic = [1, 2, 3, 4, 5, 6, 7, 30, 31, 120, 400].map(at);
  const html = cameraTabHtml({ water: [], directories: [], traffic, trafficTotal: traffic.length, trafficError: null, hasMore: false });
  assert.equal(HERO_CAMERA_COUNT, 6);
  assert.equal((html.match(/cam-card cam-hero/g) || []).length, 6);
  assert.equal((html.match(/cam-card cam-tile/g) || []).length, traffic.length - 6);
  assert.match(html, /ใกล้คุณ · ไม่เกิน 25 กม\. · 1 กล้อง/);
  assert.match(html, /25–60 กม\. · 2 กล้อง/);
  assert.match(html, /60–200 กม\. · 1 กล้อง/);
  assert.match(html, /ไกลกว่า 200 กม\. · 1 กล้อง/);
  assert.match(html, /<span class="cam-distance">7\.0 กม\.<\/span>/);
  assert.match(html, /<span class="cam-distance">400 กม\.<\/span>/);
});
