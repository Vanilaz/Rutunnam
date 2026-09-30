// Attach a live HLS stream to a <video>: native HLS on Safari/iOS, hls.js (lazy, SRI-checked) elsewhere.
// Shared by the full-screen viewer and the live camera grid.
import { HLS_JS_ASSET } from "../config.js";
import { loadScript } from "../load.js";

/** @typedef {{ loadSource(url: string): void, attachMedia(media: HTMLMediaElement): void, on(event: string, fn: (event: string, data: { fatal?: boolean }) => void): void, destroy(): void }} HlsInstance */
/** @typedef {{ new (config?: object): HlsInstance, isSupported(): boolean, Events: { ERROR: string } }} HlsConstructor */
/** @typedef {{ destroy(): void }} LiveHandle */

const HLS_MIME = "application/vnd.apple.mpegurl";
// Short buffers keep the picture close to real time and limit data use on phones.
const VIEWER_CONFIG = Object.freeze({ maxBufferLength: 10 });
const COMPACT_CONFIG = Object.freeze({ maxBufferLength: 6, maxMaxBufferLength: 10, capLevelToPlayerSize: true, startLevel: 0 });

/** @returns {HlsConstructor | undefined} */
const hlsGlobal = () => /** @type {any} */ (window).Hls;

/** @param {HTMLVideoElement} video */
function release(video) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} url
 * @param {{ onFatal: () => void, compact?: boolean }} options
 *   onFatal runs at most once, when the stream cannot be played; compact picks the lowest
 *   quality that fits the element (grid thumbnails).
 * @returns {Promise<LiveHandle | null>} null when this browser cannot play HLS at all.
 */
export async function attachHls(video, url, { onFatal, compact = false }) {
  let failed = false;
  let destroyed = false;
  const fail = () => { if (failed || destroyed) return; failed = true; onFatal(); };

  video.addEventListener("error", fail, { once: true });
  if (video.canPlayType(HLS_MIME)) {
    video.src = url;
    return { destroy() { destroyed = true; release(video); } };
  }
  try { await loadScript(HLS_JS_ASSET); } catch (_) { return null; }
  const Hls = hlsGlobal();
  if (!Hls || !Hls.isSupported()) return null;
  const hls = new Hls(compact ? COMPACT_CONFIG : VIEWER_CONFIG);
  hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
  hls.loadSource(url);
  hls.attachMedia(video);
  return { destroy() { destroyed = true; hls.destroy(); release(video); } };
}
