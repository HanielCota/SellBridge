import { formatCents, formatCentsForInput, parseBrlToCents } from "@sellbridge/shared/money";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimateProfit } from "@/features/listings/profit";
import { useUpdatePrice } from "@/features/listings/use-listing-actions";

interface EditPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: { listingId: string; title: string; priceCents: number; costCents: number };
}

function priceProblem(priceCents: number | null, costCents: number): string | null {
  if (priceCents === null || priceCents <= 0) {
    return "Informe um preço válido";
  }
  if (priceCents <= costCents) {
    return `O preço precisa ser maior que o custo (${formatCents(costCents)})`;
  }
  return null;
}

function EditPriceForm({
  listing,
  onDone,
}: {
  listing: EditPriceDialogProps["listing"];
  onDone: () => void;
}) {
  const [value, setValue] = useState(formatCentsForInput(listing.priceCents));
  const mutation = useUpdatePrice(onDone);
  const priceCents = parseBrlToCents(value);
  const problem = priceProblem(priceCents, listing.costCents);
  const estimate = problem ? null : estimateProfit(priceCents, listing.costCents);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (priceCents !== null && !problem) {
          mutation.mutate({ listingId: listing.listingId, priceCents });
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="listing-price">Preço de venda (R$)</Label>
        <Input
          id="listing-price"
          inputMode="decimal"
          value={value}
          aria-invalid={problem !== null}
          aria-describedby="listing-price-hint"
          onChange={(event) => setValue(event.target.value)}
        />
        <p
          id="listing-price-hint"
          className={problem ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {problem ??
            `Lucro estimado ${formatCents(estimate?.profitCents ?? 0)} · margem de ${(estimate?.marginPercent ?? 0).toLocaleString("pt-BR")}% (custo ${formatCents(listing.costCents)} e taxa média do marketplace)`}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={problem !== null || mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar preço"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** New sale price for every store; the sync job sends it to the marketplaces. */
export function EditPriceDialog({ open, onOpenChange, listing }: EditPriceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar preço</DialogTitle>
          <DialogDescription>
            {listing.title}. O novo preço vale para todas as lojas.
          </DialogDescription>
        </DialogHeader>
        {open ? <EditPriceForm listing={listing} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
