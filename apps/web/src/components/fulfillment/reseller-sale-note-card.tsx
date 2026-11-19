import { CheckIcon, ClockIcon, ReceiptIcon } from "@phosphor-icons/react";
import { accessKeyFormatProblem } from "@sellbridge/shared/nfe-access-key";
import { formatAccessKey } from "@sellbridge/shared/supplier-invoice";
import { useState } from "react";
import { TonePill } from "@/components/data/tone-status";
import { FloatingTextField } from "@/components/form/floating-field";
import { Button } from "@/components/ui/button";
import { saveResellerSaleNoteFn } from "@/features/fulfillment/reseller-sale-note.functions";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

export interface ResellerSaleNote {
  accessKey: string | null;
  number: string | null;
  series: string | null;
  source: "marketplace" | "typed" | null;
  foundAt: Date | null;
  problem: string | null;
}

const SOURCE_LABELS = {
  marketplace: "Lida no pedido do marketplace",
  typed: "Chave informada por você",
} as const;

function FoundNote({ note, keyDigits }: { note: ResellerSaleNote; keyDigits: string }) {
  const series = note.series === null ? "" : ` · série ${note.series}`;
  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-footnote text-muted-foreground">Número</dt>
          <dd className="font-medium">{`Nota ${note.number ?? "sem número"}${series}`}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-footnote text-muted-foreground">De onde veio</dt>
          <dd className="font-medium">{note.source === null ? "—" : SOURCE_LABELS[note.source]}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-footnote text-muted-foreground">Chave de acesso</dt>
          <dd className="font-mono text-footnote break-words">{formatAccessKey(keyDigits)}</dd>
        </div>
      </dl>
      <p className="text-footnote text-muted-foreground">
        O fornecedor usa esta nota nas notas dele: a de remessa, que vai na caixa, e a de venda para
        a sua empresa.
      </p>
    </>
  );
}

/**
 * The typed key and its save: the format is checked before the server is asked, and the error
 * shows once the reseller tried to save (never while the key is still being pasted).
 */
function useTypedKey(shipmentId: string, onSaved: () => Promise<void>) {
  const [accessKey, setAccessKey] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const formatProblem = accessKeyFormatProblem(accessKey);
  const shownError = serverError ?? (hasTried ? formatProblem : null);
  function change(next: string) {
    setAccessKey(next);
    setServerError(null);
  }
  async function save() {
    setHasTried(true);
    setServerError(null);
    if (formatProblem !== null || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await saveResellerSaleNoteFn({ data: { shipmentId, accessKey } });
      await onSaved();
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }
  return { accessKey, shownError, isSaving, change, save };
}

/** The key typed by hand, checked as it is typed and by the server on save. */
function TypedKeyForm({
  shipmentId,
  onSaved,
}: {
  shipmentId: string;
  onSaved: () => Promise<void>;
}) {
  const { accessKey, shownError, isSaving, change, save } = useTypedKey(shipmentId, onSaved);
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FloatingTextField
        id={`reseller-note-key-${shipmentId}`}
        label="Chave de acesso da sua nota (44 números)"
        inputMode="numeric"
        autoComplete="off"
        value={accessKey}
        errors={shownError === null ? [] : [shownError]}
        onValueChange={change}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={isSaving}
        className="min-h-11 w-full sm:w-fit"
      >
        {isSaving ? "Salvando…" : "Salvar chave"}
      </Button>
    </form>
  );
}

function WaitingNote({
  note,
  shipmentId,
  onSaved,
}: {
  note: ResellerSaleNote;
  shipmentId: string;
  onSaved: () => Promise<void>;
}) {
  return (
    <>
      <p className="text-subhead text-muted-foreground">
        Nesta venda, quem emite a nota para o comprador é a sua empresa (venda à ordem). Emita no
        seu sistema (UpSeller, Bling ou outro) e envie ao marketplace: o SellBridge encontra a nota
        no pedido sozinho. Se ela não aparecer aqui, cole a chave de acesso.
      </p>
      {note.problem === null ? null : (
        <output className="block text-footnote text-amber-700 dark:text-amber-400">
          {note.problem}
        </output>
      )}
      <TypedKeyForm shipmentId={shipmentId} onSaved={onSaved} />
    </>
  );
}

/**
 * The reseller's own sale NF-e of a venda à ordem parcel: found on the marketplace's order or
 * typed here. The supplier's notes wait for it.
 */
export function ResellerSaleNoteCard({
  shipmentId,
  note,
  onSaved,
}: {
  shipmentId: string;
  note: ResellerSaleNote;
  onSaved: () => Promise<void>;
}) {
  const accessKey = note.accessKey;
  const foundLabel =
    note.foundAt === null ? "Nota recebida" : `Nota recebida · ${formatAbsoluteTime(note.foundAt)}`;
  return (
    <section aria-label="Sua nota de venda" className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-subhead font-semibold">
          <ReceiptIcon aria-hidden="true" className="size-5" />
          Sua nota de venda
        </h3>
        {accessKey === null ? (
          <TonePill
            tone="warning"
            label="Esperando a sua nota"
            icon={<ClockIcon aria-hidden="true" className="size-3.5" />}
          />
        ) : (
          <TonePill
            tone="success"
            label={foundLabel}
            icon={<CheckIcon aria-hidden="true" className="size-3.5" />}
          />
        )}
      </div>
      {accessKey === null ? (
        <WaitingNote note={note} shipmentId={shipmentId} onSaved={onSaved} />
      ) : (
        <FoundNote note={note} keyDigits={accessKey} />
      )}
    </section>
  );
}
