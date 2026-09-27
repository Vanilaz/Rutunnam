module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  // No flood polygons are fabricated. A verified GeoJSON feed can be configured later.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  return res.status(200).json({
    features: [],
    source: "GISTDA Disaster Platform",
    sourceUrl: "https://disaster.gistda.or.th/flood",
    status: "external-only",
    message: "เปิดแผนที่พื้นที่น้ำท่วมล่าสุดจาก GISTDA เพื่อตรวจสอบขอบเขตน้ำท่วม"
  });
};
