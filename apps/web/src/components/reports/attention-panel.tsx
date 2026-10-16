import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CaretRightIcon } from "@phosphor-icons/react";
import { ChecklistDoneIcon } from "@/components/reports/attention-icons";
import { buildAttentionItems, type StoreState } from "@/components/reports/attention-items";
import { billingNoticeQueryOptions } from "@/features/billing/billing.queries";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";

const TONE_CLASSES = {
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  review: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
} as const;

/** Centered in the card: an all-clear is a state of its own, not a list that ran short. */
function AllClear() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
        <ChecklistDoneIcon className="size-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="max-w-60 text-sm text-muted-foreground">
        <span className="block text-subhead font-medium text-foreground">Tudo em dia</span>
        Nenhuma loja desconectada, publicação com erro, resposta ou avaliação pendente.
      </p>
    </div>
  );
}

/** The short list of things only the reseller can fix, ranked by urgency. */
export function AttentionPanel({ stores }: { stores: readonly StoreState[] }) {
  const counts = useQuery(attentionCountsQueryOptions());
  const notice = useQuery(billingNoticeQueryOptions());
  const items = buildAttentionItems(
    {
      failedListings: counts.data?.failedListings ?? 0,
      unreadSupportReplies: counts.data?.unreadSupportReplies ?? 0,
      pendingReviews: counts.data?.pendingReviews ?? 0,
    },
    stores,
    notice.data,
  );
  return (
    <section
      aria-labelledby="attention-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <div className="-my-1 flex h-8 items-center">
        <h2 id="attention-title" className="text-subhead font-medium text-muted-foreground">
          Precisa de você
        </h2>
      </div>
      {items.length === 0 ? (
        <AllClear />
      ) : (
        <ul className="-mx-2 mt-4 space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                {...(item.search === undefined ? {} : { search: item.search })}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[item.tone]}`}
                >
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={item.title}>
                    {item.title}
                  </span>
                  {/* Two lines, so the sentence reads whole instead of ending in "…". */}
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <CaretRightIcon
                  className="size-4 shrink-0 text-muted-foreground"
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
