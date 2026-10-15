import { describe, expect, it, vi } from "vitest";
import { maskEmail, type ProfileSaveSteps, saveCustomerProfile } from "./email-change.server";

function steps(overrides: Partial<ProfileSaveSteps> = {}) {
  return {
    updateUser: vi.fn<ProfileSaveSteps["updateUser"]>().mockResolvedValue(undefined),
    sendVerification: vi.fn<ProfileSaveSteps["sendVerification"]>().mockResolvedValue(undefined),
    notifyPreviousAddress: vi
      .fn<ProfileSaveSteps["notifyPreviousAddress"]>()
      .mockResolvedValue(undefined),
    record: vi.fn<ProfileSaveSteps["record"]>().mockResolvedValue(undefined),
    ...overrides,
  };
}

const change = {
  name: "Loja Nova",
  previousEmail: "antiga@loja.com.br",
  email: "nova.conta@loja.com.br",
};

describe("saveCustomerProfile", () => {
  it("takes the verified mark off a new address, confirms it and warns the old one", async () => {
    const save = steps();
    await expect(saveCustomerProfile(change, save)).resolves.toEqual({ emailChanged: true });
    expect(save.updateUser).toHaveBeenCalledWith({
      name: "Loja Nova",
      email: "nova.conta@loja.com.br",
      emailVerified: false,
    });
    expect(save.sendVerification).toHaveBeenCalledWith("nova.conta@loja.com.br");
    expect(save.notifyPreviousAddress).toHaveBeenCalledWith({
      previousEmail: "antiga@loja.com.br",
      maskedEmail: "n***@loja.com.br",
    });
    expect(save.record).toHaveBeenCalledWith("email_changed");
  });

  it("only renames when the address stays the same, whatever its case", async () => {
    const save = steps();
    const sameAddress = { ...change, previousEmail: "Nova.Conta@Loja.com.br" };
    await expect(saveCustomerProfile(sameAddress, save)).resolves.toEqual({ emailChanged: false });
    expect(save.updateUser).toHaveBeenCalledWith({
      name: "Loja Nova",
      email: "nova.conta@loja.com.br",
    });
    expect(save.sendVerification).not.toHaveBeenCalled();
    expect(save.notifyPreviousAddress).not.toHaveBeenCalled();
    expect(save.record).toHaveBeenCalledWith("profile_updated");
  });

  it("keeps the change when a message cannot be sent: the trail still records it", async () => {
    const save = steps({
      notifyPreviousAddress: vi
        .fn<ProfileSaveSteps["notifyPreviousAddress"]>()
        .mockRejectedValue(new Error("Resend fora do ar")),
    });
    await expect(saveCustomerProfile(change, save)).resolves.toEqual({ emailChanged: true });
    expect(save.record).toHaveBeenCalledWith("email_changed");
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("nova.conta@loja.com.br")).toBe("n***@loja.com.br");
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });
});
