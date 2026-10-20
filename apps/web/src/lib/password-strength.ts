import { MIN_PASSWORD_LENGTH } from "@sellbridge/shared/schemas";

export type PasswordStrength = "weak" | "medium" | "strong";

/** Lowercase, uppercase, digit and symbol: each kind present adds one point. */
const CHARACTER_KINDS = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/] as const;

/** Each length reached adds one point, so a long passphrase can make up for fewer kinds. */
const LENGTH_STEPS = [12, 16, 20] as const;

const MEDIUM_SCORE = 3;
const STRONG_SCORE = 5;

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

function strengthScore(password: string): number {
  const kinds = CHARACTER_KINDS.filter((kind) => kind.test(password)).length;
  const lengthSteps = LENGTH_STEPS.filter((step) => password.length >= step).length;
  return kinds + lengthSteps;
}

/**
 * A quick guide for the person typing a new password, not a security check: the server still
 * enforces the minimum length and refuses breached passwords. Null while the field is empty.
 */
export function passwordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) {
    return null;
  }
  if (password.length < MIN_PASSWORD_LENGTH || isPredictable(password)) {
    return "weak";
  }
  const score = strengthScore(password);
  if (score >= STRONG_SCORE) {
    return "strong";
  }
  if (score >= MEDIUM_SCORE) {
    return "medium";
  }
  return "weak";
}
