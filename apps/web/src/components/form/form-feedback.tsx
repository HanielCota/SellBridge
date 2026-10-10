import { CircleNotchIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Renders nothing without a message. */
export function FormErrorAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

interface PendingSubmitButtonProps {
  isPending: boolean;
  idleLabel: string;
  pendingLabel: string;
  className?: string;
}

/** Submit button that disables itself and swaps its label while the form is submitting. */
export function PendingSubmitButton({
  isPending,
  idleLabel,
  pendingLabel,
  className,
}: PendingSubmitButtonProps) {
  return (
    <Button type="submit" disabled={isPending} aria-busy={isPending} className={className}>
      {isPending ? <CircleNotchIcon className="animate-spin" aria-hidden="true" /> : null}
      {isPending ? pendingLabel : idleLabel}
    </Button>
  );
}
