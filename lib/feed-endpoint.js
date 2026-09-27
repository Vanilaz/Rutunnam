// @ts-check
// Builds a Vercel handler for "fetch one upstream JSON feed, normalize it, cache it at the CDN,
// and serve the last good copy (labelled stale) while the upstream is down".
const { rejectUnsafeMethod, logEvent, errorMessage } = require("./http");

/**
 * @template T
 * @typedef {Object} FeedOptions
 * @property {string} url  Upstream JSON URL.
 * @property {string} key  Response property holding the items, e.g. "gates".
 * @property {(payload: unknown) => { items: T[], upstreamRows: number }} normalize
 * @property {string} cacheControl  Cache-Control for fresh responses.
 * @property {number} lastGoodMaxAgeMs  How long a last good copy may be served while the upstream is down.
 * @property {string} event  Log event prefix, e.g. "water_gates".
 * @property {string} errorMessage  Thai, user-facing message for a 502.
 * @property {{ source: string, sourceUrl: string }} source
 * @property {number} [timeoutMs]
 */

const DEFAULT_TIMEOUT_MS = 15 * 1000;
const STALE_CACHE = "public, max-age=0, s-maxage=60";

/**
 * @template T
 * @param {FeedOptions<T>} options
 */
function createFeedHandler(options) {
  /** @type {{ body: Record<string, unknown>, at: number } | null} */
  let lastGood = null;

  /** @param {import("./http").Req} req @param {import("./http").Res} res */
  async function handler(req, res) {
    if (rejectUnsafeMethod(req, res)) return;
    try {
      const upstream = await fetch(options.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) });
      if (!upstream.ok) throw new Error(`ต้นทางตอบกลับ ${upstream.status}`);
      const { items, upstreamRows } = options.normalize(await upstream.json());
      // Rows we cannot read must not be presented as "nothing to show".
      const status = upstreamRows > 0 && items.length === 0 ? "unsupported-format" : "ok";
      if (status !== "ok") logEvent(`${options.event}_unrecognized`, { upstreamRows });
      const body = { [options.key]: items, status, fetchedAt: new Date().toISOString(), ...options.source };
      if (status === "ok") lastGood = { body, at: Date.now() };
      res.setHeader("Cache-Control", options.cacheControl);
      return res.status(200).json(body);
    } catch (error) {
      logEvent(`${options.event}_upstream_failed`, { message: errorMessage(error), hasFallback: Boolean(lastGood) });
      if (lastGood && Date.now() - lastGood.at < options.lastGoodMaxAgeMs) {
        res.setHeader("Cache-Control", STALE_CACHE);
        return res.status(200).json({ ...lastGood.body, stale: true });
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ [options.key]: [], status: "error", error: options.errorMessage });
    }
  }

  handler.resetCache = () => { lastGood = null; };
  return handler;
}

module.exports = { createFeedHandler };
