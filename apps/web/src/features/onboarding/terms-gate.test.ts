import { describe, expect, it } from "vitest";
import { needsTermsAcceptance } from "./terms-gate";

// Item 26.a (L4): whoever has not accepted the terms in force accepts before using the app, the
// Google sign-up included; an admin visiting a customer never accepts in the customer's name.
describe("needsTermsAcceptance", () => {
  it("asks whoever has not accepted the terms in force", () => {
    expect(needsTermsAcceptance({ termsAccepted: false, impersonatedBy: null })).toBe(true);
    expect(needsTermsAcceptance({ termsAccepted: true, impersonatedBy: null })).toBe(false);
  });

  it("never asks during an admin's visit", () => {
    expect(needsTermsAcceptance({ termsAccepted: false, impersonatedBy: "admin-1" })).toBe(false);
  });
});
