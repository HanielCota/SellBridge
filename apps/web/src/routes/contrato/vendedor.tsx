import { contractFor } from "@sellbridge/shared/contract-documents";
import { createFileRoute } from "@tanstack/react-router";
import { ContractDocumentPage } from "@/components/contract-signing/contract-document-page";

const CONTRACT = contractFor("seller");

export const Route = createFileRoute("/contrato/vendedor")({
  head: () => ({ meta: [{ title: `${CONTRACT.title} | SellBridge` }] }),
  component: () => <ContractDocumentPage contract={CONTRACT} />,
});
