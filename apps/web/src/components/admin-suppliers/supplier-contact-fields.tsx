import { TextField } from "@/components/form/form-field";
import type { supplierFormValues } from "@/features/admin-suppliers/form-values";

type SupplierValues = ReturnType<typeof supplierFormValues>;
type ContactValues = Pick<
  SupplierValues,
  "contactEmail" | "acceptWithinHours" | "dispatchWithinHours"
>;

interface SupplierContactFieldsProps {
  values: ContactValues;
  errors: Record<string, string[]>;
  onChange: (change: Partial<ContactValues>) => void;
}

const deadlineFields = [
  { name: "acceptWithinHours", label: "Prazo para aceitar (horas)" },
  { name: "dispatchWithinHours", label: "Prazo para despachar (horas)" },
] as const;

/** Where the supplier hears about new orders and how long they have to act on them. */
export function SupplierContactFields({ values, errors, onChange }: SupplierContactFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Pedidos</legend>
      <p className="text-sm text-muted-foreground">
        O e-mail recebe o link de cada pedido encaminhado, e os prazos contam a partir do
        encaminhamento. Só a equipe SellBridge vê estes dados.
      </p>
      <TextField
        id="supplier-contactEmail"
        label="E-mail para pedidos (opcional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        value={values.contactEmail}
        maxLength={254}
        errors={errors.contactEmail ?? []}
        onValueChange={(contactEmail) => onChange({ contactEmail })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {deadlineFields.map((field) => (
          <TextField
            key={field.name}
            id={`supplier-${field.name}`}
            label={field.label}
            inputMode="numeric"
            value={values[field.name]}
            maxLength={3}
            errors={errors[field.name] ?? []}
            onValueChange={(next) => onChange({ [field.name]: next })}
          />
        ))}
      </div>
    </fieldset>
  );
}
