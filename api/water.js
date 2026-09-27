// @ts-check
const { SOURCE_URL, normalizePayload } = require("../lib/water");

const UPSTREAM_TIMEOUT_MS = 20 * 1000;
// A warm function instance keeps the last good feed so a short ThaiWater outage
// still serves real (clearly labelled) data instead of an empty map.
const LAST_GOOD_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FRESH_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=60";
const STALE_CACHE = "public, max-age=0, s-maxage=30";
const ALLOWED_METHODS = "GET, HEAD";

/** @type {{ body: { stations: unknown[], fetchedAt: string, source: string, sourceUrl: string }, at: number } | null} */
let lastGood = null;

/** Test hook: forget the in-memory fallback between cases. */
function resetCache() { lastGood = null; }

async function fetchUpstream() {
  const upstream = await fetch(SOURCE_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  if (!upstream.ok) throw new Error(`ต้นทางตอบกลับ ${upstream.status}`);
  return normalizePayload(await upstream.json());
}

/**
 * @param {{ method?: string }} req
 * @param {{ setHeader(name: string, value: string): void, status(code: number): any }} res
 */
async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ALLOWED_METHODS);
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const stations = await fetchUpstream();
    const body = { stations, fetchedAt: new Date().toISOString(), source: "ThaiWater · คลังข้อมูลน้ำแห่งชาติ", sourceUrl: SOURCE_URL };
    lastGood = { body, at: Date.now() };
    res.setHeader("Cache-Control", FRESH_CACHE);
    return res.status(200).json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Structured log line so failures are visible in Vercel runtime logs.
    console.error(JSON.stringify({ event: "water_upstream_failed", message, hasFallback: Boolean(lastGood) }));
    if (lastGood && Date.now() - lastGood.at < LAST_GOOD_MAX_AGE_MS) {
      res.setHeader("Cache-Control", STALE_CACHE);
      return res.status(200).json({ ...lastGood.body, stale: true, warning: "ต้นทางขัดข้อง · แสดงข้อมูลที่ดึงสำเร็จครั้งล่าสุด" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({
      stations: [],
      error: "ดึงข้อมูลสถานีไม่ได้ในขณะนี้",
      detail: process.env.NODE_ENV === "development" ? message : undefined,
      sourceUrl: "https://www.thaiwater.net/"
    });
  }
}

module.exports = handler;
module.exports.resetCache = resetCache;
