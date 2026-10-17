import { MegaphoneIcon, PackageIcon, PlugsConnectedIcon, type Icon } from "@phosphor-icons/react";
import { displayStoreName } from "@/features/stores/store-name";

export interface TicketSubjectLabels {
  order?: { id: string; externalOrderId: string } | null;
  store: { id: string; name: string } | null;
  listing: { id: string; title: string } | null;
}

interface SubjectRow {
  key: string;
  icon: Icon;
  kind: string;
  label: string;
}

function subjectRows(subject: TicketSubjectLabels): SubjectRow[] {
  const rows: SubjectRow[] = [];
  if (subject.order) {
    rows.push({
      key: "order",
      icon: PackageIcon,
      kind: "Pedido",
      label: `#${subject.order.externalOrderId}`,
    });
  }
  if (subject.store) {
    rows.push({
      key: "store",
      icon: PlugsConnectedIcon,
      kind: "Loja",
      label: displayStoreName(subject.store.name),
    });
  }
  if (subject.listing) {
    rows.push({
      key: "listing",
      icon: MegaphoneIcon,
      kind: "Anúncio",
      label: subject.listing.title,
    });
  }
  return rows;
}

export function hasTicketSubject(subject: TicketSubjectLabels): boolean {
  return subjectRows(subject).length > 0;
}

/** The order, store and listing a ticket is about: an icon, what it is and its name. */
export function TicketSubjectList({ subject }: { subject: TicketSubjectLabels }) {
  return (
    <ul className="space-y-2">
      {subjectRows(subject).map(({ key, icon: RowIcon, kind, label }) => (
        <li key={key} className="flex min-w-0 items-center gap-2.5 text-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <RowIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{kind}</span>
            <span className="block truncate font-medium">{label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
