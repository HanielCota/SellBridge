import { CheckCircleIcon, CircleNotchIcon, XCircleIcon } from "@phosphor-icons/react";
import { FULFILLMENT_LABELS } from "@sellbridge/shared/schemas";
import {
  SUPPLIER_SCAN_MODES,
  type SupplierScanMode,
} from "@sellbridge/shared/supplier-panel-orders-schema";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scanSupplierShipmentFn } from "@/features/supplier-panel/orders/orders.functions";
import { supplierOrdersKey } from "@/features/supplier-panel/orders/orders.queries";
import { errorMessage } from "@/lib/errors";

const MODE_LABELS: Record<SupplierScanMode, string> = {
  picking: "Separação",
  dispatch: "Despacho",
};

const MODE_HINTS: Record<SupplierScanMode, string> = {
  picking: 'Separação: cada pacote lido fica "Pronto para envio".',
  dispatch: 'Despacho: cada pacote lido fica "Enviado", com o rastreio que já tem.',
};

/** Reads kept on screen: a busy afternoon of packing, without the page growing forever. */
const MAX_LOG_ENTRIES = 50;

type LogEntry =
  | { id: string; code: string; state: "pending" }
  | { id: string; code: string; state: "done" | "failed"; message: string };

function LogIcon({ entry }: { entry: LogEntry }) {
  if (entry.state === "pending") {
    return (
      <CircleNotchIcon aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
    );
  }
  if (entry.state === "done") {
    return (
      <CheckCircleIcon
        aria-hidden="true"
        weight="fill"
        className="size-5 text-emerald-600 dark:text-emerald-500"
      />
    );
  }
  return <XCircleIcon aria-hidden="true" weight="fill" className="size-5 text-destructive" />;
}

function entryText(entry: LogEntry): string {
  if (entry.state === "pending") {
    return "Conferindo…";
  }
  return entry.message;
}

/** Every read of this visit, newest first, said aloud as it lands. */
function ScanLog({ entries }: { entries: readonly LogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-subhead text-muted-foreground">
        Os pacotes lidos aparecem aqui, o mais recente primeiro.
      </p>
    );
  }
  return (
    <ol
      aria-label="Pacotes lidos"
      aria-live="polite"
      className="divide-y rounded-2xl ring-1 ring-border"
    >
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3 p-3">
          <LogIcon entry={entry} />
          <div className="min-w-0">
            <p className="font-medium break-all">{entry.code}</p>
            <p className="text-footnote text-muted-foreground">{entryText(entry)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Replaces one entry of the log by id; a new array, the old one is left as it was. */
function withEntry(entries: readonly LogEntry[], next: LogEntry): LogEntry[] {
  return entries.map((entry) => (entry.id === next.id ? next : entry));
}

/** What a successful read says: where the parcel is now. */
function doneMessage(result: Awaited<ReturnType<typeof scanSupplierShipmentFn>>): string {
  const step = FULFILLMENT_LABELS[result.status];
  if (result.moved) {
    return `Pedido ${result.externalOrderId}: ${step}.`;
  }
  return `Pedido ${result.externalOrderId} já estava em "${step}".`;
}

/** Every read of this visit: each one is listed at once and updated when the server answers. */
function useScanLog(supplierId: string) {
  const client = useQueryClient();
  const [entries, setEntries] = useState<readonly LogEntry[]>([]);
  const read = async (typed: string, mode: SupplierScanMode) => {
    const id = crypto.randomUUID();
    setEntries((previous) =>
      [{ id, code: typed, state: "pending" as const }, ...previous].slice(0, MAX_LOG_ENTRIES),
    );
    try {
      const result = await scanSupplierShipmentFn({ data: { supplierId, code: typed, mode } });
      setEntries((previous) =>
        withEntry(previous, { id, code: typed, state: "done", message: doneMessage(result) }),
      );
    } catch (error) {
      setEntries((previous) =>
        withEntry(previous, { id, code: typed, state: "failed", message: errorMessage(error) }),
      );
    }
    await client.invalidateQueries({ queryKey: supplierOrdersKey(supplierId) });
  };
  return { entries, read };
}

/** The big field the reader types into, with its button for typing by hand. */
function ScanField({
  input,
  onRead,
}: {
  input: RefObject<HTMLInputElement | null>;
  onRead: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = code.trim();
    if (typed === "") {
      return;
    }
    setCode("");
    input.current?.focus();
    onRead(typed);
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor="scan-code">Código do pedido ou do rastreio</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="scan-code"
          ref={input}
          autoComplete="off"
          maxLength={100}
          placeholder="Leia a etiqueta ou digite e tecle Enter"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="h-14 text-lg"
        />
        <Button type="submit" size="lg" className="h-14">
          Conferir
        </Button>
      </div>
    </form>
  );
}

/**
 * The barcode check: a reader types the order number or the tracking code and presses Enter,
 * and the parcel moves to the mode's step. The field takes the focus when the page opens and
 * keeps it, since reading labels is all this page is for: reads follow one another without
 * touching the screen.
 */
export function ScanCheck({ supplierId }: { supplierId: string }) {
  const [mode, setMode] = useState<SupplierScanMode>("picking");
  const log = useScanLog(supplierId);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <FilterTabs
          legend="O que a leitura faz"
          tabs={SUPPLIER_SCAN_MODES.map((value) => ({ value, label: MODE_LABELS[value] }))}
          value={mode}
          onChange={(next) => {
            setMode(next);
            input.current?.focus();
          }}
        />
        <p className="text-footnote text-muted-foreground">{MODE_HINTS[mode]}</p>
      </div>
      <ScanField input={input} onRead={(code) => void log.read(code, mode)} />
      <ScanLog entries={log.entries} />
    </div>
  );
}
