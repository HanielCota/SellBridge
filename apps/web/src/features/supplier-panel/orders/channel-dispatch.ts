import { channelSource } from "./channel-labels";

/** What the channel already gives the dispatch form of a parcel still with the supplier. */
export interface ChannelDispatch {
  /** "do Mercado Livre" when the channel sent the tracking code; null otherwise. */
  trackingFromChannel: string | null;
  carrier: string | null;
  /** Where the code comes from while the channel has not sent it yet. */
  trackingHint: string | null;
}

/**
 * Fills the dispatch with what the channel sent. A marketplace may send the code without naming
 * the carrier: the parcel then travels on the channel's own label, so the channel is the carrier,
 * and the supplier does not have to type anything.
 */
export function channelDispatch(parcel: {
  marketplace: string;
  carrier: string | null;
  trackingCode: string | null;
  dispatched: boolean;
  /** The channel hands out the label (and with it the code) for this parcel. */
  labelFromChannel: boolean;
}): ChannelDispatch {
  if (parcel.dispatched) {
    return { trackingFromChannel: null, carrier: parcel.carrier, trackingHint: null };
  }
  const source = channelSource(parcel.marketplace);
  if (parcel.trackingCode !== null) {
    return {
      trackingFromChannel: source,
      carrier: parcel.carrier ?? `Envio ${source}`,
      trackingHint: null,
    };
  }
  if (!parcel.labelFromChannel) {
    return { trackingFromChannel: null, carrier: parcel.carrier, trackingHint: null };
  }
  return {
    trackingFromChannel: null,
    carrier: parcel.carrier,
    trackingHint: `O código chega ${source} depois que você imprime a etiqueta do marketplace. Se não aparecer aqui, copie o código que está na etiqueta.`,
  };
}
