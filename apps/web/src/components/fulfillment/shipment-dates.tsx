import { SmartDate } from "@/components/data/smart-date";
import { formatDeadline } from "@/lib/relative-time";

/** The dates a parcel shows under its supplier: delivery estimate, accept and dispatch times. */
export interface ShipmentDatesView {
  status: string;
  estimatedDeliveryAt?: Date | null;
  dispatchDeadlineAt?: Date | null;
  acceptBy?: Date | null;
  dispatchBy?: Date | null;
}

/** A supplier's own time runs to the minute: "amanhã às 09:00". */
function DeadlineTime({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {formatDeadline(date)}
    </time>
  );
}

/** The marketplace's dispatch date holds for its whole day; the supplier's own time, to the hour. */
function DispatchBy({ shipment }: { shipment: ShipmentDatesView }) {
  if (shipment.dispatchDeadlineAt) {
    return <SmartDate date={shipment.dispatchDeadlineAt} />;
  }
  return shipment.dispatchBy ? <DeadlineTime date={shipment.dispatchBy} /> : null;
}

export function ShipmentDates({ shipment }: { shipment: ShipmentDatesView }) {
  if (shipment.status === "shipped" && shipment.estimatedDeliveryAt) {
    return (
      <p className="text-sm text-muted-foreground">
        Entrega prevista: <SmartDate date={shipment.estimatedDeliveryAt} />
      </p>
    );
  }
  const atSupplier = ["forwarded", "accepted", "picking", "ready"].includes(shipment.status);
  if (!atSupplier) {
    return null;
  }
  const hasDispatch = Boolean(shipment.dispatchDeadlineAt ?? shipment.dispatchBy);
  return (
    <>
      {shipment.acceptBy ? (
        <p className="text-sm text-muted-foreground">
          Aceite até: <DeadlineTime date={shipment.acceptBy} />
        </p>
      ) : null}
      {hasDispatch ? (
        <p className="text-sm text-muted-foreground">
          Despachar até: <DispatchBy shipment={shipment} />
        </p>
      ) : null}
    </>
  );
}
