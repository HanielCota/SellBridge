import { describe, expect, it } from "vitest";
import { isOutdatedPage, servedBuildId } from "./app-version";

describe("servedBuildId", () => {
  it("reads the build id the server answers", () => {
    expect(servedBuildId({ buildId: "384aa7cec5b7" })).toBe("384aa7cec5b7");
  });

  it("ignores an answer that is not a version (an error page or an empty body)", () => {
    expect(servedBuildId(null)).toBeNull();
    expect(servedBuildId("<html>502</html>")).toBeNull();
    expect(servedBuildId({})).toBeNull();
    expect(servedBuildId({ buildId: "" })).toBeNull();
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
