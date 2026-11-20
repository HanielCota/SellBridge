import {
  ArrowClockwiseIcon,
  CheckIcon,
  ClockIcon,
  ReceiptIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { accessKeyFormatProblem } from "@sellbridge/shared/nfe-access-key";
import { MAX_NFE_XML_BYTES } from "@sellbridge/shared/nfe-xml";
import type { ResellerInvoiceSource } from "@sellbridge/shared/reseller-invoice";
import { formatAccessKey } from "@sellbridge/shared/supplier-invoice";
import { useRef, useState } from "react";
import { TonePill } from "@/components/data/tone-status";
import { FloatingTextField } from "@/components/form/floating-field";
import { Button } from "@/components/ui/button";
import {
  saveResellerSaleNoteFn,
  uploadResellerSaleNoteXmlFn,
} from "@/features/fulfillment/reseller-sale-note.functions";
import { retryResellerSaleNoteFn } from "@/features/reseller-bling/reseller-bling.functions";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

export interface ResellerSaleNote {
  accessKey: string | null;
  number: string | null;
  series: string | null;
  source: ResellerInvoiceSource | null;
  foundAt: Date | null;
  problem: string | null;
  /** The reseller's own Bling issues it. */
  issuedByErp: boolean;
  /** The Bling stopped on it; `problem` says why. */
  erpStopped: boolean;
}

const SOURCE_LABELS: Record<ResellerInvoiceSource, string> = {
  marketplace: "Lida no pedido do marketplace",
  typed: "Chave informada por você",
  uploaded: "XML enviado por você ao Mercado Livre",
  bling: "Emitida pelo seu Bling",
};

/** Mercado Livre takes the note only as its XML: a typed key never reaches it. */
function wantsXml(marketplace: string): boolean {
  return marketplace === "mercado_livre";
}

/** The XML file and its send: read in the browser, checked and sent on by the server. */
function useXmlUpload(shipmentId: string, onSaved: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  async function send(file: File) {
    setError(null);
    if (file.size > MAX_NFE_XML_BYTES) {
      setError(
        "Este arquivo é grande demais para ser o XML de uma nota. Confira se é o .xml da nota.",
      );
      return;
    }
    setIsSending(true);
    try {
      await uploadResellerSaleNoteXmlFn({ data: { shipmentId, xml: await file.text() } });
      await onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setIsSending(false);
    }
  }
  return { error, isSending, send };
}

/**
 * "Enviar o XML da nota": picks the file Mercado Livre needs to let the label out and sends it at
 * once. The browser's own file field is hidden: its text follows the browser's language.
 */
function XmlUploadForm({
  shipmentId,
  onSaved,
}: {
  shipmentId: string;
  onSaved: () => Promise<void>;
}) {
  const upload = useXmlUpload(shipmentId, onSaved);
  const input = useRef<HTMLInputElement>(null);
  const errorId = `reseller-note-xml-${shipmentId}-error`;
  return (
    <div className="grid gap-3">
      <input
        ref={input}
        type="file"
        accept=".xml,application/xml,text/xml"
        aria-label="Arquivo XML da nota (.xml)"
        tabIndex={-1}
        className="sr-only"
        disabled={upload.isSending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const picker = event.currentTarget;
          // Cleared so the same file can be picked again after the reseller fixes it.
          picker.value = "";
          if (file !== undefined) {
            void upload.send(file);
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={upload.isSending}
        aria-describedby={upload.error === null ? undefined : errorId}
        className="min-h-11 w-full sm:w-fit"
        onClick={() => input.current?.click()}
      >
        <UploadSimpleIcon aria-hidden="true" />
        {upload.isSending ? "Enviando…" : "Enviar o XML da nota"}
      </Button>
      {upload.error === null ? null : (
        <output id={errorId} className="block text-footnote text-destructive">
          {upload.error}
        </output>
      )}
    </div>
  );
}

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
  marketplace,
  onSaved,
}: {
  note: ResellerSaleNote;
  shipmentId: string;
  marketplace: string;
  onSaved: () => Promise<void>;
}) {
  const xml = wantsXml(marketplace);
  return (
    <>
      <p className="text-subhead text-muted-foreground">
        Nesta venda, quem emite a nota para o comprador é a sua empresa (venda à ordem). Emita no
        seu sistema (UpSeller, Bling ou outro) e envie ao marketplace: o SellBridge encontra a nota
        no pedido sozinho.{" "}
        {xml
          ? "Se o seu sistema não enviar, mande aqui o arquivo XML da nota: o SellBridge envia ao Mercado Livre."
          : "Se ela não aparecer aqui, cole a chave de acesso."}
      </p>
      {note.problem === null ? null : (
        <output className="block text-footnote text-amber-700 dark:text-amber-400">
          {note.problem}
        </output>
      )}
      {xml ? (
        <XmlUploadForm shipmentId={shipmentId} onSaved={onSaved} />
      ) : (
        <TypedKeyForm shipmentId={shipmentId} onSaved={onSaved} />
      )}
    </>
  );
}

/** A key typed before, on Mercado Livre: the supplier's notes go on, but the label waits for it. */
function MissingOnMarketplace({
  shipmentId,
  onSaved,
}: {
  shipmentId: string;
  onSaved: () => Promise<void>;
}) {
  return (
    <div className="grid gap-3 rounded-xl bg-amber-500/10 p-3">
      <p className="text-subhead">
        O Mercado Livre ainda não tem esta nota, e a etiqueta só sai com ela. Envie o arquivo XML da
        nota: o SellBridge manda para o Mercado Livre.
      </p>
      <XmlUploadForm shipmentId={shipmentId} onSaved={onSaved} />
    </div>
  );
}

/** "Tentar de novo": the note goes back to the reseller's Bling. */
function useErpRetry(shipmentId: string, onSaved: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  async function retry() {
    setError(null);
    setIsSending(true);
    try {
      await retryResellerSaleNoteFn({ data: { shipmentId } });
      await onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setIsSending(false);
    }
  }
  return { error, isSending, retry };
}

/** The Bling stopped: why, the retry, and the XML as the way out. */
function ErpStopped({
  note,
  shipmentId,
  onSaved,
}: {
  note: ResellerSaleNote;
  shipmentId: string;
  onSaved: () => Promise<void>;
}) {
  const retry = useErpRetry(shipmentId, onSaved);
  return (
    <div className="grid gap-3">
      <output className="block text-subhead text-destructive">{note.problem}</output>
      <Button
        type="button"
        disabled={retry.isSending}
        className="min-h-11 w-full sm:w-fit"
        onClick={() => void retry.retry()}
      >
        <ArrowClockwiseIcon aria-hidden="true" />
        {retry.isSending ? "Pedindo…" : "Tentar de novo"}
      </Button>
      {retry.error === null ? null : (
        <output className="block text-footnote text-destructive">{retry.error}</output>
      )}
      <p className="text-subhead text-muted-foreground">
        Se preferir, emita a nota no seu sistema e envie o XML: o SellBridge manda para o Mercado
        Livre.
      </p>
      <XmlUploadForm shipmentId={shipmentId} onSaved={onSaved} />
    </div>
  );
}

function WaitingPill({ note }: { note: ResellerSaleNote }) {
  if (note.erpStopped) {
    return (
      <TonePill
        tone="danger"
        label="Parada no seu Bling"
        icon={<WarningCircleIcon aria-hidden="true" className="size-3.5" />}
      />
    );
  }
  return (
    <TonePill
      tone="warning"
      label={note.issuedByErp ? "Seu Bling está emitindo" : "Esperando a sua nota"}
      icon={<ClockIcon aria-hidden="true" className="size-3.5" />}
    />
  );
}

function MissingNote({
  note,
  shipmentId,
  marketplace,
  onSaved,
}: {
  note: ResellerSaleNote;
  shipmentId: string;
  marketplace: string;
  onSaved: () => Promise<void>;
}) {
  if (note.erpStopped) {
    return <ErpStopped note={note} shipmentId={shipmentId} onSaved={onSaved} />;
  }
  if (note.issuedByErp) {
    return (
      <p className="text-subhead text-muted-foreground">
        O seu Bling está emitindo esta nota para o comprador. Assim que a SEFAZ autorizar, o
        SellBridge manda a nota para o Mercado Livre, e as notas do fornecedor seguem.
      </p>
    );
  }
  return (
    <WaitingNote note={note} shipmentId={shipmentId} marketplace={marketplace} onSaved={onSaved} />
  );
}

/**
 * The reseller's own sale NF-e of a venda à ordem parcel: found on the marketplace's order,
 * typed or sent as XML here, or issued by the reseller's own Bling. The supplier's notes wait
 * for it.
 */
export function ResellerSaleNoteCard({
  shipmentId,
  marketplace,
  note,
  onSaved,
}: {
  shipmentId: string;
  marketplace: string;
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
          <WaitingPill note={note} />
        ) : (
          <TonePill
            tone="success"
            label={foundLabel}
            icon={<CheckIcon aria-hidden="true" className="size-3.5" />}
          />
        )}
      </div>
      {accessKey === null ? (
        <MissingNote
          note={note}
          shipmentId={shipmentId}
          marketplace={marketplace}
          onSaved={onSaved}
        />
      ) : (
        <FoundNote note={note} keyDigits={accessKey} />
      )}
      {accessKey !== null && note.source === "typed" && wantsXml(marketplace) ? (
        <MissingOnMarketplace shipmentId={shipmentId} onSaved={onSaved} />
      ) : null}
    </section>
  );
}
