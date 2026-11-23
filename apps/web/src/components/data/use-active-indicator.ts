import { type RefObject, useLayoutEffect, useState } from "react";

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

/**
 * Where a narrow track (a phone) scrolls to show the active option, or null to stay put. Only a
 * new choice, or the first measure, moves it: a layout change (a badge, fonts, a resize) must not
 * pull back a track the person scrolled, or a tap on a far option lands on another one.
 */
export function revealScrollLeft(
  track: TrackView,
  option: OptionBox,
  isNewChoice: boolean,
): number | null {
  if (!isNewChoice) {
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

  useLayoutEffect(() => {
    let measured: IndicatorBox | null = null;
    const measure = (glides: boolean) => {
      const button = buttonRefs.current.get(value);
      if (!button) {
        return;
      }
      const container = containerRef.current;
      const left = container === null ? null : revealScrollLeft(container, button, glides);
      if (container !== null && left !== null) {
        container.scrollTo({ left });
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
