import { describe, expect, it } from "vitest";
import { lookUpEachCodeOnce } from "./carrier-lookups";

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("lookUpEachCodeOnce", () => {
  it("reads a code shared by several parcels only once", async () => {
    const calls: string[] = [];
    const results = await lookUpEachCodeOnce(
      [{ code: "AA1" }, { code: "BB2" }, { code: "AA1" }],
      async (request) => {
        calls.push(request.code);
        return `read ${request.code}`;
      },
    );
    expect(calls).toEqual(["AA1", "BB2"]);
    expect(results.get("AA1")).toBe("read AA1");
    expect(results.get("BB2")).toBe("read BB2");
  });

  it("keeps at most the given number of carrier reads in flight", async () => {
    let inFlight = 0;
    let mostInFlight = 0;
    const requests = Array.from({ length: 12 }, (_, index) => ({ code: `CODE${index}` }));
    const results = await lookUpEachCodeOnce(
      requests,
      async (request) => {
        inFlight += 1;
        mostInFlight = Math.max(mostInFlight, inFlight);
        await nextTick();
        inFlight -= 1;
        return request.code;
      },
      3,
    );
    expect(mostInFlight).toBe(3);
    expect(results.size).toBe(12);
  });

  it("answers an empty list without calling the carrier", async () => {
    const results = await lookUpEachCodeOnce([], async () => {
      throw new Error("must not be called");
    });
    expect(results.size).toBe(0);
  });
});
