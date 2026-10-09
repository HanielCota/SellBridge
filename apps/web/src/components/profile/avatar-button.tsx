import { CameraIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { UserAvatar } from "@/components/layout/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AvatarEditor } from "./avatar-editor";

/** The header avatar: a click opens the photo editor right there. */
export function AvatarButton({ name, image }: { name: string; image: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={image ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
        title={image ? "Trocar foto" : "Adicionar foto"}
        onClick={() => setOpen(true)}
        className="group relative shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        <UserAvatar name={name} image={image} />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <CameraIcon className="size-4" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Foto de perfil</DialogTitle>
            <DialogDescription>Ela aparece no topo do app, ao lado do seu nome.</DialogDescription>
          </DialogHeader>
          <AvatarEditor name={name} image={image} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
