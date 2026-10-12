import { describe, expect, it } from "vitest";
import { describeError, diagnosticFrames, redactDiagnostic } from "./error-diagnostics";

describe("error diagnostics privacy", () => {
  it("removes URLs, emails, quoted data and credentials from messages", () => {
    const result = redactDiagnostic(
      'Failure for alice@example.com at https://app.example/orders/123?token=secret with password=hunter2 Bearer abc123 and "Alice Customer"',
    );
    expect(result).not.toMatch(/alice|hunter2|abc123|secret|Alice Customer|orders\/123/);
    expect(result).toContain("Failure for");
  });

  it("extracts code locations without logging the stack message or URL parameters", () => {
    expect(
      diagnosticFrames(
        "Error: alice@example.com\n at render (https://app.example/assets/page-abc.js:15:9)\n at https://app.example/assets/page-abc.js?token=secret:20:4\n at /app/src/view.tsx:4:2",
      ),
    ).toEqual(["/assets/page-abc.js:15:9", "/src/view.tsx:4:2"]);
  });

  it("never stringifies arbitrary thrown objects", () => {
    expect(describeError({ password: "secret", customer: "Alice" })).toEqual({
      name: "UnknownError",
      message: "Non-Error value thrown",
      frames: [],
    });
    expect(redactDiagnostic("x".repeat(2000))).toHaveLength(1000);
  });
});
