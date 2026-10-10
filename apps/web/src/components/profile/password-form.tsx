import { MIN_PASSWORD_LENGTH, newPasswordSchema } from "@sellbridge/shared/schemas";
import { GoogleLogoIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  activeSessionsQueryOptions,
  hasPasswordQueryOptions,
} from "@/features/profile/account.queries";
import { authClient } from "@/lib/auth-client";

const EMPTY = { current: "", next: "", confirm: "" };
type PasswordValues = typeof EMPTY;
type PasswordErrors = Partial<Record<keyof PasswordValues, string>>;

function newPasswordError(values: PasswordValues): string | null {
  const next = newPasswordSchema.safeParse(values.next);
  if (!next.success) {
    return next.error.issues[0]?.message ?? "Senha inválida";
  }
  if (values.next === values.current) {
    return "A nova senha precisa ser diferente da atual";
  }
  return null;
}

function validate(values: PasswordValues): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!values.current) {
    errors.current = "Informe sua senha atual";
  }
  const nextError = newPasswordError(values);
  if (nextError) {
    errors.next = nextError;
  }
  if (!errors.next && values.confirm !== values.next) {
    errors.confirm = "As senhas não coincidem";
  }
  return errors;
}

function useChangePassword() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  function bind(field: keyof PasswordValues) {
    return {
      value: values[field],
      errors: errors[field] ? [errors[field]] : [],
      onValueChange: (value: string) => setValues((current) => ({ ...current, [field]: value })),
    };
  }

  async function submit() {
    const issues = validate(values);
    setErrors(issues);
    if (Object.keys(issues).length > 0) {
      return;
    }
    setIsSaving(true);
    const result = await authClient.changePassword({
      currentPassword: values.current,
      newPassword: values.next,
      revokeOtherSessions: signOutOthers,
    });
    setIsSaving(false);
    if (result.error?.code === "INVALID_PASSWORD") {
      setErrors({ current: "Senha atual incorreta" });
      return;
    }
    if (result.error) {
      toast.error("Não foi possível trocar sua senha. Tente novamente.");
      return;
    }
    setValues(EMPTY);
    await queryClient.invalidateQueries(activeSessionsQueryOptions());
    toast.success(
      signOutOthers
        ? "Senha alterada. Os outros dispositivos foram desconectados."
        : "Senha alterada",
    );
  }

  const isEmpty = !values.current && !values.next && !values.confirm;
  return { bind, submit, isEmpty, isSaving, signOutOthers, setSignOutOthers };
}

function SignOutOthersOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="sign-out-others"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="grid gap-1">
        <Label htmlFor="sign-out-others">Sair dos outros dispositivos</Label>
        <p className="text-sm text-muted-foreground">
          Recomendado se você acha que alguém mais conhece sua senha.
        </p>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const form = useChangePassword();
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit();
  }
  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-4">
      <TextField
        id="current-password"
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        {...form.bind("current")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="new-password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
          {...form.bind("next")}
        />
        <TextField
          id="confirm-password"
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          {...form.bind("confirm")}
        />
      </div>
      <SignOutOthersOption checked={form.signOutOthers} onChange={form.setSignOutOthers} />
      <div>
        <Button type="submit" disabled={form.isEmpty || form.isSaving}>
          {form.isSaving ? "Salvando..." : "Trocar senha"}
        </Button>
      </div>
    </form>
  );
}

/** Password change for accounts that have one; Google-only accounts just see how they sign in. */
export function PasswordSection() {
  const query = useQuery(hasPasswordQueryOptions());
  if (query.isPending) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{query.error.message}</p>;
  }
  if (!query.data) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-4 text-sm">
        <GoogleLogoIcon className="size-5 shrink-0" weight="bold" aria-hidden="true" />
        <p>
          Você entra com a conta Google, então não há senha do SellBridge. A segurança do acesso é a
          da sua conta Google.
        </p>
      </div>
    );
  }
  return <ChangePasswordForm />;
}
