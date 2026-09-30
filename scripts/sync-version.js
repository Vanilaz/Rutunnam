// @ts-check
// Copies package.json "version" into every place the browser sees it:
//   - APP_VERSION in public/js/config.js (reload handshake with /api/config)
//   - the /v/<version>/ prefix of every same-origin script, module and stylesheet in index.html
// and records a hash of those assets in asset-manifest.json.
//
// Files under /v/<version>/ are served as immutable (vercel.json), so a version's bytes must
// never change. `npm run build` recomputes the hash and fails when assets changed without a
// new version. Runs automatically on `npm version <x.y.z>`.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG_FILE = "public/js/config.js";
const HTML_FILE = "public/index.html";
const MANIFEST_FILE = "asset-manifest.json";
const PUBLIC_DIR = "public";
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

/** Every file served under /v/<version>/: all modules in public/js and the top-level stylesheets. */
function versionedFiles(root = PUBLIC_DIR) {
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".js") ? [full] : [];
  });
  const scripts = fs.existsSync(path.join(root, "js")) ? walk(path.join(root, "js")) : [];
  const styles = fs.readdirSync(root).filter((name) => name.endsWith(".css")).map((name) => path.join(root, name));
  return [...scripts, ...styles].map((file) => path.relative(root, file).split(path.sep).join("/")).sort();
}

/** @param {string} [root] */
function assetHash(root = PUBLIC_DIR) {
  const hash = crypto.createHash("sha256");
  for (const file of versionedFiles(root)) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** @returns {{ version: string, hash: string } | null} */
function readManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  const parsed = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  return typeof parsed?.version === "string" && typeof parsed?.hash === "string" ? parsed : null;
}

function main() {
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new Error(`package.json version is not semver: ${version}`);
  const config = fs.readFileSync(CONFIG_FILE, "utf8");
  if (!/export const APP_VERSION = "[^"]*";/.test(config)) throw new Error(`${CONFIG_FILE}: APP_VERSION declaration not found`);
  fs.writeFileSync(CONFIG_FILE, setAppVersion(config, version));
  fs.writeFileSync(HTML_FILE, versionAssets(fs.readFileSync(HTML_FILE, "utf8"), version));
  const hash = assetHash();
  const previous = readManifest();
  // Re-hashing under an already published version would let browsers keep stale immutable files.
  if (previous && previous.version === version && previous.hash !== hash) {
    throw new Error(`Assets changed but the version is still ${version}. Run: npm version patch --no-git-tag-version`);
  }
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({ version, hash }, null, 2)}\n`);
  console.log(`Synced version ${version} into ${CONFIG_FILE}, ${HTML_FILE} and ${MANIFEST_FILE}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}

module.exports = { versionAssets, setAppVersion, assetHash, versionedFiles, readManifest, MANIFEST_FILE };
