import { describe, expect, it } from "vitest";
import {
  parseRequestedProfile,
  PROFILE_HEADER,
  profileHeaderOf,
  requestedProfileOf,
} from "./profile-param.ts";
import {
  addProfileToHref,
  removeProfileFromHref,
  tabProfile,
  tabProfileHeaders,
} from "./tab-profile.ts";

const PAGE = "https://app.sellbridge.test/pedidos";

function request(url: string, header?: string) {
  const headers = new Headers();
  if (header !== undefined) {
    headers.set(PROFILE_HEADER, header);
  }
  return { headers, url };
}

describe("parseRequestedProfile", () => {
  it("asks for no profile when the value is missing or blank", () => {
    expect(parseRequestedProfile(null)).toBeNull();
    expect(parseRequestedProfile(undefined)).toBeNull();
    expect(parseRequestedProfile("")).toBeNull();
    expect(parseRequestedProfile("   ")).toBeNull();
  });

  it("reads a slug without the spaces around it", () => {
    expect(parseRequestedProfile("  loja-da-ana  ")).toBe("loja-da-ana");
  });

  it("keeps a malformed slug so the server refuses it instead of serving the default profile", () => {
    expect(parseRequestedProfile("Loja da Ana")).toBe("Loja da Ana");
    expect(parseRequestedProfile("../admin")).toBe("../admin");
  });

  it("cuts an oversized value to the slug length", () => {
    expect(parseRequestedProfile("a".repeat(500))).toHaveLength(80);
  });
});

describe("requestedProfileOf", () => {
  it("prefers the tab's header over the page URL", () => {
    expect(requestedProfileOf(request(`${PAGE}?perfil=da-url`, "do-cabecalho"))).toBe(
      "do-cabecalho",
    );
  });

  it("falls back to ?perfil= in the page URL when the call has no header", () => {
    expect(requestedProfileOf(request(`${PAGE}?perfil=da-url`))).toBe("da-url");
  });

  it("falls back to the URL when the header is blank", () => {
    expect(requestedProfileOf(request(`${PAGE}?perfil=da-url`, " "))).toBe("da-url");
  });

  it("asks for no profile when neither the header nor the URL names one", () => {
    expect(requestedProfileOf(request(PAGE))).toBeNull();
    expect(profileHeaderOf(new Headers())).toBeNull();
  });
});

describe("addProfileToHref", () => {
  it("adds the profile and keeps the other parameters and the anchor", () => {
    expect(addProfileToHref("/pedidos?page=2#lista", "loja-da-ana")).toBe(
      "/pedidos?page=2&perfil=loja-da-ana#lista",
    );
  });

  it("replaces a profile already in the link instead of repeating it", () => {
    expect(addProfileToHref("/pedidos?perfil=outra", "loja-da-ana")).toBe(
      "/pedidos?perfil=loja-da-ana",
    );
  });

  it("leaves the link as it is when the tab has no profile", () => {
    expect(addProfileToHref("/pedidos?page=2", null)).toBe("/pedidos?page=2");
  });

  it("encodes a slug so it cannot add parameters of its own", () => {
    expect(addProfileToHref("/pedidos", "a&page=9")).toBe("/pedidos?perfil=a%26page%3D9");
  });
});

describe("removeProfileFromHref", () => {
  it("removes only the profile and keeps the rest of the link", () => {
    expect(removeProfileFromHref("/admin/chamados?page=2&perfil=loja-da-ana#topo")).toBe(
      "/admin/chamados?page=2#topo",
    );
  });
});

describe("tab profile on the server", () => {
  it("has no tab profile and sends no header during a server render", () => {
    expect(tabProfile()).toBeNull();
    expect(tabProfileHeaders()).toEqual({});
  });
});
