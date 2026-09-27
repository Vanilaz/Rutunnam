// @ts-check
const { ROAD_FLOOD_URL, normalizeRoadFloods } = require("../lib/road-flood");
const { rejectUnsafeMethod, logEvent, errorMessage } = require("../lib/http");

const UPSTREAM_TIMEOUT_MS = 15 * 1000;
const CACHE = "public, max-age=0, s-maxage=120, stale-while-revalidate=300";

/** @param {import("../lib/http").Req} req @param {import("../lib/http").Res} res */
module.exports = async function handler(req, res) {
  if (rejectUnsafeMethod(req, res)) return;
  try {
    const upstream = await fetch(ROAD_FLOOD_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!upstream.ok) throw new Error(`ต้นทางตอบกลับ ${upstream.status}`);
    const { reports, upstreamRows, recognizedRows } = normalizeRoadFloods(await upstream.json());
    // Rows we cannot read must not be presented as "no flooded roads".
    const status = upstreamRows > 0 && recognizedRows === 0 ? "unsupported-format" : "ok";
    if (status !== "ok") logEvent("road_flood_unrecognized", { upstreamRows });
    res.setHeader("Cache-Control", CACHE);
    return res.status(200).json({ reports, status, fetchedAt: new Date().toISOString(), source: "ThaiWater · ถนนน้ำท่วม", sourceUrl: "https://www.thaiwater.net/" });
  } catch (error) {
    logEvent("road_flood_upstream_failed", { message: errorMessage(error) });
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ reports: [], status: "error", error: "ดึงรายงานถนนน้ำท่วมไม่ได้ในขณะนี้" });
  }
};
