// Feed status texts in the sidebar, map badge and list footer.
import { fmtTime, formatCount } from "../utils.js";
import { byId } from "./dom.js";

export function createStatusView() {
  const refresh = byId("refresh", HTMLButtonElement);
  const nodes = {
    count: byId("station-count"),
    feedState: byId("feed-state"),
    feedDetail: byId("feed-detail"),
    mapStatus: byId("map-status"),
    lastFetch: byId("last-fetch")
  };

  return {
    loading() {
      refresh.disabled = true;
      nodes.feedState.textContent = "กำลังตรวจสอบข้อมูล";
      nodes.mapStatus.textContent = "กำลังโหลดสถานีวัดน้ำ";
    },
    done() { refresh.disabled = false; },
    /** @param {number} count @param {string | null} fetchedAt */
    cached(count, fetchedAt) {
      nodes.count.textContent = `${formatCount(count)} สถานี · ข้อมูลครั้งก่อน`;
      nodes.feedState.textContent = "แสดงข้อมูลครั้งก่อน";
      nodes.feedDetail.textContent = `ดึงเมื่อ ${fmtTime(fetchedAt)} · กำลังตรวจสอบข้อมูลใหม่`;
      nodes.mapStatus.textContent = "ข้อมูลครั้งก่อน · กำลังอัปเดต";
      nodes.lastFetch.textContent = `ดึง ${fmtTime(fetchedAt)}`;
    },
    /** @param {number} count @param {string | null} fetchedAt */
    loaded(count, fetchedAt) {
      nodes.count.textContent = `${formatCount(count)} สถานีทั่วประเทศ`;
      nodes.feedState.textContent = "เชื่อมต่อ ThaiWater แล้ว";
      nodes.feedDetail.textContent = `ดึงข้อมูล ${fmtTime(fetchedAt)} · แต่ละสถานีมีเวลาตรวจวัดต่างกัน`;
      nodes.mapStatus.textContent = `${formatCount(count)} สถานี · ดูเวลารายจุด`;
      nodes.lastFetch.textContent = `ดึง ${fmtTime(fetchedAt)}`;
    },
    /** @param {number} count stations still on screen @param {string | null} fetchedAt */
    failed(count, fetchedAt) {
      nodes.feedState.textContent = count ? "แสดงข้อมูลครั้งก่อน" : "เชื่อมต่อข้อมูลไม่ได้";
      nodes.feedDetail.textContent = count ? `ข้อมูลที่ดึงเมื่อ ${fmtTime(fetchedAt)} · โปรดตรวจเวลารายสถานี` : "กดรีเฟรชเพื่อลองใหม่";
      nodes.mapStatus.textContent = count ? "ข้อมูลครั้งก่อน · กดรีเฟรช" : "ไม่มีข้อมูลสถานีที่ยืนยันได้";
      if (count) nodes.lastFetch.textContent = `ดึง ${fmtTime(fetchedAt)}`;
      else nodes.count.textContent = "ไม่มีข้อมูล";
    }
  };
}
