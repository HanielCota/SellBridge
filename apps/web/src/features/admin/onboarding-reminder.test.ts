import { describe, expect, it } from "vitest";
import { onboardingReminderEmail } from "./onboarding-reminder";

describe("onboardingReminderEmail", () => {
  it("greets by first name and links to the missing step", () => {
    const email = onboardingReminderEmail(
      { name: "Ana Souza", email: "ana@sellbridge.test" },
      "store",
      "https://app.sellbridge.test",
    );
    expect(email.to).toBe("ana@sellbridge.test");
    expect(email.text).toContain("Olá, Ana!");
    expect(email.text).toContain("conectar sua loja do marketplace");
    expect(email.text).toContain("https://app.sellbridge.test/lojas");
  });
});
