import {
  CUSTOMER_ROLE_LABELS,
  CUSTOMER_ROLES,
  type CustomerRole,
} from "@sellbridge/shared/schemas";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminRevokeCustomerSessions,
  adminSendCustomerPasswordReset,
  adminSetCustomerBan,
  adminSetCustomerRole,
} from "@/features/admin/customers.functions";
import { SectionCard } from "@/components/layout/section-card";
import { useAdminAction } from "@/features/admin/use-admin-action";

interface AccessProps {
  userId: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  isSelf: boolean;
}

function AccessRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RoleSelect({ userId, role, isSelf }: Pick<AccessProps, "userId" | "role" | "isSelf">) {
  const change = useAdminAction(
    (next: CustomerRole) => adminSetCustomerRole({ data: { userId, role: next } }),
    "Papel atualizado",
  );
  const knownRole = CUSTOMER_ROLES.find((option) => option === role);
  return (
    <Select
      value={role}
      disabled={isSelf || change.isPending}
      onValueChange={(value) => {
        const next = CUSTOMER_ROLES.find((option) => option === value);
        if (next && next !== role) {
          change.mutate(next);
        }
      }}
    >
      <SelectTrigger aria-label="Papel do cliente" className="w-44">
        <SelectValue>{knownRole ? CUSTOMER_ROLE_LABELS[knownRole] : role}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CUSTOMER_ROLES.map((option) => (
          <SelectItem key={option} value={option}>
            {CUSTOMER_ROLE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BanDialogFields({
  reason,
  onReasonChange,
}: {
  reason: string;
  onReasonChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="ban-reason">Motivo (aparece para o cliente ao tentar entrar)</Label>
      <Textarea
        id="ban-reason"
        value={reason}
        maxLength={200}
        onChange={(event) => onReasonChange(event.target.value)}
        placeholder="Ex.: pagamento pendente"
      />
    </div>
  );
}

function BanControl({ userId, banned, isSelf }: Pick<AccessProps, "userId" | "banned" | "isSelf">) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const toggle = useAdminAction(
    () =>
      adminSetCustomerBan({
        data: { userId, banned: !banned, reason: reason.trim() || undefined },
      }),
    banned ? "Cliente desbloqueado" : "Cliente bloqueado e desconectado",
    () => setIsOpen(false),
  );
  if (banned) {
    return (
      <Button
        variant="outline"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(undefined)}
      >
        {toggle.isPending ? "Desbloqueando..." : "Desbloquear"}
      </Button>
    );
  }
  return (
    <>
      <Button variant="destructive" disabled={isSelf} onClick={() => setIsOpen(true)}>
        Bloquear conta
      </Button>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Bloquear esta conta?"
        description="O cliente sai de todos os dispositivos e não consegue mais entrar até ser desbloqueado. Lojas e publicações continuam como estão."
        confirmLabel="Bloquear"
        pendingLabel="Bloqueando..."
        destructive
        isPending={toggle.isPending}
        onConfirm={() => toggle.mutate(undefined)}
      >
        <BanDialogFields reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}

function SessionsControl({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const revoke = useAdminAction(
    () => adminRevokeCustomerSessions({ data: { userId } }),
    "Sessões encerradas",
    () => setIsOpen(false),
  );
  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        Encerrar sessões
      </Button>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Encerrar todas as sessões?"
        description="O cliente precisará entrar de novo em todos os dispositivos."
        confirmLabel="Encerrar sessões"
        pendingLabel="Encerrando..."
        isPending={revoke.isPending}
        onConfirm={() => revoke.mutate(undefined)}
      />
    </>
  );
}

function PasswordResetButton({ userId }: { userId: string }) {
  const sendReset = useAdminAction(
    () => adminSendCustomerPasswordReset({ data: { userId } }),
    "Link de redefinição enviado para o e-mail do cliente",
  );
  return (
    <Button
      variant="outline"
      disabled={sendReset.isPending}
      onClick={() => sendReset.mutate(undefined)}
    >
      {sendReset.isPending ? "Enviando..." : "Enviar link de redefinição"}
    </Button>
  );
}

export function CustomerAccess({ userId, role, banned, banReason, isSelf }: AccessProps) {
  return (
    <SectionCard
      title="Acesso"
      description={
        isSelf
          ? "Esta é a sua conta: papel e bloqueio ficam travados."
          : "Permissões e segurança da conta."
      }
    >
      <div className="divide-y">
        <AccessRow
          title="Papel"
          description="Administradores veem e editam todos os clientes."
          action={<RoleSelect userId={userId} role={role} isSelf={isSelf} />}
        />
        <AccessRow
          title={banned ? "Conta bloqueada" : "Bloquear conta"}
          description={
            banned
              ? `Motivo: ${banReason ?? "não informado"}`
              : "Impede o cliente de entrar no app."
          }
          action={<BanControl userId={userId} banned={banned} isSelf={isSelf} />}
        />
        <AccessRow
          title="Sessões"
          description="Desconecta o cliente de todos os dispositivos."
          action={<SessionsControl userId={userId} />}
        />
        <AccessRow
          title="Senha"
          description="Envia ao cliente um link para criar uma nova senha (vale 1 hora)."
          action={<PasswordResetButton userId={userId} />}
        />
      </div>
    </SectionCard>
  );
}
