const SIMULATED_SUFFIX = /\s*\(loja simulada\)\s*$/i;

/** Shop name without the "(loja simulada)" noise; the chip's tooltip and screen-reader text say it once. */
export function displayStoreName(name: string): string {
  return name.replace(SIMULATED_SUFFIX, "");
}
