import type { ContractDocument } from "@sellbridge/shared/contract-documents";
import { LegalPage } from "@/components/legal/legal-page";

const versionDate = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The full text of a contract, to read before signing up or signing. */
export function ContractDocumentPage({ contract }: { contract: ContractDocument }) {
  return (
    <LegalPage
      title={contract.title}
      updatedAt={versionDate.format(new Date(contract.effectiveAt))}
      intro="Este é o texto completo que você assina com o SellBridge."
      sections={contract.sections}
    />
  );
}
