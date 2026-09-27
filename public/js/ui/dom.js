/**
 * Look up a required element. A missing id means index.html and the scripts
 * are out of sync (a deploy bug), so fail loudly instead of returning null.
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} id
 * @param {new () => T} [type] expected element class, e.g. HTMLInputElement
 * @returns {T}
 */
export function byId(id, type) {
  const node = document.getElementById(id);
  const expected = type ?? HTMLElement;
  if (!(node instanceof expected)) throw new Error(`#${id} is missing or is not a ${expected.name}`);
  return /** @type {T} */ (node);
}

/**
 * @param {string} selector
 * @returns {HTMLElement}
 */
export function required(selector) {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`${selector} is missing`);
  return node;
}
