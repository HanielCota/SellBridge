import { formatCep, normalizeCep } from "@sellbridge/shared/cep";
import { MapPinIcon } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { adminUpdateCustomerRegion } from "@/features/admin/customers.functions";
import { SectionCard } from "@/components/layout/section-card";
import { useAdminAction } from "@/features/admin/use-admin-action";

interface RegionFormProps {
  userId: string;
  region: { cep: string; city: string; state: string } | null;
}

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function CustomerRegionForm({ userId, region }: RegionFormProps) {
  const [cep, setCep] = useState(region ? formatCep(region.cep) : "");
  const [error, setError] = useState<string | null>(null);
  const save = useAdminAction(
    (value: string) => adminUpdateCustomerRegion({ data: { userId, cep: value } }),
    "Região do cliente atualizada",
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalizeCep(cep) === null) {
      setError("Informe um CEP com 8 dígitos");
      return;
    }
    setError(null);
    save.mutate(cep);
  }

  return (
    <SectionCard title="Região" description="Define quais fornecedores entregam para o cliente.">
      <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <MapPinIcon className="size-4" aria-hidden="true" />
        {region ? (
          <span>
            Atual:{" "}
            <span className="font-medium text-foreground">
              {region.city} - {region.state}
            </span>
          </span>
        ) : (
          "O cliente ainda não informou a região."
        )}
      </p>
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <div className="sm:w-56">
          <TextField
            id="customer-cep"
            label="CEP"
            inputMode="numeric"
            placeholder="00000-000"
            value={cep}
            errors={error ? [error] : []}
            onValueChange={(value) => setCep(maskCep(value))}
          />
        </div>
        <Button
          type="submit"
          className="sm:mt-6.5"
          disabled={
            save.isPending || normalizeCep(cep) === (region ? normalizeCep(region.cep) : null)
          }
        >
          {save.isPending ? "Consultando CEP..." : "Salvar região"}
        </Button>
      </form>
    </SectionCard>
  );
}
