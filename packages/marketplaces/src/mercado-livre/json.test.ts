import { describe, expect, it } from "vitest";
import { parseMercadoLivreJson } from "./json.ts";
import { externalIdSchema, notificationSchema } from "./schemas.ts";

describe("parseMercadoLivreJson", () => {
  // Regression: past 2^53 JSON.parse rounded the id and the schema refused it, so every order
  // import would stop the day Mercado Livre ids grow that far.
  it("keeps an integer past 2^53 exact, as its digits", () => {
    expect(parseMercadoLivreJson('{"id":9007199254740993}')).toEqual({ id: "9007199254740993" });
    expect(parseMercadoLivreJson('{"id":-9007199254740993}')).toEqual({ id: "-9007199254740993" });
  });

  it("leaves safe integers, decimals and exponents as numbers", () => {
    expect(parseMercadoLivreJson('{"id":9007199254740991,"price":59.9,"big":1e21}')).toEqual({
      id: 9_007_199_254_740_991,
      price: 59.9,
      big: 1e21,
    });
  });

  it("returns null for text that is not JSON", () => {
    expect(parseMercadoLivreJson("not json")).toBeNull();
  });

  it("lets a notification of a seller past 2^53 through with its exact id", () => {
    const body = parseMercadoLivreJson(
      '{"_id":"e","resource":"/orders/9007199254740993","user_id":9007199254740993,"topic":"orders_v2","application_id":1}',
    );
    const parsed = notificationSchema.parse(body);
    expect(String(parsed.user_id)).toBe("9007199254740993");
  });
});

describe("externalIdSchema", () => {
  it.each(["9007199254740993", "1"])("accepts the digits %s", (id) => {
    expect(externalIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(["", "abc", "12a", "1".repeat(21), "-1"])("refuses the text %j", (id) => {
    expect(externalIdSchema.safeParse(id).success).toBe(false);
  });
});
