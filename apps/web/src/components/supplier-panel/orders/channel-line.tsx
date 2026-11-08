import { channelLabel } from "@/features/supplier-panel/orders/channel-labels";
import { shippingMethod } from "@/features/supplier-panel/orders/shipping-methods";

/** Each channel in its own colors, so the supplier tells them apart at a glance. */
const CHANNEL_COLORS: Readonly<Record<string, string>> = {
  mercado_livre: "bg-[#ffe600] text-[#2d3277]",
  // A deeper orange than the brand's keeps white text readable (WCAG AA, 4.5:1).
  shopee: "bg-[#c4381c] text-white",
  tiktok_shop: "bg-black text-white dark:bg-white dark:text-black",
};

/** "Mercado Livre · Coleta": where the sale came from and how the parcel leaves. */
export function ChannelLine({
  marketplace,
  logisticType,
}: {
  marketplace: string;
  logisticType: string | null;
}) {
  const method = shippingMethod(logisticType);
  const colors = CHANNEL_COLORS[marketplace] ?? "bg-muted text-foreground";
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-footnote font-medium">
      <span
        className={`rounded-full px-2 py-px text-caption font-semibold whitespace-nowrap ${colors}`}
      >
        {channelLabel(marketplace)}
      </span>
      {method === null ? null : <span>{method.short}</span>}
    </p>
  );
}
