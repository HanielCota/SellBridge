import type { AdminSupplier } from "@sellbridge/database/repositories";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ToneStatus } from "@/components/data/tone-status";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSendSupplierInviteFn } from "@/features/supplier-invite/supplier-invite.functions";
import { errorMessage } from "@/lib/errors";

function CopyInvite({ url }: { url: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Também dá para mandar pelo WhatsApp. O convite vale 14 dias e só funciona com o e-mail de
        pedidos.
      </p>
      <Input aria-label="Convite para o painel" type="url" readOnly value={url} />
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Convite copiado");
          } catch {
            toast.error("Copie o convite no campo acima");
          }
        }}
      >
        Copiar convite
      </Button>
    </div>
  );
}

/** What the card says, and why the invite cannot go out yet when it cannot. */
function inviteHint(supplier: AdminSupplier, hasEmail: boolean): string {
  if (!supplier.active) {
    return "Este fornecedor está desativado. Ative o fornecedor antes de convidar para o painel.";
  }
  if (!hasEmail) {
    return "Este fornecedor ainda recebe os pedidos só por link. Cadastre o e-mail de pedidos no formulário abaixo para poder convidar.";
  }
  return `Este fornecedor ainda recebe os pedidos só por link. Envie o convite para ${supplier.contactEmail ?? ""}: ele cria a conta com esse e-mail e encontra os produtos e pedidos no painel.`;
}

/**
 * "Acesso ao painel" for a supplier the team still runs: it orders only by link until it creates
 * its access through the invite, with its order e-mail.
 */
export function SupplierPanelInvite({ supplier }: { supplier: AdminSupplier }) {
  const invite = useMutation({
    mutationFn: async () => adminSendSupplierInviteFn({ data: { supplierId: supplier.id } }),
    onSuccess: () => toast.success("Convite enviado por e-mail"),
  });
  if (supplier.organizationId !== null) {
    return null;
  }
  const hasEmail = supplier.contactEmail !== null && supplier.contactEmail.trim() !== "";
  const canInvite = hasEmail && supplier.active;
  return (
    <section
      className="surface-card space-y-4 rounded-2xl bg-card p-5"
      aria-labelledby="panel-access"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="panel-access" className="text-lg font-semibold">
          Acesso ao painel
        </h2>
        <ToneStatus tone="warning" label="Sem painel" />
      </div>
      <p className="text-sm text-muted-foreground">{inviteHint(supplier, hasEmail)}</p>
      <Button
        variant="outline"
        disabled={!canInvite || invite.isPending}
        onClick={() => invite.mutate()}
      >
        {invite.isPending ? "Enviando..." : "Enviar convite por e-mail"}
      </Button>
      <InlineFormError message={invite.isError ? errorMessage(invite.error) : null} />
      {invite.data === undefined ? null : <CopyInvite url={invite.data.inviteUrl} />}
    </section>
  );
}
