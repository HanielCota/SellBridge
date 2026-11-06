import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOutdatedPage,
  requestVersionCheck,
  servedBuild,
  VERSION_CHECK_REQUEST_EVENT,
} from "./app-version";

const PAGE = { buildId: "page-build", builtAt: "2026-11-05T12:00:00.000Z" };

describe("servedBuild", () => {
  it("reads the build the server answers", () => {
    const body = { buildId: "384aa7cec5b7", builtAt: "2026-11-05T12:00:00.000Z" };

    expect(servedBuild(body)).toEqual(body);
  });

  it.each([
    ["an empty body", null],
    ["a proxy error page", "<html>502</html>"],
    ["an object without a build id", { builtAt: "2026-11-05T12:00:00.000Z" }],
    ["an empty build id", { buildId: "", builtAt: "2026-11-05T12:00:00.000Z" }],
    [
      "a build id longer than a deploy makes",
      { buildId: "a".repeat(101), builtAt: "2026-11-05T12:00:00.000Z" },
    ],
    ["a server from before the build time (no builtAt)", { buildId: "384aa7cec5b7" }],
    ["a build time that is not a date", { buildId: "384aa7cec5b7", builtAt: "ontem" }],
  ])("ignores an answer that is not a version: %s", (_case, body) => {
    expect(servedBuild(body)).toBeNull();
  });

  it("refuses a build id with characters a deploy never produces", () => {
    expect(servedBuild({ buildId: "<script>", builtAt: "2026-11-05T12:00:00.000Z" })).toBeNull();
  });
});

describe("isOutdatedPage", () => {
  it("is out of date once the server runs a newer build", () => {
    const served = { buildId: "new-build", builtAt: "2026-11-05T13:00:00.000Z" };

    expect(isOutdatedPage(PAGE, served)).toBe(true);
  });

  it("stays quiet when a rolling deploy answers from the older server", () => {
    const served = { buildId: "old-build", builtAt: "2026-11-05T11:00:00.000Z" };

    expect(isOutdatedPage(PAGE, served)).toBe(false);
  });

  it("stays quiet while the server runs the page's own build", () => {
    expect(isOutdatedPage(PAGE, { ...PAGE })).toBe(false);
  });

  it("stays quiet when the server answer could not be read", () => {
    expect(isOutdatedPage(PAGE, null)).toBe(false);
  });
});

describe("requestVersionCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing during a server render, where there is no page", () => {
    expect(typeof window).toBe("undefined");

    expect(() => requestVersionCheck()).not.toThrow();
  });

  it("asks the open page to check the server's build", () => {
    const page = new EventTarget();
    const listener = vi.fn<() => void>();
    page.addEventListener(VERSION_CHECK_REQUEST_EVENT, listener);
    vi.stubGlobal("window", page);

    requestVersionCheck();

    expect(listener).toHaveBeenCalledOnce();
  });
});
