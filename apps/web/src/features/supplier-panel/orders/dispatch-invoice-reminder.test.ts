import { describe, expect, it } from "vitest";
import { dispatchInvoiceReminder } from "./dispatch-invoice-reminder";

describe("dispatchInvoiceReminder", () => {
  it("asks to wait for a note still on its way at the dispatch step", () => {
    const reminder = dispatchInvoiceReminder("ready", "sent");

    expect(reminder?.title).toBe("A nota fiscal ainda não saiu");
  });

  it("asks to fix a stopped note before dispatching", () => {
    const reminder = dispatchInvoiceReminder("ready", "attention");

    expect(reminder?.title).toBe("A nota fiscal deste pedido está com problema");
  });

  it("says nothing once the note is issued or cancelled", () => {
    expect(dispatchInvoiceReminder("ready", "authorized")).toBeNull();
    expect(dispatchInvoiceReminder("ready", "cancelled")).toBeNull();
  });

  it("says nothing when the supplier's ERP issues no note", () => {
    expect(dispatchInvoiceReminder("ready", null)).toBeNull();
  });

  it("says nothing before the dispatch step", () => {
    expect(dispatchInvoiceReminder("picking", "queued")).toBeNull();
  });
});
