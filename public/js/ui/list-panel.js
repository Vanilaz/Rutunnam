// Right-hand tab panel. One delegated click listener survives every re-render.
import { CAMERA_SOURCES } from "../config.js";
import { cameraTabHtml, FLOOD_TAB_HTML, ROAD_TAB_HTML, waterTabHtml } from "../templates.js";

/** @typedef {import("../types.js").Tab} Tab */
/** @typedef {Parameters<typeof waterTabHtml>[0]} WaterView */

const CAMERA_TAB_HTML = cameraTabHtml(CAMERA_SOURCES);
/** @type {Record<Exclude<Tab, "water">, string>} */
const STATIC_TABS = { road: ROAD_TAB_HTML, flood: FLOOD_TAB_HTML, camera: CAMERA_TAB_HTML };

/**
 * @param {HTMLElement} container
 * @param {{ onStation: (id: string) => void, onCamera: (id: string) => void, onRetry: () => void }} handlers
 */
export function createListPanel(container, { onStation, onCamera, onRetry }) {
  container.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-station], [data-camera], [data-action='retry']") : null;
    if (!(target instanceof HTMLElement) || !container.contains(target)) return;
    const { station, camera } = target.dataset;
    if (station !== undefined) onStation(station);
    else if (camera !== undefined) onCamera(camera);
    else onRetry();
  });

  let lastHtml = "";
  return {
    /**
     * @param {Tab} tab
     * @param {() => WaterView} water computed only when the water tab is shown
     */
    render(tab, water) {
      const html = tab === "water" ? waterTabHtml(water()) : STATIC_TABS[tab];
      // Skip identical re-renders so focus and scroll position are kept.
      if (html === lastHtml) return;
      lastHtml = html;
      container.innerHTML = html;
    }
  };
}
