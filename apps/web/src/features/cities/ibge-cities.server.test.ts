import { describe, expect, it, vi } from "vitest";
import { createCitiesLookup, type FetchCities } from "./ibge-cities.server";

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createCitiesLookup", () => {
  it("returns the city names and asks IBGE only once per state", async () => {
    const fetchCities = vi.fn<FetchCities>(async () =>
      jsonReply([
        { id: 1302603, nome: "Manaus" },
        { id: 1303403, nome: "Parintins" },
      ]),
    );
    const lookup = createCitiesLookup(fetchCities);

    expect(await lookup("AM")).toEqual([
      { name: "Manaus", ibgeCode: "1302603" },
      { name: "Parintins", ibgeCode: "1303403" },
    ]);
    expect(await lookup("AM")).toEqual([
      { name: "Manaus", ibgeCode: "1302603" },
      { name: "Parintins", ibgeCode: "1303403" },
    ]);
    expect(fetchCities).toHaveBeenCalledTimes(1);
    expect(fetchCities.mock.calls[0]?.[0]).toContain("/estados/AM/municipios");
  });

  it("tries again after a transient failure", async () => {
    const fetchCities = vi
      .fn<FetchCities>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(jsonReply([{ id: 1400100, nome: "Boa Vista" }]));
    const lookup = createCitiesLookup(fetchCities);

    expect(await lookup("RR")).toEqual([{ name: "Boa Vista", ibgeCode: "1400100" }]);
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

describe("city cache freshness", () => {
  it("coalesces concurrent requests and refreshes successful results after a day", async () => {
    let now = 0;
    const fetchCities = vi.fn<FetchCities>(async () =>
      jsonReply([{ id: 1302603, nome: "Manaus" }]),
    );
    const lookup = createCitiesLookup(fetchCities, () => now);
    expect(await Promise.all([lookup("AM"), lookup("AM")])).toEqual([
      [{ name: "Manaus", ibgeCode: "1302603" }],
      [{ name: "Manaus", ibgeCode: "1302603" }],
    ]);
    expect(fetchCities).toHaveBeenCalledTimes(1);
    now = 24 * 60 * 60_000;
    await lookup("AM");
    expect(fetchCities).toHaveBeenCalledTimes(2);
  });

  it("retries an empty fallback after its short cooldown", async () => {
    let now = 0;
    const fetchCities = vi
      .fn<FetchCities>()
      .mockResolvedValueOnce(jsonReply({ unexpected: true }))
      .mockImplementation(async () => jsonReply([{ id: 1600303, nome: "Macapá" }]));
    const lookup = createCitiesLookup(fetchCities, () => now);
    expect(await lookup("AP")).toEqual([]);
    expect(await lookup("AP")).toEqual([]);
    expect(fetchCities).toHaveBeenCalledTimes(1);
    now = 30_000;
    expect(await lookup("AP")).toEqual([{ name: "Macapá", ibgeCode: "1600303" }]);
  });
});

describe("IBGE city codes", () => {
  it("keeps each city's IBGE code with its name", async () => {
    const fetchCities = vi.fn<FetchCities>(async () =>
      jsonReply([{ id: 3122306, nome: "Divinópolis" }]),
    );

    expect(await createCitiesLookup(fetchCities)("MG")).toEqual([
      { name: "Divinópolis", ibgeCode: "3122306" },
    ]);
  });

  it("reads a reply without valid IBGE codes as no suggestions", async () => {
    const fetchCities = vi.fn<FetchCities>(async () => jsonReply([{ nome: "Divinópolis" }]));

    expect(await createCitiesLookup(fetchCities)("MG")).toEqual([]);
  });
});
