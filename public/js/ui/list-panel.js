// Right-hand tab panel. One delegated click listener survives every re-render.
import { CAMERA_SOURCES } from "../config.js";
import { cameraTabHtml, FLOOD_TAB_HTML, ROAD_TAB_HTML, waterTabHtml } from "../templates.js";

const CAMERA_TAB_HTML = cameraTabHtml(CAMERA_SOURCES);

export function createListPanel(container, { onStation, onCamera, onRetry }) {
  container.addEventListener("click", (event) => {
    const target = event.target.closest("[data-station], [data-camera], [data-action='retry']");
    if (!target || !container.contains(target)) return;
    if (target.dataset.station !== undefined) onStation(target.dataset.station);
    else if (target.dataset.camera !== undefined) onCamera(target.dataset.camera);
    else onRetry();
  });

  let lastHtml = "";
  return {
    render(tab, water) {
      const html = tab === "road" ? ROAD_TAB_HTML
        : tab === "flood" ? FLOOD_TAB_HTML
          : tab === "camera" ? CAMERA_TAB_HTML
            : waterTabHtml(water());
      // Skip identical re-renders so focus and scroll position are kept.
      if (html === lastHtml) return;
      lastHtml = html;
      container.innerHTML = html;
    }
  };
}
