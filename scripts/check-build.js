// Static checks run by `npm run build` (Vercel build step). No bundler: files ship as-is.
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DIR = "public";
const MODULE_DIR = path.join(PUBLIC_DIR, "js");
const required = ["public/index.html", "public/styles.css", "public/manifest.webmanifest", "public/vendor/leaflet.min.css", "public/js/main.js", "api/water.js", "api/flood.js"];

const errors = [];
for (const file of required) if (!fs.existsSync(file)) errors.push(`Missing ${file}`);

function listModules(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listModules(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

const modules = fs.existsSync(MODULE_DIR) ? listModules(MODULE_DIR) : [];
const toUrl = (file) => `/${path.relative(PUBLIC_DIR, file).split(path.sep).join("/")}`;

// Every relative import must point at a file that will actually be deployed.
for (const file of modules) {
  const source = fs.readFileSync(file, "utf8");
  for (const [, specifier] of source.matchAll(/\bfrom\s+"(\.{1,2}\/[^"]+)"/g)) {
    const target = path.join(path.dirname(file), specifier);
    if (!fs.existsSync(target)) errors.push(`${file}: import "${specifier}" not found`);
  }
}

// modulepreload hints must list exactly the shipped modules, or the browser fetches them in a waterfall.
if (fs.existsSync("public/index.html")) {
  const html = fs.readFileSync("public/index.html", "utf8");
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]));
  const shipped = new Set(modules.map(toUrl));
  for (const url of shipped) if (!preloaded.has(url)) errors.push(`index.html: add <link rel="modulepreload" href="${url}">`);
  for (const url of preloaded) if (!shipped.has(url)) errors.push(`index.html: modulepreload ${url} has no file`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Static Vercel project ready (${modules.length} browser modules)`);
