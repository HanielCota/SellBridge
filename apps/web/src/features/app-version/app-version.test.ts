import { describe, expect, it } from "vitest";
import { isOutdatedPage, servedBuildId } from "./app-version";

describe("servedBuildId", () => {
  it("reads the build id the server answers", () => {
    expect(servedBuildId({ buildId: "384aa7cec5b7" })).toBe("384aa7cec5b7");
  });

  it.each([
    ["an empty body", null],
    ["a proxy error page", "<html>502</html>"],
    ["an object without a build id", {}],
    ["an empty build id", { buildId: "" }],
    ["a build id longer than a deploy makes", { buildId: "a".repeat(101) }],
  ])("ignores an answer that is not a version: %s", (_case, body) => {
    expect(servedBuildId(body)).toBeNull();
  });

  it("refuses a build id with characters a deploy never produces", () => {
    expect(servedBuildId({ buildId: "<script>" })).toBeNull();
  });
});

describe("isOutdatedPage", () => {
  it("is out of date once the server runs another build", () => {
    expect(isOutdatedPage("old-build", "new-build")).toBe(true);
  });

  it("stays quiet while the server runs the page's own build", () => {
    expect(isOutdatedPage("same-build", "same-build")).toBe(false);
  });

  it("stays quiet when the server answer could not be read", () => {
    expect(isOutdatedPage("old-build", null)).toBe(false);
  });
});
