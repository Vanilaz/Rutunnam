// localStorage access. Storage can throw (private mode, quota), so every call is guarded.
import { CACHE_MAX_AGE_MS, STORAGE_KEYS } from "./config.js";
import { age, validStations } from "./utils.js";

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

export function loadCachedStations() {
  const cached = read(STORAGE_KEYS.waterCache);
  const stations = validStations(cached?.stations);
  const cachedAge = age(cached?.fetchedAt);
  if (!stations.length || cachedAge < 0 || cachedAge >= CACHE_MAX_AGE_MS) return null;
  return { stations, fetchedAt: cached.fetchedAt };
}

export const saveCachedStations = (stations, fetchedAt) => write(STORAGE_KEYS.waterCache, { stations, fetchedAt });

export function loadHome() {
  const saved = read(STORAGE_KEYS.home);
  return saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) ? { lat: saved.lat, lng: saved.lng } : null;
}

export const saveHome = (home) => write(STORAGE_KEYS.home, home);
