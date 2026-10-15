/** Minimal in-place DOM diff used to update the HUD without recreating its nodes.
    Re-rendering an ApplicationV2 repaints the whole bar, reloading the menu
    background, the portraits and every item icon, which makes the bar flicker.
    Here we only touch the attributes, text and nodes that actually changed, so an
    update is invisible. */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Classes added at runtime (hover/drag) that must not count as a change. */
const TRANSIENT_CLASSES = new Set([
  "ph-dice-visible",
  "ph-power-card--dragging",
  "ph-power-card--drop"
]);

/** Attributes Foundry adds at runtime (tooltip/focus wiring) that the template
    does not render and that must not be removed. */
const RUNTIME_ATTRIBUTES = new Set(["aria-describedby"]);

function signature(element: Element): string {
  const classes = Array.from(element.classList)
    .filter((name) => !TRANSIENT_CLASSES.has(name))
    .sort();
  return `${element.tagName}:${classes.join(" ")}`;
}

/** Patches `live`'s children in place to match `fresh`, reusing every node whose
    tag and classes are unchanged. */
export function patchChildren(live: Element, fresh: Element): void {
  const liveNodes = Array.from(live.childNodes);
  const freshNodes = Array.from(fresh.childNodes);
  const length = Math.max(liveNodes.length, freshNodes.length);
  for (let i = 0; i < length; i += 1) {
    patchChild(live, liveNodes[i], freshNodes[i]);
  }
}

function patchChild(
  parent: Element,
  liveNode: ChildNode | undefined,
  freshNode: ChildNode | undefined
): void {
  if (!freshNode) {
    liveNode?.remove();
    return;
  }
  // Missing live children only ever appear past the end of the current list, so
  // appending is enough (in-place insertions are handled by replacing the shifted
  // nodes, which then cascade into this append).
  if (!liveNode) {
    parent.appendChild(freshNode.cloneNode(true));
    return;
  }
  if (liveNode.nodeType !== freshNode.nodeType) {
    parent.replaceChild(freshNode.cloneNode(true), liveNode);
    return;
  }
  if (liveNode.nodeType === TEXT_NODE) {
    if (liveNode.nodeValue !== freshNode.nodeValue) liveNode.nodeValue = freshNode.nodeValue;
    return;
  }
  if (liveNode.nodeType !== ELEMENT_NODE) return;

  const liveElement = liveNode as Element;
  const freshElement = freshNode as Element;
  if (signature(liveElement) !== signature(freshElement)) {
    parent.replaceChild(freshElement.cloneNode(true), liveNode);
    return;
  }

  syncAttributes(liveElement, freshElement);
  patchChildren(liveElement, freshElement);
}

function syncAttributes(live: Element, fresh: Element): void {
  for (const attribute of Array.from(fresh.attributes)) {
    if (attribute.name === "class") continue;
    if (live.getAttribute(attribute.name) !== attribute.value) {
      live.setAttribute(attribute.name, attribute.value);
    }
  }
  for (const attribute of Array.from(live.attributes)) {
    if (attribute.name === "class" || RUNTIME_ATTRIBUTES.has(attribute.name)) continue;
    if (!fresh.hasAttribute(attribute.name)) live.removeAttribute(attribute.name);
  }
  syncClass(live, fresh);
}

/** Applies the fresh class list but keeps runtime-only classes (hover/drag) that
    the template does not know about. */
function syncClass(live: Element, fresh: Element): void {
  const freshClasses = Array.from(fresh.classList);
  const keep = Array.from(live.classList).filter(
    (name) => TRANSIENT_CLASSES.has(name) && !freshClasses.includes(name)
  );
  const desired = keep.length ? [...freshClasses, ...keep] : freshClasses;
  const current = Array.from(live.classList);
  const same =
    desired.length === current.length &&
    desired.every((name) => current.includes(name)) &&
    current.every((name) => desired.includes(name));
  if (!same) live.setAttribute("class", desired.join(" "));
}
