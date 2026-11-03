import { type RefObject, useLayoutEffect, useState } from "react";

/** Which sides of a sideways scroller still hide content. */
export interface ScrollEdges {
  readonly start: boolean;
  readonly end: boolean;
}

const NO_HIDDEN_CONTENT: ScrollEdges = { start: false, end: false };

/** Browsers report fractional scroll positions: this much past an edge still counts as at it. */
const ROUNDING_PIXELS = 1;

/** Whether content hides past each side. */
export function hiddenEdgesOf(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  return {
    start: scrollLeft > ROUNDING_PIXELS,
    end: scrollLeft + clientWidth < scrollWidth - ROUNDING_PIXELS,
  } satisfies ScrollEdges;
}

/** The fade on each side that still hides content: a cut tab alone did not say "more here". */
export function scrollEdgeMask({ start, end }: ScrollEdges): string | undefined {
  if (start && end) {
    return "linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent)";
  }
  if (end) {
    return "linear-gradient(to right, black calc(100% - 2rem), transparent)";
  }
  if (start) {
    return "linear-gradient(to right, transparent, black 2rem)";
  }
  return undefined;
}

/** Tracks which sides of a sideways scroller hide content, as it scrolls or resizes. */
export function useScrollEdges(scrollerRef: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(NO_HIDDEN_CONTENT);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const measure = () => {
      if (scroller === null) {
        return;
      }
      const next = hiddenEdgesOf(scroller.scrollLeft, scroller.clientWidth, scroller.scrollWidth);
      setEdges((previous) =>
        previous.start === next.start && previous.end === next.end ? previous : next,
      );
    };
    // The observer reports once on start, so the first measure needs no separate call. The
    // children too: a count that loads later widens a tab, not the track already at full width.
    const observer = new ResizeObserver(measure);
    if (scroller !== null) {
      observer.observe(scroller);
      for (const child of scroller.children) {
        observer.observe(child);
      }
      scroller.addEventListener("scroll", measure, { passive: true });
    }
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", measure);
    };
  }, [scrollerRef]);

  return edges;
}
