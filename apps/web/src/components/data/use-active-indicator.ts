import { type RefObject, useLayoutEffect, useState } from "react";

export interface IndicatorBox {
  left: number;
  width: number;
  /** True when a new choice moved it; a layout change (a badge, fonts, a resize) does not. */
  glides: boolean;
}

/** Scrolls a narrow track (a phone) just enough to show the active option, with no animation. */
function revealInside(container: HTMLElement, button: HTMLElement): void {
  const right = button.offsetLeft + button.offsetWidth;
  if (right > container.scrollLeft + container.clientWidth) {
    container.scrollTo({ left: right - container.clientWidth });
    return;
  }
  if (button.offsetLeft < container.scrollLeft) {
    container.scrollTo({ left: button.offsetLeft });
  }
}

/**
 * Measures the active button and keeps the measure fresh as fonts load or the layout
 * resizes. On a track narrower than its options, the active one is scrolled into view.
 */
export function useActiveIndicator<TValue>(
  value: TValue,
  containerRef: RefObject<HTMLElement | null>,
  buttonRefs: RefObject<Map<TValue, HTMLElement>>,
) {
  const [indicator, setIndicator] = useState<IndicatorBox | null>(null);

  useLayoutEffect(() => {
    let measured: IndicatorBox | null = null;
    const measure = (glides: boolean) => {
      const button = buttonRefs.current.get(value);
      if (!button) {
        return;
      }
      if (containerRef.current) {
        revealInside(containerRef.current, button);
      }
      const box = { left: button.offsetLeft, width: button.offsetWidth, glides };
      // The observer also reports when nothing moved (on start, or the track's own resize):
      // keeping the last box then leaves a glide that just began running.
      if (measured !== null && measured.left === box.left && measured.width === box.width) {
        return;
      }
      measured = box;
      setIndicator(box);
    };
    measure(true);
    // A new choice glides; a layout change (a count that appeared, fonts, a resize) lands at once.
    // A count arriving beside the previous tab used to leave the pill under it for 400 ms.
    const observer = new ResizeObserver(() => measure(false));
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [value, containerRef, buttonRefs]);

  return indicator;
}
