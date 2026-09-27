// @ts-check
const { TRAFFIC_CAMERA_FEED_URL, normalizeTrafficCameras } = require("../lib/traffic-cameras");
const { rejectUnsafeMethod, logEvent, errorMessage } = require("../lib/http");

const UPSTREAM_TIMEOUT_MS = 15 * 1000;
// Camera positions rarely change; the images themselves are fetched live by the browser.
const CACHE = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";

/** @type {{ body: Record<string, unknown>, at: number } | null} */
let lastGood = null;
const LAST_GOOD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** @param {import("../lib/http").Req} req @param {import("../lib/http").Res} res */
module.exports = async function handler(req, res) {
  if (rejectUnsafeMethod(req, res)) return;
  try {
    const upstream = await fetch(TRAFFIC_CAMERA_FEED_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!upstream.ok) throw new Error(`ต้นทางตอบกลับ ${upstream.status}`);
    const { cameras, upstreamRows } = normalizeTrafficCameras(await upstream.json());
    if (upstreamRows > 0 && cameras.length === 0) logEvent("traffic_cameras_unrecognized", { upstreamRows });
    const body = { cameras, fetchedAt: new Date().toISOString(), source: "iTIC · Longdo Traffic", sourceUrl: "https://traffic.longdo.com/" };
    lastGood = { body, at: Date.now() };
    res.setHeader("Cache-Control", CACHE);
    return res.status(200).json(body);
  } catch (error) {
    logEvent("traffic_cameras_upstream_failed", { message: errorMessage(error), hasFallback: Boolean(lastGood) });
    if (lastGood && Date.now() - lastGood.at < LAST_GOOD_MAX_AGE_MS) {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
      return res.status(200).json({ ...lastGood.body, stale: true });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ cameras: [], error: "ดึงรายชื่อกล้องจราจรไม่ได้ในขณะนี้" });
  }
};
