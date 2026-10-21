import { useCallback, useState } from "react";

/** The element's width, kept current as it resizes; 0 before the first measure. */
export function useElementWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return () => {};
    }
    // Measured right away too: the observer only reports on the next rendered frame.
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
