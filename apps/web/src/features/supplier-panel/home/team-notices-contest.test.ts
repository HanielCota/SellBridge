import { findSupportTopic } from "@sellbridge/shared/support-topics";
import { newTicketSearchSchema } from "@sellbridge/shared/schemas";
import { SUPPLIER_FLAG_REASONS } from "@sellbridge/shared/supplier-flags";
import { describe, expect, it } from "vitest";
import { contestTicketSearch, offAccountReviewSearch } from "./team-notices-contest";

const CREATED_AT = new Date("2026-10-23T15:00:00.000Z");

describe("contestTicketSearch", () => {
  it("opens a supplier ticket on a topic the supplier panel offers", () => {
    const search = contestTicketSearch({ reason: "order_error", createdAt: CREATED_AT });
    expect(findSupportTopic("supplier", search.categoria ?? "order")?.label).toBe("Outra coisa");
  });

  it("names the flag and its date in the subject and the started text", () => {
    const search = contestTicketSearch({ reason: "order_error", createdAt: CREATED_AT });
    expect(search.assunto).toBe("Contestar flag: Erro em pedido");
    expect(search.texto).toBe('Quero contestar a flag "Erro em pedido" de 23/10/2026. Motivo: ');
  });

  it("builds a link the new-ticket page accepts for every reason", () => {
    for (const reason of SUPPLIER_FLAG_REASONS) {
      const search = contestTicketSearch({ reason, createdAt: CREATED_AT });
      expect(newTicketSearchSchema.parse(search)).toEqual(search);
    }
  });
});

describe("offAccountReviewSearch", () => {
  it("asks for a review of the switched-off account in a link the page accepts", () => {
    const search = offAccountReviewSearch();
    expect(search.assunto).toBe("Revisão da conta desligada");
    expect(newTicketSearchSchema.parse(search)).toEqual(search);
  });
});
