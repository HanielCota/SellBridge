/** Mirrors `ticketSubjectSchema`: a ticket subject has 5 to 120 characters. */
const SUBJECT_MIN = 5;
const SUBJECT_MAX = 120;
const FALLBACK_SUBJECT = "Conversa pelo chat";

/**
 * The chat asks only for a message, so the ticket subject comes from its first line: the
 * team reads it in the queue, and the reseller sees it in "Suas conversas".
 */
export function chatSubjectFrom(message: string): string {
  const firstLine = message.trim().split("\n").at(0) ?? "";
  const subject = firstLine.replace(/\s+/g, " ").trim();
  if (subject.length < SUBJECT_MIN) {
    return FALLBACK_SUBJECT;
  }
  if (subject.length <= SUBJECT_MAX) {
    return subject;
  }
  return `${subject.slice(0, SUBJECT_MAX - 1).trimEnd()}…`;
}
