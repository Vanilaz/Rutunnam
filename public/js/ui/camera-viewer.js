// Full-screen camera viewer (<dialog>): refreshing still image, or live HLS video.
import { HLS_JS_ASSET } from "../config.js";
import { loadScript } from "../load.js";
import { escapeHtml as esc } from "../utils.js";

/** @typedef {import("../types.js").ViewerCamera} ViewerCamera */
/** @typedef {{ loadSource(url: string): void, attachMedia(media: HTMLMediaElement): void, on(event: string, fn: (event: string, data: { fatal?: boolean }) => void): void, destroy(): void }} HlsInstance */
/** @typedef {{ new (config?: object): HlsInstance, isSupported(): boolean, Events: { ERROR: string } }} HlsConstructor */

const HLS_MIME = "application/vnd.apple.mpegurl";

/** @returns {HlsConstructor | undefined} */
const hlsGlobal = () => /** @type {any} */ (window).Hls;

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ onShowOnMap: (camera: ViewerCamera) => void }} handlers
 */
export function createCameraViewer(dialog, { onShowOnMap }) {
  const body = dialog.querySelector(".viewer-body");
  const title = dialog.querySelector(".viewer-title");
  const meta = dialog.querySelector(".viewer-meta");
  if (!(body instanceof HTMLElement) || !(title instanceof HTMLElement) || !(meta instanceof HTMLElement)) throw new Error("camera viewer markup is incomplete");

  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  /** @type {HlsInstance | null} */
  let hls = null;
  /** @type {ViewerCamera | null} */
  let current = null;
  let session = 0; // Ignores async work that finishes after the viewer was closed or switched.

  function stop() {
    session += 1;
    if (timer) { clearInterval(timer); timer = null; }
    if (hls) { hls.destroy(); hls = null; }
    const video = body?.querySelector("video");
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    if (body) body.innerHTML = "";
  }

  /** @param {string} message */
  function showMessage(message) {
    if (!body || !current) return;
    body.innerHTML = `<div class="viewer-message"><p>${esc(message)}</p><a class="link-button" href="${esc(current.sourceUrl)}" target="_blank" rel="noopener noreferrer">เปิดเว็บไซต์ต้นทาง ↗</a></div>`;
  }

  /** @param {ViewerCamera} camera */
  function showImage(camera) {
    if (!body || !camera.image) return;
    const image = camera.image;
    const img = document.createElement("img");
    img.alt = `ภาพจากกล้อง ${camera.name}`;
    img.className = "viewer-media";
    img.onerror = () => showMessage("กล้องนี้ไม่ส่งภาพในขณะนี้");
    const refresh = () => { if (!document.hidden) img.src = `${image}${image.includes("?") ? "&" : "?"}t=${Date.now()}`; };
    body.replaceChildren(img);
    refresh();
    timer = setInterval(refresh, camera.refreshMs);
  }

  /** @param {ViewerCamera} camera */
  async function showVideo(camera) {
    if (!body || !camera.hls) return;
    const mine = session;
    const video = document.createElement("video");
    Object.assign(video, { muted: true, autoplay: true, playsInline: true, controls: true, className: "viewer-media" });
    body.replaceChildren(video);
    const fallback = () => { if (session !== mine) return; if (hls) { hls.destroy(); hls = null; } if (camera.image) showImage(camera); else showMessage("วิดีโอจากกล้องนี้ไม่พร้อมใช้งานในขณะนี้"); };
    video.onerror = fallback;
    if (video.canPlayType(HLS_MIME)) { video.src = camera.hls; return; }
    try { await loadScript(HLS_JS_ASSET); } catch (_) { fallback(); return; }
    const Hls = hlsGlobal();
    if (session !== mine) return;
    if (!Hls || !Hls.isSupported()) { fallback(); return; }
    hls = new Hls({ maxBufferLength: 10 });
    hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fallback(); });
    hls.loadSource(camera.hls);
    hls.attachMedia(video);
  }

  dialog.addEventListener("close", stop);
  dialog.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === dialog || target?.closest("[data-viewer-close]")) dialog.close();
    else if (target?.closest("[data-viewer-map]") && current) { const camera = current; dialog.close(); onShowOnMap(camera); }
  });

  return {
    /** @param {ViewerCamera} camera */
    open(camera) {
      stop();
      current = camera;
      title.textContent = camera.name;
      meta.textContent = camera.meta;
      const source = dialog.querySelector("[data-viewer-source]");
      if (source instanceof HTMLAnchorElement) { source.href = camera.sourceUrl; source.textContent = `ที่มา: ${camera.sourceLabel} ↗`; }
      if (!dialog.open) dialog.showModal();
      if (camera.hls) showVideo(camera);
      else showImage(camera);
    }
  };
}
