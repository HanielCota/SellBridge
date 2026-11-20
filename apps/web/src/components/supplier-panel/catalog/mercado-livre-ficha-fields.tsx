import type { FichaField, MercadoLivreCategory } from "@sellbridge/marketplaces";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { inputIdOf, type PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import {
  MIN_TITLE_FOR_CATEGORY,
  measureNumber,
  measureWithUnit,
  VISIBLE_OPTIONAL_FIELDS,
} from "@/features/supplier-panel/catalog/mercado-livre-ficha";
import {
  type MercadoLivreFicha,
  mercadoLivreSuggestionsQuery,
} from "@/features/supplier-panel/catalog/use-mercado-livre-ficha";
import { FieldReason, type ReasonsByField } from "./field-reason";

interface FichaProps {
  supplierId: string;
  ficha: MercadoLivreFicha;
  values: PanelFormValues;
  errors: Readonly<Record<string, string>>;
  reasons: ReasonsByField;
  onChange: (change: Partial<PanelFormValues>) => void;
}

function SuggestionList({
  loading,
  categories,
  onChoose,
}: {
  loading: boolean;
  categories: readonly MercadoLivreCategory[] | null | undefined;
  onChoose: (category: MercadoLivreCategory) => void;
}) {
  if (loading) {
    return <p className="text-footnote text-muted-foreground">Buscando no Mercado Livre...</p>;
  }
  if (categories === null) {
    return (
      <p className="text-footnote text-destructive">
        O Mercado Livre não respondeu agora. Tente de novo em alguns minutos.
      </p>
    );
  }
  if (categories === undefined) {
    return null;
  }
  return (
    <ul className="grid gap-2" aria-label="Categorias sugeridas pelo Mercado Livre">
      {categories.map((category) => (
        <li key={category.id}>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full justify-start"
            onClick={() => onChoose(category)}
          >
            {category.name}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function CategoryChooser({
  supplierId,
  title,
  onChoose,
}: {
  supplierId: string;
  title: string;
  onChoose: (category: MercadoLivreCategory) => void;
}) {
  const [words, setWords] = useState(title);
  const [searched, setSearched] = useState(title.trim());
  const suggestions = useQuery({
    ...mercadoLivreSuggestionsQuery(supplierId, searched),
    enabled: searched.length >= 3,
  });
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setSearched(words.trim());
        }}
      >
        <TextField
          id="panel-product-ml-category-search"
          label="Descreva o produto em poucas palavras"
          value={words}
          errors={[]}
          placeholder="Ex.: bolsa infantil"
          onValueChange={setWords}
        />
        <Button type="submit" variant="outline" className="min-h-11">
          Buscar categorias
        </Button>
      </form>
      <SuggestionList
        loading={suggestions.isFetching}
        categories={suggestions.data}
        onChoose={onChoose}
      />
    </div>
  );
}

function categoryStatus(ficha: MercadoLivreFicha, title: string): string | null {
  if (ficha.category !== null) {
    return null;
  }
  if (ficha.unavailable) {
    return "O Mercado Livre não respondeu agora. Você pode continuar: a ficha aparece aqui quando ele voltar.";
  }
  if (title.trim().length < MIN_TITLE_FOR_CATEGORY) {
    return "Escreva o título do produto: o Mercado Livre sugere a categoria a partir dele.";
  }
  return "Procurando a categoria no Mercado Livre...";
}

/** Mercado Livre's guess for a saved grid: nothing changes until the supplier confirms it. */
function SuggestedCategory({
  suggestion,
  choosing,
  onUse,
  onToggleChooser,
}: {
  suggestion: MercadoLivreCategory;
  choosing: boolean;
  onUse: () => void;
  onToggleChooser: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-subhead">
        <span className="text-muted-foreground">Categoria sugerida no Mercado Livre: </span>
        <span className="font-semibold">{suggestion.name}</span>
      </p>
      <Button type="button" size="sm" className="min-h-11" onClick={onUse}>
        Usar esta categoria
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        aria-expanded={choosing}
        onClick={onToggleChooser}
      >
        {choosing ? "Fechar" : "Escolher outra"}
      </Button>
    </div>
  );
}

/** What the line says above the chooser: the guess to confirm, the category, or why none yet. */
function CategoryHeader({
  ficha,
  title,
  choosing,
  onUse,
  onToggleChooser,
}: {
  ficha: MercadoLivreFicha;
  title: string;
  choosing: boolean;
  onUse: (category: MercadoLivreCategory) => void;
  onToggleChooser: () => void;
}) {
  const { suggestion } = ficha;
  if (suggestion !== null && ficha.category === null) {
    return (
      <SuggestedCategory
        suggestion={suggestion}
        choosing={choosing}
        onUse={() => onUse(suggestion)}
        onToggleChooser={onToggleChooser}
      />
    );
  }
  const status = categoryStatus(ficha, title);
  if (status !== null) {
    return <p className="text-footnote text-muted-foreground">{status}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-subhead">
        <span className="text-muted-foreground">Categoria no Mercado Livre: </span>
        <span className="font-semibold">{ficha.category?.name}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        aria-expanded={choosing}
        onClick={onToggleChooser}
      >
        {choosing ? "Fechar" : "Trocar categoria"}
      </Button>
    </div>
  );
}

/** The category the listing goes to, with "Trocar" to pick another of Mercado Livre's. */
export function MercadoLivreCategoryLine(props: Omit<FichaProps, "errors" | "reasons">) {
  const { ficha, values, onChange } = props;
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="grid gap-3 sm:col-span-2">
      <CategoryHeader
        ficha={ficha}
        title={values.title}
        choosing={choosing}
        onUse={(category) => onChange({ mercadoLivreCategory: category })}
        onToggleChooser={() => setChoosing((open) => !open)}
      />
      {choosing ? (
        <CategoryChooser
          supplierId={props.supplierId}
          title={values.title}
          onChoose={(category) => {
            onChange({ mercadoLivreCategory: category });
            setChoosing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function fieldLabel(field: FichaField): string {
  const unit = field.kind === "measure" ? field.defaultUnit : null;
  const named = unit === null ? field.label : `${field.label} (${unit})`;
  return field.required ? `${named} (obrigatório)` : named;
}

/** An example to type after: Mercado Livre's own, else the first value it knows. */
function textPlaceholder(field: FichaField): string | undefined {
  const example = field.example ?? field.options[0] ?? null;
  return example === null ? undefined : `Ex.: ${example}`;
}

function FichaInput({
  field,
  value,
  error,
  onValueChange,
}: {
  field: FichaField;
  value: string;
  error: string | null;
  onValueChange: (value: string) => void;
}) {
  const id = inputIdOf(`attributes.${field.id}`);
  if (field.kind === "choice" || field.kind === "yes_no") {
    return (
      <SelectField
        id={id}
        label={fieldLabel(field)}
        value={value}
        error={error}
        placeholder="Escolha"
        options={field.options.map((option) => ({ value: option, label: option }))}
        {...(field.hint === null ? {} : { hint: field.hint })}
        onValueChange={onValueChange}
      />
    );
  }
  const unit = field.kind === "measure" ? field.defaultUnit : null;
  const listId = field.options.length === 0 ? undefined : `${id}-options`;
  return (
    <div className="grid gap-2">
      <TextField
        id={id}
        label={fieldLabel(field)}
        value={measureNumber(value, unit)}
        errors={error === null ? [] : [error]}
        list={listId}
        inputMode={field.kind === "measure" ? "decimal" : undefined}
        maxLength={field.maxLength ?? undefined}
        placeholder={textPlaceholder(field)}
        // Suggestions show while typing; the browser's arrow made the field look like an empty list.
        className={
          listId === undefined ? undefined : "[&::-webkit-calendar-picker-indicator]:hidden!"
        }
        onValueChange={(next) => onValueChange(measureWithUnit(next, unit))}
      />
      {listId === undefined ? null : (
        <datalist id={listId}>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </datalist>
      )}
      {field.hint === null ? null : (
        <p className="text-footnote text-muted-foreground">{field.hint}</p>
      )}
    </div>
  );
}

/**
 * The category's own sheet fields, the ones the form does not ask elsewhere: required first,
 * then the optional ones that make the listing complete, the long tail behind "Mostrar mais".
 */
export function MercadoLivreFichaFields(
  props: FichaProps & { askedElsewhere: ReadonlySet<string> },
) {
  const { ficha, values, errors, reasons, onChange, askedElsewhere } = props;
  const [showAll, setShowAll] = useState(false);
  if (ficha.fields === null) {
    return null;
  }
  const fields = ficha.fields.filter((field) => !askedElsewhere.has(field.id));
  const required = fields.filter((field) => field.required);
  const optional = fields.filter((field) => !field.required);
  const shownOptional = showAll ? optional : optional.slice(0, VISIBLE_OPTIONAL_FIELDS);
  const hidden = optional.length - shownOptional.length;
  return (
    <>
      {[...required, ...shownOptional].map((field) => {
        const key = `attributes.${field.id}`;
        return (
          <div key={field.id} className="grid content-start gap-2">
            <FichaInput
              field={field}
              value={values.attributes[field.id] ?? ""}
              error={errors[key] ?? null}
              onValueChange={(next) =>
                onChange({ attributes: { ...values.attributes, [field.id]: next } })
              }
            />
            <FieldReason field={key} reasons={reasons} />
          </div>
        );
      })}
      {hidden > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:col-span-2"
          onClick={() => setShowAll(true)}
        >
          Mostrar mais {hidden} {hidden === 1 ? "detalhe" : "detalhes"} do Mercado Livre
        </Button>
      ) : null}
    </>
  );
}
