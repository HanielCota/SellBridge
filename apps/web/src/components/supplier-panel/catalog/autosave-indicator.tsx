import { CheckIcon, CircleNotchIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { AutosaveState } from "@/features/supplier-panel/catalog/use-draft-autosave";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function StatusLine({ state }: { state: AutosaveState }) {
  switch (state.kind) {
    case "idle": {
      return (
        <HintedText label={TERM_HINTS.autosave} className="text-muted-foreground hinted-term">
          Salvamento automático
        </HintedText>
      );
    }
    case "needs-sku": {
      return <span className="text-muted-foreground">Informe o código para salvar</span>;
    }
    case "invalid": {
      return (
        <span className="text-amber-700 dark:text-amber-400">
          Não salvo: {Object.values(state.errors)[0]}
        </span>
      );
    }
    case "saving": {
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CircleNotchIcon
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Salvando…
        </span>
      );
    }
    case "saved": {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CheckIcon className="size-3.5" aria-hidden="true" />
          Salvo às {TIME_FORMAT.format(state.at)}
        </span>
      );
    }
    default: {
      return (
        <span className="inline-flex items-start gap-1.5 text-destructive">
          <WarningIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {state.message}
        </span>
      );
    }
  }
}

/**
 * The server autosave's state, always visible: a failed save says why and offers a retry; a
 * conflict asks for a reload instead of overwriting someone else's edit.
 */
export function AutosaveIndicator({
  state,
  onRetry,
  onReload,
}: {
  state: AutosaveState;
  onRetry: () => void;
  onReload: () => void;
}) {
  return (
    <output
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote"
    >
      <StatusLine state={state} />
      {state.kind === "error" ? (
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
      {state.kind === "conflict" ? (
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onReload}>
          Recarregar
        </Button>
      ) : null}
    </output>
  );
}
