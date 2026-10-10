import { nameSchema } from "@sellbridge/shared/schemas";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Name shown across the app; the e-mail is the sign-in identity, so it is read-only here. */
export function ProfileNameForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isUnchanged = value.trim() === name;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = nameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nome inválido");
      return;
    }
    setError(null);
    setIsSaving(true);
    const result = await authClient.updateUser({ name: parsed.data });
    setIsSaving(false);
    if (result.error) {
      toast.error("Não foi possível salvar seu nome. Tente novamente.");
      return;
    }
    setValue(parsed.data);
    await router.invalidate();
    toast.success("Nome atualizado");
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
      <TextField
        id="profile-name"
        label="Nome"
        autoComplete="name"
        value={value}
        errors={error ? [error] : []}
        onValueChange={setValue}
      />
      <div className="grid gap-2">
        <TextField
          id="profile-email"
          label="E-mail"
          type="email"
          value={email}
          errors={[]}
          readOnly
          aria-describedby="profile-email-hint"
          className="bg-muted/50 text-muted-foreground"
          onValueChange={() => undefined}
        />
        <p id="profile-email-hint" className="text-sm text-muted-foreground">
          É o e-mail que você usa para entrar. Para trocá-lo, fale com o suporte.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={isUnchanged || isSaving}>
          {isSaving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
