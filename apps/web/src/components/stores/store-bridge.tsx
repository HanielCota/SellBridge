import { CheckIcon } from "@phosphor-icons/react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { useEffect, useRef } from "react";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { prefersReducedMotion, rewind } from "@/lib/rewind";

export type StoreBridgeStatus = "idle" | "authorizing" | "connected" | "failed";

/** How long the lit arc takes to pull back when the link fails; matches the shake in the CSS. */
export const BRIDGE_REWIND_MS = 320;

/** Same curve for the drawn arc and the pulse that rides it, in the 184×56 box below. */
const ARC_PATH = "M62 22 Q92 -12 122 22";

/**
 * SellBridge and the marketplace joined by an arc, the bridge in the name. A pulse crosses it
 * while idle; while authorizing a lit copy of the arc draws across it over `--link-duration`,
 * and once connected the two marks latch and the check pops in. If it fails, the lit arc pulls
 * back from wherever it got to while the bridge shakes.
 */
export function StoreBridge({
  marketplace,
  status,
}: {
  marketplace: string;
  status: StoreBridgeStatus;
}) {
  const linkRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    if (status !== "failed" || !link) {
      return undefined;
    }
    const options = { duration: BRIDGE_REWIND_MS, easing: "cubic-bezier(0.4, 0, 1, 1)" };
    // With reduced motion the lit arc only faded in, so it only fades out.
    const animation = prefersReducedMotion()
      ? rewind(link, "opacity", "0", options)
      : rewind(link, "strokeDashoffset", "1", options);
    return () => animation.cancel();
  }, [status]);

  return (
    <div
      data-status={status}
      className="store-bridge relative mx-auto flex h-14 w-46 items-center justify-between"
      aria-hidden="true"
    >
      <svg viewBox="0 0 184 56" className="absolute inset-0 size-full overflow-visible">
        <path d={ARC_PATH} pathLength={1} className="store-bridge-arc" />
        <path ref={linkRef} d={ARC_PATH} pathLength={1} className="store-bridge-link" />
      </svg>
      <span
        className="store-bridge-pulse absolute top-0 left-0 size-1.5 rounded-full bg-brand"
        style={{ offsetPath: `path("${ARC_PATH}")` }}
      />
      <span className="store-bridge-tile flex size-14 items-center justify-center rounded-2xl bg-muted">
        <BrandIcon className="size-7" />
      </span>
      <span className="store-bridge-tile relative" data-side="end">
        <MarketplaceMark marketplace={marketplace} className="size-14 rounded-2xl" />
        <span className="store-bridge-check absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-ink ring-2 ring-card">
          <CheckIcon weight="bold" className="size-3" />
        </span>
      </span>
    </div>
  );
}
