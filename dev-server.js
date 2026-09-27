const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV ??= "development";
const root = path.join(__dirname, "public");
const port = Number(process.env.PORT) || 3000;
const apiRoutes = new Set(["/api/water", "/api/flood"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, code, message) {
  if (res.headersSent) return res.end();
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

async function handleApi(pathname, req, res) {
  const handler = require(`.${pathname}.js`);
  res.status = function (code) { res.statusCode = code; return res; };
  res.json = function (body) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); return res; };
  await handler(req, res);
}

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
    const { pathname } = new URL(req.url, "http://localhost");
    if (apiRoutes.has(pathname)) return await handleApi(pathname, req, res);
    return serveStatic(pathname, res);
  } catch (error) {
    console.error(error);
    return send(res, 500, "Internal server error");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
