import { formatPhone } from "@sellbridge/shared/account-documents";
import { RevealableAddress } from "@/components/region/revealable-address";
import type { StaffCustomerContact } from "@/features/admin/customer-contact";

/**
 * The customer's billing address behind the eye and, for admins only, the phone. The server
 * already left the phone out for every other role; this only shows what arrived.
 */
export function CustomerContactDetails({ contact }: { contact: StaffCustomerContact }) {
  return (
    // Capped so the eye stays next to the address in the wide quick view.
    <dl className="max-w-sm space-y-3 text-sm">
      <div className="space-y-1">
        <dt className="text-footnote text-muted-foreground">Endereço de cobrança</dt>
        <dd>
          {contact.address === null ? (
            <span className="text-muted-foreground">Ainda não informado</span>
          ) : (
            <RevealableAddress address={contact.address} />
          )}
        </dd>
      </div>
      {contact.phone === null ? null : (
        <div className="space-y-1">
          <dt className="text-footnote text-muted-foreground">Telefone</dt>
          <dd className="tabular-nums">{formatPhone(contact.phone)}</dd>
        </div>
      )}
    </dl>
  );
}
