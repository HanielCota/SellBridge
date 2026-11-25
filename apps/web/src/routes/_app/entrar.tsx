import {
  type Icon,
  ClockIcon,
  LinkBreakIcon,
  PackageIcon,
  UserSwitchIcon,
} from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  entryLinkSituationSchema,
  openEntryLink,
} from "@/features/entry-links/entry-link.functions";
import type { EntryLinkView } from "@/features/entry-links/open-entry-link.server";

/**
 * Where a person lands after clicking another project's entry link (decision of 25/11/2026). The
 * click already spent the link and left the choice in a cookie; signing in, signing up, the
 * terms and the contract happen first in the app layout, which brings the person back here.
 */
export const Route = createFileRoute("/_app/entrar")({
  // An unknown value is ignored rather than turned into an error page.
  validateSearch: (search: Record<string, unknown>) => ({
    situacao: entryLinkSituationSchema.safeParse(search["situacao"]).data,
  }),
  loaderDeps: ({ search }) => ({ situacao: search.situacao }),
  loader: async ({ deps }) => openEntryLink({ data: { situacao: deps.situacao } }),
  head: () => ({ meta: [{ title: "Produtos escolhidos | SellBridge" }] }),
  component: EntryLinkPage,
});

type ProblemKind = Exclude<EntryLinkView["kind"], "ready">;

const PROBLEMS: Record<ProblemKind, { icon: Icon; title: string; description: string }> = {
  invalid: {
    icon: LinkBreakIcon,
    title: "Este link não funciona",
    description:
      "O link está incompleto ou a escolha não ficou guardada neste navegador. Volte ao site onde você escolheu os produtos e clique no botão de novo.",
  },
  expired: {
    icon: ClockIcon,
    title: "Este link venceu",
    description:
      "Cada link vale só por alguns minutos. Volte ao site onde você escolheu os produtos e clique no botão de novo para gerar outro.",
  },
  used: {
    icon: LinkBreakIcon,
    title: "Este link já foi usado",
    description:
      "Cada link funciona uma vez, para uma conta só. Volte ao site onde você escolheu os produtos e clique no botão de novo.",
  },
  team_visit: {
    icon: UserSwitchIcon,
    title: "Este link é do cliente",
    description:
      "Você está na conta do cliente pela equipe. O link só vale quando o próprio cliente abre, na conta dele.",
  },
  staff_account: {
    icon: UserSwitchIcon,
    title: "Este link é para revendedores",
    description:
      "Você entrou com uma conta da equipe do SellBridge. Abra o link com a conta do revendedor que escolheu os produtos.",
  },
  unavailable: {
    icon: PackageIcon,
    title: "Esses produtos não estão mais disponíveis",
    description:
      "O fornecedor desativou os produtos escolhidos ou fechou a loja. Volte ao site e escolha outros.",
  },
};

function ProblemState({ kind }: { kind: ProblemKind }) {
  const problem = PROBLEMS[kind];
  return (
    <EmptyState
      icon={problem.icon}
      title={problem.title}
      description={problem.description}
      action={
        <Button asChild>
          <Link to="/dashboard">Ir para o início</Link>
        </Button>
      }
    />
  );
}

function productCountLabel(count: number): string {
  return count === 1 ? "1 produto" : `${count} produtos`;
}

function ChosenProducts({ view }: { view: Extract<EntryLinkView, { kind: "ready" }> }) {
  return (
    <>
      <PageHeader
        title="Seus produtos escolhidos"
        description={`Você escolheu ${productCountLabel(view.products.length)} de ${view.supplierName}. Veja no catálogo para preparar os anúncios da sua loja.`}
        actions={
          <Button asChild>
            <Link to="/catalogo" search={{ supplier: view.supplierId }}>
              Ver no catálogo
            </Link>
          </Button>
        }
      />
      {view.unavailableCount > 0 ? (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {productCountLabel(view.unavailableCount)} da sua escolha não{" "}
          {view.unavailableCount === 1 ? "está" : "estão"} mais à venda e{" "}
          {view.unavailableCount === 1 ? "ficou" : "ficaram"} de fora.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {view.products.map((product) => (
          <li key={product.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
            {product.imageUrl === null ? (
              <div
                aria-hidden="true"
                className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted"
              >
                <PackageIcon className="size-6 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={product.imageUrl}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{product.title}</p>
              <p className="text-sm text-muted-foreground">
                Você paga {formatCents(product.costCents)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function EntryLinkPage() {
  const view = Route.useLoaderData();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      {view.kind === "ready" ? <ChosenProducts view={view} /> : <ProblemState kind={view.kind} />}
    </div>
  );
}
