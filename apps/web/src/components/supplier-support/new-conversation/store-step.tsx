import type { ConversationStore } from "@sellbridge/database/repositories";
import { StorefrontIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { OPTION_CLASS } from "@/components/support/new-ticket/choice-steps";
import {
  moveChoiceFocus,
  STEP_HEADING_IDS,
  StepHeading,
} from "@/components/support/new-ticket/step-parts";
import { Button } from "@/components/ui/button";
import { displayStoreName } from "@/features/stores/store-name";
import { cn } from "@/lib/utils";

/** Why a store cannot be picked, in one short line; null when it can. */
function unavailableReason(store: ConversationStore): string | null {
  if (store.supplierId === null) {
    return "Esta loja ainda não tem fornecedor";
  }
  if (!store.supplierAnswers) {
    return "Este fornecedor ainda não atende pelo SellBridge";
  }
  return null;
}

function StoreOption({
  store,
  onPick,
}: {
  store: ConversationStore;
  onPick: (storeConnectionId: string) => void;
}) {
  const reason = unavailableReason(store);
  return (
    <button
      type="button"
      aria-disabled={reason !== null}
      onClick={() => (reason === null ? onPick(store.storeConnectionId) : undefined)}
      onKeyDown={moveChoiceFocus}
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border bg-card px-3.5 py-3",
        OPTION_CLASS,
        reason !== null && "cursor-not-allowed opacity-60 hover:bg-card active:scale-100",
      )}
    >
      <StorefrontIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{displayStoreName(store.storeName)}</span>
        <span className="block text-sm text-muted-foreground">
          {reason ?? `Fornecedor: ${store.supplierName ?? ""}`}
        </span>
      </span>
    </button>
  );
}

function NoStores() {
  return (
    <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
      <p>Para falar com um fornecedor, conecte uma loja e escolha o fornecedor dela.</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/lojas">Ir para Lojas</Link>
      </Button>
    </div>
  );
}

/** Step one: the store. Each store sells one supplier, so picking it picks who answers. */
export function StoreStep({
  stores,
  total,
  onPick,
}: {
  stores: readonly ConversationStore[];
  total: number;
  onPick: (storeConnectionId: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <StepHeading
        id={STEP_HEADING_IDS.store}
        number={1}
        total={total}
        question="Sobre qual loja?"
        help="A conversa vai para o fornecedor desta loja."
      />
      {stores.length === 0 ? (
        <NoStores />
      ) : (
        <fieldset
          aria-labelledby={STEP_HEADING_IDS.store}
          className="m-0 grid min-w-0 grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2"
        >
          {stores.map((store) => (
            <StoreOption key={store.storeConnectionId} store={store} onPick={onPick} />
          ))}
        </fieldset>
      )}
    </div>
  );
}
