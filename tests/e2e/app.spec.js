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
