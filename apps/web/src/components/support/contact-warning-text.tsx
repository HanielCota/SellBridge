/**
 * The contact warning under a conversation box. Kept mounted, empty while there is nothing to
 * say, so screen readers announce it when it appears.
 */
export function ContactWarningText({ id, message }: { id: string; message: string | null }) {
  return (
    <p id={id} aria-live="polite" className="text-sm text-destructive empty:hidden">
      {message}
    </p>
  );
}

/** `aria-describedby` from the messages on screen, or nothing when none is. */
export function describedByIds(ids: ReadonlyArray<string | null>): string | undefined {
  const shown = ids.filter((id) => id !== null);
  return shown.length === 0 ? undefined : shown.join(" ");
}
