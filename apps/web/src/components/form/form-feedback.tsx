import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Destructive alert shown above a form when submission fails; renders nothing without a message. */
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
    <Button type="submit" disabled={isPending} className={className}>
      {isPending ? pendingLabel : idleLabel}
    </Button>
  );
}
