import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a type scale size next to a text color", () => {
    expect(cn("text-subhead text-muted-foreground")).toBe("text-subhead text-muted-foreground");
  });

  it("lets the last type scale size win", () => {
    expect(cn("text-footnote text-subhead")).toBe("text-subhead");
  });

  it("resolves a type scale size against a default Tailwind size", () => {
    expect(cn("text-sm text-body")).toBe("text-body");
  });
});
