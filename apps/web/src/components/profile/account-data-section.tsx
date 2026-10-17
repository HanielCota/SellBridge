import { DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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
import { hasPasswordQueryOptions } from "@/features/profile/account.queries";
import { authClient } from "@/lib/auth-client";

const EXPORT_URL = "/api/conta/exportar";

/** What deleting the account takes with it, said plainly before the password is asked. */
const DELETION_CONSEQUENCES = [
  "Sua assinatura é cancelada na hora.",
  "As lojas são desconectadas e os anúncios pausados no marketplace.",
  "Pedidos, anúncios, chamados e dados de cadastro são apagados.",
];

function deletionErrorMessage(code: string | undefined, message: string | undefined): string {
  if (code === "INVALID_PASSWORD") {
    return "Senha incorreta";
  }
  return message ?? "Não foi possível excluir a conta. Tente novamente.";
}

function useDeleteAccount() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      setError(deletionErrorMessage(result.error.code, result.error.message));
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

/**
 * The account's data under the LGPD: a copy to download and, set apart, deleting it all.
 * Deletion asks for the password; an account that only signs in with Google asks Support.
 */
export function AccountDataSection() {
  const [deleting, setDeleting] = useState(false);
  const hasPassword = useQuery(hasPasswordQueryOptions());
  const canDelete = hasPassword.data === true;
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
        description={
          canDelete || hasPassword.isPending
            ? "Apaga a conta e tudo o que está nela. Não dá para desfazer."
            : "Sua conta entra com o Google: peça a exclusão pelo Suporte."
        }
        action={
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={!canDelete}
            onClick={() => setDeleting(true)}
          >
            <TrashIcon weight="bold" aria-hidden="true" />
            Excluir conta
          </Button>
        }
      />
      {/* Mounted only while open, so the password and its error start empty every time. */}
      {deleting ? <DeleteAccountDialog open onOpenChange={setDeleting} /> : null}
    </div>
  );
}
