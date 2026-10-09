import { FlaskIcon } from "@phosphor-icons/react";
import { cn } from "cn";

/** Monogram tiles in each marketplace's color, so stores are told apart at a glance. */
const MARKS: Record<string, { text: string; className: string }> = {
  mercado_livre: { text: "ML", className: "bg-[#ffe600] text-[#2d3277]" },
  shopee: { text: "S", className: "bg-[#ee4d2d] text-white" },
  tiktok_shop: { text: "TT", className: "bg-[#111111] text-white ring-1 ring-white/15" },
};

export function MarketplaceMark({
  marketplace,
  className,
}: {
  marketplace: string;
  className?: string;
}) {
  const mark = MARKS[marketplace];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold tracking-[-0.02em]",
        mark?.className ?? "bg-brand/15 text-brand",
        className,
      )}
    >
      {mark ? mark.text : <FlaskIcon className="size-5" />}
    </span>
  );
}
