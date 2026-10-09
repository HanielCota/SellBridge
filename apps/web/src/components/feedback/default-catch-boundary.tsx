import { ErrorComponent, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar esta página. Tente novamente em instantes.
        </p>
      </div>
      {import.meta.env.DEV ? <ErrorComponent error={error} /> : null}
      <Button onClick={() => void router.invalidate()}>Tentar novamente</Button>
    </div>
  );
}
