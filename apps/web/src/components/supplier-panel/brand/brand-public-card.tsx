import { TextareaField } from "@/components/form/textarea-field";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { SectionCard } from "@/components/layout/section-card";
import { BrandIdentityFields } from "@/components/supplier-panel/brand/brand-identity-fields";
import { BrandPreview } from "@/components/supplier-panel/brand/brand-preview";
import type {
  BrandChange,
  BrandErrors,
  BrandValues,
} from "@/features/supplier-panel/brand/brand-form-values";

const DESCRIPTION_MAXIMUM = 10_000;

interface BrandPublicCardProps {
  values: BrandValues;
  errors: BrandErrors;
  categoryNames: readonly string[];
  logoUrl: string | null;
  onChange: BrandChange;
}

/** "Como os revendedores veem sua marca": the public fields beside a live catalog preview. */
export function BrandPublicCard({
  values,
  errors,
  categoryNames,
  logoUrl,
  onChange,
}: BrandPublicCardProps) {
  const count = values.description.length.toLocaleString("pt-BR");
  return (
    <SectionCard
      title="Como os revendedores veem sua marca"
      description="Aparece no catálogo e na página da sua marca."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <BrandIdentityFields
            values={values}
            errors={errors}
            categoryNames={categoryNames}
            onChange={onChange}
          />
          <div className="grid gap-2">
            <TextareaField
              id="brand-description"
              label="Descrição"
              hint={TERM_HINTS.brandDescription}
              placeholder="Ex.: Confecção própria em Divinópolis. Coleções novas a cada 45 dias. Pedido mínimo de 6 peças."
              value={values.description}
              maxLength={DESCRIPTION_MAXIMUM}
              errors={errors.description ?? []}
              onValueChange={(description) => onChange({ description })}
            />
            <div className="flex items-start justify-between gap-3 text-footnote text-muted-foreground">
              <p>
                Conte se a produção é própria, de quanto em quanto tempo chegam novidades e se há
                pedido mínimo.
              </p>
              <p className="shrink-0 tabular-nums">{count} de 10.000</p>
            </div>
          </div>
        </div>
        <div className="order-first lg:order-none">
          <BrandPreview
            name={values.name}
            niche={values.niche}
            city={values.city}
            state={values.state}
            description={values.description}
            logoUrl={logoUrl}
          />
        </div>
      </div>
    </SectionCard>
  );
}
