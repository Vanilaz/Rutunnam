// Live camera grid: cards on screen play live HLS video (a bounded number at once);
// cards without video refresh their still frame on the camera's own schedule.
// Off-screen cards cost nothing: streams stop and frames stop refreshing.
// State is kept per camera key, so the list can be re-rendered without reconnecting a
// stream, re-downloading a frame or flashing the card back to "loading".
import { attachHls } from "./hls-player.js";

/** @typedef {import("./hls-player.js").LiveHandle} LiveHandle */
/** @typedef {{ card: HTMLElement, video: HTMLVideoElement, handle: LiveHandle | null, playing: boolean, startTimer: ReturnType<typeof setTimeout> | null }} Stream */
/** @typedef {"none" | "loading" | "ok" | "broken" | "offline" | "timeout"} FrameState */
/** @typedef {{ state: FrameState, src: string, at: number, due: number, busy: boolean }} Frame */

const CARD_SELECTOR = ".cam-card[data-viewer]";
const SNAPSHOT_TICK_MS = 1000;
const MIN_FRAME_WIDTH_PX = 64;
const VISIBLE_RATIO = 0.35;
const frameClock = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });

const FRAME_PROBLEM = Object.freeze({ broken: "ภาพผิดปกติ", offline: "ไม่มีสัญญาณ", timeout: "ไม่ตอบสนอง" });

/**
 * Badge for a card, by what the viewer is actually looking at. Large cards spell it out;
 * compact tiles show only the essentials.
 * @param {{ hero: boolean, stream: { playing: boolean, height: number } | null, frame: Frame | null, videoDown: boolean, hasVideo: boolean }} s
 * @returns {{ text: string, className: string } | null} null hides the badge (the ▶ placeholder speaks for itself)
 */
export function badgeFor({ hero, stream, frame, videoDown, hasVideo }) {
  const frameTime = frame?.state === "ok" ? frameClock.format(frame.at) : null;
  if (stream?.playing) return { text: hero && stream.height > 0 ? `LIVE · ${stream.height}p` : "LIVE", className: "is-live" };
  if (stream) {
    if (frameTime) return { text: hero ? `ภาพเมื่อ ${frameTime} · กำลังต่อ…` : frameTime, className: "is-frame" };
    return { text: "กำลังต่อ…", className: "" };
  }
  if (frameTime) return { text: hero ? `ภาพเมื่อ ${frameTime}` : frameTime, className: "is-frame" };
  if (videoDown && !frame) return { text: "วิดีโอขัดข้อง", className: "is-offline" };
  if (frame?.state === "loading") return { text: "กำลังโหลด", className: "" };
  if (frame && frame.state in FRAME_PROBLEM) return { text: FRAME_PROBLEM[/** @type {keyof typeof FRAME_PROBLEM} */ (frame.state)], className: "is-offline" };
  if (videoDown) return { text: "วิดีโอขัดข้อง", className: "is-offline" };
  return hasVideo && hero ? { text: "แตะเพื่อดูสด", className: "is-idle" } : null;
}

/**
 * Frames are requested once per refresh period; rounding the cache-buster lets the browser
 * and a CDN share one frame between viewers instead of each request missing every cache.
 * @param {string} base @param {number} periodMs @param {number} now
 */
export function frameUrl(base, periodMs, now) {
  return `${base}${base.includes("?") ? "&" : "?"}t=${Math.floor(now / Math.max(periodMs, 1))}`;
}

/**
 * Which on-screen video cards get a stream: the first `max` in page order, skipping cards
 * whose stream failed recently.
 * @param {{ key: string, hls: boolean }[]} visibleInOrder @param {number} max @param {ReadonlySet<string>} blocked
 */
export function pickStreams(visibleInOrder, max, blocked) {
  return visibleInOrder.filter((card) => card.hls && !blocked.has(card.key)).slice(0, Math.max(0, max)).map((card) => card.key);
}

/**
 * @param {HTMLElement} root  container whose content is re-rendered by the list panel
 * @param {{ maxStreams: number, startTimeoutMs: number, frameTimeoutMs: number, retryAfterMs: number, attach?: typeof attachHls }} options
 */
export function createLiveGrid(root, { maxStreams, startTimeoutMs, frameTimeoutMs, retryAfterMs, attach = attachHls }) {
  /** @type {Map<string, Stream>} */
  const streams = new Map();
  /** @type {Map<string, Frame>} */
  const frames = new Map();
  /** @type {Map<string, number>} key → time after which a failed stream may be retried */
  const failedUntil = new Map();
  /** @type {Set<HTMLElement>} */
  const visible = new Set();
  let active = false;
  /** @type {ReturnType<typeof setInterval> | null} */
  let ticker = null;

  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card = /** @type {HTMLElement} */ (entry.target);
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) visible.add(card);
        else visible.delete(card);
      }
      update();
    }, { threshold: [0, VISIBLE_RATIO] })
    : null;

  /** @param {Element} card */
  const keyOf = (card) => card instanceof HTMLElement ? card.dataset.viewer ?? "" : "";

  /** @param {string} key */
  function cardFor(key) {
    for (const card of root.querySelectorAll(CARD_SELECTOR)) if (card instanceof HTMLElement && keyOf(card) === key) return card;
    return null;
  }

  /** Redraw one card from its state: badge, still frame and playing class. @param {HTMLElement} card */
  function paint(card) {
    const key = keyOf(card);
    const stream = streams.get(key);
    const frame = frames.get(key) ?? null;
    const img = card.querySelector("img[data-thumb]");
    if (img instanceof HTMLImageElement && frame?.state === "ok" && img.getAttribute("src") !== frame.src) img.src = frame.src;
    card.classList.toggle("is-streaming", Boolean(stream));
    card.classList.toggle("is-playing", Boolean(stream?.playing));
    card.classList.toggle("is-offline", !stream && frame !== null && frame.state in FRAME_PROBLEM);
    const badge = card.querySelector(".cam-badge");
    if (!(badge instanceof HTMLElement)) return;
    const shown = badgeFor({
      hero: card.dataset.size === "hero",
      stream: stream ? { playing: stream.playing, height: stream.video.videoHeight } : null,
      frame, videoDown: failedUntil.has(key), hasVideo: Boolean(card.dataset.hls)
    });
    badge.hidden = !shown;
    badge.textContent = shown?.text ?? "";
    badge.className = `cam-badge ${shown?.className ?? ""}`.trim();
  }

  /** @param {string} key */
  function paintKey(key) {
    const card = cardFor(key);
    if (card) paint(card);
  }

  /** @param {string} key */
  function stopStream(key) {
    const stream = streams.get(key);
    if (!stream) return;
    streams.delete(key);
    if (stream.startTimer) clearTimeout(stream.startTimer);
    stream.handle?.destroy();
    stream.video.remove();
    paintKey(key);
  }

  /** @param {string} key */
  function failStream(key) {
    stopStream(key);
    failedUntil.set(key, Date.now() + retryAfterMs);
    paintKey(key);
    update();
  }

  /** @param {HTMLElement} card */
  function startStream(card) {
    const key = keyOf(card);
    const url = card.dataset.hls;
    if (!url || streams.has(key)) return;
    const video = document.createElement("video");
    Object.assign(video, { muted: true, autoplay: true, playsInline: true, disablePictureInPicture: true, className: "cam-live" });
    video.setAttribute("aria-hidden", "true");
    /** @type {Stream} */
    const stream = { card, video, handle: null, playing: false, startTimer: null };
    streams.set(key, stream);
    card.querySelector(".cam-thumb")?.prepend(video);
    const mine = () => streams.get(key) === stream;
    video.addEventListener("playing", () => {
      if (!mine()) return;
      stream.playing = true;
      if (stream.startTimer) { clearTimeout(stream.startTimer); stream.startTimer = null; }
      paintKey(key);
    });
    video.addEventListener("resize", () => { if (mine()) paintKey(key); }); // quality switch → new "LIVE · 720p"
    stream.startTimer = setTimeout(() => { if (mine() && !stream.playing) failStream(key); }, startTimeoutMs);
    paint(card);
    attach(video, url, { onFatal: () => { if (mine()) failStream(key); }, compact: true })
      .then((handle) => {
        if (!mine()) { handle?.destroy(); return; }
        if (!handle) { failStream(key); return; }
        stream.handle = handle;
      })
      .catch(() => { if (mine()) failStream(key); });
  }

  /** @param {HTMLElement} card */
  function refreshFrame(card) {
    const key = keyOf(card);
    const img = card.querySelector("img[data-thumb]");
    const base = img instanceof HTMLImageElement ? img.dataset.thumb : undefined;
    if (!base) return;
    const period = Number(card.dataset.refresh) || SNAPSHOT_TICK_MS;
    const frame = frames.get(key) ?? { state: "none", src: "", at: 0, due: 0, busy: false };
    if (frame.busy) return;
    frames.set(key, frame);
    frame.busy = true;
    if (frame.state === "none") { frame.state = "loading"; paint(card); }
    // Load off-screen first so a slow camera never blanks the frame already shown.
    const next = new Image();
    /** @param {FrameState | null} state null keeps the last good frame */
    const done = (state) => {
      clearTimeout(timeout);
      next.onload = next.onerror = null;
      frame.busy = false;
      frame.due = Date.now() + period;
      if (state === "ok") { frame.state = "ok"; frame.src = next.src; frame.at = Date.now(); }
      else if (state && frame.state !== "ok") frame.state = state;
      paintKey(key);
    };
    const timeout = setTimeout(() => done("timeout"), frameTimeoutMs);
    next.onload = () => done(next.naturalWidth >= MIN_FRAME_WIDTH_PX ? "ok" : "broken");
    next.onerror = () => done("offline");
    next.src = frameUrl(base, period, Date.now());
  }

  function tick() {
    if (!active) return;
    const now = Date.now();
    for (const card of visible) {
      if (card.classList.contains("is-playing")) continue; // The video is the picture.
      const frame = frames.get(keyOf(card));
      if (!frame || (!frame.busy && now >= frame.due)) refreshFrame(card);
    }
  }

  function update() {
    if (!active) { for (const key of [...streams.keys()]) stopStream(key); return; }
    const now = Date.now();
    for (const [key, until] of failedUntil) if (until <= now) { failedUntil.delete(key); paintKey(key); }
    const ordered = [...root.querySelectorAll(CARD_SELECTOR)]
      .filter((card) => card instanceof HTMLElement && visible.has(card))
      .map((card) => /** @type {HTMLElement} */ (card));
    const wanted = new Set(pickStreams(ordered.map((card) => ({ key: keyOf(card), hls: Boolean(card.dataset.hls) })), maxStreams, new Set(failedUntil.keys())));
    for (const key of [...streams.keys()]) if (!wanted.has(key)) stopStream(key);
    for (const card of ordered) if (wanted.has(keyOf(card))) startStream(card);
    tick();
  }

  return {
    /** Call after every re-render of `root`: re-binds cards and carries running streams over. */
    sync() {
      observer?.disconnect();
      visible.clear();
      for (const [key, stream] of [...streams]) {
        const card = cardFor(key);
        if (!card?.dataset.hls) { stopStream(key); continue; }
        // Same camera after a re-render: move the playing <video> over instead of reconnecting
        // (a media element moved within the same task keeps playing), and treat the card as
        // still on screen until the observer reports otherwise.
        stream.card = card;
        card.querySelector(".cam-thumb")?.prepend(stream.video);
        if (stream.playing && stream.video.paused) stream.video.play().catch(() => {});
        visible.add(card);
      }
      for (const card of root.querySelectorAll(CARD_SELECTOR)) {
        if (!(card instanceof HTMLElement)) continue;
        paint(card);
        if (observer) observer.observe(card);
        else visible.add(card); // No IntersectionObserver: treat every card as visible.
      }
      update();
    },
    /** Streams and refreshes run only while the camera list is actually on screen. @param {boolean} on */
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on && !ticker) ticker = setInterval(tick, SNAPSHOT_TICK_MS);
      if (!on && ticker) { clearInterval(ticker); ticker = null; }
      update();
    }
  };
}
