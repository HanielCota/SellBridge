import {
  CaretRightIcon,
  DownloadSimpleIcon,
  HourglassIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  deletionBlockersQueryOptions,
  hasPasswordQueryOptions,
} from "@/features/profile/account.queries";
import type { DeletionBlockerLine } from "@/features/profile/deletion-blockers";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error-message";

const EXPORT_URL = "/api/conta/exportar";

/** What deleting the account takes with it, said plainly before the password is asked. */
const DELETION_CONSEQUENCES = [
  "Sua assinatura é cancelada na hora.",
  "As lojas são desconectadas e os anúncios pausados no marketplace.",
  "Pedidos, anúncios, chamados e dados de cadastro são apagados.",
];

function useDeleteAccount() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password === "") {
      setError("Digite sua senha para excluir a conta");
      return;
    }
    setIsDeleting(true);
    const result = await authClient.deleteUser({ password });
    setIsDeleting(false);
    if (result.error) {
      // A refusal may come from something left to resolve: the row lists it once the dialog closes.
      void queryClient.invalidateQueries({ queryKey: deletionBlockersQueryOptions().queryKey });
      setError(
        authErrorMessage(result.error, "Não foi possível excluir a conta. Tente novamente."),
      );
      return;
    }
    toast.success("Sua conta foi excluída");
    // A full load: the session cookie is gone and every cached query belonged to the account.
    window.location.assign("/");
  }

  return { password, setPassword, error, isDeleting, submit };
}

function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { password, setPassword, error, isDeleting, submit } = useDeleteAccount();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Excluir sua conta?</DialogTitle>
            <DialogDescription>
              Não dá para desfazer. Se você é o único dono da sua conta de revendedor:
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {DELETION_CONSEQUENCES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <TextField
            id="delete-account-password"
            label="Sua senha"
            type="password"
            autoComplete="current-password"
            value={password}
            errors={error === null ? [] : [error]}
            onValueChange={setPassword}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isDeleting}>
              {isDeleting ? "Excluindo…" : "Excluir conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DataRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-footnote text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** What still keeps the account from being deleted, each item with the page that resolves it. */
function DeletionBlockers({ lines }: { lines: readonly DeletionBlockerLine[] }) {
  return (
    <Alert>
      <HourglassIcon weight="bold" aria-hidden="true" />
      <AlertTitle>Antes de excluir, resolva o que ainda está em andamento</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 grid gap-1">
          {lines.map((line) => (
            <li key={line.text}>
              <a
                href={line.href}
                className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground"
              >
                {line.text}
                <CaretRightIcon weight="bold" aria-hidden="true" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2">O botão de excluir libera quando não sobrar nada aqui.</p>
      </AlertDescription>
    </Alert>
  );
}

function deletionDescription(input: { canDelete: boolean; checking: boolean; blocked: boolean }) {
  if (input.blocked) {
    return "Ainda há pedidos ou dinheiro em andamento na sua conta.";
  }
  if (input.canDelete || input.checking) {
    return "Apaga a conta e tudo o que está nela. Não dá para desfazer.";
  }
  return "Sua conta entra com o Google: peça a exclusão pelo Suporte.";
}

/**
 * The account's data under the LGPD: a copy to download and, set apart, deleting it all.
 * Deletion asks for the password; an account that only signs in with Google asks Support.
 */
export function AccountDataSection() {
  const [deleting, setDeleting] = useState(false);
  const hasPassword = useQuery(hasPasswordQueryOptions());
  const canDelete = hasPassword.data === true;
  const blockers = useQuery({ ...deletionBlockersQueryOptions(), enabled: canDelete });
  // A failed check leaves the button on: the server checks again before deleting anything.
  const pending = blockers.data ?? [];
  const blocked = pending.length > 0;
  const checking = canDelete && blockers.isPending;
  return (
    <div className="space-y-5">
      <DataRow
        title="Baixar meus dados"
        description="Um arquivo com seu cadastro, lojas, anúncios, pedidos e chamados."
        action={
          <Button variant="outline" asChild>
            <a href={EXPORT_URL} download>
              <DownloadSimpleIcon weight="bold" aria-hidden="true" />
              Baixar arquivo
            </a>
          </Button>
        }
      />
      <div className="border-t border-border/60" />
      <DataRow
        title="Excluir conta"
        description={deletionDescription({
          canDelete,
          checking: hasPassword.isPending || checking,
          blocked,
        })}
        action={
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={!canDelete || checking || blocked}
            onClick={() => setDeleting(true)}
          >
            <TrashIcon weight="bold" aria-hidden="true" />
            Excluir conta
          </Button>
        }
      />
      {blocked ? <DeletionBlockers lines={pending} /> : null}
      {/* Mounted only while open, so the password and its error start empty every time. */}
      {deleting ? <DeleteAccountDialog open onOpenChange={setDeleting} /> : null}
    </div>
  );
}
