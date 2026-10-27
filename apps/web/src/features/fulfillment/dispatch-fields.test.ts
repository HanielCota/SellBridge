import { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { dispatchFieldsFor } from "./dispatch-fields";

const typed = { carrier: "Correios", trackingCode: "AA123456789BR", trackingUrl: "" };

/** A code saved before the tracking code rule existed: it fails the schema today. */
const stored = { carrier: "Transportadora", trackingCode: "OS/12345_67", trackingUrl: "" };

const shipmentId = "36e45c9e-8db0-4c67-b889-6c2fc1c19087";

/** The update a shipped parcel's form sends, with the stored values in its fields. */
function update(status: "shipped" | "delivered", note: string) {
  return shipmentUpdateSchema.safeParse({
    shipmentId,
    status,
    note,
    ...dispatchFieldsFor("shipped", status, stored),
  });
}

describe("dispatchFieldsFor", () => {
  it("sends carrier and tracking with the dispatch", () => {
    expect(dispatchFieldsFor("ready", "shipped", typed)).toEqual(typed);
  });

  it("leaves them out of every step after the parcel left, so the server keeps what it stored", () => {
    expect(dispatchFieldsFor("shipped", "shipped", typed)).toEqual({
      carrier: "",
      trackingCode: "",
      trackingUrl: "",
    });
    expect(dispatchFieldsFor("shipped", "delivered", typed).trackingCode).toBe("");
    expect(dispatchFieldsFor("accepted", "cancelled", typed).carrier).toBe("");
  });

  it("lets a parcel with an old tracking code move on and take occurrences", () => {
    expect(update("delivered", "").success).toBe(true);
    expect(update("shipped", "Saiu para entrega").success).toBe(true);
  });
});
