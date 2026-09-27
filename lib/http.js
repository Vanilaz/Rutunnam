// @ts-check
// Small helpers shared by the Vercel functions in /api.

/**
 * @typedef {{ method?: string, url?: string, query?: Record<string, string | string[] | undefined> }} Req
 * @typedef {{ setHeader(name: string, value: string): void, status(code: number): Res, json(body: unknown): Res, send?(body: unknown): Res, end?(body?: unknown): void }} Res
 */

const ALLOWED_METHODS = "GET, HEAD";

/** Rejects anything but GET/HEAD. @param {Req} req @param {Res} res @returns {boolean} true when handled */
function rejectUnsafeMethod(req, res) {
  if (req.method === "GET" || req.method === "HEAD") return false;
  res.setHeader("Allow", ALLOWED_METHODS);
  res.status(405).json({ error: "Method not allowed" });
  return true;
}

/**
 * Query parameters, case-insensitive (Leaflet sends lowercase WMS keys, other clients uppercase).
 * @param {Req} req
 * @returns {Map<string, string>}
 */
function queryParams(req) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const source = req.query ?? Object.fromEntries(new URL(req.url ?? "/", "http://localhost").searchParams);
  for (const [key, value] of Object.entries(source)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string") out.set(key.toLowerCase(), single);
  }
  return out;
}

/** @param {string} event @param {Record<string, unknown>} fields */
function logEvent(event, fields) {
  console.error(JSON.stringify({ event, ...fields }));
}

/** @param {unknown} error */
const errorMessage = (error) => error instanceof Error ? error.message : String(error);

module.exports = { rejectUnsafeMethod, queryParams, logEvent, errorMessage };
