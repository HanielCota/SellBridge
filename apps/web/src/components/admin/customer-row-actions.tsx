import {
  CopyIcon,
  DotsThreeIcon,
  HeadsetIcon,
  IdentificationCardIcon,
  KeyIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  SignInIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BanDialogFields } from "@/components/admin/customer-access";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useIconMotion, type MenuIconMotion } from "@/components/listings/menu-icon-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  adminSendCustomerPasswordReset,
  adminSetCustomerBan,
} from "@/features/admin/customers.functions";
import { useAdminAction } from "@/features/admin/use-admin-action";
import { useImpersonate } from "@/features/admin/use-impersonate";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

interface RowCustomer {
  id: string;
  name: string;
  email: string;
  banned: boolean;
}

function ActionItem({
  motion,
  label,
  destructive = false,
  disabled = false,
  onSelect,
}: {
  motion: MenuIconMotion;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      className={cn(!destructive && "text-foreground *:[svg]:text-foreground")}
      disabled={disabled}
      onSelect={onSelect}
      onFocus={motion.onHighlight}
    >
      {motion.icon}
      {label}
    </DropdownMenuItem>
  );
}

function useActionMotions() {
  return {
    enter: useIconMotion(SignInIcon, [
      { translate: "0 0" },
      { translate: "3px 0" },
      { translate: "0 0" },
    ]),
    record: useIconMotion(IdentificationCardIcon, [
      { scale: "1" },
      { scale: "1.15" },
      { scale: "1" },
    ]),
    tickets: useIconMotion(
      HeadsetIcon,
      [{ rotate: "0deg" }, { rotate: "-10deg" }, { rotate: "8deg" }, { rotate: "0deg" }],
      "50% 40%",
    ),
    password: useIconMotion(KeyIcon, [
      { rotate: "0deg" },
      { rotate: "-25deg" },
      { rotate: "0deg" },
    ]),
    copy: useIconMotion(CopyIcon, [
      { translate: "0 0" },
      { translate: "1px -2px" },
      { translate: "0 0" },
    ]),
    lock: useIconMotion(
      LockSimpleIcon,
      [{ rotate: "0deg" }, { rotate: "-8deg" }, { rotate: "6deg" }, { rotate: "0deg" }],
      "50% 100%",
    ),
    unlock: useIconMotion(LockSimpleOpenIcon, [
      { translate: "0 0" },
      { translate: "0 -2px" },
      { translate: "0 0" },
    ]),
  };
}

/** Blocking asks first, with the reason the customer will see; unblocking acts at once. */
function useBanToggle(customer: RowCustomer) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const toggle = useAdminAction(
    () =>
      adminSetCustomerBan({
        data: { userId: customer.id, banned: !customer.banned, reason: reason.trim() || undefined },
      }),
    customer.banned ? "Cliente desbloqueado" : "Cliente bloqueado e desconectado",
    () => setIsDialogOpen(false),
  );
  return { isDialogOpen, setIsDialogOpen, reason, setReason, toggle };
}

type BanToggle = ReturnType<typeof useBanToggle>;

function BanDialog({ customer, ban }: { customer: RowCustomer; ban: BanToggle }) {
  return (
    <ConfirmDialog
      open={ban.isDialogOpen}
      onOpenChange={ban.setIsDialogOpen}
      title={`Bloquear ${customer.name}?`}
      description="O cliente sai de todos os dispositivos e não consegue mais entrar até ser desbloqueado. Lojas e publicações continuam como estão."
      confirmLabel="Bloquear"
      pendingLabel="Bloqueando…"
      destructive
      isPending={ban.toggle.isPending}
      onConfirm={() => ban.toggle.mutate(undefined)}
    >
      <BanDialogFields reason={ban.reason} onReasonChange={ban.setReason} />
    </ConfirmDialog>
  );
}

/** Help the customer back into the account, or keep them out of it. */
function AccountItems({
  customer,
  isSelf,
  ban,
}: {
  customer: RowCustomer;
  isSelf: boolean;
  ban: BanToggle;
}) {
  const motions = useActionMotions();
  const sendReset = useAdminAction(
    () => adminSendCustomerPasswordReset({ data: { userId: customer.id } }),
    "Link de redefinição enviado para o e-mail do cliente",
  );
  return (
    <>
      <ActionItem
        motion={motions.password}
        label="Enviar redefinição de senha"
        disabled={sendReset.isPending}
        onSelect={() => sendReset.mutate(undefined)}
      />
      <ActionItem
        motion={motions.copy}
        label="Copiar e-mail"
        onSelect={() => void copyToClipboard(customer.email, "E-mail copiado")}
      />
      <DropdownMenuSeparator />
      {customer.banned ? (
        <ActionItem
          motion={motions.unlock}
          label="Desbloquear conta"
          disabled={ban.toggle.isPending}
          onSelect={() => ban.toggle.mutate(undefined)}
        />
      ) : (
        <ActionItem
          motion={motions.lock}
          label="Bloquear conta"
          destructive
          disabled={isSelf}
          onSelect={() => ban.setIsDialogOpen(true)}
        />
      )}
    </>
  );
}

/** Go where the customer's problems are: their account, their record or their tickets. */
function NavigationItems({ customer, isSelf }: { customer: RowCustomer; isSelf: boolean }) {
  const navigate = useNavigate();
  const motions = useActionMotions();
  const { impersonate, pendingUserId } = useImpersonate();
  return (
    <>
      <ActionItem
        motion={motions.enter}
        label="Entrar como cliente"
        disabled={isSelf || customer.banned || pendingUserId !== null}
        onSelect={() => void impersonate(customer.id)}
      />
      <ActionItem
        motion={motions.record}
        label="Abrir ficha completa"
        onSelect={() =>
          void navigate({ to: "/admin/clientes/$userId", params: { userId: customer.id } })
        }
      />
      <ActionItem
        motion={motions.tickets}
        label="Ver chamados"
        onSelect={() => void navigate({ to: "/admin/chamados", search: { query: customer.email } })}
      />
    </>
  );
}

/**
 * The shortcuts an admin reaches for on a customer, one click from the table: open their
 * account, their record or tickets, help them back into it, or lock it.
 */
export function CustomerRowActions({
  customer,
  isSelf,
}: {
  customer: RowCustomer;
  isSelf: boolean;
}) {
  const ban = useBanToggle(customer);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${customer.name}`}>
            <DotsThreeIcon weight="bold" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <NavigationItems customer={customer} isSelf={isSelf} />
          <DropdownMenuSeparator />
          <AccountItems customer={customer} isSelf={isSelf} ban={ban} />
        </DropdownMenuContent>
      </DropdownMenu>
      <BanDialog customer={customer} ban={ban} />
    </>
  );
}
