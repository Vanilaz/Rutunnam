// @ts-check
// Copies package.json "version" into every place the browser sees it:
//   - APP_VERSION in public/js/config.js (reload handshake with /api/config)
//   - the /v/<version>/ prefix of every same-origin script, module and stylesheet in index.html
// A new version therefore means new asset URLs, so no browser can pair new HTML with cached
// old JS. Runs automatically on `npm version <x.y.z>`; `npm run build` fails if anything drifts.
const fs = require("node:fs");

const CONFIG_FILE = "public/js/config.js";
const HTML_FILE = "public/index.html";
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Same-origin assets that change with the code. /vendor and /api keep their own caching. */
const VERSIONED_ASSET = /(href|src)="\/(?:v\/[^/"]+\/)?((?:js\/[^"]+\.js)|(?:[\w-]+\.css))"/g;

/** @param {string} html @param {string} version */
function versionAssets(html, version) {
  return html.replace(VERSIONED_ASSET, (_match, attr, file) => `${attr}="/v/${version}/${file}"`);
}

/** @param {string} source @param {string} version */
function setAppVersion(source, version) {
  return source.replace(/export const APP_VERSION = "[^"]*";/, `export const APP_VERSION = "${version}";`);
}

function main() {
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new Error(`package.json version is not semver: ${version}`);
  const config = fs.readFileSync(CONFIG_FILE, "utf8");
  if (!/export const APP_VERSION = "[^"]*";/.test(config)) throw new Error(`${CONFIG_FILE}: APP_VERSION declaration not found`);
  fs.writeFileSync(CONFIG_FILE, setAppVersion(config, version));
  fs.writeFileSync(HTML_FILE, versionAssets(fs.readFileSync(HTML_FILE, "utf8"), version));
  console.log(`Synced version ${version} into ${CONFIG_FILE} and ${HTML_FILE}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}

module.exports = { versionAssets, setAppVersion };
