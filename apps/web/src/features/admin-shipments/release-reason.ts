/** The fewest letters a release reason takes: a word or two, or dots, say nothing to an audit. */
const MIN_RELEASE_REASON_LETTERS = 10;
const LETTER = /\p{L}/gu;

/** Whether a label release reason has at least 10 letters (punctuation and spaces do not count). */
export function hasEnoughLetters(reason: string): boolean {
  return (reason.match(LETTER)?.length ?? 0) >= MIN_RELEASE_REASON_LETTERS;
}
