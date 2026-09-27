// Right-hand tab panel. One delegated click listener survives every re-render.

/** @typedef {import("../types.js").Tab} Tab */

/**
 * @typedef {Object} ListHandlers
 * @property {(id: string) => void} onStation
 * @property {(id: string) => void} onCamera
 * @property {(id: string) => void} onRoad
 * @property {(key: string) => void} onViewer  e.g. "water:dds1", "traffic:itic-A1"
 * @property {(id: string) => void} onGate
 * @property {(id: string) => void} onDam
 * @property {(action: string) => void} onAction  e.g. "retry", "toggle-traffic"
 */

/**
 * @param {HTMLElement} container
 * @param {ListHandlers} handlers
 */
export function createListPanel(container, { onStation, onCamera, onRoad, onViewer, onGate, onDam, onAction }) {
  container.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-station], [data-camera], [data-road], [data-viewer], [data-gate], [data-dam], [data-action]") : null;
    if (!(target instanceof HTMLElement) || !container.contains(target)) return;
    const { station, camera, road, viewer, gate, dam, action } = target.dataset;
    if (station !== undefined) onStation(station);
    else if (gate !== undefined) onGate(gate);
    else if (dam !== undefined) onDam(dam);
    else if (viewer !== undefined) onViewer(viewer);
    else if (camera !== undefined) onCamera(camera);
    else if (road !== undefined) onRoad(road);
    else if (action !== undefined) onAction(action);
  });

  let lastHtml = "";
  return {
    /** @param {string} html @returns {boolean} true when the DOM was replaced */
    render(html) {
      // Skip identical re-renders so focus and scroll position are kept.
      if (html === lastHtml) return false;
      lastHtml = html;
      container.innerHTML = html;
      return true;
    }
  };
}
