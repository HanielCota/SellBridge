import { type RefObject, useLayoutEffect, useState } from "react";

export interface IndicatorBox {
  left: number;
  width: number;
}

/**
 * Measures the active button and keeps the measure fresh as fonts load or the layout
 * resizes.
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
