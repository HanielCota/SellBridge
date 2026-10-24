import { StorefrontIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** "Falar com o fornecedor": the new-conversation form, already on this order and its store. */
export function TalkToSupplierButton({ orderId }: { orderId: string }) {
  return (
    <Button asChild variant="outline">
      <Link to="/suporte/fornecedores/novo" search={{ pedido: orderId }}>
        <StorefrontIcon aria-hidden="true" />
        Falar com o fornecedor
      </Link>
    </Button>
  );
}
