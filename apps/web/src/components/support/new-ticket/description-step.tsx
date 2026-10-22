import { CircleNotchIcon } from "@phosphor-icons/react";
import type { ClipboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OutOfHoursNotice } from "@/components/support/out-of-hours-notice";
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

export function SendFooter({ promise, isSending }: { promise: string; isSending: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="text-sm">
        <p className="font-medium">O que acontece depois</p>
        <p className="text-muted-foreground">{promise}</p>
        <OutOfHoursNotice />
      </div>
      {/* Never disabled: a click with something missing points to it instead. */}
      <Button
        type="submit"
        aria-busy={isSending}
        aria-disabled={isSending}
        className="w-full shrink-0 sm:w-auto"
      >
        {isSending ? <CircleNotchIcon className="animate-spin" aria-hidden="true" /> : null}
        {isSending ? "Enviando…" : "Enviar chamado"}
      </Button>
    </div>
  );
}
