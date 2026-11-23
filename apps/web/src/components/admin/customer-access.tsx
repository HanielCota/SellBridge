import {
  CUSTOMER_ROLE_LABELS,
  CUSTOMER_ROLES,
  type CustomerRole,
} from "@sellbridge/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
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
import { roleChangeConfirmation, roleChangedMessage } from "@/features/admin/role-change";
import { useAdminAction } from "@/features/admin/use-admin-action";
import { errorMessage } from "@/lib/errors";

/** Long enough to read the notice and reach "Desfazer" (WCAG 2.2.1). */
const UNDO_NOTICE_MILLISECONDS = 10_000;

interface AccessProps {
  userId: string;
  /** Names the person in the role question and notice. */
  name: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  isSelf: boolean;
  /** False for an owner or team account seen by an ordinary admin: every control locks. */
  canManage: boolean;
  /** Only an owner gives or takes team roles; anyone else sees the role read-only. */
  canGrantTeamRoles: boolean;
}

interface Locked {
  locked: boolean;
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

interface RoleChange {
  next: CustomerRole;
  /** What "Desfazer" goes back to; undefined when the old role is not one of the list. */
  previous: CustomerRole | undefined;
}

/** Saves the role and offers "Desfazer" on the notice, back to the role it had. */
function useRoleChange(userId: string, name: string, onSaved: () => void) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (change: RoleChange) =>
      adminSetCustomerRole({ data: { userId, role: change.next } }),
    onSuccess: async (_result, change) => {
      onSaved();
      const { previous } = change;
      toast.success(
        roleChangedMessage(name, change.next),
        previous === undefined
          ? undefined
          : {
              duration: UNDO_NOTICE_MILLISECONDS,
              action: {
                label: "Desfazer",
                onClick: () => mutation.mutate({ next: previous, previous: change.next }),
              },
            },
      );
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return mutation;
}

/**
 * More access asks first, saying what the person will see; less access applies at once with
 * "Desfazer". The server checks the permission either way.
 */
function RoleSelect({
  userId,
  name,
  role,
  locked,
}: Pick<AccessProps, "userId" | "name" | "role"> & Locked) {
  const [asked, setAsked] = useState<CustomerRole | null>(null);
  const change = useRoleChange(userId, name, () => setAsked(null));
  const knownRole = CUSTOMER_ROLES.find((option) => option === role);
  const confirmation =
    asked === null ? null : roleChangeConfirmation({ name, from: knownRole ?? "user", to: asked });
  return (
    <>
      <Select
        value={role}
        disabled={locked || change.isPending}
        onValueChange={(value) => {
          const next = CUSTOMER_ROLES.find((option) => option === value);
          if (next === undefined || next === role) {
            return;
          }
          const question = roleChangeConfirmation({ name, from: knownRole ?? "user", to: next });
          if (question !== null) {
            setAsked(next);
            return;
          }
          change.mutate({ next, previous: knownRole });
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
      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => setAsked(open ? asked : null)}
        title={confirmation?.title ?? ""}
        description={confirmation?.description ?? ""}
        confirmLabel={confirmation?.confirmLabel ?? ""}
        pendingLabel="Salvando…"
        cancelLabel="Voltar"
        destructive={asked === "admin"}
        isPending={change.isPending}
        onConfirm={() => {
          if (asked !== null) {
            change.mutate({ next: asked, previous: knownRole });
          }
        }}
      />
    </>
  );
}

export function BanDialogFields({
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

function BanControl({ userId, banned, locked }: Pick<AccessProps, "userId" | "banned"> & Locked) {
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
        disabled={locked || toggle.isPending}
        onClick={() => toggle.mutate(undefined)}
      >
        {toggle.isPending ? "Desbloqueando…" : "Desbloquear"}
      </Button>
    );
  }
  return (
    <>
      <Button variant="destructive" disabled={locked} onClick={() => setIsOpen(true)}>
        Bloquear conta
      </Button>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Bloquear esta conta?"
        description="O cliente sai de todos os aparelhos e não consegue mais entrar até ser desbloqueado. Lojas e publicações continuam como estão."
        confirmLabel="Bloquear"
        pendingLabel="Bloqueando…"
        destructive
        isPending={toggle.isPending}
        onConfirm={() => toggle.mutate(undefined)}
      >
        <BanDialogFields reason={reason} onReasonChange={setReason} />
      </ConfirmDialog>
    </>
  );
}

function SessionsControl({ userId, locked }: { userId: string } & Locked) {
  const [isOpen, setIsOpen] = useState(false);
  const revoke = useAdminAction(
    () => adminRevokeCustomerSessions({ data: { userId } }),
    "Cliente desconectado de todos os aparelhos",
    () => setIsOpen(false),
  );
  return (
    <>
      <Button variant="outline" disabled={locked} onClick={() => setIsOpen(true)}>
        Desconectar de todos os aparelhos
      </Button>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Desconectar de todos os aparelhos?"
        description="O cliente vai precisar entrar de novo em todos os aparelhos."
        confirmLabel="Desconectar"
        pendingLabel="Encerrando…"
        isPending={revoke.isPending}
        onConfirm={() => revoke.mutate(undefined)}
      />
    </>
  );
}

function PasswordResetButton({ userId, locked }: { userId: string } & Locked) {
  const sendReset = useAdminAction(
    () => adminSendCustomerPasswordReset({ data: { userId } }),
    "Link de redefinição enviado para o e-mail do cliente",
  );
  return (
    <Button
      variant="outline"
      disabled={locked || sendReset.isPending}
      onClick={() => sendReset.mutate(undefined)}
    >
      {sendReset.isPending ? "Enviando…" : "Enviar link de redefinição"}
    </Button>
  );
}

function accessDescription({ isSelf, canManage }: Pick<AccessProps, "isSelf" | "canManage">) {
  if (isSelf && !canManage) {
    return "Esta é a sua conta: troque a senha e veja os aparelhos conectados no seu Perfil.";
  }
  if (!canManage) {
    return "Conta da equipe: só um dono da plataforma altera papel, bloqueio, aparelhos conectados e senha.";
  }
  if (isSelf) {
    return "Esta é a sua conta: papel e bloqueio ficam travados.";
  }
  return "Permissões e segurança da conta.";
}

export function CustomerAccess({
  userId,
  name,
  role,
  banned,
  banReason,
  isSelf,
  canManage,
  canGrantTeamRoles,
}: AccessProps) {
  const locked = !canManage;
  const roleLocked = locked || isSelf || !canGrantTeamRoles;
  return (
    <SectionCard title="Acesso" description={accessDescription({ isSelf, canManage })}>
      <div className="divide-y">
        <AccessRow
          title="Papel"
          description={
            canGrantTeamRoles
              ? "Administradores veem e editam todos os clientes."
              : "Só um dono da plataforma dá ou tira acesso à equipe."
          }
          action={<RoleSelect userId={userId} name={name} role={role} locked={roleLocked} />}
        />
        <AccessRow
          title={banned ? "Conta bloqueada" : "Bloquear conta"}
          description={
            banned
              ? `Motivo: ${banReason ?? "não informado"}`
              : "Impede o cliente de entrar no app."
          }
          action={<BanControl userId={userId} banned={banned} locked={locked || isSelf} />}
        />
        <AccessRow
          title="Aparelhos conectados"
          description="Desconecta o cliente de todos os aparelhos."
          action={<SessionsControl userId={userId} locked={locked} />}
        />
        <AccessRow
          title="Senha"
          description="Envia ao cliente um link para criar uma nova senha (vale 1 hora)."
          action={<PasswordResetButton userId={userId} locked={locked} />}
        />
      </div>
    </SectionCard>
  );
}
