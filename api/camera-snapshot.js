// @ts-check
const { rejectUnsafeMethod, logEvent, errorMessage } = require("../lib/http");

const SOURCE = "https://cdp.rangsitcity.go.th";
const ALLOWED = new Set(["151", "152"]);

/** @param {import("../lib/http").Req} req @param {import("../lib/http").Res} res */
module.exports = async function handler(req, res) {
  if (rejectUnsafeMethod(req, res)) return;
  const id = req.query?.id;
  if (typeof id !== "string" || !ALLOWED.has(id)) return res.status(400).json({ error: "Unknown camera" });
  try {
    const frame = await fetch(`${SOURCE}/api/flood/snapshot/${id}?t=${Math.floor(Date.now() / 10000)}`, {
      headers: { Accept: "image/jpeg,image/png,image/*" },
      signal: AbortSignal.timeout(8000)
    });
    if (!frame.ok) throw new Error(`upstream ${frame.status}`);
    const bytes = Buffer.from(await frame.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if ((!jpeg && !png) || bytes.length < 1000 || bytes.length > 5_000_000) throw new Error("invalid frame");
    res.setHeader("Content-Type", jpeg ? "image/jpeg" : "image/png");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=8, stale-while-revalidate=12");
    return res.status(200).send?.(bytes);
  } catch (error) {
    logEvent("camera_snapshot_failed", { camera: id, message: errorMessage(error) });
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Camera frame unavailable" });
  }
};
