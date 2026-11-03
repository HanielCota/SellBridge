/** Whether a word can give an initial: "(fornecedor)" or "-" in a name cannot. */
export function startsWithLetter(word: string): boolean {
  return /^\p{L}/u.test(word);
}

function letterWords(name: string): string[] {
  return name.trim().split(/\s+/).filter(startsWithLetter);
}

/** First and last initials ("Ana Maria Souza" → "AS"), for avatars without a photo. */
export function initials(name: string): string {
  const parts = letterWords(name);
  const first = parts.at(0)?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  const result = `${first}${last}`.toUpperCase();
  return result.length > 0 ? result : "?";
}
