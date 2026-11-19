import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useReconnectResume } from "@/features/stores/use-reconnect-resume";

export interface ReconnectedStore {
  id: string;
  /** "Loja "Ana Moda" conectada". */
  title: string;
  /** Listings the disconnection paused. */
  pausedListings: number;
}

const RESUME_OPTION_ID = "reconnect-resume-listings";

/** The button names what it does: resume or keep paused, following the checkbox. */
function finishLabel(resume: boolean, count: number): string {
  if (resume) {
    return count === 1 ? "Reativar o anúncio" : "Reativar os anúncios";
  }
  return count === 1 ? "Manter pausado" : "Manter pausados";
}

function resumeLabel(count: number): string {
  return count === 1
    ? "Reativar o anúncio que foi pausado quando a loja foi desconectada"
    : `Reativar os ${count.toLocaleString("pt-BR")} anúncios que foram pausados quando a loja foi desconectada`;
}

/**
 * Asked once the store is back: resuming is checked, since the disconnection only paused them to
 * stop selling without stock sync. Open while `store` is set.
 */
export function ReconnectResumeDialog({
  store,
  onClose,
}: {
  store: ReconnectedStore | null;
  onClose: () => void;
}) {
  const mutation = useReconnectResume(onClose);
  const [resume, setResume] = useState(true);
  const finish = () => {
    if (store === null) {
      return;
    }
    if (resume) {
      mutation.mutate(store.id);
      return;
    }
    toast.success("Anúncios continuam pausados", {
      description: "Reative quando quiser em Publicações.",
    });
    onClose();
  };
  return (
    <Dialog open={store !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{store?.title ?? "Loja conectada"}</DialogTitle>
          <DialogDescription>
            Os anúncios desta loja ficaram com estoque zero no marketplace enquanto ela estava
            desconectada.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
          <Checkbox
            id={RESUME_OPTION_ID}
            checked={resume}
            onCheckedChange={(state) => setResume(state === true)}
            className="mt-0.5"
          />
          <div className="grid min-w-0 gap-1">
            <Label htmlFor={RESUME_OPTION_ID} className="leading-snug">
              {resumeLabel(store?.pausedListings ?? 0)}
            </Label>
            <p className="text-footnote leading-normal text-muted-foreground">
              Antes de reativar, o SellBridge confere o lucro de cada um. O que daria prejuízo
              continua pausado, com o motivo em Publicações. Os anúncios que você pausou continuam
              pausados.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={mutation.isPending} onClick={finish}>
            {mutation.isPending ? "Reativando…" : finishLabel(resume, store?.pausedListings ?? 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
