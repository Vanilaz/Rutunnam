// @ts-check
const { test, expect, okReply } = require("./fixtures");

const HTML_GATEWAY_ERROR = { status: 504, body: "<html>Gateway Timeout</html>", contentType: "text/html" };

test.describe("station data", () => {
  test("renders the feed and the nearest stations", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    await expect(page.locator("#feed-state")).toHaveText("เชื่อมต่อ ThaiWater แล้ว");
    await expect(page.locator(".station-card")).toHaveCount(8);
    expect(net.pageErrors).toEqual([]);
  });

  test("a station card opens that station's popup on the map", async ({ page, net }) => {
    await page.goto("/");
    const card = page.locator(".station-card").first();
    const name = await card.locator("strong").textContent();
    await card.click();
    await expect(page.locator(".leaflet-popup-content")).toContainText(name ?? "");
    expect(net.pageErrors).toEqual([]);
  });

  test("clicking a card turns the station layer back on", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".station-card")).toHaveCount(8);
    await page.locator("label:has(#toggle-water)").click();
    await expect(page.locator("#toggle-water")).not.toBeChecked();
    await page.locator(".station-card").nth(2).click();
    await expect(page.locator("#toggle-water")).toBeChecked();
    await expect(page.locator(".leaflet-popup-content")).toBeVisible();
  });

  test("search jumps to the closest match", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".station-card")).toHaveCount(8);
    await page.fill("#station-query", "ทดสอบ 20");
    await page.press("#station-query", "Enter");
    await expect(page.locator("#search-message")).toHaveText("พบ 1 สถานี · แสดง สถานีทดสอบ 20 (ปทุมธานี)");
    await expect(page.locator(".leaflet-popup-content")).toContainText("สถานีทดสอบ 20");
  });

  test("an HTML error page shows a Thai message and retry recovers", async ({ page, net }) => {
    net.api(HTML_GATEWAY_ERROR);
    await page.goto("/");
    await expect(page.locator("#tab-content")).toContainText("แหล่งข้อมูลไม่พร้อมใช้งาน (HTTP 504)");
    net.api(okReply());
    await page.locator('[data-action="retry"]').click();
    await expect(page.locator(".station-card")).toHaveCount(8);
    expect(net.pageErrors).toEqual([]);
  });

  test("a stale server copy is labelled as such", async ({ page, net }) => {
    net.api(okReply(undefined, { stale: true, warning: "ต้นทางขัดข้อง" }));
    await page.goto("/");
    await expect(page.locator(".cache-warning")).toBeVisible();
    await expect(page.locator("#feed-state")).toHaveText("แสดงข้อมูลครั้งก่อน");
  });

  test("the last good feed is shown from device cache when offline", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator(".station-card")).toHaveCount(8);
    net.api(HTML_GATEWAY_ERROR);
    await page.reload();
    await expect(page.locator(".station-card")).toHaveCount(8);
    await expect(page.locator(".cache-warning")).toBeVisible();
  });
});

test.describe("cameras", () => {
  test("camera list opens a popup with a refreshing preview", async ({ page, net }) => {
    await page.goto("/");
    await page.locator('.tab[data-tab="camera"]').click();
    await expect(page.locator("#tab-content .content-heading span")).toHaveText("7 กล้อง · 2 ศูนย์");
    await page.locator(".camera-open").first().click();
    await expect(page.locator(".camera-preview img")).toHaveAttribute("src", /cctv1\.jpg\?t=\d+/);
    expect(net.pageErrors).toEqual([]);
  });
});

test.describe("basemap", () => {
  test("loads MapLibre (SRI verified) and draws the vector style", async ({ page, net }) => {
    net.vectorStyle(true);
    await page.goto("/");
    await expect(page.locator(".leaflet-gl-layer")).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator("#map-style")).toHaveValue("vector");
    expect(await page.evaluate(() => typeof window.maplibregl)).toBe("object");
    expect(net.pageErrors).toEqual([]);
  });

  test("falls back to raster tiles when the vector style cannot load", async ({ page, net }) => {
    net.vectorStyle(false);
    await page.goto("/");
    await expect(page.locator("#map-style")).toHaveValue("classic", { timeout: 15000 });
    await expect(page.locator(".leaflet-gl-layer")).toHaveCount(0);
    await expect(page.locator(".leaflet-tile").first()).toBeAttached();
    expect(net.pageErrors).toEqual([]);
  });
});

test.describe("bank overflow", () => {
  test("flags over-bank stations on the map and in the risk tab", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#risk-count")).toHaveText("ล้นตลิ่ง 1 · ใกล้ตลิ่ง 1 สถานี");
    await expect(page.locator(".overflow-pin")).toHaveCount(1);
    await page.locator('.tab[data-tab="risk"]').click();
    const cards = page.locator("#tab-content .risk-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("สถานีทดสอบ 11");
    await expect(cards.first()).toContainText("ล้นตลิ่ง");
    await expect(cards.nth(1)).toContainText("น้ำมาก ใกล้ตลิ่ง");
    await cards.first().click();
    await expect(page.locator(".leaflet-popup-content")).toContainText("112% ของความจุลำน้ำ");
    expect(net.pageErrors).toEqual([]);
  });

  test("opening a normal station switches 'risk only' back off", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".station-card")).toHaveCount(8);
    await page.locator("label:has(#toggle-risk-only)").click();
    await expect(page.locator("#toggle-risk-only")).toBeChecked();
    await page.locator('.station-card:has-text("สถานีทดสอบ 10")').first().click();
    await expect(page.locator("#toggle-risk-only")).not.toBeChecked();
    await expect(page.locator(".leaflet-popup-content")).toContainText("สถานีทดสอบ 10");
  });
});

test.describe("flood and traffic layers", () => {
  test("satellite flood tiles load through the server proxy", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#toggle-flood")).toBeChecked();
    await expect.poll(() => net.requests.filter((url) => url.includes("/api/flood-wms?") && /srs=EPSG%3A3857/i.test(url)).length).toBeGreaterThan(0);
    expect(net.requests.some((url) => url.includes("gistda"))).toBe(false);
    expect(net.pageErrors).toEqual([]);
  });

  test("traffic quick filter turns on live traffic tiles", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#toggle-traffic")).toBeEnabled();
    await page.locator('[data-quick="road"]').click();
    await expect(page.locator("#toggle-traffic")).toBeChecked();
    await expect.poll(() => net.requests.filter((url) => url.startsWith("https://api.tomtom.com/traffic/map/4/tile/flow/")).length).toBeGreaterThan(0);
    await expect(page.locator("#tab-content")).toContainText("การจราจรสด");
    expect(net.pageErrors).toEqual([]);
  });

  test("layers without API keys are disabled and explained", async ({ page, net }) => {
    net.config({ status: 200, body: JSON.stringify({ flood: { available: false }, traffic: { available: false }, roadFlood: { available: true } }) });
    await page.goto("/");
    await expect(page.locator("#toggle-flood")).toBeDisabled();
    await expect(page.locator("#toggle-traffic")).toBeDisabled();
    await expect(page.locator("#flood-layer-note")).toHaveText("ยังไม่ได้ตั้งค่า GISTDA API key");
    await page.locator('.tab[data-tab="flood"]').click();
    await expect(page.locator("#tab-content")).toContainText("GISTDA_API_KEY");
    expect(net.requests.some((url) => url.includes("/api/flood-wms"))).toBe(false);
  });

  test("flooded roads appear as pins and in the flood tab", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#road-flood-note")).toHaveText("ThaiWater · 2 จุดรายงาน");
    await expect(page.locator(".road-flood-pin")).toHaveCount(2);
    await page.locator('.tab[data-tab="flood"]').click();
    const first = page.locator("#tab-content [data-road]").first();
    await expect(first).toContainText("ถ.พหลโยธิน ขาเข้า");
    await expect(first).toContainText("น้ำลึกประมาณ 25 ซม.");
    await first.click();
    await expect(page.locator(".leaflet-popup-content")).toContainText("ถ.พหลโยธิน ขาเข้า");
    expect(net.pageErrors).toEqual([]);
  });

  test("an unreadable road feed is not shown as 'no flooding'", async ({ page, net }) => {
    net.roadFlood({ status: 200, body: JSON.stringify({ reports: [], status: "unsupported-format" }) });
    await page.goto("/");
    await page.locator('.tab[data-tab="flood"]').click();
    await expect(page.locator("#tab-content")).toContainText("ไม่ได้แปลว่าไม่มีน้ำท่วม");
  });
});
