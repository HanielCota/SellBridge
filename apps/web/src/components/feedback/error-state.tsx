import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"
    >
      <WarningCircleIcon className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-sm">{message ?? "Não foi possível carregar os dados."}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
