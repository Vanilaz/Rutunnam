// Feed status texts in the sidebar, map badge and list footer.
import { fmtTime, formatCount } from "../utils.js";

export function createStatusView($) {
  const set = (id, text) => { $(id).textContent = text; };
  return {
    loading() {
      $("refresh").disabled = true;
      set("feed-state", "กำลังตรวจสอบข้อมูล");
      set("map-status", "กำลังโหลดสถานีวัดน้ำ");
    },
    done() { $("refresh").disabled = false; },
    cached(count, fetchedAt) {
      set("station-count", `${formatCount(count)} สถานี · ข้อมูลครั้งก่อน`);
      set("feed-state", "แสดงข้อมูลครั้งก่อน");
      set("feed-detail", `ดึงเมื่อ ${fmtTime(fetchedAt)} · กำลังตรวจสอบข้อมูลใหม่`);
      set("map-status", "ข้อมูลครั้งก่อน · กำลังอัปเดต");
      set("last-fetch", `ดึง ${fmtTime(fetchedAt)}`);
    },
    loaded(count, fetchedAt) {
      set("station-count", `${formatCount(count)} สถานีทั่วประเทศ`);
      set("feed-state", "เชื่อมต่อ ThaiWater แล้ว");
      set("feed-detail", `ดึงข้อมูล ${fmtTime(fetchedAt)} · แต่ละสถานีมีเวลาตรวจวัดต่างกัน`);
      set("map-status", `${formatCount(count)} สถานี · ดูเวลารายจุด`);
      set("last-fetch", `ดึง ${fmtTime(fetchedAt)}`);
    },
    failed(count, fetchedAt) {
      set("feed-state", count ? "แสดงข้อมูลครั้งก่อน" : "เชื่อมต่อข้อมูลไม่ได้");
      set("feed-detail", count ? `ข้อมูลที่ดึงเมื่อ ${fmtTime(fetchedAt)} · โปรดตรวจเวลารายสถานี` : "กดรีเฟรชเพื่อลองใหม่");
      set("map-status", count ? "ข้อมูลครั้งก่อน · กดรีเฟรช" : "ไม่มีข้อมูลสถานีที่ยืนยันได้");
      if (!count) set("station-count", "ไม่มีข้อมูล");
    }
  };
}
