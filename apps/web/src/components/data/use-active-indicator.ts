import { type RefObject, useLayoutEffect, useRef, useState } from "react";

export interface IndicatorBox {
  left: number;
  width: number;
  /** True when a new choice moved it; a layout change (a badge, fonts, a resize) does not. */
  glides: boolean;
}

interface TrackView {
  scrollLeft: number;
  clientWidth: number;
}

interface OptionBox {
  offsetLeft: number;
  offsetWidth: number;
}

type MeasureReason = "initial" | "selection" | "layout";

/**
 * Where a narrow track scrolls to show the active option. The first measure reveals the active
 * option only at the initial scroll position. A person can scroll the HTML before hydration,
 * and pulling the track back can move a button away just before they tap it.
 */
export function revealScrollLeft(
  track: TrackView,
  option: OptionBox,
  reason: MeasureReason,
): number | null {
  if (reason === "layout" || (reason === "initial" && track.scrollLeft !== 0)) {
    return null;
  }

  const right = option.offsetLeft + option.offsetWidth;
  if (right > track.scrollLeft + track.clientWidth) {
    return right - track.clientWidth;
  }

  if (option.offsetLeft < track.scrollLeft) {
    return option.offsetLeft;
  }

  return null;
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
  const previousChoice = useRef<{ value: TValue } | null>(null);

  useLayoutEffect(() => {
    const previous = previousChoice.current;
    const unchangedReason = previous === null ? "initial" : "layout";
    const effectReason =
      previous !== null && !Object.is(previous.value, value) ? "selection" : unchangedReason;
    previousChoice.current = { value };

    let measured: IndicatorBox | null = null;
    const measure = (reason: MeasureReason) => {
      const button = buttonRefs.current.get(value);

      if (!button) {
        return;
      }

      const container = containerRef.current;
      const left = container === null ? null : revealScrollLeft(container, button, reason);

      if (container !== null && left !== null) {
        container.scrollTo({ left });
      }

      const box = {
        left: button.offsetLeft,
        width: button.offsetWidth,
        glides: reason === "selection",
      };
      // The observer also reports when nothing moved (on start, or the track's own resize):
      // keeping the last box then leaves a glide that just began running.
      if (measured !== null && measured.left === box.left && measured.width === box.width) {
        return;
      }

      measured = box;
      setIndicator(box);
    };
    measure(effectReason);
    // A new choice glides; a layout change (a count that appeared, fonts, a resize) lands at once.
    // A count arriving beside the previous tab used to leave the pill under it for 400 ms.
    const observer = new ResizeObserver(() => measure("layout"));
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [value, containerRef, buttonRefs]);

  return indicator;
}
