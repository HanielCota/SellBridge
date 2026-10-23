import { CircleNotchIcon } from "@phosphor-icons/react";
import type { ClipboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OutOfHoursNotice } from "@/components/support/out-of-hours-notice";
import { cn } from "@/lib/utils";
import { STEP_HEADING_IDS, StepHeading } from "./step-parts";

export const DESCRIPTION_FIELD_ID = "new-ticket-body";
const SHORT_MESSAGE_ID = "new-ticket-body-short";

export function DescriptionStep({
  number,
  question,
  example,
  notice,
  value,
  isTooShort,
  onChange,
  onPaste,
}: {
  number: number;
  question: string;
  example: string;
  notice: string | null;
  value: string;
  /** Shown only after a send attempt: no counter nagging while the customer writes. */
  isTooShort: boolean;
  onChange: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="grid gap-2.5">
      <StepHeading
        id={STEP_HEADING_IDS.description}
        number={number}
        total={number}
        question={question}
      />
      {notice === null ? null : <p className="rounded-2xl bg-muted/50 p-3 text-sm">{notice}</p>}
      <Textarea
        id={DESCRIPTION_FIELD_ID}
        rows={4}
        value={value}
        aria-labelledby={STEP_HEADING_IDS.description}
        aria-invalid={isTooShort}
        aria-describedby={isTooShort ? SHORT_MESSAGE_ID : undefined}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
      />
      {isTooShort ? (
        <p id={SHORT_MESSAGE_ID} role="alert" className="text-sm text-destructive">
          Conte um pouco mais para a equipe entender o caso.
        </p>
      ) : null}
      {/* Plain text, not a box: a boxed sample reads as an answer already filled in. */}
      <p className="text-sm text-muted-foreground">{example}</p>
    </div>
  );
}

/**
 * The send button and what happens next. While the assistant's answer is on screen the button
 * reads "Ainda preciso de ajuda" and `children` adds "Resolveu meu problema" beside it.
 */
export function SendFooter({
  promise,
  isSending,
  busyLabel = "Enviando…",
  submitLabel = "Enviar chamado",
  children,
}: {
  promise: string;
  isSending: boolean;
  busyLabel?: string;
  submitLabel?: string;
  children?: ReactNode;
}) {
  // Two buttons beside the text squeezed it into a narrow column: they get their own row.
  const hasTwoButtons = children !== undefined && children !== null;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t pt-4",
        !hasTwoButtons && "sm:flex-row sm:items-end sm:justify-between",
      )}
    >
      <div className="text-sm">
        <p className="font-medium">O que acontece depois</p>
        <p className="text-muted-foreground">{promise}</p>
        <OutOfHoursNotice />
      </div>
      {/* Never disabled: a click with something missing points to it instead. */}
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row-reverse">
        <Button
          type="submit"
          aria-busy={isSending}
          aria-disabled={isSending}
          className="w-full sm:w-auto"
        >
          {isSending ? <CircleNotchIcon className="animate-spin" aria-hidden="true" /> : null}
          {isSending ? busyLabel : submitLabel}
        </Button>
        {children}
      </div>
    </div>
  );
}
