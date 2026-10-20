import { MIN_PASSWORD_LENGTH } from "@sellbridge/shared/schemas";

export type PasswordStrength = "weak" | "medium" | "strong";

/** One character past the minimum already counts as strong (product rule, PR #65). */
const STRONG_LENGTH = MIN_PASSWORD_LENGTH + 1;

/** Pieces people reach for first; what is left after removing them must still be long enough. */
const PREDICTABLE_PIECES = [
  "123456",
  "654321",
  "abcdef",
  "qwerty",
  "111111",
  "senha",
  "password",
  "sellbridge",
] as const;

function withoutPredictablePieces(password: string): string {
  const lowercase = password.toLowerCase();
  return PREDICTABLE_PIECES.reduce((rest, piece) => rest.replaceAll(piece, ""), lowercase);
}

function isPredictable(password: string): boolean {
  const hasSingleCharacter = new Set(password).size === 1;
  if (hasSingleCharacter) {
    return true;
  }
  return withoutPredictablePieces(password).length < MIN_PASSWORD_LENGTH;
}

/**
 * A quick guide for the person typing a new password, not a security check: the server still
 * enforces the minimum length and refuses breached passwords. Below the minimum is weak, exactly
 * the minimum is medium and anything longer is strong, unless the password is predictable.
 * Null while the field is empty.
 */
export function passwordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) {
    return null;
  }
  if (password.length < MIN_PASSWORD_LENGTH || isPredictable(password)) {
    return "weak";
  }
  if (password.length >= STRONG_LENGTH) {
    return "strong";
  }
  return "medium";
}
