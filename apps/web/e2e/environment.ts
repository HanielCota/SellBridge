/** Reads a variable the E2E suite needs; the root .env is loaded by playwright.config.ts. */
export function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} não definida: copie .env.example para .env na raiz`);
  }
  return value;
}
