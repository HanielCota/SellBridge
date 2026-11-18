import { describe, expect, it } from "vitest";
import { inviteStateOf, maskInviteEmail, type InviteTarget } from "./invite-state";

const VALID = { status: "valid", supplierId: "0b7a4d2e-3c1f-4a5b-9c8d-7e6f5a4b3c2d" } as const;
const TARGET: InviteTarget = {
  name: "Cerâmica Teste",
  contactEmail: "Pedidos@Ceramica.com.br",
  hasPanel: false,
};

describe("inviteStateOf", () => {
  it("lets the confirmed owner of the order e-mail take the supplier, in any letter case", () => {
    const state = inviteStateOf({
      reading: VALID,
      target: TARGET,
      viewer: { email: "pedidos@ceramica.com.br", emailVerified: true },
    });

    expect(state).toEqual({ status: "ready", supplierName: "Cerâmica Teste" });
  });

  it("asks someone signed out to sign in with the masked order e-mail", () => {
    const state = inviteStateOf({ reading: VALID, target: TARGET, viewer: null });

    expect(state).toEqual({
      status: "signed_out",
      supplierName: "Cerâmica Teste",
      maskedEmail: "P***@Ceramica.com.br",
    });
  });

  it("refuses an account with another e-mail", () => {
    const state = inviteStateOf({
      reading: VALID,
      target: TARGET,
      viewer: { email: "outra@pessoa.com", emailVerified: true },
    });

    expect(state.status).toBe("wrong_email");
  });

  it("refuses the right e-mail while it is not confirmed", () => {
    const state = inviteStateOf({
      reading: VALID,
      target: TARGET,
      viewer: { email: "pedidos@ceramica.com.br", emailVerified: false },
    });

    expect(state.status).toBe("unconfirmed");
  });

  it("stops at a supplier that already has a panel owner", () => {
    const state = inviteStateOf({
      reading: VALID,
      target: { ...TARGET, hasPanel: true },
      viewer: { email: "pedidos@ceramica.com.br", emailVerified: true },
    });

    expect(state).toEqual({ status: "claimed" });
  });

  it.each([null, "  "])("stops at a supplier with no order e-mail (%j)", (contactEmail) => {
    const state = inviteStateOf({
      reading: VALID,
      target: { ...TARGET, contactEmail },
      viewer: null,
    });

    expect(state).toEqual({ status: "no_email" });
  });

  it("tells an expired invite apart from a forged one", () => {
    const expired = inviteStateOf({ reading: { status: "expired" }, target: TARGET, viewer: null });
    const forged = inviteStateOf({ reading: { status: "invalid" }, target: TARGET, viewer: null });

    expect(expired).toEqual({ status: "expired" });
    expect(forged).toEqual({ status: "invalid" });
  });

  it("calls an invite to a supplier that no longer exists invalid", () => {
    const state = inviteStateOf({ reading: VALID, target: null, viewer: null });

    expect(state).toEqual({ status: "invalid" });
  });
});

describe("maskInviteEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskInviteEmail("pedidos@loja.com.br")).toBe("p***@loja.com.br");
  });
});
