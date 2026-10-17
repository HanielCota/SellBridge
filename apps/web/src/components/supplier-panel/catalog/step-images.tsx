import { RECOMMENDED_IMAGE_COUNT } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { ArrowUpIcon, ImageIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inputIdOf } from "@/features/supplier-panel/catalog/draft-form";
import { FieldReason } from "./field-reason";
import type { StepProps } from "./step-details";

const MAX_IMAGES = 20;

function isImageLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text);
}

function ImageRow({
  url,
  index,
  onRemove,
  onPromote,
}: {
  url: string;
  index: number;
  onRemove: () => void;
  onPromote: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-field-border bg-card p-2">
      <img
        src={url}
        alt={`Imagem ${index + 1}`}
        loading="lazy"
        className="size-16 shrink-0 rounded-xl bg-muted object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="text-footnote font-medium">{index === 0 ? "Capa" : `Imagem ${index + 1}`}</p>
        <p className="truncate text-footnote text-muted-foreground">{url}</p>
      </div>
      {index > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onPromote}
          aria-label={`Usar a imagem ${index + 1} como capa`}
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Remover a imagem ${index + 1}`}
      >
        <TrashIcon aria-hidden="true" />
      </Button>
    </li>
  );
}

/** Why a pasted link cannot be added, or null when it can. */
function linkProblem(url: string, images: readonly string[]): string | null {
  if (!isImageLink(url)) {
    return "Cole um link que comece com https://";
  }
  if (images.includes(url)) {
    return "Esta imagem já foi adicionada";
  }
  return null;
}

function AddImageForm({
  images,
  serverError,
  onAdd,
}: {
  images: readonly string[];
  serverError: string | undefined;
  onAdd: (url: string) => void;
}) {
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const full = images.length >= MAX_IMAGES;
  function add(event: FormEvent) {
    event.preventDefault();
    const url = link.trim();
    const problem = linkProblem(url, images);
    setLinkError(problem);
    if (problem !== null) {
      return;
    }
    setLink("");
    onAdd(url);
  }
  return (
    <form className="grid gap-2" onSubmit={add} noValidate>
      <Label htmlFor={inputIdOf("imageUrls")}>Link da imagem</Label>
      <div className="flex gap-2">
        <Input
          id={inputIdOf("imageUrls")}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={full}
          aria-invalid={linkError !== null || serverError !== undefined ? true : undefined}
        />
        <Button type="submit" variant="secondary" disabled={full}>
          Adicionar
        </Button>
      </div>
      <InlineFormError message={linkError ?? serverError ?? null} />
    </form>
  );
}

function ImageList({
  images,
  onChange,
}: {
  images: readonly string[];
  onChange: (imageUrls: string[]) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-field-border px-6 py-10 text-center text-sm text-muted-foreground">
        <ImageIcon className="size-7" weight="light" aria-hidden="true" />
        Nenhuma imagem ainda. Sem imagem o produto não pode ser enviado para análise.
      </div>
    );
  }
  const without = (index: number) => images.filter((_, position) => position !== index);
  return (
    <ol className="grid gap-2" aria-label="Imagens do produto">
      {images.map((url, index) => (
        <ImageRow
          key={url}
          url={url}
          index={index}
          onRemove={() => onChange(without(index))}
          onPromote={() => onChange([url, ...without(index)])}
        />
      ))}
    </ol>
  );
}

export function StepImages({ values, errors, reasons, onChange }: StepProps) {
  const images = values.imageUrls;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        A primeira imagem é a capa do anúncio. Recomendamos pelo menos {RECOMMENDED_IMAGE_COUNT},
        com fundo claro e o produto inteiro.
      </p>
      <FieldReason field="imageUrls" reasons={reasons} />
      <AddImageForm
        images={images}
        serverError={errors.imageUrls}
        onAdd={(url) => onChange({ imageUrls: [...images, url] })}
      />
      <ImageList images={images} onChange={(imageUrls) => onChange({ imageUrls })} />
    </div>
  );
}
