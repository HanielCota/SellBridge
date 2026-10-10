/** Form-level failure shown as plain text next to the action, without an extra box. */
export function InlineFormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="px-1 text-footnote text-destructive">
      {message}
    </p>
  );
}
