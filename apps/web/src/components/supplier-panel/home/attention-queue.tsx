import {
  ATTENTION_SEVERITY_LABELS,
  type AttentionSeverity,
  type SupplierAttentionItem,
  type SupplierAttentionTarget,
} from "@sellbridge/shared/supplier-panel-attention";
import {
  CaretRightIcon,
  ChartLineDownIcon,
  ClockCountdownIcon,
  EnvelopeSimpleIcon,
  PackageIcon,
  WarningOctagonIcon,
} from "@phosphor-icons/react";
import { ChecklistDoneIcon } from "@/components/reports/attention-icons";
import { cn } from "@/lib/utils";

/** Same tints as the reseller's "Precisa de você", one per severity. */
const SEVERITY_CLASSES: Record<AttentionSeverity, string> = {
  critical: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

/** One icon per kind of problem, so the queue scans by shape as well as by tint. */
function ItemIcon({ item }: { item: SupplierAttentionItem }) {
  const props = { className: "size-4", "aria-hidden": true } as const;
  if (item.target.area === "stock") {
    return <PackageIcon {...props} />;
  }
  if (item.target.area === "performance") {
    return <ChartLineDownIcon {...props} />;
  }
  if (item.target.filter === "delivery_failed") {
    return <EnvelopeSimpleIcon {...props} />;
  }
  if (item.severity === "critical") {
    return <WarningOctagonIcon {...props} />;
  }
  return <ClockCountdownIcon {...props} />;
}

function AllClear() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
        <ChecklistDoneIcon className="size-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="max-w-64 text-sm text-muted-foreground">
        <span className="block text-subhead font-medium text-foreground">Tudo em dia</span>
        Nenhum pedido atrasado, produto zerado com anúncio ativo ou métrica em risco.
      </p>
    </div>
  );
}

function QueueRow({ item, href }: { item: SupplierAttentionItem; href: string }) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          SEVERITY_CLASSES[item.severity],
        )}
      >
        <ItemIcon item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{item.title}</span>
          {/* The tier in words too, so severity never depends on color alone. */}
          <span className="text-caption font-medium text-muted-foreground uppercase">
            {ATTENTION_SEVERITY_LABELS[item.severity]}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
      </span>
      <CaretRightIcon className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}

interface AttentionQueueProps {
  items: readonly SupplierAttentionItem[];
  /** Where each item is fixed; the panel's routes decide the paths. */
  hrefFor: (target: SupplierAttentionTarget) => string;
}

/** "Precisa de você": everything only the supplier can fix, critical first, never buried. */
export function AttentionQueue({ items, hrefFor }: AttentionQueueProps) {
  const critical = items.filter((item) => item.severity === "critical").length;
  return (
    <section
      aria-labelledby="supplier-attention-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <div className="-my-1 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2
          id="supplier-attention-title"
          className="text-subhead font-medium text-muted-foreground"
        >
          Precisa de você
        </h2>
        {critical > 0 ? (
          <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-footnote font-medium text-destructive">
            {critical} {critical === 1 ? "crítico" : "críticos"}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <AllClear />
      ) : (
        <ul className="-mx-2 mt-4 space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <QueueRow item={item} href={hrefFor(item.target)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
