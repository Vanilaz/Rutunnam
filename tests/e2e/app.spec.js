// @ts-check
const { test, expect, okReply, json, openTab, stationCards, openLayers, isMobile } = require("./fixtures");

const HTML_GATEWAY_ERROR = { status: 504, body: "<html>Gateway Timeout</html>", contentType: "text/html" };

test.describe("station data", () => {
  test("renders the feed and the nearest stations", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    await expect(page.locator("#feed-state")).toHaveText("เชื่อมต่อ ThaiWater แล้ว");
    await openTab(page, "water");
    await expect(stationCards(page)).toHaveCount(8);
    expect(net.pageErrors).toEqual([]);
  });

  test("a station card opens that station's popup on the map", async ({ page, net }) => {
    await page.goto("/");
    await openTab(page, "water");
    const card = stationCards(page).first();
    const name = await card.locator("strong").first().textContent();
    await card.click();
    await expect(page.locator(".leaflet-popup-content")).toContainText(name ?? "");
    expect(net.pageErrors).toEqual([]);
  });

  test("clicking a card turns the station layer back on", async ({ page }) => {
    await page.goto("/");
    await openLayers(page);
    await page.locator("label:has(#toggle-water)").click();
    await expect(page.locator("#toggle-water")).not.toBeChecked();
    await openTab(page, "water");
    await stationCards(page).nth(2).click();
    await expect(page.locator("#toggle-water")).toBeChecked();
    await expect(page.locator(".leaflet-popup-content")).toBeVisible();
  });

  test("search jumps to the closest match", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    await page.fill("#station-query", "ทดสอบ 20");
    await page.press("#station-query", "Enter");
    await expect(page.locator("#search-message")).toHaveText("พบ 1 สถานี · แสดง สถานีทดสอบ 20 (ปทุมธานี)");
    await expect(page.locator(".leaflet-popup-content")).toContainText("สถานีทดสอบ 20");
  });

  test("an HTML error page shows a Thai message and retry recovers", async ({ page, net }) => {
    net.api(HTML_GATEWAY_ERROR);
    await page.goto("/");
    await openTab(page, "water");
    await expect(page.locator("#tab-content")).toContainText("แหล่งข้อมูลไม่พร้อมใช้งาน (HTTP 504)");
    net.api(okReply());
    await page.locator('[data-action="retry"]').click();
    await expect(stationCards(page)).toHaveCount(8);
    expect(net.pageErrors).toEqual([]);
  });

  test("a stale server copy is labelled as such", async ({ page, net }) => {
    net.api(okReply(undefined, { stale: true, warning: "ต้นทางขัดข้อง" }));
    await page.goto("/");
    await openTab(page, "water");
    await expect(page.locator(".cache-warning")).toBeVisible();
    await expect(page.locator("#feed-state")).toHaveText("แสดงข้อมูลครั้งก่อน");
  });

  test("the last good feed is shown from device cache when offline", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    net.api(HTML_GATEWAY_ERROR);
    await page.reload();
    await openTab(page, "water");
    await expect(stationCards(page)).toHaveCount(8);
    await expect(page.locator(".cache-warning")).toBeVisible();
  });
});

test.describe("summary and layout", () => {
  test("the 'near you' banner and summary numbers reflect the data", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#alert-banner")).toContainText("ใกล้คุณ: ล้นตลิ่ง");
    await expect(page.locator("#alert-banner")).toContainText("สถานีทดสอบ 11");
    await expect(page.locator("#kpi-overflow")).toHaveText("1");
    await expect(page.locator("#kpi-high")).toHaveText("1");
    await expect(page.locator("#kpi-roads")).toHaveText("2");
    await expect(page.locator("#kpi-cameras")).toHaveText("10");
    await expect(page.locator("#updated-at")).not.toHaveText("--:--");
    await page.locator("#alert-banner").click();
    await expect(page.locator(".leaflet-popup-content")).toContainText("สถานีทดสอบ 11");
    expect(net.pageErrors).toEqual([]);
  });

  test("on phones each menu item opens a full page and the map comes back", async ({ page }) => {
    test.skip(!isMobile(), "phone layout only");
    await page.goto("/");
    await expect(page.locator(".map-panel")).toBeVisible();
    await expect(page.locator(".insights")).toBeHidden();
    await expect(page.locator("#nav-risk-badge")).toHaveText("1");
    await page.locator('[data-nav="camera"]').click();
    await expect(page.locator(".map-panel")).toBeHidden();
    await expect(page.locator(".insights")).toBeVisible();
    await expect(page.locator(".cam-card").first()).toBeVisible();
    await page.locator('[data-nav="map"]').click();
    await expect(page.locator(".map-panel")).toBeVisible();
    await page.locator("#open-layers").click();
    await expect(page.locator("#layer-sheet")).toBeVisible();
    await page.locator("#close-layers").click();
    await expect(page.locator("#layer-sheet")).toBeHidden();
  });
});

test.describe("cameras", () => {
  test("the camera page shows live thumbnails and opens the viewer", async ({ page, net }) => {
    await page.goto("/");
    await openTab(page, "camera");
    const waterCard = page.locator('[data-viewer="water:dds1"]');
    await expect(waterCard.locator(".cam-badge")).toHaveText("สด");
    await waterCard.click();
    const viewer = page.locator("#camera-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img.viewer-media")).toHaveAttribute("src", /cctv1\.jpg\?t=\d+/);
    await viewer.locator("[data-viewer-close]").click();
    await expect(viewer).toBeHidden();
    expect(net.pageErrors).toEqual([]);
  });

  test("nationwide traffic cameras are listed nearest first and shown on the map", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#traffic-camera-note")).toHaveText("iTIC · 3 กล้อง");
    await expect(page.locator(".traffic-cam-pin")).toHaveCount(3);
    await openTab(page, "camera");
    const trafficCards = page.locator('[data-viewer^="traffic:"]');
    await expect(trafficCards).toHaveCount(3);
    await expect(trafficCards.first()).toContainText("แยกรังสิต");
    await expect(trafficCards.last()).toContainText("เชียงใหม่");
    await trafficCards.first().click();
    await expect(page.locator("#camera-viewer img.viewer-media")).toHaveAttribute("src", /near\.jpg\?t=\d+/);
    expect(net.pageErrors).toEqual([]);
  });

  test("a live video camera loads the HLS player (SRI verified) and falls back cleanly", async ({ page, net }) => {
    await page.goto("/");
    await openTab(page, "camera");
    await page.locator('[data-viewer="traffic:itic-video"]').click();
    // Downloaded from the real CDN on CI, so allow for network time.
    await expect.poll(() => page.evaluate(() => typeof (/** @type {any} */ (window)).Hls), { timeout: 15000 }).toBe("function");
    // The mocked stream host is unreachable, so the viewer must say so instead of hanging.
    await expect(page.locator("#camera-viewer .viewer-message")).toContainText("วิดีโอจากกล้องนี้ไม่พร้อมใช้งาน");
    expect(net.pageErrors).toEqual([]);
  });

  test("a failed camera feed is reported in the camera page", async ({ page, net }) => {
    net.trafficCameras(json({ cameras: [], error: "ดึงรายชื่อกล้องจราจรไม่ได้ในขณะนี้" }, 502));
    await page.goto("/");
    await openTab(page, "camera");
    await expect(page.locator("#tab-content")).toContainText("ดึงรายชื่อกล้องจราจรไม่ได้ในขณะนี้");
    await expect(page.locator('[data-viewer^="water:"]').first()).toBeVisible();
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
    await openTab(page, "risk");
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
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    await openLayers(page);
    await page.locator("label:has(#toggle-risk-only)").click();
    await expect(page.locator("#toggle-risk-only")).toBeChecked();
    await openTab(page, "water");
    await stationCards(page).filter({ hasText: "สถานีทดสอบ 10" }).first().click();
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

  test("live traffic is on by default when a key is configured", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#toggle-traffic")).toBeChecked();
    await expect.poll(() => net.requests.filter((url) => url.startsWith("https://api.tomtom.com/traffic/map/4/tile/flow/")).length).toBeGreaterThan(0);
    await openTab(page, "road");
    await expect(page.locator("#tab-content")).toContainText("ซ่อนการจราจร");
    expect(net.pageErrors).toEqual([]);
  });

  test("a viewer who switches traffic off keeps it off after reload", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#toggle-traffic")).toBeChecked();
    await openLayers(page);
    await page.locator("label:has(#toggle-traffic)").click();
    await expect(page.locator("#toggle-traffic")).not.toBeChecked();
    await page.reload();
    await expect(page.locator("#toggle-traffic")).toBeEnabled();
    await expect(page.locator("#toggle-flood")).toBeChecked();
    await expect(page.locator("#toggle-traffic")).not.toBeChecked();
    const before = net.requests.length;
    await page.waitForTimeout(500);
    expect(net.requests.slice(before).some((url) => url.includes("api.tomtom.com"))).toBe(false);
  });

  test("layers without API keys are disabled and explained", async ({ page, net }) => {
    net.config({ status: 200, body: JSON.stringify({ flood: { available: false }, traffic: { available: false }, roadFlood: { available: true } }) });
    await page.goto("/");
    await expect(page.locator("#toggle-flood")).toBeDisabled();
    await expect(page.locator("#toggle-traffic")).toBeDisabled();
    await expect(page.locator("#flood-layer-note")).toHaveText("ยังไม่ได้ตั้งค่า GISTDA API key");
    await openTab(page, "flood");
    await expect(page.locator("#tab-content")).toContainText("GISTDA_API_KEY");
    expect(net.requests.some((url) => url.includes("/api/flood-wms"))).toBe(false);
  });

  test("flooded roads appear as pins and in the flood tab", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#road-flood-note")).toHaveText("ThaiWater · 2 จุดรายงาน");
    await expect(page.locator(".road-flood-pin")).toHaveCount(2);
    await openTab(page, "flood");
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
    await openTab(page, "flood");
    await expect(page.locator("#tab-content")).toContainText("ไม่ได้แปลว่าไม่มีน้ำท่วม");
  });
});

test.describe("water gates and dams", () => {
  test("gates and dams appear on the map and in their page", async ({ page, net }) => {
    await page.goto("/");
    await expect(page.locator("#gate-note")).toHaveText("ThaiWater · 2 แห่ง");
    await expect(page.locator("#dam-note")).toHaveText("ThaiWater · 2 แห่ง");
    await expect(page.locator(".gate-pin")).toHaveCount(2);
    await expect(page.locator(".dam-pin")).toHaveCount(2);
    await expect(page.locator(".dam-pin.is-large")).toHaveText(/104%/);
    await openTab(page, "gates");
    const gate = page.locator("[data-gate]").first();
    await expect(gate).toContainText("ปตร.คลองรังสิต");
    await expect(gate).toContainText("+0.93");
    const dams = page.locator("[data-dam]");
    await expect(dams.first()).toContainText("เขื่อนทดสอบใหญ่");
    await expect(dams.first()).toContainText("เกินความจุ");
    await expect(dams.nth(1)).toContainText("น้ำน้อย");
    await gate.click();
    await expect(page.locator(".leaflet-popup-content")).toContainText("น้ำด้านรับ 3.72 ม.");
    expect(net.pageErrors).toEqual([]);
  });

  test("a dam card opens its popup with daily inflow and release", async ({ page }) => {
    await page.goto("/");
    await openTab(page, "gates");
    await page.locator('[data-dam="d-large"]').click();
    // The reservoir is ~140 km away, so the fly animation takes a few seconds.
    await expect(page.locator(".leaflet-popup-content")).toContainText("ระบาย 35.5 ล้าน ลบ.ม./วัน", { timeout: 10000 });
  });

  test("unreadable or failed feeds are reported, not shown as empty", async ({ page, net }) => {
    net.waterGates(json({ gates: [], status: "unsupported-format" }));
    net.dams(json({ dams: [], status: "error", error: "ดึงข้อมูลเขื่อนและอ่างเก็บน้ำไม่ได้ในขณะนี้" }, 502));
    await page.goto("/");
    await openTab(page, "gates");
    await expect(page.locator("#tab-content")).toContainText("ไม่ได้แปลว่าไม่มีข้อมูล");
    await expect(page.locator("#tab-content")).toContainText("ดึงข้อมูลเขื่อนและอ่างเก็บน้ำไม่ได้ในขณะนี้");
    await expect(page.locator("#gate-note")).toHaveText("ThaiWater · รูปแบบข้อมูลยังไม่รองรับ");
  });
});

test.describe("deploy safety", () => {
  // Count HTML document requests: the reload can happen before the first "load" event fires.
  /** @param {string[]} requests */
  const documentLoads = (requests) => requests.filter((url) => new URL(url).pathname === "/").length;

  test("an outdated page reloads itself once, then stops", async ({ page, net }) => {
    net.config(json({ flood: { available: false }, traffic: { available: false }, roadFlood: { available: true }, version: "99.0.0" }));
    await page.goto("/");
    await expect.poll(() => documentLoads(net.requests), { timeout: 10000 }).toBe(2);
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    await page.waitForTimeout(1500);
    expect(documentLoads(net.requests)).toBe(2);
  });

  test("a matching version does not reload", async ({ page, net }) => {
    const { version } = require("../../package.json");
    net.config(json({ flood: { available: false }, traffic: { available: false }, roadFlood: { available: true }, version }));
    await page.goto("/");
    await expect(page.locator("#station-count")).toHaveText("30 สถานีทั่วประเทศ");
    await page.waitForTimeout(1500);
    expect(documentLoads(net.requests)).toBe(1);
  });

  test("a section that fails to render shows a message and does not block the menu", async ({ page, net }) => {
    // Force a genuine render exception: make toFixed throw for one sentinel reservoir percentage,
    // which the gates tab formats with percent.toFixed(0).
    const SENTINEL = 12345.678;
    await page.addInitScript((sentinel) => {
      const original = Number.prototype.toFixed;
      /** @param {number | undefined} digits */
      Number.prototype.toFixed = function (digits) {
        if (Number(this) === sentinel) throw new Error("forced render failure");
        return original.call(this, digits);
      };
    }, SENTINEL);
    net.dams(json({ dams: [{ id: "x", name: "เขื่อนแปลก", size: "large", lat: 15, lng: 100, percent: SENTINEL, date: "2026-09-27" }], status: "ok" }));
    await page.goto("/");
    await openTab(page, "gates");
    await expect(page.locator("#tab-content")).toContainText("แสดงข้อมูลส่วนนี้ไม่ได้");
    await openTab(page, "camera");
    await expect(page.locator('[data-viewer^="water:"]').first()).toBeVisible();
    // The failure was contained to that one section; the rest of the app still works.
    expect(net.pageErrors.filter((message) => !message.includes("render failed") && !message.includes("forced render failure"))).toEqual([]);
  });
});
