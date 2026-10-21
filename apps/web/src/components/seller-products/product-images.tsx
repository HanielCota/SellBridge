import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postMultipart } from "@/features/support/upload";
import { isSupplierImageUrl } from "@sellbridge/shared/supplier-panel-image-urls";
import { errorMessage } from "@/lib/errors";

interface ImagesProps {
  images: readonly string[];
  onChange: (images: readonly string[]) => void;
  onBusy: (busy: boolean) => void;
  adminTenantId?: string | undefined;
  reason: string;
  disabled: boolean;
}

function usePhotoUpload(props: ImagesProps) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  async function upload(files: readonly File[]) {
    setError(null);
    setSending(true);
    props.onBusy(true);
    const urls: string[] = [];
    try {
      for (const file of files.slice(0, 20 - props.images.length)) {
        const form = new FormData();
        form.set("file", file);
        if (props.adminTenantId !== undefined) {
          form.set("tenantId", props.adminTenantId);
          form.set("reason", props.reason);
        }
        const result = z
          .object({ url: z.url() })
          .parse(
            await postMultipart(
              props.adminTenantId === undefined
                ? "/api/products/images"
                : "/api/admin/product-images",
              form,
            ),
          );
        urls.push(result.url);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      if (urls.length > 0) props.onChange([...props.images, ...urls]);
      setSending(false);
      props.onBusy(false);
    }
  }
  return { upload, sending, error };
}

function ImageLink({
  images,
  onChange,
  disabled,
}: Pick<ImagesProps, "images" | "onChange" | "disabled">) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  function add() {
    const url = link.trim();
    if (!isSupplierImageUrl(url)) {
      setError("Use um endereço de imagem que comece com HTTPS.");
      return;
    }
    if (images.includes(url)) {
      setError("Esta imagem já foi adicionada.");
      return;
    }
    onChange([...images, url]);
    setLink("");
    setError(null);
  }
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="seller-image-url">Endereço da imagem</Label>
          <Input
            id="seller-image-url"
            value={link}
            disabled={disabled}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
          />
        </div>
        <Button variant="secondary" disabled={disabled || link.trim() === ""} onClick={add}>
          Adicionar imagem
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

function ProductGallery({
  images,
  onChange,
  disabled,
}: Pick<ImagesProps, "images" | "onChange" | "disabled">) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {images.map((url, index) => (
        <li key={`${index}-${url}`} className="space-y-2 rounded-xl border border-border p-3">
          <img
            src={url}
            alt={`Imagem do produto ${index + 1}`}
            className="h-32 w-full rounded-lg object-contain"
          />
          <div className="flex flex-wrap gap-2">
            {index === 0 ? (
              <span className="text-sm">Capa</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  onChange([url, ...images.filter((_, position) => position !== index)])
                }
              >
                Definir como capa {index + 1}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(images.filter((_, position) => position !== index))}
            >
              Remover imagem {index + 1}
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ProductImages(props: ImagesProps) {
  const upload = usePhotoUpload(props);
  const disabled = props.disabled || upload.sending;
  return (
    <section aria-label="Imagens do produto" className="space-y-4">
      <h2 className="text-lg font-semibold">Imagens</h2>
      <p className="text-sm text-muted-foreground">
        Até 20 imagens PNG, JPG ou WebP, com até 5 MB cada. A primeira imagem é a capa.
      </p>
      <Label htmlFor="seller-image-files">Enviar imagens</Label>
      <input
        id="seller-image-files"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        disabled={disabled || props.images.length >= 20}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          const picker = event.currentTarget;
          picker.value = "";
          void upload.upload(files);
        }}
      />
      {upload.sending ? <output>Enviando imagens…</output> : null}
      <ImageLink
        images={props.images}
        onChange={props.onChange}
        disabled={disabled || props.images.length >= 20}
      />
      {upload.error ? (
        <p role="alert" className="text-sm text-destructive">
          {upload.error}
        </p>
      ) : null}
      <ProductGallery images={props.images} onChange={props.onChange} disabled={disabled} />
    </section>
  );
}
