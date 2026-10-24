import { describe, expect, it, vi } from "vitest";
import { createCitiesLookup, type FetchCities } from "./ibge-cities.server";

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createCitiesLookup", () => {
  it("returns the city names and asks IBGE only once per state", async () => {
    const fetchCities = vi.fn<FetchCities>(async () =>
      jsonReply([{ nome: "Manaus" }, { nome: "Parintins" }]),
    );
    const lookup = createCitiesLookup(fetchCities);

    expect(await lookup("AM")).toEqual(["Manaus", "Parintins"]);
    expect(await lookup("AM")).toEqual(["Manaus", "Parintins"]);
    expect(fetchCities).toHaveBeenCalledTimes(1);
    expect(fetchCities.mock.calls[0]?.[0]).toContain("/estados/AM/municipios");
  });

  it("tries again after a transient failure", async () => {
    const fetchCities = vi
      .fn<FetchCities>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(jsonReply([{ nome: "Boa Vista" }]));
    const lookup = createCitiesLookup(fetchCities);

    expect(await lookup("RR")).toEqual(["Boa Vista"]);
    expect(fetchCities).toHaveBeenCalledTimes(2);
  });

  it("gives no suggestions when IBGE stays down, so the city is typed by hand", async () => {
    const fetchCities = vi.fn<FetchCities>(async () => jsonReply({}, 503));
    const lookup = createCitiesLookup(fetchCities);

    expect(await lookup("AC")).toEqual([]);
    expect(fetchCities).toHaveBeenCalledTimes(2);
  });

  it("gives no suggestions for a reply in another shape", async () => {
    const fetchCities = vi.fn<FetchCities>(async () => jsonReply({ erro: true }));
    const lookup = createCitiesLookup(fetchCities);

    expect(await lookup("AP")).toEqual([]);
    expect(fetchCities).toHaveBeenCalledTimes(1);
  });
});
