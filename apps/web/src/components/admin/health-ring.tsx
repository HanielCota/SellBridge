import { healthLevel, type HealthLevel } from "@sellbridge/shared/customer-health";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LEVEL_STROKE: Record<HealthLevel, string> = {
  healthy: "text-emerald-500",
  attention: "text-amber-500",
  critical: "text-destructive",
};

const SIZES = {
  sm: { box: "size-9", text: "text-caption" },
  md: { box: "size-11", text: "text-footnote" },
  lg: { box: "size-14", text: "text-subhead" },
} as const;

type RingSize = keyof typeof SIZES;

/** True one frame after mount, so the ring draws in from empty instead of appearing full. */
function useDrawnIn(): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return drawn;
}

function BlockedRing({ size, className }: { size: RingSize; className?: string | undefined }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        SIZES[size].box,
        className,
      )}
    >
      <LockSimpleIcon weight="duotone" className="size-[45%]" aria-hidden="true" />
      <span className="sr-only">Conta bloqueada, sem nota</span>
    </span>
  );
}

/**
 * A customer's health as a ring that fills up to the score. It draws in from empty the first
 * time and, because the circle stays mounted, glides from the old score to the new one when a
 * problem is solved. A blocked account shows a lock instead: it has no score.
 */
export function HealthRing({
  score,
  size = "md",
  className,
}: {
  score: number | null;
  size?: RingSize;
  className?: string;
}) {
  const drawn = useDrawnIn();
  if (score === null) {
    return <BlockedRing size={size} className={className} />;
  }
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        SIZES[size].box,
        className,
      )}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - (drawn ? score : 0)}
          className={cn(
            "stroke-current transition-[stroke-dashoffset,color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            LEVEL_STROKE[healthLevel(score)],
          )}
        />
      </svg>
      <span aria-hidden="true" className={cn("font-semibold tabular-nums", SIZES[size].text)}>
        {score}
      </span>
      <span className="sr-only">Nota de saúde {score} de 100</span>
    </span>
  );
}
