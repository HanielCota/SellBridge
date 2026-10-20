import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
  it("has no strength while the field is empty", () => {
    expect(passwordStrength("")).toBeNull();
  });

  it("rates a password below the minimum length as weak", () => {
    expect(passwordStrength("Ab1!xyz")).toBe("weak");
  });

  it("rates a long password of a single kind of character as weak", () => {
    expect(passwordStrength("abcdwxyz")).toBe("weak");
  });

  it("rates a repeated character as weak whatever its length", () => {
    expect(passwordStrength("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe("weak");
  });

  it("rates a password built on a common piece as weak", () => {
    expect(passwordStrength("Senha123")).toBe("weak");
    expect(passwordStrength("Password1!")).toBe("weak");
    expect(passwordStrength("12345678")).toBe("weak");
  });

  it("keeps a common piece from spoiling an otherwise long password", () => {
    expect(passwordStrength("MinhaSenha#2026Forte")).toBe("strong");
  });

  it("rates mixed kinds at the minimum length as medium", () => {
    expect(passwordStrength("Casa7mar")).toBe("medium");
    expect(passwordStrength("Casa7mar!")).toBe("medium");
  });

  it("rates a long password with mixed kinds as strong", () => {
    expect(passwordStrength("Casa7mar!sol")).toBe("strong");
  });

  it("lets length make up for fewer kinds of character", () => {
    expect(passwordStrength("cavalobateriagrampo")).toBe("medium");
    expect(passwordStrength("cavalo bateria grampo correto")).toBe("strong");
  });
});
