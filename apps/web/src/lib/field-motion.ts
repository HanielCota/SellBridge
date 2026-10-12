import { prefersReducedMotion } from "./rewind";

/** Gap between two fields of the autofill cascade: quick enough to read as one gesture. */
const CASCADE_STAGGER_MS = 75;
const TEXT_RISE_PX = 5;

function brandTint(rest: string): string {
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  // sRGB, not OKLCH: mixing toward the near-gray field in OKLCH swings the hue to blue.
  return `color-mix(in srgb, ${brand} 24%, ${rest})`;
}

/**
 * Shows which fields the CEP just filled: one after the other, each value rises into place while
 * the field glows brand green and fades back, like autofill on iOS. With reduced motion the text
 * only fades in and the glow stays, since color changes carry no movement.
 */
export function revealAutofill(fieldIds: readonly string[]): void {
  const reduced = prefersReducedMotion();
  fieldIds.forEach((id, index) => {
    const field = document.getElementById(id);
    if (!field) {
      return;
    }
    const style = getComputedStyle(field);
    const delay = reduced ? 0 : index * CASCADE_STAGGER_MS;
    field.animate(
      [
        { backgroundColor: brandTint(style.backgroundColor) },
        { backgroundColor: style.backgroundColor },
      ],
      { duration: 900, delay, easing: "ease-out" },
    );
    const paddingTop = Number.parseFloat(style.paddingTop);
    const from = reduced
      ? { color: "transparent" }
      : { color: "transparent", paddingTop: `${paddingTop + TEXT_RISE_PX}px` };
    // "backwards" keeps a field blank until its turn, so the cascade reads top to bottom.
    field.animate([from, { color: style.color, paddingTop: `${paddingTop}px` }], {
      duration: 320,
      delay,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "backwards",
    });
  });
}

/** A short "no" shake for a field whose value was rejected, like the alert glyphs. */
export function shakeField(element: Element | null): void {
  if (!element || prefersReducedMotion()) {
    return;
  }
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(1px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 380, easing: "ease-in-out" },
  );
}
