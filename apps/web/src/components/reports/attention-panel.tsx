import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  CaretRightIcon,
  CheckCircleIcon,
  PlugsIcon,
  QuestionIcon,
  WarningIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";

interface AttentionItem {
  key: string;
  icon: PhosphorIcon;
  tone: "danger" | "info";
  title: string;
  description: string;
  to: NonNullable<LinkProps["to"]>;
}

interface StoreState {
  id: string;
  name: string;
  status: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function buildItems(
  failedListings: number,
  answeredTickets: number,
  stores: readonly StoreState[],
): AttentionItem[] {
  const items: AttentionItem[] = stores
    .filter((store) => store.status === "expired" || store.status === "error")
    .map((store) => ({
      key: `store-${store.id}`,
      icon: PlugsIcon,
      tone: "danger",
      title: `Reconecte ${store.name}`,
      description: "O acesso expirou: pedidos e estoque estão parados nesta loja.",
      to: "/lojas",
    }));
  if (failedListings > 0) {
    items.push({
      key: "listings",
      icon: WarningIcon,
      tone: "danger",
      title: plural(failedListings, "publicação com erro", "publicações com erro"),
      description: "Veja o motivo e reprocesse.",
      to: "/publicacoes",
    });
  }
  if (answeredTickets > 0) {
    items.push({
      key: "tickets",
      icon: QuestionIcon,
      tone: "info",
      title: plural(answeredTickets, "resposta do suporte", "respostas do suporte"),
      description: "A equipe respondeu seu chamado.",
      to: "/suporte",
    });
  }
  return items;
}

const TONE_CLASSES = {
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
} as const;

/** The short list of things only the reseller can fix, ranked by urgency. */
export function AttentionPanel({ stores }: { stores: readonly StoreState[] }) {
  const counts = useQuery(attentionCountsQueryOptions());
  const items = buildItems(
    counts.data?.failedListings ?? 0,
    counts.data?.answeredTickets ?? 0,
    stores,
  );
  return (
    <section aria-labelledby="attention-title" className="h-full rounded-3xl bg-card p-5">
      <div className="flex h-10 items-center">
        <h2 id="attention-title" className="text-[15px] font-medium text-muted-foreground">
          Precisa de você
        </h2>
      </div>
      {items.length === 0 ? (
        <div className="mt-4 flex items-start gap-3">
          <CheckCircleIcon
            className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            <span className="block font-medium text-foreground">Tudo em dia</span>
            Nenhuma loja desconectada, publicação com erro ou resposta pendente.
          </p>
        </div>
      ) : (
        <ul className="-mx-2 mt-3 space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[item.tone]}`}
                >
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <CaretRightIcon
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
