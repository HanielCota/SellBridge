import { updateCustomerProfileSchema } from "@sellbridge/shared/schemas";
import { type FormEvent, useState } from "react";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { adminUpdateCustomerProfile } from "@/features/admin/customers.functions";
import { AdminSection } from "./admin-section";
import { useAdminAction } from "./use-admin-action";

interface ProfileFormProps {
  userId: string;
  name: string;
  email: string;
}

function issuesByField(input: { userId: string; name: string; email: string }) {
  const parsed = updateCustomerProfileSchema.safeParse(input);
  if (parsed.success) {
    return null;
  }
  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    errors[field] = [...(errors[field] ?? []), issue.message];
  }
  return errors;
}

export function CustomerProfileForm({ userId, name, email }: ProfileFormProps) {
  const [values, setValues] = useState({ name, email });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const save = useAdminAction(
    (data: { name: string; email: string }) =>
      adminUpdateCustomerProfile({ data: { userId, ...data } }),
    "Perfil do cliente atualizado",
  );
  const isUnchanged = values.name === name && values.email === email;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issues = issuesByField({ userId, ...values });
    setErrors(issues ?? {});
    if (!issues) {
      save.mutate(values);
    }
  }

  return (
    <AdminSection title="Perfil" description="Nome exibido no app e e-mail usado para entrar.">
      <form noValidate onSubmit={handleSubmit} className="grid gap-4">
        <TextField
          id="customer-name"
          label="Nome"
          value={values.name}
          errors={errors.name ?? []}
          onValueChange={(next) => setValues((current) => ({ ...current, name: next }))}
        />
        <TextField
          id="customer-email"
          label="E-mail"
          type="email"
          value={values.email}
          errors={errors.email ?? []}
          onValueChange={(next) => setValues((current) => ({ ...current, email: next }))}
        />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={isUnchanged || save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </form>
    </AdminSection>
  );
}
