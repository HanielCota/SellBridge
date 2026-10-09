import { CameraIcon, TrashIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import { ACCEPTED_AVATAR_TYPES, resizeAvatar } from "@/features/profile/resize-avatar";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

async function removeAvatar(): Promise<void> {
  const response = await fetch("/api/perfil/foto", { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Não foi possível remover a foto. Tente novamente.");
  }
}

function useAvatarActions(onDone?: () => void) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function run(action: () => Promise<void>, success: string) {
    setIsBusy(true);
    try {
      await action();
      await router.invalidate();
      toast.success(success);
      onDone?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function upload(file: File) {
    return run(async () => {
      const formData = new FormData();
      formData.append("file", await resizeAvatar(file), "avatar.webp");
      await postMultipart("/api/perfil/foto", formData);
    }, "Foto de perfil atualizada");
  }

  return { isBusy, upload, remove: () => run(removeAvatar, "Foto de perfil removida") };
}

/** Photo preview with add/replace/remove; used on the profile page and in the header modal. */
export function AvatarEditor({
  name,
  image,
  onDone,
}: {
  name: string;
  image: string | null;
  onDone?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isBusy, upload, remove } = useAvatarActions(onDone);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <UserAvatar name={name} image={image} className="size-24 text-3xl" />
      <div className="space-y-3 text-center sm:text-left">
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()}>
            <CameraIcon aria-hidden="true" />
            {image ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {image ? (
            <Button type="button" variant="outline" disabled={isBusy} onClick={() => void remove()}>
              <TrashIcon aria-hidden="true" />
              Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG ou WEBP. Recortamos no centro em formato quadrado.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_AVATAR_TYPES.join(",")}
          aria-label="Escolher foto de perfil"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the picker so choosing the same file again still triggers a change.
            if (inputRef.current) {
              inputRef.current.value = "";
            }
            if (file) {
              void upload(file);
            }
          }}
        />
      </div>
    </div>
  );
}
