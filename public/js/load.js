// Loads pinned third-party assets on demand, with SRI.

/** @type {Map<string, Promise<void>>} */
const scripts = new Map();

/**
 * Load a classic script once. A failed load can be retried later.
 * @param {{ src: string, integrity: string }} asset
 * @returns {Promise<void>}
 */
export function loadScript({ src, integrity }) {
  const existing = scripts.get(src);
  if (existing) return existing;
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    Object.assign(script, { src, integrity, crossOrigin: "anonymous", async: false });
    script.onload = () => resolve(undefined);
    script.onerror = () => { script.remove(); scripts.delete(src); reject(new Error(`โหลด ${src} ไม่ได้`)); };
    document.head.append(script);
  });
  scripts.set(src, promise);
  return promise;
}

/** @param {{ href: string, integrity: string }} asset */
export function loadStylesheet({ href, integrity }) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href, integrity, crossOrigin: "anonymous" });
  document.head.append(link);
}
