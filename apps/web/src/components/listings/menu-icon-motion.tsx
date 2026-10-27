import { PlayIcon, TagIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useRef, type ReactNode, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/rewind";

/**
 * Plays a short motion on an icon, starting over from rest if one is still running, so moving
 * quickly between items never stacks animations. Skipped when the system asks for less motion.
 */
function play(element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  if (!element || prefersReducedMotion()) {
    return;
  }
  for (const running of element.getAnimations()) {
    running.cancel();
  }
  element.animate(keyframes, options);
}

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** A menu icon that moves once when its item is highlighted; `onHighlight` goes on the item. */
export interface MenuIconMotion {
  icon: ReactNode;
  onHighlight: () => void;
}

/** The price tag swings from its hole, like a tag hanging from a product. */
export function useTagMotion(): MenuIconMotion {
  const ref = useRef<SVGSVGElement>(null);
  return {
    icon: (
      <TagIcon
        ref={ref}
        weight="duotone"
        aria-hidden="true"
        style={{ transformOrigin: "28% 28%" }}
      />
    ),
    onHighlight: () =>
      play(
        ref.current,
        [
          { rotate: "0deg" },
          { rotate: "-14deg" },
          { rotate: "8deg" },
          { rotate: "-3deg" },
          { rotate: "0deg" },
        ],
        { duration: 650, easing: EASE_OUT },
      ),
  };
}

function PauseBars({ barRefs }: { barRefs: RefObject<SVGRectElement | null>[] }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-4">
      {[3.5, 9.5].map((left, index) => (
        <rect
          key={left}
          ref={barRefs[index]}
          x={left}
          y={2.5}
          width={3}
          height={11}
          rx={1.25}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      ))}
    </svg>
  );
}

/** The two bars dip one after the other, the motion of something coming to a stop. */
export function usePauseMotion(): MenuIconMotion {
  const firstBar = useRef<SVGRectElement>(null);
  const secondBar = useRef<SVGRectElement>(null);
  const dip = [{ scale: "1 1" }, { scale: "1 0.55" }, { scale: "1 1" }];
  return {
    icon: <PauseBars barRefs={[firstBar, secondBar]} />,
    onHighlight: () => {
      play(firstBar.current, dip, { duration: 420, easing: EASE_OUT });
      play(secondBar.current, dip, { duration: 420, delay: 90, easing: EASE_OUT });
    },
  };
}

/** The play triangle nudges forward, as if about to start. */
export function usePlayMotion(): MenuIconMotion {
  const ref = useRef<SVGSVGElement>(null);
  return {
    icon: <PlayIcon ref={ref} weight="duotone" aria-hidden="true" />,
    onHighlight: () =>
      play(ref.current, [{ translate: "0 0" }, { translate: "3px 0" }, { translate: "0 0" }], {
        duration: 380,
        easing: EASE_OUT,
      }),
  };
}

/** Any duotone icon that plays `keyframes` once when its item is highlighted. */
export function useIconMotion(
  Icon: PhosphorIcon,
  keyframes: Keyframe[],
  transformOrigin = "center",
): MenuIconMotion {
  const ref = useRef<SVGSVGElement>(null);
  return {
    icon: <Icon ref={ref} weight="duotone" aria-hidden="true" style={{ transformOrigin }} />,
    onHighlight: () => play(ref.current, keyframes, { duration: 520, easing: EASE_OUT }),
  };
}
