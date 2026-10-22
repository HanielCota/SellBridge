import { CONTACT_DETAILS_REFUSED, shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { blockedContactFields } from "./blocked-contact";

/** The error TanStack Start throws for invalid input: the issue list as JSON. */
function inputError(issues: unknown): Error {
  return new Error(JSON.stringify(issues));
}

const update = {
  shipmentId: "36e45c9e-8db0-4c67-b889-6c2fc1c19087",
  status: "accepted",
  note: "Me chama no 11 98765-4321",
  carrier: "",
  trackingCode: "",
  trackingUrl: "",
};

describe("blockedContactFields", () => {
  it("names the refused field and the kind of contact, never the text", () => {
    const parsed = shipmentUpdateSchema.safeParse(update);
    const error = inputError(parsed.error?.issues);
    expect(blockedContactFields(error, update)).toEqual([{ field: "note", kinds: ["phone"] }]);
  });

  it("follows the path into a nested input (the supplier link and panel wrap the update)", () => {
    const input = { token: "a".repeat(64), update: { ...update, note: "fulano@gmail.com" } };
    const error = inputError([{ message: CONTACT_DETAILS_REFUSED, path: ["update", "note"] }]);
    expect(blockedContactFields(error, input)).toEqual([
      { field: "update.note", kinds: ["email"] },
    ]);
  });

  it("calls a refused tracking link a link", () => {
    const input = { ...update, note: "", trackingUrl: "https://wa.me/5511987654321" };
    const error = inputError([
      { message: CONTACT_DETAILS_REFUSED, path: [{ key: "trackingUrl" }] },
    ]);
    expect(blockedContactFields(error, input)).toEqual([
      { field: "trackingUrl", kinds: ["phone", "link"] },
    ]);
  });

  it("ignores every other error", () => {
    expect(blockedContactFields(new Error("boom"), update)).toEqual([]);
    expect(blockedContactFields("not an error", update)).toEqual([]);
    const other = inputError([{ message: "Informe o motivo do cancelamento", path: ["note"] }]);
    expect(blockedContactFields(other, update)).toEqual([]);
  });
});
