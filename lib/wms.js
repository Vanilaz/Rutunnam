// @ts-check
// Validates the WMS GetMap parameters Leaflet sends, so /api/flood-wms cannot be used
// as a general-purpose proxy (only fixed layer, bounded sizes, known projections).

const ALLOWED_SRS = new Set(["EPSG:3857", "EPSG:4326"]);
const MIN_TILE_PX = 64;
const MAX_TILE_PX = 1024;

/**
 * @param {Map<string, string>} params lower-cased query parameters
 * @returns {{ ok: true, query: URLSearchParams } | { ok: false, error: string }}
 */
function buildGetMap(params) {
  const srs = (params.get("srs") ?? params.get("crs") ?? "").toUpperCase();
  if (!ALLOWED_SRS.has(srs)) return { ok: false, error: "unsupported srs" };
  const bbox = (params.get("bbox") ?? "").split(",").map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return { ok: false, error: "invalid bbox" };
  const width = Number(params.get("width"));
  const height = Number(params.get("height"));
  /** @param {number} n */
  const validSize = (n) => Number.isInteger(n) && n >= MIN_TILE_PX && n <= MAX_TILE_PX;
  if (!validSize(width) || !validSize(height)) return { ok: false, error: "invalid size" };
  const query = new URLSearchParams({
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.1.1", LAYERS: "flood", STYLES: "",
    FORMAT: "image/png", TRANSPARENT: "true", SRS: srs, BBOX: bbox.join(","),
    WIDTH: String(width), HEIGHT: String(height)
  });
  return { ok: true, query };
}

module.exports = { buildGetMap };
