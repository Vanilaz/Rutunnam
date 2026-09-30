/** @typedef {import('./types.js').TrafficCamera} TrafficCamera */

/** A decoded frame is required before a camera can appear as available. */
/** @param {string | null} url @param {number} timeoutMs */
export function probeSnapshot(url, timeoutMs) {
  if (!url) return Promise.resolve(false);
  return new Promise((resolve) => {
    const frame = new Image();
    let settled = false;
    /** @param {boolean} available */
    const finish = (available) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      frame.onload = frame.onerror = null;
      resolve(available);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    frame.onload = () => finish(frame.naturalWidth >= 64 && frame.naturalHeight >= 48);
    frame.onerror = () => finish(false);
    frame.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  });
}

const PLAYLIST_SIGNATURE = "#EXTM3U";
const PROBE_CONCURRENCY = 6;

/**
 * A live-only camera is available when its HLS playlist answers with a real playlist.
 * Only the small text playlist is fetched, never video segments.
 * @param {string | null} url @param {number} timeoutMs @param {typeof fetch} [fetchImpl]
 */
export async function probePlaylist(url, timeoutMs, fetchImpl = fetch) {
  if (!url) return false;
  try {
    const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return response.ok && (await response.text()).trimStart().startsWith(PLAYLIST_SIGNATURE);
  } catch (_) {
    return false;
  }
}

/**
 * A still frame is the cheaper proof; the playlist is checked only when there is no working frame.
 * @param {TrafficCamera} camera @param {number} timeoutMs
 * @param {{ snapshot?: typeof probeSnapshot, playlist?: typeof probePlaylist }} [probes]
 */
export async function probeCamera(camera, timeoutMs, { snapshot = probeSnapshot, playlist = probePlaylist } = {}) {
  if (await snapshot(camera.image, timeoutMs)) return true;
  return camera.hls ? playlist(camera.hls, timeoutMs) : false;
}

/** Probe cameras in a bounded pool to avoid saturating the map and the source. */
/** @param {TrafficCamera[]} cameras @param {(camera: TrafficCamera, ok: boolean) => void} onResult @param {number} timeoutMs */
export async function probeCameras(cameras, onResult, timeoutMs) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, cameras.length) }, async () => {
    while (cursor < cameras.length) {
      const camera = cameras[cursor++];
      onResult(camera, await probeCamera(camera, timeoutMs));
    }
  }));
}
