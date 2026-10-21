import { stripAccents } from "@sellbridge/shared/text";

export function matchesCommand(
  command: { label: string; keywords: string },
  term: string,
): boolean {
  const haystack = stripAccents(`${command.label} ${command.keywords}`).toLowerCase();
  return stripAccents(term)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
