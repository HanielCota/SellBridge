import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LABEL_FILE_ACCEPT, readLabelAddress } from "@/features/fulfillment/label-file";
import type { LabelAddress } from "@/features/fulfillment/shipping-label";
import { errorMessage } from "@/lib/errors";

/** Fields the forward form needs before it can send: a label missing any of them is flagged. */
const REQUIRED_FIELDS = [
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "postalCode",
] as const;

/**
 * Reads the buyer's address from the shipping label the marketplace issued (PDF, photo, ZPL, TXT) and
 * fills the forward form with it. The file is read in the browser and never uploaded.
 */
function LabelImportButton({ onAddress }: { onAddress: (address: LabelAddress) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const read = useMutation({
    mutationFn: readLabelAddress,
    onSuccess: (address) => {
      if (Object.keys(address).length === 0) {
        toast.error("Não encontramos o endereço nesta etiqueta. Preencha os campos abaixo.");
        return;
      }
      onAddress(address);
      const missing = REQUIRED_FIELDS.filter((key) => address[key] === undefined);
      if (missing.length > 0) {
        toast.warning("Parte do endereço não estava na etiqueta. Complete os campos vazios.");
        return;
      }
      toast.success("Endereço lido da etiqueta. Confira os campos antes de encaminhar.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button
        variant="outline"
        type="button"
        disabled={read.isPending}
        onClick={() => input.current?.click()}
      >
        <FileArrowUpIcon aria-hidden="true" />
        {read.isPending ? "Lendo etiqueta…" : "Preencher com a etiqueta"}
      </Button>
      <input
        ref={input}
        type="file"
        accept={LABEL_FILE_ACCEPT}
        hidden
        aria-label="Arquivo da etiqueta de envio"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so the same file can be picked again after the reseller edits the fields.
          if (input.current !== null) input.current.value = "";
          if (file === undefined) return;
          read.mutate(file);
        }}
      />
    </>
  );
}

/** The ways to fill the buyer's address: the label file, and the marketplace's own API. */
export function AddressImportBar({
  onAddress,
  marketplaceImport,
}: {
  onAddress: (address: LabelAddress) => void;
  marketplaceImport: { isPending: boolean; mutate: () => void } | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <LabelImportButton onAddress={onAddress} />
      {marketplaceImport === null ? null : (
        <Button
          variant="outline"
          type="button"
          disabled={marketplaceImport.isPending}
          onClick={() => marketplaceImport.mutate()}
        >
          Importar endereço do marketplace
        </Button>
      )}
    </div>
  );
}
