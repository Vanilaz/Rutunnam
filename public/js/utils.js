// Pure helpers: no DOM, no Leaflet, so they run under `node --test` as well.
import { STALE_READING_MS } from "./config.js";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const TIMEZONE = "Asia/Bangkok";
const shortTime = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const clockTime = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
export const longDate = new Intl.DateTimeFormat("th-TH", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });

const toTime = (value) => value ? new Date(value).getTime() : NaN;

export function fmtTime(value) {
  const time = toTime(value);
  return Number.isNaN(time) ? "ไม่มีเวลาตรวจวัด" : shortTime.format(time);
}

export function age(value, now = Date.now()) {
  const time = toTime(value);
  return Number.isNaN(time) ? Infinity : now - time;
}

export const isFresh = (station, now = Date.now()) => age(station.measuredAt, now) < STALE_READING_MS;
export const levelText = (station) => Number.isFinite(station.level) ? station.level.toFixed(2) : "—";
export const formatCount = (n) => n.toLocaleString("th-TH");

const EARTH_DIAMETER_KM = 12742;
export function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return EARTH_DIAMETER_KM * Math.asin(Math.sqrt(h));
}

// Leaflet throws on NaN coordinates, so anything from storage or the network is checked first.
export function validStations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s === "object" && s.id !== undefined && s.id !== null && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ ...s, id: String(s.id), level: Number.isFinite(s.level) ? s.level : null }));
}

// Distance is computed once per station instead of inside the sort comparator.
export function byDistance(stations, from) {
  return stations
    .map((station) => ({ station, distance: distanceKm(from, [station.lat, station.lng]) }))
    .sort((a, b) => a.distance - b.distance);
}

export const nearestStations = (stations, from, limit) => byDistance(stations, from).slice(0, limit);

export function searchStations(stations, rawQuery, from) {
  const query = rawQuery.trim().toLocaleLowerCase("th");
  if (!query) return [];
  const matches = stations.filter((s) => `${s.name} ${s.province ?? ""} ${s.river ?? ""}`.toLocaleLowerCase("th").includes(query));
  return byDistance(matches, from).map((item) => item.station);
}
