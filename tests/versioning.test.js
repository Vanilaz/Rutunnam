const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { versionAssets, setAppVersion, assetHash, readManifest } = require("../scripts/sync-version");

test("asset URLs carry the version, so new HTML can never run cached old JS", () => {
  const html = [
    '<link rel="modulepreload" href="/js/map/map.js">',
    '<link rel="stylesheet" href="/styles.css">',
    '<link rel="stylesheet" href="/v/0.6.0/redesign.css">',
    '<script type="module" src="/v/0.6.0/js/main.js"></script>',
    '<link rel="stylesheet" href="/vendor/leaflet.min.css">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" defer></script>'
  ].join("\n");
  const out = versionAssets(html, "1.2.3");
  assert.match(out, /href="\/v\/1\.2\.3\/js\/map\/map\.js"/);
  assert.match(out, /href="\/v\/1\.2\.3\/styles\.css"/);
  assert.match(out, /href="\/v\/1\.2\.3\/redesign\.css"/, "an older version prefix is replaced, not stacked");
  assert.match(out, /src="\/v\/1\.2\.3\/js\/main\.js"/);
  assert.match(out, /href="\/vendor\/leaflet\.min\.css"/, "vendor files keep their own long cache");
  assert.match(out, /href="\/manifest\.webmanifest"/);
  assert.match(out, /src="https:\/\/cdnjs/);
  assert.equal(versionAssets(out, "1.2.3"), out, "running twice changes nothing");
  assert.equal(setAppVersion('export const APP_VERSION = "0.1.0";', "1.2.3"), 'export const APP_VERSION = "1.2.3";');
});

test("the shipped page, config and Vercel rewrite agree on the version", () => {
  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const html = fs.readFileSync("public/index.html", "utf8");
  assert.ok(html.includes(`<script type="module" src="/v/${version}/js/main.js"></script>`));
  assert.ok(fs.readFileSync("public/js/config.js", "utf8").includes(`export const APP_VERSION = "${version}";`));
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.deepEqual(vercel.rewrites, [{ source: "/v/:version/:path*", destination: "/:path*" }]);
  const cache = vercel.headers.find((rule) => rule.source === "/v/(.*)")?.headers.find((h) => h.key === "Cache-Control")?.value;
  assert.match(cache, /immutable/, "a version's files are cached for good, so no tab can mix versions");
  assert.deepEqual(readManifest(), { version, hash: assetHash() }, "the recorded hash matches the shipped JS/CSS");
});

test("the asset hash changes with any module or stylesheet, and only with those", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
  fs.mkdirSync(path.join(root, "js", "ui"), { recursive: true });
  fs.writeFileSync(path.join(root, "js", "main.js"), "export {};");
  fs.writeFileSync(path.join(root, "js", "ui", "a.js"), "export const a = 1;");
  fs.writeFileSync(path.join(root, "styles.css"), "body{}");
  fs.writeFileSync(path.join(root, "index.html"), "<html>");
  const before = assetHash(root);
  fs.writeFileSync(path.join(root, "index.html"), "<html lang=th>");
  assert.equal(assetHash(root), before, "index.html is no-cache, not versioned");
  fs.writeFileSync(path.join(root, "js", "ui", "a.js"), "export const a = 2;");
  const afterModule = assetHash(root);
  assert.notEqual(afterModule, before);
  fs.writeFileSync(path.join(root, "styles.css"), "body{color:red}");
  assert.notEqual(assetHash(root), afterModule);
  fs.rmSync(root, { recursive: true, force: true });
});
