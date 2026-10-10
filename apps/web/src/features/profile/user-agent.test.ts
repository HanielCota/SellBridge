import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it("recognizes Chrome on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
    expect(describeUserAgent(ua)).toEqual({ browser: "Chrome", os: "Windows", isMobile: false });
  });

  it("prefers Edge over Chrome", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0";
    expect(describeUserAgent(ua).browser).toBe("Edge");
  });

  it("recognizes Safari on iPhone as mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(ua)).toEqual({ browser: "Safari", os: "iOS", isMobile: true });
  });

  it("recognizes Android before Linux", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
    expect(describeUserAgent(ua)).toEqual({ browser: "Chrome", os: "Android", isMobile: true });
  });

  it("falls back when the user agent is missing", () => {
    expect(describeUserAgent(null)).toEqual({
      browser: "Navegador desconhecido",
      os: "sistema desconhecido",
      isMobile: false,
    });
  });
});
