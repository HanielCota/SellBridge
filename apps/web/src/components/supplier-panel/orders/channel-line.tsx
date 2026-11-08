import { MARKETPLACE_COLORS } from "@/components/stores/marketplace-colors";
import { channelLabel } from "@/features/supplier-panel/orders/channel-labels";
import { shippingMethod } from "@/features/supplier-panel/orders/shipping-methods";

/** "Mercado Livre · Coleta": where the sale came from and how the parcel leaves. */
export function ChannelLine({
  marketplace,
  logisticType,
}: {
  marketplace: string;
  logisticType: string | null;
}) {
  const method = shippingMethod(logisticType);
  const colors = MARKETPLACE_COLORS[marketplace]?.badge ?? "bg-muted text-foreground";
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
