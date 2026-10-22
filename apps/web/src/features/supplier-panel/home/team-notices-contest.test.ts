import { findSupportTopic } from "@sellbridge/shared/support-topics";
import { newTicketSearchSchema } from "@sellbridge/shared/schemas";
import { SUPPLIER_FLAG_REASONS } from "@sellbridge/shared/supplier-flags";
import { describe, expect, it } from "vitest";
import { contestTicketSearch } from "./team-notices-contest";

describe("contestTicketSearch", () => {
  it("opens a supplier ticket on a topic the supplier panel offers", () => {
    const search = contestTicketSearch(["order_error"]);
    expect(search.categoria).toBeDefined();
    expect(findSupportTopic("supplier", search.categoria ?? "order")?.label).toBe("Outra coisa");
  });

  it("names the flag when there is only one, and stays generic for several", () => {
    expect(contestTicketSearch(["order_error"]).assunto).toBe("Discordo do aviso: Erro em pedido");
    expect(contestTicketSearch(["order_error", "slow_support"]).assunto).toBe(
      "Discordo de um aviso da equipe",
    );
  });

  it("builds a subject the new-ticket page accepts for every reason", () => {
    for (const reason of SUPPLIER_FLAG_REASONS) {
      const search = contestTicketSearch([reason]);
      expect(newTicketSearchSchema.parse(search)).toEqual(search);
    }
  });
});
