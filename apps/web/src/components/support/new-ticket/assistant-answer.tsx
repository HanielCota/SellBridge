import type { SupportAnswer } from "@sellbridge/shared/support-assistant";
import { ArrowUpRightIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { STEP_HEADING_IDS } from "./step-parts";

/**
 * The assistant's answer, shown in place of sending until the customer says whether it solved
 * the problem. Labeled as automatic, so nobody mistakes it for the team's reply. Links open in
 * another tab: the form, with everything written, stays here in case it did not help.
 */
export function AssistantAnswer({ answer }: { answer: SupportAnswer }) {
  return (
    <section
      aria-labelledby={STEP_HEADING_IDS.assistant}
      className="grid gap-3 rounded-2xl bg-muted/50 p-4"
    >
      <div>
        <p className="text-sm text-muted-foreground">Assistente do suporte · resposta automática</p>
        <h2
          id={STEP_HEADING_IDS.assistant}
          tabIndex={-1}
          className="text-base font-semibold outline-none"
        >
          {answer.title}
        </h2>
      </div>
      <ol className="grid list-decimal gap-1.5 pl-5 text-sm marker:text-muted-foreground">
        {answer.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <ul className="-my-2 flex flex-wrap gap-x-4 text-sm">
        {answer.links.map((link) => (
          <li key={link.path}>
            <Link
              to={link.path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              {link.label}
              <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only"> (abre em outra aba)</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Não resolveu? Toque em “Ainda preciso de ajuda” e a equipe recebe o seu chamado com esta
        resposta.
      </p>
    </section>
  );
}

/** "Resolveu meu problema": closes the flow without a ticket. */
export function ResolvedButton({
  isResolving,
  onResolve,
}: {
  isResolving: boolean;
  onResolve: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-busy={isResolving}
      aria-disabled={isResolving}
      className="w-full sm:w-auto"
      onClick={onResolve}
    >
      {isResolving ? <CircleNotchIcon className="animate-spin" aria-hidden="true" /> : null}
      Resolveu meu problema
    </Button>
  );
}
