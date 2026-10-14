import { type RefObject, useLayoutEffect, useState } from "react";

export interface IndicatorBox {
  left: number;
  width: number;
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
    const measure = () => {
      const button = buttonRefs.current.get(value);
      if (!button) {
        return;
      }
      setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
      if (containerRef.current) {
        revealInside(containerRef.current, button);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [value, containerRef, buttonRefs]);

  return indicator;
}
