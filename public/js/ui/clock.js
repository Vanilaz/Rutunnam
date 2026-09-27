import { MINUTE_MS } from "../config.js";
import { clockTime, longDate } from "../utils.js";

const CLOCK_DRIFT_MS = 50; // Fire just after the minute boundary, never just before it.

// Re-render right after each minute boundary so the clock never lags behind real time.
export function startClock(clockEl, dateEl) {
  const tick = () => {
    const now = new Date();
    clockEl.textContent = clockTime.format(now);
    dateEl.textContent = longDate.format(now);
    setTimeout(tick, MINUTE_MS - (now.getTime() % MINUTE_MS) + CLOCK_DRIFT_MS);
  };
  tick();
}
