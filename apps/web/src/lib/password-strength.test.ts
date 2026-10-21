import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
  it("has no strength while the field is empty", () => {
    expect(passwordStrength("")).toBeNull();
  });

  it("rates a password below the minimum length as weak", () => {
    expect(passwordStrength("Ab1!xyz")).toBe("weak");
  });

  it("rates a password of exactly the minimum length as medium", () => {
    expect(passwordStrength("casa7mar")).toBe("medium");
  });

  it("rates a password one character past the minimum as strong", () => {
    expect(passwordStrength("casa7mars")).toBe("strong");
    expect(passwordStrength("abcdwxyzq")).toBe("strong");
  });

  it("rates a repeated character as weak whatever its length", () => {
    expect(passwordStrength("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe("weak");
  });

  it("rates a password built on a common piece as weak", () => {
    expect(passwordStrength("Senha1234")).toBe("weak");
    expect(passwordStrength("Password1!")).toBe("weak");
    expect(passwordStrength("123456789")).toBe("weak");
  });

  it("keeps a common piece from spoiling an otherwise long password", () => {
    expect(passwordStrength("MinhaSenha#2026Forte")).toBe("strong");
  });
});
