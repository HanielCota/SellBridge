import { ArrowUpIcon, ImageIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { isSupplierImageUrl } from "@sellbridge/shared/supplier-panel-image-urls";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inputIdOf } from "@/features/supplier-panel/catalog/draft-form";
import { PRODUCT_IMAGE_TYPES } from "@/features/supplier-panel/catalog/product-image-key";
import { useProductImageUpload } from "@/features/supplier-panel/catalog/use-product-image-upload";
import { FieldReason } from "./field-reason";
import type { StepProps } from "./step-details";

const MAX_IMAGES = 20;

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
    <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-field-border bg-card p-2">
      <img
        src={url}
        alt={`Imagem ${index + 1}`}
        loading="lazy"
        draggable={false}
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
  if (!isSupplierImageUrl(url)) {
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
      <Label htmlFor={inputIdOf("imageUrls")}>Ou cole o link da imagem</Label>
      <div className="flex gap-2">
        <Input
          id={inputIdOf("imageUrls")}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
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

const ACCEPTED_TYPES = Object.keys(PRODUCT_IMAGE_TYPES).join(",");

function UploadHint() {
  return (
    <p className="text-footnote text-muted-foreground">
      PNG, JPG ou WEBP de até 5 MB. Também dá para arrastar as fotos para cá.
    </p>
  );
}

/** Says how many photos are still on their way while they upload. */
function PickPhotosButton({
  disabled,
  sending,
  onPick,
}: {
  disabled: boolean;
  sending: number;
  onPick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full sm:w-auto sm:justify-self-start"
      disabled={disabled || sending > 0}
      onClick={onPick}
    >
      <UploadSimpleIcon aria-hidden="true" />
      {sending > 0
        ? `Enviando ${sending === 1 ? "imagem" : `${sending} imagens`}…`
        : "Enviar do celular ou computador"}
    </Button>
  );
}

/** Photos from the phone's gallery or camera, or the computer's folders: no link needed. */
function DeviceUpload({
  supplierId,
  images,
  onAdd,
}: {
  supplierId: string;
  images: readonly string[];
  onAdd: (urls: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, sending, error } = useProductImageUpload(supplierId);
  const room = MAX_IMAGES - images.length;
  async function send(files: readonly File[]) {
    const urls = await upload(files.slice(0, room));
    if (urls.length > 0) {
      onAdd(urls);
    }
  }
  async function picked(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // Clears the picker so choosing the same photo again still fires a change.
    if (input.current !== null) {
      input.current.value = "";
    }
    await send(files);
  }
  async function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    await send([...event.dataTransfer.files].filter((file) => file.type in PRODUCT_IMAGE_TYPES));
  }
  return (
    <div
      className="grid gap-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => void dropped(event)}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void picked(event)}
      />
      <PickPhotosButton
        disabled={room <= 0}
        sending={sending}
        onPick={() => input.current?.click()}
      />
      <UploadHint />
      <InlineFormError message={error} />
    </div>
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
        As imagens enviadas ou adicionadas por link aparecem aqui.
      </div>
    );
  }
  const without = (index: number) => images.filter((_, position) => position !== index);
  return (
    // min-w-0: a long link truncates instead of widening the whole step past its card.
    <ol className="grid min-w-0 gap-2" aria-label="Imagens do produto">
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

export function StepImages({
  values,
  errors,
  reasons,
  onChange,
  supplierId,
}: StepProps & { supplierId: string }) {
  const images = values.imageUrls;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">A primeira imagem é a capa do anúncio.</p>
      <FieldReason field="imageUrls" reasons={reasons} />
      <DeviceUpload
        supplierId={supplierId}
        images={images}
        onAdd={(urls) => onChange({ imageUrls: [...images, ...urls] })}
      />
      <AddImageForm
        images={images}
        serverError={errors.imageUrls}
        onAdd={(url) => onChange({ imageUrls: [...images, url] })}
      />
      <ImageList images={images} onChange={(imageUrls) => onChange({ imageUrls })} />
    </div>
  );
}
