/** The amber pill every header notice wears, so a new one never invents another look. */
export const HEADER_NOTICE_CLASS_NAME =
  "inline-flex h-10 items-center gap-2 rounded-full whitespace-nowrap border border-amber-400 bg-amber-100 px-3.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/70";

/** The full text, for the element's accessible name: the phone hides the message. */
export function headerNoticeLabel(message: string, action: string): string {
  return `${message} · ${action}`;
}

/**
 * The dot, the message the computer shows and the action. The phone has room for a few words:
 * `phoneAction`, when given, takes the action's place there.
 */
export function HeaderNoticeContent({
  message,
  action,
  phoneAction = action,
}: {
  message: string;
  action: string;
  phoneAction?: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-amber-400 shadow-[0_0_0_4px] shadow-amber-400/20"
      />
      {/* The space keeps "·" and the action apart in the text axe compares with the name. */}
      <span className="hidden sm:inline">{message} ·</span>{" "}
      <span className="font-semibold text-amber-950 dark:text-white">
        <span className="sm:hidden">{phoneAction}</span>
        <span className="hidden sm:inline">{action}</span>
      </span>
    </>
  );
}
