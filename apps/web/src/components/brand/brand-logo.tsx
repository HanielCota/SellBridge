import { cn } from "cn";
import { BRIDGE_PATH, SELL_PATH, WORDMARK_VIEW_BOX } from "./brand-wordmark";

export const BRAND_TAGLINE = "A ponte entre quem vende e quem fornece.";

/** Vector master shared by the website and the exported brand assets. */
export function BrandIcon({ className }: { className?: string | undefined }) {
  return (
    <img
      src="/brand/sellbridge-symbol.svg"
      alt=""
      aria-hidden="true"
      width={160}
      height={160}
      className={cn("size-8 shrink-0", className)}
    />
  );
}

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  accentClassName?: string;
  layout?: "horizontal" | "stacked";
}

/** Outlined Inter lettering stays identical at every size, even before fonts load. */
export function BrandLogo({
  className,
  iconClassName,
  wordmarkClassName,
  accentClassName = "text-brand-wordmark",
  layout = "horizontal",
}: BrandLogoProps) {
  return (
    <span
      data-slot="brand-logo"
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5",
        layout === "stacked" && "flex-col gap-3",
        className,
      )}
    >
      <span className="sr-only">SellBridge</span>
      <BrandIcon className={iconClassName} />
      <svg
        viewBox={WORDMARK_VIEW_BOX}
        aria-hidden="true"
        focusable="false"
        className={cn("h-[1em]! w-auto! shrink-0", wordmarkClassName)}
      >
        <path d={SELL_PATH} fill="currentColor" />
        <path d={BRIDGE_PATH} fill="currentColor" className={accentClassName} />
      </svg>
    </span>
  );
}
