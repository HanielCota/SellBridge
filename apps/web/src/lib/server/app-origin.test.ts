import { describe, expect, it, vi } from "vitest";

vi.mock("./environment.ts", () => ({ environment: {} }));

const { pickAppOrigin } = await import("./app-origin.ts");

const APP_URL = "http://localhost:4850";
const TRUSTED_ORIGINS = ["http://127.0.0.1:4850", "http://cadastro.localhost:4850"];

function originFor(requestUrl: string): string {
  return pickAppOrigin({ requestUrl, appUrl: APP_URL, trustedOrigins: TRUSTED_ORIGINS });
}

describe("pickAppOrigin", () => {
  it("stays on a trusted host the person signed in on", () => {
    expect(originFor("http://127.0.0.1:4850/api/oauth/mock/start")).toBe("http://127.0.0.1:4850");
    expect(originFor("http://cadastro.localhost:4850/lojas")).toBe(
      "http://cadastro.localhost:4850",
    );
  });

  it("keeps the app URL when the request already uses it", () => {
    expect(originFor("http://localhost:4850/lojas?erro=expired")).toBe(APP_URL);
  });

  it("falls back to the app URL for a host that is not trusted", () => {
    expect(originFor("http://evil.example/api/oauth/mock/start")).toBe(APP_URL);
    expect(originFor("http://127.0.0.1:3000/lojas")).toBe(APP_URL);
  });
});
