import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { StepCard } from "@/components/onboarding/setup-guide";
import { Button } from "@/components/ui/button";
import type { SupplierSalesData } from "@/features/supplier-panel/sales/sales.queries";

type Setup = SupplierSalesData["setup"];

interface SupplierStep {
  key: string;
  title: string;
  description: string;
  done: (setup: Setup) => boolean;
  /** The page that does the step, and the button's words before and after it is done. */
  link: Pick<LinkProps, "to" | "search">;
  cta: string;
  doneCta: string;
}

const STEPS: readonly SupplierStep[] = [
  {
    key: "product",
    title: "Cadastre seus produtos",
    description:
      "Fotos, preço e estoque de cada peça. Dá para cadastrar uma de cada vez ou por planilha.",
    done: (setup) => setup.products > 0,
    link: { to: "/fornecedor/painel/produtos", search: { product: "novo" } },
    cta: "Cadastrar o primeiro produto",
    doneCta: "Ver produtos",
  },
  {
    key: "review",
    title: "Envie para análise",
    description:
      "A equipe do SellBridge confere os dados antes de liberar o produto aos revendedores.",
    done: (setup) => setup.submitted > 0,
    link: { to: "/fornecedor/painel/produtos" },
    cta: "Ver rascunhos",
    doneCta: "Ver produtos",
  },
  {
    key: "sale",
    title: "Espere os revendedores publicarem",
    description:
      "Com o produto aprovado, os revendedores colocam à venda e os pedidos chegam aqui.",
    done: (setup) => setup.hasSales,
    link: { to: "/fornecedor/painel/marca" },
    cta: "Completar minha marca",
    doneCta: "Ver minha marca",
  },
];

const ACTION_CLASS_NAME = "h-auto min-h-9 w-fit max-w-full py-2 text-center whitespace-normal";

/**
 * The supplier home before the first sale (item 38): the seller dashboard's first-steps guide,
 * with the three steps from the catalog to an order, the next one in focus.
 */
export function SupplierFirstSteps({ setup }: { setup: Setup }) {
  const next = STEPS.find((step) => !step.done(setup));
  const doneCount = STEPS.filter((step) => step.done(setup)).length;
  return (
    <section
      aria-labelledby="supplier-steps-title"
      className="surface-card space-y-6 rounded-3xl bg-card p-6 sm:p-8"
    >
      <div className="space-y-2">
        <h2 id="supplier-steps-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Falta pouco para sua primeira venda
        </h2>
        <p className="text-sm text-muted-foreground">
          {doneCount} de {STEPS.length} passos feitos. Suas vendas aparecem aqui assim que o
          primeiro pedido chegar.
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => {
          const done = step.done(setup);
          return (
            <StepCard
              key={step.key}
              title={step.title}
              description={step.description}
              index={index}
              state={done ? "done" : step.key === next?.key ? "next" : "later"}
              action={
                <Button
                  asChild
                  variant={done || step.key !== next?.key ? "outline" : "default"}
                  className={ACTION_CLASS_NAME}
                >
                  <Link {...step.link}>
                    {done ? step.doneCta : step.cta}
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
          );
        })}
      </ol>
    </section>
  );
}
