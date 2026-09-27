// @ts-check
// Static checks run by `npm run build` (Vercel build step). No bundler: files ship as-is.
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DIR = "public";
const MODULE_DIR = path.join(PUBLIC_DIR, "js");
const required = ["public/index.html", "public/styles.css", "public/manifest.webmanifest", "public/vendor/leaflet.min.css", "public/js/main.js", "api/water.js", "api/flood.js"];

const errors = [];
for (const file of required) if (!fs.existsSync(file)) errors.push(`Missing ${file}`);

/** @param {string} dir @returns {string[]} */
function listModules(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listModules(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

const ENTRY = path.join(MODULE_DIR, "main.js");
const modules = fs.existsSync(MODULE_DIR) ? listModules(MODULE_DIR) : [];
/** @param {string} file */
const toUrl = (file) => `/${path.relative(PUBLIC_DIR, file).split(path.sep).join("/")}`;

// Walk the runtime import graph from main.js; JSDoc-only files such as types.js are never fetched.
/** @type {Set<string>} */
const reachable = new Set();
const queue = fs.existsSync(ENTRY) ? [ENTRY] : [];
while (queue.length) {
  const file = /** @type {string} */ (queue.pop());
  if (reachable.has(file)) continue;
  reachable.add(file);
  const source = fs.readFileSync(file, "utf8");
  for (const [, specifier] of source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+"(\.{1,2}\/[^"]+)"/gm)) {
    const target = path.join(path.dirname(file), specifier);
    if (fs.existsSync(target)) queue.push(target);
    else errors.push(`${file}: import "${specifier}" not found`);
  }
}
for (const file of modules) {
  if (!reachable.has(file) && !fs.readFileSync(file, "utf8").trimEnd().endsWith("export {};")) errors.push(`${file} is not imported by main.js`);
}

// modulepreload hints must list exactly the runtime modules, or the browser fetches them in a waterfall.
if (fs.existsSync("public/index.html")) {
  const html = fs.readFileSync("public/index.html", "utf8");
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]));
  const shipped = new Set([...reachable].map(toUrl));
  for (const url of shipped) if (!preloaded.has(url)) errors.push(`index.html: add <link rel="modulepreload" href="${url}">`);
  for (const url of preloaded) if (!shipped.has(url)) errors.push(`index.html: remove modulepreload ${url} (not a runtime module)`);
}

// The client reloads itself when its APP_VERSION differs from the server's, so they must match.
const appVersion = /export const APP_VERSION = "([^"]+)"/.exec(fs.existsSync(path.join(MODULE_DIR, "config.js")) ? fs.readFileSync(path.join(MODULE_DIR, "config.js"), "utf8") : "")?.[1];
const packageVersion = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
if (appVersion !== packageVersion) errors.push(`public/js/config.js APP_VERSION (${appVersion}) must equal package.json version (${packageVersion})`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Static Vercel project ready (${reachable.size} runtime modules)`);
