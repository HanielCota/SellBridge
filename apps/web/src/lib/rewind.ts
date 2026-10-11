type RewindProperty = "opacity" | "transform" | "strokeDashoffset";

/**
 * Animates `property` from its on-screen value back to `to`, so an interrupted motion reverses
 * from where it stopped instead of jumping. Pause the CSS animation first so the value holds;
 * the returned animation keeps its end state until cancelled.
 */
export function rewind(
  element: Element,
  property: RewindProperty,
  to: string,
  options: KeyframeAnimationOptions,
): Animation {
  const from = getComputedStyle(element)[property];
  return element.animate([{ [property]: from }, { [property]: to }], {
    fill: "forwards",
    ...options,
  });
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
