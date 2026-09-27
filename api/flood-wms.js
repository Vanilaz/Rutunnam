// @ts-check
// Proxies GISTDA's satellite flood-extent WMS so the API key stays on the server.
// Tiles are cached at the CDN; the imagery itself only changes when a new satellite pass is processed.
const { gistdaKey, gistdaWmsUrl } = require("../lib/layers");
const { buildGetMap } = require("../lib/wms");
const { rejectUnsafeMethod, queryParams, logEvent, errorMessage } = require("../lib/http");

const UPSTREAM_TIMEOUT_MS = 15 * 1000;
const TILE_CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";
const MAX_ERROR_SNIPPET = 200;

/** @param {string} text @param {string} secret */
const redact = (text, secret) => text.split(secret).join("[key]");

/** @param {import("../lib/http").Req} req @param {import("../lib/http").Res} res */
module.exports = async function handler(req, res) {
  if (rejectUnsafeMethod(req, res)) return;
  const key = gistdaKey(process.env);
  if (!key) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "ยังไม่ได้ตั้งค่า GISTDA_API_KEY" });
  }
  const request = buildGetMap(queryParams(req));
  if (!request.ok) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: request.error });
  }
  request.query.set("api_key", key);
  try {
    const upstream = await fetch(`${gistdaWmsUrl(process.env)}?${request.query}`, {
      headers: { "API-Key": key, Accept: "image/png" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
    const type = upstream.headers.get("content-type") ?? "";
    // WMS servers report errors as XML with HTTP 200, so the content type is checked too.
    if (!upstream.ok || !type.startsWith("image/")) {
      const snippet = redact((await upstream.text()).slice(0, MAX_ERROR_SNIPPET), key);
      throw new Error(`upstream ${upstream.status} ${type}: ${snippet}`);
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", TILE_CACHE);
    res.status(200);
    if (res.send) return res.send(body);
    return res.end?.(body);
  } catch (error) {
    logEvent("flood_wms_failed", { message: redact(errorMessage(error), key) });
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "ดึงภาพพื้นที่น้ำท่วมจาก GISTDA ไม่ได้" });
  }
};
