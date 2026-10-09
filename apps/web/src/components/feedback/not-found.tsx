import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-medium text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">Página não encontrada.</p>
      <Button asChild variant="outline">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
