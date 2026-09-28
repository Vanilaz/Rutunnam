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

/** Probe cameras in a bounded pool to avoid saturating the map and the source. */
/** @param {TrafficCamera[]} cameras @param {(camera: TrafficCamera, ok: boolean) => void} onResult @param {number} timeoutMs */
export async function probeCameras(cameras, onResult, timeoutMs) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, cameras.length) }, async () => {
    while (cursor < cameras.length) {
      const camera = cameras[cursor++];
      const ok = await probeSnapshot(camera.image, timeoutMs);
      onResult(camera, ok);
    }
  }));
}
