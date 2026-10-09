import { useNavigate } from "@tanstack/react-router";
import { EyeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Always visible while an admin is inside a customer's account, with the way back. */
export function ImpersonationBanner({ customerName }: { customerName: string }) {
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
      <span className="truncate">
        Você está usando a conta de <strong className="font-semibold">{customerName}</strong>. Tudo
        o que fizer vale para este cliente.
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
