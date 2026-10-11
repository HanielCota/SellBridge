import { WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/integrations/copy-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

/** The warning shown with every secret the app reveals only once. */
export function OneTimeSecretWarning({ children }: { children: ReactNode }) {
  return (
    <Alert className="border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-300">
      <WarningIcon aria-hidden="true" />
      <AlertDescription className="text-current">{children}</AlertDescription>
    </Alert>
  );
}

/** A read-only secret, selected on focus, with a copy button beside it. */
export function SecretField({
  id,
  label,
  value,
  copyLabel,
}: {
  id: string;
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          id={id}
          readOnly
          value={value}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-field-border bg-muted/50 px-3 font-mono text-footnote outline-none focus:border-brand-strong focus:ring-4 focus:ring-brand/20"
        />
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

/** A titled block of code to copy (a command, a snippet). */
export function CodeSnippet({
  id,
  title,
  code,
  copyLabel,
  wrap = false,
}: {
  id: string;
  title: string;
  code: string;
  copyLabel: string;
  /** Wrap long lines (a one-line command) instead of scrolling (a program). */
  wrap?: boolean;
}) {
  const titleId = `${id}-titulo`;
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="text-sm font-medium">
          {title}
        </p>
        <CopyButton value={code} label={copyLabel} />
      </div>
      <pre
        aria-labelledby={titleId}
        className={
          wrap
            ? "overflow-x-auto rounded-xl bg-muted/60 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap"
            : "max-h-64 overflow-auto rounded-xl bg-muted/60 p-3 font-mono text-xs leading-relaxed"
        }
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
