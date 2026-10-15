import { useNavigate } from "@tanstack/react-router";
import { EyeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const endTime = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Always visible while an admin is inside a customer's account: until when, what stays off
 * (the server refuses it, see `lib/server/impersonation.ts`) and the way back.
 */
export function ImpersonationBanner({
  customerName,
  endsAt,
}: {
  customerName: string;
  endsAt: string | null;
}) {
  const navigate = useNavigate();
  const [isLeaving, setIsLeaving] = useState(false);

  async function stopImpersonating() {
    setIsLeaving(true);
    const result = await authClient.admin.stopImpersonating();
    if (result.error) {
      setIsLeaving(false);
      toast.error("Não foi possível voltar ao admin. Tente novamente.");
      return;
    }
    await navigate({ to: "/admin/clientes", reloadDocument: true });
  }

  return (
    <aside
      aria-label="Acesso como cliente"
      className="sticky top-0 z-20 flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm text-amber-950"
    >
      <EyeIcon className="size-4 shrink-0" aria-hidden="true" />
      {/* On a phone the bar keeps to who and until when; the rest would take a third of the screen. */}
      <span className="min-w-0">
        Você está usando a conta de <strong className="font-semibold">{customerName}</strong>
        {endsAt === null ? "" : ` até ${endTime.format(new Date(endsAt))}`}.
        <span className="hidden sm:inline"> Tudo o que fizer fica registrado com o seu nome.</span>
        <span className="hidden text-xs text-amber-900 sm:block">
          Chaves de API, webhooks, lojas, assinatura e dados do titular ficam bloqueados.
        </span>
      </span>
      <Button
        size="xs"
        className="shrink-0 bg-amber-950 text-amber-50 hover:bg-amber-900"
        disabled={isLeaving}
        onClick={() => void stopImpersonating()}
      >
        Voltar ao admin
      </Button>
    </aside>
  );
}
