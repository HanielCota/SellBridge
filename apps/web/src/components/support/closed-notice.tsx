import { Button } from "@/components/ui/button";

/** Shown instead of the reply box on a closed ticket: notes stay possible, replies need a reopen. */
export function ClosedNotice({
  isChangingStatus,
  onReopen,
  onWriteNote,
}: {
  isChangingStatus: boolean;
  onReopen: () => void;
  onWriteNote: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed px-5 py-4">
      <p className="text-sm text-muted-foreground">Chamado encerrado. Reabra para responder.</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onWriteNote}>
          Nota interna
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isChangingStatus}
          onClick={onReopen}
        >
          Reabrir chamado
        </Button>
      </div>
    </div>
  );
}
