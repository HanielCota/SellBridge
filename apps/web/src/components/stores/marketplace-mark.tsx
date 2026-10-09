import { FlaskIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { ReactNode } from "react";
import {
  MERCADO_LIVRE_PATH,
  MERCADO_LIVRE_TRANSFORM,
  MERCADO_LIVRE_VIEWBOX,
  SHOPEE_PATH,
  TIKTOK_PATH,
} from "./marketplace-logo-paths";

function MercadoLivreLogo() {
  return (
    <svg viewBox={MERCADO_LIVRE_VIEWBOX} className="h-[58%] w-auto" aria-hidden="true">
      <path d={MERCADO_LIVRE_PATH} transform={MERCADO_LIVRE_TRANSFORM} fill="#2d3277" />
    </svg>
  );
}

function ShopeeLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[52%]" aria-hidden="true">
      <path d={SHOPEE_PATH} fill="#ffffff" />
    </svg>
  );
}

/** TikTok's note with its cyan and red offsets, like the original mark. */
function TikTokLogo() {
  return (
    <svg viewBox="-1 -1 26 26" className="size-[54%]" aria-hidden="true">
      <path d={TIKTOK_PATH} fill="#25f4ee" transform="translate(-0.7,-0.7)" />
      <path d={TIKTOK_PATH} fill="#fe2c55" transform="translate(0.7,0.7)" />
      <path d={TIKTOK_PATH} fill="#ffffff" />
    </svg>
  );
}

const MARKS: Record<string, { logo: ReactNode; className: string }> = {
  // The wordmark needs width to stay legible, so its badge is a wide pill.
  mercado_livre: { logo: <MercadoLivreLogo />, className: "w-auto! bg-[#ffe600] px-[0.55em]" },
  shopee: { logo: <ShopeeLogo />, className: "bg-[#ee4d2d]" },
  tiktok_shop: { logo: <TikTokLogo />, className: "bg-black ring-1 ring-white/10" },
};

/** The marketplace's logo on its brand color, so stores are told apart at a glance. */
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
        "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl",
        mark?.className ?? "bg-brand/15 text-brand",
        className,
      )}
    >
      {mark ? mark.logo : <FlaskIcon className="size-[45%]" />}
    </span>
  );
}
