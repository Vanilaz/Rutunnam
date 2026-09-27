const { SOURCE_URL, normalizePayload } = require("../lib/water");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    if (!upstream.ok) throw new Error(`ต้นทางตอบกลับ ${upstream.status}`);
    const payload = await upstream.json();
    const stations = normalizePayload(payload);
    return res.status(200).json({
      stations,
      fetchedAt: new Date().toISOString(),
      source: "ThaiWater · คลังข้อมูลน้ำแห่งชาติ",
      sourceUrl: SOURCE_URL
    });
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({
      stations: [],
      error: "ดึงข้อมูลสถานีไม่ได้ในขณะนี้",
      detail: process.env.NODE_ENV === "development" ? String(error.message) : undefined,
      sourceUrl: "https://www.thaiwater.net/"
    });
  }
};
