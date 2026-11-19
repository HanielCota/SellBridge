import { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { channelDispatch } from "./channel-dispatch";

const parcel = {
  marketplace: "mercado_livre",
  carrier: null,
  trackingCode: null,
  dispatched: false,
  labelFromChannel: true,
};

describe("channelDispatch", () => {
  it("lets a Mercado Livre parcel ship with the channel's code when the channel named no carrier", () => {
    const dispatch = channelDispatch({ ...parcel, trackingCode: "45071234567" });

    const update = shipmentUpdateSchema.safeParse({
      shipmentId: "36e45c9e-8db0-4c67-b889-6c2fc1c19087",
      status: "shipped",
      carrier: dispatch.carrier ?? "",
      trackingCode: "45071234567",
    });

    expect(dispatch.trackingFromChannel).toBe("do Mercado Livre");
    expect(dispatch.carrier).toBe("Envio do Mercado Livre");
    expect(update.success).toBe(true);
  });

  it("keeps the carrier the channel named", () => {
    const dispatch = channelDispatch({ ...parcel, carrier: "Correios", trackingCode: "AA1BR" });

    expect(dispatch.carrier).toBe("Correios");
  });

  it("says where the code comes from while the channel has not sent it", () => {
    const dispatch = channelDispatch(parcel);

    expect(dispatch.trackingFromChannel).toBeNull();
    expect(dispatch.trackingHint).toContain("depois que você imprime a etiqueta do marketplace");
  });

  it("gives no hint when the supplier ships with its own label", () => {
    const dispatch = channelDispatch({ ...parcel, marketplace: "shopee", labelFromChannel: false });

    expect(dispatch.trackingHint).toBeNull();
    expect(dispatch.carrier).toBeNull();
  });

  it("leaves a dispatched parcel as it is", () => {
    const dispatch = channelDispatch({ ...parcel, dispatched: true, trackingCode: "AA1BR" });

    expect(dispatch).toEqual({ trackingFromChannel: null, carrier: null, trackingHint: null });
  });
});
