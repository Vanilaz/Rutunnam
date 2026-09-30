// @ts-check
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV ??= "development";
const root = path.join(__dirname, "public");
const port = Number(process.env.PORT) || 3000;
// Same rewrite as vercel.json: /v/<version>/js/main.js is served from /js/main.js.
const VERSIONED_PREFIX = /^\/v\/[^/]+(?=\/)/;
const apiRoutes = new Set(["/api/water", "/api/flood", "/api/config", "/api/road-flood", "/api/flood-wms", "/api/traffic-cameras", "/api/water-gates", "/api/dams", "/api/camera-snapshot"]);
/** @type {Record<string, string>} */
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

/** @param {http.ServerResponse} res @param {number} code @param {string} message */
function send(res, code, message) {
  if (res.headersSent) return res.end();
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

/**
 * Mimic the small subset of Vercel's response helpers the handlers use.
 * @param {string} pathname @param {http.IncomingMessage} req @param {http.ServerResponse} res
 */
async function handleApi(pathname, req, res) {
  const handler = require(`.${pathname}.js`);
  const url = new URL(req.url ?? "/", "http://localhost");
  Object.assign(req, { query: Object.fromEntries(url.searchParams) });
  const vercelRes = Object.assign(res, {
    /** @param {number} code */
    status(code) { res.statusCode = code; return vercelRes; },
    /** @param {unknown} body */
    json(body) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); return vercelRes; },
    /** @param {Buffer | string} body */
    send(body) { res.end(body); return vercelRes; }
  });
  await handler(req, vercelRes);
}

/** @param {string} pathname @param {http.ServerResponse} res */
function serveStatic(pathname, res) {
  let relative;
  try { relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname); }
  catch (_) { return send(res, 400, "Bad request"); }
  const file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(root + path.sep)) return send(res, 403, "Forbidden");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (apiRoutes.has(pathname)) return await handleApi(pathname, req, res);
    return serveStatic(pathname.replace(VERSIONED_PREFIX, ""), res);
  } catch (error) {
    console.error(error);
    return send(res, 500, "Internal server error");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
